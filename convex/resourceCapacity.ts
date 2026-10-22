import{query}from'./_generated/server'
import type{QueryCtx}from'./_generated/server'
import type{Doc}from'./_generated/dataModel'
import{v}from'convex/values'
import{collectionKind,collections,scopedLimits,capacityRow,type CollectionKind}from'./recordCapacityModel'
import{requireOperator}from'./permissions'
import{policy}from'./frontierSupport'
import{isRetiredRuntimeKind}from'./runtimeCapacity'
import{inspectCapacity,capacityBudget,type CapacityBudget}from'./capacityInspection'
async function readCollection(ctx:QueryCtx,ownerKey:string,p:Awaited<ReturnType<typeof policy>>,id:CollectionKind,budget:CapacityBudget){
 let rows:AsyncIterable<unknown>,limit=p.maxRecords,scope='',include:((row:unknown)=>boolean)|undefined
 switch(id){
 case'comparison':case'science':case'generality':rows=ctx.db.query('labProtocols').withIndex('by_owner_kind',q=>q.eq('ownerKey',ownerKey).eq('kind',id));scope='Open and closed protocols both count.';break
 case'packages':rows=ctx.db.query('extensionPackages').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Every version counts, including retired versions.';break
 case'adapters':rows=ctx.db.query('externalAdapters').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Enabled and disabled adapters count.';break
 case'runtime':rows=ctx.db.query('runtimeJobs').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));include=row=>!isRetiredRuntimeKind((row as Doc<'runtimeJobs'>).kind);scope='Pending, complete and failed active receipts count. Retired media history is excluded from the count and included in the scan budget.';break
 case'benchmarks':rows=ctx.db.query('benchmarkRuns').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Every reproducible evaluation report counts.';break
 case'feeds':limit=20;rows=ctx.db.query('outcomeFeeds').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Enabled and disabled feeds count.';break
 case'sources':limit=20;rows=ctx.db.query('productSources').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Enabled and disabled event sources count.';break
 case'reconciliations':limit=100;rows=ctx.db.query('providerReconciliations').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Every immutable comparison counts. Invoice authenticity remains separate.';break
 case'missions':limit=p.maxMissions??100;rows=ctx.db.query('missions').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='All saved missions count, including complete and cancelled missions. Existing evidence is retained.';break
 case'manual-memory':limit=p.maxManualSaves??100;rows=ctx.db.query('manualMemoryAdmissions').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Counts new manual saves under these limits. Older notes and automatically generated evidence are retained and excluded.';break
 case'learning-reviews':limit=20;rows=ctx.db.query('learningReviews').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey));scope='Every retained review counts. Selected evidence snapshots are limited to 300,000 UTF-8 bytes.';break
 }
 const result=await inspectCapacity(rows,limit,budget,include)
 const unknown=result.readLimited&&result.count<limit
 if(unknown)scope+=' The bounded inspection stopped before capacity was established. This is a read guard, not proof that the record quota is full.'
 return{id,label:collections.find(c=>c.id===id)!.label,...result,limit,remaining:result.complete?Math.max(0,limit-result.count):0,blocked:!result.complete||result.count>=limit,scope}
}
export const catalog=query({args:{},returns:v.object({collections:v.array(v.object({id:collectionKind,label:v.string()})),scopedLimits:v.array(v.object({id:v.string(),label:v.string(),parent:v.string(),limit:v.number(),note:v.string()})),scope:v.string()}),handler:async ctx=>{
 await requireOperator(ctx)
 return{collections:[...collections],scopedLimits:[...scopedLimits],scope:'Private admission counts. Each collection loads separately under bounded record and payload inspection. Related-record limits below apply to their named parent, not to your whole account. Unestablished capacity requires review. This is not storage, traffic, provider quota or billing evidence.'}
}})
export const collection=query({args:{id:collectionKind},returns:capacityRow,handler:async(ctx,{id})=>{
 const ownerKey=await requireOperator(ctx)
 return readCollection(ctx,ownerKey,await policy(ctx,ownerKey),id,capacityBudget())
}})
// Retained published contract: same ten collections, now inspected sequentially
// under one shared budget. Unknown remaining capacity is never advertised as free slots.
export const overview=query({args:{},returns:v.object({rows:v.array(capacityRow),scope:v.string()}),handler:async ctx=>{
 const ownerKey=await requireOperator(ctx),p=await policy(ctx,ownerKey),budget=capacityBudget();const rows:Awaited<ReturnType<typeof readCollection>>[]=[]
 for(const id of['comparison','science','generality','packages','adapters','runtime','benchmarks','feeds','sources','reconciliations']as const)rows.push(await readCollection(ctx,ownerKey,p,id,budget))
 return{rows,scope:'Private record admission only. Combined counts share a bounded inspection budget; read-limited rows do not establish remaining capacity. Inspect collections independently in Record capacity. This is not provider quota, compute, traffic, storage capacity or billing evidence.'}
}})
