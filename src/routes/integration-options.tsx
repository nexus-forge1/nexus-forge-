import { createFileRoute, Link } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'

export const Route = createFileRoute('/integration-options')({
  head: () => routeHead('/integration-options' as Parameters<typeof routeHead>[0]),
  component: IntegrationOptionsPage,
})

const options = [
  { category: 'Source control & CI', name: 'GitHub Free + Actions', cost: 'Free tier', why: 'Repository history, CI evidence, release artifacts and controlled isolated branches.', links: [['Plans', 'https://github.com/pricing'], ['Actions quotas', 'https://docs.github.com/en/billing/concepts/product-billing/github-actions']], caveat: 'Public standard runners are free; private repos have monthly limits. Protect secrets and privileged workflows.' },
  { category: 'Backend & durable data', name: 'Keep Macaly + Convex', cost: 'Already provisioned', why: 'Current app runtime, persistence, scheduled work and authenticated backend.', links: [['Convex plans', 'https://www.convex.dev/plans'], ['Convex docs', 'https://docs.convex.dev/']], caveat: 'Do not add another database or hardcode Testing URLs. Confirm current quotas in the account.' },
  { category: 'AI inference', name: 'Groq, Cerebras, OpenRouter free models', cost: 'Free/rate-limited options', why: 'Provider diversity for bounded evaluation, fallback and matched-task research.', links: [['Groq docs', 'https://console.groq.com/docs/overview'], ['Cerebras pricing', 'https://inference-docs.cerebras.ai/support/pricing'], ['OpenRouter free models', 'https://openrouter.ai/collections/free-models/']], caveat: 'Free tiers and model availability change; they may be evaluation-only and have no production SLA. Store keys server-side, cap spend and retain usage receipts.' },
  { category: 'Product analytics', name: 'PostHog', cost: 'Free monthly allowance', why: 'Measure real product task events, funnels, errors and bounded experiments.', links: [['Pricing', 'https://posthog.com/pricing']], caveat: 'Published free limits apply; review privacy/consent and do not send secrets. The first-party outcome ledger remains authoritative.' },
  { category: 'Site analytics', name: 'Google Analytics + Search Console', cost: 'Free tools', why: 'Site traffic, search visibility and referrer context.', links: [['Google Analytics', 'https://analytics.google.com/'], ['Search Console', 'https://search.google.com/search-console/about']], caveat: 'Requires site/account verification and appropriate privacy disclosures. Site analytics do not prove completed product-task outcomes.' },
  { category: 'Error monitoring', name: 'Sentry Developer', cost: 'Free with quotas', why: 'Secondary error and tracing signals for reliability and incident triage.', links: [['Pricing', 'https://sentry.io/pricing/'], ['Free plan notes', 'https://www.sentry.help/en/articles/16738709-changes-to-legacy-developer-plans-september-2026']], caveat: 'Intake can stop at quota. Not a substitute for backups, durable evidence or a verified alert/runbook.' },
  { category: 'Independent backup storage', name: 'Cloudflare R2', cost: 'Free allowance; usage beyond can bill', why: 'Optional private copy of encrypted recovery archives outside the primary path.', links: [['Pricing and free tier', 'https://developers.cloudflare.com/r2/pricing/']], caveat: 'Use only if an independent copy is needed; verify access policy, retention, encryption, retrieval and hashes. Keep archives out of GitHub.' },
  { category: 'DNS and edge', name: 'Cloudflare Free', cost: 'Free plan', why: 'Basic DNS/CDN and some security controls.', links: [['Plans', 'https://www.cloudflare.com/plans/'], ['Workers pricing', 'https://developers.cloudflare.com/workers/platform/pricing/']], caveat: 'Not equivalent to managed-host interruption controls, rollback access or an uptime SLA.' },
  { category: 'Enterprise identity', name: 'Google Cloud Identity / Workspace', cost: 'Cloud Identity Free edition available', why: 'Complete genuine organization-tenant SSO validation and verify access boundaries.', links: [['Cloud Identity pricing', 'https://cloud.google.com/identity/pricing'], ['Identity docs', 'https://developers.google.com/identity']], caveat: 'Needs the real tenant/admin and a real organization user. A personal account or configured callback alone does not prove tenant acceptance.' },
  { category: 'Work and notifications', name: 'Macaly managed integrations', cost: 'Depends on provider account/plan', why: 'Connect only the actual workflow tools needed (e.g. Gmail, Drive, Calendar, Notion, Linear, Sheets).', links: [['NEXUS FORGE Integration Center', '/connections'], ['Google Workspace', 'https://workspace.google.com/']], caveat: 'Current sandbox discovery found no connected OAuth toolkits. Discovery is not connection; use least-privilege scopes. Built-in transactional email may avoid a separate mail vendor.' },
  { category: 'Payments', name: 'Stripe', cost: 'No setup/monthly fee on standard pricing; transaction fees apply', why: 'Existing test-mode checkout and reconciliation; live fulfillment only after every earlier gate passes.', links: [['Pricing', 'https://stripe.com/pricing'], ['Documentation', 'https://docs.stripe.com/']], caveat: 'Keep live payment activation LAST. Business/payout verification and real renewals, cancellations, refunds and fulfillment need evidence.' },
  { category: 'Hosting & deployment', name: 'Keep Macaly', cost: 'Already provisioned', why: 'Current hosted preview, production domain and build/deploy lifecycle.', links: [['Macaly', 'https://www.macaly.com/'], ['Current preview', 'https://bphntw8kdojl9qvuifywyjtk.macaly.dev/']], caveat: 'Managed interruption/rollback control access is still a separate acceptance dependency; do not add a second host just to tick a box.' },
]

