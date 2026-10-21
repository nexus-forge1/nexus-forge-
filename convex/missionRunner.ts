import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireOperator, requireOwnedMission } from "./permissions";
import { directStartBlock, missionIsAlreadyComplete } from "./incidentSafety";
import { exclusiveWork } from "./exclusiveWork";

const WINDOW = 20 * 60 * 1000;
const RETRIES = 2;
const runShape = v.object({ _id: v.id("missionRuns"), _creationTime: v.number(), missionId: v.id("missions"), startedAt: v.number(), deadlineAt: v.number(), maxRetries: v.number(), retries: v.number(), status: v.union(v.literal("running"), v.literal("paused"), v.literal("blocked"), v.literal("complete")), currentStage: v.string(), nextActionAt: v.number(), lastError: v.optional(v.string()) });

async function audit(c: any, missionId: any, type: string, actionName: string, status: string, detail: string, runId?: any) {
  await c.runMutation((internal as any).audit.record, { missionId, type, action: actionName, status, detail, runId });
}

/** @deprecated Retained for one compatibility release. Use mission-control run queries instead. */
export const get: any = (query as any)({
  args: { missionId: v.id("missions") },
  returns: v.union(runShape, v.null()),
  handler: async (c: any, a: any): Promise<Doc<"missionRuns"> | null> => { await requireOwnedMission(c, a.missionId); return (await (c.db.query("missionRuns") as any).withIndex("by_mission", (q: any) => q.eq("missionId", a.missionId)).order("desc").first()) as Doc<"missionRuns"> | null; },
} as any);

async function startApprovedInternal(c: any, missionId: any) {
  const m = await c.db.get(missionId);
  if (!m) throw Error("Mission not found");
  if (!m.approved) throw Error("Mission requires approval before execution");
  if (m.status === "complete") return null;
  const existing = await c.db.query("missionRuns").withIndex("by_mission", q => q.eq("missionId", missionId)).order("desc").first();
  if (existing && (existing.status === "running" || existing.status === "paused")) {
    await c.scheduler.runAfter(0, (internal as any).missionRunner.tickInternal, { runId: existing._id });
    return existing._id;
  }
  const now = Date.now();
  const id = await c.db.insert("missionRuns", { missionId, startedAt: now, deadlineAt: now + WINDOW, maxRetries: RETRIES, retries: 0, status: "running", currentStage: "orchestration", nextActionAt: now });
  await audit(c, missionId, "execution", "execute_approved_mission", "started", "Bounded 20-minute mission run started", id);
  await c.scheduler.runAfter(0, (internal as any).missionRunner.tickInternal, { runId: id });
  return id;
}


/**
 * Owner-authorized cooperative cancellation. Already-issued external provider work
 * cannot be forcibly interrupted, but the runner is prevented from starting later stages.
 */
export const cancel: any = (mutation as any)({
  args: { missionId: v.id("missions") },
  returns: v.null(),
  handler: async (c: any, a: any) => {
    const mission = await requireOwnedMission(c, a.missionId);
    if (mission.status === "cancelled") return null;
    if (mission.status === "complete") throw new Error("A completed mission cannot be cancelled");
    const run = await c.db.query("missionRuns")
      .withIndex("by_mission", (q: any) => q.eq("missionId", a.missionId))
      .order("desc").first();
    if (!run || (run.status !== "running" && run.status !== "paused")) {
      throw new Error("No active or paused mission run is available to cancel");
    }
    const now = Date.now();
    await c.db.patch(a.missionId, { status: "cancelled", approved: false });
    await c.db.patch(run._id, {
      status: "blocked",
      currentStage: "cancelled",
      nextActionAt: now,
      lastError: "Cancellation requested by the mission owner. In-flight provider work may finish, but no later runner stages should start.",
    });
    await c.runMutation((internal as any).orchestration.releaseForMissionInternal, { missionId: a.missionId });
    await audit(c, a.missionId, "execution", "mission_cancelled", "cancelled",
      "Owner requested cooperative cancellation. Resource reservations released; already-issued external work may finish.", run._id);
    return null;
  },
} as any);

