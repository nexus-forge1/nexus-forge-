import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type ThresholdArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.evaluateCanaryAllocationThreshold>;
type ApprovalArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.recordPromotionGateApproval>;
type DependencyArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.resolveRecoveryDependencyOrder>;
type DrillArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.logRecoveryDrillRehearsal>;

export async function coordinateCanaryAndRecovery(
  client: ConvexReactClient,
  input: { threshold: ThresholdArgs; approval: ApprovalArgs; dependencies: DependencyArgs; drill: DrillArgs },
) {
  if (input.approval.canaryPercent !== input.threshold.allocationPercent ||
      input.drill.dependencies.length !== input.dependencies.dependencies.length) {
    return { threshold: null, dependencies: null, approvalId: null, rehearsal: null, eligible: false, blockers: ["Promotion approval and recovery inputs do not match their validated gate inputs."] };
  }
  const sameDependencies = input.drill.dependencies.every((dependency, index) => {
    const expected = input.dependencies.dependencies[index];
    return expected !== undefined && dependency.key === expected.key &&
      dependency.dependsOn.length === expected.dependsOn.length &&
      dependency.dependsOn.every((value, itemIndex) => value === expected.dependsOn[itemIndex]);
  });
  if (!sameDependencies) {
    return { threshold: null, dependencies: null, approvalId: null, rehearsal: null, eligible: false, blockers: ["Recovery rehearsal dependencies differ from the validated dependency graph."] };
  }

  const [threshold, dependencies] = await Promise.all([
    client.query(api.scopeDFunctionsBatchTwo.evaluateCanaryAllocationThreshold, input.threshold),
    client.query(api.scopeDFunctionsBatchTwo.resolveRecoveryDependencyOrder, input.dependencies),
  ]);
  if (!threshold.eligible || threshold.blockers.length > 0) {
    return { threshold, dependencies, approvalId: null, rehearsal: null, eligible: false, blockers: threshold.blockers.length ? threshold.blockers : ["Canary allocation thresholds were not satisfied."] };
  }
  if (!dependencies.valid || dependencies.order.length === 0) {
    return { threshold, dependencies, approvalId: null, rehearsal: null, eligible: false, blockers: ["Recovery dependency graph is invalid or empty."] };
  }
  if (!input.approval.approved) {
    return { threshold, dependencies, approvalId: null, rehearsal: null, eligible: false, blockers: ["Explicit promotion approval is required."] };
  }

  const approvalId = await client.mutation(api.scopeDFunctionsBatchTwo.recordPromotionGateApproval, input.approval);
  const rehearsal = await client.mutation(api.scopeDFunctionsBatchTwo.logRecoveryDrillRehearsal, input.drill);
  return { threshold, dependencies, approvalId, rehearsal, eligible: rehearsal.outcome === "passed", blockers: rehearsal.outcome === "passed" ? [] : ["Recovery rehearsal failed; promotion remains ineligible."] };
}
