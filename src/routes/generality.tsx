import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExperimentLab } from '../components/experiment-lab'
import { GeneralityContainmentWorkbench } from '../components/roadmap-batch-four'
import { GeneralizationResearchVisuals } from '../components/expanded-capabilities'
import { GeneralityContainmentInspector } from '../components/generality-containment-inspector'
import { GeneralityAdaptationVisualizer } from '../components/generality-adaptation-visualizer'
export const Route = createFileRoute('/generality')({ head: () => routeHead('/generality'), component: Page })
function Page() {
  return <WorkspaceLayout title="Generality & Alignment Research" eyebrow="ROADMAP B24 / CONTAINED EVALUATION"><GeneralityContainmentWorkbench /><GeneralityContainmentInspector /><GeneralityAdaptationVisualizer /><GeneralizationResearchVisuals /><ExperimentLab kind="generality" /></WorkspaceLayout>
}
