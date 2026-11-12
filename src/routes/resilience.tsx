import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { FrontierControls } from '../components/frontier-controls'
import { RecoveryDrillRunner } from '../components/recovery-drill-runner'
import { BackupRecoveryInventory } from '../components/backup-recovery-inventory'
import { SecurityResilienceScale } from '../components/roadmap-batch-four'
import { SecurityPostureControls } from '../components/expanded-capabilities'
import { SecurityResilienceDashboard } from '../components/security-resilience-dashboard'
import { SecurityPostureDashboard } from '../components/security-posture-dashboard'
export const Route=createFileRoute('/resilience')({head: () => routeHead("/resilience"),component:Page})
function Page(){return <WorkspaceLayout title="Security & Resilience" eyebrow="EXPANDED CAPABILITIES"><SecurityPostureControls/><SecurityPostureDashboard/><SecurityResilienceDashboard/><SecurityResilienceScale/><BackupRecoveryInventory/><RecoveryDrillRunner/><ExpansionGuide path="/resilience"/><FrontierControls area="resilience"/></WorkspaceLayout>}
