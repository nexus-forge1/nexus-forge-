import {v,ConvexError} from 'convex/values'
import {mutation,query} from './_generated/server'
import {requireOperator} from './permissions'
import {notice} from './studio'
import {bounded,secrets} from './studioModel'
import {sha,envEntry,checkEntry,exportEntry} from './releaseCommandModel'

// Deployment Compatibility Planner
const target=v.object({_id:v.id('deploymentTargets'),name:v.string(),runtime:v.string(),region:v.string(),capabilities:v.array(v.string()),adapter:v.string(),verified:v.union(v.literal('pending'),v.literal('verified')),verificationNote:v.string(),createdAt:v.number()})
export const targetList=query({args:{},returns:v.array(target),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('deploymentTargets').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const targetSave=mutation({args:{name:v.string(),runtime:v.string(),region:v.string(),capabilities:v.array(v.string()),adapter:v.string()},returns:v.id('deploymentTargets'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),name=bounded(a.name,'Target name',160),runtime=bounded(a.runtime,'Runtime',160),region=bounded(a.region,'Region',160),adapter=bounded(a.adapter,'Adapter',160)
 const capabilities=a.capabilities.map(s=>bounded(s,'Capability',120));if(capabilities.length>12)throw new ConvexError('Provide up to 12 capabilities')
 secrets(JSON.stringify({name,runtime,region,adapter,capabilities}))
 const rows=await ctx.db.query('deploymentTargets').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-target limit reached')
 return await ctx.db.insert('deploymentTargets',{ownerKey,name,runtime,region,capabilities,adapter,verified:'pending',verificationNote:'',createdAt:Date.now()})}})
export const targetVerify=mutation({args:{id:v.id('deploymentTargets'),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.note,'Verification note',2000,12)
 await ctx.db.patch(a.id,{verified:'verified',verificationNote:note})
 await notice(ctx,row.ownerKey,'Deployment target verified',row.name,'/deployment-planner');return null}})

// Preview Environment Factory
const preview=v.object({_id:v.id('previewEnvironments'),branch:v.string(),note:v.string(),expiresAt:v.number(),budgetUsd:v.number(),status:v.union(v.literal('active'),v.literal('cleaned')),cleanupNote:v.string(),createdAt:v.number()})
export const previewList=query({args:{},returns:v.array(preview),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('previewEnvironments').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const previewCreate=mutation({args:{branch:v.string(),note:v.string(),days:v.number(),budgetUsd:v.number()},returns:v.id('previewEnvironments'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),branch=bounded(a.branch,'Branch',200),note=bounded(a.note,'Note',700)
 if(!Number.isInteger(a.days)||a.days<1||a.days>30)throw new ConvexError('Expiry must be 1–30 days')
 if(!Number.isFinite(a.budgetUsd)||a.budgetUsd<0||a.budgetUsd>100)throw new ConvexError('Budget must be $0–100');secrets(branch+' '+note)
 const rows=await ctx.db.query('previewEnvironments').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-preview limit reached')
 return await ctx.db.insert('previewEnvironments',{ownerKey,branch,note,expiresAt:Date.now()+a.days*24*60*60*1000,budgetUsd:a.budgetUsd,status:'active',cleanupNote:'',createdAt:Date.now()})}})
export const previewCleanup=mutation({args:{id:v.id('previewEnvironments'),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.note,'Cleanup receipt',1000,12)
 if(row.status!=='active')throw new ConvexError('Only an active preview can be cleaned up')
 await ctx.db.patch(a.id,{status:'cleaned',cleanupNote:note})
 await notice(ctx,row.ownerKey,'Preview cleaned up',row.branch,'/previews');return null}})

// Environment & Secrets Manager
const manifest=v.object({_id:v.id('environmentManifests'),name:v.string(),revision:v.number(),entries:v.array(envEntry),rotationNote:v.string(),createdAt:v.number()})
export const manifestList=query({args:{},returns:v.array(manifest),handler:async ctx=>{
 const owner=await requireOperator(ctx),rows=await ctx.db.query('environmentManifests').withIndex('by_owner_name_revision',q=>q.eq('ownerKey',owner)).order('desc').take(200)
 const latest=new Map<string,(typeof rows)[number]>()
 for(const row of rows){if(!latest.has(row.name))latest.set(row.name,row)}
 return[...latest.values()].map(({ownerKey,_creationTime,...rest})=>rest)}})
