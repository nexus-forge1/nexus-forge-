// Cap-01 through Cap-18 — existing platform capability coordinators.
export {
  prepareMissionLifecycle,
  completeMissionFromReleaseEvidence,
} from './mission-lifecycle-coordinator'
export type { MissionLifecycleResult } from './mission-lifecycle-coordinator'

export { compileIntentAndEvaluateCouncil } from './council-intent-engine'
export type { CouncilDispatchResult } from './council-intent-engine'

export { synchronizeVisualToFeature } from './visual-feature-sync-engine'
export { verifySkillEvolutionLineage } from './evolution-skill-lineage'
export { coordinateReplayAndMemoryLifecycle } from './replay-memory-governance'
export { recordTelemetryAndResolveRouting } from './routing-telemetry-pipeline'
export { enforcePreExecutionSafety } from './safety-policy-enforcement-engine'
export { coordinateReleaseVerification } from './release-verification-pipeline'
export { coordinateEnterpriseGovernance } from './enterprise-governance-orchestrator'
export { coordinateIncidentContainment } from './resilience-incident-coordinator'
export { coordinateDeveloperIntegrationLifecycle } from './developer-ecosystem-controller'
export { coordinateResearchWithContainment } from './research-containment-guard'
export { coordinateModernizationVerification } from './modernization-verification-pipeline'
export { coordinateCommercialSynthesis } from './commercial-synthesis-engine'
export { coordinateLaunchOperations } from './launch-operations-orchestrator'
export { coordinateEphemeralIsolation } from './ephemeral-isolation-coordinator'
export { coordinateCanaryAndRecovery } from './canary-recovery-engine'
export { coordinateDiagnosticsAndSovereignExit } from './diagnostics-exit-bundler'

// Cap-19 — Super-Intelligence App Generation.
export { coordinateSuperAppBuild } from './super-app-builder-coordinator'
export type { SuperAppBuildInput } from './super-app-builder-coordinator'

// Cap-20 — Self-Healing Diagnostic & Sandbox Verification.
export { coordinateSelfHealing } from './self-healing-coordinator'
export type { SelfHealingInput } from './self-healing-coordinator'

// Cap-21 — Dynamic Swarm Elastic Rebalancing.
export { coordinateSwarmOrchestration } from './swarm-orchestration-coordinator'
export type { SwarmOrchestrationInput } from './swarm-orchestration-coordinator'

// Cap-22 — Agent Heartbeat & Autonomous Failover.
export { coordinateAgentWatchdog } from './agent-watchdog-coordinator'
export type { AgentWatchdogInput } from './agent-watchdog-coordinator'

// Cap-23 — Multi-Model Arbitrage & Dynamic Routing.
export { coordinateArbitrageRouting } from './arbitrage-routing-coordinator'
export type { ArbitrageRoutingInput } from './arbitrage-routing-coordinator'

// Cap-24 — Deterministic State Scrubber & Audit Receipt.
export { coordinateEventScrubber } from './event-scrubber-coordinator'
export type { EventScrubberInput } from './event-scrubber-coordinator'

// Cap-25 — Cryptographic Compliance & Sovereign Export.
export { coordinateCompliancePackager } from './compliance-packager-coordinator'
export type { CompliancePackagerInput } from './compliance-packager-coordinator'