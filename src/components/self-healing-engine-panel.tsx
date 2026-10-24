import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../lib/scope-e-api'

type PatchFile = { path: string; beforeDigest: string; afterDigest: string }
const card = 'glass-card research-card'
const blankDigest = '0'.repeat(64)

export function SelfHealingEnginePanel() {
  const [incidentKey, setIncidentKey] = useState('incident-e2-001')
  const [source, setSource] = useState<'runtime' | 'compiler' | 'diagnostic'>('diagnostic')
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [trace, setTrace] = useState('Type check reported a bounded issue\nNo external effects observed')
  const [patchJson, setPatchJson] = useState(JSON.stringify([{ path: 'src/example.ts', beforeDigest: blankDigest, afterDigest: '1'.repeat(64) }], null, 2))
  const [maxFiles, setMaxFiles] = useState(3)
  const [rollbackDigest, setRollbackDigest] = useState('2'.repeat(64))
  const [receipt, setReceipt] = useState('Isolated sandbox review recorded; no production changes applied.')
  const [sandboxPassed, setSandboxPassed] = useState(false)
  const [containment, setContainment] = useState<'contained' | 'not_contained'>('not_contained')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const ingest = useMutation(api.scopeEFunctions.ingestDiagnosticTrace)
  const recordReceipt = useMutation(api.scopeEFunctions.recordRepairSandboxReceipt)
  let patchFiles: PatchFile[] = []
  let patchParseError = ''
  try {
    const parsed: unknown = JSON.parse(patchJson)
    if (!Array.isArray(parsed)) throw new Error('Patch must be a JSON array.')
    patchFiles = parsed as PatchFile[]
  } catch (cause) { patchParseError = cause instanceof Error ? cause.message : 'Invalid patch JSON.' }
  const proposal = useQuery(api.scopeEFunctions.proposeSelfRepairPatch, incidentKey.trim() && !patchParseError ? { incidentKey, patchFiles, maxFiles, rollbackDigest } : 'skip')

  async function submitTrace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = await ingest({ requestKey: 'e2-' + incidentKey, incidentKey, source, severity, trace: trace.split('\n').map(line => line.trim()).filter(Boolean) })
      setNotice('Trace captured. SHA-256: ' + result.traceDigest)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Trace ingest failed.') }
    finally { setBusy(false) }
  }
  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const result = await recordReceipt({ requestKey: 'e2-receipt-' + incidentKey, incidentKey, patchFiles, rollbackDigest, sandboxPassed, containmentState: containment, receipt })
      setNotice('Sandbox receipt recorded: ' + result.sandboxStatus + ' · ' + result.receiptDigest)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Receipt recording failed.') }
    finally { setBusy(false) }
  }

  return <section className="workspace" aria-labelledby="e2-heading">
    <div className={card}><p className="panel-title">SCOPE E · E2 / BOUNDED REPAIR</p><h2 id="e2-heading">Self-healing engine</h2><p>Capture a diagnostic, inspect a bounded patch proposal and record a sandbox receipt. This panel never applies a patch to production.</p></div>
    <form className={card} onSubmit={event => void submitTrace(event)}><h3>Diagnostic trace ingest</h3>
      <label>Incident key<input value={incidentKey} onChange={event => setIncidentKey(event.target.value)} required maxLength={160} pattern="[A-Za-z0-9][A-Za-z0-9._:/-]*" /></label>
      <div className="field-grid"><label>Source<select value={source} onChange={event => setSource(event.target.value as typeof source)}><option value="runtime">Runtime</option><option value="compiler">Compiler</option><option value="diagnostic">Diagnostic</option></select></label><label>Severity<select value={severity} onChange={event => setSeverity(event.target.value as typeof severity)}>{['low','medium','high','critical'].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label>Trace lines<textarea value={trace} onChange={event => setTrace(event.target.value)} rows={4} required maxLength={10000} /></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Capturing…' : 'Capture diagnostic trace'}</button>
    </form>
    <div className={card}><h3>Bounded patch proposer</h3><label>Patch manifest JSON<textarea value={patchJson} onChange={event => setPatchJson(event.target.value)} rows={5} required /></label>
      <div className="field-grid"><label>Maximum changed files<input type="number" min={1} max={20} value={maxFiles} onChange={event => setMaxFiles(Number(event.target.value))} /></label><label>Rollback snapshot SHA-256<input value={rollbackDigest} onChange={event => setRollbackDigest(event.target.value)} pattern="[A-Fa-f0-9]{64}" required /></label></div>
      {patchParseError ? <p role="alert">{patchParseError}</p> : proposal === undefined ? <p role="status">Waiting for incident capture or operator authorization…</p> : <div aria-live="polite"><p><strong>{proposal.valid ? 'Patch proposal passes bounds' : 'Patch proposal blocked'}</strong> · {proposal.fileCount} file(s) · {proposal.reversible ? 'reversible' : 'rollback evidence invalid'}</p><ul>{proposal.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul><p>Patch digest: <code>{proposal.patchDigest}</code></p></div>}
    </div>
    <form className={card} onSubmit={event => void submitReceipt(event)}><h3>Sandbox verification receipt</h3>
      <label>Receipt note<textarea value={receipt} onChange={event => setReceipt(event.target.value)} rows={3} required maxLength={5000} /></label>
      <label>Sandbox outcome<select value={sandboxPassed ? 'passed' : 'failed'} onChange={event => setSandboxPassed(event.target.value === 'passed')}><option value="failed">Not passed / rejected</option><option value="passed">Passed</option></select></label>
      <label>Containment state<select value={containment} onChange={event => setContainment(event.target.value as typeof containment)}><option value="not_contained">Not contained</option><option value="contained">Contained</option></select></label>
      <button className="primary-button" disabled={busy || patchParseError !== '' || !proposal?.valid}>{busy ? 'Recording…' : 'Record sandbox receipt'}</button>
      {error && <p role="alert">{error}</p>}{notice && <p role="status" aria-live="polite">{notice}</p>}
    </form>
  </section>
}