const milestones = [
  ['1', 'Live platform verification', 'Partial — repeat frozen-revision live/mobile/workload/recovery checks.'],
  ['2', 'Manifest Intelligence outcomes', 'Partial — real product events and comparable outcome periods.'],
  ['3', 'AI providers and routing', 'Partial — measured provider reliability, cost and quality.'],
  ['4', 'Unified Intelligence Orchestrator', 'Partial — full multi-stage recovery and host-interruption evidence.'],
  ['5', 'Structured Intent Compiler', 'Done for bounded scope — reopen only for a regression.'],
  ['6', 'Competing strategies/model selection', 'Partial — paired, frozen, representative trials.'],
  ['7', 'Independent verification and safety', 'Partial — independent integration and outcome acceptance.'],
  ['8', 'Verified Learning Engine', 'Partial — representative learning/reuse effectiveness.'],
  ['9', 'Persistent searchable knowledge', 'Partial — representative labels, scoped retrieval and isolation.'],
  ['10', 'Real-world mission outcomes', 'Partial — actual product telemetry and independent evidence.'],
  ['11', 'Checkpoints and long-horizon execution', 'Partial — pending/ambiguous cases and real host interruption.'],
  ['12', 'Benchmark and experiment lab', 'Partial — broader real integration and product coverage.'],
  ['13', 'Capability and Reliability Dashboard', 'Partial — representative measured product outcomes.'],
  ['14', 'Research and opportunity discovery', 'Partial — factual verification beyond source provenance.'],
  ['15', 'Safe capability expansion', 'Partial — explicit permissions, limits, rollback and acceptance.'],
  ['16', 'Cost/resource intelligence', 'Partial — actual invoices and compute/traffic/storage reconciliation.'],
  ['17', 'Payment activation', 'LAST — blocked until release steps 13–16 pass.'],
  ['18', 'Product and venture delivery', 'Partial — full integrated journey and real outcomes.'],
  ['19', 'Security and resilience at scale', 'Partial — managed controls, load, monitoring and runbooks.'],
  ['20', 'Enterprise governance', 'Partial — actual Workspace tenant sign-in; directory scope decision.'],
  ['21', 'Agent/developer ecosystem', 'Partial — additional authenticated tools and controlled distribution.'],
  ['22', 'Competitive validation and novelty', 'Partial — independent matched-task evidence.'],
  ['23', 'Frontier scientific research', 'Research — adequate sampling and independent replication.'],
  ['24', 'AGI-oriented generality research', 'Research — held-out transfer evaluation, not an AGI claim.'],
]

