import {boundEvidence,evidenceWindow,requireEvidenceRoom,evidencePage} from './evidenceAdmission'
import { trafficFields, trafficSnapshot, trafficSite } from "./siteTrafficModel"
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { productOutcomeFields, productOutcomeInput, productImportReceipt, evaluateProductOutcome } from "./productOutcomeModel"
import { v, ConvexError } from "convex/values"
import type {MutationCtx} from "./_generated/server"
import type {Id} from "./_generated/dataModel"
import { internalMutation, mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { requireOperator, requireOwnedMission } from "./permissions"
import { evaluateDeliveryEvidence } from "./deliveryEvidence"

const verification = v.object({_id:v.id("verifications"),_creationTime:v.number(),missionId:v.id("missions"),deliveryId:v.id("deliveries"),passed:v.boolean(),score:v.number(),criteria:v.array(v.string()),evidence:v.array(v.string()),summary:v.string(),createdAt:v.number()})
const measurement = v.object({_id:v.id("measurements"),_creationTime:v.number(),missionId:v.id("missions"),verificationId:v.optional(v.id("verifications")),metric:v.string(),actual:v.number(),target:v.number(),unit:v.string(),status:v.union(v.literal("pass"),v.literal("fail"),v.literal("partial")),evidence:v.array(v.string()),createdAt:v.number()})
export const list = query({ args:{missionId:v.id("missions")}, returns:v.array(verification), handler:async(ctx,args)=>{await requireOwnedMission(ctx,args.missionId);return ctx.db.query("verifications").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).order("desc").take(20)} })
export const record = mutation({ args:{deliveryId:v.id("deliveries"),passed:v.boolean(),score:v.number(),criteria:v.array(v.string()),evidence:v.array(v.string()),summary:v.string()}, returns:v.id("verifications"), handler:async(ctx,args)=>{await requireOperator(ctx);const d=await ctx.db.get("deliveries",args.deliveryId);if(!d)throw new Error("Delivery request not found");await requireOwnedMission(ctx,d.missionId);boundEvidence(args,'Verification',16384);if(!Number.isFinite(args.score)||args.score<0||args.score>1||args.criteria.length>20||args.evidence.length>20)throw new ConvexError('Use a finite score from zero to one and at most twenty criteria/evidence items');const rows=await evidenceWindow(ctx.db.query("verifications").withIndex("by_mission",q=>q.eq("missionId",d.missionId)),'Operator verification');const old=rows.find(r=>r.deliveryId===args.deliveryId&&r.passed===args.passed&&r.score===args.score&&JSON.stringify(r.criteria)===JSON.stringify(args.criteria)&&JSON.stringify(r.evidence)===JSON.stringify(args.evidence)&&r.summary===args.summary.trim());if(old)return old._id;requireEvidenceRoom(rows,'Operator verification');return await recordOutcomeInternal(ctx,args.deliveryId,args.passed,args.score,args.criteria,args.evidence,args.summary,false) } })

export const measurements = query({ args:{missionId:v.id("missions")}, returns:v.array(measurement), handler:async(ctx,args)=>{await requireOwnedMission(ctx,args.missionId);return await ctx.db.query("measurements").withIndex("by_mission",q=>q.eq("missionId",args.missionId)).order("desc").take(20)} })

export const recordRuntimeCost = mutation({ args: { missionId: v.id("missions"), actualCost: v.number(), evidence: v.string(), verificationId: v.optional(v.id("verifications")) }, returns: v.id("measurements"), handler: async (ctx, args) => { await requireOperator(ctx); await requireOwnedMission(ctx, args.missionId); if (!Number.isFinite(args.actualCost) || args.actualCost < 0 || args.actualCost > 1000000) throw new Error("Actual runtime cost must be finite and between $0 and $1,000,000."); boundEvidence(args.evidence,'Runtime cost source',8000);const evidence = args.evidence.trim().slice(0, 2000); if (evidence.length < 3) throw new Error("Provide a measurement source or evidence reference."); const mission = await ctx.db.get(args.missionId); if (!mission) throw new Error("Mission not found."); if (args.verificationId) { const verification = await ctx.db.get(args.verificationId); if (!verification || verification.missionId !== args.missionId) throw new Error("Verification does not belong to this mission."); } const status = mission.budget <= 0 ? "partial" as const : args.actualCost <= mission.budget ? "pass" as const : "fail" as const; const rows=await evidenceWindow(ctx.db.query("measurements").withIndex("by_mission",q=>q.eq("missionId",args.missionId)),'Runtime cost');const old=rows.find(r=>r.metric==="actual runtime cost"&&r.actual===args.actualCost&&r.verificationId===args.verificationId&&r.evidence.includes("Source: "+evidence));if(old)return old._id;requireEvidenceRoom(rows,'Runtime cost');return await ctx.db.insert("measurements", { missionId: args.missionId, verificationId: args.verificationId, metric: "actual runtime cost", actual: args.actualCost, target: mission.budget, unit: "USD", status, evidence: [`Operator-recorded actual spend: $${args.actualCost.toFixed(4)}`, `Source: ${evidence}`, mission.budget > 0 ? `Mission budget: $${mission.budget.toFixed(2)}` : "Budget comparison unavailable: mission budget is zero or unset."], createdAt: Date.now() }); } });

