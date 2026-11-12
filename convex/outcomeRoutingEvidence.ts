import {ConvexError} from 'convex/values'
import type {QueryCtx,MutationCtx} from './_generated/server'
import type {Doc} from './_generated/dataModel'
import {graphProviderConfiguration} from './aiProvider'
import {canonical} from './evaluationModel'
import {digest} from './studioModel'
import {missionSnapshot,graphExecutionVersion,planningPrompt,parsePlanningResult} from './graphExecutionModel'
import {routingVersion,rankRouting,type RoutingObservation,type RoutingSnapshot,type RoutingWorker} from './outcomeRoutingModel'
type ReadCtx=QueryCtx|MutationCtx
export function routingScope():'test'|'live'{
 const url=process.env.CONVEX_CLOUD_URL
 if(url==='https://quick-rabbit-810.eu-west-1.convex.cloud')return'test'
 if(url==='https://tame-rat-826.eu-west-1.convex.cloud')return'live'
 throw new ConvexError('Routing requires this project’s verified Testing or Live environment')
}
async function auditExecution(ctx:ReadCtx,p:Doc<'routingPolicies'>,g:Doc<'missionGraphs'>,e:Doc<'graphExecutions'>,now:number):Promise<RoutingObservation>{
 const base={id:String(e._id),provider:e.provider,model:e.model,observedAt:e.createdAt,workers:[] as RoutingWorker[]}
 const ignored=(reason:string):RoutingObservation=>({...base,state:'ignored',reason}),unresolved=(reason:string):RoutingObservation=>({...base,state:'unresolved',reason})
 if(e.ownerKey!==p.ownerKey||e.projectId!==p.projectId||e.graphId!==g._id)throw new ConvexError('Routing source ownership mismatch')
 if(e.reservedCalls===0)return ignored('Frozen contract has no admitted provider work; not a measured run')
 if(e.missionSnapshot!==p.missionSnapshot||e.maxOutputTokens!==p.maxOutputTokens||e.version!==graphExecutionVersion)return ignored('Different mission, output limit or runtime version; not this matched workload')
 if(e.billingMode!==p.scope)return ignored('Billing evidence belongs to another environment class')
 if(!p.allowedProviders.includes(e.provider))return ignored('Provider is outside the frozen authorization allowlist')
 if(graphProviderConfiguration(e.provider).model!==e.model)return ignored('Historical model differs from the currently configured named model')
 if(e.status==='active'||e.status==='review')return unresolved('Admitted work is active or awaiting review; timestamps cannot establish successful execution')
 const expectedContract=await digest(canonical({graphDigest:g.designDigest,version:e.version,provider:e.provider,model:e.model,maxOutputTokens:e.maxOutputTokens,missionSnapshot:e.missionSnapshot,...(e.routingDecisionDigest?{routingDecisionDigest:e.routingDecisionDigest}:{})}))
 if(e.contractDigest!==expectedContract)return unresolved('Frozen execution contract digest does not match')
 const workers=await ctx.db.query('graphExecutionWorkers').withIndex('by_execution',q=>q.eq('executionId',e._id)).take(11),waves=await ctx.db.query('graphExecutionWaves').withIndex('by_execution',q=>q.eq('executionId',e._id)).take(11)
 if(workers.length>10||waves.length>10||!workers.length||workers.length!==e.reservedCalls||new Set(workers.map(w=>w.nodeKey)).size!==workers.length)return unresolved('Bounded execution population is missing or inconsistent')
 for(const wave of waves){const claim=await ctx.db.get(wave.claimId);if(wave.status!=='complete'||claim?.status!=='complete'||claim.scope!=='council'||claim.missionId!==e.missionId||claim.workKey!=='direct:graph:'+e._id+':'+wave.waveKey)return unresolved('Execution wave fence or durable completion receipt is unresolved')}
 const observations:RoutingWorker[]=[],finished:number[]=[]
 for(const w of workers){
  const n=g.nodes.find(n=>n.key===w.nodeKey)
  if(!n||!['complete','blocked','insufficient'].includes(w.status)||!waves.some(x=>x._id===w.waveId))return unresolved('A worker lacks a terminal typed handoff or matching wave')
  const invocation=await ctx.db.get(w.invocationId),saved=await ctx.db.query('providerResults').withIndex('by_invocation',q=>q.eq('invocationId',w.invocationId)).unique(),hold=await ctx.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',w.invocationId).eq('mode',p.scope)).unique()
  if(!invocation||invocation.ownerKey!==p.ownerKey||invocation.missionId!==e.missionId||invocation.stage!=='graph-'+e._id+'-'+w.nodeKey||invocation.role!=='graph-planning'||invocation.outcome!=='succeeded'||invocation.usageStatus!=='recorded'||invocation.observedReports!==1||invocation.reports.length!==1||!saved||saved.requestDigest!==w.requestDigest)return unresolved('Successful invocation and exact stored answer evidence are missing')
  const receipt=invocation.reports[0]
  if(receipt.provider!==e.provider||receipt.model!==e.model||receipt.totalTokens===undefined||receipt.completionTokens===undefined||receipt.totalTokens>w.tokenAllowance||receipt.completionTokens>e.maxOutputTokens)return unresolved('Provider model or bounded token receipt is missing or inconsistent')
  if(!hold||hold.ownerKey!==p.ownerKey||hold.status!=='settled'||!Number.isSafeInteger(hold.charged)||hold.charged!<0||hold.charged!>hold.reserved)return unresolved('Settled usage charge is unknown; missing cost cannot be treated as zero')
  if(w.dispatchedAt===undefined||invocation.finishedAt===undefined||invocation.finishedAt<w.dispatchedAt||invocation.finishedAt>now)return unresolved('Measured request duration is missing or inconsistent')
  const parents=workers.filter(parent=>n.dependsOn.includes(parent.nodeKey))
  if(parents.length!==n.dependsOn.length||parents.some(parent=>parent.status!=='complete'))return unresolved('Required predecessor handoffs are unavailable')
  let request:ReturnType<typeof planningPrompt>
  try{request=planningPrompt(g,e,n,parents)}catch{return unresolved('Frozen provider prompt cannot be reconstructed')}
  if(request.prompt!==w.prompt||request.allowance!==w.tokenAllowance)return unresolved('Exact frozen request context differs from its recorded worker')
  const expectedRequest=await digest(canonical({version:e.version,provider:e.provider,model:e.model,prompt:w.prompt,maxOutputTokens:e.maxOutputTokens,contractDigest:e.contractDigest}))
  if(expectedRequest!==w.requestDigest)return unresolved('Provider request digest differs from its immutable contract')
  let valid=false
  try{const parsed=parsePlanningResult(saved.answer,n,request.refs);if(canonical(parsed)!==canonical(w.result)||parsed.status!==w.status)return unresolved('Stored provider answer and accepted worker handoff disagree');valid=true}
  catch{if(w.result!==undefined||w.status!=='blocked')return unresolved('Unconfirmed typed-handoff grading')}
  observations.push({nodeKey:w.nodeKey,invocationId:String(w.invocationId),valid,chargeCents:hold.charged!,requestMs:invocation.finishedAt-w.dispatchedAt,promptBytes:new TextEncoder().encode(w.prompt).length})
  finished.push(invocation.finishedAt)
 }
 if(e.status==='complete'&&(workers.length!==g.nodes.length||workers.some(w=>w.status!=='complete')))return unresolved('Claimed graph completion is not supported by all node outcomes')
 const observedAt=Math.min(...finished),stale=observedAt<now-p.maxAgeHours*3600000
 return{...base,state:stale?'stale':'verified',reason:stale?'At least one confirmed node receipt is outside the frozen freshness window':'Stored response, typed grading, named-model usage and settled charge checked; semantic correctness unmeasured',observedAt,workers:observations}
}
export async function routingSnapshot(ctx:ReadCtx,p:Doc<'routingPolicies'>){
 const g=await ctx.db.get(p.graphId),m=g?await ctx.db.get(g.missionId):null
 if(!g||g.ownerKey!==p.ownerKey||g.projectId!==p.projectId||!m||m.ownerKey!==p.ownerKey)throw new ConvexError('Policy graph unavailable')
 if(p.scope!==routingScope()||p.missionSnapshot!==missionSnapshot(m))throw new ConvexError('Environment or mission contract changed; freeze a new policy version')
 const now=Date.now(),rows=await ctx.db.query('graphExecutions').withIndex('by_graph',q=>q.eq('graphId',g._id)).take(11)
 if(rows.length>10)throw new ConvexError('Execution history exceeds the bounded evidence audit; existing history is retained')
 const observations:RoutingObservation[]=[]
 for(const row of rows)observations.push(await auditExecution(ctx,p,g,row,now))
 const configs={cloudflare:graphProviderConfiguration('cloudflare'),groq:graphProviderConfiguration('groq'),cerebras:graphProviderConfiguration('cerebras'),'ollama-deepseek':graphProviderConfiguration('ollama-deepseek'),'ollama-gemma':graphProviderConfiguration('ollama-gemma'),'ollama-glm':graphProviderConfiguration('ollama-glm'),'ollama-gpt-oss':graphProviderConfiguration('ollama-gpt-oss'),'ollama-minimax':graphProviderConfiguration('ollama-minimax'),'ollama-nemotron':graphProviderConfiguration('ollama-nemotron')}
 const ranked=rankRouting(g.nodes.map(n=>n.key),p,observations,configs)
 const snapshot:RoutingSnapshot={version:routingVersion,scope:p.scope,graphDigest:g.designDigest,missionDigest:await digest(p.missionSnapshot),observations,...ranked}
 const encoded=canonical(snapshot)
 if(new TextEncoder().encode(encoded).length>65536)throw new ConvexError('Routing snapshot exceeds 64 KiB; review bounded evidence')
 return{snapshot:encoded,sourceDigest:await digest(encoded),asOf:now}
}
