import {v,type Infer} from 'convex/values'
export const collectionKind=v.union(v.literal('comparison'),v.literal('science'),v.literal('generality'),v.literal('packages'),v.literal('adapters'),v.literal('runtime'),v.literal('benchmarks'),v.literal('feeds'),v.literal('sources'),v.literal('reconciliations'),v.literal('missions'),v.literal('manual-memory'),v.literal('learning-reviews'))
export type CollectionKind=Infer<typeof collectionKind>
export const collections=[
 {id:'missions',label:'Missions'},{id:'manual-memory',label:'Manual memory saves'},{id:'learning-reviews',label:'Learning evidence reviews'},
 {id:'comparison',label:'Comparison protocols'},{id:'science',label:'Scientific protocols'},{id:'generality',label:'Generality protocols'},
 {id:'packages',label:'Integration packages'},{id:'adapters',label:'External GET adapters'},{id:'runtime',label:'Active runtime receipts'},
 {id:'benchmarks',label:'Evaluation reports'},{id:'feeds',label:'Outcome feeds'},{id:'sources',label:'Product event sources'},{id:'reconciliations',label:'Provider invoice comparisons'},
] as const
export const scopedLimits=[
 {id:'source-captures',label:'Source retrieval attempts',parent:'Each research record',limit:10,note:'Pending, captured and failed attempts count. A repeated request consumes another attempt.'},
 {id:'claim-reviews',label:'Claim reviews',parent:'Each mission',limit:100,note:'Exact immutable replay returns the existing review at capacity.'},
 {id:'opportunity-plans',label:'Validation plans',parent:'Each strategy',limit:20,note:'An identical frozen plan returns the existing record at capacity.'},
 {id:'opportunity-observations',label:'Validation observations',parent:'Each plan',limit:50,note:'Exact immutable replay returns the existing observation at capacity.'},
 {id:'lab-trials',label:'Paired experiment trials',parent:'Each protocol',limit:100,note:'Exact case replay returns the existing trial; a conflicting case remains rejected.'},
] as const
export const capacityRow=v.object({id:collectionKind,label:v.string(),count:v.number(),complete:v.boolean(),readLimited:v.optional(v.boolean()),limit:v.number(),remaining:v.number(),blocked:v.boolean(),scope:v.string()})
