import {defineTable} from 'convex/server'
import {v,type Infer} from 'convex/values'
import {planningResult} from './graphExecutionModel'
import type {GraphNode,GraphLimits} from './missionGraphModel'
export const runtimeVersion='recorded-planning-runtime-v1'
export const runtimeSource=v.union(v.object({kind:v.literal('provider'),id:v.id('graphExecutions')}),v.object({kind:v.literal('rehearsal'),id:v.id('missionGraphRuns')}))
export type RuntimeSource=Infer<typeof runtimeSource>
export const replacement=v.object({nodeKey:v.string(),answer:v.string()})
export const replayOutcome=v.object({nodeKey:v.string(),origin:v.union(v.literal('recorded'),v.literal('operator-replacement')),status:v.union(v.literal('complete'),v.literal('blocked'),v.literal('insufficient'),v.literal('missing'),v.literal('invalidated')),summary:v.string(),evidenceRefs:v.array(v.string())})
export type ReplayOutcome=Infer<typeof replayOutcome>
export type Replacement=Infer<typeof replacement>
export const replayStatus=v.union(v.literal('ready'),v.literal('paused'),v.literal('complete'),v.literal('held'),v.literal('stopped'))
export const runtimeTables={
 runtimeCheckpoints:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),graphId:v.id('missionGraphs'),source:runtimeSource,checkpointKey:v.string(),sourceDigest:v.string(),snapshot:v.string(),createdAt:v.number()}).index('by_graph',['graphId']),
 runtimeReplays:defineTable({ownerKey:v.string(),checkpointId:v.id('runtimeCheckpoints'),replayKey:v.string(),label:v.string(),rationale:v.string(),parentReplayId:v.optional(v.id('runtimeReplays')),depth:v.number(),overrides:v.array(replacement),branchDigest:v.string(),status:replayStatus,reason:v.string(),revision:v.number(),createdAt:v.number(),deadlineAt:v.number()}).index('by_checkpoint',['checkpointId']),
 runtimeReplayEvents:defineTable({ownerKey:v.string(),replayId:v.id('runtimeReplays'),eventKey:v.string(),requestDigest:v.string(),previousDigest:v.string(),eventDigest:v.string(),revision:v.number(),operation:v.union(v.literal('advance'),v.literal('pause'),v.literal('resume')),status:replayStatus,reason:v.string(),outcomes:v.array(replayOutcome),createdAt:v.number()}).index('by_replay',['replayId']),
}
export type RuntimeHandoff={nodeKey:string;state:'accepted'|'missing'|'unresolved'|'invalid';result:Infer<typeof planningResult>|null;reason:string;provenance:'provider-receipt'|'controlled_fixture'|'operator_reported';refs:string[]}
export type RuntimeSnapshot={
 version:string;scope:'test'|'live';source:RuntimeSource;sourceStatus:string;sourceReason:string;
 graph:{id:string;digest:string;title:string;nodes:GraphNode[];limits:GraphLimits};
 missionId:string;missionContract:string|null;contractDigest:string|null;
 events:{key:string;at:number|null;status:string;detail:string}[];
 handoffs:RuntimeHandoff[];
}
export function replayWave(snapshot:RuntimeSnapshot,previous:ReplayOutcome[],overrides:Replacement[]){
 const done=new Set(previous.filter(r=>r.status==='complete').map(r=>r.nodeKey)),visited=new Set(previous.map(r=>r.nodeKey))
 return snapshot.graph.nodes.filter(n=>!visited.has(n.key)&&n.dependsOn.every(k=>done.has(k))).slice(0,snapshot.graph.limits.parallelism)
}
