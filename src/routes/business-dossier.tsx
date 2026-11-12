import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {BusinessReadinessDossierView} from '../components/business-readiness-dossier-view'
export const Route=createFileRoute('/business-dossier')({head:()=>routeHead('/'),component:Page})
function Page(){return <WorkspaceLayout title="Business Readiness Dossier" eyebrow="SCOPE D / PRODUCTIVITY & PORTFOLIO"><BusinessReadinessDossierView/></WorkspaceLayout>}
