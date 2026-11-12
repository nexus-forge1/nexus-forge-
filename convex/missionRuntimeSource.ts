import {ConvexError} from 'convex/values'
import type {QueryCtx,MutationCtx} from './_generated/server'
import {requireOperator} from './permissions'
import {ownedProject} from './studio'
import {canonical} from './evaluationModel'
import {digest,secrets} from './studioModel'
import {graphExecutionVersion,planningPrompt,parsePlanningResult} from './graphExecutionModel'
import {graphRuleVersion,validateGraph} from './missionGraphModel'
import {routingScope} from './outcomeRoutingEvidence'
import {runtimeVersion,type RuntimeSource,type RuntimeSnapshot,type RuntimeHandoff} from './missionRuntimeModel'
type Ctx=QueryCtx|MutationCtx
export async function captureRuntime(ctx:Ctx,source:RuntimeSource){
 const ownerKey=await requireOperator(ctx),record=await ctx.db.get(source.id)
 if(!record||record.ownerKey!==ownerKey)throw new ConvexError('Runtime source unavailable')
 const g=await ctx.db.get(record.graphId)
 if(!g||g.ownerKey!==ownerKey)throw new ConvexError('Runtime graph unavailable')
 await ownedProject(ctx,g.projectId)
 const mission=await ctx.db.get(g.missionId)
 if(!mission||mission.ownerKey!==ownerKey)throw new ConvexError('Runtime origin mission unavailable')
 const {graphKey,title,objective,missionType,nodes,limits}=g
 const design=validateGraph({graphKey,title,objective,missionType,nodes,limits})
 if(g.ruleVersion!==graphRuleVersion||await digest(canonical({...design,ruleVersion:g.ruleVersion}))!==g.designDigest)throw new ConvexError('Frozen graph digest or rule version is inconsistent')
 const snapshot:RuntimeSnapshot={version:runtimeVersion,scope:routingScope(),source,sourceStatus:record.status,sourceReason:'',graph:{id:g._id,digest:g.designDigest,title:g.title,nodes:g.nodes,limits:g.limits},missionId:g.missionId,missionContract:null,contractDigest:null,events:[],handoffs:[]}
 if(source.kind==='provider'){
  const e=await ctx.db.get(source.id)
  if(!e||e.graphId!==g._id||e.ownerKey!==ownerKey||e.projectId!==g.projectId||e.missionId!==g.missionId)throw new ConvexError('Provider runtime origin mismatch')
  snapshot.missionContract=e.missionSnapshot;snapshot.contractDigest=e.contractDigest;snapshot.sourceReason=e.reason
  snapshot.events.push({key:'contract:'+e._id,at:e.createdAt,status:e.status,detail:'Frozen '+e.provider+' / '+e.model+' planning contract; status alone is not completion evidence'})
  const expected=await digest(canonical({graphDigest:g.designDigest,version:e.version,provider:e.provider,model:e.model,maxOutputTokens:e.maxOutputTokens,missionSnapshot:e.missionSnapshot,...(e.routingDecisionDigest?{routingDecisionDigest:e.routingDecisionDigest}:{})}))
  const contractOK=e.version===graphExecutionVersion&&e.contractDigest===expected
  const ws=await ctx.db.query('graphExecutionWaves').withIndex('by_execution',q=>q.eq('executionId',e._id)).take(11),workers=await ctx.db.query('graphExecutionWorkers').withIndex('by_execution',q=>q.eq('executionId',e._id)).take(11)
  if(ws.length>10||workers.length>10)throw new ConvexError('Runtime population exceeds bounded graph history')
  const populationOK=workers.length===e.reservedCalls&&new Set(workers.map(w=>w.nodeKey)).size===workers.length&&workers.every(w=>g.nodes.some(n=>n.key===w.nodeKey))
  const confirmedWaves=new Set<string>()
  for(const wave of ws){
   const claim=await ctx.db.get(wave.claimId),valid=wave.status==='complete'&&claim?.status==='complete'&&claim.scope==='council'&&claim.missionId===e.missionId&&claim.workKey==='direct:graph:'+e._id+':'+wave.waveKey
   if(valid)confirmedWaves.add(wave._id)
   snapshot.events.push({key:'wave:'+wave._id,at:wave.createdAt,status:valid?'confirmed':wave.status,detail:valid?'Durable wave fence complete':'Wave or execution fence is unresolved'})
  }
  for(const node of g.nodes){
   const w=workers.find(w=>w.nodeKey===node.key)
   if(!w){snapshot.handoffs.push({nodeKey:node.key,state:'missing',result:null,reason:'No recorded provider worker; replay does not execute missing work',provenance:'provider-receipt',refs:[]});continue}
   const invocation=await ctx.db.get(w.invocationId),saved=await ctx.db.query('providerResults').withIndex('by_invocation',q=>q.eq('invocationId',w.invocationId)).unique(),hold=e.billingMode?await ctx.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',w.invocationId).eq('mode',e.billingMode!)).unique():null
   let state:RuntimeHandoff['state']='unresolved',result:RuntimeHandoff['result']=null,reason='Exact response, named-model usage, accounting or wave fence is unresolved'
   const parents=workers.filter(p=>node.dependsOn.includes(p.nodeKey))
   let requestOK=false,refs:string[]=[]
   try{
    const request=planningPrompt(g,e,node,parents);refs=request.refs
    const expectedRequest=await digest(canonical({version:e.version,provider:e.provider,model:e.model,prompt:w.prompt,maxOutputTokens:e.maxOutputTokens,contractDigest:e.contractDigest}))
    requestOK=parents.length===node.dependsOn.length&&parents.every(p=>p.status==='complete')&&request.prompt===w.prompt&&request.allowance===w.tokenAllowance&&expectedRequest===w.requestDigest
   }catch{/* Remain unresolved; never repair a source by inventing inputs. */}
   const reports=invocation?.reports??[],usage=reports[0]
   const receiptOK=contractOK&&populationOK&&requestOK&&confirmedWaves.has(w.waveId)&&e.billingMode===snapshot.scope&&invocation?.ownerKey===ownerKey&&invocation.missionId===e.missionId&&invocation.stage==='graph-'+e._id+'-'+w.nodeKey&&invocation.role==='graph-planning'&&invocation.outcome==='succeeded'&&invocation.usageStatus==='recorded'&&invocation.observedReports===1&&reports.length===1&&usage?.provider===e.provider&&usage.model===e.model&&Number.isSafeInteger(usage.totalTokens)&&usage.totalTokens!>=0&&usage.totalTokens!<=w.tokenAllowance&&Number.isSafeInteger(usage.completionTokens)&&usage.completionTokens!>=0&&usage.completionTokens!<=e.maxOutputTokens&&saved?.requestDigest===w.requestDigest&&hold?.ownerKey===ownerKey&&hold.status==='settled'&&Number.isSafeInteger(hold.charged)&&hold.charged!>=0&&hold.charged!<=hold.reserved&&w.dispatchedAt!==undefined&&invocation.finishedAt!==undefined&&invocation.finishedAt>=w.dispatchedAt&&invocation.finishedAt<=Date.now()
   if(receiptOK&&saved){
    try{
     const parsed=parsePlanningResult(saved.answer,node,refs)
     if(canonical(parsed)===canonical(w.result)&&parsed.status===w.status){state='accepted';result=parsed;reason='Exact stored answer, typed handoff, usage, settled charge and wave fence match; semantic truth unverified'}
    }catch{if(w.status==='blocked'&&w.result===undefined){state='invalid';reason='Confirmed stored response failed its original typed contract'}}
   }
   snapshot.handoffs.push({nodeKey:node.key,state,result,reason,provenance:'provider-receipt',refs})
   snapshot.events.push({key:'worker:'+w._id,at:w.dispatchedAt??null,status:state,detail:reason+' · invocation '+w.invocationId+' · request '+w.requestDigest+(saved?' · answer SHA-256 '+await digest(saved.answer):'')})
  }
 }else{
  const r=await ctx.db.get(source.id)
  if(!r||r.graphId!==g._id||r.projectId!==g.projectId||r.ownerKey!==ownerKey)throw new ConvexError('Rehearsal runtime origin mismatch')
  snapshot.contractDigest=r.startDigest;snapshot.sourceReason=r.stopReason
  snapshot.events.push({key:'rehearsal:'+r._id,at:r.startedAt,status:r.status,detail:r.basis+' rehearsal only; historical mission text was not frozen by this runtime'})
  const batches=await ctx.db.query('missionGraphBatches').withIndex('by_run',q=>q.eq('runId',r._id)).take(11)
  if(batches.length>10)throw new ConvexError('Rehearsal history exceeds bounded graph population')
  let valid=r.startDigest===await digest(canonical({graphId:r.graphId,runKey:r.runKey,basis:r.basis,parentRunId:r.parentRunId??null,replanReason:r.replanReason}))
  const done=new Set<string>(),seen=new Set<string>(),all=batches.flatMap(b=>b.results)
  for(const batch of batches){
   if(batch.ownerKey!==ownerKey||batch.payloadDigest!==await digest(canonical(batch.results))||batch.results.length>g.limits.parallelism)valid=false
   for(const result of batch.results){
    const n=g.nodes.find(n=>n.key===result.nodeKey)
    if(!n||seen.has(result.nodeKey)||n.outputKind!==result.outputKind||n.dependsOn.some(k=>!done.has(k))||result.evidenceRefs.length>6||new Set(result.evidenceRefs).size!==result.evidenceRefs.length||result.status==='complete'&&['verification','decision'].includes(result.outputKind)&&!result.evidenceRefs.length)valid=false
    seen.add(result.nodeKey)
   }
   batch.results.filter(x=>x.status==='complete').forEach(x=>done.add(x.nodeKey))
   snapshot.events.push({key:'batch:'+batch._id,at:batch.createdAt,status:'recorded',detail:r.basis+' supplied handoffs · digest '+batch.payloadDigest})
  }
  for(const node of g.nodes){
   const result=all.find(x=>x.nodeKey===node.key)
   snapshot.handoffs.push({nodeKey:node.key,state:!valid?'unresolved':result?'accepted':'missing',result:valid&&result?{status:result.status,outputKind:result.outputKind,summary:result.summary,evidenceRefs:result.evidenceRefs}:null,reason:!valid?'Rehearsal digest, dependency or population mismatch':result?'Saved '+r.basis+' handoff; not provider execution evidence':'No recorded handoff; replay cannot invent one',provenance:r.basis,refs:result?.evidenceRefs??[]})
  }
 }
 const encoded=canonical(snapshot)
 if(new TextEncoder().encode(encoded).length>131072)throw new ConvexError('Runtime checkpoint exceeds 128 KiB; source history retained')
 secrets(encoded)
 return{ownerKey,projectId:g.projectId,graphId:g._id,snapshot:encoded,sourceDigest:await digest(encoded),asOf:Date.now()}
}
