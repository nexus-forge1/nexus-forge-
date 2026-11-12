import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const snapshot=JSON.stringify({name:'Pilot product',unverifiedAssumptions:'People will complete the task'})
 const strategyId=await t.run(c=>c.db.insert('memories',{ownerKey:'owner',category:'manifest-strategy',key:'blueprint:strategy:1',value:snapshot,confidence:0.5,source:'proposal'}))
 const args={strategyId,assumption:'People will complete the task',action:'Run an observed pilot with consenting testers',metric:'Completed tasks',unit:'tasks',target:5,direction:'at_least' as const,reviewWithinDays:7,stopCondition:'Stop when any privacy issue is reported'}
 return {t,owner,other,strategyId,args,snapshot}
}
describe('opportunity validation plans',()=>{
 it('preserves frozen context and idempotent identical submissions',async()=>{
  const {t,owner,args,strategyId,snapshot}=await fixture()
  const id=await owner.mutation(api.opportunityPlans.create,args)
  expect(await owner.mutation(api.opportunityPlans.create,args)).toBe(id)
  await t.run(c=>c.db.patch(strategyId,{value:JSON.stringify({name:'Changed strategy'})}))
  const rows=await owner.query(api.opportunityPlans.list,{strategyId})
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({...args,strategySnapshot:snapshot,strategyKey:'blueprint:strategy:1',ownerKey:'owner'})
 })
 it('requires authentication and private ownership for reads and writes',async()=>{
  const {t,owner,other,args,strategyId}=await fixture();await owner.mutation(api.opportunityPlans.create,args)
  for(const client of [t,other]){
   await expect(client.mutation(api.opportunityPlans.create,args)).rejects.toThrow()
   await expect(client.query(api.opportunityPlans.list,{strategyId})).rejects.toThrow()
  }
 })
 it('rejects wrong memory categories and malformed strategy context',async()=>{
  const {t,owner,args,strategyId}=await fixture()
  for(const value of ['not json','null','{}']){
   await t.run(c=>c.db.patch(strategyId,{value}))
   await expect(owner.mutation(api.opportunityPlans.create,args)).rejects.toThrow(/requires review/)
  }
  await t.run(c=>c.db.patch(strategyId,{category:'lesson'}))
  await expect(owner.mutation(api.opportunityPlans.create,args)).rejects.toThrow(/access denied/)
 })
 it('rejects nonfinite and extreme targets or nonintegral review periods',async()=>{
  const {owner,args}=await fixture()
  for(const target of [NaN,Infinity,-Infinity,1e12+1])await expect(owner.mutation(api.opportunityPlans.create,{...args,target})).rejects.toThrow()
  for(const reviewWithinDays of [0,366,1.5,NaN])await expect(owner.mutation(api.opportunityPlans.create,{...args,reviewWithinDays})).rejects.toThrow()
 })
 it('accepts zero and negative finite targets with explicit units',async()=>{
  const {owner,args,strategyId}=await fixture()
  await owner.mutation(api.opportunityPlans.create,{...args,target:0,direction:'at_most'})
  await owner.mutation(api.opportunityPlans.create,{...args,target:-2,unit:'net change'})
  expect(await owner.query(api.opportunityPlans.list,{strategyId})).toHaveLength(2)
 })
 it('requires bounded operational and stop criteria',async()=>{
  const {owner,args}=await fixture()
  for(const change of [{action:'short'},{assumption:'x'.repeat(1501)},{metric:'x'},{unit:' '},{stopCondition:' '}]){
   await expect(owner.mutation(api.opportunityPlans.create,{...args,...change})).rejects.toThrow()
  }
 })
 it('serializes capacity at twenty plans while allowing identical retry',async()=>{
  const {t,owner,args,strategyId,snapshot}=await fixture()
  await t.run(async c=>{for(let i=0;i<19;i++)await c.db.insert('opportunityPlans',{...args,action:'Existing validation '+i,ownerKey:'owner',strategyKey:'blueprint:strategy:1',strategySnapshot:snapshot,createdAt:100})})
  const attempts=await Promise.allSettled([owner.mutation(api.opportunityPlans.create,args),owner.mutation(api.opportunityPlans.create,{...args,action:'A different final validation action'})])
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  const rows=await owner.query(api.opportunityPlans.list,{strategyId});expect(rows).toHaveLength(20)
  const last=rows.find(r=>r.action===args.action||r.action==='A different final validation action')!
  expect(await owner.mutation(api.opportunityPlans.create,{...args,action:last.action})).toBe(last._id)
 })
})
