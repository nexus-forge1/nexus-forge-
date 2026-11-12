import {createFileRoute} from '@tanstack/react-router'
import {routeHead} from '../lib/route-metadata'
import {WorkspaceLayout} from '../components/workspace-layout'
import {OutcomeRouting} from '../components/outcome-routing'
import {ProviderFallbackConfigurator} from '../components/provider-fallback-configurator'
import {ParetoRoutingOptimizer} from '../components/pareto-routing-optimizer'
export const Route=createFileRoute('/routing')({head:()=>routeHead('/routing'),component:Page})
function Page(){return <WorkspaceLayout title="Outcome-Aware Provider Routing" eyebrow="INTELLIGENCE / SCOPED EXECUTION EVIDENCE"><OutcomeRouting/><ProviderFallbackConfigurator/><ParetoRoutingOptimizer/></WorkspaceLayout>}
