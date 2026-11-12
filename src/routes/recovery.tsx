import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {RecoveryPlanner} from '../components/release-command'
import {ScopeDBatchThree} from '../components/scope-d-batch-three'
export const Route=createFileRoute('/recovery')({head:()=>routeHead('/recovery'),component:Page})
function Page(){return <WorkspaceLayout title="Rollback & Recovery" eyebrow="RELEASE COMMAND"><RecoveryPlanner/><ScopeDBatchThree item="D34"/></WorkspaceLayout>}
