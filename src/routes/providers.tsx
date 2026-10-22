import { routeHead } from '../lib/route-metadata'
import { ProviderReconciliation } from '../components/provider-reconciliation'
import { ProviderUsageLedger } from '../components/provider-usage-ledger'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLayout } from '../components/workspace-layout'

export const Route = createFileRoute('/providers')({ head: () => routeHead("/providers"), component: ProvidersPage })

function ProvidersPage() {
  const check = useAction(api.providerHealth.check)
  const history = useQuery(api.providerHealth.history, {})
  const [results, setResults] = useState<Awaited<ReturnType<typeof check>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => {
    setBusy(true); setError('')
    try { setResults(await check({})) }
    catch (e) { setError(e instanceof Error ? e.message : 'Provider health check failed.') } finally { setBusy(false) }
  }
  return <WorkspaceLayout title="AI Provider Health" eyebrow="OPERATIONS / MODEL ROUTING & DIAGNOSTICS">
    <section className="workspace"><div className="glass-card research-card"><div className="panel-title"><span>MANAGED PROVIDER CONNECTIONS</span><span className="live-pill">SERVER-SIDE ONLY</span></div><p>Automatic routing uses role-selected Groq or Cerebras, with Cloudflare Workers AI and the other primary provider as fallbacks. OpenRouter is manual-only; Mistral and Hugging Face are deferred from automatic routing and do not block other work. Use diagnostics here when you are ready to revisit them. This page never displays API keys; credentials remain in server-side environment variables.</p><button className="primary-button" onClick={() => void refresh()} disabled={busy}>{busy ? 'Testing providers…' : 'Run provider health checks ↗'}</button></div>
    <ProviderUsageLedger />
    <ProviderReconciliation />
    {error && <p className="warning" role="alert">{error}</p>}
    {results && <div className="glass-card research-card"><div className="panel-title"><span>LIVE HEALTH RESULTS</span><span className="live-pill">{results.filter(p => p.status === 'healthy').length}/{results.length} HEALTHY</span></div>{results.map(provider => <div className="guard-item" key={provider.name}><span>{provider.status === 'healthy' ? '✓' : provider.status === 'degraded' ? '!' : '×'}</span><div><strong>{provider.label}</strong><small>{provider.detail}</small>{provider.name === 'openrouter' && provider.status === 'offline' && <small>Next step: replace OPENROUTER_API_KEY with a valid OpenRouter API key in the Convex production environment, then rerun this check. A variable name alone does not prove the stored credential is valid.</small>}{provider.name === 'mistral' && provider.status === 'degraded' && <small>Next step: wait for the provider quota window to reset or check the Mistral account's rate-limit/credit status. Keep Mistral out of automatic failover until inference succeeds.</small>}{provider.name === 'huggingface' && provider.status === 'offline' && <small>Next step: set HUGGINGFACE_API_KEY in the Macaly project environment, confirm it is synchronized to the attached Convex production deployment, then rerun this check. Free inference has limited quota and is not guaranteed unlimited.</small>}<small>{provider.configured ? `Latency: ${provider.latencyMs} ms` : 'API key not configured'}</small></div><span className="status-chip">{provider.status.toUpperCase()}</span></div>)}</div>}
    <div className="glass-card research-card"><div className="panel-title"><span>RECENT DIAGNOSTIC HISTORY</span><span className="live-pill">{history === undefined ? "LOADING" : `${history.length} RECORDS`}</span></div><p>Authenticated inference checks are saved to this workspace’s database. History survives refresh and records status, latency, and bounded provider error details; it never stores API keys.</p>{history === undefined ? <p>Loading provider history…</p> : history.length === 0 ? <p>No provider checks have been recorded yet. Run a health check above to create the first snapshot.</p> : history.slice(0, 12).map(item => <div className="guard-item" key={item._id}><span>{item.status === "healthy" ? "✓" : item.status === "degraded" ? "!" : "×"}</span><div><strong>{item.label}</strong><small>{new Date(item.checkedAt).toLocaleString()} · {item.configured ? `${item.latencyMs} ms` : "not configured"}</small><small>{item.detail}</small></div><span className="status-chip">{item.status.toUpperCase()}</span></div>)}</div>
    <div className="glass-card research-card"><div className="panel-title"><span>ACTIVE ROUTING POLICY</span><span className="live-pill">NON-BLOCKING</span></div><p>Healthy configured providers remain available while deferred providers are sidelined. A healthy diagnostic result does not change routing policy automatically. Reintroduction requires an explicit routing configuration change and successful inference verification. Provider diagnostics are informational and do not block unrelated product development or mission work.</p><p>Recorded usage reflects provider-supplied metadata, not a complete billing ledger. Missing token counts or charges remain unknown. A usage-save failure does not repeat a successful AI request against another provider; accounting may be incomplete when saving fails.</p><Link className="secondary-button" to="/workflow">Back to workflow control →</Link></div></section>
  </WorkspaceLayout>
}
