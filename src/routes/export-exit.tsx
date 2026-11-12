import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {AssetManifestExitPortal} from '../components/asset-manifest-exit-portal'
export const Route=createFileRoute('/export-exit')({head:()=>routeHead('/'),component:Page})
function Page(){return <WorkspaceLayout title="Asset Manifest & Exit Portal" eyebrow="SCOPE D / PRODUCTIVITY & PORTFOLIO"><AssetManifestExitPortal/></WorkspaceLayout>}
