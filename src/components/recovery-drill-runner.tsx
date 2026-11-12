import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

type CheckValue = 'pending' | 'pass' | 'fail' | 'blocked'
type Environment = 'testing' | 'isolated-lab'
type Drill = { _id: Id<'recoveryDrills'>; _creationTime: number; title: string; environment: Environment; backupCapture: CheckValue; checksumVerification: CheckValue; isolatedRestore: CheckValue; ownershipVerification: CheckValue; smokeChecks: CheckValue; baselineReturn: CheckValue; durationMinutes?: number; evidenceReference: string; summary: string; status: 'draft' | 'blocked' | 'submitted'; revision: number; createdAt: number; updatedAt: number }
type CheckKey = 'backupCapture' | 'checksumVerification' | 'isolatedRestore' | 'ownershipVerification' | 'smokeChecks' | 'baselineReturn'

const checks: { key: CheckKey; label: string; detail: string }[] = [
  { key: 'backupCapture', label: 'Capture a fresh backup', detail: 'Record the backup timestamp, source environment, and artifact reference.' },
  { key: 'checksumVerification', label: 'Verify artifact integrity', detail: 'Compare independently retrieved bytes against the recorded digest.' },
  { key: 'isolatedRestore', label: 'Restore into an isolated target', detail: 'Never overwrite Live; retain table/document counts and restore logs.' },
  { key: 'ownershipVerification', label: 'Verify ownership and access boundaries', detail: 'Confirm expected owners can read their records and other owners cannot.' },
  { key: 'smokeChecks', label: 'Run application smoke checks', detail: 'Check representative read paths and essential workflows after restore.' },
  { key: 'baselineReturn', label: 'Return the drill target to baseline', detail: 'Record the supported return/rollback evidence and verify the final target.' },
]

const checkLabels: Record<CheckValue, string> = { pending: 'Not run', pass: 'Pass', fail: 'Fail', blocked: 'Blocked' }
const statusLabels = { draft: 'IN PROGRESS', blocked: 'BLOCKED', submitted: 'EVIDENCE READY · REVIEW REQUIRED' } as const

function DrillCard({ drill }: { drill: Drill }) {
  const update = useMutation(api.recoveryDrills.update)
  const [title, setTitle] = useState(drill.title)
  const [environment, setEnvironment] = useState<Environment>(drill.environment)
  const [values, setValues] = useState<Record<CheckKey, CheckValue>>({
    backupCapture: drill.backupCapture,
    checksumVerification: drill.checksumVerification,
    isolatedRestore: drill.isolatedRestore,
    ownershipVerification: drill.ownershipVerification,
    smokeChecks: drill.smokeChecks,
    baselineReturn: drill.baselineReturn,
  })
  const [durationMinutes, setDurationMinutes] = useState(drill.durationMinutes === undefined ? '' : String(drill.durationMinutes))
  const [evidenceReference, setEvidenceReference] = useState(drill.evidenceReference)
  const [summary, setSummary] = useState(drill.summary)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await update({
        id: drill._id as Id<'recoveryDrills'>,
        title,
        environment,
        ...values,
        durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : undefined,
        evidenceReference,
        summary,
      })
      setMessage('Drill record saved. The server recalculated its evidence status.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the drill record. Confirm you are signed in.')
    } finally {
      setSaving(false)
    }
  }

  return <article className="glass-card research-card" data-testid="recovery-drill-card">
    <div className="panel-title"><span>DRILL · REVISION {drill.revision}</span><span className={'status-chip ' + (drill.status === 'submitted' ? 'status-chip' : '')}>{statusLabels[drill.status]}</span></div>
    <div className="field-grid">
      <div><label htmlFor={'drill-title-' + drill._id}>DRILL NAME</label><input id={'drill-title-' + drill._id} value={title} maxLength={120} onChange={event => setTitle(event.target.value)} /></div>
      <div><label htmlFor={'drill-env-' + drill._id}>TARGET ENVIRONMENT</label><select id={'drill-env-' + drill._id} value={environment} onChange={event => setEnvironment(event.target.value as Environment)}><option value="testing">Testing database</option><option value="isolated-lab">Isolated lab</option></select></div>
    </div>
    <div className="release-gate-list">
      {checks.map((item, index) => <div className="glass-card research-card" key={item.key}>
        <div className="panel-title"><span>STEP {String(index + 1).padStart(2, '0')} · {item.label.toUpperCase()}</span><select aria-label={item.label + ' result'} value={values[item.key]} onChange={event => setValues(current => ({ ...current, [item.key]: event.target.value as CheckValue }))}><option value="pending">Not run</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="blocked">Blocked</option></select></div>
        <p>{item.detail}</p>
      </div>)}
    </div>
    <div className="field-grid">
      <div><label htmlFor={'drill-duration-' + drill._id}>MEASURED END-TO-END RECOVERY TIME (MINUTES)</label><input id={'drill-duration-' + drill._id} type="number" min="1" max="10080" step="1" value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} placeholder="Actual elapsed minutes"/><small>Enter measured elapsed time from recovery start through verified baseline return. Release acceptance requires 240 minutes or less.</small></div>
      <div><label htmlFor={'drill-evidence-' + drill._id}>EVIDENCE REFERENCE</label><input id={'drill-evidence-' + drill._id} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} maxLength={500} placeholder="Controlled report URL or private artifact reference" /></div>
      <div><label htmlFor={'drill-summary-' + drill._id}>RESULT SUMMARY & LIMITATIONS</label><textarea id={'drill-summary-' + drill._id} rows={3} value={summary} onChange={event => setSummary(event.target.value)} maxLength={4000} placeholder="What actually ran, exact scope, timestamps, result, and remaining limitations" /></div>
    </div>
    <div className="hero-actions"><button className="primary-button" type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & evaluate evidence'}</button><span className="muted-copy">Updated {new Date(drill.updatedAt).toLocaleString()}</span></div>
    {message && <p role="status">{message}</p>}
    {drill.status === 'submitted' && <p className="warning">All six checks are marked pass, measured recovery time is {drill.durationMinutes} minutes (within the four-hour target), an evidence reference is present, and a result summary is saved. This is an operator-submitted record, not an independent approval or proof that the external operations occurred.</p>}
    {drill.status === 'blocked' && <p className="warning">At least one check failed or is blocked. Resolve it and preserve the negative result in the evidence notes; do not hide failed runs.</p>}
  </article>
}

