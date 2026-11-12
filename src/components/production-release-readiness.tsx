import { releaseAudit, recoveryChecks, releaseReady, type ReleaseStatus } from '../lib/production-readiness'

const statusLabel = (status: ReleaseStatus) =>
  status === 'verified' ? 'EVIDENCE RECORDED' : status === 'blocked' ? 'BLOCKED' : 'PARTIAL — OPEN ITEMS REMAIN'

export function ProductionReleaseReadiness() {
  const ready = releaseReady(releaseAudit.gates)
  const recorded = releaseAudit.gates.filter(gate => gate.status === 'verified').length
  return <section className="glass-card research-card" id="production-release" aria-label="Production release checklist">
    <div className="panel-title"><span>PRODUCTION RELEASE CHECKLIST</span><span className="status-chip">{ready ? 'EVIDENCE COMPLETE' : 'RELEASE HOLD'}</span></div>
    <p>{releaseAudit.scope}</p>
    <p><strong>{recorded}/{releaseAudit.gates.length} evidence gates recorded.</strong> {ready ? 'Review the recorded release evidence.' : 'The site is live, but full production readiness is not signed off. Blocked and partial gates below remain open.'}</p>
    <p className="muted-copy">Dated audit: {releaseAudit.date}. Baseline commit {releaseAudit.baselineCommit.slice(0, 12)}. This snapshot is not live telemetry, an uptime guarantee or an automatic release approval.</p>
    <div className="hero-actions"><a className="secondary-button" href="https://github.com/nexus-forge1/nexus-forge-/blob/main/docs/RELEASE_STATUS_2026_10_17.md" target="_blank" rel="noreferrer">Open release evidence and exit criteria ↗</a><a className="secondary-button" href="https://github.com/nexus-forge1/nexus-forge-/actions/workflows/production-release.yml" target="_blank" rel="noreferrer">Open monitoring runs and reports ↗</a></div>
    {releaseAudit.gates.map(gate => <details key={gate.id}><summary>{gate.title} · {statusLabel(gate.status)}</summary><p>{gate.evidence}</p><p><strong>Exit criterion:</strong> {gate.exit}</p><a href={gate.reference} target="_blank" rel="noreferrer">Inspect evidence or recovery procedure ↗</a></details>)}
    <div className="research-card">
      <h3>Recovery evidence by environment</h3>
      <p>Recorded observations as of {releaseAudit.date}. These checks do not update automatically or change the release decision above.</p>
      <div className="overflow-x-auto" role="region" aria-label="Recovery evidence table" tabIndex={0}>
      <table aria-label="Operational recovery evidence" className="w-full min-w-[36rem] text-left text-sm [&_th]:p-3 [&_td]:p-3 [&_td]:align-top [&_th]:align-top">
        <thead><tr><th scope="col">Check</th><th scope="col">Environment</th><th scope="col">Recorded result</th></tr></thead>
        <tbody>{recoveryChecks.map(check => <tr key={check.id}>
          <th scope="row">{check.title}</th><td>{check.scope}</td>
          <td><strong>{statusLabel(check.status)}</strong><p>{check.evidence}</p><a href={check.reference} target="_blank" rel="noreferrer">Inspect recorded scope ↗</a></td>
        </tr>)}</tbody>
      </table>
      </div>
      <p>Next: verify the next timer-triggered backup, assess retention and recovery targets, validate representative workloads and reconcile actual provider invoices. Customer payment activation is excluded from this work.</p>
    </div>
    <p>Retain accepted Research, Manifest and LocalBoost evidence. Authentication and approval setup are not repeated as a release checklist exercise. Deferred roadmap expansions are not launch prerequisites for this scoped release.</p>
  </section>
}
