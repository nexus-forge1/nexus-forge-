import {defineTable} from 'convex/server'
import {v} from 'convex/values'
export const evolutionTables={
 evolutionProposals:defineTable({ownerKey:v.string(),projectId:v.id('studioProjects'),proposalKey:v.string(),baselineId:v.id('skillVersions'),candidateId:v.id('skillVersions'),justification:v.string(),createdAt:v.number()}).index('by_project',['projectId']),
 evolutionReviews:defineTable({ownerKey:v.string(),proposalId:v.id('evolutionProposals'),requestKey:v.string(),auditDigest:v.string(),decision:v.union(v.literal('approve-pilot'),v.literal('reject')),reason:v.string(),createdAt:v.number()}).index('by_proposal',['proposalId']),
 evolutionPilots:defineTable({ownerKey:v.string(),proposalId:v.id('evolutionProposals'),projectId:v.id('studioProjects'),reviewId:v.id('evolutionReviews'),requestKey:v.string(),auditDigest:v.string(),maxRuns:v.number(),deadlineAt:v.number(),status:v.union(v.literal('active'),v.literal('rolled-back')),rollbackReason:v.string(),rolledBackAt:v.optional(v.number()),createdAt:v.number()}).index('by_project',['projectId']).index('by_proposal',['proposalId']),
 evolutionHandoffs:defineTable({ownerKey:v.string(),pilotId:v.id('evolutionPilots'),requestKey:v.string(),runId:v.id('missionGraphRuns'),createdAt:v.number()}).index('by_pilot',['pilotId']),
}
