import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {PreviewEnvironmentLeaseCard} from '../components/preview-environment-lease-card'
export const Route=createFileRoute('/preview-factory')({head:()=>routeHead('/'),component:Page})
function Page(){return <WorkspaceLayout title="Preview Environment Factory" eyebrow="SCOPE D / PRODUCTIVITY & PORTFOLIO"><PreviewEnvironmentLeaseCard/></WorkspaceLayout>}
