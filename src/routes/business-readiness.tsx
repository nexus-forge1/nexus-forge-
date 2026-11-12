import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {BusinessReadiness} from '../components/business-factory'
import {BusinessReadinessDossierView} from '../components/business-readiness-dossier-view'
export const Route=createFileRoute('/business-readiness')({head:()=>routeHead('/business-readiness'),component:Page})
function Page(){return <WorkspaceLayout title="Business Readiness" eyebrow="BUSINESS FACTORY"><BusinessReadiness/><BusinessReadinessDossierView/></WorkspaceLayout>}
