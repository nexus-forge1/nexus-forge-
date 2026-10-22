// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const ids=await t.run(async c=>{
  const missionId=await c.db.insert('missions',{ownerKey:'owner',title:'Canonical outcome',mission:'Measure fixed delivery evidence',autonomy:'governed',budget:0,status:'running',completion:0,approved:true})
  const artifactId=await c.db.insert('artifacts',{missionId,type:'html',name:'Fixture',content:'<html>Fixture</html>',status:'approved',requiresApproval:true})
  const run='https://github.com/nexus-forge1/no-dispatch/actions/runs/123'
  const deliveryId=await c.db.insert('deliveries',{missionId,artifactId,target:'nexus-forge1/no-dispatch',branch:'main',stage:'verified',approved:true,status:'Verified fixture',evidence:'Controlled fixture',workflowRunUrl:run,workflowConclusion:'success',workflowCommitSha:'a'.repeat(40),deploymentRunUrl:run,deploymentCommitSha:'a'.repeat(40),deploymentUrl:'https://example.com/',readinessStatus:'pass',readinessPassedCount:6,readinessTotalCount:6,createdAt:1})
  return{missionId,deliveryId}
 })
 return{t,owner,other,...ids}
}
async function state(t:ReturnType<typeof convexTest>){
 return t.run(async c=>({verifications:await c.db.query('verifications').collect(),measurements:await c.db.query('measurements').collect(),audits:await c.db.query('auditEvents').collect(),memories:await c.db.query('memories').collect(),receipts:await c.db.query('deliveryOutcomeReceipts').collect()}))
}
describe('canonical measured outcome replay',()=>{
 it('returns one result under concurrent retries and retains one audit/measurement/lesson set',async()=>{
  const{t,owner,deliveryId,missionId}=await fixture()
  const results=await Promise.all(Array.from({length:8},()=>owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})))
  for(const result of results)expect(result).toEqual(results[0])
  expect(results[0]).toMatchObject({passed:true,score:1})
  const after=await state(t)
  expect(after.verifications).toHaveLength(1);expect(after.measurements).toHaveLength(1);expect(after.audits).toHaveLength(1);expect(after.memories).toHaveLength(2);expect(after.receipts).toHaveLength(1)
  expect(await t.run(c=>c.db.get(missionId))).toMatchObject({status:'complete',completion:1})
  expect(await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).toEqual(results[0])
  expect(await state(t)).toEqual(after)
 })
 it('checks ownership and approval before returning an existing outcome',async()=>{
  const{t,owner,other,deliveryId}=await fixture()
  await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  const before=await state(t)
  await expect(other.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).rejects.toThrow(/access denied/)
  await expect(t.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).rejects.toThrow(/Authenticated/)
  await t.run(c=>c.db.patch(deliveryId,{approved:false}))
  await expect(owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).rejects.toThrow(/approval/)
  expect(await state(t)).toEqual(before)
 })
 it('rejects changed evidence without overwriting the immutable outcome or adding derived records',async()=>{
  const{t,owner,deliveryId}=await fixture()
  await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  const before=await state(t)
  await t.run(c=>c.db.patch(deliveryId,{deploymentUrl:'https://changed.example.com/'}))
  await expect(owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).rejects.toThrow(/evidence changed/)
  expect(await state(t)).toEqual(before)
 })
 it('preserves retained legacy outcomes and unrelated records without adopting an operator assertion as canonical',async()=>{
  const{t,owner,missionId,deliveryId}=await fixture()
  const legacy=await t.run(c=>c.db.insert('verifications',{missionId,deliveryId,passed:false,score:0,criteria:['Operator assertion'],evidence:['Legacy evidence'],summary:'Historical assertion',createdAt:1}))
  const original=await t.run(c=>c.db.get(legacy))
  const result=await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  expect(result.verificationId).not.toBe(legacy)
  expect(await t.run(c=>c.db.get(legacy))).toEqual(original)
  const before=await state(t)
  await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  expect(await state(t)).toEqual(before)
 })
 it('replays without re-completing a mission moved to review and retains negative measurements',async()=>{
  const{t,owner,missionId,deliveryId}=await fixture()
  await t.run(c=>c.db.patch(deliveryId,{artifactId:undefined}))
  const result=await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  expect(result).toMatchObject({passed:false,score:0.75})
  await t.run(c=>c.db.patch(missionId,{status:'review',completion:40}))
  const before=await state(t)
  expect(await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).toEqual(result)
  expect(await t.run(c=>c.db.get(missionId))).toMatchObject({status:'review',completion:40})
  expect(await state(t)).toEqual(before)
 })
 it('does not manufacture a replacement when a referenced measurement is missing',async()=>{
  const{t,owner,deliveryId}=await fixture()
  const result=await owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})
  await t.run(c=>c.db.delete(result.measurementId))
  const before=await state(t)
  await expect(owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).rejects.toThrow(/receipt is incomplete/)
  expect(await state(t)).toEqual(before)
 })
 it('rejects excessive legacy source evidence before derived writes',async()=>{
  const{t,owner,deliveryId}=await fixture()
  await t.run(c=>c.db.patch(deliveryId,{deploymentUrl:'https://example.com/'+'x'.repeat(17000)}))
  await expect(owner.mutation(api.verification.recordMeasuredOutcome,{deliveryId})).rejects.toThrow(/safety limit/)
  expect(await state(t)).toEqual({verifications:[],measurements:[],audits:[],memories:[],receipts:[]})
 })
})
