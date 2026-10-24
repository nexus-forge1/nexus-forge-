import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../lib/scope-e-api'

const card = 'glass-card research-card'

export function ArbitrageRouterMatrix() {
  const [provider, setProvider] = useState('provider-a')
  const [model, setModel] = useState('model-fast')
  const [inputCost, setInputCost] = useState(1)
  const [outputCost, setOutputCost] = useState(2)
  const [latency, setLatency] = useState(250)
  const [throughput, setThroughput] = useState(80)
  const [available, setAvailable] = useState(true)
  const [ruleKey, setRuleKey] = useState('default-route')
  const [maxLatency, setMaxLatency] = useState(3000)
  const [maxCost, setMaxCost] = useState(20)
  const [minThroughput, setMinThroughput] = useState(10)
  const [costWeight, setCostWeight] = useState(0.5)
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const ingest = useMutation(api.scopeEFunctions.ingestProviderPricingSample)
  const setRule = useMutation(api.scopeEFunctions.setArbitrageSwitchRule)
  const ranking = useQuery(api.scopeEFunctions.calculateArbitrageRanking, { maxSamples: 100, costWeight, maxLatencyMs: maxLatency, ...(enabled && ruleKey.trim() ? { ruleKey } : {}) })

  async function run(event: FormEvent<HTMLFormElement>, action: () => Promise<unknown>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { setNotice(JSON.stringify(await action(), null, 2)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Arbitrage operation failed.') }
    finally { setBusy(false) }
  }

  return <section className="workspace" aria-labelledby="e5-heading">
    <div className={card}><p className="panel-title">SCOPE E · E5 / PRICE & LATENCY TRADE-OFF</p><h2 id="e5-heading">Multi-model arbitrage router</h2><p>Compare recorded provider samples and configure eligibility thresholds. Ranking is based on submitted measurements, not live external provider calls.</p>
      <div aria-live="polite"><h3>Reactive Pareto-style ranking</h3>{ranking === undefined ? <p role="status">Loading provider ranking…</p> : ranking.ranking.length === 0 ? <p role="status">No pricing samples yet. Add a sample to populate the matrix.</p> : <div className="table-scroll"><table><caption>Latest sample per provider and model</caption><thead><tr><th scope="col">Provider / model</th><th scope="col">Cost / million</th><th scope="col">Latency</th><th scope="col">Tokens/s</th><th scope="col">Score</th><th scope="col">Eligibility</th></tr></thead><tbody>{ranking.ranking.map(row => <tr key={row.provider + ':' + row.model}><th scope="row">{row.provider} / {row.model}</th><td>{row.estimatedCostPerMillion.toFixed(4)}</td><td>{row.latencyMs} ms</td><td>{row.tokensPerSecond}</td><td>{row.score.toFixed(4)}</td><td>{row.eligible ? 'Eligible' : 'Filtered'}</td></tr>)}</tbody></table></div>}</div>
    </div>
    <form className={card} onSubmit={event => void run(event, () => ingest({ requestKey: 'e5-sample-' + provider + '-' + model + '-' + Date.now(), provider, model, inputCostPerMillion: inputCost, outputCostPerMillion: outputCost, latencyMs: latency, tokensPerSecond: throughput, available }))}><h3>Provider pricing sample</h3>
      <div className="field-grid"><label>Provider<input value={provider} onChange={event => setProvider(event.target.value)} required /></label><label>Model<input value={model} onChange={event => setModel(event.target.value)} required /></label><label>Input cost / million<input type="number" min={0} max={100000} step="any" value={inputCost} onChange={event => setInputCost(Number(event.target.value))} /></label><label>Output cost / million<input type="number" min={0} max={100000} step="any" value={outputCost} onChange={event => setOutputCost(Number(event.target.value))} /></label><label>Latency (ms)<input type="number" min={0} max={600000} value={latency} onChange={event => setLatency(Number(event.target.value))} /></label><label>Tokens per second<input type="number" min={0} max={1000000} value={throughput} onChange={event => setThroughput(Number(event.target.value))} /></label></div>
      <label>Provider reports available<select value={available ? 'yes' : 'no'} onChange={event => setAvailable(event.target.value === 'yes')}><option value="yes">Available</option><option value="no">Unavailable</option></select></label><button className="primary-button" disabled={busy}>{busy ? 'Ingesting…' : 'Ingest pricing sample'}</button>
    </form>
    <form className={card} onSubmit={event => void run(event, () => setRule({ requestKey: 'e5-rule-' + ruleKey, ruleKey, maxLatencyMs: maxLatency, maxCostPerMillion: maxCost, minTokensPerSecond: minThroughput, costWeight, enabled }))}><h3>Switch rule configurator</h3>
      <label>Rule key<input value={ruleKey} onChange={event => setRuleKey(event.target.value)} required /></label><div className="field-grid"><label>Maximum latency (ms)<input type="number" min={1} max={600000} value={maxLatency} onChange={event => setMaxLatency(Number(event.target.value))} /></label><label>Maximum total cost / million<input type="number" min={0} max={200000} step="any" value={maxCost} onChange={event => setMaxCost(Number(event.target.value))} /></label><label>Minimum throughput<input type="number" min={0} max={1000000} value={minThroughput} onChange={event => setMinThroughput(Number(event.target.value))} /></label><label>Cost weight (0–1)<input type="number" min={0} max={1} step="0.05" value={costWeight} onChange={event => setCostWeight(Number(event.target.value))} /></label></div>
      <label>Rule state<select value={enabled ? 'enabled' : 'disabled'} onChange={event => setEnabled(event.target.value === 'enabled')}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label><button className="secondary-button" disabled={busy}>{busy ? 'Saving…' : 'Save switch rule'}</button>
      {error && <p role="alert">{error}</p>}{notice && <pre role="status" aria-live="polite">{notice}</pre>}
    </form>
  </section>
}
