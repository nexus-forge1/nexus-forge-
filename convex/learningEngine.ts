import {admitEvidence,boundEvidence} from './evidenceAdmission'
import type { MutationCtx } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { evaluateProductOutcome } from "./productOutcomeModel"
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const metric = v.object({
  key: v.string(),
  label: v.string(),
  baseline: v.number(),
  candidate: v.number(),
  unit: v.string(),
  direction: v.union(v.literal("higher"), v.literal("lower")),
  evidence: v.string(),
});
const experimentShape = v.object({
  _id: v.id("memories"),
  _creationTime: v.number(),
  key: v.string(),
  value: v.string(),
  confidence: v.number(),
  source: v.string(),
});

export const listExperiments = query({
  args: {},
  returns: v.array(experimentShape),
  handler: async (ctx) => {
    const ownerKey = await getAuthUserId(ctx);
    if (!ownerKey) return [];
    const rows = await ctx.db.query("memories")
      .withIndex("by_owner_category", q => q.eq("ownerKey", ownerKey).eq("category", "learning-experiment"))
      .order("desc")
      .take(100);
    return rows.filter(row => row.category === "learning-experiment").slice(0, 12)
      .map(({ _id, _creationTime, key, value, confidence, source }) => ({ _id, _creationTime, key, value, confidence, source }));
  },
});

export const recordExperiment = mutation({
  args: {
    name: v.string(),
    hypothesis: v.string(),
    manifestStrategyId: v.optional(v.id("memories")),
    baselineLabel: v.string(),
    candidateLabel: v.string(),
    metrics: v.array(metric),
    baselineSafetyPass: v.boolean(),
    candidateSafetyPass: v.boolean(),
    notes: v.string(),
  },
  returns: v.object({
    saved: v.boolean(),
    decision: v.string(),
    improved: v.number(),
    regressed: v.number(),
    unchanged: v.number(),
    rationale: v.string(),
  }),
  handler: async (ctx, args) => {
    const ownerKey = await getAuthUserId(ctx);
    if (!ownerKey) throw new Error("Authenticated operator session required.");
    boundEvidence(args,'Learning experiment',32768);
    await admitEvidence(ctx.db.query("memories").withIndex("by_owner_category",q=>q.eq("ownerKey",ownerKey).eq("category","learning-experiment")),'Learning experiment');
    const name = args.name.trim().slice(0, 120);
    const hypothesis = args.hypothesis.trim().slice(0, 1200);
    let linkedManifestStrategy: { id: string; name: string } | null = null;
    if (args.manifestStrategyId) {
      const strategy = await ctx.db.get(args.manifestStrategyId);
      if (!strategy || strategy.ownerKey !== ownerKey || strategy.category !== "manifest-strategy") {
        throw new Error("Selected Manifest strategy was not found in your private strategy ledger.");
      }
      let parsed: { name?: string } = {};
      try { parsed = JSON.parse(strategy.value) as { name?: string }; } catch { /* Keep the ledger key as a safe fallback. */ }
      linkedManifestStrategy = { id: strategy._id, name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 160) : strategy.key.slice(0, 160) };
    }
    if (name.length < 3) throw new Error("Experiment name must contain at least 3 characters.");
    if (hypothesis.length < 8) throw new Error("Enter a testable hypothesis.");
    if (args.metrics.length < 2 || args.metrics.length > 8) throw new Error("Record 2–8 comparable metrics.");
    const seen = new Set<string>();
    for (const item of args.metrics) {
      if (seen.has(item.key)) throw new Error("Metric keys must be unique.");
      seen.add(item.key);
      if (!item.label.trim() || !item.unit.trim()) throw new Error("Each metric needs a label and unit.");
      if (!Number.isFinite(item.baseline) || !Number.isFinite(item.candidate)) throw new Error("Metric values must be finite numbers.");
      if (item.evidence.trim().length < 8) throw new Error(`Add an evidence reference or explain how you measured: ${item.label}.`);
    }
    const results = args.metrics.map(item => {
      const delta = item.candidate - item.baseline;
      const normalized = item.direction === "higher" ? delta : -delta;
      const status = Math.abs(normalized) < 0.000001 ? "unchanged" : normalized > 0 ? "improved" : "regressed";
      return { ...item, delta, status };
    });
    const improved = results.filter(x => x.status === "improved").length;
    const regressed = results.filter(x => x.status === "regressed").length;
    const unchanged = results.filter(x => x.status === "unchanged").length;
    let decision = "inconclusive";
    let rationale = "Results do not yet show a sufficiently consistent improvement. Collect more comparable measurements and rerun.";
    if (!args.baselineSafetyPass || !args.candidateSafetyPass) {
      decision = "do-not-promote";
      rationale = "Safety checks did not pass for both baseline and candidate. Do not promote this candidate.";
    } else if (improved >= 2 && regressed === 0) {
      decision = "human-review-recommended";
      rationale = "At least two metrics improved, none regressed, and both safety checks were marked as passed. This is a recommendation for human review, not automatic promotion.";
    } else if (regressed > 0) {
      decision = "do-not-promote";
      rationale = "One or more measured metrics regressed. Investigate the trade-off before considering this candidate.";
    }
    const record = {
      name,
      hypothesis,
      linkedManifestStrategy,
      baselineLabel: args.baselineLabel.trim().slice(0, 100),
      candidateLabel: args.candidateLabel.trim().slice(0, 100),
      metrics: results,
      baselineSafetyPass: args.baselineSafetyPass,
      candidateSafetyPass: args.candidateSafetyPass,
      notes: args.notes.trim().slice(0, 2000),
      decision,
      rationale,
      counts: { improved, regressed, unchanged },
      evidenceStatus: "operator-provided; not independently verified",
      recordedAt: Date.now(),
      promotionApplied: false,
    };
    await ctx.db.insert("memories", {
      ownerKey,
      category: "learning-experiment",
      key: `learning-experiment:${Date.now()}:${name.slice(0, 40)}`,
      value: JSON.stringify(record),
      confidence: 0.5,
      source: "governed-baseline-candidate-comparison",
    });
    return { saved: true, decision, improved, regressed, unchanged, rationale };
  },
});

