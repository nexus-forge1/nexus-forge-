// @vitest-environment edge-runtime
import {describe,it,expect,vi,afterEach} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../convex/schema'
import type {Id} from '../convex/_generated/dataModel'
import {api} from '../convex/_generated/api'
import {normalizeStrategy,strategySummary} from '../convex/portfolioStrategyModel'
const modules=import.meta.glob('../convex/**/*.ts')
afterEach(()=>vi.useRealTimers())
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'strategy-owner'}),other=t.withIdentity({subject:'strategy-other'})
 const templateId=await owner.mutation(api.studio.saveTemplate,{title:'Strategy fixture',brief:'Review controlled portfolio evidence only.',audience:'Controlled fixtures',criteria:['No execution authority'],budget:0}),p=await owner.mutation(api.studio.startProject,{templateId,title:'Strategy fixture'})
 const now=Date.now(),input={periodStart:now-2*86400000,periodEnd:now-86400000,reviewAt:now+86400000,operatingCostUsd:20,operatorHours:3,actualsReference:'Controlled actuals fixture source',demandAssessment:'Controlled paid-demand fixture only',deliveryRisk:'Controlled support risk remains unknown',unresolvedAssumptions:'Repeatable demand is not established',nextExperiment:'Interview a bounded target audience',proposedBudgetUsd:10,proposedHours:2,successCondition:'Continue only with verified repeat demand',stopCondition:'Pause if verified demand remains absent'}
 async function outcome(metric='revenue-usd',actual=100){return t.run(async ctx=>{const mission=await ctx.db.get(p.missionId as Id<'missions'>);return ctx.db.insert('productOutcomes',{ownerKey:mission!.ownerKey,missionId:p.missionId,metric:metric as 'revenue-usd',observed:actual,actual,target:50,unit:'USD',direction:'higher',targetMet:true,sampleSize:100,periodStart:input.periodStart,periodEnd:input.periodEnd,method:'Controlled fixture, never production data.',evidence:['Controlled source reference'],notes:'Synthetic unit-test evidence only.',recordedAt:Date.now(),provenance:'operator-recorded'})})}
 const source=()=>owner.query(api.portfolioStrategy.source,{projectId:p.projectId})
 async function args(){return{projectId:p.projectId,requestKey:'review-1',expectedSourceDigest:(await source()).sourceDigest,decision:'pause' as const,reason:'Pause pending independently verified demand.',...input}}
 return{t,owner,other,...p,input,outcome,source,args}
}
describe('portfolio strategic review boundaries',()=>{
 it('keeps unknowns unknown and does not sum overlapping or duplicate reports',()=>{
 const now=Date.now(),a={periodStart:1,periodEnd:2,operatingCostUsd:null,operatorHours:null} as Parameters<typeof strategySummary>[1],rows=[{_id:'a',metric:'revenue-usd',actual:10,unit:'USD',periodStart:1,periodEnd:2,provenance:'operator-recorded',recordedAt:1},{_id:'b',metric:'revenue-usd',actual:20,unit:'USD',periodStart:1,periodEnd:2,provenance:'operator-recorded',recordedAt:2}]
 const s=strategySummary(rows,a,now,true);expect(s.selected[0].source?.actual).toBe(20);expect(s.canContinue).toBe(false);expect(s.holds.join(' ')).toMatch(/reconciliation/);expect(s.accountingVerified).toBe(false)
 })
 it('validates reported actual references, numeric limits and future review dates',async()=>{
 const f=await fixture();expect(()=>normalizeStrategy({...f.input,actualsReference:''},Date.now())).toThrow(/reference/);expect(()=>normalizeStrategy({...f.input,operatorHours:NaN},Date.now())).toThrow(/resource/);expect(()=>normalizeStrategy({...f.input,reviewAt:1},Date.now())).toThrow(/90 days/)
 })
 it('retains missing evidence under pause and cannot elevate it to continue',async()=>{
 const f=await fixture(),a=await f.args();const id=await f.owner.mutation(api.portfolioStrategy.record,a);expect(id).toBeTruthy()
 await expect(f.owner.mutation(api.portfolioStrategy.record,{...a,requestKey:'continue',decision:'continue'})).rejects.toThrow(/HOLD/)
 const r=await f.owner.query(api.portfolioStrategy.list,{projectId:f.projectId});expect(JSON.parse(r[0].snapshot).summary.holds).toContain('No product outcomes match the exact actuals window')
 })
 it('requires current exact sources and leaves mission authority untouched',async()=>{
 const f=await fixture(),before=await f.t.run(ctx=>ctx.db.get(f.missionId)),a=await f.args();await f.outcome()
 await expect(f.owner.mutation(api.portfolioStrategy.record,a)).rejects.toThrow(/evidence changed/)
 const b={...await f.args(),decision:'continue' as const};await f.owner.mutation(api.portfolioStrategy.record,b)
 expect(await f.t.run(ctx=>ctx.db.get(f.missionId))).toEqual(before)
 const rows=await f.owner.query(api.portfolioStrategy.list,{projectId:f.projectId});expect(JSON.parse(rows[0].snapshot).summary.canContinue).toBe(true)
 })
 it('retains immutable retries after review expiry and refuses conflicting keys',async()=>{
 const f=await fixture(),a={...await f.args(),reason:'  Pause pending independently verified demand.  '},id=await f.owner.mutation(api.portfolioStrategy.record,a)
 vi.useFakeTimers();vi.setSystemTime(Date.now()+3*86400000)
 expect(await f.owner.mutation(api.portfolioStrategy.record,a)).toBe(id)
 await expect(f.owner.mutation(api.portfolioStrategy.record,{...a,decision:'stop'})).rejects.toThrow(/immutable/)
 })
 it('isolates project sources, history, mutations and anonymous callers',async()=>{
 const f=await fixture(),a=await f.args()
 for(const client of [f.other,f.t]){
 await expect(client.query(api.portfolioStrategy.source,{projectId:f.projectId})).rejects.toThrow()
 await expect(client.query(api.portfolioStrategy.list,{projectId:f.projectId})).rejects.toThrow()
 await expect(client.mutation(api.portfolioStrategy.record,a)).rejects.toThrow()
 }
 expect((await f.other.query(api.portfolioStrategy.overview,{})).rows).toEqual([])
 })
 it('blocks continue for stale, duplicate or bounded partial history',async()=>{
 const f=await fixture();await f.outcome();await f.outcome()
 await expect(f.owner.mutation(api.portfolioStrategy.record,{...await f.args(),decision:'continue'})).rejects.toThrow(/reconciliation/)
 for(let i=0;i<19;i++)await f.outcome('active-users',i)
 const d=await f.source();expect(JSON.parse(d.snapshot).complete).toBe(false)
 await expect(f.owner.mutation(api.portfolioStrategy.record,{...await f.args(),decision:'continue'})).rejects.toThrow(/safe review scope/)
 const s=strategySummary([],f.input,Date.now()+40*86400000,true);expect(s.holds.join(' ')).toMatch(/older than 30 days/)
 })
 it('compares latest retained per-project proposals without applying resources',async()=>{
 const f=await fixture(),a=await f.args();await f.owner.mutation(api.portfolioStrategy.record,a)
 await f.owner.mutation(api.portfolioStrategy.record,{...a,requestKey:'review-2',decision:'pivot',proposedBudgetUsd:50})
 const d=await f.owner.query(api.portfolioStrategy.overview,{});expect(d.complete).toBe(true);expect(d.rows[0].review?.decision).toBe('pivot');expect(JSON.parse(d.rows[0].review!.input).proposedBudgetUsd).toBe(50)
 })
})
