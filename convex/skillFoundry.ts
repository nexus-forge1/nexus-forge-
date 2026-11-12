import {v,ConvexError} from 'convex/values'
import {makeFunctionReference} from 'convex/server'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical,validateCases,grade,summary,graderVersion,evaluationOutput} from './evaluationModel'
import {validateGraph,graphRuleVersion} from './missionGraphModel'
import {skillInput,skillVersion,fields,names,validateValue} from './skillFoundryModel'
type Ctx=QueryCtx|MutationCtx
async function owned(ctx:Ctx,id:Id<'skillVersions'>){
 const owner=await requireOperator(ctx),skill=await ctx.db.get(id)
 if(!skill||skill.ownerKey!==owner)throw new ConvexError('Skill version unavailable')
 await ownedProject(ctx,skill.projectId)
 if(await digest(skill.packageSnapshot)!==skill.packageDigest)throw new ConvexError('Skill package integrity check failed')
 return skill
}
async function sources(ctx:Ctx,graphId:Id<'missionGraphs'>,suiteId:Id<'evaluationSuites'>,projectId:Id<'studioProjects'>){
 const p=await ownedProject(ctx,projectId),g=await ctx.db.get(graphId),s=await ctx.db.get(suiteId)
 if(!g||g.ownerKey!==p.ownerKey||g.projectId!==p._id||!s||s.ownerKey!==p.ownerKey)throw new ConvexError('Choose an owned graph in this project and a private acceptance suite')
 const{graphKey,title,objective,missionType,nodes,limits}=g,design=validateGraph({graphKey,title,objective,missionType,nodes,limits})
 if(g.ruleVersion!==graphRuleVersion||g.designDigest!==await digest(canonical({...design,ruleVersion:g.ruleVersion})))throw new ConvexError('Graph integrity or runtime version mismatch')
 const cases=validateCases(s.cases)
 if(s.graderVersion!==graderVersion||s.digest!==await digest(canonical({title:s.title,cases,graderVersion:s.graderVersion})))throw new ConvexError('Acceptance suite integrity or grader version mismatch')
 if(cases.length<2||new Set(cases.map(c=>c.category)).size<2)throw new ConvexError('Use at least two acceptance cases across two categories')
 return{p,g,s,design}
}
export async function skillEvidence(ctx:Ctx,id:Id<'skillVersions'>){
 const skill=await owned(ctx,id),checks=await ctx.db.query('skillChecks').withIndex('by_skill',q=>q.eq('skillId',id)).take(21),reviews=await ctx.db.query('skillReviews').withIndex('by_skill',q=>q.eq('skillId',id)).order('desc').take(20),reasons:string[]=[]
 let sourceValid=true
 try{const source=await sources(ctx,skill.graphId,skill.suiteId,skill.projectId);if(source.g.designDigest!==skill.graphDigest||source.s.digest!==skill.suiteDigest)sourceValid=false}catch{sourceValid=false}
 if(!sourceValid)reasons.push('Frozen source graph or acceptance suite changed or is unavailable')
 if(checks.length<2||new Set(checks.map(c=>c.input)).size<2)reasons.push('At least two distinct supplied input/output checks are required')
 if(checks.length>20)reasons.push('Bounded acceptance population exceeded')
 for(const check of checks){
  try{
   const packageData=JSON.parse(skill.packageSnapshot),results=grade(packageData.suite.cases,JSON.parse(check.answers))
   validateValue(skill.inputFields,check.input);validateValue(skill.outputFields,check.output)
   const expected=await digest(canonical({packageDigest:skill.packageDigest,input:check.input,output:check.output,answers:check.answers}))
   if(check.ownerKey!==skill.ownerKey||check.payloadDigest!==expected||check.results!==canonical({provenance:'operator-supplied',cases:results,summary:summary(results)})||!summary(results).allPassed)reasons.push('Retained check '+check.requestKey+' failed or has inconsistent evidence')
  }catch{reasons.push('Retained check '+check.requestKey+' cannot be verified')}
 }
 const acceptanceReady=reasons.length===0
 const latest=reviews[0],checkIds=checks.map(c=>c._id)
 const reviewCurrent=latest?.status==='reviewed-for-rehearsal'&&canonical(latest.checkIds)===canonical(checkIds)&&latest.reviewDigest===await digest(canonical({packageDigest:skill.packageDigest,checkIds,status:latest.status,reason:latest.reason}))
 if(!reviewCurrent)reasons.push(latest?.status==='retired'?'Skill version is retired':'A current explicit review of all retained checks is required')
 return{skill,checks,reviews,reasons,acceptanceReady,reviewCurrent,productionReady:false as const,provenance:'Operator-supplied answers; no verified agent execution or semantic-quality proof'}
}
export const list=query({args:{projectId:v.id('studioProjects')},handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return ctx.db.query('skillVersions').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)}})
export const create=mutation({args:{projectId:v.id('studioProjects'),graphId:v.id('missionGraphs'),suiteId:v.id('evaluationSuites'),expectedRevision:v.number(),...skillInput},returns:v.id('skillVersions'),handler:async(ctx,a)=>{
 const{p,g,s,design}=await sources(ctx,a.graphId,a.suiteId,a.projectId),data={skillKey:bounded(a.skillKey,'Skill key',60),title:bounded(a.title,'Title',140),description:bounded(a.description,'Description',1600,12),inputFields:fields(a.inputFields),outputFields:fields(a.outputFields),tools:names(a.tools,'Tools',['typed-planning','saved-evidence-review']),permissions:names(a.permissions,'Permissions',['read-owned-project','record-rehearsal']),failurePolicy:a.failurePolicy}
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(data.skillKey)||!Number.isSafeInteger(a.expectedRevision)||a.expectedRevision<0)throw new ConvexError('Use a lowercase skill key and whole revision')
 const packageSnapshot=canonical({version:skillVersion,...data,graph:{id:g._id,digest:g.designDigest,design,limits:g.limits},suite:{id:s._id,digest:s.digest,title:s.title,graderVersion:s.graderVersion,cases:s.cases},limitations:'Private planning contract; tools and permissions are declarations, not grants. Checks use supplied answers. No production competency or execution authorization.'})
 secrets(packageSnapshot)
 const packageDigest=await digest(packageSnapshot),rows=await ctx.db.query('skillVersions').withIndex('by_project',q=>q.eq('projectId',p._id)).take(20),versions=rows.filter(r=>r.skillKey===data.skillKey),old=versions.find(r=>r.revision===a.expectedRevision+1&&r.packageDigest===packageDigest)
 if(old)return old._id
 if(Math.max(0,...versions.map(r=>r.revision))!==a.expectedRevision)throw new ConvexError('Skill revision changed; load the latest version')
 if(rows.length>=20)throw new ConvexError('20 skill versions per project; retained history is not deleted')
 return ctx.db.insert('skillVersions',{...data,ownerKey:p.ownerKey,projectId:p._id,graphId:g._id,suiteId:s._id,revision:a.expectedRevision+1,graphDigest:g.designDigest,suiteDigest:s.digest,packageDigest,packageSnapshot,createdAt:Date.now()})
}})
export const detail=query({args:{skillId:v.id('skillVersions')},handler:async(ctx,a)=>({...await skillEvidence(ctx,a.skillId),handoffs:await ctx.db.query('skillHandoffs').withIndex('by_skill',q=>q.eq('skillId',a.skillId)).order('desc').take(10)})})
export const check=mutation({args:{skillId:v.id('skillVersions'),requestKey:v.string(),input:v.string(),output:v.string(),answers:v.array(evaluationOutput)},returns:v.id('skillChecks'),handler:async(ctx,a)=>{
 const skill=await owned(ctx,a.skillId),requestKey=bounded(a.requestKey,'Check key',80),pack=JSON.parse(skill.packageSnapshot),input=canonical(validateValue(skill.inputFields,a.input)),output=canonical(validateValue(skill.outputFields,a.output)),results=grade(pack.suite.cases,a.answers),answers=canonical(pack.suite.cases.map((c:{key:string})=>a.answers.find(x=>x.key===c.key))),payloadDigest=await digest(canonical({packageDigest:skill.packageDigest,input,output,answers}))
 secrets(canonical({requestKey,input,output,answers}))
 const rows=await ctx.db.query('skillChecks').withIndex('by_skill',q=>q.eq('skillId',skill._id)).take(20),old=rows.find(r=>r.requestKey===requestKey)
 if(old){if(old.payloadDigest!==payloadDigest)throw new ConvexError('Check key has different immutable examples or answers');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained checks per skill version')
 return ctx.db.insert('skillChecks',{ownerKey:skill.ownerKey,skillId:skill._id,requestKey,input,output,answers,results:canonical({provenance:'operator-supplied',cases:results,summary:summary(results)}),payloadDigest,createdAt:Date.now()})
}})
export const review=mutation({args:{skillId:v.id('skillVersions'),requestKey:v.string(),status:v.union(v.literal('reviewed-for-rehearsal'),v.literal('retired')),reason:v.string()},returns:v.id('skillReviews'),handler:async(ctx,a)=>{
 const d=await skillEvidence(ctx,a.skillId),requestKey=bounded(a.requestKey,'Review key',80),reason=bounded(a.reason,'Review rationale',1200,12),checkIds=d.checks.map(c=>c._id),reviewDigest=await digest(canonical({packageDigest:d.skill.packageDigest,checkIds,status:a.status,reason})),old=d.reviews.find(r=>r.requestKey===requestKey)
 if(old){if(old.reviewDigest!==reviewDigest)throw new ConvexError('Review key already binds different evidence');return old._id}
 if(a.status==='reviewed-for-rehearsal'&&!d.acceptanceReady)throw new ConvexError('Review blocked: '+d.reasons.join('; '))
 if(d.reviews.length>=20)throw new ConvexError('20 retained reviews per skill version')
 secrets(reason)
 return ctx.db.insert('skillReviews',{ownerKey:d.skill.ownerKey,skillId:d.skill._id,requestKey,status:a.status,reason,checkIds,reviewDigest,createdAt:Date.now()})
}})
const startReference=makeFunctionReference<'mutation',{graphId:Id<'missionGraphs'>;runKey:string;basis:'operator_reported';replanReason:string},Id<'missionGraphRuns'>>('missionGraphs:start')
export const handoff=mutation({args:{skillId:v.id('skillVersions'),requestKey:v.string()},returns:v.id('missionGraphRuns'),handler:async(ctx,a):Promise<Id<'missionGraphRuns'>>=>{
 const d=await skillEvidence(ctx,a.skillId),requestKey=bounded(a.requestKey,'Handoff key',36),rows=await ctx.db.query('skillHandoffs').withIndex('by_skill',q=>q.eq('skillId',a.skillId)).take(10),old=rows.find(r=>r.requestKey===requestKey)
 if(old)return old.runId
 if(d.reasons.length||!d.skill.permissions.includes('record-rehearsal')||!d.skill.tools.includes('typed-planning'))throw new ConvexError('Rehearsal handoff blocked: '+d.reasons.join('; ')+'; require record-rehearsal declaration')
 if(rows.length>=10)throw new ConvexError('10 retained rehearsal handoffs per version')
 secrets(requestKey)
 const runId:Id<'missionGraphRuns'>=await ctx.runMutation(startReference,{graphId:d.skill.graphId,runKey:'skill:'+d.skill._id+':'+requestKey,basis:'operator_reported',replanReason:'Skill version '+d.skill._id+' / '+d.skill.packageDigest})
 await ctx.db.insert('skillHandoffs',{ownerKey:d.skill.ownerKey,skillId:d.skill._id,reviewId:d.reviews[0]._id,requestKey,runId,createdAt:Date.now()})
 return runId
}})
