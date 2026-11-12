import {v,ConvexError} from 'convex/values'
import {makeFunctionReference} from 'convex/server'
import {query,mutation,type QueryCtx,type MutationCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {ownedProject} from './studio'
import {bounded,secrets,digest} from './studioModel'
import {canonical} from './evaluationModel'
import {featureKey,taskTitle,featureContract} from './featureBuilderModel'
import {featureSources} from './featurePackSources'
import {admitEvidence} from './evidenceAdmission'
async function owned(ctx:QueryCtx|MutationCtx,id:Id<'featurePackages'>){const r=await ctx.db.get(id);if(!r)throw new ConvexError('Feature package unavailable');const p=await ownedProject(ctx,r.projectId);if(r.ownerKey!==p.ownerKey)throw new ConvexError('Feature package unavailable');return{r,p}}
export const list=query({args:{projectId:v.id('studioProjects')},returns:v.array(v.object({id:v.id('featurePackages'),featureKey:v.string(),title:v.string(),revision:v.number(),packageDigest:v.string(),createdAt:v.number()})),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return(await ctx.db.query('featurePackages').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(20)).map(r=>({id:r._id,featureKey:r.featureKey,title:r.title,revision:r.revision,packageDigest:r.packageDigest,createdAt:r.createdAt}))}})
export const detail=query({args:{featureId:v.id('featurePackages')},returns:v.object({packageSnapshot:v.string(),packageDigest:v.string(),artifactId:v.union(v.id('artifacts'),v.null())}),handler:async(ctx,a)=>{const{r}=await owned(ctx,a.featureId),receipt=await ctx.db.query('featureArtifactReceipts').withIndex('by_feature',q=>q.eq('featureId',r._id)).first();return{packageSnapshot:r.packageSnapshot,packageDigest:r.packageDigest,artifactId:receipt?.artifactId??null}}})
export const prepareSpecification=mutation({args:{projectId:v.id('studioProjects'),featureKey:v.string(),title:v.string()},returns:v.id('studioSpecifications'),handler:async(ctx,a):Promise<Id<'studioSpecifications'>>=>{
 await ownedProject(ctx,a.projectId);const key=featureKey(a.featureKey),title=bounded(a.title,'Feature title',120)
 const old=await ctx.db.query('studioSpecifications').withIndex('by_project_revision',q=>q.eq('projectId',a.projectId)).first()
 if(old)throw new ConvexError('This project already has a specification; select it or review a new revision in Product Specifications')
 return ctx.runMutation(makeFunctionReference<'mutation'>('studio:compileSpecification'),{projectId:a.projectId,expectedRevision:0,requirements:[{title,role:'Owner',route:'/features/'+key,entity:'Task',acceptance:'Authenticated owners can create, rename, change status and archive their private tasks. Anonymous and foreign-owner access is denied.'}]})
}})
export const create=mutation({args:{projectId:v.id('studioProjects'),specificationId:v.id('studioSpecifications'),requestKey:v.string(),featureKey:v.string(),title:v.string(),expectedRevision:v.number(),requirementKeys:v.array(v.string())},returns:v.id('featurePackages'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),key=featureKey(a.featureKey),title=bounded(a.title,'Feature title',120),requestKey=bounded(a.requestKey,'Package key',80)
 if(!Number.isInteger(a.expectedRevision)||a.expectedRevision<0||a.requirementKeys.length<1||a.requirementKeys.length>6||new Set(a.requirementKeys).size!==a.requirementKeys.length)throw new ConvexError('Select 1–6 unique requirements and the current family revision')
 const requirementKeys=[...a.requirementKeys].sort(),rows=await ctx.db.query('featurePackages').withIndex('by_project',q=>q.eq('projectId',a.projectId)).take(20),old=rows.find(r=>r.requestKey===requestKey)
 if(old){if(old.featureKey!==key||old.title!==title||old.specificationId!==a.specificationId||canonical(old.requirementKeys)!==canonical(requirementKeys)||old.revision!==a.expectedRevision+1)throw new ConvexError('Package key binds different immutable inputs');return old._id}
 if(rows.length>=20)throw new ConvexError('20 retained feature versions per project')
 const latest=rows.filter(r=>r.featureKey===key).reduce((n,r)=>Math.max(n,r.revision),0)
 if(a.expectedRevision!==latest)throw new ConvexError('Feature version changed; inspect the current family revision')
 const spec=await ctx.db.get(a.specificationId)
 if(!spec||spec.ownerKey!==p.ownerKey||spec.projectId!==p._id)throw new ConvexError('Owned project specification required')
 const requirements=requirementKeys.map(k=>spec.requirements.find(r=>r.key===k))
 if(requirements.some(r=>!r||r.route!=='/features/'+key||!['owner','authenticated owner'].includes(r.role.toLowerCase())||r.entity.toLowerCase()!=='task'))throw new ConvexError('This pack supports Owner / Task requirements at /features/'+key+' only')
 const specificationDigest=await digest(canonical({id:spec._id,revision:spec.revision,requirements:spec.requirements,roles:spec.roles})),sources=featureSources(key,title),files=await Promise.all(sources.map(async f=>({...f,sha256:await digest(f.content)})))
 const packageSnapshot=canonical({version:'feature-source-package-v1',contract:featureContract,feature:{key,title,revision:latest+1},specification:{id:spec._id,revision:spec.revision,digest:specificationDigest,requirements},files,traceability:requirementKeys.map(requirementKey=>({requirementKey,ui:files[2].path,route:files[3].path,api:files[1].path,permissions:'Authenticated owner; server-side ownership checks for every operation',data:files[0].path,tests:files[4].path,migration:files[6].path,acceptance:'Linked requirement; free-form semantics and target integration remain unverified'})),integration:'Uninstalled source bundle. Native preview behavior does not prove target app integration or production readiness.'})
 if(new TextEncoder().encode(packageSnapshot).length>128*1024)throw new ConvexError('Feature package exceeds 128 KiB')
 secrets(requestKey);secrets(title)
 return ctx.db.insert('featurePackages',{ownerKey:p.ownerKey,projectId:p._id,specificationId:spec._id,specificationDigest,requestKey,featureKey:key,title,revision:latest+1,requirementKeys,packageSnapshot,packageDigest:await digest(packageSnapshot),createdAt:Date.now()})
}})
const itemView=v.object({id:v.id('featurePreviewItems'),requestKey:v.string(),title:v.string(),status:v.union(v.literal('open'),v.literal('done')),archived:v.boolean(),createdAt:v.number(),updatedAt:v.number()})
export const items=query({args:{featureId:v.id('featurePackages')},returns:v.array(itemView),handler:async(ctx,a)=>{const{r}=await owned(ctx,a.featureId);return(await ctx.db.query('featurePreviewItems').withIndex('by_feature_owner',q=>q.eq('featureId',r._id).eq('ownerKey',r.ownerKey)).order('desc').take(25)).map(i=>({id:i._id,requestKey:i.requestKey,title:i.title,status:i.status,archived:i.archived,createdAt:i.createdAt,updatedAt:i.updatedAt}))}})
export const createItem=mutation({args:{featureId:v.id('featurePackages'),requestKey:v.string(),title:v.string()},returns:v.id('featurePreviewItems'),handler:async(ctx,a)=>{
 const{r}=await owned(ctx,a.featureId),title=taskTitle(a.title),key=bounded(a.requestKey,'Creation key',80)
 if(!/^[A-Za-z0-9_-]+$/.test(key))throw new ConvexError('Creation key uses letters, numbers, underscore or hyphen')
 const rows=await ctx.db.query('featurePreviewItems').withIndex('by_feature_owner',q=>q.eq('featureId',r._id).eq('ownerKey',r.ownerKey)).take(25),old=rows.find(i=>i.requestKey===key)
 if(old){if(old.initialTitle!==title)throw new ConvexError('Creation key binds different original content');return old._id}
 if(rows.length>=25)throw new ConvexError('25 retained preview items per feature version')
 const now=Date.now();return ctx.db.insert('featurePreviewItems',{ownerKey:r.ownerKey,featureId:r._id,requestKey:key,initialTitle:title,title,status:'open',archived:false,createdAt:now,updatedAt:now})
}})
export const updateItem=mutation({args:{featureId:v.id('featurePackages'),itemId:v.id('featurePreviewItems'),title:v.string(),status:v.union(v.literal('open'),v.literal('done'))},returns:v.null(),handler:async(ctx,a)=>{const{r}=await owned(ctx,a.featureId),i=await ctx.db.get(a.itemId);if(!i||i.featureId!==r._id||i.ownerKey!==r.ownerKey||i.archived)throw new ConvexError('Preview task unavailable');const title=taskTitle(a.title);if(title!==i.title||a.status!==i.status)await ctx.db.patch(i._id,{title,status:a.status,updatedAt:Date.now()});return null}})
export const archiveItem=mutation({args:{featureId:v.id('featurePackages'),itemId:v.id('featurePreviewItems')},returns:v.null(),handler:async(ctx,a)=>{const{r}=await owned(ctx,a.featureId),i=await ctx.db.get(a.itemId);if(!i||i.featureId!==r._id||i.ownerKey!==r.ownerKey)throw new ConvexError('Preview task unavailable');if(!i.archived)await ctx.db.patch(i._id,{archived:true,updatedAt:Date.now()});return null}})
export const handoff=mutation({args:{featureId:v.id('featurePackages'),expectedDigest:v.string()},returns:v.id('artifacts'),handler:async(ctx,a)=>{
 const{r,p}=await owned(ctx,a.featureId)
 if(r.packageDigest!==a.expectedDigest||await digest(r.packageSnapshot)!==r.packageDigest)throw new ConvexError('Exact package digest required')
 const old=await ctx.db.query('featureArtifactReceipts').withIndex('by_feature',q=>q.eq('featureId',r._id)).first()
 if(old){const artifact=await ctx.db.get(old.artifactId);if(!artifact||artifact.missionId!==p.missionId||artifact.content!==r.packageSnapshot||old.packageDigest!==r.packageDigest)throw new ConvexError('Retained artifact receipt changed; inspect it before proceeding');return old.artifactId}
 const m=await ctx.db.get(p.missionId);if(!m||m.ownerKey!==p.ownerKey)throw new ConvexError('Owned linked mission required')
 await admitEvidence(ctx.db.query('artifacts').withIndex('by_mission',q=>q.eq('missionId',p.missionId)),'Feature source artifact')
 const artifactId=await ctx.db.insert('artifacts',{missionId:p.missionId,type:'feature-source-bundle',name:r.title+' · source v'+r.revision,content:r.packageSnapshot,status:'awaiting_approval',requiresApproval:true})
 await ctx.db.insert('featureArtifactReceipts',{ownerKey:p.ownerKey,featureId:r._id,artifactId,packageDigest:r.packageDigest,createdAt:Date.now()});return artifactId
}})
