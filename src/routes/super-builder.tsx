import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { SuperAppBuilderWorkbench } from '../components/super-app-builder-workbench'
export const Route = createFileRoute('/super-builder')({ head: () => routeHead('/super-builder'), component: Page })
function Page() { return <WorkspaceLayout title="Super-Intelligence App Builder" eyebrow="SCOPE E · E1 / SPECIFICATION → SCAFFOLD → SYNTHESIS"><SuperAppBuilderWorkbench /></WorkspaceLayout> }
