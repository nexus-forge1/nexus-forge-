import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { operatorError } from '../lib/operator-error'
import { downloadJson } from './studio-shared'

export function PlatformUsageEvidence() {
  const rows = useQuery(api.platformUsage.history, {})
  const save = useMutation(api.platformUsage.recordSnapshot)
  const [rawSnapshot, setRawSnapshot] = useState('')
  const [functionTarget, setFunctionTarget] = useState<'live' | 'testing'>('live')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const id = await save({ rawSnapshot, functionTarget })
      setMessage('Sanitized usage snapshot retained · ' + id)
      setRawSnapshot('')
    } catch (cause) {
      setError(operatorError(cause, 'Usage snapshot was not saved. Keep the source report and check its format.'))
    } finally { setBusy(false) }
  }
  return <div className="glass-card research-card" id="platform-usage-evidence">
    <div className="panel-title"><span>PLATFORM USAGE EVIDENCE</span><span className="live-pill">MANAGED CONVEX</span></div>
    <p>Import the JSON result from the managed Convex usage report. NEXUS FORGE validates and stores only the seven-day daily counters and recent function metrics; workspace overage/billing details and unrelated fields are discarded. This connector snapshot is manually imported—not a live in-app API connection.</p>
    <form onSubmit={event => void submit(event)}>
      <label htmlFor="usage-target">RECENT FUNCTION SNAPSHOT TARGET</label>
      <select id="usage-target" value={functionTarget} onChange={event => setFunctionTarget(event.target.value as 'live' | 'testing')} disabled={busy}>
        <option value="live">Live</option><option value="testing">Testing</option>
      </select>
      <label htmlFor="usage-json">MANAGED USAGE REPORT JSON · MAX 50 KB</label>
      <textarea id="usage-json" required maxLength={50000} rows={8} value={rawSnapshot} onChange={event => setRawSnapshot(event.target.value)} placeholder='Paste the complete JSON object containing "history" and "functions".' disabled={busy} style={{width:'100%',maxWidth:'100%'}} />
      <p className="muted-copy">The history section must explicitly identify combined Live + Testing coverage. The function section is labeled with the target selected above and preserves its own capture time and 15/60-minute window.</p>
      <button className="secondary-button" disabled={busy || !rawSnapshot.trim()}>{busy ? 'Validating and saving…' : 'Validate & save usage snapshot'}</button>
    </form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <h3>Retained usage snapshots</h3>
    {rows === undefined ? <p role="status">Loading private usage receipts…</p> : rows.length === 0 ? <p>No managed usage snapshot saved yet. Missing usage data is not a zero or a pass.</p> : rows.map((row, index) => { const previous = rows.slice(index + 1).find(candidate => candidate.historyStart === row.historyStart && candidate.historyEnd === row.historyEnd && candidate.functionTarget === row.functionTarget && candidate.functionWindowSeconds === row.functionWindowSeconds && candidate.functionSnapshotStatus !== 'unavailable' && row.functionSnapshotStatus !== 'unavailable'); const delta = (key: keyof typeof row.historyTotals) => previous ? row.historyTotals[key] - previous.historyTotals[key] : null; const deltaText = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toLocaleString()}`; return <article className="evidence-item" key={row._id}>
      <b>Captured {new Date(row.capturedAt).toLocaleString()} · {row.functionTarget.toUpperCase()} function window</b>
      <p>History: {new Date(row.historyStart).toLocaleDateString()} → {new Date(row.historyEnd).toLocaleDateString()} · {row.historyDays.length} reported daily buckets · scope: Live + Testing combined</p>
      <div className="stats-strip compact">
        <div><strong>{row.historyTotals.functionCalls.toLocaleString()}</strong><span>Function calls reported</span></div>
        <div><strong>{row.historyTotals.databaseReadDocuments.toLocaleString()}</strong><span>Documents read</span></div>
        <div><strong>{(row.historyTotals.databaseReadBytes / 1048576).toFixed(2)} MiB</strong><span>Database bytes read</span></div>
        <div><strong>{(row.historyTotals.ioBytes / 1048576).toFixed(2)} MiB</strong><span>Reported I/O bytes</span></div>
      </div>
      <p>Reported egress: {(row.historyTotals.egressBytes / 1048576).toFixed(2)} MiB · Storage requests: {row.historyTotals.storageRequests.toLocaleString()} · Function hours reported: {row.historyTotals.functionHoursReported} · Storage hours reported: {row.historyTotals.storageHoursReported}</p>
      {previous ? <details><summary>Compare with previous compatible snapshot · {new Date(previous.recordedAt).toLocaleString()}</summary><p>Signed change from the older report with the same history dates, Live/Testing function target and function-window length. These are differences between imported snapshots, not a normalized rate or a bill.</p><div className="stats-strip compact"><div><strong>{deltaText(delta('functionCalls'))}</strong><span>Function calls</span></div><div><strong>{deltaText(delta('databaseReadDocuments'))}</strong><span>Documents read</span></div><div><strong>{deltaText(delta('databaseReadBytes') === null ? null : Math.round(delta('databaseReadBytes')! / 1048576 * 100) / 100)}</strong><span>Database read MiB</span></div><div><strong>{deltaText(delta('egressBytes') === null ? null : Math.round(delta('egressBytes')! / 1048576 * 100) / 100)}</strong><span>Egress MiB</span></div></div><div className="provider-list">{row.functions.map(fn => { const old = previous.functions.find(candidate => candidate.udfPath === fn.udfPath && candidate.udfType === fn.udfType); return <div className="portfolio-row" key={fn.udfPath}><div className="portfolio-main"><strong>{fn.udfPath}</strong><p>Matched by function path and type</p></div><div className="portfolio-cell"><small>CALL DELTA</small><b>{old && fn.available && old.available ? deltaText(fn.invocations - old.invocations) : '—'}</b></div><div className="portfolio-cell"><small>ERROR DELTA</small><b>{old && fn.available && old.available ? deltaText(fn.errors - old.errors) : '—'}</b></div><div className="portfolio-cell"><small>P99</small><b>{fn.p99Ms === null ? '—' : fn.p99Ms + ' ms'}{old && fn.available && old.available && fn.p99Ms !== null && old.p99Ms !== null ? ' (' + deltaText(fn.p99Ms - old.p99Ms) + ' ms)' : ''}</b></div></div>})}</div><button className="secondary-button" onClick={() => downloadJson('platform-usage-comparison.json', { scope: 'Manually imported usage snapshots; comparison only when dates, function target and window length match; not a bill', current: row, previous, deltas: { functionCalls: delta('functionCalls'), databaseReadDocuments: delta('databaseReadDocuments'), databaseReadBytes: delta('databaseReadBytes'), egressBytes: delta('egressBytes'), ioBytes: delta('ioBytes'), storageRequests: delta('storageRequests') } })}>Export matched comparison JSON</button></details> : <p className="muted-copy">No prior snapshot with identical coverage and function-window scope is available for a fair comparison.</p>}
      <p className="muted-copy">{row.historyCoverage} Daily values sum only the reported buckets. Missing hours are not inferred as zero.</p>
      <p>Recent function snapshot: {row.functionSnapshotStatus.toUpperCase()}{row.functionWindowSeconds ? ' · ' + Math.round(row.functionWindowSeconds / 60) + '-minute window' : ''}{row.functionSnapshotCapturedAt ? ' · captured ' + new Date(row.functionSnapshotCapturedAt).toLocaleString() : ''} · {row.failedFunctionCount} failed functions · {row.skippedFunctionCount} skipped functions{row.truncated ? ' · truncated' : ''}</p>
      {row.functions.length === 0 ? <p>No function-level rows were available in this snapshot.</p> : <div className="provider-list">{row.functions.map(fn => <div className="portfolio-row" key={fn.udfPath}>
        <div className="portfolio-main"><strong>{fn.udfPath}</strong><p>{fn.udfType} · {fn.isPublic ? 'public function' : 'internal function'} · {fn.available ? 'metrics available' : 'metrics incomplete'}</p></div>
        <div className="portfolio-cell"><small>CALLS / ERRORS</small><b>{fn.invocations} / {fn.errors}</b></div>
        <div className="portfolio-cell"><small>P50 / P99</small><b>{fn.p50Ms === null ? '—' : fn.p50Ms + ' ms'} / {fn.p99Ms === null ? '—' : fn.p99Ms + ' ms'}</b></div>
        <div className="portfolio-cell"><small>CACHE HITS</small><b>{fn.cacheHitPercentage === null ? '—' : fn.cacheHitPercentage.toFixed(1) + '%'}</b></div>
      </div>)}</div>}
      <details><summary>Inspect receipt provenance</summary><p>Receipt {row._id} · source {row.source} · digest {row.digest}</p><p>This is a captured provider report, not a bill, complete usage ledger, or proof that all hours were reported. Live and Testing history are combined; only the recent function snapshot is target-specific.</p><div className="provider-list">{row.historyDays.map(day => <div className="portfolio-row" key={day.date}><div className="portfolio-main"><strong>{day.date}</strong></div><div className="portfolio-cell"><small>CALLS</small><b>{day.functionCalls.toLocaleString()}</b></div><div className="portfolio-cell"><small>DB READ</small><b>{(day.databaseReadBytes / 1048576).toFixed(2)} MiB</b></div><div className="portfolio-cell"><small>EGRESS</small><b>{(day.egressBytes / 1048576).toFixed(2)} MiB</b></div></div>)}</div></details>
    </article> })}
  </div>
}
