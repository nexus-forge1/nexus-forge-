import {v,ConvexError} from 'convex/values'
import {query,mutation} from './_generated/server'
import type {MutationCtx} from './_generated/server'
import type {Doc,Id} from './_generated/dataModel'
import {requireOperator,requireOwnedMission} from './permissions'
import {bounded,secrets} from './studioModel'
import {governanceInput,type GovernanceInput,quarantineFlags} from './memoryGovernanceModel'
import {latestMemoryReview,memoryFingerprint,memoryEligibility} from './memoryGovernancePolicy'
async function owned(ctx:MutationCtx,id:Id<'memories'>,ownerKey:string){
 const row=await ctx.db.get(id)
 if(!row||row.ownerKey!==ownerKey)throw new ConvexError('Memory unavailable in this operator account')
 return row
}
export const inspect=query({
 args:{memoryId:v.id('memories'),missionId:v.optional(v.id('missions'))},
 handler:async(ctx,a)=>{
  const ownerKey=await requireOperator(ctx),row=await ctx.db.get(a.memoryId)
  if(!row||row.ownerKey!==ownerKey)throw new ConvexError('Memory unavailable in this operator account')
  if(a.missionId)await requireOwnedMission(ctx,a.missionId)
  const decision=await memoryEligibility(ctx,row,a.missionId),history=await ctx.db.query('memoryGovernanceReviews').withIndex('by_memory',q=>q.eq('memoryId',row._id)).order('desc').take(30)
  return{memory:row,sourceDigest:await memoryFingerprint(row),...decision,history}
 }
})
async function append(ctx:MutationCtx,row:Doc<'memories'>,data:GovernanceInput){
 const latest=await latestMemoryReview(ctx,row._id),revision=(latest?.revision??0)+1
 if(revision>30)throw new ConvexError('Memory lifecycle revision limit reached (30); retain history and review separately')
 return ctx.db.insert('memoryGovernanceReviews',{...data,ownerKey:row.ownerKey,memoryId:row._id,revision,sourceDigest:await memoryFingerprint(row),createdAt:Date.now()})
}
function copied(row:Doc<'memories'>,review:Doc<'memoryGovernanceReviews'>|null):GovernanceInput{
 return{status:'quarantined',kind:review?.kind??'evidence',scope:review?.scope??(row.missionId?'mission':'operator'),...(review?.projectId?{projectId:review.projectId}:{}),conditions:review?.conditions??'Retained origin context; operator review required',exceptions:review?.exceptions??'',reason:'Linked lifecycle review requires renewed assessment',evidenceReferences:review?.evidenceReferences??[],reviewAt:review?.reviewAt??Date.now(),expiresAt:review?.expiresAt??Date.now(),contradicts:review?.contradicts??[]}
}
export const review=mutation({
 args:{memoryId:v.id('memories'),expectedRevision:v.number(),expectedSourceDigest:v.string(),...governanceInput},
 returns:v.id('memoryGovernanceReviews'),
 handler:async(ctx,a)=>{
  const ownerKey=await requireOperator(ctx),row=await owned(ctx,a.memoryId,ownerKey),previous=await latestMemoryReview(ctx,row._id)
  if(a.status==='purged')throw new ConvexError('Use the separate consent-gated purge action to purge payload content')
  if(previous?.status==='purged')throw new ConvexError('Purged memory is terminal; retained audit history cannot be reactivated')
  if(!Number.isInteger(a.expectedRevision)||a.expectedRevision!==(previous?.revision??0))throw new ConvexError('Lifecycle revision changed; reload and review the current source')
  if(await memoryFingerprint(row)!==a.expectedSourceDigest)throw new ConvexError('Memory source changed; reload before review')
  const now=Date.now(),{memoryId,expectedRevision,expectedSourceDigest,...input}=a
  const data:GovernanceInput={...input,conditions:bounded(a.conditions,'Applicable conditions',1600,8),exceptions:a.exceptions.trim(),reason:bounded(a.reason,'Review reason',1200,12),evidenceReferences:a.evidenceReferences.map(s=>bounded(s,'Evidence reference',400,8))}
  if(new TextEncoder().encode(data.exceptions).length>1200||data.evidenceReferences.length>8||new Set(data.evidenceReferences).size!==data.evidenceReferences.length)throw new ConvexError('Use up to eight distinct references and at most 1200 exception bytes')
  secrets(JSON.stringify(data))
  if(!Number.isSafeInteger(a.reviewAt)||!Number.isSafeInteger(a.expiresAt)||a.reviewAt<0||a.expiresAt<0||a.reviewAt>a.expiresAt||a.expiresAt>now+366*86400000)throw new ConvexError('Use finite dates: review on or before expiry, within 366 days')
  if(a.scope==='mission'&&!row.missionId)throw new ConvexError('Mission scope requires an origin mission')
  if(a.scope==='venture'){
   const p=a.projectId?await ctx.db.get(a.projectId):null
   if(!p||p.ownerKey!==ownerKey||p.missionId!==row.missionId)throw new ConvexError('Project scope must match the owned origin mission')
  }else if(a.projectId)throw new ConvexError('A project is only valid for venture scope')
  // Broad reuse is only available to records originally written without a mission.
  if(a.scope==='operator'&&row.missionId)throw new ConvexError('Mission-linked content cannot be broadened to operator scope')
  if(a.status==='active'&&(a.reviewAt<=now||a.expiresAt<=now||!data.evidenceReferences.length||a.contradicts.length||quarantineFlags([row.key,row.value,row.source].join('\n')).length))throw new ConvexError('Activation requires future dates, supporting references and no contradiction or quarantine flags')
  if(a.contradicts.length>4||new Set(a.contradicts).size!==a.contradicts.length||a.contradicts.includes(row._id)||a.supersedes===row._id||a.supersedes&&a.contradicts.includes(a.supersedes))throw new ConvexError('Use up to four distinct contradiction links; no self or conflicting links')
  if(a.supersedes&&a.status!=='active')throw new ConvexError('Only an active reviewed replacement may retire a superseded memory')
  // Bilateral quarantine or replacement retirement happens atomically, with retained revisions.
  for(const id of [...a.contradicts,...(a.supersedes?[a.supersedes]:[])]){
   const target=await owned(ctx,id,ownerKey)
   if(target.missionId!==row.missionId)throw new ConvexError('Linked memories must share their origin scope')
   const targetReview=await latestMemoryReview(ctx,id),change=copied(target,targetReview)
   if(id===a.supersedes){change.status='archived';change.reason='Superseded by reviewed memory '+row._id+'. '+data.reason}
   else{
    change.status='quarantined';change.reason='Contradiction recorded by memory '+row._id+'. '+data.reason
    change.contradicts=[...new Set([...change.contradicts,row._id])]
    if(change.contradicts.length>4)throw new ConvexError('Linked contradiction capacity reached; review existing links first')
   }
   await append(ctx,target,change)
  }
  return append(ctx,row,data)
 }
})

