import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {CustomerOpsTriageWorkbench} from '../components/customer-ops-triage-workbench'
export const Route=createFileRoute('/customer-ops')({head:()=>routeHead('/'),component:Page})
function Page(){return <WorkspaceLayout title="Customer Operations Triage" eyebrow="SCOPE D / PRODUCTIVITY & PORTFOLIO"><CustomerOpsTriageWorkbench/></WorkspaceLayout>}
