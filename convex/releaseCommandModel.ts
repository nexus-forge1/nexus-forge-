import {defineTable} from 'convex/server'
import {v} from 'convex/values'
export const envEntry=v.object({key:v.string(),classification:v.union(v.literal('server'),v.literal('browser'),v.literal('managed')),valueOrReference:v.string()})
export const checkEntry=v.object({name:v.string(),status:v.union(v.literal('pass'),v.literal('fail'))})
export const exportEntry=v.object({kind:v.union(v.literal('code'),v.literal('schema'),v.literal('config'),v.literal('tests'),v.literal('docs')),reference:v.string()})
export const releaseTables={
 deploymentTargets:defineTable({ownerKey:v.string(),name:v.string(),runtime:v.string(),region:v.string(),capabilities:v.array(v.string()),adapter:v.string(),verified:v.union(v.literal('pending'),v.literal('verified')),verificationNote:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 previewEnvironments:defineTable({ownerKey:v.string(),branch:v.string(),note:v.string(),expiresAt:v.number(),budgetUsd:v.number(),status:v.union(v.literal('active'),v.literal('cleaned')),cleanupNote:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 environmentManifests:defineTable({ownerKey:v.string(),name:v.string(),revision:v.number(),entries:v.array(envEntry),rotationNote:v.string(),createdAt:v.number()}).index('by_owner_name_revision',['ownerKey','name','revision']),
 releaseRecords:defineTable({ownerKey:v.string(),label:v.string(),commitSha:v.string(),environment:v.string(),checks:v.array(checkEntry),status:v.union(v.literal('draft'),v.literal('approved'),v.literal('rejected'),v.literal('verified')),approvalNote:v.string(),liveVerificationNote:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
 recoveryPlans:defineTable({ownerKey:v.string(),label:v.string(),knownGoodSha:v.string(),compatibility:v.union(v.literal('unknown'),v.literal('checked')),compatibilityNote:v.string(),steps:v.array(v.string()),lastDrill:v.optional(v.object({outcome:v.string(),durationMinutes:v.number(),performedAt:v.number()})),createdAt:v.number()}).index('by_owner',['ownerKey']),
 diagnosticCases:defineTable({ownerKey:v.string(),title:v.string(),correlation:v.string(),reproduction:v.string(),proposedRepair:v.string(),previewVerificationNote:v.string(),status:v.union(v.literal('open'),v.literal('repaired'),v.literal('verified')),createdAt:v.number()}).index('by_owner',['ownerKey']),
 ownershipExports:defineTable({ownerKey:v.string(),label:v.string(),resources:v.string(),artifacts:v.array(exportEntry),attestationNote:v.string(),createdAt:v.number()}).index('by_owner',['ownerKey']),
}
export const sha=/^[0-9a-f]{7,40}$/
