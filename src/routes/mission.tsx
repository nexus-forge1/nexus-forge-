import {operatorError} from '../lib/operator-error'
import { validateMissionContract, validateMissionBudget } from '../../convex/missionContract'
import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link, useRouterState } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLoading } from '../components/workspace-loading'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useMissionGuide } from '../lib/use-mission-guide'

export const Route = createFileRoute('/mission')({ head: () => routeHead("/mission"), component: MissionPage })

export function MissionPage() {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const { evidenceLoading, missionId, setMissionId, mission: activeMission, sourceLinks, nextStage } = useMissionGuide()
  const missions = useQuery(api.missions.list, { ownerKey: 'local-workspace', paginationOpts: { numItems: 30, cursor: null } })
  const createMission = useMutation(api.missions.create)
  const approveMission = useMutation(api.missions.approve)
  const [sourceMemoryId, setSourceMemoryId] = useState<string | undefined>()
  const [title, setTitle] = useState('NEXUS Forge Mission')
  const [description, setDescription] = useState('Create a new AI venture that turns creative intent into measurable digital products.')
  const [autonomy, setAutonomy] = useState('Approval required')
  const [budget, setBudget] = useState(100)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const raw = window.sessionStorage.getItem('nexus-forge-intelligence-handoff') ?? window.sessionStorage.getItem('nexus-forge-manifest-handoff')
    if (!raw) return
    try {
      const handoff = JSON.parse(raw) as { sourceLabel?: string; sourceMemoryId?: string; intent?: string; domain?: string; budget?: number; horizon?: string; constraints?: string; acceptanceCriteria?: string; blueprint?: string }
      const handoffBudget = Number(handoff.budget ?? 25)
      validateMissionBudget(handoffBudget)
      setSourceMemoryId(handoff.sourceMemoryId)
      const intent = handoff.intent?.trim() || 'Review Manifest Intelligence proposal'
      const blueprint = handoff.blueprint?.trim() || ''
      setTitle(`${handoff.sourceLabel ?? 'Manifest'}: ${intent.slice(0, 56)}`)
      setDescription(`Desired outcome: ${intent}\nDomain: ${handoff.domain || 'General'}\nTime horizon: ${handoff.horizon || 'Not specified'}\nConstraints and assumptions: ${handoff.constraints || 'Not specified'}\nAcceptance criteria: ${handoff.acceptanceCriteria || 'Review and define measurable criteria'}\n\nBlueprint proposal — unverified, review before approval:\n${blueprint.slice(0, 7000)}`)
      setBudget(handoffBudget)
      setReceipt('Saved intelligence source loaded into a draft contract. Review the proposal and constraints before creating or approving the mission.')
      setError('')
    } catch {
      setError('Could not load the source proposal. Return to its intelligence page and try again.')
      window.sessionStorage.removeItem('nexus-forge-manifest-handoff')
      window.sessionStorage.removeItem('nexus-forge-intelligence-handoff')
    }
  }, [pathname])
  const rows = missions?.page ?? []
  const create = async () => {
    if (!title.trim() || !description.trim()) { setError('A title and mission outcome are required.'); return }
    try { validateMissionContract({ title, mission: description, autonomy, budget }) } catch (e) { setError(e instanceof Error ? e.message : 'Invalid mission contract.'); return }
    setBusy(true); setError(''); setReceipt('')
    try {
      const id = await createMission({ title: title.trim(), mission: description.trim(), autonomy, budget, ownerKey: 'local-workspace', ...(sourceMemoryId ? { sourceMemoryId: sourceMemoryId as any } : {}) })
      setMissionId(id)
      setSourceMemoryId(undefined)
      window.sessionStorage.removeItem('nexus-forge-manifest-handoff')
      window.sessionStorage.removeItem('nexus-forge-intelligence-handoff')
      setReceipt('Draft created and selected. The source handoff is now safely consumed. Review the mission contract, then explicitly approve it before Council execution.')
    } catch (e) { setError(operatorError(e,'Mission creation did not confirm. Review mission history before creating another draft.')) } finally { setBusy(false) }
  }
  const approve = async () => {
    if (!missionId) return
    setBusy(true); setError(''); setReceipt('')
    try { await approveMission({ id: missionId, approved: true }); setReceipt('Mission approval recorded. Council execution is a separate action on the AI Council page.') }
    catch (e) { setError(operatorError(e,'Mission approval did not confirm. Review the saved approval state.')) } finally { setBusy(false) }
  }
  const terminalMission = activeMission?.status === 'complete' || activeMission?.status === 'cancelled'
  if (evidenceLoading) return <WorkspaceLoading title="Mission Console" />
  return <WorkspaceLayout title="Mission Console" eyebrow="STAGE 01 / INTENT & AUTHORITY">
    <section className="workspace"><div className="console-grid">
      <div id="mission-contract" className="glass-card research-card"><div className="panel-title"><span>MISSION CONTRACT</span><span className="live-pill">HUMAN CONTROL</span></div>
        <p>Define one result you can inspect and measure. Your draft stays editable here until you create it; creating it selects the mission for the guided workflow.</p>
        <p id="mission-brief-help" className="muted-copy">Include: the intended audience, exact deliverable, constraints, and a measurable success check. Example: “Build a landing page for a local bakery with its menu and contact form. Use supplied content, keep spend under $25, and verify the page works on mobile.”</p>
        <label htmlFor="mission-title">MISSION TITLE</label><input id="mission-title" maxLength={160} value={title} onChange={e => setTitle(e.target.value)} />
        <label htmlFor="mission-description">DESIRED OUTCOME</label><textarea id="mission-description" aria-describedby="mission-brief-help" rows={5} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="field-grid"><div><label htmlFor="mission-autonomy">AUTHORITY LEVEL</label><select id="mission-autonomy" value={autonomy} onChange={e => setAutonomy(e.target.value)}><option>Draft only</option><option>Approval required</option><option>Narrow auto-execution</option></select></div><div><label htmlFor="mission-budget">SPEND CAP · USD</label><input id="mission-budget" type="number" min={0} max={500} value={budget} onChange={e => setBudget(Math.max(0, Math.min(500, Number(e.target.value))))} /></div></div>
        <button className="primary-button" disabled={busy} onClick={() => void create()}>{busy ? 'Creating…' : 'Create new draft mission ↗'}</button>
      </div>
      <div id="active-mission-contract" className="glass-card research-card"><div className="panel-title"><span>ACTIVE MISSION</span><span className="live-pill">{activeMission ? activeMission.status.toUpperCase() : 'NOT SELECTED'}</span></div>
        {activeMission ? <><h3>{activeMission.title}</h3><p>{activeMission.mission}</p>{sourceLinks.map(link => <p key={link.sourceMemoryId}>Draft source: <Link to={link.path}>{link.key} →</Link><small> · Saved receipt {link.sourceMemoryId}</small></p>)}<div className="decision-line"><span>AUTHORITY</span><strong>{activeMission.autonomy}</strong></div><div className="decision-line"><span>SPEND CAP</span><strong>${activeMission.budget}</strong></div><div className="decision-line"><span>MISSION APPROVAL</span><strong>{activeMission.approved ? 'APPROVED' : 'PENDING'}</strong></div>
          {!activeMission.approved && !terminalMission && activeMission.status !== 'review' && <button className="secondary-button" disabled={busy} onClick={() => void approve()}>Approve mission contract</button>}
          {terminalMission && <p role="status">This mission is {activeMission.status}. Create a new draft to begin new work.</p>}
          {activeMission.status === 'review' && <p role="status">Resolve this mission in Portfolio Intelligence before approval. <Link to="/portfolio">Open portfolio review →</Link></p>}
          {activeMission.approved && !terminalMission && activeMission.status !== 'review' && <p className="receipt">Approved. Follow the guided next step below to continue from saved progress.</p>}
        </> : <p>Create a draft mission to begin. Existing missions can be selected below.</p>}
      </div>
    </div>
    {error && <p className="warning" role="alert">{error}</p>}{receipt && <p className="receipt" role="status">{receipt}</p>}
    <div className="glass-card research-card" data-testid="mission-next-step"><div className="panel-title"><span>GUIDED NEXT STEP</span><span className="live-pill">{activeMission ? (terminalMission ? 'MISSION CLOSED' : activeMission.status === 'review' ? 'PORTFOLIO REVIEW REQUIRED' : activeMission.approved ? 'CONTINUE FROM SAVED PROGRESS' : 'REVIEW REQUIRED') : 'START HERE'}</span></div>{activeMission ? terminalMission ? <><h3>Mission closed</h3><p>Retain its recorded evidence. Define a new mission contract for new execution.</p>{activeMission.status === 'complete' ? <Link className="secondary-button" to="/learning">Review verified outcome →</Link> : <a className="secondary-button" href="#mission-contract">Define a new contract ↑</a>}</> : activeMission.status === 'review' ? <><h3>Resolve portfolio review</h3><p>Keep the mission on hold until its review decision is recorded.</p><Link className="primary-button" to="/portfolio">Open portfolio review →</Link></> : activeMission.approved ? <><h3>{nextStage?.title ?? 'Review your verified outcome'}</h3><p>{nextStage?.note ?? 'Mission checkpoints have recorded evidence. Continue to Learning Engine to compare results and capture lessons.'}</p><Link className="primary-button inline-flex" to={nextStage?.path ?? '/learning'}>Continue next mission action →</Link></> : <><p>Review the active mission title, desired outcome, authority and spend cap. Then use the existing approval control above; approval does not start execution.</p><a className="secondary-button inline-flex" href="#active-mission-contract">Review active mission contract ↑</a></> : <><p>Start by defining a clear outcome and budget. Creating a draft does not approve it or start execution.</p><a className="primary-button inline-flex" href="#mission-contract">Define mission contract ↓</a></>}</div>
    <div className="glass-card research-card"><div className="panel-title"><span>MISSION HISTORY</span><span className="live-pill">{rows.length} SHOWN</span></div>
      {rows.length === 0 ? <p>No saved missions yet.</p> : rows.map(row => <button key={row._id} className="portfolio-row" onClick={() => { setMissionId(row._id); setReceipt(`Selected ${row.title}. Confirm its approval state before continuing.`); setError('') }}><div className="portfolio-main"><strong>{row.title}</strong><p>{row.mission}</p></div><div className="portfolio-cell"><small>STATUS</small><b>{row.status.toUpperCase()}</b></div><div className="portfolio-cell"><small>APPROVAL</small><b>{row.approved ? 'APPROVED' : 'PENDING'}</b></div></button>)}
    </div>
    <div className="hero-actions"><Link className="secondary-button" to="/workflow">View full mission guide →</Link></div></section>
  </WorkspaceLayout>
}
