import {v,ConvexError} from 'convex/values'
import {mutation,query} from './_generated/server'
import type {MutationCtx} from './_generated/server'
import type {Doc,Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {graphKind,graphBasis,graphStatus,graphRelation,graphFields,edgeFields,validRelation,validateReviewDate,analyzeGraph} from './evidenceGraphModel'
const entry=v.object({_id:v.id('graphEntries'),_creationTime:v.number(),...graphFields}),edge=v.object({_id:v.id('graphEdges'),_creationTime:v.number(),...edgeFields})
async function entries(ctx:MutationCtx,projectId:Id<'studioProjects'>){return ctx.db.query('graphEntries').withIndex('by_project',q=>q.eq('projectId',projectId)).take(120)}
function admit(rows:Doc<'graphEntries'>[],nodeKey:string){
 if(rows.length>=120)throw new ConvexError('120 retained graph-version limit reached')
 if(!rows.some(r=>r.nodeKey===nodeKey)&&new Set(rows.map(r=>r.nodeKey)).size>=30)throw new ConvexError('30-node limit reached; history is retained')
}
export const graph=query({args:{projectId:v.id('studioProjects')},returns:v.object({entries:v.array(entry),edges:v.array(edge),asOf:v.number(),analysis:v.object({issues:v.array(v.object({nodeKey:v.string(),reasons:v.array(v.string())})),decisions:v.array(v.object({nodeKey:v.string(),affectedBy:v.array(v.string()),reviewRequired:v.boolean()})),missingEndpoints:v.number()})}),handler:async(ctx,a)=>{
 await ownedProject(ctx,a.projectId)
 const entries=await ctx.db.query('graphEntries').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(120),edges=await ctx.db.query('graphEdges').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(120),asOf=Date.now()
 return{entries,edges,asOf,analysis:analyzeGraph(entries,edges,new Date(asOf).toISOString().slice(0,10))}
}})
export const save=mutation({args:{projectId:v.id('studioProjects'),nodeKey:v.string(),kind:graphKind,expectedRevision:v.number(),statement:v.string(),scope:v.string(),basis:graphBasis,status:graphStatus,reviewOn:v.string()},returns:v.id('graphEntries'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),nodeKey=bounded(a.nodeKey,'Node key',60),statement=bounded(a.statement,'Statement',2000),scope=bounded(a.scope,'Scope',700),reviewOn=validateReviewDate(a.reviewOn)
 if(a.kind==='source')throw new ConvexError('Import sources from saved passages or research reviews')
 secrets(JSON.stringify({nodeKey,statement,scope}))
 const rows=await entries(ctx,p._id),versions=rows.filter(r=>r.nodeKey===nodeKey)
 if(versions.some(r=>r.kind!==a.kind))throw new ConvexError('Node kind cannot change across revisions')
 if(versions.some(r=>r.sourceSnapshot))throw new ConvexError('Imported evidence records are fixed; add a separate assessed claim instead')
 if(!/^[a-z0-9][a-z0-9_-]*$/.test(nodeKey)||!Number.isInteger(a.expectedRevision)||a.expectedRevision<0)throw new ConvexError('Use a lowercase node key and nonnegative whole revision')
 const data={kind:a.kind,statement,scope,basis:a.basis,status:a.status,reviewOn},hash=await digest(canonical(data))
 const replay=versions.find(r=>r.revision===a.expectedRevision+1&&r.digest===hash)
 if(replay)return replay._id
 const latest=versions.reduce((n,r)=>Math.max(n,r.revision),0)
 if(latest!==a.expectedRevision)throw new ConvexError('Node changed; load the latest revision first')
 if(latest>=10)throw new ConvexError('10-revision limit reached for this node')
 admit(rows,nodeKey)
 return ctx.db.insert('graphEntries',{...data,ownerKey:p.ownerKey,projectId:p._id,nodeKey,revision:latest+1,digest:hash,createdAt:Date.now()})
}})
export const importSource=mutation({args:{projectId:v.id('studioProjects'),passageId:v.optional(v.id('studioPassages')),reviewId:v.optional(v.id('researchClaims'))},returns:v.id('graphEntries'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId)
 if(!!a.passageId===!!a.reviewId)throw new ConvexError('Select exactly one saved passage or research review')
 let statement='',snapshot:Record<string,unknown>={},ref=''
 if(a.passageId){
  const passage=await ctx.db.get(a.passageId),doc=passage?await ctx.db.get(passage.documentId):null
  if(!passage||!doc||passage.ownerKey!==p.ownerKey||doc.ownerKey!==p.ownerKey||doc.projectId!==p._id)throw new ConvexError('Source unavailable in this project')
  const newline=String.fromCharCode(10),exact=doc.content.split(newline).slice(passage.firstLine-1,passage.lastLine).join(newline)
  if(exact!==passage.quote||await digest(doc.content)!==doc.sha256)throw new ConvexError('Stored passage provenance no longer matches its document')
  statement=passage.quote;ref=passage._id;snapshot={type:'document-passage',basis:'saved_document',documentId:doc._id,passageId:passage._id,name:doc.name,firstLine:passage.firstLine,lastLine:passage.lastLine,documentSha256:doc.sha256,savedAt:doc.createdAt,publicationDate:null}
 }else{
  const r=await ctx.db.get(a.reviewId!)
  if(!r||r.ownerKey!==p.ownerKey||r.missionId!==p.missionId)throw new ConvexError('Source unavailable in this project')
  const research=await ctx.db.get(r.researchId)
  if(!research||research.missionId!==p.missionId||!research.citations.includes(r.citation))throw new ConvexError('Research provenance unavailable')
  const capture=r.sourceCaptureId?await ctx.db.get(r.sourceCaptureId):null
  if(r.sourceCaptureId&&(!capture||capture.ownerKey!==p.ownerKey||capture.researchId!==r.researchId||capture.citation!==r.citation||capture.status!=='captured'||!capture.snapshot||capture.snapshot.textSha256!==r.sourceTextSha256))throw new ConvexError('Captured source provenance unavailable')
  if(capture?.snapshot&&await digest(capture.snapshot.extractedText)!==capture.snapshot.textSha256)throw new ConvexError('Captured source text digest mismatch')
  const source=capture?.snapshot?.extractedText??research.result
  if(!source.includes(r.excerpt))throw new ConvexError('Saved excerpt no longer matches its source')
  statement=r.excerpt;ref=r._id;snapshot={type:'research-review',basis:capture?'retrieved_source':'saved_research',reviewId:r._id,researchId:r.researchId,citation:r.citation,reviewedClaim:r.claim,finding:r.finding,rationale:r.rationale,savedAt:r.researchSavedAt,reviewedAt:r.createdAt,sourceCaptureId:r.sourceCaptureId??null,sourceTextSha256:r.sourceTextSha256??null,sourceCapturedAt:r.sourceCapturedAt??null,finalUrl:r.sourceFinalUrl??null,publicationDate:capture?.snapshot?.publicationDate??null,publicationStatus:capture?.snapshot?.publicationStatus??'unknown',dateDeclarations:capture?.snapshot?.dateDeclarations??[],textTruncated:capture?.snapshot?.textTruncated??null}
 }
 const nodeKey='source-'+ref,rows=await entries(ctx,p._id),sourceSnapshot=canonical(snapshot),hash=await digest(canonical({statement,snapshot}))
 const old=rows.find(r=>r.nodeKey===nodeKey)
 if(old){if(old.digest!==hash)throw new ConvexError('Source changed after its frozen import; existing evidence is retained');return old._id}
 admit(rows,nodeKey)
 return ctx.db.insert('graphEntries',{ownerKey:p.ownerKey,projectId:p._id,nodeKey,kind:'source',revision:1,statement,scope:'Exact saved text; factual reliability is not independently verified',basis:'observed',status:'reviewed',reviewOn:'',sourceSnapshot,digest:hash,createdAt:Date.now()})
}})
export const connect=mutation({args:{projectId:v.id('studioProjects'),fromId:v.id('graphEntries'),toId:v.id('graphEntries'),relation:graphRelation,rationale:v.string()},returns:v.id('graphEdges'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),from=await ctx.db.get(a.fromId),to=await ctx.db.get(a.toId),rationale=bounded(a.rationale,'Link rationale',1200)
 if(!from||!to||from.ownerKey!==p.ownerKey||to.ownerKey!==p.ownerKey||from.projectId!==p._id||to.projectId!==p._id)throw new ConvexError('Both endpoints must belong to this project')
 if(from.nodeKey===to.nodeKey||!validRelation(from.kind,to.kind,a.relation))throw new ConvexError('Invalid typed relationship or self-link')
 secrets(rationale)
 const edges=await ctx.db.query('graphEdges').withIndex('by_project',q=>q.eq('projectId',p._id)).take(120)
 const duplicate=edges.find(e=>e.fromId===from._id&&e.toId===to._id&&e.relation===a.relation&&e.rationale===rationale)
 if(duplicate){if(duplicate.retiredAt!==undefined)throw new ConvexError('This exact link was retired; record a new review rationale');return duplicate._id}
 const rows=await entries(ctx,p._id)
 if(rows.some(r=>(r.nodeKey===from.nodeKey&&r.revision>from.revision)||(r.nodeKey===to.nodeKey&&r.revision>to.revision))||from.status==='retired'||to.status==='retired')throw new ConvexError('Use current non-retired endpoint versions')
 if(from.sourceSnapshot&&['supports','contradicts','questions'].includes(a.relation)){
  const s=JSON.parse(from.sourceSnapshot)
  if(s.type==='research-review'&&(s.reviewedClaim!==to.statement||({supporting:'supports',contradicting:'contradicts',unresolved:'questions'} as Record<string,string>)[s.finding]!==a.relation))throw new ConvexError('Preserve the original research review claim and finding; create another research review to reassess it')
 }
 if(edges.length>=120)throw new ConvexError('120-link history limit reached; retired links remain retained')
 return ctx.db.insert('graphEdges',{...a,rationale,ownerKey:p.ownerKey,createdAt:Date.now()})
}})
export const retireLink=mutation({args:{projectId:v.id('studioProjects'),edgeId:v.id('graphEdges'),reason:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),e=await ctx.db.get(a.edgeId),reason=bounded(a.reason,'Retirement reason',700)
 if(!e||e.ownerKey!==p.ownerKey||e.projectId!==p._id)throw new ConvexError('Link unavailable')
 secrets(reason)
 if(e.retiredAt!==undefined){if(e.retirementReason!==reason)throw new ConvexError('Retirement review is already frozen');return null}
 await ctx.db.patch(e._id,{retiredAt:Date.now(),retirementReason:reason});return null
}})

