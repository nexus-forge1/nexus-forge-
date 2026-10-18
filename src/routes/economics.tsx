import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {UnitEconomics} from '../components/unit-economics'
export const Route=createFileRoute('/economics')({head:()=>routeHead('/economics'),component:Page})
function Page(){return <WorkspaceLayout title="Unit Economics" eyebrow="PRODUCT STUDIO"><UnitEconomics/></WorkspaceLayout>}
