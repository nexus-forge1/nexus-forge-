import {defineTable} from 'convex/server'
import {v,ConvexError} from 'convex/values'
import {bounded,secrets} from './studioModel'
export const strategyDecision=v.union(v.literal('continue'),v.literal('pause'),v.literal('pivot'),v.literal('stop'))
export const strategyInput={
 periodStart:v.number(),periodEnd:v.number(),operatingCostUsd:v.union(v.number(),v.null()),operatorHours:v.union(v.number(),v.null()),
 actualsReference:v.string(),demandAssessment:v.string(),deliveryRisk:v.string(),unresolvedAssumptions:v.string(),
 nextExperiment:v.string(),proposedBudgetUsd:v.number(),proposedHours:v.number(),successCondition:v.string(),stopCondition:v.string(),reviewAt:v.number()
}
export const portfolioStrategyTables={
 portfolioStrategyReviews:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),requestKey:v.string(),input:v.string(),snapshot:v.string(),sourceDigest:v.string(),decision:strategyDecision,reason:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
}
export type StrategyInput={periodStart:number;periodEnd:number;operatingCostUsd:number|null;operatorHours:number|null;actualsReference:string;demandAssessment:string;deliveryRisk:string;unresolvedAssumptions:string;nextExperiment:string;proposedBudgetUsd:number;proposedHours:number;successCondition:string;stopCondition:string;reviewAt:number}
export function normalizeStrategy(a:StrategyInput,now:number){
 if(!Number.isFinite(a.periodStart)||!Number.isFinite(a.periodEnd)||a.periodStart<0||a.periodEnd<=a.periodStart||a.periodEnd>now||a.periodEnd-a.periodStart>366*86400000)throw new ConvexError('Choose a completed actuals window of at most 366 days')
 if(!Number.isFinite(a.reviewAt)||a.reviewAt<=now||a.reviewAt>now+90*86400000)throw new ConvexError('Review must be in the next 90 days')
 for(const key of ['operatingCostUsd','operatorHours','proposedBudgetUsd','proposedHours'] as const){const n=a[key];if(n!==null&&(!Number.isFinite(n)||n<0||n>1000000))throw new ConvexError('Invalid nonnegative resource value: '+key)}
 const fields=['actualsReference','demandAssessment','deliveryRisk','unresolvedAssumptions','nextExperiment','successCondition','stopCondition'] as const
 const normalized={...a}
 for(const key of fields)normalized[key]=bounded(a[key],key,1200,key==='actualsReference'?0:12)
 if((a.operatingCostUsd!==null||a.operatorHours!==null)&&normalized.actualsReference.length<12)throw new ConvexError('Reported actual costs or hours require a source reference')
 secrets(JSON.stringify(normalized));return normalized
}
export type OutcomeEvidence={_id:string;metric:string;actual:number;unit:string;periodStart:number;periodEnd:number;provenance:string;recordedAt:number}
export function strategySummary(rows:OutcomeEvidence[],a:StrategyInput,now:number,complete:boolean){
 // Use one exact-window row per metric; never sum repeated or overlapping reports.
 const matching=rows.filter(r=>r.periodStart===a.periodStart&&r.periodEnd===a.periodEnd)
 const metrics=['revenue-usd','paid-customers','active-users','task-success-rate','task-time-seconds']
 const selected=metrics.map(metric=>{const options=matching.filter(r=>r.metric===metric).sort((x,y)=>y.recordedAt-x.recordedAt||x._id.localeCompare(y._id));return{metric,source:options[0]??null,duplicateWindow:options.length>1}})
 const holds:string[]=[]
 if(!complete)holds.push('Retained outcome history exceeds the 20-record safe review scope')
 if(!matching.length)holds.push('No product outcomes match the exact actuals window')
 if(a.operatingCostUsd===null)holds.push('Operating cost is unknown')
 if(a.operatorHours===null)holds.push('Operator time is unknown')
 if(now-a.periodEnd>30*86400000)holds.push('Actuals window is older than 30 days')
 if(selected.some(r=>r.duplicateWindow))holds.push('Multiple reports for the same metric and window require reconciliation')
 if(!selected.some(r=>['revenue-usd','paid-customers'].includes(r.metric)&&r.source&&r.source.actual>0))holds.push('Matching recorded paid-demand evidence is absent')
 return{selected,holds,canContinue:holds.length===0,automaticAllocation:false,accountingVerified:false,proposedResources:{usd:a.proposedBudgetUsd,hours:a.proposedHours},note:'Recorded product evidence and operator-reported costs are not independently verified accounting, invoices or causal proof. Proposed resources are forecasts, not authorized spend.'}
}
