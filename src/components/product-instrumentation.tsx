import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { productEventsEndpoint } from '../lib/product-events-endpoint'
import { downloadJson } from './studio-shared'

export function ProductInstrumentation({ missionId = null, missionTitle }: { missionId?: Id<'missions'> | null; missionTitle?: string }) {
  const sources = useQuery(api.productTelemetry.list, {})
  const transport = useQuery(api.productTelemetry.transportSummary, {})
  const transportFailures = useQuery(api.productTelemetry.transportFailureSummary, {})
  const create = useAction(api.productTelemetry.create)
  const rotate = useAction(api.productTelemetry.rotate)
  const enable = useMutation(api.productTelemetry.setEnabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState<{ sourceId: string; token: string } | null>(null)
  const endpoint = productEventsEndpoint(import.meta.env.VITE_CONVEX_URL ?? '')
  async function work(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Instrumentation failed') }
    finally { setBusy(false) }
  }
  return <div className="glass-card research-card">
    <h2>Instrument actual product tasks</h2>
    <p>Your product server reports each completed task with a stable event key and success boolean. Every ten unique events creates a measured success-rate outcome with an 80% target. Authenticated source data is not independent verification. Keep source tokens on your product server.</p>
    {!endpoint && <p role="alert">The task ingestion endpoint is unavailable. Check this workspace's backend configuration before creating a source.</p>}
    {missionId ? <form onSubmit={e => {
      e.preventDefault()
      if (busy || !endpoint) return
      const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
      if (!name) return
      void work(async () => { setSecret(null); setSecret(await create({ missionId, name })) })
    }}>
      <p>Selected mission: <strong>{missionTitle ?? 'Current mission'}</strong></p>
      <label>Product source name<input name="name" required maxLength={120} disabled={busy}/></label>
      <button className="secondary-button" disabled={busy || !endpoint}>Create task measurement source</button>
    </form> : <p><Link className="secondary-button" to="/mission">Select a mission to connect product tasks →</Link></p>}
    {secret && <div>
      <h3>One-time server configuration</h3>
      <p>Source: <code>{secret.sourceId}</code><br/>Endpoint: <code>{endpoint ?? 'Unavailable'}</code></p>
      <label>Source token shown once<input readOnly type="password" value={secret.token}/></label>
      <button className="secondary-button" onClick={async () => {
        try { await navigator.clipboard.writeText(secret.token); setError('') }
        catch { setError('Could not copy the token. Copy it from the token field or rotate it when ready.') }
      }}>Copy source token</button>
      <button className="ghost-button" onClick={() => setSecret(null)}>Hide token</button>
      <p>Use scripts/product-event-client.mjs from your product server. Set NEXUS_PRODUCT_EVENTS_ENDPOINT to the endpoint above, NEXUS_PRODUCT_SOURCE_ID to this source, and NEXUS_PRODUCT_SOURCE_TOKEN to the token. Report actual completed tasks; do not send sample events to claim customer outcomes.</p>
      <p>Saved lists never return token hashes or values. Rotate the token if it is lost.</p>
    </div>}
    <h3>Measured product-event transport</h3>
    <p>Actual UTF-8 request and response body bytes for successful authenticated calls to this task-event endpoint, plus elapsed time through event ingestion before the transport receipt is written. This is not whole-site traffic, browser asset transfer, hosting compute or a provider bill.</p>
    {transport === undefined ? <p role="status">Loading transport receipts…</p> : <><div className="evidence-item"><b>{transport.requests} retained request receipts{transport.complete ? '' : ' · bounded window reached'}</b><p>Ingress {transport.requestBytes.toLocaleString()} bytes · Egress {transport.responseBytes.toLocaleString()} bytes</p><p>Ingest elapsed mean {transport.meanIngestElapsedMs === null ? '—' : transport.meanIngestElapsedMs.toFixed(1) + ' ms'} · p50 {transport.p50IngestElapsedMs === null ? '—' : transport.p50IngestElapsedMs + ' ms'} · p95 {transport.p95IngestElapsedMs === null ? '—' : transport.p95IngestElapsedMs + ' ms'}</p><p className="muted-copy">{transport.scope} Only successfully recorded receipts appear here; absent receipts are not interpreted as zero traffic.</p></div><button className="secondary-button" onClick={() => downloadJson('product-transport-evidence.json', { exportedAt: new Date().toISOString(), scope: transport.scope, complete: transport.complete, aggregate: { requests: transport.requests, requestBytes: transport.requestBytes, responseBytes: transport.responseBytes, meanIngestElapsedMs: transport.meanIngestElapsedMs, p50IngestElapsedMs: transport.p50IngestElapsedMs, p95IngestElapsedMs: transport.p95IngestElapsedMs }, bySource: transport.bySource.map(item => ({ ...item, sourceName: sources?.find(s => s._id === item.sourceId)?.name ?? null })) })}>Export transport evidence JSON</button></>}{transportFailures === undefined ? <p role="status">Loading rejected-request receipts…</p> : <div className="evidence-item"><b>{transportFailures.requests} retained authenticated rejections{transportFailures.complete ? '' : ' · bounded window reached'}</b><p>Malformed authenticated requests: {transportFailures.invalidRequests} · rejected event submissions: {transportFailures.rejectedEvents}</p><p>Rejected ingress {transportFailures.requestBytes.toLocaleString()} bytes · response {transportFailures.responseBytes.toLocaleString()} bytes</p><p className="muted-copy">{transportFailures.scope}</p><button className="secondary-button" onClick={() => downloadJson('product-transport-rejections.json', { exportedAt: new Date().toISOString(), ...transportFailures, bySource: transportFailures.bySource.map(item => ({ ...item, sourceName: sources?.find(s => s._id === item.sourceId)?.name ?? null })) })}>Export rejection evidence JSON</button></div>}{transportFailures !== undefined && transportFailures.bySource.length > 0 && <div className="provider-list"><h4>Rejected requests by product source</h4>{transportFailures.bySource.map(item => <div className="portfolio-row" key={item.sourceId}><div className="portfolio-main"><strong>{sources?.find(s => s._id === item.sourceId)?.name ?? String(item.sourceId).slice(-8)}</strong><p>{item.requests} rejected requests</p></div><div className="portfolio-cell"><small>INGRESS</small><b>{item.requestBytes.toLocaleString()} B</b></div><div className="portfolio-cell"><small>RESPONSE</small><b>{item.responseBytes.toLocaleString()} B</b></div></div>)}</div>}{transport !== undefined && transport.bySource.length > 0 && <div className="provider-list"><h4>Transport by product source</h4>{transport.bySource.map(item => { const source = sources?.find(s => s._id === item.sourceId); return <div className="portfolio-row" key={item.sourceId}><div className="portfolio-main"><strong>{source?.name ?? 'Source ' + String(item.sourceId).slice(-8)}</strong><p>{item.requests} retained request receipts</p></div><div className="portfolio-cell"><small>INGRESS</small><b>{item.requestBytes.toLocaleString()} B</b></div><div className="portfolio-cell"><small>EGRESS</small><b>{item.responseBytes.toLocaleString()} B</b></div><div className="portfolio-cell"><small>MEAN INGEST</small><b>{item.meanIngestElapsedMs === null ? '—' : item.meanIngestElapsedMs.toFixed(1) + ' ms'}</b><small>p95 {item.p95IngestElapsedMs === null ? '—' : item.p95IngestElapsedMs + ' ms'}</small></div></div>})}</div>}
    <h3>Saved sources · all owned missions</h3>
    {sources === undefined ? <p role="status">Loading task measurement sources…</p> : sources.length === 0 ? <p>No task sources connected yet. Create one for the selected mission, then connect its product server.</p> : sources.map(s => <div key={s._id}>
      <h3>{s.name} · {s.enabled ? 'Enabled' : 'Disabled'}</h3>
      <p>{s.received}/1000 accepted unique events · {s.batch} measured batches · {s.pendingCount}/10 pending events</p>{typeof s.successEvents === 'number' && typeof s.failureEvents === 'number' && s.successEvents + s.failureEvents > 0 ? <p>Task outcomes since counter initialization: {s.successEvents} successful · {s.failureEvents} unsuccessful · {(s.successEvents / (s.successEvents + s.failureEvents) * 100).toFixed(1)}% reported success</p> : <p className="muted-copy">Per-source success history is unavailable for this source until new task events are recorded; older events are not backfilled.</p>}
      <p>Mission <code>{s.missionId}</code> · Source <code>{s._id}</code></p>
      <button className="secondary-button" disabled={busy} onClick={() => void work(async () => { setSecret(null); const r = await rotate({ sourceId: s._id }); setSecret({ sourceId: s._id, token: r.token }) })}>Rotate source token</button>
      <button className="ghost-button" disabled={busy} onClick={() => void work(async () => { await enable({ sourceId: s._id, enabled: !s.enabled }) })}>{s.enabled ? 'Disable ingestion' : 'Enable ingestion'}</button>
    </div>)}
    {error && <p role="alert">{error}</p>}
  </div>
}
