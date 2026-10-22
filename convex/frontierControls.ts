import { v, ConvexError } from 'convex/values'
import { query, mutation } from './_generated/server'
import { requireOperator } from './permissions'
import { text, audit, policy } from './frontierSupport'
export const overview = query({args:{},handler:async(ctx)=>{const ownerKey=await requireOperator(ctx);return{policy:await policy(ctx,ownerKey),audit:await ctx.db.query('frontierAudits').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).order('desc').take(50),packages:await ctx.db.query('extensionPackages').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).order('desc').take(100)}}})
export const setPolicy = mutation({args:{maxRecords:v.number(),maxMediaBytes:v.number(),maxMissions:v.optional(v.number()),maxManualSaves:v.optional(v.number())},returns:v.null(),handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx)
 const valid=(n:number)=>Number.isInteger(n)&&n>=1&&n<=100
 if(!valid(a.maxRecords)||(a.maxMissions!==undefined&&!valid(a.maxMissions))||(a.maxManualSaves!==undefined&&!valid(a.maxManualSaves))||!Number.isInteger(a.maxMediaBytes)||a.maxMediaBytes<1024||a.maxMediaBytes>8*1024*1024)throw new ConvexError('Limits: 1–100 records, 1 KiB–8 MiB per media item')
 const next={maxRecords:a.maxRecords,maxMediaBytes:a.maxMediaBytes,...(a.maxMissions!==undefined?{maxMissions:a.maxMissions}:{}),...(a.maxManualSaves!==undefined?{maxManualSaves:a.maxManualSaves}:{})}
 const p=await ctx.db.query('resiliencePolicies').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).unique()
 if(p&&Object.entries(next).every(([key,value])=>p[key as keyof typeof p]===value))return null
 if(p)await ctx.db.patch(p._id,{...next,updatedAt:Date.now()});else await ctx.db.insert('resiliencePolicies',{...next,ownerKey,updatedAt:Date.now()})
 await audit(ctx,ownerKey,'resilience','policy-updated',JSON.stringify(next))
 return null
}})
export const registerPackage = mutation({args:{name:v.string(),version:v.string(),description:v.string(),inputFields:v.array(v.string()),outputFields:v.array(v.string())},handler:async(ctx,a)=>{
 const ownerKey=await requireOperator(ctx),p=await policy(ctx,ownerKey);if(!/^[a-z][a-z0-9-]{2,59}$/.test(a.name)||!/^\d+\.\d+\.\d+$/.test(a.version))throw new ConvexError('Use a lowercase package name and numeric semantic version');
 const fields=(xs:string[])=>{if(!xs.length||xs.length>20||new Set(xs).size!==xs.length||xs.some(x=>!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(x)||['__proto__','prototype','constructor'].includes(x)))throw new ConvexError('Declare 1–20 unique safe field names');return xs};
 const data={...a,description:text(a.description,'Description'),inputFields:fields(a.inputFields),outputFields:fields(a.outputFields)};
 const old=await ctx.db.query('extensionPackages').withIndex('by_owner_name_version',q=>q.eq('ownerKey',ownerKey).eq('name',a.name).eq('version',a.version)).unique();if(old){if(JSON.stringify([old.description,old.inputFields,old.outputFields])!==JSON.stringify([data.description,data.inputFields,data.outputFields]))throw new ConvexError('Version already has a different immutable contract');return old._id}
 if((await ctx.db.query('extensionPackages').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(p.maxRecords)).length>=p.maxRecords)throw new ConvexError('Package quota reached');
 const id=await ctx.db.insert('extensionPackages',{...data,ownerKey,status:'draft',createdAt:Date.now()});await audit(ctx,ownerKey,'developers','package-registered',String(id));return id;
}})
export const validatePackage = mutation({args:{packageId:v.id('extensionPackages'),input:v.string(),output:v.string()},handler:async(ctx,a)=>{const ownerKey=await requireOperator(ctx),p=await ctx.db.get(a.packageId);if(!p||p.ownerKey!==ownerKey)throw new ConvexError('Package not found or access denied');if(p.status==='retired')throw new ConvexError('Package is retired');
 function check(raw:string,fields:string[]){if(raw.length>16000)throw new ConvexError('Example exceeds 16,000 characters');let value:unknown;try{value=JSON.parse(raw)}catch{throw new ConvexError('Example must be JSON')}if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k)))throw new ConvexError('Example must match declared fields exactly');}
 check(a.input,p.inputFields);check(a.output,p.outputFields);if(p.status==='validated')return{valid:true,execution:'No external agent or tool executed; this validates the declared JSON field contract only'};await ctx.db.patch(p._id,{status:'validated'});await audit(ctx,ownerKey,'developers','contract-validated',String(p._id));return{valid:true,execution:'No external agent or tool executed; this validates the declared JSON field contract only'};
}})
export const retirePackage = mutation({args:{packageId:v.id('extensionPackages')},handler:async(ctx,{packageId})=>{const ownerKey=await requireOperator(ctx),p=await ctx.db.get(packageId);if(!p||p.ownerKey!==ownerKey)throw new ConvexError('Package not found or access denied');if(p.status==='retired')return;await ctx.db.patch(packageId,{status:'retired'});await audit(ctx,ownerKey,'developers','package-retired',String(packageId))}})
