import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {NotificationCenter} from '../components/notification-center'
export const Route=createFileRoute('/notifications')({head:()=>routeHead('/notifications'),component:Page})
function Page(){return <WorkspaceLayout title="Notification Center" eyebrow="PRODUCT STUDIO"><NotificationCenter/></WorkspaceLayout>}
