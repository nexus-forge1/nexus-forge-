import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useActiveMission } from '../hooks/use-active-mission'
import metadata from '../metadata.json'

export const Route = createFileRoute('/readiness')({
  component: ReadinessChecker,
  head: () => routeHead("/readiness"),
})

type RunSummary = { _id: Id<'readinessRuns'>; siteUrl: string; label: string; status: 'pass' | 'fail'; passedCount: number; failedCount: number; totalCount: number; ranAt: number }
type CheckRow = { _id: Id<'readinessChecks'>; checkKey: string; name: string; criterion: string; severity: 'required' | 'warning'; status: 'pass' | 'fail'; detail: string; evidence: string }
type RunDetail = { run: RunSummary; checks: CheckRow[] }

function formatTime(ms: number) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function ReadinessChecker() {
  const [siteUrl, setSiteUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<Id<'readinessRuns'> | null>(null)
  const { missionId, mission, deliveries } = useActiveMission()
  const runChecks = useAction(api.readiness.run)
  const runs = useQuery(api.readiness.listRuns) ?? []
  const detail: RunDetail | undefined = useQuery(api.readiness.getRun, selectedRunId ? { runId: selectedRunId } : 'skip')

  const submit = async () => {
    const target = siteUrl.trim()
    if (!target) { setError('Enter the deployment URL to validate.'); return }
    setBusy(true)
    setError(null)
    try {
      const result = await runChecks({ siteUrl: target, label: label.trim() || undefined })
      setSelectedRunId(result.runId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The readiness check could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const failedChecks = detail?.checks.filter(c => c.status === 'fail') ?? []
  const deliveryEvidence = deliveries.slice(0, 5).map(delivery => {
    const hasWorkflow = !!delivery.workflowRunUrl && delivery.workflowConclusion === 'success' && !!delivery.workflowCommitSha
    const hasDeployment = !!delivery.deploymentRunUrl && delivery.deploymentRunUrl === delivery.workflowRunUrl && !!delivery.deploymentCommitSha && delivery.deploymentCommitSha.toLowerCase() === delivery.workflowCommitSha?.toLowerCase() && !!delivery.deploymentUrl
    const hasReadiness = delivery.readinessStatus === 'pass' && typeof delivery.readinessTotalCount === 'number' && delivery.readinessTotalCount > 0 && delivery.readinessPassedCount === delivery.readinessTotalCount
    const hasFailure = delivery.workflowConclusion === 'failure' || delivery.readinessStatus === 'fail'
    const evidenceTime = Math.max(delivery.workflowRecordedAt ?? 0, delivery.readinessCheckedAt ?? 0)
    const now = Date.now()
    const freshnessWindowMs = 24 * 60 * 60 * 1000
    const fresh = !!delivery.workflowRecordedAt && !!delivery.readinessCheckedAt &&
      now >= delivery.workflowRecordedAt && now - delivery.workflowRecordedAt <= freshnessWindowMs &&
      now >= delivery.readinessCheckedAt && now - delivery.readinessCheckedAt <= freshnessWindowMs
    const complete = hasWorkflow && hasDeployment && hasReadiness
    const evidenceState = hasFailure ? 'FAILED' : !complete ? 'INCOMPLETE' : fresh ? 'FRESH' : 'STALE'
    return { delivery, hasWorkflow, hasDeployment, hasReadiness, evidenceState, evidenceTime }
  })

  return <WorkspaceLayout title="Launch Readiness Checker" eyebrow="PRODUCTION VALIDATION / LRC"><div className="nexus-shell" data-testid="readiness-root"> 
    <main className="workspace rc-page" data-state={busy ? 'loading' : runs.length > 0 ? 'ready' : 'empty'}>
      <div className="workspace-head">
        <div>
          <div className="section-kicker">PRODUCTION VALIDATION / LRC</div>
          <h2>Launch Readiness Checker</h2>
          <p className="rc-sub">Validate a live web deployment against auditable acceptance criteria. Every check records the evidence behind its pass or fail result.</p>
        </div>
        <Link className="ghost-button" to="/">← Back to Forge</Link>
      </div>

      <section className="glass-card rc-card rc-form" data-testid="rc-form">
        <div className="field-grid">
          <div>
            <label htmlFor="rc-url">DEPLOYMENT URL</label>
            <input id="rc-url" data-testid="rc-url" value={siteUrl} onChange={event => setSiteUrl(event.target.value)} placeholder="https://example.com" />
          </div>
          <div>
            <label htmlFor="rc-label">LABEL (OPTIONAL)</label>
            <input id="rc-label" data-testid="rc-label" value={label} onChange={event => setLabel(event.target.value)} placeholder="Production site" />
          </div>
        </div>
        <div className="hero-actions">
          <button className="primary-button" data-testid="rc-run" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Checking…' : 'Run readiness check ↗'}
          </button>
          <span className="status-chip">● EVIDENCE REQUIRED PER CHECK</span>
        </div>
        {error && <p className="rc-error" data-testid="rc-error" role="alert">{error}</p>}
      </section>

      <section className="glass-card rc-card" data-testid="rc-delivery-evidence">
        <div className="panel-title"><span>DELIVERY EVIDENCE RECONCILIATION</span><span className="live-pill">{deliveryEvidence.length} RECORD{deliveryEvidence.length === 1 ? '' : 'S'}</span></div>
        {!missionId || !mission ? <div className="empty-state"><h3>Select a mission to inspect delivery evidence</h3><p>This section reads the active mission's existing delivery records. It does not dispatch workflows or repeat approval checks.</p><Link className="secondary-button" to="/mission">Open Mission Console →</Link></div> : deliveryEvidence.length === 0 ? <div className="empty-state"><h3>No delivery evidence recorded for this mission</h3><p>Build/test, deployment, and canonical readiness evidence will appear here when the delivery ledger records them.</p><Link className="secondary-button" to="/delivery">Open Delivery Pipeline →</Link></div> : deliveryEvidence.map(({ delivery, hasWorkflow, hasDeployment, hasReadiness, evidenceState, evidenceTime }) => <article className="delivery-row" key={delivery._id} data-testid="rc-delivery-row" data-evidence-state={evidenceState.toLowerCase()}>
          <div><strong>{delivery.target} · {delivery.branch}</strong><small>{delivery.status} · {delivery.stage.toUpperCase()}</small>
            <p>Evidence state: <strong>{evidenceState}</strong>{evidenceTime ? ` · last evidence ${formatTime(evidenceTime)}` : ' · no evidence timestamp recorded'}</p>
            <p>{hasWorkflow ? '✓ Build/test workflow succeeded with a recorded commit.' : '✗ Build/test evidence is missing or not successful.'}</p>
            <p>{hasDeployment ? '✓ Deployment evidence points to the same workflow and commit.' : '✗ Deployment URL, run link, or matching commit evidence is missing.'}</p>
            <p>{hasReadiness ? `✓ Canonical readiness passed ${delivery.readinessPassedCount}/${delivery.readinessTotalCount} checks.` : `✗ Canonical readiness is ${delivery.readinessStatus ?? 'missing'} or incomplete (${delivery.readinessPassedCount ?? 0}/${delivery.readinessTotalCount ?? 0}).`}</p>
            {delivery.workflowRunUrl && <p><a href={delivery.workflowRunUrl} target="_blank" rel="noreferrer">Workflow evidence ↗</a>{delivery.deploymentUrl ? <> · <a href={delivery.deploymentUrl} target="_blank" rel="noreferrer">Deployment ↗</a></> : null}</p>}
          </div><span className={evidenceState === 'FRESH' ? 'rc-badge rc-pass' : 'rc-badge rc-fail'}>{evidenceState}</span>
        </article>)}
        <p className="rc-sub">Fresh means both workflow and canonical readiness timestamps are within 24 hours. This is a freshness cue, not a new live probe or independent proof of business outcomes.</p>
      </section>

      {detail && <section className="glass-card rc-card" data-testid="rc-result" data-state={busy ? 'loading' : 'ready'}>
        <div className="panel-title">
          <span>RESULT · {formatTime(detail.run.ranAt)}</span>
          <span className={detail.run.status === 'pass' ? 'rc-badge rc-pass' : 'rc-badge rc-fail'}>
            {detail.run.status === 'pass' ? '✔ READY TO LAUNCH' : '✘ NOT READY'}
          </span>
        </div>
        <p className="rc-target"><strong>{detail.run.label}</strong> · <a href={detail.run.siteUrl} target="_blank" rel="noreferrer">{detail.run.siteUrl}</a></p>
        <p className="rc-score">
          {detail.run.passedCount}/{detail.run.totalCount} checks passed
          {detail.run.failedCount > 0 && <> · <strong>{detail.run.failedCount} failed</strong></>}
        </p>
        {failedChecks.length > 0 && <div className="rc-failed-report" data-testid="rc-failed">
          <h3>Failed checks</h3>
          {failedChecks.map(check => <div className="rc-failed-row" key={check._id}>
            <span className="rc-x">✘</span>
            <div>
              <strong>{check.name}{check.severity === 'required' ? ' (required)' : ' (warning)'}</strong>
              <p>{check.detail}</p>
              <small>Evidence: {check.evidence}</small>
            </div>
          </div>)}
        </div>}
        <div className="rc-checks">
          {detail.checks.map(check => <div className="guard-item rc-check" key={check._id} data-testid={`rc-check-${check.checkKey}`} data-status={check.status}>
            <span className={check.status === 'pass' ? 'rc-ok' : 'rc-x-mark'}>{check.status === 'pass' ? '✔' : '✘'}</span>
            <div>
              <strong>{check.name} · {check.severity === 'required' ? 'REQUIRED' : 'WARNING'}</strong>
              <small>{check.criterion}</small>
              <p className="rc-detail">{check.detail}</p>
              <small className="rc-evidence">Evidence: {check.evidence}</small>
            </div>
            <span className={check.status === 'pass' ? 'rc-badge rc-pass' : 'rc-badge rc-fail'}>{check.status.toUpperCase()}</span>
          </div>)}
        </div>
      </section>}

      <section className="glass-card rc-card" data-testid="rc-history">
        <div className="panel-title"><span>AUDIT HISTORY</span><span className="live-pill">● {runs.length} RUN{runs.length === 1 ? '' : 'S'}</span></div>
        {runs.length === 0 ? <div className="empty-state"><h3>No readiness runs yet</h3><p>Run your first check to create an auditable pass/fail record.</p></div> :
          runs.map(run => <button className="rc-history-row" key={run._id} data-testid="rc-history-row" onClick={() => setSelectedRunId(run._id)}>
            <div><strong>{run.label}</strong><small>{run.siteUrl} · {formatTime(run.ranAt)}</small></div>
            <span className={run.status === 'pass' ? 'rc-badge rc-pass' : 'rc-badge rc-fail'}>{run.passedCount}/{run.totalCount} · {run.status.toUpperCase()}</span>
          </button>)}
      </section>
    </main>
  </div></WorkspaceLayout>
}
