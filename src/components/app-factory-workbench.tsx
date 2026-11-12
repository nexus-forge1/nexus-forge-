import { useMemo, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { buildDatabasePlan, createBrowserQaPlan, validateIntegrationContract, type SchemaFieldType } from '../lib/app-factory-contracts'
import { downloadJson, message as errorMessage, ProjectPicker, useStudioProject } from './studio-shared'

type Mode = 'database' | 'browser' | 'integration'
const pages = [
  { mode: 'database' as const, path: '/database-studio', title: 'Database & Migration Studio', note: 'Additive schema and migration plans' },
  { mode: 'browser' as const, path: '/browser-qa', title: 'Real Browser QA & Repair', note: 'Evidence-gated browser acceptance plans' },
  { mode: 'integration' as const, path: '/integration-contracts', title: 'Integration Contract Builder', note: 'Auth, scope, timeout and retry contracts' },
]
export function AppFactoryWorkbench({ mode }: { mode: Mode }) {
  const [tableName, setTableName] = useState('projectNotes')
  const [fields, setFields] = useState('title:string, body:string?, updatedAt:timestamp')
  const [ownerScoped, setOwnerScoped] = useState(true)
  const [appName, setAppName] = useState('NEXUS FORGE target app')
  const [route, setRoute] = useState('/features/private-tasks')
  const [featureKey, setFeatureKey] = useState('private-tasks')
  const [contractName, setContractName] = useState('Task service')
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('POST')
  const [path, setPath] = useState('/api/tasks')
  const [auth, setAuth] = useState<'none' | 'bearer' | 'oauth2' | 'signed-webhook'>('bearer')
  const [scope, setScope] = useState('tasks:write')
  const [timeoutMs, setTimeoutMs] = useState(5000)
  const [retries, setRetries] = useState(1)
  const [idempotencyKey, setIdempotencyKey] = useState(true)
  const [secretReference, setSecretReference] = useState('integrations/task-api-token')
  const [sandboxEndpoint, setSandboxEndpoint] = useState('https://sandbox.example.test')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [draftTitle, setDraftTitle] = useState(mode === 'database' ? 'Project notes migration' : mode === 'browser' ? 'Private tasks browser acceptance' : 'Task API contract')
  const [draftKey, setDraftKey] = useState(mode === 'database' ? 'database-project-notes' : mode === 'browser' ? 'browser-private-tasks' : 'integration-task-api')
  const [selectedFeatureId, setSelectedFeatureId] = useState('')
  const [historyKey, setHistoryKey] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [executionReference, setExecutionReference] = useState('change:ticket-123')
  const [executionCommit, setExecutionCommit] = useState('')
  const [executionSummary, setExecutionSummary] = useState('')
  const [executionEvidence, setExecutionEvidence] = useState('')
  const [qaDraftId, setQaDraftId] = useState('')
  const [qaTargetUrl, setQaTargetUrl] = useState('https://example.test')
  const [qaRunner, setQaRunner] = useState('agent-browser')
  const [qaRunReference, setQaRunReference] = useState('')
  const [qaCiRunUrl, setQaCiRunUrl] = useState('')
  const [targetQaRunUrl, setTargetQaRunUrl] = useState('')
  const [qaCommitSha, setQaCommitSha] = useState('local-uncommitted')
  const [qaCasesJson, setQaCasesJson] = useState('[{\"key\":\"route-load\",\"status\":\"passed\",\"evidenceReference\":\"evidence:route-load-001\",\"note\":\"Main route loaded and stable root appeared.\"},{\"key\":\"responsive-375\",\"status\":\"not-run\",\"evidenceReference\":\"\",\"note\":\"Not yet executed.\"}]')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const studio = useStudioProject()
  const projectId = studio.projectId
  const savedRows = useQuery(api.appFactoryDrafts.list, projectId ? { projectId } : 'skip')
  const historyRows = useQuery(api.appFactoryDrafts.history, projectId && historyKey ? { projectId, draftKey: historyKey } : 'skip')
  const qaRuns = useQuery(api.appFactoryQaRuns.listByDraft, projectId && qaDraftId ? { projectId, draftId: qaDraftId as Id<'appFactoryDrafts'> } : 'skip')
  const qaCiReceipts = useQuery(api.appFactoryQaCi.listByDraft, projectId && qaDraftId ? { projectId, draftId: qaDraftId as Id<'appFactoryDrafts'> } : 'skip')
  const executionRuns = useQuery(api.appFactoryExecution.list, projectId ? { projectId } : 'skip')
  const features = useQuery(api.featureBuilder.list, projectId ? { projectId } : 'skip')
  const saveDraft = useMutation(api.appFactoryDrafts.save)
  const reviewDraft = useMutation(api.appFactoryDrafts.review)
  const recordQaRun = useMutation(api.appFactoryQaRuns.record)
  const importQaCiRun = useAction(api.appFactoryQaCi.importRun)
  const prepareExecution = useMutation(api.appFactoryExecution.prepare)
  const transitionExecution = useMutation(api.appFactoryExecution.transition)
  const latestDrafts = useMemo(() => {
    const latest = new Map<string, NonNullable<typeof savedRows>[number]>()
    for (const row of savedRows ?? []) { const prior = latest.get(row.draftKey); if (!prior || row.revision > prior.revision) latest.set(row.draftKey, row) }
    return [...latest.values()].sort((a,b) => b.createdAt - a.createdAt)
  }, [savedRows])
  const currentSaved = latestDrafts.find(row => row.draftKey === draftKey)
  const selectedFeature = features?.find(feature => feature.id === selectedFeatureId)
  const current = pages.find(p => p.mode === mode)!
  function generate() {
    setError(''); setMessage(''); setResult(null)
    try {
      if (mode === 'database') {
        const parsed = fields.split(',').map(raw => raw.trim()).filter(Boolean).map(raw => {
          const match = /^([a-zA-Z][a-zA-Z0-9]*):\s*(string|number|boolean|timestamp)(\?)?$/.exec(raw)
          if (!match) throw new Error('Use comma-separated fields like title:string, count:number, note:string?.')
          return { name: match[1], type: match[2] as SchemaFieldType, optional: Boolean(match[3]) }
        })
        setResult(buildDatabasePlan({ tableName, fields: parsed, ownerScoped }) as unknown as Record<string, unknown>)
      } else if (mode === 'browser') {
        setResult(createBrowserQaPlan({ appName, route, featureKey }) as unknown as Record<string, unknown>)
      } else {
        setResult(validateIntegrationContract({ name: contractName, method, path, auth, scope, timeoutMs, retries, idempotencyKey, secretReference, sandboxEndpoint }) as unknown as Record<string, unknown>)
      }
      setMessage('Draft generated. Review every assumption and attach real Testing evidence before treating it as accepted.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The draft could not be generated.')
    }
  }
  return <section className="dashboard-section" data-testid={'app-factory-' + mode} data-state={error ? 'error' : result ? 'draft-ready' : 'draft'}>
    <div className="glass-card research-card">
      <p className="section-kicker">APP FACTORY · SHARED INTEGRATION FOUNDATION</p>
      <h2>{current.title}</h2>
      <p>{current.note}. This workbench produces deterministic, reviewable draft artifacts. It does not connect to an arbitrary customer database, run a browser against a target, test a live provider, apply migrations or deploy code.</p>
      <div className="hero-actions">{pages.map(page => <Link key={page.path} className={page.mode === mode ? 'primary-button' : 'secondary-button'} to={page.path}>{page.title} →</Link>)}<Link className="ghost-button" to="/feature-builder">Feature source pack →</Link><Link className="ghost-button" to="/visual-builder">Visual source sync →</Link></div>
      <ProjectPicker studio={studio} />
      {projectId && <label>Link exact Feature Builder source revision (optional)<select value={selectedFeatureId} onChange={e => setSelectedFeatureId(e.target.value)}><option value="">No source revision linked</option>{(features ?? []).map(feature => <option key={feature.id} value={feature.id}>{feature.title} · v{feature.revision} · {feature.packageDigest.slice(0,12)}</option>)}</select></label>}
      <p>Saved drafts are private to this project. Linked source digests are checked at save time; they do not prove target-app installation.</p>
    </div>
    {mode === 'database' && <div className="glass-card research-card">
      <h3>1. Design an additive Convex table</h3>
      <label>New table name<input value={tableName} maxLength={48} onChange={e => setTableName(e.target.value)} /></label>
      <label>Fields<input value={fields} onChange={e => setFields(e.target.value)} aria-describedby="db-field-help" /></label>
      <p id="db-field-help">Comma-separated fields: title:string, count:number, completed:boolean, lastSeen:timestamp?. Supported types are string, number, boolean and timestamp. Additive only; existing tables are never replaced.</p>
      <label><input type="checkbox" checked={ownerScoped} onChange={e => setOwnerScoped(e.target.checked)} /> Scope records to their owner and add an owner index</label>
      <p>Generated output includes a schema addition, rollout checklist, Testing-first gates and an explicit no-destructive-migration boundary.</p>
    </div>}
    {mode === 'integration' && <div className="glass-card research-card">
      <h3>1. Define an integration contract</h3>
      <label>Contract name<input value={contractName} maxLength={100} onChange={e => setContractName(e.target.value)} /></label>
      <label>HTTP method<select value={method} onChange={e => setMethod(e.target.value as typeof method)}>{['GET','POST','PUT','PATCH','DELETE'].map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Relative API path<input value={path} maxLength={240} onChange={e => setPath(e.target.value)} /></label>
      <label>Authentication<select value={auth} onChange={e => setAuth(e.target.value as typeof auth)}>{[['none','Public read-only'],['bearer','Bearer token'],['oauth2','OAuth 2.0'],['signed-webhook','Signed webhook']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Least-privilege scope<input value={scope} maxLength={240} onChange={e => setScope(e.target.value)} /></label>
      <label>Timeout (ms)<input type="number" min={100} max={30000} value={timeoutMs} onChange={e => setTimeoutMs(Number(e.target.value))} /></label>
      <label>Retries (0–3)<input type="number" min={0} max={3} value={retries} onChange={e => setRetries(Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={idempotencyKey} onChange={e => setIdempotencyKey(e.target.checked)} /> Use an idempotency key for retried writes</label>
      <label>Managed secret reference (identifier only)<input value={secretReference} maxLength={240} onChange={e => setSecretReference(e.target.value)} placeholder="integrations/task-api-token" autoComplete="off" /></label>
      <label>Sandbox base endpoint<input value={sandboxEndpoint} maxLength={500} onChange={e => setSandboxEndpoint(e.target.value)} placeholder="https://sandbox.example.test" inputMode="url" /></label>
      <p>Never enter a credential value here. Authenticated contracts require a managed secret-reference identifier; public read-only contracts must leave it blank. The endpoint is syntax-checked only: no network call, DNS resolution, secret lookup, sandbox execution or revocation test is performed by this form.</p>
    </div>}
    {mode === 'browser' && <div className="glass-card research-card">
      <h3>1. Define browser acceptance scope</h3>
      <label>Target app label<input value={appName} maxLength={100} onChange={e => setAppName(e.target.value)} /></label>
      <label>App-relative route<input value={route} maxLength={240} onChange={e => setRoute(e.target.value)} /></label>
      <label>Feature key<input value={featureKey} maxLength={32} onChange={e => setFeatureKey(e.target.value)} /></label>
      <p>Generates eight test-case definitions covering route/hydration, 375px and desktop layouts, auth isolation, persistence, validation, keyboard access and egress. All remain <strong>NOT RUN</strong> until a real target-app browser run supplies evidence.</p><p>The isolated Chromium CI runner currently executes assertion plans against an exact saved HTML snapshot (not this target URL). It retains per-case screenshots and SHA-256 digests, browser errors, source commit and report. See the repository documentation for its security boundary and manual dispatch steps.</p>
    </div>}
    <div className="glass-card research-card">
      <h3>{mode === 'database' ? '2. Generate migration plan' : mode === 'integration' ? '2. Validate contract policy' : '2. Generate browser test plan'}</h3>
      <button className="primary-button" type="button" onClick={generate}>Generate reviewable draft</button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {result && <div data-testid="app-factory-result" data-status="draft">
        <div className="decision-line"><span>ARTIFACT TYPE</span><strong>{String(result.kind)}</strong></div>
        <div className="decision-line"><span>STATUS</span><strong>DRAFT · NOT EXECUTED</strong></div>
        <p>Review this JSON and export it for code review. Generation is not a test pass, a migration application, a live integration, or a deployment.</p>
        <label>Artifact title<input value={draftTitle} maxLength={160} onChange={e => setDraftTitle(e.target.value)} /></label>
        <label>Stable draft key<input value={draftKey} maxLength={64} onChange={e => setDraftKey(e.target.value)} /><small>3–64 lowercase letters, numbers and hyphens. Reusing a key creates a new immutable revision.</small></label>
        <button className="primary-button" type="button" disabled={!projectId || savedRows === undefined} onClick={() => void (async () => { setError(''); setMessage(''); try { await saveDraft({ projectId: projectId!, draftKey, kind: String(result.kind) as 'database-migration-plan' | 'browser-qa-plan' | 'integration-contract', title: draftTitle, content: JSON.stringify(result), expectedRevision: currentSaved?.revision ?? 0, ...(selectedFeature ? { featureId: selectedFeature.id, sourceDigest: selectedFeature.packageDigest } : {}) }); setMessage('Saved immutable draft revision. Status remains draft until reviewed with evidence.') } catch (e) { setError(errorMessage(e)) } })()}>Save new revision</button>
        <button className="secondary-button" type="button" onClick={() => { downloadJson(String(result.kind) + '.json', result); setMessage('JSON draft exported.') }}>Export JSON draft</button>
      </div>}
    </div>
    <div className="glass-card research-card" data-testid="app-factory-history" data-state={savedRows === undefined ? 'loading' : 'ready'}>
      <h3>Saved draft history</h3>
      {!projectId ? <p>Select or create a project to save private drafts.</p> : savedRows === undefined ? <p role="status">Loading saved revisions…</p> : latestDrafts.length === 0 ? <p>No saved drafts yet. Generate a draft above and save it to start a version history.</p> : <div className="decision-list">{latestDrafts.map(row => <div className="glass-card" key={row._id}>
        <div className="decision-line"><span>{row.kind}</span><strong>v{row.revision} · {row.status}</strong></div><p>{row.title}</p><p><small>Key: {row.draftKey} · SHA-256: {row.contentDigest.slice(0,16)}…{row.sourceDigest ? ' · source '+row.sourceDigest.slice(0,12)+'…' : ''}</small></p>
        <button className="secondary-button" type="button" onClick={() => { setHistoryKey(row.draftKey); setMessage('Loading revision content for '+row.draftKey+'.') }}>Open revision history</button>
        {mode === 'browser' && row.kind === 'browser-qa-plan' && <button className="secondary-button" type="button" onClick={() => { setQaDraftId(row._id); setMessage('Selected exact source plan v'+row.revision+' for QA evidence.') }}>Attach run evidence</button>}
        {historyKey === row.draftKey && <details open><summary>Immutable revision history {historyRows === undefined ? '· loading' : '· '+historyRows.length+' revisions'}</summary>{(historyRows ?? []).map(version => <div key={version._id} className="decision-line"><span>v{version.revision} · {version.status} · {version.contentDigest.slice(0,12)}…</span><button className="secondary-button" type="button" onClick={() => { try { setDraftKey(version.draftKey); setDraftTitle(version.title); setResult(JSON.parse(version.content) as Record<string, unknown>); setEvidenceReference(version.evidenceReference ?? ''); setReviewNote(version.reviewNote ?? ''); setMessage('Loaded historical revision '+version.revision+'. Saving it creates a new revision; history is not overwritten.'); setError('') } catch { setError('Historical draft JSON could not be loaded.') } }}>Load v{version.revision}</button></div>)}</details>}
        <label>Evidence reference<input value={currentSaved?._id === row._id ? evidenceReference : row.evidenceReference ?? ''} onChange={e => { setDraftKey(row.draftKey); setEvidenceReference(e.target.value) }} placeholder="Testing run, trace or evidence record ID" maxLength={500} /></label>
        <label>Review note<input value={currentSaved?._id === row._id ? reviewNote : row.reviewNote ?? ''} onChange={e => { setDraftKey(row.draftKey); setReviewNote(e.target.value) }} placeholder="Decision rationale" maxLength={1200} /></label>
        <div className="hero-actions">{(['in-review','accepted','blocked'] as const).map(status => <button key={status} className="secondary-button" type="button" onClick={() => void (async () => { setError(''); setMessage(''); try { await reviewDraft({ draftId: row._id, expectedRevision: row.revision, status, ...(evidenceReference.trim() ? { evidenceReference } : {}), ...(reviewNote.trim() ? { reviewNote } : {}) }); setMessage(status === 'accepted' ? 'Accepted with the supplied evidence reference. This records a review decision; it does not prove production readiness.' : 'Review status recorded as '+status+'.') } catch (e) { setError(errorMessage(e)) } })()}>{status === 'in-review' ? 'Request review' : status === 'accepted' ? 'Accept with evidence' : 'Block draft'}</button>)}</div>
      </div>)}</div>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    </div>
    <div className="glass-card research-card" data-testid="app-factory-execution-ledger">
      <h3>Controlled execution ledger</h3>
      <p>Prepare execution only from the latest accepted immutable draft revision. This ledger tracks operator-attested lifecycle and retained evidence; it does not itself run migrations, browsers, integrations or deployments.</p>
      <label>Change ticket / operator reference<input value={executionReference} maxLength={300} onChange={e => setExecutionReference(e.target.value)} placeholder="change:ticket-123" /></label>
      <label>Exact source Git commit SHA<input value={executionCommit} maxLength={40} onChange={e => setExecutionCommit(e.target.value)} placeholder="40-character commit SHA" autoComplete="off" /></label>
      <label>Execution summary<input value={executionSummary} maxLength={1200} onChange={e => setExecutionSummary(e.target.value)} placeholder="What was executed or why it is blocked" /></label>
      <label>Completion evidence reference<input value={executionEvidence} maxLength={500} onChange={e => setExecutionEvidence(e.target.value)} placeholder="evidence:run-123" /></label>
      {!projectId ? <p>Select a project to use the execution ledger.</p> : executionRuns === undefined ? <p>Loading execution history…</p> : executionRuns.length === 0 ? <p>No execution records yet. Accept a draft, then prepare its exact revision here.</p> : <div className="decision-list">{executionRuns.map(run => <div className="glass-card" key={run._id}>
        <div className="decision-line"><span>{run.kind} · {run.draftKey} v{run.draftRevision}</span><strong>{run.status.toUpperCase()}</strong></div>
        <p>Digest: {run.draftDigest.slice(0,16)}… · Reference: {run.operatorReference}</p><p>{run.summary}</p>
        {run.evidenceReference && <p>Evidence: {run.evidenceReference}</p>}
        <div className="hero-actions">
          {run.status === 'prepared' && <button className="secondary-button" type="button" onClick={() => void (async () => { try { await transitionExecution({ runId: run._id, expectedStatus: 'prepared', status: 'running', summary: executionSummary.trim() || 'Operator marked controlled work as started.' }); setMessage('Execution ledger moved to running. No external work is executed by this status change.'); setError('') } catch (e) { setError(errorMessage(e)) } })()}>Mark running</button>}
          {run.status === 'running' && <>
            <button className="secondary-button" type="button" onClick={() => void (async () => { try { await transitionExecution({ runId: run._id, expectedStatus: 'running', status: 'completed', summary: executionSummary.trim(), evidenceReference: executionEvidence.trim() || undefined }); setMessage('Execution lifecycle completed with retained evidence reference.'); setError('') } catch (e) { setError(errorMessage(e)) } })()}>Complete with evidence</button>
            <button className="secondary-button" type="button" onClick={() => void (async () => { try { await transitionExecution({ runId: run._id, expectedStatus: 'running', status: 'blocked', summary: executionSummary.trim() || 'Blocked pending review.' }); setMessage('Execution record marked blocked.'); setError('') } catch (e) { setError(errorMessage(e)) } })()}>Mark blocked</button>
            <button className="secondary-button" type="button" onClick={() => void (async () => { try { await transitionExecution({ runId: run._id, expectedStatus: 'running', status: 'failed', summary: executionSummary.trim() || 'Execution failed.' }); setMessage('Execution record marked failed.'); setError('') } catch (e) { setError(errorMessage(e)) } })()}>Mark failed</button>
          </>}
        </div>
      </div>)}</div>}
      <h4>Accepted drafts ready for controlled execution</h4>
      {!projectId || savedRows === undefined ? <p>Load project drafts to see accepted revisions.</p> : latestDrafts.filter(row => row.status === 'accepted').length === 0 ? <p>No latest accepted draft revisions are ready yet.</p> : latestDrafts.filter(row => row.status === 'accepted').map(row => <div className="decision-line" key={row._id}><span>{row.title} · {row.draftKey} v{row.revision} · {row.contentDigest.slice(0,12)}…</span><button className="secondary-button" type="button" onClick={() => void (async () => { try { await prepareExecution({ projectId: projectId!, draftId: row._id, expectedRevision: row.revision, expectedDigest: row.contentDigest, sourceCommit: executionCommit.trim(), operatorReference: executionReference }); setMessage('Prepared execution record for exact accepted revision. External execution has not started.'); setError('') } catch (e) { setError(errorMessage(e)) } })()}>Prepare execution</button></div>)}
      <p>Terminal states are retained. Completion requires an evidence reference, and every record remains linked to the accepted revision and digest that was prepared.</p>
    </div>
    {mode === 'browser' && <div className="glass-card research-card" data-testid="browser-qa-evidence">
      <h3>Record browser run evidence</h3>
      <p><a href="https://github.com/nexus-forge1/nexus-forge-/actions/workflows/nexus-forge-target-browser-qa.yml" target="_blank" rel="noreferrer">Run real target-app Chromium QA in GitHub Actions ↗</a>. The workflow checks a publicly reachable HTTPS target, captures screenshots and a trace, and retains a report bound to the chosen draft digest and supplied full source commit. It does not use credentials or access private applications; the target commit is operator-supplied and must be verified against the deployed app.</p>
      {!qaDraftId ? <p>Select “Attach run evidence” on a saved browser QA plan to bind a run to its exact revision.</p> : (() => { const source = savedRows?.find(row => row._id === qaDraftId); return !source ? <p>Selected plan is not in the current project’s latest list. Reload the draft list and select its latest revision.</p> : <>
        <p>Source: <strong>{source.draftKey} · v{source.revision}</strong> · digest {source.contentDigest.slice(0,16)}…</p>
        <div className="glass-card" data-testid="verified-snapshot-ci-import">
          <h4>Import verified GitHub snapshot CI</h4>
          <p>This verifies the completed NEXUS FORGE GitHub Actions run, report, source commit, snapshot digest and screenshot manifest. The runner recomputes the SHA-256 of the exact embedded draft JSON and checks its kind, key, revision, digest and acceptance-criteria list; this importer requires those fields to match the selected saved Browser QA revision. Review the separately authored selector/assertion steps carefully. It is <strong>saved-HTML snapshot evidence only</strong>; it does not prove the target URL was tested and cannot satisfy target-app Browser QA acceptance.</p>
          <label>GitHub Actions run URL<input value={qaCiRunUrl} onChange={e => setQaCiRunUrl(e.target.value)} maxLength={300} placeholder="https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456" /></label>
          <button className="secondary-button" type="button" disabled={!projectId || !qaCiRunUrl.trim() || qaCiReceipts === undefined} onClick={() => void (async () => { setError(''); setMessage(''); try { const imported = await importQaCiRun({ projectId: projectId!, draftId: source._id, expectedRevision: source.revision, expectedDigest: source.contentDigest, runUrl: qaCiRunUrl.trim() }); setMessage('GitHub report verified and retained. Snapshot ' + imported.snapshotSha.slice(0,12) + '…; ' + imported.screenshotCount + ' screenshot manifest entries; ' + (imported.allPassed ? 'CI passed' : 'CI failed') + '. This does not mark target-app QA accepted.') } catch (e) { setError(errorMessage(e)) } })()}>Verify and import CI report</button>
          <h5>Verified GitHub QA receipts</h5>
          {qaCiReceipts === undefined ? <p>Loading verified CI receipts…</p> : qaCiReceipts.length === 0 ? <p>No verified snapshot CI reports imported for this plan revision.</p> : qaCiReceipts.map(receipt => <div className="decision-line" key={receipt._id}><span>{new Date(receipt.verifiedAt).toLocaleString()} · commit {receipt.sourceCommit.slice(0,12)}… · {receipt.screenshotCount} screenshots</span><strong>{receipt.conclusion.toUpperCase()} · {receipt.pageErrorsCount} browser errors</strong><p><a href={receipt.runUrl} target="_blank" rel="noreferrer">Open verified GitHub run</a> · {receipt.workflowRunId.startsWith('target-app:') ? 'target origin ' + receipt.snapshotSha : 'snapshot SHA-256 ' + receipt.snapshotSha.slice(0,16) + '…'} · report SHA-256 {receipt.reportDigest.slice(0,16)}…</p></div>)}
        </div>
        <div className="glass-card" data-testid="verified-target-browser-import">
          <h4>Import verified real target-app Chromium run</h4>
          <p>After the GitHub workflow completes, paste its run URL here. The server independently checks the public workflow metadata and report check, validates the report digest, exact saved draft revision, routes, screenshots manifest, and consistent run conclusions, then records an immutable QA receipt. The source commit is still an operator-supplied target deployment SHA and must be verified against the deployed application. The workflow is not run by this form.</p>
          <label>Target-browser GitHub Actions run URL<input value={targetQaRunUrl} onChange={e => setTargetQaRunUrl(e.target.value)} maxLength={300} placeholder="https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456" /></label>
          <button className="primary-button" type="button" disabled={!projectId || !targetQaRunUrl.trim()} onClick={() => void (async () => { setError(''); setMessage(''); try { const imported = await importQaCiRun({ projectId: projectId!, draftId: source._id, expectedRevision: source.revision, expectedDigest: source.contentDigest, runUrl: targetQaRunUrl.trim(), targetApp: true }); setMessage('Verified target-browser report retained: ' + (imported.allPassed ? 'PASSED' : 'FAILED') + ', ' + imported.screenshotCount + ' routes, target ' + imported.snapshotSha + ', commit ' + imported.sourceCommit.slice(0,12) + '…. This receipt is linked to the exact saved draft revision.') } catch (e) { setError(errorMessage(e)) } })()}>Verify and import target-app run</button>
        </div>
        <label>Target URL<input value={qaTargetUrl} onChange={e => setQaTargetUrl(e.target.value)} maxLength={500} /></label>
        <label>Runner and version<input value={qaRunner} onChange={e => setQaRunner(e.target.value)} maxLength={120} /></label>
        <label>Run report URL or evidence reference<input value={qaRunReference} onChange={e => setQaRunReference(e.target.value)} maxLength={500} placeholder="https://... or evidence:run-id" /></label>
        <label>Exact source commit SHA<input value={qaCommitSha} onChange={e => setQaCommitSha(e.target.value)} maxLength={40} /></label>
        <label>Per-case results (JSON)<textarea rows={8} value={qaCasesJson} onChange={e => setQaCasesJson(e.target.value)} /></label>
        <p>Each passed or failed case needs its own evidence reference. Not-run cases remain incomplete. This stores operator-supplied runner evidence and checks source linkage and structure; it does not independently authenticate external reports or execute tests.</p>
        <button className="primary-button" type="button" onClick={() => void (async () => { setError(''); setMessage(''); try { const cases = JSON.parse(qaCasesJson); if (!Array.isArray(cases)) throw new Error('Test case results must be a JSON array.'); await recordQaRun({ projectId: projectId!, draftId: source._id, expectedRevision: source.revision, expectedDigest: source.contentDigest, targetUrl: qaTargetUrl, runner: qaRunner, runReference: qaRunReference, commitSha: qaCommitSha, cases }); setMessage('QA evidence receipt saved against '+source.draftKey+' v'+source.revision+'.') } catch (e) { setError(e instanceof Error ? e.message : errorMessage(e)) } })()} disabled={!projectId || !qaRuns || !qaRunReference.trim()}>Save evidence receipt</button>
        <h4>Recorded runs</h4>
        {qaRuns === undefined ? <p>Loading run history…</p> : qaRuns.length === 0 ? <p>No evidence receipts recorded for this plan revision.</p> : qaRuns.map(run => <div className="decision-line" key={run._id}><span>{new Date(run.createdAt).toLocaleString()} · v{run.draftRevision} · {run.commitSha}</span><strong>{run.outcome.toUpperCase()} · {run.cases.filter(c => c.status === 'passed').length}/{run.cases.length} passed</strong><p>{run.targetUrl} · {run.runner} · {run.runReference}</p>{run.runner.startsWith('github-actions-target-browser-qa-verified|') && <p><strong>GitHub-verified target run:</strong> {run.runner.split('|run=')[1]?.split('|sha256=')[0] ?? 'run reference unavailable'} · report SHA-256 {run.runner.split('|sha256=')[1]?.slice(0,16) ?? 'unavailable'}… · verified {new Date(run.createdAt).toLocaleString()}</p>}<p>Evidence ID: {run._id}</p></div>)}
      </> })()}
    </div>}
    <div className="glass-card research-card">
      <h3>Acceptance boundary</h3>
      <ul>
        <li>Schema changes are additive, reviewed and tested in the isolated Testing environment before any Live release.</li>
        <li>Integration contracts must prove authorization, least privilege, idempotency, timeout behavior and revocation with sanitized evidence.</li>
        <li>Browser QA plans are not browser execution receipts; passing requires real traces/screenshots, exact commit and protected security regressions.</li>
        <li>Generated source must be reviewed, installed into a target repository, and tested there before claiming target integration.</li>
      </ul>
    </div>
  </section>
}
