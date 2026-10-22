import {v,ConvexError} from 'convex/values'
import {mutation,query} from './_generated/server'
import type {MutationCtx,QueryCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {requireOperator,requireOwnedMission} from './permissions'
import {bounded,digest,secrets} from './studioModel'
import {notice} from './studio'
const summary=v.object({_id:v.id('studioPortals'),name:v.string(),recipientId:v.id('users'),expiresAt:v.number(),revoked:v.boolean(),createdAt:v.number(),mine:v.boolean()})
async function access(ctx:QueryCtx|MutationCtx,id:Id<'studioPortals'>){const user=await requireOperator(ctx),p=await ctx.db.get(id);if(!p||(p.ownerKey!==user&&p.recipientId!==user))throw new ConvexError('Delivery unavailable');if(p.revoked||p.expiresAt<=Date.now())throw new ConvexError('Delivery access expired or revoked');return{p,user}}
export const create=mutation({args:{artifactId:v.id('artifacts'),recipientEmail:v.string(),expiresInDays:v.number()},returns:v.id('studioPortals'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),artifact=await ctx.db.get(a.artifactId);if(!artifact)throw new ConvexError('Artifact unavailable');await requireOwnedMission(ctx,artifact.missionId)
 if(artifact.status!=='ready')throw new ConvexError('Approve and verify the artifact before granting client access')
 const email=bounded(a.recipientEmail,'Recipient email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ConvexError('Valid recipient email required')
 const matches=await ctx.db.query('users').withIndex('email',q=>q.eq('email',email)).take(2)
 if(matches.length!==1||!matches[0].emailVerificationTime||matches[0]._id===ownerKey)throw new ConvexError('Recipient must have one verified account distinct from the owner')
 if(!Number.isInteger(a.expiresInDays)||a.expiresInDays<1||a.expiresInDays>30)throw new ConvexError('Access duration must be 1–30 days')
 bounded(artifact.content,'Deliverable',200000);secrets(artifact.content)
 const sha256=await digest(artifact.content),rows=await ctx.db.query('studioPortals').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(50)
 const same=rows.find(r=>r.artifactId===a.artifactId&&r.recipientId===matches[0]._id&&!r.revoked&&r.expiresAt>Date.now()&&r.sha256===sha256);if(same)return same._id
 if(rows.length>=50)throw new ConvexError('50-delivery history limit reached')
 const id=await ctx.db.insert('studioPortals',{ownerKey,recipientId:matches[0]._id,artifactId:artifact._id,name:artifact.name,content:artifact.content,sha256,expiresAt:Date.now()+a.expiresInDays*86400000,revoked:false,createdAt:Date.now()})
 await notice(ctx,ownerKey,'Client access granted',artifact.name,'/client-delivery')
 await notice(ctx,String(matches[0]._id),'Deliverable ready for review',artifact.name,'/client-delivery');return id
}})
export const list=query({args:{},returns:v.array(summary),handler:async ctx=>{const user=await requireOperator(ctx),owned=await ctx.db.query('studioPortals').withIndex('by_owner',q=>q.eq('ownerKey',user)).order('desc').take(50),received=await ctx.db.query('studioPortals').withIndex('by_recipient',q=>q.eq('recipientId',user)).order('desc').take(50);return[...owned,...received].map(p=>({_id:p._id,name:p.name,recipientId:p.recipientId,expiresAt:p.expiresAt,revoked:p.revoked,createdAt:p.createdAt,mine:p.ownerKey===user}))}})
export const detail=query({args:{portalId:v.id('studioPortals')},returns:v.object({name:v.string(),content:v.string(),sha256:v.string(),expiresAt:v.number(),mine:v.boolean(),feedback:v.array(v.object({decision:v.union(v.literal('accept'),v.literal('revision')),message:v.string(),createdAt:v.number()}))}),handler:async(ctx,a)=>{const {p,user}=await access(ctx,a.portalId);return{name:p.name,content:p.content,sha256:p.sha256,expiresAt:p.expiresAt,mine:p.ownerKey===user,feedback:(await ctx.db.query('studioFeedback').withIndex('by_portal',q=>q.eq('portalId',p._id)).order('desc').take(30)).map(({decision,message,createdAt})=>({decision,message,createdAt}))}}})
export const revoke=mutation({args:{portalId:v.id('studioPortals')},returns:v.null(),handler:async(ctx,a)=>{const user=await requireOperator(ctx),p=await ctx.db.get(a.portalId);if(!p||p.ownerKey!==user)throw new ConvexError('Delivery unavailable');if(!p.revoked){await ctx.db.patch(p._id,{revoked:true});await notice(ctx,user,'Client access revoked',p.name,'/client-delivery')}return null}})
export const feedback=mutation({args:{portalId:v.id('studioPortals'),decision:v.union(v.literal('accept'),v.literal('revision')),message:v.string()},returns:v.id('studioFeedback'),handler:async(ctx,a)=>{
 const {p,user}=await access(ctx,a.portalId);if(p.recipientId!==user)throw new ConvexError('Only the named recipient can record client acceptance')
 const message=bounded(a.message,'Feedback',2000),rows=await ctx.db.query('studioFeedback').withIndex('by_portal',q=>q.eq('portalId',p._id)).take(30),same=rows.find(r=>r.decision===a.decision&&r.message===message);if(same)return same._id
 if(rows.length>=30)throw new ConvexError('30-feedback delivery limit reached')
 const id=await ctx.db.insert('studioFeedback',{portalId:p._id,authorId:user,decision:a.decision,message,createdAt:Date.now()})
 await notice(ctx,p.ownerKey,a.decision==='accept'?'Client accepted deliverable':'Client requested revision',p.name,'/client-delivery');return id
}})
