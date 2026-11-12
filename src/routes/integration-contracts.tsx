import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {AppFactoryWorkbench} from '../components/app-factory-workbench'
import {IntegrationContractStudio} from '../components/integration-contract-studio'
export const Route=createFileRoute('/integration-contracts')({head:()=>routeHead('/integration-contracts'),component:Page})
function Page(){return <WorkspaceLayout title="Integration Contract Builder" eyebrow="APP FACTORY / TYPED CONNECTORS"><AppFactoryWorkbench mode="integration"/><IntegrationContractStudio/></WorkspaceLayout>}
