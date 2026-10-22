import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { TeamGovernance } from '../components/team-governance'
import metadata from '../metadata.json'
export const Route=createFileRoute('/teams')({head: () => routeHead("/teams"),component:Page})
function Page(){return <WorkspaceLayout title="Team Governance" eyebrow="EXPANDED CAPABILITIES"><ExpansionGuide path="/teams"/><TeamGovernance/></WorkspaceLayout>}
