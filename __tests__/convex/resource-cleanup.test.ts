// @vitest-environment edge-runtime
import{describe,it,expect,vi,afterEach}from'vitest'
import{convexTest}from'convex-test'
import schema from'../../convex/schema'
import{api,internal}from'../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()})
async function fixture(held=0,large=false){
 vi.useFakeTimers()
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const missionId=await t.run(async ctx=>{
  const id=await ctx.db.insert('missions',{ownerKey:'owner',title:'Cleanup fixture',mission:'Release retained reservations',autonomy:'governed',budget:0,status:'draft',completion:0,approved:true})
  for(let i=0;i<held;i++)await ctx.db.insert('missionResources',{missionId:id,resourceKey:large?'x'.repeat(750000)+i:'held-'+i,mode:'shared',status:'held',heldAt:1})
  await ctx.db.insert('portfolioDecisions',{missionId:id,priorityRank:1,action:'Execute approved mission',decision:'approve',createdAt:1})
  return id
 })
 const snapshot=()=>t.run(async ctx=>({rows:await ctx.db.query('missionResources').collect(),jobs:await ctx.db.query('resourceReleaseJobs').collect(),audit:await ctx.db.query('auditEvents').collect(),scheduled:await ctx.db.system.query('_scheduled_functions').collect()}))
 return{t,owner,other,missionId,snapshot}
}
describe('durable bounded resource cleanup',()=>{
 it('releases a legacy held set across durable workers, preserves history and fences acquisition until complete',async()=>{
  const{t,owner,missionId,snapshot}=await fixture(65)
  await t.run(async ctx=>{for(let i=0;i<300;i++)await ctx.db.insert('missionResources',{missionId,resourceKey:'old-'+i,mode:'exclusive',status:'released',releasedAt:1});await ctx.db.insert('missionResources',{missionId,resourceKey:'requested',mode:'shared',status:'requested'})})
  const first=await owner.mutation(api.orchestration.requestRelease,{missionId})
  expect(first).toMatchObject({releasedInBatch:20,totalReleased:20,pending:true,generation:1})
  const before=await snapshot()
  expect((await owner.query(api.orchestration.preflight,{missionId})).blockers.join(' ')).toMatch(/cleanup is in progress/)
  expect(await owner.mutation(api.orchestration.acquireForExecution,{missionId})).toMatchObject({acquired:false})
  await expect(owner.mutation(api.portfolio.executeApprovedMission,{missionId,priorityRank:1,action:'Execute approved mission'})).rejects.toThrow(/cleanup is in progress/)
  expect(await owner.mutation(api.orchestration.requestRelease,{missionId})).toMatchObject({releasedInBatch:0,totalReleased:20,pending:true})
  expect(await snapshot()).toEqual(before)
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers())
  expect(await owner.query(api.orchestration.releaseStatus,{missionId})).toMatchObject({status:'complete',released:65,generation:1})
  const after=await snapshot()
  expect(after.rows).toHaveLength(366)
  expect(after.rows.filter(r=>r.status==='held')).toHaveLength(0)
  expect(after.rows.filter(r=>r.status==='requested')).toHaveLength(1)
  expect(after.rows.filter(r=>r.resourceKey.startsWith('old-')).every(r=>r.releasedAt===1)).toBe(true)
  expect(after.audit.map(r=>r.eventType)).toEqual(['orchestration:resource_release_started','orchestration:resource_release_completed'])
 })
 it('ignores old worker generations and cannot release a newer acquisition through a stale callback',async()=>{
  const{t,owner,missionId,snapshot}=await fixture(25)
  await owner.mutation(api.orchestration.requestRelease,{missionId})
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers())
  const job=await t.run(ctx=>ctx.db.query('resourceReleaseJobs').unique())
  await t.run(async ctx=>{for(let i=0;i<25;i++)await ctx.db.insert('missionResources',{missionId,resourceKey:'new-'+i,mode:'shared',status:'held',heldAt:2})})
  expect(await owner.mutation(api.orchestration.requestRelease,{missionId})).toMatchObject({generation:2,pending:true,totalReleased:20})
  const before=await snapshot()
  await t.mutation(internal.resourceCleanup.continueRelease,{jobId:job!._id,generation:1})
  expect(await snapshot()).toEqual(before)
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers())
  expect(await owner.query(api.orchestration.releaseStatus,{missionId})).toMatchObject({status:'complete',released:25,generation:2})
 })
 it('supports legacy numeric release contracts and bounds large encoded payload batches',async()=>{
  const{t,owner,missionId}=await fixture(10,true)
  const count=await owner.mutation(api.orchestration.releaseForMission,{missionId})
  expect(count).toBeGreaterThan(0);expect(count).toBeLessThan(10)
  expect(await owner.query(api.orchestration.releaseStatus,{missionId})).toMatchObject({status:'pending',released:count})
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers())
  expect(await owner.query(api.orchestration.releaseStatus,{missionId})).toMatchObject({status:'complete',released:10})
  expect(await t.mutation(internal.orchestration.releaseForMissionInternal,{missionId})).toBe(0)
 })
 it('rejects foreign/anonymous list, progress and release access without changing any records',async()=>{
  const{t,owner,other,missionId,snapshot}=await fixture(30),before=await snapshot()
  for(const caller of [t,other]){
   for(const endpoint of [api.orchestration.listDependenciesPage,api.orchestration.listResourcesPage])await expect(caller.query(endpoint,{missionId,paginationOpts:{numItems:20,cursor:null}})).rejects.toThrow(/Authenticated|access denied/)
   await expect(caller.query(api.orchestration.releaseStatus,{missionId})).rejects.toThrow(/Authenticated|access denied/)
   await expect(caller.mutation(api.orchestration.requestRelease,{missionId})).rejects.toThrow(/Authenticated|access denied/)
   await expect(caller.mutation(api.orchestration.releaseForMission,{missionId})).rejects.toThrow(/Authenticated|access denied/)
  }
  expect(await owner.query(api.orchestration.releaseStatus,{missionId})).toBeNull()
  expect(await snapshot()).toEqual(before)
 })
 it('paginates every retained requirement and keeps oversized legacy summaries exact-or-denied',async()=>{
  const{t,owner,missionId}=await fixture(45)
  await t.run(async ctx=>{for(let i=0;i<35;i++)await ctx.db.insert('missionDependencies',{missionId,dependsOnMissionId:missionId,kind:'informs',note:'Fixture '+i,createdAt:i})})
  await expect(owner.query(api.orchestration.listResources,{missionId})).rejects.toThrow(/listResourcesPage/)
  await expect(owner.query(api.orchestration.listDependencies,{missionId})).rejects.toThrow(/listDependenciesPage/)
  for(const [endpoint,total]of [[api.orchestration.listResourcesPage,45],[api.orchestration.listDependenciesPage,35]]as const){
   const ids:string[]=[];let cursor:string|null=null
   for(let i=0;i<20;i++){
    const page=await owner.query(endpoint,{missionId,paginationOpts:{numItems:7,cursor,maximumRowsRead:100000,maximumBytesRead:100000000}})
    ids.push(...page.page.map(r=>r._id));expect(page.page.length).toBeLessThanOrEqual(7)
    if(page.isDone)break
    cursor=page.continueCursor
   }
   expect(new Set(ids).size).toBe(total);expect(ids.length).toBe(total)
   await expect(owner.query(endpoint,{missionId,paginationOpts:{numItems:21,cursor:null}})).rejects.toThrow(/1–20/)
  }
 })
 it('refuses manual release beneath an active runner while allowing its internal cleanup path',async()=>{
  const{t,owner,missionId,snapshot}=await fixture(5)
  await t.run(ctx=>ctx.db.insert('missionRuns',{missionId,startedAt:1,deadlineAt:9999999999999,maxRetries:2,retries:0,status:'running',currentStage:'orchestration',nextActionAt:1}))
  const before=await snapshot()
  await expect(owner.mutation(api.orchestration.requestRelease,{missionId})).rejects.toThrow(/active runner/)
  await expect(owner.mutation(api.orchestration.releaseForMission,{missionId})).rejects.toThrow(/active runner/)
  expect(await snapshot()).toEqual(before)
  expect(await t.mutation(internal.orchestration.releaseForMissionInternal,{missionId})).toBe(5)
 })
 it('keeps no-op and concurrent cleanup requests free of duplicate jobs and completion receipts',async()=>{
  const{t,owner,missionId,snapshot}=await fixture(25)
  const results=await Promise.all([1,2,3].map(()=>owner.mutation(api.orchestration.requestRelease,{missionId})))
  expect(results.reduce((n,r)=>n+r.releasedInBatch,0)).toBe(20)
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers())
  const before=await snapshot()
  await owner.mutation(api.orchestration.requestRelease,{missionId})
  await owner.mutation(api.orchestration.releaseForMission,{missionId})
  expect(await snapshot()).toEqual(before)
  expect(before.jobs).toHaveLength(1)
  expect(before.audit).toHaveLength(2)
 })
 it('stops on ownership change and lets the current owner explicitly restart reviewed cleanup',async()=>{
  const{t,owner,other,missionId}=await fixture(25)
  await owner.mutation(api.orchestration.requestRelease,{missionId})
  await t.run(ctx=>ctx.db.patch(missionId,{ownerKey:'other'}))
  await t.finishAllScheduledFunctions(()=>vi.runAllTimers())
  expect(await other.query(api.orchestration.releaseStatus,{missionId})).toMatchObject({status:'review',released:20})
  await expect(owner.mutation(api.orchestration.requestRelease,{missionId})).rejects.toThrow(/access denied/)
  expect(await other.mutation(api.orchestration.requestRelease,{missionId})).toMatchObject({pending:false,totalReleased:5,generation:2})
  expect(await other.query(api.orchestration.releaseStatus,{missionId})).toMatchObject({status:'complete',released:5,generation:2})
 })
})
