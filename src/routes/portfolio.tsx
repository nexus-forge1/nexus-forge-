import { routeHead } from '../lib/route-metadata'
import { PlatformTaskPerformance } from '../components/platform-task-performance'
import { SiteTrafficEvidence } from "../components/site-traffic-evidence"
import { createFileRoute, Link } from '@tanstack/react-router'
import { ProductOutcomeMeasurements } from '../components/product-outcome-measurements'
import { PortfolioIntelligence } from '../components/portfolio-intelligence'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useActiveMission } from '../hooks/use-active-mission'

export const Route = createFileRoute('/portfolio')({ head: () => routeHead("/portfolio"), component: PortfolioPage })

function PortfolioPage() {
  const { setMissionId, missionId, mission } = useActiveMission()
  return <WorkspaceLayout title="Portfolio Intelligence" eyebrow="OPERATIONS / MISSION HISTORY & DECISIONS">
    <section className="workspace"><PlatformTaskPerformance missionId={mission ? missionId : null}/><PortfolioIntelligence ownerKey="local-workspace" selectedMissionId={mission ? missionId : null} selectedMissionTitle={mission?.title} onSelect={id => { setMissionId(id as any) }} /><ProductOutcomeMeasurements key={missionId ?? "all"} missionId={missionId} missionTitle={mission?.title} /><SiteTrafficEvidence key={"traffic-" + (missionId ?? "all")} missionId={missionId} /><div className="hero-actions"><Link className="secondary-button" to="/mission">Open Mission Console →</Link></div></section>
  </WorkspaceLayout>
}
