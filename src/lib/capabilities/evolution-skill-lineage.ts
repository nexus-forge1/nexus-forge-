import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type BoundaryArgs = FunctionArgs<typeof api.scopeAFunctions.verifyEvolutionBoundary>;
type SkillArgs = FunctionArgs<typeof api.scopeAFunctions.validateSkillContract>;

/**
 * Enforces candidate digest lineage between a skill version and its evolution
 * proposal. This coordinator only reports eligibility for independent review;
 * it never activates a pilot or promotes executable behavior.
 */
export async function verifySkillEvolutionLineage(
  client: ConvexReactClient,
  input: { boundary: BoundaryArgs; candidateSkill: SkillArgs },
) {
  const [boundary, skill] = await Promise.all([
    client.query(api.scopeAFunctions.verifyEvolutionBoundary, input.boundary),
    client.query(api.scopeAFunctions.validateSkillContract, input.candidateSkill),
  ]);

  const blockers = [...boundary.reasons, ...skill.reasons];
  if (boundary.candidateDigest !== skill.digest) {
    blockers.push("Candidate skill digest does not match the evolution proposal candidate digest.");
  }
  if (!boundary.eligibleForIndependentReview) {
    blockers.push("Evolution boundary has not cleared independent review.");
  }
  if (!skill.valid) blockers.push("Skill contract validation failed.");
  if (skill.executionAuthorized) blockers.push("Unexpected execution authorization state; fail closed.");

  return {
    proposalId: boundary.proposalId,
    candidateSkillId: skill.skillId,
    candidateDigest: skill.digest,
    eligibleForIndependentReview: blockers.length === 0,
    promotionExecuted: false as const,
    pilotActivated: boundary.pilotActivated,
    blockers: [...new Set(blockers)],
  };
}
