import{internalMutation}from'./_generated/server'
import type{MutationCtx}from'./_generated/server'
import type{Doc,Id}from'./_generated/dataModel'
import{v}from'convex/values'
import{internal}from'./_generated/api'
import{boundedHistory,historyBudget}from'./portfolioHistory'
type CleanupProgress={releasedInBatch:number;pending:boolean;totalReleased:number;generation:number}
export async function cleanupBatch(ctx:MutationCtx,jobId:Id<'resourceReleaseJobs'>,generation:number):Promise<CleanupProgress>{
 const job=await ctx.db.get(jobId)
 if(!job||job.generation!==generation||job.status!=='pending')return{releasedInBatch:0,pending:job?.status==='pending',totalReleased:job?.released??0,generation:job?.generation??generation}
 const mission=await ctx.db.get(job.missionId)
 if(!mission||mission.ownerKey!==job.ownerKey){await ctx.db.patch(jobId,{status:'review',error:'Mission ownership changed; an owner must review and request cleanup again.',updatedAt:Date.now()});return{releasedInBatch:0,pending:false,totalReleased:job.released,generation}}
 const budget=historyBudget()
 const rows=await boundedHistory(ctx.db.query('missionResources').withIndex('by_mission_status',q=>q.eq('missionId',job.missionId).eq('status','held')),budget,20)
 if(!rows.length&&!budget.complete){await ctx.db.patch(jobId,{status:'review',error:'A retained reservation exceeds the bounded cleanup payload.',updatedAt:Date.now()});return{releasedInBatch:0,pending:false,totalReleased:job.released,generation}}
 const now=Date.now()
 for(const row of rows)await ctx.db.patch(row._id,{status:'released',releasedAt:now})
 const more=await ctx.db.query('missionResources').withIndex('by_mission_status',q=>q.eq('missionId',job.missionId).eq('status','held')).first()
 const totalReleased=job.released+rows.length
 await ctx.db.patch(jobId,{released:totalReleased,status:more?'pending':'complete',updatedAt:now,...(!more?{finishedAt:now}:{})})
 if(more)await ctx.scheduler.runAfter(0,internal.resourceCleanup.continueRelease,{jobId,generation})
 else await ctx.runMutation(internal.audit.record,{missionId:job.missionId,type:'orchestration',action:'resource_release_completed',status:'complete',detail:'Cleanup generation '+generation+' released '+totalReleased+' held reservation(s); retained history was preserved.'})
 return{releasedInBatch:rows.length,pending:Boolean(more),totalReleased,generation}
}
export async function startResourceRelease(ctx:MutationCtx,mission:Doc<'missions'>):Promise<CleanupProgress>{
 const prior=await ctx.db.query('resourceReleaseJobs').withIndex('by_mission',q=>q.eq('missionId',mission._id)).unique()
 if(prior?.status==='pending')return{releasedInBatch:0,pending:true,totalReleased:prior.released,generation:prior.generation}
 const held=await ctx.db.query('missionResources').withIndex('by_mission_status',q=>q.eq('missionId',mission._id).eq('status','held')).first()
 if(!held&&prior?.status!=='review')return{releasedInBatch:0,pending:false,totalReleased:prior?.released??0,generation:prior?.generation??0}
 const generation=(prior?.generation??0)+1,now=Date.now()
 const data={missionId:mission._id,ownerKey:mission.ownerKey,generation,status:'pending' as const,released:0,startedAt:now,updatedAt:now}
 const jobId=prior?prior._id:await ctx.db.insert('resourceReleaseJobs',data)
 if(prior)await ctx.db.patch(prior._id,{...data,finishedAt:undefined,error:undefined})
 await ctx.runMutation(internal.audit.record,{missionId:mission._id,type:'orchestration',action:'resource_release_started',status:'pending',detail:'Cleanup generation '+generation+' started; acquisition stays blocked until cleanup completes.'})
 return cleanupBatch(ctx,jobId,generation)
}
export const continueRelease=internalMutation({args:{jobId:v.id('resourceReleaseJobs'),generation:v.number()},handler:(ctx,args)=>cleanupBatch(ctx,args.jobId,args.generation)})
