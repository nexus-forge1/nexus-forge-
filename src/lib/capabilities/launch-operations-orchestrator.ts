import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type TriageArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.configureSupportTriageRules>;
type SlaArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.detectSupportSlaBreach>;
type LaunchArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.gateLaunchStage>;
type ComplianceArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.verifyComplianceChecklist>;

export async function coordinateLaunchOperations(
  client: ConvexReactClient,
  input: { triage: TriageArgs; sla: SlaArgs; launch: LaunchArgs; compliance: ComplianceArgs },
) {
  if (input.triage.queueKey !== input.sla.queueKey) {
    return { sla: null, compliance: null, launch: null, triageId: null, eligible: false, blockers: ["Triage configuration and SLA check must target the same queue."] };
  }

  const [sla, compliance] = await Promise.all([
    client.query(api.scopeDFunctionsBatchTwo.detectSupportSlaBreach, input.sla),
    client.query(api.scopeDFunctionsBatchTwo.verifyComplianceChecklist, input.compliance),
  ]);
  if (!compliance.ready || compliance.missing.length > 0 || compliance.evidenceGaps.length > 0) {
    return { sla, compliance, launch: null, triageId: null, eligible: false, blockers: [...compliance.missing.map((x) => "Required compliance item incomplete: " + x), ...compliance.evidenceGaps.map((x) => "Compliance evidence gap: " + x)] };
  }
  if (sla.breached && (!sla.escalationTarget || !sla.matchedRule)) {
    return { sla, compliance, launch: null, triageId: null, eligible: false, blockers: ["SLA breach has no valid escalation rule and target."] };
  }

  const launch = await client.mutation(api.scopeDFunctionsBatchTwo.gateLaunchStage, input.launch);
  if (!launch.ready || launch.blockers.length > 0) {
    return { sla, compliance, launch, triageId: null, eligible: false, blockers: launch.blockers.length ? launch.blockers : ["Launch stage gate did not approve the requested stage."] };
  }
  const triageId = await client.mutation(api.scopeDFunctionsBatchTwo.configureSupportTriageRules, input.triage);
  return { sla, compliance, launch, triageId, eligible: true, blockers: [] as string[] };
}
