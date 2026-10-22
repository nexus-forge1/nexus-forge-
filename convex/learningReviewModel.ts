import {v} from 'convex/values'
export const reviewKind=v.union(v.literal('retrieval'),v.literal('reuse'))
export const learningReviewFields={ownerKey:v.string(),kind:reviewKind,sourceIds:v.array(v.id('memories')),snapshots:v.array(v.object({id:v.id('memories'),category:v.string(),value:v.string()})),notes:v.string(),summary:v.string(),createdAt:v.number()}
type Source={id:string;value:string}
type Metric={metric:string;unit:string;baselineMean:number;candidateMean:number;benefitMean:number;improved:number;regressed:number;unchanged:number}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e12
const key=(s:unknown)=>typeof s==='string'&&s.trim()?s.trim():(()=>{throw Error('Malformed evidence identity')})()
function summarize(metric:string,unit:string,baseline:number[],candidate:number[],lower=false):Metric{
 const benefits=candidate.map((value,i)=>(value-baseline[i])*(lower?-1:1))
 const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length
 return {metric,unit,baselineMean:mean(baseline),candidateMean:mean(candidate),benefitMean:mean(benefits),improved:benefits.filter(n=>n>1e-6).length,regressed:benefits.filter(n=>n< -1e-6).length,unchanged:benefits.filter(n=>Math.abs(n)<=1e-6).length}
}
export function buildLearningReview(kind:'retrieval'|'reuse',sources:Source[]){
 if(sources.length<2||sources.length>20||new Set(sources.map(row=>row.id)).size!==sources.length)throw Error('Select 2–20 distinct saved receipts')
 const records=sources.map(row=>{try{return JSON.parse(row.value)}catch{throw Error('A selected evidence receipt is malformed')}})
 let metrics:Metric[]
 if(kind==='retrieval'){
  const tasks=new Set<string>(),scores:{baseline:number[];candidate:number[]}[]=[]
  for(const record of records){
   if(record?.version!=='lesson-retrieval-v1'||!Array.isArray(record.expected)||!record.expected.length||record.expected.length>20)throw Error('Unsupported retrieval receipt')
   const task=JSON.stringify([record.missionId??null,key(record.search).toLowerCase().replace(/\s+/g,' ')])
   if(tasks.has(task))throw Error('Repeated search questions in the same scope cannot count as separate tasks')
   tasks.add(task)
   const expected=new Set(record.expected.map((row:any)=>key(row.id)))
   if(expected.size!==record.expected.length)throw Error('Duplicate relevance labels')
   const score=(method:any)=>{
    if(!Array.isArray(method?.results)||method.results.length>5)throw Error('Invalid retrieval ranking')
    const ids=method.results.map((row:any)=>key(row.id))
    if(new Set(ids).size!==ids.length)throw Error('Duplicate ranked evidence')
    const hits=ids.filter((id:string)=>expected.has(id)).length,first=ids.findIndex((id:string)=>expected.has(id))
    return [hits/5,hits/expected.size,first<0?0:1/(first+1)]
   }
   scores.push({baseline:score(record.baseline),candidate:score(record.candidate)})
  }
  metrics=['Precision@5','Recall@5','Reciprocal rank'].map((name,index)=>summarize(name,'ratio',scores.map(s=>s.baseline[index]),scores.map(s=>s.candidate[index])))
 }else{
  let group='',metric='',unit='',lower=false
  const used=new Set<string>(),missions=new Set<string>(),baseline:number[]=[],candidate:number[]=[]
  for(const record of records){
   const a=record?.baseline,b=record?.candidate,product=record?.version==='strategy-reuse-product-v1'
   if(!['strategy-reuse-v1','strategy-reuse-product-v1'].includes(record?.version)||record.applied!==true||!a||!b||!finite(a.actual)||!finite(b.actual)||!finite(a.target)||a.target!==b.target||a.metric!==b.metric||a.unit!==b.unit||!['higher','lower'].includes(record.direction))throw Error('Unsupported or incompatible reuse receipt')
   const ids=[key(a.id),key(b.id)]
   if(ids[0]===ids[1]||ids.some(id=>used.has(id)))throw Error('A measurement cannot be reused as an independent comparison')
   ids.forEach(id=>used.add(id))
   const mission=key(b.missionId)
   if(missions.has(mission))throw Error('Use different candidate missions for repeated reuse comparisons')
   missions.add(mission)
   if(product&&(!finite(a.sampleSize)||a.sampleSize<=0||a.sampleSize!==b.sampleSize||!finite(a.periodStart)||!finite(a.periodEnd)||!finite(b.periodStart)||!finite(b.periodEnd)||a.periodEnd<=a.periodStart||a.periodEnd-a.periodStart!==b.periodEnd-b.periodStart||a.method!==b.method))throw Error('Product samples, methods and periods must match')
   const identity=JSON.stringify([record.version,key(record.strategyId),key(record.lessonId),key(a.metric),key(a.unit),a.target,record.direction,...(product?[key(a.method),a.sampleSize,a.periodEnd-a.periodStart]:[])])
   if(group&&group!==identity)throw Error('Use the same lesson, strategy, metric, unit, target, direction and product conditions')
   group=identity;metric=a.metric;unit=a.unit;lower=record.direction==='lower';baseline.push(a.actual);candidate.push(b.actual)
  }
  metrics=[summarize(metric,unit,baseline,candidate,lower)]
 }
 const regressions=metrics.some(metric=>metric.regressed>0),improvements=metrics.some(metric=>metric.improved>0)
 const status=regressions?'regression-observed':improvements?'improvement-observed':'no-improvement-observed'
 return {version:'learning-evidence-review-v1',kind,units:sources.length,metrics,status,recommendation:regressions?'Review the retained regressions before considering reuse. A positive mean does not erase a failed comparison.':improvements?'Improvement appears in selected observations. Replicate on representative tasks before changing policy.':'No measured improvement appears in these selected observations. Collect additional comparable evidence.',limitation:'Selected historical evidence with operator relevance/application labels. Corpus, cohort and task equivalence are not independently verified. No causal proof, statistical certification, policy promotion or full-history coverage.'}
}
