import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {DemandValidation} from '../components/business-factory'
import {ResearchOpportunityWorkbench} from '../components/roadmap-batch-three'
import { ResearchDiscoveryWorkbench } from '../components/research-discovery-workbench'
import {DemandValidationFunnelView} from '../components/demand-validation-funnel-view'
export const Route=createFileRoute('/demand')({head:()=>routeHead('/demand'),component:Page})
function Page(){return <WorkspaceLayout title="Demand Validation" eyebrow="BUSINESS FACTORY"><ResearchOpportunityWorkbench/><ResearchDiscoveryWorkbench/><DemandValidation/><DemandValidationFunnelView/></WorkspaceLayout>}
