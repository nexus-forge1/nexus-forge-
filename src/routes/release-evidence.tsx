import { routeHead } from '../lib/route-metadata'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { WorkspaceLayout } from '../components/workspace-layout'
import { ReleaseEvidenceGrid } from '../components/release-evidence-grid'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/release-evidence')({
  head: () => routeHead('/release-evidence'),
  component: ReleaseEvidenceCenter,
})

type GateStatus = 'blocked' | 'in-review' | 'evidence-ready'
type Gate = {
  id: string
  title: string
  requirement: string
  acceptance: string
  owner: string
  status: GateStatus
  evidenceUrl: string
  note: string
  updatedAt: string
}

const initialGates: Gate[] = [
  { id: 'backup', title: 'Backup freshness & retention', requirement: 'Recurring backup evidence', acceptance: 'Show dated backup captures across the required retention window, with source and distinct saved-copy checksums.', owner: '', status: 'blocked', evidenceUrl: '', note: '', updatedAt: '' },
  { id: 'recovery', title: 'Full-service recovery', requirement: 'Restore and interruption evidence', acceptance: 'Document an authorized restore drill and supported full-service interruption/recovery results. Archive integrity alone is insufficient.', owner: '', status: 'blocked', evidenceUrl: '', note: '', updatedAt: '' },
  { id: 'invoices', title: 'Provider invoice reconciliation', requirement: 'Actual provider invoices', acceptance: 'Match real provider invoice records to usage/ledger entries, currency, billing period and amounts. Test fixtures do not count.', owner: '', status: 'blocked', evidenceUrl: '', note: '', updatedAt: '' },
  { id: 'workspace', title: 'Workspace tenant sign-in', requirement: 'Genuine tenant authentication', acceptance: 'Verify successful sign-in against the intended Workspace tenant and retain a redacted result. Configuration alone is not proof.', owner: '', status: 'blocked', evidenceUrl: '', note: '', updatedAt: '' },
]

const storageKey = 'nexus-forge-release-evidence-draft-v1'
const statusLabels: Record<GateStatus, string> = { blocked: 'BLOCKED', 'in-review': 'IN REVIEW', 'evidence-ready': 'EVIDENCE READY' }

