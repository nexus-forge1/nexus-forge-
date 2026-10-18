import {defineTable} from 'convex/server'
import {v,ConvexError} from 'convex/values'
export const requirement = v.object({key:v.string(),title:v.string(),role:v.string(),route:v.string(),entity:v.string(),acceptance:v.string()})
export const templateFields={title:v.string(),brief:v.string(),audience:v.string(),criteria:v.array(v.string()),budget:v.number()}
export const studioTables={
 studioTemplates:defineTable({...templateFields,ownerKey:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 studioProjects:defineTable({ownerKey:v.string(),title:v.string(),description:v.string(),missionId:v.id('missions'),templateId:v.id('studioTemplates'),createdAt:v.number()}).index('by_owner',['ownerKey']),
 studioSpecifications:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),revision:v.number(),roles:v.array(v.string()),requirements:v.array(requirement),createdAt:v.number()}).index('by_project_revision',['projectId','revision']),
 studioDocuments:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),name:v.string(),format:v.string(),content:v.string(),sha256:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
 studioPassages:defineTable({ownerKey:v.string(),documentId:v.id('studioDocuments'),firstLine:v.number(),lastLine:v.number(),quote:v.string(),createdAt:v.number()}).index('by_document',['documentId']),
 studioNotifications:defineTable({ownerKey:v.string(),title:v.string(),detail:v.string(),path:v.string(),read:v.boolean(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 studioPortals:defineTable({ownerKey:v.string(),recipientId:v.id('users'),artifactId:v.id('artifacts'),name:v.string(),content:v.string(),sha256:v.string(),expiresAt:v.number(),revoked:v.boolean(),createdAt:v.number()}).index('by_owner',['ownerKey']).index('by_recipient',['recipientId']),
 studioFeedback:defineTable({portalId:v.id('studioPortals'),authorId:v.id('users'),decision:v.union(v.literal('accept'),v.literal('revision')),message:v.string(),createdAt:v.number()}).index('by_portal',['portalId']),
 studioEconomics:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),label:v.string(),input:v.string(),result:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
}
export function bounded(value:string,label:string,max:number,min=1){const s=value.trim();if(s.length<min||new TextEncoder().encode(s).length>max||s.includes('\0'))throw new ConvexError(label+' requires '+min+'–'+max+' UTF-8 bytes');return s}
export function secrets(text:string){if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{30,}/.test(text))throw new ConvexError('Remove credential-like values before saving')}
export async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
export function compileRequirements(input:{title:string;role:string;route:string;entity:string;acceptance:string}[]){
 if(input.length<1||input.length>30)throw new ConvexError('Provide 1–30 requirements')
 const seen=new Set<string>()
 return input.map((r,i)=>{const title=bounded(r.title,'Requirement',160),role=bounded(r.role,'Role',80),route=bounded(r.route,'Route',120),entity=bounded(r.entity,'Entity',80),acceptance=bounded(r.acceptance,'Acceptance',1200)
 if(!/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(route)||route.includes('//'))throw new ConvexError('Use a local route such as /projects')
 const key=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
 if(!key||seen.has(key))throw new ConvexError('Requirement titles must have distinct identifiers')
 seen.add(key);return{key,title,role,route,entity,acceptance}})
}
export type EconomicsInput={price:number;attemptCost:number;successRate:number;monthlyFixed:number;operations:number;feePercent:number;feeFixed:number}
export function economics(a:EconomicsInput){
 for(const [key,value]of Object.entries(a))if(!Number.isFinite(value)||value<0||value>1e9)throw new ConvexError('Invalid '+key)
 if(a.successRate<=0||a.successRate>1||a.feePercent>100||!Number.isInteger(a.operations)||a.operations>10000000)throw new ConvexError('Use success rate (0,1], fees 0–100 and up to 10 million whole operations')
 // Price is per successful operation; failed attempts still consume cost.
 const successes=a.operations*a.successRate,revenue=successes*a.price,variable=a.operations*a.attemptCost+successes*(a.price*a.feePercent/100+a.feeFixed),contribution=a.price-a.attemptCost/a.successRate-a.price*a.feePercent/100-a.feeFixed
 return{successes,revenue,variable,totalCost:variable+a.monthlyFixed,profit:revenue-variable-a.monthlyFixed,contributionPerSuccess:contribution,breakEvenSuccesses:contribution>0?Math.ceil(a.monthlyFixed/contribution):null,marginPercent:revenue>0?(revenue-variable-a.monthlyFixed)/revenue*100:null}
}
