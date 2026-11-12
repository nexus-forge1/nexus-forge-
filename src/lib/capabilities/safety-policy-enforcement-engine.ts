import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type ChecklistArgs = FunctionArgs<typeof api.scopeBFunctionsBatchOne.evaluatePreExecutionSafetyChecklist>;
type RuleArgs = FunctionArgs<typeof api.scopeBFunctionsBatchOne.evaluateSafetyPolicyRules>;
type GateArgs = FunctionArgs<typeof api.scopeBFunctionsBatchOne.validateSafetyGateTransition>;

export async function enforcePreExecutionSafety(
  client: ConvexReactClient,
  input: {
    checklist: ChecklistArgs;
    rules: RuleArgs;
    transition: Omit<GateArgs, "reviewId" | "expectedRevision">;
  },
) {
  const rules = await client.query(api.scopeBFunctionsBatchOne.evaluateSafetyPolicyRules, input.rules);
  if (rules.decision !== "allow_review" || rules.reasons.length > 0) {
    return { rules, checklist: null, gate: null, executionEligible: false, blockers: rules.reasons.length ? rules.reasons : ["Safety policy did not allow review."] };
  }

  const checklist = await client.mutation(api.scopeBFunctionsBatchOne.evaluatePreExecutionSafetyChecklist, input.checklist);
  if (checklist.gate !== "eligible" || checklist.failedRequired > 0) {
    return { rules, checklist, gate: null, executionEligible: false, blockers: ["Required pre-execution safety checks are incomplete or failed."] };
  }

  const gate = await client.mutation(api.scopeBFunctionsBatchOne.validateSafetyGateTransition, {
    ...input.transition,
    reviewId: checklist.reviewId,
    expectedRevision: checklist.revision,
    operation: "release",
  });

  const executionEligible = gate.gate === "eligible" && gate.released;
  return {
    rules,
    checklist,
    gate,
    executionEligible,
    blockers: executionEligible ? [] : ["Server-side safety gate did not release the review."],
  };
}