export const startApproved: any = (internalMutation as any)({ args: { missionId: v.id("missions") }, returns: v.union(v.id("missionRuns"), v.null()), handler: async (c: any, a: any) => startApprovedInternal(c, a.missionId) } as any);
// Legacy public entry point retained for API compatibility, but it must not bypass
// portfolio decision, dependency/resource preflight, or escalation review.
export const start: any = (mutation as any)({ args: { missionId: v.id("missions") }, returns: v.id("missionRuns"), handler: async (c: any, _a: any): Promise<never> => { await requireOperator(c); throw new Error(directStartBlock()); } } as any);
export const getInternal: any = (internalQuery as any)({ args: { runId: v.id("missionRuns") }, returns: v.union(runShape, v.null()), handler: async (c: any, a: any): Promise<Doc<"missionRuns"> | null> => (await c.db.get(a.runId)) as Doc<"missionRuns"> | null } as any);
export const setState: any = (internalMutation as any)({
  args: { runId: v.id("missionRuns"), status: v.union(v.literal("running"), v.literal("paused"), v.literal("blocked"), v.literal("complete")), currentStage: v.string(), nextActionAt: v.number(), lastError: v.optional(v.string()), retries: v.optional(v.number()) },
  returns: v.null(),
  handler: async (c: any, a: any): Promise<null> => {
    const r = (await c.db.get(a.runId)) as Doc<"missionRuns"> | null; if (!r) throw Error("Mission run not found");
    if (r.currentStage === "cancelled") return null;
    const retries = a.retries ?? r.retries;
    await c.db.patch(a.runId, { status: a.status, currentStage: a.currentStage, nextActionAt: a.nextActionAt, lastError: a.lastError, retries });
    const retryNote = retries > r.retries ? ` Retry ${retries}/${r.maxRetries}.` : "";
    await audit(c, r.missionId, "run", "state_transition", a.status, `Stage ${r.currentStage} → ${a.currentStage}.${retryNote}${a.lastError ? ` ${a.lastError}` : ""}`, a.runId);
    return null;
  },
} as any);

export const tick: any = (action as any)({
  args: { runId: v.id("missionRuns") }, returns: v.null(),
  handler: async (c, a) => {
    const operatorId = await requireOperator(c);
    const run = await c.runQuery((internal as any).missionRunner.getInternal, { runId: a.runId });
    if (!run) throw new Error("Mission run not found or access denied");
    const mission = await c.runQuery((internal as any).missions.getByIdInternal, { id: run.missionId });
    if (!mission || mission.ownerKey !== operatorId) throw new Error("Mission run not found or access denied");
    return await c.runAction((internal as any).missionRunner.tickInternal, { runId: a.runId });
  },
});

