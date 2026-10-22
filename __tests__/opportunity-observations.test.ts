import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import type {Id} from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(direction:'at_least'|'at_most'='at_least'){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const strategyId=await t.run(c=>c.db.insert('memories',{ownerKey:'owner',category:'manifest-strategy',key:'b:strategy:1',value:'{"name":"Pilot"}',confidence:0.5,source:'fixture'}))
 const planId=await t.run(c=>c.db.insert('opportunityPlans',{ownerKey:'owner',strategyId,strategyKey:'b:strategy:1',strategySnapshot:'{"name":"Pilot"}',assumption:'A measurable assumption',action:'Perform controlled local test',metric:'Completed tasks',unit:'tasks',target:5,direction,reviewWithinDays:7,stopCondition:'Stop on a safety finding',createdAt:100}))
 const args={planId,actual:5,sampleSize:10,periodStart:100,periodEnd:200,complete:true,stopTriggered:false,method:'Count completed tasks from the bounded test log',evidence:'Controlled log fixture; not actual customer outcomes'}
 return {t,owner,other,planId,strategyId,args}
}
describe('plan-linked measured observations',()=>{
 it.each(['at_least','at_most'] as const)('accepts the exact frozen threshold for %s without changing strategy state',async direction=>{
  const {t,owner,args,planId,strategyId}=await fixture(direction)
  await owner.mutation(api.opportunityObservations.record,args)
  const rows=await owner.query(api.opportunityObservations.list,{planId})
  expect(rows[0]).toMatchObject({actual:5,target:5,direction,status:'passed',metric:'Completed tasks',unit:'tasks',late:false})
  expect((await t.run(c=>c.db.get(strategyId)))!.value).toBe('{"name":"Pilot"}')
 })
 it('retains target failures, stops, partial data and late windows separately',async()=>{
  const {owner,args,planId}=await fixture()
  await owner.mutation(api.opportunityObservations.record,{...args,actual:4})
  await owner.mutation(api.opportunityObservations.record,{...args,stopTriggered:true})
  await owner.mutation(api.opportunityObservations.record,{...args,complete:false})
  await owner.mutation(api.opportunityObservations.record,{...args,periodEnd:100+8*86400000})
  const rows=await owner.query(api.opportunityObservations.list,{planId})
  expect(rows).toHaveLength(4)
  expect(rows.map(r=>r.status).sort()).toEqual(['failed','failed','inconclusive','inconclusive'])
  expect(rows.find(r=>r.stopTriggered)?.nextAction).toContain('Stop and review')
  expect(rows.find(r=>r.late)?.nextAction).toContain('outside')
 })
 it('preserves the observed target snapshot and makes identical retry idempotent',async()=>{
  const {t,owner,args,planId}=await fixture()
  const id=await owner.mutation(api.opportunityObservations.record,args)
  expect(await owner.mutation(api.opportunityObservations.record,args)).toBe(id)
  await t.run(c=>c.db.patch(planId,{target:999,metric:'Changed metric'}))
  expect((await owner.query(api.opportunityObservations.list,{planId}))[0]).toMatchObject({target:5,metric:'Completed tasks',status:'passed'})
 })
 it('denies anonymous and foreign reads and writes',async()=>{
  const {t,other,args,planId}=await fixture()
  for(const client of [t,other]){
   await expect(client.mutation(api.opportunityObservations.record,args)).rejects.toThrow()
   await expect(client.query(api.opportunityObservations.list,{planId})).rejects.toThrow()
  }
 })
 it('rejects post-hoc, future, malformed and incomplete-complete measurements',async()=>{
  const {owner,args}=await fixture()
  for(const change of [{periodStart:99},{periodEnd:100},{periodEnd:Date.now()+100000},{actual:NaN},{actual:Infinity},{actual:1e12+1},{sampleSize:1.5},{sampleSize:-1},{sampleSize:0},{method:'short'},{evidence:'short'}]){
   await expect(owner.mutation(api.opportunityObservations.record,{...args,...change})).rejects.toThrow()
  }
 })
 it('allows an explicit unmeasured partial receipt with no fabricated zero',async()=>{
  const {owner,args,planId}=await fixture()
  await owner.mutation(api.opportunityObservations.record,{...args,actual:undefined,sampleSize:0,complete:false})
  expect((await owner.query(api.opportunityObservations.list,{planId}))[0]).toMatchObject({status:'inconclusive',sampleSize:0})
  expect((await owner.query(api.opportunityObservations.list,{planId}))[0].actual).toBeUndefined()
 })
 it('keeps conflicting measurements rather than overwriting the earlier receipt',async()=>{
  const {owner,args,planId}=await fixture()
  await owner.mutation(api.opportunityObservations.record,args)
  await owner.mutation(api.opportunityObservations.record,{...args,actual:1,evidence:'Corrected independent log entry, retaining earlier report'})
  expect((await owner.query(api.opportunityObservations.list,{planId})).map(r=>r.status).sort()).toEqual(['failed','passed'])
 })
 it('serializes the fifty-receipt limit and permits retry at capacity',async()=>{
  const {t,owner,args,planId}=await fixture()
  const first=await owner.mutation(api.opportunityObservations.record,args)
  await t.run(async c=>{const row=await c.db.get(first as Id<'opportunityObservations'>);if(!row)throw Error();const {_id,_creationTime,...fields}=row;for(let i=0;i<48;i++)await c.db.insert('opportunityObservations',{...fields,evidence:'Existing controlled observation '+i})})
  const attempts=await Promise.allSettled([owner.mutation(api.opportunityObservations.record,{...args,actual:6}),owner.mutation(api.opportunityObservations.record,{...args,actual:7})])
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await owner.query(api.opportunityObservations.list,{planId})).toHaveLength(50)
  expect(await owner.mutation(api.opportunityObservations.record,args)).toBe(first)
 })
})
