import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { useMissionGuide } from '../lib/use-mission-guide'
import { ScopeAPanel, ScopeAResult, ScopeASubmit } from './scope-a-ui-kit'

export function MissionGuidePanel() {
  const { missionId, mission } = useMissionGuide()
  const evaluate = useMutation(api.scopeAFunctions.evaluateMissionGuide)
  const [requestKey, setRequestKey] = useState(() => 'guide-' + Date.now().toString(36))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('')
  const [keys, setKeys] = useState('approval,active,evidence,verification,delivery,artifact,completion')
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!missionId) return
    setBusy(true); setError(''); setResult('')
    try { const checkpoints = keys.split(',').map(key => key.trim()).filter(Boolean).map(key => ({ key, required: true }))
      const out = await evaluate({ missionId, requestKey, checkpoints })
      setResult(`Evaluation ${out.status.toUpperCase()} · ${out.score}% · ${out.checkpoints.filter(x => x.passed).length}/${out.checkpoints.length} checkpoints passed`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Mission guide evaluation failed') } finally { setBusy(false) }
  }
  const progress = mission ? Math.max(0, Math.min(100, mission.completion ?? 0)) : 0
  return <ScopeAPanel title="Mission guide & checkpoints" eyebrow="A1 · MISSION GUIDE">
    {!missionId ? <p role="status">Select a mission before evaluating its checkpoints.</p> : <><div className="decision-line"><span>MISSION PROGRESS</span><strong>{progress}%</strong></div><progress max={100} value={progress} aria-label="Mission completion" />
    <form onSubmit={submit}><label className="scope-a-field">Checkpoint keys (comma-separated)<input value={keys} onChange={e => setKeys(e.target.value)} required /></label><label className="scope-a-field">Request key<input value={requestKey} onChange={e => setRequestKey(e.target.value)} required /></label><ScopeASubmit busy={busy} label="Evaluate checkpoints" /></form></>}
    <ScopeAResult value={result} error={error} />
  </ScopeAPanel>
}
