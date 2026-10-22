import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { ExperimentLab } from '../components/experiment-lab'
import metadata from '../metadata.json'
export const Route=createFileRoute('/science')({head: () => routeHead("/science"),component:Page})
function Page(){return <WorkspaceLayout title="Scientific Experiments" eyebrow="EXPANDED CAPABILITIES"><ExpansionGuide path="/science"/><ExperimentLab kind="science"/></WorkspaceLayout>}
