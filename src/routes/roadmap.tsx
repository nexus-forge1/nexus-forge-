import { completionPlan } from '../lib/completion-plan'
import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { recoveryChecks, releaseAudit, releaseReady } from '../lib/production-readiness'

export const Route = createFileRoute('/roadmap')({ head: () => routeHead("/roadmap"), component: RoadmapPage })

type Milestone={n:number;title:string;status:'done'|'partial'|'later';detail:string}
const roadmap:Milestone[] = [
  {
    "n": 1,
    "title": "Verify current live platform",
    "status": "partial",
    "detail": "Scoped source-difference audit completed; retain documented generated/compatibility differences. Broader runtime and workload validation remains."
  },
  {
    "n": 2,
    "title": "Finish Manifest Intelligence outcome system",
    "status": "partial",
    "detail": "Opt-in hourly GitHub ingestion, source-scoped product-task event aggregation and evidence-based planning selection are implemented. Selected-blueprint context comparisons and private frozen validation plans now connect assumptions to measurable targets and stop conditions. Broader world context, complete resource accounting and representative measured adaptive improvement remain open."
  },
  {
    "n": 3,
    "title": "Stabilize AI providers and routing",
    "status": "partial",
    "detail": "Validate provider reliability across workloads. OpenRouter remains manual-only; Mistral and Hugging Face are deferred."
  },
  {
    "n": 4,
    "title": "Build Unified Intelligence Orchestrator",
    "status": "partial",
    "detail": "Complete integrated orchestration runtime validation. Dependency/resource preflight, adaptive guidance, runner status, and documented escalation recovery are implemented in Mission Control."
  },
  {
    "n": 5,
    "title": "Add structured Intent Compiler",
    "status": "done",
    "detail": "Implemented: structured mission intent and acceptance contract."
  },
  {
    "n": 6,
    "title": "Competing strategies and task-aware model selection",
    "status": "partial",
    "detail": "Measure strategy comparisons and task-aware model selection against repeatable outcomes."
  },
  {
    "n": 7,
    "title": "Independent verification and safety",
    "status": "partial",
    "detail": "Artifact Forge supports browser-reported checks plus exact-snapshot Chromium CI and GitHub-verified step evidence. Broader acceptance, integration, and real-world outcome coverage remains open."
  },
  {
    "n": 8,
    "title": "Verified Learning Engine",
    "status": "partial",
    "detail": "Reviewed-lesson handoffs now link to matched earlier/later cost, readiness and product observations with immutable receipts. Repeated comparable-evidence reviews now recompute retrieval/reuse scores, reject duplicated measurements and retain regressions even with positive means. Representative verified evidence and product outcomes remain open."
  },
  {
    "n": 9,
    "title": "Persistent, searchable knowledge",
    "status": "partial",
    "detail": "Private memory search and saved top-five retrieval comparisons are implemented with server-observed rankings and operator relevance labels. Council now captures actual selected memory IDs/rendered learning-preflight text for future planner attempts and supports operator-labeled evaluation. Representative labels, candidate policies and reuse effectiveness remain open."
  },
  {
    "n": 10,
    "title": "Connect missions to real-world outcomes",
    "status": "partial",
    "detail": "Portfolio records structured operator-observed adoption, revenue and task metrics with periods, samples and evidence. Commit-pinned authenticated GitHub report import now retains source identities. Direct Macaly site-wide traffic retrieval is now available separately. Product-specific analytics ingestion, independent checks and representative outcomes remain open."
  },
  {
    "n": 11,
    "title": "Checkpoints and long-horizon execution",
    "status": "partial",
    "detail": "Owner-reviewed Council continuation now retires stale worker authority, reuses matching durable answers and runs only unstarted stages from frozen inputs. Controlled interrupted/uninterrupted outputs matched. Pending/failed/ambiguous work and real host interruption remain blocked or unverified."
  },
  {
    "n": 12,
    "title": "Capability benchmark and experiment lab",
    "status": "partial",
    "detail": "Twenty versioned artifact-dom-v3 fixtures run in JSDOM and isolated Chromium with retained JSON reports. Broader capability, browser, integration, and experiment benchmarks remain open."
  },
  {
    "n": 13,
    "title": "Capability and Reliability Dashboard",
    "status": "partial",
    "detail": "Capability & Reliability now verifies GitHub benchmark job outcomes by repository, workflow, commit, and exact attempt. Broader measured capability and product outcomes remain open."
  },
  {
    "n": 14,
    "title": "Automated research and opportunity discovery",
    "status": "partial",
    "detail": "Research & Memory now includes a deduplicated source inventory, saved-age and uncited-record checks, safe citation links and mission-scoped JSON dossier export. Private claim reviews now retain exact saved research excerpts/citations with supporting, contradicting or unresolved assessments. Protected original-source snapshots now retain exact text hashes and declared-date status; source-backed claim excerpts pin those immutable receipts. Factual truth, broader world context and integrated discovery validation remain open."
  },
  {
    "n": 15,
    "title": "Safe capability expansion",
    "status": "partial",
    "detail": "Add more capabilities with explicit tests and governed expansion evidence."
  },
  {
    "n": 16,
    "title": "Cost and resource intelligence",
    "status": "partial",
    "detail": "Durable invocation history now records mission/stage attribution, explicit runner IDs and pending/missing/gap states across current generative router paths. Security & Resilience now exposes bounded owner-private record capacity aligned with admission policies; retired media history no longer consumes active runtime quota. Billing reconciliation, compute/traffic accounting and representative workload validation remain open."
  },
  {
    "n": 18,
    "title": "Product and venture delivery pipeline",
    "status": "partial",
    "detail": "Governed delivery and configurable artifact browser checks exist. Validate broader integrated behavior, external services, and actual product outcomes with independent evidence."
  },
  {
    "n": 19,
    "title": "Advanced security and resilience at scale",
    "status": "partial",
    "detail": "Security & Resilience now enforces transactional owner quotas for protocols, packages, adapters, runtime receipts and evaluation reports, with bounded capacity evidence and private audit history. Existing safety guards remain. Hosting-wide rate limits, scale certification and real host interruption remain open."
  },
  {
    "n": 20,
    "title": "Multi-user and enterprise governance",
    "status": "partial",
    "detail": "Team Governance now supports team creation, explicit join requests, admin-reviewed viewer/contributor/admin roles, revocation and permission-checked shared notes. Mission owners can explicitly share selected briefs and delegate approved execution through the original dependency/resource/incident preflight. Unshared missions and credentials remain private. Verified-email grants, deprovisioning and reviewed atomic roster reconciliation are implemented; stale reviews fail and old linked accounts are revoked on reassignment. Domain-verified Google Workspace SSO is configuration-ready; tenant credentials and live identity-provider validation remain open. SCIM is not implemented."
  },
  {
    "n": 21,
    "title": "External agent and developer ecosystem",
    "status": "partial",
    "detail": "Developer Integrations now registers immutable semantic versions, validates exact JSON field examples and retires versions with audit history. Explicitly enabled public HTTPS GET JSON agents now execute through hardened egress with exact declared fields, revocation and durable receipts. An authenticated GitHub data-write tool now prepares exact mission-bound files and commits only to a new isolated branch, with no automatic merge or dispatch. Arbitrary code, broader authenticated service tools, marketplace distribution and revenue sharing remain open."
  },
  {
    "n": 22,
    "title": "Competitive validation and genuine novelty",
    "status": "partial",
    "detail": "Comparative Validation now preregisters paired baseline/candidate protocols, immutable source-linked observations, direction-aware improvement and domain coverage with JSON exports. A real named Cloudflare/Groq/Cerebras matched-task runner now preserves baseline/structured results, usage and failures. Independent competitor certification and novelty evidence remain open."
  },
  {
    "n": 23,
    "title": "Frontier scientific research",
    "status": "partial",
    "detail": "Scientific Experiments now supports falsifiable preregistration, immutable paired observations, sample/domain gates, standard-error summaries and retained negative results. Actual scientific discovery and independent replication remain research work."
  },
  {
    "n": 24,
    "title": "AGI-oriented generality and superintelligence research",
    "status": "partial",
    "detail": "Generality Research now freezes training/held-out domains, measures paired transfer observations by domain and rejects closure before sample/domain coverage. This implements an evaluation workflow, not AGI or superintelligence."
  }
]

