import {ConvexError} from 'convex/values'
import type {QueryCtx} from './_generated/server'
import type {Doc} from './_generated/dataModel'
import {capacityBudget,inspectCapacity} from './capacityInspection'
export const MEMORY_CONTEXT_LIMIT_MESSAGE='Memory context could not be established within the safety read limit. Review retained memory history before planning; risk evidence has not been cleared.'
// Preserve the existing newest-eligible window while charging excluded rows
// against the raw read budget. Unknown risk context must never become "no risk".
export async function readMemoryContext(ctx:QueryCtx,ownerKey:string,limit:60|80){
 const rows:Doc<'memories'>[]=[]
 const inspection=await inspectCapacity(
  ctx.db.query('memories').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).order('desc'),
  limit-1,capacityBudget(),row=>{
   if(row.category==='retrieval-evaluation'||row.category==='strategy-reuse-comparison')return false
   rows.push(row);return true
  })
 if(inspection.readLimited)throw new ConvexError(MEMORY_CONTEXT_LIMIT_MESSAGE)
 return rows
}
