import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { ExperimentLab } from '../components/experiment-lab'
import metadata from '../metadata.json'
export const Route=createFileRoute('/comparisons')({head: () => routeHead("/comparisons"),component:Page})
function Page(){return <WorkspaceLayout title="Comparative Validation" eyebrow="EXPANDED CAPABILITIES"><ExpansionGuide path="/comparisons"/><ExperimentLab kind="comparison"/></WorkspaceLayout>}
