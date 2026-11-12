import type {Doc,Id} from './_generated/dataModel'
import type {QueryCtx} from './_generated/server'
import {digest} from './studioModel'
import {quarantineFlags} from './memoryGovernanceModel'
export function memoryFingerprint(row:Doc<'memories'>){return digest(JSON.stringify([row._id,row.ownerKey,row.missionId??null,row.category,row.key,row.value,row.confidence,row.source]))}
export async function latestMemoryReview(ctx:QueryCtx,memoryId:Id<'memories'>){return ctx.db.query('memoryGovernanceReviews').withIndex('by_memory',q=>q.eq('memoryId',memoryId)).order('desc').first()}
export async function memoryEligibility(ctx:QueryCtx,row:Doc<'memories'>,missionId?:Id<'missions'>,now=Date.now()){
 const review=await latestMemoryReview(ctx,row._id),flags=quarantineFlags([row.key,row.value,row.source].join('\n'))
 const result=(eligible:boolean,reason:string)=>({eligible,reason,review,flags})
 if(flags.length)return result(false,'Quarantined: '+flags.join(', '))
 if(!review){
  if(['council-learning','governed-memory-candidate'].includes(row.source))return result(false,'Untrusted candidate awaits lifecycle review')
  if(row.missionId&&row.missionId!==missionId)return result(false,'Legacy mission memory is restricted to its origin mission')
  return result(true,row.missionId?'Legacy origin-mission advisory; not lifecycle validated':'Legacy operator-wide advisory; no lifecycle review')
 }
 if(review.ownerKey!==row.ownerKey)return result(false,'Memory owner differs from its retained review')
 if(review.status==='purged')return result(false,'Purged by explicit operator request; content payload scrubbed and audit retained')
 if(review.sourceDigest!==await memoryFingerprint(row))return result(false,'Source changed after review; re-review required')
 if(review.status!=='active')return result(false,review.status==='retired'||review.status==='archived'?'Archived; history retained':'Quarantined pending review')
 if(review.contradicts.length)return result(false,'Unresolved contradiction requires review')
 if(review.reviewAt<=now||review.expiresAt<=now)return result(false,'Review or expiry date reached')
 if(review.scope==='operator')return result(true,'Reviewed operator scope; advisory only')
 if(!missionId)return result(false,'Select a mission to assess scoped applicability')
 if(review.scope==='mission')return result(row.missionId===missionId,'Reviewed origin-mission scope')
 const project=review.projectId?await ctx.db.get(review.projectId):null
 return result(!!project&&project.ownerKey===row.ownerKey&&project.missionId===missionId&&row.missionId===missionId,'Reviewed project scope; must match current project mission')
}
export async function filterGovernedMemory(ctx:QueryCtx,rows:Doc<'memories'>[],missionId?:Id<'missions'>){
 const decisions=await Promise.all(rows.map(async row=>({row,decision:await memoryEligibility(ctx,row,missionId)})))
 return decisions.filter(item=>item.decision.eligible).map(item=>item.row)
}
