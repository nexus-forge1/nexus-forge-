import { v, ConvexError } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOwnedMission } from './permissions'
import { claimFinding, researchClaimFields } from './researchClaimModel'
const row=v.object({_id:v.id('researchClaims'),_creationTime:v.number(),...researchClaimFields})
function text(value:string,min:number,max:number,label:string) {
 const result=value.trim()
 if(result.length<min||result.length>max)throw new ConvexError(label+' must contain '+min+'–'+max+' characters')
 return result
}
export const list=query({
 args:{missionId:v.id('missions')},returns:v.array(row),
 handler:async(ctx,args)=>{await requireOwnedMission(ctx,args.missionId);return ctx.db.query('researchClaims').withIndex('by_mission',q=>q.eq('missionId',args.missionId)).order('desc').take(100)},
})
export const record=mutation({
 args:{missionId:v.id('missions'),researchId:v.id('research'),claim:v.string(),finding:claimFinding,citation:v.string(),excerpt:v.string(),rationale:v.string(),sourceCaptureId:v.optional(v.id('researchSourceCaptures'))},
 returns:v.id('researchClaims'),
 handler:async(ctx,args)=>{
  const mission=await requireOwnedMission(ctx,args.missionId)
  const research=await ctx.db.get(args.researchId)
  if(!research||research.missionId!==args.missionId)throw new ConvexError('Research must belong to the selected mission')
  const claim=text(args.claim,8,1500,'Claim'),excerpt=text(args.excerpt,8,2000,'Research excerpt'),rationale=text(args.rationale,8,2000,'Review rationale')
  const capture=args.sourceCaptureId?await ctx.db.get(args.sourceCaptureId):null
  if(args.sourceCaptureId&&(!capture||capture.ownerKey!==mission.ownerKey||capture.researchId!==args.researchId||capture.citation!==args.citation||capture.status!=='captured'||!capture.snapshot))throw new ConvexError('Select a captured source for this exact research and citation')
  const snapshot=capture?.snapshot
  if(!(snapshot?.extractedText??research.result).includes(excerpt))throw new ConvexError(snapshot?'Excerpt must match the retrieved source text exactly':'Excerpt must match the saved research text exactly')
  if(!research.citations.includes(args.citation))throw new ConvexError('Select an exact citation from this saved research')
  try {const url=new URL(args.citation);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error()}catch{throw new ConvexError('Select a usable web citation')}
  const existing=await ctx.db.query('researchClaims').withIndex('by_mission',q=>q.eq('missionId',args.missionId)).take(100)
  const duplicate=existing.find(r=>r.researchId===args.researchId&&r.claim===claim&&r.finding===args.finding&&r.citation===args.citation&&r.excerpt===excerpt&&r.rationale===rationale&&r.sourceCaptureId===args.sourceCaptureId)
  if(duplicate)return duplicate._id
  if(existing.length>=100)throw new ConvexError('This mission has reached its 100 evidence-review limit')
  return ctx.db.insert('researchClaims',{...args,claim,excerpt,rationale,excerptBasis:snapshot?'retrieved_source':'saved_research',...(snapshot?{sourceTextSha256:snapshot.textSha256,sourceFinalUrl:snapshot.finalUrl,sourceCapturedAt:snapshot.capturedAt}:{}),ownerKey:mission.ownerKey,researchQuery:research.query,researchSavedAt:research.createdAt,createdAt:Date.now()})
 },
})
