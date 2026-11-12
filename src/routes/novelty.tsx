import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { NoveltyBenchmarkWorkbench } from '../components/roadmap-batch-four'
import { CompetitiveMoatCard } from '../components/competitive-moat-card'
export const Route = createFileRoute('/novelty')({ head: () => routeHead('/novelty'), component: Page })
function Page() {
  return <WorkspaceLayout title="Competitive Validation & Novelty" eyebrow="ROADMAP B22 / COMPETITIVE INTELLIGENCE"><NoveltyBenchmarkWorkbench /><CompetitiveMoatCard /></WorkspaceLayout>
}
