import { useState, type FormEvent } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../lib/scope-e-api'

const card = 'glass-card research-card'
type Snapshot = { snapshotKey: string; sequence: number; stateJson: string; astJson: string; stateDigest: string; astDigest: string; createdAt: number }
type Diff = { stateDiff: Array<{ path: string; kind: string; before: string; after: string }>; astDiff: Array<{ path: string; kind: string; before: string; after: string }>; diffDigest: string }

export function InteractiveEventScrubberView() {
  const [missionKey, setMissionKey] = useState('')
  const [snapshotKey, setSnapshotKey] = useState('checkpoint-001')
  const [sequence, setSequence] = useState(1)
  const [stateJson, setStateJson] = useState('{"status":"draft","revision":1}')
  const [astJson, setAstJson] = useState('{"type":"Page","children":[]}')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [fromIndex, setFromIndex] = useState(0)
  const [toIndex, setToIndex] = useState(1)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const record = useMutation(api.scopeEFunctions.recordMissionStateSnapshot)
  const diffSnapshots = useAction(api.scopeEFunctions.diffHistoricalStateSnapshots)
  const exportReceipt = useMutation(api.scopeEFunctions.exportEventScrubberReceipt)
  const history = useQuery(api.scopeEFunctions.fetchMissionHistoricalStates, missionKey.trim() ? { missionKey, limit: 200 } : 'skip') as Snapshot[] | undefined
  const selected = history?.[Math.min(selectedIndex, Math.max(0, (history?.length ?? 1) - 1))]
  const from = history?.[fromIndex]
  const to = history?.[toIndex]

  async function run(event: FormEvent<HTMLFormElement>, action: () => Promise<unknown>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { setNotice(JSON.stringify(await action(), null, 2)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Event scrubber operation failed.') }
    finally { setBusy(false) }
  }
  async function calculateDiff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      if (!from || !to) throw new Error('Select two available checkpoints before comparing.')
      const result = await diffSnapshots({ fromStateJson: from.stateJson, toStateJson: to.stateJson, fromAstJson: from.astJson, toAstJson: to.astJson })
      setDiff(result); setNotice('State and AST comparison calculated. Digest: ' + result.diffDigest)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Diff calculation failed.') }
    finally { setBusy(false) }
  }

  return <section className="workspace" aria-labelledby="e6-heading">
    <div className={card}><p className="panel-title">SCOPE E · E6 / HISTORICAL STATE INSPECTION</p><h2 id="e6-heading">Interactive event scrubber</h2><p>Record immutable mission checkpoints, scrub the sequence, compare state and AST snapshots, and preserve a digest-bound receipt.</p>
      <label>Mission key<input value={missionKey} onChange={event => setMissionKey(event.target.value)} required /></label>
      {!missionKey.trim() ? <p role="status">Enter an operator-owned mission key to load checkpoint history.</p> : history === undefined ? <p role="status">Loading checkpoint history…</p> : history.length === 0 ? <p role="status">No checkpoints recorded for this mission yet.</p> : <>
        <label>Chronological checkpoint scrubber ({selectedIndex + 1} of {history.length})<input type="range" min={0} max={history.length - 1} value={Math.min(selectedIndex, history.length - 1)} onChange={event => setSelectedIndex(Number(event.target.value))} aria-valuetext={selected?.snapshotKey ?? 'No checkpoint'} /></label>
        {selected && <div><h3>{selected.snapshotKey} · sequence {selected.sequence}</h3><p>Captured {new Date(selected.createdAt).toLocaleString()}</p><p>State digest: <code>{selected.stateDigest}</code></p><p>AST digest: <code>{selected.astDigest}</code></p><div className="field-grid"><div><h4>State JSON</h4><pre>{selected.stateJson}</pre></div><div><h4>AST JSON</h4><pre>{selected.astJson}</pre></div></div></div>}
      </>}
    </div>
    <form className={card} onSubmit={event => void run(event, async () => {
      const result = await record({ requestKey: 'e6-' + snapshotKey, missionKey, snapshotKey, sequence, stateJson, astJson })
      setNotice('Checkpoint recorded. State digest: ' + result.stateDigest)
      return result
    })}><h3>Capture checkpoint</h3><div className="field-grid"><label>Snapshot key<input value={snapshotKey} onChange={event => setSnapshotKey(event.target.value)} required /></label><label>Monotonic sequence<input type="number" min={1} max={1000000000} value={sequence} onChange={event => setSequence(Number(event.target.value))} /></label></div>
      <div className="field-grid"><label>Mission state JSON<textarea value={stateJson} onChange={event => setStateJson(event.target.value)} rows={5} required /></label><label>AST snapshot JSON<textarea value={astJson} onChange={event => setAstJson(event.target.value)} rows={5} required /></label></div><button className="primary-button" disabled={busy || !missionKey.trim()}>{busy ? 'Recording…' : 'Record checkpoint'}</button>
    </form>
    <form className={card} onSubmit={event => void calculateDiff(event)}><h3>Side-by-side state / AST diff</h3><div className="field-grid"><label>From checkpoint<select value={fromIndex} onChange={event => setFromIndex(Number(event.target.value))} disabled={!history?.length}>{(history ?? []).map((item, index) => <option value={index} key={item.snapshotKey}>{item.sequence} · {item.snapshotKey}</option>)}</select></label><label>To checkpoint<select value={toIndex} onChange={event => setToIndex(Number(event.target.value))} disabled={!history?.length}>{(history ?? []).map((item, index) => <option value={index} key={item.snapshotKey}>{item.sequence} · {item.snapshotKey}</option>)}</select></label></div><button className="secondary-button" disabled={busy || !from || !to || from.snapshotKey === to.snapshotKey}>{busy ? 'Comparing…' : 'Calculate state and AST diff'}</button>
      {diff && <div aria-live="polite"><p>Diff digest: <code>{diff.diffDigest}</code></p><div className="field-grid"><div><h4>State changes ({diff.stateDiff.length})</h4><pre>{JSON.stringify(diff.stateDiff, null, 2)}</pre></div><div><h4>AST changes ({diff.astDiff.length})</h4><pre>{JSON.stringify(diff.astDiff, null, 2)}</pre></div></div></div>}
    </form>
    <form className={card} onSubmit={event => void run(event, async () => {
      if (!from || !to || !diff) throw new Error('Calculate a diff and choose two checkpoints first.')
      return exportReceipt({ requestKey: 'e6-receipt-' + from.snapshotKey + '-' + to.snapshotKey, missionKey, fromSnapshotKey: from.snapshotKey, toSnapshotKey: to.snapshotKey, diffDigest: diff.diffDigest })
    })}><h3>Audit receipt</h3><button className="primary-button" disabled={busy || !missionKey.trim() || !from || !to || !diff}>{busy ? 'Recording…' : 'Record diff audit receipt'}</button>{error && <p role="alert">{error}</p>}{notice && <pre role="status" aria-live="polite">{notice}</pre>}</form>
  </section>
}
