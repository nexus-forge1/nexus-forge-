import {v,ConvexError} from 'convex/values'
import {makeFunctionReference} from 'convex/server'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Doc,Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical,compareResults} from './evaluationModel'
import {skillEvidence} from './skillFoundry'
import {whole} from './missionGraphModel'
type Ctx=QueryCtx|MutationCtx
async function proposal(ctx:Ctx,id:Id<'evolutionProposals'>){
 const owner=await requireOperator(ctx),p=await ctx.db.get(id)
 if(!p||p.ownerKey!==owner)throw new ConvexError('Evolution proposal unavailable')
 await ownedProject(ctx,p.projectId);return p
}
async function audit(ctx:Ctx,id:Id<'evolutionProposals'>){
 const p=await proposal(ctx,id),b=await skillEvidence(ctx,p.baselineId),c=await skillEvidence(ctx,p.candidateId),reasons:string[]=[]
 if(b.skill.projectId!==p.projectId||c.skill.projectId!==p.projectId||b.skill.skillKey!==c.skill.skillKey||b.skill.revision>=c.skill.revision)reasons.push('Use increasing versions of the same private project skill family')
 const bp=JSON.parse(b.skill.packageSnapshot),cp=JSON.parse(c.skill.packageSnapshot)
 for(const key of ['inputFields','outputFields','tools','permissions','failurePolicy'])if(canonical(bp[key])!==canonical(cp[key]))reasons.push('Protected contract changed: '+key)
 if(b.skill.suiteId!==c.skill.suiteId||b.skill.suiteDigest!==c.skill.suiteDigest)reasons.push('Acceptance criteria must remain the exact same suite version')
 if(canonical(bp.graph.limits)!==canonical(cp.graph.limits))reasons.push('Protected resource limits changed')
 if(b.reasons.length)reasons.push('Baseline skill is not currently reviewed for rehearsal: '+b.reasons.join('; '))
 if(c.reasons.length)reasons.push('Candidate skill is not currently reviewed for rehearsal: '+c.reasons.join('; '))
 const baseline=[...b.checks].sort((a,b)=>a.input.localeCompare(b.input)),candidate=[...c.checks].sort((a,b)=>a.input.localeCompare(b.input))
 if(baseline.length<2||baseline.length!==candidate.length||new Set(baseline.map(x=>x.input)).size!==baseline.length||new Set(candidate.map(x=>x.input)).size!==candidate.length||baseline.some((x,i)=>x.input!==candidate[i]?.input))reasons.push('All retained examples must pair by distinct exact input; no omitted or duplicate populations')
 let improved=0,regressed=0
 if(!reasons.length)for(let i=0;i<baseline.length;i++){const comparison=compareResults(JSON.parse(baseline[i].results).cases,JSON.parse(candidate[i].results).cases);improved+=comparison.improved;regressed+=comparison.regressed}
 if(regressed)reasons.push('A retained acceptance comparison regressed')
 const snapshot={version:'controlled-private-rehearsal-v1',baseline:{id:b.skill._id,digest:b.skill.packageDigest,checks:baseline.map(x=>({id:x._id,digest:x.payloadDigest})),review:b.reviews[0]?._id??null},candidate:{id:c.skill._id,digest:c.skill.packageDigest,checks:candidate.map(x=>({id:x._id,digest:x.payloadDigest})),review:c.reviews[0]?._id??null},paired:reasons.length?null:baseline.length,improved,regressed,reasons,productionReady:false,limitation:'Supplied acceptance answers are not independently observed runtime outcomes. Equal checks do not demonstrate improvement. Pilot is manual rehearsal only.'}
 return{p,snapshot,auditDigest:await digest(canonical(snapshot)),reasons}
}
export const list=query({args:{projectId:v.id('studioProjects')},handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return ctx.db.query('evolutionProposals').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)}})
export const create=mutation({args:{projectId:v.id('studioProjects'),proposalKey:v.string(),baselineId:v.id('skillVersions'),candidateId:v.id('skillVersions'),justification:v.string()},returns:v.id('evolutionProposals'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),b=await skillEvidence(ctx,a.baselineId),c=await skillEvidence(ctx,a.candidateId),proposalKey=bounded(a.proposalKey,'Proposal key',80),justification=bounded(a.justification,'Change rationale',1600,12)
 if(b.skill._id===c.skill._id||b.skill.projectId!==p._id||c.skill.projectId!==p._id)throw new ConvexError('Choose different owned skill versions in this project')
 secrets(canonical({proposalKey,justification}))
 const rows=await ctx.db.query('evolutionProposals').withIndex('by_project',q=>q.eq('projectId',p._id)).take(20),old=rows.find(x=>x.proposalKey===proposalKey)
 if(old){if(old.baselineId!==a.baselineId||old.candidateId!==a.candidateId||old.justification!==justification)throw new ConvexError('Proposal key already binds a different immutable candidate');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained proposals per project')
 return ctx.db.insert('evolutionProposals',{ownerKey:p.ownerKey,projectId:p._id,proposalKey,baselineId:a.baselineId,candidateId:a.candidateId,justification,createdAt:Date.now()})
}})
export const detail=query({args:{proposalId:v.id('evolutionProposals')},handler:async(ctx,a)=>{
 const d=await audit(ctx,a.proposalId),reviews=await ctx.db.query('evolutionReviews').withIndex('by_proposal',q=>q.eq('proposalId',a.proposalId)).order('desc').take(20),pilots=await ctx.db.query('evolutionPilots').withIndex('by_proposal',q=>q.eq('proposalId',a.proposalId)).order('desc').take(20)
 const receipts:{pilot:Doc<'evolutionPilots'>;handoffs:Doc<'evolutionHandoffs'>[]}[]=[]
 for(const p of pilots)receipts.push({pilot:p,handoffs:await ctx.db.query('evolutionHandoffs').withIndex('by_pilot',q=>q.eq('pilotId',p._id)).take(3)})
 return{proposal:d.p,snapshot:d.snapshot,auditDigest:d.auditDigest,reasons:d.reasons,reviews,pilots:receipts,asOf:Date.now()}
}})
export const review=mutation({args:{proposalId:v.id('evolutionProposals'),requestKey:v.string(),expectedAuditDigest:v.string(),decision:v.union(v.literal('approve-pilot'),v.literal('reject')),reason:v.string()},returns:v.id('evolutionReviews'),handler:async(ctx,a)=>{
 const d=await audit(ctx,a.proposalId),requestKey=bounded(a.requestKey,'Review key',80),reason=bounded(a.reason,'Review reason',1200,12),rows=await ctx.db.query('evolutionReviews').withIndex('by_proposal',q=>q.eq('proposalId',a.proposalId)).take(20),old=rows.find(r=>r.requestKey===requestKey)
 if(old){if(old.auditDigest!==a.expectedAuditDigest||old.decision!==a.decision||old.reason!==reason)throw new ConvexError('Review key already binds different immutable evidence');return old._id}
 if(d.auditDigest!==a.expectedAuditDigest)throw new ConvexError('Evolution evidence changed; review the current audit')
 if(a.decision==='approve-pilot'&&d.reasons.length)throw new ConvexError('Pilot approval blocked: '+d.reasons.join('; '))
 if(rows.length>=20)throw new ConvexError('20 retained evolution reviews per proposal')
 secrets(reason);return ctx.db.insert('evolutionReviews',{ownerKey:d.p.ownerKey,proposalId:d.p._id,requestKey,auditDigest:d.auditDigest,decision:a.decision,reason,createdAt:Date.now()})
}})
export const activate=mutation({args:{proposalId:v.id('evolutionProposals'),requestKey:v.string(),maxRuns:v.number(),hours:v.number()},returns:v.id('evolutionPilots'),handler:async(ctx,a)=>{
 const d=await audit(ctx,a.proposalId),requestKey=bounded(a.requestKey,'Pilot key',80),maxRuns=whole(a.maxRuns,'Pilot rehearsal cap',1,3),hours=whole(a.hours,'Pilot hours',1,24),rows=await ctx.db.query('evolutionPilots').withIndex('by_project',q=>q.eq('projectId',d.p.projectId)).take(20),old=rows.find(p=>p.proposalId===a.proposalId&&p.requestKey===requestKey)
 if(old){if(old.maxRuns!==maxRuns||old.deadlineAt-old.createdAt!==hours*3600000)throw new ConvexError('Pilot key has different frozen limits');return old._id}
 if(rows.some(p=>p.status==='active'))throw new ConvexError('Another project pilot must be rolled back before activating a new one')
 if(rows.length>=20)throw new ConvexError('20 retained pilots per project')
 const review=await ctx.db.query('evolutionReviews').withIndex('by_proposal',q=>q.eq('proposalId',d.p._id)).order('desc').first()
 if(d.reasons.length||review?.decision!=='approve-pilot'||review.auditDigest!==d.auditDigest)throw new ConvexError('Current exact evidence and explicit pilot approval are required')
 secrets(requestKey);const now=Date.now()
 return ctx.db.insert('evolutionPilots',{ownerKey:d.p.ownerKey,projectId:d.p.projectId,proposalId:d.p._id,reviewId:review._id,requestKey,auditDigest:d.auditDigest,maxRuns,createdAt:now,deadlineAt:now+hours*3600000,status:'active',rollbackReason:''})
}})
const handoffRef=makeFunctionReference<'mutation',{skillId:Id<'skillVersions'>;requestKey:string},Id<'missionGraphRuns'>>('skillFoundry:handoff')
export const issue=mutation({args:{pilotId:v.id('evolutionPilots'),requestKey:v.string()},returns:v.id('missionGraphRuns'),handler:async(ctx,a):Promise<Id<'missionGraphRuns'>>=>{
 const owner=await requireOperator(ctx),pilot=await ctx.db.get(a.pilotId)
 if(!pilot||pilot.ownerKey!==owner)throw new ConvexError('Pilot unavailable')
 const d=await audit(ctx,pilot.proposalId),requestKey=bounded(a.requestKey,'Pilot handoff key',60),rows=await ctx.db.query('evolutionHandoffs').withIndex('by_pilot',q=>q.eq('pilotId',pilot._id)).take(3),old=rows.find(r=>r.requestKey===requestKey)
 if(old)return old.runId
 const latest=await ctx.db.query('evolutionReviews').withIndex('by_proposal',q=>q.eq('proposalId',d.p._id)).order('desc').first()
 if(pilot.status!=='active'||Date.now()>=pilot.deadlineAt||rows.length>=pilot.maxRuns||d.reasons.length||d.auditDigest!==pilot.auditDigest||latest?._id!==pilot.reviewId||latest.decision!=='approve-pilot')throw new ConvexError('Pilot stopped, expired, capped or its reviewed evidence changed')
 const key='evo-'+(await digest(pilot._id+':'+requestKey)).slice(0,32),runId:Id<'missionGraphRuns'>=await ctx.runMutation(handoffRef,{skillId:d.p.candidateId,requestKey:key})
 await ctx.db.insert('evolutionHandoffs',{ownerKey:owner,pilotId:pilot._id,requestKey,runId,createdAt:Date.now()})
 return runId
}})
export const rollback=mutation({args:{pilotId:v.id('evolutionPilots'),reason:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),pilot=await ctx.db.get(a.pilotId)
 if(!pilot||pilot.ownerKey!==owner)throw new ConvexError('Pilot unavailable')
 await proposal(ctx,pilot.proposalId)
 const reason=bounded(a.reason,'Rollback reason',1200,12);secrets(reason)
 if(pilot.status==='rolled-back'){if(pilot.rollbackReason!==reason)throw new ConvexError('Rollback reason is frozen');return null}
 await ctx.db.patch(pilot._id,{status:'rolled-back',rollbackReason:reason,rolledBackAt:Date.now()});return null
}})
