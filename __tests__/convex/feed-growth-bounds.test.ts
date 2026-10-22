// @vitest-environment edge-runtime
import {afterEach,describe,it,expect,vi} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
async function fixture(){
 vi.useFakeTimers()
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Bounded feed',mission:'Retain evidence',autonomy:'governed',budget:0,status:'draft',completion:0,approved:false}))
 const feedId=await owner.mutation(api.outcomeFeeds.create,{missionId,reportId:'daily'})
 return{t,owner,other,missionId,feedId,a:{feedId,generation:1,sequence:0}}
}
describe('bounded durable outcome feed periods',()=>{
 it('admits one concurrent poll and schedules only one successor despite duplicate completion',async()=>{
  const{t,a,feedId}=await fixture()
  const claims=await Promise.all(Array.from({length:6},()=>t.mutation(internal.outcomeFeeds.claimPoll,a)))
  expect(claims.filter(Boolean)).toHaveLength(1)
  const before=await t.run(c=>c.db.system.query('_scheduled_functions').collect())
  await Promise.all(Array.from({length:6},()=>t.mutation(internal.outcomeFeeds.reschedule,{...a,error:''})))
  const after=await t.run(c=>c.db.system.query('_scheduled_functions').collect())
  expect(after.length-before.length).toBe(1)
  expect(await t.run(c=>c.db.get(feedId))).toMatchObject({pollSequence:1,enabled:true})
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,a)).toBeNull()
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,{...a,sequence:1})).not.toBeNull()
 })
 it('stops after the last check without adding another scheduled job or duplicate audit',async()=>{
  const{t,a,feedId}=await fixture()
  await t.run(c=>c.db.patch(feedId,{pollSequence:167,claimedSequence:167}))
  const before=await t.run(c=>c.db.system.query('_scheduled_functions').collect())
  await t.mutation(internal.outcomeFeeds.reschedule,{...a,sequence:167,error:'Unavailable'})
  await t.mutation(internal.outcomeFeeds.reschedule,{...a,sequence:167,error:'Duplicate'})
  expect(await t.run(c=>c.db.get(feedId))).toMatchObject({enabled:false,pollSequence:168,lastError:expect.stringContaining('168 checks')})
  expect(await t.run(c=>c.db.system.query('_scheduled_functions').collect())).toEqual(before)
  expect((await t.run(c=>c.db.query('frontierAudits').collect())).filter(r=>r.action==='feed-period-complete')).toHaveLength(1)
 })
 it('recovers an interrupted claim only through an owned explicit stop and new period',async()=>{
  const{t,owner,other,a,feedId}=await fixture()
  await t.mutation(internal.outcomeFeeds.claimPoll,a)
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,a)).toBeNull()
  await expect(other.mutation(api.outcomeFeeds.setEnabled,{feedId,enabled:false})).rejects.toThrow(/access denied/)
  await owner.mutation(api.outcomeFeeds.setEnabled,{feedId,enabled:false})
  await owner.mutation(api.outcomeFeeds.setEnabled,{feedId,enabled:true})
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,a)).toBeNull()
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,{feedId,generation:3,sequence:0})).not.toBeNull()
  await t.mutation(internal.outcomeFeeds.reschedule,{...a,error:'Old worker'})
  expect(await t.run(c=>c.db.get(feedId))).toMatchObject({generation:3,pollSequence:0,claimedSequence:0,enabled:true})
 })
 it('requires current mission ownership before a claim or renewed collection',async()=>{
  const{t,owner,a,feedId,missionId}=await fixture()
  await t.run(c=>c.db.patch(missionId,{ownerKey:'other'}))
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,a)).toBeNull()
  await owner.mutation(api.outcomeFeeds.setEnabled,{feedId,enabled:false})
  await expect(owner.mutation(api.outcomeFeeds.setEnabled,{feedId,enabled:true})).rejects.toThrow(/access denied/)
 })
 it('accepts one legacy pending job without sequence and rejects its duplicate chain',async()=>{
  const{t,feedId}=await fixture()
  await t.run(c=>c.db.patch(feedId,{pollSequence:undefined,claimedSequence:undefined}))
  const a={feedId,generation:1}
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,a)).not.toBeNull()
  await t.mutation(internal.outcomeFeeds.reschedule,{...a,error:''})
  expect(await t.mutation(internal.outcomeFeeds.claimPoll,a)).toBeNull()
 })
 it('deduplicates a retained report older than the recent history window',async()=>{
  const{t,a,missionId}=await fixture()
  const input={missionId,metric:'task-success-rate' as const,observed:9,target:80,sampleSize:10,periodStart:100,periodEnd:200,method:'Fixed controlled measurement population',evidence:['https://example.com/evidence'],notes:'Synthetic fixture'}
  const receipt={repository:'nexus-forge1/nexus-forge-',path:'nexus-forge-outcomes/'+missionId+'/daily.json',commitSha:'a'.repeat(40),blobSha:'b'.repeat(40),reportSha256:'c'.repeat(64),importedAt:1000}
  const original=await t.run(async c=>{
   const id=await c.db.insert('productOutcomes',{...input,ownerKey:'owner',recordedAt:1,provenance:'github-report',actual:90,unit:'%',direction:'higher',targetMet:true,importReceipt:receipt,importKey:receipt.repository+':'+receipt.commitSha+':'+receipt.path})
   for(let i=0;i<120;i++)await c.db.insert('productOutcomes',{...input,ownerKey:'owner',recordedAt:2+i,provenance:'operator-recorded',actual:90,unit:'%',direction:'higher',targetMet:true})
   return id
  })
  const before=await t.run(c=>c.db.query('productOutcomes').collect())
  await t.mutation(internal.outcomeFeeds.claimPoll,a)
  expect(await t.mutation(internal.outcomeFeeds.ingest,{...a,...input,receipt:{...receipt,commitSha:'d'.repeat(40)}})).toBe(original)
  expect(await t.run(c=>c.db.query('productOutcomes').collect())).toEqual(before)
 })
 it('rejects ingest without a claim and invalid sequences before network',async()=>{
  const{t,a}=await fixture()
  for(const sequence of [-1,1.5,168,100000])expect(await t.mutation(internal.outcomeFeeds.claimPoll,{...a,sequence})).toBeNull()
  const network=vi.fn();vi.stubGlobal('fetch',network)
  await t.mutation(internal.outcomeFeeds.claimPoll,a)
  await t.action(internal.productEvidenceImport.pollFeed,a)
  expect(network).not.toHaveBeenCalled()
 })
})