export const importExperimentReport=mutation({args:{projectId:v.id('studioProjects'),reportId:v.id('experimentObservations')},returns:v.id('graphEntries'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),r=await ctx.db.get(a.reportId),c=r?await ctx.db.get(r.contractId):null
 if(!r||!c||r.ownerKey!==p.ownerKey||c.ownerKey!==p.ownerKey||r.projectId!==p._id||c.projectId!==p._id)throw new ConvexError('Experiment report unavailable in this project')
 const nodeKey='experiment-'+r._id,statement='Recorded '+r.basis+' report for '+c.title+': baseline '+(r.baseline??'missing')+', candidate '+(r.candidate??'missing')+' '+c.unit+'. Causation is not established.'
 const sourceSnapshot=canonical(JSON.parse(JSON.stringify({type:'experiment-report',contractId:c._id,contractDigest:c.designDigest,reportId:r._id,reportDigest:r.payloadDigest,protocolId:c.protocolId,trialId:r.trialId??null,comparison:c.comparison,provenance:r.basis,recordedAt:r.createdAt,periodStart:r.periodStart,periodEnd:r.periodEnd,cohort:r.cohort,baseline:r.baseline??null,candidate:r.candidate??null,baselinePopulation:r.baselinePopulation,candidatePopulation:r.candidatePopulation,guardrailValues:r.guardrailValues,complete:r.complete,stopTriggered:r.stopTriggered,concurrentChanges:r.concurrentChanges,evidence:r.evidence,evidenceSha256:r.digest,causalConclusion:'not_established'})))
 const hash=await digest(canonical({statement,sourceSnapshot})),rows=await entries(ctx,p._id),old=rows.find(n=>n.nodeKey===nodeKey)
 if(old){if(old.digest!==hash)throw new ConvexError('Imported report changed; retained evidence cannot be overwritten');return old._id}
 admit(rows,nodeKey)
 return ctx.db.insert('graphEntries',{ownerKey:p.ownerKey,projectId:p._id,nodeKey,kind:'observation',revision:1,statement,scope:c.population,basis:r.basis==='controlled_fixture'?'hypothesized':'observed',status:'unverified',reviewOn:'',sourceSnapshot,digest:hash,createdAt:Date.now()})
}})