export const listReuseComparisons = query({
  args: {}, returns: v.array(experimentShape),
  handler: async ctx => {
    const ownerKey = await getAuthUserId(ctx)
    if (!ownerKey) throw new Error("Authenticated operator session required.")
    const rows = await ctx.db.query("memories").withIndex("by_owner_category", q => q.eq("ownerKey", ownerKey).eq("category", "strategy-reuse-comparison")).order("desc").take(20)
    return rows.map(({ _id, _creationTime, key, value, confidence, source }) => ({ _id, _creationTime, key, value, confidence, source }))
  },
})

export const recordReuseComparison = mutation({
  args: { missionId: v.id("missions"), lessonId: v.id("memories"), baselineMeasurementId: v.id("measurements"), candidateMeasurementId: v.id("measurements"), applied: v.boolean(), notes: v.string() },
  returns: v.id("memories"),
  handler: async (ctx, args) => {
    const { ownerKey, mission, lesson, reviewed, strategy, link } = await loadReuseProvenance(ctx, args.missionId, args.lessonId)
    if (!args.applied || args.notes.trim().length < 12 || args.notes.length > 1600) throw new Error("Confirm actual application and describe the comparable conditions in 12–1600 characters.")
    const baseline = await ctx.db.get(args.baselineMeasurementId)
    const candidate = await ctx.db.get(args.candidateMeasurementId)
    if (!baseline || !candidate || candidate.missionId !== mission._id || baseline.missionId === mission._id) throw new Error("Choose measurements from the reuse mission and a different baseline mission.")
    const baselineMission = await ctx.db.get(baseline.missionId)
    if (!baselineMission || baselineMission.ownerKey !== ownerKey) throw new Error("Baseline mission not found in your private workspace.")
    if (baseline._creationTime >= link._creationTime || candidate._creationTime <= link._creationTime) throw new Error("Baseline must precede the lesson handoff; candidate measurement must follow it.")
    const direction = candidate.metric === "actual runtime cost" ? "lower" : candidate.metric === "governed delivery readiness" ? "higher" : null
    if (!direction || baseline.metric !== candidate.metric || baseline.unit !== candidate.unit || baseline.target !== candidate.target) throw new Error("Compare the same supported metric, unit and target.")
    if (![baseline.actual, candidate.actual, baseline.target].every(Number.isFinite) || !baseline.evidence.length || !candidate.evidence.length) throw new Error("Both measurements need finite values and evidence references.")
    const snapshot = (row: typeof baseline, title: string) => ({ id: row._id, missionId: row.missionId, missionTitle: title, metric: row.metric, actual: row.actual, target: row.target, unit: row.unit, status: row.status, verificationId: row.verificationId ?? null, evidence: row.evidence.slice(0, 8).map(item => item.slice(0, 1000)), observedAt: row._creationTime })
    const delta = candidate.actual - baseline.actual
    const benefit = direction === "higher" ? delta : -delta
    const outcome = Math.abs(benefit) < 0.000001 ? "unchanged" : benefit > 0 ? "improved" : "regressed"
    const key = "strategy-reuse:" + lesson._id + ":" + baseline._id + ":" + candidate._id
    const existing = await ctx.db.query("memories").withIndex("by_owner_category_key", q => q.eq("ownerKey", ownerKey).eq("category", "strategy-reuse-comparison").eq("key",key)).first()
    if (existing) return existing._id
    await admitEvidence(ctx.db.query("memories").withIndex("by_owner_category",q=>q.eq("ownerKey",ownerKey).eq("category","strategy-reuse-comparison")),'Strategy reuse comparison')
    const record = { version: "strategy-reuse-v1", strategyId: strategy._id, strategyKey: strategy.key, lessonId: lesson._id, lesson: reviewed.lesson.slice(0, 1600), applicability: reviewed.applicability.slice(0, 1000), sourceReceiptId: link._id, handoffAt: link._creationTime, missionId: mission._id, baseline: snapshot(baseline, baselineMission.title), candidate: snapshot(candidate, mission.title), direction, delta, outcome, applied: true, notes: args.notes.trim(), recordedAt: Date.now(), evidenceStatus: candidate.metric === "actual runtime cost" ? "operator-recorded spend; operator-attested application and comparability" : "recorded delivery-readiness measurements; operator-attested application and comparability", limitation: "Observed association only. No causal proof, automatic promotion or business-outcome certification." }
    return ctx.db.insert("memories", { ownerKey, missionId: mission._id, category: "strategy-reuse-comparison", key, value: JSON.stringify(record), confidence: 0.5, source: "lesson-handoff-measurement-comparison" })
  },
})

