import { v, ConvexError } from 'convex/values'
import {protocolArgs,trialArgs,createLabProtocol,recordLabTrial} from './labProtocolCore'
import { query, mutation } from './_generated/server'
import { requireOperator } from './permissions'
import { labKind } from './frontierModel'
import { text, finite, audit, policy, evidenceUrl, summarize } from './frontierSupport'
export const list = query({args:{kind:labKind},handler:async(ctx,{kind})=>{const ownerKey=await requireOperator(ctx);return ctx.db.query('labProtocols').withIndex('by_owner_kind',q=>q.eq('ownerKey',ownerKey).eq('kind',kind)).order('desc').take(100)}})
export const create = mutation({args:protocolArgs,handler:createLabProtocol})
export const detail = query({args:{protocolId:v.id('labProtocols')},handler:async(ctx,{protocolId})=>{
 const ownerKey=await requireOperator(ctx),record=await ctx.db.get(protocolId);if(!record||record.ownerKey!==ownerKey)throw new ConvexError('Protocol not found or access denied');
 const trials=await ctx.db.query('labTrials').withIndex('by_protocol',q=>q.eq('protocolId',protocolId)).take(100);
 return{record,trials,summary:summarize(trials,record.direction,record.target,record.minimumSamples,record.domains,record.heldOutDomains)};
}})
export const addTrial = mutation({args:trialArgs,handler:async(ctx,a)=>{
 const owner=await requireOperator(ctx),p=await ctx.db.get(a.protocolId)
 if(!p||p.ownerKey!==owner)throw new ConvexError('Protocol not found or access denied')
 if(await ctx.db.query('experimentContracts').withIndex('by_protocol',q=>q.eq('protocolId',a.protocolId)).first())throw new ConvexError('Use Experiment Designer to record contract-bound observations')
 return recordLabTrial(ctx,a)
}})
export const close = mutation({args:{protocolId:v.id('labProtocols')},handler:async(ctx,{protocolId})=>{const ownerKey=await requireOperator(ctx),p=await ctx.db.get(protocolId);if(!p||p.ownerKey!==ownerKey)throw new ConvexError('Protocol not found or access denied');if(await ctx.db.query('experimentContracts').withIndex('by_protocol',q=>q.eq('protocolId',protocolId)).first())throw new ConvexError('Use Experiment Designer for the contract final review');if(p.status==='closed')return;
 const trials=await ctx.db.query('labTrials').withIndex('by_protocol',q=>q.eq('protocolId',protocolId)).take(100);if(!summarize(trials,p.direction,p.target,p.minimumSamples,p.domains,p.heldOutDomains).ready)throw new ConvexError('Collect the minimum samples in total and cover every preregistered domain before closing');
 await ctx.db.patch(protocolId,{status:'closed'});await audit(ctx,ownerKey,p.kind,'protocol-closed',String(protocolId));
}})
