import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

type RateArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.ingestRateLimitEvent>;
type IncidentArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.mutateSecurityIncidentLedger>;
type ThresholdArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.evaluateSecurityPolicyThresholds>;
type LockdownArgs = FunctionArgs<typeof api.scopeCFunctions.triggerEmergencyLockdown>;

export async function coordinateIncidentContainment(
  client: ConvexReactClient,
  input: {
    rateLimit?: RateArgs;
    incident: IncidentArgs;
    thresholds?: ThresholdArgs;
    lockdown: Omit<LockdownArgs, "reason" | "severity">;
  },
) {
  const rateLimitEventId = input.rateLimit
    ? await client.mutation(api.scopeBFunctionsBatchTwo.ingestRateLimitEvent, input.rateLimit)
    : null;

  const thresholds = await client.query(
    api.scopeBFunctionsBatchTwo.evaluateSecurityPolicyThresholds,
    input.thresholds ?? {},
  );

  const incident = await client.mutation(api.scopeBFunctionsBatchTwo.mutateSecurityIncidentLedger, {
    ...input.incident,
    severity: thresholds.policyTriggered ? (input.incident.severity === "critical" ? "critical" : "high") : input.incident.severity,
    status: thresholds.policyTriggered ? "triaged" : input.incident.status,
    evidence: [...input.incident.evidence, ...(rateLimitEventId ? [String(rateLimitEventId)] : []), ...thresholds.reasons],
  });

  let lockdownId: FunctionReturnType<typeof api.scopeCFunctions.triggerEmergencyLockdown> | null = null;
  if (thresholds.policyTriggered) {
    lockdownId = await client.mutation(api.scopeCFunctions.triggerEmergencyLockdown, {
      ...input.lockdown,
      reason: thresholds.reasons.join("; ") || "Security policy threshold triggered",
      severity: input.incident.severity === "critical" || thresholds.openCriticalIncidents > 0 ? "critical" : "high",
    });
  }

  return {
    rateLimitEventId,
    thresholds,
    incident,
    lockdownId,
    contained: !thresholds.policyTriggered || lockdownId !== null,
    blockers: thresholds.policyTriggered && !lockdownId ? ["Policy threshold triggered but lockdown was not recorded."] : [],
  };
}
