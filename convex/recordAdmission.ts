import {ConvexError} from 'convex/values'
import type {MutationCtx} from './_generated/server'
import {policy} from './frontierSupport'
import {validateMissionContract} from './missionContract'

export async function createMissionRecord(ctx:MutationCtx,ownerKey:string,input:{title:string;mission:string;autonomy:string;budget:number}){
 const contract=validateMissionContract(input),p=await policy(ctx,ownerKey),limit=p.maxMissions??100
 const existing=await ctx.db.query('missions').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(limit)
 if(existing.length>=limit)throw new ConvexError('Mission record limit reached ('+limit+'). Existing evidence is retained; review Record capacity in Security & Resilience.')
 return ctx.db.insert('missions',{...contract,ownerKey,status:'draft',completion:0,approved:false})
}
const bytes=(s:string)=>new TextEncoder().encode(s).length
export function validateManualMemory(a:{category:string;key:string;value:string;source:string;confidence:number;applicability?:string;evidenceReferences?:string[]}){
 for(const [name,value,max]of [['Category',a.category,100],['Key',a.key,240],['Source',a.source,200]]as const){
  if(!value.trim()||bytes(value)>max)throw new ConvexError(name+' requires 1–'+max+' UTF-8 bytes')
 }
 if(!a.value.trim()||bytes(a.value)>65536)throw new ConvexError('Manual memory requires 1–65536 UTF-8 bytes')
 if(!Number.isFinite(a.confidence))throw new ConvexError('Confidence must be finite')
 if(a.applicability!==undefined&&bytes(a.applicability)>4096)throw new ConvexError('Applicability exceeds 4096 UTF-8 bytes')
 if(a.evidenceReferences&&(a.evidenceReferences.length>8||a.evidenceReferences.some(s=>bytes(s)>1024)))throw new ConvexError('Use at most eight evidence references of at most 1024 UTF-8 bytes each')
}
export async function checkManualMemoryAdmission(ctx:MutationCtx,ownerKey:string){
 const p=await policy(ctx,ownerKey),limit=p.maxManualSaves??100
 const rows=await ctx.db.query('manualMemoryAdmissions').withIndex('by_owner',q=>q.eq('ownerKey',ownerKey)).take(limit)
 if(rows.length>=limit)throw new ConvexError('Manual memory admission limit reached ('+limit+'). Existing notes and generated evidence are retained; review Record capacity in Security & Resilience.')
}
