import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {IntegrationCenter} from '../components/integration-center'
export const Route=createFileRoute('/connections')({head:()=>routeHead('/connections'),component:Page})
function Page(){return <WorkspaceLayout title="Integration Center" eyebrow="PRODUCT STUDIO"><IntegrationCenter/></WorkspaceLayout>}
