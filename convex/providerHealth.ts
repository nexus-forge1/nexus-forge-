import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireOperator } from "./permissions";
import { getAuthUserId } from "@convex-dev/auth/server";
import { getProviderRoutingPlan, callOllamaModel } from "./aiProvider";
import { OLLAMA_MODELS } from "./ollamaModels";
import { aiAllowanceEnforced } from "./aiAllowance";
export const providerHealthConfigs = OLLAMA_MODELS;
const providerResult = v.object({
  name: v.string(),
  label: v.string(),
  configured: v.boolean(),
  status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("offline"), v.literal("unconfigured")),
  latencyMs: v.number(),
  detail: v.string(),
});

export const recordBatch = internalMutation({
  args: { checkedAt: v.number(), operatorId: v.string(), results: v.array(providerResult) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const result of args.results) {
      await ctx.db.insert("providerHealthChecks", { ...result, checkedAt: args.checkedAt, operatorId: args.operatorId });
    }
    return null;
  },
});

export const history = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("providerHealthChecks"),
    _creationTime: v.number(),
    name: v.string(), label: v.string(), configured: v.boolean(),
    status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("offline"), v.literal("unconfigured")),
    latencyMs: v.number(), detail: v.string(), checkedAt: v.number(), operatorId: v.string(),
  })),
  handler: async (ctx) => {
    // Client queries can mount before the auth provider finishes restoring the session.
    // Return no private rows during that brief state rather than producing repeated
    // unauthenticated-query errors. The health-check action itself still requires auth.
    const operatorId = await getAuthUserId(ctx);
    if (!operatorId) return [];
    return await ctx.db.query("providerHealthChecks").withIndex("by_operator_checkedAt", q => q.eq("operatorId", operatorId)).order("desc").take(60);
  },
});

export const routingPlan = query({
  args: {},
  returns: v.object({ roles: v.array(v.object({ role: v.string(), primary: v.string(), model: v.string(), failoverOrder: v.array(v.string()) })), fallbackOrder: v.array(v.string()) }),
  handler: async () => getProviderRoutingPlan(),
});


export const connection = query({
 args: {}, returns: v.object({ configured: v.boolean(), allowanceEnforced: v.boolean() }),
 handler: async () => ({ configured: Boolean(process.env.OLLAMA_API_KEY?.trim()), allowanceEnforced: aiAllowanceEnforced() }),
});
export const check = action({
 args: {}, returns: v.array(providerResult),
 handler: async ctx => {
  const operatorId = await requireOperator(ctx);
  await ctx.runMutation((internal as any).billingDiagnostics.authorize, { ownerKey: operatorId });
  const results: Array<{name:string;label:string;configured:boolean;status:'healthy'|'degraded'|'offline'|'unconfigured';latencyMs:number;detail:string}> = [];
  let accountRejected = false;
  for (const provider of OLLAMA_MODELS) {
   const label = 'Ollama Cloud · ' + provider.label + ' (' + provider.model + ')';
   if (!process.env.OLLAMA_API_KEY?.trim()) {
    results.push({name:provider.name,label,configured:false,status:'unconfigured',latencyMs:0,detail:'Set OLLAMA_API_KEY in the server environment.'}); continue;
   }
   if (accountRejected) {
    results.push({name:provider.name,label,configured:true,status:'degraded',latencyMs:0,detail:'Not tested: account authentication or quota failed earlier in this batch.'}); continue;
   }
   const started = Date.now();
   let invocationId, observedReports = 0;
   try {
    invocationId = await ctx.runMutation(internal.providerUsage.begin, {ownerKey:operatorId,stage:'ollama-health-'+provider.name,role:'research'});
    await callOllamaModel(provider.name, 'Reply with the single word OK.', 512, async usage => {
     observedReports++;
     await ctx.runMutation(internal.manifestIntelligence.recordProviderUsageInternal, {ownerKey:operatorId,...usage,invocationId:invocationId!,reportOrdinal:observedReports});
    });
    await ctx.runMutation(internal.providerUsage.finish,{invocationId,outcome:'succeeded',observedReports});
    results.push({name:provider.name,label,configured:true,status:'healthy',latencyMs:Date.now()-started,detail:'Authenticated Ollama Cloud inference succeeded.'});
   } catch(error) {
    if(invocationId)try{await ctx.runMutation(internal.providerUsage.finish,{invocationId,outcome:'failed',observedReports})}catch{/* Retain pending receipt for review. */}
    const status = (error as {status?:number})?.status;
    accountRejected = status === 401 || status === 403 || status === 429;
    results.push({name:provider.name,label,configured:true,status:'degraded',latencyMs:Date.now()-started,detail:status ? 'Ollama rejected inference (HTTP '+status+').' : 'Inference or accounting could not be confirmed; inspect the invocation before repeating.'});
   }
  }
  await ctx.runMutation((internal as any).providerHealth.recordBatch,{checkedAt:Date.now(),operatorId,results});
  return results;
 },
});
