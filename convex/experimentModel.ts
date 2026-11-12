import {defineTable} from 'convex/server'
import {v,type Infer} from 'convex/values'
export const guardrail=v.object({key:v.string(),metric:v.string(),unit:v.string(),direction:v.union(v.literal('at_most'),v.literal('at_least')),limit:v.number()})
export const guardrailValue=v.object({key:v.string(),value:v.union(v.number(),v.null())})
export const designFields={contractKey:v.string(),title:v.string(),hypothesis:v.string(),population:v.string(),baselineDescription:v.string(),intervention:v.string(),comparison:v.union(v.literal('randomized'),v.literal('concurrent_observational'),v.literal('before_after')),allocation:v.string(),metric:v.string(),unit:v.string(),direction:v.union(v.literal('higher'),v.literal('lower')),targetDelta:v.number(),minimumSamples:v.number(),minimumPopulation:v.number(),windowStart:v.number(),windowEnd:v.number(),guardrails:v.array(guardrail),stopCondition:v.string(),confoundPlan:v.string()}
export const observationFields={caseKey:v.string(),cohort:v.string(),baseline:v.optional(v.number()),candidate:v.optional(v.number()),baselinePopulation:v.number(),candidatePopulation:v.number(),periodStart:v.number(),periodEnd:v.number(),complete:v.boolean(),stopTriggered:v.boolean(),stopNote:v.string(),allocationFollowed:v.boolean(),independentUnits:v.boolean(),concurrentChanges:v.string(),guardrailValues:v.array(guardrailValue),evidence:v.string(),digest:v.string(),basis:v.union(v.literal('controlled_fixture'),v.literal('operator_reported'))}
export const experimentRuleVersion='experiment-rules-v1' as const
export const contractFields={...designFields,ruleVersion:v.literal('experiment-rules-v1'),ownerKey:v.string(),projectId:v.id('studioProjects'),revision:v.number(),protocolId:v.id('labProtocols'),designDigest:v.string(),createdAt:v.number(),status:v.union(v.literal('registered'),v.literal('closed')),closedAt:v.optional(v.number()),closingRationale:v.optional(v.string()),closingSummary:v.optional(v.string())}
export const reportFields={...observationFields,ownerKey:v.string(),projectId:v.id('studioProjects'),contractId:v.id('experimentContracts'),trialId:v.optional(v.id('labTrials')),payloadDigest:v.string(),createdAt:v.number()}
export const experimentTables={
 experimentContracts:defineTable(contractFields).index('by_project',['projectId']).index('by_protocol',['protocolId']),
 experimentObservations:defineTable(reportFields).index('by_contract',['contractId']).index('by_contract_case',['contractId','caseKey']),
}
const design=v.object(designFields),observation=v.object(observationFields)
export type ExperimentDesign=Infer<typeof design>
export type ExperimentObservation=Infer<typeof observation>
export const assessmentValue=v.object({disposition:v.union(v.literal('stop_review'),v.literal('inconclusive'),v.literal('target_met'),v.literal('target_missed')),meanChange:v.union(v.number(),v.null()),observedTargetMet:v.union(v.boolean(),v.null()),paired:v.number(),reports:v.number(),baselinePopulation:v.number(),candidatePopulation:v.number(),guardrailBreaches:v.array(v.string()),limitations:v.array(v.string()),causalConclusion:v.literal('not_established'),windowEnded:v.boolean(),eligibleForFinalReview:v.boolean()})
export function assessExperiment(p:ExperimentDesign&{createdAt:number},rows:ExperimentObservation[],now:number){
 const limitations=new Set<string>(),breaches=new Set<string>()
 const usable=rows.filter(r=>r.baseline!==undefined&&r.candidate!==undefined)
 const changes=usable.map(r=>(p.direction==='higher'?1:-1)*(r.candidate!-r.baseline!))
 const meanChange=changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:null
 const baselinePopulation=rows.reduce((s,r)=>s+r.baselinePopulation,0),candidatePopulation=rows.reduce((s,r)=>s+r.candidatePopulation,0)
 const windowEnded=now>=p.windowEnd
 if(!windowEnded)limitations.add('The preregistered measurement window has not ended')
 if(rows.length<p.minimumSamples||usable.length<p.minimumSamples)limitations.add('Too few paired reporting units')
 if(baselinePopulation<p.minimumPopulation||candidatePopulation<p.minimumPopulation)limitations.add('Reported population coverage is below the per-arm minimum')
 if(p.comparison!=='randomized')limitations.add('Observational comparisons do not establish causation')
 if(!rows.length)limitations.add('No observations are recorded')
 for(const r of rows){
  if(!r.complete||r.baseline===undefined||r.candidate===undefined||!r.baselinePopulation||!r.candidatePopulation)limitations.add('At least one report has incomplete measurements or population counts')
  if(r.periodStart<p.windowStart||r.periodStart<p.createdAt||r.periodEnd>p.windowEnd)limitations.add('At least one report is outside the preregistered window')
  if(r.basis==='controlled_fixture')limitations.add('Controlled fixture data is not customer outcome evidence')
  if(!r.allocationFollowed)limitations.add('The reported allocation method was not followed')
  if(!r.independentUnits)limitations.add('Independent non-overlapping units are not attested')
  if(r.concurrentChanges.trim())limitations.add('Concurrent changes may confound the comparison')
  if(r.stopTriggered)breaches.add('Reported stop condition: '+r.stopNote)
  for(const g of p.guardrails){
   const x=r.guardrailValues.find(v=>v.key===g.key)?.value
   if(x===null||x===undefined)limitations.add('At least one guardrail measurement is missing')
   else if(g.direction==='at_most'?x>g.limit:x<g.limit)breaches.add(g.key+' breached its frozen '+g.direction+' threshold')
  }
 }
 const observedTargetMet=meanChange===null?null:meanChange>=p.targetDelta
 const disposition=breaches.size?'stop_review' as const:limitations.size?'inconclusive' as const:observedTargetMet?'target_met' as const:'target_missed' as const
 return{disposition,meanChange,observedTargetMet,paired:usable.length,reports:rows.length,baselinePopulation,candidatePopulation,guardrailBreaches:[...breaches],limitations:[...limitations],causalConclusion:'not_established' as const,windowEnded,eligibleForFinalReview:windowEnded||breaches.size>0}
}
