import {createFileRoute, Link} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {IntegrationCenter} from '../components/integration-center'
import {IntegrationConnectorCatalog} from '../components/integration-connector-catalog'
export const Route=createFileRoute('/connections')({head:()=>routeHead('/connections'),component:Page})
function Page(){return <WorkspaceLayout title="Integration Center" eyebrow="PRODUCT STUDIO"><section className="workspace"><div className="hero-actions"><Link className="secondary-button" to="/integration-options">Review sourced free-tier integration options →</Link></div></section><IntegrationCenter/><IntegrationConnectorCatalog/></WorkspaceLayout>}
