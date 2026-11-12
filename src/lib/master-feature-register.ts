import { guidedWorkspaces } from './workspaces'
import { roadmap } from '../routes/roadmap'
import { expansionPages } from '../components/expansion-guide'
import { expansionCatalog, starterPaths } from './expansion-catalog'

export type RegisterList = 'Original workspaces' | 'Roadmap milestones' | 'Expanded capability areas' | 'Productivity features' | '30-feature portfolio'
export type RegisterStatus = 'Complete' | 'Partial' | 'Deferred' | 'Wired + tested' | 'Bounded starter' | 'Source present'
export type RegisterEntry = {
  id: string
  name: string
  list: RegisterList
  category: string
  description: string
  acceptance: string
  route: string
  source: string
  status: RegisterStatus
  statusNote: string
  backend: string
  integration: string
  persistence: string
  userActions: string
  testEvidence: string
  liveVerification: string
  remainingGaps: string
  owner: string
  nextAction: string
}

const auditFields = {
  backend: 'No runtime backend is wired to this entry; it is a static tracking/reference page.',
  integration: 'Provider or external dependency not yet individually mapped.',
  persistence: 'No backend persistence contract applies to this static page.',
  userActions: 'Exercise the complete user journey on the linked route; page presence alone is not acceptance.',
  testEvidence: 'The repository regression suite passes; item-specific tests are not linked here yet.',
  liveVerification: 'Not individually verified end to end against the Live deployment.',
  remainingGaps: 'Feature-level traceability remains incomplete until backend, persistence, tests and live evidence are linked.',
  owner: 'NEXUS FORGE',
  nextAction: 'Trace route/component → Convex API/table → persistence → acceptance tests → preview E2E → scoped Live verification; record exact evidence and blockers.',
} satisfies Omit<RegisterEntry, 'id' | 'name' | 'list' | 'category' | 'description' | 'acceptance' | 'route' | 'source' | 'status' | 'statusNote'>

