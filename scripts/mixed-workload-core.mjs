export function validateMixedProfile(p){
 if(p?.version!=='mixed-two-user-v1'||p.environment!=='Testing'||p.backendOrigin!=='https://quick-rabbit-810.eu-west-1.convex.cloud')throw Error('Reviewed Testing profile required')
 for(const [key,value] of Object.entries({users:2,workers:4,iterations:120,intervalMs:5000,writeEvery:3,readTimeoutMs:10000,inferenceTimeoutMs:60000,readP95LimitMs:2000,writeP95LimitMs:2000,inferenceP95LimitMs:45000,maxErrorRate:0,minimumActiveSpanMs:595000,maxInferenceChargeCentsPerUser:300})){
  if(p[key]!==value)throw Error('Reviewed bound changed: '+key)
 }
 if(JSON.stringify(p.inferenceOffsetsMs)!=='[0,300000,595000]'||!/^step11-mixed-[a-z0-9-]{8,60}$/.test(p.fixturePrefix))throw Error('Reviewed inference schedule and unique fixture prefix required')
 return p
}
export const percentile95=values=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]:null
export function assessMixed(p,r){
 const expected={read:p.users*p.iterations*3,write:p.users*p.iterations/p.writeEvery,inference:p.users*p.inferenceOffsetsMs.length}
 const groups={}
 for(const kind of Object.keys(expected)){
  const rows=r.samples.filter(s=>s.kind===kind),p95Ms=percentile95(rows.map(s=>s.ms))
  groups[kind]={planned:expected[kind],completed:rows.length,failures:rows.filter(s=>!s.ok).length,p95Ms}
 }
 const latency={read:p.readP95LimitMs,write:p.writeP95LimitMs,inference:p.inferenceP95LimitMs}
 const passed=r.distinctUsers===p.users&&!r.stopped&&r.activeSpanMs>=p.minimumActiveSpanMs&&
  Object.entries(groups).every(([kind,g])=>g.completed===g.planned&&g.failures===0&&g.p95Ms!==null&&Number.isFinite(g.p95Ms)&&g.p95Ms<=latency[kind])&&
  ['existingRecordsUnchanged','exactOwnedWrites','exactInferenceReceipts','billingConserved','ownershipDenied'].every(k=>r.invariants?.[k]===true)
 return {passed,groups,activeSpanMs:r.activeSpanMs,distinctUsers:r.distinctUsers,stopped:!!r.stopped}
}
// A rejected or uncertain operation sets a shared stop. The caller never repeats it.
export async function runMixedLane({iterations,waitFor,perform,stopped,stop}){
 for(let i=0;i<iterations;i++){
  await waitFor(i)
  if(stopped())break
  try{await perform(i)}catch{stop();break}
 }
}
