import {studioTables} from './studioModel'
import { learningReviewFields } from './learningReviewModel'
import { sourceCaptureFields } from './researchSourceModel'
import { observationFields } from './opportunityObservationModel'
import { opportunityPlanFields } from './opportunityPlanModel'
import { researchClaimFields } from './researchClaimModel'
import { reconciliationFields } from './providerReconciliationModel'
import { billingTables } from './billingModel'
import { taskFields } from './platformTaskModel'
import { frontierTables } from './frontierModel'
import { invocationFields } from './providerUsageModel'
import { councilSelectionFields, councilEvaluationFields, councilPolicyFields } from "./councilMemoryModel"
import { trafficFields } from "./siteTrafficModel"
import { productOutcomeFields } from "./productOutcomeModel"
import { artifactCiState } from "./artifactCiValidators"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export default defineSchema({
  ...studioTables,
  ...authTables,
  resourceReleaseJobs:defineTable({missionId:v.id('missions'),ownerKey:v.string(),generation:v.number(),status:v.union(v.literal('pending'),v.literal('complete'),v.literal('review')),released:v.number(),startedAt:v.number(),updatedAt:v.number(),finishedAt:v.optional(v.number()),error:v.optional(v.string())}).index('by_mission',['missionId']),
  manualMemoryAdmissions: defineTable({ownerKey:v.string(),memoryId:v.id('memories'),createdAt:v.number()}).index('by_owner',['ownerKey']),
  learningReviews: defineTable(learningReviewFields).index('by_owner',['ownerKey']),
  researchSourceCaptures: defineTable(sourceCaptureFields).index('by_research',['researchId']),
  opportunityObservations: defineTable(observationFields).index('by_plan',['planId']),
  opportunityPlans: defineTable(opportunityPlanFields).index('by_strategy',['strategyId']),
  researchClaims: defineTable(researchClaimFields).index('by_mission',['missionId']),
  ...billingTables,
  providerReconciliations: defineTable(reconciliationFields).index('by_owner', ['ownerKey']),
  platformTaskRuns: defineTable(taskFields).index('by_owner', ['ownerKey']).index('by_mission', ['missionId']).index('by_source', ['sourceRef']),
  ...frontierTables,
  providerInvocations: defineTable(invocationFields).index('by_owner_started', ['ownerKey', 'startedAt']).index('by_owner', ['ownerKey']).index('by_mission', ['missionId']).index('by_missionRunId_and_stage_and_role_and_outcome', ['missionRunId', 'stage', 'role', 'outcome']),
  executionEffects: defineTable({ claimId: v.id('executionClaims'), effectKey: v.string(), payload: v.string() }).index('by_claim', ['claimId']).index('by_claimId_and_effectKey', ['claimId', 'effectKey']),
  executionClaims: defineTable({ missionId: v.id('missions'), scope: v.string(), workKey: v.string(), status: v.union(v.literal('running'), v.literal('uncertain'), v.literal('complete')), result: v.optional(v.string()), createdAt: v.number() }).index('by_mission', ['missionId']).index('by_missionId_and_scope_and_status', ['missionId', 'scope', 'status']).index('by_missionId_and_scope_and_workKey', ['missionId', 'scope', 'workKey']).index('by_missionId_and_status', ['missionId', 'status']),
  providerResults: defineTable({ invocationId: v.id('providerInvocations'), requestDigest: v.string(), answer: v.string() }).index('by_invocation', ['invocationId']),
  missions: defineTable({ title: v.string(), mission: v.string(), autonomy: v.string(), budget: v.number(), status: v.union(v.literal("draft"), v.literal("running"), v.literal("review"), v.literal("complete"), v.literal("cancelled")), completion: v.number(), approved: v.boolean(), ownerKey: v.string() }).index("by_owner", ["ownerKey"]).index("by_owner_status", ["ownerKey", "status"]),
  missionRuns: defineTable({ missionId: v.id("missions"), startedAt: v.number(), deadlineAt: v.number(), maxRetries: v.number(), retries: v.number(), status: v.union(v.literal("running"), v.literal("paused"), v.literal("blocked"), v.literal("complete")), currentStage: v.string(), nextActionAt: v.number(), lastError: v.optional(v.string()) }).index("by_mission", ["missionId"]),
  agentRuns: defineTable({ missionId: v.id("missions"), agent: v.string(), role: v.string(), status: v.string(), progress: v.number(), note: v.string() }).index("by_mission", ["missionId"]),
  evidence: defineTable({ missionId: v.id("missions"), agent: v.string(), message: v.string(), score: v.number(), severity: v.string() }).index("by_mission", ["missionId"]),
  councilMemoryReceipts: defineTable(councilSelectionFields).index("by_mission", ["missionId"]),
  councilPolicyComparisons: defineTable(councilPolicyFields).index("by_receipt", ["receiptId"]).index("by_evaluation", ["evaluationId"]),
  councilMemoryEvaluations: defineTable(councilEvaluationFields).index("by_receipt", ["receiptId"]),
  memories: defineTable({ ownerKey: v.string(), missionId: v.optional(v.id("missions")), category: v.string(), key: v.string(), value: v.string(), confidence: v.number(), source: v.string() }).index("by_owner", ["ownerKey"]).index("by_owner_category", ["ownerKey", "category"]).index("by_owner_category_key", ["ownerKey", "category", "key"]).index("by_owner_mission", ["ownerKey", "missionId"]).index("by_owner_mission_category", ["ownerKey", "missionId", "category"]).searchIndex("search_value", { searchField: "value", filterFields: ["ownerKey", "missionId", "category"] }),
  research: defineTable({ missionId: v.id("missions"), query: v.string(), result: v.string(), citations: v.array(v.string()), createdAt: v.number() }).index("by_mission", ["missionId"]),
  artifactTestRuns: defineTable({
    missionId: v.id("missions"), artifactId: v.id("artifacts"), operatorId: v.string(),
    runnerVersion: v.string(), missionSnapshot: v.string(), artifactSnapshot: v.string(),
    ci: v.optional(artifactCiState), criteria: v.array(v.string()),
    plan: v.array(v.object({ criterionIndex: v.number(), steps: v.array(v.object({ action: v.union(v.literal("fill"), v.literal("click"), v.literal("assertText"), v.literal("assertTextEquals"), v.literal("assertValue"), v.literal("assertVisible"), v.literal("assertInvalid")), selector: v.string(), value: v.string() })) })),
    results: v.array(v.array(v.object({ status: v.union(v.literal("pass"), v.literal("fail"), v.literal("not_run")), detail: v.string() }))),
    passed: v.number(), failed: v.number(), notRun: v.number(), covered: v.number(), total: v.number(), allPassed: v.boolean(), createdAt: v.number(),
  }).index("by_artifact", ["artifactId"]),
  benchmarkReceipts: defineTable({
    operatorId: v.string(), repository: v.string(), runId: v.string(), runUrl: v.string(), commitSha: v.string(), attempt: v.number(),
    workflowPath: v.string(), jobName: v.string(), jobConclusion: v.string(), runConclusion: v.string(), suiteVersion: v.string(),
    outcome: v.union(v.literal("passed"), v.literal("failed"), v.literal("not_run")), recordedAt: v.number(),
  }).index("by_operator", ["operatorId"]).index("by_operator_run", ["operatorId", "runId", "attempt"]),
  artifacts: defineTable({ missionId: v.id("missions"), type: v.string(), name: v.string(), content: v.string(), status: v.string(), requiresApproval: v.boolean() }).index("by_mission", ["missionId"]),
  deliveries: defineTable({ missionId: v.id("missions"), artifactId: v.optional(v.id("artifacts")), target: v.string(), branch: v.string(), stage: v.union(v.literal("prepared"), v.literal("approval"), v.literal("github"), v.literal("build"), v.literal("test"), v.literal("deploy"), v.literal("verified"), v.literal("blocked")), approved: v.boolean(), status: v.string(), evidence: v.string(), workflowRunUrl: v.optional(v.string()), workflowConclusion: v.optional(v.string()), workflowCommitSha: v.optional(v.string()), workflowRecordedAt: v.optional(v.number()), deploymentRunUrl: v.optional(v.string()), deploymentCommitSha: v.optional(v.string()), deploymentUrl: v.optional(v.string()), readinessStatus: v.optional(v.union(v.literal("pass"), v.literal("fail"))), readinessPassedCount: v.optional(v.number()), readinessTotalCount: v.optional(v.number()), readinessCheckedAt: v.optional(v.number()), createdAt: v.number() }).index("by_mission", ["missionId"]),
  verifications: defineTable({ missionId: v.id("missions"), deliveryId: v.id("deliveries"), passed: v.boolean(), score: v.number(), criteria: v.array(v.string()), evidence: v.array(v.string()), summary: v.string(), createdAt: v.number() }).index("by_mission", ["missionId"]).index("by_delivery", ["deliveryId"]),
  deliveryDispatchAttempts: defineTable({deliveryId:v.id("deliveries"),missionId:v.id("missions"),ownerKey:v.string(),artifactId:v.id("artifacts"),artifactDigest:v.string(),target:v.string(),branch:v.string(),generation:v.number(),phase:v.union(v.literal("preflight"),v.literal("commit"),v.literal("dispatch")),status:v.union(v.literal("running"),v.literal("dispatched"),v.literal("rejected"),v.literal("uncertain"),v.literal("reviewed")),commitSha:v.optional(v.string()),result:v.optional(v.string()),message:v.optional(v.string()),reviewRunUrl:v.optional(v.string()),createdAt:v.number(),updatedAt:v.number()}).index("by_delivery",["deliveryId"]).index("by_delivery_review_run",["deliveryId","reviewRunUrl"]),
  deliveryOutcomeReceipts: defineTable({deliveryId:v.id("deliveries"),missionId:v.id("missions"),snapshot:v.string(),verificationId:v.id("verifications"),measurementId:v.id("measurements"),passed:v.boolean(),score:v.number(),createdAt:v.number()}).index("by_delivery",["deliveryId"]),
  siteTrafficReceipts: defineTable(trafficFields).index("by_owner", ["ownerKey"]).index("by_owner_source", ["ownerKey", "sourceKey"]),
  productOutcomes: defineTable(productOutcomeFields).index("by_owner", ["ownerKey"]).index("by_mission", ["missionId"]).index("by_owner_import", ["ownerKey", "importKey"]).index("by_owner_report", ["ownerKey", "missionId", "importReceipt.path", "importReceipt.reportSha256"]),
  measurements: defineTable({ missionId: v.id("missions"), verificationId: v.optional(v.id("verifications")), metric: v.string(), actual: v.number(), target: v.number(), unit: v.string(), status: v.union(v.literal("pass"), v.literal("fail"), v.literal("partial")), evidence: v.array(v.string()), createdAt: v.number() }).index("by_mission", ["missionId"]).index("by_mission_created", ["missionId", "createdAt"]).index("by_verification", ["verificationId"]),
  incidents: defineTable({ missionId: v.id("missions"), runId: v.optional(v.id("missionRuns")), kind: v.string(), stage: v.string(), message: v.string(), attempts: v.number(), status: v.union(v.literal("open"), v.literal("resolved"), v.literal("escalated")), recovery: v.optional(v.string()), lesson: v.optional(v.string()), diagnosis: v.optional(v.string()), proposedRecovery: v.optional(v.string()), diagnosisConfidence: v.optional(v.number()), createdAt: v.number(), resolvedAt: v.optional(v.number()) }).index("by_mission", ["missionId"]).index("by_mission_status", ["missionId", "status"]).index("by_status", ["status"]).index("by_run_status", ["runId", "status"]),
  portfolioDecisions: defineTable({ missionId: v.id("missions"), priorityRank: v.number(), action: v.string(), decision: v.union(v.literal("approve"), v.literal("reject"), v.literal("defer"), v.literal("escalate")), note: v.optional(v.string()), createdAt: v.number() }).index("by_mission", ["missionId"]).index("by_decision", ["decision"]),
  auditEvents: defineTable({ missionId: v.id("missions"), eventType: v.string(), source: v.string(), message: v.string(), runId: v.optional(v.id("missionRuns")), deliveryId: v.optional(v.id("deliveries")), verificationId: v.optional(v.id("verifications")), decisionId: v.optional(v.id("portfolioDecisions")), metadata: v.optional(v.string()), createdAt: v.number() }).index("by_mission", ["missionId"]).index("by_type", ["eventType"]),
  missionDependencies: defineTable({ missionId: v.id("missions"), dependsOnMissionId: v.id("missions"), kind: v.union(v.literal("blocks"), v.literal("informs")), note: v.optional(v.string()), createdAt: v.number() }).index("by_mission", ["missionId"]).index("by_dependency", ["dependsOnMissionId"]),
  missionResources: defineTable({ missionId: v.id("missions"), resourceKey: v.string(), mode: v.union(v.literal("exclusive"), v.literal("shared")), status: v.union(v.literal("requested"), v.literal("held"), v.literal("released")), heldAt: v.optional(v.number()), releasedAt: v.optional(v.number()) }).index("by_mission", ["missionId"]).index("by_mission_status", ["missionId", "status"]).index("by_resource", ["resourceKey"]).index("by_resource_status", ["resourceKey", "status"]),
  readinessRuns: defineTable({ siteUrl: v.string(), label: v.string(), status: v.union(v.literal("pass"), v.literal("fail")), passedCount: v.number(), failedCount: v.number(), totalCount: v.number(), ranAt: v.number(), operatorId: v.optional(v.string()) }).index("by_ranAt", ["ranAt"]).index("by_operator_ranAt", ["operatorId", "ranAt"]),
  readinessChecks: defineTable({ runId: v.id("readinessRuns"), checkKey: v.string(), name: v.string(), criterion: v.string(), severity: v.union(v.literal("required"), v.literal("warning")), status: v.union(v.literal("pass"), v.literal("fail")), detail: v.string(), evidence: v.string(), ranAt: v.number() }).index("by_run", ["runId"]),
  opportunityRecommendations: defineTable({ ownerKey: v.string(), title: v.string(), mission: v.string(), rationale: v.array(v.string()), evidence: v.array(v.string()), status: v.union(v.literal("recommended"), v.literal("accepted"), v.literal("dismissed")), createdAt: v.number() }).index("by_owner", ["ownerKey"]).index("by_status", ["status"]),
  providerHealthChecks: defineTable({ name: v.string(), label: v.string(), configured: v.boolean(), status: v.union(v.literal("healthy"), v.literal("degraded"), v.literal("offline"), v.literal("unconfigured")), latencyMs: v.number(), detail: v.string(), checkedAt: v.number(), operatorId: v.string() }).index("by_checkedAt", ["checkedAt"]).index("by_provider_checkedAt", ["name", "checkedAt"]).index("by_operator_checkedAt", ["operatorId", "checkedAt"]),
})
