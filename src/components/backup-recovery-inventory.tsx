import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

type Environment = 'live' | 'testing' | 'isolated-lab'
const stamp = (value: number | null) => value === null ? '—' : new Date(value).toLocaleString()
const emptyForm = { captureKey: '', sourceEnvironment: 'live' as Environment, capturedAt: '', triggerType: 'manual' as 'manual' | 'timer-triggered' | 'unknown', schedulerReceiptReference: '', archiveReference: '', sourceSha256: '', storedSha256: '', bytes: '', dataTables: '', dataDocuments: '', independentRetrieval: false, zipCrcPassed: false, relationshipsPassed: false, mediaInventoryNote: '', evidenceReference: '' }

export function BackupRecoveryInventory() {
  const data = useQuery(api.backupInventory.list, {})
  const monitor = useQuery(api.backupMonitor.getMyStatus, {})
  const monitorEvents = useQuery(api.backupMonitor.listEvents, {})
  const record = useMutation(api.backupInventory.record)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const patch = <K extends keyof typeof emptyForm>(key: K, value: typeof emptyForm[K]) => setForm(current => ({ ...current, [key]: value }))

  async function submit() {
    setBusy(true); setError(''); setMessage('')
    try {
      if (!form.capturedAt || !Number.isFinite(new Date(form.capturedAt).getTime())) throw new Error('Enter the capture timestamp, including the correct local time.')
      if (!Number.isSafeInteger(Number(form.bytes)) || Number(form.bytes) <= 0) throw new Error('Archive bytes must be a positive whole number.')
      if (!Number.isSafeInteger(Number(form.dataTables)) || Number(form.dataTables) <= 0) throw new Error('Data tables must be a positive whole number.')
      if (!Number.isSafeInteger(Number(form.dataDocuments)) || Number(form.dataDocuments) < 0) throw new Error('Data documents must be a non-negative whole number.')
      if (form.triggerType === 'timer-triggered' && !form.schedulerReceiptReference.trim()) setMessage('Saved as a timer declaration without a receipt, but it will not count as timer evidence until a real managed-task receipt is supplied.')
      await record({
        captureKey: form.captureKey,
        sourceEnvironment: form.sourceEnvironment,
        capturedAt: new Date(form.capturedAt).getTime(),
        triggerType: form.triggerType,
        schedulerReceiptReference: form.schedulerReceiptReference.trim() || undefined,
        archiveReference: form.archiveReference,
        sourceSha256: form.sourceSha256,
        storedSha256: form.storedSha256,
        bytes: Number(form.bytes),
        dataTables: Number(form.dataTables),
        dataDocuments: Number(form.dataDocuments),
        independentRetrieval: form.independentRetrieval,
        zipCrcPassed: form.zipCrcPassed,
        relationshipsPassed: form.relationshipsPassed,
        mediaInventoryNote: form.mediaInventoryNote,
        evidenceReference: form.evidenceReference,
      })
      setForm(emptyForm)
      setMessage(current => current.startsWith('Saved as a timer declaration') ? current + ' Recovery point recorded; this entry is not counted as timer evidence.' : 'Recovery point added to the immutable inventory. Eligibility is calculated from the recorded fields; it remains operator-supplied evidence.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record recovery point. Confirm you are signed in and the evidence is valid.')
    } finally { setBusy(false) }
  }

  const freshness = data?.summary.freshness
  return <section className="glass-card research-card" id="backup-recovery-inventory" data-testid="backup-recovery-inventory">
    <div className="panel-title"><span>STEP 13 · BACKUP FRESHNESS & RETENTION</span><span className="status-chip">{freshness === 'fresh' ? 'WITHIN 24H TARGET' : freshness === 'stale' ? 'STALE RECOVERY POINT' : 'NO ELIGIBLE POINT'}</span></div>
    <p>Track real private archive captures, independently retrieved SHA-256 checksums, archive integrity, relationships and media inventory. Only verified Live captures count toward production freshness and 30-day retention; Testing and isolated-lab captures remain visible but cannot satisfy the production gate. Entries are immutable. This inventory does not trigger exports, copy files, schedule backups or delete older recovery points; the managed capture scheduler remains separate.</p>
    {data === undefined ? <p>Loading private recovery inventory…</p> : <>
      <div className="stats-strip compact">
        <div><strong>{data.summary.eligiblePoints}</strong><span>Eligible recorded points</span></div>
        <div><strong>{data.summary.retainedDaysLast30}/30</strong><span>Distinct eligible capture days in last 30 days</span></div>
        <div><strong>{data.summary.missingDaysLast30}</strong><span>Days short of retention target</span></div>
        <div><strong>{data.summary.eligibleTimerTriggeredPoints}</strong><span>Eligible timer declarations with reference (unverified)</span></div>
      </div>
      <p><strong>Latest eligible capture:</strong> {stamp(data.summary.latestEligibleAt)}. <strong>Latest eligible timer declaration with reference (unverified):</strong> {stamp(data.summary.latestTimerTriggeredAt)}. <strong>Oldest eligible capture in inventory:</strong> {stamp(data.summary.oldestEligibleAt)}.</p>
      {freshness !== 'fresh' && <p className="warning">{freshness === 'missing' ? 'No eligible recovery point is recorded. The backup gate remains open.' : 'The latest eligible recovery point is older than 24 hours. The freshness target is not met.'} This status is calculated from saved entries, not a live probe of the archive store.</p>}
      <div className="glass-card research-card" data-testid="scheduled-backup-monitor">
        <div className="panel-title"><span>SCHEDULED FRESHNESS MONITOR</span><span className="status-chip">{monitor?.status ? monitor.status.toUpperCase() : 'AWAITING FIRST RUN'}</span></div>
        <p>The Convex scheduler checks eligible Live recovery points hourly at minute 15 UTC, stores the latest status, and retains status-transition events. Testing and isolated-lab archives are excluded. It does not create, copy, or restore backup archives. The first status appears after the scheduled check runs; a healthy monitor is not proof that a new archive was captured.</p>
        {monitor && <p><strong>Last check:</strong> {stamp(monitor.checkedAt)} · <strong>Last eligible capture:</strong> {stamp(monitor.latestEligibleAt)} · <strong>Status transitions:</strong> {monitor.transitionCount}<br/>{monitor.detail}</p>}
        {monitorEvents && monitorEvents.length > 0 && <details><summary>Recent monitor transitions ({monitorEvents.length})</summary><ul>{monitorEvents.map(event => <li key={event._id}>{stamp(event.checkedAt)} · {event.fromStatus.toUpperCase()} → {event.toStatus.toUpperCase()} · {event.detail}</li>)}</ul></details>}
      </div>
    </>}
    <details>
      <summary>Record a completed capture and its verification evidence</summary>
      <div className="field-grid">
        <div><label htmlFor="backup-capture-key">UNIQUE CAPTURE KEY</label><input id="backup-capture-key" maxLength={100} value={form.captureKey} onChange={e=>patch('captureKey',e.target.value)} placeholder="live-2026-10-20T070000Z"/></div>
        <div><label htmlFor="backup-environment">SOURCE ENVIRONMENT</label><select id="backup-environment" value={form.sourceEnvironment} onChange={e=>patch('sourceEnvironment',e.target.value as Environment)}><option value="live">Live</option><option value="testing">Testing</option><option value="isolated-lab">Isolated lab</option></select></div>
        <div><label htmlFor="backup-captured-at">CAPTURE TIMESTAMP (YOUR LOCAL TIME)</label><input id="backup-captured-at" type="datetime-local" value={form.capturedAt} onChange={e=>patch('capturedAt',e.target.value)}/></div>
        <div><label htmlFor="backup-trigger-type">DECLARED CAPTURE TRIGGER</label><select id="backup-trigger-type" value={form.triggerType} onChange={e=>patch('triggerType',e.target.value as typeof form.triggerType)}><option value="manual">Manual / operator requested</option><option value="timer-triggered">Timer-triggered</option><option value="unknown">Unknown / legacy evidence</option></select></div>
        <div><label htmlFor="backup-scheduler-receipt">SCHEDULER RUN RECEIPT REFERENCE</label><input id="backup-scheduler-receipt" maxLength={500} value={form.schedulerReceiptReference} onChange={e=>patch('schedulerReceiptReference',e.target.value)} placeholder="Private task run ID / completed receipt location"/><small>This reference changes the declaration metric only; it is not authenticated. Verify the actual managed-task run history before accepting scheduled-capture evidence.</small></div>
        <div><label htmlFor="backup-bytes">ARCHIVE BYTES</label><input id="backup-bytes" type="number" min="1" step="1" value={form.bytes} onChange={e=>patch('bytes',e.target.value)}/></div>
        <div><label htmlFor="backup-tables">DATA TABLES</label><input id="backup-tables" type="number" min="1" step="1" value={form.dataTables} onChange={e=>patch('dataTables',e.target.value)}/></div>
        <div><label htmlFor="backup-documents">DATA DOCUMENTS</label><input id="backup-documents" type="number" min="0" step="1" value={form.dataDocuments} onChange={e=>patch('dataDocuments',e.target.value)}/></div>
        <div><label htmlFor="backup-archive-ref">PRIVATE ARCHIVE REFERENCE</label><input id="backup-archive-ref" maxLength={500} value={form.archiveReference} onChange={e=>patch('archiveReference',e.target.value)} placeholder="Private file name or protected storage reference"/></div>
        <div><label htmlFor="backup-evidence-ref">VERIFICATION REPORT REFERENCE</label><input id="backup-evidence-ref" maxLength={500} value={form.evidenceReference} onChange={e=>patch('evidenceReference',e.target.value)} placeholder="Private report / evidence receipt"/></div>
        <div><label htmlFor="backup-source-sha">SOURCE SHA-256</label><input id="backup-source-sha" value={form.sourceSha256} onChange={e=>patch('sourceSha256',e.target.value)} maxLength={64} spellCheck={false}/></div>
        <div><label htmlFor="backup-stored-sha">INDEPENDENTLY RETRIEVED SHA-256</label><input id="backup-stored-sha" value={form.storedSha256} onChange={e=>patch('storedSha256',e.target.value)} maxLength={64} spellCheck={false}/></div>
        <div><label htmlFor="backup-media-note">MEDIA INVENTORY RESULT</label><textarea id="backup-media-note" rows={2} maxLength={1000} value={form.mediaInventoryNote} onChange={e=>patch('mediaInventoryNote',e.target.value)} placeholder="What was inventoried, or explicitly note not checked"/></div>
      </div>
      <div className="release-gate-list">
        <label><input type="checkbox" checked={form.independentRetrieval} onChange={e=>patch('independentRetrieval',e.target.checked)}/> Independently retrieved saved copy and compared bytes</label>
        <label><input type="checkbox" checked={form.zipCrcPassed} onChange={e=>patch('zipCrcPassed',e.target.checked)}/> Every archive entry passed CRC/integrity verification</label>
        <label><input type="checkbox" checked={form.relationshipsPassed} onChange={e=>patch('relationshipsPassed',e.target.checked)}/> Table registry, document identity and required relationships passed</label>
      </div>
      <p>Only record completed operations. Eligibility requires matching valid SHA-256 digests, nonzero archive size/table count, independent retrieval, archive integrity, relationship checks and evidence references. The trigger type and receipt reference are operator-supplied metadata, not independently authenticated proof that a timer fired. The timer-declaration metric counts eligible records that include a receipt reference; it does not authenticate the reference. Accept scheduled-capture evidence only after independently checking the managed-task run history and verifying the associated archive.</p>
      {form.triggerType === 'timer-triggered' && !form.schedulerReceiptReference.trim() && <p className="warning" role="status">No scheduler receipt reference is attached. This entry may be recorded for audit context, but it will not count as timer evidence. Only add a receipt reference after checking the actual managed-task run history.</p>}
      <div className="hero-actions"><button type="button" className="primary-button" disabled={busy || !form.captureKey.trim() || !form.capturedAt || !form.archiveReference.trim() || !form.evidenceReference.trim() || !form.sourceSha256.trim() || !form.storedSha256.trim() || !form.mediaInventoryNote.trim() || !form.bytes || !form.dataTables || form.dataDocuments === ''} onClick={submit}>{busy ? 'Recording…' : 'Record immutable recovery point'}</button></div>
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    </details>
    <h3>Recorded recovery points</h3>
    {data === undefined ? null : data.points.length === 0 ? <p>No recovery points recorded. Add a completed capture only after its private copy and verification report are available.</p> : <div className="overflow-x-auto" role="region" aria-label="Recorded recovery points" tabIndex={0}><table className="w-full min-w-[48rem] text-left text-sm [&_th]:p-3 [&_td]:p-3 [&_td]:align-top"><thead><tr><th>Captured</th><th>Environment</th><th>Trigger / unverified receipt reference</th><th>Archive</th><th>Integrity</th><th>Size</th><th>Status</th></tr></thead><tbody>{data.points.map(point=><tr key={point._id}><td>{stamp(point.capturedAt)}</td><td>{point.sourceEnvironment}</td><td>{point.triggerType ?? 'legacy / unspecified'}{point.schedulerReceiptReference ? <p><small>Unverified receipt reference: {point.schedulerReceiptReference}</small></p> : point.triggerType === 'timer-triggered' ? <p><small>Receipt missing; not counted as timer evidence</small></p> : null}</td><td><strong>{point.captureKey}</strong><p>{point.archiveReference}</p><small>{point.dataTables} tables · {point.dataDocuments} documents</small></td><td><small>SHA match: {point.sourceSha256.toLowerCase()===point.storedSha256.toLowerCase()?'yes':'no'}<br/>Retrieved: {point.independentRetrieval?'yes':'no'}<br/>CRC: {point.zipCrcPassed?'pass':'not passed'}<br/>Relationships: {point.relationshipsPassed?'pass':'not passed'}</small></td><td>{point.bytes.toLocaleString()} bytes</td><td><strong>{point.eligible?'ELIGIBLE':'INCOMPLETE'}</strong><p>{point.evidenceReference}</p><small>{point.mediaInventoryNote}</small></td></tr>)}</tbody></table></div>}
  </section>
}
