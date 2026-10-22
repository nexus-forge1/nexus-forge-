import {evidencePage} from './evidenceAdmission'
import {validateManualMemory,checkManualMemoryAdmission} from './recordAdmission'
import {readMemoryContext,MEMORY_CONTEXT_LIMIT_MESSAGE} from './memoryContext'
import { rankCouncilCandidate } from "./councilMemoryCandidate"
import { councilMemoryItem, councilSelectionFields, councilEvaluationFields, councilCandidate, councilPolicyFields } from "./councilMemoryModel"
import { internal } from "./_generated/api"
import type { PaginationResult } from "convex/server"
import type { Doc, Id } from "./_generated/dataModel"
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import { action, mutation, query, internalQuery, internalMutation } from "./_generated/server"
import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError } from "convex/values"
import { requireOperator, requireOwnedMission } from "./permissions"

const memoryValidator = v.object({ _id: v.id("memories"), _creationTime: v.number(), ownerKey: v.string(), missionId: v.optional(v.id("missions")), category: v.string(), key: v.string(), value: v.string(), confidence: v.number(), source: v.string() })
const signal = v.object({ value: v.string(), confidence: v.number(), source: v.string() })
const preflight = v.object({ missionId: v.id("missions"), riskSignals: v.array(signal), reusePatterns: v.array(signal), requiredEvidence: v.array(v.string()), recoveryGuidance: v.array(v.string()), rationale: v.array(v.string()) })

function buildPreflight(missionId: any, rows: any[]) {
  const failures = rows.filter(row => row.category === "verification-outcome" && /fail|blocked|risk|not ready/i.test(row.value)).slice(0, 6)
  const recovery = rows.filter(row => row.category === "operational-recovery").slice(0, 6)
  const successes = rows.filter(row => row.category === "verification-outcome" && /pass|success|verified|complete/i.test(row.value)).slice(0, 6)
  const lessons = rows.filter(row => row.category === "learning-lesson").slice(0, 8)
  const riskSignals = failures.map(row => ({ value: row.value, confidence: row.confidence, source: row.source }))
  const reusePatterns = [...successes, ...lessons].slice(0, 10).map(row => ({ value: row.value, confidence: row.confidence, source: row.source }))
  const requiredEvidence = ["Explicit acceptance criteria", "Build/test evidence", "Human approval evidence", "Final outcome verification"]
  if (riskSignals.length) requiredEvidence.push("Evidence addressing previously observed failure/risk patterns")
  const recoveryGuidance = recovery.length ? recovery.map(row => row.value) : ["Keep retries bounded and escalate repeated failures to human review."]
  const rationale = riskSignals.length ? ["Prior failures or risk signals require stronger preflight evidence.", "Historical recovery patterns are available for bounded remediation."] : reusePatterns.length ? ["Verified historical outcomes provide reusable patterns for this mission."] : ["No relevant verified history is available; treat assumptions as unverified."]
  return { missionId, riskSignals, reusePatterns, requiredEvidence, recoveryGuidance, rationale }
}

export const list = query({
  args: { ownerKey: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(memoryValidator),
  handler: async (ctx, args): Promise<PaginationResult<Doc<"memories">>> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError("Authenticated operator session required")
    return ctx.db.query("memories").withIndex("by_owner", q => q.eq("ownerKey", userId)).order("desc").paginate(evidencePage(args.paginationOpts))
  },
})


