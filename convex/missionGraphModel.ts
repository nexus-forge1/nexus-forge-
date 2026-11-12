import {defineTable} from 'convex/server'
import {v,ConvexError,type Infer} from 'convex/values'
import {bounded} from './studioModel'
export const graphRuleVersion='mission-graph-v1'
export const artifactKind=v.union(v.literal('brief'),v.literal('evidence'),v.literal('analysis'),v.literal('plan'),v.literal('implementation'),v.literal('verification'),v.literal('decision'))
export const graphNode=v.object({key:v.string(),specialist:v.string(),dependsOn:v.array(v.string()),inputKinds:v.array(artifactKind),outputKind:artifactKind,acceptance:v.string()})
export const graphLimits=v.object({maxSteps:v.number(),maxToolCalls:v.number(),maxTokens:v.number(),maxWallSeconds:v.number(),maxReplans:v.number(),parallelism:v.number()})
export const designFields={graphKey:v.string(),title:v.string(),objective:v.string(),missionType:v.union(v.literal('research'),v.literal('build'),v.literal('growth'),v.literal('incident')),nodes:v.array(graphNode),limits:graphLimits}
export type GraphNode=Infer<typeof graphNode>
export type GraphLimits=Infer<typeof graphLimits>
export type GraphDesign={[K in keyof typeof designFields]:Infer<(typeof designFields)[K]>}
export const stepResult=v.object({nodeKey:v.string(),status:v.union(v.literal('complete'),v.literal('blocked'),v.literal('insufficient')),outputKind:artifactKind,summary:v.string(),evidenceRefs:v.array(v.string()),toolCalls:v.number(),tokens:v.number()})
export type StepResult=Infer<typeof stepResult>
export const graphFields={...designFields,ownerKey:v.string(),projectId:v.id('studioProjects'),missionId:v.id('missions'),revision:v.number(),designDigest:v.string(),ruleVersion:v.string(),createdAt:v.number()}
export const runFields={ownerKey:v.string(),graphId:v.id('missionGraphs'),projectId:v.id('studioProjects'),runKey:v.string(),basis:v.union(v.literal('controlled_fixture'),v.literal('operator_reported')),startedAt:v.number(),depth:v.number(),parentRunId:v.optional(v.id('missionGraphRuns')),childRunId:v.optional(v.id('missionGraphRuns')),replanReason:v.string(),status:v.union(v.literal('active'),v.literal('complete'),v.literal('stopped')),stopReason:v.string(),usedSteps:v.number(),usedToolCalls:v.number(),usedTokens:v.number(),startDigest:v.string()}
export const batchFields={ownerKey:v.string(),runId:v.id('missionGraphRuns'),batchKey:v.string(),payloadDigest:v.string(),results:v.array(stepResult),createdAt:v.number()}
export const missionGraphTables={
 missionGraphs:defineTable(graphFields).index('by_project',['projectId']),
 missionGraphRuns:defineTable(runFields).index('by_graph',['graphId']),
 missionGraphBatches:defineTable(batchFields).index('by_run',['runId']),
}
export function whole(n:number,label:string,min:number,max:number){if(!Number.isSafeInteger(n)||n<min||n>max)throw new ConvexError(label+' must be a whole number from '+min+' to '+max);return n}
export function validateGraph(raw:GraphDesign):GraphDesign{
 const data={...raw,graphKey:bounded(raw.graphKey,'Graph key',80),title:bounded(raw.title,'Title',140),objective:bounded(raw.objective,'Objective',1600)}
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(data.graphKey))throw new ConvexError('Use a lowercase graph key')
 if(data.nodes.length<2||data.nodes.length>10)throw new ConvexError('Use 2–10 specialist nodes')
 const keys=new Set<string>()
 data.nodes=data.nodes.map(n=>{const key=bounded(n.key,'Node key',60);if(!/^[a-z0-9][a-z0-9_-]*$/.test(key)||keys.has(key))throw new ConvexError('Node keys must be distinct lowercase identifiers');keys.add(key);return{...n,key,specialist:bounded(n.specialist,'Specialist',100),acceptance:bounded(n.acceptance,'Acceptance contract',1200)}})
 for(const n of data.nodes){
  if(n.dependsOn.length>9||new Set(n.dependsOn).size!==n.dependsOn.length||n.dependsOn.some(k=>!keys.has(k)||k===n.key))throw new ConvexError('Dependencies must be distinct existing other nodes')
  const expected=n.dependsOn.length?[...new Set(n.dependsOn.map(k=>data.nodes.find(x=>x.key===k)!.outputKind))]:['brief']
  if(n.inputKinds.length!==expected.length||new Set(n.inputKinds).size!==expected.length||expected.some(k=>!n.inputKinds.includes(k as GraphNode['outputKind'])))throw new ConvexError('Input kinds must exactly match dependency outputs; root input is brief')
 }
 const visited=new Set<string>(),stack=new Set<string>()
 function walk(key:string){if(stack.has(key))throw new ConvexError('Mission graph must be acyclic');if(visited.has(key))return;stack.add(key);for(const k of data.nodes.find(n=>n.key===key)!.dependsOn)walk(k);stack.delete(key);visited.add(key)}
 data.nodes.forEach(n=>walk(n.key))
 const decisions=data.nodes.filter(n=>n.outputKind==='decision')
 if(decisions.length!==1)throw new ConvexError('Exactly one final decision node is required')
 const terminal=decisions[0],ancestors=new Set<string>()
 function collect(key:string){if(ancestors.has(key))return;ancestors.add(key);data.nodes.find(n=>n.key===key)!.dependsOn.forEach(collect)}
 collect(terminal.key)
 if(ancestors.size!==data.nodes.length||data.nodes.some(n=>n.dependsOn.includes(terminal.key)))throw new ConvexError('Every node must feed the final decision')
 if(!data.nodes.some(n=>n.outputKind==='verification'&&n.key!==terminal.key&&ancestors.has(n.key)))throw new ConvexError('A verification handoff must precede the final decision')
 const l=data.limits
 whole(l.maxSteps,'Step budget',data.nodes.length,40);whole(l.maxToolCalls,'Declared tool-call budget',0,100);whole(l.maxTokens,'Declared token budget',0,100000);whole(l.maxWallSeconds,'Wall time',30,86400);whole(l.maxReplans,'Replans',0,3);whole(l.parallelism,'Parallelism',1,4)
 return data
}
export function inspectGraph(nodes:GraphNode[],results:StepResult[],limits:GraphLimits,run:{status:string;stopReason:string;startedAt:number;usedSteps:number},now:number){
 const complete=new Set(results.filter(r=>r.status==='complete').map(r=>r.nodeKey))
 const failed=results.find(r=>r.status!=='complete')
 let status=run.status,reason=run.stopReason
 if(status==='active'){
  if(failed){status='stopped';reason=failed.status+': '+failed.nodeKey}
  else if(complete.size===nodes.length){status='complete';reason='All supplied handoffs recorded; human review required'}
  else if(now>=run.startedAt+limits.maxWallSeconds*1000){status='stopped';reason='Wall-clock limit reached'}
  else if(run.usedSteps>=limits.maxSteps){status='stopped';reason='Cumulative step budget exhausted'}
 }
 const ready=status==='active'?nodes.filter(n=>!complete.has(n.key)&&!results.some(r=>r.nodeKey===n.key)&&n.dependsOn.every(k=>complete.has(k))):[]
 return{status,reason,ready:ready.map(n=>n.key),nextWave:ready.slice(0,limits.parallelism).map(n=>n.key),completed:complete.size,deadline:run.startedAt+limits.maxWallSeconds*1000}
}
