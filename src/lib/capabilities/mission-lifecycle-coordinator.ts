import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type GuideArgs = FunctionArgs<typeof api.scopeAFunctions.evaluateMissionGuide>;
type TransitionArgs = FunctionArgs<typeof api.scopeAFunctions.transitionMissionConsole>;

export type MissionLifecycleResult = {
  guide: Awaited<ReturnType<ConvexReactClient["mutation"]>>;
  gate: Awaited<ReturnType<ConvexReactClient["query"]>>;
  transition: unknown | null;
  blockedReasons: string[];
};

/**
 * Runs the durable mission guide gate before attempting a state transition.
 * Every state-changing step remains a separate server-authorized mutation;
 * this coordinator fails closed and never treats a partial run as atomic.
 */
export async function prepareMissionLifecycle(
  client: ConvexReactClient,
  input: {
    guide: GuideArgs;
    transitionReason: string;
    startIfReady?: boolean;
  },
) {
  const guide = await client.mutation(api.scopeAFunctions.evaluateMissionGuide, input.guide);
  const gate = await client.query(api.scopeAFunctions.guidedWorkflowGate, {
    missionId: input.guide.missionId,
  });

  const blockedReasons: string[] = [];
  if (guide.status !== "ready") blockedReasons.push("Required mission guide checkpoints are incomplete.");
  if (!gate.approved) blockedReasons.push("Mission approval has not been recorded.");
  if (gate.missionStatus === "cancelled" || gate.missionStatus === "complete") {
    blockedReasons.push("Terminal mission states cannot advance.");
  }

  let transition: unknown | null = null;
  if (input.startIfReady && blockedReasons.length === 0 && gate.missionStatus === "draft") {
    const args: TransitionArgs = {
      missionId: input.guide.missionId,
      operation: "start",
      reason: input.transitionReason,
    };
    transition = await client.mutation(api.scopeAFunctions.transitionMissionConsole, args);
  }

  return { guide, gate, transition, blockedReasons };
}

export async function completeMissionFromReleaseEvidence(
  client: ConvexReactClient,
  input: { missionId: TransitionArgs["missionId"]; reason: string },
) {
  // Backend completion independently requires retained passing verification and
  // verified delivery provenance. This call deliberately relies on that guard.
  return client.mutation(api.scopeAFunctions.transitionMissionConsole, {
    missionId: input.missionId,
    operation: "complete",
    reason: input.reason,
  });
}
