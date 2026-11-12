export const workspaceGroups = [
  {
    title: '01 · START & PLAN',
    intro: 'Define the outcome, track project progress, and plan the work.',
    pages: [
      { path: '/', title: 'Overview', icon: '⌂', purpose: 'Current mission status, shared progress, and the next action.', use: 'Start here when returning to NEXUS FORGE.', output: 'A clear status and next step.' },
      { path: '/mission', title: 'Mission Console', icon: '◈', purpose: 'Define the mission outcome, constraints, budget, and authorization.', use: 'Create or select a mission.', output: 'A saved mission contract.' },
      { path: '/roadmap', title: 'Master Roadmap', icon: '☷', purpose: 'Track feature coverage, evidence, gaps, and build priorities.', use: 'Plan product development.', output: 'A prioritized project checklist.' },
      { path: '/release-evidence', title: 'Release Evidence Center', icon: '◉', purpose: 'Track operational release gates, evidence references, owners, and hold reasons.', use: 'When preparing a release or reviewing outstanding operational proof.', output: 'A clearly scoped evidence register and release hold summary.' },
      { path: '/workflow', title: 'Guided Workflow', icon: '◌', purpose: 'Follow the mission lifecycle and understand where to go next.', use: 'When you need step-by-step operating guidance.', output: 'A mission-specific next-step recommendation.' },
    ],
  },
  {
    title: '02 · INTELLIGENCE',
    intro: 'Plan with agents, structure intent, design opportunities, and gather evidence.',
    pages: [
      { path: '/council', title: 'AI Council', icon: '◎', purpose: 'Review governed planning and specialist agent results.', use: 'After defining a mission.', output: 'A recorded plan and agent evidence.' },
      { path: '/manifest', title: 'Manifest Intelligence', icon: '✧', purpose: 'Create blueprints, compare strategies, and track assumptions and outcomes.', use: 'For opportunity design and longer-horizon strategy.', output: 'A blueprint and evidence-linked strategy records.' },
      { path: '/orchestrator', title: 'Intelligence Orchestrator', icon: '⟁', purpose: 'Compile intent into measurable criteria and competing strategies.', use: 'Before execution when a goal needs structure.', output: 'A structured, reviewable mission specification.' },
      { path: '/visual-builder', title: 'Visual Builder', icon: '◩', purpose: 'Edit supported task presentation with exact source revisions.', use: 'After generating an owner-private task source pack.', output: 'Responsive model previews, code diffs, undo and retained restores.' },
      { path: '/feature-builder', title: 'Full-Stack Feature Builder', icon: '▣', purpose: 'Generate a complete private task slice from frozen requirements.', use: 'When building a supported owner-private feature.', output: 'Versioned source, native preview and an exact artifact review handoff.' },
      { path: '/imports', title: 'Existing-App Import', icon: '⇥', purpose: 'Assess exact public repository commits and preserve modernization baselines.', use: 'Before planning changes to an existing app.', output: 'Architecture inventory, reported CI, baseline comparisons and private plans.' },
      { path: '/portfolio-decisions', title: 'Portfolio Decisions', icon: '◇', purpose: 'Review evidence and propose venture resources with explicit conditions.', use: 'Before continuing, pausing, pivoting or stopping a venture.', output: 'Private source-bound strategic reviews and resource proposals.' },
      { path: '/evolution', title: 'Controlled Evolution', icon: '⤴', purpose: 'Review frozen skill candidates and cap private rehearsal pilots.', use: 'When evaluating a workflow revision before broader adoption.', output: 'Exact evidence reviews, capped manual pilots and retained rollback history.' },
      { path: '/skills', title: 'Skill Foundry', icon: '▧', purpose: 'Version private capability contracts and review supplied acceptance evidence.', use: 'Before reusing a planning workflow in a manual rehearsal.', output: 'Frozen packages, retained checks and governed rehearsal handoffs.' },
      { path: '/replay', title: 'Runtime & Replay Lab', icon: '↺', purpose: 'Checkpoint stored planning evidence and compare bounded offline replay branches.', use: 'When diagnosing interrupted or failed graph handoffs.', output: 'Immutable checkpoints, durable offline events and explicit missing-evidence holds.' },
      { path: '/memory-governance', title: 'Governed Memory', icon: '⌁', purpose: 'Review scope, contradictions, expiry and retirement before future memory reuse.', use: 'When a lesson needs validation, revision or retirement.', output: 'Private lifecycle revisions and scoped advisory context.' },
      { path: '/routing', title: 'Outcome-Aware Routing', icon: '⇄', purpose: 'Rank matched provider planning receipts under frozen constraints.', use: 'Before choosing a measured configuration for the same workflow.', output: 'An auditable recommendation or explicit HOLD and reviewed unstarted execution handoff.' },
      { path: '/mission-graphs', title: 'Adaptive Mission Graphs', icon: '⟁', purpose: 'Freeze specialist dependencies, rehearse handoffs and run accounted planning workers when authorized.', use: 'Before promoting a new orchestration strategy.', output: 'Exact planning receipts, bounded rehearsals and retained recovery evidence.' },
      { path: '/evaluations', title: 'Evaluation Lab', icon: '▤', purpose: 'Freeze task suites, grade provided answers and compare exact configuration results.', use: 'Before promoting a prompt, model or workflow change.', output: 'Versioned baseline evidence with explicit provenance limits.' },
      { path: '/evidence-graph', title: 'Evidence Graph', icon: '⟁', purpose: 'Connect exact evidence to scoped beliefs and dependent decisions.', use: 'When reviewing uncertainty, contradictions or changing assumptions.', output: 'A versioned graph and explicit review flags.' },
      { path: '/experiments', title: 'Experiment Designer', icon: '⚗', purpose: 'Preregister scoped comparisons, guardrails and conservative decision rules.', use: 'Before testing a product or growth intervention.', output: 'Frozen contracts, retained observations and reviewed outcomes.' },
      { path: '/evidence', title: 'Research & Memory', icon: '⌁', purpose: 'Gather cited research and inspect persisted evidence and memory.', use: 'When decisions need source-backed context.', output: 'Stored research and citations.' },
    ],
  },
  {
    title: '03 · BUILD',
    intro: 'Create artifacts and verify quality before delivery.',
    pages: [
      { path: '/artifacts', title: 'Artifact Forge', icon: '▣', purpose: 'Generate, inspect, verify, and review artifacts.', use: 'After planning and research.', output: 'A saved artifact with quality findings and its approval state.' },
    ],
  },
  {
    title: '04 · DELIVER',
    intro: 'Deliver through the governed pipeline and verify the resulting evidence.',
    pages: [
      { path: '/delivery', title: 'Delivery Pipeline', icon: '↗', purpose: 'Inspect target, authorization, workflow run, commit, deployment, and readiness evidence.', use: 'After artifact verification and required delivery authorization.', output: 'Traceable delivery evidence.' },
    ],
  },
  {
    title: '05 · MEASURE & LEARN',
    intro: 'Review outcomes after delivery, then compare evidence and capture lessons.',
    pages: [
      { path: '/portfolio', title: 'Portfolio Intelligence', icon: '◇', purpose: 'Prioritize opportunities, record decisions and inspect observed product outcomes across missions.', use: 'When reviewing outcomes or selecting the next opportunity.', output: 'Prioritization decisions, product observations and site-wide traffic receipts.' },
      { path: '/learning', title: 'Verified Learning Engine', icon: '↻', purpose: 'Compare measured results and capture reviewed lessons.', use: 'When comparable baseline and candidate evidence exists.', output: 'Evidence-linked comparisons and advisory lessons.' },
    ],
  },
  {
  "title": "06 · EXPANDED CAPABILITIES",
  "intro": "Collaborate, govern integrations and evaluate evidence.",
  "pages": [
    {
      "path": "/resilience",
      "title": "Security & Resilience",
      "icon": "⬡",
      "purpose": "Manage admission limits and inspect private audit evidence for resource and recovery controls.",
      "use": "Use this optional capability when its inputs are available.",
      "output": "A persisted record and explicit evidence limits."
    },
    {
      "path": "/teams",
      "title": "Team Governance",
      "icon": "◫",
      "purpose": "Create teams, review join requests, manage roles and collaborate through permission-checked notes.",
      "use": "Use this optional capability when its inputs are available.",
      "output": "A persisted record and explicit evidence limits."
    },
    {
      "path": "/developers",
      "title": "Developer Integrations",
      "icon": "⌘",
      "purpose": "Register immutable versioned agent contracts, validate JSON examples and retire package versions.",
      "use": "Use this optional capability when its inputs are available.",
      "output": "A persisted record and explicit evidence limits."
    },
    {
      "path": "/comparisons",
      "title": "Comparative Validation",
      "icon": "⇄",
      "purpose": "Preregister baseline and candidate comparisons and retain paired observations and measured results.",
      "use": "Use this optional capability when its inputs are available.",
      "output": "A persisted record and explicit evidence limits."
    },
    {
      "path": "/science",
      "title": "Scientific Experiments",
      "icon": "⚗",
      "purpose": "Preregister falsifiable hypotheses, collect immutable measurements and export reproducible evidence.",
      "use": "Use this optional capability when its inputs are available.",
      "output": "A persisted record and explicit evidence limits."
    },
    {
      "path": "/generality",
      "title": "Generality Research",
      "icon": "◇",
      "purpose": "Measure bounded transfer across preregistered training and held-out task domains.",
      "use": "Use this optional capability when its inputs are available.",
      "output": "A persisted record and explicit evidence limits."
    }
  ]
},
{
  "title": "07 · PRODUCT STUDIO",
  "intro": "Use dedicated project tools to define, review and deliver products.",
  "pages": [
    {
      "path": "/templates",
      "title": "Mission Templates",
      "icon": "◈",
      "purpose": "Reusable briefs, acceptance criteria, budgets and draft-only mission handoff.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/specifications",
      "title": "Product Specifications",
      "icon": "◈",
      "purpose": "Versioned roles, requirements, routes, entities, integrations and acceptance trace.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/database-studio",
      "title": "Database & Migration Studio",
      "icon": "▤",
      "purpose": "Generate additive Convex schema and Testing-first migration plans.",
      "use": "Before changing a target app data model.",
      "output": "A draft schema addition and explicit migration acceptance gates."
    },
    {
      "path": "/browser-qa",
      "title": "Real Browser QA & Repair",
      "icon": "✓",
      "purpose": "Prepare browser acceptance cases with explicit evidence requirements.",
      "use": "Before accepting a feature or bounded repair.",
      "output": "A test plan marked not-run until real browser evidence is attached."
    },
    {
      "path": "/integration-contracts",
      "title": "Integration Contract Builder",
      "icon": "⇄",
      "purpose": "Define least-privilege auth, retry, timeout and revocation contracts.",
      "use": "Before connecting an external service or API.",
      "output": "A validated contract draft and sandbox acceptance checklist."
    },
    {
      "path": "/knowledge",
      "title": "Document Knowledge Hub",
      "icon": "◈",
      "purpose": "Private document ingestion, exact passages, provenance and Council context attachment.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/economics",
      "title": "Unit Economics",
      "icon": "◈",
      "purpose": "Measured-or-assumed cost scenarios, break-even and per-success margins.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/connections",
      "title": "Integration Center",
      "icon": "◈",
      "purpose": "Connection inventory, scoped permissions, real health receipts and revocation.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/changes",
      "title": "Change Review",
      "icon": "◈",
      "purpose": "Compare immutable versions, inspect impacts and request targeted revisions.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/client-delivery",
      "title": "Client Delivery Portal",
      "icon": "◈",
      "purpose": "Expiring authenticated deliverable access, feedback, acceptance and revocation.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/notifications",
      "title": "Notification Center",
      "icon": "◈",
      "purpose": "Owner-scoped event inbox, read state and links to affected work.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    },
    {
      "path": "/expansion",
      "title": "Expansion Checklist",
      "icon": "☷",
      "purpose": "Track all 36 requested additions and exact implementation boundaries.",
      "use": "Select a project and use this feature's controls.",
      "output": "Private saved records and explicit next-step guidance."
    }
  ]
},
{
  "title": "08 · BUSINESS FACTORY",
  "intro": "Validate demand, price work, run customer operations, launch with review, and prove business readiness.",
  "pages": [
    {
      "path": "/demand",
      "title": "Demand Validation",
      "icon": "◈",
      "purpose": "Customer hypotheses, pilot offers, evidence references and explicit go/no-go decisions.",
      "use": "Before committing to a product or venture.",
      "output": "Evidence-backed demand decisions."
    },
    {
      "path": "/monetization",
      "title": "Monetization Studio",
      "icon": "◈",
      "purpose": "Explicit billable work, prices, entitlements, holds, settlement and refunds.",
      "use": "When defining or advancing a quote lifecycle.",
      "output": "Governed quote and settlement records."
    },
    {
      "path": "/customer-operations",
      "title": "Customer Operations",
      "icon": "◈",
      "purpose": "Customer lifecycle stages with a product-linked issue log and resolution.",
      "use": "When onboarding, supporting or cancelling customers.",
      "output": "Tracked lifecycle and issue history."
    },
    {
      "path": "/growth",
      "title": "Launch & Growth",
      "icon": "◈",
      "purpose": "Audience/offer/channel contracts, reviewed publishing and measurements.",
      "use": "Before any external campaign publishing.",
      "output": "Reviewed campaign contracts and measurements."
    },
    {
      "path": "/business-readiness",
      "title": "Business Readiness",
      "icon": "◈",
      "purpose": "Evidence-linked payments, operations, economics, privacy and ownership review.",
      "use": "Before launch or investor review.",
      "output": "A dossier that is ready only when all sections are evidence-linked."
    }
  ]
},
{
  "title": "09 · RELEASE COMMAND",
  "intro": "Plan deployments, manage previews and environments, govern releases, and prepare recovery and exit.",
  "pages": [
    {
      "path": "/deployment-planner",
      "title": "Deployment Planner",
      "icon": "▤",
      "purpose": "Runtime capability matrices, regions, adapters and verified target evidence.",
      "use": "Before choosing or verifying a deployment target.",
      "output": "A capability matrix with verification receipts."
    },
    {
      "path": "/previews",
      "title": "Preview Factory",
      "icon": "▤",
      "purpose": "Isolated branch previews with owner, expiry, budget and cleanup receipts.",
      "use": "When a change needs an isolated preview before release.",
      "output": "Bounded previews with recorded cleanup."
    },
    {
      "path": "/environments",
      "title": "Environments & Secrets",
      "icon": "▤",
      "purpose": "Versioned variable manifests with server/browser classification, managed references and rotation.",
      "use": "Before changing runtime configuration or rotating access.",
      "output": "Revisioned secret-free manifests."
    },
    {
      "path": "/releases",
      "title": "Release Pipeline",
      "icon": "▤",
      "purpose": "Exact-commit releases with environment checks, explicit approval and live verification.",
      "use": "When promoting a verified commit to production.",
      "output": "An approved and verified release record."
    },
    {
      "path": "/recovery",
      "title": "Rollback & Recovery",
      "icon": "▤",
      "purpose": "Known-good versions, data compatibility checks and measured recovery drills.",
      "use": "Before and after any risky deployment.",
      "output": "A practiced recovery plan."
    },
    {
      "path": "/diagnostics",
      "title": "Production Diagnostics",
      "icon": "▤",
      "purpose": "Correlate real failures, reproduce, propose bounded repair and verify in preview.",
      "use": "When production behavior needs diagnosis.",
      "output": "A verified bounded repair case."
    },
    {
      "path": "/ownership",
      "title": "Ownership & Export",
      "icon": "▤",
      "purpose": "Code/schema/config/test/document export with secret-free manifests and resource ownership.",
      "use": "When proving portability or preparing an exit.",
      "output": "A secret-free ownership export record."
    }
  ]
},
  {
    title: '10 · AUTONOMOUS ENGINE',
    intro: 'Plan governed autonomous build lanes, bounded recovery, agent safety, model routing, historical replay, and compliance evidence.',
    pages: [
      { path: '/super-builder', title: 'Super-Intelligence App Builder', icon: '✧', purpose: 'Turn reviewed intent into a staged TanStack + Convex build contract.', use: 'When a product idea needs a structured scaffold and synthesis handoff.', output: 'An editable build contract and explicit local handoff state.' },
      { path: '/self-healing', title: 'Self-Healing Platform Engine', icon: '↺', purpose: 'Correlate D35 diagnostic references with a bounded, reversible repair loop.', use: 'When triaging a failure and preparing a sandbox-only repair proposal.', output: 'A local repair ledger with rollback and blast-radius gates.' },
      { path: '/agent-swarm', title: 'Dynamic Agent Swarm Foundry', icon: '◎', purpose: 'Plan specialist roles and capability assignments around mission bottlenecks.', use: 'When modeling queue-driven orchestration and role coverage.', output: 'A local swarm plan; no agents launch automatically.' },
      { path: '/agent-watchdog', title: 'Autonomous Agent Watchdog', icon: '◉', purpose: 'Inspect pulse thresholds and simulate dead-man failover decisions.', use: 'When tuning agent liveness and task rerouting policy.', output: 'A local watchdog decision ledger.' },
      { path: '/arbitrage-router', title: 'Multi-Model Arbitrage Router', icon: '⇄', purpose: 'Compare estimated provider cost and latency under explicit thresholds.', use: 'When evaluating model routing trade-offs before integration.', output: 'A transparent scenario ranking, not live provider telemetry.' },
      { path: '/event-scrubber', title: 'Interactive Event Scrubber', icon: '◷', purpose: 'Step through historical mission snapshots and inspect line-level state diffs.', use: 'When reviewing a supplied timeline or exported event history.', output: 'A scrubbed timeline and textual diff.' },
      { path: '/audit-export', title: 'Governed Compliance Packager', icon: '▤', purpose: 'Assemble a compliance dossier, calculate a local SHA-256 digest, and export JSON.', use: 'When preparing a reviewable evidence package.', output: 'A local dossier export with an explicitly scoped integrity digest.' },
    ],
  },
  {
    title: 'SUPPORT TOOLS',
    intro: 'Specialist diagnostics and recovery pages remain available when needed, without crowding the main navigation.',
    pages: [
      { path: '/capabilities', title: 'Capability & Reliability', icon: '▤', showInSidebar: false, purpose: 'Review recorded verification, incidents, experiments, and provider diagnostics.', use: 'When investigating reliability or capability evidence.', output: 'A point-in-time view of recorded checks.' },
      { path: '/readiness', title: 'Launch Readiness', icon: '✓', showInSidebar: false, purpose: 'Run and review target-specific readiness checks.', use: 'Before launch or after deployment.', output: 'A readiness result with individual checks.' },
      { path: '/incidents', title: 'Incident Center', icon: '!', showInSidebar: false, purpose: 'Inspect incidents, diagnosis, retry eligibility, and recovery state.', use: 'When a run fails, times out, or becomes blocked.', output: 'A recovery decision and evidence.' },
      { path: '/providers', title: 'AI Providers', icon: '⌘', showInSidebar: false, purpose: 'Inspect provider routing and health information.', use: 'When diagnosing inference availability.', output: 'Provider health and routing visibility.' },
    ],
  },
] as const

// One source of truth: main navigation contains core user-facing pages; specialist tools stay reachable from the guide and relevant feature pages.
export const allWorkspaces = workspaceGroups.reduce<(typeof workspaceGroups)[number]['pages'][number][]>((items, group) => [...items, ...group.pages], [])
export const primaryWorkspaces = allWorkspaces.filter(workspace => !['/visual-builder', '/feature-builder', '/imports', '/portfolio-decisions', '/evolution', '/skills', '/replay', '/memory-governance', '/routing', '/mission-graphs', '/experiments', '/evidence-graph', '/evaluations', '/capabilities', '/readiness', '/incidents', '/providers', '/templates', '/knowledge', '/notifications', '/connections', '/client-delivery', '/changes', '/specifications', '/economics', '/expansion', '/demand', '/monetization', '/customer-operations', '/growth', '/business-readiness', '/deployment-planner', '/previews', '/environments', '/releases', '/recovery', '/diagnostics', '/ownership'].includes(workspace.path))

// Full product guide includes every dedicated page, including on-demand diagnostics.
const guidePaths = ['/', '/workflow', '/roadmap', '/manifest', '/orchestrator', '/mission', '/providers', '/council', '/evidence', '/artifacts', '/delivery', '/readiness', '/portfolio', '/learning', '/capabilities', '/incidents']
export const guidedWorkspaces = guidePaths.map(path => allWorkspaces.find(page => page.path === path)!)
