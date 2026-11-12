import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {UnitEconomics} from '../components/unit-economics'
import {CostResourceIntelligence} from '../components/roadmap-batch-three'
import { CostResourceMeter } from '../components/cost-resource-meter'
import {UnitEconomicsSimulatorPanel} from '../components/unit-economics-simulator-panel'
export const Route=createFileRoute('/economics')({head:()=>routeHead('/economics'),component:Page})
function Page(){return <WorkspaceLayout title="Unit Economics" eyebrow="PRODUCT STUDIO"><CostResourceIntelligence/><CostResourceMeter/><UnitEconomics/><UnitEconomicsSimulatorPanel/></WorkspaceLayout>}
