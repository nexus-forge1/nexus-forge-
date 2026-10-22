import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ChangeReview} from '../components/change-review'
export const Route=createFileRoute('/changes')({head:()=>routeHead('/changes'),component:Page})
function Page(){return <WorkspaceLayout title="Change Review" eyebrow="PRODUCT STUDIO"><ChangeReview/></WorkspaceLayout>}
