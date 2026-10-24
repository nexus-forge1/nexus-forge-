import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../lib/scope-e-api'

const card = 'glass-card research-card'

export function AgentWatchdogTelemetryView() {
  const [agentKey, setAgentKey] = useState('swarm-agent-001')
  const [pulseAt, setPulseAt] = useState(() => Date.now())
  const [currentLoad, setCurrentLoad] = useState(1)
  const [status, setStatus] = useState<'healthy' | 'degraded' | 'offline'>('healthy')
  const [timeoutMs, setTimeoutMs] = useState(30000)
  const [failoverTargetKey, setFailoverTargetKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const heartbeat = useMutation(api.scopeEFunctions.recordAgentHeartbeat)
  const reroute = useMutation(api.scopeEFunctions.triggerFailoverReroute)
  const evaluation = useQuery(api.scopeEFunctions.evaluateDeadManSwitch, agentKey.trim() ? { agentKey } : 'skip')

  async function run(event: FormEvent<HTMLFormElement>, action: () => Promise<unknown>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { setNotice(JSON.stringify(await action(), null, 2)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Watchdog operation failed.') }
    finally { setBusy(false) }
  }

  return <section className="workspace" aria-labelledby="e4-heading">
    <div className={card}><p className="panel-title">SCOPE E · E4 / PULSE & FAILOVER GOVERNANCE</p><h2 id="e4-heading">Agent watchdog telemetry</h2><p>Heartbeat records and failover decisions are governed backend records. Rerouting is explicit and remains bounded by server-side capacity checks.</p>
      <label>Agent key<input value={agentKey} onChange={event => setAgentKey(event.target.value)} required /></label>
      <div aria-live="polite"><h3>Dead-man switch evaluation</h3>{evaluation === undefined ? <p role="status">Loading agent pulse evaluation…</p> : <><p><strong>{evaluation.timedOut ? 'Timeout detected' : 'No timeout detected'}</strong> · {evaluation.action}</p><dl><dt>Pulse age</dt><dd>{evaluation.ageMs} ms</dd><dt>Configured timeout</dt><dd>{evaluation.timeoutMs} ms</dd><dt>Failover target</dt><dd>{evaluation.failoverTargetKey ?? 'Not configured'}</dd></dl></>}</div>
    </div>
    <form className={card} onSubmit={event => void run(event, () => heartbeat({ requestKey: 'e4-heartbeat-' + agentKey + '-' + pulseAt, agentKey, pulseAt, currentLoad, status, deadManTimeoutMs: timeoutMs, ...(failoverTargetKey.trim() ? { failoverTargetKey } : {}) }))}><h3>Record agent pulse</h3>
      <div className="field-grid"><label>Pulse timestamp (ms)<input type="number" value={pulseAt} onChange={event => setPulseAt(Number(event.target.value))} required /></label><label>Current load<input type="number" min={0} max={100000} value={currentLoad} onChange={event => setCurrentLoad(Number(event.target.value))} /></label><label>Health state<select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="healthy">Healthy</option><option value="degraded">Degraded</option><option value="offline">Offline</option></select></label><label>Dead-man timeout (ms)<input type="number" min={1000} max={86400000} value={timeoutMs} onChange={event => setTimeoutMs(Number(event.target.value))} /></label></div>
      <label>Failover target agent key (optional)<input value={failoverTargetKey} onChange={event => setFailoverTargetKey(event.target.value)} /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Recording…' : 'Record heartbeat'}</button>
    </form>
    <form className={card} onSubmit={event => void run(event, () => reroute({ requestKey: 'e4-failover-' + agentKey + '-' + Date.now(), agentKey }))}><h3>Failover task reroute</h3><p>Use only after reviewing the live dead-man switch result. The backend decides whether the agent is offline and which tasks are safe to reroute.</p><button className="secondary-button" disabled={busy || !agentKey.trim()}>{busy ? 'Evaluating…' : 'Evaluate and trigger failover reroute'}</button>{error && <p role="alert">{error}</p>}{notice && <pre role="status" aria-live="polite">{notice}</pre>}</form>
  </section>
}
