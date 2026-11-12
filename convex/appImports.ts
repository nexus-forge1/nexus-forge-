import {v,ConvexError} from 'convex/values'
import {query,mutation,internalQuery,internalMutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {repoIdentity,failedWorkflows,type FileEntry,type CiRun} from './appImportModel'
async function owned(ctx:QueryCtx|MutationCtx,id:Id<'appImportSnapshots'>){const r=await ctx.db.get(id);if(!r)throw new ConvexError('Import snapshot unavailable');const p=await ownedProject(ctx,r.projectId);if(r.ownerKey!==p.ownerKey)throw new ConvexError('Import snapshot unavailable');return r}
export const preflight=internalQuery({args:{projectId:v.id('studioProjects'),requestKey:v.string(),repository:v.string(),commitSha:v.string()},returns:v.union(v.id('appImportSnapshots'),v.null()),handler:async(ctx,a)=>{
 await ownedProject(ctx,a.projectId);const rows=await ctx.db.query('appImportSnapshots').withIndex('by_project',q=>q.eq('projectId',a.projectId)).take(20),key=bounded(a.requestKey,'Import key',80),identity=repoIdentity(a.repository,a.commitSha),old=rows.find(r=>r.requestKey===key)
 if(old){if(old.repository!==identity.repository||old.commitSha!==identity.commitSha)throw new ConvexError('Import key already binds a different commit');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained import baselines per project');return null
}})
export const save=internalMutation({args:{projectId:v.id('studioProjects'),requestKey:v.string(),repository:v.string(),commitSha:v.string(),report:v.string()},returns:v.id('appImportSnapshots'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),identity=repoIdentity(a.repository,a.commitSha),requestKey=bounded(a.requestKey,'Import key',80),rows=await ctx.db.query('appImportSnapshots').withIndex('by_project',q=>q.eq('projectId',a.projectId)).take(20),old=rows.find(r=>r.requestKey===requestKey)
 if(old){if(old.repository!==identity.repository||old.commitSha!==identity.commitSha)throw new ConvexError('Import key already binds a different commit');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained import baselines per project')
 if(new TextEncoder().encode(a.report).length>384*1024)throw new ConvexError('Import report exceeds 384 KiB')
 const report=JSON.parse(a.report);if(report.repository!==identity.repository||report.commitSha!==identity.commitSha||report.version!=='public-repository-baseline-v1')throw new ConvexError('Invalid server import report')
 secrets(requestKey);return ctx.db.insert('appImportSnapshots',{ownerKey:p.ownerKey,projectId:a.projectId,requestKey,...identity,report:a.report,digest:await digest(a.report),createdAt:Date.now()})
}})
export const list=query({args:{projectId:v.id('studioProjects')},returns:v.array(v.object({id:v.id('appImportSnapshots'),requestKey:v.string(),repository:v.string(),commitSha:v.string(),digest:v.string(),createdAt:v.number()})),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return(await ctx.db.query('appImportSnapshots').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)).map(r=>({id:r._id,requestKey:r.requestKey,repository:r.repository,commitSha:r.commitSha,digest:r.digest,createdAt:r.createdAt}))}})
export const detail=query({args:{snapshotId:v.id('appImportSnapshots')},returns:v.object({report:v.string(),digest:v.string(),createdAt:v.number(),plans:v.array(v.object({requestKey:v.string(),objective:v.string(),protectedAreas:v.string(),changes:v.string(),verification:v.string(),recovery:v.string(),decision:v.union(v.literal('plan'),v.literal('hold')),createdAt:v.number()}))}),handler:async(ctx,a)=>{const r=await owned(ctx,a.snapshotId),plans=await ctx.db.query('appModernizationPlans').withIndex('by_snapshot',q=>q.eq('snapshotId',r._id)).order('desc').take(20);return{report:r.report,digest:r.digest,createdAt:r.createdAt,plans:plans.map(({requestKey,objective,protectedAreas,changes,verification,recovery,decision,createdAt})=>({requestKey,objective,protectedAreas,changes,verification,recovery,decision,createdAt}))}}})
export const plan=mutation({args:{snapshotId:v.id('appImportSnapshots'),requestKey:v.string(),expectedDigest:v.string(),objective:v.string(),protectedAreas:v.string(),changes:v.string(),verification:v.string(),recovery:v.string(),decision:v.union(v.literal('plan'),v.literal('hold'))},returns:v.id('appModernizationPlans'),handler:async(ctx,a)=>{
 const r=await owned(ctx,a.snapshotId)
 if(a.expectedDigest!==r.digest)throw new ConvexError('Inspect the exact baseline digest before planning')
 const input={requestKey:bounded(a.requestKey,'Plan key',80),objective:bounded(a.objective,'Objective',1200,12),protectedAreas:bounded(a.protectedAreas,'Protected areas',1200,12),changes:bounded(a.changes,'Proposed changes',2400,12),verification:bounded(a.verification,'Verification',2400,12),recovery:bounded(a.recovery,'Recovery plan',1200,12),decision:a.decision}
 secrets(canonical(input));const rows=await ctx.db.query('appModernizationPlans').withIndex('by_snapshot',q=>q.eq('snapshotId',r._id)).take(20),old=rows.find(p=>p.requestKey===input.requestKey)
 if(old){const prior={requestKey:old.requestKey,objective:old.objective,protectedAreas:old.protectedAreas,changes:old.changes,verification:old.verification,recovery:old.recovery,decision:old.decision};if(canonical(prior)!==canonical(input))throw new ConvexError('Plan key binds different immutable content');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained plans per baseline')
 return ctx.db.insert('appModernizationPlans',{ownerKey:r.ownerKey,snapshotId:r._id,sourceDigest:r.digest,...input,createdAt:Date.now()})
}})
export const compare=query({args:{baselineId:v.id('appImportSnapshots'),candidateId:v.id('appImportSnapshots')},returns:v.string(),handler:async(ctx,a)=>{
 const b=await owned(ctx,a.baselineId),c=await owned(ctx,a.candidateId)
 if(b._id===c._id||b.projectId!==c.projectId||b.repository!==c.repository||b.commitSha===c.commitSha)throw new ConvexError('Choose distinct commits from the same owned project and repository')
 const bp=JSON.parse(b.report),cp=JSON.parse(c.report),bf=new Map<string,FileEntry>(bp.inventory.files.map((f:FileEntry)=>[f.path,f])),cf=new Map<string,FileEntry>(cp.inventory.files.map((f:FileEntry)=>[f.path,f]))
 const added=[...cf.keys()].filter(p=>!bf.has(p)),removed=[...bf.keys()].filter(p=>!cf.has(p)),modified=[...cf.keys()].filter(p=>bf.has(p)&&bf.get(p)!.sha!==cf.get(p)!.sha),failedBase=failedWorkflows(bp.ci.runs as CiRun[]),failedCandidate=failedWorkflows(cp.ci.runs as CiRun[])
 return canonical({baselineDigest:b.digest,candidateDigest:c.digest,inventoryComplete:bp.inventory.complete&&cp.inventory.complete,added,removed,modified,reportedFailedAtBoth:failedCandidate.filter(n=>failedBase.includes(n)),newlyReportedFailed:failedCandidate.filter(n=>!failedBase.includes(n)),ciComparable:bp.ci.complete&&cp.ci.complete&&bp.ci.state==='reported'&&cp.ci.state==='reported',note:'Commit ancestry, equivalent CI configuration, test-level failures and change causality are not established. Newly reported workflow failures are not proven regressions; missing or partial CI is unknown. Sensitive paths and special entries were excluded.'})
}})
