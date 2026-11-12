import {v,ConvexError} from 'convex/values'
import {mutation,query} from './_generated/server'
import {requireOperator} from './permissions'
import {notice} from './studio'
import {bounded,secrets} from './studioModel'

// Demand Validation Workspace
const hypothesis=v.object({_id:v.id('demandHypotheses'),segment:v.string(),hypothesis:v.string(),evidence:v.array(v.string()),status:v.union(v.literal('proposed'),v.literal('validated'),v.literal('rejected')),decision:v.union(v.literal('pending'),v.literal('go'),v.literal('no-go')),decisionNote:v.string(),createdAt:v.number()})
export const demandList=query({args:{},returns:v.array(hypothesis),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('demandHypotheses').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const demandSave=mutation({args:{segment:v.string(),hypothesis:v.string(),evidence:v.array(v.string())},returns:v.id('demandHypotheses'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),segment=bounded(a.segment,'Segment',300),hypothesis=bounded(a.hypothesis,'Hypothesis',2000),evidence=a.evidence.map(s=>bounded(s,'Evidence',700))
 if(evidence.length>12)throw new ConvexError('Provide up to 12 evidence references');secrets(JSON.stringify({segment,hypothesis,evidence}))
 const rows=await ctx.db.query('demandHypotheses').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-hypothesis limit reached')
 const id=await ctx.db.insert('demandHypotheses',{ownerKey,segment,hypothesis,evidence,status:'proposed',decision:'pending',decisionNote:'',createdAt:Date.now()})
 await notice(ctx,ownerKey,'Demand hypothesis saved',segment,'/demand');return id}})
export const demandDecide=mutation({args:{id:v.id('demandHypotheses'),status:v.union(v.literal('validated'),v.literal('rejected')),decision:v.union(v.literal('go'),v.literal('no-go')),decisionNote:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.decisionNote,'Decision note',2000,12)
 if(row.status!=='proposed')throw new ConvexError('This hypothesis already has a recorded decision')
 if(a.decision==='go'&&row.evidence.length<1)throw new ConvexError('A go decision requires at least one evidence reference')
 await ctx.db.patch(a.id,{status:a.status,decision:a.decision,decisionNote:note})
 await notice(ctx,row.ownerKey,'Demand decision recorded',row.segment+' · '+a.decision,'/demand');return null}})

