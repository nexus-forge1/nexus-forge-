import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts')
describe('untrusted saved mission selection',()=>{
 it('returns owned missions and hides foreign, deleted and malformed selections identically',async()=>{
  const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
  const id=await t.run(c=>c.db.insert('missions',{title:'Selection fixture',mission:'Controlled selection fixture',autonomy:'supervised',budget:0,status:'draft',completion:0,approved:false,ownerKey:'owner'}))
  expect(await owner.query(api.missions.selection,{id})).toMatchObject({_id:id,title:'Selection fixture'})
  expect(await other.query(api.missions.selection,{id})).toBeNull()
  for(const invalid of ['not-a-mission','', 'x'.repeat(1000)])expect(await owner.query(api.missions.selection,{id:invalid})).toBeNull()
  await expect(other.query(api.missions.getById,{id})).rejects.toThrow(/Mission not found or access denied/)
  await t.run(c=>c.db.delete(id))
  expect(await owner.query(api.missions.selection,{id})).toBeNull()
  await expect(owner.query(api.missions.getById,{id})).rejects.toThrow(/Mission not found or access denied/)
 })
 it('requires authentication even for invalid selections',async()=>{
  const t=convexTest(schema,modules)
  await expect(t.query(api.missions.selection,{id:'invalid'})).rejects.toThrow(/Authenticated operator session required/)
 })
})
