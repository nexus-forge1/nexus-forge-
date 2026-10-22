import { v } from "convex/values"
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { parseIncidentDiagnosis } from "./incidentParser"
import { requireOperator, requireOwnedMission } from "./permissions"
import { callManagedAi } from "./providerAccounting"

const incident = v.object({
  _id: v.id("incidents"), _creationTime: v.number(), missionId: v.id("missions"), runId: v.optional(v.id("missionRuns")),
  kind: v.string(), stage: v.string(), message: v.string(), attempts: v.number(),
  status: v.union(v.literal("open"), v.literal("resolved"), v.literal("escalated")),
  recovery: v.optional(v.string()), lesson: v.optional(v.string()), diagnosis: v.optional(v.string()),
  proposedRecovery: v.optional(v.string()), diagnosisConfidence: v.optional(v.number()),
  createdAt: v.number(), resolvedAt: v.optional(v.number()),
})

export const list = query({
  args: { missionId: v.id("missions") }, returns: v.array(incident),
  handler: async (ctx, args) => {
    await requireOwnedMission(ctx, args.missionId)
    return ctx.db.query("incidents").withIndex("by_mission", q => q.eq("missionId", args.missionId)).order("desc").take(50)
  },
})

export const recordFailure = internalMutation({
  args: { missionId: v.id("missions"), runId: v.optional(v.id("missionRuns")), stage: v.string(), message: v.string(), attempts: v.number(), escalated: v.boolean() },
  returns: v.id("incidents"),
  handler: async (ctx, args) => ctx.db.insert("incidents", {
    missionId: args.missionId, runId: args.runId, kind: "autonomous-execution", stage: args.stage,
    message: args.message, attempts: args.attempts, status: args.escalated ? "escalated" : "open", createdAt: Date.now(),
  }),
})

export const markDiagnosis = internalMutation({
  args: { incidentId: v.id("incidents"), diagnosis: v.string(), proposedRecovery: v.string(), confidence: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.incidentId)
    if (!row) throw new Error("Incident not found")
    await ctx.db.patch(args.incidentId, { diagnosis: args.diagnosis.trim(), proposedRecovery: args.proposedRecovery.trim(), diagnosisConfidence: Math.max(0, Math.min(1, args.confidence)) })
    return null
  },
})

export const resolve = internalMutation({
  args: { incidentId: v.id("incidents"), recovery: v.string(), lesson: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.incidentId)
    if (!row) throw new Error("Incident not found")
    if (row.status === "resolved") return null
    if (row.status === "escalated") throw new Error("Escalated incidents require human review before resolution")
    await ctx.db.patch(args.incidentId, { status: "resolved", recovery: args.recovery.trim(), lesson: args.lesson.trim(), resolvedAt: Date.now() })
    return null
  },
})

export const reviewEscalated = mutation({
  args: { incidentId: v.id("incidents"), recovery: v.string(), lesson: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOperator(ctx)
    const row = await ctx.db.get(args.incidentId)
    if (!row) throw new Error("Incident not found")
    await requireOwnedMission(ctx, row.missionId)
    if (row.status !== "escalated") throw new Error("Only an escalated incident can be reviewed here")
    const recovery = args.recovery.trim()
    const lesson = args.lesson.trim()
    if (recovery.length < 12 || lesson.length < 12) throw new Error("Document the recovery and lesson in at least 12 characters each")
    await ctx.db.patch(args.incidentId, { status: "resolved", recovery, lesson, resolvedAt: Date.now() })
    await ctx.runMutation(internal.audit.record, {
      missionId: row.missionId,
      type: "incident",
      action: "human_review_resolved",
      status: "resolved",
      detail: `Human reviewed escalation. Recovery: ${recovery}. Lesson: ${lesson}. Workflow was not resumed automatically.`,
      runId: row.runId,
    })
    return null
  },
})

export const getOperationalLearning = internalQuery({
  args: { missionId: v.id("missions") },
  returns: v.array(v.object({ stage: v.string(), message: v.string(), status: v.union(v.literal("open"), v.literal("resolved"), v.literal("escalated")), recovery: v.optional(v.string()), lesson: v.optional(v.string()), diagnosis: v.optional(v.string()), proposedRecovery: v.optional(v.string()), diagnosisConfidence: v.optional(v.number()) })),
  handler: async (ctx, args) => ctx.db.query("incidents").withIndex("by_mission", q => q.eq("missionId", args.missionId)).order("desc").take(12).then(rows => rows.map(r => ({ stage: r.stage, message: r.message, status: r.status, recovery: r.recovery, lesson: r.lesson, diagnosis: r.diagnosis, proposedRecovery: r.proposedRecovery, diagnosisConfidence: r.diagnosisConfidence }))),
})

export const getById = internalQuery({
  args: { incidentId: v.id("incidents") }, returns: v.union(incident, v.null()),
  handler: async (ctx, args) => ctx.db.get(args.incidentId),
})

export const getOpenForRun = internalQuery({
  args: { runId: v.id("missionRuns") }, returns: v.union(incident, v.null()),
  handler: async (ctx, args) => ctx.db.query("incidents").withIndex("by_run_status", q => q.eq("runId", args.runId).eq("status", "open")).order("desc").first(),
})

export const diagnose = action({
  args: { incidentId: v.id("incidents") }, returns: v.null(),
  handler: async (ctx, args) => {
    const operator = await ctx.runQuery(internal.permissions.currentOperator, {})
    if (!operator) throw new Error("Authenticated operator session required")
    const row = await ctx.runQuery(internal.incidents.getById, { incidentId: args.incidentId })
    if (!row) throw new Error("Incident not found")
    const mission = await ctx.runQuery(internal.missions.getByIdInternal, { id: row.missionId })
    if (!mission || mission.ownerKey !== operator) throw new Error("Incident not found or access denied")
    return ctx.runAction(internal.incidents.diagnoseInternal, args)
  },
})

export const diagnoseInternal = internalAction({
  args: { incidentId: v.id("incidents") }, returns: v.null(),
  handler: async (ctx, args) => {
    const incident = await ctx.runQuery(internal.incidents.getById, { incidentId: args.incidentId })
    if (!incident || incident.status === "resolved") return null
    const mission = await ctx.runQuery(internal.missions.getByIdInternal, { id: incident.missionId })
    if (!mission) throw new Error("Mission not found")
    const text = (await callManagedAi(ctx, { ownerKey: mission.ownerKey, missionId: incident.missionId, stage: "incident-diagnosis", role: "critic", prompt: `You are the NEXUS FORGE Incident Diagnostician. Analyze one autonomous execution failure using only the supplied facts. Do not invent logs or root causes. Return exactly three labeled sections: DIAGNOSIS, PROPOSED RECOVERY, CONFIDENCE. The recovery must be a safe, bounded next action; never recommend bypassing human approval, security controls, tests, or deployment gates. If evidence is insufficient, say so and recommend human investigation.\n\nMission: ${incident.missionId}\nStage: ${incident.stage}\nFailure: ${incident.message}\nAttempts: ${incident.attempts}`, maxTokens: 500 })).trim() || "DIAGNOSIS\nInsufficient evidence.\nPROPOSED RECOVERY\nHuman investigation required.\nCONFIDENCE\n0"
    const { diagnosis, proposedRecovery, confidence } = parseIncidentDiagnosis(text)
    await ctx.runMutation(internal.incidents.markDiagnosis, { incidentId: args.incidentId, diagnosis, proposedRecovery, confidence })
    return null
  },
})
