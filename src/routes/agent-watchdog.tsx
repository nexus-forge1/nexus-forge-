import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { AgentWatchdogTelemetryView } from '../components/agent-watchdog-telemetry-view'
export const Route = createFileRoute('/agent-watchdog')({ head: () => routeHead('/agent-watchdog'), component: Page })
function Page() { return <WorkspaceLayout title="Autonomous Agent Watchdog" eyebrow="SCOPE E · E4 / PULSE & FAILOVER GOVERNANCE"><AgentWatchdogTelemetryView /></WorkspaceLayout> }
