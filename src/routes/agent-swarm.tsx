import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { DynamicAgentSwarmBoard } from '../components/dynamic-agent-swarm-board'
export const Route = createFileRoute('/agent-swarm')({ head: () => routeHead('/agent-swarm'), component: Page })
function Page() { return <WorkspaceLayout title="Dynamic Agent Swarm Foundry" eyebrow="SCOPE E · E3 / ROLE & CAPABILITY PLANNING"><DynamicAgentSwarmBoard /></WorkspaceLayout> }
