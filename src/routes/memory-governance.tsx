import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {GovernedMemoryPurgeModal} from '../components/governed-memory-purge-modal'
import {MemoryGovernance} from '../components/memory-governance'
import {MemoryLifecycleQuarantineManager} from '../components/memory-lifecycle-quarantine-manager'
export const Route=createFileRoute('/memory-governance')({head:()=>routeHead('/memory-governance'),component:Page})
function Page(){return <WorkspaceLayout title="Governed Memory" eyebrow="INTELLIGENCE / SCOPED LEARNING"><MemoryGovernance/><GovernedMemoryPurgeModal/><MemoryLifecycleQuarantineManager/></WorkspaceLayout>}
