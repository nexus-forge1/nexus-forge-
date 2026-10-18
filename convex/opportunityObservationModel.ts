import {v} from 'convex/values'
export const observationInput={actual:v.optional(v.number()),sampleSize:v.number(),periodStart:v.number(),periodEnd:v.number(),complete:v.boolean(),stopTriggered:v.boolean(),method:v.string(),evidence:v.string()}
export const observationFields={...observationInput,planId:v.id('opportunityPlans'),strategyId:v.id('memories'),ownerKey:v.string(),metric:v.string(),unit:v.string(),target:v.number(),direction:v.union(v.literal('at_least'),v.literal('at_most')),planCreatedAt:v.number(),deadline:v.number(),late:v.boolean(),status:v.union(v.literal('passed'),v.literal('failed'),v.literal('inconclusive')),nextAction:v.string(),createdAt:v.number()}
export function assessObservation(plan:{target:number;direction:'at_least'|'at_most';createdAt:number;reviewWithinDays:number},input:{actual?:number;sampleSize:number;periodEnd:number;complete:boolean;stopTriggered:boolean}){
 const deadline=plan.createdAt+plan.reviewWithinDays*86400000,late=input.periodEnd>deadline
 if(input.stopTriggered)return {deadline,late,status:'failed' as const,nextAction:'Stop and review the recorded condition before considering another experiment.'}
 if(late)return {deadline,late,status:'inconclusive' as const,nextAction:'Measurement ended outside the planned review window. Review timing and preregister another plan if needed.'}
 if(!input.complete||input.actual===undefined||input.sampleSize===0)return {deadline,late,status:'inconclusive' as const,nextAction:'Collect complete comparable measurements before assessing the target.'}
 const passed=plan.direction==='at_least'?input.actual>=plan.target:input.actual<=plan.target
 return {deadline,late,status:passed?'passed' as const:'failed' as const,nextAction:passed?'Target met for this observation. Review evidence and replicate before extending scope.':'Target not met. Preserve this finding and revise the approach in a new validation plan.'}
}
