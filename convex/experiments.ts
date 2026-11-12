import {v,ConvexError} from 'convex/values'
import {query,mutation} from './_generated/server'
import type {QueryCtx,MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {requireOperator} from './permissions'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {finite,evidenceUrl,audit} from './frontierSupport'
import {createLabProtocol,recordLabTrial} from './labProtocolCore'
import {designFields,observationFields,contractFields,reportFields,assessmentValue,assessExperiment,experimentRuleVersion,type ExperimentDesign} from './experimentModel'
const contract=v.object({_id:v.id('experimentContracts'),_creationTime:v.number(),...contractFields}),report=v.object({_id:v.id('experimentObservations'),_creationTime:v.number(),...reportFields})
async function owned(ctx:QueryCtx|MutationCtx,id:Id<'experimentContracts'>){
 const owner=await requireOperator(ctx),p=await ctx.db.get(id)
 if(!p||p.ownerKey!==owner)throw new ConvexError('Experiment unavailable')
 await ownedProject(ctx,p.projectId);return p
}
function timestamp(value:number){if(!Number.isSafeInteger(value)||value<0||value>8640000000000000)throw new ConvexError('Use a valid whole UTC timestamp');return value}
function population(value:number){if(!Number.isInteger(value)||value<0||value>1000000)throw new ConvexError('Use population counts from 0 to 1 million');return value}
export const list=query({args:{projectId:v.id('studioProjects')},returns:v.array(contract),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return ctx.db.query('experimentContracts').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)}})
export const detail=query({args:{contractId:v.id('experimentContracts')},returns:v.object({contract,reports:v.array(report),assessment:assessmentValue,asOf:v.number()}),handler:async(ctx,a)=>{
 const p=await owned(ctx,a.contractId),rows=await ctx.db.query('experimentObservations').withIndex('by_contract',q=>q.eq('contractId',p._id)).order('desc').take(50),asOf=Date.now()
 return{contract:p,reports:rows,assessment:assessExperiment(p,rows,asOf),asOf}
}})
export const create=mutation({args:{projectId:v.id('studioProjects'),expectedRevision:v.number(),...designFields},returns:v.id('experimentContracts'),handler:async(ctx,a)=>{
 const project=await ownedProject(ctx,a.projectId),{projectId,expectedRevision,...raw}=a
 if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw new ConvexError('Use a nonnegative whole design revision')
 const data:ExperimentDesign={...raw,contractKey:bounded(a.contractKey,'Contract key',80),title:bounded(a.title,'Title',140),hypothesis:bounded(a.hypothesis,'Hypothesis',1600),population:bounded(a.population,'Target population',1000),baselineDescription:bounded(a.baselineDescription,'Baseline definition',1400),intervention:bounded(a.intervention,'Intervention',1400),allocation:bounded(a.allocation,'Allocation method',1400),metric:bounded(a.metric,'Primary metric',120),unit:bounded(a.unit,'Metric unit',40),stopCondition:bounded(a.stopCondition,'Stop condition',1000),confoundPlan:bounded(a.confoundPlan,'Confound plan',1400),targetDelta:finite(a.targetDelta),windowStart:timestamp(a.windowStart),windowEnd:timestamp(a.windowEnd)}
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(data.contractKey))throw new ConvexError('Use a stable lowercase contract key')
 if(data.targetDelta<0||!Number.isInteger(data.minimumSamples)||data.minimumSamples<2||data.minimumSamples>50||!Number.isInteger(data.minimumPopulation)||data.minimumPopulation<1||data.minimumPopulation>1000000)throw new ConvexError('Use a nonnegative improvement target, 2–50 reporting units and 1–1 million people per arm')
 if(a.guardrails.length<1||a.guardrails.length>4)throw new ConvexError('Freeze 1–4 guardrails')
 const keys=new Set<string>()
 data.guardrails=a.guardrails.map(g=>{const key=bounded(g.key,'Guardrail key',60);if(!/^[a-z0-9][a-z0-9_-]*$/.test(key)||keys.has(key))throw new ConvexError('Guardrail keys must be distinct lowercase identifiers');keys.add(key);return{...g,key,metric:bounded(g.metric,'Guardrail metric',120),unit:bounded(g.unit,'Guardrail unit',40),limit:finite(g.limit)}})
 secrets(JSON.stringify(data))
 const designDigest=await digest(canonical({...data,ruleVersion:experimentRuleVersion})),rows=await ctx.db.query('experimentContracts').withIndex('by_project',q=>q.eq('projectId',project._id)).take(20),versions=rows.filter(r=>r.contractKey===data.contractKey)
 const same=versions.find(r=>r.revision===expectedRevision+1&&r.designDigest===designDigest);if(same)return same._id
 const latest=versions.reduce((n,r)=>Math.max(n,r.revision),0)
 if(latest!==expectedRevision)throw new ConvexError('Design changed; load its latest revision first')
 if(rows.length>=20)throw new ConvexError('20 experiment-version limit reached for this project')
 const now=Date.now()
 if(data.windowStart<now||data.windowEnd<=data.windowStart||data.windowEnd-data.windowStart>90*86400000||data.windowEnd>now+366*86400000)throw new ConvexError('Preregister a future UTC window of up to 90 days within the next year')
 const protocolId=await createLabProtocol(ctx,{kind:'science',title:'Experiment: '+data.title,hypothesis:data.hypothesis,metric:data.metric,unit:data.unit,direction:data.direction,target:data.targetDelta,minimumSamples:data.minimumSamples,domains:['primary'],heldOutDomains:[]})
 return ctx.db.insert('experimentContracts',{...data,ruleVersion:experimentRuleVersion,projectId:project._id,ownerKey:project.ownerKey,revision:latest+1,protocolId,designDigest,createdAt:now,status:'registered'})
}})
export const record=mutation({args:{contractId:v.id('experimentContracts'),...observationFields},returns:v.id('experimentObservations'),handler:async(ctx,a)=>{
 const p=await owned(ctx,a.contractId),{contractId,...raw}=a
 const data={...raw,caseKey:bounded(a.caseKey,'Case key',100),cohort:bounded(a.cohort,'Distinct reporting population',500),baselinePopulation:population(a.baselinePopulation),candidatePopulation:population(a.candidatePopulation),periodStart:timestamp(a.periodStart),periodEnd:timestamp(a.periodEnd),stopNote:bounded(a.stopNote,'Stop explanation',700,a.stopTriggered?1:0),concurrentChanges:bounded(a.concurrentChanges,'Concurrent changes',1200,0),evidence:evidenceUrl(a.evidence),digest:a.digest.toLowerCase()}
 if(a.baseline!==undefined)data.baseline=finite(a.baseline)
 if(a.candidate!==undefined)data.candidate=finite(a.candidate)
 if(!/^[a-f0-9]{64}$/.test(data.digest))throw new ConvexError('Record the actual evidence SHA-256 as 64 hexadecimal characters')
 if(a.guardrailValues.length!==p.guardrails.length||new Set(a.guardrailValues.map(g=>g.key)).size!==p.guardrails.length||a.guardrailValues.some(g=>!p.guardrails.some(x=>x.key===g.key)))throw new ConvexError('Provide each frozen guardrail exactly once; use null for missing measurements')
 data.guardrailValues=p.guardrails.map(g=>{const value=a.guardrailValues.find(x=>x.key===g.key)!.value;return{key:g.key,value:value===null?null:finite(value)}})
 secrets(JSON.stringify(data))
 const payloadDigest=await digest(canonical(JSON.parse(JSON.stringify(data)))),old=await ctx.db.query('experimentObservations').withIndex('by_contract_case',q=>q.eq('contractId',p._id).eq('caseKey',data.caseKey)).first()
 if(old){if(old.payloadDigest!==payloadDigest)throw new ConvexError('Case key already has different immutable observations');return old._id}
 if(p.status!=='registered')throw new ConvexError('Experiment is closed; record another design instead')
 if(data.periodEnd<=data.periodStart||data.periodEnd>Date.now()||data.periodEnd-data.periodStart>93*86400000)throw new ConvexError('Use a completed nonempty UTC observation period of up to 93 days, never a future end time')
 const rows=await ctx.db.query('experimentObservations').withIndex('by_contract',q=>q.eq('contractId',p._id)).take(50)
 if(rows.length>=50)throw new ConvexError('50-observation history limit reached')
 if(rows.some(r=>r.cohort.toLowerCase()===data.cohort.toLowerCase()))throw new ConvexError('This reporting population is already recorded; do not double-count its participants')
 const trialId=data.complete&&data.baseline!==undefined&&data.candidate!==undefined?await recordLabTrial(ctx,{protocolId:p.protocolId,caseKey:data.caseKey,domain:'primary',baseline:data.baseline,candidate:data.candidate,evidence:data.evidence,digest:data.digest}):undefined
 return ctx.db.insert('experimentObservations',{...data,contractId:p._id,ownerKey:p.ownerKey,projectId:p.projectId,payloadDigest,createdAt:Date.now(),...(trialId?{trialId}:{})})
}})
export const close=mutation({args:{contractId:v.id('experimentContracts'),rationale:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const p=await owned(ctx,a.contractId),rationale=bounded(a.rationale,'Final review rationale',1400)
 secrets(rationale)
 if(p.status==='closed'){if(p.closingRationale!==rationale)throw new ConvexError('Final review is already frozen');return null}
 const rows=await ctx.db.query('experimentObservations').withIndex('by_contract',q=>q.eq('contractId',p._id)).take(50),assessment=assessExperiment(p,rows,Date.now())
 if(!assessment.eligibleForFinalReview)throw new ConvexError('Wait until the measurement window ends, unless a recorded guardrail or stop condition requires review')
 const protocol=await ctx.db.get(p.protocolId)
 if(!protocol||protocol.ownerKey!==p.ownerKey)throw new ConvexError('Linked scientific protocol unavailable')
 await ctx.db.patch(p._id,{status:'closed',closedAt:Date.now(),closingRationale:rationale,closingSummary:canonical(assessment)})
 await ctx.db.patch(p.protocolId,{status:'closed'})
 await audit(ctx,p.ownerKey,'science','experiment-reviewed',String(p._id)+' '+assessment.disposition)
 return null
}})