export const manifestSave=mutation({args:{name:v.string(),entries:v.array(envEntry),rotationNote:v.optional(v.string())},returns:v.object({_id:v.id('environmentManifests'),revision:v.number()}),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),name=bounded(a.name,'Manifest name',160)
 if(a.entries.length<1||a.entries.length>40)throw new ConvexError('Provide 1–40 entries')
 const entries=a.entries.map(e=>{const key=bounded(e.key,'Key',100)
  if(!/^[A-Z][A-Z0-9_]*$/.test(key))throw new ConvexError('Keys use UPPER_SNAKE_CASE')
  const value=bounded(e.valueOrReference,'Value or reference',500)
  if(e.classification==='managed'&&!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value))throw new ConvexError('Managed entries store a managed reference name (no spaces), never a secret value')
  secrets(key+' '+value);return{key,classification:e.classification,valueOrReference:value}})
 const rotationNote=a.rotationNote?bounded(a.rotationNote,'Rotation note',1000,12):''
 const rows=await ctx.db.query('environmentManifests').withIndex('by_owner_name_revision',q=>q.eq('ownerKey',ownerKey)).order('desc').take(400)
 const mine=rows.filter(r=>r.name===name),latest=mine[0]
 if(latest&&latest.entries.length===entries.length&&latest.entries.every((e,i)=>e.key===entries[i].key&&e.classification===entries[i].classification&&e.valueOrReference===entries[i].valueOrReference)&&rotationNote==='')return{_id:latest._id,revision:latest.revision}
 if(mine.length>=20)throw new ConvexError('20-revision limit reached for this manifest')
 const revision=(latest?.revision??0)+1
 const id=await ctx.db.insert('environmentManifests',{ownerKey,name,revision,entries,rotationNote,createdAt:Date.now()})
 if(revision>1)await notice(ctx,ownerKey,'Environment manifest rotated',name+' · revision '+revision,'/environments')
 return{_id:id,revision}}})

// Governed Release Pipeline
const release=v.object({_id:v.id('releaseRecords'),label:v.string(),commitSha:v.string(),environment:v.string(),checks:v.array(checkEntry),status:v.union(v.literal('draft'),v.literal('approved'),v.literal('rejected'),v.literal('verified')),approvalNote:v.string(),liveVerificationNote:v.string(),createdAt:v.number()})
export const releaseList=query({args:{},returns:v.array(release),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('releaseRecords').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const releaseSave=mutation({args:{label:v.string(),commitSha:v.string(),environment:v.string(),checks:v.array(checkEntry)},returns:v.id('releaseRecords'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),label=bounded(a.label,'Release label',160),environment=bounded(a.environment,'Environment',160)
 if(!sha.test(a.commitSha))throw new ConvexError('Commit must be a 7–40 character hex SHA')
 if(a.checks.length<1||a.checks.length>20)throw new ConvexError('Provide 1–20 checks')
 const checks=a.checks.map(c=>({name:bounded(c.name,'Check name',160),status:c.status}));secrets(label+' '+environment)
 const rows=await ctx.db.query('releaseRecords').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-release limit reached')
 return await ctx.db.insert('releaseRecords',{ownerKey,label,commitSha:a.commitSha,environment,checks,status:'draft',approvalNote:'',liveVerificationNote:'',createdAt:Date.now()})}})
export const releaseAdvance=mutation({args:{id:v.id('releaseRecords'),action:v.union(v.literal('approve'),v.literal('reject'),v.literal('verify')),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.note,'Note',2000,12)
 if(a.action==='reject'){if(row.status!=='draft')throw new ConvexError('Only a draft release can be rejected');await ctx.db.patch(a.id,{status:'rejected',approvalNote:note});return null}
 if(a.action==='approve'){if(row.status!=='draft')throw new ConvexError('This release already has an approval decision')
  if(row.checks.some(c=>c.status!=='pass'))throw new ConvexError('Every check must pass before approval')
  await ctx.db.patch(a.id,{status:'approved',approvalNote:note})
  await notice(ctx,row.ownerKey,'Release approved',row.label+' · '+row.commitSha.slice(0,7),'/releases');return null}
 if(row.status!=='approved')throw new ConvexError('Live verification requires an approved release')
 await ctx.db.patch(a.id,{status:'verified',liveVerificationNote:note});return null}})

