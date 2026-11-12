import {v,ConvexError} from 'convex/values'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Doc,Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {requireOperator} from './permissions'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {whole} from './missionGraphModel'
import {missionSnapshot} from './graphExecutionModel'
import {isOllamaProvider} from './ollamaModels'
import {graphProviderConfiguration} from './aiProvider'
import {createGraphExecution} from './graphExecutionData'
import {routingPolicyInput,routingPolicyFields,routingDecisionFields,routingVersion,type RoutingSnapshot} from './outcomeRoutingModel'
import {routingScope,routingSnapshot} from './outcomeRoutingEvidence'
const policy=v.object({_id:v.id('routingPolicies'),_creationTime:v.number(),...routingPolicyFields}),decision=v.object({_id:v.id('routingDecisions'),_creationTime:v.number(),...routingDecisionFields})
async function owned(ctx:QueryCtx|MutationCtx,id:Id<'routingPolicies'>){const owner=await requireOperator(ctx),p=await ctx.db.get(id);if(!p||p.ownerKey!==owner)throw new ConvexError('Routing policy unavailable');await ownedProject(ctx,p.projectId);return p}
export const policiesV2=query({args:{projectId:v.id('studioProjects')},returns:v.array(policy),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return ctx.db.query('routingPolicies').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)}})
export const policies=query({args:{projectId:v.id('studioProjects')},returns:v.array(v.object({_id:v.id('routingPolicies'),_creationTime:v.number(),...routingPolicyFields,allowedProviders:v.array(v.union(v.literal('cloudflare'),v.literal('groq'),v.literal('cerebras')))})),handler:async(ctx,a)=>{
 await ownedProject(ctx,a.projectId)
 const rows=await ctx.db.query('routingPolicies').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)
 return rows.filter(p=>p.allowedProviders.every(provider=>!isOllamaProvider(provider))) as (Doc<'routingPolicies'>&{allowedProviders:('cloudflare'|'groq'|'cerebras')[]})[]
}})
export const createPolicy=mutation({args:{projectId:v.id('studioProjects'),expectedRevision:v.number(),...routingPolicyInput},returns:v.id('routingPolicies'),handler:async(ctx,a)=>{
 const project=await ownedProject(ctx,a.projectId),g=await ctx.db.get(a.graphId),m=g?await ctx.db.get(g.missionId):null
 if(!g||g.projectId!==project._id||g.ownerKey!==project.ownerKey||!m||m.ownerKey!==project.ownerKey)throw new ConvexError('Choose a frozen graph from this project')
 whole(a.expectedRevision,'Expected revision',0,20)
 const {projectId,expectedRevision,...raw}=a,data={...raw,policyKey:bounded(a.policyKey,'Policy key',80),title:bounded(a.title,'Title',140),allowedProviders:[...a.allowedProviders].sort(),maxOutputTokens:whole(a.maxOutputTokens,'Output tokens',64,512),minimumRuns:whole(a.minimumRuns,'Confirmed runs per candidate',2,10),maxPromptBytes:whole(a.maxPromptBytes,'Observed prompt-byte ceiling',1000,8000),maxAgeHours:whole(a.maxAgeHours,'Evidence freshness hours',1,720)}
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(data.policyKey)||!data.allowedProviders.length||data.allowedProviders.length>6||data.allowedProviders.some(provider=>!isOllamaProvider(provider))||new Set(data.allowedProviders).size!==data.allowedProviders.length)throw new ConvexError('Use a lowercase policy key and 1–6 distinct selected Ollama models')
 for(const [value,min,max]of [[a.minimumContractRate,0,1],[a.maxMeanChargeCents,0,100],[a.maxMeanRequestMs,0,300000]])if(!Number.isFinite(value)||value<min||value>max)throw new ConvexError('Use finite adherence 0–1, mean charge 0–100 cents and duration 0–300000 ms')
 secrets(JSON.stringify(data));const scope=routingScope(),snapshot=missionSnapshot(m),policyDigest=await digest(canonical({...data,scope,missionSnapshot:snapshot,version:routingVersion})),rows=await ctx.db.query('routingPolicies').withIndex('by_project',q=>q.eq('projectId',projectId)).take(20),versions=rows.filter(p=>p.policyKey===data.policyKey),same=versions.find(p=>p.revision===expectedRevision+1&&p.policyDigest===policyDigest)
 if(same)return same._id
 if(versions.reduce((n,p)=>Math.max(n,p.revision),0)!==expectedRevision)throw new ConvexError('Policy revision changed; load its latest version before editing')
 if(rows.length>=20)throw new ConvexError('20 routing-policy versions per project; retained history is not deleted')
 return ctx.db.insert('routingPolicies',{...data,ownerKey:project.ownerKey,projectId,revision:expectedRevision+1,scope,missionSnapshot:snapshot,policyDigest,version:routingVersion,createdAt:Date.now()})
}})
export const preview=query({args:{policyId:v.id('routingPolicies')},returns:v.object({snapshot:v.union(v.string(),v.null()),sourceDigest:v.string(),asOf:v.number(),blockedReason:v.string()}),handler:async(ctx,a)=>{const p=await owned(ctx,a.policyId);try{return{...await routingSnapshot(ctx,p),blockedReason:''}}catch(error){return{snapshot:null,sourceDigest:'',asOf:Date.now(),blockedReason:error instanceof ConvexError?String(error.data):'Evidence audit unavailable; retain HOLD and review source records'}}}})
export const decisions=query({args:{policyId:v.id('routingPolicies')},returns:v.array(decision),handler:async(ctx,a)=>{await owned(ctx,a.policyId);return ctx.db.query('routingDecisions').withIndex('by_policy',q=>q.eq('policyId',a.policyId)).order('desc').take(20)}})
export const decide=mutation({args:{policyId:v.id('routingPolicies'),requestKey:v.string(),expectedSourceDigest:v.string()},returns:v.id('routingDecisions'),handler:async(ctx,a)=>{
 const p=await owned(ctx,a.policyId),requestKey=bounded(a.requestKey,'Decision key',100),rows=await ctx.db.query('routingDecisions').withIndex('by_policy',q=>q.eq('policyId',p._id)).take(20),old=rows.find(d=>d.requestKey===requestKey)
 if(old){if(old.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Decision key already has a different evidence snapshot');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained decisions per policy version')
 const result=await routingSnapshot(ctx,p)
 if(result.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Evidence changed; inspect the latest preview before saving a decision')
 return ctx.db.insert('routingDecisions',{ownerKey:p.ownerKey,policyId:p._id,requestKey,sourceDigest:result.sourceDigest,snapshot:result.snapshot,createdAt:Date.now()})
}})
export const freezeExecution=mutation({args:{decisionId:v.id('routingDecisions'),executionKey:v.string()},returns:v.id('graphExecutions'),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),d=await ctx.db.get(a.decisionId)
 if(!d||d.ownerKey!==owner)throw new ConvexError('Routing decision unavailable')
 const p=await owned(ctx,d.policyId),executionKey=bounded(a.executionKey,'Execution key',100)
 if(d.executionId){if(d.executionKey!==executionKey)throw new ConvexError('This decision is already bound to another execution key');return d.executionId}
 if(Date.now()<d.createdAt||Date.now()-d.createdAt>15*60000)throw new ConvexError('Decision is older than 15 minutes; inspect and retain a fresh decision')
 const current=await routingSnapshot(ctx,p),snapshot=JSON.parse(d.snapshot) as RoutingSnapshot
 if(current.sourceDigest!==d.sourceDigest)throw new ConvexError('Source evidence or configuration changed; freeze a fresh routing decision')
 if(snapshot.disposition!=='recommendation'||!snapshot.winner)throw new ConvexError('HOLD: this decision does not authorize a provider selection')
 if(graphProviderConfiguration(snapshot.winner.provider).model!==snapshot.winner.model)throw new ConvexError('Named model changed; review a fresh decision')
 const executionId=await createGraphExecution(ctx,{graphId:p.graphId,executionKey,provider:snapshot.winner.provider,maxOutputTokens:p.maxOutputTokens},{id:d._id,digest:d.sourceDigest})
 await ctx.db.patch(d._id,{executionId,executionKey});return executionId
}})
