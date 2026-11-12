import { GitHubProductImport } from "./github-product-import"
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

const metrics = [
  { key: 'active-users', label: 'Active users', unit: 'people' },
  { key: 'paid-customers', label: 'Paying customers', unit: 'people' },
  { key: 'revenue-usd', label: 'Revenue', unit: 'USD' },
  { key: 'task-success-rate', label: 'Task success rate', unit: '%' },
  { key: 'task-time-seconds', label: 'Task completion time', unit: 'seconds' },
] as const

export function ProductOutcomeMeasurements({ missionId, missionTitle }: { missionId: Id<'missions'> | null; missionTitle?: string }) {
  const record = useMutation(api.verification.recordProductOutcome)
  const [scope, setScope] = useState(missionId ? 'mission' : 'all')
  const selectedMission = scope === 'mission' && missionId ? missionId : null
  const { results, status, loadMore } = usePaginatedQuery(api.verification.productOutcomesV2, selectedMission ? { missionId: selectedMission } : {}, { initialNumItems: 10 })
  const [metric, setMetric] = useState<typeof metrics[number]['key']>('active-users')
  const [observed, setObserved] = useState('')
  const [target, setTarget] = useState('')
  const [sampleSize, setSampleSize] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [method, setMethod] = useState('')
  const [evidence, setEvidence] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const definition = metrics.find(item => item.key === metric)!
  const eventTaskBatches = results.filter(row => row.provenance === 'product-events' && row.metric === 'task-success-rate').slice(0, 10).reverse()
  const save = async () => {
    if (!missionId) return
    setBusy(true); setError(''); setMessage('')
    try {
      const id = await record({ missionId, metric, observed: Number(observed), target: Number(target), sampleSize: Number(sampleSize), periodStart: new Date(periodStart).getTime(), periodEnd: new Date(periodEnd).getTime(), method: method.trim(), evidence: evidence.split(/\r?\n/).map(item => item.trim()).filter(Boolean), notes: notes.trim() })
      setMessage('Saved operator-recorded product outcome · ' + id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save outcome. Review the observation period, sample and evidence, then retry.') }
    finally { setBusy(false) }
  }
  return <div className="glass-card research-card" id="product-outcomes">
    <div className="panel-title"><span>PRODUCT &amp; BUSINESS OUTCOMES</span><span className="live-pill">OBSERVED EVIDENCE</span></div>
    <p>Record what happened after a product or business experiment: adoption, customers, revenue or task performance. Include the completed observation period, measured population, method and evidence. These records stay separate from delivery readiness and mission completion.</p>
    {eventTaskBatches.length > 0 && <div className="evidence-item"><h3>Authenticated task-success trend</h3><p>Up to 10 most recent event-backed task batches, ordered oldest to newest. Each bar is a separately retained measurement; this is task execution, not revenue conversion, and overlapping periods are not merged.</p><div className="provider-list">{eventTaskBatches.map(row => <div className="portfolio-row" key={row._id}><div className="portfolio-main"><strong>{new Date(row.periodEnd).toLocaleDateString()}</strong><p>{row.sampleSize} task attempts · {row.observed} successful</p><progress max={100} value={Math.max(0,Math.min(100,row.actual))} aria-label={'Task success rate '+row.actual+'% on '+new Date(row.periodEnd).toLocaleDateString()} style={{width:'100%'}} /></div><div className="portfolio-cell"><small>SUCCESS RATE</small><b>{row.actual.toFixed(1)}%</b></div></div>)}</div></div>}
    <div className="glass-card research-card" id="outcome-binding-dashboard"><div className="panel-title"><span>POST-EXECUTION OUTCOME BINDING</span><span className="live-pill">{missionId ? 'MISSION LINKED' : 'NO MISSION SELECTED'}</span></div><p>{missionId ? `New observations are bound to ${missionTitle ?? 'the selected mission'} (${missionId}).` : 'Select the mission whose real-world result you are measuring. Observations cannot be recorded without a mission binding.'} Delivery readiness is not a substitute for business outcomes.</p><div className="field-grid"><div className="decision-line"><span>LOADED OBSERVATIONS</span><strong>{results.length}</strong></div><div className="decision-line"><span>TARGET MET</span><strong>{results.filter(row => row.targetMet).length}</strong></div><div className="decision-line"><span>METRICS COVERED</span><strong>{new Set(results.map(row => row.metric)).size}</strong></div><div className="decision-line"><span>LOADED SCOPE</span><strong>{selectedMission ? 'SELECTED MISSION' : 'ALL MISSIONS'}</strong></div></div><p className="muted-copy">Summary reflects the currently loaded page only. Load more to inspect additional retained observations; figures remain operator- or repository-supplied until independently verified.</p></div>
    {!missionId ? <Link className="secondary-button" to="/mission">Select a mission to record its product results →</Link> : <details><summary>Record an observation for {missionTitle ?? 'the selected mission'}</summary><form onSubmit={event => { event.preventDefault(); void save() }}>
      <label htmlFor="product-metric">OUTCOME METRIC</label><select id="product-metric" value={metric} onChange={event => { setMetric(event.target.value as typeof metric); setObserved(''); setTarget('') }}>{metrics.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      <div className="field-grid">
        <div><label htmlFor="product-observed">{metric === 'task-success-rate' ? 'SUCCESSFUL TASKS · COUNT' : 'OBSERVED VALUE · ' + definition.unit}</label><input id="product-observed" required type="number" min={0} max={1e12} step={metric === 'active-users' || metric === 'paid-customers' || metric === 'task-success-rate' ? 1 : 'any'} value={observed} onChange={event => setObserved(event.target.value)} /></div>
        <div><label htmlFor="product-target">TARGET · {definition.unit}</label><input id="product-target" required type="number" min={0} max={metric === 'task-success-rate' ? 100 : 1e12} step={metric === 'active-users' || metric === 'paid-customers' ? 1 : 'any'} value={target} onChange={event => setTarget(event.target.value)} /></div>
      </div>
      <label htmlFor="product-sample">SAMPLE SIZE · PEOPLE OR EVENTS OBSERVED</label><input id="product-sample" required type="number" min={1} max={1e9} step={1} value={sampleSize} onChange={event => setSampleSize(event.target.value)} />
      <p className="muted-copy">{metric === 'task-success-rate' ? 'The server computes the percentage from successful tasks divided by total attempts. Sample size is total attempts.' : metric === 'revenue-usd' ? 'Sample size is the number of transactions/events included. Explain gross/net revenue, refunds and accounting method below.' : metric === 'task-time-seconds' ? 'Enter your measured summary (for example, mean task time), and specify the aggregation method below. Lower is better.' : 'Sample size is the evaluated population. Observed active users or paying customers cannot exceed it; define active/paid consistently in your method.'}</p>
      <div className="field-grid"><div><label htmlFor="product-start">OBSERVATION START · LOCAL TIME</label><input id="product-start" required type="datetime-local" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></div><div><label htmlFor="product-end">OBSERVATION END · LOCAL TIME</label><input id="product-end" required type="datetime-local" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></div></div>
      <label htmlFor="product-method">MEASUREMENT METHOD &amp; METRIC DEFINITION</label><textarea id="product-method" required minLength={12} maxLength={1600} rows={3} value={method} onChange={event => setMethod(event.target.value)} />
      <label htmlFor="product-evidence">EVIDENCE REFERENCES · ONE PER LINE · 1–8</label><textarea id="product-evidence" required rows={3} maxLength={8008} value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Analytics report, experiment ledger, survey results or source receipt" />
      <label htmlFor="product-notes">LIMITATIONS &amp; CONDITIONS</label><textarea id="product-notes" rows={2} maxLength={1600} value={notes} onChange={event => setNotes(event.target.value)} />
      <button className="secondary-button" disabled={busy || !observed || !target || !sampleSize || !periodStart || !periodEnd || method.trim().length < 12 || !evidence.trim()}>{busy ? 'Saving observation…' : 'Save product outcome observation'}</button>
    </form></details>}
    {missionId && <GitHubProductImport missionId={missionId} />}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <label htmlFor="product-history-scope">OUTCOME HISTORY SCOPE</label><select id="product-history-scope" value={selectedMission ? 'mission' : 'all'} onChange={event => setScope(event.target.value)}><option value="mission" disabled={!missionId}>Selected mission</option><option value="all">All my missions</option></select>
    <div aria-live="polite" aria-busy={status === 'LoadingFirstPage' || status === 'LoadingMore'}>
      {status === 'LoadingFirstPage' ? <p>Loading product observations…</p> : results.length === 0 ? <p>No product outcome observations in this scope. A deployed product alone is not evidence of adoption or business success.</p> : results.map(row => <article className="evidence-item" key={row._id}><div>
        <b>{metrics.find(item => item.key === row.metric)?.label ?? row.metric} · {row.actual.toLocaleString(undefined, { maximumFractionDigits: 4 })} {row.unit}</b><p>Target: {row.target} {row.unit} · {row.direction} is better · {row.targetMet ? 'Reported target met' : 'Reported target not met'} · Sample: {row.sampleSize}</p>
        <p>{new Date(row.periodStart).toLocaleString()} → {new Date(row.periodEnd).toLocaleString()}</p><p>{row.method}</p>{row.notes && <p>Limitations: {row.notes}</p>}
        <details><summary>Inspect evidence and provenance</summary><p>Mission: {row.missionId} · Receipt: {row._id} · Recorded: {new Date(row.recordedAt).toLocaleString()}</p><p>Provenance: {row.provenance}; underlying measurement references are not independently verified.{row.metric === 'task-success-rate' ? ' Successful tasks: ' + row.observed + ' / ' + row.sampleSize : ''}</p>{row.importReceipt && <><p>Imported repository: {row.importReceipt.repository} · Commit: {row.importReceipt.commitSha}</p><p>Path: {row.importReceipt.path}</p><p>Blob: {row.importReceipt.blobSha} · Report SHA-256: {row.importReceipt.reportSha256}</p><a href={'https://github.com/' + row.importReceipt.repository + '/blob/' + row.importReceipt.commitSha + '/' + row.importReceipt.path} target="_blank" rel="noreferrer">Inspect pinned source report ↗</a></>}{row.evidence.map((item, index) => <p key={index}>{item}</p>)}</details>
      </div></article>)}
      {status === 'CanLoadMore' && <button className="secondary-button" onClick={() => loadMore(10)}>Load more product outcomes</button>}{status === 'LoadingMore' && <p>Loading more product outcomes…</p>}
    </div>
    <p className="muted-copy">Target comparisons use operator-entered or repository-authored observations. GitHub imports retain commit-bound source receipts; direct analytics ingestion and independent figure verification remain open. Manual resubmissions create additional observations; identical GitHub imports reuse their receipt.</p>
    <Link className="secondary-button" to="/learning">Continue to learning &amp; comparison review →</Link>
  </div>
}
