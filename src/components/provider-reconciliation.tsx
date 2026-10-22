import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
type Provider = 'groq' | 'cerebras' | 'cloudflare' | 'openrouter' | 'mistral' | 'huggingface'
const labels = { incomplete: 'Incomplete ledger', 'scope-mismatch': 'Scope not confirmed', variance: 'Variance needs review', 'matched-declared': 'Matches declared amount' }
export function ProviderReconciliation() {
  const record = useMutation(api.providerReconciliation.record)
  const { results, status, loadMore } = usePaginatedQuery(api.providerReconciliation.history, {}, { initialNumItems: 10 })
  const [provider, setProvider] = useState<Provider>('groq')
  const [start, setStart] = useState(''), [end, setEnd] = useState('')
  const [invoice, setInvoice] = useState(''), [amount, setAmount] = useState(''), [evidence, setEvidence] = useState('')
  const [scopeConfirmed, setScopeConfirmed] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const pending = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (!amount.trim()) throw new Error('Enter the invoiced USD amount, including an explicit zero when applicable.')
      await record({ provider, periodStart: Date.parse(start + 'Z'), periodEnd: Date.parse(end + 'Z'),
        invoiceReference: invoice, invoiceUsd: Number(amount), evidenceReference: evidence, scopeConfirmed })
      setNotice('Immutable comparison saved. Invoice authenticity and broader production accounting remain separate checks.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Comparison could not be saved. Your inputs are preserved.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <section className="glass-card research-card" data-testid="provider-reconciliation" data-state={status === 'LoadingFirstPage' ? 'loading' : 'ready'}>
    <h2>Provider invoice reconciliation</h2>
    <p>Compare a private invoice or billing export with your saved provider reports. Amounts and references are operator-declared; this panel does not retrieve or authenticate an invoice and does not adjust customer balances.</p>
    <form onSubmit={event => void submit(event)}>
      <fieldset disabled={busy} className="research-card">
        <legend>Accounting period and evidence</legend>
        <label htmlFor="reconcile-provider">Provider</label><select id="reconcile-provider" value={provider} onChange={e => setProvider(e.target.value as Provider)}>{(['groq','cerebras','cloudflare','openrouter','mistral','huggingface'] as const).map(p => <option key={p} value={p}>{p}</option>)}</select>
        <label htmlFor="reconcile-start">Period start (UTC, inclusive)</label><input id="reconcile-start" type="datetime-local" required value={start} onChange={e => setStart(e.target.value)}/>
        <label htmlFor="reconcile-end">Period end (UTC, exclusive)</label><input id="reconcile-end" type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)}/>
        <label htmlFor="reconcile-invoice">Invoice or export reference</label><input id="reconcile-invoice" required maxLength={160} value={invoice} onChange={e => setInvoice(e.target.value)}/>
        <label htmlFor="reconcile-amount">Invoiced usage amount (USD)</label><input id="reconcile-amount" type="number" min="0" max="1000000" step="0.000001" required value={amount} onChange={e => setAmount(e.target.value)}/>
        <label htmlFor="reconcile-evidence">Private evidence reference</label><input id="reconcile-evidence" required maxLength={300} placeholder="Private file name or internal receipt ID" value={evidence} onChange={e => setEvidence(e.target.value)}/>
        <label><input type="checkbox" checked={scopeConfirmed} onChange={e => setScopeConfirmed(e.target.checked)}/>The declared amount covers only this operator's usage, this provider and this exact UTC period, excluding tax, subscriptions and unrelated account usage.</label>
        <p>Periods use invocation start time. Pending work, missing reports, unknown charges and calls crossing the end boundary keep the comparison incomplete. Use at most 93 completed days and 200 invocations. A provider-wide bill requires an export filtered to this operator's usage. Matching within half a cent is an arithmetic comparison, not invoice certification.</p>
        <button type="submit" className="primary-button">{busy ? 'Saving comparison…' : 'Save invoice comparison'}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <h3>Private immutable comparisons</h3>
    {status === 'LoadingFirstPage' ? <p role="status">Loading reconciliation history…</p> : results.length === 0 ? <p>No invoice comparisons saved yet.</p> : results.map(row => <article className="evidence-item" key={row._id}>
      <div><strong>{row.provider} · {labels[row.status]}</strong><p>{row.invoiceReference} · {new Date(row.periodStart).toISOString()} to {new Date(row.periodEnd).toISOString()} (exclusive)</p>
      <p>Declared USD {row.invoiceUsd.toFixed(6)} · Known ledger USD {row.ledgerUsd.toFixed(6)} · Difference USD {row.varianceUsd.toFixed(6)}</p>
      <p>{row.invocationCount} invocations · {row.matchedReports} provider reports · {row.missingCharges} unknown charges · {row.unresolvedInvocations} unresolved invocations</p>
      <p>Private evidence: {row.evidenceReference}. Saved {new Date(row.createdAt).toLocaleString()}. This snapshot does not change when late reports arrive; save a new comparison after review.</p>
      <details><summary>Captured ledger provenance</summary><p>{row.invocationIds.join(', ') || 'No invocations in this period.'}</p>{row.reports.map(report => <p key={report.invocationId + ':' + report.ordinal}>{report.invocationId} / report {report.ordinal} · {report.model} · {report.reportedCostUsd === undefined ? 'Unknown charge' : 'USD ' + report.reportedCostUsd.toFixed(6)}</p>)}</details></div>
    </article>)}
    <button type="button" className="secondary-button" disabled={status !== 'CanLoadMore'} onClick={() => loadMore(10)}>{status === 'LoadingMore' ? 'Loading…' : 'Load more comparisons'}</button>
    <p>History is private, paginated and capped at 100 immutable snapshots per operator. No inference, delivery, provider reactivation or release approval is triggered.</p>
  </section>
}
