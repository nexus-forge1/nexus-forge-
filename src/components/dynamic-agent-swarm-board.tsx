import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../lib/scope-e-api'

const card = 'glass-card research-card'
const lines = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean)

export function DynamicAgentSwarmBoard() {
  const [missionKey, setMissionKey] = useState('')
  const [queueDepth, setQueueDepth] = useState(12)
  const [threshold, setThreshold] = useState(8)
  const [capabilities, setCapabilities] = useState('planning,analysis')
  const [agentKey, setAgentKey] = useState('swarm-agent-001')
  const [role, setRole] = useState('planner')
  const [agentCapabilities, setAgentCapabilities] = useState('planning,analysis')
  const [capacity, setCapacity] = useState(5)
  const [taskKey, setTaskKey] = useState('task-001')
  const [taskCapabilities, setTaskCapabilities] = useState('analysis')
  const [priority, setPriority] = useState(5)
  const [taskKeys, setTaskKeys] = useState('task-001')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const capacityView = useQuery(api.scopeEFunctions.evaluateSwarmCapacity, missionKey.trim() ? { missionKey, queueDepth, bottleneckThreshold: threshold, desiredCapabilities: lines(capabilities) } : 'skip')
  const instantiate = useMutation(api.scopeEFunctions.instantiateSwarmAgent)
  const registerTask = useMutation(api.scopeEFunctions.registerSwarmTask)
  const rebalance = useMutation(api.scopeEFunctions.rebalanceSwarmTasks)

  async function run(event: FormEvent<HTMLFormElement>, action: () => Promise<unknown>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { setNotice(JSON.stringify(await action(), null, 2)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Swarm operation failed.') }
    finally { setBusy(false) }
  }

  return <section className="workspace" aria-labelledby="e3-heading">
    <div className={card}><p className="panel-title">SCOPE E · E3 / ROLE & CAPABILITY PLANNING</p><h2 id="e3-heading">Dynamic agent swarm board</h2><p>Inspect capacity, provision governed agent records and rebalance explicit task keys. No external agents are launched by this board.</p>
      <label>Mission key<input value={missionKey} onChange={event => setMissionKey(event.target.value)} placeholder="Paste an operator-owned mission ID" required /></label>
      <div className="field-grid"><label>Queue depth<input type="number" min={0} max={100000} value={queueDepth} onChange={event => setQueueDepth(Number(event.target.value))} /></label><label>Bottleneck threshold<input type="number" min={1} max={100000} value={threshold} onChange={event => setThreshold(Number(event.target.value))} /></label></div>
      <label>Desired capabilities (comma-separated)<input value={capabilities} onChange={event => setCapabilities(event.target.value)} /></label>
      {!missionKey.trim() ? <p role="status">Enter a mission key to load the reactive capacity view.</p> : capacityView === undefined ? <p role="status">Loading capacity evaluation…</p> : <div aria-live="polite"><h3>Capacity evaluation</h3><p><strong>{capacityView.recommendation}</strong></p><dl><dt>Queue depth</dt><dd>{capacityView.queueDepth}</dd><dt>Active agents</dt><dd>{capacityView.activeAgents}</dd><dt>Eligible agents</dt><dd>{capacityView.eligibleAgents}</dd><dt>Threshold</dt><dd>{capacityView.threshold}</dd></dl><p>Missing capabilities: {capacityView.missingCapabilities.join(', ') || 'None reported'}</p></div>}
    </div>
    <form className={card} onSubmit={event => void run(event, () => instantiate({ requestKey: 'e3-agent-' + agentKey, agentKey, role, capabilities: lines(agentCapabilities), capacity }))}><h3>Instantiate agent role</h3>
      <label>Agent key<input value={agentKey} onChange={event => setAgentKey(event.target.value)} required /></label><label>Role<input value={role} onChange={event => setRole(event.target.value)} required maxLength={100} /></label><label>Capabilities<input value={agentCapabilities} onChange={event => setAgentCapabilities(event.target.value)} required /></label><label>Task capacity<input type="number" min={1} max={10000} value={capacity} onChange={event => setCapacity(Number(event.target.value))} /></label><button className="primary-button" disabled={busy || !missionKey.trim()}>{busy ? 'Working…' : 'Instantiate agent record'}</button>
    </form>
    <form className={card} onSubmit={event => void run(event, () => registerTask({ requestKey: 'e3-task-' + taskKey, missionKey, taskKey, requiredCapabilities: lines(taskCapabilities), priority }))}><h3>Register task for balancing</h3>
      <label>Task key<input value={taskKey} onChange={event => setTaskKey(event.target.value)} required /></label><label>Required capabilities<input value={taskCapabilities} onChange={event => setTaskCapabilities(event.target.value)} /></label><label>Priority (0–100)<input type="number" min={0} max={100} value={priority} onChange={event => setPriority(Number(event.target.value))} /></label><button className="secondary-button" disabled={busy || !missionKey.trim()}>{busy ? 'Working…' : 'Register task'}</button>
    </form>
    <form className={card} onSubmit={event => void run(event, () => rebalance({ requestKey: 'e3-rebalance-' + missionKey, missionKey, taskKeys: lines(taskKeys) }))}><h3>Task rebalancing matrix</h3><label>Task keys (comma-separated)<input value={taskKeys} onChange={event => setTaskKeys(event.target.value)} required /></label><button className="primary-button" disabled={busy || !missionKey.trim()}>{busy ? 'Rebalancing…' : 'Rebalance selected tasks'}</button>
      {error && <p role="alert">{error}</p>}{notice && <pre role="status" aria-live="polite">{notice}</pre>}
    </form>
  </section>
}
