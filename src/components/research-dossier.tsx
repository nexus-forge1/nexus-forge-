import { useState } from 'react'
import { buildResearchDossier, type ResearchRecord } from '../lib/research-dossier'

export function ResearchDossier({ missionId, records }: { missionId: string; records: ResearchRecord[] }) {
  const [error, setError] = useState('')
  const dossier = buildResearchDossier(missionId, records)
  const download = () => {
    setError('')
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(buildResearchDossier(missionId, records), null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'nexus-research-dossier.json'
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('Could not download the dossier. Try again.') }
  }
  return <div className="glass-card research-card">
    <div className="panel-title"><span>RESEARCH DOSSIER</span><span className="status-chip">{dossier.summary.uniqueSources} UNIQUE SOURCES</span></div>
    <p>Review the evidence available for this mission before building. This inventory covers the {records.length} currently loaded records, not a complete research archive.</p>
    <p>{dossier.summary.domains} source domains · {dossier.summary.duplicateCitations} repeated references · {dossier.summary.invalidCitations} invalid or unsafe references</p>
    {dossier.uncitedRecordIds.length > 0 && <p className="warning">{dossier.uncitedRecordIds.length} records have no usable web citations.</p>}
    {dossier.staleRecordIds.length > 0 && <p className="warning">{dossier.staleRecordIds.length} records were saved more than 30 days ago. Review time-sensitive claims.</p>}
    {dossier.invalidDateRecordIds.length > 0 && <p className="warning">{dossier.invalidDateRecordIds.length} records have missing or inconsistent saved dates.</p>}
    <details><summary>Inspect source inventory</summary>{dossier.sources.length ? <ul>{dossier.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a> — cited by {source.recordIds.length} records</li>)}</ul> : <p>No usable web citations in the loaded records.</p>}</details>
    <p className="muted-copy">{dossier.evidenceLimits}</p>
    <button className="secondary-button" disabled={!records.length} onClick={download}>Download research dossier JSON</button>
    {error && <p role="alert">{error}</p>}
  </div>
}
