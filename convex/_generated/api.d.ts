/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as adaptiveRuntime from "../adaptiveRuntime.js";
import type * as aiProvider from "../aiProvider.js";
import type * as artifactBenchmarkCatalog from "../artifactBenchmarkCatalog.js";
import type * as artifactCi from "../artifactCi.js";
import type * as artifactCiActions from "../artifactCiActions.js";
import type * as artifactCiProvenance from "../artifactCiProvenance.js";
import type * as artifactCiValidators from "../artifactCiValidators.js";
import type * as artifactQuality from "../artifactQuality.js";
import type * as artifactTestPlan from "../artifactTestPlan.js";
import type * as artifactTests from "../artifactTests.js";
import type * as artifacts from "../artifacts.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as benchmarkProvenance from "../benchmarkProvenance.js";
import type * as benchmarks from "../benchmarks.js";
import type * as billing from "../billing.js";
import type * as billingDiagnostics from "../billingDiagnostics.js";
import type * as billingModel from "../billingModel.js";
import type * as billingRates from "../billingRates.js";
import type * as billingReview from "../billingReview.js";
import type * as billingUsage from "../billingUsage.js";
import type * as blueprintCompleteness from "../blueprintCompleteness.js";
import type * as blueprintGeneration from "../blueprintGeneration.js";
import type * as boundedResponse from "../boundedResponse.js";
import type * as capacityInspection from "../capacityInspection.js";
import type * as claimedEffects from "../claimedEffects.js";
import type * as clientDelivery from "../clientDelivery.js";
import type * as completedCouncil from "../completedCouncil.js";
import type * as continuation from "../continuation.js";
import type * as continuationPolicy from "../continuationPolicy.js";
import type * as councilMemoryCandidate from "../councilMemoryCandidate.js";
import type * as councilMemoryModel from "../councilMemoryModel.js";
import type * as delivery from "../delivery.js";
import type * as deliveryDispatch from "../deliveryDispatch.js";
import type * as deliveryDispatchAction from "../deliveryDispatchAction.js";
import type * as deliveryEvidence from "../deliveryEvidence.js";
import type * as deliveryRecovery from "../deliveryRecovery.js";
import type * as enterpriseIdentity from "../enterpriseIdentity.js";
import type * as evidenceAdmission from "../evidenceAdmission.js";
import type * as exclusiveWork from "../exclusiveWork.js";
import type * as executionClaims from "../executionClaims.js";
import type * as executionRequirements from "../executionRequirements.js";
import type * as executionReview from "../executionReview.js";
import type * as externalRuntime from "../externalRuntime.js";
import type * as forge from "../forge.js";
import type * as forgeTeams from "../forgeTeams.js";
import type * as frontierControls from "../frontierControls.js";
import type * as frontierLab from "../frontierLab.js";
import type * as frontierModel from "../frontierModel.js";
import type * as frontierSupport from "../frontierSupport.js";
import type * as geminiMedia from "../geminiMedia.js";
import type * as githubWriteTools from "../githubWriteTools.js";
import type * as http from "../http.js";
import type * as incidentParser from "../incidentParser.js";
import type * as incidentSafety from "../incidentSafety.js";
import type * as incidents from "../incidents.js";
import type * as intelligenceOrchestrator from "../intelligenceOrchestrator.js";
import type * as intentContract from "../intentContract.js";
import type * as learningEngine from "../learningEngine.js";
import type * as learningReviewModel from "../learningReviewModel.js";
import type * as learningReviews from "../learningReviews.js";
import type * as liveComparisons from "../liveComparisons.js";
import type * as manifestIntelligence from "../manifestIntelligence.js";
import type * as manifestStrategyParser from "../manifestStrategyParser.js";
import type * as mediaChain from "../mediaChain.js";
import type * as mediaChainState from "../mediaChainState.js";
import type * as memory from "../memory.js";
import type * as memoryContext from "../memoryContext.js";
import type * as missionContract from "../missionContract.js";
import type * as missionRunner from "../missionRunner.js";
import type * as missionSources from "../missionSources.js";
import type * as missionUsageBudget from "../missionUsageBudget.js";
import type * as missions from "../missions.js";
import type * as multimodalRuntime from "../multimodalRuntime.js";
import type * as opportunityObservationModel from "../opportunityObservationModel.js";
import type * as opportunityObservations from "../opportunityObservations.js";
import type * as opportunityPlanModel from "../opportunityPlanModel.js";
import type * as opportunityPlans from "../opportunityPlans.js";
import type * as orchestration from "../orchestration.js";
import type * as otpDelivery from "../otpDelivery.js";
import type * as outcomeFeeds from "../outcomeFeeds.js";
import type * as payments from "../payments.js";
import type * as permissions from "../permissions.js";
import type * as platformTaskModel from "../platformTaskModel.js";
import type * as platformTasks from "../platformTasks.js";
import type * as portfolio from "../portfolio.js";
import type * as portfolioHistory from "../portfolioHistory.js";
import type * as privateMedia from "../privateMedia.js";
import type * as productEvidenceImport from "../productEvidenceImport.js";
import type * as productOutcomeModel from "../productOutcomeModel.js";
import type * as productTelemetry from "../productTelemetry.js";
import type * as providerAccounting from "../providerAccounting.js";
import type * as providerClaimFence from "../providerClaimFence.js";
import type * as providerHealth from "../providerHealth.js";
import type * as providerReconciliation from "../providerReconciliation.js";
import type * as providerReconciliationModel from "../providerReconciliationModel.js";
import type * as providerRecovery from "../providerRecovery.js";
import type * as providerUsage from "../providerUsage.js";
import type * as providerUsageModel from "../providerUsageModel.js";
import type * as readiness from "../readiness.js";
import type * as recordAdmission from "../recordAdmission.js";
import type * as recordCapacityModel from "../recordCapacityModel.js";
import type * as reproducibleBenchmarks from "../reproducibleBenchmarks.js";
import type * as research from "../research.js";
import type * as researchClaimModel from "../researchClaimModel.js";
import type * as researchClaims from "../researchClaims.js";
import type * as researchData from "../researchData.js";
import type * as researchResponse from "../researchResponse.js";
import type * as researchSourceModel from "../researchSourceModel.js";
import type * as researchSources from "../researchSources.js";
import type * as resourceCapacity from "../resourceCapacity.js";
import type * as resourceCleanup from "../resourceCleanup.js";
import type * as runtimeCapacity from "../runtimeCapacity.js";
import type * as runtimeReceipts from "../runtimeReceipts.js";
import type * as signInOptions from "../signInOptions.js";
import type * as siteTraffic from "../siteTraffic.js";
import type * as siteTrafficModel from "../siteTrafficModel.js";
import type * as strategyDiversity from "../strategyDiversity.js";
import type * as studio from "../studio.js";
import type * as studioModel from "../studioModel.js";
import type * as teamDirectorySync from "../teamDirectorySync.js";
import type * as teamProvisioning from "../teamProvisioning.js";
import type * as unstartedRetry from "../unstartedRetry.js";
import type * as users from "../users.js";
import type * as verification from "../verification.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  adaptiveRuntime: typeof adaptiveRuntime;
  aiProvider: typeof aiProvider;
  artifactBenchmarkCatalog: typeof artifactBenchmarkCatalog;
  artifactCi: typeof artifactCi;
  artifactCiActions: typeof artifactCiActions;
  artifactCiProvenance: typeof artifactCiProvenance;
  artifactCiValidators: typeof artifactCiValidators;
  artifactQuality: typeof artifactQuality;
  artifactTestPlan: typeof artifactTestPlan;
  artifactTests: typeof artifactTests;
  artifacts: typeof artifacts;
  audit: typeof audit;
  auth: typeof auth;
  benchmarkProvenance: typeof benchmarkProvenance;
  benchmarks: typeof benchmarks;
  billing: typeof billing;
  billingDiagnostics: typeof billingDiagnostics;
  billingModel: typeof billingModel;
  billingRates: typeof billingRates;
  billingReview: typeof billingReview;
  billingUsage: typeof billingUsage;
  blueprintCompleteness: typeof blueprintCompleteness;
  blueprintGeneration: typeof blueprintGeneration;
  boundedResponse: typeof boundedResponse;
  capacityInspection: typeof capacityInspection;
  claimedEffects: typeof claimedEffects;
  clientDelivery: typeof clientDelivery;
  completedCouncil: typeof completedCouncil;
  continuation: typeof continuation;
  continuationPolicy: typeof continuationPolicy;
  councilMemoryCandidate: typeof councilMemoryCandidate;
  councilMemoryModel: typeof councilMemoryModel;
  delivery: typeof delivery;
  deliveryDispatch: typeof deliveryDispatch;
  deliveryDispatchAction: typeof deliveryDispatchAction;
  deliveryEvidence: typeof deliveryEvidence;
  deliveryRecovery: typeof deliveryRecovery;
  enterpriseIdentity: typeof enterpriseIdentity;
  evidenceAdmission: typeof evidenceAdmission;
  exclusiveWork: typeof exclusiveWork;
  executionClaims: typeof executionClaims;
  executionRequirements: typeof executionRequirements;
  executionReview: typeof executionReview;
  externalRuntime: typeof externalRuntime;
  forge: typeof forge;
  forgeTeams: typeof forgeTeams;
  frontierControls: typeof frontierControls;
  frontierLab: typeof frontierLab;
  frontierModel: typeof frontierModel;
  frontierSupport: typeof frontierSupport;
  geminiMedia: typeof geminiMedia;
  githubWriteTools: typeof githubWriteTools;
  http: typeof http;
  incidentParser: typeof incidentParser;
  incidentSafety: typeof incidentSafety;
  incidents: typeof incidents;
  intelligenceOrchestrator: typeof intelligenceOrchestrator;
  intentContract: typeof intentContract;
  learningEngine: typeof learningEngine;
  learningReviewModel: typeof learningReviewModel;
  learningReviews: typeof learningReviews;
  liveComparisons: typeof liveComparisons;
  manifestIntelligence: typeof manifestIntelligence;
  manifestStrategyParser: typeof manifestStrategyParser;
  mediaChain: typeof mediaChain;
  mediaChainState: typeof mediaChainState;
  memory: typeof memory;
  memoryContext: typeof memoryContext;
  missionContract: typeof missionContract;
  missionRunner: typeof missionRunner;
  missionSources: typeof missionSources;
  missionUsageBudget: typeof missionUsageBudget;
  missions: typeof missions;
  multimodalRuntime: typeof multimodalRuntime;
  opportunityObservationModel: typeof opportunityObservationModel;
  opportunityObservations: typeof opportunityObservations;
  opportunityPlanModel: typeof opportunityPlanModel;
  opportunityPlans: typeof opportunityPlans;
  orchestration: typeof orchestration;
  otpDelivery: typeof otpDelivery;
  outcomeFeeds: typeof outcomeFeeds;
  payments: typeof payments;
  permissions: typeof permissions;
  platformTaskModel: typeof platformTaskModel;
  platformTasks: typeof platformTasks;
  portfolio: typeof portfolio;
  portfolioHistory: typeof portfolioHistory;
  privateMedia: typeof privateMedia;
  productEvidenceImport: typeof productEvidenceImport;
  productOutcomeModel: typeof productOutcomeModel;
  productTelemetry: typeof productTelemetry;
  providerAccounting: typeof providerAccounting;
  providerClaimFence: typeof providerClaimFence;
  providerHealth: typeof providerHealth;
  providerReconciliation: typeof providerReconciliation;
  providerReconciliationModel: typeof providerReconciliationModel;
  providerRecovery: typeof providerRecovery;
  providerUsage: typeof providerUsage;
  providerUsageModel: typeof providerUsageModel;
  readiness: typeof readiness;
  recordAdmission: typeof recordAdmission;
  recordCapacityModel: typeof recordCapacityModel;
  reproducibleBenchmarks: typeof reproducibleBenchmarks;
  research: typeof research;
  researchClaimModel: typeof researchClaimModel;
  researchClaims: typeof researchClaims;
  researchData: typeof researchData;
  researchResponse: typeof researchResponse;
  researchSourceModel: typeof researchSourceModel;
  researchSources: typeof researchSources;
  resourceCapacity: typeof resourceCapacity;
  resourceCleanup: typeof resourceCleanup;
  runtimeCapacity: typeof runtimeCapacity;
  runtimeReceipts: typeof runtimeReceipts;
  signInOptions: typeof signInOptions;
  siteTraffic: typeof siteTraffic;
  siteTrafficModel: typeof siteTrafficModel;
  strategyDiversity: typeof strategyDiversity;
  studio: typeof studio;
  studioModel: typeof studioModel;
  teamDirectorySync: typeof teamDirectorySync;
  teamProvisioning: typeof teamProvisioning;
  unstartedRetry: typeof unstartedRetry;
  users: typeof users;
  verification: typeof verification;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