// Source-level API references traced from each route through its components and hooks.
// These are code references with linked regression tests, not proof that every runtime
// integration succeeds in the Live deployment.
const backendByRoute: Record<string, string> = {
  '/': 'convex/missions.ts, forge.ts, research.ts, artifacts.ts, delivery.ts, verification.ts, missionSources.ts via src/hooks/use-active-mission.ts',
  '/workflow': 'convex/missions.ts, orchestration.ts, missionRunner.ts, executionClaims.ts, artifacts.ts, delivery.ts, incidents.ts, memory.ts, portfolio.ts, providerHealth.ts, verification.ts via the guided workflow components',
  '/manifest': 'convex/manifestIntelligence.ts (blueprints, strategies, assumptions, outcomes), learningEngine.ts, opportunityPlans.ts via manifest and opportunity components',
  '/orchestrator': 'convex/intelligenceOrchestrator.ts (compileIntent, listRecent), missions.ts (create)',
  '/mission': 'convex/missions.ts (create, approve, select) via the mission console components',
  '/providers': 'convex/providerHealth.ts (check, history), providerUsage.ts, providerReconciliation.ts via the providers component',
  '/council': 'convex/forge.ts (orchestrate), memory.ts (remember) via the council components',
  '/evidence': 'convex/research.ts (search), researchClaims.ts, memory.ts via the research & memory components',
  '/artifacts': 'convex/artifacts.ts (generate, verify, approve), artifactTests.ts via the artifact forge components',
  '/delivery': 'convex/delivery.ts (prepare, approve, executeApproved, correctTarget, reviewFailedQaRun), deliveryDispatch.ts via the delivery components',
  '/readiness': 'convex/readiness.ts (run, getRun, listRuns) via the readiness component',
  '/portfolio': 'convex/portfolio.ts, portfolioHistory.ts, platformTasks.ts, verification.ts, productTelemetry.ts, outcomeFeeds.ts via the portfolio components',
  '/learning': 'convex/learningEngine.ts, learningReviews.ts, manifestIntelligence.ts, memory.ts, outcomeFeeds.ts, adaptiveRuntime.ts, reproducibleBenchmarks.ts via the learning components',
  '/capabilities': 'convex/verification.ts, incidents.ts, learningEngine.ts, providerHealth.ts, benchmarks.ts via the capability benchmark components',
  '/incidents': 'convex/incidents.ts (diagnose, list, reviewEscalated) via the incident components',
  '/release-evidence': 'convex/releaseEvidence.ts (submit, review, reviewQueue, grantReviewer, history, list, workspaceKey)',
  '/resilience': 'convex/backupInventory.ts, backupMonitor.ts, recoveryDrills.ts, frontierControls.ts via the resilience component',
  '/teams': 'convex/forgeTeams.ts, teamScim.ts, teamProvisioning.ts via the team governance component',
  '/developers': 'convex/frontierControls.ts via the developer contracts component',
  '/comparisons': 'convex/frontierLab.ts via the experiment lab component',
  '/science': 'convex/frontierLab.ts via the experiment lab component',
  '/generality': 'convex/frontierLab.ts via the experiment lab component',
  '/templates': 'convex/studio.ts (owner-scoped project studio records) via the mission templates component',
  '/knowledge': 'convex/studio.ts (owner-scoped document records) via the document knowledge component',
  '/notifications': 'convex/studio.ts (owner-scoped notification records) via the notification center component',
  '/specifications': 'convex/studio.ts (owner-scoped specification records) via the product specifications component',
  '/economics': 'convex/studio.ts (owner-scoped unit economics records) via the unit economics component',
  '/connections': 'convex/externalRuntime.ts via the integration center component',
  '/client-delivery': 'convex/clientDelivery.ts, artifacts.ts via the client delivery portal component',
  '/changes': 'convex/artifacts.ts, studio.ts via the change review component',
  '/browser-qa': 'convex/appFactoryDrafts.ts, appFactoryExecution.ts, appFactoryQaCi.ts, appFactoryQaRuns.ts, featureBuilder.ts via the app factory workbench',
  '/database-studio': 'convex/appFactoryDrafts.ts, appFactoryExecution.ts, appFactoryQaCi.ts, appFactoryQaRuns.ts, featureBuilder.ts via the app factory workbench',
  '/integration-contracts': 'convex/appFactoryDrafts.ts, appFactoryExecution.ts, appFactoryQaCi.ts, appFactoryQaRuns.ts, featureBuilder.ts via the app factory workbench',
  '/feature-builder': 'convex/featureBuilder.ts, studio.ts via the full-stack feature builder component',
  '/visual-builder': 'convex/visualBuilder.ts, featureBuilder.ts, studio.ts via the visual builder component',
  '/imports': 'convex/appImports.ts, appImportActions.ts, studio.ts via the app import component',
  '/portfolio-decisions': 'convex/portfolioStrategy.ts, portfolioHistory.ts, studio.ts via the portfolio decisions component',
  '/evolution': 'convex/evolution.ts, skillFoundry.ts, studio.ts via the evolution lab component',
  '/skills': 'convex/skillFoundry.ts, evaluations.ts, missionGraphs.ts, studio.ts via the skill foundry component',
  '/replay': 'convex/missionRuntime.ts, missionGraphs.ts, graphExecutionData.ts, studio.ts via the mission runtime component',
  '/memory-governance': 'convex/memoryGovernance.ts, memory.ts, studio.ts via the memory governance component',
  '/routing': 'convex/outcomeRouting.ts, missionGraphs.ts, studio.ts via the outcome routing component',
  '/mission-graphs': 'convex/missionGraphs.ts, studio.ts via the mission graph studio component',
  '/evaluations': 'convex/evaluations.ts via the evaluation lab component',
  '/evidence-graph': 'convex/evidenceGraph.ts, researchClaims.ts, studio.ts via the evidence graph component',
  '/experiments': 'convex/experiments.ts, evidenceGraph.ts via the experiment designer component',
  '/demand': 'convex/businessFactory.ts (evidence-recording ledger only; no real cloud provisioning)',
  '/monetization': 'convex/businessFactory.ts (evidence-recording ledger only; no real cloud provisioning)',
  '/customer-operations': 'convex/businessFactory.ts (evidence-recording ledger only; no real cloud provisioning)',
  '/growth': 'convex/businessFactory.ts (evidence-recording ledger only; no real cloud provisioning)',
  '/business-readiness': 'convex/businessFactory.ts (evidence-recording ledger only; no real cloud provisioning)',
  '/deployment-planner': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/previews': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/environments': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/releases': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/recovery': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/diagnostics': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/ownership': 'convex/releaseCommand.ts (evidence-recording ledger only; no real provisioning or deployment)',
  '/billing': 'convex/billing.ts (mine), payments.ts (portal) via the billing component',
  '/checkout': 'convex/payments.ts (checkout, portal) via the checkout component',
}
function backendFor(route: string) { return backendByRoute[route] ?? auditFields.backend }

