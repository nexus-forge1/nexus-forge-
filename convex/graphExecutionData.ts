import {v,ConvexError} from 'convex/values'
import {query,mutation,internalMutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Doc,Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {ownedProject} from './studio'
import {bounded,digest,secrets} from './studioModel'
import {canonical} from './evaluationModel'
import {whole,graphFields} from './missionGraphModel'
import {graphProviderConfiguration,type GraphProvider} from './aiProvider'
import {aiAllowanceEnforced} from './aiAllowance'
import {isOllamaProvider} from './ollamaModels'
import {graphProvider,executionFields,waveFields,workerFields,graphExecutionVersion,missionSnapshot,planningPrompt,parsePlanningResult} from './graphExecutionModel'
import {executionRequirements} from './executionRequirements'
import {executionMode,reserveUsage} from './billingUsage'
import {accountFor} from './billing'
import {validateMissionBudget} from './missionContract'
import {admitEvidence} from './evidenceAdmission'
const legacyProvider=v.union(v.literal('cloudflare'),v.literal('groq'),v.literal('cerebras'))
const legacyExecution=v.object({_id:v.id('graphExecutions'),_creationTime:v.number(),...executionFields,provider:legacyProvider})
const execution=v.object({_id:v.id('graphExecutions'),_creationTime:v.number(),...executionFields}),wave=v.object({_id:v.id('graphExecutionWaves'),_creationTime:v.number(),...waveFields}),worker=v.object({_id:v.id('graphExecutionWorkers'),_creationTime:v.number(),...workerFields})
type ReadCtx=QueryCtx|MutationCtx
async function ownedGraph(ctx:ReadCtx,id:Id<'missionGraphs'>){const owner=await requireOperator(ctx),g=await ctx.db.get(id);if(!g||g.ownerKey!==owner)throw new ConvexError('Graph unavailable');await ownedProject(ctx,g.projectId);return g}
async function owned(ctx:ReadCtx,id:Id<'graphExecutions'>){const owner=await requireOperator(ctx),e=await ctx.db.get(id);if(!e||e.ownerKey!==owner)throw new ConvexError('Execution unavailable');const g=await ownedGraph(ctx,e.graphId);return{e,g}}
async function workers(ctx:ReadCtx,id:Id<'graphExecutions'>){return ctx.db.query('graphExecutionWorkers').withIndex('by_execution',q=>q.eq('executionId',id)).take(10)}
async function waves(ctx:ReadCtx,id:Id<'graphExecutions'>){return ctx.db.query('graphExecutionWaves').withIndex('by_execution',q=>q.eq('executionId',id)).take(10)}
async function prerequisites(ctx:ReadCtx,e:Doc<'graphExecutions'>,g:Doc<'missionGraphs'>,checkAvailableCredit=true){
 const blockers:string[]=[],m=await ctx.db.get(e.missionId)
 if(!m||m.ownerKey!==e.ownerKey)return['Linked mission unavailable']
 if(!m.approved)blockers.push('Human mission approval is required')
 if(m.status!=='running')blockers.push('Linked mission must be running; draft, review, cancelled or complete missions cannot dispatch graph workers')
 if(missionSnapshot(m)!==e.missionSnapshot)blockers.push('Mission contract changed; freeze a new graph execution contract')
 try{validateMissionBudget(m.budget)}catch{blockers.push('Mission budget is invalid')}
 if(aiAllowanceEnforced()&&m.budget<1)blockers.push('Mission spend cap cannot cover the required $1 authorization per AI request')
 const approval=await ctx.db.query('portfolioDecisions').withIndex('by_mission',q=>q.eq('missionId',m._id)).order('desc').first()
 if(approval?.decision!=='approve')blockers.push('Latest portfolio decision must approve this mission')
 const review=await executionRequirements(ctx,m);blockers.push(...review.blockers)
 const config=graphProviderConfiguration(e.provider)
 if(!config.configured||config.model!==e.model)blockers.push('Frozen named-provider model is unavailable or changed')
 if(aiAllowanceEnforced())try{
  const mode=executionMode();if(e.billingMode&&mode!==e.billingMode)blockers.push('Payment mode changed from the frozen reservation environment');if(!mode)blockers.push('Deployed payment environment is required')
  else{const account=await accountFor(ctx,e.ownerKey,mode);if(!account||account.frozen||account.unresolved>0)blockers.push('Usage account is unfunded, frozen or awaiting billing review');else if(checkAvailableCredit&&account.prepaid+(account.expiresAt>Date.now()?account.included:0)<100)blockers.push('At least $1 available usage credit is required per AI request')}
 }catch(error){blockers.push(error instanceof Error?error.message:'Payment environment unavailable')}
 if(e.startedAt!==undefined&&Date.now()>=e.startedAt+g.limits.maxWallSeconds*1000)blockers.push('Original graph execution deadline reached')
 return blockers
}
export const list=query({args:{graphId:v.id('missionGraphs')},returns:v.array(legacyExecution),handler:async(ctx,a)=>{await ownedGraph(ctx,a.graphId);const rows=await ctx.db.query('graphExecutions').withIndex('by_graph',q=>q.eq('graphId',a.graphId)).order('desc').take(10);return rows.filter(e=>!isOllamaProvider(e.provider)) as (Doc<'graphExecutions'>&{provider:'cloudflare'|'groq'|'cerebras'})[]}})
export const listV2=query({args:{graphId:v.id('missionGraphs')},returns:v.array(execution),handler:async(ctx,a)=>{await ownedGraph(ctx,a.graphId);return ctx.db.query('graphExecutions').withIndex('by_graph',q=>q.eq('graphId',a.graphId)).order('desc').take(10)}})
export async function createGraphExecution(ctx:MutationCtx,a:{graphId:Id<'missionGraphs'>;executionKey:string;provider:GraphProvider;maxOutputTokens:number},origin?:{id:Id<'routingDecisions'>;digest:string}){
 if(!isOllamaProvider(a.provider))throw new ConvexError('Select one of the six Ollama Cloud models for new execution contracts')
 const g=await ownedGraph(ctx,a.graphId),m=await ctx.db.get(g.missionId)
 if(!m||m.ownerKey!==g.ownerKey)throw new ConvexError('Linked mission unavailable')
 const executionKey=bounded(a.executionKey,'Execution key',100),maxOutputTokens=whole(a.maxOutputTokens,'Maximum output tokens per worker',64,512),config=graphProviderConfiguration(a.provider),model=bounded(config.model,'Configured model',160),snapshot=missionSnapshot(m)
 secrets(snapshot)
 const contractDigest=await digest(canonical({graphDigest:g.designDigest,version:graphExecutionVersion,provider:a.provider,model,maxOutputTokens,missionSnapshot:snapshot,...(origin?{routingDecisionDigest:origin.digest}:{})})),rows=await ctx.db.query('graphExecutions').withIndex('by_graph',q=>q.eq('graphId',g._id)).take(10),old=rows.find(e=>e.executionKey===executionKey)
 if(old){if(old.contractDigest!==contractDigest||old.routingDecisionId!==origin?.id)throw new ConvexError('Execution key already has a different frozen contract');return old._id}
 if(rows.length>=10)throw new ConvexError('10 provider execution contracts per graph version; histories are retained')
 return ctx.db.insert('graphExecutions',{ownerKey:g.ownerKey,projectId:g.projectId,missionId:g.missionId,graphId:g._id,executionKey,version:graphExecutionVersion,contractDigest,...(origin?{routingDecisionId:origin.id,routingDecisionDigest:origin.digest}:{}),missionSnapshot:snapshot,provider:a.provider,model,maxOutputTokens,status:'active',reason:'Frozen; no provider request dispatched',createdAt:Date.now(),reservedTokens:0,reservedCalls:0,reportedTokens:0})
}
export const create=mutation({args:{graphId:v.id('missionGraphs'),executionKey:v.string(),provider:graphProvider,maxOutputTokens:v.number()},returns:v.id('graphExecutions'),handler:async(ctx,a)=>createGraphExecution(ctx,a)})
export const detailV2=query({args:{executionId:v.id('graphExecutions')},returns:v.object({execution,graph:v.object({_id:v.id('missionGraphs'),_creationTime:v.number(),...graphFields}),workers:v.array(worker),waves:v.array(wave),blockers:v.array(v.string()),ready:v.array(v.string()),asOf:v.number()}),handler:async(ctx,a)=>{
 const {e,g}=await owned(ctx,a.executionId),rows=await workers(ctx,e._id),ws=await waves(ctx,e._id),blockers=await prerequisites(ctx,e,g)
 const done=new Set(rows.filter(w=>w.status==='complete').map(w=>w.nodeKey))
 return{execution:e,graph:g,workers:rows,waves:ws,blockers,ready:e.status==='active'&&!ws.some(w=>w.status==='pending'||w.status==='review')?g.nodes.filter(n=>!rows.some(w=>w.nodeKey===n.key)&&n.dependsOn.every(k=>done.has(k))).slice(0,g.limits.parallelism).map(n=>n.key):[],asOf:Date.now()}
}})
export const detail=query({args:{executionId:v.id('graphExecutions')},returns:v.object({execution:legacyExecution,graph:v.object({_id:v.id('missionGraphs'),_creationTime:v.number(),...graphFields}),workers:v.array(worker),waves:v.array(wave),blockers:v.array(v.string()),ready:v.array(v.string()),asOf:v.number()}),handler:async(ctx,a)=>{
 const {e,g}=await owned(ctx,a.executionId)
 if(isOllamaProvider(e.provider))throw new ConvexError('This Ollama graph needs the updated model workspace')
 const rows=await workers(ctx,e._id),ws=await waves(ctx,e._id),blockers=await prerequisites(ctx,e,g)
 const done=new Set(rows.filter(w=>w.status==='complete').map(w=>w.nodeKey))
 return{execution:e as Doc<'graphExecutions'>&{provider:'cloudflare'|'groq'|'cerebras'},graph:g,workers:rows,waves:ws,blockers,ready:e.status==='active'&&!ws.some(w=>w.status==='pending'||w.status==='review')?g.nodes.filter(n=>!rows.some(w=>w.nodeKey===n.key)&&n.dependsOn.every(k=>done.has(k))).slice(0,g.limits.parallelism).map(n=>n.key):[],asOf:Date.now()}
}})
export const reserveWave=internalMutation({args:{executionId:v.id('graphExecutions'),waveKey:v.string()},returns:v.object({waveId:v.id('graphExecutionWaves'),workerIds:v.array(v.id('graphExecutionWorkers'))}),handler:async(ctx,a)=>{
 const {e,g}=await owned(ctx,a.executionId),waveKey=bounded(a.waveKey,'Execution wave key',80),ws=await waves(ctx,e._id),old=ws.find(w=>w.waveKey===waveKey)
 if(old)return{waveId:old._id,workerIds:(await ctx.db.query('graphExecutionWorkers').withIndex('by_wave',q=>q.eq('waveId',old._id)).take(4)).map(w=>w._id)}
 if(e.status!=='active'||ws.some(w=>w.status!=='complete'))throw new ConvexError('Execution has stopped or a previous wave needs recovery/review')
 const blockers=await prerequisites(ctx,e,g);if(blockers.length)throw new ConvexError(blockers.join('; '))
 for(const status of ['running','uncertain'] as const){if(await ctx.db.query('executionClaims').withIndex('by_missionId_and_scope_and_status',q=>q.eq('missionId',e.missionId).eq('scope','council').eq('status',status)).first())throw new ConvexError('Existing Council or graph work requires completion or recovery before another graph wave')}
 const rows=await workers(ctx,e._id),done=new Set(rows.filter(w=>w.status==='complete').map(w=>w.nodeKey)),ready=g.nodes.filter(n=>!rows.some(w=>w.nodeKey===n.key)&&n.dependsOn.every(k=>done.has(k))).slice(0,g.limits.parallelism)
 if(!ready.length)throw new ConvexError('No dependency-ready graph workers')
 const requests=ready.map(n=>({n,...planningPrompt(g,e,n,rows.filter(w=>n.dependsOn.includes(w.nodeKey)))})),reservedCalls=e.reservedCalls+requests.length,reservedTokens=e.reservedTokens+requests.reduce((s,r)=>s+r.allowance,0)
 if(reservedCalls>g.limits.maxSteps||reservedCalls>g.limits.maxToolCalls||reservedTokens>g.limits.maxTokens)throw new ConvexError('Graph admission allowances exceed frozen step, request or token budget; no wave reserved')
 const claimId=await ctx.db.insert('executionClaims',{missionId:e.missionId,scope:'council',workKey:'direct:graph:'+e._id+':'+waveKey,status:'running',createdAt:Date.now()})
 const waveId=await ctx.db.insert('graphExecutionWaves',{executionId:e._id,waveKey,claimId,status:'pending',createdAt:Date.now()}),workerIds:Id<'graphExecutionWorkers'>[]=[]
 for(const request of requests){
  await admitEvidence(ctx.db.query('providerInvocations').withIndex('by_owner',q=>q.eq('ownerKey',e.ownerKey)),'Provider invocation',500)
  const requestDigest=await digest(canonical({version:e.version,provider:e.provider,model:e.model,prompt:request.prompt,maxOutputTokens:e.maxOutputTokens,contractDigest:e.contractDigest}))
  const invocationId=await ctx.db.insert('providerInvocations',{ownerKey:e.ownerKey,missionId:e.missionId,stage:'graph-'+e._id+'-'+request.n.key,role:'graph-planning',startedAt:Date.now(),outcome:'pending',usageStatus:'pending',reports:[]})
  await reserveUsage(ctx,invocationId,e.ownerKey)
  workerIds.push(await ctx.db.insert('graphExecutionWorkers',{executionId:e._id,waveId,nodeKey:request.n.key,invocationId,prompt:request.prompt,requestDigest,tokenAllowance:request.allowance,status:'reserved',detail:'Reserved; not dispatched',createdAt:Date.now()}))
 }
 await ctx.db.patch(e._id,{reservedCalls,reservedTokens,startedAt:e.startedAt??Date.now(),...(aiAllowanceEnforced()?{billingMode:executionMode()!}:{}),reason:'Provider wave reserved; each worker may dispatch only once'})
 return{waveId,workerIds}
}})
export const take=internalMutation({args:{workerId:v.id('graphExecutionWorkers')},returns:v.union(v.null(),v.object({worker,execution})),handler:async(ctx,a)=>{
 const w=await ctx.db.get(a.workerId);if(!w)throw new ConvexError('Worker unavailable');const {e,g}=await owned(ctx,w.executionId)
 if(w.status!=='reserved')return null
 const wave=await ctx.db.get(w.waveId),claim=wave?await ctx.db.get(wave.claimId):null
 if(e.status!=='active'||wave?.status!=='pending'||claim?.status!=='running'||claim.workKey!=='direct:graph:'+e._id+':'+wave.waveKey)throw new ConvexError('Graph worker dispatch is fenced')
 const blockers=await prerequisites(ctx,e,g,false);if(blockers.length)throw new ConvexError(blockers.join('; '))
 const hold=e.billingMode?await ctx.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',w.invocationId).eq('mode',e.billingMode!)).unique():null
 if((aiAllowanceEnforced()||e.billingMode)&&(!hold||hold.ownerKey!==e.ownerKey||hold.status!=='held'))throw new ConvexError('Original graph usage reservation is unavailable')
 await ctx.db.patch(w._id,{status:'running',dispatchedAt:Date.now(),detail:'One-time dispatch claimed; uncertain work is never retried'})
 return{worker:w,execution:e}
}})
export const failed=internalMutation({args:{workerId:v.id('graphExecutionWorkers')},returns:v.null(),handler:async(ctx,a)=>{
 const w=await ctx.db.get(a.workerId);if(!w)throw new ConvexError('Worker unavailable');await owned(ctx,w.executionId)
 // A lost result acknowledgement may already have saved the answer. Recovery reads it first.
 if(w.status==='complete'||w.status==='blocked'||w.status==='insufficient')return null
 await ctx.db.patch(w._id,{status:'review',detail:'Provider dispatch, response or durable accounting could not be confirmed. No retry or fallback was made.'})
 return null
}})
export async function recoverWave(ctx:MutationCtx,id:Id<'graphExecutionWaves'>){
 const wave=await ctx.db.get(id);if(!wave)throw new ConvexError('Wave unavailable')
 const {e,g}=await owned(ctx,wave.executionId)
 if(wave.status==='complete')return null // Frozen receipts cannot alter a later wave or reopen final execution.
 const rows=await ctx.db.query('graphExecutionWorkers').withIndex('by_wave',q=>q.eq('waveId',id)).take(4),all=await workers(ctx,e._id)
 for(const w of rows){
  if(['complete','blocked','insufficient'].includes(w.status))continue
  const invocation=await ctx.db.get(w.invocationId),saved=await ctx.db.query('providerResults').withIndex('by_invocation',q=>q.eq('invocationId',w.invocationId)).unique()
  if(!saved||invocation?.outcome!=='succeeded')continue
  let status:Doc<'graphExecutionWorkers'>['status']='review',detail='Provider answer retained; accounting or model identity needs review',result:ReturnType<typeof parsePlanningResult>|undefined
  const reports=invocation.reports,receipt=reports[0],reportedTokens=reports.length===1?receipt.totalTokens:undefined
  const hold=e.billingMode?await ctx.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',w.invocationId).eq('mode',e.billingMode!)).unique():null
  const walletConfirmed=e.billingMode?hold?.status==='settled'&&hold.ownerKey===e.ownerKey:!aiAllowanceEnforced()&&isOllamaProvider(e.provider)
  const confirmed=walletConfirmed&&saved.requestDigest===w.requestDigest&&invocation.ownerKey===e.ownerKey&&invocation.missionId===e.missionId&&invocation.usageStatus==='recorded'&&invocation.observedReports===1&&reports.length===1&&receipt.provider===e.provider&&receipt.model===e.model&&reportedTokens!==undefined&&reportedTokens<=w.tokenAllowance&&receipt.completionTokens!==undefined&&receipt.completionTokens<=e.maxOutputTokens
  try{const n=g.nodes.find(n=>n.key===w.nodeKey)!;result=parsePlanningResult(saved.answer,n,['mission:'+g.missionId,...all.filter(x=>n.dependsOn.includes(x.nodeKey)).map(x=>'invocation:'+x.invocationId)]);if(confirmed){status=result.status;detail='Provider-backed unverified planning handoff; no external task completion established'}}catch{if(confirmed){status='blocked';detail='Provider answered, but the exact JSON handoff contract was invalid; no automatic repair or inference retry'}}
  await ctx.db.patch(w._id,{status,detail,...(result?{result}:{}),...(reportedTokens!==undefined?{reportedTokens}:{})})
 }
 const updated=await workers(ctx,e._id),current=updated.filter(w=>w.waveId===id),claim=await ctx.db.get(wave.claimId)
 const review=current.some(w=>w.status==='review'),pending=current.some(w=>w.status==='reserved'||w.status==='running')
 const reportedTokens=updated.reduce((s,w)=>s+(w.reportedTokens??0),0)
 if(review){
  await ctx.db.patch(wave._id,{status:'review'});await ctx.db.patch(e._id,{status:e.status==='stopped'?'stopped':'review',reason:e.status==='stopped'?e.reason:'A graph worker or its provider accounting requires review; no further inference authorized',reportedTokens})
  if(claim?.status==='running')await ctx.db.patch(claim._id,{status:'uncertain'})
 }else if(!pending){
  const halted=updated.find(w=>w.status==='blocked'||w.status==='insufficient'),blockers=await prerequisites(ctx,e,g,false)
  const status=e.status==='stopped'?'stopped':blockers.length?'review':halted?'stopped':updated.filter(w=>w.status==='complete').length===g.nodes.length?'complete':'active'
  const reason=e.status==='stopped'?e.reason:blockers.length?'Control changed during execution: '+blockers.join('; '):halted?halted.status+': '+halted.nodeKey:status==='complete'?'Planning graph complete; human review required; mission execution status unchanged':'Wave complete; next wave requires an explicit request'
  await ctx.db.patch(wave._id,{status:'complete'});await ctx.db.patch(e._id,{status,reason,reportedTokens})
  if(claim&&(claim.status==='running'||claim.status==='uncertain'))await ctx.db.patch(claim._id,{status:'complete',result:JSON.stringify({waveId:id,status,reason})})
 }
 return null
}
export const recover=mutation({args:{waveId:v.id('graphExecutionWaves')},returns:v.null(),handler:async(ctx,a)=>recoverWave(ctx,a.waveId)})
export const settle=internalMutation({args:{waveId:v.id('graphExecutionWaves')},returns:v.null(),handler:async(ctx,a)=>recoverWave(ctx,a.waveId)})
export const stop=mutation({args:{executionId:v.id('graphExecutions'),reason:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const {e}=await owned(ctx,a.executionId),reason=bounded(a.reason,'Stop explanation',1200);secrets(reason)
 if(e.status==='stopped'){if(e.reason!==reason)throw new ConvexError('Stop reason is frozen');return null}
 if(e.status==='complete')throw new ConvexError('Completed planning execution is immutable')
 await ctx.db.patch(e._id,{status:'stopped',reason});return null
}})
