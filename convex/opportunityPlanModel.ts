import {v} from 'convex/values'
export const opportunityPlanInput={
 assumption:v.string(),action:v.string(),metric:v.string(),unit:v.string(),target:v.number(),
 direction:v.union(v.literal('at_least'),v.literal('at_most')),reviewWithinDays:v.number(),stopCondition:v.string(),
}
export const opportunityPlanFields={...opportunityPlanInput,ownerKey:v.string(),strategyId:v.id('memories'),strategyKey:v.string(),strategySnapshot:v.string(),createdAt:v.number()}
