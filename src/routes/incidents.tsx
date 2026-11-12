import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { WorkspaceLoading } from '../components/workspace-loading'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useActiveMission } from '../hooks/use-active-mission'

export const Route = createFileRoute('/incidents')({ head: () => routeHead("/incidents"), component: IncidentsPage })

export function IncidentsPage() {
  const { evidenceLoading, missionId, mission } = useActiveMission()
  const incidents = useQuery(api.incidents.list, missionId ? { missionId } : 'skip')
  const diagnose = useAction(api.incidents.diagnose)
  const reviewEscalated = useMutation(api.incidents.reviewEscalated)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<Record<string, string>>({})
  const [lesson, setLesson] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const runDiagnosis = async (incidentId: Id<'incidents'>) => {
    setBusyId(String(incidentId)); setNotice(''); setError('')
    try {
      await diagnose({ incidentId })
      setNotice('Diagnosis recorded. Review the proposed recovery before taking action.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Diagnosis failed.')
    } finally { setBusyId(null) }
  }

  const resolveEscalation = async (incidentId: Id<'incidents'>) => {
    setBusyId(String(incidentId)); setNotice(''); setError('')
    try {
      await reviewEscalated({ incidentId, recovery: recovery[incidentId] ?? '', lesson: lesson[incidentId] ?? '' })
      setNotice('Escalation resolved and recovery lesson recorded. The workflow was not resumed automatically.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Incident review failed.')
    } finally { setBusyId(null) }
  }

  if (evidenceLoading) return <WorkspaceLoading title="Incident Center" />
  return <WorkspaceLayout title="Incident Center" eyebrow="OPERATIONS / DIAGNOSIS & RECOVERY">
    <section className="workspace">
      <div className="glass-card research-card">
        <div className="panel-title"><span>MISSION INCIDENTS</span><span className="live-pill">{incidents?.length ?? 0} RECORDS</span></div>
        <p>Inspect execution failures, capture AI-assisted diagnosis, and document safe recovery. Escalations require a human decision; resolving an incident never silently resumes a run or authorizes external delivery.</p>
        {missionId ? <div className="decision-line"><span>ACTIVE MISSION</span><strong>{mission?.title ?? 'Loading mission…'}</strong></div> : <><h3>No active mission selected</h3><p>Select a mission to view its incident history.</p><Link className="primary-button" to="/mission">Open Mission Console →</Link></>}
      </div>
      {notice && <div className="glass-card research-card"><p className="receipt">{notice}</p></div>}
      {error && <div className="glass-card research-card"><p role="alert">{error}</p></div>}
      {missionId && (!incidents ? <div className="glass-card research-card"><p>Loading incident history…</p></div> : incidents.length === 0 ? <div className="glass-card research-card empty-state"><h3>No incidents recorded</h3><p>Failures and escalations for this mission will appear here when recorded by the runner.</p><Link className="secondary-button" to="/workflow">Review runner status →</Link></div> : incidents.map(item => <article className="glass-card research-card" key={item._id}>
        <div className="panel-title"><span>{item.kind.toUpperCase()} · {item.stage.toUpperCase()}</span><span className="status-chip">{item.status.toUpperCase()}</span></div>
        <h3>{item.message}</h3>
        <div className="stats-strip compact"><div><strong>{item.attempts}</strong><span>Attempts</span></div><div><strong>{new Date(item.createdAt).toLocaleString()}</strong><span>Recorded</span></div><div><strong>{item.diagnosisConfidence == null ? '—' : Math.round(item.diagnosisConfidence * 100) + '%'}</strong><span>Diagnosis confidence</span></div></div>
        {item.diagnosis && <div className="decision-line"><span>DIAGNOSIS</span><strong>{item.diagnosis}</strong></div>}
        {item.proposedRecovery && <div className="decision-line"><span>PROPOSED RECOVERY</span><strong>{item.proposedRecovery}</strong></div>}
        {item.recovery && <div className="decision-line"><span>RECORDED RECOVERY</span><strong>{item.recovery}</strong></div>}
        {item.lesson && <div className="decision-line"><span>LESSON CAPTURED</span><strong>{item.lesson}</strong></div>}
        {item.status !== 'resolved' && <div className="button-row">
          <button className="secondary-button" disabled={busyId === String(item._id)} onClick={() => void runDiagnosis(item._id)}>{busyId === String(item._id) ? 'Working…' : item.diagnosis ? 'Refresh diagnosis' : 'Diagnose with AI'}</button>
        </div>}
        {item.status === 'escalated' && <div className="field-grid">
          <div><label htmlFor={`recovery-${item._id}`}>DOCUMENTED RECOVERY (MIN. 12 CHARACTERS)</label><textarea id={`recovery-${item._id}`} value={recovery[item._id] ?? ''} onChange={event => setRecovery(current => ({ ...current, [item._id]: event.target.value }))} placeholder="Describe the safe recovery performed…" /></div>
          <div><label htmlFor={`lesson-${item._id}`}>LESSON FOR FUTURE RUNS (MIN. 12 CHARACTERS)</label><textarea id={`lesson-${item._id}`} value={lesson[item._id] ?? ''} onChange={event => setLesson(current => ({ ...current, [item._id]: event.target.value }))} placeholder="Record what should change next time…" /></div>
          <button className="primary-button small" disabled={busyId === String(item._id) || (recovery[item._id] ?? '').trim().length < 12 || (lesson[item._id] ?? '').trim().length < 12} onClick={() => void resolveEscalation(item._id)}>{busyId === String(item._id) ? 'Saving review…' : 'Resolve escalation & save lesson'}</button>
        </div>}
      </article>))}
      <div className="hero-actions"><Link className="secondary-button" to="/workflow">Open workflow & runner →</Link><Link className="secondary-button" to="/portfolio">Portfolio intelligence →</Link></div>
    </section>
  </WorkspaceLayout>
}
