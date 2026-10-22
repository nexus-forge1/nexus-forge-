import type { Id } from '../../convex/_generated/dataModel'
import { missionProgressPercent } from '../lib/mission-progress'
import { ProductInstrumentation } from './product-instrumentation'
import { RuntimeWorkbench } from './runtime-workbench'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useOwnedMissions } from '../hooks/use-owned-missions'

export function PortfolioIntelligence({ ownerKey = 'local-workspace', onSelect, selectedMissionId = null, selectedMissionTitle }: { ownerKey?: string; onSelect: (id: string) => void; selectedMissionId?: Id<'missions'> | null; selectedMissionTitle?: string }) {
  const portfolio = useQuery(api.portfolio.decisionSnapshot)
  const learning = useQuery(api.portfolio.learningSnapshot)
  const opportunity = useQuery(api.portfolio.nextOpportunity)
  const discovered = useQuery(api.portfolio.listRecommendations, { ownerKey })
  const discoverOpportunities = useAction(api.portfolio.discoverOpportunities)
  const dismissRecommendation = useMutation(api.portfolio.dismissRecommendation)
  const reviewQueue = useQuery(api.portfolio.listReviewQueue)
  const createRecommendedMission = useMutation(api.portfolio.createRecommendedMission)
  const acceptRecommendation = useMutation(api.portfolio.acceptRecommendation)
  const resolveReview = useMutation(api.portfolio.resolveReview)
  const [opportunityBusy, setOpportunityBusy] = useState(false)
  const [opportunityReceipt, setOpportunityReceipt] = useState<string | null>(null)
  const [opportunityError, setOpportunityError] = useState<string | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null)
  const [discoveryTheme, setDiscoveryTheme] = useState('emerging opportunities for small AI-enabled digital products')
  const [discoveryBusy, setDiscoveryBusy] = useState(false)
  const missions = useOwnedMissions(ownerKey, 20)
  const rows = missions?.page ?? []
  const topSignal = learning?.prioritySignals[0]
  return <section id="portfolio" className="workspace portfolio-section">
    <ProductInstrumentation key={selectedMissionId ?? 'no-mission'} missionId={selectedMissionId} missionTitle={selectedMissionTitle}/><RuntimeWorkbench area="outcomes"/><div className="workspace-head"><div><div className="section-kicker">PORTFOLIO INTELLIGENCE / 007</div><h2>Mission History</h2></div><span className="status-chip"><span className="pulse-dot" /> PORTFOLIO LIVE</span></div>
    {opportunityError && <div className="glass-card research-card"><p role="alert">{opportunityError}</p><Link className="secondary-button" to="/incidents">Review incidents →</Link></div>}
    {opportunityReceipt && <div className="glass-card research-card"><p className="receipt" role="status">{opportunityReceipt}</p>{selectedDraft && <Link className="primary-button" to="/mission">Continue to selected draft mission →</Link>}</div>}
    <div className="stats-strip compact"><div><strong>{portfolio?.totalMissions ?? 0}</strong><span>Missions</span></div><div><strong>{portfolio?.active ?? 0}</strong><span>Active</span></div><div><strong>{portfolio?.blocked ?? 0}</strong><span>Review</span></div><div><strong>{Math.round((portfolio?.completionRate ?? 0) * 100)}%</strong><span>Completion</span></div><div><strong>{portfolio?.recommendation?.toUpperCase() ?? '—'}</strong><span>Recommendation</span></div></div>
    {learning && <div className="glass-card research-card"><div className="panel-title"><span>LEARNING-AWARE PRIORITIZATION</span><span className="live-pill">● ADVISORY</span></div><div className="decision-line"><span>TOP SIGNAL</span><strong>{topSignal?.signal ?? 'Insufficient verified history'}</strong></div><p>{topSignal?.implication ?? 'Verified outcomes will inform future ranking once sufficient evidence exists.'}</p><div className="stats-strip compact"><div><strong>{Math.round(learning.successRate * 100)}%</strong><span>Verified success</span></div><div><strong>{learning.verifiedOutcomes}</strong><span>Verified outcomes</span></div><div><strong>{learning.lessonsCaptured}</strong><span>Lessons</span></div><div><strong>{learning.measuredOutcomes}</strong><span>Measured</span></div><div><strong>{Math.round(learning.measurementCoverage * 100)}%</strong><span>Measurement coverage</span></div><div><strong>${learning.actualRuntimeCost.toFixed(2)}</strong><span>Recorded runtime cost (USD)</span></div><div><strong>{learning.runtimeCostRecords}</strong><span>Cost records</span></div><div><strong>{learning.prioritySignals.length}</strong><span>Priority signals</span></div></div></div>}
    <div className="glass-card research-card">
      <div className="panel-title"><span>OPPORTUNITY DISCOVERY</span><span className="live-pill">● WEB + AI SCOUT</span></div>
      <p>Discover new venture candidates from live web evidence. Discovery is advisory only: recommendations are persisted, but nothing is approved, executed, deployed, or measured automatically.</p>
      <div className="field-grid">
        <div><label htmlFor="portfolio-discovery-theme">DISCOVERY THEME</label><input id="portfolio-discovery-theme" value={discoveryTheme} onChange={event => setDiscoveryTheme(event.target.value)} /></div>
        <div><label>GOVERNANCE</label><div className="fake-input">Human decision required</div></div>
      </div>
      <button className="primary-button small" disabled={discoveryBusy || !discoveryTheme.trim()} onClick={async () => {
        setDiscoveryBusy(true); setOpportunityReceipt(null); setOpportunityError(null); setSelectedDraft(null)
        try {
          const result = await discoverOpportunities({ ownerKey, theme: discoveryTheme.trim() })
          setOpportunityReceipt(`Scout persisted ${result.recommendations.length} recommendation(s). Select one to create a draft mission.`)
        } catch (error) {
          setOpportunityError(error instanceof Error ? error.message : 'Opportunity discovery failed.')
        } finally { setDiscoveryBusy(false) }
      }}>{discoveryBusy ? 'Scanning web + reasoning…' : 'Discover opportunities ↗'}</button>
      {discovered?.filter(row => row.status === 'recommended').slice(0, 6).map(row => <div className="guard-item" key={row._id}>
        <span>◇</span>
        <div><strong>{row.title}</strong><small>{row.mission}</small><small>{row.evidence.slice(0, 2).join(' · ')}</small></div>
        <div className="button-row">
          <button className="secondary-button" disabled={opportunityBusy} onClick={async () => {
            setOpportunityBusy(true); setOpportunityReceipt(null); setOpportunityError(null); setSelectedDraft(null)
            try {
              const id = await acceptRecommendation({ id: row._id })
              setOpportunityReceipt('Opportunity accepted as a draft mission. Mission approval and execution remain separate gates.')
              setSelectedDraft(id); onSelect(id)
            } catch (error) { setOpportunityError(error instanceof Error ? error.message : 'Portfolio action failed. Review the current record before retrying.') } finally { setOpportunityBusy(false) }
          }}>Accept → Draft</button>
          <button className="ghost-button" disabled={opportunityBusy} onClick={async () => {
            setOpportunityBusy(true); setOpportunityReceipt(null); setOpportunityError(null); setSelectedDraft(null)
            try { await dismissRecommendation({ id: row._id }); setOpportunityReceipt('Opportunity dismissed. No mission was created.') }
            catch (error) { setOpportunityError(error instanceof Error ? error.message : 'Could not dismiss this recommendation.') }
            finally { setOpportunityBusy(false) }
          }}>Dismiss</button>
        </div>
      </div>)}
    </div>
    {reviewQueue && reviewQueue.length > 0 && <div className="glass-card research-card">
      <div className="panel-title"><span>HUMAN REVIEW QUEUE</span><span className="live-pill">● ACTION REQUIRED</span></div>
      <p>Review-blocked missions stop the venture loop by design. Resolving one below only returns it to draft; it never approves or resumes execution.</p>
      {reviewQueue.slice(0, 8).map((review) => <div className="guard-item" key={review._id}>
        <span>!</span><div><strong>{review.title}</strong><small>{review.mission.slice(0, 220)} · {missionProgressPercent(review.completion)}% complete · {review.approved ? 'previously approved' : 'not approved'}</small></div>
        <div className="button-row">
          <button className="secondary-button" disabled={opportunityBusy} onClick={async () => {
            setOpportunityBusy(true); setOpportunityReceipt(null); setOpportunityError(null); setSelectedDraft(null)
            try {
              await resolveReview({ missionId: review._id, decision: 'reopen', note: 'Human operator reviewed the blocked mission and returned it to draft for an explicit re-approval decision.' })
              setOpportunityReceipt('Review resolved to draft. Mission approval and execution authorization remain separate human gates.')
            } catch (error) { setOpportunityError(error instanceof Error ? error.message : 'Portfolio action failed. Review the current record before retrying.') } finally { setOpportunityBusy(false) }
          }}>Return to draft</button>
          <button className="secondary-button" disabled={opportunityBusy} onClick={async () => {
            setOpportunityBusy(true); setOpportunityReceipt(null); setOpportunityError(null); setSelectedDraft(null)
            try {
              await resolveReview({ missionId: review._id, decision: 'dismiss', note: 'Human operator reviewed the blocked mission and explicitly cancelled it.' })
              setOpportunityReceipt('Mission cancelled by human review. It cannot resume without creating a new governed mission.')
            } catch (error) { setOpportunityError(error instanceof Error ? error.message : 'Portfolio action failed. Review the current record before retrying.') } finally { setOpportunityBusy(false) }
          }}>Dismiss mission</button>
        </div>
      </div>)}
    </div>}
    {opportunity && <div className="glass-card research-card">
      <div className="panel-title"><span>AUTONOMOUS VENTURE LOOP</span><span className="live-pill">● HUMAN DECISION REQUIRED</span></div>
      <div className="decision-line"><span>NEXT OPPORTUNITY</span><strong>{opportunity.title}</strong></div>
      <p>{opportunity.mission}</p>
      {opportunity.rationale.map((reason, i) => <div className="guard-item" key={`opp-reason-${i}`}><span>↻</span><div><strong>Learning rationale</strong><small>{reason}</small></div></div>)}
      {opportunity.evidence.map((evidence, i) => <div className="guard-item" key={`opp-evidence-${i}`}><span>✓</span><div><strong>Persisted evidence</strong><small>{evidence}</small></div></div>)}
      {opportunity.blockedByReview ? <span className="status-chip">BLOCKED BY REVIEW</span> : <button className="secondary-button" disabled={opportunityBusy} onClick={async () => {
        setOpportunityBusy(true); setOpportunityReceipt(null); setOpportunityError(null); setSelectedDraft(null)
        try {
          const id = await createRecommendedMission({ title: opportunity.title, mission: opportunity.mission, ownerKey: opportunity.ownerKey })
          setOpportunityReceipt("Draft mission created. Human mission approval is still required before execution.")
          setSelectedDraft(id); onSelect(id)
        } catch (error) { setOpportunityError(error instanceof Error ? error.message : 'Portfolio action failed. Review the current record before retrying.') } finally { setOpportunityBusy(false) }
      }}>{opportunityBusy ? "Creating draft…" : "Accept opportunity → Create draft mission"}</button>}
      {opportunityReceipt && <p className="receipt">{opportunityReceipt}</p>}
      <p>Recommendations are generated from persisted measurements and lessons. Accepting one creates only a draft; it never approves, executes, deploys, or verifies the mission.</p>
    </div>}
    <div className="glass-card research-card portfolio-table">
      {!portfolio || !missions ? <p>Loading portfolio intelligence…</p> : rows.length === 0 ? <div className="empty-state"><h3>No missions yet</h3><p>Forge your first mission and this view will become the portfolio-level source of truth.</p></div> : <>
        <div className="decision-line"><span>PORTFOLIO RATIONALE</span><strong>{portfolio.rationale[0] ?? 'No additional rationale.'}</strong></div>
        {rows.map(row => <button className="portfolio-row" key={row._id} onClick={() => onSelect(row._id)}><div className="portfolio-main"><strong>{row.title}</strong><p>{row.mission}</p></div><div className="portfolio-cell"><small>STATUS</small><b>{row.status.toUpperCase()}</b></div><div className="portfolio-cell"><small>PROGRESS</small><b>{missionProgressPercent(row.completion, row.status)}%</b></div><div className="portfolio-cell"><small>AUTONOMY</small><b>{row.autonomy.toUpperCase()}</b></div><div className="portfolio-cell"><small>APPROVAL</small><b>{row.approved ? 'APPROVED' : 'PENDING'}</b></div></button>)}
      </>}
    </div>
  </section>
}
