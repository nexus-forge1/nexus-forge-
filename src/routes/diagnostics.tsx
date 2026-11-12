import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {ProductionDiagnostics} from '../components/release-command'
import {DiagnosticsTraceRepairWorkbench} from '../components/diagnostics-trace-repair-workbench'
export const Route=createFileRoute('/diagnostics')({head:()=>routeHead('/diagnostics'),component:Page})
function Page(){return <WorkspaceLayout title="Production Diagnostics" eyebrow="RELEASE COMMAND"><ProductionDiagnostics/><DiagnosticsTraceRepairWorkbench/></WorkspaceLayout>}
