import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type ProtocolArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.preregisterResearchProtocol>;
type SignificanceArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.screenStatisticalSignificance>;
type DistributionArgs = FunctionArgs<typeof api.scopeCFunctions.recordZeroShotTaskDistribution>;
type ContainmentArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.guardRecursiveSelfImprovementContainment>;

export async function coordinateResearchWithContainment(
  client: ConvexReactClient,
  input: {
    protocol: ProtocolArgs;
    significance: Omit<SignificanceArgs, "protocolKey">;
    distribution: DistributionArgs;
    containment: ContainmentArgs;
  },
) {
  if (input.protocol.protocolKey !== input.distribution.studyKey) {
    return { protocolId: null, significance: null, observationId: null, containment: null, eligibleForHumanReview: false, blockers: ["Research protocol key and zero-shot study key must match."] };
  }

  const protocolId = await client.mutation(api.scopeBFunctionsBatchTwo.preregisterResearchProtocol, input.protocol);
  const [significance, containment] = await Promise.all([
    client.query(api.scopeBFunctionsBatchTwo.screenStatisticalSignificance, {
      ...input.significance,
      protocolKey: input.protocol.protocolKey,
    }),
    client.query(api.scopeBFunctionsBatchTwo.guardRecursiveSelfImprovementContainment, input.containment),
  ]);

  const observationId = await client.mutation(api.scopeCFunctions.recordZeroShotTaskDistribution, input.distribution);
  const blockers: string[] = [];
  if (!containment.permittedForReview) blockers.push(containment.reason);
  if (containment.requiresHumanApproval) blockers.push("Independent human approval remains required.");
  if (significance.nControl === 0 || significance.nTreatment === 0) blockers.push("Statistical screening lacks observations in one or both groups.");
  if (!significance.screenedSignificant) blockers.push("Statistical screen did not establish significance; do not claim a positive result.");

  return {
    protocolId,
    significance,
    observationId,
    containment,
    eligibleForHumanReview: blockers.length === 0,
    blockers,
    autonomousPromotionExecuted: false as const,
  };
}
