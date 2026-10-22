# Production domain metadata — October 17, 2026

All 25 routes now use a shared route-head builder reading titles and descriptions from src/metadata.json. Each supplies one current-domain canonical URL, route-specific social metadata and deliberate indexing instructions. The route-agnostic root, Macaly bridge, components, authentication and search validation are preserved.

Welcome and pricing are indexable. The 23 authenticated routes are noindex/follow: search discovery is not a substitute for authorization. robots.txt allows crawling so crawlers can observe noindex directives and references the new public-only sitemap. sitemap.xml lists only welcome and pricing. llms.txt identifies the public entry points and evidence/access boundaries.

The install manifest now names NEXUS FORGE, starts at the root, and references the existing SVG favicon instead of template PNG icons. No generated media or new dependencies were added.

Eight targeted metadata/navigation tests passed, and the required application/TypeScript check passed. Representative server-rendered HTML on welcome, pricing, Providers and Resilience contained the expected title, a single correct canonical and the correct robots directive. Full regression and publication results are reported with the release. Search-engine crawling, ranking and PWA installation on actual devices are not certified by these checks.

Remaining production acceptance continues to require recurring backup evidence, full-application interruption and representative inference-load validation, genuine invoice reconciliation and business/payout activation. This metadata improvement does not close those operational requirements.
