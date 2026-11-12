import { routeHead } from '../lib/route-metadata'
import { ProviderReconciliation } from '../components/provider-reconciliation'
import { ProviderUsageLedger } from '../components/provider-usage-ledger'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLayout } from '../components/workspace-layout'
import { OLLAMA_MODELS } from '../../convex/ollamaModels'

export const Route = createFileRoute('/providers')({ head: () => routeHead("/providers"), component: ProvidersPage })
function ProvidersPage() {
 const check = useAction(api.providerHealth.check)
 const history = useQuery(api.providerHealth.history, {})
 const routingPlan = useQuery(api.providerHealth.routingPlan, {})
 const connection = useQuery(api.providerHealth.connection, {})
 const [results,setResults] = useState<Awaited<ReturnType<typeof check>>|null>(null)
 const [busy,setBusy] = useState(false), [error,setError] = useState('')
 return <WorkspaceLayout title="Ollama Cloud Models" eyebrow="OPERATIONS / AI CONNECTION">
  <section className="workspace">
   <div className="glass-card research-card">
    <div className="panel-title"><span>OLLAMA CLOUD</span><span className="live-pill">{connection===undefined?'LOADING':connection.configured?'KEY CONFIGURED':'KEY REQUIRED'}</span></div>
    <p>Your six selected models run through Ollama Cloud using a private backend API key. Ollama charges and account limits apply.</p>
    <p role="status">{connection===undefined?'Loading connection settings…':connection.allowanceEnforced?'Internal AI allowance is enabled.':'Internal AI allowance is paused. No app usage credits or $1-per-step wallet reservation are required for new AI requests.'}</p>
    {!connection?.configured&&<p>Save OLLAMA_API_KEY in the project’s server environment, then run connection checks. Create a key at <a href="https://ollama.com/settings/keys" target="_blank" rel="noreferrer">Ollama API keys</a>.</p>}
    <p>A configured key has not been verified until authenticated inference succeeds. Connection checks can make up to six paid requests.</p>
    <button className="primary-button" disabled={busy||!connection?.configured} onClick={async()=>{setBusy(true);setError('');try{setResults(await check({}))}catch(e){setError(e instanceof Error?e.message:'Connection check failed')}finally{setBusy(false)}}}>{busy?'Checking models…':'Check six Ollama models ↗'}</button>
   </div>
   <div className="glass-card research-card"><div className="panel-title"><span>SELECTED MODELS</span><span className="live-pill">6 MODELS</span></div>
    {OLLAMA_MODELS.map(item=><div className="decision-line" key={item.name}><span>{item.label}</span><strong>{item.model}</strong></div>)}
   </div>
   <div className="glass-card research-card" id="provider-routing-plan"><h2>Effective model routing</h2>
    {routingPlan===undefined?<p role="status">Loading server routing…</p>:routingPlan.roles.map(role=><div className="decision-line" key={role.role}><span>{role.role.toUpperCase()}</span><div><strong>{role.model}</strong><p>Fallback: {role.failoverOrder.map(name=>OLLAMA_MODELS.find(item=>item.name===name)?.model??name).join(' → ')}</p></div></div>)}
    <p>Fallback occurs only after an explicit model rejection. Account authentication, quota, timeouts and uncertain responses stop the request for review.</p>
   </div>
   <div className="hero-actions"><Link className="secondary-button" to="/routing">Measured routing policies →</Link><Link className="secondary-button" to="/mission-graphs">Choose a task-graph model →</Link></div>
   {error&&<p className="warning" role="alert">{error}</p>}
   {results&&<div className="glass-card research-card"><h2>Connection results · {results.filter(item=>item.status==='healthy').length}/{results.length} healthy</h2>{results.map(item=><div className="guard-item" key={item.name}><div><strong>{item.label}</strong><small>{item.detail}</small><small>{item.latencyMs} ms</small></div><span className="status-chip">{item.status.toUpperCase()}</span></div>)}</div>}
   <ProviderUsageLedger/><ProviderReconciliation/>
   <div className="glass-card research-card"><h2>Diagnostic history</h2><p>Historical provider records remain available. Missing cost metadata stays unknown; Ollama’s invoice is authoritative.</p>
    {history===undefined?<p>Loading…</p>:history.length===0?<p>No connection checks recorded yet.</p>:history.slice(0,12).map(item=><div className="guard-item" key={item._id}><div><strong>{item.label}</strong><small>{new Date(item.checkedAt).toLocaleString()} · {item.detail}</small></div><span className="status-chip">{item.status.toUpperCase()}</span></div>)}
   </div>
  </section>
 </WorkspaceLayout>
}
