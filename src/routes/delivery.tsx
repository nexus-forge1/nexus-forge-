import {DeliveryAttemptStatus} from '../components/delivery-attempt-status'
import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAction, useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import { WorkspaceLoading } from '../components/workspace-loading'
import { WorkspaceLayout } from '../components/workspace-layout'
import { useActiveMission } from '../hooks/use-active-mission'

export const Route = createFileRoute('/delivery')({ head: () => routeHead("/delivery"), component: DeliveryPage })

export function DeliveryPage() {
  const { evidenceLoading, missionId, mission, artifacts, deliveries, hasApprovedArtifact } = useActiveMission()
  const prepare = useMutation(api.delivery.prepare)
  const approve = useMutation(api.delivery.approve)
  const correctTarget = useMutation(api.delivery.correctTarget)
  const execute = useAction(api.delivery.executeApproved)
  const reviewFailedQaRun = useAction(api.delivery.reviewFailedQaRun)
  const [failedRunId, setFailedRunId] = useState('')
  const [artifactId, setArtifactId] = useState('')
  const approvedArtifacts = artifacts.filter(item => item.status === 'ready')
  const selectedArtifact = approvedArtifacts.find(item => item._id === artifactId)
  const [target, setTarget] = useState('nexus-forge1/no-dispatch')
  const [branch, setBranch] = useState('main')
  const [busy, setBusy] = useState('')
  const [receipt, setReceipt] = useState('')
  const [error, setError] = useState('')
  const allowed = !!missionId && !!mission?.approved && hasApprovedArtifact
  const createDelivery = async () => {
    const artifact = selectedArtifact
    if (!missionId || !artifact || !allowed) return
    setBusy('prepare'); setReceipt(''); setError('')
    try { await prepare({ missionId, artifactId: artifact._id, target: target.trim(), branch: branch.trim() }); setReceipt('Delivery request prepared. It now requires explicit delivery approval before any external dispatch.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Delivery preparation failed.') } finally { setBusy('') }
  }
  const approveDelivery = async (id: any) => {
    setBusy(String(id)); setReceipt(''); setError('')
    try { await approve({ id, approved: true }); setReceipt('Delivery approval recorded. Dispatch remains a separate explicit action.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Delivery approval failed.') } finally { setBusy('') }
  }
  const correctDeliveryTarget = async (id: any) => {
    setBusy(String(id)); setReceipt(''); setError('')
    try { await correctTarget({ id, target: target.trim(), branch: branch.trim(), reason: 'Operator corrected repository or branch after delivery preflight failure' }); setReceipt('Target updated. Previous approval was cleared; approve the corrected delivery again before dispatch.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Target correction failed.') } finally { setBusy('') }
  }
  const executeDelivery = async (id: any) => {
    setBusy(String(id)); setReceipt(''); setError('')
    try { const result = await execute({ id }); setReceipt(`GitHub Actions dispatch requested. Artifact path: ${result.artifactPath}. Workflow: ${result.workflowUrl}`) }
    catch (e) { setError(e instanceof Error ? e.message : 'GitHub Actions dispatch failed.') } finally { setBusy('') }
  }
  const reviewRetry = async (id: any) => {
    setBusy(String(id)); setReceipt(''); setError('')
    try { const result = await reviewFailedQaRun({id,runId:failedRunId.trim()}); if(result.ok)setReceipt(result.message);else setError(result.message) }
    catch(e){setError(e instanceof Error?e.message:'Failed QA run could not be verified.')}finally{setBusy('')}
  }
  if (evidenceLoading) return <WorkspaceLoading title="Delivery Pipeline" />
  return <WorkspaceLayout title="Delivery Pipeline" eyebrow="STAGE 05 / APPROVE · BUILD · VERIFY">
    <section className="workspace"><div className="glass-card research-card"><div className="panel-title"><span>DELIVERY PREFLIGHT</span><span className={allowed ? 'live-pill' : 'status-chip'}>{allowed ? 'READY TO PREPARE' : 'LOCKED'}</span></div>
      {!missionId ? <><p>Select a mission first.</p><Link className="primary-button" to="/mission">Open Mission Console →</Link></> : !mission?.approved ? <><p>Mission approval is required before delivery.</p><Link className="primary-button" to="/mission">Review mission →</Link></> : !hasApprovedArtifact ? <><p>Only a verified and human-approved artifact may enter delivery.</p><Link className="primary-button" to="/artifacts">Review artifacts →</Link></> : <>
        <label htmlFor="delivery-artifact">APPROVED ARTIFACT TO DELIVER</label><select id="delivery-artifact" value={selectedArtifact?._id ?? ''} onChange={e => setArtifactId(e.target.value)}><option value="">Choose the exact approved artifact…</option>{approvedArtifacts.map(item => <option key={item._id} value={item._id}>{item.name} · {item._id}</option>)}</select>{selectedArtifact && <p>Selected: <strong>{selectedArtifact.name}</strong> · Artifact ID: {selectedArtifact._id}</p>}
        <div className="field-grid"><div><label htmlFor="delivery-target">GITHUB REPOSITORY</label><input id="delivery-target" value={target} onChange={e => setTarget(e.target.value)} /></div><div><label htmlFor="delivery-branch">TARGET BRANCH</label><input id="delivery-branch" value={branch} onChange={e => setBranch(e.target.value)} /></div></div>
        <p>External dispatch does not happen during preparation. Review the target carefully and approve delivery separately.</p>
        <button className="primary-button" disabled={!!busy || !selectedArtifact || !target.trim() || !branch.trim() || deliveries.some(row => row.stage === 'approval' || row.stage === 'github')} onClick={() => void createDelivery()}>{busy === 'prepare' ? 'Preparing…' : 'Prepare delivery request ↗'}</button>
      </>}
    </div>
    {error && <p className="warning" role="alert">{error}</p>}{receipt && <div className="glass-card research-card" role="status"><strong>Delivery receipt</strong><p>{receipt}</p></div>}
    <div className="glass-card research-card"><div className="panel-title"><span>DELIVERY RECORDS</span><span className="live-pill">{deliveries.length} RECORDS</span></div>
      {deliveries.length === 0 ? <div className="empty-state"><h3>No delivery prepared</h3><p>Delivery appears here only after artifact verification and human approval.</p></div> : deliveries.map((row: any) => <article className="delivery-row" key={row._id}><div><strong>{row.target}</strong><small>{row.branch} · {String(row.stage).toUpperCase()} · {row.status}</small><p>Artifact: {artifacts.find(item => item._id === row.artifactId)?.name ?? row.artifactId ?? 'Historical artifact reference unavailable'}</p><p>{row.evidence}</p><DeliveryAttemptStatus id={row._id}/>{row.workflowRunUrl && <p><a href={row.workflowRunUrl} target="_blank" rel="noreferrer">Workflow run ↗</a> · {row.workflowConclusion ?? "conclusion pending"} · commit {row.workflowCommitSha?.slice(0, 12) ?? "pending"}</p>}{row.deploymentRunUrl && <p><a href={row.deploymentRunUrl} target="_blank" rel="noreferrer">Deployment run ↗</a>{row.deploymentUrl ? <> · <a href={row.deploymentUrl} target="_blank" rel="noreferrer">Live deployment ↗</a></> : null}</p>}{typeof row.readinessTotalCount === "number" && <p>Canonical readiness: {row.readinessStatus ?? "pending"} · {row.readinessPassedCount ?? 0}/{row.readinessTotalCount} checks · {row.readinessCheckedAt ? new Date(row.readinessCheckedAt).toLocaleString() : "not checked"}</p>}</div><div className="hero-actions">{row.stage === 'github' && row.status === 'GitHub Actions dispatched' && row.target === 'nexus-forge1/no-dispatch' && row.branch === 'qa-only' && !row.workflowRunUrl && <div><label htmlFor={'failed-run-'+row._id}>FAILED QA WORKFLOW RUN ID</label><input id={'failed-run-'+row._id} data-testid="failed-qa-run-id" inputMode="numeric" value={failedRunId} onChange={e=>setFailedRunId(e.target.value)}/><p>If GitHub finished with a failure but the callback did not arrive, verify its run ID before retrying this exact delivery.</p><button className="secondary-button" data-testid="review-qa-retry" disabled={!!busy||!failedRunId.trim()} onClick={()=>void reviewRetry(row._id)}>Verify failed run & allow retry</button></div>}{(row.stage === 'approval'||row.stage === 'blocked'&&!row.workflowRunUrl&&!row.deploymentRunUrl&&!row.evidence.includes('GitHub Actions workflow dispatched')) && <button className="secondary-button" disabled={!!busy} onClick={() => void approveDelivery(row._id)}>{busy === String(row._id) ? 'Approving…' : 'Approve delivery'}</button>}{row.stage === 'github' && row.status === 'Approved; ready to dispatch GitHub Actions' && <button className="primary-button" disabled={!!busy} onClick={() => void executeDelivery(row._id)}>{busy === String(row._id) ? 'Checking target…' : 'Execute GitHub Actions ↗'}</button>}{['approval', 'github', 'blocked'].includes(row.stage) && !row.evidence.includes('GitHub Actions workflow dispatched') && <><p className="warning">Before dispatch, you can correct the repository/branch. Changing the target clears any existing delivery approval and requires fresh approval.</p><button className="secondary-button" disabled={!!busy || !target.trim() || !branch.trim()} onClick={() => void correctDeliveryTarget(row._id)}>{busy === String(row._id) ? 'Updating target…' : 'Correct target & request fresh approval'}</button></>}{['test', 'build', 'deploy', 'verified', 'complete'].includes(row.stage) && <span className="status-chip">Evidence stage: {row.stage}</span>}</div></article>)}
    </div>
    <div className="glass-card research-card"><div className="panel-title"><span>GOVERNANCE REMINDER</span><span className="live-pill">HUMAN APPROVALS</span></div><p>Mission approval, artifact approval, delivery approval, external dispatch, deployment verification, and outcome recording are separate steps. A build passing is not proof that a production deployment or business outcome succeeded.</p><a className="secondary-button" href="https://github.com/nexus-forge1/nexus-forge-/actions" target="_blank" rel="noreferrer">Open GitHub Actions ↗</a></div>
    <div className="hero-actions"><Link className="secondary-button" to="/workflow">Review workflow & outcomes →</Link></div></section>
  </WorkspaceLayout>
}
