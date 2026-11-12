import { Link } from '@tanstack/react-router'

const HOME_ORIGIN = 'https://www.network-x-ai.com'
const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${HOME_ORIGIN}/#organization`,
      'name': 'NEXUS FORGE',
      'url': `${HOME_ORIGIN}/`,
      'logo': { '@type': 'ImageObject', 'url': `${HOME_ORIGIN}/favicon.svg`, 'caption': 'NEXUS FORGE orbital mark' },
      'description': 'A governed AI workspace for research, creation, verification and measured outcomes.',
      'sameAs': ['https://github.com/eugenemcmillian3-tech'],
    },
    {
      '@type': 'WebSite',
      '@id': `${HOME_ORIGIN}/#website`,
      'url': `${HOME_ORIGIN}/`,
      'name': 'NEXUS FORGE',
      'description': 'A governed AI workspace for research, creation, verification and measured outcomes.',
      'publisher': { '@id': `${HOME_ORIGIN}/#organization` },
    },
  ],
}

// Public, server-rendered landing copy for crawlers and first paint. The signed-in workspace replaces it after hydration.
export function HomeLandingSeo() {
  return <main className="nexus-shell min-h-screen"><section className="workspace pricing-page" aria-label="About NEXUS FORGE">
    <div className="workspace-head"><div><div className="section-kicker">NEXUS FORGE / GOVERNED INTELLIGENCE OS</div><h1>NEXUS FORGE: a governed intelligence OS for verified outcomes</h1></div></div>
    <p>NEXUS FORGE is a governed intelligence OS: one workspace where ideas move from intent to verified outcome with recorded evidence at every step. Plan a mission in the Mission Console with a concrete deliverable, a success measure and a spend cap. Run cited research and store the evidence. Create drafts and artifacts in the Artifact Forge, run quality checks, and record explicit human approval before anything ships.</p>
    <p>Every capability has its own page. Sixteen dedicated feature pages follow one ordered operating guide, and thirty-six feature workspaces cover intelligence, app building, business operations and release command. Downstream actions stay gated until their prerequisites are recorded, so progress reflects evidence rather than page visits. The Verified Learning Engine compares completed missions so the next run starts from what actually worked.</p>
    <p>NEXUS FORGE is built for operators, founders and small teams who need research, creation and delivery in one accountable place. There is no free plan and no free trial: monthly subscriptions include usage credit, prepaid credit purchases require no subscription, and usage is charged per model inference step against a published token-rate table.</p>
    <div className="hero-actions"><Link className="secondary-button" to="/pricing">Plans and usage pricing →</Link><Link className="ghost-button" to="/workflow">See the guided workflow →</Link></div>
    <p className="muted-copy">Sign in to open your workspace. New operators can create an account with an email verification code.</p>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }} />
  </section></main>
}