function IntegrationOptionsPage() {
  return <WorkspaceLayout title="Integration options" eyebrow="NEXUS FORGE / EXTERNAL DEPENDENCIES">
    <section className="workspace dark-section">
      <div className="workspace-head">
        <div><div className="section-kicker">FREE-FIRST INTEGRATION PLAN</div><h1>What NEXUS FORGE needs next</h1></div>
        <span className="status-chip">24 MILESTONES</span>
      </div>
      <p>Use this as the single sourced checklist for external dependencies. These are official links and free or low-cost options, not proof of connection. Keep the existing Macaly + Convex + GitHub foundation; connect only services required by a specific acceptance gate.</p>
      <div className="hero-actions">
        <Link className="primary-button" to="/roadmap">Return to roadmap →</Link>
        <Link className="secondary-button" to="/connections">Open Integration Center →</Link>
        <Link className="secondary-button" to="/capabilities">Review release gates →</Link>
      </div>
      <div className="glass-card research-card">
        <div className="panel-title"><span>RELEASE GATES — DO NOT SKIP</span><span className="status-chip">HOLD</span></div>
        <p><strong>Next:</strong> Step 13 recurring backup/restore evidence. <strong>External access required:</strong> Step 14 managed-host interruption and rollback; Step 15 actual provider invoices. Step 16 freezes non-payment release acceptance. <strong>Step 17 real payment activation remains last.</strong></p>
        <p>Current sandbox discovery found no connected third-party OAuth toolkits. Available choices included Gmail, Calendar, Drive, Docs, Sheets, Notion, Linear, HubSpot, YouTube, Google Analytics and Search Console. Connect through the Integration Center only when needed and grant the narrowest scopes.</p>
      </div>
      <div className="glass-card research-card">
        <div className="panel-title"><span>OFFICIAL INTEGRATION SOURCES</span><span className="status-chip">FREE-FIRST</span></div>
        {options.map(option => <article className="guard-item" key={option.name}>
          <span>↗</span><div>
            <strong>{option.name}</strong><p><span className="status-chip">{option.cost}</span> <span>{option.category}</span></p>
            <p>{option.why}</p>
            <p>{option.links.map((link, index) => <span key={link[1]}>{index > 0 ? ' · ' : ''}<a href={link[1]} target="_blank" rel="noreferrer">{link[0]}</a></span>)}</p>
            <p><strong>Caveat:</strong> {option.caveat}</p>
          </div>
        </article>)}
      </div>
      <div className="glass-card research-card">
        <div className="panel-title"><span>ALL 24 ROADMAP MILESTONES</span><span className="status-chip">HONEST STATUS</span></div>
        <p>These are capability milestones, distinct from the separate 17-step operational release checklist. Existing evidence is retained; unknown or externally blocked work is not marked complete.</p>
        {milestones.map(([id, title, status]) => <article className="guard-item" key={id}><span>{id}</span><div><strong>{title}</strong><p>{status}</p></div></article>)}
      </div>
      <div className="glass-card research-card">
        <div className="panel-title"><span>SAFE FREE-FIRST ORDER</span></div>
        <ol>
          <li>Keep Macaly, Convex and GitHub; complete recurring recovery evidence before adding new infrastructure.</li>
          <li>Use existing developer-tier inference providers only when an actual key/quota is available; server-side secrets, fixed budgets and usage receipts are mandatory.</li>
          <li>Add PostHog for real product events only after privacy/consent review; synthetic tasks never count as customer outcomes.</li>
          <li>Add Sentry as a secondary signal only if useful; verify quota behavior and an actual alert/runbook.</li>
          <li>Use Cloudflare R2 only if a separate encrypted, private recovery copy is needed and retrieval is tested.</li>
          <li>Ask the real Workspace tenant admin to complete sign-in validation; do not substitute a personal account.</li>
          <li>Keep Stripe in test mode until steps 13–16 have accepted evidence. Standard pricing has transaction fees.</li>
        </ol>
      </div>
    </section>
  </WorkspaceLayout>
}