export const recordMeasuredOutcome = mutation({ args:{deliveryId:v.id("deliveries")}, returns:v.object({verificationId:v.id("verifications"),passed:v.boolean(),score:v.number(),measurementId:v.id("measurements")}), handler:async(ctx,args)=>{await requireOperator(ctx);const d=await ctx.db.get("deliveries",args.deliveryId);if(!d)throw new Error("Delivery request not found");await requireOwnedMission(ctx,d.missionId);if(!d.approved)throw new Error("Human delivery approval is required before verification");if(d.stage!=="verified")throw new Error("Delivery must reach verified stage before recording an outcome");const {evidence,checks,passedCount,score,passed}=evaluateDeliveryEvidence(d);
const snapshot=JSON.stringify({evidence,checks,passedCount,score,passed});
if(new TextEncoder().encode(snapshot).byteLength>16384)throw new ConvexError('Delivery evidence exceeds the measured-outcome safety limit; review retained evidence.');
const previous=await ctx.db.query('deliveryOutcomeReceipts').withIndex('by_delivery',q=>q.eq('deliveryId',d._id)).unique();
if(previous){
 if(previous.missionId!==d.missionId||previous.snapshot!==snapshot)throw new ConvexError('Measured delivery evidence changed; review the immutable outcome before creating a new delivery.');
 const verification=await ctx.db.get(previous.verificationId),measurement=await ctx.db.get(previous.measurementId);
 if(!verification||!measurement||verification.deliveryId!==d._id||verification.missionId!==d.missionId||measurement.missionId!==d.missionId||measurement.verificationId!==verification._id)throw new ConvexError('Measured outcome receipt is incomplete; review retained history before another attempt.');
 return{verificationId:previous.verificationId,measurementId:previous.measurementId,passed:previous.passed,score:previous.score};
}
const verificationId=await recordOutcomeInternal(ctx,args.deliveryId,passed,score,checks,evidence,`Mission outcome measured across artifact, workflow, deployment, and smoke evidence: ${passedCount}/4 domains passed.`,true);const measurementId=await ctx.db.insert("measurements",{missionId:d.missionId,verificationId,metric:"governed delivery readiness",actual:score,target:1,unit:"ratio",status:passed?"pass":passedCount>0?"partial":"fail",evidence:checks,createdAt:Date.now()});const mission=await ctx.db.get("missions",d.missionId);if(mission)await ctx.runMutation(internal.memory.captureVerificationLesson,{ownerKey:mission.ownerKey,missionId:mission._id,score,passed,metric:"governed delivery readiness",criteria:checks});
await ctx.db.insert('deliveryOutcomeReceipts',{deliveryId:d._id,missionId:d.missionId,snapshot,verificationId,measurementId,passed,score,createdAt:Date.now()});
return {verificationId,passed,score,measurementId}} })

async function recordOutcomeInternal(ctx:MutationCtx,deliveryId:Id<"deliveries">,passed:boolean,rawScore:number,criteria:string[],evidence:string[],summary:string,completeMission:boolean):Promise<Id<"verifications">>{const d=await ctx.db.get("deliveries",deliveryId);if(!d)throw new Error("Delivery request not found");if(!d.approved)throw new Error("Human delivery approval is required before verification");if(d.stage!=="verified")throw new Error("Delivery must reach verified stage before recording an outcome");const score=Math.max(0,Math.min(1,rawScore));const verificationId=await ctx.db.insert("verifications",{missionId:d.missionId,deliveryId,passed,score,criteria,evidence,summary:summary.trim(),createdAt:Date.now()});await ctx.db.insert("auditEvents",{missionId:d.missionId,eventType:passed?"verification_passed":"verification_failed",source:completeMission?"delivery-evidence-measurement":"operator-assertion",message:passed?`Outcome recorded at ${Math.round(score*100)}%.`:`Outcome verification scored ${Math.round(score*100)}%.`,deliveryId:d._id,verificationId,metadata:JSON.stringify({criteria,evidence,summary:summary.trim()}),createdAt:Date.now()});const mission=await ctx.db.get("missions",d.missionId);if(mission){await ctx.db.insert("memories",{ownerKey:mission.ownerKey,missionId:mission._id,category:"verification-outcome",key:`delivery:${deliveryId}`,value:JSON.stringify({passed,score,criteria,evidence,summary:summary.trim()}),confidence:score,source:"production-verification"});if(completeMission&&passed)await ctx.db.patch(mission._id,{status:"complete",completion:1})}return verificationId}


