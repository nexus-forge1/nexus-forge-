import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {PreviewFactory} from '../components/release-command'
import {ScopeDBatchThree} from '../components/scope-d-batch-three'
export const Route=createFileRoute('/previews')({head:()=>routeHead('/previews'),component:Page})
function Page(){return <WorkspaceLayout title="Preview Factory" eyebrow="RELEASE COMMAND"><PreviewFactory/><ScopeDBatchThree item="D31"/></WorkspaceLayout>}
