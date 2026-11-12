import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type ReplayArgs = FunctionArgs<typeof api.scopeAFunctions.appendReplayEvent>;
type InspectArgs = FunctionArgs<typeof api.memoryGovernance.inspect>;
type ReviewArgs = FunctionArgs<typeof api.memoryGovernance.review>;
type PurgeArgs = FunctionArgs<typeof api.scopeAFunctions.purgeGovernedMemory>;

/**
 * Appends a replay checkpoint and applies a revision/digest-bound memory review.
 * Purge requires a separate explicit consent flag plus a non-empty consent key;
 * the server revalidates ownership, revision, source digest and consent.
 */
export async function coordinateReplayAndMemoryLifecycle(
  client: ConvexReactClient,
  input: {
    replay: ReplayArgs;
    memory: InspectArgs;
    review: Omit<ReviewArgs, "expectedRevision" | "expectedSourceDigest">;
    purge?: { consentConfirmed: boolean; args: Omit<PurgeArgs, "expectedRevision" | "expectedSourceDigest"> };
  },
) {
  const replayEventId = await client.mutation(api.scopeAFunctions.appendReplayEvent, input.replay);
  const inspected = await client.query(api.memoryGovernance.inspect, input.memory);
  const latestReview = inspected.history[0];
  const expectedRevision = latestReview?.revision ?? 0;

  const review = await client.mutation(api.memoryGovernance.review, {
    ...input.review,
    expectedRevision,
    expectedSourceDigest: inspected.sourceDigest,
  });

  if (!input.purge?.consentConfirmed) {
    return {
      replayEventId,
      memoryReviewId: review,
      purge: null,
      purgeSkipped: true as const,
      reason: "Explicit purge consent was not supplied; memory content was not purged.",
    };
  }

  if (!input.purge.args.consentKey.trim()) {
    throw new Error("Purge consent requires a non-empty, explicit consent key.");
  }

  const purge = await client.mutation(api.scopeAFunctions.purgeGovernedMemory, {
    ...input.purge.args,
    memoryId: input.memory.memoryId,
    expectedRevision: expectedRevision + 1,
    expectedSourceDigest: inspected.sourceDigest,
  });

  return { replayEventId, memoryReviewId: review, purge, purgeSkipped: false as const, reason: null };
}
