import type {QueryCtx,MutationCtx} from './_generated/server'
import type {Doc} from './_generated/dataModel'
import {capacityBudget,inspectCapacity} from './capacityInspection'
export const retiredRuntimeKinds=['multimodal','gemini-media','media-chain'] as const
export function isRetiredRuntimeKind(kind:string){return retiredRuntimeKinds.some(retired=>retired===kind)}
export function runtimeOwnerQuery(ctx:QueryCtx|MutationCtx,ownerKey:string){
 return ctx.db.query('runtimeJobs').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey))
}
export async function inspectRuntimeCapacity(ctx:QueryCtx|MutationCtx,ownerKey:string,limit:number){
 return inspectCapacity(runtimeOwnerQuery(ctx,ownerKey),limit,capacityBudget(),row=>!isRetiredRuntimeKind(row.kind))
}
export async function inspectRuntimeHistory(ctx:QueryCtx,ownerKey:string){
 const rows:Doc<'runtimeJobs'>[]=[]
 const inspection=await inspectCapacity(runtimeOwnerQuery(ctx,ownerKey).order('desc'),50,capacityBudget(),row=>{
  if(isRetiredRuntimeKind(row.kind))return false
  if(rows.length<50)rows.push(row)
  return true
 })
 return{rows,readLimited:inspection.readLimited,complete:inspection.complete,
  scope:inspection.readLimited?'History inspection reached its safety limit. Use retained history pages to review older receipts.':inspection.complete?'All active receipts inspected.':'Newest 50 active receipts shown. Older receipts remain in retained history.'}
}
