import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {DeploymentPlanner} from '../components/release-command'
import {DeploymentCompatibilityMatrix} from '../components/deployment-compatibility-matrix'
export const Route=createFileRoute('/deployment-planner')({head:()=>routeHead('/deployment-planner'),component:Page})
function Page(){return <WorkspaceLayout title="Deployment Planner" eyebrow="RELEASE COMMAND"><DeploymentPlanner/><DeploymentCompatibilityMatrix/></WorkspaceLayout>}
