import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { TeamGovernance } from '../components/team-governance'
import { EnterpriseGovernanceWorkbench } from '../components/roadmap-batch-four'
import { TeamGovernanceControls } from '../components/expanded-capabilities'
import { EnterpriseGovernanceMatrix } from '../components/enterprise-governance-matrix'
import { TeamGovernanceApprovals } from '../components/team-governance-approvals'
import metadata from '../metadata.json'
export const Route=createFileRoute('/teams')({head: () => routeHead("/teams"),component:Page})
function Page(){return <WorkspaceLayout title="Team Governance" eyebrow="EXPANDED CAPABILITIES"><ExpansionGuide path="/teams"/><TeamGovernanceControls/><TeamGovernanceApprovals/><EnterpriseGovernanceMatrix/><EnterpriseGovernanceWorkbench/><TeamGovernance/></WorkspaceLayout>}
