import { api as generatedApi } from '../../convex/_generated/api'
import type { FunctionReference } from 'convex/server'

type QueryRef<Args extends Record<string, unknown> = Record<string, unknown>> = FunctionReference<'query', 'public', Args, any>
type MutationRef<Args extends Record<string, unknown> = Record<string, unknown>> = FunctionReference<'mutation', 'public', Args, any>
type ActionRef<Args extends Record<string, unknown> = Record<string, unknown>> = FunctionReference<'action', 'public', Args, any>
type PatchFile = { path: string; beforeDigest: string; afterDigest: string }
type BuildFile = { path: string; content: string; language: string }

type ScopeEApi = {
  scopeEFunctions: {
    intakeAppBuilderSpec: MutationRef<{ requestKey: string; specKey: string; title: string; description: string; requirements: string[]; d17IntentJson?: string; d19IntentJson?: string }>
    compileAppScaffold: ActionRef<{ title: string; description: string; requirements: string[]; specDigest: string }>
    transitionBuildLane: MutationRef<{ specKey: string; nextLane: 'Draft' | 'Scaffolded' | 'Ready to Synthesize'; scaffoldFiles?: BuildFile[]; scaffoldDigest?: string }>
    ingestDiagnosticTrace: MutationRef<{ requestKey: string; incidentKey: string; source: 'runtime' | 'compiler' | 'diagnostic'; trace: string[]; severity: 'low' | 'medium' | 'high' | 'critical'; d35IncidentKey?: string }>
    proposeSelfRepairPatch: QueryRef<{ incidentKey: string; patchFiles: PatchFile[]; maxFiles: number; rollbackDigest: string }>
    recordRepairSandboxReceipt: MutationRef<{ requestKey: string; incidentKey: string; patchFiles: PatchFile[]; rollbackDigest: string; sandboxPassed: boolean; containmentState: 'contained' | 'not_contained'; receipt: string }>
    registerSwarmTask: MutationRef<{ requestKey: string; missionKey: string; taskKey: string; requiredCapabilities: string[]; priority: number }>
    evaluateSwarmCapacity: QueryRef<{ missionKey: string; queueDepth: number; bottleneckThreshold: number; desiredCapabilities: string[] }>
    instantiateSwarmAgent: MutationRef<{ requestKey: string; agentKey: string; role: string; capabilities: string[]; capacity: number }>
    rebalanceSwarmTasks: MutationRef<{ requestKey: string; missionKey: string; taskKeys: string[] }>
    recordAgentHeartbeat: MutationRef<{ requestKey: string; agentKey: string; pulseAt: number; currentLoad: number; status: 'healthy' | 'degraded' | 'offline'; deadManTimeoutMs: number; failoverTargetKey?: string }>
    evaluateDeadManSwitch: QueryRef<{ agentKey: string; at?: number }>
    triggerFailoverReroute: MutationRef<{ requestKey: string; agentKey: string }>
    ingestProviderPricingSample: MutationRef<{ requestKey: string; provider: string; model: string; inputCostPerMillion: number; outputCostPerMillion: number; latencyMs: number; tokensPerSecond: number; available: boolean; sampledAt?: number }>
    calculateArbitrageRanking: QueryRef<{ maxSamples?: number; costWeight?: number; maxLatencyMs?: number; ruleKey?: string }>
    setArbitrageSwitchRule: MutationRef<{ requestKey: string; ruleKey: string; maxLatencyMs: number; maxCostPerMillion: number; minTokensPerSecond: number; costWeight: number; enabled: boolean }>
    recordMissionStateSnapshot: MutationRef<{ requestKey: string; missionKey: string; snapshotKey: string; sequence: number; stateJson: string; astJson: string }>
    fetchMissionHistoricalStates: QueryRef<{ missionKey: string; limit?: number }>
    diffHistoricalStateSnapshots: ActionRef<{ fromStateJson: string; toStateJson: string; fromAstJson: string; toAstJson: string }>
    exportEventScrubberReceipt: MutationRef<{ requestKey: string; missionKey: string; fromSnapshotKey: string; toSnapshotKey: string; diffDigest: string }>
    aggregateComplianceEvidence: QueryRef<{ missionKey: string }>
    recordComplianceDossierSeal: MutationRef<{ requestKey: string; missionKey: string; dossierKey: string; payloadJson: string; evidenceCount: number; riskCount: number; provenanceJson: string }>
    generateComplianceExportBundle: ActionRef<{ missionKey: string; dossierKey: string; manifest: string; provenanceJson: string }>
  }
}

/**
 * Frontend-only references for existing Scope E endpoints. Keeping this
 * separate avoids recursive type instantiation in the generated backend map.
 */
export const api = generatedApi as typeof generatedApi & ScopeEApi
