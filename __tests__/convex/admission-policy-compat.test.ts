// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
describe('resource policy compatibility',()=>{
 it('keeps mission/manual defaults independent of older experiment settings and preserves them on legacy updates',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'})
  await owner.mutation(api.frontierControls.setPolicy,{maxRecords:1,maxMediaBytes:1024})
  for(const id of ['missions','manual-memory']as const)expect(await owner.query(api.resourceCapacity.collection,{id})).toMatchObject({limit:100,count:0})
  for(const title of ['First mission','Second mission'])await owner.mutation(api.missions.create,{ownerKey:'ignored',title,mission:'Controlled policy compatibility mission',autonomy:'Draft only',budget:0})
  await owner.mutation(api.frontierControls.setPolicy,{maxRecords:1,maxMediaBytes:1024,maxMissions:2,maxManualSaves:3})
  await owner.mutation(api.frontierControls.setPolicy,{maxRecords:2,maxMediaBytes:1024})
  expect(await owner.query(api.resourceCapacity.collection,{id:'missions'})).toMatchObject({limit:2,count:2,blocked:true})
  expect(await owner.query(api.resourceCapacity.collection,{id:'manual-memory'})).toMatchObject({limit:3,count:0})
 })
 it('retains policy timestamps and audit rows when an identical save changes nothing',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'})
  const args={maxRecords:2,maxMediaBytes:1024,maxMissions:3,maxManualSaves:4}
  await owner.mutation(api.frontierControls.setPolicy,args)
  const before=await owner.query(api.frontierControls.overview,{})
  await owner.mutation(api.frontierControls.setPolicy,args)
  const after=await owner.query(api.frontierControls.overview,{})
  expect(after.policy).toEqual(before.policy)
  expect(after.audit).toEqual(before.audit)
 })
 it('rejects invalid independent limits without creating policy or audit rows',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'})
  for(const key of ['maxMissions','maxManualSaves'])for(const n of [0,101,1.5,NaN,Infinity]){
   await expect(owner.mutation(api.frontierControls.setPolicy,{maxRecords:2,maxMediaBytes:1024,[key]:n})).rejects.toThrow()
  }
  expect(await t.run(c=>c.db.query('resiliencePolicies').collect())).toEqual([])
  expect(await t.run(c=>c.db.query('frontierAudits').collect())).toEqual([])
 })
})
