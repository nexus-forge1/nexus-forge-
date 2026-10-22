import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {validateMixedProfile,assessMixed,runMixedLane} from '../scripts/mixed-workload-core.mjs'
const profile=JSON.parse(readFileSync('docs/workload-profiles/mixed-two-user-testing.json','utf8'))
function receipt(){return {distinctUsers:2,stopped:false,activeSpanMs:595001,invariants:{existingRecordsUnchanged:true,exactOwnedWrites:true,exactInferenceReceipts:true,billingConserved:true,ownershipDenied:true},samples:[...Array.from({length:720},()=>({kind:'read',ok:true,ms:50})),...Array.from({length:80},()=>({kind:'write',ok:true,ms:100})),...Array.from({length:6},()=>({kind:'inference',ok:true,ms:3000}))]}}
describe('bounded mixed workload evidence',()=>{
 it('requires exact reviewed Testing profile and finite budget',()=>{
  expect(validateMixedProfile(profile)).toBe(profile)
  for(const changed of [{environment:'Live'},{backendOrigin:'https://tame-rat-826.eu-west-1.convex.cloud'},{users:1},{iterations:121},{inferenceOffsetsMs:[0,1,2]},{maxInferenceChargeCentsPerUser:10000}])expect(()=>validateMixedProfile({...profile,...changed})).toThrow()
 })
 it('requires complete nonempty observations, distinct users and a sustained span',()=>{
  expect(assessMixed(profile,receipt()).passed).toBe(true)
  for(const changed of [{samples:[]},{samples:receipt().samples.slice(1)},{distinctUsers:1},{activeSpanMs:30000},{stopped:true}])expect(assessMixed(profile,{...receipt(),...changed}).passed).toBe(false)
 })
 it('fails latency, error and each ownership or accounting invariant',()=>{
  const slow=receipt();slow.samples.filter(s=>s.kind==='inference').forEach(s=>s.ms=45001)
  expect(assessMixed(profile,slow).passed).toBe(false)
  const failed=receipt();failed.samples[0].ok=false
  expect(assessMixed(profile,failed).passed).toBe(false)
  for(const key of Object.keys(receipt().invariants)){const r=receipt();r.invariants[key]=false;expect(assessMixed(profile,r).passed).toBe(false)}
 })
 it('never retries an uncertain write and stops later scheduled actions',async()=>{
  let stop=false,attempts=0
  await runMixedLane({iterations:120,waitFor:async()=>{},perform:async()=>{attempts++;throw Error('Write response lost')},stopped:()=>stop,stop:()=>{stop=true}})
  expect(attempts).toBe(1)
  await runMixedLane({iterations:3,waitFor:async()=>{},perform:async()=>{attempts++},stopped:()=>stop,stop:()=>{stop=true}})
  expect(attempts).toBe(1)
 })
})
