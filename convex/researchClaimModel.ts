import { v } from 'convex/values'
export const claimFinding = v.union(v.literal('supporting'),v.literal('contradicting'),v.literal('unresolved'))
export const researchClaimFields = {
 missionId:v.id('missions'), researchId:v.id('research'), claim:v.string(), finding:claimFinding,
 citation:v.string(), excerpt:v.string(), rationale:v.string(), researchQuery:v.string(),
 sourceCaptureId:v.optional(v.id('researchSourceCaptures')),excerptBasis:v.optional(v.union(v.literal('saved_research'),v.literal('retrieved_source'))),sourceTextSha256:v.optional(v.string()),sourceFinalUrl:v.optional(v.string()),sourceCapturedAt:v.optional(v.number()),
 researchSavedAt:v.number(), createdAt:v.number(), ownerKey:v.string(),
}
