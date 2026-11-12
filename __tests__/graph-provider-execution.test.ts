// @vitest-environment edge-runtime
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api,internal} from '../convex/_generated/api'
import {graphTemplate} from '../src/lib/mission-graph-templates'
import type {GraphLimits} from '../convex/missionGraphModel'
import {parsePlanningResult} from '../convex/graphExecutionModel'
import type {Id} from '../convex/_generated/dataModel'
const modules=import.meta.glob('../convex/**/*.ts'),clock=Date.UTC(2026,9,19,5)
type FixtureOptions={missionType?:'research'|'build';credit?:number;limits?:Partial<GraphLimits>}
let fetchMock:ReturnType<typeof vi.fn>
function answer(input:RequestInfo|URL,init?:RequestInit){
 const body=JSON.parse(String(init?.body)),prompt=JSON.parse(body.messages[0].content)
 return new Response(JSON.stringify({model:body.model,choices:[{message:{content:JSON.stringify({status:'complete',outputKind:prompt.contract.outputKind,summary:'Controlled model fixture planning output; no external work or fact verification.',evidenceRefs:prompt.allowedRefs.slice(0,6)})}}],usage:{prompt_tokens:50,completion_tokens:20,total_tokens:70, cost:0}}),{status:200,headers:{'Content-Type':'application/json'}})
}
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock)
 vi.stubEnv('CONVEX_CLOUD_URL','https://quick-rabbit-810.eu-west-1.convex.cloud');vi.stubEnv('VITE_STRIPE_MODE','test')
 vi.stubEnv('GROQ_API_KEY','controlled-fixture-not-a-real-provider-key');vi.stubEnv('GROQ_MODEL','openai/gpt-oss-20b')
 fetchMock=vi.fn(answer);vi.stubGlobal('fetch',fetchMock)
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals()})
async function fixture(options:FixtureOptions={}){
 const t=convexTest(schema,modules),users=await t.run(async c=>({owner:await c.db.insert('users',{email:'graph-provider-owner@example.test'}),other:await c.db.insert('users',{email:'graph-provider-other@example.test'})}))
 const owner=t.withIdentity({subject:users.owner}),other=t.withIdentity({subject:users.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Provider graph fixture',brief:'Rehearse provider planning receipts.',audience:'Controlled test',criteria:['No repeated paid inference'],budget:25})
 const project=await owner.mutation(api.studio.startProject,{templateId,title:'Provider graph fixture project'})
 const accountId=await t.run(async c=>{
  await c.db.patch(project.missionId,{approved:true,status:'running'})
  await c.db.insert('portfolioDecisions',{missionId:project.missionId,priorityRank:1,action:'test-planning',decision:'approve',createdAt:clock})
  return c.db.insert('billingAccounts',{ownerKey:String(users.owner),mode:'test',prepaid:options.credit??2000,included:0,expiresAt:0,held:0,unresolved:0,frozen:false})
 })
 const missionType=options.missionType??'research'
 const graphId=await owner.mutation(api.missionGraphs.create,{projectId:project.projectId,expectedRevision:0,graphKey:'provider-fixture',title:'Controlled provider graph',objective:'Produce bounded planning handoffs, not actual artifact or deployment completion.',missionType,nodes:graphTemplate(missionType),limits:{maxSteps:20,maxToolCalls:20,maxTokens:100000,maxWallSeconds:3600,maxReplans:0,parallelism:2,...options.limits}})
 const createArgs={graphId,executionKey:'controlled-provider-run',provider:'groq' as const,maxOutputTokens:256},executionId=await owner.mutation(api.graphExecutionData.create,createArgs)
 return{t,owner,other,...project,graphId,executionId,createArgs,accountId,users}
}
describe('provider-backed planning graphs',()=>{
 it('freezes exact launch contracts without dispatch, charges or approvals',async()=>{
  const f=await fixture()
  expect(await f.owner.mutation(api.graphExecutionData.create,f.createArgs)).toBe(f.executionId)
  await expect(f.owner.mutation(api.graphExecutionData.create,{...f.createArgs,maxOutputTokens:512})).rejects.toThrow(/different frozen/)
  expect(fetchMock).not.toHaveBeenCalled()
  for(const table of ['providerInvocations','billingHolds','executionClaims'] as const)expect(await f.t.run(c=>c.db.query(table).collect())).toEqual([])
 })
 it('isolates contract, wave, recovery and stop operations by owner',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.graphExecutionData.list,{graphId:f.graphId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.graphExecutionData.detail,{executionId:f.executionId})).rejects.toThrow(/unavailable/)
  await expect(f.other.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'foreign'})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.graphExecutionData.stop,{executionId:f.executionId,reason:'Foreign stop'})).rejects.toThrow(/unavailable/)
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'first'})
  const wave=(await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId})).waves[0]
  await expect(f.other.mutation(api.graphExecutionData.recover,{waveId:wave._id})).rejects.toThrow(/unavailable/)
 })
 it('executes actual action code through accounted HTTP fixtures, immutable dependency waves and no-replay retries',async()=>{
  const f=await fixture()
  const a={executionId:f.executionId,waveKey:'research'},id=await f.owner.action(api.graphExecution.runWave,a)
  expect(await f.owner.action(api.graphExecution.runWave,a)).toBe(id);expect(fetchMock).toHaveBeenCalledTimes(1)
  let d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId})
  expect(d.ready).toEqual(['audit']);expect(d.workers[0]).toMatchObject({status:'complete',reportedTokens:70})
  for(const key of ['audit','decision'])await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:key})
  d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId})
  expect(d.execution).toMatchObject({status:'complete',reservedCalls:3,reportedTokens:210});expect(d.ready).toEqual([])
  expect(fetchMock).toHaveBeenCalledTimes(3)
  const invocations=await f.t.run(c=>c.db.query('providerInvocations').collect());expect(invocations.every(i=>i.outcome==='succeeded'&&i.usageStatus==='recorded')).toBe(true)
  const holds=await f.t.run(c=>c.db.query('billingHolds').collect());expect(holds).toHaveLength(3);expect(holds.every(h=>h.status==='settled'&&h.charged===0)).toBe(true)
  expect(await f.t.run(c=>c.db.get(f.accountId))).toMatchObject({held:0,prepaid:2000})
  expect(await f.t.run(c=>c.db.get(f.missionId))).toMatchObject({approved:true,status:'running',completion:0})
  expect(await f.t.run(c=>c.db.query('agentRuns').collect())).toEqual([])
 })
 it('atomically reserves independent branches and rejects the entire wave when aggregate wallet credit is short',async()=>{
  const f=await fixture({missionType:'build',credit:100})
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'plan'})
  // $0 reported cost returns the first reservation; the two-worker wave needs $2.
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'branches'})).rejects.toThrow(/credit/)
  let d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.execution.reservedCalls).toBe(1);expect(d.waves).toHaveLength(1);expect(fetchMock).toHaveBeenCalledTimes(1)
  await f.t.run(c=>c.db.patch(f.accountId,{prepaid:200}))
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'branches'})
  d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.workers.filter(w=>w.waveId===d.waves[1]._id).map(w=>w.nodeKey)).toEqual(['architecture','ux']);expect(d.ready).toEqual(['build']);expect(fetchMock).toHaveBeenCalledTimes(3)
 })
 it('refuses unapproved, changed, cancelled and portfolio-rejected missions before any reservation',async()=>{
  for(const change of [{approved:false},{mission:'Changed frozen brief'},{status:'cancelled' as const}]){
   const f=await fixture();await f.t.run(c=>c.db.patch(f.missionId,change))
   await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'blocked'})).rejects.toThrow()
   expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
  }
  const f=await fixture();await f.t.run(c=>c.db.insert('portfolioDecisions',{missionId:f.missionId,priorityRank:1,action:'defer',decision:'reject',createdAt:clock+1}))
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'rejected'})).rejects.toThrow(/portfolio/)
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('preserves dependency/incident checks and Council execution fences',async()=>{
  const f=await fixture(),blocked=await f.owner.mutation(api.studio.startProject,{templateId:await f.t.run(async c=>(await c.db.get(f.projectId))!.templateId),title:'Blocking fixture'})
  await f.owner.mutation(api.orchestration.addDependency,{missionId:f.missionId,dependsOnMissionId:blocked.missionId,kind:'blocks'})
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'dependency'})).rejects.toThrow(/prerequisite/)
  await f.t.run(c=>c.db.patch(blocked.missionId,{status:'complete'}))
  const claimId=await f.t.run(c=>c.db.insert('executionClaims',{missionId:f.missionId,scope:'council',workKey:'direct:other-fixture',status:'uncertain',createdAt:clock}))
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'claim'})).rejects.toThrow(/Existing Council/)
  await f.t.run(c=>c.db.patch(claimId,{status:'complete',result:'{}'}))
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'admitted'})
  expect(fetchMock).toHaveBeenCalledTimes(1)
 })
 it('keeps production payments-off and test-wallet exclusion intact',async()=>{
  const f=await fixture()
  vi.stubEnv('CONVEX_CLOUD_URL','https://tame-rat-826.eu-west-1.convex.cloud')
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'live'})).rejects.toThrow(/Real payments are not activated/)
  expect(fetchMock).not.toHaveBeenCalled();expect(await f.t.run(c=>c.db.query('billingHolds').collect())).toEqual([])
 })
 it('enforces zero request budgets and conservative token admission before spending',async()=>{
  for(const limits of [{maxToolCalls:0},{maxTokens:1}]){
   const f=await fixture({limits})
   await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'over'})).rejects.toThrow(/allowances/)
   expect(await f.t.run(c=>c.db.query('billingHolds').collect())).toEqual([])
  }
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('dispatches a proven unstarted reservation once and refuses a second take',async()=>{
  const f=await fixture(),a={executionId:f.executionId,waveKey:'interrupted-before-dispatch'},reserved=await f.owner.mutation(internal.graphExecutionData.reserveWave,a)
  expect(fetchMock).not.toHaveBeenCalled()
  await f.owner.action(api.graphExecution.runWave,a);expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(await f.owner.mutation(internal.graphExecutionData.take,{workerId:reserved.workerIds[0]})).toBeNull()
 })
 it('never dispatches a request again after an uncertain transport outcome',async()=>{
  const f=await fixture();fetchMock.mockRejectedValue(new Error('Controlled connection loss after a potentially accepted request'))
  const a={executionId:f.executionId,waveKey:'uncertain'},waveId=await f.owner.action(api.graphExecution.runWave,a)
  expect(await f.owner.action(api.graphExecution.runWave,a)).toBe(waveId)
  await f.owner.mutation(api.graphExecutionData.recover,{waveId})
  const d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId})
  expect(d.execution.status).toBe('review');expect(d.workers[0].status).toBe('review');expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(await f.t.run(c=>c.db.get(d.waves[0].claimId))).toMatchObject({status:'uncertain'})
  expect(await f.t.run(c=>c.db.get(d.workers[0].invocationId))).toMatchObject({outcome:'pending'})
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'unsafe-retry'})).rejects.toThrow(/recovery\/review/)
 })
 it('recovers a stored successful answer after dispatch acknowledgement loss without HTTP replay',async()=>{
  const f=await fixture(),reserved=await f.owner.mutation(internal.graphExecutionData.reserveWave,{executionId:f.executionId,waveKey:'lost-ack'})
  const taken=await f.owner.mutation(internal.graphExecutionData.take,{workerId:reserved.workerIds[0]});expect(taken).not.toBeNull()
  const w=taken!.worker,prompt=JSON.parse(w.prompt),answer=JSON.stringify({status:'complete',outputKind:'evidence',summary:'Controlled persisted planning answer',evidenceRefs:prompt.allowedRefs})
  await f.owner.mutation(internal.manifestIntelligence.recordProviderUsageInternal,{ownerKey:String(f.users.owner),invocationId:w.invocationId,reportOrdinal:1,provider:'groq',model:'openai/gpt-oss-20b',promptTokens:50,completionTokens:20,totalTokens:70,reportedCostUsd:0,capturedAt:clock})
  await f.owner.mutation(internal.providerRecovery.complete,{invocationId:w.invocationId,requestDigest:w.requestDigest,answer,observedReports:1})
  await f.owner.mutation(internal.graphExecutionData.failed,{workerId:w._id})
  await f.owner.mutation(api.graphExecutionData.recover,{waveId:reserved.waveId})
  const d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.workers[0].status).toBe('complete');expect(d.ready).toEqual(['audit']);expect(fetchMock).not.toHaveBeenCalled()
  expect(await f.t.run(c=>c.db.get(d.waves[0].claimId))).toMatchObject({status:'complete'})
 })
 it('retains invalid handoffs and missing or mismatched usage as stop/review evidence',async()=>{
  for(const mode of ['invalid-json','missing-usage','model-mismatch','over-allowance'] as const){
   const f=await fixture()
   fetchMock.mockImplementation((url,init)=>{
    const good=answer(url,init)
    return good.json().then(payload=>{if(mode==='invalid-json')payload.choices[0].message.content='Not JSON';if(mode==='missing-usage')delete payload.usage;if(mode==='model-mismatch')payload.model='unexpected-model';if(mode==='over-allowance')payload.usage.total_tokens=99999;return new Response(JSON.stringify(payload),{status:200})})
   })
   await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:mode})
   const d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId})
   expect(d.execution.status).toBe(mode==='invalid-json'?'stopped':'review')
   expect(d.ready).toEqual([]);expect(await f.t.run(c=>c.db.query('providerResults').collect())).toHaveLength(1)
  }
 })
 it('stops after valid insufficient output and never treats planning completion as external evidence',async()=>{
  const f=await fixture();fetchMock.mockImplementation((url,init)=>answer(url,init).json().then(payload=>{const value=JSON.parse(payload.choices[0].message.content);value.status='insufficient';value.summary='No actual source or test evidence is available.';payload.choices[0].message.content=JSON.stringify(value);return new Response(JSON.stringify(payload),{status:200})}))
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'insufficient'})
  const d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.execution).toMatchObject({status:'stopped',reason:'insufficient: research'});expect(d.ready).toEqual([])
 })
 it('fences model/configuration drift, elapsed deadlines and stop requests before dispatch',async()=>{
  const f=await fixture(),reserved=await f.owner.mutation(internal.graphExecutionData.reserveWave,{executionId:f.executionId,waveKey:'queued'})
  vi.stubEnv('GROQ_MODEL','changed-model')
  await expect(f.owner.mutation(internal.graphExecutionData.take,{workerId:reserved.workerIds[0]})).rejects.toThrow(/model/)
  vi.stubEnv('GROQ_MODEL','openai/gpt-oss-20b');vi.setSystemTime(clock+3600000)
  await expect(f.owner.mutation(internal.graphExecutionData.take,{workerId:reserved.workerIds[0]})).rejects.toThrow(/deadline/)
  vi.setSystemTime(clock+1);await f.owner.mutation(api.graphExecutionData.stop,{executionId:f.executionId,reason:'Stop queued work'})
  await expect(f.owner.mutation(internal.graphExecutionData.take,{workerId:reserved.workerIds[0]})).rejects.toThrow(/fenced/)
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('deduplicates concurrent exact waves before any second HTTP request',async()=>{
  const f=await fixture(),args={executionId:f.executionId,waveKey:'concurrent'}
  const results=await Promise.all([f.owner.action(api.graphExecution.runWave,args),f.owner.action(api.graphExecution.runWave,args)])
  expect(results[0]).toBe(results[1]);expect(fetchMock).toHaveBeenCalledTimes(1)
  const d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.workers).toHaveLength(1);expect(d.execution.reservedCalls).toBe(1)
 })
 it('does not fall back or retry a named provider rejection',async()=>{
  const f=await fixture();fetchMock.mockResolvedValue(new Response(JSON.stringify({error:'Controlled quota rejection'}),{status:429}))
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'rejected-provider'})
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.execution.status).toBe('review');expect(d.workers[0].status).toBe('review')
 })
 it('keeps completed wave recovery immutable while later work is pending and after the final deadline',async()=>{
  const f=await fixture(),first=await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'research'})
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'audit'})
  await f.owner.mutation(internal.graphExecutionData.reserveWave,{executionId:f.executionId,waveKey:'decision'})
  await f.owner.mutation(api.graphExecutionData.recover,{waveId:first})
  let d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId})
  expect(d.execution.status).toBe('active');expect(d.workers.find(w=>w.nodeKey==='decision')!.status).toBe('reserved')
  await f.owner.action(api.graphExecution.runWave,{executionId:f.executionId,waveKey:'decision'})
  vi.setSystemTime(clock+3600000)
  await f.owner.mutation(api.graphExecutionData.recover,{waveId:first})
  d=await f.owner.query(api.graphExecutionData.detail,{executionId:f.executionId});expect(d.execution.status).toBe('complete');expect(fetchMock).toHaveBeenCalledTimes(3)
 })
 it('rejects fabricated references, unknown fields and unsupported output types',()=>{
  const n=graphTemplate('research')[1],good={status:'complete',outputKind:'verification',summary:'Controlled review',evidenceRefs:['invocation:known']}
  expect(parsePlanningResult(JSON.stringify(good),n,['invocation:known']).status).toBe('complete')
  for(const change of [{evidenceRefs:['https://invented.test']},{outputKind:'decision'},{evidenceRefs:[]},{extra:true},{summary:' '.repeat(5)}])expect(()=>parsePlanningResult(JSON.stringify({...good,...change}),n,['invocation:known'])).toThrow()
 })
})
