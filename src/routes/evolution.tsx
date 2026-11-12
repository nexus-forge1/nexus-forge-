import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {EvolutionBoundaryPanel} from '../components/evolution-boundary-panel'
import {EvolutionLab} from '../components/evolution-lab'
import {ControlledEvolutionSafetyPanel} from '../components/controlled-evolution-safety-panel'
export const Route=createFileRoute('/evolution')({head:()=>routeHead('/evolution'),component:Page})
function Page(){return <WorkspaceLayout title="Controlled Evolution" eyebrow="INTELLIGENCE / GOVERNED PRIVATE PILOTS"><EvolutionLab/><EvolutionBoundaryPanel/><ControlledEvolutionSafetyPanel/></WorkspaceLayout>}
