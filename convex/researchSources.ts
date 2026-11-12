import {v,ConvexError} from 'convex/values'
import {action,internalMutation,query} from './_generated/server'
import {internal} from './_generated/api'
import {requireOwnedMission,requireOperator} from './permissions'
import {fetchResearchPageViaGateway,isSafeResearchUrl} from './research'
import {sourceCaptureFields,sourceSnapshotFields,extractSourceContent} from './researchSourceModel'
const row=v.object({_id:v.id('researchSourceCaptures'),_creationTime:v.number(),...sourceCaptureFields})
export const list=query({args:{researchId:v.id('research')},returns:v.array(row),handler:async(ctx,args)=>{
 const research=await ctx.db.get(args.researchId);if(!research)throw new ConvexError('Research not found')
 await requireOwnedMission(ctx,research.missionId)
 return ctx.db.query('researchSourceCaptures').withIndex('by_research',q=>q.eq('researchId',args.researchId)).order('desc').take(10)
}})
export const reserve=internalMutation({args:{ownerKey:v.string(),researchId:v.id('research'),citation:v.string()},returns:v.id('researchSourceCaptures'),handler:async(ctx,args)=>{
 const research=await ctx.db.get(args.researchId),mission=research?await ctx.db.get(research.missionId):null
 if(!research||!mission||mission.ownerKey!==args.ownerKey)throw new ConvexError('Research not found or access denied')
 if(!research.citations.includes(args.citation)||!isSafeResearchUrl(args.citation))throw new ConvexError('Select an exact public HTTPS citation from this research')
 const attempts=await ctx.db.query('researchSourceCaptures').withIndex('by_research',q=>q.eq('researchId',args.researchId)).take(10)
 if(attempts.length>=10)throw new ConvexError('This research record has reached its ten source-retrieval attempt limit')
 return ctx.db.insert('researchSourceCaptures',{...args,missionId:research.missionId,status:'pending',createdAt:Date.now()})
}})
export const finish=internalMutation({args:{id:v.id('researchSourceCaptures'),ownerKey:v.string(),snapshot:v.optional(v.object(sourceSnapshotFields)),failureReason:v.optional(v.string())},returns:v.null(),handler:async(ctx,args)=>{
 const receipt=await ctx.db.get(args.id)
 if(!receipt||receipt.ownerKey!==args.ownerKey)throw new ConvexError('Source capture not found')
 if(receipt.status!=='pending')return null
 await ctx.db.patch(args.id,args.snapshot?{status:'captured',snapshot:args.snapshot}:{status:'failed',failureReason:(args.failureReason??'Source retrieval failed').slice(0,200)})
 return null
}})
export const capture=action({args:{researchId:v.id('research'),citation:v.string()},returns:v.id('researchSourceCaptures'),handler:async(ctx,args)=>{
 const ownerKey=await requireOperator(ctx)
 const id=await ctx.runMutation(internal.researchSources.reserve,{...args,ownerKey})
 let snapshot
 try{
  const page=await fetchResearchPageViaGateway(args.citation)
  if(page.status!==200||!/^text\/(html|plain)(?:;|$)|^application\/xhtml\+xml(?:;|$)/i.test(page.contentType))throw Error('Unsupported source response')
  const bytes=new TextEncoder().encode(page.body)
  if(!bytes.length||bytes.length>120000)throw Error('Source body outside bounded capture')
  const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('')
  const capturedAt=Date.now(),content=extractSourceContent(page.body,page.contentType,capturedAt)
  if(!content.extractedText)throw Error('No extractable source text')
  snapshot={...content,finalUrl:page.finalUrl,contentType:page.contentType.slice(0,160),httpStatus:page.status,bodyBytes:bytes.length,bodyLimitReached:bytes.length>=120000,bodySha256:await hash(page.body),textSha256:await hash(content.extractedText),capturedAt}
 }catch{
  await ctx.runMutation(internal.researchSources.finish,{id,ownerKey,failureReason:'Protected source retrieval failed, was rejected, or returned unsupported content. No direct fetch or AI fallback was used.'})
  throw new ConvexError('Source capture failed; the attempt is recorded. Review retrieval status before trying again.')
 }
 await ctx.runMutation(internal.researchSources.finish,{id,ownerKey,snapshot})
 return id
}})
