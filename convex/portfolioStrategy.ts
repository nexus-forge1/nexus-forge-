import {v,ConvexError} from 'convex/values'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {strategyInput,strategyDecision,normalizeStrategy,strategySummary,type StrategyInput} from './portfolioStrategyModel'
async function evidence(ctx:QueryCtx|MutationCtx,projectId:Id<'studioProjects'>){
 const p=await ownedProject(ctx,projectId),mission=await ctx.db.get(p.missionId)
 if(!mission||mission.ownerKey!==p.ownerKey)throw new ConvexError('Project mission unavailable')
 const rows=await ctx.db.query('productOutcomes').withIndex('by_mission',q=>q.eq('missionId',p.missionId)).order('desc').take(21)
 if(rows.some(r=>r.ownerKey!==p.ownerKey))throw new ConvexError('Outcome ownership mismatch')
 const snapshot=canonical({projectId:p._id,title:p.title,missionId:p.missionId,outcomes:rows.slice(0,20),complete:rows.length<=20})
 if(new TextEncoder().encode(snapshot).length>128*1024)throw new ConvexError('Outcome review exceeds the 128-KiB snapshot limit')
 return{p,rows:rows.slice(0,20),complete:rows.length<=20,snapshot,sourceDigest:await digest(snapshot)}
}
export const overview=query({args:{},returns:v.object({complete:v.boolean(),rows:v.array(v.object({projectId:v.id('studioProjects'),title:v.string(),review:v.union(v.null(),v.object({decision:strategyDecision,input:v.string(),createdAt:v.number()}))}))}),handler:async ctx=>{
 const owner=await requireOperator(ctx),projects=await ctx.db.query('studioProjects').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(21)
 const rows=await Promise.all(projects.slice(0,20).map(async p=>{const r=await ctx.db.query('portfolioStrategyReviews').withIndex('by_project',q=>q.eq('projectId',p._id)).order('desc').first();return{projectId:p._id,title:p.title,review:r?{decision:r.decision,input:r.input,createdAt:r.createdAt}:null}}))
 return{complete:projects.length<=20,rows}
}})
export const source=query({args:{projectId:v.id('studioProjects')},returns:v.object({snapshot:v.string(),sourceDigest:v.string(),asOf:v.number()}),handler:async(ctx,a)=>{const d=await evidence(ctx,a.projectId);return{snapshot:d.snapshot,sourceDigest:d.sourceDigest,asOf:Date.now()}}})
export const list=query({args:{projectId:v.id('studioProjects')},returns:v.array(v.object({id:v.id('portfolioStrategyReviews'),requestKey:v.string(),decision:strategyDecision,reason:v.string(),input:v.string(),snapshot:v.string(),sourceDigest:v.string(),createdAt:v.number()})),handler:async(ctx,a)=>{
 await ownedProject(ctx,a.projectId)
 return(await ctx.db.query('portfolioStrategyReviews').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)).map(r=>({id:r._id,requestKey:r.requestKey,decision:r.decision,reason:r.reason,input:r.input,snapshot:r.snapshot,sourceDigest:r.sourceDigest,createdAt:r.createdAt}))
}})
export const record=mutation({args:{projectId:v.id('studioProjects'),requestKey:v.string(),expectedSourceDigest:v.string(),decision:strategyDecision,reason:v.string(),...strategyInput},returns:v.id('portfolioStrategyReviews'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),requestKey=bounded(a.requestKey,'Review key',80),reason=bounded(a.reason,'Decision reason',1600,12)
 const {projectId:_project,requestKey:_key,expectedSourceDigest:_digest,decision:_decision,reason:_reason,...raw}=a
 const old=await ctx.db.query('portfolioStrategyReviews').withIndex('by_project',q=>q.eq('projectId',a.projectId)).take(20),prior=old.find(r=>r.requestKey===requestKey)
 // Exact retries return the frozen historical record even after its review deadline.
 if(prior){if(prior.input!==canonical(normalizeStrategy(raw,prior.createdAt))||prior.decision!==a.decision||prior.reason!==reason||prior.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Review key already binds different immutable evidence');return prior._id}
 if(old.length>=20)throw new ConvexError('20 retained strategic reviews per project; existing history is preserved')
 const now=Date.now(),input:StrategyInput=normalizeStrategy(raw,now),d=await evidence(ctx,a.projectId)
 if(d.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Source evidence changed; inspect the current snapshot before review')
 const summary=strategySummary(d.rows,input,now,d.complete)
 if(a.decision==='continue'&&!summary.canContinue)throw new ConvexError('Continue is HOLD: '+summary.holds.join('; '))
 secrets(reason);secrets(requestKey)
 return ctx.db.insert('portfolioStrategyReviews',{ownerKey:p.ownerKey,projectId:a.projectId,requestKey,input:canonical(input),snapshot:canonical({source:JSON.parse(d.snapshot),summary}),sourceDigest:d.sourceDigest,decision:a.decision,reason,createdAt:now})
}})
