import {v,ConvexError} from 'convex/values'
import {internalMutation,query} from './_generated/server'
import type {MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {audit,policy} from './frontierSupport'
import {inspectRuntimeCapacity,inspectRuntimeHistory,runtimeOwnerQuery,isRetiredRuntimeKind} from './runtimeCapacity'
import {paginationOptsValidator} from 'convex/server'
const admissionArgs={ownerKey:v.string(),requestKey:v.string(),kind:v.string(),input:v.string()}
export async function admitReceipt(ctx:MutationCtx,a:{ownerKey:string;requestKey:string;kind:string;input:string}){
 if(isRetiredRuntimeKind(a.kind))throw new ConvexError('Multimodal Studio has been removed; retired runtime admission is disabled')
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(a.requestKey)||a.input.length>20000)throw new ConvexError('Invalid request key or input size')
 const old=await ctx.db.query('runtimeJobs').withIndex('by_owner_key',q=>q.eq('ownerKey',a.ownerKey).eq('requestKey',a.requestKey)).unique()
 if(old){
  if(old.kind!==a.kind||old.input!==a.input)throw new ConvexError('Request key conflicts with immutable input')
  if(old.status!=='complete')throw new ConvexError('Request already attempted; review its receipt before using a new key')
  return {jobId:old._id,cached:old.result!}
 }
 const p=await policy(ctx,a.ownerKey)
 const capacity=await inspectRuntimeCapacity(ctx,a.ownerKey,p.maxRecords)
 if(capacity.count>=p.maxRecords)throw new ConvexError('Runtime receipt quota reached')
 if(!capacity.complete)throw new ConvexError('Runtime capacity could not be established within the safety read limit; review retained receipts before another request')
 const jobId=await ctx.db.insert('runtimeJobs',{...a,status:'pending',createdAt:Date.now()})
 await audit(ctx,a.ownerKey,a.kind,'request-admitted',String(jobId))
 return {jobId,cached:null}
}
export const admit=internalMutation({args:admissionArgs,handler:admitReceipt})
const settlementArgs={jobId:v.id('runtimeJobs'),status:v.union(v.literal('complete'),v.literal('failed')),result:v.string()}
export async function finishReceipt(ctx:MutationCtx,a:{jobId:Id<'runtimeJobs'>;status:'complete'|'failed';result:string}){
 const job=await ctx.db.get(a.jobId)
 if(!job||job.status!=='pending'||a.result.length>60000)throw new ConvexError('Invalid runtime settlement')
 await ctx.db.patch(a.jobId,{status:a.status,result:a.result})
 await audit(ctx,job.ownerKey,job.kind,'request-'+a.status,String(a.jobId))
}
export const finish=internalMutation({args:settlementArgs,handler:finishReceipt})
export const activeList=query({args:{},handler:async ctx=>{
 const ownerKey=await requireOperator(ctx)
 const history=await inspectRuntimeHistory(ctx,ownerKey)
 if(history.readLimited)throw new ConvexError(history.scope)
 return history.rows
}})
export const activeSummary=query({args:{},handler:async ctx=>{
 return inspectRuntimeHistory(ctx,await requireOperator(ctx))
}})
export const historyPage=query({args:{paginationOpts:paginationOptsValidator},handler:async(ctx,{paginationOpts})=>{
 const ownerKey=await requireOperator(ctx)
 if(!Number.isInteger(paginationOpts.numItems)||paginationOpts.numItems<1||paginationOpts.numItems>20)throw new ConvexError('History page size must be 1–20')
 return runtimeOwnerQuery(ctx,ownerKey).order('desc').paginate({...paginationOpts,maximumRowsRead:40,maximumBytesRead:1024*1024})
}})
// Legacy owner-only history remains available for retained records.
export const list=query({args:{},handler:async ctx=>{
 const ownerKey=await requireOperator(ctx)
 return ctx.db.query('runtimeJobs').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).order('desc').take(50)
}})
