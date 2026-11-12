import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {MissionGraphStudio} from '../components/mission-graph-studio'
import {AdaptiveMissionOrchestratorPanel} from '../components/adaptive-mission-orchestrator-panel'
export const Route=createFileRoute('/mission-graphs')({head:()=>routeHead('/mission-graphs'),component:Page})
function Page(){return <WorkspaceLayout title="Adaptive Mission Graphs" eyebrow="INTELLIGENCE / BOUNDED WORKFLOW REHEARSAL"><MissionGraphStudio/><AdaptiveMissionOrchestratorPanel/></WorkspaceLayout>}
