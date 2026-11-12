import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {EnvironmentManager} from '../components/release-command'
import {ScopeDBatchThree} from '../components/scope-d-batch-three'
export const Route=createFileRoute('/environments')({head:()=>routeHead('/environments'),component:Page})
function Page(){return <WorkspaceLayout title="Environments & Secrets" eyebrow="RELEASE COMMAND"><EnvironmentManager/><ScopeDBatchThree item="D32"/></WorkspaceLayout>}