export function ReleaseEvidenceCenter() {
  const [gates, setGates] = useState<Gate[]>(initialGates)
  const [hydrated, setHydrated] = useState(false)
  const [saved, setSaved] = useState(false)
  const { isAuthenticated } = useConvexAuth()
  const persistedGates = useQuery(api.releaseEvidence.list, isAuthenticated ? {} : 'skip')
  const auditHistory = useQuery(api.releaseEvidence.history, isAuthenticated ? {} : 'skip')
  const submitEvidence = useMutation(api.releaseEvidence.submit)
  const grantReviewer = useMutation(api.releaseEvidence.grantReviewer)
  const reviewEvidence = useMutation(api.releaseEvidence.review)
  const workspaceKey = useQuery(api.releaseEvidence.workspaceKey, isAuthenticated ? {} : 'skip')
  const [submitMessage, setSubmitMessage] = useState('')
  const [reviewerKey, setReviewerKey] = useState('')
  const [reviewWorkspaceKey, setReviewWorkspaceKey] = useState('')
  const [reviewQueueRequested, setReviewQueueRequested] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewMessage, setReviewMessage] = useState('')
  const reviewQueue = useQuery(api.releaseEvidence.reviewQueue, isAuthenticated && reviewQueueRequested && reviewWorkspaceKey.trim() ? { ownerKey: reviewWorkspaceKey.trim() } : 'skip')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Gate[]
        if (Array.isArray(parsed) && parsed.length === initialGates.length && initialGates.every(base => parsed.some(g => g.id === base.id))) {
          setGates(initialGates.map(base => ({ ...base, ...parsed.find(g => g.id === base.id) })))
        }
      }
    } catch { /* Ignore invalid local drafts; defaults remain blocked. */ }
    setHydrated(true)
  }, [])

  const readyCount = useMemo(() => gates.filter(g => g.status === 'evidence-ready' && g.evidenceUrl.trim() && g.owner.trim() && g.note.trim()).length, [gates])
  function update(id: string, patch: Partial<Gate>) {
    setGates(current => current.map(g => g.id === id ? { ...g, ...patch } : g))
    setSaved(false)
  }
  function saveDraft() {
    const now = new Date().toISOString()
    const next = gates.map(g => ({ ...g, updatedAt: now }))
    setGates(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
      setSaved(true)
    } catch { setSaved(false) }
  }
  function exportDraft() {
    const payload = { schema: 'nexus-forge-release-evidence-draft-v1', exportedAt: new Date().toISOString(), scope: 'operator-entered draft; not an authoritative release attestation', gates }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'nexus-forge-release-evidence-draft.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <WorkspaceLayout title="Release Evidence Center" eyebrow="OPERATIONS / RELEASE GOVERNANCE">
    <section className="workspace dark-section" data-testid="release-evidence-center">
      <div className="workspace-head">
        <div><div className="section-kicker">RELEASE CONTROL / EVIDENCE REGISTER</div><h2>Prove readiness. Keep the hold honest.</h2><p>Track the four remaining operational evidence gates in one place. CI and a healthy HTTP response do not replace recovery, billing, or identity-provider evidence.</p></div>
        <span className="rc-badge rc-fail" data-testid="release-decision">RELEASE HOLD · REVIEW REQUIRED</span>
      </div>

      <div className="stats-strip compact">
        <div><strong>{readyCount}/{gates.length}</strong><span>Gates with complete draft fields</span></div>
        <div><strong>{persistedGates?.filter(g => g.status === 'evidence-submitted').length ?? '—'}</strong><span>Submitted for review</span></div>
        <div><strong>{persistedGates?.filter(g => g.status !== 'approved').length ?? '—'}</strong><span>Not independently approved</span></div>
      </div>

      <div className="glass-card research-card" data-testid="release-safety-notice">
        <div className="panel-title"><span>IMPORTANT EVIDENCE BOUNDARY</span><span className="status-chip">DRAFT REGISTER</span></div>
        <p>Draft fields remain in this browser. Submitting a gate stores a durable record in the authenticated Convex ledger and adds an audit event. A saved reference is not proof that the linked evidence is genuine; an explicitly authorized independent reviewer must verify it. This page cannot merge, deploy, or activate payments.</p>
        <p><strong>Current release decision remains HOLD.</strong> No production action is triggered from this page.</p>
      </div>

      <div className="release-gate-list">
        {gates.map((gate, index) => <article className="glass-card research-card release-gate" key={gate.id} data-testid={'release-gate-' + gate.id}>
          <div className="panel-title"><span>GATE 0{index + 1} · {gate.requirement.toUpperCase()}</span><span className={'rc-badge ' + (gate.status === 'evidence-ready' ? 'rc-pass' : 'rc-fail')}>{statusLabels[gate.status]}</span></div>
          <h3>{gate.title}</h3>
          <p>{gate.acceptance}</p>
          <div className="field-grid">
            <div><label htmlFor={gate.id + '-owner'}>EVIDENCE OWNER</label><input id={gate.id + '-owner'} value={gate.owner} onChange={e => update(gate.id, { owner: e.target.value })} placeholder="Person responsible" /></div>
            <div><label htmlFor={gate.id + '-status'}>DRAFT STATUS</label><select id={gate.id + '-status'} value={gate.status} onChange={e => update(gate.id, { status: e.target.value as GateStatus })}><option value="blocked">Blocked</option><option value="in-review">In review</option><option value="evidence-ready">Evidence ready (operator assertion)</option></select></div>
          </div>
          <div className="field-grid">
            <div><label htmlFor={gate.id + '-url'}>EVIDENCE URL / INTERNAL REFERENCE</label><input id={gate.id + '-url'} type="text" maxLength={500} value={gate.evidenceUrl} onChange={e => update(gate.id, { evidenceUrl: e.target.value })} placeholder="https://… or controlled document reference" /></div>
            <div><label htmlFor={gate.id + '-note'}>REVIEW NOTES / ACCEPTANCE RESULT</label><textarea id={gate.id + '-note'} rows={3} value={gate.note} onChange={e => update(gate.id, { note: e.target.value })} placeholder="Record what was verified, by whom, and any remaining limitations." /></div>
          </div>
          {gate.updatedAt && <p className="muted-copy">Last browser draft save: {new Date(gate.updatedAt).toLocaleString()}</p>}
          <div className="hero-actions"><button className="secondary-button" type="button" disabled={!gate.owner.trim() || !gate.evidenceUrl.trim() || !gate.note.trim()} onClick={async () => { try { await submitEvidence({ gateKey: gate.id as 'backup' | 'recovery' | 'invoices' | 'workspace', evidenceReference: gate.evidenceUrl.trim(), summary: `Evidence owner: ${gate.owner.trim()}\nAcceptance result and limitations: ${gate.note.trim()}` }); setSubmitMessage(gate.title + ': submitted to the authenticated evidence ledger with its named evidence owner. Independent review is still required.'); } catch (error) { setSubmitMessage(error instanceof Error ? error.message : 'Submission failed. Sign in and try again.'); } }}>Submit to durable evidence ledger</button></div>
          {persistedGates?.find(item => item.gateKey === gate.id) && <p className="muted-copy">Server record: {persistedGates.find(item => item.gateKey === gate.id)?.status?.toUpperCase().replace('-', ' ')} · revision {persistedGates.find(item => item.gateKey === gate.id)?.revision}{persistedGates.find(item => item.gateKey === gate.id)?.reviewedAt ? ` · reviewed ${new Date(persistedGates.find(item => item.gateKey === gate.id)!.reviewedAt!).toLocaleString()}` : ' · independent review pending'}</p>}
        </article>)}
      </div>

      <div className="glass-card research-card" data-testid="release-review-workflow">
        <div className="panel-title"><span>INDEPENDENT REVIEW WORKFLOW</span><span className="status-chip">SELF-APPROVAL DISABLED</span></div>
        <p>Evidence is not approved when submitted. Grant a different authenticated operator access, then have that reviewer open this page with the workspace key and record a reasoned decision. The backend rejects self-approval and unauthorized review.</p>
        <div className="field-grid">
          <div><label htmlFor="release-workspace-key">YOUR WORKSPACE KEY · SHARE PRIVATELY WITH THE REVIEWER</label><input id="release-workspace-key" readOnly value={workspaceKey ?? 'Sign in to load your workspace key'} /></div>
          <div><label htmlFor="release-reviewer-key">AUTHORIZED REVIEWER OPERATOR ID</label><input id="release-reviewer-key" value={reviewerKey} onChange={e => setReviewerKey(e.target.value)} placeholder="ID of a different signed-in operator" maxLength={256} /></div>
        </div>
        <div className="hero-actions"><button className="secondary-button" type="button" disabled={!reviewerKey.trim()} onClick={async () => { try { await grantReviewer({ reviewerKey: reviewerKey.trim() }); setReviewMessage('Reviewer access granted. The reviewer must sign in with that operator identity.'); } catch (error) { setReviewMessage(error instanceof Error ? error.message : 'Could not grant reviewer access.'); } }}>Grant independent reviewer</button></div>
        <div className="field-grid">
          <div><label htmlFor="review-owner-key">WORKSPACE KEY TO REVIEW</label><input id="review-owner-key" value={reviewWorkspaceKey} onChange={e => { setReviewWorkspaceKey(e.target.value); setReviewQueueRequested(false); }} placeholder="Paste the owner's workspace key" maxLength={256} /></div>
          <div><label htmlFor="review-note">INDEPENDENT REVIEW NOTE</label><textarea id="review-note" rows={2} value={reviewNote} onChange={e => setReviewNote(e.target.value)} maxLength={2000} placeholder="What did you independently verify? Include limitations." /></div>
        </div>
        <div className="hero-actions"><button className="secondary-button" type="button" disabled={!reviewWorkspaceKey.trim()} onClick={() => setReviewQueueRequested(true)}>Load authorized review queue</button></div>
        {reviewQueueRequested && reviewQueue && reviewQueue.length === 0 && <p role="status">No reviewable records returned. Confirm the workspace key and that this signed-in operator has been granted reviewer access.</p>}
        {reviewQueueRequested && reviewQueue && reviewQueue.filter(item => item.status === 'evidence-submitted').map(item => <article className="glass-card research-card" key={item._id}>
          <div className="panel-title"><span>{item.gateKey.toUpperCase()} · REVISION {item.revision}</span><span className="status-chip">AWAITING REVIEW</span></div>
          <p><strong>Evidence reference:</strong> {item.evidenceReference}</p><p>{item.summary}</p>
          <div className="hero-actions"><button className="secondary-button" type="button" disabled={!reviewNote.trim()} onClick={async () => { try { await reviewEvidence({ gateId: item._id, decision: 'approved', note: reviewNote.trim() }); setReviewMessage('Evidence independently approved. Release remains on hold until all release conditions are met.'); setReviewNote(''); } catch (error) { setReviewMessage(error instanceof Error ? error.message : 'Approval failed.'); } }}>Approve with note</button><button className="ghost-button" type="button" disabled={!reviewNote.trim()} onClick={async () => { try { await reviewEvidence({ gateId: item._id, decision: 'rejected', note: reviewNote.trim() }); setReviewMessage('Evidence rejected with an audit note.'); setReviewNote(''); } catch (error) { setReviewMessage(error instanceof Error ? error.message : 'Rejection failed.'); } }}>Reject with note</button></div>
        </article>)}
        {reviewMessage && <p role="status">{reviewMessage}</p>}
      </div>

      <div className="glass-card research-card">
        <div className="panel-title"><span>REGISTER ACTIONS</span><span className="status-chip">{hydrated ? 'BROWSER DRAFT' : 'LOADING DRAFT'}</span></div>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={saveDraft} disabled={!hydrated}>Save draft in this browser</button>
          <button className="secondary-button" type="button" onClick={exportDraft} disabled={!hydrated}>Export JSON draft</button>
          <Link className="secondary-button" to="/readiness">Open Launch Readiness →</Link>
          <Link className="secondary-button" to="/resilience">Open Security & Resilience →</Link>
          <Link className="ghost-button" to="/roadmap">Back to roadmap →</Link>
        </div>
        {saved && <p role="status">Draft saved in this browser. This is not a verified release attestation.</p>}
        {submitMessage && <p role="status">{submitMessage}</p>}
        <p className="muted-copy">Durable audit events recorded for this operator: {auditHistory?.length ?? 'loading'}.</p>
        {!saved && hydrated && <p className="muted-copy">Save to retain these draft fields in this browser. Use Export JSON to hand the draft to a reviewer through your approved secure process.</p>}
      </div>
    </section>
    <ReleaseEvidenceGrid/>
  </WorkspaceLayout>
}