// Monetization Studio
const quote=v.object({_id:v.id('monetizationQuotes'),label:v.string(),scope:v.string(),priceUsd:v.number(),entitlement:v.string(),status:v.union(v.literal('draft'),v.literal('quoted'),v.literal('accepted'),v.literal('held'),v.literal('settled'),v.literal('refunded')),holdReason:v.string(),settlement:v.union(v.literal('unsettled'),v.literal('settled'),v.literal('refunded')),settlementNote:v.string(),createdAt:v.number()})
export const quoteList=query({args:{},returns:v.array(quote),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('monetizationQuotes').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const quoteSave=mutation({args:{label:v.string(),scope:v.string(),priceUsd:v.number(),entitlement:v.string()},returns:v.id('monetizationQuotes'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),label=bounded(a.label,'Label',160),scope=bounded(a.scope,'Scope',2000),entitlement=bounded(a.entitlement,'Entitlement',500)
 if(!Number.isFinite(a.priceUsd)||a.priceUsd<0||a.priceUsd>100000)throw new ConvexError('Use price $0–100,000');secrets(JSON.stringify({label,scope,entitlement}))
 const rows=await ctx.db.query('monetizationQuotes').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-quote limit reached')
 return await ctx.db.insert('monetizationQuotes',{ownerKey,label,scope,priceUsd:a.priceUsd,entitlement,status:'draft',holdReason:'',settlement:'unsettled',settlementNote:'',createdAt:Date.now()})}})
export const quoteAdvance=mutation({args:{id:v.id('monetizationQuotes'),action:v.union(v.literal('quote'),v.literal('accept'),v.literal('hold'),v.literal('settle'),v.literal('refund')),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 if(a.action==='hold'){const note=bounded(a.note,'Hold reason',1000,12);await ctx.db.patch(a.id,{status:'held',holdReason:note});return null}
 if(a.action==='quote'){if(row.status!=='draft')throw new ConvexError('Only a draft quote can be sent');await ctx.db.patch(a.id,{status:'quoted'});return null}
 if(a.action==='accept'){if(row.status!=='quoted')throw new ConvexError('Only a sent quote can be accepted');await ctx.db.patch(a.id,{status:'accepted'});return null}
 if(!['accepted','settled'].includes(row.status))throw new ConvexError('Settlement requires an accepted quote')
 const note=bounded(a.note,'Settlement note',1000,12)
 await ctx.db.patch(a.id,{status:a.action==='settle'?'settled':'refunded',settlement:a.action==='settle'?'settled':'refunded',settlementNote:note})
 await notice(ctx,row.ownerKey,a.action==='settle'?'Quote settlement recorded':'Quote refund recorded',row.label,'/monetization');return null}})

// Customer Operations Builder
const customer=v.object({_id:v.id('customerRecords'),name:v.string(),stage:v.union(v.literal('onboarding'),v.literal('active'),v.literal('support'),v.literal('cancelled')),issues:v.array(v.object({note:v.string(),createdAt:v.number(),resolved:v.boolean()})),createdAt:v.number()})
export const customerList=query({args:{},returns:v.array(customer),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('customerRecords').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const customerSave=mutation({args:{name:v.string(),stage:v.union(v.literal('onboarding'),v.literal('active'),v.literal('support'),v.literal('cancelled'))},returns:v.id('customerRecords'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),name=bounded(a.name,'Customer name',160);secrets(name)
 const rows=await ctx.db.query('customerRecords').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-customer limit reached')
 return await ctx.db.insert('customerRecords',{ownerKey,name,stage:a.stage,issues:[],createdAt:Date.now()})}})
export const customerStage=mutation({args:{id:v.id('customerRecords'),stage:v.union(v.literal('onboarding'),v.literal('active'),v.literal('support'),v.literal('cancelled'))},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 await ctx.db.patch(a.id,{stage:a.stage});return null}})
export const customerIssue=mutation({args:{id:v.id('customerRecords'),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 const note=bounded(a.note,'Issue note',1000,12);secrets(note)
 if(row.issues.length>=50)throw new ConvexError('50-issue limit reached for this customer')
 await ctx.db.patch(a.id,{issues:[...row.issues,{note,createdAt:Date.now(),resolved:false}]});return null}})
export const customerResolve=mutation({args:{id:v.id('customerRecords'),issueIndex:v.number()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 if(!Number.isInteger(a.issueIndex)||a.issueIndex<0||a.issueIndex>=row.issues.length)throw new ConvexError('Unknown issue')
 await ctx.db.patch(a.id,{issues:row.issues.map((issue,i)=>i===a.issueIndex?{...issue,resolved:true}:issue)});return null}})

// Governed Launch & Growth Studio
const campaign=v.object({_id:v.id('growthCampaigns'),audience:v.string(),offer:v.string(),channels:v.array(v.string()),status:v.union(v.literal('draft'),v.literal('review'),v.literal('published'),v.literal('measured')),reviewNote:v.string(),measurement:v.string(),createdAt:v.number()})
export const campaignList=query({args:{},returns:v.array(campaign),handler:async ctx=>{const owner=await requireOperator(ctx);return(await ctx.db.query('growthCampaigns').withIndex('by_owner',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const campaignSave=mutation({args:{audience:v.string(),offer:v.string(),channels:v.array(v.string())},returns:v.id('growthCampaigns'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),audience=bounded(a.audience,'Audience',500),offer=bounded(a.offer,'Offer',1000),channels=a.channels.map(s=>bounded(s,'Channel',80))
 if(channels.length<1||channels.length>6)throw new ConvexError('Provide 1–6 channels');secrets(JSON.stringify({audience,offer,channels}))
 const rows=await ctx.db.query('growthCampaigns').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(100)
 if(rows.length>=100)throw new ConvexError('100-campaign limit reached')
 return await ctx.db.insert('growthCampaigns',{ownerKey,audience,offer,channels,status:'draft',reviewNote:'',measurement:'',createdAt:Date.now()})}})
export const campaignAdvance=mutation({args:{id:v.id('growthCampaigns'),action:v.union(v.literal('review'),v.literal('publish'),v.literal('measure')),note:v.string()},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 if(a.action==='review'){if(row.status!=='draft')throw new ConvexError('Only a draft campaign can request review');await ctx.db.patch(a.id,{status:'review'});return null}
 if(a.action==='publish'){if(row.status!=='review')throw new ConvexError('Publishing requires a reviewed campaign')
  const note=bounded(a.note,'Review note',2000,12);await ctx.db.patch(a.id,{status:'published',reviewNote:note})
  await notice(ctx,row.ownerKey,'Campaign published after review',row.audience,'/growth');return null}
 if(row.status!=='published')throw new ConvexError('Measurement requires a published campaign')
 const note=bounded(a.note,'Measurement',2000,12);await ctx.db.patch(a.id,{status:'measured',measurement:note});return null}})

// Business Readiness Dossier
const section=v.object({_id:v.id('readinessSections'),product:v.string(),section:v.union(v.literal('payments'),v.literal('operations'),v.literal('economics'),v.literal('privacy'),v.literal('ownership')),evidence:v.string(),status:v.union(v.literal('open'),v.literal('evidence-linked')),createdAt:v.number(),updatedAt:v.number()})
export const dossierList=query({args:{},returns:v.array(section),handler:async ctx=>{
 const owner=await requireOperator(ctx)
 return(await ctx.db.query('readinessSections').withIndex('by_owner_product',q=>q.eq('ownerKey',owner)).order('desc').take(100)).map(({ownerKey,_creationTime,...r})=>r)}})
export const dossierLink=mutation({args:{product:v.string(),section:v.union(v.literal('payments'),v.literal('operations'),v.literal('economics'),v.literal('privacy'),v.literal('ownership')),evidence:v.string()},returns:v.id('readinessSections'),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),product=bounded(a.product,'Product',160),evidence=bounded(a.evidence,'Evidence',1000,12);secrets(product+' '+evidence)
 const rows=await ctx.db.query('readinessSections').withIndex('by_owner_product',q=>q.eq('ownerKey',ownerKey)).take(100)
 const products=new Set(rows.map(r=>r.product))
 const existing=rows.find(r=>r.product===product&&r.section===a.section)
 if(existing){await ctx.db.patch(existing._id,{evidence,status:'evidence-linked',updatedAt:Date.now()});return existing._id}
 if(products.size>=10)throw new ConvexError('10-product dossier limit reached')
 return await ctx.db.insert('readinessSections',{ownerKey,product,section:a.section,evidence,status:'evidence-linked',createdAt:Date.now(),updatedAt:Date.now()})}})
export const dossierReopen=mutation({args:{id:v.id('readinessSections')},returns:v.null(),handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),row=await ctx.db.get(a.id)
 if(!row||row.ownerKey!==owner)throw new ConvexError('Record unavailable')
 await ctx.db.patch(a.id,{status:'open',updatedAt:Date.now()});return null}})
