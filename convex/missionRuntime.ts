import {v,ConvexError} from 'convex/values'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {requireOperator} from './permissions'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {whole} from './missionGraphModel'
import {parsePlanningResult} from './graphExecutionModel'
import {captureRuntime} from './missionRuntimeSource'
import {runtimeSource,runtimeVersion,replacement,replayWave,type RuntimeSnapshot,type Replacement,type ReplayOutcome} from './missionRuntimeModel'
type Ctx=QueryCtx|MutationCtx
async function checkpoint(ctx:Ctx,id:Id<'runtimeCheckpoints'>){
 const owner=await requireOperator(ctx),c=await ctx.db.get(id)
 if(!c||c.ownerKey!==owner)throw new ConvexError('Checkpoint unavailable')
 await ownedProject(ctx,c.projectId)
 if(await digest(c.snapshot)!==c.sourceDigest)throw new ConvexError('Checkpoint integrity check failed')
 const snapshot=JSON.parse(c.snapshot) as RuntimeSnapshot
 if(snapshot.version!==runtimeVersion||snapshot.graph.id!==c.graphId)throw new ConvexError('Unsupported checkpoint runtime version')
 return{c,snapshot}
}
async function replay(ctx:Ctx,id:Id<'runtimeReplays'>){
 const owner=await requireOperator(ctx),r=await ctx.db.get(id)
 if(!r||r.ownerKey!==owner)throw new ConvexError('Replay unavailable')
 const saved=await checkpoint(ctx,r.checkpointId)
 const branch=canonical({checkpointId:r.checkpointId,parentReplayId:r.parentReplayId??null,label:r.label,rationale:r.rationale,overrides:r.overrides})
 if(await digest(branch)!==r.branchDigest)throw new ConvexError('Replay branch integrity check failed')
 const events=await ctx.db.query('runtimeReplayEvents').withIndex('by_replay',q=>q.eq('replayId',id)).take(33)
 events.sort((a,b)=>a.revision-b.revision)
 if(events.length>32||events.length!==r.revision||events.some((e,i)=>e.ownerKey!==owner||e.revision!==i+1))throw new ConvexError('Replay event ledger is inconsistent')
 let previousDigest=r.branchDigest
 for(const e of events){
  const{_id,_creationTime,ownerKey,eventDigest,...payload}=e
  if(e.previousDigest!==previousDigest||await digest(canonical(payload))!==eventDigest)throw new ConvexError('Replay event integrity check failed')
  previousDigest=eventDigest
 }
 const last=events[events.length-1]
 if(last&&(last.status!==r.status||last.reason!==r.reason))throw new ConvexError('Replay state differs from the last immutable event')
 return{...saved,r,events}
}
export const preview=query({args:{source:runtimeSource},handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),source=await ctx.db.get(a.source.id)
 if(!source||source.ownerKey!==owner)throw new ConvexError('Runtime source unavailable')
 try{return{...await captureRuntime(ctx,a.source),blockedReason:''}}
 catch(error){if(error instanceof ConvexError)return{snapshot:'',sourceDigest:'',asOf:Date.now(),blockedReason:typeof error.data==='string'?error.data:'Runtime source could not be frozen'};throw error}
}})
export const checkpoints=query({args:{graphId:v.id('missionGraphs')},handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),g=await ctx.db.get(a.graphId)
 if(!g||g.ownerKey!==owner)throw new ConvexError('Runtime graph unavailable')
 await ownedProject(ctx,g.projectId)
 return ctx.db.query('runtimeCheckpoints').withIndex('by_graph',q=>q.eq('graphId',g._id)).order('desc').take(20)
}})
export const capture=mutation({args:{source:runtimeSource,checkpointKey:v.string(),expectedSourceDigest:v.string()},returns:v.id('runtimeCheckpoints'),handler:async(ctx,a)=>{
 const data=await captureRuntime(ctx,a.source),checkpointKey=bounded(a.checkpointKey,'Checkpoint key',100),rows=await ctx.db.query('runtimeCheckpoints').withIndex('by_graph',q=>q.eq('graphId',data.graphId)).take(20),old=rows.find(c=>c.checkpointKey===checkpointKey)
 if(old){
  if(canonical(old.source)!==canonical(a.source)||old.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Checkpoint key has a different frozen source')
  return old._id
 }
 if(data.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Runtime source changed; review a fresh preview before capture')
 if(rows.length>=20)throw new ConvexError('20 checkpoints per graph version; retained history is not deleted')
 secrets(checkpointKey)
 const{asOf,...fields}=data
 return ctx.db.insert('runtimeCheckpoints',{...fields,source:a.source,checkpointKey,createdAt:Date.now()})
}})
export const detail=query({args:{checkpointId:v.id('runtimeCheckpoints')},handler:async(ctx,a)=>{
 const{c,snapshot}=await checkpoint(ctx,a.checkpointId),replays=await ctx.db.query('runtimeReplays').withIndex('by_checkpoint',q=>q.eq('checkpointId',c._id)).order('desc').take(20)
 return{checkpoint:c,snapshot,replays}
}})
function normalize(snapshot:RuntimeSnapshot,items:Replacement[]){
 if(items.length>10||new Set(items.map(x=>x.nodeKey)).size!==items.length)throw new ConvexError('Use distinct replacement nodes, up to the frozen graph population')
 return items.map(item=>{
  const node=snapshot.graph.nodes.find(n=>n.key===item.nodeKey)
  if(!node)throw new ConvexError('Replacement node is not in the frozen graph')
  const refs=['mission:'+snapshot.missionId,...node.dependsOn.map(k=>'replay:'+k)],parsed=parsePlanningResult(item.answer,node,refs)
  return{nodeKey:node.key,answer:canonical(parsed)}
 }).sort((a,b)=>a.nodeKey.localeCompare(b.nodeKey))
}
export const start=mutation({args:{checkpointId:v.id('runtimeCheckpoints'),replayKey:v.string(),label:v.string(),rationale:v.string(),parentReplayId:v.optional(v.id('runtimeReplays')),overrides:v.array(replacement)},returns:v.id('runtimeReplays'),handler:async(ctx,a)=>{
 const{c,snapshot}=await checkpoint(ctx,a.checkpointId),replayKey=bounded(a.replayKey,'Replay key',100),label=bounded(a.label,'Branch label',140),rationale=bounded(a.rationale,'Diagnostic rationale',1200,12)
 const parent=a.parentReplayId?await replay(ctx,a.parentReplayId):null
 if(parent&&parent.c._id!==c._id)throw new ConvexError('Forks must preserve the same checkpoint and frozen inputs')
 const changes=normalize(snapshot,a.overrides),merged=new Map((parent?.r.overrides??[]).map(x=>[x.nodeKey,x]))
 for(const item of changes)merged.set(item.nodeKey,item)
 const overrides=[...merged.values()].sort((a,b)=>a.nodeKey.localeCompare(b.nodeKey)),branchDigest=await digest(canonical({checkpointId:c._id,parentReplayId:a.parentReplayId??null,label,rationale,overrides})),rows=await ctx.db.query('runtimeReplays').withIndex('by_checkpoint',q=>q.eq('checkpointId',c._id)).take(20),old=rows.find(r=>r.replayKey===replayKey)
 if(old){if(old.branchDigest!==branchDigest)throw new ConvexError('Replay key has a different immutable branch contract');return old._id}
 if(rows.length>=20)throw new ConvexError('20 replay branches per checkpoint; history retained')
 const depth=parent?parent.r.depth+1:0
 if(depth>3)throw new ConvexError('Offline fork depth limit reached (3)')
 const now=Date.now(),deadlineAt=parent?.r.deadlineAt??now+Math.min(3600,snapshot.graph.limits.maxWallSeconds)*1000
 if(now>=deadlineAt)throw new ConvexError('Original offline replay deadline reached; a fork cannot reset its clock')
 secrets(canonical({replayKey,label,rationale,overrides}))
 return ctx.db.insert('runtimeReplays',{ownerKey:c.ownerKey,checkpointId:c._id,replayKey,label,rationale,...(a.parentReplayId?{parentReplayId:a.parentReplayId}:{}),depth,overrides,branchDigest,status:'ready',reason:'Offline replay only; no provider calls, delivery or approval changes',revision:0,createdAt:now,deadlineAt})
}})
export const replayDetail=query({args:{replayId:v.id('runtimeReplays')},handler:async(ctx,a)=>{
 const data=await replay(ctx,a.replayId),previous=data.events.flatMap(e=>e.outcomes)
 return{replay:data.r,events:data.events,snapshot:data.snapshot,next:replayWave(data.snapshot,previous,data.r.overrides).map(n=>n.key),completed:previous.filter(x=>x.status==='complete').length,asOf:Date.now()}
}})
export const control=mutation({args:{replayId:v.id('runtimeReplays'),eventKey:v.string(),expectedRevision:v.number(),operation:v.union(v.literal('advance'),v.literal('pause'),v.literal('resume')),reason:v.string()},returns:v.id('runtimeReplayEvents'),handler:async(ctx,a)=>{
 const{r,events,snapshot}=await replay(ctx,a.replayId),eventKey=bounded(a.eventKey,'Replay event key',100),reason=bounded(a.reason,'Control reason',800,8)
 whole(a.expectedRevision,'Expected replay revision',0,32)
 const requestDigest=await digest(canonical({expectedRevision:a.expectedRevision,operation:a.operation,reason})),old=events.find(e=>e.eventKey===eventKey)
 if(old){if(old.requestDigest!==requestDigest)throw new ConvexError('Replay event key already has different immutable input');return old._id}
 if(r.revision!==a.expectedRevision)throw new ConvexError('Replay revision changed; reload before another control')
 if(events.length>=32)throw new ConvexError('Replay event limit reached (32)')
 if(['complete','held','stopped'].includes(r.status))throw new ConvexError('Replay is terminal; create a reviewed offline fork to explore alternatives')
 if(a.operation==='resume'&&r.status!=='paused'||a.operation==='advance'&&r.status!=='ready'||a.operation==='pause'&&r.status!=='ready')throw new ConvexError('Replay control does not match current state')
 secrets(reason)
 let status=r.status,detail=reason;const outcomes:ReplayOutcome[]=[]
 if(Date.now()>=r.deadlineAt){status='held';detail='Original offline deadline reached; pause and forks do not extend it'}
 else if(a.operation==='pause')status='paused'
 else if(a.operation==='resume')status='ready'
 else{
  const previous=events.flatMap(e=>e.outcomes),wave=replayWave(snapshot,previous,r.overrides),changed=new Set(r.overrides.map(x=>x.nodeKey))
  const upstreamChanged=(key:string):boolean=>snapshot.graph.nodes.find(n=>n.key===key)!.dependsOn.some(k=>changed.has(k)||upstreamChanged(k))
  for(const node of wave){
   const replacement=r.overrides.find(x=>x.nodeKey===node.key),source=snapshot.handoffs.find(h=>h.nodeKey===node.key)
   if(replacement){
    const parsed=parsePlanningResult(replacement.answer,node,['mission:'+snapshot.missionId,...node.dependsOn.map(k=>'replay:'+k)])
    outcomes.push({nodeKey:node.key,origin:'operator-replacement',status:parsed.status,summary:parsed.summary,evidenceRefs:parsed.evidenceRefs})
   }else if(upstreamChanged(node.key))outcomes.push({nodeKey:node.key,origin:'recorded',status:'invalidated',summary:'Upstream handoff changed; the old downstream response cannot be reused as if its request were unchanged',evidenceRefs:[]})
   else if(source?.state==='accepted'&&source.result)outcomes.push({nodeKey:node.key,origin:'recorded',status:source.result.status,summary:source.result.summary,evidenceRefs:source.result.evidenceRefs})
   else outcomes.push({nodeKey:node.key,origin:'recorded',status:'missing',summary:source?.reason??'No matching frozen source handoff',evidenceRefs:[]})
  }
  const all=[...previous,...outcomes],halted=outcomes.find(x=>x.status!=='complete')
  if(halted){status=halted.status==='blocked'||halted.status==='insufficient'?'stopped':'held';detail=halted.nodeKey+': '+halted.status+'. '+halted.summary}
  else if(all.length===snapshot.graph.nodes.length){status='complete';detail='Offline typed planning replay complete; no semantic, real-world or production recovery claim'}
  else if(!wave.length){status='held';detail='No dependency-ready source handoff; no missing result was invented'}
  else{status='ready';detail='Recorded wave accepted offline; next wave requires an explicit request'}
 }
 const revision=r.revision+1,payload={replayId:r._id,eventKey,requestDigest,previousDigest:events[events.length-1]?.eventDigest??r.branchDigest,revision,operation:a.operation,status,reason:detail,outcomes,createdAt:Date.now()},eventDigest=await digest(canonical(payload)),id=await ctx.db.insert('runtimeReplayEvents',{ownerKey:r.ownerKey,...payload,eventDigest})
 await ctx.db.patch(r._id,{status,reason:detail,revision})
 return id
}})