async function loadReuseProvenance(ctx: MutationCtx, missionId: Id<"missions">, lessonId: Id<"memories">) {
    const ownerKey = await getAuthUserId(ctx)
    if (!ownerKey) throw new ConvexError("Authenticated operator session required.")
    const mission = await ctx.db.get(missionId)
    const lesson = await ctx.db.get(lessonId)
    if (!mission || mission.ownerKey !== ownerKey || !lesson || lesson.ownerKey !== ownerKey || lesson.category !== "learning-lesson" || lesson.source !== "operator-reviewed-manifest-learning") throw new ConvexError("Mission or reviewed lesson not found in your private workspace.")
    let reviewed: { lesson?: string; applicability?: string; reviewStatus?: string; manifestStrategyId?: string } = {}
    try { reviewed = JSON.parse(lesson.value) } catch { throw new ConvexError("Reviewed lesson record is malformed.") }
    if (reviewed.reviewStatus !== "operator-reviewed" || typeof reviewed.lesson !== "string" || typeof reviewed.applicability !== "string" || typeof reviewed.manifestStrategyId !== "string") throw new ConvexError("Choose a reviewed lesson linked to a Manifest strategy.")
    const strategyId = ctx.db.normalizeId("memories", reviewed.manifestStrategyId)
    const strategy = strategyId ? await ctx.db.get(strategyId) : null
    if (!strategy || strategy.ownerKey !== ownerKey || strategy.category !== "manifest-strategy") throw new ConvexError("Linked Manifest strategy not found in your private workspace.")
    const link = await ctx.db.query("memories").withIndex("by_owner_mission_category", q => q.eq("ownerKey",ownerKey).eq("missionId",mission._id).eq("category","mission-source")).filter(q=>q.and(q.eq(q.field("key"),"source:"+lesson._id),q.eq(q.field("source"),"mission-source-link"))).first()
    if (!link) throw new ConvexError("This mission was not created from the selected reviewed lesson.")
    let linkedId: unknown
    try { linkedId = JSON.parse(link.value).sourceMemoryId } catch { throw new ConvexError("Mission source receipt is malformed.") }
    if (linkedId !== lesson._id) throw new ConvexError("Mission source receipt does not match the lesson.")
    return { ownerKey, mission, lesson, reviewed: { lesson: reviewed.lesson, applicability: reviewed.applicability }, strategy, link }
}