/** Explicit operator consent scrubs memory payload while retaining a terminal audit tombstone. */
export const purge=mutation({
 args:{memoryId:v.id('memories'),expectedRevision:v.number(),expectedSourceDigest:v.string(),consentKey:v.string(),reason:v.string()},
 returns:v.id('memoryGovernanceReviews'),
 handler:async(ctx,a)=>{
  const ownerKey=await requireOperator(ctx),row=await owned(ctx,a.memoryId,ownerKey),previous=await latestMemoryReview(ctx,row._id),now=Date.now()
  if(previous?.status==='purged')throw new ConvexError('Memory payload is already purged; audit history is retained')
  if(!Number.isInteger(a.expectedRevision)||a.expectedRevision!==(previous?.revision??0))throw new ConvexError('Lifecycle revision changed; reload before purge')
  const sourceDigest=await memoryFingerprint(row)
  if(sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Memory source changed; reload before purge')
  const consentKey=bounded(a.consentKey,'Purge consent confirmation',200),reason=bounded(a.reason,'Purge reason',1200,12)
  if(consentKey!=='PURGE:'+String(row._id))throw new ConvexError('Explicit purge confirmation does not match this memory ID')
  if((previous?.revision??0)>=30)throw new ConvexError('Memory lifecycle revision limit reached; retained history is preserved')
  secrets(JSON.stringify({consentKey,reason}))
  const auditId=await ctx.db.insert('memoryGovernanceReviews',{ownerKey,memoryId:row._id,status:'purged',kind:previous?.kind??'evidence',scope:previous?.scope??(row.missionId?'mission':'operator'),...(previous?.projectId?{projectId:previous.projectId}:{}),conditions:'Payload scrubbed by explicit operator consent; audit tombstone retained',exceptions:'Original memory key, value, source and confidence scrubbed',reason,evidenceReferences:[],reviewAt:now,expiresAt:now,contradicts:[],revision:(previous?.revision??0)+1,sourceDigest,createdAt:now})
  await ctx.db.patch(row._id,{category:'purged-memory',key:'purged:'+String(row._id),value:'[content purged]',confidence:0,source:'governed-memory-purge'})
  return auditId
 }
})
