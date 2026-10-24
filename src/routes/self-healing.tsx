import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { SelfHealingEnginePanel } from '../components/self-healing-engine-panel'
export const Route = createFileRoute('/self-healing')({ head: () => routeHead('/self-healing'), component: Page })
function Page() { return <WorkspaceLayout title="Self-Healing Platform Engine" eyebrow="SCOPE E · E2 / BOUNDED REPAIR"><SelfHealingEnginePanel /></WorkspaceLayout> }