/** Owner-scoped browsing and full-text content search; mission filters never grant access. */
export const browse = query({
  args: {
    missionId: v.optional(v.id("missions")),
    search: v.optional(v.string()),
    category: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(memoryValidator),
  handler: async (ctx, args): Promise<PaginationResult<Doc<"memories">>> => {
    const ownerKey = await requireOperator(ctx)
    if (args.missionId) await requireOwnedMission(ctx, args.missionId)
    const search = args.search?.trim() ?? ""
    const category = args.category?.trim() ?? ""
    if (search.length > 200) throw new Error("Search memory content with at most 200 characters.")
    if (category.length > 100) throw new Error("Memory category is too long.")
    if (search) {
      return ctx.db.query("memories").withSearchIndex("search_value", q => {
        let matches = q.search("value", search).eq("ownerKey", ownerKey)
        if (args.missionId) matches = matches.eq("missionId", args.missionId)
        if (category) matches = matches.eq("category", category)
        return matches
      }).paginate(evidencePage(args.paginationOpts))
    }
    const rows = args.missionId
      ? category
        ? ctx.db.query("memories").withIndex("by_owner_mission_category", q => q.eq("ownerKey", ownerKey).eq("missionId", args.missionId).eq("category", category))
        : ctx.db.query("memories").withIndex("by_owner_mission", q => q.eq("ownerKey", ownerKey).eq("missionId", args.missionId))
      : category
        ? ctx.db.query("memories").withIndex("by_owner_category", q => q.eq("ownerKey", ownerKey).eq("category", category))
        : ctx.db.query("memories").withIndex("by_owner", q => q.eq("ownerKey", ownerKey))
    return rows.order("desc").paginate(evidencePage(args.paginationOpts))
  },
})

export const getMissionSynthesis = internalQuery({
  args: { missionId: v.id("missions") },
  returns: v.union(v.object({ value: v.string(), confidence: v.number(), source: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const mission = await ctx.db.get("missions", args.missionId)
    if (!mission) return null
    const row = await ctx.db.query("memories").withIndex("by_owner_mission_category", q => q.eq("ownerKey", mission.ownerKey).eq("missionId", args.missionId).eq("category", "research-synthesis")).order("desc").first()
    return row ? { value: row.value, confidence: row.confidence, source: row.source } : null
  },
})

export const getLearningContext = internalQuery({
  args: { missionId: v.id("missions") },
  returns: v.object({ ownerKey: v.string(), outcomes: v.array(signal), lessons: v.array(signal) }),
  handler: async (ctx, args) => {
    const mission = await ctx.db.get("missions", args.missionId)
    if (!mission) throw new Error("Mission not found")
    const rows = await readMemoryContext(ctx,mission.ownerKey,60)
    const outcomes = rows.filter(row => row.category === "verification-outcome").slice(0, 10).map(row => ({ value: row.value, confidence: row.confidence, source: row.source }))
    const lessons = rows.filter(row => row.category === "learning-lesson" || row.category === "operational-recovery").slice(0, 10).map(formatLearningRow)

    return { ownerKey: mission.ownerKey, outcomes, lessons }
  },
})

export const getAdaptivePreflight = internalQuery({
  args: { missionId: v.id("missions") }, returns: preflight,
  handler: async (ctx, args) => {
    const mission = await ctx.db.get("missions", args.missionId)
    if (!mission) throw new Error("Mission not found")
    const rows = await readMemoryContext(ctx,mission.ownerKey,80)
    return buildPreflight(args.missionId, rows)
  },
})

export const getAdaptivePreflightForOperator = query({
  args: { missionId: v.id("missions") }, returns: preflight,
  handler: async (ctx, args) => {
    const mission = await requireOwnedMission(ctx, args.missionId)
    const rows = await readMemoryContext(ctx,mission.ownerKey,80)
    return buildPreflight(args.missionId, rows)
  },
})

// Operator display stays available when planning correctly fails closed.
export const adaptivePreflightStatus = query({
 args:{missionId:v.id("missions")},
 returns:v.union(v.object({ok:v.literal(true),value:preflight}),v.object({ok:v.literal(false),message:v.string()})),
 handler:async(ctx,args)=>{
  const mission=await requireOwnedMission(ctx,args.missionId)
  try{return{ok:true as const,value:buildPreflight(args.missionId,await readMemoryContext(ctx,mission.ownerKey,80))}}
  catch(error){
   if(error instanceof ConvexError&&error.data===MEMORY_CONTEXT_LIMIT_MESSAGE)return{ok:false as const,message:MEMORY_CONTEXT_LIMIT_MESSAGE}
   throw error
  }
 }
})
export const remember = mutation({
  args: { ownerKey: v.optional(v.string()), missionId: v.optional(v.id("missions")), category: v.string(), key: v.string(), value: v.string(), confidence: v.number(), source: v.string(), manifestStrategyId: v.optional(v.id("memories")), applicability: v.optional(v.string()), evidenceReferences: v.optional(v.array(v.string())) },
  returns: v.id("memories"),
  handler: async (ctx, args) => {
    const userId = await requireOperator(ctx)
    validateManualMemory(args)
    if (["retrieval-evaluation", "strategy-reuse-comparison", "mission-source"].includes(args.category)) throw new Error("Evaluation and mission-source receipts must be computed by the server.")
    const mission = args.missionId ? await requireOwnedMission(ctx, args.missionId) : null
    const ownerKey = mission?.ownerKey ?? userId
    let value = args.value
    let key = args.key
    if (args.category === "learning-lesson" && args.source === "operator-reviewed-manifest-learning") {
      if (!args.manifestStrategyId || !args.applicability || !args.evidenceReferences) {
        throw new Error("Reviewed lessons require a Manifest strategy, applicability, and evidence references.")
      }
      const strategy = await ctx.db.get(args.manifestStrategyId)
      if (!strategy || strategy.ownerKey !== ownerKey || strategy.category !== "manifest-strategy") {
        throw new Error("Selected Manifest strategy was not found in your private strategy ledger.")
      }
      const lesson = args.value.trim().slice(0, 1600)
      const applicability = args.applicability.trim().slice(0, 1000)
      const references = args.evidenceReferences.map(item => item.trim()).filter(Boolean).slice(0, 8)
      if (lesson.length < 12) throw new Error("Write a specific reusable lesson of at least 12 characters.")
      if (applicability.length < 8) throw new Error("Explain when this lesson applies.")
      if (references.length < 2 || references.some(item => item.length < 8)) {
        throw new Error("Provide at least two evidence references, each at least 8 characters long.")
      }
      value = JSON.stringify({
        lesson,
        applicability,
        manifestStrategyId: strategy._id,
        strategyKey: strategy.key,
        evidenceReferences: references,
        reviewStatus: "operator-reviewed",
        reusableRule: lesson,
        recordedAt: Date.now(),
        limitations: "Operator-reviewed evidence references; not independently verified and not causal proof.",
      })
      key = `reviewed-lesson:${strategy._id}:${Date.now()}`
    }
    await checkManualMemoryAdmission(ctx,ownerKey)
    const id = await ctx.db.insert("memories", {
      ownerKey,
      missionId: mission?._id,
      category: args.category,
      key,
      value,
      confidence: Math.max(0, Math.min(1, args.confidence)),
      source: args.source,
    })
    await ctx.db.insert('manualMemoryAdmissions',{ownerKey,memoryId:id,createdAt:Date.now()})
    return id
  },
})

export const rememberInternal = internalMutation({
  args: { ownerKey: v.string(), missionId: v.optional(v.id("missions")), category: v.string(), key: v.string(), value: v.string(), confidence: v.number(), source: v.string() },
  returns: v.id("memories"),
  handler: async (ctx, args) => ctx.db.insert("memories", { ...args, confidence: Math.max(0, Math.min(1, args.confidence)) }),
})

export const captureVerificationLesson = internalMutation({
  args: {
    ownerKey: v.string(),
    missionId: v.id("missions"),
    score: v.number(),
    passed: v.boolean(),
    metric: v.string(),
    criteria: v.array(v.string()),
  },
  returns: v.id("memories"),
  handler: async (ctx, args) => {
    const status = args.passed ? "passed" : "needs review"
    const value = JSON.stringify({
      lesson: `Governed delivery measurement ${status}: ${Math.round(args.score * 100)}% on ${args.metric}.`,
      score: args.score,
      metric: args.metric,
      criteria: args.criteria,
      reusableRule: args.passed
        ? "Reuse the four-domain evidence pattern, but keep human approval before execution and completion."
        : "Strengthen the failed evidence domains and require human review before treating the mission as complete.",
    })
    return await ctx.db.insert("memories", {
      ownerKey: args.ownerKey,
      missionId: args.missionId,
      category: "learning-lesson",
      key: `measurement:${args.metric}:${args.missionId}`,
      value,
      confidence: Math.max(0, Math.min(1, args.score)),
      source: "verified-measurement",
    })
  },
})

const retrievalArgs = { search: v.string(), expectedIds: v.array(v.id("memories")), missionId: v.optional(v.id("missions")), rationale: v.string() }

/** Query both retrieval methods from one database snapshot; labels are operator judgments. */
export const evaluateRetrievalInternal = internalQuery({
  args: retrievalArgs, returns: v.string(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    if (args.missionId) await requireOwnedMission(ctx, args.missionId)
    const search = args.search.trim()
    const rationale = args.rationale.trim()
    if (!search || search.length > 200) throw new Error("Enter a search question of 1–200 characters.")
    if (rationale.length < 8 || rationale.length > 1200) throw new Error("Explain relevance in 8–1200 characters.")
    if (!args.expectedIds.length || args.expectedIds.length > 20 || new Set(args.expectedIds).size !== args.expectedIds.length) throw new Error("Choose 1–20 distinct expected learning lesson receipts.")
    const expected: Doc<"memories">[] = []
    for (const id of args.expectedIds) {
      const row = await ctx.db.get(id)
      if (!row || row.ownerKey !== ownerKey || row.category !== "learning-lesson" || (args.missionId && row.missionId !== args.missionId)) throw new Error("Expected lesson not found in your selected private scope.")
      expected.push(row)
    }
    const ranked = await ctx.db.query("memories").withSearchIndex("search_value", q => {
      let match = q.search("value", search).eq("ownerKey", ownerKey).eq("category", "learning-lesson")
      if (args.missionId) match = match.eq("missionId", args.missionId)
      return match
    }).take(5)
    const recentQuery = args.missionId
      ? ctx.db.query("memories").withIndex("by_owner_mission_category", q => q.eq("ownerKey", ownerKey).eq("missionId", args.missionId).eq("category", "learning-lesson"))
      : ctx.db.query("memories").withIndex("by_owner_category", q => q.eq("ownerKey", ownerKey).eq("category", "learning-lesson"))
    const recent = await recentQuery.order("desc").take(5)
    const snapshot = (row: Doc<"memories">) => {
      let strategyId: string | null = null
      try {
        const parsed = JSON.parse(row.value)
        if (row.source === "operator-reviewed-manifest-learning" && parsed.reviewStatus === "operator-reviewed" && typeof parsed.manifestStrategyId === "string") strategyId = parsed.manifestStrategyId
      } catch { /* Plain text lessons remain eligible. */ }
      return { id: row._id, key: row.key, excerpt: row.value.slice(0, 500), source: row.source, strategyId }
    }
    const score = (rows: Doc<"memories">[]) => {
      const hits = rows.filter(row => args.expectedIds.includes(row._id)).length
      const first = rows.findIndex(row => args.expectedIds.includes(row._id))
      return { returned: rows.length, hits, precisionAt5: hits / 5, recallAt5: hits / expected.length, reciprocalRank: first < 0 ? 0 : 1 / (first + 1), results: rows.map(snapshot) }
    }
    return JSON.stringify({ version: "lesson-retrieval-v1", ownerKey, search, missionId: args.missionId ?? null, rationale, expected: expected.map(snapshot), baseline: score(recent), candidate: score(ranked), recordedAt: Date.now(), labels: "operator-selected relevance; not independently verified", scope: "Learning lessons only; browser search versus newest-five baseline, not Council context or strategy outcome effectiveness." })
  },
})

export const saveRetrievalInternal = internalMutation({
  args: { snapshot: v.string() }, returns: v.id("memories"),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const record = JSON.parse(args.snapshot)
    if (record.ownerKey !== ownerKey) throw new Error("Retrieval evaluation owner mismatch.")
    return ctx.db.insert("memories", { ownerKey, ...(record.missionId ? { missionId: record.missionId } : {}), category: "retrieval-evaluation", key: "lesson-retrieval:" + record.recordedAt, value: args.snapshot, confidence: 0.5, source: "server-observed-retrieval-operator-labels" })
  },
})

export const evaluateRetrieval = action({
  args: retrievalArgs, returns: v.id("memories"),
  handler: async (ctx, args): Promise<Id<"memories">> => {
    const snapshot: string = await ctx.runQuery(internal.memory.evaluateRetrievalInternal, args)
    return ctx.runMutation(internal.memory.saveRetrievalInternal, { snapshot })
  },
})

export const retrievalEvaluations = query({
  args: {}, returns: v.array(memoryValidator),
  handler: async ctx => {
    const ownerKey = await requireOperator(ctx)
    return ctx.db.query("memories").withIndex("by_owner_category", q => q.eq("ownerKey", ownerKey).eq("category", "retrieval-evaluation")).order("desc").take(20)
  },
})

function formatLearningRow(row: Doc<"memories">) {
      let value = row.value
      if (row.category === "learning-lesson" && row.source === "operator-reviewed-manifest-learning") {
        try {
          const parsed = JSON.parse(row.value) as {
            lesson?: string; applicability?: string; strategyKey?: string;
            evidenceReferences?: string[]; reviewStatus?: string; limitations?: string;
          }
          if (parsed.reviewStatus === "operator-reviewed" && typeof parsed.lesson === "string") {
            value = [
              `REVIEW STATUS: ${parsed.reviewStatus}`,
              `LESSON: ${parsed.lesson}`,
              `APPLICABILITY: ${parsed.applicability || "Not specified"}`,
              `LINKED MANIFEST STRATEGY: ${parsed.strategyKey || "Not available"}`,
              `OPERATOR-PROVIDED EVIDENCE REFERENCES: ${(parsed.evidenceReferences ?? []).join("; ") || "None"}`,
              `LIMITATIONS: ${parsed.limitations || "Operator-provided evidence is not independent verification or causal proof."}`,
            ].join("\\n")
          }
        } catch {
          value = "Reviewed lesson record could not be parsed; do not rely on it without operator review."
        }
      }
      return { value, confidence: row.confidence, source: row.source }
}

export const getCouncilMemorySelection = internalQuery({
  args: { missionId: v.id("missions"), missionText: v.optional(v.string()) },
  returns: v.object({ learning: v.object({ ownerKey: v.string(), outcomes: v.array(signal), lessons: v.array(signal) }), adaptive: preflight, corpusCutoff: v.number(), selected: v.array(councilMemoryItem), candidate: v.optional(councilCandidate) }),
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId)
    if (!mission) throw new Error("Mission not found")
    const rows = await readMemoryContext(ctx,mission.ownerKey,80)
    const learningRows = rows.slice(0, 60)
    const outcomes = learningRows.filter(row => row.category === "verification-outcome").slice(0, 10)
    const lessons = learningRows.filter(row => row.category === "learning-lesson" || row.category === "operational-recovery").slice(0, 10)
    const failures = rows.filter(row => row.category === "verification-outcome" && /fail|blocked|risk|not ready/i.test(row.value)).slice(0, 6)
    const successes = rows.filter(row => row.category === "verification-outcome" && /pass|success|verified|complete/i.test(row.value)).slice(0, 6)
    const recovery = rows.filter(row => row.category === "operational-recovery").slice(0, 6)
    const reuse = [...successes, ...rows.filter(row => row.category === "learning-lesson").slice(0, 8)].slice(0, 10)
    const routes = new Map<Id<"memories">, string[]>()
    for (const [channel, items] of [["learning-outcome", outcomes], ["learning-lesson", lessons], ["adaptive-risk", failures], ["adaptive-recovery", recovery], ["adaptive-reuse", reuse]] as const) for (const row of items) routes.set(row._id, [...(routes.get(row._id) ?? []), channel])
    const selected = rows.filter(row => routes.has(row._id)).map(row => ({ memoryId: row._id, key: row.key, category: row.category, source: row.source, confidence: row.confidence, value: row.value, ...(lessons.some(item => item._id === row._id) ? { learningValue: formatLearningRow(row).value } : {}), routes: routes.get(row._id)! }))
    const ranked = rankCouncilCandidate(rows, args.missionText ?? mission.mission, selected.length)
    const candidate = { policyVersion: "council-lexical-same-corpus-v1" as const, budget: selected.length, missionTerms: ranked.terms, selected: ranked.rows.map(row => ({ memoryId: row._id, key: row.key, category: row.category, source: row.source, confidence: row.confidence, value: row.value, routes: ["candidate-only"] })) }
    return { candidate, corpusCutoff: rows[0]?._creationTime ?? 0, learning: { ownerKey: mission.ownerKey, outcomes: outcomes.map(row => ({ value: row.value, source: row.source, confidence: row.confidence })), lessons: lessons.map(formatLearningRow) }, adaptive: buildPreflight(args.missionId, rows), selected }
  },
})

