import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { compareSchemaSnapshots } from '../lib/app-factory-contracts'
import { downloadJson, message as errorMessage, ProjectPicker, useStudioProject } from './studio-shared'

const exampleBaseline = JSON.stringify({ tables: [{ name: 'projectNotes', fields: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string', optional: true }], indexes: ['by_owner'] }] }, null, 2)
const exampleProposed = JSON.stringify({ tables: [{ name: 'projectNotes', fields: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string', optional: true }, { name: 'updatedAt', type: 'number', optional: true }], indexes: ['by_owner', 'by_owner_updatedAt'] }, { name: 'noteRevisions', fields: [{ name: 'ownerId', type: 'string' }, { name: 'noteId', type: 'id:projectNotes' }, { name: 'content', type: 'string' }], indexes: ['by_owner'] }] }, null, 2)

export function SchemaDiffGate() {
  const studio = useStudioProject()
  const projectId = studio.projectId
  const savedRows = useQuery(api.appFactoryDrafts.list, projectId ? { projectId } : 'skip')
  const saveDraft = useMutation(api.appFactoryDrafts.save)
  const [baseline, setBaseline] = useState(exampleBaseline)
  const [proposed, setProposed] = useState(exampleProposed)
  const [draftKey, setDraftKey] = useState('schema-diff-review')
  const [result, setResult] = useState<ReturnType<typeof compareSchemaSnapshots> | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const latest = useMemo(() => [...(savedRows ?? [])].filter(row => row.draftKey === draftKey.trim()).sort((a,b) => b.revision-a.revision)[0], [savedRows, draftKey])
  function compare() {
    setError(''); setMessage('')
    try { setResult(compareSchemaSnapshots(baseline, proposed)); }
    catch (e) { setResult(null); setError(e instanceof Error ? e.message : 'Could not compare snapshots.') }
  }
  async function save() {
    if (!projectId || !result) return
    setBusy(true); setError(''); setMessage('')
    try {
      const id = await saveDraft({ projectId, draftKey: draftKey.trim(), kind: 'database-migration-plan', title: 'Schema diff and migration gate', content: JSON.stringify({ ...result, baselineSnapshot: JSON.parse(baseline), proposedSnapshot: JSON.parse(proposed) }), expectedRevision: latest?.revision ?? 0 })
      setMessage('Immutable schema review revision saved: ' + id + '. It remains a draft until real Testing evidence is reviewed.')
    } catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }
  return <section className="glass-card research-card" data-testid="schema-diff-gate">
    <div className="panel-title"><span>APP FACTORY · SCHEMA DIFF & MIGRATION GATES</span><span className="status-chip">NO MIGRATION EXECUTION</span></div>
    <h2>Compare the current schema to the proposed schema</h2>
    <p>Supply two JSON snapshots using the documented shape. The diff detects table/field/index additions and removals, type or optionality changes, and new required fields. Only non-breaking additions are classified as additive; required fields, removals and type changes are blocked pending a compatibility/backfill plan.</p>
    <ProjectPicker studio={studio}/>
    <div className="field-grid">
      <div><label htmlFor="schema-baseline">BASELINE SNAPSHOT JSON</label><textarea id="schema-baseline" rows={14} value={baseline} onChange={e=>setBaseline(e.target.value)} spellCheck={false}/></div>
      <div><label htmlFor="schema-proposed">PROPOSED SNAPSHOT JSON</label><textarea id="schema-proposed" rows={14} value={proposed} onChange={e=>setProposed(e.target.value)} spellCheck={false}/></div>
    </div>
    <p>Expected shape: <code>{'{"tables":[{"name":"projectNotes","fields":[{"name":"title","type":"string","optional":false}],"indexes":["by_owner"]}]}'}</code>. Snapshots are supplied by the operator; this tool does not introspect Convex or a customer database.</p>
    <div className="hero-actions"><button type="button" className="primary-button" onClick={compare}>Compare snapshots</button>{result&&<button type="button" className="secondary-button" onClick={()=>downloadJson('schema-diff-gate.json',{...result,baselineSnapshot:JSON.parse(baseline),proposedSnapshot:JSON.parse(proposed)})}>Export diff report</button>}</div>
    {result&&<div id="schema-diff-result" data-status={result.safeAdditive?'additive-review-required':'blocked-compatibility-review'}>
      <div className="panel-title"><span>DIFF DECISION</span><span className="status-chip">{result.decision.replaceAll('_',' ')}</span></div>
      <div className="stats-strip compact">{Object.entries(result.counts).map(([key,value])=><div key={key}><strong>{value}</strong><span>{key.replace(/[A-Z]/g,letter=>' '+letter.toLowerCase())}</span></div>)}</div>
      {result.safeAdditive?<p>Only additive changes were detected in the supplied snapshots. Review is still required; this is not a deployment approval.</p>:<div className="warning"><strong>Compatibility gate blocked.</strong><ul>{result.blockers.map(item=><li key={item}>{item}</li>)}</ul></div>}
      <h3>Required rollout gates</h3><ol>{result.gates.map(gate=><li key={gate}>{gate.replaceAll('-',' ')}</li>)}</ol>
      <p>{result.boundary}</p>
      <label>Stable revision key<input maxLength={64} value={draftKey} onChange={e=>setDraftKey(e.target.value)} /></label>
      <p>Saved revisions for this key: {savedRows===undefined?'loading':savedRows.filter(row=>row.draftKey===draftKey.trim()).length}. Each save retains the exact report in project-private version history.</p>
      <button type="button" className="primary-button" disabled={!projectId||savedRows===undefined||busy||!/^([a-z][a-z0-9-]{2,63})$/.test(draftKey.trim())} onClick={save}>{busy?'Saving…':'Save immutable schema review'}</button>
    </div>}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>
}
