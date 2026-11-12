import {operatorError} from '../lib/operator-error'
import { routeHead } from '../lib/route-metadata'
import { CouncilMemoryInspection } from "../components/council-memory-inspection"
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLoading } from '../components/workspace-loading'
import { WorkspaceLayout } from '../components/workspace-layout'
import { CouncilConsensusView } from '../components/council-consensus-view'
import { useActiveMission } from '../hooks/use-active-mission'

export const Route = createFileRoute('/council')({ head: () => routeHead("/council"), component: CouncilPage })

export function CouncilPage() {
  const { evidenceLoading, missionId, mission, agents, councilComplete, hasResearch } = useActiveMission()
  const orchestrate = useAction(api.forge.orchestrate)
  const remember = useMutation(api.memory.remember)
  const projects = useQuery(api.studio.projects)
  const missionProject = projects?.find(project => project.missionId === missionId)
  const sourceDocuments = useQuery(api.studio.documents, missionProject ? { projectId: missionProject._id } : 'skip')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  useEffect(() => setSelectedSources([]), [missionId])
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [error, setError] = useState('')
  const [memoryWarning, setMemoryWarning] = useState('')
  const [handoffWarning, setHandoffWarning] = useState('')
  const allowed = !!missionId && !!mission?.approved
  const completeAgentCount = agents.filter(run => run.status === 'complete').length
  const blockedAgentCount = agents.filter(run => run.status === 'failed' || run.status === 'blocked').length
  const consensusAccepted = agents.length > 0 && completeAgentCount === agents.length && blockedAgentCount === 0 && councilComplete
  const run = async () => {
    if (!missionId || !mission || !allowed) return
    setBusy(true); setReceipt(''); setError(''); setMemoryWarning(''); setHandoffWarning('')
    try {
      const result = await orchestrate({ missionId, mission: mission.mission, documentIds: selectedSources as import('../../convex/_generated/dataModel').Id<'studioDocuments'>[] })
      setReceipt(result.summary)
      if (!result.ok) setHandoffWarning('Council planning returned a partial result because one or more specialist agents were blocked. Review the agent run notes and evidence before continuing to downstream creation or delivery.')
      try {
        await remember({ missionId, category: 'lesson', key: 'latest-orchestration', value: result.summary, confidence: result.ok ? 0.9 : 0.5, source: 'NEXUS Council' })
      } catch (memoryError) {
        setMemoryWarning(`Council planning completed, but the learning memory could not be saved: ${operatorError(memoryError,'Review saved memory before trying another manual save')}. The orchestration receipt is still available above.`)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Council orchestration failed.') } finally { setBusy(false) }
  }
  if (evidenceLoading) return <WorkspaceLoading title="AI Council Workspace" />
  return <WorkspaceLayout title="AI Council Workspace" eyebrow="STAGE 02 / PLAN & ORCHESTRATE">
    <section className="workspace"><div className="glass-card research-card"><div className="panel-title"><span>EXECUTION GATE</span><span className={allowed ? 'live-pill' : 'status-chip'}>{allowed ? 'MISSION APPROVED' : 'LOCKED'}</span></div>
      {!missionId ? <><h3>Select a mission first</h3><p>The Council needs a persisted mission contract.</p><Link className="primary-button" to="/mission">Open Mission Console →</Link></> : !mission?.approved ? <><h3>Mission approval required</h3><p>Planning cannot start until the selected mission has an explicit human approval record.</p><Link className="primary-button" to="/mission">Review mission approval →</Link></> : <><h3>{mission.title}</h3><p>{mission.mission}</p><div className="decision-line"><span>OPTIONAL KNOWLEDGE CONTEXT</span><strong>{selectedSources.length}/4 selected</strong></div><p>Select only source documents relevant to this mission. Their text is treated as untrusted evidence, not instructions, and is included only in this Council run.</p>{missionProject && sourceDocuments?.length ? sourceDocuments.map(source => <label key={source._id} style={{display:'flex',gap:'.6rem',alignItems:'center',margin:'.5rem 0'}}><input type="checkbox" checked={selectedSources.includes(source._id)} disabled={busy||(!selectedSources.includes(source._id)&&selectedSources.length>=4)} onChange={event=>setSelectedSources(current=>event.target.checked?[...current,source._id]:current.filter(id=>id!==source._id))}/><span>{source.name}<small style={{display:'block'}}>SHA-256: {source.sha256.slice(0,16)}…</small></span></label>) : <p className="muted-copy">{projects===undefined||sourceDocuments===undefined?'Loading project sources…':'No saved Knowledge Hub sources found for this mission project. Save sources in Knowledge Hub to make them available here.'}</p>}<button className="primary-button" onClick={() => void run()} disabled={busy}>{busy ? 'Council is planning…' : 'Execute approved mission planning ↗'}</button></>}
    </div>
    {error && <p className="warning" role="alert">{error}</p>}{handoffWarning && <p className="warning" role="alert">{handoffWarning}</p>}{memoryWarning && <p className="warning" role="alert">{memoryWarning}</p>}{receipt && <div className="glass-card research-card" role="status"><strong>Orchestration receipt</strong><p>{receipt}</p></div>}
    <div className="glass-card research-card" id="council-consensus"><div className="panel-title"><span>CONSENSUS ACCEPTANCE</span><span className={consensusAccepted ? 'live-pill' : 'status-chip'}>{consensusAccepted ? 'CRITERIA MET' : 'REVIEW REQUIRED'}</span></div><p>Consensus is accepted only when every recorded specialist run is complete, no run is failed or blocked, and the current mission reports Council completion. Provider response or a generated summary alone is not consensus.</p><div className="decision-line"><span>COMPLETED RUNS</span><strong>{completeAgentCount}/{agents.length}</strong></div><div className="decision-line"><span>BLOCKED / FAILED</span><strong>{blockedAgentCount}</strong></div><div className="decision-line"><span>MISSION BINDING</span><strong>{missionId ? mission?.title ?? 'Loading saved mission' : 'No mission selected'}</strong></div>
      {agents.length === 0 ? <div className="empty-state"><h3>No Council run yet</h3><p>Approve the mission, then explicitly execute planning.</p></div> : agents.map(run => <div className="guard-item" key={run._id}><span>{run.status === 'complete' ? '✓' : run.status === 'running' ? '◌' : '!'}</span><div><strong>{run.agent} · {run.role}</strong><small>{run.note}</small><small>{run.progress}% complete</small></div><span className="status-chip">{run.status.toUpperCase()}</span></div>)}
      {consensusAccepted ? <p className="receipt">All current agent runs meet the recorded consensus criteria. Research and evidence is the next stage.</p> : agents.length > 0 && <p className="warning">Consensus acceptance is not satisfied. Review incomplete, failed, or blocked runs before moving to downstream creation.</p>}
    </div>
    {missionId && <CouncilMemoryInspection key={missionId} missionId={missionId} />}
    <div className="hero-actions"><Link className="secondary-button" to="/evidence">{hasResearch ? 'Review research & memory →' : 'Continue to research & memory →'}</Link></div></section>
    <CouncilConsensusView/>
  </WorkspaceLayout>
}
