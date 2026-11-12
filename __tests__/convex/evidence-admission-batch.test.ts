// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
import {admitEvidence,boundEvidence,evidencePage} from '../../convex/evidenceAdmission'
const modules=import.meta.glob('../../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const ids=await t.run(async c=>{
  const missionId=await c.db.insert('missions',{ownerKey:'owner',title:'Admission batch',mission:'Retain verified results',autonomy:'governed',budget:1,status:'running',completion:0,approved:true})
  const artifactId=await c.db.insert('artifacts',{missionId,type:'html',name:'Fixture',content:'<html>Fixture</html>',status:'ready',requiresApproval:false})
  const deliveryId=await c.db.insert('deliveries',{missionId,artifactId,target:'nexus-forge1/no-dispatch',branch:'main',stage:'verified',approved:true,status:'Verified',evidence:'Controlled fixture',createdAt:1})
  return{missionId,artifactId,deliveryId}
 })
 return{t,owner,other,...ids}
}
const assertion=(deliveryId:any,summary='One retained observation')=>({deliveryId,passed:false,score:0,criteria:['Explicit criterion'],evidence:['Fixture evidence'],summary})
const product=(missionId:any)=>({missionId,metric:'active-users' as const,observed:2,target:3,sampleSize:4,periodStart:1,periodEnd:2,method:'Count distinct users in the fixed period',evidence:['Controlled fixture reference'],notes:'Fixture only'})
describe('complete evidence admission boundaries',()=>{
 it('serializes the last manual verification slot and retains every older row',async()=>{
  const{t,owner,missionId,deliveryId}=await fixture()
  await t.run(async c=>{for(let i=0;i<99;i++)await c.db.insert('verifications',{missionId,...assertion(deliveryId,'Retained '+i),createdAt:1})})
  const results=await Promise.allSettled(['A','B'].map(x=>owner.mutation(api.verification.record,assertion(deliveryId,x))))
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await t.run(c=>c.db.query('verifications').collect())).toHaveLength(100)
 })
 it('replays an exact assertion at capacity after checking ownership, without new derived evidence',async()=>{
  const{t,owner,other,missionId,deliveryId}=await fixture(),input=assertion(deliveryId)
  const id=await owner.mutation(api.verification.record,input)
  await t.run(async c=>{for(let i=0;i<99;i++)await c.db.insert('verifications',{missionId,...assertion(deliveryId,'Retained '+i),createdAt:1})})
  const before=await t.run(c=>c.db.query('auditEvents').collect())
  expect(await owner.mutation(api.verification.record,input)).toBe(id)
  await expect(other.mutation(api.verification.record,input)).rejects.toThrow(/access denied/)
  await expect(t.mutation(api.verification.record,input)).rejects.toThrow(/Authenticated/)
  expect(await t.run(c=>c.db.query('auditEvents').collect())).toEqual(before)
 })
 it('does not block canonical measured results at the manual assertion limit',async()=>{
  const{t,owner,missionId,deliveryId}=await fixture()
  await t.run(async c=>{for(let i=0;i<100;i++)await c.db.insert('verifications',{missionId,...assertion(deliveryId,'Retained '+i),createdAt:1})})
  const result=await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  expect(result.verificationId).toBeTruthy()
  expect(await t.run(c=>c.db.query('verifications').collect())).toHaveLength(101)
  expect(await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).toEqual(result)
 })
 it('rejects oversized UTF-8 assertions and nonfinite scores without writes',async()=>{
  const{t,owner,deliveryId}=await fixture()
  await expect(owner.mutation(api.verification.record,{...assertion(deliveryId),summary:'🙂'.repeat(5000)})).rejects.toThrow(/safety limit/)
  await expect(owner.mutation(api.verification.record,{...assertion(deliveryId),score:NaN})).rejects.toThrow(/finite/)
  expect(await t.run(c=>c.db.query('verifications').collect())).toHaveLength(0)
 })
 it('deduplicates runtime cost retries without changing the recorded source',async()=>{
  const{t,owner,missionId}=await fixture(),args={missionId,actualCost:0.1,evidence:'Invoice fixture reference'}
  const ids=await Promise.all([owner.mutation(api.verification.recordRuntimeCost,args),owner.mutation(api.verification.recordRuntimeCost,args)])
  expect(ids[0]).toBe(ids[1]);expect(await t.run(c=>c.db.query('measurements').collect())).toHaveLength(1)
 })
 it('deduplicates product measurements and denies new evidence at its retained-history limit',async()=>{
  const{t,owner,missionId}=await fixture(),args=product(missionId)
  const id=await owner.mutation(api.verification.recordProductOutcome,args)
  expect(await owner.mutation(api.verification.recordProductOutcome,args)).toBe(id)
  await t.run(async c=>{const row=(await c.db.get('productOutcomes',id))!;const{_id,_creationTime,...fields}=row;for(let i=0;i<99;i++)await c.db.insert('productOutcomes',{...fields,notes:'Retained '+i})})
  expect(await owner.mutation(api.verification.recordProductOutcome,args)).toBe(id)
  await expect(owner.mutation(api.verification.recordProductOutcome,{...args,observed:3})).rejects.toThrow(/history limit/)
  expect(await t.run(c=>c.db.query('productOutcomes').collect())).toHaveLength(100)
 })
 it('retains delivery preparation replay at capacity and refuses new target records',async()=>{
  const{t,owner,missionId,artifactId}=await fixture()
  const args={missionId,artifactId,target:'nexus-forge1/no-dispatch',branch:'main'},id=await owner.mutation(api.delivery.prepare,args)
  await t.run(async c=>{for(let i=0;i<99;i++)await c.db.insert('deliveries',{...args,target:'fixture/repo'+i,stage:'approval',approved:false,status:'Waiting',evidence:'Retained',createdAt:1})})
  expect(await owner.mutation(api.delivery.prepare,args)).toBe(id)
  await expect(owner.mutation(api.delivery.prepare,{...args,target:'new/repo'})).rejects.toThrow(/history limit/)
 })
 it('an unchanged target correction cannot clear approval or append audit history',async()=>{
  const{t,owner,missionId,artifactId}=await fixture(),id=await owner.mutation(api.delivery.prepare,{missionId,artifactId,target:'nexus-forge1/no-dispatch',branch:'qa-only'})
  await owner.mutation(api.delivery.approve,{id,approved:true})
  const before=await t.run(c=>c.db.get(id)),audit=await t.run(c=>c.db.query('auditEvents').collect())
  await owner.mutation(api.delivery.correctTarget,{id,target:'nexus-forge1/no-dispatch',branch:'qa-only'})
  expect(await t.run(c=>c.db.get(id))).toEqual(before);expect(await t.run(c=>c.db.query('auditEvents').collect())).toEqual(audit)
 })
 it('limits new platform tasks while allowing pending results to settle',async()=>{
  const{t,missionId}=await fixture(),id=await t.mutation(internal.platformTasks.begin,{missionId,kind:'research'})
  await t.run(async c=>{for(let i=0;i<99;i++)await c.db.insert('platformTaskRuns',{missionId,ownerKey:'owner',kind:'research',status:'failed',startedAt:1})})
  await expect(t.mutation(internal.platformTasks.begin,{missionId,kind:'artifact'})).rejects.toThrow(/history limit/)
  await t.mutation(internal.platformTasks.finish,{id,success:true,sourceRef:'Retained source'})
  expect(await t.run(c=>c.db.get(id))).toMatchObject({status:'success',sourceRef:'Retained source'})
 })
 it('stops both provider admission paths before any reservation when history is full',async()=>{
  const{t,missionId}=await fixture()
  await t.run(async c=>{for(let i=0;i<500;i++)await c.db.insert('providerInvocations',{ownerKey:'owner',missionId,stage:'retained',role:'planner',startedAt:1,outcome:'failed',usageStatus:'missing',reports:[]})})
  const args={ownerKey:'owner',missionId,stage:'new',role:'planner'}
  await expect(t.mutation(internal.providerUsage.begin,args)).rejects.toThrow(/history limit/)
  await expect(t.mutation(internal.providerRecovery.reserve,{...args,requestDigest:'a'.repeat(64)})).rejects.toThrow(/history limit/)
  expect(await t.run(c=>c.db.query('billingHolds').collect())).toHaveLength(0)
 })
 it('preserves all twenty strategy outcomes instead of dropping the oldest',async()=>{
  const{t,owner}=await fixture(),old=Array.from({length:20},(_,i)=>({outcomeStatus:'failed',actualResult:'Outcome '+i,evidence:'Retained evidence',actualCost:null,recordedAt:i+1}))
  const strategyId=await t.run(c=>c.db.insert('memories',{ownerKey:'owner',category:'manifest-strategy',key:'strategy',value:JSON.stringify({outcomeHistory:old}),confidence:0.5,source:'fixture'}))
  const before=await t.run(c=>c.db.get(strategyId))
  await expect(owner.mutation(api.manifestIntelligence.recordStrategyOutcome,{strategyId,outcomeStatus:'succeeded',actualResult:'New outcome',evidence:'New evidence'})).rejects.toThrow(/Twenty/)
  expect(await t.run(c=>c.db.get(strategyId))).toEqual(before)
  await owner.mutation(api.manifestIntelligence.recordStrategyOutcome,{strategyId,outcomeStatus:'failed',actualResult:'Outcome 0',evidence:'Retained evidence'})
  expect(await t.run(c=>c.db.get(strategyId))).toEqual(before)
 })
 it('rejects oversized or invalid history pages while retaining the supported mission page size',async()=>{
  const{owner}=await fixture()
  await expect(owner.query(api.verification.productOutcomesV2,{paginationOpts:{numItems:1000,cursor:null}})).rejects.toThrow(/safety limit/)
  expect((await owner.query(api.missions.list,{ownerKey:'ignored',paginationOpts:{numItems:50,cursor:null}})).page).toHaveLength(1)
 })
 it('fails closed on excessive retained payload and bounds decoded UTF-8 input',async()=>{
  async function* rows(){for(let i=0;i<8;i++)yield {value:'x'.repeat(800000)}}
  await expect(admitEvidence(rows(),'Fixture')).rejects.toThrow(/inspection budget/)
  expect(()=>boundEvidence('🙂'.repeat(20),'Fixture',60)).toThrow(/safety limit/)
  expect(evidencePage({numItems:10,cursor:null})).toMatchObject({maximumRowsRead:40,maximumBytesRead:1048576})
 })
})
