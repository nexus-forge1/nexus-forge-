import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ClientDeliveryPortal} from '../components/client-delivery-portal'
export const Route=createFileRoute('/client-delivery')({head:()=>routeHead('/client-delivery'),component:Page})
function Page(){return <WorkspaceLayout title="Client Delivery Portal" eyebrow="PRODUCT STUDIO"><ClientDeliveryPortal/></WorkspaceLayout>}