export const recordProductOutcome = mutation({
  args: productOutcomeInput, returns: v.id("productOutcomes"),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await requireOwnedMission(ctx, args.missionId)
    const recordedAt = Date.now()
    const result = evaluateProductOutcome(args, recordedAt)
    boundEvidence(args,'Product outcome',32768)
    const rows=await evidenceWindow(ctx.db.query("productOutcomes").withIndex("by_mission",q=>q.eq("missionId",args.missionId)),'Product outcome')
    const old=rows.find(r=>r.provenance==="operator-recorded"&&Object.entries({...args,...result}).every(([k,v])=>JSON.stringify((r as any)[k])===JSON.stringify(v)))
    if(old)return old._id
    requireEvidenceRoom(rows,'Product outcome')
    return ctx.db.insert("productOutcomes", { ...args, ...result, ownerKey, recordedAt, provenance: "operator-recorded" })
  },
})

export const productOutcomes = query({
 args:{missionId:v.optional(v.id("missions")),paginationOpts:paginationOptsValidator},
 returns:paginationResultValidator(v.object({_id:v.id("productOutcomes"),_creationTime:v.number(),...productOutcomeFields,provenance:v.union(v.literal("operator-recorded"),v.literal("github-report"))})),
 handler:async(ctx,args)=>{
 const ownerKey=await requireOperator(ctx);if(args.missionId)await requireOwnedMission(ctx,args.missionId);
 const base=args.missionId?ctx.db.query("productOutcomes").withIndex("by_mission",q=>q.eq("missionId",args.missionId!)):ctx.db.query("productOutcomes").withIndex("by_owner",q=>q.eq("ownerKey",ownerKey));
 const result=await base.filter(q=>q.neq(q.field("provenance"),"product-events")).order("desc").paginate(evidencePage(args.paginationOpts));
 return{...result,page:result.page.map(row=>({...row,provenance:row.provenance==="github-report"?"github-report" as const:"operator-recorded" as const}))}
 }
})

export const productOutcomesV2 = query({
  args: { missionId: v.optional(v.id("missions")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ _id: v.id("productOutcomes"), _creationTime: v.number(), ...productOutcomeFields })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    if (args.missionId) {
      await requireOwnedMission(ctx, args.missionId)
      return ctx.db.query("productOutcomes").withIndex("by_mission", q => q.eq("missionId", args.missionId!)).order("desc").paginate(evidencePage(args.paginationOpts))
    }
    return ctx.db.query("productOutcomes").withIndex("by_owner", q => q.eq("ownerKey", ownerKey)).order("desc").paginate(evidencePage(args.paginationOpts))
  },
})


export const importProductOutcomeInternal = internalMutation({
  args: { ...productOutcomeInput, receipt: productImportReceipt }, returns: v.id("productOutcomes"),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await requireOwnedMission(ctx, args.missionId)
    return storeImportedProductOutcome(ctx,args,ownerKey)
  },
})


export const saveTrafficInternal = internalMutation({
  args: { missionId: v.id("missions"), ...trafficSnapshot }, returns: v.id("siteTrafficReceipts"),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await requireOwnedMission(ctx, args.missionId)
    if (args.siteId !== trafficSite) throw new Error("Traffic source site mismatch.")
    const sourceKey = args.missionId + ":" + args.periodStart + ":" + args.periodEnd + ":" + args.reportSha256
    const existing = await ctx.db.query("siteTrafficReceipts").withIndex("by_owner_source", q => q.eq("ownerKey", ownerKey).eq("sourceKey", sourceKey)).unique()
    if (existing) return existing._id
    boundEvidence(args,'Traffic snapshot',65536)
    requireEvidenceRoom(await evidenceWindow(ctx.db.query("siteTrafficReceipts").withIndex("by_owner",q=>q.eq("ownerKey",ownerKey)),'Traffic snapshot'),'Traffic snapshot')
    return ctx.db.insert("siteTrafficReceipts", { ...args, ownerKey, sourceKey, retrievedAt: Date.now(), source: "macaly-site-analytics" })
  },
})
export const siteTrafficHistory = query({
  args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(v.object({ _id: v.id("siteTrafficReceipts"), _creationTime: v.number(), ...trafficFields })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    return ctx.db.query("siteTrafficReceipts").withIndex("by_owner", q => q.eq("ownerKey", ownerKey)).order("desc").paginate(evidencePage(args.paginationOpts))
  },
})

export async function storeImportedProductOutcome(ctx:any,args:any,ownerKey:string){    const { receipt, ...input } = args
    const importKey = receipt.repository + ":" + receipt.commitSha + ":" + receipt.path
    const existing = await ctx.db.query("productOutcomes").withIndex("by_owner_import", q => q.eq("ownerKey", ownerKey).eq("importKey", importKey)).unique()
    if (existing) {
      if (existing.importReceipt?.reportSha256 !== receipt.reportSha256 || existing.missionId !== args.missionId) throw new Error("Conflicting immutable report import.")
      return existing._id
    }
    const recordedAt = Date.now()
    const result = evaluateProductOutcome(input, recordedAt)
    boundEvidence(args,'Imported product outcome',65536)
    requireEvidenceRoom(await evidenceWindow(ctx.db.query("productOutcomes").withIndex("by_mission",(q:any)=>q.eq("missionId",args.missionId)),'Imported product outcome'),'Imported product outcome')
    return ctx.db.insert("productOutcomes", { ...input, ...result, ownerKey, recordedAt, provenance: "github-report", importKey, importReceipt: receipt })
}
