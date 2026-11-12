import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {PortfolioDecisions} from '../components/portfolio-decisions'
import {PortfolioResourceAllocationMatrix} from '../components/portfolio-resource-allocation-matrix'
export const Route=createFileRoute('/portfolio-decisions')({head:()=>routeHead('/portfolio-decisions'),component:Page})
function Page(){return <WorkspaceLayout title="Portfolio Decision Engine" eyebrow="INTELLIGENCE / VENTURE STRATEGY"><PortfolioDecisions/><PortfolioResourceAllocationMatrix/></WorkspaceLayout>}
