import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import type {Id} from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
const modules=import.meta.glob('../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const ids=await t.run(async c=>{const result:Id<'memories'>[]=[];for(let i=0;i<2;i++)result.push(await c.db.insert('memories',{ownerKey:'owner',category:'retrieval-evaluation',key:'retrieval-'+i,source:'server-observed-retrieval-operator-labels',confidence:0.5,value:JSON.stringify({version:'lesson-retrieval-v1',search:'distinct question '+i,missionId:null,expected:[{id:'relevant'}],baseline:{results:[]},candidate:{results:[{id:'relevant'}]}})}));return result})
 const args={kind:'retrieval' as const,sourceIds:ids,notes:'Controlled comparable tasks and operator-provided relevance labels.',comparabilityReviewed:true}
 return {t,owner,other,ids,args}
}
describe('private effectiveness review receipts',()=>{
 it('reviews matching reuse receipts without masking a regression behind lower mean cost',async()=>{
  const {t,owner}=await fixture()
  const sourceIds=await t.run(async c=>{const ids:Id<'memories'>[]=[];for(const [index,actual] of [5,11].entries())ids.push(await c.db.insert('memories',{ownerKey:'owner',category:'strategy-reuse-comparison',key:'reuse-'+index,source:'lesson-handoff-measurement-comparison',confidence:0.5,value:JSON.stringify({version:'strategy-reuse-v1',applied:true,lessonId:'lesson',strategyId:'strategy',direction:'lower',baseline:{id:'baseline-'+index,missionId:'baseline-mission',metric:'actual runtime cost',unit:'USD',target:10,actual:10},candidate:{id:'candidate-'+index,missionId:'candidate-mission-'+index,metric:'actual runtime cost',unit:'USD',target:10,actual}})}));return ids})
  const id=await owner.mutation(api.learningReviews.create,{kind:'reuse',sourceIds,notes:'Controlled comparable receipt fixtures, not real spending.',comparabilityReviewed:true})
  const report=JSON.parse((await owner.query(api.learningReviews.get,{id})).summary)
  expect(report.status).toBe('regression-observed');expect(report.metrics[0]).toMatchObject({benefitMean:2,improved:1,regressed:1})
 })
 it('snapshots selected sources and handles reordered identical selections idempotently',async()=>{
  const {t,owner,args,ids}=await fixture(),id=await owner.mutation(api.learningReviews.create,args)
  expect(await owner.mutation(api.learningReviews.create,{...args,sourceIds:[...ids].reverse()})).toBe(id)
  await t.run(c=>c.db.patch(ids[0],{value:'Changed original'}))
  const review=await owner.query(api.learningReviews.get,{id})
  expect(review.snapshots[0].value).not.toBe('Changed original')
  expect(JSON.parse(review.summary).status).toBe('improvement-observed')
 })
 it('denies anonymous and foreign receipt access, including selected sources',async()=>{
  const {t,owner,other,args}=await fixture(),id=await owner.mutation(api.learningReviews.create,args)
  for(const client of [t,other]){
   await expect(client.mutation(api.learningReviews.create,args)).rejects.toThrow()
   await expect(client.query(api.learningReviews.get,{id})).rejects.toThrow()
  }
  expect(await other.query(api.learningReviews.sources,{})).toEqual([])
  expect(await other.query(api.learningReviews.list,{})).toEqual([])
 })
 it('requires review attestation, enough unique sources and bounded notes',async()=>{
  const {owner,args,ids}=await fixture()
  for(const change of [{comparabilityReviewed:false},{notes:'short'},{notes:'x'.repeat(2001)},{sourceIds:[ids[0]]},{sourceIds:[ids[0],ids[0]]}]){
   await expect(owner.mutation(api.learningReviews.create,{...args,...change})).rejects.toThrow()
  }
 })
 it('rejects wrong categories and oversized frozen evidence',async()=>{
  const {t,owner,args,ids}=await fixture()
  await t.run(c=>c.db.patch(ids[0],{category:'learning-lesson'}))
  await expect(owner.mutation(api.learningReviews.create,args)).rejects.toThrow(/same evidence type/)
  await t.run(c=>c.db.patch(ids[0],{category:'retrieval-evaluation',value:'x'.repeat(300001)}))
  await expect(owner.mutation(api.learningReviews.create,args)).rejects.toThrow(/bounded review size/)
 })
 it('bounds twenty retained reviews with concurrent admission and allows retry at capacity',async()=>{
  const {t,owner,args}=await fixture(),first=await owner.mutation(api.learningReviews.create,args)
  await t.run(async c=>{const row=await c.db.get(first as Id<'learningReviews'>);if(!row)throw Error();const {_id,_creationTime,...fields}=row;for(let i=0;i<18;i++)await c.db.insert('learningReviews',{...fields,notes:'Existing controlled review '+i})})
  const results=await Promise.allSettled([owner.mutation(api.learningReviews.create,{...args,notes:'One final controlled review with matching tasks.'}),owner.mutation(api.learningReviews.create,{...args,notes:'Another final controlled review with matching tasks.'})])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await owner.query(api.learningReviews.list,{})).toHaveLength(20)
  expect(await owner.mutation(api.learningReviews.create,args)).toBe(first)
 })
})
