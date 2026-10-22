// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import schema from '../../convex/schema'
import {api,internal} from '../../convex/_generated/api'
const modules=import.meta.glob('../../convex/**/*.ts')
async function fixture(){
 const t=convexTest(schema,modules),owner=t.withIdentity({subject:'owner'}),other=t.withIdentity({subject:'other'})
 const missionId=await t.run(c=>c.db.insert('missions',{ownerKey:'owner',title:'Context bounds',mission:'Plan from retained risk evidence',autonomy:'governed',budget:0,status:'running',completion:0,approved:true}))
 return{t,owner,other,missionId}
}
describe('raw memory context bounds',()=>{
 it('retains eligible risks across excluded evaluation rows and isolates foreign history',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async c=>{
   await c.db.insert('memories',{ownerKey:'owner',category:'verification-outcome',key:'old-risk',value:'Failed verification requires stronger evidence',confidence:1,source:'fixture'})
   for(let i=0;i<120;i++)await c.db.insert('memories',{ownerKey:'owner',category:i%2?'retrieval-evaluation':'strategy-reuse-comparison',key:'excluded-'+i,value:'Excluded evaluation',confidence:1,source:'fixture'})
   for(let i=0;i<510;i++)await c.db.insert('memories',{ownerKey:'other',category:'learning-lesson',key:'foreign-'+i,value:'Private foreign history',confidence:1,source:'fixture'})
  })
  const learning=await t.query(internal.memory.getLearningContext,{missionId})
  expect(learning.outcomes[0].value).toContain('Failed verification')
  const adaptive=await t.query(internal.memory.getAdaptivePreflight,{missionId})
  expect(adaptive.riskSignals).toHaveLength(1)
  expect(await owner.query(api.memory.getAdaptivePreflightForOperator,{missionId})).toEqual(adaptive)
  expect(await owner.query(api.memory.adaptivePreflightStatus,{missionId})).toEqual({ok:true,value:adaptive})
  const council=await t.query(internal.memory.getCouncilMemorySelection,{missionId})
  expect(council.learning).toEqual(learning);expect(council.adaptive).toEqual(adaptive)
  expect(JSON.stringify(council)).not.toContain('Private foreign')
 })
 it('blocks all planning contexts when skipped records exhaust inspection without clearing risks',async()=>{
  const{t,owner,other,missionId}=await fixture()
  await t.run(async c=>{
   await c.db.insert('memories',{ownerKey:'owner',category:'verification-outcome',key:'risk',value:'Failed critical historical verification',confidence:1,source:'fixture'})
   for(let i=0;i<510;i++)await c.db.insert('memories',{ownerKey:'owner',category:'retrieval-evaluation',key:'evaluation-'+i,value:'Retained evaluation',confidence:1,source:'fixture'})
  })
  for(const ref of [internal.memory.getLearningContext,internal.memory.getAdaptivePreflight,internal.memory.getCouncilMemorySelection])await expect(t.query(ref,{missionId})).rejects.toThrow(/risk evidence has not been cleared/)
  await expect(owner.query(api.memory.getAdaptivePreflightForOperator,{missionId})).rejects.toThrow(/safety read limit/)
  expect(await owner.query(api.memory.adaptivePreflightStatus,{missionId})).toMatchObject({ok:false,message:expect.stringContaining('risk evidence has not been cleared')})
  await expect(other.query(api.memory.adaptivePreflightStatus,{missionId})).rejects.toThrow(/access denied/)
  await expect(t.query(api.memory.adaptivePreflightStatus,{missionId})).rejects.toThrow(/Authenticated/)
  expect(await t.run(c=>c.db.query('memories').collect())).toHaveLength(511)
  expect(await t.run(c=>c.db.query('councilMemoryReceipts').collect())).toEqual([])
 })
 it('bounds large skipped payloads without deleting or rewriting retained evidence',async()=>{
  const{t,owner,missionId}=await fixture()
  await t.run(async c=>{for(let i=0;i<8;i++)await c.db.insert('memories',{ownerKey:'owner',category:'strategy-reuse-comparison',key:'large-'+i,value:'x'.repeat(700000),confidence:1,source:'fixture'})})
  const before=await t.run(c=>c.db.query('memories').collect())
  expect(await owner.query(api.memory.adaptivePreflightStatus,{missionId})).toMatchObject({ok:false})
  await expect(t.query(internal.memory.getCouncilMemorySelection,{missionId})).rejects.toThrow(/safety read limit/)
  expect(await t.run(c=>c.db.query('memories').collect())).toEqual(before)
 })
 it('stops after the original recent window without scanning irrelevant older history',async()=>{
  const{t,missionId}=await fixture()
  await t.run(async c=>{
   for(let i=0;i<510;i++)await c.db.insert('memories',{ownerKey:'owner',category:'retrieval-evaluation',key:'older-'+i,value:'Old excluded history',confidence:1,source:'fixture'})
   for(let i=0;i<90;i++)await c.db.insert('memories',{ownerKey:'owner',category:'learning-lesson',key:'eligible-'+i,value:'Newest eligible lesson '+i,confidence:1,source:'fixture'})
  })
  const council=await t.query(internal.memory.getCouncilMemorySelection,{missionId})
  expect(council.selected.length).toBeGreaterThan(0)
  expect(council.learning.lessons[0].value).toBe('Newest eligible lesson 89')
  expect(council.learning).toEqual(await t.query(internal.memory.getLearningContext,{missionId}))
 })
})
