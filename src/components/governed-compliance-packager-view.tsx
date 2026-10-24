import { useState, type FormEvent } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../lib/scope-e-api'

const card = 'glass-card research-card'
type Evidence = { missionKey: string; verificationSeals: Array<{ dossierKey: string; payloadDigest: string; createdAt: number }>; auditReceipts: Array<{ receiptDigest: string; diffDigest: string; createdAt: number }>; auditLogs: Array<{ eventType: string; source: string; message: string; createdAt: number; metadata?: string }>; verifiedOutcomes: Array<{ passed: boolean; score: number; summary: string; createdAt: number }>; riskRegister: Array<{ incidentKey: string; severity: string; state: string; traceDigest: string }>; evidenceDigest: string }
type Bundle = { bundleJson: string; bundleDigest: string; fileName: string; evidenceDigest: string }

export function GovernedCompliancePackagerView() {
  const [missionKey, setMissionKey] = useState('')
  const [dossierKey, setDossierKey] = useState('compliance-dossier-001')
  const [provenance, setProvenance] = useState('{"source":"NEXUS FORGE","review":"operator-controlled","externalExecution":"not asserted"}')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const evidence = useQuery(api.scopeEFunctions.aggregateComplianceEvidence, missionKey.trim() ? { missionKey } : 'skip') as Evidence | undefined
  const seal = useMutation(api.scopeEFunctions.recordComplianceDossierSeal)
  const generate = useAction(api.scopeEFunctions.generateComplianceExportBundle)

  async function run(event: FormEvent<HTMLFormElement>, action: () => Promise<unknown>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try { setNotice(JSON.stringify(await action(), null, 2)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Compliance operation failed.') }
    finally { setBusy(false) }
  }
  function downloadBundle() {
    if (!bundle) return
    const url = URL.createObjectURL(new Blob([bundle.bundleJson], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = bundle.fileName; anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Bundle download initiated. SHA-256: ' + bundle.bundleDigest)
  }

  return <section className="workspace" aria-labelledby="e7-heading">
    <div className={card}><p className="panel-title">SCOPE E · E7 / AUDIT DOSSIER & SHA-256</p><h2 id="e7-heading">Governed compliance packager</h2><p>Aggregate mission-scoped evidence, seal a dossier digest and export a provenance-aware JSON bundle. A seal is an integrity record, not a legal certification.</p>
      <label>Mission key<input value={missionKey} onChange={event => setMissionKey(event.target.value)} required /></label>
      {!missionKey.trim() ? <p role="status">Enter an operator-owned mission key to aggregate evidence.</p> : evidence === undefined ? <p role="status">Loading compliance evidence…</p> : <div aria-live="polite"><h3>Evidence summary</h3><dl><dt>Verification seals</dt><dd>{evidence.verificationSeals.length}</dd><dt>Audit receipts</dt><dd>{evidence.auditReceipts.length}</dd><dt>Audit events</dt><dd>{evidence.auditLogs.length}</dd><dt>Verified outcomes</dt><dd>{evidence.verifiedOutcomes.length}</dd><dt>Risk register entries</dt><dd>{evidence.riskRegister.length}</dd></dl><p>Evidence SHA-256: <code>{evidence.evidenceDigest}</code></p><details><summary>Review evidence records</summary><pre>{JSON.stringify(evidence, null, 2)}</pre></details></div>}
    </div>
    <form className={card} onSubmit={event => void run(event, async () => {
      if (!evidence) throw new Error('Wait for evidence aggregation to complete.')
      const parsed: unknown = JSON.parse(provenance)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Provenance must be a JSON object.')
      const payload = { missionKey, dossierKey, evidenceDigest: evidence.evidenceDigest, evidence }
      return seal({ requestKey: 'e7-seal-' + dossierKey, missionKey, dossierKey, payloadJson: JSON.stringify(payload), evidenceCount: evidence.verificationSeals.length + evidence.auditReceipts.length + evidence.auditLogs.length + evidence.verifiedOutcomes.length, riskCount: evidence.riskRegister.length, provenanceJson: JSON.stringify(parsed) })
    })}><h3>SHA-256 digital dossier seal</h3><label>Dossier key<input value={dossierKey} onChange={event => setDossierKey(event.target.value)} required /></label><label>Provenance JSON<textarea value={provenance} onChange={event => setProvenance(event.target.value)} rows={4} required /></label><button className="primary-button" disabled={busy || !evidence}>{busy ? 'Sealing…' : 'Record SHA-256 dossier seal'}</button></form>
    <form className={card} onSubmit={event => void run(event, async () => {
      const parsed: unknown = JSON.parse(provenance)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Provenance must be a JSON object.')
      const result = await generate({ missionKey, dossierKey, manifest: JSON.stringify({ dossierKey, missionKey, evidenceDigest: evidence?.evidenceDigest ?? '', generatedBy: 'NEXUS FORGE operator' }), provenanceJson: JSON.stringify(parsed) })
      setBundle(result); return { fileName: result.fileName, bundleDigest: result.bundleDigest, evidenceDigest: result.evidenceDigest }
    })}><h3>Compliance export bundle</h3><p>Export requires an existing matching dossier seal. The generated bundle includes a limitation statement.</p><button className="secondary-button" disabled={busy || !missionKey.trim() || !dossierKey.trim()}>{busy ? 'Generating…' : 'Generate export bundle'}</button>
      {bundle && <div aria-live="polite"><p>Ready: <code>{bundle.fileName}</code></p><p>Bundle SHA-256: <code>{bundle.bundleDigest}</code></p><button type="button" className="primary-button" onClick={downloadBundle}>Download JSON bundle</button></div>}
      {error && <p role="alert">{error}</p>}{notice && <pre role="status" aria-live="polite">{notice}</pre>}
    </form>
  </section>
}
