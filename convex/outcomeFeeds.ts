import {v,ConvexError} from 'convex/values'
import {mutation,query,internalQuery,internalMutation} from './_generated/server'
import type {MutationCtx,QueryCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {internal} from './_generated/api'
import {requireOperator,requireOwnedMission} from './permissions'
import {productOutcomeInput,productImportReceipt} from './productOutcomeModel'
import {storeImportedProductOutcome} from './verification'
import {audit} from './frontierSupport'
export const MAX_FEED_CHECKS=168
const pollArgs={feedId:v.id('outcomeFeeds'),generation:v.number(),sequence:v.optional(v.number())}
type Poll={feedId:Id<'outcomeFeeds'>;generation:number;sequence?:number}
async function authorizedFeed(ctx:QueryCtx|MutationCtx,a:Poll){
 const f=await ctx.db.get(a.feedId),m=f?await ctx.db.get(f.missionId):null,sequence=a.sequence??0
 return Number.isInteger(sequence)&&sequence>=0&&sequence<MAX_FEED_CHECKS&&f?.enabled&&f.generation===a.generation&&(f.pollSequence??0)===sequence&&m?.ownerKey===f.ownerKey?f:null
}
export const authorized=internalQuery({args:pollArgs,handler:authorizedFeed})
export const claimPoll=internalMutation({args:pollArgs,handler:async(ctx,a)=>{
 const f=await authorizedFeed(ctx,a);if(!f||f.claimedSequence===(a.sequence??0))return null
 await ctx.db.patch(f._id,{claimedSequence:a.sequence??0})
 return f
}})
export const list=query({args:{},handler:async ctx=>{const ownerKey=await requireOperator(ctx);return ctx.db.query('outcomeFeeds').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(20)}})
export const create=mutation({args:{missionId:v.id('missions'),reportId:v.string()},handler:async(ctx,a)=>{
 const m=await requireOwnedMission(ctx,a.missionId)
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(a.reportId))throw new ConvexError('Invalid report ID')
 const rows=await ctx.db.query('outcomeFeeds').withIndex('by_owner',q=>q.eq('ownerKey',m.ownerKey)).take(20)
 if(rows.some(r=>r.missionId===a.missionId&&r.reportId===a.reportId))throw new ConvexError('Feed already exists; enable the saved feed')
 if(rows.length>=20)throw new ConvexError('Feed quota reached')
 const feedId=await ctx.db.insert('outcomeFeeds',{...a,ownerKey:m.ownerKey,enabled:true,generation:1,pollSequence:0,updatedAt:Date.now()})
 await ctx.scheduler.runAfter(0,internal.productEvidenceImport.pollFeed,{feedId,generation:1,sequence:0})
 await audit(ctx,m.ownerKey,'outcomes','hourly-feed-enabled',String(feedId))
 return feedId
}})
export const setEnabled=mutation({args:{feedId:v.id('outcomeFeeds'),enabled:v.boolean()},handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),f=await ctx.db.get(a.feedId)
 if(!f||f.ownerKey!==ownerKey)throw new ConvexError('Feed access denied')
 if(f.enabled===a.enabled)return
 if(a.enabled)await requireOwnedMission(ctx,f.missionId)
 const generation=f.generation+1
 await ctx.db.patch(f._id,{enabled:a.enabled,generation,pollSequence:0,claimedSequence:undefined,updatedAt:Date.now(),...(a.enabled?{lastError:''}:{})})
 if(a.enabled)await ctx.scheduler.runAfter(0,internal.productEvidenceImport.pollFeed,{feedId:f._id,generation,sequence:0})
 await audit(ctx,ownerKey,'outcomes',a.enabled?'feed-enabled':'feed-disabled',String(f._id))
}})
export const ingest=internalMutation({args:{...pollArgs,...productOutcomeInput,receipt:productImportReceipt},handler:async(ctx,a)=>{
 const f=await authorizedFeed(ctx,a)
 if(!f||f.claimedSequence!==(a.sequence??0)||f.missionId!==a.missionId||a.receipt.repository!=='nexus-forge1/nexus-forge-'||a.receipt.path!=='nexus-forge-outcomes/'+f.missionId+'/'+f.reportId+'.json')throw new ConvexError('Feed authorization changed')
 const {feedId:_f,generation:_g,sequence:_s,...input}=a
 const same=await ctx.db.query('productOutcomes').withIndex('by_owner_report',q=>q.eq('ownerKey',f.ownerKey).eq('missionId',f.missionId).eq('importReceipt.path',a.receipt.path).eq('importReceipt.reportSha256',a.receipt.reportSha256)).first()
 if(same)return same._id
 return storeImportedProductOutcome(ctx,input,f.ownerKey)
}})
export const reschedule=internalMutation({args:{...pollArgs,lastCommit:v.optional(v.string()),error:v.string()},handler:async(ctx,a)=>{
 const f=await authorizedFeed(ctx,a),sequence=a.sequence??0
 if(!f||f.claimedSequence!==sequence)return
 const next=sequence+1,paused=next>=MAX_FEED_CHECKS
 await ctx.db.patch(f._id,{...(a.lastCommit?{lastCommit:a.lastCommit}:{}),lastError:paused?'Collection period complete after 168 checks. Review retained evidence before enabling another period.':a.error.slice(0,1000),pollSequence:next,claimedSequence:undefined,enabled:!paused,updatedAt:Date.now()})
 if(paused){await audit(ctx,f.ownerKey,'outcomes','feed-period-complete',String(f._id));return}
 await ctx.scheduler.runAfter(3600000,internal.productEvidenceImport.pollFeed,{feedId:f._id,generation:f.generation,sequence:next})
}})