// Rollback & Recovery Planner
const plan=v.object({_id:v.id('recoveryPlans'),label:v.string(),knownGoodSha:v.string(),compatibility:v.union(v.literal('unknown'),v.literal('checked')),compatibilityNote:v.string(),steps:v.array(v.string()),lastDrill:v.optional(v.object({outcome:v.string(),durationMinutes:v.number(),performedAt:v.number()})),createdAt:v.number()})
export const planList=query({args:{},returns:v.array(plan),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('recoveryPlans').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const planSave=mutation({args:{label:v.string(),knownGoodSha:v.string(),steps:v.array(v.string())},returns:v.id('recoveryPlans'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),label=bounded(a.label,'Plan label',160)
 if(!sha.test(a.knownGoodSha))throw new ConvexError('Known-good version must be a 7–40 character hex SHA')
 if(a.steps.length<1||a.steps.length>12)throw new ConvexError('Provide 1–12 recovery steps')
 const steps=a.steps.map(s=>bounded(s,'Step',700));secrets(label+' '+steps.join(' '))
 const rows=await ctx.db.query('recoveryPlans').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-plan limit reached')
 return await ctx.db.insert('recoveryPlans',{ownerKey,label,knownGoodSha:a.knownGoodSha,compatibility:'unknown',compatibilityNote:'',steps,createdAt:Date.now()})}})
export const planCheck=mutation({args:{id:v.id('recoveryPlans'),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.note,'Compatibility note',2000,12)
 await ctx.db.patch(a.id,{compatibility:'checked',compatibilityNote:note});return null}})
export const planDrill=mutation({args:{id:v.id('recoveryPlans'),outcome:v.string(),durationMinutes:v.number()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const outcome=bounded(a.outcome,'Drill outcome',2000,12)
 if(!Number.isInteger(a.durationMinutes)||a.durationMinutes<1||a.durationMinutes>1440)throw new ConvexError('Duration must be 1–1440 minutes')
 await ctx.db.patch(a.id,{lastDrill:{outcome,durationMinutes:a.durationMinutes,performedAt:Date.now()}});return null}})

// Production Diagnostics & Bounded Repair
const diagnosticCase=v.object({_id:v.id('diagnosticCases'),title:v.string(),correlation:v.string(),reproduction:v.string(),proposedRepair:v.string(),previewVerificationNote:v.string(),status:v.union(v.literal('open'),v.literal('repaired'),v.literal('verified')),createdAt:v.number()})
export const caseList=query({args:{},returns:v.array(diagnosticCase),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('diagnosticCases').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const caseOpen=mutation({args:{title:v.string(),correlation:v.string(),reproduction:v.string()},returns:v.id('diagnosticCases'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),title=bounded(a.title,'Title',200),correlation=bounded(a.correlation,'Correlation',300),reproduction=bounded(a.reproduction,'Reproduction',4000,12)
 secrets(JSON.stringify({title,correlation,reproduction}))
 const rows=await ctx.db.query('diagnosticCases').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-case limit reached')
 return await ctx.db.insert('diagnosticCases',{ownerKey,title,correlation,reproduction,proposedRepair:'',previewVerificationNote:'',status:'open',createdAt:Date.now()})}})
export const caseRepair=mutation({args:{id:v.id('diagnosticCases'),repair:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const repair=bounded(a.repair,'Proposed repair',4000,12)
 if(row.status!=='open')throw new ConvexError('Repair is already recorded for this case')
 await ctx.db.patch(a.id,{proposedRepair:repair,status:'repaired'});return null}})
export const caseVerify=mutation({args:{id:v.id('diagnosticCases'),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.note,'Preview verification note',2000,12)
 if(row.status!=='repaired')throw new ConvexError('Verify a preview after a repair is proposed')
 await ctx.db.patch(a.id,{previewVerificationNote:note,status:'verified'})
 await notice(ctx,row.ownerKey,'Bounded repair verified in preview',row.title,'/diagnostics');return null}})

// Ownership, Export & Exit
const ownershipExport=v.object({_id:v.id('ownershipExports'),label:v.string(),resources:v.string(),artifacts:v.array(exportEntry),attestationNote:v.string(),createdAt:v.number()})
export const exportList=query({args:{},returns:v.array(ownershipExport),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('ownershipExports').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const exportSave=mutation({args:{label:v.string(),resources:v.string(),artifacts:v.array(exportEntry),attestationNote:v.string()},returns:v.id('ownershipExports'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),label=bounded(a.label,'Export label',160),resources=bounded(a.resources,'Resource ownership',4000,12),attestation=bounded(a.attestationNote,'Secret-free attestation',2000,12)
 if(a.artifacts.length<1||a.artifacts.length>12)throw new ConvexError('Provide 1–12 export artifacts')
 const artifacts=a.artifacts.map(e=>({kind:e.kind,reference:bounded(e.reference,'Reference',500)}))
 secrets(JSON.stringify({label,resources,attestation,artifacts}))
 const rows=await ctx.db.query('ownershipExports').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-export limit reached')
 const id=await ctx.db.insert('ownershipExports',{ownerKey,label,resources,artifacts,attestationNote:attestation,createdAt:Date.now()})
 await notice(ctx,ownerKey,'Ownership export recorded',label,'/ownership');return id}})
