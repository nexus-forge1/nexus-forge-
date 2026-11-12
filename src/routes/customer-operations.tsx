import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {CustomerOperations} from '../components/business-factory'
import {CustomerOpsTriageWorkbench} from '../components/customer-ops-triage-workbench'
export const Route=createFileRoute('/customer-operations')({head:()=>routeHead('/customer-operations'),component:Page})
function Page(){return <WorkspaceLayout title="Customer Operations" eyebrow="BUSINESS FACTORY"><CustomerOperations/><CustomerOpsTriageWorkbench/></WorkspaceLayout>}
