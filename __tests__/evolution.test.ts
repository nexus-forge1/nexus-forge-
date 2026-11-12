// @vitest-environment edge-runtime
import {describe,it,expect,vi,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import {graphTemplate} from '../src/lib/mission-graph-templates'
const modules=import.meta.glob('../convex/**/*.ts')
afterEach(()=>vi.useRealTimers())
async function fixture(changedPermissions=false,changedSuite=false){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Evolution fixture',brief:'Evaluate private candidate workflow revisions.',audience:'Controlled fixtures',criteria:['No production self-modification'],budget:0}),project=await owner.mutation(api.studio.startProject,{templateId,title:'Evolution fixture'})
 const graphId=await owner.mutation(api.missionGraphs.create,{projectId:project.projectId,expectedRevision:0,graphKey:'evolution-fixture',title:'Evolution graph',objective:'Compare private rehearsal packages.',missionType:'research',nodes:graphTemplate('research'),limits:{maxSteps:10,maxToolCalls:10,maxTokens:10000,maxWallSeconds:3600,maxReplans:1,parallelism:2}})
 const cases=[{key:'schema',category:'contract',input:'Controlled contract case',expected:'OK',grader:'exact-text' as const,critical:true},{key:'failure',category:'boundary',input:'Controlled failure case',expected:'STOP',grader:'exact-text' as const,critical:true}]
 const suiteId=await owner.mutation(api.evaluations.createSuite,{suiteKey:'evolution-fixture',title:'Frozen acceptance',expectedVersion:0,cases}),candidateSuite=changedSuite?await owner.mutation(api.evaluations.createSuite,{suiteKey:'evolution-fixture',title:'Changed criteria version',expectedVersion:1,cases}):suiteId
 const inputFields=[{key:'brief',type:'string' as const,required:true}],outputFields=[{key:'plan',type:'string' as const,required:true}],permissions=['read-owned-project','record-rehearsal']
 const base={projectId:project.projectId,graphId,suiteId,skillKey:'evolution-skill',title:'Evolution baseline',description:'Controlled planning baseline, not an executed competency.',inputFields,outputFields,permissions,tools:['typed-planning'],failurePolicy:'stop-and-review' as const}
 const baselineId=await owner.mutation(api.skillFoundry.create,{...base,expectedRevision:0}),candidateId=await owner.mutation(api.skillFoundry.create,{...base,expectedRevision:1,title:'Evolution candidate',description:'Controlled candidate planning description change.',suiteId:candidateSuite,permissions:changedPermissions?['read-owned-project']:permissions})
 const answers=[{key:'schema',output:'OK'},{key:'failure',output:'STOP'}]
 for(const skillId of [baselineId,candidateId]){
  for(const label of ['A','B'])await owner.mutation(api.skillFoundry.check,{skillId,requestKey:'case-'+label,input:JSON.stringify({brief:'Shared input '+label}),output:JSON.stringify({plan:'Supplied plan '+label}),answers})
  await owner.mutation(api.skillFoundry.review,{skillId,requestKey:'review',status:'reviewed-for-rehearsal',reason:'Reviewed all supplied examples for a private rehearsal only.'})
 }
 const proposalArgs={projectId:project.projectId,proposalKey:'candidate',baselineId,candidateId,justification:'Compare a bounded description revision in a private rehearsal.'},proposalId=await owner.mutation(api.evolution.create,proposalArgs)
 const detail=()=>owner.query(api.evolution.detail,{proposalId})
 async function approve(key='approval'){const d=await detail();return owner.mutation(api.evolution.review,{proposalId,requestKey:key,expectedAuditDigest:d.auditDigest,decision:'approve-pilot',reason:'Approve only a capped private manual rehearsal; improvement remains unverified.'})}
 async function activate(maxRuns=1){return owner.mutation(api.evolution.activate,{proposalId,requestKey:'pilot',maxRuns,hours:1})}
 return{t,owner,other,...project,graphId,suiteId,baselineId,candidateId,proposalId,proposalArgs,detail,approve,activate,answers,base}
}
describe('controlled private evolution',()=>{
 it('retains immutable proposals and compares the complete exact supplied input population',async()=>{
  const f=await fixture(),d=await f.detail()
  expect(d.reasons).toEqual([]);expect(d.snapshot).toMatchObject({paired:2,improved:0,regressed:0,productionReady:false})
  expect(await f.owner.mutation(api.evolution.create,f.proposalArgs)).toBe(f.proposalId)
  await expect(f.owner.mutation(api.evolution.create,{...f.proposalArgs,justification:'Conflicting candidate history'})).rejects.toThrow(/immutable candidate/)
 })
 it('isolates private proposals audits reviews pilots and rollback',async()=>{
  const f=await fixture();await f.approve();const pilotId=await f.activate()
  await expect(f.t.query(api.evolution.detail,{proposalId:f.proposalId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.evolution.detail,{proposalId:f.proposalId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evolution.issue,{pilotId,requestKey:'foreign'})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evolution.rollback,{pilotId,reason:'Foreign rollback must be rejected'})).rejects.toThrow(/unavailable/)
 })
 it('refuses permission changes despite fully passing supplied acceptance checks',async()=>{
  const f=await fixture(true);expect((await f.detail()).reasons).toContain('Protected contract changed: permissions')
  await expect(f.approve()).rejects.toThrow(/approval blocked/)
 })
 it('refuses acceptance-suite rewrites with identical supplied passing answers',async()=>{
  const f=await fixture(false,true)
  expect((await f.detail()).reasons).toContain('Acceptance criteria must remain the exact same suite version')
  await expect(f.approve()).rejects.toThrow(/approval blocked/)
 })
 it('rejects larger resource limits even when the candidate passes every supplied case',async()=>{
  const f=await fixture(),graphId=await f.owner.mutation(api.missionGraphs.create,{projectId:f.projectId,expectedRevision:1,graphKey:'evolution-fixture',title:'Larger budget candidate',objective:'Compare planning packages.',missionType:'research',nodes:graphTemplate('research'),limits:{maxSteps:10,maxToolCalls:10,maxTokens:20000,maxWallSeconds:3600,maxReplans:1,parallelism:2}})
  const candidateId=await f.owner.mutation(api.skillFoundry.create,{...f.base,graphId,expectedRevision:2,title:'Resource expansion candidate'})
  for(const label of ['A','B'])await f.owner.mutation(api.skillFoundry.check,{skillId:candidateId,requestKey:label,input:JSON.stringify({brief:'Shared input '+label}),output:'{"plan":"Supplied plan"}',answers:f.answers})
  await f.owner.mutation(api.skillFoundry.review,{skillId:candidateId,requestKey:'review',status:'reviewed-for-rehearsal',reason:'Reviewed supplied examples only; no production claim.'})
  const proposalId=await f.owner.mutation(api.evolution.create,{...f.proposalArgs,proposalKey:'resource-change',candidateId})
  expect((await f.owner.query(api.evolution.detail,{proposalId})).reasons).toContain('Protected resource limits changed')
 })
 it('requires current explicit review and valid frozen pilot limits',async()=>{
  const f=await fixture()
  await expect(f.activate()).rejects.toThrow(/explicit pilot approval/)
  await f.approve()
  for(const [maxRuns,hours]of [[0,1],[4,1],[1,0],[1,25],[1.5,1]])await expect(f.owner.mutation(api.evolution.activate,{proposalId:f.proposalId,requestKey:'invalid',maxRuns,hours})).rejects.toThrow()
  const id=await f.activate();expect(await f.activate()).toBe(id)
  await expect(f.activate(2)).rejects.toThrow(/frozen limits/)
 })
 it('caps candidate manual handoffs and preserves exact retries after rollback without spending',async()=>{
  const f=await fixture(),before=await f.t.run(c=>c.db.get(f.missionId))
  await f.approve();const pilotId=await f.activate(),args={pilotId,requestKey:'first'}
  const runId=await f.owner.mutation(api.evolution.issue,args)
  expect(await f.owner.mutation(api.evolution.issue,args)).toBe(runId)
  await expect(f.owner.mutation(api.evolution.issue,{pilotId,requestKey:'second'})).rejects.toThrow(/capped/)
  expect(await f.t.run(c=>c.db.get(runId))).toMatchObject({basis:'operator_reported',usedSteps:0})
  await f.owner.mutation(api.evolution.rollback,{pilotId,reason:'Stop future private candidate handoffs after the QA check.'})
  expect(await f.owner.mutation(api.evolution.issue,args)).toBe(runId)
  const d=await f.detail();expect(d.pilots[0].pilot.status).toBe('rolled-back');expect(d.pilots[0].pilot.rolledBackAt).toBeTypeOf('number');expect(d.pilots[0].handoffs).toHaveLength(1)
  expect(await f.t.run(c=>c.db.get(f.missionId))).toEqual(before)
  expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
  expect(await f.t.run(c=>c.db.query('billingAccounts').collect())).toEqual([])
 })
 it('holds stale evidence and omitted populations before approval and every pilot issuance',async()=>{
  const f=await fixture();await f.approve();const pilotId=await f.activate(),old=await f.detail()
  await f.owner.mutation(api.skillFoundry.check,{skillId:f.candidateId,requestKey:'extra',input:'{"brief":"Unpaired extra input"}',output:'{"plan":"Supplied output"}',answers:f.answers})
  expect((await f.detail()).reasons.some(r=>r.includes('omitted or duplicate'))).toBe(true)
  await expect(f.owner.mutation(api.evolution.review,{proposalId:f.proposalId,requestKey:'stale',expectedAuditDigest:old.auditDigest,decision:'approve-pilot',reason:'This old review must not bind changed evidence'})).rejects.toThrow(/evidence changed/)
  await expect(f.owner.mutation(api.evolution.issue,{pilotId,requestKey:'new'})).rejects.toThrow(/evidence changed/)
  await f.owner.mutation(api.evolution.rollback,{pilotId,reason:'Rollback must remain possible after evidence drifts.'})
 })
 it('enforces pilot deadlines without changing the original clock',async()=>{
  const f=await fixture();await f.approve();const pilotId=await f.activate(),p=(await f.detail()).pilots[0].pilot
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(p.deadlineAt)
  await expect(f.owner.mutation(api.evolution.issue,{pilotId,requestKey:'late'})).rejects.toThrow(/expired/)
  expect((await f.detail()).pilots[0].pilot.deadlineAt).toBe(p.deadlineAt)
 })
 it('retains rejection and blocks new issuance after a newer review',async()=>{
  const f=await fixture();await f.approve();const pilotId=await f.activate(),d=await f.detail()
  await f.owner.mutation(api.evolution.review,{proposalId:f.proposalId,requestKey:'reject',expectedAuditDigest:d.auditDigest,decision:'reject',reason:'Stop the candidate until stronger evidence has been reviewed.'})
  await expect(f.owner.mutation(api.evolution.issue,{pilotId,requestKey:'new'})).rejects.toThrow(/evidence changed/)
  expect((await f.detail()).reviews).toHaveLength(2)
 })
 it('allows only one active project pilot and preserves frozen rollback rationale',async()=>{
  const f=await fixture();await f.approve();const pilotId=await f.activate()
  await expect(f.owner.mutation(api.evolution.activate,{proposalId:f.proposalId,requestKey:'another',maxRuns:1,hours:1})).rejects.toThrow(/Another project pilot/)
  const args={pilotId,reason:'Private rollout is complete; stop future candidate handoffs.'}
  await f.owner.mutation(api.evolution.rollback,args);await f.owner.mutation(api.evolution.rollback,args)
  await expect(f.owner.mutation(api.evolution.rollback,{...args,reason:'Rewrite the retained reason after completion'})).rejects.toThrow(/frozen/)
 })
})
