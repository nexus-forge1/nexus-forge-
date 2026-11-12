import {defineTable} from 'convex/server'
import {v,ConvexError} from 'convex/values'
import {bounded,secrets} from './studioModel'
export const evaluationCase=v.object({key:v.string(),category:v.string(),input:v.string(),expected:v.string(),grader:v.union(v.literal('exact-text'),v.literal('exact-json')),critical:v.boolean()})
export const evaluationConfig=v.object({agent:v.string(),model:v.string(),promptVersion:v.string(),toolVersion:v.string()})
export const evaluationOutput=v.object({key:v.string(),output:v.union(v.string(),v.null())})
export const evaluationResult=v.object({key:v.string(),category:v.string(),critical:v.boolean(),status:v.union(v.literal('pass'),v.literal('fail'),v.literal('not_run')),detail:v.string()})
export const rubricScore=v.object({key:v.string(),correctness:v.number(),completeness:v.number(),instructionAdherence:v.number(),grounding:v.number(),safety:v.number(),rationale:v.string()})
export const blindDecision=v.object({key:v.string(),preference:v.union(v.literal('left'),v.literal('right'),v.literal('tie'),v.literal('neither')),rationale:v.string()})
export const evaluationTables={
 evaluationSuites:defineTable({ownerKey:v.string(),suiteKey:v.string(),title:v.string(),version:v.number(),cases:v.array(evaluationCase),digest:v.string(),graderVersion:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 evaluationRuns:defineTable({ownerKey:v.string(),suiteId:v.id('evaluationSuites'),requestKey:v.string(),config:evaluationConfig,provenance:v.literal('operator-submitted'),outputs:v.array(evaluationOutput),results:v.array(evaluationResult),payloadDigest:v.string(),createdAt:v.number()}).index('by_suite',['suiteId']).index('by_suite_request',['suiteId','requestKey']),
 evaluationReviews:defineTable({ownerKey:v.string(),suiteId:v.id('evaluationSuites'),runId:v.id('evaluationRuns'),requestKey:v.string(),suiteDigest:v.string(),runDigest:v.string(),reviewVersion:v.literal('human-rubric-v1'),provenance:v.literal('owner-submitted-review'),scores:v.array(rubricScore),averages:v.object({correctness:v.number(),completeness:v.number(),instructionAdherence:v.number(),grounding:v.number(),safety:v.number(),overall:v.number()}),payloadDigest:v.string(),createdAt:v.number()}).index('by_run',['runId']).index('by_run_request',['runId','requestKey']),
 evaluationBlindReviews:defineTable({ownerKey:v.string(),suiteId:v.id('evaluationSuites'),pairKey:v.string(),leftRunId:v.id('evaluationRuns'),rightRunId:v.id('evaluationRuns'),requestKey:v.string(),suiteDigest:v.string(),leftRunDigest:v.string(),rightRunDigest:v.string(),reviewVersion:v.literal('masked-pairwise-v1'),provenance:v.literal('owner-submitted-masked-review'),decisions:v.array(blindDecision),totals:v.object({left:v.number(),right:v.number(),tie:v.number(),neither:v.number()}),payloadDigest:v.string(),createdAt:v.number()}).index('by_pair',['pairKey']).index('by_pair_request',['pairKey','requestKey']),
}
export type EvalCase={key:string;category:string;input:string;expected:string;grader:'exact-text'|'exact-json';critical:boolean}
export type EvalResult={key:string;category:string;critical:boolean;status:'pass'|'fail'|'not_run';detail:string}
export const graderVersion='deterministic-output-v1'
export const reviewVersion='human-rubric-v1'
export const blindReviewVersion='masked-pairwise-v1'
export type BlindDecision={key:string;preference:'left'|'right'|'tie'|'neither';rationale:string}
export function validateBlindDecisions(expectedKeys:string[],decisions:BlindDecision[]){
 if(decisions.length!==expectedKeys.length||new Set(decisions.map(d=>d.key)).size!==decisions.length||expectedKeys.some(key=>!decisions.some(d=>d.key===key)))throw new ConvexError('Provide exactly one pairwise preference for every frozen case key')
 return expectedKeys.map(key=>{const decision=decisions.find(d=>d.key===key)!;const rationale=bounded(decision.rationale,'Pairwise rationale',1000);if(rationale.trim().length<12)throw new ConvexError('Each pairwise decision needs a specific rationale of at least 12 characters');secrets(rationale);return{...decision,key,rationale}})
}
export function summarizeBlindDecisions(decisions:BlindDecision[]){return{left:decisions.filter(d=>d.preference==='left').length,right:decisions.filter(d=>d.preference==='right').length,tie:decisions.filter(d=>d.preference==='tie').length,neither:decisions.filter(d=>d.preference==='neither').length}}
export type RubricScore={key:string;correctness:number;completeness:number;instructionAdherence:number;grounding:number;safety:number;rationale:string}
export function validateRubricScores(expectedKeys:string[],scores:RubricScore[]){
 if(scores.length!==expectedKeys.length||new Set(scores.map(s=>s.key)).size!==scores.length||expectedKeys.some(key=>!scores.some(s=>s.key===key)))throw new ConvexError('Provide exactly one rubric score for every frozen case key')
 const dimensions=['correctness','completeness','instructionAdherence','grounding','safety'] as const
 return expectedKeys.map(key=>{const score=scores.find(s=>s.key===key)!;for(const dimension of dimensions)if(!Number.isInteger(score[dimension])||score[dimension]<1||score[dimension]>5)throw new ConvexError('Rubric dimensions must be whole scores from 1 to 5');const rationale=bounded(score.rationale,'Review rationale',1000);if(rationale.trim().length<12)throw new ConvexError('Each case needs a specific review rationale of at least 12 characters');secrets(rationale);return{...score,key,rationale}})
}
export function rubricAverages(scores:RubricScore[]){
 const dimensions=['correctness','completeness','instructionAdherence','grounding','safety'] as const
 const averages=Object.fromEntries(dimensions.map(d=>[d,scores.reduce((sum,s)=>sum+s[d],0)/scores.length])) as Record<typeof dimensions[number],number>
 return{...averages,overall:dimensions.reduce((sum,d)=>sum+averages[d],0)/dimensions.length}
}
export function canonical(value:unknown,depth=0):string{
 if(depth>24)throw new ConvexError('JSON nesting exceeds 24 levels')
 if(typeof value==='number'&&!Number.isFinite(value))throw new ConvexError('JSON numbers must be finite')
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 if(Array.isArray(value))return '['+value.map(v=>canonical(v,depth+1)).join(',')+']'
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k],depth+1)).join(',')+'}'
}
export function validateCases(cases:EvalCase[]){
 if(cases.length<1||cases.length>12)throw new ConvexError('Provide 1–12 cases')
 const keys=new Set<string>()
 return cases.map(c=>{
  const key=bounded(c.key,'Case key',60),category=bounded(c.category,'Category',80),input=bounded(c.input,'Task input',2000)
  if(!/^[a-z0-9][a-z0-9_-]*$/.test(key)||keys.has(key))throw new ConvexError('Use distinct lowercase case keys')
  keys.add(key)
  if(new TextEncoder().encode(c.expected).length>2000||c.expected.includes(String.fromCharCode(0)))throw new ConvexError('Expected output exceeds 2000 bytes')
  if(c.grader==='exact-json'){try{canonical(JSON.parse(c.expected))}catch{throw new ConvexError('Expected JSON must be valid and bounded in depth')}}
  secrets(JSON.stringify(c))
  return{...c,key,category,input}
 })
}
export function grade(cases:EvalCase[],outputs:{key:string;output:string|null}[]):EvalResult[]{
 if(outputs.length!==cases.length||new Set(outputs.map(o=>o.key)).size!==cases.length||outputs.some(o=>!cases.some(c=>c.key===o.key)))throw new ConvexError('Provide each case key exactly once; use null for not run')
 return cases.map(c=>{
  const output=outputs.find(o=>o.key===c.key)!.output
  if(output===null)return{key:c.key,category:c.category,critical:c.critical,status:'not_run',detail:'No answer supplied; excluded from answered accuracy'}
  if(new TextEncoder().encode(output).length>4000||output.includes(String.fromCharCode(0)))throw new ConvexError('Answer exceeds 4000 UTF-8 bytes')
  secrets(output)
  let pass=false,detail=''
  if(c.grader==='exact-text'){pass=output===c.expected;detail=pass?'Exact text matched':'Exact text differed (including whitespace)'}
  else{try{pass=canonical(JSON.parse(output))===canonical(JSON.parse(c.expected));detail=pass?'JSON values and complete key sets matched':'JSON values or complete key sets differed'}catch{detail='Answer is not valid bounded JSON'}}
  return{key:c.key,category:c.category,critical:c.critical,status:pass?'pass':'fail',detail}
 })
}
export function summary(results:EvalResult[]){
 const passed=results.filter(r=>r.status==='pass').length,failed=results.filter(r=>r.status==='fail').length,notRun=results.filter(r=>r.status==='not_run').length
 return{passed,failed,notRun,total:results.length,answered:passed+failed,accuracy:passed+failed?passed/(passed+failed):null,complete:notRun===0,allPassed:results.length>0&&passed===results.length,criticalFailures:results.filter(r=>r.critical&&r.status!=='pass').length}
}
export function compareResults(base:EvalResult[],candidate:EvalResult[]){
 if(base.length!==candidate.length||base.some((r,i)=>r.key!==candidate[i]?.key))throw new ConvexError('Comparison requires the same frozen suite order')
 const comparable=base.every(r=>r.status!=='not_run')&&candidate.every(r=>r.status!=='not_run')
 const changes=base.map((r,i)=>({key:r.key,change:r.status==='not_run'||candidate[i].status==='not_run'?'inconclusive':r.status===candidate[i].status?'unchanged':candidate[i].status==='pass'?'improved':'regressed'}))
 return{comparable,changes,improved:changes.filter(r=>r.change==='improved').length,regressed:changes.filter(r=>r.change==='regressed').length}
}
