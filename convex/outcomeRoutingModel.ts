import {defineTable} from 'convex/server'
import {v} from 'convex/values'
import type {Infer} from 'convex/values'
import {graphProvider} from './graphExecutionModel'
export type RoutingProvider=Infer<typeof graphProvider>
export const routingVersion='graph-contract-routing-v1'
export const routingPolicyInput={policyKey:v.string(),title:v.string(),graphId:v.id('missionGraphs'),allowedProviders:v.array(graphProvider),maxOutputTokens:v.number(),minimumRuns:v.number(),minimumContractRate:v.number(),maxMeanChargeCents:v.number(),maxMeanRequestMs:v.number(),maxPromptBytes:v.number(),maxAgeHours:v.number()}
export const routingPolicyFields={...routingPolicyInput,ownerKey:v.string(),projectId:v.id('studioProjects'),revision:v.number(),scope:v.union(v.literal('test'),v.literal('live')),missionSnapshot:v.string(),policyDigest:v.string(),version:v.string(),createdAt:v.number()}
export const routingDecisionFields={ownerKey:v.string(),policyId:v.id('routingPolicies'),requestKey:v.string(),sourceDigest:v.string(),snapshot:v.string(),createdAt:v.number(),executionId:v.optional(v.id('graphExecutions')),executionKey:v.optional(v.string())}
export const routingTables={
 routingPolicies:defineTable(routingPolicyFields).index('by_project',['projectId']),
 routingDecisions:defineTable(routingDecisionFields).index('by_policy',['policyId']),
}
export type RoutingLimits={allowedProviders:RoutingProvider[];minimumRuns:number;minimumContractRate:number;maxMeanChargeCents:number;maxMeanRequestMs:number;maxPromptBytes:number}
export type RoutingWorker={nodeKey:string;invocationId:string;valid:boolean;chargeCents:number;requestMs:number;promptBytes:number}
export type RoutingObservation={id:string;provider:RoutingProvider;model:string;state:'verified'|'unresolved'|'ignored'|'stale';reason:string;observedAt:number;workers:RoutingWorker[]}
export type RoutingCandidate={provider:RoutingProvider;model:string;configured:boolean;runs:number;requests:number;unresolved:number;coverage:number;totalNodes:number;contractRate:number|null;meanChargeCents:number|null;meanRequestMs:number|null;reasons:string[];eligible:boolean}
export type RoutingSnapshot={version:string;scope:'test'|'live';graphDigest:string;missionDigest:string;candidates:RoutingCandidate[];observations:RoutingObservation[];winner:{provider:RoutingProvider;model:string}|null;disposition:'recommendation'|'hold';reason:string}
export function rankRouting(nodes:string[],policy:RoutingLimits,observations:RoutingObservation[],configs:Partial<Record<RoutingProvider,{model:string;configured:boolean}>>){
 const candidates:RoutingCandidate[]=policy.allowedProviders.map(provider=>{
  const config=configs[provider]??{model:'unavailable',configured:false},matched=observations.filter(o=>o.provider===provider&&o.model===config.model),valid=matched.filter(o=>o.state==='verified'),unresolved=matched.filter(o=>o.state==='unresolved').length,workers=valid.flatMap(o=>o.workers)
  const groups=nodes.map(key=>workers.filter(w=>w.nodeKey===key)),covered=groups.filter(g=>g.length>0).length,completeCoverage=covered===nodes.length
  const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length
  const contractRate=completeCoverage?mean(groups.map(g=>mean(g.map(w=>w.valid?1:0)))):null,meanChargeCents=completeCoverage?mean(groups.map(g=>mean(g.map(w=>w.chargeCents)))):null,meanRequestMs=completeCoverage?mean(groups.map(g=>mean(g.map(w=>w.requestMs)))):null
  const reasons:string[]=[]
  if(!config.configured)reasons.push('Named provider is not configured; configuration is not a health check')
  if(unresolved)reasons.push('Unresolved provider or accounting evidence cannot be omitted, even when old')
  if(valid.length<policy.minimumRuns)reasons.push('Need '+policy.minimumRuns+' confirmed terminal runs of this exact workload')
  if(!completeCoverage)reasons.push('Every frozen graph node needs measured coverage')
  if(contractRate!==null&&contractRate<policy.minimumContractRate)reasons.push('Typed handoff adherence is below the policy threshold')
  if(meanChargeCents===null)reasons.push('Comparable charge evidence is missing')
  else if(meanChargeCents>policy.maxMeanChargeCents)reasons.push('Mean settled request charge exceeds the policy ceiling')
  if(meanRequestMs===null)reasons.push('Comparable request-duration evidence is missing')
  else if(meanRequestMs>policy.maxMeanRequestMs)reasons.push('Mean request duration exceeds the policy ceiling')
  if(workers.some(w=>w.promptBytes>policy.maxPromptBytes))reasons.push('Observed request context exceeds the policy byte ceiling')
  return{provider,model:config.model,configured:config.configured,runs:valid.length,requests:workers.length,unresolved,coverage:covered,totalNodes:nodes.length,contractRate,meanChargeCents,meanRequestMs,reasons,eligible:reasons.length===0}
 })
 const eligible=candidates.filter(c=>c.eligible).sort((a,b)=>b.contractRate!-a.contractRate!||a.meanChargeCents!-b.meanChargeCents!||a.meanRequestMs!-b.meanRequestMs!||a.provider.localeCompare(b.provider))
 if(!eligible.length)return{candidates,winner:null,disposition:'hold' as const,reason:'No configuration has sufficient matched, settled evidence within all policy constraints'}
 const first=eligible[0],second=eligible[1],tie=second&&Math.abs(first.contractRate!-second.contractRate!)<1e-9&&Math.abs(first.meanChargeCents!-second.meanChargeCents!)<1e-9&&Math.abs(first.meanRequestMs!-second.meanRequestMs!)<1e-9
 if(tie)return{candidates,winner:null,disposition:'hold' as const,reason:'Leading configurations are tied on measured criteria; no superiority inferred'}
 return{candidates,winner:{provider:first.provider,model:first.model},disposition:'recommendation' as const,reason:'Ranked by equal-node typed handoff adherence, then settled charge and request duration; semantic task quality remains unmeasured'}
}
