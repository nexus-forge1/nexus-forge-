import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {MissionTemplates} from '../components/mission-templates'
export const Route=createFileRoute('/templates')({head:()=>routeHead('/templates'),component:Page})
function Page(){return <WorkspaceLayout title="Mission Templates" eyebrow="PRODUCT STUDIO"><MissionTemplates/></WorkspaceLayout>}