export const recordProductReuseComparison = mutation({
  args: { missionId: v.id("missions"), lessonId: v.id("memories"), baselineOutcomeId: v.id("productOutcomes"), candidateOutcomeId: v.id("productOutcomes"), applied: v.boolean(), notes: v.string() },
  returns: v.id("memories"),
  handler: async (ctx, args) => {
    const { ownerKey, mission, lesson, reviewed, strategy, link } = await loadReuseProvenance(ctx, args.missionId, args.lessonId)
    if (!args.applied || args.notes.trim().length < 12 || args.notes.length > 1600) throw new ConvexError("Confirm application and describe comparable conditions in 12–1600 characters.")
    const baseline = await ctx.db.get(args.baselineOutcomeId), candidate = await ctx.db.get(args.candidateOutcomeId)
    if (!baseline || !candidate || baseline.ownerKey !== ownerKey || candidate.ownerKey !== ownerKey || candidate.missionId !== mission._id || baseline.missionId === mission._id) throw new ConvexError("Choose owned product observations from the reuse mission and a different baseline mission.")
    const baselineMission = await ctx.db.get(baseline.missionId)
    if (!baselineMission || baselineMission.ownerKey !== ownerKey) throw new ConvexError("Baseline mission not found in your private workspace.")
    if (baseline._creationTime >= link._creationTime || baseline.periodEnd > link._creationTime || candidate.periodStart < link._creationTime || candidate._creationTime <= link._creationTime) throw new ConvexError("Baseline record and observation period must precede the handoff; the candidate observation period must start after it.")
    if (baseline.metric !== candidate.metric || baseline.unit !== candidate.unit || baseline.direction !== candidate.direction || baseline.target !== candidate.target) throw new ConvexError("Product observations must use the same metric, unit, direction and target.")
    if (baseline.periodEnd - baseline.periodStart !== candidate.periodEnd - candidate.periodStart || baseline.sampleSize !== candidate.sampleSize || baseline.method !== candidate.method) throw new ConvexError("Use equal observation durations and sample sizes, and the same measurement method text.")
    const baselineScore = evaluateProductOutcome(baseline, Date.now()), candidateScore = evaluateProductOutcome(candidate, Date.now())
    const snapshot = (row: typeof baseline, title: string, actual: number) => ({ id: row._id, missionId: row.missionId, missionTitle: title, metric: row.metric, observed: row.observed, actual, target: row.target, unit: row.unit, direction: row.direction, sampleSize: row.sampleSize, periodStart: row.periodStart, periodEnd: row.periodEnd, method: row.method, evidence: row.evidence, notes: row.notes, observedAt: row._creationTime, provenance: row.provenance, importReceipt: row.importReceipt ?? null })
    const delta = candidateScore.actual - baselineScore.actual
    const benefit = candidateScore.direction === "higher" ? delta : -delta
    const outcome = Math.abs(benefit) < 0.000001 ? "unchanged" : benefit > 0 ? "improved" : "regressed"
    const key = "strategy-reuse-product:" + lesson._id + ":" + baseline._id + ":" + candidate._id
    const existing = await ctx.db.query("memories").withIndex("by_owner_category_key", q => q.eq("ownerKey", ownerKey).eq("category", "strategy-reuse-comparison").eq("key",key)).first()
    if (existing) return existing._id
    await admitEvidence(ctx.db.query("memories").withIndex("by_owner_category",q=>q.eq("ownerKey",ownerKey).eq("category","strategy-reuse-comparison")),'Strategy reuse comparison')
    const record = { version: "strategy-reuse-product-v1", strategyId: strategy._id, strategyKey: strategy.key, lessonId: lesson._id, lesson: reviewed.lesson.slice(0, 1600), applicability: reviewed.applicability.slice(0, 1000), sourceReceiptId: link._id, handoffAt: link._creationTime, missionId: mission._id, baseline: snapshot(baseline, baselineMission.title, baselineScore.actual), candidate: snapshot(candidate, mission.title, candidateScore.actual), direction: candidateScore.direction, delta, outcome, applied: true, notes: args.notes.trim(), recordedAt: Date.now(), evidenceStatus: baseline.provenance + " / " + candidate.provenance + " product observations; operator-attested application and comparable conditions", limitation: "Observed association only; matching fields do not prove comparable populations, causal effectiveness, independent revenue verification or strategy promotion." }
    return ctx.db.insert("memories", { ownerKey, missionId: mission._id, category: "strategy-reuse-comparison", key, value: JSON.stringify(record), confidence: 0.5, source: "lesson-handoff-product-comparison" })
  },
})
