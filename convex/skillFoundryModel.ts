import {defineTable} from 'convex/server'
import {v,type Infer,ConvexError} from 'convex/values'
import {bounded} from './studioModel'
export const skillVersion='private-planning-skill-v1'
export const contractField=v.object({key:v.string(),type:v.union(v.literal('string'),v.literal('number'),v.literal('boolean')),required:v.boolean()})
export const skillInput={skillKey:v.string(),title:v.string(),description:v.string(),inputFields:v.array(contractField),outputFields:v.array(contractField),tools:v.array(v.string()),permissions:v.array(v.string()),failurePolicy:v.literal('stop-and-review')}
export const skillTables={
 skillVersions:defineTable({...skillInput,ownerKey:v.string(),projectId:v.id('studioProjects'),graphId:v.id('missionGraphs'),suiteId:v.id('evaluationSuites'),revision:v.number(),graphDigest:v.string(),suiteDigest:v.string(),packageDigest:v.string(),packageSnapshot:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
 skillChecks:defineTable({ownerKey:v.string(),skillId:v.id('skillVersions'),requestKey:v.string(),input:v.string(),output:v.string(),answers:v.string(),results:v.string(),payloadDigest:v.string(),createdAt:v.number()}).index('by_skill',['skillId']),
 skillReviews:defineTable({ownerKey:v.string(),skillId:v.id('skillVersions'),requestKey:v.string(),status:v.union(v.literal('reviewed-for-rehearsal'),v.literal('retired')),reason:v.string(),checkIds:v.array(v.id('skillChecks')),reviewDigest:v.string(),createdAt:v.number()}).index('by_skill',['skillId']),
 skillHandoffs:defineTable({ownerKey:v.string(),skillId:v.id('skillVersions'),reviewId:v.id('skillReviews'),requestKey:v.string(),runId:v.id('missionGraphRuns'),createdAt:v.number()}).index('by_skill',['skillId']),
}
export type ContractField=Infer<typeof contractField>
export function fields(rows:ContractField[]){
 if(rows.length<1||rows.length>12||new Set(rows.map(r=>r.key)).size!==rows.length)throw new ConvexError('Use 1–12 distinct contract fields')
 return rows.map(r=>{if(!/^[a-z][a-z0-9_]{0,39}$/.test(r.key)||['__proto__','constructor','prototype'].includes(r.key))throw new ConvexError('Use safe lowercase field keys');return r})
}
export function validateValue(schema:ContractField[],text:string){
 if(new TextEncoder().encode(text).length>8192)throw new ConvexError('Contract example exceeds 8 KiB')
 let raw:unknown;try{raw=JSON.parse(text)}catch{throw new ConvexError('Contract example must be valid JSON')}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ConvexError('Contract example must be an object')
 const value=raw as Record<string,unknown>
 if(Object.keys(value).some(k=>!schema.some(f=>f.key===k)))throw new ConvexError('Unexpected contract field')
 for(const f of schema){if(!(f.key in value)){if(f.required)throw new ConvexError('Missing required '+f.key);continue}const x=value[f.key];if(typeof x!==f.type||typeof x==='number'&&!Number.isFinite(x)||typeof x==='string'&&new TextEncoder().encode(x).length>2000)throw new ConvexError('Invalid typed value for '+f.key)}
 return value
}
export function names(values:string[],label:string,allowed:string[]){
 if(values.length>6||new Set(values).size!==values.length||values.some(v=>!allowed.includes(v)))throw new ConvexError(label+' must use distinct supported declarations')
 return values.map(v=>bounded(v,label,80))
}
