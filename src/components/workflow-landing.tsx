import { Link } from '@tanstack/react-router'

const WORKFLOW_ORIGIN = 'https://www.network-x-ai.com'
const workflowJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${WORKFLOW_ORIGIN}/workflow#webpage`,
  'url': `${WORKFLOW_ORIGIN}/workflow`,
  'name': 'Guided Workflow & Feature Guide',
  'description': 'The ordered NEXUS FORGE operating guide: sixteen dedicated feature pages that take a mission from definition to verified delivery with recorded evidence.',
  'isPartOf': { '@id': `${WORKFLOW_ORIGIN}/#website` },
}

// Public, server-rendered description of the guided workflow. The signed-in operating guide replaces it after hydration.
export function WorkflowLandingSeo() {
  return <main className="nexus-shell min-h-screen"><section className="workspace pricing-page" aria-label="About the guided workflow">
    <div className="workspace-head"><div><div className="section-kicker">NEXUS FORGE / OPERATOR HANDBOOK</div><h1>Guided workflow: sixteen ordered feature pages from mission to verified delivery</h1></div></div>
    <p>NEXUS FORGE moves work through one ordered operating guide. A mission starts with a concrete deliverable, a success measure and a spend cap in the Mission Console, then passes through planning, cited research, artifact creation, human approval and delivery with recorded evidence at each checkpoint. The guided workflow page is the operator handbook for that sequence: it shows where to go, why the step matters, and what comes next.</p>
    <p>Sixteen dedicated feature pages make up the guide, from Mission Console and Manifest Intelligence through Research & Memory, Artifact Forge, Readiness and Delivery Pipeline. Downstream actions stay gated until their prerequisites are recorded, so progress reflects saved evidence rather than page visits. The Verified Learning Engine then compares completed missions, and portfolio intelligence tracks outcomes across them.</p>
    <p>The workflow is shared state: every page reads the same mission evidence, and each page recommends the next action. Operators sign in to open the handbook with their own mission progress applied.</p>
    <div className="hero-actions"><Link className="secondary-button" to="/pricing">Plans and usage pricing →</Link><Link className="ghost-button" to="/">Return to NEXUS FORGE →</Link></div>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(workflowJsonLd) }} />
  </section></main>
}