// Exact repository test files linked by route. These prove only the covered test scope,
// not authenticated browser journeys or production behavior.
const testsByRoute: Record<string, string> = {
  '/': '__tests__/mission-guide-status.test.tsx, __tests__/page-progress.test.ts, __tests__/active-mission-selection.test.tsx, __tests__/use-owned-missions.test.tsx',
  '/workflow': '__tests__/workflow-e2e.test.tsx, __tests__/workflow-source-audit.test.tsx, __tests__/page-progress.test.ts',
  '/roadmap': '__tests__/roadmap-release-integration.test.tsx',
  '/manifest': '__tests__/manifest-persistence.test.ts, __tests__/manifest-receipt.test.ts, __tests__/manifest-outcome-signals.test.ts, __tests__/opportunity-plans.test.ts, __tests__/opportunity-observations.test.ts',
  '/orchestrator': '__tests__/orchestration-ownership.test.ts, __tests__/intent-contract.test.ts, __tests__/mission-runtime.test.ts',
  '/mission': '__tests__/mission-contract-safety.test.ts, __tests__/mission-control-preflight.test.tsx, __tests__/mission-control-recovery.test.tsx, __tests__/mission-selection.test.ts, __tests__/convex/enterprise-writes.test.ts',
  '/providers': '__tests__/provider-accounting.test.ts, __tests__/provider-reconciliation.test.ts, __tests__/provider-reconciliation-ui.test.tsx, __tests__/convex/provider-response-bounds.test.ts',
  '/council': '__tests__/completed-council.test.ts, __tests__/council-context.test.ts, __tests__/council-memory-selection.test.ts, __tests__/council-memory-ui.test.tsx',
  '/evidence': '__tests__/evidence-graph.test.ts, __tests__/memory-browse.test.ts, __tests__/research-gateway-bounds.test.ts, __tests__/convex/record-admission.test.ts',
  '/artifacts': '__tests__/artifact-coverage.test.ts, __tests__/artifact-quality.test.ts, __tests__/artifact-revision.test.ts, __tests__/artifact-delivery-lifecycle.test.ts',
  '/delivery': '__tests__/delivery-runtime-audit.test.ts, __tests__/delivery-evidence.test.ts, __tests__/delivery-recovery.test.ts, __tests__/delivery-callback-contract.test.ts, __tests__/convex/delivery-dispatch-safety.test.ts',
  '/readiness': '__tests__/readiness-safety.test.ts, __tests__/convex/readiness-egress.test.ts',
  '/portfolio': '__tests__/portfolio-recovery.test.tsx, __tests__/product-outcomes-ui.test.tsx, __tests__/platform-task-performance.test.ts, __tests__/platform-usage-evidence.test.tsx, __tests__/convex/platform-usage.test.ts, __tests__/convex/product-telemetry.test.ts, __tests__/product-instrumentation-setup.test.tsx, __tests__/convex/portfolio-history-bounds.test.ts',
  '/learning': '__tests__/learning-reviews.test.ts, __tests__/learning-review-model.test.ts, __tests__/learning-effectiveness-ui.test.tsx',
  '/capabilities': '__tests__/benchmark-provenance.test.ts, __tests__/incident-safety.test.ts, __tests__/convex/measured-outcome-replay.test.ts',
  '/incidents': '__tests__/incident-parser.test.ts, __tests__/incident-review.test.ts, __tests__/incident-safety.test.ts',
  '/release-evidence': '__tests__/release-evidence-ledger.test.ts, __tests__/release-evidence-auth.test.tsx, __tests__/production-release.test.tsx',
  '/resilience': '__tests__/convex/backup-inventory.test.ts, __tests__/convex/recovery-drills.test.ts',
  '/teams': '__tests__/convex/team-identity-safety.test.ts, __tests__/convex/team-scim-credentials.test.ts, __tests__/convex/directory-sync.test.ts, __tests__/convex/team-mission-unsharing.test.ts',
  '/developers': '__tests__/convex/developer-integration-safety.test.ts, __tests__/convex/control-retry-safety.test.ts',
  '/comparisons': '__tests__/convex/frontier-features.test.ts, __tests__/experiment-contracts.test.ts',
  '/science': '__tests__/convex/frontier-features.test.ts, __tests__/experiment-contracts.test.ts',
  '/generality': '__tests__/convex/frontier-features.test.ts, __tests__/experiment-contracts.test.ts',
  '/templates': '__tests__/project-studio-ui.test.tsx',
  '/knowledge': '__tests__/project-studio-ui.test.tsx, __tests__/memory-retrieval-ui.test.tsx',
  '/notifications': '__tests__/notification-center.test.tsx, __tests__/project-studio-ui.test.tsx',
  '/specifications': '__tests__/project-studio-ui.test.tsx',
  '/economics': '__tests__/project-studio-ui.test.tsx, __tests__/unit-economics-observed-baseline.test.tsx',
  '/connections': '__tests__/convex/developer-integration-safety.test.ts, __tests__/convex/control-retry-safety.test.ts',
  '/client-delivery': '__tests__/project-studio.test.ts, __tests__/artifact-delivery-lifecycle.test.ts',
  '/changes': '__tests__/change-review.test.tsx',
  '/browser-qa': '__tests__/app-factory-qa-ci.test.ts, __tests__/convex/app-factory-execution.test.ts, __tests__/convex/app-factory-qa-runs.test.ts',
  '/database-studio': '__tests__/app-factory-qa-ci.test.ts, __tests__/convex/app-factory-execution.test.ts, __tests__/convex/app-factory-qa-runs.test.ts',
  '/integration-contracts': '__tests__/app-factory-qa-ci.test.ts, __tests__/convex/app-factory-execution.test.ts, __tests__/convex/app-factory-qa-runs.test.ts',
  '/feature-builder': '__tests__/feature-builder.test.ts, __tests__/app-factory-contracts.test.ts, __tests__/app-factory-persistence.test.ts',
  '/visual-builder': '__tests__/visual-builder.test.ts, __tests__/feature-builder.test.ts',
  '/imports': '__tests__/app-imports.test.ts, __tests__/github-product-import.test.ts, __tests__/github-product-import-ui.test.tsx',
  '/portfolio-decisions': '__tests__/portfolio-strategy.test.ts, __tests__/convex/portfolio-history-bounds.test.ts',
  '/evolution': '__tests__/evolution.test.ts',
  '/skills': '__tests__/skill-foundry.test.ts',
  '/replay': '__tests__/mission-runtime.test.ts, __tests__/convex/measured-outcome-replay.test.ts, __tests__/mission-graphs.test.ts',
  '/memory-governance': '__tests__/memory-governance.test.ts, __tests__/convex/memory-scope-indexes.test.ts, __tests__/memory-browser.test.tsx',
  '/routing': '__tests__/outcome-routing.test.ts',
  '/mission-graphs': '__tests__/mission-graphs.test.ts, __tests__/graph-provider-execution.test.ts',
  '/evaluations': '__tests__/evaluation-lab.test.ts, __tests__/evaluation-lab-ui.test.tsx',
  '/evidence-graph': '__tests__/evidence-graph.test.ts',
  '/experiments': '__tests__/experiment-contracts.test.ts',
  '/demand': '__tests__/convex/factory-ops.test.ts',
  '/monetization': '__tests__/convex/factory-ops.test.ts',
  '/customer-operations': '__tests__/convex/factory-ops.test.ts',
  '/growth': '__tests__/convex/factory-ops.test.ts',
  '/business-readiness': '__tests__/convex/factory-ops.test.ts',
  '/deployment-planner': '__tests__/convex/factory-ops.test.ts',
  '/previews': '__tests__/convex/factory-ops.test.ts',
  '/environments': '__tests__/convex/factory-ops.test.ts',
  '/releases': '__tests__/convex/factory-ops.test.ts',
  '/recovery': '__tests__/convex/factory-ops.test.ts',
  '/diagnostics': '__tests__/convex/factory-ops.test.ts',
  '/ownership': '__tests__/convex/factory-ops.test.ts',
  '/billing': '__tests__/billing.test.ts, __tests__/payment-checkout-contract.test.ts',
  '/checkout': '__tests__/payment-checkout-contract.test.ts, __tests__/billing.test.ts',
}
function testEvidenceFor(route: string) {
  return testsByRoute[route] ?? auditFields.testEvidence
}
function persistenceFor(route: string) {
  return backendByRoute[route]
    ? 'Owner-scoped Convex tables behind the mapped modules; persistence behavior is exercised by the linked regression suites. Live-deployment write paths are not individually re-verified here.'
    : auditFields.persistence
}
function integrationFor(route: string) {
  if (route === '/providers' || route === '/routing') return 'Provider execution runs through the governed provider runtime; per-provider live reliability evidence remains open.'
  if (route === '/imports' || route === '/release-evidence') return 'Authenticated GitHub repository reads through the server integration; write boundaries are governed by the linked tests.'
  return 'Integration dependencies are per-route; the linked backend module and its tests define the exact external boundaries.'
}
function userActionsFor(route: string) {
  return backendByRoute[route] ? 'Available on the linked route; the complete authenticated journey is not recorded as evidence in this register.' : auditFields.userActions
}
function remainingGapsFor(route: string) {
  return backendByRoute[route]
    ? 'Route→backend wiring and repository tests are linked, and public Live route availability was probed on 2026-10-22; item-level authenticated E2E and scoped Live acceptance remain open.'
    : auditFields.remainingGaps
}

