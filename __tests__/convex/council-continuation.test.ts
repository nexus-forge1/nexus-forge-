// @vitest-environment edge-runtime
import {ollamaFixture} from '../helpers/ollama-fixture'
import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api,internal } from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
beforeEach(()=>{vi.useFakeTimers();vi.stubEnv('OLLAMA_API_KEY','controlled-key');vi.stubEnv('CEREBRAS_API_KEY','');vi.stubEnv('CLOUDFLARE_API_TOKEN','')})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks()})
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'continuation-owner'}),other=t.withIdentity({subject:'other-owner'})
 const missionId=await t.run(c=>c.db.insert('missions',{title:'Continuation',mission:'Compare identical recovery outcomes',autonomy:'guided',budget:0,status:'running',completion:0,approved:true,ownerKey:'continuation-owner'}))
 const runId=await t.run(c=>c.db.insert('missionRuns',{missionId,startedAt:Date.now(),deadlineAt:Date.now()+600000,maxRetries:2,retries:0,status:'running',currentStage:'orchestration',nextActionAt:Date.now()}))
 const deadlineAt=(await t.run(c=>c.db.get(runId)))!.deadlineAt
 const fetchMock=vi.fn(async()=>new Response(JSON.stringify(ollamaFixture({choices:[{message:{content:'PRIVATE_CONTROLLED_FINDING'}}]})),{status:200}));vi.stubGlobal('fetch',fetchMock)
 const args={missionId,mission:'Compare identical recovery outcomes',missionRunId:runId}
 const baseline=await t.action(internal.forge.orchestrateInternal,args)
 const originalClaim=(await t.run(c=>c.db.query('executionClaims').collect()))[0]
 const baselineEvidence=await t.run(c=>c.db.query('evidence').collect())
 await t.run(async c=>{
  for(const row of await c.db.query('providerInvocations').collect())if(!['council-plan','council-Vision Architect'].includes(row.stage)){for(const answer of await c.db.query('providerResults').withIndex('by_invocation',q=>q.eq('invocationId',row._id)).collect())await c.db.delete(answer._id);await c.db.delete(row._id)}
  for(const effect of await c.db.query('executionEffects').collect())if(!['council-context:v1','evidence:Adaptive Preflight:verified','evidence:Council Planner:verified','evidence:Vision Architect:verified'].includes(effect.effectKey))await c.db.delete(effect._id)
  for(const row of await c.db.query('evidence').collect())if(!['Adaptive Preflight','Council Planner','Vision Architect'].includes(row.agent)||row.agent==='Council Planner'&&!row.message.startsWith('Model '))await c.db.delete(row._id)
  for(const row of await c.db.query('memories').collect())await c.db.delete(row._id)
  for(const row of await c.db.query('agentRuns').collect())await c.db.patch(row._id,{status:row.agent==='Vision Architect'?'complete':'queued',progress:row.agent==='Vision Architect'?100:0})
  await c.db.patch(originalClaim._id,{status:'uncertain',result:undefined});await c.db.patch(missionId,{status:'running',completion:0});await c.db.patch(runId,{status:'paused',currentStage:'execution_recovery'})
 })
 fetchMock.mockClear()
 return{t,owner,other,missionId,runId,claimId:originalClaim._id,baseline,baselineEvidence,args,fetchMock,deadlineAt}
}
const note='Reviewed the frozen inputs, matching durable answers and original execution limits.'
async function authorize(f:Awaited<ReturnType<typeof fixture>>){const e=await f.owner.query(api.executionReview.evidence,{claimId:f.claimId});expect(e.continuationBlock).toBeNull();await f.owner.mutation(api.executionReview.record,{claimId:f.claimId,evidenceToken:e.evidenceToken,decision:'continue-saved',note});return(await f.t.run(c=>c.db.query('executionClaims').withIndex('by_missionId_and_scope_and_workKey',q=>q.eq('missionId',f.missionId).eq('scope','council').eq('workKey','runner:'+f.runId)).unique()))!}
describe('fenced intermediate Council continuation',()=>{
 it('matches uninterrupted output while calling only six remaining stages and preserving original inputs',async()=>{
  const f=await fixture();expect(f.baseline.ok).toBe(true)
  const before=await f.owner.query(api.executionReview.evidence,{claimId:f.claimId});expect(before).toMatchObject({reusableStages:2,remainingStages:6,continuationBlock:null});expect(JSON.stringify(before)).not.toContain('PRIVATE_CONTROLLED_FINDING')
  await f.t.run(async c=>{await c.db.insert('memories',{ownerKey:'continuation-owner',missionId:f.missionId,category:'learning-lesson',key:'new-context',value:'LATER_CONTEXT_MUST_NOT_REPLACE_SNAPSHOT',confidence:1,source:'operator'});await c.db.insert('research',{missionId:f.missionId,query:'New source',result:'LATER_RESEARCH_MUST_NOT_REPLACE_SNAPSHOT',citations:[],createdAt:Date.now()})})
  const replacement=await authorize(f),result=await f.t.action(internal.forge.orchestrateInternal,{...f.args,recoveryClaimId:replacement._id})
  expect(result).toEqual(f.baseline);expect(f.fetchMock).toHaveBeenCalledTimes(6)
  const invocationRows=await f.t.run(c=>c.db.query('providerInvocations').collect());expect(invocationRows).toHaveLength(8);expect(new Set(invocationRows.map(r=>r.stage)).size).toBe(8)
  expect(await f.t.run(c=>c.db.query('councilMemoryReceipts').collect())).toHaveLength(1)
  expect(await f.t.run(c=>c.db.get(f.runId))).toMatchObject({status:'paused',currentStage:'execution_recovery',retries:1,deadlineAt:f.deadlineAt})
  const savedEvidence=await f.t.run(c=>c.db.query('evidence').collect()),shape=(rows:any[])=>rows.map(({agent,message,severity})=>({agent,message,severity})).sort((a,b)=>a.agent.localeCompare(b.agent)||a.message.localeCompare(b.message))
  expect(shape(savedEvidence)).toEqual(shape(f.baselineEvidence));expect(await f.t.run(c=>c.db.query('artifacts').collect())).toEqual([]);expect(await f.t.run(c=>c.db.query('deliveries').collect())).toEqual([])
 })
 it('retires stale provider and write authority and consumes a continuation at most once',async()=>{const f=await fixture(),replacement=await authorize(f)
  await expect(f.t.mutation(internal.forge.updateRun,{missionId:f.missionId,agent:'Vision Architect',status:'blocked',progress:0,note:'Stale worker',executionClaimId:f.claimId})).rejects.toThrow(/no longer active/)
  await expect(f.t.mutation(internal.providerRecovery.reserve,{ownerKey:'continuation-owner',missionId:f.missionId,missionRunId:f.runId,stage:'council-Research Oracle',role:'wave1',requestDigest:'a'.repeat(64),executionClaimId:f.claimId})).rejects.toThrow(/no longer active/)
  await f.t.action(internal.forge.orchestrateInternal,{...f.args,recoveryClaimId:replacement._id});const calls=f.fetchMock.mock.calls.length
  await expect(f.t.action(internal.forge.orchestrateInternal,{...f.args,recoveryClaimId:replacement._id})).rejects.toThrow(/not active/);expect(f.fetchMock).toHaveBeenCalledTimes(calls)
  expect(await f.t.run(c=>c.db.get(f.claimId))).toMatchObject({scope:'council-retired',status:'complete'})
 })
 it('validates every cached request before new inference and leaves changed contracts uncertain',async()=>{const f=await fixture();await f.t.run(async c=>{const row=(await c.db.query('providerResults').collect())[0];await c.db.patch(row._id,{requestDigest:'a'.repeat(64)})});const replacement=await authorize(f)
  await expect(f.t.action(internal.forge.orchestrateInternal,{...f.args,recoveryClaimId:replacement._id})).rejects.toThrow(/request contract changed/)
  expect(f.fetchMock).not.toHaveBeenCalled();expect(await f.t.run(c=>c.db.get(replacement._id))).toMatchObject({status:'uncertain'});expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toHaveLength(2)
 })
 it('denies anonymous and foreign authorization and stale reviewed evidence',async()=>{const f=await fixture(),e=await f.owner.query(api.executionReview.evidence,{claimId:f.claimId}),a={claimId:f.claimId,evidenceToken:e.evidenceToken,decision:'continue-saved' as const,note}
  await expect(f.t.mutation(api.executionReview.record,a)).rejects.toThrow(/Authenticated/);await expect(f.other.mutation(api.executionReview.record,a)).rejects.toThrow(/access denied/)
  await f.t.run(c=>c.db.patch(f.runId,{retries:1}));await expect(f.owner.mutation(api.executionReview.record,a)).rejects.toThrow(/evidence changed/)
  expect(f.fetchMock).not.toHaveBeenCalled()
 })
 it.each(['pending','failed','missing-result','ambiguous','changed-mission','expired','exhausted','later-handoff','active-tick','open-incident'])('blocks unsafe state: %s',async mode=>{const f=await fixture();await f.t.run(async c=>{
  const row=(await c.db.query('providerInvocations').collect())[0]
  if(mode==='pending'||mode==='failed')await c.db.patch(row._id,{outcome:mode})
  if(mode==='missing-result'){const result=await c.db.query('providerResults').withIndex('by_invocation',q=>q.eq('invocationId',row._id)).unique();await c.db.delete(result!._id)}
  if(mode==='ambiguous'){const {_id,_creationTime,...copy}=row;await c.db.insert('providerInvocations',copy)}
  if(mode==='changed-mission')await c.db.patch(f.missionId,{mission:'Changed after capture'})
  if(mode==='expired')await c.db.patch(f.runId,{deadlineAt:Date.now()-1})
  if(mode==='exhausted')await c.db.patch(f.runId,{retries:2})
  if(mode==='later-handoff')await c.db.insert('artifacts',{missionId:f.missionId,type:'html',name:'Later artifact',content:'x',status:'draft',requiresApproval:true})
  if(mode==='active-tick')await c.db.insert('executionClaims',{missionId:f.missionId,scope:'tick',workKey:'other',status:'running',createdAt:Date.now()})
  if(mode==='open-incident')await c.db.insert('incidents',{missionId:f.missionId,kind:'execution',stage:'test',message:'Resolve first',attempts:0,status:'open',createdAt:Date.now()})
 });const e=await f.owner.query(api.executionReview.evidence,{claimId:f.claimId});expect(e.continuationBlock).not.toBeNull();await expect(f.owner.mutation(api.executionReview.record,{claimId:f.claimId,evidenceToken:e.evidenceToken,decision:'continue-saved',note})).rejects.toThrow();expect(f.fetchMock).not.toHaveBeenCalled()})
 it('rechecks authorization when the scheduled worker starts',async()=>{const f=await fixture(),replacement=await authorize(f);await f.t.run(c=>c.db.patch(f.missionId,{approved:false}));expect((await f.t.action(internal.forge.orchestrateInternal,{...f.args,recoveryClaimId:replacement._id})).ok).toBe(false);expect(f.fetchMock).not.toHaveBeenCalled();expect(await f.t.run(c=>c.db.get(replacement._id))).toMatchObject({status:'uncertain'})})
 it('lets exactly one replacement worker consume its ticket',async()=>{const f=await fixture(),replacement=await authorize(f),args={claimId:replacement._id,missionId:f.missionId,runId:f.runId};const outcomes=await Promise.all([f.t.mutation(internal.continuation.take,args),f.t.mutation(internal.continuation.take,args)]);expect(outcomes.sort()).toEqual([false,true]);expect(f.fetchMock).not.toHaveBeenCalled()})
 it('rechecks dependency requirements when the scheduled worker starts',async()=>{const f=await fixture(),replacement=await authorize(f);await f.t.run(async c=>{const dependsOnMissionId=await c.db.insert('missions',{title:'New blocker',mission:'Incomplete dependency',autonomy:'guided',budget:0,status:'draft',completion:0,approved:false,ownerKey:'continuation-owner'});await c.db.insert('missionDependencies',{missionId:f.missionId,dependsOnMissionId,kind:'blocks',createdAt:Date.now()})});expect((await f.t.action(internal.forge.orchestrateInternal,{...f.args,recoveryClaimId:replacement._id})).ok).toBe(false);expect(f.fetchMock).not.toHaveBeenCalled();expect(await f.t.run(c=>c.db.get(replacement._id))).toMatchObject({status:'uncertain'})})

 it('rejects cached downstream stages when prerequisite waves were never admitted',async()=>{const f=await fixture();await f.t.run(async c=>{const row=(await c.db.query('providerInvocations').collect())[0],{_id,_creationTime,...fields}=row;const id=await c.db.insert('providerInvocations',{...fields,stage:'council-critic',role:'critic'});await c.db.insert('providerResults',{invocationId:id,requestDigest:'a'.repeat(64),answer:'Out of order'})});expect((await f.owner.query(api.executionReview.evidence,{claimId:f.claimId})).continuationBlock).toMatch(/dependency-wave order/)})
 it('rechecks original resource reservations in the provider admission transaction',async()=>{const f=await fixture(),resourceId=await f.t.run(c=>c.db.insert('missionResources',{missionId:f.missionId,resourceKey:'original-resource',mode:'exclusive',status:'held',heldAt:Date.now()})),replacement=await authorize(f);expect(await f.t.mutation(internal.continuation.take,{claimId:replacement._id,missionId:f.missionId,runId:f.runId})).toBe(true);await f.t.run(c=>c.db.patch(resourceId,{status:'released'}));await expect(f.t.mutation(internal.providerRecovery.reserve,{ownerKey:'continuation-owner',missionId:f.missionId,missionRunId:f.runId,stage:'council-Research Oracle',role:'wave1',requestDigest:'a'.repeat(64),executionClaimId:replacement._id})).rejects.toThrow(/resources must remain held/);expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toHaveLength(2);expect(f.fetchMock).not.toHaveBeenCalled()})

})
