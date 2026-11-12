export type PipelineStep = { title: string; note: string }
export type PipelineLink = { label: string; path: string }
export type PipelineGuide = { steps: PipelineStep[]; handoff: PipelineLink; couldAlso?: PipelineLink[] }

// Ordered step guides for feature workspaces that follow a lifecycle or pipeline.
// Each guide states the sequence of this workspace's own controls, the requirement
// that unlocks the next stage, and where the pipeline hands off when it completes.
// Guides describe recorded evidence only; no step executes an external action.
export const pipelineGuides: Readonly<Record<string, PipelineGuide>> = {
  '/templates': {
    steps: [
      { title: 'Save a private template', note: 'Reusable brief, acceptance criteria and budget. Templates are never auto-applied.' },
      { title: 'Start a draft project from it', note: 'The project links to a new draft mission; mission approval is a separate, explicit step.' },
      { title: 'Continue in the studio pipeline', note: 'Specifications compile against the active project; approval stays gated until you record it.' },
    ],
    handoff: { label: 'Next: compile a Product Specification', path: '/specifications' },
    couldAlso: [{ label: 'Mission Console →', path: '/mission' }],
  },
  '/specifications': {
    steps: [
      { title: 'Compile a specification', note: 'Requirements and observable acceptance criteria create an immutable revision.' },
      { title: 'Link it to the mission contract', note: 'Saved revisions attach to the active project and its linked mission.' },
      { title: 'Compare revisions before delivery', note: 'Use Change Review to compare a baseline and candidate revision.' },
    ],
    handoff: { label: 'Next: gather Knowledge Hub sources', path: '/knowledge' },
    couldAlso: [{ label: 'Change Review →', path: '/changes' }],
  },
  '/knowledge': {
    steps: [
      { title: 'Save a private source', note: 'Scoped to the selected project; content stays owner-private.' },
      { title: 'Search and retrieve passages', note: 'Filename search finds the retained source and its exact passages.' },
      { title: 'Attach Council context', note: 'Retained sources feed governed planning as private context.' },
    ],
    handoff: { label: 'Next: review AI Council planning', path: '/council' },
    couldAlso: [{ label: 'Research & Memory →', path: '/evidence' }],
  },
  '/economics': {
    steps: [
      { title: 'Capture a cost scenario', note: 'Measured-or-assumed costs and price per successful operation.' },
      { title: 'Review the calculated results', note: 'Break-even, net margin and forecast profit are retained with the scenario.' },
      { title: 'Use it as decision evidence', note: 'Reference the scenario in demand and readiness decisions.' },
    ],
    handoff: { label: 'Next: validate demand', path: '/demand' },
    couldAlso: [{ label: 'Business Readiness →', path: '/business-readiness' }],
  },
  '/connections': {
    steps: [
      { title: 'Review sourced integration options', note: 'Free-tier options are reviewed before anything is connected.' },
      { title: 'Plan typed adapters or GitHub writes', note: 'Adapters and write plans are registered plans, not executed connections.' },
      { title: 'Inspect runtime history and limits', note: 'Provider call history and quota ceilings stay visible per connection.' },
    ],
    handoff: { label: 'Next: compare spec revisions', path: '/changes' },
    couldAlso: [{ label: 'Integration Contracts →', path: '/integration-contracts' }],
  },
  '/changes': {
    steps: [
      { title: 'Choose the project and revisions', note: 'Baseline and candidate revisions of a saved specification.' },
      { title: 'Review the requirement impact', note: 'The comparison reports unchanged or impacted requirements.' },
      { title: 'Compare saved artifacts', note: 'Baseline and candidate artifact dropdowns give a content comparison.' },
    ],
    handoff: { label: 'Next: prepare client delivery', path: '/client-delivery' },
    couldAlso: [{ label: 'Product Specifications →', path: '/specifications' }],
  },
  '/client-delivery': {
    steps: [
      { title: 'Approve an artifact first', note: 'Access grants require an approved artifact; the grant control stays disabled without one.' },
      { title: 'Grant controlled access', note: 'Verified recipient account email and an explicit duration in days.' },
      { title: 'Track feedback, acceptance and revocation', note: 'Deliveries stay listed with their state; revoking access is explicit.' },
    ],
    handoff: { label: 'Next: record delivery evidence', path: '/delivery' },
    couldAlso: [{ label: 'Change Review →', path: '/changes' }],
  },
  '/notifications': {
    steps: [
      { title: 'Review the owner-scoped inbox', note: 'Events come from your own saved work, newest first.' },
      { title: 'Mark read or filter unread', note: 'Mark single events or all loaded events as read; unread filtering is instant.' },
      { title: 'Open the affected work', note: 'Each notification links to its related page and record.' },
    ],
    handoff: { label: 'Next: follow the guided workflow', path: '/workflow' },
    couldAlso: [{ label: 'Mission incidents →', path: '/incidents' }],
  },
  '/demand': {
    steps: [
      { title: 'Save a hypothesis per segment', note: 'Customer segment and hypothesis; evidence references are optional at capture.' },
      { title: 'Attach evidence references', note: 'A Go decision requires at least one evidence reference on the record.' },
      { title: 'Record the explicit decision', note: 'Result Validated/Rejected with Go/No-go; the required decision note explains it.' },
    ],
    handoff: { label: 'Next: build the readiness dossier', path: '/business-readiness' },
    couldAlso: [{ label: 'Unit Economics →', path: '/economics' }, { label: 'Launch & Growth →', path: '/growth' }],
  },
  '/monetization': {
    steps: [
      { title: 'Save a draft quote', note: 'Label, billable scope, numeric price and entitlement.' },
      { title: 'Send, then accept the quote', note: 'Draft → quoted → accepted. Each advance is explicit.' },
      { title: 'Settle, hold or refund', note: 'Holds, settlements and refunds require a note; settled ends the lifecycle.' },
    ],
    handoff: { label: 'Next: link payments evidence in the dossier', path: '/business-readiness' },
    couldAlso: [{ label: 'Demand Validation →', path: '/demand' }],
  },
  '/customer-operations': {
    steps: [
      { title: 'Save the customer', note: 'Name and initial stage: onboarding, active, support or cancelled.' },
      { title: 'Move lifecycle stages as work progresses', note: 'Stage changes are recorded on the private customer record.' },
      { title: 'Track the product-linked issue log', note: 'Add issues and resolve them; resolution is retained with history.' },
    ],
    handoff: { label: 'Next: deliver through the governed portal', path: '/client-delivery' },
    couldAlso: [{ label: 'Monetization Studio →', path: '/monetization' }],
  },
  '/growth': {
    steps: [
      { title: 'Save a campaign draft', note: 'Audience, offer and channels (one per line). Nothing publishes automatically.' },
      { title: 'Request review', note: 'Draft → review starts the governed publishing sequence.' },
      { title: 'Publish with a review note', note: 'Publishing requires an explicit review note (at least 12 characters).' },
      { title: 'Record the measurement', note: 'Measurements are recorded only after publishing.' },
    ],
    handoff: { label: 'Next: decide whether demand is validated', path: '/demand' },
    couldAlso: [{ label: 'Business Readiness →', path: '/business-readiness' }],
  },
  '/business-readiness': {
    steps: [
      { title: 'Create the dossier', note: 'Link evidence to a section for the same product or venture name.' },
      { title: 'Cover all five sections', note: 'payments, operations, economics, privacy, ownership. READY requires all five evidence-linked.' },
      { title: 'Reopen sections when evidence changes', note: 'Reopening returns that section to missing until evidence is re-linked.' },
    ],
    handoff: { label: 'Next: govern the release pipeline', path: '/releases' },
    couldAlso: [{ label: 'Ownership & Export →', path: '/ownership' }, { label: 'Demand Validation →', path: '/demand' }],
  },
  '/deployment-planner': {
    steps: [
      { title: 'Save a target', note: 'Runtime, region, capability list and host adapter. Targets are ledger records; no host is provisioned.' },
      { title: 'Record a verification note', note: 'A target stays pending until a note is recorded against observed evidence.' },
    ],
    handoff: { label: 'Next: create an isolated preview', path: '/previews' },
    couldAlso: [{ label: 'Environments & Secrets →', path: '/environments' }],
  },
  '/previews': {
    steps: [
      { title: 'Create a preview', note: 'Branch, owner note, expiry 1–30 days and budget $0–100.' },
      { title: 'Use the isolated preview', note: 'Expiry stays visible until cleanup is recorded.' },
      { title: 'Record the cleanup receipt', note: 'Cleanup requires a note; the preview remains listed until then.' },
    ],
    handoff: { label: 'Next: version the runtime manifests', path: '/environments' },
    couldAlso: [{ label: 'Deployment Planner →', path: '/deployment-planner' }],
  },
  '/environments': {
    steps: [
      { title: 'Save a manifest revision', note: 'One entry per line: KEY|server|value, KEY|browser|value or KEY|managed|reference-name.' },
      { title: 'Keep revisions bounded', note: 'Each change creates a new revision; up to 20 per manifest.' },
      { title: 'Rotate access with a note', note: 'Managed entries hold reference names only; rotating requires a rotation note.' },
    ],
    handoff: { label: 'Next: draft the governed release', path: '/releases' },
    couldAlso: [{ label: 'Ownership & Export →', path: '/ownership' }],
  },
  '/releases': {
    steps: [
      { title: 'Save a release draft', note: 'Exact commit SHA (7–40 hex), environment and checks (name|pass or name|fail).' },
      { title: 'Approve or reject', note: 'Approval requires every check to pass and an explicit decision note.' },
      { title: 'Record live verification', note: 'Verification is recorded only after approval.' },
    ],
    handoff: { label: 'Next: prepare the recovery plan', path: '/recovery' },
    couldAlso: [{ label: 'Release Evidence Center →', path: '/release-evidence' }],
  },
  '/recovery': {
    steps: [
      { title: 'Save a recovery plan', note: 'Known-good SHA and explicit recovery steps, one per line.' },
      { title: 'Check data compatibility', note: 'A compatibility note is required before a drill can be measured against the plan.' },
      { title: 'Record measured recovery drills', note: 'Outcome and duration in minutes; the record is a rehearsal, no environment changes.' },
    ],
    handoff: { label: 'Next: open production diagnostics', path: '/diagnostics' },
    couldAlso: [{ label: 'Release Pipeline →', path: '/releases' }],
  },
  '/diagnostics': {
    steps: [
      { title: 'Open a case', note: 'Title, correlated release or incident reference, and reproduction steps.' },
      { title: 'Propose a bounded repair', note: 'The proposal is recorded on the case; nothing is executed.' },
      { title: 'Verify in preview, then close', note: 'The case closes only after a preview verification note.' },
    ],
    handoff: { label: 'Next: ship the verified fix as a release', path: '/releases' },
    couldAlso: [{ label: 'Incident Center →', path: '/incidents' }],
  },
  '/ownership': {
    steps: [
      { title: 'Record an ownership export', note: 'Resource ownership (domains, accounts, billing, infrastructure), export artifacts (kind|reference) and a secret-free attestation.' },
      { title: 'Review the retained record', note: 'Artifacts are code, schema, config, tests or docs references; credential-like values are refused.' },
    ],
    handoff: { label: 'Next: keep runtime manifests current', path: '/environments' },
    couldAlso: [{ label: 'Business Readiness →', path: '/business-readiness' }],
  },
}

export function pipelineFor(path: string): PipelineGuide | undefined {
  return pipelineGuides[path]
}
