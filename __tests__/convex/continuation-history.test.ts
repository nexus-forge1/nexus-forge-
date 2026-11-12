// @vitest-environment edge-runtime
import{describe,it,expect}from'vitest'
import{convexTest}from'convex-test'
import schema from'../../convex/schema'
import{continuationPreflight}from'../../convex/continuationPolicy'
const modules=import.meta.glob('../../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules)
 const ids=await t.run(async ctx=>{
  const missionId=await ctx.db.insert('missions',{ownerKey:'owner',title:'Recovery fixture',mission:'Review retained history',autonomy:'governed',budget:0,status:'running',completion:0,approved:true})
  const runId=await ctx.db.insert('missionRuns',{missionId,startedAt:Date.now(),deadlineAt:Date.now()+600000,maxRetries:2,retries:0,status:'paused',currentStage:'execution_recovery',nextActionAt:Date.now()})
  const claimId=await ctx.db.insert('executionClaims',{missionId,scope:'council',workKey:'runner:'+runId,status:'uncertain',createdAt:Date.now()})
  const resourceId=await ctx.db.insert('missionResources',{missionId,resourceKey:'recovery-provider',mode:'exclusive',status:'held',heldAt:Date.now()})
  return{missionId,runId,claimId,resourceId}
 })
 const check=()=>t.run(async ctx=>continuationPreflight(ctx,(await ctx.db.get(ids.claimId))!,true))
 return{t,...ids,check}
}
describe('continuation active history scopes',()=>{
 it('retains released competing reservations and resolved incidents without blocking valid recovery',async()=>{
  const{t,missionId,check}=await fixture()
  await t.run(async ctx=>{
   const other=await ctx.db.insert('missions',{ownerKey:'other',title:'Other mission',mission:'Private',autonomy:'governed',budget:0,status:'complete',completion:1,approved:true})
   for(let i=0;i<200;i++){
    await ctx.db.insert('missionResources',{missionId:other,resourceKey:'recovery-provider',mode:'exclusive',status:'released',releasedAt:1})
    await ctx.db.insert('incidents',{missionId,kind:'history',stage:'resolved',message:'Fixture',attempts:1,status:'resolved',createdAt:i})
   }
  })
  expect(await check()).toBeNull()
  expect(await t.run(ctx=>ctx.db.query('missionResources').collect())).toHaveLength(201)
  expect(await t.run(ctx=>ctx.db.query('incidents').collect())).toHaveLength(200)
 })
 it.each(['pending','review']as const)('blocks cleanup state %s before continuation',async status=>{
  const{t,missionId,check}=await fixture()
  await t.run(ctx=>ctx.db.insert('resourceReleaseJobs',{missionId,ownerKey:'owner',generation:1,status,released:0,startedAt:1,updatedAt:1}))
  expect(await check()).toMatch(/cleanup must finish/)
 })
 it.each(['open','escalated']as const)('finds outstanding %s incidents behind extensive resolved history',async status=>{
  const{t,missionId,check}=await fixture()
  await t.run(async ctx=>{
   for(let i=0;i<200;i++)await ctx.db.insert('incidents',{missionId,kind:'history',stage:'resolved',message:'Fixture',attempts:1,status:'resolved',createdAt:i})
   await ctx.db.insert('incidents',{missionId,kind:'execution',stage:'review',message:'Outstanding fixture',attempts:1,status,createdAt:201})
  })
  expect(await check()).toMatch(/Resolve outstanding incidents/)
 })
 it('still refuses released original resources and mission review even with legacy approval',async()=>{
  const{t,missionId,resourceId,check}=await fixture()
  await t.run(ctx=>ctx.db.patch(resourceId,{status:'released'}))
  expect(await check()).toMatch(/resources must remain held/)
  await t.run(async ctx=>{await ctx.db.patch(resourceId,{status:'held'});await ctx.db.patch(missionId,{status:'review',approved:true})})
  expect(await check()).toMatch(/no longer permits continuation/)
 })
 it('refuses excessive active holders while ignoring inactive history',async()=>{
  const{t,missionId,check}=await fixture()
  await t.run(async ctx=>{const other=await ctx.db.insert('missions',{ownerKey:'other',title:'Competing reservations',mission:'Private fixture',autonomy:'governed',budget:0,status:'running',completion:0,approved:true});for(let i=0;i<51;i++)await ctx.db.insert('missionResources',{missionId:other,resourceKey:'recovery-provider',mode:'shared',status:'held',heldAt:1})})
  expect(await check()).toMatch(/exceeds|excessive/)
 })
})
