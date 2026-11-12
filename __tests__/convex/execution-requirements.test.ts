// @vitest-environment edge-runtime
import{describe,it,expect,vi,afterEach}from'vitest'
import{convexTest}from'convex-test'
import schema from'../../convex/schema'
import type{Id}from'../../convex/_generated/dataModel'
import{api}from'../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()})
async function fixture(){
 vi.useFakeTimers()
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const mission=(ownerKey='owner',status:'draft'|'complete'|'cancelled'='draft')=>t.run(ctx=>ctx.db.insert('missions',{ownerKey,title:'Safety fixture',mission:'Inspect governed execution',autonomy:'governed',budget:0,status,completion:0,approved:true}))
 const missionId=await mission(),foreign=await mission('other','complete')
 await t.run(ctx=>ctx.db.insert('portfolioDecisions',{missionId,priorityRank:1,action:'Execute approved mission',decision:'approve',createdAt:1}))
 const execute=()=>owner.mutation(api.portfolio.executeApprovedMission,{missionId,priorityRank:1,action:'Execute approved mission'})
 const effects=()=>t.run(async ctx=>({runs:await ctx.db.query('missionRuns').collect(),audit:await ctx.db.query('auditEvents').collect(),resources:await ctx.db.query('missionResources').collect(),jobs:await ctx.db.system.query('_scheduled_functions').collect()}))
 return{t,owner,other,missionId,foreign,mission,execute,effects}
}
describe('bounded execution requirements',()=>{
 it('admits only one dependency into the final slot under concurrent writes',async()=>{
  const{t,owner,missionId,mission}=await fixture()
  const prerequisites:Id<'missions'>[]=[]
  for(let i=0;i<21;i++)prerequisites.push(await mission('owner','complete'))
  await t.run(async ctx=>{for(const id of prerequisites.slice(0,19))await ctx.db.insert('missionDependencies',{missionId,dependsOnMissionId:id,kind:'blocks',createdAt:1})})
  const results=await Promise.allSettled(prerequisites.slice(19).map(dependsOnMissionId=>owner.mutation(api.orchestration.addDependency,{missionId,dependsOnMissionId,kind:'blocks'})))
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await t.run(ctx=>ctx.db.query('missionDependencies').collect())).toHaveLength(20)
 })
 it('preserves exact reservation replay at capacity and refuses mode conflicts and extra slots',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async ctx=>{for(let i=0;i<19;i++)await ctx.db.insert('missionResources',{missionId,resourceKey:'slot-'+i,mode:'shared',status:'requested'})})
  const results=await Promise.allSettled(['last-a','last-b'].map(resourceKey=>owner.mutation(api.orchestration.setResource,{missionId,resourceKey,mode:'shared'})))
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  const rows=await t.run(ctx=>ctx.db.query('missionResources').collect()),last=rows.find(r=>r.resourceKey.startsWith('last-'))!
  expect(await owner.mutation(api.orchestration.setResource,{missionId,resourceKey:last.resourceKey,mode:'shared'})).toBe(last._id)
  await expect(owner.mutation(api.orchestration.setResource,{missionId,resourceKey:last.resourceKey,mode:'exclusive'})).rejects.toThrow(/different resource mode/)
  await expect(owner.mutation(api.orchestration.setResource,{missionId,resourceKey:'overflow',mode:'shared'})).rejects.toThrow(/at most 20/)
  expect(await t.run(ctx=>ctx.db.query('missionResources').collect())).toEqual(rows)
 })
 it('refuses excessive legacy requirements before any reservation, run, audit or scheduling effect',async()=>{
  const{t,owner,missionId,foreign,execute,effects}=await fixture()
  await t.run(async ctx=>{for(let i=0;i<21;i++)await ctx.db.insert('missionDependencies',{missionId,dependsOnMissionId:foreign,kind:'informs',createdAt:1})})
  const before=await effects(),pre=await owner.query(api.orchestration.preflight,{missionId})
  expect(pre.ready).toBe(false);expect(pre.blockers.join(' ')).toMatch(/bounded safety review/)
  expect(await owner.mutation(api.orchestration.acquireForExecution,{missionId})).toMatchObject({acquired:false})
  await expect(execute()).rejects.toThrow(/bounded safety review/)
  expect(await effects()).toEqual(before)
 })
 it('blocks a foreign-owned completed dependency without disclosing its mission identity or status',async()=>{
  const{t,owner,missionId,foreign,execute,effects}=await fixture()
  await t.run(ctx=>ctx.db.insert('missionDependencies',{missionId,dependsOnMissionId:foreign,kind:'blocks',createdAt:1}))
  const before=await effects(),pre=await owner.query(api.orchestration.preflight,{missionId})
  expect(pre.ready).toBe(false);expect(JSON.stringify(pre)).not.toContain(foreign)
  expect(pre.blockers.join(' ')).toMatch(/unavailable or access denied/)
  await expect(execute()).rejects.toThrow(/access denied/)
  expect(await effects()).toEqual(before)
 })
 it('keeps cross-owner resource conflicts private while still preventing acquisition and execution',async()=>{
  const{t,owner,missionId,foreign,execute,effects}=await fixture()
  await t.run(async ctx=>{
   await ctx.db.insert('missionResources',{missionId,resourceKey:'shared-provider',mode:'exclusive',status:'requested'})
   await ctx.db.insert('missionResources',{missionId:foreign,resourceKey:'shared-provider',mode:'shared',status:'held',heldAt:1})
  })
  const before=await effects(),pre=await owner.query(api.orchestration.preflight,{missionId})
  expect(pre).toMatchObject({ready:false,resources:[{key:'shared-provider',available:false}]})
  expect(pre.resources[0]).not.toHaveProperty('heldByMission')
  expect(JSON.stringify(pre)).not.toContain(foreign)
  expect(await owner.mutation(api.orchestration.acquireForExecution,{missionId})).toMatchObject({acquired:false})
  await expect(execute()).rejects.toThrow(/resource conflict/)
  expect(await effects()).toEqual(before)
 })
 it('does not let released history consume active-holder capacity or erase prior reservations',async()=>{
  const{t,owner,missionId,foreign,execute}=await fixture()
  const ids=await t.run(async ctx=>{
   const ids:Id<'missionResources'>[]=[]
   for(let i=0;i<1000;i++)ids.push(await ctx.db.insert('missionResources',{missionId:foreign,resourceKey:'available-provider',mode:'exclusive',status:'released',releasedAt:1}))
   await ctx.db.insert('missionResources',{missionId,resourceKey:'available-provider',mode:'exclusive',status:'requested'})
   return ids
  })
  expect(await owner.query(api.orchestration.preflight,{missionId})).toMatchObject({ready:true,resources:[{available:true}]})
  expect(await execute()).toMatchObject({alreadyRunning:false})
  expect(await t.run(async ctx=>(await Promise.all(ids.map(id=>ctx.db.get(id)))).every(r=>r?.status==='released'))).toBe(true)
 })
 it('admits one exclusive holder across concurrent operators',async()=>{
  const{t,owner,other,missionId,foreign}=await fixture()
  await t.run(async ctx=>{
   await ctx.db.patch(foreign,{status:'draft'})
   for(const id of [missionId,foreign])await ctx.db.insert('missionResources',{missionId:id,resourceKey:'atomic-provider',mode:'exclusive',status:'requested'})
  })
  const results=await Promise.all([owner.mutation(api.orchestration.acquireForExecution,{missionId}),other.mutation(api.orchestration.acquireForExecution,{missionId:foreign})])
  expect(results.filter(r=>r.acquired)).toHaveLength(1)
  expect((await t.run(ctx=>ctx.db.query('missionResources').collect())).filter(r=>r.status==='held')).toHaveLength(1)
 })
 it('does not acquire or append audit history without current mission approval',async()=>{
  const{t,owner,missionId,effects}=await fixture()
  await t.run(async ctx=>{
   await ctx.db.patch(missionId,{approved:false})
   await ctx.db.insert('missionResources',{missionId,resourceKey:'approval-fixture',mode:'shared',status:'requested'})
  })
  const before=await effects()
  expect(await owner.mutation(api.orchestration.acquireForExecution,{missionId})).toMatchObject({acquired:false})
  expect(await effects()).toEqual(before)
 })
 it('refuses more than fifty active holders before effects',async()=>{
  const{t,owner,missionId,foreign,execute,effects}=await fixture()
  await t.run(async ctx=>{
   for(let i=0;i<51;i++)await ctx.db.insert('missionResources',{missionId:foreign,resourceKey:'busy-provider',mode:'shared',status:'held',heldAt:1})
   await ctx.db.insert('missionResources',{missionId,resourceKey:'busy-provider',mode:'shared',status:'requested'})
  })
  const before=await effects()
  expect(await owner.query(api.orchestration.preflight,{missionId})).toMatchObject({ready:false})
  await expect(execute()).rejects.toThrow(/bounded safety review/)
  expect(await effects()).toEqual(before)
 })
 it('finds an older escalation through resolved history and prevents every execution effect',async()=>{
  const{t,owner,missionId,execute,effects}=await fixture()
  await t.run(async ctx=>{
   await ctx.db.insert('incidents',{missionId,kind:'failure',stage:'retry_escalation',message:'Fixture',attempts:3,status:'escalated',createdAt:1})
   for(let i=0;i<200;i++)await ctx.db.insert('incidents',{missionId,kind:'history',stage:'test',message:'Resolved fixture',attempts:1,status:'resolved',createdAt:i+2})
  })
  const before=await effects()
  expect((await owner.query(api.orchestration.preflight,{missionId})).blockers.join(' ')).toMatch(/Autonomous restart blocked/)
  await expect(execute()).rejects.toThrow(/Autonomous restart blocked/)
  expect(await effects()).toEqual(before)
 })
 it('rejects terminal cancelled execution and enforces UTF-8 requirement inputs',async()=>{
  const{t,owner,other,missionId,mission,execute,effects}=await fixture(),prerequisite=await mission('owner','complete')
  await owner.mutation(api.orchestration.addDependency,{missionId,dependsOnMissionId:prerequisite,kind:'informs',note:'😀'.repeat(1024)})
  await expect(owner.mutation(api.orchestration.addDependency,{missionId,dependsOnMissionId:prerequisite,kind:'informs',note:'😀'.repeat(1025)})).rejects.toThrow(/4,096/)
  await owner.mutation(api.orchestration.setResource,{missionId,resourceKey:'😀'.repeat(60),mode:'shared'})
  await expect(owner.mutation(api.orchestration.setResource,{missionId,resourceKey:'😀'.repeat(61),mode:'shared'})).rejects.toThrow(/240/)
  await expect(other.query(api.orchestration.preflight,{missionId})).rejects.toThrow(/access denied/)
  await t.run(ctx=>ctx.db.patch(missionId,{status:'cancelled',approved:true}))
  const before=await effects()
  await expect(execute()).rejects.toThrow(/requires review/)
  expect(await effects()).toEqual(before)
 })
 it('discloses legacy mission windows and finds older review missions outside the newest hundred',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async ctx=>{
   await ctx.db.patch(missionId,{status:'review'})
   for(let i=0;i<101;i++)await ctx.db.insert('missions',{ownerKey:'owner',title:'Legacy '+i,mission:'Retained',autonomy:'governed',budget:0,status:'complete',completion:1,approved:true})
  })
  const snapshot=await owner.query(api.portfolio.decisionSnapshot,{})
  expect(snapshot).toMatchObject({recommendation:'review',historyScope:{complete:false},totalMissions:100})
  expect((await owner.query(api.portfolio.listReviewQueue,{})).map(r=>r._id)).toContain(missionId)
 })
 it('does not count cancelled missions as active',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(ctx=>ctx.db.patch(missionId,{status:'cancelled'}))
  expect(await owner.query(api.portfolio.decisionSnapshot,{})).toMatchObject({totalMissions:1,active:0,completed:0,historyScope:{complete:true}})
 })
})
