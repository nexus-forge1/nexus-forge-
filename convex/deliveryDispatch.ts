import {v,ConvexError} from 'convex/values'
import {internalMutation,query} from './_generated/server'
import type {MutationCtx,QueryCtx} from './_generated/server'
import type {Doc,Id} from './_generated/dataModel'
import {internal} from './_generated/api'
import {requireOperator,requireOwnedMission} from './permissions'
import {beginDeliveryTask} from './platformTasks'
export async function latestDispatch(ctx:Pick<QueryCtx,'db'>,deliveryId:Id<'deliveries'>){
 return ctx.db.query('deliveryDispatchAttempts').withIndex('by_delivery',q=>q.eq('deliveryId',deliveryId)).order('desc').first()
}
export async function assertDeliveryMutable(ctx:MutationCtx,id:Id<'deliveries'>){
 const attempt=await latestDispatch(ctx,id)
 if(attempt&&attempt.status!=='rejected')throw new ConvexError('This delivery already has an active or attempted external write. Review its retained GitHub evidence; approval or target changes cannot reset the attempt.')
}
async function digest(content:string){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,'0')).join('')
}
async function ownedSnapshot(ctx:MutationCtx,id:Id<'deliveries'>){
 const ownerKey=await requireOperator(ctx),delivery=await ctx.db.get(id)
 if(!delivery)throw new ConvexError('Delivery not found or access denied')
 const mission=await requireOwnedMission(ctx,delivery.missionId)
 return{ownerKey,delivery,mission}
}
async function assertCurrent(ctx:MutationCtx,attempt:Doc<'deliveryDispatchAttempts'>){
 const{ownerKey,delivery,mission}=await ownedSnapshot(ctx,attempt.deliveryId)
 const artifact=await ctx.db.get(attempt.artifactId)
 if(ownerKey!==attempt.ownerKey||delivery.target!==attempt.target||delivery.branch!==attempt.branch||delivery.artifactId!==attempt.artifactId||
 !delivery.approved||!mission.approved||['complete','cancelled','review'].includes(mission.status)||!artifact||artifact.missionId!==mission._id||artifact.status!=='ready'||await digest(artifact.content)!==attempt.artifactDigest)throw new ConvexError('Delivery authorization or exact approved artifact changed; review the retained attempt before another external write.')
 return delivery
}
export const reserve=internalMutation({args:{id:v.id('deliveries')},handler:async(ctx,{id})=>{
 const{ownerKey,delivery,mission}=await ownedSnapshot(ctx,id),previous=await latestDispatch(ctx,id)
 if(previous?.status==='dispatched'&&previous.result){
  if(previous.ownerKey!==ownerKey||delivery.target!==previous.target||delivery.branch!==previous.branch||delivery.artifactId!==previous.artifactId)throw new ConvexError('Delivery attempt owner changed; review retained evidence')
  return{cached:previous.result}
 }
 if(previous&&previous.status!=='rejected'&&previous.status!=='reviewed')throw new ConvexError('Delivery work is already active or uncertain; review its attempt and GitHub evidence before retrying.')
 if(!delivery.approved||delivery.stage!=='github'||delivery.status!=='Approved; ready to dispatch GitHub Actions')throw new ConvexError('Human delivery approval is required before external execution')
 if(!mission.approved||['complete','cancelled','review'].includes(mission.status))throw new ConvexError('Mission no longer permits a new delivery')
 const artifact=delivery.artifactId?await ctx.db.get(delivery.artifactId):null
 if(!artifact||artifact.missionId!==mission._id||artifact.status!=='ready')throw new ConvexError('A ready approved artifact is required before GitHub execution')
 if(new TextEncoder().encode(artifact.content).byteLength>512*1024)throw new ConvexError('Delivery artifact exceeds the 512 KiB dispatch limit')
 const artifactDigest=await digest(artifact.content)
 if(previous?.status==='reviewed'&&(previous.artifactId!==artifact._id||previous.artifactDigest!==artifactDigest||previous.target!==delivery.target||previous.branch!==delivery.branch||previous.ownerKey!==ownerKey))throw new ConvexError('Reviewed retry must use the exact original artifact and target')
 const attemptId=await ctx.db.insert('deliveryDispatchAttempts',{deliveryId:id,missionId:mission._id,ownerKey,artifactId:artifact._id,artifactDigest,target:delivery.target,branch:delivery.branch,generation:(previous?.generation??0)+1,phase:'preflight',status:'running',createdAt:Date.now(),updatedAt:Date.now()})
 await ctx.db.patch(id,{status:'Delivery target checks in progress'})
 return{attemptId,delivery,artifact}
}})
export const recordCommit=internalMutation({args:{attemptId:v.id('deliveryDispatchAttempts'),commitSha:v.string()},handler:async(ctx,a)=>{
 const attempt=await ctx.db.get(a.attemptId)
 if(!attempt||!['running','uncertain'].includes(attempt.status)||attempt.phase!=='commit'||!/^[a-f0-9]{40}$/i.test(a.commitSha))throw new ConvexError('No admitted artifact commit to settle')
 if(attempt.commitSha&&attempt.commitSha.toLowerCase()!==a.commitSha.toLowerCase())throw new ConvexError('Artifact commit receipt is immutable')
 if(!attempt.commitSha)await ctx.db.patch(attempt._id,{commitSha:a.commitSha,updatedAt:Date.now()})
}})
export const advance=internalMutation({args:{attemptId:v.id('deliveryDispatchAttempts'),phase:v.union(v.literal('commit'),v.literal('dispatch')),commitSha:v.optional(v.string())},handler:async(ctx,a)=>{
 const attempt=await ctx.db.get(a.attemptId)
 if(!attempt||attempt.status!=='running'||(await latestDispatch(ctx,attempt.deliveryId))?._id!==attempt._id)throw new ConvexError('Delivery attempt is no longer active')
 if(a.phase==='commit'&&attempt.phase!=='preflight'||a.phase==='dispatch'&&attempt.phase!=='commit')throw new ConvexError('Invalid delivery write transition')
 await assertCurrent(ctx,attempt)
 if(a.phase==='dispatch'&&(!/^[a-f0-9]{40}$/i.test(a.commitSha??'')||attempt.commitSha!==a.commitSha))throw new ConvexError('Exact committed artifact receipt is required before dispatch')
 await ctx.db.patch(attempt._id,{phase:a.phase,...(a.commitSha?{commitSha:a.commitSha}:{}),updatedAt:Date.now()})
}})
export const failed=internalMutation({args:{attemptId:v.id('deliveryDispatchAttempts'),message:v.string()},handler:async(ctx,a)=>{
 const attempt=await ctx.db.get(a.attemptId)
 if(!attempt||attempt.status!=='running')return
 const delivery=await ctx.db.get(attempt.deliveryId),rejected=attempt.phase==='preflight'
 const message=rejected?a.message.slice(0,500):'External delivery work could not be confirmed. Review the retained attempt and GitHub evidence before starting new work.'
 await ctx.db.patch(attempt._id,{status:rejected?'rejected':'uncertain',message,updatedAt:Date.now()})
 if(delivery&&!delivery.workflowRunUrl&&!delivery.deploymentRunUrl)await ctx.db.patch(delivery._id,{...(rejected?{stage:'blocked' as const}:{}),status:rejected?'Execution blocked: '+message:'Delivery outcome requires review',evidence:rejected?'No external write was admitted. '+message:delivery.evidence+'\n'+message})
 await ctx.runMutation(internal.audit.record,{missionId:attempt.missionId,type:'delivery',action:rejected?'dispatch_preflight_rejected':'dispatch_outcome_uncertain',status:rejected?'blocked':'review',detail:message,deliveryId:attempt.deliveryId})
}})
export const complete=internalMutation({args:{attemptId:v.id('deliveryDispatchAttempts'),result:v.string()},handler:async(ctx,a)=>{
 const attempt=await ctx.db.get(a.attemptId)
 if(!attempt)throw new ConvexError('Delivery attempt not found')
 if(attempt.status==='dispatched'){if(attempt.result!==a.result)throw new ConvexError('Delivery result is immutable');return}
 if(!['running','uncertain'].includes(attempt.status)||attempt.phase!=='dispatch')throw new ConvexError('No admitted dispatch to settle')
 const delivery=await ctx.db.get(attempt.deliveryId)
 if(!delivery)throw new ConvexError('Delivery record unavailable; retained attempt requires review')
 await ctx.db.patch(attempt._id,{status:'dispatched',result:a.result,updatedAt:Date.now()})
 await beginDeliveryTask(ctx,delivery)
 // A fast workflow callback may already have advanced or settled this delivery.
 if(!delivery.workflowRunUrl&&!delivery.deploymentRunUrl&&delivery.stage==='github')await ctx.db.patch(delivery._id,{status:'GitHub Actions dispatched',evidence:'Artifact committed to nexus-forge-deliveries/'+delivery._id+'/index.html. GitHub Actions workflow dispatched for '+delivery._id+'.'})
 await ctx.runMutation(internal.audit.record,{missionId:delivery.missionId,type:'delivery',action:'github_dispatched',status:'running',detail:'Exact artifact commit '+attempt.commitSha+' was dispatched; retained attempt '+attempt._id+'.',deliveryId:delivery._id})
}})
export const status=query({args:{id:v.id('deliveries')},handler:async(ctx,{id})=>{
 await requireOperator(ctx);const d=await ctx.db.get(id);if(!d)throw new ConvexError('Delivery not found or access denied');await requireOwnedMission(ctx,d.missionId)
 const a=await latestDispatch(ctx,id)
 return a?{status:a.status,phase:a.phase,generation:a.generation,message:a.message??'',commitSha:a.commitSha??'',updatedAt:a.updatedAt}:null
}})
