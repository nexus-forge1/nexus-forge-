export const productionOrigin = 'https://www.network-x-ai.com'
export const probeP95LimitMs = 5000
export function inspectPublicShell(status: number, contentType: string, html: string) {
  if (status !== 200) return 'Expected HTTP 200'
  if (!contentType.toLowerCase().includes('text/html')) return 'Expected HTML content type'
  if (!/<title[^>]*>[^<]+<\/title>/i.test(html)) return 'Missing page title'
  if (!/NEXUS FORGE/i.test(html)) return 'Missing application identity'
  return null
}
export function summarizeProbe(rows: { ok: boolean; durationMs: number }[]) {
  const sorted = rows.map(row => row.durationMs).sort((a, b) => a - b)
  const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null
  return { total: rows.length, passed: rows.filter(row => row.ok).length, p95Ms, passedWithinBudget: rows.length > 0 && rows.every(row => row.ok) && p95Ms !== null && p95Ms <= probeP95LimitMs }
}

export function confirmsAnonymousDenial(payload: { status?: unknown; errorData?: unknown }) {
  return payload.status === 'error' && payload.errorData === 'Authenticated operator session required'
}
