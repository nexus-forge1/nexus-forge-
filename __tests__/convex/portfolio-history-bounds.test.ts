// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
import {boundedHistory,historyBudget,includeHistoryRow,HISTORY_LIMITS} from '../../convex/portfolioHistory'
const modules=import.meta.glob('../../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const missionId=await t.run(ctx=>ctx.db.insert('missions',{ownerKey:'owner',title:'History fixture',mission:'Inspect retained evidence',autonomy:'governed',budget:0,status:'draft',completion:0,approved:false}))
 return{t,owner,other,missionId}
}
describe('bounded portfolio history',()=>{
 it('keeps small summaries complete, isolates owners and rejects anonymous reads',async()=>{
  const{t,owner,other,missionId}=await fixture()
  await t.run(ctx=>ctx.db.insert('measurements',{missionId,metric:'actual runtime cost',actual:3,target:5,unit:'USD',status:'pass',evidence:['Fixture'],createdAt:1}))
  const own=await owner.query(api.portfolio.learningSnapshot,{})
  expect(own).toMatchObject({missionsObserved:1,measuredOutcomes:1,actualRuntimeCost:3,runtimeCostRecords:1,historyScope:{complete:true}})
  expect(await other.query(api.portfolio.learningSnapshot,{})).toMatchObject({missionsObserved:0,measuredOutcomes:0,actualRuntimeCost:0,historyScope:{complete:true}})
  expect(await other.query(api.portfolio.listDecisions,{})).toEqual([])
  await expect(t.query(api.portfolio.learningSnapshot,{})).rejects.toThrow(/Authenticated/)
  await expect(t.query(api.portfolio.nextOpportunity,{})).rejects.toThrow(/Authenticated/)
  await expect(t.query(api.portfolio.listDecisions,{})).rejects.toThrow(/Authenticated/)
 })
 it('labels a record-limited learning sample and preserves every retained measurement',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async ctx=>{for(let i=0;i<600;i++)await ctx.db.insert('measurements',{missionId,metric:'actual runtime cost',actual:1,target:1,unit:'USD',status:'pass',evidence:['Fixture '+i],createdAt:i})})
  const result=await owner.query(api.portfolio.learningSnapshot,{})
  expect(result.historyScope).toMatchObject({complete:false,recordsRead:500,recordLimit:500})
  expect(result.historyScope?.note).toMatch(/only this sample/)
  expect(result.measuredOutcomes).toBe(499)
  expect(result.actualRuntimeCost).toBe(499)
  expect(await t.run(ctx=>ctx.db.query('measurements').collect())).toHaveLength(600)
 })
 it('stops on encoded-payload exhaustion and does not count omitted evidence',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async ctx=>{for(let i=0;i<8;i++)await ctx.db.insert('measurements',{missionId,metric:'cost',actual:1,target:1,unit:'USD',status:'pass',evidence:['x'.repeat(600000)],createdAt:i})})
  const result=await owner.query(api.portfolio.learningSnapshot,{})
  expect(result.historyScope?.complete).toBe(false)
  expect(result.historyScope!.encodedBytes).toBeLessThanOrEqual(HISTORY_LIMITS.bytes)
  expect(result.measuredOutcomes).toBeLessThan(8)
  expect(result.measuredOutcomes).toBeGreaterThan(0)
  expect(await t.run(ctx=>ctx.db.query('measurements').collect())).toHaveLength(8)
 })
 it('selects latest by recorded timestamp rather than insertion order and does not require all child history',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async ctx=>{
   await ctx.db.insert('measurements',{missionId,metric:'Newest exact evidence',actual:1,target:1,unit:'ratio',status:'pass',evidence:['Fixture'],createdAt:1000})
   for(let i=0;i<600;i++)await ctx.db.insert('measurements',{missionId,metric:'Older backfilled evidence',actual:0,target:1,unit:'ratio',status:'fail',evidence:['Fixture'],createdAt:i})
   for(let i=0;i<8;i++)await ctx.db.insert('memories',{ownerKey:'owner',category:'learning-lesson',key:'lesson-'+i,value:'Retained lesson',confidence:.5,source:'fixture'})
  })
  const next=await owner.query(api.portfolio.nextOpportunity,{})
  expect(next).toMatchObject({title:'Reuse the verified delivery pattern',blockedByReview:false,historyScope:{complete:true}})
  expect(next.evidence.join(' ')).toContain('Newest exact evidence')
  expect(next.evidence.join(' ')).not.toContain('Older backfilled evidence')
 })
 it('blocks next-opportunity advice when the owner mission window is incomplete',async()=>{
  const{t,owner}=await fixture()
  await t.run(async ctx=>{for(let i=0;i<100;i++)await ctx.db.insert('missions',{ownerKey:'owner',title:'Legacy history '+i,mission:'Retained legacy mission',autonomy:'governed',budget:0,status:i===0?'review':'draft',completion:0,approved:false})})
  const result=await owner.query(api.portfolio.nextOpportunity,{})
  expect(result).toMatchObject({blockedByReview:true,requiresHumanDecision:true,historyScope:{complete:false}})
  expect(result.title).toContain('Review mission history')
  expect(result.evidence).toEqual([])
 })
 it('keeps the legacy aggregate exact or denies it, while selected mission history remains available',async()=>{
  const{t,owner,other,missionId}=await fixture()
  await t.run(async ctx=>{for(let i=0;i<600;i++)await ctx.db.insert('portfolioDecisions',{missionId,priorityRank:1,action:'Fixture',decision:'defer',createdAt:i})})
  await expect(owner.query(api.portfolio.listDecisions,{})).rejects.toThrow(/Select a mission/)
  expect(await owner.query(api.portfolio.listDecisions,{missionId})).toHaveLength(50)
  await expect(other.query(api.portfolio.listDecisions,{missionId})).rejects.toThrow(/access denied/)
  expect(await t.run(ctx=>ctx.db.query('portfolioDecisions').collect())).toHaveLength(600)
 })
 it('bounds new decisions in UTF-8 without changing exact approval action text',async()=>{
  const{t,owner,other,missionId}=await fixture()
  const valid={missionId,priorityRank:100,action:'😀'.repeat(60),decision:'approve' as const,note:'😀'.repeat(1024)}
  const id=await owner.mutation(api.portfolio.recordDecision,valid)
  expect(await t.run(ctx=>ctx.db.get(id))).toMatchObject(valid)
  for(const change of [{priorityRank:0},{priorityRank:1.5},{priorityRank:101},{action:valid.action+'x'},{action:' '},{note:valid.note+'x'}])await expect(owner.mutation(api.portfolio.recordDecision,{...valid,...change})).rejects.toThrow(/UTF-8/)
  await expect(other.mutation(api.portfolio.recordDecision,valid)).rejects.toThrow(/access denied/)
  expect(await t.run(ctx=>ctx.db.query('portfolioDecisions').collect())).toHaveLength(1)
 })
 it('rejects oversized review notes before changing approval, status or audit history',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(ctx=>ctx.db.patch(missionId,{status:'review',approved:true}))
  const before=await t.run(ctx=>ctx.db.get(missionId))
  await expect(owner.mutation(api.portfolio.resolveReview,{missionId,decision:'reopen',note:'😀'.repeat(1025)})).rejects.toThrow(/4,096/)
  expect(await t.run(ctx=>ctx.db.get(missionId))).toEqual(before)
  expect(await t.run(ctx=>ctx.db.query('auditEvents').collect())).toEqual([])
  await owner.mutation(api.portfolio.resolveReview,{missionId,decision:'reopen',note:'😀'.repeat(1024)})
  expect(await t.run(ctx=>ctx.db.get(missionId))).toMatchObject({status:'draft',approved:false})
  expect(await t.run(ctx=>ctx.db.query('auditEvents').collect())).toHaveLength(1)
 })
 it('stops consuming subsequent streams after byte exhaustion',async()=>{
  const budget=historyBudget();let reads=0
  async function* rows(){for(let i=0;i<10;i++){reads++;yield{value:'x'.repeat(1000000)}}}
  await boundedHistory(rows(),budget)
  const before=reads
  expect(budget.complete).toBe(false);expect(budget.exhausted).toBe(true)
  await boundedHistory(rows(),budget)
  expect(reads).toBe(before)
  expect(includeHistoryRow(budget,{value:'small'})).toBe(false)
 })
})
