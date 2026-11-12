import {v,ConvexError} from 'convex/values'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {requireOperator} from './permissions'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {designFields,graphFields,runFields,batchFields,stepResult,validateGraph,inspectGraph,whole,graphRuleVersion} from './missionGraphModel'
const graph=v.object({_id:v.id('missionGraphs'),_creationTime:v.number(),...graphFields}),run=v.object({_id:v.id('missionGraphRuns'),_creationTime:v.number(),...runFields}),batch=v.object({_id:v.id('missionGraphBatches'),_creationTime:v.number(),...batchFields})
async function ownedGraph(ctx:QueryCtx|MutationCtx,id:Id<'missionGraphs'>){const owner=await requireOperator(ctx),g=await ctx.db.get(id);if(!g||g.ownerKey!==owner)throw new ConvexError('Graph unavailable');await ownedProject(ctx,g.projectId);return g}
async function ownedRun(ctx:QueryCtx|MutationCtx,id:Id<'missionGraphRuns'>){const owner=await requireOperator(ctx),r=await ctx.db.get(id);if(!r||r.ownerKey!==owner)throw new ConvexError('Rehearsal unavailable');const g=await ownedGraph(ctx,r.graphId);return{r,g}}
async function batches(ctx:QueryCtx|MutationCtx,runId:Id<'missionGraphRuns'>){return ctx.db.query('missionGraphBatches').withIndex('by_run',q=>q.eq('runId',runId)).take(10)}
export const list=query({args:{projectId:v.id('studioProjects')},returns:v.array(graph),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return ctx.db.query('missionGraphs').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)}})
export const create=mutation({args:{projectId:v.id('studioProjects'),expectedRevision:v.number(),...designFields},returns:v.id('missionGraphs'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),{projectId,expectedRevision,...raw}=a,data=validateGraph(raw)
 whole(expectedRevision,'Expected revision',0,20);secrets(JSON.stringify(data))
 const designDigest=await digest(canonical({...data,ruleVersion:graphRuleVersion})),rows=await ctx.db.query('missionGraphs').withIndex('by_project',q=>q.eq('projectId',projectId)).take(20),versions=rows.filter(g=>g.graphKey===data.graphKey)
 const same=versions.find(g=>g.revision===expectedRevision+1&&g.designDigest===designDigest);if(same)return same._id
 if(versions.reduce((m,g)=>Math.max(m,g.revision),0)!==expectedRevision)throw new ConvexError('Graph revision changed; load the latest before revising')
 if(rows.length>=20)throw new ConvexError('20 graph-version limit reached; history is retained')
 return ctx.db.insert('missionGraphs',{...data,ownerKey:p.ownerKey,projectId,missionId:p.missionId,revision:expectedRevision+1,designDigest,ruleVersion:graphRuleVersion,createdAt:Date.now()})
}})
export const runs=query({args:{graphId:v.id('missionGraphs')},returns:v.array(run),handler:async(ctx,a)=>{await ownedGraph(ctx,a.graphId);return ctx.db.query('missionGraphRuns').withIndex('by_graph',q=>q.eq('graphId',a.graphId)).order('desc').take(10)}})
export const detail=query({args:{runId:v.id('missionGraphRuns')},returns:v.object({graph,run,batches:v.array(batch),assessment:v.object({status:v.string(),reason:v.string(),ready:v.array(v.string()),nextWave:v.array(v.string()),completed:v.number(),deadline:v.number()}),asOf:v.number()}),handler:async(ctx,a)=>{
 const {r,g}=await ownedRun(ctx,a.runId),rows=await batches(ctx,r._id),asOf=Date.now()
 return{graph:g,run:r,batches:rows,assessment:inspectGraph(g.nodes,rows.flatMap(b=>b.results),g.limits,r,asOf),asOf}
}})
export const start=mutation({args:{graphId:v.id('missionGraphs'),runKey:v.string(),basis:runFields.basis,parentRunId:v.optional(v.id('missionGraphRuns')),replanReason:v.string()},returns:v.id('missionGraphRuns'),handler:async(ctx,a)=>{
 const g=await ownedGraph(ctx,a.graphId),runKey=bounded(a.runKey,'Run key',100),replanReason=bounded(a.replanReason,'Replan rationale',1200,a.parentRunId?1:0),data={graphId:a.graphId,runKey,basis:a.basis,parentRunId:a.parentRunId??null,replanReason}
 secrets(JSON.stringify(data))
 const startDigest=await digest(canonical(data)),existing=await ctx.db.query('missionGraphRuns').withIndex('by_graph',q=>q.eq('graphId',g._id)).take(10),old=existing.find(r=>r.runKey===runKey)
 if(old){if(old.startDigest!==startDigest)throw new ConvexError('Run key has a different immutable start contract');return old._id}
 if(existing.length>=10)throw new ConvexError('10 rehearsals per graph version; history is retained')
 let depth=0,startedAt=Date.now(),usedSteps=0,usedToolCalls=0,usedTokens=0
 if(a.parentRunId){
  const {r:parent,g:pg}=await ownedRun(ctx,a.parentRunId),rows=await batches(ctx,parent._id),state=inspectGraph(pg.nodes,rows.flatMap(b=>b.results),pg.limits,parent,Date.now())
  if(pg.projectId!==g.projectId||pg.graphKey!==g.graphKey||pg.revision>g.revision)throw new ConvexError('Replans must use the same project and graph family at the same or later revision')
  if(state.status!=='stopped'||parent.childRunId)throw new ConvexError('Only a stopped rehearsal without a successor can be replanned')
  if(canonical(pg.limits)!==canonical(g.limits)||parent.basis!==a.basis)throw new ConvexError('Replans must preserve original limits and provenance')
  depth=parent.depth+1;startedAt=parent.startedAt;usedSteps=parent.usedSteps;usedToolCalls=parent.usedToolCalls;usedTokens=parent.usedTokens
  if(depth>g.limits.maxReplans)throw new ConvexError('Replan limit reached')
  if(Date.now()>=startedAt+g.limits.maxWallSeconds*1000||usedSteps>=g.limits.maxSteps)throw new ConvexError('Original cumulative budget or deadline is exhausted')
  await ctx.db.patch(parent._id,{status:'stopped',stopReason:state.reason})
 }
 const id=await ctx.db.insert('missionGraphRuns',{ownerKey:g.ownerKey,graphId:g._id,projectId:g.projectId,runKey,basis:a.basis,startedAt,depth,...(a.parentRunId?{parentRunId:a.parentRunId}:{}),replanReason,status:'active',stopReason:'',usedSteps,usedToolCalls,usedTokens,startDigest})
 if(a.parentRunId)await ctx.db.patch(a.parentRunId,{childRunId:id})
 return id
}})
export const recordWave=mutation({args:{runId:v.id('missionGraphRuns'),batchKey:v.string(),results:v.array(stepResult)},returns:v.id('missionGraphBatches'),handler:async(ctx,a)=>{
 const {r,g}=await ownedRun(ctx,a.runId),batchKey=bounded(a.batchKey,'Wave key',100)
 if(!a.results.length||a.results.length>g.limits.parallelism)throw new ConvexError('Wave size exceeds frozen parallelism')
 const results=a.results.map(x=>({...x,nodeKey:bounded(x.nodeKey,'Node key',60),summary:bounded(x.summary,'Handoff summary',2000),evidenceRefs:x.evidenceRefs.map(e=>bounded(e,'Evidence reference',240)),toolCalls:whole(x.toolCalls,'Reported tool calls',0,100),tokens:whole(x.tokens,'Reported tokens',0,100000)}))
 if(results.some(x=>x.evidenceRefs.length>6||new Set(x.evidenceRefs).size!==x.evidenceRefs.length))throw new ConvexError('Use up to six distinct evidence references')
 secrets(JSON.stringify(results));const payloadDigest=await digest(canonical(results)),rows=await batches(ctx,r._id),old=rows.find(b=>b.batchKey===batchKey)
 if(old){if(old.payloadDigest!==payloadDigest)throw new ConvexError('Wave key already has different immutable results');return old._id}
 const previous=rows.flatMap(b=>b.results),state=inspectGraph(g.nodes,previous,g.limits,r,Date.now())
 if(state.status!=='active'||r.childRunId)throw new ConvexError('Rehearsal stopped or complete: '+state.reason)
 if(new Set(results.map(x=>x.nodeKey)).size!==results.length||results.some(x=>!state.ready.includes(x.nodeKey)))throw new ConvexError('Only distinct currently ready nodes may share a wave; dependencies must be in earlier waves')
 for(const x of results){const n=g.nodes.find(n=>n.key===x.nodeKey)!;if(x.outputKind!==n.outputKind)throw new ConvexError('Handoff output kind does not match frozen contract');if(x.status==='complete'&&(n.outputKind==='verification'||n.outputKind==='decision')&&!x.evidenceRefs.length)throw new ConvexError('Verification and decision handoffs require evidence references; references are not independently verified')}
 const usedSteps=r.usedSteps+results.length,usedToolCalls=r.usedToolCalls+results.reduce((s,x)=>s+x.toolCalls,0),usedTokens=r.usedTokens+results.reduce((s,x)=>s+x.tokens,0)
 if(usedSteps>g.limits.maxSteps||usedToolCalls>g.limits.maxToolCalls||usedTokens>g.limits.maxTokens)throw new ConvexError('Wave would exceed cumulative frozen budgets; no results saved')
 const next=inspectGraph(g.nodes,[...previous,...results],g.limits,{...r,usedSteps},Date.now())
 const id=await ctx.db.insert('missionGraphBatches',{ownerKey:r.ownerKey,runId:r._id,batchKey,payloadDigest,results,createdAt:Date.now()})
 await ctx.db.patch(r._id,{usedSteps,usedToolCalls,usedTokens,status:next.status as 'active'|'stopped'|'complete',stopReason:next.reason})
 return id
}})
export const stop=mutation({args:{runId:v.id('missionGraphRuns'),reason:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const {r}=await ownedRun(ctx,a.runId),reason=bounded(a.reason,'Stop reason',1200);secrets(reason)
 if(r.status==='stopped'){if(r.stopReason!==reason)throw new ConvexError('Stop reason is frozen');return null}
 if(r.status!=='active')throw new ConvexError('Completed rehearsal is immutable')
 await ctx.db.patch(r._id,{status:'stopped',stopReason:reason});return null
}})
