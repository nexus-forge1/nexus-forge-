import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { downloadArtifact } from '../lib/artifact-download'
import { ArtifactRevision } from '../components/artifact-revision'
import { ArtifactBrowserChecks } from '../components/artifact-browser-checks'
import { WorkspaceLoading } from '../components/workspace-loading'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useActiveMission } from '../hooks/use-active-mission'

export const Route = createFileRoute('/artifacts')({ head: () => routeHead("/artifacts"), component: ArtifactsPage })

export function ArtifactsPage() {
  const { evidenceLoading, missionId, mission, councilComplete, hasResearch, artifacts, research } = useActiveMission()
  const generate = useAction(api.artifacts.generate)
  const verify = useMutation(api.artifacts.verify)
  const approve = useMutation(api.artifacts.approve)
  const [name, setName] = useState('Mission Implementation')
  const [busyId, setBusyId] = useState('')
  const [receipt, setReceipt] = useState('')
  const [error, setError] = useState('')
  const allowed = !!missionId && !!mission?.approved && councilComplete && hasResearch
  const create = async () => {
    if (!missionId || !mission || !allowed) return
    setBusyId('generate'); setReceipt(''); setError('')
    try { const result = await generate({ missionId, mission: mission.mission, artifactType: 'web-app', artifactName: name.trim() || 'Mission Implementation' }); setReceipt(`Artifact draft created: ${result.artifactId}. Verify it, then separately approve it.`) }
    catch (e) { setError((e instanceof Error ? e.message : 'Artifact generation failed.') + ' Check saved drafts before requesting another generation.') } finally { setBusyId('') }
  }
  const download = async (id: string, content: string) => {
    setBusyId(id); setReceipt(''); setError('')
    try {
      const file = await downloadArtifact(id, content)
      setReceipt(`Download requested: ${file.filename} · ${file.bytes} UTF-8 bytes · SHA-256 ${file.sha256}. Browser acceptance is not a saved-file confirmation. Approval and delivery are unchanged.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Download could not be prepared.') } finally { setBusyId('') }
  }
  const verifyArtifact = async (id: any) => {
    setBusyId(String(id)); setReceipt(''); setError('')
    try { const result = await verify({ id }); setReceipt(`Verification ${result.passed ? 'passed' : 'failed'} with score ${Math.round(result.score * 100)}%. ${result.passed ? 'Human approval is now available.' : 'Revise or regenerate before approval.'}`) }
    catch (e) { setError(e instanceof Error ? e.message : 'Verification failed.') } finally { setBusyId('') }
  }
  const approveArtifact = async (id: any) => {
    setBusyId(String(id)); setReceipt(''); setError('')
    try { const result = await verify({ id }); if (!result.passed) { setError(`Approval blocked: current quality checks failed (${Math.round(result.score * 100)}%).`); return } await approve({ id, approved: true }); setReceipt('Human artifact approval recorded. Delivery preparation is now available.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Artifact approval failed.') } finally { setBusyId('') }
  }
  if (evidenceLoading) return <WorkspaceLoading title="Artifact Forge" />
  return <WorkspaceLayout title="Artifact Forge" eyebrow="STAGE 04 / GENERATE · VERIFY · APPROVE">
    <section className="workspace" data-testid="artifact-forge" data-state="ready"><div className="glass-card research-card"><div className="panel-title"><span>ARTIFACT GENERATION</span><span className={allowed ? 'live-pill' : 'status-chip'}>{allowed ? 'READY' : 'PREREQUISITES MISSING'}</span></div>
      <p>Create self-contained HTML apps or finished content pages. Generation can use up to two billed AI steps when a draft needs correction; each returned draft is saved separately. Server-side integrations require separate setup and verification.</p>
      {!missionId ? <><p>Select a mission first.</p><Link className="primary-button" to="/mission">Open Mission Console →</Link></> : !mission?.approved ? <><p>Mission approval must be recorded first.</p><Link className="primary-button" to="/mission">Review mission →</Link></> : !councilComplete ? <><p>Complete the AI Council before generating artifacts.</p><Link className="primary-button" to="/council">Review Council →</Link></> : !hasResearch ? <><p>Save mission-specific research before generating an artifact.</p><Link className="primary-button" to="/evidence">Gather evidence →</Link></> : <>
        <p><strong>Mission:</strong> {mission?.title} · {research.length} saved research record(s)</p><details><summary>Review research before building</summary>{research.map(row => <article key={row._id}><strong>{row.query}</strong><p>{row.result}</p></article>)}<Link className="secondary-button" to="/evidence">Review sources →</Link></details>
        <label htmlFor="artifact-name">ARTIFACT NAME</label><input id="artifact-name" value={name} onChange={e => setName(e.target.value)} />
        <p>New artifacts start as drafts. Verification and human approval are independent gates.</p>
        <button className="primary-button" disabled={!!busyId || !name.trim()} onClick={() => void create()}>{busyId === 'generate' ? 'Generating…' : 'Generate artifact draft ↗'}</button>
      </>}
    </div>
    {error && <p className="warning" role="alert">{error}</p>}{receipt && <p className="receipt break-words" role="status">{receipt}</p>}
    <div className="glass-card research-card"><div className="panel-title"><span>SAVED ARTIFACTS</span><span className="live-pill">{artifacts.length} TOTAL</span></div>
      {artifacts.length === 0 ? <div className="empty-state"><h3>No artifacts yet</h3><p>Complete the mission prerequisites to generate the first draft.</p></div> : artifacts.map((row: any) => <article className="glass-card research-card" key={row._id} data-artifact-id={row._id}><div className="panel-title"><strong>{row.name}</strong><span className="status-chip">{String(row.status).replaceAll('_', ' ').toUpperCase()}</span></div><p>{row.summary || row.description || 'Stored artifact draft with quality verification.'}</p>{row.qualityChecks?.length > 0 && <ul>{row.qualityChecks.map((check: string, i: number) => <li key={i}>{check}</li>)}</ul>}<details><summary>Inspect artifact content</summary><pre className="whitespace-pre-wrap break-words">{row.content}</pre></details>
        <div className="hero-actions">{['awaiting_approval', 'verification_failed', 'verified'].includes(row.status) && <button className="secondary-button" disabled={!!busyId} onClick={() => void verifyArtifact(row._id)}>{busyId === String(row._id) ? 'Checking…' : 'Run verification'}</button>}{['awaiting_approval', 'verified'].includes(row.status) && <button className="primary-button" disabled={!!busyId} onClick={() => void approveArtifact(row._id)}>{busyId === String(row._id) ? 'Checking…' : 'Verify again & approve'}</button>}{row.status === 'ready' && <span className="receipt">Approved for governed delivery.</span>}</div>
        <button className="secondary-button" data-testid="download-artifact" disabled={!!busyId} onClick={() => void download(row._id, row.content)}>Download saved HTML</button>
        <p>Downloads contain the exact saved source, including any artifact scripts. Review the source before opening it. Drafts and failed verification results can be downloaded for repair.</p>
        <ArtifactRevision artifact={row} />
        <ArtifactBrowserChecks key={row._id} artifact={row} missionContract={mission?.mission ?? ""} />
      </article>)}
    </div>
    <div className="hero-actions">{artifacts.some(row => row.status === 'ready') ? <Link className="primary-button" to="/delivery">Choose approved artifact for delivery →</Link> : <p>Verify and approve an artifact above to continue to delivery.</p>}</div></section>
  </WorkspaceLayout>
}
