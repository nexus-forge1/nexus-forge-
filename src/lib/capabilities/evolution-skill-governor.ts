import type { ConvexReactClient } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Enforces the existing evolution allowlist, denied-class, rollback and human-review
 * policy before assigning a stable skill channel. A blocked proposal can only be tagged
 * development; it can never be silently promoted.
 */
export async function coordinateSkillEvolution(
  client: ConvexReactClient,
  input: {
    requestKey: string
    proposalKey: string
    changeClasses: string[]
    allowedClasses: string[]
    deniedClasses: string[]
    riskScore: number
    rollbackAvailable: boolean
    humanApproval: boolean
    evidence: string[]
    packageKey: string
    version: string
    contentDigest: string
  },
) {
  const boundary = await client.query(api.scopeDFunctionsBatchOne.verifyEvolutionSafetyBoundary, {
    changeClasses: input.changeClasses,
    allowedClasses: input.allowedClasses,
    deniedClasses: input.deniedClasses,
    riskScore: input.riskScore,
    rollbackAvailable: input.rollbackAvailable,
    humanApproval: input.humanApproval,
  })
  if (!boundary.eligibleForReview) {
    return { promoted: false as const, boundary, proposalId: null, versionId: null, channel: null }
  }
  const proposalId = await client.mutation(api.scopeDFunctionsBatchOne.intakeEvolutionProposal, {
    requestKey: input.requestKey,
    proposalKey: input.proposalKey,
    changeClass: input.changeClasses.join(','),
    summary: 'Skill version lineage candidate ' + input.packageKey + '@' + input.version,
    riskScore: input.riskScore,
    rollbackAvailable: input.rollbackAvailable,
    evidence: input.evidence,
  })
  // Stable promotion requires explicit human approval and low-risk boundary clearance.
  const channel = input.humanApproval && input.riskScore < 70 ? 'stable' as const : 'candidate' as const
  const versionId = await client.mutation(api.scopeDFunctionsBatchOne.registerSkillVersionTag, {
    requestKey: input.requestKey + '-skill-version',
    packageKey: input.packageKey,
    version: input.version,
    contentDigest: input.contentDigest,
    channel,
  })
  return { promoted: channel === 'stable', boundary, proposalId, versionId, channel }
}
