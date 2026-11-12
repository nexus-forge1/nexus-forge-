import {v,ConvexError} from 'convex/values'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {visualConfig,normalizeVisual} from './visualBuilderModel'
import {auditVisualSource,visualPackage} from './visualSource'
import {defaultVisual,type VisualConfig} from '../src/lib/visual-task-contract'
import {admitEvidence} from './evidenceAdmission'
async function feature(ctx:QueryCtx|MutationCtx,id:Id<'featurePackages'>){const f=await ctx.db.get(id);if(!f)throw new ConvexError('Feature unavailable');const p=await ownedProject(ctx,f.projectId);if(f.ownerKey!==p.ownerKey)throw new ConvexError('Feature unavailable');return{f,p}}
async function visual(ctx:QueryCtx|MutationCtx,id:Id<'visualRevisions'>){const r=await ctx.db.get(id);if(!r)throw new ConvexError('Visual revision unavailable');const d=await feature(ctx,r.featureId);if(r.ownerKey!==d.f.ownerKey)throw new ConvexError('Visual revision unavailable');return{r,...d}}
export const context=query({args:{featureId:v.id('featurePackages')},returns:v.object({sourceDigest:v.string(),title:v.string(),featureKey:v.string(),defaultConfig:visualConfig}),handler:async(ctx,a)=>{const{f}=await feature(ctx,a.featureId),p=await auditVisualSource(f.packageSnapshot,f.packageDigest);return{sourceDigest:f.packageDigest,title:p.feature.title,featureKey:p.feature.key,defaultConfig:defaultVisual(p.feature.title)}}})
export const list=query({args:{featureId:v.id('featurePackages')},returns:v.array(v.object({id:v.id('visualRevisions'),requestKey:v.string(),revision:v.number(),parentRevision:v.number(),config:visualConfig,operation:v.union(v.literal('edit'),v.literal('restore')),restoredFrom:v.union(v.id('visualRevisions'),v.null()),packageDigest:v.string(),createdAt:v.number()})),handler:async(ctx,a)=>{await feature(ctx,a.featureId);return(await ctx.db.query('visualRevisions').withIndex('by_feature',q=>q.eq('featureId',a.featureId)).order('desc').take(20)).map(r=>({id:r._id,requestKey:r.requestKey,revision:r.revision,parentRevision:r.parentRevision,config:r.config,operation:r.operation,restoredFrom:r.restoredFrom??null,packageDigest:r.packageDigest,createdAt:r.createdAt}))}})
export const detail=query({args:{visualId:v.id('visualRevisions')},returns:v.object({sourceDigest:v.string(),packageSnapshot:v.string(),packageDigest:v.string(),diff:v.string(),artifactId:v.union(v.id('artifacts'),v.null())}),handler:async(ctx,a)=>{const{r}=await visual(ctx,a.visualId),receipt=await ctx.db.query('visualArtifactReceipts').withIndex('by_visual',q=>q.eq('visualId',r._id)).first();return{sourceDigest:r.sourceDigest,packageSnapshot:r.packageSnapshot,packageDigest:r.packageDigest,diff:r.diff,artifactId:receipt?.artifactId??null}}})
type Commit={featureId:Id<'featurePackages'>;requestKey:string;expectedRevision:number;expectedSourceDigest:string;config:VisualConfig;operation:'edit'|'restore';restoredFrom?:Id<'visualRevisions'>}
async function commit(ctx:MutationCtx,a:Commit){
 const{f}=await feature(ctx,a.featureId),requestKey=bounded(a.requestKey,'Visual revision key',80),config=normalizeVisual(a.config)
 if(!Number.isInteger(a.expectedRevision)||a.expectedRevision<0)throw new ConvexError('Use the exact current visual revision')
 const rows=await ctx.db.query('visualRevisions').withIndex('by_feature',q=>q.eq('featureId',f._id)).order('desc').take(20),old=rows.find(r=>r.requestKey===requestKey)
 if(old){if(old.parentRevision!==a.expectedRevision||old.sourceDigest!==a.expectedSourceDigest||old.operation!==a.operation||old.restoredFrom!==a.restoredFrom||canonical(old.config)!==canonical(config))throw new ConvexError('Visual key binds different immutable inputs');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained visual revisions per feature version')
 const latest=rows[0]?.revision??0
 if(latest!==a.expectedRevision)throw new ConvexError('Visual history changed; inspect the latest revision')
 if(f.packageDigest!==a.expectedSourceDigest)throw new ConvexError('Feature source changed; inspect its exact digest')
 const base=await auditVisualSource(f.packageSnapshot,f.packageDigest),built=await visualPackage(base,f.packageDigest,config,latest+1)
 secrets(requestKey);secrets(canonical(config))
 return ctx.db.insert('visualRevisions',{ownerKey:f.ownerKey,featureId:f._id,requestKey,revision:latest+1,parentRevision:latest,sourceDigest:f.packageDigest,config,operation:a.operation,...(a.restoredFrom?{restoredFrom:a.restoredFrom}:{}),packageSnapshot:built.snapshot,packageDigest:built.packageDigest,diff:built.diff,createdAt:Date.now()})
}
const saveArgs={featureId:v.id('featurePackages'),requestKey:v.string(),expectedRevision:v.number(),expectedSourceDigest:v.string()}
export const save=mutation({args:{...saveArgs,config:visualConfig},returns:v.id('visualRevisions'),handler:async(ctx,a)=>commit(ctx,{...a,operation:'edit'})})
export const restore=mutation({args:{...saveArgs,targetId:v.id('visualRevisions')},returns:v.id('visualRevisions'),handler:async(ctx,a)=>{const{r}=await visual(ctx,a.targetId);if(r.featureId!==a.featureId||r.sourceDigest!==a.expectedSourceDigest)throw new ConvexError('Restore must use the same feature and exact source');return commit(ctx,{...a,config:r.config,operation:'restore',restoredFrom:r._id})}})
export const handoff=mutation({args:{visualId:v.id('visualRevisions'),expectedDigest:v.string()},returns:v.id('artifacts'),handler:async(ctx,a)=>{
 const{r,f,p}=await visual(ctx,a.visualId)
 if(r.packageDigest!==a.expectedDigest||await digest(r.packageSnapshot)!==r.packageDigest||f.packageDigest!==r.sourceDigest)throw new ConvexError('Exact visual package and source digests are required')
 await auditVisualSource(f.packageSnapshot,f.packageDigest)
 const old=await ctx.db.query('visualArtifactReceipts').withIndex('by_visual',q=>q.eq('visualId',r._id)).first()
 if(old){const artifact=await ctx.db.get(old.artifactId);if(!artifact||artifact.missionId!==p.missionId||artifact.content!==r.packageSnapshot||old.packageDigest!==r.packageDigest)throw new ConvexError('Retained visual artifact receipt changed');return old.artifactId}
 const m=await ctx.db.get(p.missionId);if(!m||m.ownerKey!==f.ownerKey)throw new ConvexError('Owned mission required')
 await admitEvidence(ctx.db.query('artifacts').withIndex('by_mission',q=>q.eq('missionId',p.missionId)),'Visual source artifact')
 const artifactId=await ctx.db.insert('artifacts',{missionId:p.missionId,type:'visual-feature-source-bundle',name:f.title+' · visual v'+r.revision,content:r.packageSnapshot,status:'awaiting_approval',requiresApproval:true})
 await ctx.db.insert('visualArtifactReceipts',{ownerKey:f.ownerKey,visualId:r._id,artifactId,packageDigest:r.packageDigest,createdAt:Date.now()});return artifactId
}})
