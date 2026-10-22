import {v,ConvexError} from 'convex/values'
import type {QueryCtx} from './_generated/server'
export const HISTORY_LIMITS={missions:100,records:500,bytes:4*1024*1024} as const
export const historyScope=v.object({complete:v.boolean(),recordsRead:v.number(),encodedBytes:v.number(),missionLimit:v.number(),recordLimit:v.number(),byteLimit:v.number(),note:v.string()})
export function historyBudget(){return{complete:true,exhausted:false,recordsRead:0,encodedBytes:0}}
export type HistoryBudget=ReturnType<typeof historyBudget>
export function includeHistoryRow(budget:HistoryBudget,row:unknown){
 if(budget.exhausted)return false
 const bytes=new TextEncoder().encode(JSON.stringify(row)).byteLength
 if(budget.recordsRead>=HISTORY_LIMITS.records||budget.encodedBytes+bytes>HISTORY_LIMITS.bytes){budget.complete=false;budget.exhausted=true;return false}
 budget.recordsRead++;budget.encodedBytes+=bytes;return true
}
export async function boundedHistory<T>(query:AsyncIterable<T>,budget:HistoryBudget,limit:number=HISTORY_LIMITS.records){
 const rows:T[]=[]
 if(budget.exhausted||budget.recordsRead>=HISTORY_LIMITS.records||budget.encodedBytes>=HISTORY_LIMITS.bytes){budget.complete=false;budget.exhausted=true;return rows}
 for await(const row of query){
  if(rows.length>=limit){budget.complete=false;break}
  if(!includeHistoryRow(budget,row))break
  rows.push(row)
 }
 return rows
}
export function historySummary(budget:HistoryBudget){
 return{complete:budget.complete,recordsRead:budget.recordsRead,encodedBytes:budget.encodedBytes,missionLimit:HISTORY_LIMITS.missions,recordLimit:HISTORY_LIMITS.records,byteLimit:HISTORY_LIMITS.bytes,note:budget.complete
  ?'Summary of retained history in the displayed scope. Runtime cost is recorded measurement evidence, not an invoice.'
  :'Partial history sample: a mission, record or encoded-payload limit was reached. Counts, rates and recorded runtime cost describe only this sample. Open an individual mission to inspect its evidence. No older evidence was deleted.'}
}
export async function portfolioMissions(ctx:QueryCtx,ownerKey:string,budget:HistoryBudget){
 return boundedHistory(ctx.db.query('missions').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).order('desc'),budget,HISTORY_LIMITS.missions)
}
export function requireCompleteHistory(budget:HistoryBudget){
 if(!budget.complete)throw new ConvexError('Portfolio history exceeds the safe summary limit. Select a mission to review its decision history. Existing evidence is retained.')
}
