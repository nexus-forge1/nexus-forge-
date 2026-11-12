import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {MonetizationStudio} from '../components/business-factory'
import {MonetizationTierConfigurator} from '../components/monetization-tier-configurator'
export const Route=createFileRoute('/monetization')({head:()=>routeHead('/monetization'),component:Page})
function Page(){return <WorkspaceLayout title="Monetization Studio" eyebrow="BUSINESS FACTORY"><MonetizationStudio/><MonetizationTierConfigurator/></WorkspaceLayout>}
