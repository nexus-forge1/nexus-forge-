import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {EvidenceGraph} from '../components/evidence-graph'
import {EvidenceUncertaintyGraphViewer} from '../components/evidence-uncertainty-graph-viewer'
export const Route=createFileRoute('/evidence-graph')({head:()=>routeHead('/evidence-graph'),component:Page})
function Page(){return <WorkspaceLayout title="Evidence Graph & Uncertainty" eyebrow="INTELLIGENCE / EVIDENCE TO DECISION"><EvidenceGraph/><EvidenceUncertaintyGraphViewer/></WorkspaceLayout>}
