import { missionProgressPercent } from '../lib/mission-progress'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { RealServiceEvidence } from '../components/real-service-evidence'
import { ProductionReleaseReadiness } from '../components/production-release-readiness'
import { ArtifactBenchmarkEvidence } from '../components/artifact-benchmark-evidence'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useActiveMission } from '../hooks/use-active-mission'
import { useOwnedMissions } from '../hooks/use-owned-missions'

export const Route = createFileRoute('/capabilities')({ component: CapabilityDashboard })

type ProviderResult = {
  name: string
  label: string
  configured: boolean
  status: 'healthy' | 'degraded' | 'offline' | 'unconfigured'
  latencyMs: number
  detail: string
}

function CapabilityDashboard() {
  const { missionId, mission } = useActiveMission()
  const missions = useOwnedMissions('local-workspace', 50)
  const experiments = useQuery(api.learningEngine.listExperiments, {})
  const incidents = useQuery(api.incidents.list, missionId ? { missionId } : 'skip')
  const verifications = useQuery(api.verification.list, missionId ? { missionId } : 'skip') as Array<{ _id: string; passed: boolean; score: number; summary: string }> | undefined
  const checkProviders = useAction(api.providerHealth.check)
  const [providers, setProviders] = useState<ProviderResult[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [checkedAt, setCheckedAt] = useState<number | null>(null)

  const runProviderCheck = async () => {
    setChecking(true)
    setError('')
    try {
      const result = await checkProviders()
      setProviders(result as ProviderResult[])
      setCheckedAt(Date.now())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Provider diagnostics failed.')
    } finally {
      setChecking(false)
    }
  }

  const missionRows = missions?.page ?? []
  const activeIncidents = incidents ?? []
  const failedVerifications = (verifications ?? []).filter(item => !item.passed).length
  const passedVerifications = (verifications ?? []).filter(item => item.passed).length
  const openIncidents = activeIncidents.filter(item => item.status !== 'resolved').length
  const healthyProviders = (providers ?? []).filter(item => item.status === 'healthy').length
  const readyToReview = missionRows.filter(item => item.status === 'review').length
  const running = missionRows.filter(item => item.status === 'running').length

  return <WorkspaceLayout title="Capability & Reliability" eyebrow="OPERATIONS / MEASURED CAPABILITY">
    <section className="workspace">
      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span /> EVIDENCE-FIRST OPERATIONS</div>
          <h2>See what works. <em>See what needs proof.</em></h2>
          <p className="hero-text">A live operator dashboard assembled from NEXUS FORGE's existing mission records, incident history, verification outcomes, learning experiments, and on-demand provider inference checks. Missing data is shown as unavailable—not treated as a pass.</p>
          <div className="hero-actions"><Link className="secondary-button" to="/mission">Mission Console →</Link><Link className="secondary-button" to="/learning">Learning Experiments →</Link><Link className="secondary-button" to="/incidents">Incident Center →</Link></div>
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>ACTIVE MISSION CONTEXT</span><span className="live-pill">{mission ? mission.status.toUpperCase() : 'NOT SELECTED'}</span></div>
          {mission ? <><h3>{mission.title}</h3><div className="decision-line"><span>APPROVAL</span><strong>{mission.approved ? 'RECORDED' : 'PENDING'}</strong></div><div className="decision-line"><span>COMPLETION</span><strong>{missionProgressPercent(mission.completion, mission.status)}%</strong></div><div className="decision-line"><span>BUDGET CAP</span><strong>${mission.budget} USD</strong></div></> : <><p>No active mission selected. Mission-specific incidents and verification results will remain unavailable until a mission is selected.</p><Link className="primary-button small" to="/mission">Select a mission →</Link></>}
        </div>
      </div>

      <RealServiceEvidence/><ProductionReleaseReadiness />
      <ArtifactBenchmarkEvidence />
      <div className="stats-strip">
        <div><strong>{missions ? missionRows.length : '—'}</strong><span>Recent missions</span></div>
        <div><strong>{missions ? running : '—'}</strong><span>Running</span></div>
        <div><strong>{missions ? readyToReview : '—'}</strong><span>Awaiting review</span></div>
        <div><strong>{experiments ? experiments.length : '—'}</strong><span>Saved experiments</span></div>
      </div>

      <div className="console-grid">
        <div className="glass-card research-card">
          <div className="panel-title"><span>PROVIDER RELIABILITY</span><span className="live-pill">{providers ? `${healthyProviders}/${providers.length} HEALTHY` : 'NOT CHECKED'}</span></div>
          <p>Diagnostics send a small authenticated inference request and report latency plus a bounded error detail. They never display credentials. This check is manual to avoid unnecessary calls to free-tier providers.</p>
          <button className="primary-button" disabled={checking} onClick={() => void runProviderCheck()}>{checking ? 'Checking configured providers…' : 'Run provider diagnostics ↗'}</button>
          {checkedAt && <p className="muted-copy">Last checked {new Date(checkedAt).toLocaleString()}. Results are a point-in-time snapshot, not a guarantee of future availability.</p>}
          {error && <p className="warning" role="alert">{error}</p>}
          {providers && <div className="provider-list">{providers.map(provider => <div className="portfolio-row" key={provider.name}>
            <div className="portfolio-main"><strong>{provider.label}</strong><p>{provider.detail}</p></div>
            <div className="portfolio-cell"><small>STATUS</small><b>{provider.status.toUpperCase()}</b></div>
            <div className="portfolio-cell"><small>LATENCY</small><b>{provider.configured ? `${provider.latencyMs} ms` : '—'}</b></div>
          </div>)}</div>}
        </div>

        <div className="glass-card research-card">
          <div className="panel-title"><span>VERIFICATION EVIDENCE</span><span className="live-pill">{verifications ? 'MISSION RECORDS' : 'UNAVAILABLE'}</span></div>
          {missionId ? verifications === undefined ? <p>Loading verification outcomes…</p> : <><div className="stats-strip compact"><div><strong>{passedVerifications}</strong><span>Passed</span></div><div><strong>{failedVerifications}</strong><span>Failed</span></div><div><strong>{verifications.length}</strong><span>Total recorded</span></div></div>{verifications.length === 0 ? <p>No verification outcomes are recorded for this mission yet. A missing result is not a pass.</p> : verifications.slice(0, 5).map(item => <div className="decision-line" key={item._id}><span>{Math.round(item.score * 100)}% · {item.passed ? 'PASS' : 'NOT PASSED'}</span><strong>{item.summary}</strong></div>)}</> : <p>Select a mission to see its recorded verification evidence.</p>}
          <div className="hero-actions"><Link className="secondary-button" to="/delivery">Delivery evidence →</Link><Link className="secondary-button" to="/readiness">Launch readiness →</Link></div>
        </div>
      </div>

      <div className="console-grid">
        <div className="glass-card research-card">
          <div className="panel-title"><span>INCIDENTS & RECOVERY</span><span className="live-pill">{incidents ? `${openIncidents} OPEN / ESCALATED` : 'UNAVAILABLE'}</span></div>
          {missionId ? incidents === undefined ? <p>Loading incident history…</p> : activeIncidents.length === 0 ? <p>No incidents are recorded for this mission. This only reflects the selected mission's stored history.</p> : activeIncidents.slice(0, 5).map(item => <div className="decision-line" key={item._id}><span>{item.status.toUpperCase()} · {item.stage}</span><strong>{item.message}</strong></div>) : <p>Select a mission to inspect its incident history.</p>}
          <Link className="secondary-button" to="/incidents">Open Incident Center →</Link>
        </div>
        <div className="glass-card research-card">
          <div className="panel-title"><span>LEARNING EXPERIMENTS</span><span className="live-pill">{experiments ? experiments.length + ' SAVED' : 'LOADING'}</span></div>
          {experiments === undefined ? <p>Loading experiment records…</p> : experiments.length === 0 ? <p>No learning experiments recorded yet. Record comparable baseline and candidate measurements before recommending a change.</p> : experiments.slice(0, 5).map(row => {
            let record: { name?: string; decision?: string; rationale?: string; promotionApplied?: boolean } = {}
            try { record = JSON.parse(row.value) as typeof record } catch { /* retain a safe fallback for legacy records */ }
            return <div className="decision-line" key={row._id}><span>{(record.decision ?? 'RECORDED').toUpperCase().replaceAll('-', ' ')}</span><strong>{record.name ?? row.key}</strong><p>{record.rationale ?? 'Review the saved experiment details.'}</p></div>
          })}
          <p className="muted-copy">Experiment records are operator-entered unless explicitly stated otherwise. A recommendation never auto-promotes a strategy.</p>
          <Link className="secondary-button" to="/learning">Review learning evidence →</Link>
        </div>
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>RELIABILITY INTERPRETATION</span><span className="live-pill">NO UNPROVEN CLAIMS</span></div>
        <div className="decision-line"><span>LIVE DEPLOYMENT</span><strong>Available in the published app; hourly public-shell probes are available through the release checklist. This panel does not display live uptime telemetry.</strong></div>
        <div className="decision-line"><span>MISSION SUCCESS</span><strong>Requires recorded verification evidence; generated text alone is not proof.</strong></div>
        <div className="decision-line"><span>LEARNING PROMOTION</span><strong>Requires measured comparisons and human review; no automatic self-modification.</strong></div>
        <div className="decision-line"><span>PROVIDER STATUS</span><strong>Only current when the operator runs diagnostics; failures do not block unrelated work.</strong></div>
      </div>
    </section>
  </WorkspaceLayout>
}
