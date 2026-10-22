export type ExpansionItem = {id:string;title:string;group:string;path:string;existingPath:string;acceptance:string}
export const expansionCatalog: readonly ExpansionItem[] = [
  {
    "id": "mission-templates",
    "title": "Mission Templates",
    "group": "Productivity",
    "path": "/templates",
    "existingPath": "",
    "acceptance": "Reusable briefs, acceptance criteria, budgets and draft-only mission handoff."
  },
  {
    "id": "document-knowledge",
    "title": "Document Knowledge Hub",
    "group": "Productivity",
    "path": "/knowledge",
    "existingPath": "/evidence",
    "acceptance": "Private document ingestion, exact passages, provenance and Council context attachment."
  },
  {
    "id": "notification-center",
    "title": "Notification Center",
    "group": "Productivity",
    "path": "/notifications",
    "existingPath": "/incidents",
    "acceptance": "Owner-scoped event inbox, read state and links to affected work."
  },
  {
    "id": "integration-center",
    "title": "Integration Center",
    "group": "Productivity",
    "path": "/connections",
    "existingPath": "/developers",
    "acceptance": "Connection inventory, scoped permissions, real health receipts and revocation."
  },
  {
    "id": "client-delivery",
    "title": "Client Delivery Portal",
    "group": "Productivity",
    "path": "/client-delivery",
    "existingPath": "/delivery",
    "acceptance": "Expiring authenticated deliverable access, feedback, acceptance and revocation."
  },
  {
    "id": "change-review",
    "title": "Change Review",
    "group": "Productivity",
    "path": "/changes",
    "existingPath": "/artifacts",
    "acceptance": "Compare immutable versions, inspect impacts and request targeted revisions."
  },
  {
    "id": "adaptive-orchestration",
    "title": "Adaptive Mission Orchestrator",
    "group": "Intelligence",
    "path": "/mission-graphs",
    "existingPath": "/orchestrator",
    "acceptance": "Typed acyclic mission graphs, bounded parallel workers, replanning and stopping."
  },
  {
    "id": "evidence-graph",
    "title": "Evidence Graph & Uncertainty Ledger",
    "group": "Intelligence",
    "path": "/evidence-graph",
    "existingPath": "/evidence",
    "acceptance": "Typed evidence links, contradiction, scope and dependent decision impact."
  },
  {
    "id": "experiment-engine",
    "title": "Experiment Designer & Causal Learning",
    "group": "Intelligence",
    "path": "/experiments",
    "existingPath": "/science",
    "acceptance": "Preregister comparison methods and guardrails; retain inconclusive causal results."
  },
  {
    "id": "evaluation-lab",
    "title": "Evaluation Lab & Competency Registry",
    "group": "Intelligence",
    "path": "/evaluations",
    "existingPath": "/comparisons",
    "acceptance": "Versioned task baselines and measured agent/model/prompt/tool competency."
  },
  {
    "id": "outcome-routing",
    "title": "Outcome-Aware Provider Routing",
    "group": "Intelligence",
    "path": "/routing",
    "existingPath": "/providers",
    "acceptance": "Rank authorized models by applicable evaluations, budget, context and privacy."
  },
  {
    "id": "memory-governor",
    "title": "Governed Memory Lifecycle",
    "group": "Intelligence",
    "path": "/memory-governance",
    "existingPath": "/learning",
    "acceptance": "Scoped lessons, contradictions, quarantine, expiry and supersession."
  },
  {
    "id": "replay-lab",
    "title": "Durable Mission Runtime & Replay Lab",
    "group": "Intelligence",
    "path": "/replay",
    "existingPath": "/incidents",
    "acceptance": "Checkpoint diagnosis, recorded-result replay, bounded forks and idempotency."
  },
  {
    "id": "evolution-lab",
    "title": "Controlled Evolution Engine",
    "group": "Intelligence",
    "path": "/evolution",
    "existingPath": "/learning",
    "acceptance": "Versioned proposals, independent gates, limited rollout and rollback."
  },
  {
    "id": "skill-foundry",
    "title": "Skill Foundry",
    "group": "Intelligence",
    "path": "/skills",
    "existingPath": "/developers",
    "acceptance": "Versioned capability contracts, permissions, limits and acceptance evaluations."
  },
  {
    "id": "portfolio-decisions",
    "title": "Portfolio Decision Engine",
    "group": "Intelligence",
    "path": "/portfolio-decisions",
    "existingPath": "/portfolio",
    "acceptance": "Evidence-backed resource allocation and explicit continue/pivot/stop decisions."
  },
  {
    "id": "specification-compiler",
    "title": "Product Specification Compiler",
    "group": "App Factory",
    "path": "/specifications",
    "existingPath": "/orchestrator",
    "acceptance": "Versioned roles, requirements, routes, entities, integrations and acceptance trace."
  },
  {
    "id": "repository-import",
    "title": "Existing-App Import & Modernization",
    "group": "App Factory",
    "path": "/imports",
    "existingPath": "/developers",
    "acceptance": "Repository architecture baseline, repair branches and pre-existing failure separation."
  },
  {
    "id": "feature-builder",
    "title": "Full-Stack Feature Builder",
    "group": "App Factory",
    "path": "/feature-builder",
    "existingPath": "/artifacts",
    "acceptance": "Versioned vertical slices linking UI, API, permissions, data, tests and migrations."
  },
  {
    "id": "visual-builder",
    "title": "Visual Builder With Code Synchronization",
    "group": "App Factory",
    "path": "/visual-builder",
    "existingPath": "",
    "acceptance": "Supported component editing, real code diffs, responsive previews and undo."
  },
  {
    "id": "database-studio",
    "title": "Database & Migration Studio",
    "group": "App Factory",
    "path": "/database-studio",
    "existingPath": "/resilience",
    "acceptance": "Schema/index design, reviewed compatible migrations and isolated customer data."
  },
  {
    "id": "browser-qa",
    "title": "Real Browser QA & Repair",
    "group": "App Factory",
    "path": "/browser-qa",
    "existingPath": "/artifacts",
    "acceptance": "Real journey tests, trace diagnosis, bounded patches and unchanged security assertions."
  },
  {
    "id": "integration-contracts",
    "title": "Integration Contract Builder",
    "group": "App Factory",
    "path": "/integration-contracts",
    "existingPath": "/developers",
    "acceptance": "Typed auth/scope/webhook/retry contracts with sandbox and revocation checks."
  },
  {
    "id": "demand-validation",
    "title": "Demand Validation Workspace",
    "group": "Business Factory",
    "path": "/demand",
    "existingPath": "/manifest",
    "acceptance": "Customer hypothesis, pilot offers, feedback and evidence-backed go/no-go."
  },
  {
    "id": "monetization-studio",
    "title": "Monetization Studio",
    "group": "Business Factory",
    "path": "/monetization",
    "existingPath": "/billing",
    "acceptance": "Explicit billable work, quotes, entitlements, holds, settlement and refunds."
  },
  {
    "id": "unit-economics",
    "title": "Unit Economics Simulator",
    "group": "Business Factory",
    "path": "/economics",
    "existingPath": "/providers",
    "acceptance": "Measured-or-assumed cost scenarios, break-even and per-success margins."
  },
  {
    "id": "customer-operations",
    "title": "Customer Operations Builder",
    "group": "Business Factory",
    "path": "/customer-operations",
    "existingPath": "",
    "acceptance": "CRM, onboarding, support, cancellation and product-linked issue resolution."
  },
  {
    "id": "growth-studio",
    "title": "Governed Launch & Growth Studio",
    "group": "Business Factory",
    "path": "/growth",
    "existingPath": "/manifest",
    "acceptance": "Audience/offer/campaign contracts, reviewed external publishing and measurements."
  },
  {
    "id": "business-readiness",
    "title": "Business Readiness Dossier",
    "group": "Business Factory",
    "path": "/business-readiness",
    "existingPath": "/readiness",
    "acceptance": "Evidence-backed product, payments, operations, economics, privacy and ownership review."
  },
  {
    "id": "deployment-planner",
    "title": "Deployment Compatibility Planner",
    "group": "Release Command",
    "path": "/deployment-planner",
    "existingPath": "/delivery",
    "acceptance": "Runtime capability matrices and verified supported host adapters."
  },
  {
    "id": "preview-factory",
    "title": "Preview Environment Factory",
    "group": "Release Command",
    "path": "/previews",
    "existingPath": "/delivery",
    "acceptance": "Isolated branch previews with owner, expiry, budget and cleanup receipts."
  },
  {
    "id": "environment-manager",
    "title": "Environment & Secrets Manager",
    "group": "Release Command",
    "path": "/environments",
    "existingPath": "/developers",
    "acceptance": "Variable manifests, server/browser classification, managed references and rotation."
  },
  {
    "id": "release-pipeline",
    "title": "Governed Release Pipeline",
    "group": "Release Command",
    "path": "/releases",
    "existingPath": "/delivery",
    "acceptance": "Exact-commit/environment approval, checks, preview QA, migrations and live verification."
  },
  {
    "id": "recovery-planner",
    "title": "Rollback & Recovery Planner",
    "group": "Release Command",
    "path": "/recovery",
    "existingPath": "/resilience",
    "acceptance": "Known-good versions, data compatibility and measured recovery plans."
  },
  {
    "id": "production-diagnostics",
    "title": "Production Diagnostics & Bounded Repair",
    "group": "Release Command",
    "path": "/diagnostics",
    "existingPath": "/incidents",
    "acceptance": "Correlate real failures/releases, reproduce, propose repair and verify preview."
  },
  {
    "id": "ownership-export",
    "title": "Ownership, Export & Exit",
    "group": "Release Command",
    "path": "/ownership",
    "existingPath": "",
    "acceptance": "Code/schema/config/test/document export with secret-free manifests and resource ownership."
  }
]
// A route is listed here only after it has working controls; remaining catalog entries stay visibly planned.
export const starterPaths = ['/templates','/specifications','/knowledge','/economics','/connections','/changes','/client-delivery','/notifications'] as const