// Public Live route-probe evidence recorded 2026-10-22 (UTC) against the published site
// https://www.network-x-ai.com. These are anonymous route-level HTML availability checks
// (HTTP 200 or an expected by-design redirect). They are NOT authenticated end-to-end
// journeys, feature acceptance, or production claims; status labels are not upgraded by them.
const recentLiveProbe = {
  date: '2026-10-23',
  base: 'https://www.network-x-ai.com',
  ok: ['/portfolio', '/roadmap', '/evaluations', '/providers', '/economics', '/comparisons'],
} as const

const liveProbe = {
  date: '2026-10-22',
  base: 'https://www.network-x-ai.com',
  ok: [
    '/', '/artifacts', '/billing', '/browser-qa', '/business-readiness', '/capabilities', '/changes',
    '/client-delivery', '/comparisons', '/connections', '/council', '/customer-operations', '/database-studio',
    '/delivery', '/demand', '/deployment-planner', '/developers', '/diagnostics', '/economics', '/environments',
    '/evaluations', '/evidence', '/evidence-graph', '/evolution', '/experiments', '/feature-builder', '/generality',
    '/growth', '/imports', '/incidents', '/integration-contracts', '/knowledge', '/learning', '/manifest',
    '/memory-governance', '/mission', '/mission-graphs', '/monetization', '/notifications', '/orchestrator',
    '/ownership', '/portfolio', '/portfolio-decisions', '/previews', '/providers', '/readiness', '/recovery',
    '/release-evidence', '/releases', '/replay', '/resilience', '/roadmap', '/routing', '/science', '/skills',
    '/specifications', '/teams', '/templates', '/visual-builder', '/workflow',
  ],
  byDesignRedirects: { '/checkout': 'HTTP 307 to /checkout?product= (validated search param) which returns HTTP 200' },
} as const
function liveVerificationFor(route: string) {
  if ((recentLiveProbe.ok as readonly string[]).includes(route)) {
    return `Public Live route probe returned HTTP 200 on ${recentLiveProbe.date} (${recentLiveProbe.base}${route}); route-level availability only, not an authenticated end-to-end or Live acceptance claim.`
  }
  const redirect = (liveProbe.byDesignRedirects as Record<string, string>)[route]
  if (redirect) {
    return `Public Live probe on ${liveProbe.date}: ${redirect}; route-level availability only, not an authenticated end-to-end or Live acceptance claim.`
  }
  if ((liveProbe.ok as readonly string[]).includes(route)) {
    return `Public Live route probe returned HTTP 200 on ${liveProbe.date} (${liveProbe.base}${route}); route-level availability only, not an authenticated end-to-end or Live acceptance claim.`
  }
  return auditFields.liveVerification
}

