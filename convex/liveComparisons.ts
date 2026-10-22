import {v,ConvexError} from 'convex/values'
import {action,internalMutation} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {internal} from './_generated/api'
import {requireOperator} from './permissions'
import {callNamedEvaluationProvider} from './aiProvider'
export const comparisonCases=[
 {key:'arithmetic',domain:'arithmetic',question:'What is 32 plus 57?',expected:'89'},
 {key:'sorting',domain:'ordering',question:'Sort 9, 2, 5 in ascending order. Use comma-separated integers without spaces.',expected:'2,5,9'},
 {key:'logic',domain:'deduction',question:'A is greater than B and B is greater than C. Is A greater than C? Answer yes or no.',expected:'yes'}
] as const
const version='matched-provider-comparison-v2'
type Provider='cloudflare'|'groq'|'cerebras'
type Style='baseline'|'candidate'
type Row={provider:Provider;style:Style;invocationId?:Id<'providerInvocations'>;status:'complete'|'failed'|'not_run';latencyMs:number;prompt:string;answer?:string;scores?:ReturnType<typeof scoreAnswer>;passed:number;total:number;observedReports:number;detail?:string}
export function scoreAnswer(answer:string){
 let object:Record<string,unknown>|null=null
 try{const parsed=JSON.parse(answer);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))object=parsed}catch{/* Invalid JSON remains a failure. */}
 const shape=object!==null&&Object.keys(object).length===comparisonCases.length&&comparisonCases.every(c=>Object.hasOwn(object!,c.key))
 return comparisonCases.map(c=>({key:c.key,domain:c.domain,expected:c.expected,observed:typeof object?.[c.key]==='string'?String(object[c.key]).trim().slice(0,2000):'',passed:shape&&typeof object?.[c.key]==='string'&&String(object[c.key]).trim()===c.expected}))
}
function requests(){
 const rows:{provider:Provider;style:Style;prompt:string}[]=[]
 const questions=comparisonCases.map(c=>c.key+': '+c.question).join('\n')
 for(const provider of ['cloudflare','groq','cerebras'] as const)for(const style of ['baseline','candidate'] as const){
  const prompt=style==='baseline'?'Answer these questions as a JSON object with string values keyed arithmetic, sorting, logic.\n'+questions:'Return ONLY one valid JSON object. Exactly three string fields: arithmetic, sorting, logic. No Markdown or explanation. Verify arithmetic and ordering before returning.\n'+questions
  rows.push({provider,style,prompt})
 }
 return rows
}
function report(rows:Row[]){
 return {version,cases:comparisonCases,rows,status:rows.some(row=>row.status==='not_run')?'partial':rows.length<6?'in-progress':rows.some(row=>row.status==='failed')?'complete-with-failures':'complete',
  scope:'Small published matched-task prompt comparison on named configured models. Not independent competitor certification, unseen transfer, causal learning improvement or scientific novelty.',
  billing:'Read invocation usage receipts; missing cost is unknown. Admission failures stop further calls; unstarted cases are not scored as attempted model answers.'}
}
export const checkpoint=internalMutation({args:{jobId:v.id('runtimeJobs'),result:v.string()},handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),job=await ctx.db.get(a.jobId)
 if(!job||job.ownerKey!==ownerKey||job.kind!=='provider-comparison'||job.status!=='pending'||JSON.parse(job.input).version!==version||a.result.length>60000)throw new ConvexError('Comparison progress cannot be changed')
 const next=JSON.parse(a.result),expected=requests()
 if(next.version!==version||JSON.stringify(next.cases)!==JSON.stringify(comparisonCases)||!Array.isArray(next.rows)||next.rows.length>6)throw new ConvexError('Invalid comparison progress')
 for(const [index,row]of next.rows.entries()){
  const request=expected[index]
  if(row.provider!==request.provider||row.style!==request.style||row.prompt!==request.prompt||!['complete','failed','not_run'].includes(row.status))throw new ConvexError('Comparison order or identity changed')
 }
 if(job.result){
  const prior=JSON.parse(job.result)
  if(prior.rows.length>next.rows.length||JSON.stringify(prior.rows)!==JSON.stringify(next.rows.slice(0,prior.rows.length)))throw new ConvexError('Saved comparison rows are immutable')
 }
 await ctx.db.patch(job._id,{result:a.result})
 return null
}})
export const run=action({args:{requestKey:v.string()},handler:async(ctx,a):Promise<string>=>{
 const ownerKey=await requireOperator(ctx)
 const admission=await ctx.runMutation(internal.runtimeReceipts.admit,{ownerKey,requestKey:a.requestKey,kind:'provider-comparison',input:JSON.stringify({version})})
 if(admission.cached)return admission.cached
 const rows:Row[]=[],plan=requests()
 const save=async()=>{
  try{await ctx.runMutation(internal.liveComparisons.checkpoint,{jobId:admission.jobId,result:JSON.stringify(report(rows))})}
  catch{throw new ConvexError('Comparison progress could not be confirmed. Review its receipt and invocation usage; no further provider request was started.')}
 }
 await save()
 for(const [index,request]of plan.entries()){
  const startedAt=Date.now()
  let invocationId:Id<'providerInvocations'>
  try{invocationId=await ctx.runMutation(internal.providerUsage.begin,{ownerKey,stage:version+'-'+request.provider+'-'+request.style,role:'research'})}
  catch{
   for(const remaining of plan.slice(index))rows.push({...remaining,status:'not_run',latencyMs:0,passed:0,total:comparisonCases.length,observedReports:0,detail:'Provider accounting admission was unavailable. No inference request started for this row.'})
   await save()
   break
  }
  let observedReports=0,answer:string|undefined
  try{
   answer=await callNamedEvaluationProvider(request.provider,request.prompt,384,async usage=>{
    observedReports++
    await ctx.runMutation(internal.manifestIntelligence.recordProviderUsageInternal,{ownerKey,...usage,invocationId,reportOrdinal:observedReports})
   })
   await ctx.runMutation(internal.providerUsage.finish,{invocationId,outcome:'succeeded',observedReports})
   const scores=scoreAnswer(answer)
   rows.push({...request,invocationId,status:'complete',latencyMs:Math.max(0,Date.now()-startedAt),answer:answer.slice(0,6000),scores,passed:scores.filter(score=>score.passed).length,total:scores.length,observedReports})
  }catch{
   try{await ctx.runMutation(internal.providerUsage.finish,{invocationId,outcome:'failed',observedReports})}catch{/* Pending or committed accounting remains visible. */}
   const scores=answer===undefined?undefined:scoreAnswer(answer)
   rows.push({...request,invocationId,status:'failed',latencyMs:Math.max(0,Date.now()-startedAt),...(answer===undefined?{}:{answer:answer.slice(0,6000),scores}),passed:0,total:comparisonCases.length,observedReports,detail:'Provider failed or accounting could not be confirmed; no provider fallback or retry performed.'})
  }
  // Persist each paid response before any subsequent provider is admitted.
  await save()
 }
 const result=JSON.stringify(report(rows))
 await ctx.runMutation(internal.runtimeReceipts.finish,{jobId:admission.jobId,status:rows.some(row=>row.status==='not_run')?'failed':'complete',result})
 return result
}})
