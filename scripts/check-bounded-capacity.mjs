// Bounded read-only production shell observation; no authentication or writes.
import { performance } from 'node:perf_hooks'
import { writeFile } from 'node:fs/promises'
import { productionOrigin, inspectPublicShell } from '../src/lib/production-probe.ts'
import { allWorkspaces } from '../src/lib/workspaces.ts'
const paths = allWorkspaces.map(page => page.path)
const workers = 4, iterations = 15, p95LimitMs = 2000
const startedAt = new Date().toISOString(), started = performance.now()
const samples = []
let stop = false
await Promise.all(Array.from({ length: workers }, (_, worker) => (async () => {
  for (let i = 0; i < iterations && !stop; i++) {
    const tick = performance.now(), path = paths[(worker * iterations + i) % paths.length]
    let ok = false, status = 0, bytes = 0
    try {
      const response = await fetch(new URL(path, productionOrigin), {
        signal: AbortSignal.timeout(10000), redirect: 'error',
        headers: { 'User-Agent': 'NEXUS-FORGE-bounded-capacity/2' },
      })
      status = response.status
      const reader = response.body?.getReader()
      if (!reader) throw Error('Missing body')
      const chunks = []
      while (true) {
        const row = await reader.read()
        if (row.done) break
        bytes += row.value.byteLength
        if (bytes > 512 * 1024) { await reader.cancel(); throw Error('Response bound exceeded') }
        chunks.push(row.value)
      }
      ok = inspectPublicShell(status, response.headers.get('content-type') || '', new TextDecoder().decode(Buffer.concat(chunks))) === null
    } catch { /* Failed observations remain failures. */ }
    samples.push({ path, ms: Math.round(performance.now() - tick), status, ok, bytes })
    if (samples.filter(sample => !sample.ok).length >= 5) stop = true
    const wait = 1000 - (performance.now() - tick)
    if (wait > 0 && !stop) await new Promise(resolve => setTimeout(resolve, wait))
  }
})()))
const sorted = samples.map(sample => sample.ms).sort((a, b) => a - b)
const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null
const failures = samples.filter(sample => !sample.ok).length
const report = {
  version: 'bounded-public-capacity-v2', origin: productionOrigin,
  startedAt, observedAt: new Date().toISOString(), workers,
  maxRequests: workers * iterations, requests: samples.length, failures,
  stoppedEarly: stop, durationMs: Math.round(performance.now() - started), p95Ms, p95LimitMs,
  totalBytes: samples.reduce((sum, sample) => sum + sample.bytes, 0),
  passed: samples.length === workers * iterations && failures === 0 && p95Ms !== null && p95Ms <= p95LimitMs,
  scope: 'Paced public route shells only; four workers and fifteen iterations each. Engineering observation, not authenticated inference capacity or an agreed SLA.',
  samples,
}
await writeFile(process.env.CAPACITY_REPORT_PATH || '/tmp/nexus-bounded-capacity.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ...report, samples: undefined }))
if (!report.passed) process.exitCode = 1