const workspaceAcceptance: Record<string, string> = {
  '/': 'The overview shows the currently selected owned mission, derives its status and blockers from saved evidence, identifies one actionable next step, and never labels a mission complete without its required outcome evidence.',
  '/workflow': 'For a selected mission, the guide identifies the current lifecycle stage, links to the relevant workspace, explains the next action and required evidence, and changes its recommendation when saved mission state changes.',
  '/roadmap': 'The roadmap presents all 24 stable milestone identifiers with accurate done/partial/deferred states, links each milestone to its evidence and remaining work, and explicitly distinguishes route availability from feature acceptance.',
  '/release-evidence': 'An operator can inspect each release gate, its owner, evidence reference, environment, review state and hold reason; missing or stale evidence remains blocked and cannot be represented as a passing gate.',
  '/council': 'A planning record retains the selected mission context, specialist results, source/provenance references and unresolved disagreements; absent or failed agent responses remain visible and cannot be presented as verified findings.',
  '/manifest': 'A blueprint stores its objective, assumptions and evidence links; strategy alternatives can be compared against explicit criteria, and outcome updates preserve provenance and distinguish observed results from hypotheses.',
  '/orchestrator': 'A compiled intent records a measurable objective, constraints, acceptance conditions and competing strategies; missing or contradictory inputs are surfaced for review before the result is treated as an executable mission specification.',
  '/mission': 'A mission record persists its owner, objective, constraints, budget and authorization state; selecting a mission restores the saved contract, and execution remains blocked until required approvals and preflight checks pass.',
  '/providers': 'Provider health and routing views show timestamped check results, provider identity, applicable constraints and recent history; unavailable, untested and healthy providers are distinct states and are not inferred from configuration alone.',
  '/evidence': 'Research records retain source citations, retrieval time, scope and confidence; saved evidence is searchable within the owner-authorized scope, and unsupported claims or missing citations remain explicit.',
  '/artifacts': 'Each generated artifact is saved with its source mission, version and verification findings; approval applies to the exact reviewed version, and failed or missing checks prevent a verified status.',
  '/delivery': 'A delivery attempt records the exact approved artifact, target, authorization and preflight results; dispatch and callback receipts are traceable, and failures or missing receipts remain unresolved rather than successful.',
  '/readiness': 'A readiness run reports each target-specific gate as pass, fail or blocked with its evidence and environment; unknown or missing evidence cannot satisfy a required gate.',
  '/portfolio': 'Portfolio decisions link to observed outcomes, sample windows and source evidence; assumptions are labeled separately from measurements, and the interface does not invent missing customer or product metrics.',
  '/learning': 'A proposed lesson links a comparable baseline and candidate outcome, records gains and regressions with provenance, and remains advisory until a reviewer explicitly accepts it; missing or incomparable evidence blocks promotion.',
  '/capabilities': 'The reliability view shows the scope, timestamp, environment and source of each check or benchmark; fixture results are labeled as such and cannot certify unrelated runtime or production behavior.',
  '/incidents': 'An incident record preserves the failure signal, diagnosis, retry/recovery eligibility and review history; unsafe or unreviewed actions remain blocked and recording a review never silently restarts execution.',
}

const workspaceNextAction: Record<string, string> = {
  '/': 'Trace selected-mission status and next-step guidance to saved mission/outcome evidence; verify blocked, empty and completed states against the actual persisted record.',
  '/workflow': 'Walk a mission through every lifecycle stage and map each recommendation to its required saved evidence; verify recovery guidance for failed and blocked stages.',
  '/roadmap': 'Reconcile each milestone status with its linked acceptance evidence and remaining gaps; retain partial/deferred status until the milestone-specific proof is recorded.',
  '/release-evidence': 'Map each release gate to its owner, environment, evidence freshness and hold rule; confirm missing or stale evidence cannot be reviewed as a pass.',
  '/council': 'Trace a saved Council plan to its selected mission context, specialist receipts and unresolved disagreements; verify missing/failed agent output stays visible.',
  '/manifest': 'Trace one blueprint from assumptions through source evidence and strategy comparison to a measured outcome; identify which claims remain hypotheses.',
  '/orchestrator': 'Exercise representative valid, incomplete and contradictory intents; record the resulting acceptance contract and confirm missing constraints require review.',
  '/mission': 'Verify create/select/reload for an owned mission and test that missing authorization or failed preflight blocks execution.',
  '/providers': 'Capture provider-specific health receipts and test configured, unavailable, untested and excluded-provider routing states without exposing credentials.',
  '/evidence': 'Follow a research claim to its retained citation and test owner-scoped search, missing-source and stale-evidence behavior.',
  '/artifacts': 'Trace a generated artifact through revision, checks and approval; verify approval is bound to the exact artifact version and failed checks block acceptance.',
  '/delivery': 'Run the approved-artifact preflight and trace target, dispatch and callback receipts; verify failures and absent callbacks never become successful delivery.',
  '/readiness': 'Run readiness against a declared target with passing, failing and missing evidence; verify every required gate reports its own result and blocks on unknowns.',
  '/portfolio': 'Select one portfolio decision and trace each metric to its measurement window, sample and source; distinguish assumed inputs from observed results.',
  '/learning': "Compare a lesson's baseline and candidate evidence, including a regression case; verify duplicate/incomparable observations are rejected and promotion requires review.",
  '/capabilities': 'Trace representative dashboard results to their exact test or CI evidence and environment; label fixture-only results and leave unmeasured claims open.',
  '/incidents': 'Walk a failed run through diagnosis and recovery review; verify retry eligibility is explicit and a review record does not automatically restart execution.',
}