export const recordCouncilMemorySelection = internalMutation({
  args: { missionId: v.id("missions"), missionText: v.string(), corpusCutoff: v.number(), selected: v.array(councilMemoryItem), candidate: v.optional(councilCandidate), learningContext: v.string(), preflightContext: v.string(), executionClaimId: v.optional(v.id("executionClaims")), researchContext: v.optional(v.string()) }, returns: v.id("councilMemoryReceipts"),
  handler: async (ctx, args) => {
    const mission = await ctx.db.get('missions', args.missionId)
    if (!mission) throw new Error("Mission not found")
    const { executionClaimId, researchContext, ...receiptFields } = args
    if (new TextEncoder().encode(JSON.stringify(receiptFields)).byteLength > 700000) throw new ConvexError("Council memory snapshot is too large. Review oversized saved memories before planning.")
    const context = { missionText: args.missionText, researchContext: researchContext ?? '', learningContext: args.learningContext, preflightContext: args.preflightContext }
    if (executionClaimId) {
      const claim = await ctx.db.get('executionClaims', executionClaimId)
      if (!claim || claim.missionId !== args.missionId || claim.scope !== 'council' || claim.status !== 'running') throw new Error('Council claim is not active')
      if (researchContext === undefined || new TextEncoder().encode(JSON.stringify(context)).length > 512 * 1024) throw new Error('Council context exceeds recovery limit or is missing')
      const previous = await ctx.db.query('executionEffects').withIndex('by_claimId_and_effectKey', q => q.eq('claimId', executionClaimId).eq('effectKey', 'council-context:v1')).unique()
      if (previous) {
        const saved = JSON.parse(previous.payload)
        if (JSON.stringify(saved.context) !== JSON.stringify(context)) throw new Error('Council recovery context is immutable')
        const receiptId = ctx.db.normalizeId('councilMemoryReceipts', saved.memoryReceiptId)
        const receipt = receiptId ? await ctx.db.get('councilMemoryReceipts', receiptId) : null
        if (!receipt || receipt.missionId !== mission._id || receipt.ownerKey !== mission.ownerKey) throw new Error('Council context receipt is unavailable')
        return receipt._id
      }
      if (!mission.approved || mission.status === 'complete' || mission.status === 'cancelled' || mission.mission !== args.missionText) throw new Error('Mission changed before Council context capture')
      if (claim.workKey.startsWith('runner:')) {
        const runId = ctx.db.normalizeId('missionRuns', claim.workKey.slice(7))
        const run = runId ? await ctx.db.get('missionRuns', runId) : null
        if (!run || run.missionId !== mission._id || run.status === 'blocked' || run.status === 'complete') throw new Error('Runner no longer permits Council context capture')
      }
    }
    const memoryReceiptId = await ctx.db.insert("councilMemoryReceipts", { ...receiptFields, ownerKey: mission.ownerKey, policyVersion: "council-recent-context-v1", status: "prepared", preparedAt: Date.now() })
    if (executionClaimId) await ctx.db.insert('executionEffects', { claimId: executionClaimId, effectKey: 'council-context:v1', payload: JSON.stringify({ context, memoryReceiptId }) })
    return memoryReceiptId
  },
})
export const markCouncilPlannerResponded = internalMutation({
  args: { receiptId: v.id("councilMemoryReceipts") }, returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.receiptId)
    if (!receipt) throw new Error("Council memory receipt not found")
    if (receipt.status === "prepared") await ctx.db.patch(receipt._id, { status: "planner-responded", respondedAt: Date.now() })
    return null
  },
})
export const councilMemoryHistory = query({
  args: { missionId: v.id("missions") }, returns: v.array(v.object({ _id: v.id("councilMemoryReceipts"), _creationTime: v.number(), ...councilSelectionFields })),
  handler: async (ctx, args) => { await requireOwnedMission(ctx, args.missionId); return ctx.db.query("councilMemoryReceipts").withIndex("by_mission", q => q.eq("missionId", args.missionId)).order("desc").take(10) },
})
export const evaluateCouncilMemory = mutation({
  args: { receiptId: v.id("councilMemoryReceipts"), expectedIds: v.array(v.id("memories")), rationale: v.string() }, returns: v.id("councilMemoryEvaluations"),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const receipt = await ctx.db.get(args.receiptId)
    if (!receipt || receipt.ownerKey !== ownerKey) throw new ConvexError("Council memory receipt not found in your private history.")
    await requireOwnedMission(ctx, receipt.missionId)
    if (!args.expectedIds.length || args.expectedIds.length > 20 || new Set(args.expectedIds).size !== args.expectedIds.length) throw new ConvexError("Choose 1–20 distinct expected memory receipts.")
    if (args.rationale.trim().length < 8 || args.rationale.length > 1200) throw new ConvexError("Explain relevance in 8–1200 characters.")
    for (const id of args.expectedIds) {
      const row = await ctx.db.get(id)
      if (!row || row.ownerKey !== ownerKey || !["verification-outcome", "learning-lesson", "operational-recovery"].includes(row.category) || row._creationTime > receipt.corpusCutoff) throw new ConvexError("Expected memories must be owned eligible records that existed when context was prepared.")
    }
    const selectedIds = new Set(receipt.selected.map(row => row.memoryId))
    const hits = args.expectedIds.filter(id => selectedIds.has(id)).length
    return ctx.db.insert("councilMemoryEvaluations", { ...args, rationale: args.rationale.trim(), ownerKey, missionId: receipt.missionId, hits, selectedCount: selectedIds.size, precision: selectedIds.size ? hits / selectedIds.size : 0, recall: hits / args.expectedIds.length, recordedAt: Date.now() })
  },
})
export const councilMemoryEvaluations = query({
  args: { receiptId: v.id("councilMemoryReceipts") }, returns: v.array(v.object({ _id: v.id("councilMemoryEvaluations"), _creationTime: v.number(), ...councilEvaluationFields })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const receipt = await ctx.db.get(args.receiptId)
    if (!receipt || receipt.ownerKey !== ownerKey) throw new ConvexError("Council memory receipt not found.")
    await requireOwnedMission(ctx, receipt.missionId)
    return ctx.db.query("councilMemoryEvaluations").withIndex("by_receipt", q => q.eq("receiptId", args.receiptId)).order("desc").take(20)
  },
})

