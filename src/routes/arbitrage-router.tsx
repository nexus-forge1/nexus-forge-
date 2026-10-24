import { createFileRoute } from '@tanstack/react-router'
import { routeHead } from '../lib/route-metadata'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ArbitrageRouterMatrix } from '../components/arbitrage-router-matrix'
export const Route = createFileRoute('/arbitrage-router')({ head: () => routeHead('/arbitrage-router'), component: Page })
function Page() { return <WorkspaceLayout title="Multi-Model Arbitrage Router" eyebrow="SCOPE E · E5 / PRICE & LATENCY TRADE-OFF"><ArbitrageRouterMatrix /></WorkspaceLayout> }
