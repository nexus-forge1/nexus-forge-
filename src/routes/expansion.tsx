import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ExpansionChecklist} from '../components/expansion-checklist'
export const Route=createFileRoute('/expansion')({head:()=>routeHead('/expansion'),component:Page})
function Page(){return <WorkspaceLayout title="Expansion Checklist" eyebrow="PRODUCT STUDIO"><ExpansionChecklist/></WorkspaceLayout>}