export const compareCouncilMemoryPolicy = mutation({
  args: { evaluationId: v.id("councilMemoryEvaluations") }, returns: v.id("councilPolicyComparisons"),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const evaluation = await ctx.db.get(args.evaluationId)
    if (!evaluation || evaluation.ownerKey !== ownerKey) throw new ConvexError("Evaluation not found in your private history.")
    const receipt = await ctx.db.get(evaluation.receiptId)
    if (!receipt || receipt.ownerKey !== ownerKey) throw new ConvexError("Context receipt not found.")
    await requireOwnedMission(ctx, receipt.missionId)
    if (!receipt.candidate) throw new ConvexError("This historical receipt has no captured candidate; a future planning attempt is required.")
    const existing = await ctx.db.query("councilPolicyComparisons").withIndex("by_evaluation", q => q.eq("evaluationId", args.evaluationId)).unique()
    if (existing) return existing._id
    const score = (items: typeof receipt.selected) => {
      const selected = new Set(items.map(item => item.memoryId))
      const hits = evaluation.expectedIds.filter(id => selected.has(id)).length
      return { hits, selectedCount: selected.size, precision: selected.size ? hits / selected.size : 0, recall: hits / evaluation.expectedIds.length }
    }
    const baseline = score(receipt.selected), candidate = score(receipt.candidate.selected)
    return ctx.db.insert("councilPolicyComparisons", { ...args, ownerKey, missionId: receipt.missionId, receiptId: receipt._id, expectedIds: evaluation.expectedIds, baselinePolicy: receipt.policyVersion, candidatePolicy: receipt.candidate.policyVersion, baseline, candidate, precisionDelta: candidate.precision - baseline.precision, recallDelta: candidate.recall - baseline.recall, recordedAt: Date.now() })
  },
})
export const councilPolicyComparisons = query({
  args: { receiptId: v.id("councilMemoryReceipts") }, returns: v.array(v.object({ _id: v.id("councilPolicyComparisons"), _creationTime: v.number(), ...councilPolicyFields })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const receipt = await ctx.db.get(args.receiptId)
    if (!receipt || receipt.ownerKey !== ownerKey) throw new ConvexError("Context receipt not found.")
    await requireOwnedMission(ctx, receipt.missionId)
    return ctx.db.query("councilPolicyComparisons").withIndex("by_receipt", q => q.eq("receiptId", args.receiptId)).order("desc").take(20)
  },
})