const workspaces: RegisterEntry[] = guidedWorkspaces.map((item, index) => ({
  id: `WS-${String(index + 1).padStart(2, '0')}`,
  name: item.title,
  list: 'Original workspaces',
  category: 'Workspace / page',
  description: item.purpose,
  acceptance: workspaceAcceptance[item.path] ?? item.output,
  route: item.path,
  source: item.path === '/' ? 'src/routes/index.tsx + src/lib/workspaces.ts' : `src/routes/${item.path.slice(1)}.tsx + src/lib/workspaces.ts`,
  status: backendByRoute[item.path] ? 'Wired + tested' : 'Source present',
  statusNote: backendByRoute[item.path]
    ? 'The route is wired to the mapped Convex modules and covered by the linked repository tests. This is not an end-to-end or Live verification claim.'
    : 'Catalogued in the original guided mission journey as a static tracking page; no runtime backend is wired to it.',
  ...auditFields,
  nextAction: workspaceNextAction[item.path] ?? auditFields.nextAction,
  backend: backendFor(item.path),
  integration: integrationFor(item.path),
  persistence: persistenceFor(item.path),
  userActions: userActionsFor(item.path),
  testEvidence: testEvidenceFor(item.path),
  liveVerification: liveVerificationFor(item.path),
  remainingGaps: remainingGapsFor(item.path),
}))

// Primary route for each roadmap milestone, used to attach concrete backend and test
// traceability to milestone entries without changing the roadmap's own status labels.
const routeByMilestone: Record<number, string> = {
  1: '/release-evidence',
  2: '/manifest',
  3: '/providers',
  4: '/orchestrator',
  5: '/orchestrator',
  6: '/routing',
  7: '/capabilities',
  8: '/learning',
  9: '/knowledge',
  10: '/portfolio',
  11: '/replay',
  12: '/evaluations',
  13: '/capabilities',
  14: '/manifest',
  15: '/evolution',
  16: '/billing',
  17: '/checkout',
  18: '/delivery',
  19: '/resilience',
  20: '/teams',
  21: '/developers',
  22: '/comparisons',
  23: '/science',
  24: '/generality',
}

const milestoneAcceptance: Record<number, string> = {
  1: 'Record a dated source-difference report and environment-specific runtime results for representative authenticated workflows; enumerate accepted generated/compatibility differences and leave any untested workload explicitly open.',
  2: 'A saved blueprint must link its assumptions to measurable targets, source evidence and stop conditions; outcome ingestion and planning selection must be reproducible from retained receipts, with missing world-context, resource or outcome data explicitly blocking stronger claims.',
  3: 'Each provider must expose bounded health and failure history with credential-safe diagnostics; automatic routing may select only providers meeting the current credential, inference-success and reliability policy, while manual-only and excluded providers remain excluded.',
  4: 'A representative mission must compile intent, plan dependent stages, enforce authorization/resource preflight, execute or stop safely, and retain traceable results; failures and incomplete integrated runtime coverage must remain visible.',
  5: 'Given a mission objective and constraints, the compiler produces a structured, persisted intent and acceptance contract with stable fields and validation errors for missing or invalid required inputs.',
  6: 'For matched tasks, persist baseline and candidate configuration identities, frozen constraints, per-case outputs, costs and failures; return HOLD when sample or provenance is insufficient and keep human scoring distinct from independent blinded evaluation.',
  7: 'An exact approved artifact snapshot must pass required browser/CI assertions with commit- and attempt-bound evidence; failed assertions block acceptance, and broader integration or real-world outcomes remain separately marked unverified.',
  8: 'A reviewed lesson must reference comparable earlier and later measurements, reject duplicate or incomparable evidence, retain negative outcomes, and remain advisory until a reviewer accepts it; representative product improvement requires measured receipts.',
  9: 'Authorized users can search persisted scoped knowledge and inspect source, ranking and relevance evidence; retrieval comparisons use the same frozen query/corpus conditions, and unsupported reuse-effectiveness claims remain open.',
  10: 'Each reported product outcome must include its measurement window, sample size, source identity and method; imported reports retain immutable commit/path provenance, and inferred or operator-entered values remain distinct from independently verified measurements.',
  11: 'A resumed run must bind to an immutable checkpoint, reject stale worker authority, reuse only matching durable results and execute only authorized unstarted work; ambiguous external interruption or incomplete work remains blocked.',
  12: 'Versioned benchmark cases must run in the declared test environments and retain machine-readable outputs, failures and provenance; fixture-only results cannot be used as evidence for broader capabilities that were not measured.',
  13: 'Every dashboard result must link to the exact benchmark workflow, repository, commit and attempt; missing or mismatched CI evidence is not passing, and unmeasured capability/product outcomes remain explicitly open.',
  14: 'Research dossiers must retain deduplicated sources, citation and age checks, exact excerpts and claim-level support/contradiction states; unresolved factual truth or missing broader context must remain unresolved rather than inferred as verified.',
  15: 'A capability proposal must declare its scope, permissions, resource limits, rollback path and acceptance suite before rehearsal; only reviewed, bounded changes may advance, and unsupported or unsafe expansions remain blocked.',
  16: 'Usage summaries must distinguish provider-reported values from estimates, retain time/window and target metadata, expose incomplete/unpriced receipts and reject mismatched snapshot comparisons; full platform accounting remains open until independently reconciled.',
  17: 'Production payment activation remains blocked until business/payout approval, live-provider verification, reconciliation and release gates have recorded passing evidence; test-mode checkout must never authorize live charges.',
  18: 'An approved immutable artifact must pass target preflight and required checks before dispatch; recipient feedback, revision requests, deployment receipts and unresolved failures must remain attributable to the exact artifact and grant.',
  19: 'Security and recovery controls must enforce owner quotas transactionally, preserve audit evidence and pass bounded recovery drills; hosting-wide limits, scale certification and real host-interruption evidence must be separately verified before claiming scale readiness.',
  20: 'Team roles, sharing, deprovisioning and SCIM operations must enforce owner protection and cross-team isolation with auditable changes; SSO or enterprise readiness is not complete until real tenant credentials and live identity-provider flows pass.',
  21: 'Developer packages must be immutable and versioned, validate declared inputs, enforce execution/egress limits, support revocation and retain receipts; arbitrary code, marketplace distribution and broader service tools stay out of scope until independently accepted.',
  22: 'Baseline/candidate comparisons must use preregistered matched tasks, immutable observations, explicit scoring direction and adequate domain coverage; owner-scored or identity-masked results cannot be described as independent competitor certification or proof of novelty.',
  23: 'A scientific protocol must preregister falsifiable hypotheses, variables, controls, sample/stopping rules and immutable measurements; negative and inconclusive results remain available, and discovery claims require independent reproduction.',
  24: 'Generality evaluations must freeze training and held-out domains before measurement, report coverage and per-domain transfer results, and block conclusions when sample/domain thresholds fail; evaluation results do not establish AGI or superintelligence.',
}