export function RecoveryDrillRunner() {
  const drills = useQuery(api.recoveryDrills.list, {})
  const create = useMutation(api.recoveryDrills.create)
  const [newTitle, setNewTitle] = useState('Scheduled recovery verification')
  const [environment, setEnvironment] = useState<Environment>('testing')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)

  async function createDrill() {
    setCreating(true)
    setMessage('')
    try {
      await create({ title: newTitle, environment })
      setMessage('New recovery drill created. Complete each check and attach the real evidence reference.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create a drill. Confirm you are signed in.')
    } finally {
      setCreating(false)
    }
  }

  return <section className="workspace dark-section" data-testid="recovery-drill-runner">
    <div className="workspace-head">
      <div><div className="section-kicker">OPERATIONS / RECOVERY VERIFICATION</div><h2>Recovery Drill Runner</h2><p>Capture a repeatable, owner-scoped drill record from backup capture through baseline return. This workflow records evidence; it does not execute backups, restore databases, or interrupt managed hosting.</p></div>
      <span className="rc-badge rc-fail">NO LIVE WRITES</span>
    </div>
    <div className="glass-card research-card">
      <div className="panel-title"><span>NEW DRILL</span><span className="status-chip">TESTING OR ISOLATED LAB ONLY</span></div>
      <div className="field-grid">
        <div><label htmlFor="new-drill-title">DRILL NAME</label><input id="new-drill-title" value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={120} /></div>
        <div><label htmlFor="new-drill-env">TARGET ENVIRONMENT</label><select id="new-drill-env" value={environment} onChange={event => setEnvironment(event.target.value as Environment)}><option value="testing">Testing database</option><option value="isolated-lab">Isolated lab</option></select></div>
      </div>
      <div className="hero-actions"><button className="primary-button" type="button" onClick={createDrill} disabled={creating || !newTitle.trim()}>{creating ? 'Creating…' : 'Create recovery drill'}</button></div>
      {message && <p role="status">{message}</p>}
    </div>
    {drills === undefined ? <p className="muted-copy">Loading private recovery drill records…</p> : drills.length === 0 ? <div className="glass-card research-card"><h3>No recovery drills recorded yet</h3><p>Create a Testing or isolated-lab drill. New records start with every check pending.</p></div> : <div className="release-gate-list">{drills.map(drill => <DrillCard key={drill._id} drill={drill} />)}</div>}
    <div className="glass-card research-card">
      <div className="panel-title"><span>ACCEPTANCE BOUNDARY</span><span className="status-chip">EVIDENCE ONLY</span></div>
      <p>A drill is submitted only when all six checks pass, measured end-to-end recovery duration is recorded at 240 minutes or less, and both an evidence reference and a non-empty result summary are saved. Missing duration keeps the drill in draft; duration above four hours blocks it. A checklist alone is not proof that operations occurred. Keep actual artifact references, hashes, timestamps, source/target environment, restore logs, owner-isolation results, smoke-test results, and return evidence together. Failed and blocked runs remain visible.</p>
      <p>Managed-host interruption/rollback and recurring backup scheduling still require supported platform controls. This screen does not fabricate those capabilities.</p>
      <div className="hero-actions"><Link className="secondary-button" to="/release-evidence">Send verified recovery evidence to the Release Evidence Center →</Link></div>
    </div>
  </section>
}
