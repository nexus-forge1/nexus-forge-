// @vitest-environment edge-runtime
import {describe,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import {graphTemplate} from '../src/lib/mission-graph-templates'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Skill fixture',brief:'Package a governed planning capability.',audience:'Controlled fixtures',criteria:['No actual inference'],budget:0}),project=await owner.mutation(api.studio.startProject,{templateId,title:'Skill fixture project'})
 const graphId=await owner.mutation(api.missionGraphs.create,{projectId:project.projectId,expectedRevision:0,graphKey:'skill-fixture',title:'Skill fixture graph',objective:'Review saved planning handoffs.',missionType:'research',nodes:graphTemplate('research'),limits:{maxSteps:10,maxToolCalls:10,maxTokens:10000,maxWallSeconds:3600,maxReplans:1,parallelism:2}})
 const suiteId=await owner.mutation(api.evaluations.createSuite,{suiteKey:'skill-fixture',title:'Controlled capability cases',expectedVersion:0,cases:[{key:'schema',category:'contract',input:'Supplied schema fixture',expected:'OK',grader:'exact-text',critical:true},{key:'failure',category:'boundary',input:'Supplied failure fixture',expected:'STOP',grader:'exact-text',critical:true}]})
 const args={...project,projectId:project.projectId,graphId,suiteId,expectedRevision:0,skillKey:'private-skill',title:'Private skill fixture',description:'Controlled planning package; no competency claim.',inputFields:[{key:'brief',type:'string' as const,required:true}],outputFields:[{key:'plan',type:'string' as const,required:true}],tools:['typed-planning'],permissions:['read-owned-project','record-rehearsal'],failurePolicy:'stop-and-review' as const}
 const{missionId,reused,...createArgs}=args,skillId=await owner.mutation(api.skillFoundry.create,createArgs)
 const check=(key:string,brief:string,bad=false)=>owner.mutation(api.skillFoundry.check,{skillId,requestKey:key,input:JSON.stringify({brief}),output:JSON.stringify({plan:'Controlled supplied plan'}),answers:[{key:'schema',output:bad?'FAIL':'OK'},{key:'failure',output:'STOP'}]})
 const review=(requestKey='review-1',status:'reviewed-for-rehearsal'|'retired'='reviewed-for-rehearsal')=>owner.mutation(api.skillFoundry.review,{skillId,requestKey,status,reason:'Reviewed all supplied fixture evidence for manual rehearsal only.'})
 async function ready(){await check('a','Distinct input A');await check('b','Distinct input B');await review()}
 return{t,owner,other,...project,graphId,suiteId,skillId,createArgs,check,review,ready}
}
describe('private Skill Foundry',()=>{
 it('freezes exact versioned packages and rejects conflicting retries',async()=>{
  const f=await fixture();expect(await f.owner.mutation(api.skillFoundry.create,f.createArgs)).toBe(f.skillId)
  await expect(f.owner.mutation(api.skillFoundry.create,{...f.createArgs,title:'Changed'})).rejects.toThrow(/revision changed/)
  const next=await f.owner.mutation(api.skillFoundry.create,{...f.createArgs,expectedRevision:1,title:'Successor'});expect(next).not.toBe(f.skillId)
  expect((await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})).productionReady).toBe(false)
 })
 it('isolates versions checks reviews and handoffs by operator',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.skillFoundry.list,{projectId:f.projectId})).rejects.toThrow(/Authenticated/)
  await expect(f.other.query(api.skillFoundry.detail,{skillId:f.skillId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.skillFoundry.review,{skillId:f.skillId,requestKey:'foreign',status:'retired',reason:'Foreign review should never be accepted.'})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'foreign'})).rejects.toThrow(/unavailable/)
 })
 it('rejects unsupported permissions unsafe schemas and weak acceptance suites',async()=>{
  const f=await fixture()
  for(const change of [{permissions:['activate-payments']},{tools:['deployment']},{inputFields:[{key:'constructor',type:'string' as const,required:true}]},{outputFields:[]}])await expect(f.owner.mutation(api.skillFoundry.create,{...f.createArgs,...change})).rejects.toThrow()
  const suiteId=await f.owner.mutation(api.evaluations.createSuite,{suiteKey:'single-case',title:'Weak suite',expectedVersion:0,cases:[{key:'only',category:'one',input:'One task',expected:'OK',grader:'exact-text',critical:true}]})
  await expect(f.owner.mutation(api.skillFoundry.create,{...f.createArgs,suiteId})).rejects.toThrow(/two acceptance/)
 })
 it('retains supplied-answer provenance without inventing runtime competency',async()=>{
  const f=await fixture();await f.ready()
  const d=await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})
  expect(d.reasons).toEqual([]);expect(d.reviewCurrent).toBe(true);expect(d.productionReady).toBe(false)
  expect(d.provenance).toContain('no verified agent execution')
  expect(d.checks.every(c=>JSON.parse(c.results).provenance==='operator-supplied')).toBe(true)
 })
 it('requires distinct examples and refuses failed or incomplete evidence without cherry-picking',async()=>{
  const f=await fixture();await f.check('a','Same input');await f.check('b','Same input')
  await expect(f.review()).rejects.toThrow(/distinct supplied/)
  await f.check('retired-explicit review','Different input',true)
  await expect(f.review()).rejects.toThrow(/failed or has inconsistent/)
  const d=await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId});expect(d.checks).toHaveLength(3);expect(d.acceptanceReady).toBe(false)
 })
 it('validates complete typed objects and idempotent check identities',async()=>{
  const f=await fixture(),id=await f.check('same','Example')
  expect(await f.check('same','Example')).toBe(id)
  await expect(f.check('same','Changed')).rejects.toThrow(/immutable/)
  const base={skillId:f.skillId,requestKey:'invalid',input:'{}',output:'{"plan":"Plan"}',answers:[{key:'schema',output:'OK'},{key:'failure',output:'STOP'}]}
  await expect(f.owner.mutation(api.skillFoundry.check,base)).rejects.toThrow(/Missing required/)
  await expect(f.owner.mutation(api.skillFoundry.check,{...base,input:'{"brief":3}'})).rejects.toThrow(/Invalid typed/)
  await expect(f.owner.mutation(api.skillFoundry.check,{...base,input:'{"brief":"text","extra":true}'})).rejects.toThrow(/Unexpected/)
  await expect(f.owner.mutation(api.skillFoundry.check,{...base,input:'{"brief":"text"}',answers:[{key:'schema',output:'OK'}]})).rejects.toThrow(/each case/)
 })
 it('invalidates a review when new checks arrive and detects changed frozen sources',async()=>{
  const f=await fixture();await f.ready();await f.check('c','New case')
  expect((await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})).reasons).toContain('A current explicit review of all retained checks is required')
  await f.review('review-new')
  await f.t.run(c=>c.db.patch(f.graphId,{designDigest:'changed'}))
  const d=await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId});expect(d.acceptanceReady).toBe(false)
  await expect(f.owner.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'new'})).rejects.toThrow(/handoff blocked/)
 })
 it('creates only a new operator-reported manual rehearsal and preserves authorization and budgets',async()=>{
  const f=await fixture();await f.ready()
  const before=await f.t.run(c=>c.db.get(f.missionId)),runId=await f.owner.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'manual'})
  expect(await f.owner.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'manual'})).toBe(runId)
  expect(await f.t.run(c=>c.db.get(runId))).toMatchObject({graphId:f.graphId,basis:'operator_reported',usedSteps:0})
  expect(await f.t.run(c=>c.db.get(f.missionId))).toEqual(before)
  expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
  expect(await f.t.run(c=>c.db.query('billingAccounts').collect())).toEqual([])
 })
 it('retirement blocks future handoffs while preserving previous exact retries and evidence',async()=>{
  const f=await fixture();await f.ready()
  const id=await f.owner.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'original'})
  await f.review('retire','retired')
  await expect(f.owner.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'new'})).rejects.toThrow(/retired/)
  expect(await f.owner.mutation(api.skillFoundry.handoff,{skillId:f.skillId,requestKey:'original'})).toBe(id)
  expect((await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})).checks).toHaveLength(2)
 })
 it('detects modified package and check evidence rather than trusting stored pass flags',async()=>{
  const f=await fixture();await f.ready()
  const d=await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})
  await f.t.run(c=>c.db.patch(d.checks[0]._id,{results:'{"summary":{"allPassed":true}}'}))
  expect((await f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})).acceptanceReady).toBe(false)
  await f.t.run(c=>c.db.patch(f.skillId,{packageSnapshot:'{}'}))
  await expect(f.owner.query(api.skillFoundry.detail,{skillId:f.skillId})).rejects.toThrow(/integrity/)
 })
})
