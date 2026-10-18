import {v,ConvexError} from 'convex/values'
import {mutation,query} from './_generated/server'
import type {MutationCtx,QueryCtx} from './_generated/server'
import type {Id} from './_generated/dataModel'
import {requireOperator} from './permissions'
import {createMissionRecord} from './recordAdmission'
import {validateMissionContract} from './missionContract'
import {bounded,secrets,digest,templateFields,requirement,compileRequirements,economics} from './studioModel'
const template=v.object({_id:v.id('studioTemplates'),...templateFields,createdAt:v.number()})
const project=v.object({_id:v.id('studioProjects'),title:v.string(),description:v.string(),missionId:v.id('missions'),createdAt:v.number()})
const spec=v.object({_id:v.id('studioSpecifications'),revision:v.number(),roles:v.array(v.string()),requirements:v.array(requirement),createdAt:v.number()})
export async function ownedProject(ctx:QueryCtx|MutationCtx,id:Id<'studioProjects'>){const owner=await requireOperator(ctx),row=await ctx.db.get(id);if(!row||row.ownerKey!==owner)throw new ConvexError('Project unavailable');return row}
export async function notice(ctx:MutationCtx,ownerKey:string,title:string,detail:string,path:string){
 const rows=await ctx.db.query('studioNotifications').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(500)
 if(rows.length>=500)throw new ConvexError('Notification history limit reached; existing records are retained')
 await ctx.db.insert('studioNotifications',{ownerKey,title,detail,path,read:false,createdAt:Date.now()})
}
export const templates=query({args:{},returns:v.array(template),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('studioTemplates').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const saveTemplate=mutation({args:templateFields,returns:v.id('studioTemplates'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),title=bounded(a.title,'Title',160),brief=bounded(a.brief,'Brief',8000),audience=bounded(a.audience,'Audience',500)
 if(!Number.isFinite(a.budget)||a.budget<0||a.budget>500||a.criteria.length<1||a.criteria.length>12)throw new ConvexError('Use budget $0–500 and 1–12 acceptance criteria')
 const criteria=a.criteria.map(s=>bounded(s,'Criterion',700));secrets(JSON.stringify({title,brief,audience,criteria}))
 const rows=await ctx.db.query('studioTemplates').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 const same=rows.find(r=>r.title===title&&r.brief===brief&&r.audience===audience&&r.budget===a.budget&&JSON.stringify(r.criteria)===JSON.stringify(criteria));if(same)return same._id
 if(rows.length>=100)throw new ConvexError('100-template limit reached')
 const id=await ctx.db.insert('studioTemplates',{title,brief,audience,criteria,budget:a.budget,ownerKey,createdAt:Date.now()})
 await notice(ctx,ownerKey,'Mission template saved',title,'/templates');return id
}})
export const startProject=mutation({args:{templateId:v.id('studioTemplates'),title:v.string()},returns:v.object({projectId:v.id('studioProjects'),missionId:v.id('missions'),reused:v.boolean()}),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),t=await ctx.db.get(a.templateId),title=bounded(a.title,'Project title',160)
 if(!t||t.ownerKey!==ownerKey)throw new ConvexError('Template unavailable')
 const rows=await ctx.db.query('studioProjects').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(20)
 const prior=rows.find(r=>r.title===title&&r.templateId===t._id);if(prior)return{projectId:prior._id,missionId:prior.missionId,reused:true}
 if(rows.length>=20)throw new ConvexError('20-project limit reached')
 const missionId=await createMissionRecord(ctx,ownerKey,{title,mission:t.brief+'\n\nTARGET AUDIENCE: '+t.audience+'\n\nACCEPTANCE CRITERIA:\n'+t.criteria.map(s=>'- '+s).join('\n'),autonomy:'Approval required',budget:t.budget})
 const projectId=await ctx.db.insert('studioProjects',{ownerKey,title,description:t.brief,missionId,templateId:t._id,createdAt:Date.now()})
 await notice(ctx,ownerKey,'Project draft created',title+' · mission remains unapproved','/specifications')
 return{projectId,missionId,reused:false}
}})
export const projects=query({args:{},returns:v.array(project),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('studioProjects').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(20)).map(r=>({_id:r._id,title:r.title,description:r.description,missionId:r.missionId,createdAt:r.createdAt}))}})
export const specifications=query({args:{projectId:v.id('studioProjects')},returns:v.array(spec),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return(await ctx.db.query('studioSpecifications').withIndex('by_project_revision',q=>q.eq('projectId',a.projectId)).order('desc').take(20)).map(({ownerKey,projectId,_creationTime,...r})=>r)}})
export const compileSpecification=mutation({args:{projectId:v.id('studioProjects'),expectedRevision:v.number(),requirements:v.array(v.object({title:v.string(),role:v.string(),route:v.string(),entity:v.string(),acceptance:v.string()}))},returns:v.id('studioSpecifications'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),requirements=compileRequirements(a.requirements);secrets(JSON.stringify(requirements))
 const latest=await ctx.db.query('studioSpecifications').withIndex('by_project_revision',q=>q.eq('projectId',a.projectId)).order('desc').first()
 if(latest&&latest.requirements.length===requirements.length&&latest.requirements.every((r,i)=>(['key','title','role','route','entity','acceptance']as const).every(k=>r[k]===requirements[i][k])))return latest._id
 if(!Number.isInteger(a.expectedRevision)||a.expectedRevision!==(latest?.revision??0))throw new ConvexError('Specification changed. Reload the latest revision before saving.')
 if((latest?.revision??0)>=20)throw new ConvexError('20-revision limit reached; original evidence is retained')
 const id=await ctx.db.insert('studioSpecifications',{ownerKey:p.ownerKey,projectId:p._id,revision:(latest?.revision??0)+1,roles:[...new Set(requirements.map(r=>r.role))],requirements,createdAt:Date.now()})
 const mission=await ctx.db.get(p.missionId),template=await ctx.db.get(p.templateId)
 if(mission&&mission.ownerKey===p.ownerKey&&mission.status==='draft'&&!mission.approved&&template){
  const body=template.brief+'\n\nTARGET AUDIENCE: '+template.audience+'\n\nACCEPTANCE CRITERIA:\n'+requirements.map(r=>'- '+r.acceptance).join('\n')+'\n\nPRODUCT SPECIFICATION v'+((latest?.revision??0)+1)+' · '+id+'\n'+requirements.map(r=>r.title+' | role: '+r.role+' | route: '+r.route+' | entity: '+r.entity+'\nAcceptance: '+r.acceptance).join('\n\n')
  const contract=validateMissionContract({...mission,mission:body})
  await ctx.db.patch(mission._id,{mission:contract.mission})
 }
 await notice(ctx,p.ownerKey,'Specification revision saved',p.title+' · revision '+((latest?.revision??0)+1),'/changes');return id
}})
const documentSummary=v.object({_id:v.id('studioDocuments'),name:v.string(),format:v.string(),sha256:v.string(),createdAt:v.number()})
export const documents=query({args:{projectId:v.id('studioProjects')},returns:v.array(documentSummary),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return(await ctx.db.query('studioDocuments').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(30)).map(r=>({_id:r._id,name:r.name,format:r.format,sha256:r.sha256,createdAt:r.createdAt}))}})
export const ingestText=mutation({args:{projectId:v.id('studioProjects'),name:v.string(),content:v.string()},returns:v.id('studioDocuments'),handler:async(ctx,a)=>{
 const p=await ownedProject(ctx,a.projectId),name=bounded(a.name,'Filename',160),format=name.split('.').pop()?.toLowerCase()
 if(!format||!['txt','md','csv'].includes(format))throw new ConvexError('Supported ingestion: UTF-8 TXT, Markdown and CSV. PDF/DOCX extraction is not available yet.')
 if(!a.content.trim()||new TextEncoder().encode(a.content).length>65536||a.content.includes('\0'))throw new ConvexError('Document must contain 1–65536 UTF-8 bytes without NUL')
 secrets(a.content);const sha256=await digest(a.content),rows=await ctx.db.query('studioDocuments').withIndex('by_project',q=>q.eq('projectId',p._id)).take(30)
 const same=rows.find(r=>r.sha256===sha256&&r.name===name);if(same)return same._id
 if(rows.length>=30)throw new ConvexError('30-document project limit reached')
 const id=await ctx.db.insert('studioDocuments',{ownerKey:p.ownerKey,projectId:p._id,name,format,content:a.content,sha256,createdAt:Date.now()});await notice(ctx,p.ownerKey,'Knowledge source retained',name+' · untrusted source text','/knowledge');return id
}})
export const document=query({args:{documentId:v.id('studioDocuments')},returns:v.object({name:v.string(),content:v.string(),sha256:v.string()}),handler:async(ctx,a)=>{const owner=await requireOperator(ctx),d=await ctx.db.get(a.documentId);if(!d||d.ownerKey!==owner)throw new ConvexError('Document unavailable');return{name:d.name,content:d.content,sha256:d.sha256}}})
export const pinPassage=mutation({args:{documentId:v.id('studioDocuments'),firstLine:v.number(),lastLine:v.number()},returns:v.id('studioPassages'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),d=await ctx.db.get(a.documentId);if(!d||d.ownerKey!==ownerKey)throw new ConvexError('Document unavailable')
 const lines=d.content.split('\n');if(!Number.isInteger(a.firstLine)||!Number.isInteger(a.lastLine)||a.firstLine<1||a.lastLine<a.firstLine||a.lastLine>lines.length||a.lastLine-a.firstLine>=100)throw new ConvexError('Select up to 100 existing source lines')
 const quote=lines.slice(a.firstLine-1,a.lastLine).join('\n');bounded(quote,'Passage',8000)
 const rows=await ctx.db.query('studioPassages').withIndex('by_document',q=>q.eq('documentId',d._id)).take(20),same=rows.find(r=>r.firstLine===a.firstLine&&r.lastLine===a.lastLine)
 if(same)return same._id;if(rows.length>=20)throw new ConvexError('20-passage document limit reached')
 return ctx.db.insert('studioPassages',{ownerKey,documentId:d._id,firstLine:a.firstLine,lastLine:a.lastLine,quote,createdAt:Date.now()})
}})
export const passages=query({args:{documentId:v.id('studioDocuments')},returns:v.array(v.object({_id:v.id('studioPassages'),firstLine:v.number(),lastLine:v.number(),quote:v.string()})),handler:async(ctx,a)=>{const owner=await requireOperator(ctx),d=await ctx.db.get(a.documentId);if(!d||d.ownerKey!==owner)throw new ConvexError('Document unavailable');return(await ctx.db.query('studioPassages').withIndex('by_document',q=>q.eq('documentId',a.documentId)).take(20)).map(r=>({_id:r._id,firstLine:r.firstLine,lastLine:r.lastLine,quote:r.quote}))}})
export const notifications=query({args:{},returns:v.array(v.object({_id:v.id('studioNotifications'),title:v.string(),detail:v.string(),path:v.string(),read:v.boolean(),createdAt:v.number()})),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('studioNotifications').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const readNotice=mutation({args:{id:v.id('studioNotifications'),read:v.boolean()},returns:v.null(),handler:async(ctx,a)=>{const owner=await requireOperator(ctx),n=await ctx.db.get(a.id);if(!n||n.ownerKey!==owner)throw new ConvexError('Notification unavailable');if(n.read!==a.read)await ctx.db.patch(n._id,{read:a.read});return null}})
const econArgs={price:v.number(),attemptCost:v.number(),successRate:v.number(),monthlyFixed:v.number(),operations:v.number(),feePercent:v.number(),feeFixed:v.number()}
export const saveEconomics=mutation({args:{projectId:v.id('studioProjects'),label:v.string(),...econArgs},returns:v.id('studioEconomics'),handler:async(ctx,a)=>{const p=await ownedProject(ctx,a.projectId),label=bounded(a.label,'Scenario label',120),{projectId,label:ignored,...input}=a,result=economics(input),rows=await ctx.db.query('studioEconomics').withIndex('by_project',q=>q.eq('projectId',p._id)).take(30),raw=JSON.stringify(input),same=rows.find(r=>r.label===label&&r.input===raw);if(same)return same._id;if(rows.length>=30)throw new ConvexError('30-scenario project limit reached');return ctx.db.insert('studioEconomics',{ownerKey:p.ownerKey,projectId:p._id,label,input:raw,result:JSON.stringify(result),createdAt:Date.now()})}})
export const economicScenarios=query({args:{projectId:v.id('studioProjects')},returns:v.array(v.object({_id:v.id('studioEconomics'),label:v.string(),input:v.string(),result:v.string(),createdAt:v.number()})),handler:async(ctx,a)=>{await ownedProject(ctx,a.projectId);return(await ctx.db.query('studioEconomics').withIndex('by_project',q=>q.eq('projectId',a.projectId)).order('desc').take(30)).map(({ownerKey,projectId,_creationTime,...r})=>r)}})
