// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
const note={category:'learning-lesson',key:'controlled note',value:'Bounded manual note fixture',confidence:.5,source:'operator'}
const mission={title:'Controlled admission',mission:'A controlled local-only mission',autonomy:'Draft only',budget:0,ownerKey:'ignored'}
async function fixture(limit=1){const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'});await owner.mutation(api.frontierControls.setPolicy,{maxRecords:limit,maxMediaBytes:1024,maxMissions:limit,maxManualSaves:limit});return{t,owner,other}}
describe('atomic mission and manual memory admission',()=>{
 it('admits only one concurrent mission across ordinary and portfolio paths and isolates owner keys',async()=>{
  const{t,owner,other}=await fixture()
  const results=await Promise.allSettled([owner.mutation(api.missions.create,mission),owner.mutation(api.portfolio.createRecommendedMission,{title:mission.title,mission:mission.mission,ownerKey:'other'})])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await t.run(c=>c.db.query('missions').withIndex('by_owner',q=>q.eq('ownerKey','owner')).collect())).toHaveLength(1)
  expect((await other.query(api.resourceCapacity.collection,{id:'missions'})).count).toBe(0)
  await other.mutation(api.missions.create,mission)
  expect((await other.query(api.resourceCapacity.collection,{id:'missions'})).count).toBe(1)
 })
 it('blocks all three entry points at capacity without accepting a recommendation or rewriting old missions',async()=>{
  const{t,owner}=await fixture()
  const id=await owner.mutation(api.missions.create,mission)
  const recommendation=await t.run(c=>c.db.insert('opportunityRecommendations',{ownerKey:'owner',title:'Controlled opportunity',mission:mission.mission,rationale:['Controlled'],evidence:['https://example.com'],status:'recommended',createdAt:1}))
  const before=await t.run(c=>c.db.get(id))
  await expect(owner.mutation(api.missions.create,mission)).rejects.toThrow(/Mission record limit/)
  await expect(owner.mutation(api.portfolio.createRecommendedMission,{title:mission.title,mission:mission.mission,ownerKey:'owner'})).rejects.toThrow(/Mission record limit/)
  await expect(owner.mutation(api.portfolio.acceptRecommendation,{id:recommendation})).rejects.toThrow(/Mission record limit/)
  expect(await t.run(c=>c.db.get(id))).toEqual(before)
  expect(await t.run(c=>c.db.get(recommendation))).toMatchObject({status:'recommended'})
  expect(await t.run(c=>c.db.query('research').collect())).toEqual([])
 })
 it('validates portfolio mission sizes and denies anonymous access before admitting records',async()=>{
  const{t,owner}=await fixture()
  await expect(owner.mutation(api.portfolio.createRecommendedMission,{title:'x'.repeat(161),mission:mission.mission,ownerKey:'owner'})).rejects.toThrow(/title/)
  await expect(owner.mutation(api.portfolio.createRecommendedMission,{title:mission.title,mission:'x'.repeat(30001),ownerKey:'owner'})).rejects.toThrow(/characters/)
  await expect(t.mutation(api.missions.create,mission)).rejects.toThrow(/Authenticated/)
  await expect(t.mutation(api.memory.remember,note)).rejects.toThrow(/Authenticated/)
  expect((await owner.query(api.resourceCapacity.collection,{id:'missions'})).count).toBe(0)
 })
 it('retains historical memory, admits one concurrent manual save and keeps generated saves independent',async()=>{
  const{t,owner}=await fixture()
  const old=await t.run(c=>c.db.insert('memories',{ownerKey:'owner',...note,key:'Historical retained note'}))
  const before=await t.run(c=>c.db.get(old))
  const results=await Promise.allSettled([1,2].map(n=>owner.mutation(api.memory.remember,{...note,key:'New note '+n})))
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await t.run(c=>c.db.query('manualMemoryAdmissions').collect())).toHaveLength(1)
  expect(await t.run(c=>c.db.get(old))).toEqual(before)
  await expect(owner.mutation(api.memory.remember,{...note,category:'other-category'})).rejects.toThrow(/Manual memory admission limit/)
  await t.mutation(internal.memory.rememberInternal,{...note,ownerKey:'owner',key:'Generated retained evidence'})
  expect((await owner.query(api.resourceCapacity.collection,{id:'manual-memory'}))).toMatchObject({count:1,limit:1,blocked:true})
  expect(await t.run(c=>c.db.query('memories').collect())).toHaveLength(3)
 })
 it('rejects oversized UTF-8 content, metadata and nonfinite confidence without consuming an admission',async()=>{
  const{t,owner}=await fixture()
  for(const change of [{value:'😀'.repeat(16385)},{category:'x'.repeat(101)},{key:'x'.repeat(241)},{source:'x'.repeat(201)},{confidence:NaN},{confidence:Infinity},{applicability:'x'.repeat(4097)},{evidenceReferences:Array(9).fill('reference')},{evidenceReferences:['x'.repeat(1025)]}]){
   await expect(owner.mutation(api.memory.remember,{...note,...change})).rejects.toThrow()
  }
  expect(await t.run(c=>c.db.query('manualMemoryAdmissions').collect())).toEqual([])
  const value='😀'.repeat(16384),id=await owner.mutation(api.memory.remember,{...note,value})
  expect(await t.run(c=>c.db.get(id))).toMatchObject({value})
 })
 it('denies foreign mission-bound manual saves without consuming either owner capacity',async()=>{
  const{t,owner,other}=await fixture()
  const id=await other.mutation(api.missions.create,mission)
  await expect(owner.mutation(api.memory.remember,{...note,missionId:id})).rejects.toThrow(/access denied/)
  expect(await t.run(c=>c.db.query('manualMemoryAdmissions').collect())).toEqual([])
  await owner.mutation(api.memory.remember,note)
  expect((await other.query(api.resourceCapacity.collection,{id:'manual-memory'})).count).toBe(0)
 })
})
