import {v,ConvexError} from 'convex/values'
import type {Id} from './_generated/dataModel'
import {query,mutation} from './_generated/server'
import {requireOperator} from './permissions'
import {buildLearningReview,reviewKind} from './learningReviewModel'
export const sources=query({args:{},handler:async ctx=>{
 const ownerKey=await requireOperator(ctx)
 const groups=await Promise.all(['retrieval-evaluation','strategy-reuse-comparison'].map(category=>ctx.db.query('memories').withIndex('by_owner_category',q=>q.eq('ownerKey',ownerKey).eq('category',category)).order('desc').take(20)))
 return groups.flat().map(row=>({id:row._id,category:row.category,value:row.value,key:row.key}))
}})
export const list=query({args:{},handler:async ctx=>{
 const ownerKey=await requireOperator(ctx)
 const rows=await ctx.db.query('learningReviews').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).order('desc').take(20)
 return rows.map(({_id,kind,sourceIds,notes,summary,createdAt})=>({_id,kind,sourceIds,notes,summary,createdAt}))
}})
export const get=query({args:{id:v.id('learningReviews')},handler:async(ctx,args)=>{
 const ownerKey=await requireOperator(ctx),row=await ctx.db.get(args.id)
 if(!row||row.ownerKey!==ownerKey)throw new ConvexError('Learning review not found or access denied')
 return row
}})
export const create=mutation({args:{kind:reviewKind,sourceIds:v.array(v.id('memories')),notes:v.string(),comparabilityReviewed:v.boolean()},returns:v.id('learningReviews'),handler:async(ctx,args)=>{
 const ownerKey=await requireOperator(ctx),notes=args.notes.trim()
 if(!args.comparabilityReviewed||notes.length<12||notes.length>2000)throw new ConvexError('Review comparability and describe it in 12–2000 characters')
 if(args.sourceIds.length<2||args.sourceIds.length>20||new Set(args.sourceIds).size!==args.sourceIds.length)throw new ConvexError('Select 2–20 distinct saved receipts')
 const category=args.kind==='retrieval'?'retrieval-evaluation':'strategy-reuse-comparison'
 const snapshots:{id:Id<'memories'>;category:string;value:string}[]=[]
 for(const id of [...args.sourceIds].sort()){
  const row=await ctx.db.get(id)
  if(!row||row.ownerKey!==ownerKey||row.category!==category)throw new ConvexError('Select private receipts of the same evidence type')
  snapshots.push({id:row._id,category:row.category,value:row.value})
 }
 if(new TextEncoder().encode(JSON.stringify(snapshots)).length>300000)throw new ConvexError('Selected evidence exceeds the bounded review size; choose fewer receipts')
 let summary:string
 try{summary=JSON.stringify(buildLearningReview(args.kind,snapshots))}catch(error){throw new ConvexError(error instanceof Error?error.message:'Evidence could not be compared')}
 const existing=await ctx.db.query('learningReviews').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(20)
 const duplicate=existing.find(row=>row.kind===args.kind&&row.notes===notes&&JSON.stringify(row.snapshots.map(source=>[source.id,source.category,source.value]))===JSON.stringify(snapshots.map(source=>[source.id,source.category,source.value])))
 if(duplicate)return duplicate._id
 if(existing.length>=20)throw new ConvexError('Your workspace has reached its twenty retained learning-review limit')
 return ctx.db.insert('learningReviews',{ownerKey,kind:args.kind,sourceIds:snapshots.map(row=>row.id),snapshots,notes,summary,createdAt:Date.now()})
}})
