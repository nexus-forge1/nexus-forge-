import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ReleasePipeline} from '../components/release-command'
import { ReleaseStagingStepper } from '../components/release-staging-stepper'
import {GovernedCanaryPipelineStepper} from '../components/governed-canary-pipeline-stepper'
export const Route=createFileRoute('/releases')({head:()=>routeHead('/releases'),component:Page})
function Page(){return <WorkspaceLayout title="Release Pipeline" eyebrow="RELEASE COMMAND"><ReleasePipeline/><ReleaseStagingStepper/><GovernedCanaryPipelineStepper/></WorkspaceLayout>}
