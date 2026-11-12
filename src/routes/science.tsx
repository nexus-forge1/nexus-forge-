import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { ExperimentLab } from '../components/experiment-lab'
import { ScientificSignificancePanel } from '../components/roadmap-batch-four'
import { ScientificProtocolWorkbench } from '../components/scientific-protocol-workbench'
import metadata from '../metadata.json'
export const Route=createFileRoute('/science')({head: () => routeHead("/science"),component:Page})
function Page(){return <WorkspaceLayout title="Scientific Experiments" eyebrow="EXPANDED CAPABILITIES"><ExpansionGuide path="/science"/><ScientificSignificancePanel/><ScientificProtocolWorkbench/><ExperimentLab kind="science"/></WorkspaceLayout>}
