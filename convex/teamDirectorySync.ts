import {v,ConvexError} from 'convex/values'
import {mutation,query} from './_generated/server'
import type {MutationCtx,QueryCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {admin,email,directoryIdentity,provisionDirectory,revokeDirectoryGrant} from './teamProvisioning'
import {audit} from './frontierSupport'

const entry=v.object({email:v.string(),role:v.union(v.literal('viewer'),v.literal('contributor'))})
const args={teamId:v.id('forgeTeams'),entries:v.array(entry),revokeMissing:v.boolean()}
type Input={teamId:Id<'forgeTeams'>;entries:{email:string;role:'viewer'|'contributor'}[];revokeMissing:boolean}
async function review(ctx:QueryCtx|MutationCtx,a:Input){
 const {operatorId,team}=await admin(ctx,a.teamId)
 if(a.entries.length>20||(!a.entries.length&&!a.revokeMissing))throw new ConvexError('Provide up to 20 entries; an empty roster requires explicit removal of missing grants')
 const entries=a.entries.map(e=>({...e,email:email(e.email)})).sort((a,b)=>a.email.localeCompare(b.email))
 if(new Set(entries.map(e=>e.email)).size!==entries.length)throw new ConvexError('Duplicate email')
 const grants=await ctx.db.query('teamDirectory').withIndex('by_team',q=>q.eq('teamId',a.teamId)).take(20)
 const memberships=await ctx.db.query('forgeMemberships').withIndex('by_team',q=>q.eq('teamId',a.teamId)).take(20)
 if(grants.length+entries.filter(e=>!grants.some(g=>g.email===e.email)).length>20)throw new ConvexError('Directory quota reached; historical grants are retained')
 const users=await Promise.all(entries.map(async e=>{
  const u=await directoryIdentity(ctx,e.email)
  // Membership quotas may change outside this team; bind those states to the review too.
  const memberships=u?await ctx.db.query('forgeMemberships').withIndex('by_operator',q=>q.eq('operatorId',u._id)).take(20):[]
  return{email:e.email,userId:u?._id??null,verifiedAt:u?.emailVerificationTime??null,memberships}
 }))
 const rows=entries.map(e=>{
  const g=grants.find(g=>g.email===e.email),u=users.find(u=>u.email===e.email),m=memberships.find(m=>m.operatorId===u?.userId)
  const protectedOwner=g?.operatorId===team.ownerKey||u?.userId===team.ownerKey
  return{email:e.email,role:e.role,operation:protectedOwner?'protected-owner':g?.operatorId===operatorId||u?.userId===operatorId?'protected-current-admin':!g?'add':g.status==='revoked'?'reinstate':g.role!==e.role?'change-role':u?.userId&&(g.operatorId!==u.userId||m?.status!=='active'||m.role!==e.role)?'reconcile-membership':'unchanged',identity:u?.userId?'verified-operator':'awaiting-verified-sign-in'}
 })
 const missing=grants.filter(g=>g.status==='active'&&!entries.some(e=>e.email===g.email)).map(g=>({email:g.email,role:g.role,operation:g.operatorId===team.ownerKey?'protected-owner':g.operatorId===operatorId?'protected-current-admin':a.revokeMissing?'revoke':'retain',identity:g.operatorId?'linked-operator':'awaiting-verified-sign-in'}))
 // This is a read-only fingerprint, not a stored authorization or a capability.
 const snapshot=JSON.stringify({version:1,operatorId,team,entries,revokeMissing:a.revokeMissing,grants:[...grants].sort((a,b)=>a._id.localeCompare(b._id)),memberships:[...memberships].sort((a,b)=>a._id.localeCompare(b._id)),users})
 const revision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot))),n=>n.toString(16).padStart(2,'0')).join('')
 return{revision,rows:[...rows,...missing],entries,grants,operatorId}
}
export const preview=query({args,handler:async(ctx,a)=>{const r=await review(ctx,a);return{revision:r.revision,rows:r.rows}}})
export const apply=mutation({args:{...args,revision:v.string()},handler:async(ctx,a)=>{
 const r=await review(ctx,a)
 if(a.revision!==r.revision)throw new ConvexError('Directory or membership changed. Review the roster again before applying.')
 const changed=r.entries.filter(e=>{const op=r.rows.find(row=>row.email===e.email)?.operation;return op!=='protected-owner'&&op!=='protected-current-admin'&&op!=='unchanged'})
 const results=changed.length?await provisionDirectory(ctx,{teamId:a.teamId,entries:changed}):[]
 let revoked=0
 // Process the actor last so their reviewed deprovisioning cannot interrupt earlier changes.
 const removals=r.grants.filter(g=>r.rows.find(row=>row.email===g.email)?.operation==='revoke').sort((a,b)=>Number(a.operatorId===r.operatorId)-Number(b.operatorId===r.operatorId))
 for(const g of removals){await revokeDirectoryGrant(ctx,{grantId:g._id});revoked++}
 if(changed.length||revoked)await audit(ctx,r.operatorId,'teams','directory-roster-reconciled',JSON.stringify({teamId:a.teamId,revision:r.revision,applied:results.length,revoked}))
 return{applied:results.length,revoked,unchanged:r.rows.filter(row=>['unchanged','retain','protected-owner','protected-current-admin'].includes(row.operation)).length}
}})
