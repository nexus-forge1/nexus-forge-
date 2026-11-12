import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {RecoveryDrillDependencyGraph} from '../components/recovery-drill-dependency-graph'
export const Route=createFileRoute('/rollback-planner')({head:()=>routeHead('/rollback-planner'),component:Page})
function Page(){return <WorkspaceLayout title="Recovery Drill Planner" eyebrow="SCOPE D / PRODUCTIVITY & PORTFOLIO"><RecoveryDrillDependencyGraph/></WorkspaceLayout>}
