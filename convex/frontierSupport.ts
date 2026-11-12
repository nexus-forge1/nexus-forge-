import { ConvexError } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
export function text(value:string, name:string, max=2000) { const s=value.trim(); if(!s || s.length>max) throw new ConvexError(name+' is required (maximum '+max+' characters)'); return s }
export function finite(value:number) { if(!Number.isFinite(value)||Math.abs(value)>1e12) throw new ConvexError('A finite bounded measurement is required'); return value }
export async function audit(ctx:MutationCtx, ownerKey:string, area:string, action:string, detail:string) { await ctx.db.insert('frontierAudits',{ownerKey,area,action,detail:detail.slice(0,2000),createdAt:Date.now()}) }
export async function policy(ctx:QueryCtx|MutationCtx, ownerKey:string) { return await ctx.db.query('resiliencePolicies').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).unique() ?? { maxRecords:100,maxMediaBytes:8*1024*1024,maxMissions:100,maxManualSaves:100 } }
export function evidenceUrl(value:string) { const s=text(value,'Evidence URL',1000); let u:URL;try{u=new URL(s)}catch{throw new ConvexError('Evidence requires an HTTPS URL')}if(u.protocol!=='https:'||u.username||u.password)throw new ConvexError('Evidence requires credential-free HTTPS');return u.href }
export function summarize(trials:{baseline:number,candidate:number,domain:string}[], direction:'higher'|'lower', target:number, minimumSamples:number, domains:string[], heldOutDomains:string[]) {
 const improvements=trials.map(t=>(direction==='higher'?1:-1)*(t.candidate-t.baseline));const n=trials.length;const mean=n?improvements.reduce((a,b)=>a+b,0)/n:null;const variance=n>1?improvements.reduce((a,b)=>a+(b-mean!)**2,0)/(n-1):null;
 const domainResults=domains.map(domain=>{const rows=trials.filter(t=>t.domain===domain);return{domain,n:rows.length,heldOut:heldOutDomains.includes(domain),meanImprovement:rows.length?rows.reduce((s,t)=>s+(direction==='higher'?1:-1)*(t.candidate-t.baseline),0)/rows.length:null}});
 const ready=n>=minimumSamples&&domainResults.every(d=>d.n>0);
 const improved=improvements.filter(value=>value>0).length,regressed=improvements.filter(value=>value<0).length,unchanged=n-improved-regressed;
 const heldOut=domainResults.filter(domain=>domain.heldOut);
 const heldOutReady=heldOut.length>0&&ready;
 const heldOutTargetMet=heldOutReady?heldOut.every(domain=>domain.meanImprovement!==null&&domain.meanImprovement>=target):null;
 return{n,improved,regressed,unchanged,heldOutReady,heldOutTargetMet,heldOutStatus:!heldOut.length?'not-applicable':!heldOutReady?'insufficient':heldOutTargetMet?'domain-means-meet-target':'domain-target-missed',meanImprovement:mean,standardError:variance===null?null:Math.sqrt(variance/n),targetMet:ready&&mean!==null&&mean>=target,ready,domainResults,provenance:'Operator-supplied evidence; not independently verified',claim:'Bounded measured comparison only; no general superiority, novelty, AGI or superintelligence certification'};
}