export const tickInternal: any = (internalAction as any)({
  args: { runId: v.id("missionRuns"), contentionRetry: v.optional(v.number()) }, returns: v.null(),
  handler: async (c, a) => {
    const identity = await c.runQuery((internal as any).missionRunner.getInternal, { runId: a.runId });
    if (!identity) return null;
    return await exclusiveWork(c, { missionId: identity.missionId, scope: "tick", workKey: crypto.randomUUID(), retain: false, skipBusy: true, onBusy: async () => { const retry = a.contentionRetry ?? 0; if (Number.isInteger(retry) && retry >= 0 && retry < 3) await c.scheduler.runAfter(1000, (internal as any).missionRunner.tickInternal, { runId: a.runId, contentionRetry: retry + 1 }); } }, async () => {
    const r = await c.runQuery((internal as any).missionRunner.getInternal, { runId: a.runId });
    if (!r || r.status === "complete" || r.status === "blocked") return null;
    const m = await c.runQuery((internal as any).missions.getByIdInternal, { id: r.missionId });
    const now = Date.now();
    if (m?.status === "cancelled") {
      await c.runMutation((internal as any).orchestration.releaseForMissionInternal, { missionId: r.missionId });
      await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "blocked", currentStage: "cancelled", nextActionAt: now, lastError: "Mission was cancelled by its owner; no further runner stages will start." });
      return null;
    }
    // A separately verified mission outcome takes precedence over the runner deadline.
    // This prevents a late scheduled tick from creating a false timeout escalation.
    if (missionIsAlreadyComplete(m?.status)) {
      await c.runMutation((internal as any).orchestration.releaseForMissionInternal, { missionId: r.missionId });
      await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "complete", currentStage: "complete", nextActionAt: now, lastError: undefined });
      await audit(c, r.missionId, "outcome", "mission_complete", "complete", "Mission was already complete when the runner tick arrived; no timeout escalation was created.", r._id);
      return null;
    }
    if (!m?.approved) { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_mission_approval", nextActionAt: Date.now() + 60000, lastError: "Human mission approval is required." }); return null; }
    if (now >= r.deadlineAt) {
      await c.runMutation((internal as any).orchestration.releaseForMissionInternal, { missionId: r.missionId });
      const incidentId = await c.runMutation((internal as any).incidents.recordFailure, { missionId: r.missionId, runId: r._id, stage: "timeout_escalation", message: "Autonomous run exceeded its 20-minute window.", attempts: r.retries, escalated: true });
      await c.scheduler.runAfter(0, (internal as any).incidents.diagnoseInternal, { incidentId });
      await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "blocked", currentStage: "timeout_escalation", nextActionAt: now, lastError: "Autonomous run exceeded its 20-minute window; human review required." });
      await audit(c, r.missionId, "incident", "timeout_escalation", "escalated", "20-minute execution window exceeded; human review required.", r._id); return null;
    }
    try {
      const arts = await c.runQuery((internal as any).artifacts.listInternal, { missionId: r.missionId });
      const ds = await c.runQuery((internal as any).delivery.listInternal, { missionId: r.missionId });
      const runs = await c.runQuery((internal as any).forge.getRuns, { missionId: r.missionId });
      const latestArtifact = arts[0];
      const ready = latestArtifact?.status === "ready" ? latestArtifact : null;
      const waiting = latestArtifact && (latestArtifact.status === "awaiting_approval" || latestArtifact.status === "verified") ? latestArtifact : null;
      const failedArtifact = latestArtifact?.status === "verification_failed" ? latestArtifact : null;
      const rejectedArtifact = latestArtifact?.status === "rejected" ? latestArtifact : null;
      const deliveryForReady = ready ? ds.find((x: any) => x.artifactId === ready._id) : null;
      const approved = deliveryForReady?.approved ? deliveryForReady : null;
      const councilState = await c.runQuery((internal as any).executionClaims.councilState, { missionId: r.missionId, runId: r._id });
      if (councilState === "uncertain") {
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "execution_recovery", nextActionAt: now, lastError: "Council execution is unconfirmed; review its reservation and saved outcomes before continuing." });
        return null;
      }
      if (councilState === "running") {
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: "agent_coordination", nextActionAt: now + 3000, lastError: "Waiting for the final Council outcome to be persisted." });
        await c.scheduler.runAfter(3000, (internal as any).missionRunner.tickInternal, { runId: a.runId });
        return null;
      }
      const coordinationStarted = runs.length > 0 && runs.some((x: any) => x.status !== "queued");
      const coordinationDone = runs.length >= 6 && runs.every((x: any) => x.status === "complete" || x.status === "blocked");
      if (runs.length === 0 && ["intent", "artifact_verification_failed", "awaiting_artifact_approval", "awaiting_mission_approval"].includes(r.currentStage)) {
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: "orchestration", nextActionAt: now, lastError: null });
        await c.scheduler.runAfter(0, (internal as any).missionRunner.tickInternal, { runId: a.runId }); return null;
      }
      if (r.currentStage === "orchestration" && !coordinationStarted) {
        const currentMission = await c.runQuery((internal as any).missions.getByIdInternal, { id: r.missionId });
        if (currentMission?.status === "cancelled") {
          await c.runMutation((internal as any).orchestration.releaseForMissionInternal, { missionId: r.missionId });
          await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "blocked", currentStage: "cancelled", nextActionAt: Date.now(), lastError: "Mission cancellation observed before orchestration handoff." });
          return null;
        }
        await c.runMutation((internal as any).forge.createRuns, { missionId: r.missionId });
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: "agent_coordination", nextActionAt: now + 1500, lastError: "Agent coordination scheduled; waiting for persisted wave results." });
        await c.scheduler.runAfter(0, (internal as any).forge.orchestrateInternal, { missionId: r.missionId, missionRunId: r._id, mission: m.mission });
        await c.scheduler.runAfter(1500, (internal as any).missionRunner.tickInternal, { runId: a.runId }); return null;
      }
      if (r.currentStage === "agent_coordination" && !coordinationDone) {
        const blocked = runs.filter((x: any) => x.status === "blocked");
        const allQueued = runs.length > 0 && runs.every((x: any) => x.status === "queued");
        if (allQueued && now >= r.nextActionAt && r.retries < r.maxRetries) {
          const retries = r.retries + 1;
          await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: "agent_coordination", nextActionAt: now + 30000, lastError: "No agent handoff started; retrying scheduled Council orchestration.", retries });
          await c.scheduler.runAfter(0, (internal as any).forge.orchestrateInternal, { missionId: r.missionId, missionRunId: r._id, mission: m.mission });
          await c.scheduler.runAfter(30000, (internal as any).missionRunner.tickInternal, { runId: a.runId }); return null;
        }
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: blocked.length ? "paused" : "running", currentStage: blocked.length ? "agent_coordination_blocked" : "agent_coordination", nextActionAt: now + 3000, lastError: blocked.length ? `${blocked.length} agent(s) blocked; inspect agent evidence before continuing.` : "Waiting for coordinated agent waves to complete." });
        await c.scheduler.runAfter(3000, (internal as any).missionRunner.tickInternal, { runId: a.runId }); return null;
      }
      if (r.currentStage === "agent_coordination_blocked") {
        if (r.retries < r.maxRetries) {
          const retries = r.retries + 1;
          await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: "agent_coordination", nextActionAt: now + 30000, lastError: "Council handoff was blocked; retrying the bounded orchestration pass.", retries });
          await c.scheduler.runAfter(0, (internal as any).forge.orchestrateInternal, { missionId: r.missionId, missionRunId: r._id, mission: m.mission });
          await c.scheduler.runAfter(30000, (internal as any).missionRunner.tickInternal, { runId: a.runId });
        }
        return null;
      }
      if (r.currentStage === "agent_coordination" && coordinationDone && runs.some((x: any) => x.status !== "complete")) {
        const blockedCount = runs.filter((x: any) => x.status !== "complete").length;
        if (r.retries < r.maxRetries) {
          const retries = r.retries + 1;
          await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: "agent_coordination", nextActionAt: now + 30000, lastError: `${blockedCount} Council agent(s) did not complete; retrying before artifact generation.`, retries });
          await c.scheduler.runAfter(0, (internal as any).forge.orchestrateInternal, { missionId: r.missionId, missionRunId: r._id, mission: m.mission });
          await c.scheduler.runAfter(30000, (internal as any).missionRunner.tickInternal, { runId: a.runId });
        } else {
          await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "agent_coordination_blocked", nextActionAt: now, lastError: `${blockedCount} Council agent(s) remain incomplete after bounded retries; human review required. No artifact was generated.` });
        }
        return null;
      }
      if (failedArtifact) {
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "artifact_verification_failed", nextActionAt: now + 60000, lastError: "The latest artifact failed mission-aware verification. Regenerate or revise it before approval; no delivery is allowed." });
        return null;
      }
      if (rejectedArtifact) {
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "artifact_rejected", nextActionAt: now + 60000, lastError: "The latest artifact was rejected by the operator. Create a new revision explicitly before continuing." });
        return null;
      }
      if (!ready && !waiting) {
        const currentMission = await c.runQuery((internal as any).missions.getByIdInternal, { id: r.missionId });
        if (currentMission?.status === "cancelled") {
          await c.runMutation((internal as any).orchestration.releaseForMissionInternal, { missionId: r.missionId });
          await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "blocked", currentStage: "cancelled", nextActionAt: Date.now(), lastError: "Mission cancellation observed before artifact generation." });
          return null;
        }
        const generated = await c.runAction((internal as any).artifacts.generateInternal, { missionId: r.missionId, missionRunId: r._id, mission: m.mission, artifactType: "execution-artifact", artifactName: `${m.title} execution artifact` });
        const verification = await c.runMutation((internal as any).artifacts.verifyInternal, { id: generated.artifactId });
        if (!verification.passed) { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "artifact_verification_failed", nextActionAt: now + 60000, lastError: `Artifact verification failed at ${Math.round(verification.score * 100)}%; human revision or regeneration required.` }); return null; }
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_artifact_approval", nextActionAt: now + 60000, lastError: "Artifact verified; human approval required." }); return null;
      }
      if (waiting) { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_artifact_approval", nextActionAt: now + 60000, lastError: "Waiting for human artifact approval." }); return null; }
      if (ready && !deliveryForReady) { await c.runMutation((internal as any).delivery.prepareInternal, { missionId: r.missionId, artifactId: ready._id, target: "nexus-forge1/nexus-forge-", branch: "main" }); await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_delivery_approval", nextActionAt: now + 60000, lastError: "Delivery prepared for the latest verified artifact; human delivery approval required." }); return null; }
      if (ready && deliveryForReady?.stage === "blocked") { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "delivery_blocked", nextActionAt: now + 60000, lastError: "The delivery request was rejected or blocked; no external execution will occur." }); return null; }
      if (ready && deliveryForReady && !deliveryForReady.approved) { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_delivery_approval", nextActionAt: now + 60000, lastError: "Waiting for human delivery approval for the latest verified artifact." }); return null; }
      if (approved) {
        if (approved.stage === "test") { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_production_deployment", nextActionAt: now + 60000, lastError: "GitHub build/test passed; awaiting the deployment-result callback and live URL evidence." }); return null; }
        if (approved.stage === "deploy") { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_outcome_verification", nextActionAt: now + 60000, lastError: "Deployment stage recorded. Outcome verification must provide real deployment evidence." }); return null; }
        if (approved.stage === "verified") { await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "complete", currentStage: "verified", nextActionAt: now }); return null; }
        await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "running", currentStage: `delivery_${approved.stage}`, nextActionAt: now + 30000 }); await c.scheduler.runAfter(30000, (internal as any).missionRunner.tickInternal, { runId: a.runId }); return null;
      }
      await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: "paused", currentStage: "awaiting_external_result", nextActionAt: now + 60000, lastError: "Waiting for approved delivery or external evidence." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e), n = r.retries + 1, escalated = n > r.maxRetries;
      const incidentId = await c.runMutation((internal as any).incidents.recordFailure, { missionId: r.missionId, runId: r._id, stage: r.currentStage, message: msg, attempts: n, escalated });
      await c.scheduler.runAfter(0, (internal as any).incidents.diagnoseInternal, { incidentId });
      await c.runMutation((internal as any).missionRunner.setState, { runId: a.runId, status: escalated ? "blocked" : "running", currentStage: escalated ? "retry_escalation" : r.currentStage, nextActionAt: escalated ? now : now + 3000, retries: n, lastError: msg });
      if (!escalated) await c.scheduler.runAfter(3000, (internal as any).missionRunner.tickInternal, { runId: a.runId });
    }
    return null;
    });
  },
});

export const tickNow: any = (internalMutation as any)({ args: { runId: v.id("missionRuns") }, returns: v.null(), handler: async (ctx, args) => { await ctx.scheduler.runAfter(0, (internal as any).missionRunner.tickInternal, { runId: args.runId }); return null; } });
