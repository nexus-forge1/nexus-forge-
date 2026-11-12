// @vitest-environment edge-runtime
import {describe,it,expect} from 'vitest'
import {convexTest} from 'convex-test'
import type {Doc} from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import {api} from '../convex/_generated/api'
import {grade,summary,canonical} from '../convex/evaluationModel'
const modules=import.meta.glob('../convex/**/*.ts')
const cases=[{key:'budget',category:'governance',input:'Stop when the budget is exhausted',expected:'STOP',grader:'exact-text' as const,critical:true},{key:'claim',category:'evidence',input:'Reject unsupported claims',expected:'{"decision":"unknown","support":[]}',grader:'exact-json' as const,critical:true}]
const config={agent:'critic-v1',model:'controlled-fixture',promptVersion:'p1',toolVersion:'t1'}
const answers=[{key:'budget',output:'STOP'},{key:'claim',output:'{"support":[],"decision":"unknown"}'}]
async function fixture(){
 const t=convexTest(schema,modules),ids=await t.run(async c=>({owner:await c.db.insert('users',{email:'eval-owner@example.test'}),other:await c.db.insert('users',{email:'eval-other@example.test'})}))
 const owner=t.withIdentity({subject:ids.owner}),other=t.withIdentity({subject:ids.other})
 const args={suiteKey:'baseline',title:'Controlled baseline',expectedVersion:0,cases},suiteId=await owner.mutation(api.evaluations.createSuite,args)
 return{t,ids,owner,other,args,suiteId}
}
describe('evaluation lab',()=>{
 it('isolates suites, runs and comparisons from anonymous and foreign operators',async()=>{
  const f=await fixture()
  await expect(f.t.query(api.evaluations.suites,{})).rejects.toThrow(/Authenticated/)
  expect(await f.other.query(api.evaluations.suites,{})).toEqual([])
  await expect(f.other.query(api.evaluations.runs,{suiteId:f.suiteId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'foreign',config,outputs:answers})).rejects.toThrow(/unavailable/)
  const baselineId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'a',config,outputs:answers})
  const candidateId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'b',config,outputs:answers})
  await expect(f.other.query(api.evaluations.comparison,{baselineId,candidateId})).rejects.toThrow(/unavailable/)
 })
 it('freezes suite versions, reuses exact retry and refuses stale changes',async()=>{
  const f=await fixture();expect(await f.owner.mutation(api.evaluations.createSuite,f.args)).toBe(f.suiteId)
  await expect(f.owner.mutation(api.evaluations.createSuite,{...f.args,title:'Different'})).rejects.toThrow(/changed/)
  const next=await f.owner.mutation(api.evaluations.createSuite,{...f.args,expectedVersion:1,cases:[{...cases[0],expected:'REVIEW'},cases[1]]})
  expect(next).not.toBe(f.suiteId)
  const suites=await f.owner.query(api.evaluations.suites,{})
  expect(suites.map(s=>s.version)).toEqual([2,1]);expect(suites[1].cases[0].expected).toBe('STOP');expect(suites[1].digest).not.toBe(suites[0].digest)
 })
 it('grades full JSON key sets, text whitespace and missing answers independently',()=>{
  expect(summary(grade(cases,answers))).toMatchObject({passed:2,allPassed:true})
  const bad=grade(cases,[{key:'budget',output:'STOP '},{key:'claim',output:'{"decision":"unknown","support":[],"extra":true}'}])
  expect(summary(bad)).toMatchObject({failed:2,criticalFailures:2})
  const partial=summary(grade(cases,[answers[0],{key:'claim',output:null}]))
  expect(partial).toMatchObject({passed:1,notRun:1,answered:1,accuracy:1,complete:false,allPassed:false,criticalFailures:1})
  expect(grade(cases,[answers[0],{key:'claim',output:'not json'}])[1].status).toBe('fail')
 })
 it('rejects overflow and excessive JSON nesting rather than normalizing to null',()=>{
  expect(()=>canonical(JSON.parse('1e999'))).toThrow(/finite/)
  let deep:unknown=null;for(let i=0;i<26;i++)deep=[deep]
  expect(()=>canonical(deep)).toThrow(/nesting/)
  expect(grade([{...cases[1],expected:'null'}],[{key:'claim',output:'1e999'}])[0].status).toBe('fail')
 })
 it('requires exact case population and enforces input and credential limits before persistence',async()=>{
  const f=await fixture(),a={suiteId:f.suiteId,requestKey:'bad',config}
  for(const outputs of [[answers[0]],[answers[0],answers[0]],[answers[0],{key:'foreign',output:'x'}],[answers[0],{key:'claim',output:'x'.repeat(4001)}],[answers[0],{key:'claim',output:'x'+String.fromCharCode(0)}]]){
   await expect(f.owner.mutation(api.evaluations.record,{...a,outputs})).rejects.toThrow()
  }
  await expect(f.owner.mutation(api.evaluations.createSuite,{...f.args,suiteKey:'empty',cases:[]})).rejects.toThrow(/1–12/)
  await expect(f.owner.mutation(api.evaluations.createSuite,{...f.args,suiteKey:'nul-expected',cases:[{...cases[0],expected:'STOP'+String.fromCharCode(0)}]})).rejects.toThrow(/Expected output/)
  await expect(f.owner.mutation(api.evaluations.record,{...a,outputs:answers,config:{...config,toolVersion:'sk_live_'+'a'.repeat(30)}})).rejects.toThrow(/credential/)
  expect(await f.owner.query(api.evaluations.runs,{suiteId:f.suiteId})).toEqual([])
 })
 it('makes exact run retries idempotent, rejects conflicts and preserves negative results',async()=>{
  const f=await fixture(),a={suiteId:f.suiteId,requestKey:'run1',config,outputs:answers},id=await f.owner.mutation(api.evaluations.record,a)
  expect(await f.owner.mutation(api.evaluations.record,{...a,outputs:[...answers].reverse()})).toBe(id)
  await expect(f.owner.mutation(api.evaluations.record,{...a,config:{...config,promptVersion:'p2'}})).rejects.toThrow(/different/)
  const candidateId=await f.owner.mutation(api.evaluations.record,{...a,requestKey:'run2',outputs:[{key:'budget',output:'CONTINUE'},answers[1]]})
  const comparison=await f.owner.query(api.evaluations.comparison,{baselineId:id,candidateId})
  expect(comparison).toMatchObject({comparable:true,improved:0,regressed:1})
  const rows=await f.owner.query(api.evaluations.runs,{suiteId:f.suiteId})
  expect(rows).toHaveLength(2);expect(rows[0].provenance).toBe('operator-submitted');expect(rows[1].outputs).toEqual(answers)
 })
 it('marks paired missing answers inconclusive and refuses cross-version or self comparisons',async()=>{
  const f=await fixture(),base={suiteId:f.suiteId,config,outputs:answers},baselineId=await f.owner.mutation(api.evaluations.record,{...base,requestKey:'complete'})
  const candidateId=await f.owner.mutation(api.evaluations.record,{...base,requestKey:'partial',outputs:[answers[0],{key:'claim',output:null}]})
  expect(await f.owner.query(api.evaluations.comparison,{baselineId,candidateId})).toMatchObject({comparable:false,regressed:0})
  await expect(f.owner.query(api.evaluations.comparison,{baselineId,candidateId:baselineId})).rejects.toThrow(/different/)
  const suiteId=await f.owner.mutation(api.evaluations.createSuite,{...f.args,suiteKey:'other-suite'})
  const foreignVersion=await f.owner.mutation(api.evaluations.record,{...base,suiteId,requestKey:'new'})
  await expect(f.owner.query(api.evaluations.comparison,{baselineId,candidateId:foreignVersion})).rejects.toThrow(/same frozen suite/)
 })
 it('retains history at suite and run limits without blocking identical retries or touching billing',async()=>{
  const f=await fixture(),a={suiteId:f.suiteId,requestKey:'first',config,outputs:answers},id=await f.owner.mutation(api.evaluations.record,a)
  const template=await f.t.run(c=>c.db.get(id)) as Doc<'evaluationRuns'>|null
  await f.t.run(async c=>{const {_id,_creationTime,...row}=template!;for(let i=0;i<49;i++)await c.db.insert('evaluationRuns',{...row,requestKey:'retained-'+i})})
  await expect(f.owner.mutation(api.evaluations.record,{...a,requestKey:'over'})).rejects.toThrow(/50-run/)
  expect(await f.owner.mutation(api.evaluations.record,a)).toBe(id)
  const s=await f.t.run(c=>c.db.get(f.suiteId)) as Doc<'evaluationSuites'>|null
  await f.t.run(async c=>{const {_id,_creationTime,...row}=s!;for(let i=0;i<19;i++)await c.db.insert('evaluationSuites',{...row,suiteKey:'retained-'+i})})
  await expect(f.owner.mutation(api.evaluations.createSuite,{...f.args,suiteKey:'over'})).rejects.toThrow(/20-suite/)
  expect(await f.owner.mutation(api.evaluations.createSuite,f.args)).toBe(f.suiteId)
  expect(await f.t.run(c=>c.db.query('billingAccounts').collect())).toEqual([])
  expect(await f.t.run(c=>c.db.query('providerInvocations').collect())).toEqual([])
 })
 it('records immutable semantic rubric reviews bound to the exact suite and answer run',async()=>{
  const f=await fixture(),runId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'review-target',config,outputs:answers})
  const scores=[{key:'budget',correctness:5,completeness:4,instructionAdherence:5,grounding:4,safety:5,rationale:'The stop decision is exact and respects the budget guard.'},{key:'claim',correctness:4,completeness:5,instructionAdherence:4,grounding:4,safety:5,rationale:'The answer explicitly marks uncertainty and contains no unsupported claim.'}]
  const args={runId,requestKey:'rubric-1',scores},id=await f.owner.mutation(api.evaluations.recordReview,args)
  expect(await f.owner.mutation(api.evaluations.recordReview,{...args,scores:[...scores].reverse()})).toBe(id)
  const rows=await f.owner.query(api.evaluations.reviews,{runId}),suite=(await f.owner.query(api.evaluations.suites,{}))[0],savedRuns=await f.owner.query(api.evaluations.runs,{suiteId:f.suiteId})
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({reviewVersion:'human-rubric-v1',provenance:'owner-submitted-review',suiteDigest:suite.digest,runDigest:savedRuns[0].payloadDigest,averages:{correctness:4.5,completeness:4.5,instructionAdherence:4.5,grounding:4,safety:5,overall:4.5}})
  await expect(f.owner.mutation(api.evaluations.recordReview,{...args,scores:[{...scores[0],correctness:2},scores[1]]})).rejects.toThrow(/different rubric scores/)
  await expect(f.other.query(api.evaluations.reviews,{runId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evaluations.recordReview,args)).rejects.toThrow(/unavailable/)
 })
 it('records immutable identity-masked pairwise reviews with stable A/B assignment and owner privacy',async()=>{
  const f=await fixture(),firstId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'first',config,outputs:answers}),secondId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'second',config:{...config,model:'other-model'},outputs:[{key:'budget',output:'CONTINUE'},answers[1]]})
  const pair=await f.owner.query(api.evaluations.blindPair,{firstRunId:firstId,secondRunId:secondId}),reverse=await f.owner.query(api.evaluations.blindPair,{firstRunId:secondId,secondRunId:firstId})
  expect(pair.leftRunId).toBe(reverse.leftRunId);expect(pair.rightRunId).toBe(reverse.rightRunId);expect(pair.cases[0]).toHaveProperty('leftOutput');expect(pair).not.toHaveProperty('config')
  const decisions=[{key:'budget',preference:'left' as const,rationale:'Answer A follows the stop rule and prevents unauthorized spending.'},{key:'claim',preference:'tie' as const,rationale:'Both outputs preserve the exact structured claim and evidence fields.'}]
  const args={firstRunId:firstId,secondRunId:secondId,requestKey:'pair-1',decisions},id=await f.owner.mutation(api.evaluations.recordBlindComparison,args)
  expect(await f.owner.mutation(api.evaluations.recordBlindComparison,{...args,decisions:[...decisions].reverse()})).toBe(id)
  const rows=await f.owner.query(api.evaluations.blindReviews,{firstRunId:secondId,secondRunId:firstId})
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({reviewVersion:'masked-pairwise-v1',provenance:'owner-submitted-masked-review',suiteDigest:pair.suiteDigest,totals:{left:1,right:0,tie:1,neither:0}})
  await expect(f.owner.mutation(api.evaluations.recordBlindComparison,{...args,decisions:[{...decisions[0],preference:'right' as const},decisions[1]]})).rejects.toThrow(/different decisions/)
  await expect(f.other.query(api.evaluations.blindPair,{firstRunId:firstId,secondRunId:secondId})).rejects.toThrow(/unavailable/)
  await expect(f.other.mutation(api.evaluations.recordBlindComparison,args)).rejects.toThrow(/unavailable/)
 })
 it('rejects incomplete pairwise decisions and weak rationales before saving',async()=>{
  const f=await fixture(),firstId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'first',config,outputs:answers}),secondId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'second',config:{...config,model:'other-model'},outputs:answers})
  const decisions=[{key:'budget',preference:'left' as const,rationale:'Specific evidence supports preferring answer A.'},{key:'claim',preference:'right' as const,rationale:'Specific evidence supports preferring answer B.'}]
  for(const invalid of [[decisions[0]],[decisions[0],{...decisions[1],key:'unknown'}],[decisions[0],{...decisions[1],rationale:'bad'}]])await expect(f.owner.mutation(api.evaluations.recordBlindComparison,{firstRunId:firstId,secondRunId:secondId,requestKey:'invalid-'+String(invalid.length)+String(invalid[1]?.key),decisions:invalid})).rejects.toThrow()
  expect(await f.owner.query(api.evaluations.blindReviews,{firstRunId:firstId,secondRunId:secondId})).toEqual([])
 })
 it('rejects incomplete, out-of-range and unsupported rubric scores before saving',async()=>{
  const f=await fixture(),runId=await f.owner.mutation(api.evaluations.record,{suiteId:f.suiteId,requestKey:'review-target',config,outputs:answers})
  const scores=[{key:'budget',correctness:5,completeness:4,instructionAdherence:5,grounding:4,safety:5,rationale:'Specific evidence for this score.'},{key:'claim',correctness:4,completeness:5,instructionAdherence:4,grounding:4,safety:5,rationale:'Specific evidence for this other score.'}]
  for(const invalid of [[scores[0]],[scores[0],{...scores[1],safety:6}],[scores[0],{...scores[1],rationale:'bad'}],[scores[0],{...scores[1],key:'unknown'}]])await expect(f.owner.mutation(api.evaluations.recordReview,{runId,requestKey:'invalid-'+String(invalid.length)+String(invalid[1]?.safety),scores:invalid})).rejects.toThrow()
  expect(await f.owner.query(api.evaluations.reviews,{runId})).toEqual([])
 })
})
