import { routeHead } from '../lib/route-metadata'
import { createFileRoute } from '@tanstack/react-router'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ExpansionGuide } from '../components/expansion-guide'
import { FrontierControls } from '../components/frontier-controls'
import { DeveloperEcosystemWorkbench } from '../components/roadmap-batch-four'
import { DeveloperCredentialLifecycle } from '../components/expanded-capabilities'
import { DeveloperEcosystemPortal } from '../components/developer-ecosystem-portal'
import { DeveloperCredentialStudio } from '../components/developer-credential-studio'
import metadata from '../metadata.json'
export const Route=createFileRoute('/developers')({head: () => routeHead("/developers"),component:Page})
function Page(){return <WorkspaceLayout title="Developer Integrations" eyebrow="EXPANDED CAPABILITIES"><ExpansionGuide path="/developers"/><DeveloperCredentialLifecycle/><DeveloperCredentialStudio/><DeveloperEcosystemPortal/><DeveloperEcosystemWorkbench/><FrontierControls area="developers"/></WorkspaceLayout>}
