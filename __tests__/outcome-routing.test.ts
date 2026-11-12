// @vitest-environment edge-runtime
import {ollamaFixture} from './helpers/ollama-fixture'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api,internal} from '../convex/_generated/api'
import {graphTemplate} from '../src/lib/mission-graph-templates'
import {rankRouting,type RoutingProvider,type RoutingSnapshot,type RoutingObservation} from '../convex/outcomeRoutingModel'
const modules=import.meta.glob('../convex/**/*.ts'),clock=Date.UTC(2026,9,19,6)
let fetchMock:ReturnType<typeof vi.fn>
const costs:Record<string,number>={}
function response(input:RequestInfo|URL,init?:RequestInit){
 const request=JSON.parse(String(init?.body)),prompt=JSON.parse(request.messages[0].content)
 vi.setSystemTime(Date.now()+10)
 return new Response(JSON.stringify(ollamaFixture({model:request.model,choices:[{message:{content:JSON.stringify({status:'complete',outputKind:prompt.contract.outputKind,summary:'Controlled unverified planning fixture',evidenceRefs:prompt.allowedRefs.slice(0,6)})}}],usage:{prompt_tokens:50,completion_tokens:20,total_tokens:70,cost:costs[request.model]??0}})),{status:200})
}
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(clock)
 vi.stubEnv('CONVEX_CLOUD_URL','https://quick-rabbit-810.eu-west-1.convex.cloud');vi.stubEnv('VITE_STRIPE_MODE','test')
 vi.stubEnv('OLLAMA_API_KEY','controlled-fixture-not-real');vi.stubEnv('OLLAMA_API_KEY', 'controlled-fixture-not-real')
 vi.stubEnv('CEREBRAS_API_KEY','controlled-fixture-not-real');vi.stubEnv('CEREBRAS_MODEL','gemma4:31b')
 costs['deepseek-v4.1-flash']=0.01;costs['gemma4:31b']=0
 fetchMock=vi.fn(response);vi.stubGlobal('fetch',fetchMock)
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()})
async function fixture(){
 const t=convexTest(schema,modules),users=await t.run(async c=>({owner:await c.db.insert('users',{email:'routing-owner@example.test'}),other:await c.db.insert('users',{email:'routing-other@example.test'})}))
 const owner=t.withIdentity({subject:users.owner}),other=t.withIdentity({subject:users.other})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Routing controlled fixture',brief:'Compare receipt-backed planning configuration outcomes.',audience:'Controlled fixtures',criteria:['No unsupported provider selection'],budget:25})
 const project=await owner.mutation(api.studio.startProject,{templateId,title:'Routing fixture project'})
 await t.run(async c=>{await c.db.patch(project.missionId,{approved:true,status:'running'});await c.db.insert('portfolioDecisions',{missionId:project.missionId,priorityRank:1,action:'controlled-planning',decision:'approve',createdAt:clock});await c.db.insert('billingAccounts',{ownerKey:String(users.owner),mode:'test',prepaid:2000,included:0,expiresAt:0,held:0,unresolved:0,frozen:false})})
 const graphId=await owner.mutation(api.missionGraphs.create,{projectId:project.projectId,expectedRevision:0,graphKey:'routing-fixture',title:'Matched routing workflow',objective:'Produce bounded unverified planning handoffs.',missionType:'research',nodes:graphTemplate('research'),limits:{maxSteps:20,maxToolCalls:20,maxTokens:100000,maxWallSeconds:86400,maxReplans:0,parallelism:2}})
 const policyArgs={projectId:project.projectId,graphId,expectedRevision:0,policyKey:'selection',title:'Scoped configuration selection',allowedProviders:['ollama-deepseek','ollama-gemma'] as RoutingProvider[],maxOutputTokens:256,minimumRuns:2,minimumContractRate:0.95,maxMeanChargeCents:100,maxMeanRequestMs:30000,maxPromptBytes:8000,maxAgeHours:24}
 const policyId=await owner.mutation(api.outcomeRouting.createPolicy,policyArgs)
 let sequence=0
 async function run(provider:RoutingProvider){
  const executionId=await owner.mutation(api.graphExecutionData.create,{graphId,executionKey:provider+'-'+(++sequence),provider,maxOutputTokens:256})
  for(const waveKey of ['research','audit','decision']){
   await owner.action(api.graphExecution.runWave,{executionId,waveKey})
   const d=await owner.query(api.graphExecutionData.detailV2,{executionId});if(d.execution.status!=='active')break
  }return executionId
 }
 async function preview(){const p=await owner.query(api.outcomeRouting.preview,{policyId});if(!p.snapshot)throw new Error(p.blockedReason);return{...p,value:JSON.parse(p.snapshot) as RoutingSnapshot}}
 async function decide(key='decision'){const p=await preview();const decisionId=await owner.mutation(api.outcomeRouting.decide,{policyId,requestKey:key,expectedSourceDigest:p.sourceDigest});return{...p,decisionId}}
 return{t,owner,other,users,templateId,...project,graphId,policyArgs,policyId,run,preview,decide}
}
describe('scoped outcome-aware routing',()=>{
 it('freezes policies with exact revision retries, distinct allowlists and bounded constraints',async()=>{
  const f=await fixture();expect(await f.owner.mutation(api.outcomeRouting.createPolicy,f.policyArgs)).toBe(f.policyId)
  await expect(f.owner.mutation(api.outcomeRouting.createPolicy,{...f.policyArgs,title:'Changed'})).rejects.toThrow(/revision changed/)
  for(const overrides of [{allowedProviders:[]},{allowedProviders:['ollama-deepseek','ollama-deepseek'] as RoutingProvider[]},{minimumRuns:1},{minimumContractRate:NaN},{maxMeanChargeCents:-1},{maxAgeHours:721}])await expect(f.owner.mutation(api.outcomeRouting.createPolicy,{...f.policyArgs,...overrides})).rejects.toThrow()
  const next=await f.owner.mutation(api.outcomeRouting.createPolicy,{...f.policyArgs,expectedRevision:1,title:'Policy successor'});expect(next).not.toBe(f.policyId)
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('isolates policies, source audits, decisions and execution handoffs by owner/project',async()=>{
  const f=await fixture(),d=await f.decide()
  await expect(f.t.query(api.outcomeRouting.policies,{projectId:f.projectId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.outcomeRouting.preview,{policyId:f.policyId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.outcomeRouting.decide,{policyId:f.policyId,requestKey:'foreign',expectedSourceDigest:d.sourceDigest})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.outcomeRouting.freezeExecution,{decisionId:d.decisionId,executionKey:'foreign'})).rejects.toThrow(/unavailable/)
  const p=await f.owner.mutation(api.studio.startProject,{templateId:f.templateId,title:'Other project'})
  await expect(f.owner.mutation(api.outcomeRouting.createPolicy,{...f.policyArgs,projectId:p.projectId})).rejects.toThrow(/this project/)
 })
 it('abstains on missing runtime evidence even when operator-supplied evaluations declare perfect results',async()=>{
  const f=await fixture(),suiteId=await f.owner.mutation(api.evaluations.createSuite,{suiteKey:'declared',title:'Declared answers',expectedVersion:0,cases:[{key:'task',category:'planning',input:'Return PASS',expected:'PASS',grader:'exact-text',critical:true}]})
  await f.owner.mutation(api.evaluations.record,{suiteId,requestKey:'claimed-perfect',config:{agent:'planner',model:'cerebras/gpt-oss-120b',promptVersion:'declared',toolVersion:'declared'},outputs:[{key:'task',output:'PASS'}]})
  const p=await f.preview();expect(p.value).toMatchObject({disposition:'hold',winner:null});expect(p.value.candidates.every(c=>c.runs===0&&c.meanChargeCents===null)).toBe(true)
  const d=await f.decide();await expect(f.owner.mutation(api.outcomeRouting.freezeExecution,{decisionId:d.decisionId,executionKey:'unsupported'})).rejects.toThrow(/HOLD/)
  expect(fetchMock).not.toHaveBeenCalled()
 })
 it('audits actual stored controlled provider responses and settles matched configuration evidence',async()=>{
  const f=await fixture()
  for(const provider of ['ollama-deepseek','ollama-gemma'] as const)for(let i=0;i<2;i++)await f.run(provider)
  const p=await f.preview();expect(p.value.winner).toEqual({provider:'ollama-gemma',model:'gemma4:31b'})
  expect(p.value.observations).toHaveLength(4)
  expect(p.value.candidates.find(c=>c.provider==='ollama-deepseek')).toMatchObject({runs:2,requests:6,coverage:3,contractRate:1,meanChargeCents:2,meanRequestMs:10,eligible:true})
  expect(p.value.candidates.find(c=>c.provider==='ollama-gemma')).toMatchObject({runs:2,requests:6,coverage:3,contractRate:1,meanChargeCents:0,eligible:true})
  expect(fetchMock).toHaveBeenCalledTimes(12)
 })
 it('freezes one reviewed unstarted execution with exact routing origin and no new spend',async()=>{
  const f=await fixture();for(let i=0;i<2;i++)await f.run('ollama-gemma')
  const d=await f.decide(),before=fetchMock.mock.calls.length,holds=await f.t.run(c=>c.db.query('billingHolds').collect())
  const args={decisionId:d.decisionId,executionKey:'reviewed-routing'},id=await f.owner.mutation(api.outcomeRouting.freezeExecution,args)
  expect(await f.owner.mutation(api.outcomeRouting.freezeExecution,args)).toBe(id)
  await expect(f.owner.mutation(api.outcomeRouting.freezeExecution,{...args,executionKey:'different-key'})).rejects.toThrow(/another execution key/)
  const e=(await f.owner.query(api.graphExecutionData.detailV2,{executionId:id})).execution
  expect(e).toMatchObject({provider:'ollama-gemma',model:'gemma4:31b',routingDecisionId:d.decisionId,routingDecisionDigest:d.sourceDigest,reservedCalls:0})
  expect(fetchMock).toHaveBeenCalledTimes(before);expect(await f.t.run(c=>c.db.query('billingHolds').collect())).toHaveLength(holds.length)
  // A routed contract remains subject to the existing dispatch controls.
  await f.t.run(c=>c.db.patch(f.missionId,{approved:false}))
  await expect(f.owner.action(api.graphExecution.runWave,{executionId:id,waveKey:'approval-bypass'})).rejects.toThrow(/approval/)
 })
 it('preserves policy/environment separation and never promotes test receipts into Live evidence',async()=>{
  const f=await fixture();for(let i=0;i<2;i++)await f.run('ollama-gemma')
  vi.stubEnv('CONVEX_CLOUD_URL','https://tame-rat-826.eu-west-1.convex.cloud')
  const old=await f.owner.query(api.outcomeRouting.preview,{policyId:f.policyId});expect(old.snapshot).toBeNull();expect(old.blockedReason).toMatch(/Environment/)
  const policyId=await f.owner.mutation(api.outcomeRouting.createPolicy,{...f.policyArgs,expectedRevision:1})
  const p=await f.owner.query(api.outcomeRouting.preview,{policyId}),s=JSON.parse(p.snapshot!) as RoutingSnapshot
  expect(s.scope).toBe('live');expect(s.winner).toBeNull();expect(s.observations.every(o=>o.state==='ignored'&&o.reason.includes('environment'))).toBe(true)
 })
 it('retains uncertain admitted work as unresolved even beyond the freshness window',async()=>{
  const f=await fixture();for(let i=0;i<2;i++)await f.run('ollama-deepseek')
  fetchMock.mockRejectedValue(new Error('Controlled potentially accepted transport failure'))
  await f.run('ollama-deepseek');vi.setSystemTime(Date.now()+25*3600000)
  const p=await f.preview(),candidate=p.value.candidates.find(c=>c.provider==='ollama-deepseek')!
  expect(candidate.unresolved).toBe(1);expect(candidate.eligible).toBe(false);expect(p.value.observations.filter(o=>o.state==='stale')).toHaveLength(2);expect(p.value.winner).toBeNull()
 })
 it('never treats pending charge or tampered handoff data as measured eligibility',async()=>{
  const f=await fixture();const id=await f.run('ollama-deepseek');await f.run('ollama-deepseek')
  const data=await f.owner.query(api.graphExecutionData.detailV2,{executionId:id}),worker=data.workers[0]
  await f.t.run(async c=>{const hold=await c.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',worker.invocationId).eq('mode','test')).unique();await c.db.patch(hold!._id,{status:'review'})})
  let p=await f.preview();expect(p.value.observations.find(o=>o.id===id)!.state).toBe('unresolved');expect(p.value.winner).toBeNull()
  await f.t.run(async c=>{const hold=await c.db.query('billingHolds').withIndex('by_invocation_mode',q=>q.eq('invocationId',worker.invocationId).eq('mode','test')).unique();await c.db.patch(hold!._id,{status:'settled'});await c.db.patch(worker._id,{result:{...worker.result!,summary:'Tampered declared quality'}})})
  p=await f.preview();expect(p.value.observations.find(o=>o.id===id)!.state).toBe('unresolved')
 })
 it('ignores unstarted contracts and abstains when current model configuration is unavailable',async()=>{
  const f=await fixture()
  await f.owner.mutation(api.graphExecutionData.create,{graphId:f.graphId,executionKey:'never-started',provider:'ollama-deepseek',maxOutputTokens:256})
  let p=await f.preview();expect(p.value.observations[0]).toMatchObject({state:'ignored',workers:[]});expect(p.value.winner).toBeNull()
  for(let i=0;i<2;i++)await f.run('ollama-deepseek')
  vi.stubEnv('OLLAMA_API_KEY','')
  p=await f.preview();expect(p.value.winner).toBeNull();expect(p.value.candidates.find(c=>c.provider==='ollama-deepseek')).toMatchObject({runs:2,configured:false,eligible:false})
 })
 it('retains exact immutable decisions, rejects stale previews and bounds selection handoffs to 15 minutes',async()=>{
  const f=await fixture();for(let i=0;i<2;i++)await f.run('ollama-gemma')
  const d=await f.decide(),args={policyId:f.policyId,requestKey:'decision',expectedSourceDigest:d.sourceDigest}
  expect(await f.owner.mutation(api.outcomeRouting.decide,args)).toBe(d.decisionId)
  await expect(f.owner.mutation(api.outcomeRouting.decide,{...args,expectedSourceDigest:'0'.repeat(64)})).rejects.toThrow(/different evidence/)
  vi.setSystemTime(Date.now()+15*60000+1)
  await expect(f.owner.mutation(api.outcomeRouting.freezeExecution,{decisionId:d.decisionId,executionKey:'expired'})).rejects.toThrow(/15 minutes/)
  await f.owner.mutation(api.graphExecutionData.create,{graphId:f.graphId,executionKey:'new-source-contract',provider:'ollama-deepseek',maxOutputTokens:256})
  await expect(f.owner.mutation(api.outcomeRouting.decide,{...args,requestKey:'stale-preview'})).rejects.toThrow(/Evidence changed/)
  expect((await f.owner.query(api.outcomeRouting.decisions,{policyId:f.policyId}))[0].snapshot).toBe(d.snapshot)
 })
 it('rechecks source history and configuration before binding a reviewed recommendation',async()=>{
  const f=await fixture();for(let i=0;i<2;i++)await f.run('ollama-gemma')
  const d=await f.decide();await f.owner.mutation(api.graphExecutionData.create,{graphId:f.graphId,executionKey:'changed-history',provider:'ollama-deepseek',maxOutputTokens:256})
  await expect(f.owner.mutation(api.outcomeRouting.freezeExecution,{decisionId:d.decisionId,executionKey:'stale-recommendation'})).rejects.toThrow(/Source evidence/)
 })
 it('invalidates a policy when the saved mission changes without mutating retained decisions',async()=>{
  const f=await fixture(),d=await f.decide()
  await f.t.run(c=>c.db.patch(f.missionId,{budget:26}))
  const p=await f.owner.query(api.outcomeRouting.preview,{policyId:f.policyId});expect(p.snapshot).toBeNull();expect(p.blockedReason).toMatch(/mission contract changed/)
  const decisions=await f.owner.query(api.outcomeRouting.decisions,{policyId:f.policyId});expect(decisions[0].snapshot).toBe(d.snapshot)
 })
 it('regrades invalid JSON from stored answers and does not punish a valid insufficient-evidence stop',async()=>{
  const f=await fixture();for(let i=0;i<2;i++)await f.run('ollama-deepseek')
  fetchMock.mockImplementation((url,init)=>response(url,init).json().then(p=>{p.message.content='Invalid JSON fixture';return new Response(JSON.stringify(p),{status:200})}))
  await f.run('ollama-deepseek')
  let p=await f.preview();expect(p.value.candidates.find(c=>c.provider==='ollama-deepseek')!.contractRate).toBeCloseTo((2/3+1+1)/3);expect(p.value.winner).toBeNull()
  // A separate workload retains complete and correctly typed insufficient results.
  const second=await fixture();fetchMock.mockImplementation(response);for(let i=0;i<2;i++)await second.run('ollama-gemma')
  fetchMock.mockImplementation((url,init)=>response(url,init).json().then(p=>{const r=JSON.parse(p.message.content);r.status='insufficient';p.message.content=JSON.stringify(r);return new Response(JSON.stringify(p),{status:200})}))
  await second.run('ollama-gemma');p=await second.preview();expect(p.value.candidates.find(c=>c.provider==='ollama-gemma')!.contractRate).toBe(1)
 })
 it('requires every node receipt in a matched run to satisfy freshness',async()=>{
  const f=await fixture(),executionId=await f.owner.mutation(api.graphExecutionData.create,{graphId:f.graphId,executionKey:'long-elapsed-workflow',provider:'ollama-deepseek',maxOutputTokens:256})
  await f.owner.action(api.graphExecution.runWave,{executionId,waveKey:'research'})
  vi.setSystemTime(Date.now()+2*3600000)
  await f.owner.action(api.graphExecution.runWave,{executionId,waveKey:'audit'})
  await f.owner.action(api.graphExecution.runWave,{executionId,waveKey:'decision'})
  await f.run('ollama-deepseek')
  const policyId=await f.owner.mutation(api.outcomeRouting.createPolicy,{...f.policyArgs,expectedRevision:1,maxAgeHours:1}),p=await f.owner.query(api.outcomeRouting.preview,{policyId}),s=JSON.parse(p.snapshot!) as RoutingSnapshot
  expect(s.observations.find(o=>o.id===executionId)!.state).toBe('stale')
  expect(s.candidates.find(c=>c.provider==='ollama-deepseek')!.runs).toBe(1);expect(s.winner).toBeNull()
 })
 it('abstains on exact measured ties and applies observed cost/context/duration ceilings',()=>{
  const policy={allowedProviders:['ollama-deepseek','ollama-gemma'] as RoutingProvider[],minimumRuns:2,minimumContractRate:1,maxMeanChargeCents:5,maxMeanRequestMs:100,maxPromptBytes:2000},configs={cloudflare:{model:'cf',configured:false},'ollama-deepseek':{model:'g',configured:true},'ollama-gemma':{model:'c',configured:true}}
  const rows:RoutingObservation[]=[]
  for(const provider of ['ollama-deepseek','ollama-gemma'] as const)for(let i=0;i<2;i++)rows.push({id:provider+i,provider,model:provider==='ollama-deepseek'?'g':'c',state:'verified',reason:'Controlled',observedAt:clock,workers:[{nodeKey:'node',invocationId:provider+i,valid:true,chargeCents:1,requestMs:10,promptBytes:1000}]})
  expect(rankRouting(['node'],policy,rows,configs)).toMatchObject({winner:null,disposition:'hold'})
  rows[0].workers[0].chargeCents=100;const r=rankRouting(['node'],policy,rows,configs);expect(r.winner?.provider).toBe('ollama-gemma');expect(r.candidates.find(c=>c.provider==='ollama-deepseek')!.reasons.join(' ')).toMatch(/charge/)
  expect(rankRouting(['node'],{...policy,maxPromptBytes:500},rows,configs).winner).toBeNull()
  expect(rankRouting(['node'],{...policy,maxMeanRequestMs:1},rows,configs).winner).toBeNull()
  expect(rankRouting(['node','unmeasured-node'],policy,rows,configs).winner).toBeNull()
 })
})
