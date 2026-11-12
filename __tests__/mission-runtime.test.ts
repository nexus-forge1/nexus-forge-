// @vitest-environment edge-runtime
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import type {Id} from '../convex/_generated/dataModel'
import type {RuntimeSource,RuntimeSnapshot,Replacement} from '../convex/missionRuntimeModel'
import {graphTemplate} from '../src/lib/mission-graph-templates'
const modules=import.meta.glob('../convex/**/*.ts')
let fetchMock:ReturnType<typeof vi.fn>
beforeEach(()=>{
 vi.stubEnv('CONVEX_CLOUD_URL','https://quick-rabbit-810.eu-west-1.convex.cloud');vi.stubEnv('VITE_STRIPE_MODE','test')
 vi.stubEnv('GROQ_API_KEY','controlled-not-real');vi.stubEnv('GROQ_MODEL','openai/gpt-oss-20b')
 fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>{
  const request=JSON.parse(String(init?.body)),prompt=JSON.parse(request.messages[0].content)
  return new Response(JSON.stringify({model:request.model,choices:[{message:{content:JSON.stringify({status:'complete',outputKind:prompt.contract.outputKind,summary:'Controlled provider HTTP fixture, unverified planning only.',evidenceRefs:prompt.allowedRefs.slice(0,6)})}}],usage:{prompt_tokens:50,completion_tokens:20,total_tokens:70,cost:0}}),{status:200})
 });vi.stubGlobal('fetch',fetchMock)
})
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers()})
async function fixture(provider=false){
 const t=convexTest(schema,modules),users=await t.run(async c=>({owner:await c.db.insert('users',{email:'runtime-owner@example.test'}),other:await c.db.insert('users',{email:'runtime-other@example.test'})})),owner=t.withIdentity({subject:users.owner}),other=t.withIdentity({subject:users.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Runtime fixture',brief:'Diagnose bounded offline planning handoffs.',audience:'Controlled tests',criteria:['No replayed external action'],budget:25}),project=await owner.mutation(api.studio.startProject,{templateId,title:'Runtime test project'})
 const nodes=graphTemplate('research'),graphId=await owner.mutation(api.missionGraphs.create,{projectId:project.projectId,expectedRevision:0,graphKey:'runtime-fixture',title:'Runtime controlled graph',objective:'Diagnose exact planning handoffs',missionType:'research',nodes,limits:{maxSteps:20,maxToolCalls:20,maxTokens:100000,maxWallSeconds:3600,maxReplans:3,parallelism:2}})
 let source:RuntimeSource,runId:Id<'missionGraphRuns'>|undefined,executionId:Id<'graphExecutions'>|undefined
 if(provider){
  await t.run(async c=>{await c.db.patch(project.missionId,{approved:true,status:'running'});await c.db.insert('portfolioDecisions',{missionId:project.missionId,priorityRank:1,action:'controlled-planning',decision:'approve',createdAt:Date.now()});await c.db.insert('billingAccounts',{ownerKey:String(users.owner),mode:'test',prepaid:2000,included:0,expiresAt:0,held:0,unresolved:0,frozen:false})})
  executionId=await owner.mutation(api.graphExecutionData.create,{graphId,executionKey:'provider-source',provider:'groq',maxOutputTokens:256})
  for(const node of nodes)await owner.action(api.graphExecution.runWave,{executionId,waveKey:node.key})
  source={kind:'provider',id:executionId!}
 }else{
  runId=await owner.mutation(api.missionGraphs.start,{graphId,runKey:'recorded-source',basis:'controlled_fixture',replanReason:''})
  for(const node of nodes)await owner.mutation(api.missionGraphs.recordWave,{runId,batchKey:node.key,results:[{nodeKey:node.key,status:'complete',outputKind:node.outputKind,summary:'Retained controlled fixture '+node.key,evidenceRefs:['fixture:recorded-'+node.key],toolCalls:0,tokens:1}]})
  source={kind:'rehearsal',id:runId!}
 }
 const preview=await owner.query(api.missionRuntime.preview,{source}),checkpointId=await owner.mutation(api.missionRuntime.capture,{source,checkpointKey:'baseline-checkpoint',expectedSourceDigest:preview.sourceDigest})
 let sequence=0
 async function start(overrides:Replacement[]=[],parentReplayId?:Id<'runtimeReplays'>,key?:string){
  return owner.mutation(api.missionRuntime.start,{checkpointId,replayKey:key??'branch-'+(++sequence),label:'Controlled diagnostic branch',rationale:'Review recorded fixture handoffs offline only.',overrides,...(parentReplayId?{parentReplayId}:{})})
 }
 async function detail(replayId:Id<'runtimeReplays'>){return owner.query(api.missionRuntime.replayDetail,{replayId})}
 async function control(replayId:Id<'runtimeReplays'>,operation:'advance'|'pause'|'resume'='advance'){
  const d=await detail(replayId);return owner.mutation(api.missionRuntime.control,{replayId,eventKey:operation+'-'+d.replay.revision,expectedRevision:d.replay.revision,operation,reason:'Controlled offline replay control only'})
 }
 const replacement=(key:string):Replacement=>{const node=nodes.find(n=>n.key===key)!;return{nodeKey:key,answer:JSON.stringify({status:'complete',outputKind:node.outputKind,summary:'Operator supplied alternative '+key,evidenceRefs:['mission:'+project.missionId,...node.dependsOn.map(k=>'replay:'+k)]})}}
 return{t,owner,other,users,...project,graphId,nodes,source,runId,executionId,preview,checkpointId,start,detail,control,replacement}
}
describe('durable recorded planning runtime',()=>{
 it('captures exact immutable fixture evidence and preserves it after source changes',async()=>{
  const f=await fixture(),d=await f.owner.query(api.missionRuntime.detail,{checkpointId:f.checkpointId})
  expect(d.snapshot.handoffs.every(h=>h.state==='accepted'&&h.provenance==='controlled_fixture')).toBe(true);expect(d.snapshot.missionContract).toBeNull()
  expect(await f.owner.mutation(api.missionRuntime.capture,{source:f.source,checkpointKey:'baseline-checkpoint',expectedSourceDigest:f.preview.sourceDigest})).toBe(f.checkpointId)
  await f.t.run(c=>c.db.patch(f.runId!,{stopReason:'Later source note'}))
  expect((await f.owner.query(api.missionRuntime.preview,{source:f.source})).sourceDigest).not.toBe(f.preview.sourceDigest)
  expect((await f.owner.query(api.missionRuntime.detail,{checkpointId:f.checkpointId})).checkpoint).toEqual(d.checkpoint)
  await expect(f.owner.mutation(api.missionRuntime.capture,{source:f.source,checkpointKey:'new-stale',expectedSourceDigest:f.preview.sourceDigest})).rejects.toThrow(/source changed/)
 })
 it('isolates source snapshots checkpoints branches and controls by owner',async()=>{
  const f=await fixture(),id=await f.start()
  await expect(f.t.query(api.missionRuntime.preview,{source:f.source})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.missionRuntime.preview,{source:f.source})).rejects.toThrow(/unavailable/)
  await expect(f.other.query(api.missionRuntime.checkpoints,{graphId:f.graphId})).rejects.toThrow(/unavailable/)
  await expect(f.other.query(api.missionRuntime.detail,{checkpointId:f.checkpointId})).rejects.toThrow(/unavailable/)
  await expect(f.other.query(api.missionRuntime.replayDetail,{replayId:id})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.missionRuntime.control,{replayId:id,eventKey:'foreign',expectedRevision:0,operation:'advance',reason:'Foreign control should be refused'})).rejects.toThrow(/unavailable/)
 })
 it('advances dependency waves with idempotent events and no provider spend or authorization changes',async()=>{
  const f=await fixture(),id=await f.start(),before=await f.t.run(c=>c.db.get(f.missionId))
  const args={replayId:id,eventKey:'first',expectedRevision:0,operation:'advance' as const,reason:'Replay first saved dependency wave'}
  const event=await f.owner.mutation(api.missionRuntime.control,args)
  expect(await f.owner.mutation(api.missionRuntime.control,args)).toBe(event)
  await expect(f.owner.mutation(api.missionRuntime.control,{...args,reason:'Different input under same key'})).rejects.toThrow(/immutable input/)
  await f.control(id);await f.control(id)
  const d=await f.detail(id);expect(d.replay.status).toBe('complete');expect(d.completed).toBe(3);expect(d.events).toHaveLength(3)
  expect(d.events[0].previousDigest).toBe(d.replay.branchDigest);expect(d.events[1].previousDigest).toBe(d.events[0].eventDigest)
  await expect(f.control(id)).rejects.toThrow(/terminal/)
  expect(await f.t.run(c=>c.db.get(f.missionId))).toEqual(before)
  expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
  expect(await f.t.run(c=>c.db.query('billingAccounts').collect())).toEqual([])
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('persists pause and resume across independent reads without resetting deadlines',async()=>{
  const f=await fixture(),id=await f.start(),before=(await f.detail(id)).replay.deadlineAt
  await f.control(id,'pause');expect((await f.detail(id)).replay.status).toBe('paused')
  await expect(f.control(id,'advance')).rejects.toThrow(/current state/)
  const reloaded=f.t.withIdentity({subject:f.users.owner})
  expect((await reloaded.query(api.missionRuntime.replayDetail,{replayId:id})).replay.status).toBe('paused')
  await f.control(id,'resume');await f.control(id)
  expect((await f.detail(id)).replay.deadlineAt).toBe(before);expect((await f.detail(id)).completed).toBe(1)
 })
 it('invalidates recorded descendants of changed upstream inputs instead of fabricating a matched request',async()=>{
  const f=await fixture(),baseline=await f.start(),fork=await f.start([f.replacement('research')],baseline)
  await f.control(fork);await f.control(fork)
  const d=await f.detail(fork)
  expect(d.replay.status).toBe('held');expect(d.events[0].outcomes[0].origin).toBe('operator-replacement')
  expect(d.events[1].outcomes[0].status).toBe('invalidated');expect(d.replay.reason).toContain('old downstream response')
  expect((await f.detail(baseline)).replay.revision).toBe(0);expect(fetchMock).not.toHaveBeenCalled()
 })
 it('allows explicitly supplied alternative descendants while retaining their provenance',async()=>{
  const f=await fixture(),id=await f.start(f.nodes.map(n=>f.replacement(n.key)))
  for(let i=0;i<3;i++)await f.control(id)
  const d=await f.detail(id);expect(d.replay.status).toBe('complete');expect(d.events.flatMap(e=>e.outcomes).every(o=>o.origin==='operator-replacement')).toBe(true)
  expect(d.replay.reason).toContain('no semantic');expect(fetchMock).not.toHaveBeenCalled()
 })
 it('holds at the original offline deadline and refuses forks that try to reset it',async()=>{
  const f=await fixture(),id=await f.start(),d=await f.detail(id)
  await f.control(id,'pause')
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(d.replay.deadlineAt)
  await f.control(id,'resume')
  expect((await f.detail(id)).replay.status).toBe('held');expect((await f.detail(id)).replay.deadlineAt).toBe(d.replay.deadlineAt)
  await expect(f.start([],id)).rejects.toThrow(/cannot reset/)
 })
 it('bounds fork depth and refuses foreign-checkpoint lineage',async()=>{
  const f=await fixture();let parent=await f.start()
  for(let i=0;i<3;i++){const next=await f.start([],parent);expect((await f.detail(next)).replay.deadlineAt).toBe((await f.detail(parent)).replay.deadlineAt);parent=next}
  await expect(f.start([],parent)).rejects.toThrow(/depth limit/)
  const otherId=await f.owner.mutation(api.missionRuntime.capture,{source:f.source,checkpointKey:'second-checkpoint',expectedSourceDigest:f.preview.sourceDigest})
  await expect(f.owner.mutation(api.missionRuntime.start,{checkpointId:otherId,parentReplayId:parent,replayKey:'wrong-family',label:'Wrong family',rationale:'Wrong checkpoint cannot inherit this branch',overrides:[]})).rejects.toThrow(/same checkpoint/)
 })
 it('refuses stale concurrent controls and immutable branch-key conflicts',async()=>{
  const f=await fixture(),id=await f.start([],undefined,'same-key')
  expect(await f.start([],undefined,'same-key')).toBe(id)
  await expect(f.start([f.replacement('research')],undefined,'same-key')).rejects.toThrow(/immutable branch/)
  await f.control(id)
  await expect(f.owner.mutation(api.missionRuntime.control,{replayId:id,eventKey:'stale',expectedRevision:0,operation:'pause',reason:'Stale state cannot mutate replay'})).rejects.toThrow(/revision changed/)
 })
 it('detects modified checkpoints branch contracts and event chains',async()=>{
  const f=await fixture(),id=await f.start();await f.control(id)
  const e=(await f.detail(id)).events[0]
  await f.t.run(c=>c.db.patch(e._id,{reason:'Tampered diagnostic reason'}))
  await expect(f.detail(id)).rejects.toThrow(/event integrity/)
  const second=await f.start()
  await f.t.run(c=>c.db.patch(second,{label:'Tampered branch'}));await expect(f.detail(second)).rejects.toThrow(/branch integrity/)
  await f.t.run(c=>c.db.patch(f.checkpointId,{snapshot:'{}'}))
  await expect(f.owner.query(api.missionRuntime.detail,{checkpointId:f.checkpointId})).rejects.toThrow(/integrity/)
 })
 it('withholds inconsistent rehearsal receipts and rejects inconsistent graph digests',async()=>{
  const f=await fixture()
  await f.t.run(async c=>{const batch=await c.db.query('missionGraphBatches').withIndex('by_run',q=>q.eq('runId',f.runId!)).first();await c.db.patch(batch!._id,{payloadDigest:'wrong'})})
  const p=await f.owner.query(api.missionRuntime.preview,{source:f.source}),s=JSON.parse(p.snapshot) as RuntimeSnapshot
  expect(s.handoffs.every(h=>h.state==='unresolved'&&h.result===null)).toBe(true)
  await f.t.run(c=>c.db.patch(f.graphId,{designDigest:'wrong'}));expect(await f.owner.query(api.missionRuntime.preview,{source:f.source})).toMatchObject({snapshot:'',blockedReason:expect.stringContaining('graph digest')});await expect(f.owner.mutation(api.missionRuntime.capture,{source:f.source,checkpointKey:'invalid-graph',expectedSourceDigest:f.preview.sourceDigest})).rejects.toThrow(/graph digest/)
 })
 it('audits controlled provider receipts and replays them without another HTTP request',async()=>{
  const f=await fixture(true),s=JSON.parse(f.preview.snapshot) as RuntimeSnapshot,calls=fetchMock.mock.calls.length
  expect(calls).toBe(3);expect(s.handoffs.every(h=>h.state==='accepted'&&h.provenance==='provider-receipt')).toBe(true);expect(s.missionContract).not.toBeNull()
  vi.stubEnv('GROQ_MODEL','changed-after-run')
  expect((JSON.parse((await f.owner.query(api.missionRuntime.preview,{source:f.source})).snapshot) as RuntimeSnapshot).handoffs.every(h=>h.state==='accepted')).toBe(true)
  const id=await f.start();for(let i=0;i<3;i++)await f.control(id)
  expect((await f.detail(id)).replay.status).toBe('complete');expect(fetchMock).toHaveBeenCalledTimes(calls)
 })
 it('never substitutes successful invocation timestamps for missing exact accounting evidence',async()=>{
  const f=await fixture(true),calls=fetchMock.mock.calls.length
  await f.t.run(async c=>{const w=await c.db.query('graphExecutionWorkers').withIndex('by_execution',q=>q.eq('executionId',f.executionId!)).first(),h=await c.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',w!.invocationId).eq('mode','test')).unique();await c.db.patch(h!._id,{status:'held'})})
  const p=await f.owner.query(api.missionRuntime.preview,{source:f.source}),s=JSON.parse(p.snapshot) as RuntimeSnapshot
  expect(s.handoffs.some(h=>h.state==='unresolved')).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(calls)
 })
 it('keeps an unstarted provider contract missing rather than labeling it completed evidence',async()=>{
  const f=await fixture(),executionId=await f.owner.mutation(api.graphExecutionData.create,{graphId:f.graphId,executionKey:'unstarted',provider:'groq',maxOutputTokens:256}),source={kind:'provider' as const,id:executionId},p=await f.owner.query(api.missionRuntime.preview,{source}),s=JSON.parse(p.snapshot) as RuntimeSnapshot
  expect(s.sourceStatus).toBe('active');expect(s.handoffs.every(h=>h.state==='missing')).toBe(true)
  const checkpointId=await f.owner.mutation(api.missionRuntime.capture,{source,checkpointKey:'unstarted',expectedSourceDigest:p.sourceDigest}),id=await f.owner.mutation(api.missionRuntime.start,{checkpointId,replayKey:'missing',label:'Missing evidence',rationale:'No remote results should be invented here',overrides:[]})
  await f.control(id);expect((await f.detail(id)).replay.status).toBe('held');expect((await f.detail(id)).completed).toBe(0)
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('rejects unsupported replacements and bounds replay event history',async()=>{
  const f=await fixture()
  for(const overrides of [[{nodeKey:'unknown',answer:'{}'}],[f.replacement('research'),f.replacement('research')],[{nodeKey:'research',answer:JSON.stringify({status:'complete',outputKind:'evidence',summary:'Wrong references',evidenceRefs:['https://invented.example']})}]])await expect(f.start(overrides)).rejects.toThrow()
  const id=await f.start()
  for(let i=0;i<32;i++)await f.control(id,i%2?'resume':'pause')
  await expect(f.control(id,'pause')).rejects.toThrow(/event limit/)
  expect((await f.detail(id)).events).toHaveLength(32)
 })
})
