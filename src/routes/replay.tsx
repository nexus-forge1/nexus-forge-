import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ReplayTimelineController} from '../components/replay-timeline-controller'
import {MissionRuntime} from '../components/mission-runtime'
import {ReplayBranchDeltaViewer} from '../components/replay-branch-delta-viewer'
import {DurableRuntimeReplayScrubber} from '../components/durable-runtime-replay-scrubber'
export const Route=createFileRoute('/replay')({head:()=>routeHead('/replay'),component:Page})
function Page(){return <WorkspaceLayout title="Durable Runtime & Replay Lab" eyebrow="INTELLIGENCE / RECORDED PLANNING"><MissionRuntime/><ReplayTimelineController/><ReplayBranchDeltaViewer/><DurableRuntimeReplayScrubber/></WorkspaceLayout>}
