export type ResearchRecord = { _id: string; query: string; result: string; citations: string[]; createdAt: number }
export function safeCitation(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    url.hash = ''
    return url.href
  } catch { return null }
}
export function buildResearchDossier(missionId: string, records: ResearchRecord[], now = Date.now()) {
  const sources = new Map<string, { url: string; domain: string; recordIds: string[] }>()
  let invalidCitations = 0, duplicateCitations = 0
  const uncitedRecordIds: string[] = [], staleRecordIds: string[] = [], invalidDateRecordIds: string[] = []
  for (const row of records) {
    let valid = 0
    if (!Number.isFinite(row.createdAt) || row.createdAt > now) invalidDateRecordIds.push(row._id)
    else if (now - row.createdAt > 30 * 86400000) staleRecordIds.push(row._id)
    for (const raw of row.citations) {
      const url = safeCitation(raw)
      if (!url) { invalidCitations++; continue }
      valid++
      const previous = sources.get(url)
      if (previous) {
        duplicateCitations++
        if (!previous.recordIds.includes(row._id)) previous.recordIds.push(row._id)
      } else sources.set(url, { url, domain: new URL(url).hostname.toLowerCase(), recordIds: [row._id] })
    }
    if (!valid) uncitedRecordIds.push(row._id)
  }
  return {
    version: 'research-dossier-v1', missionId, exportedAt: new Date(now).toISOString(),
    scope: 'Currently loaded mission research records only; this export is not a complete archive.',
    evidenceLimits: 'Citations are saved references. Domain diversity does not establish independence, accuracy or novelty. Age uses the saved research timestamp, not source publication or current reachability. No source was fetched for this report.',
    summary: { records: records.length, uniqueSources: sources.size, domains: new Set([...sources.values()].map(s => s.domain)).size, invalidCitations, duplicateCitations },
    uncitedRecordIds, staleRecordIds, invalidDateRecordIds,
    sources: [...sources.values()], records: records.map(row => ({ ...row, citations: [...row.citations] })),
  }
}