const milestones: RegisterEntry[] = roadmap.map((item) => {
  const route = routeByMilestone[item.n] ?? '/roadmap'
  return {
    id: `RM-${String(item.n).padStart(2, '0')}`,
    name: item.title,
    list: 'Roadmap milestones',
    category: 'Development outcome',
    description: item.detail,
    acceptance: milestoneAcceptance[item.n] ?? item.detail,
    route,
    source: 'src/routes/roadmap.tsx',
    status: item.status === 'done' ? 'Complete' : item.status === 'later' ? 'Deferred' : 'Partial',
    statusNote: item.status === 'done'
      ? 'Marked complete in the existing roadmap; retain its stated scope and evidence limitations.'
      : item.status === 'later'
        ? 'Explicitly deferred/gated in the existing roadmap.'
        : 'Partially implemented according to the existing roadmap; remaining work is described in its detail.',
    ...auditFields,
    backend: backendFor(route),
    integration: integrationFor(route),
    persistence: persistenceFor(route),
    userActions: userActionsFor(route),
    testEvidence: testEvidenceFor(route),
    liveVerification: liveVerificationFor(route),
    remainingGaps: remainingGapsFor(route),
    nextAction: item.status === 'done'
      ? `Retain the structured-intent acceptance evidence for "${item.title}" and recheck it only if its contract or dependency changes.`
      : item.status === 'later'
        ? `Keep "${item.title}" gated until its named prerequisites, production-provider verification and explicit launch approval have recorded passing evidence.`
        : `For "${item.title}", close each remaining gap named in its roadmap detail, attach reproducible evidence to the exact acceptance criterion, and retain partial status until the full criterion is verified.`,
  }
})

const expandedDescriptions: Record<string, string> = {
  '/resilience': 'Review access boundaries, risky operations, incident prevention, recovery planning and retained safeguard evidence.',
  '/teams': 'Manage team membership and ownership where enabled, enforce shared-work boundaries and review governed changes.',
  '/developers': 'Inspect developer-facing contracts, repository workflows, integration requirements, permissions and evidence.',
  '/comparisons': 'Compare approaches under common criteria with baselines, provenance and explicit limits on ranking claims.',
  '/science': 'Define falsifiable hypotheses, variables and baselines; retain observations and review limitations before accepting findings.',
  '/generality': 'Evaluate varied tasks and settings, track evidence for and against generality, and keep research separate from production claims.',
}
const expandedAcceptance: Record<string, string> = {
  '/resilience': 'An authorized operator can inspect admission limits, audit resource-control decisions, review backup/recovery evidence and identify blocked or unverified safeguards; risky actions remain gated and every result states its environment and evidence limits.',
  '/teams': 'An owner can create a team, review join requests, assign or change roles, and collaborate through permission-checked notes; unauthorized cross-team reads and writes are rejected and membership changes leave auditable records.',
  '/developers': 'A developer can register an immutable versioned agent contract, validate representative JSON examples against it, inspect validation errors, and retire a version without rewriting its historical record; permission and execution limits are explicit.',
  '/comparisons': 'An operator can preregister baseline and candidate configurations, define comparable measures and sample requirements, retain paired observations with provenance, and see an explicit inconclusive result when evidence is insufficient; rankings cannot exceed the recorded evidence.',
  '/science': 'A researcher can preregister a falsifiable hypothesis, variables, comparison method and stopping rules, record immutable measurements including negative or inconclusive results, and export the protocol and evidence needed to reproduce the stated analysis.',
  '/generality': 'A researcher can freeze training and held-out task domains before evaluation, record domain-level transfer observations and sample coverage, and receive a blocked or inconclusive outcome when held-out coverage is insufficient; results must not imply generality beyond measured domains.',
}
const expandedNextAction: Record<string, string> = {
  '/resilience': 'Reconcile each quota, audit and recovery control with its environment-specific evidence; exercise denied and capacity-exhausted paths before claiming the safeguard is verified.',
  '/teams': 'Trace create, invitation, role change, revocation and shared-note flows across two owners; verify unauthorized cross-team access and stale membership are rejected.',
  '/developers': 'Validate representative accepted/rejected JSON contracts, immutable version retirement and revocation; keep arbitrary-code and unverified integration claims explicitly out of scope.',
  '/comparisons': 'Run a preregistered matched baseline/candidate fixture with insufficient-sample and mismatched-domain cases; verify results hold or remain inconclusive when evidence is inadequate.',
  '/science': 'Review a preregistered protocol, paired observations, negative result and export; verify the output contains enough immutable provenance to reproduce the stated analysis.',
  '/generality': 'Evaluate frozen training and held-out domains with incomplete coverage and per-domain transfer; verify insufficient evidence cannot be reported as generality.',
}
const expanded: RegisterEntry[] = expansionPages.map((item, index) => ({
  id: `EX-${String(index + 1).padStart(2, '0')}`,
  name: item.title,
  list: 'Expanded capability areas',
  category: 'Optional expansion',
  description: expandedDescriptions[item.path] ?? item.title,
  acceptance: expandedAcceptance[item.path] ?? 'Acceptance criteria require feature-specific definition before this entry can be considered fully specified.',
  route: item.path,
  source: 'src/components/expansion-guide.tsx + linked src/routes/*.tsx',
  status: 'Wired + tested',
  statusNote: 'Dedicated route wired to the mapped Convex modules and covered by the linked repository tests; not an end-to-end or Live verification claim.',
  ...auditFields,
  nextAction: expandedNextAction[item.path] ?? auditFields.nextAction,
  backend: backendFor(item.path),
  integration: integrationFor(item.path),
  persistence: persistenceFor(item.path),
  userActions: userActionsFor(item.path),
  testEvidence: testEvidenceFor(item.path),
  liveVerification: liveVerificationFor(item.path),
  remainingGaps: remainingGapsFor(item.path),
}))

