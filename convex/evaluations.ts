import {v,ConvexError} from 'convex/values'
import {query,mutation} from './_generated/server'
import type {QueryCtx,MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {bounded,digest,secrets} from './studioModel'
import {evaluationCase,evaluationConfig,evaluationOutput,evaluationResult,rubricScore,blindDecision,graderVersion,reviewVersion,blindReviewVersion,validateCases,validateRubricScores,rubricAverages,validateBlindDecisions,summarizeBlindDecisions,grade,canonical,compareResults} from './evaluationModel'
const suite=v.object({_id:v.id('evaluationSuites'),suiteKey:v.string(),title:v.string(),version:v.number(),cases:v.array(evaluationCase),digest:v.string(),graderVersion:v.string(),createdAt:v.number()})
const run=v.object({_id:v.id('evaluationRuns'),suiteId:v.id('evaluationSuites'),requestKey:v.string(),config:evaluationConfig,provenance:v.literal('operator-submitted'),outputs:v.array(evaluationOutput),results:v.array(evaluationResult),payloadDigest:v.string(),createdAt:v.number()})
const review=v.object({_id:v.id('evaluationReviews'),suiteId:v.id('evaluationSuites'),runId:v.id('evaluationRuns'),requestKey:v.string(),suiteDigest:v.string(),runDigest:v.string(),reviewVersion:v.literal('human-rubric-v1'),provenance:v.literal('owner-submitted-review'),scores:v.array(rubricScore),averages:v.object({correctness:v.number(),completeness:v.number(),instructionAdherence:v.number(),grounding:v.number(),safety:v.number(),overall:v.number()}),payloadDigest:v.string(),createdAt:v.number()})
const blindReview=v.object({_id:v.id('evaluationBlindReviews'),suiteId:v.id('evaluationSuites'),pairKey:v.string(),leftRunId:v.id('evaluationRuns'),rightRunId:v.id('evaluationRuns'),requestKey:v.string(),suiteDigest:v.string(),leftRunDigest:v.string(),rightRunDigest:v.string(),reviewVersion:v.literal('masked-pairwise-v1'),provenance:v.literal('owner-submitted-masked-review'),decisions:v.array(blindDecision),totals:v.object({left:v.number(),right:v.number(),tie:v.number(),neither:v.number()}),payloadDigest:v.string(),createdAt:v.number()})
async function blindPairData(ctx:QueryCtx|MutationCtx,firstId:Id<'evaluationRuns'>,secondId:Id<'evaluationRuns'>){const owner=await requireOperator(ctx),first=await ctx.db.get(firstId),second=await ctx.db.get(secondId);if(!first||!second||first.ownerKey!==owner||second.ownerKey!==owner)throw new ConvexError('Evaluation run unavailable');if(first._id===second._id||first.suiteId!==second.suiteId)throw new ConvexError('Choose two different runs from the same frozen suite');const s=await ctx.db.get(first.suiteId);if(!s||s.ownerKey!==owner)throw new ConvexError('Frozen evaluation suite unavailable');const ordered=[first,second].sort((a,b)=>String(a._id).localeCompare(String(b._id))),assignment=await digest(canonical({suiteDigest:s.digest,runIds:ordered.map(r=>r._id),runDigests:ordered.map(r=>r.payloadDigest)})),left=parseInt(assignment.slice(-1),16)%2===0?ordered[0]:ordered[1],right=left._id===ordered[0]._id?ordered[1]:ordered[0],pairKey=[String(first._id),String(second._id)].sort().join(':');return{owner,s,left,right,pairKey}}
async function owned(ctx:QueryCtx|MutationCtx,id:Id<'evaluationSuites'>){const owner=await requireOperator(ctx),s=await ctx.db.get(id);if(!s||s.ownerKey!==owner)throw new ConvexError('Evaluation suite unavailable');return s}
export const suites=query({args:{},returns:v.array(suite),handler:async ctx=>{
 const owner=await requireOperator(ctx)
 return(await ctx.db.query('evaluationSuites').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(20)).map(({ownerKey,_creationTime,...r})=>r)
}})
export const createSuite=mutation({args:{suiteKey:v.string(),title:v.string(),expectedVersion:v.number(),cases:v.array(evaluationCase)},returns:v.id('evaluationSuites'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),suiteKey=bounded(a.suiteKey,'Suite key',80),title=bounded(a.title,'Title',160),cases=validateCases(a.cases)
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(suiteKey)||!Number.isInteger(a.expectedVersion)||a.expectedVersion<0)throw new ConvexError('Use a lowercase suite key and nonnegative whole version')
 secrets(title);secrets(suiteKey)
 const hash=await digest(canonical({title,cases,graderVersion}))
 const rows=await ctx.db.query('evaluationSuites').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(20)
 const versions=rows.filter(r=>r.suiteKey===suiteKey),latest=versions.reduce((n,r)=>Math.max(n,r.version),0)
 const replay=versions.find(r=>r.version===a.expectedVersion+1&&r.digest===hash)
 if(replay)return replay._id
 if(latest!==a.expectedVersion)throw new ConvexError('Suite changed; load the latest version before saving')
 if(rows.length>=20)throw new ConvexError('20-suite-version limit reached; history is retained')
 return ctx.db.insert('evaluationSuites',{ownerKey,suiteKey,title,version:latest+1,cases,digest:hash,graderVersion,createdAt:Date.now()})
}})
export const runs=query({args:{suiteId:v.id('evaluationSuites')},returns:v.array(run),handler:async(ctx,a)=>{
 await owned(ctx,a.suiteId)
 return(await ctx.db.query('evaluationRuns').withIndex('by_suite',q=>q.eq('suiteId',a.suiteId)).order('desc').take(50)).map(({ownerKey,_creationTime,...r})=>r)
}})
export const record=mutation({args:{suiteId:v.id('evaluationSuites'),requestKey:v.string(),config:evaluationConfig,outputs:v.array(evaluationOutput)},returns:v.id('evaluationRuns'),handler:async(ctx,a)=>{
 const s=await owned(ctx,a.suiteId),requestKey=bounded(a.requestKey,'Run key',100)
 if(s.graderVersion!==graderVersion)throw new ConvexError('Saved grader version is unavailable; keep historical evidence and create a new suite version')
 secrets(requestKey)
 const config={agent:bounded(a.config.agent,'Agent',120),model:bounded(a.config.model,'Model',160),promptVersion:bounded(a.config.promptVersion,'Prompt version',160),toolVersion:bounded(a.config.toolVersion,'Tool version',160)}
 secrets(JSON.stringify(config))
 const results=grade(s.cases,a.outputs),outputs=s.cases.map(c=>a.outputs.find(o=>o.key===c.key)!)
 const payloadDigest=await digest(canonical({config,outputs,suiteDigest:s.digest,graderVersion:s.graderVersion}))
 const old=await ctx.db.query('evaluationRuns').withIndex('by_suite_request',q=>q.eq('suiteId',s._id).eq('requestKey',requestKey)).first()
 if(old){if(old.payloadDigest!==payloadDigest)throw new ConvexError('Run key already records different answers or configuration');return old._id}
 const rows=await ctx.db.query('evaluationRuns').withIndex('by_suite',q=>q.eq('suiteId',s._id)).take(50)
 if(rows.length>=50)throw new ConvexError('50-run limit reached for this suite; history is retained')
 return ctx.db.insert('evaluationRuns',{ownerKey:s.ownerKey,suiteId:s._id,requestKey,config,outputs,results,payloadDigest,provenance:'operator-submitted',createdAt:Date.now()})
}})
export const reviews=query({args:{runId:v.id('evaluationRuns')},returns:v.array(review),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),r=await ctx.db.get(a.runId)
 if(!r||r.ownerKey!==owner)throw new ConvexError('Evaluation run unavailable')
 return(await ctx.db.query('evaluationReviews').withIndex('by_run',q=>q.eq('runId',r._id)).order('desc').take(30)).map(({ownerKey,_creationTime,...row})=>row)
}})
export const recordReview=mutation({args:{runId:v.id('evaluationRuns'),requestKey:v.string(),scores:v.array(rubricScore)},returns:v.id('evaluationReviews'),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),r=await ctx.db.get(a.runId)
 if(!r||r.ownerKey!==owner)throw new ConvexError('Evaluation run unavailable')
 const s=await ctx.db.get(r.suiteId)
 if(!s||s.ownerKey!==owner||s.digest.length===0)throw new ConvexError('Frozen evaluation suite unavailable')
 const requestKey=bounded(a.requestKey,'Review key',100);secrets(requestKey)
 const scores=validateRubricScores(s.cases.map(c=>c.key),a.scores)
 const averages=rubricAverages(scores)
 const payloadDigest=await digest(canonical({suiteDigest:s.digest,runDigest:r.payloadDigest,reviewVersion,scores}))
 const old=await ctx.db.query('evaluationReviews').withIndex('by_run_request',q=>q.eq('runId',r._id).eq('requestKey',requestKey)).first()
 if(old){if(old.payloadDigest!==payloadDigest)throw new ConvexError('Review key already records different rubric scores');return old._id}
 const rows=await ctx.db.query('evaluationReviews').withIndex('by_run',q=>q.eq('runId',r._id)).take(30)
 if(rows.length>=30)throw new ConvexError('30-review limit reached for this run; history is retained')
 return ctx.db.insert('evaluationReviews',{ownerKey:owner,suiteId:s._id,runId:r._id,requestKey,suiteDigest:s.digest,runDigest:r.payloadDigest,reviewVersion,provenance:'owner-submitted-review',scores,averages,payloadDigest,createdAt:Date.now()})
}})
export const blindPair=query({args:{firstRunId:v.id('evaluationRuns'),secondRunId:v.id('evaluationRuns')},returns:v.object({pairKey:v.string(),suiteDigest:v.string(),leftRunId:v.id('evaluationRuns'),rightRunId:v.id('evaluationRuns'),cases:v.array(v.object({key:v.string(),category:v.string(),input:v.string(),leftOutput:v.union(v.string(),v.null()),rightOutput:v.union(v.string(),v.null())}))}),handler:async(ctx,a)=>{const p=await blindPairData(ctx,a.firstRunId,a.secondRunId);return{pairKey:p.pairKey,suiteDigest:p.s.digest,leftRunId:p.left._id,rightRunId:p.right._id,cases:p.s.cases.map(c=>({key:c.key,category:c.category,input:c.input,leftOutput:p.left.outputs.find(o=>o.key===c.key)?.output??null,rightOutput:p.right.outputs.find(o=>o.key===c.key)?.output??null}))}}})
export const blindReviews=query({args:{firstRunId:v.id('evaluationRuns'),secondRunId:v.id('evaluationRuns')},returns:v.array(blindReview),handler:async(ctx,a)=>{const p=await blindPairData(ctx,a.firstRunId,a.secondRunId);return(await ctx.db.query('evaluationBlindReviews').withIndex('by_pair',q=>q.eq('pairKey',p.pairKey)).order('desc').take(30)).map(({ownerKey,_creationTime,...row})=>row)}})
export const recordBlindComparison=mutation({args:{firstRunId:v.id('evaluationRuns'),secondRunId:v.id('evaluationRuns'),requestKey:v.string(),decisions:v.array(blindDecision)},returns:v.id('evaluationBlindReviews'),handler:async(ctx,a)=>{const p=await blindPairData(ctx,a.firstRunId,a.secondRunId),requestKey=bounded(a.requestKey,'Pairwise review key',100);secrets(requestKey);const decisions=validateBlindDecisions(p.s.cases.map(c=>c.key),a.decisions),totals=summarizeBlindDecisions(decisions),payloadDigest=await digest(canonical({suiteDigest:p.s.digest,leftRunDigest:p.left.payloadDigest,rightRunDigest:p.right.payloadDigest,reviewVersion:blindReviewVersion,decisions})),old=await ctx.db.query('evaluationBlindReviews').withIndex('by_pair_request',q=>q.eq('pairKey',p.pairKey).eq('requestKey',requestKey)).first();if(old){if(old.payloadDigest!==payloadDigest)throw new ConvexError('Pairwise review key already records different decisions');return old._id}const rows=await ctx.db.query('evaluationBlindReviews').withIndex('by_pair',q=>q.eq('pairKey',p.pairKey)).take(30);if(rows.length>=30)throw new ConvexError('30 pairwise reviews reached for this run pair; history is retained');return ctx.db.insert('evaluationBlindReviews',{ownerKey:p.owner,suiteId:p.s._id,pairKey:p.pairKey,leftRunId:p.left._id,rightRunId:p.right._id,requestKey,suiteDigest:p.s.digest,leftRunDigest:p.left.payloadDigest,rightRunDigest:p.right.payloadDigest,reviewVersion:blindReviewVersion,provenance:'owner-submitted-masked-review',decisions,totals,payloadDigest,createdAt:Date.now()})}})
export const comparison=query({args:{baselineId:v.id('evaluationRuns'),candidateId:v.id('evaluationRuns')},returns:v.object({comparable:v.boolean(),changes:v.array(v.object({key:v.string(),change:v.string()})),improved:v.number(),regressed:v.number()}),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),b=await ctx.db.get(a.baselineId),c=await ctx.db.get(a.candidateId)
 if(!b||!c||b.ownerKey!==owner||c.ownerKey!==owner)throw new ConvexError('Evaluation run unavailable')
 if(b._id===c._id||b.suiteId!==c.suiteId)throw new ConvexError('Choose two different runs from the same frozen suite')
 return compareResults(b.results,c.results)
}})
