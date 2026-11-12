import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ExperimentDesigner} from '../components/experiment-designer'
import {CausalExperimentDesigner} from '../components/causal-experiment-designer'
export const Route=createFileRoute('/experiments')({head:()=>routeHead('/experiments'),component:Page})
function Page(){return <WorkspaceLayout title="Experiment Designer" eyebrow="INTELLIGENCE / EXPERIMENT CONTRACTS"><ExperimentDesigner/><CausalExperimentDesigner/></WorkspaceLayout>}