const productivityItems = expansionCatalog.filter((item) => item.group === 'Productivity')
const portfolioItems = expansionCatalog.filter((item) => item.group !== 'Productivity')
function mapCatalogItem(item: (typeof expansionCatalog)[number], id: string, list: RegisterList): RegisterEntry {
  const boundedStarter = (starterPaths as readonly string[]).includes(item.path)
  return {
    id,
    name: item.title,
    list,
    category: item.group,
    description: item.acceptance,
    acceptance: `${item.acceptance} Acceptance requires owner-scoped persistence where records are created, server-side input and permission validation, visible success/failure states, and regression coverage for successful use plus invalid or unauthorized requests. External side effects remain disabled unless a separately reviewed integration and verifiable receipt authorize them.`,
    route: item.path,
    source: `src/lib/expansion-catalog.ts + src/routes/${item.path.slice(1)}.tsx`,
    status: boundedStarter ? 'Bounded starter' : 'Wired + tested',
    statusNote: boundedStarter
      ? 'The route is wired to the mapped backend and covered by linked tests; the catalog still records full requested acceptance as open beyond the starter controls.'
      : 'The route is wired to the mapped Convex modules and covered by the linked repository tests; not an end-to-end or Live verification claim.',
    ...auditFields,
    backend: backendFor(item.path),
    integration: integrationFor(item.path),
    persistence: persistenceFor(item.path),
    userActions: userActionsFor(item.path),
    testEvidence: testEvidenceFor(item.path),
  liveVerification: liveVerificationFor(item.path),
    remainingGaps: remainingGapsFor(item.path),
    nextAction: boundedStarter
      ? `Extend ${item.title} at ${item.path} beyond its bounded starter controls to cover each requested acceptance behavior; add invalid/unauthorized and failure-path checks plus authenticated E2E evidence before changing its status.`
      : `Trace ${item.title} at ${item.path} through its mapped backend, persistence and linked tests; verify the full acceptance behavior including invalid/unauthorized cases, then attach authenticated E2E and scoped Live evidence before claiming completion.`,
  }
}
const productivity: RegisterEntry[] = productivityItems.map((item, index) => mapCatalogItem(item, `PR-${String(index + 1).padStart(2, '0')}`, 'Productivity features'))
const portfolio: RegisterEntry[] = portfolioItems.map((item, index) => mapCatalogItem(item, `PF-${String(index + 1).padStart(2, '0')}`, '30-feature portfolio'))

export const masterFeatureRegister: readonly RegisterEntry[] = [...workspaces, ...milestones, ...expanded, ...productivity, ...portfolio]
export const registerLists: readonly RegisterList[] = ['Original workspaces', 'Roadmap milestones', 'Expanded capability areas', 'Productivity features', '30-feature portfolio']
export const registerStatusOptions: readonly RegisterStatus[] = ['Complete', 'Partial', 'Deferred', 'Wired + tested', 'Bounded starter', 'Source present']
export const registerStatusNotes: Record<RegisterStatus, string> = {
  'Complete': 'Milestones explicitly marked complete in the existing roadmap.',
  'Partial': 'Milestones with known remaining acceptance work.',
  'Deferred': 'Gated or intentionally deferred roadmap milestones.',
  'Wired + tested': 'Route wired to mapped Convex modules with linked repository tests; not an end-to-end or Live claim.',
  'Bounded starter': 'Working starter controls wired and tested; full requested acceptance remains open.',
  'Source present': 'Catalog or route presence without a stronger completion claim.',
}
export const registerCounts = {
  workspaces: workspaces.length,
  milestones: milestones.length,
  expanded: expanded.length,
  productivity: productivity.length,
  portfolio: portfolio.length,
  total: masterFeatureRegister.length,
}
