import {v,ConvexError} from 'convex/values'
import {action,mutation,query,internalQuery,internalMutation} from './_generated/server'
import {internal} from './_generated/api'
import type {QueryCtx,MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {admitReceipt,finishReceipt} from './runtimeReceipts'
import {requireOperator} from './permissions'
import {isSafeResearchUrl} from './research'
import {boundedText} from './boundedResponse'
import {audit,policy} from './frontierSupport'
export function exactObject(raw:string,fields:string[]){if(typeof raw!=='string'||raw.length>16000)throw Error('JSON must be a bounded string');const obj=JSON.parse(raw);if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==fields.length||fields.some(k=>!Object.hasOwn(obj,k))||Object.keys(obj).some(k=>['__proto__','prototype','constructor'].includes(k)))throw Error('JSON must match exactly the declared fields');return obj}
export const register=mutation({args:{packageId:v.id('extensionPackages'),endpoint:v.string()},handler:async(ctx,a)=>{const ownerKey=await requireOperator(ctx),p=await ctx.db.get(a.packageId);if(!p||p.ownerKey!==ownerKey||p.status!=='validated')throw new ConvexError('Validated owned package required');if(!isSafeResearchUrl(a.endpoint)||a.endpoint.length>1000||new URL(a.endpoint).search||new URL(a.endpoint).hash)throw new ConvexError('Public HTTPS endpoint without query or fragment required');const quota=await policy(ctx,ownerKey);if((await ctx.db.query('externalAdapters').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(quota.maxRecords)).length>=quota.maxRecords)throw new ConvexError('Adapter quota reached');const id=await ctx.db.insert('externalAdapters',{ownerKey,...a,enabled:true,createdAt:Date.now()});await audit(ctx,ownerKey,'developers','external-get-enabled',a.endpoint);return id}})
export const setEnabled=mutation({args:{adapterId:v.id('externalAdapters'),enabled:v.boolean()},handler:async(ctx,a)=>{const ownerKey=await requireOperator(ctx),r=await ctx.db.get(a.adapterId);if(!r||r.ownerKey!==ownerKey)throw new ConvexError('Adapter access denied');if(r.enabled===a.enabled)return;await ctx.db.patch(r._id,{enabled:a.enabled});await audit(ctx,ownerKey,'developers',a.enabled?'adapter-enabled':'adapter-revoked',String(r._id))}})
export const list=query({args:{},handler:async ctx=>{const ownerKey=await requireOperator(ctx);return ctx.db.query('externalAdapters').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)}})
async function authorizedAdapter(ctx:QueryCtx|MutationCtx,adapterId:Id<'externalAdapters'>){
 const ownerKey=await requireOperator(ctx),r=await ctx.db.get(adapterId),p=r?await ctx.db.get(r.packageId):null
 if(!r||r.ownerKey!==ownerKey||!r.enabled||!p||p.ownerKey!==ownerKey||p.status!=='validated')throw new ConvexError('External execution permission denied')
 return {...r,inputFields:p.inputFields,outputFields:p.outputFields}
}
export const authorized=internalQuery({args:{adapterId:v.id('externalAdapters')},handler:(ctx,a)=>authorizedAdapter(ctx,a.adapterId)})
export const admit=internalMutation({args:{adapterId:v.id('externalAdapters'),requestKey:v.string(),input:v.string()},handler:async(ctx,a)=>{
 const adapter=await authorizedAdapter(ctx,a.adapterId),input=exactObject(a.input,adapter.inputFields),url=new URL(adapter.endpoint)
 for(const [key,value]of Object.entries(input))url.searchParams.set(key,JSON.stringify(value))
 if(url.href.length>8000)throw new ConvexError('Encoded request exceeds limit')
 const admission=await admitReceipt(ctx,{ownerKey:adapter.ownerKey,requestKey:a.requestKey,kind:'external-agent',input:JSON.stringify({adapterId:a.adapterId,input:a.input})})
 return {...admission,adapter,url:url.href}
}})
export const complete=internalMutation({args:{adapterId:v.id('externalAdapters'),jobId:v.id('runtimeJobs'),result:v.string()},handler:async(ctx,a)=>{
 const adapter=await authorizedAdapter(ctx,a.adapterId),job=await ctx.db.get(a.jobId)
 if(!job||job.ownerKey!==adapter.ownerKey||job.kind!=='external-agent'||JSON.parse(job.input).adapterId!==a.adapterId)throw new ConvexError('Runtime receipt access denied')
 await finishReceipt(ctx,{jobId:a.jobId,status:'complete',result:a.result})
}})
export const run=action({args:{adapterId:v.id('externalAdapters'),requestKey:v.string(),input:v.string()},handler:async(ctx,a):Promise<string>=>{
 await ctx.runQuery(internal.externalRuntime.authorized,{adapterId:a.adapterId});
 const gateway=process.env.RESEARCH_EGRESS_GATEWAY_URL,token=process.env.RESEARCH_EGRESS_GATEWAY_TOKEN;if(!gateway||!token)throw new ConvexError('Hardened egress gateway is not configured');
 const admission=await ctx.runMutation(internal.externalRuntime.admit,a);if(admission.cached)return admission.cached;const r=admission.adapter,url=admission.url;
 try{const response=await fetch(gateway.replace(/\/$/,'')+'/fetch',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({url,maxBytes:20000}),redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Egress failed');const data=JSON.parse(await boundedText(response,100000));if(data.ok!==true||!Number.isInteger(data.status)||data.status<200||data.status>=300||data.truncated!==false||data.finalUrl!==url||!Array.isArray(data.hops)||data.hops.length!==1||data.hops[0]!==url||typeof data.contentType!=='string'||data.contentType.split(';',1)[0].trim().toLowerCase()!=='application/json'||typeof data.body!=='string'||new TextEncoder().encode(data.body).length>20000)throw Error('External response failed transport policy');const output=exactObject(data.body,r.outputFields);const result=JSON.stringify({adapterId:a.adapterId,endpoint:r.endpoint,output,trust:'Untrusted external JSON; never executed as code or instructions'});await ctx.runMutation(internal.externalRuntime.complete,{adapterId:a.adapterId,jobId:admission.jobId,result});return result}catch{try{await ctx.runMutation(internal.runtimeReceipts.finish,{jobId:admission.jobId,status:'failed',result:'External call failed, was revoked or violated its response contract; no automatic retry'})}catch{throw new ConvexError('External result confirmation is uncertain. Review the retained receipt; no automatic retry was made.')}throw new ConvexError('External call failed. Review receipt before retrying.')}
}})