function RoadmapPage() {
  const done = roadmap.filter(item => item.status === 'done')
  const partial = roadmap.filter(item => item.status === 'partial')
  const deferred = roadmap.filter(item => item.status === 'later')
  return <WorkspaceLayout title="Project roadmap" eyebrow="NEXUS FORGE / PROGRESS"><section className="workspace dark-section">
    <div className="workspace-head"><div><div className="section-kicker">PROJECT / ROADMAP</div><h1>What shipped. What remains.</h1></div><span className="status-chip">{roadmap.length} ACTIVE MILESTONES</span></div>
    <p>The roadmap tracks active capability milestones and preserves their original identifiers after retired work is removed. A working page or a passing test does not complete a whole milestone. All 16 workspaces remain in the guide; mission evidence follows its own checkpoints.</p>
    <div className="hero-actions"><Link className="primary-button" to="/workflow">Continue guided workflow →</Link><Link className="secondary-button" to="/evidence">Review research evidence →</Link><Link className="secondary-button" to="/incidents">Review recovery →</Link></div>
    <div className="glass-card research-card" id="completion-order"><div className="panel-title"><span>REMAINING BUILD ORDER</span><span className="status-chip">STEP {completionPlan.find(step => step.status === 'NEXT')?.id} OF {completionPlan.length} · NEXT</span></div><p>This is the build checklist, separate from the 16-page operating guide. Keep these step numbers stable. A completed step must link to acceptance evidence; existing completed work is reused unless a defect or changed dependency requires a targeted recheck. Payment activation is step 17 and stays last.</p>{completionPlan.map(step => <article className="guard-item" key={step.id}><span>{step.id}</span><div><strong>{step.title}</strong><p>{step.acceptance}</p></div><span className="status-chip">{step.status}</span></article>)}</div>
    <div className="stats-strip compact"><div><strong>{done.length}</strong><span>Completed milestone</span></div><div><strong>{partial.length}</strong><span>Partially implemented</span></div><div><strong>{deferred.length}</strong><span>Deferred / not implemented</span></div></div>
    <div className="glass-card research-card"><div className="panel-title"><span>IMPLEMENTATION & RELEASE CONTEXT</span><span className="status-chip">IN PROGRESS</span></div>
      <p><a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/RELEASE_STATUS_2026_10_17.md" target="_blank" rel="noreferrer">Current release evidence and remaining requirements →</a></p><p>The approved managed restore-and-return and isolated synthetic interruption/restore checks are recorded. {recoveryChecks.filter(check => check.status === 'verified').length}/{recoveryChecks.length} recovery checks have evidence for their stated environment. {releaseReady(releaseAudit.gates) ? 'The dated release evidence is complete for its stated scope.' : 'Full production readiness remains on hold while partial and blocked release gates remain open.'} <Link to="/capabilities">Review current checks, environments and remaining requirements →</Link></p>
      <p>Payment activation is reserved for the final launch step. Current build priority is feature coverage and quality: research dossiers and claim-level review are implemented; selected-blueprint opportunity comparisons and immutable measurable validation plans are now implemented. Blueprint structural generation checks are accepted for the controlled Testing scope. Validation plans now retain frozen-target observation assessments and next decisions. Protected source captures and pinned excerpt provenance are accepted for bounded scope. Repeated-evidence learning reviews now retain gains and regressions without automatic promotion. Council, providers and recovery is next.</p><ul><li>Representative product workloads still require validation; bounded runtimes and permissioned team/tool execution are implemented.</li><li>Opt-in hourly GitHub outcome feeds now preserve commit/blob/report identities. Outcome-based planning automatically selects a bounded policy from comparable nonoverlapping periods, retaining evidence IDs.</li><li>The versioned policy evaluator compares a naive baseline with guarded selection on published regression, provenance, overlap and drift fixtures. Historical controlled acceptance passed; public fixtures do not establish unseen transfer or model superiority.</li><li>Remaining empirical work includes representative learning improvement, independent competitor/scientific replication, pending-provider uncertainty and enterprise-scale acceptance. External synthetic archive retention is verified against the original restore hash. Actual provider invoices, representative workload targets, recurring backup freshness and supported managed-host fault controls remain specific dependencies. Customer payment activation is the last step in the build order above.</li></ul>
      <p><a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/HELD_WORK_RESUMPTION_2026_10_17.md" target="_blank" rel="noreferrer">Resumed work: completed checks, restore boundary and next priority →</a></p><p>Real-service acceptance is partial: team execution, external JSON lookup and scheduled imports returned evidence. Multimodal Studio has been removed and media-provider acceptance is out of scope. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/REAL_SERVICE_ACCEPTANCE.md" target="_blank" rel="noreferrer">Review exact real-service results →</a></p><p>Reviewed intermediate Council continuation is implemented and compared against an uninterrupted baseline. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/COUNCIL_CONTINUATION.md" target="_blank" rel="noreferrer">Review comparison results and safety limits →</a></p><div className="hero-actions"><Link className="primary-button" to="/resilience">Open six expanded capabilities →</Link><Link className="secondary-button" to="/capabilities">Operational evidence →</Link></div>
      <p>Dependency and resource preflight checks block execution in the backend. Mission Control displays blockers, advisories, and resource availability; authorization and execution wait for ready preflight and incident clearance.</p>
    </div>
    <div className="glass-card research-card"><div className="panel-title"><span>IMPLEMENTED FOUNDATION</span><span className="live-pill">SAVED EVIDENCE</span></div>
      <ul><li>Monthly subscriptions and prepaid pay-per-use now have embedded test checkout, verified payment fulfillment, private balances and receipts, capped usage authorizations and metering provenance. There is no free plan or trial. Production AI rejects test credit. Successful and declined real test-mode card journeys passed for prepaid and monthly checkout, including exact webhook credits, receipts, persistence and portal cancellation. Real charging still requires business/payout activation; shared-seat billing remains open. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/BILLING_2026_10_17.md" target="_blank" rel="noreferrer">Review billing scope and activation steps →</a></li><li>NEXUS FORGE records private research, generated-artifact structural quality and callback-verified delivery results, with elapsed time and unresolved attempts in Portfolio. The latest 100 recorded attempts are summarized per selected mission or all owned missions. Full regression passed 517 tests across 95 files; representative customer outcomes remain open. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/PLATFORM_TASK_MEASUREMENT_2026_10_17.md" target="_blank" rel="noreferrer">Review task definitions and evidence limits →</a></li><li>Product task instrumentation uses the selected mission, derives the correct regional Convex HTTP endpoint, and guides server-only configuration. Sixteen focused setup, event-client, ingestion, outcome and recovery tests passed. Representative product outcomes still require actual completed task events from a connected product server.</li><li>Completed the sixteen-page signed-in usability review: mobile navigation now uses one row with reserved content space, navigation exposes the current page, Portfolio discovery has a connected label, and completion percentages support existing mixed-unit records. Twenty-one targeted regression tests passed. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/USABILITY_REVIEW_2026_10_17.md" target="_blank" rel="noreferrer">Review checklist and verification scope →</a></li><li>Welcome, account creation and sign-in have a responsive email-code experience. Account entry explains the first mission; Overview and Mission Console continue from saved evidence, including delivery recovery and completed-outcome learning. Eleven focused navigation checks cover this handoff and the sixteen-page guide.</li><li>All 16 pages share ordered guidance, selected-mission state, honest progress states, and recovery links. Council continues to Research & Memory; partial planning is recorded with lower confidence.</li><li>Source audit repairs align runner delivery reads, repository/branch preflight, destination-specific preparation, shared sign-out recovery, intent parsing, metadata, and readiness wording. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/SOURCE_AUDIT.md" target="_blank" rel="noreferrer">Review the audit scope and retained differences →</a></li><li>Mission drafts retain owner-checked Manifest, Orchestrator, and reviewed-learning provenance. Verified Learning Engine now records applied-lesson comparisons against earlier baseline and subsequent mission measurements, preserving regressions as well as improvements. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/STRATEGY_REUSE_OUTCOMES.md" target="_blank" rel="noreferrer">Review reuse outcome evidence and limits →</a></li><li>Artifact Forge can explicitly publish an exact saved artifact/mission/test-plan snapshot to a dedicated CI branch, run isolated Chromium, and import digest/commit/attempt-bound GitHub Check evidence. Approval and delivery remain separate. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/EXACT_ARTIFACT_CI.md" target="_blank" rel="noreferrer">Review exact-snapshot CI workflow →</a></li><li>Capability & Reliability includes twenty repeatable DOM benchmark cases running in JSDOM and isolated Chromium, CI JSON reports, and operator-private receipts verified against GitHub job metadata. These fixture results do not certify generated artifacts. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/BENCHMARK_CI_EVIDENCE.md" target="_blank" rel="noreferrer">Review CI benchmark evidence and scope →</a></li><li>AI Council captures selected memory IDs, prompt channels and exact learning/preflight context for future planner attempts, with separate prepared/responded states and owner-labeled relevance scores. A separately captured lexical candidate can be compared using the same source window, unique-memory budget and saved labels; it never changes live planning. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/COUNCIL_MEMORY_SELECTION.md" target="_blank" rel="noreferrer">Review Council memory provenance and evaluation →</a></li><li>Research & Memory includes owner-scoped saved retrieval comparisons with precision, recall, reciprocal rank, observed lesson receipts and strategy traceability. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/MEMORY_RETRIEVAL_EVALUATION.md" target="_blank" rel="noreferrer">Review retrieval evaluation and limits →</a></li><li>Research & Memory now exposes saved context through private content search, selected-mission/all-owned scope, category filters, paginated records, and source/confidence receipts. Saved top-five retrieval comparisons now measure content search versus newest-five lessons with operator relevance labels. Representative corpus evaluation and strategy reuse outcomes remain open.</li><li>Artifact generation receives saved mission requirements and mission-specific research; delivery requires an explicitly selected approved artifact.</li><li>Artifact Forge supports fill/click/assertion plans, including explicit exact text equality, tied to saved acceptance criteria, isolated execution, per-step observed evidence, coverage, reusable plans, and exact mission/artifact snapshots. Reports remain client-reported and do not change approvals or delivery state. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/ARTIFACT_BROWSER_CHECKS.md" target="_blank" rel="noreferrer">Review browser check usage and limits →</a></li><li>Artifact re-verification preserves valid approval. Dispatch state cannot be rewound by approval, and matching callbacks are idempotent while conflicting receipts are rejected.</li><li>Mission Control includes adaptive learning guidance, saved runner status/errors, provider diagnostics, and documented escalation review. Review writes an audit receipt without automatically restarting execution.</li><li>Portfolio Intelligence retrieves site-wide NEXUS FORGE traffic directly from managed Macaly analytics, with explicit scope acknowledgement, exact response snapshots and private paginated receipts. A real deployed provider lookup was verified. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/DIRECT_SITE_ANALYTICS.md" target="_blank" rel="noreferrer">Review direct analytics scope and validation →</a></li><li>Portfolio Intelligence explicitly imports commit-pinned GitHub outcome reports with authenticated server lookup, bounded validation, immutable source receipts and digest/commit/path identities. Report figures remain repository-authored. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/GITHUB_PRODUCT_EVIDENCE_IMPORT.md" target="_blank" rel="noreferrer">Review import contract and evidence limits →</a></li><li>Portfolio Intelligence records structured product/business observations with sample sizes, completed periods, measurement methods, evidence and server-derived target comparisons. These stay separate from delivery readiness. <a href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/PRODUCT_OUTCOME_MEASUREMENTS.md" target="_blank" rel="noreferrer">Review product outcome evidence and limits →</a></li><li>Measured outcome recording and action-error recovery are available. Seven mission pages wait for evidence before showing missing-record guidance.</li><li>Readiness counts and HTTP callback types are validated; provider descriptions match routing policy.</li></ul>
      <p>Research, Manifest, and the earlier LocalBoost delivery have accepted live receipts. These are retained evidence, not a requirement to repeat authentication or approvals for routine maintenance.</p>
    </div>
    {[
      { title: 'Not implemented yet · deferred expansions', items: deferred },
      { title: 'Partially implemented · remaining work', items: partial },
      { title: 'Completed milestone', items: done },
    ].map(group => <div className="glass-card research-card" key={group.title}><h2>{group.title}</h2>{group.items.map(item => <div className="guard-item" key={item.n}><span>{item.n}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><span className="status-chip">{item.status === 'later' ? 'DEFERRED' : item.status === 'done' ? 'COMPLETE' : 'PARTIAL'}</span></div>)}</div>)}
    <p className="muted-copy">Implementation history remains in GitHub pull requests. This page describes the current capability gaps rather than repeating superseded status notes.</p>
  </section></WorkspaceLayout>
}
