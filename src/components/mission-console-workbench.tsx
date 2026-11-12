import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useMissionGuide } from '../lib/use-mission-guide'
import { ScopeAPanel, ScopeAResult, ScopeASubmit } from './scope-a-ui-kit'

export function MissionConsoleWorkbench() {
  const { missionId, mission } = useMissionGuide()
  const transition = useMutation(api.scopeAFunctions.transitionMissionConsole)
  const [operation, setOperation] = useState<'start'|'hold'|'resume'|'complete'|'cancel'>('start')
  const [reason, setReason] = useState('Operator reviewed the mission state and authorizes this transition.')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!missionId) return; setBusy(true); setError(''); setResult('')
    try { const out = await transition({ missionId, operation, reason }); setResult(`Revision ${out.revision}: ${out.fromStatus} → ${out.toStatus}`) }
    catch (e) { setError(e instanceof Error ? e.message : 'Transition rejected') } finally { setBusy(false) } }
  return <ScopeAPanel title="Mission console workbench" eyebrow="A2 · LIFECYCLE CONTROL">
    <div className="decision-line"><span>Current state</span><strong>{mission?.status ?? 'No mission selected'}</strong></div>
    <form onSubmit={submit}><label className="scope-a-field">Requested transition<select value={operation} onChange={e => setOperation(e.target.value as typeof operation)}><option value="start">Start</option><option value="hold">Place on review hold</option><option value="resume">Resume</option><option value="complete">Complete</option><option value="cancel">Cancel</option></select></label><label className="scope-a-field">Reason (required)<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={8} required /></label><p className="muted-copy">Transitions are revisioned by the backend and may be rejected when prerequisites are not satisfied.</p><ScopeASubmit busy={busy} label="Confirm transition" /></form>
    <ScopeAResult value={result} error={error} />
  </ScopeAPanel>
}
