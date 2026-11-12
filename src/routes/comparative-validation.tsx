import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ComparativeValidationWorkbench } from '../components/expanded-capabilities'
import { ComparativeBenchmarkWorkbench } from '../components/comparative-benchmark-workbench'
export const Route = createFileRoute('/comparative-validation')({ head: () => routeHead('/comparative-validation'), component: Page })
function Page() {
  return <WorkspaceLayout title="Comparative Validation" eyebrow="EXPANDED CAPABILITIES / C1"><ComparativeValidationWorkbench /><ComparativeBenchmarkWorkbench /></WorkspaceLayout>
}
