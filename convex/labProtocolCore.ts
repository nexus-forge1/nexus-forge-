import {v,type Infer,ConvexError} from 'convex/values'
import type {MutationCtx} from './_generated/server'
import {requireOperator} from './permissions'
import {labKind} from './frontierModel'
import {text,finite,audit,policy,evidenceUrl} from './frontierSupport'
export const protocolArgs={kind:labKind,title:v.string(),hypothesis:v.string(),metric:v.string(),unit:v.string(),direction:v.union(v.literal('higher'),v.literal('lower')),target:v.number(),minimumSamples:v.number(),domains:v.array(v.string()),heldOutDomains:v.array(v.string())}
const protocolValue=v.object(protocolArgs)
export const trialArgs={protocolId:v.id('labProtocols'),caseKey:v.string(),domain:v.string(),baseline:v.number(),candidate:v.number(),evidence:v.string(),digest:v.string()}
const trialValue=v.object(trialArgs)
export async function createLabProtocol(ctx:MutationCtx,a:Infer<typeof protocolValue>){
 const ownerKey=await requireOperator(ctx),p=await policy(ctx,ownerKey);
 const rows=await ctx.db.query('labProtocols').withIndex('by_owner_kind',q=>q.eq('ownerKey',ownerKey).eq('kind',a.kind)).take(p.maxRecords);
 if(rows.length>=p.maxRecords)throw new ConvexError('Protocol quota reached');
 if(!Number.isInteger(a.minimumSamples)||a.minimumSamples<2||a.minimumSamples>100)throw new ConvexError('Sample minimum must be 2–100');
 const domains=a.domains.map(x=>text(x,'Domain',80)),heldOutDomains=a.heldOutDomains.map(x=>text(x,'Held-out domain',80));
 if(!domains.length||domains.length>12||new Set(domains).size!==domains.length||new Set(heldOutDomains).size!==heldOutDomains.length||heldOutDomains.some(x=>!domains.includes(x)))throw new ConvexError('Use 1–12 unique domains and valid held-out domains');
 if(a.kind==='generality'&&(domains.length<2||!heldOutDomains.length||heldOutDomains.length===domains.length))throw new ConvexError('Transfer evaluation requires training and held-out domains');
 const id=await ctx.db.insert('labProtocols',{...a,title:text(a.title,'Title',160),hypothesis:text(a.hypothesis,'Hypothesis'),metric:text(a.metric,'Metric',120),unit:text(a.unit,'Unit',40),target:finite(a.target),domains,heldOutDomains,ownerKey,status:'open',createdAt:Date.now()});
 await audit(ctx,ownerKey,a.kind,'protocol-preregistered',String(id));return id;
}
export async function recordLabTrial(ctx:MutationCtx,a:Infer<typeof trialValue>){
 const ownerKey=await requireOperator(ctx),p=await ctx.db.get(a.protocolId);if(!p||p.ownerKey!==ownerKey)throw new ConvexError('Protocol not found or access denied');
 const data={...a,caseKey:text(a.caseKey,'Case key',120),domain:text(a.domain,'Domain',80),baseline:finite(a.baseline),candidate:finite(a.candidate),evidence:evidenceUrl(a.evidence),digest:a.digest.toLowerCase()};
 if(!/^[0-9a-f]{64}$/.test(data.digest))throw new ConvexError('Evidence SHA-256 must contain 64 hexadecimal characters');
 if(!p.domains.includes(data.domain))throw new ConvexError('Domain was not preregistered');
 const previous=await ctx.db.query('labTrials').withIndex('by_protocol_case',q=>q.eq('protocolId',a.protocolId).eq('caseKey',data.caseKey)).unique();
 if(previous){if(['domain','baseline','candidate','evidence','digest'].some(k=>previous[k as keyof typeof previous]!==data[k as keyof typeof data]))throw new ConvexError('Case key already has different immutable evidence');return previous._id}
 if(p.status!=='open')throw new ConvexError('Protocol is closed');
 if((await ctx.db.query('labTrials').withIndex('by_protocol',q=>q.eq('protocolId',a.protocolId)).take(100)).length>=100)throw new ConvexError('Trial quota reached');
 const id=await ctx.db.insert('labTrials',{...data,createdAt:Date.now()});await audit(ctx,ownerKey,p.kind,'trial-recorded',String(id));return id;
}
