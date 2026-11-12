// Private-session, read-only workload harness. Tokens stay in environment variables.
import { writeFile, readFile, chmod } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

export function validateProfile(p) {
  if (!p || typeof p !== 'object') throw Error('A workload profile is required')
  const backend = new URL(p.backendOrigin)
  if (backend.protocol !== 'https:' || !backend.hostname.endsWith('.convex.cloud') ||
    backend.username || backend.password || backend.port || backend.pathname !== '/' ||
    backend.search || backend.hash) throw Error('Use the verified HTTPS Convex deployment origin')
  for (const [name, minimum, maximum] of [['workers', 1, 8], ['iterations', 1, 120], ['intervalMs', 1000, 10000], ['timeoutMs', 1000, 15000]]) {
    if (!Number.isInteger(p[name]) || p[name] < minimum || p[name] > maximum) throw Error('Invalid bounded workload setting: ' + name)
  }
  if (!Number.isFinite(p.p95LimitMs) || p.p95LimitMs < 1 || p.p95LimitMs > 15000 ||
    !Number.isFinite(p.maxErrorRate) || p.maxErrorRate < 0 || p.maxErrorRate > .1)
    throw Error('Explicit latency and error targets are required')
  if (!['Testing', 'Live'].includes(p.environment) || !p.label || typeof p.label !== 'string' || p.label.length > 120)
    throw Error('Provide an environment and bounded workload label')
  const expectedBackend = p.environment === 'Testing' ? 'https://quick-rabbit-810.eu-west-1.convex.cloud' : 'https://tame-rat-826.eu-west-1.convex.cloud'
  if (backend.origin !== expectedBackend) throw Error('Profile does not match the verified NEXUS FORGE environment')
  return { label: p.label, environment: p.environment, backendOrigin: backend.origin,
    workers: p.workers, iterations: p.iterations, intervalMs: p.intervalMs,
    timeoutMs: p.timeoutMs, p95LimitMs: p.p95LimitMs, maxErrorRate: p.maxErrorRate }
}
export function assessSamples(profile, samples, stoppedEarly = false) {
  const completed = samples.length, failures = samples.filter(row => !row.ok).length
  const sorted = samples.map(row => row.durationMs).sort((a, b) => a - b)
  const valid = samples.every(row => typeof row.ok === 'boolean' && Number.isFinite(row.durationMs) && row.durationMs >= 0)
  const p95Ms = sorted[Math.max(0, Math.ceil(completed * .95) - 1)] ?? null
  const errorRate = completed ? failures / completed : null
  return { completed, planned: profile.workers * profile.iterations, failures, p95Ms, errorRate, stoppedEarly,
    passed: valid && !stoppedEarly && completed === profile.workers * profile.iterations &&
      p95Ms !== null && p95Ms <= profile.p95LimitMs && errorRate !== null && errorRate <= profile.maxErrorRate }
}
async function boundedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) throw Error('Missing response')
  const chunks = []; let bytes = 0
  while (true) {
    const row = await reader.read()
    if (row.done) break
    bytes += row.value.byteLength
    if (bytes > 262144) { await reader.cancel(); throw Error('Response bound exceeded') }
    chunks.push(row.value)
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
}
export async function runWorkload(profileInput, tokens, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const profile = validateProfile(profileInput)
  if (!Array.isArray(tokens) || tokens.length !== profile.workers ||
    tokens.some(token => typeof token !== 'string' || token.length < 20 || token.length > 8192 || /\\s/.test(token)))
    throw Error('Supply one real signed-in session token per worker; tokens are never written into reports')
  // A read-only authentication preflight must succeed for every worker before any load is admitted.
  async function request(token, limit) {
    const response = await fetcher(profile.backendOrigin + '/api/query', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(profile.timeoutMs),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ path: 'providerUsage:history', args: { paginationOpts: { numItems: limit, cursor: null } }, format: 'json' }),
    })
    const payload = await boundedJson(response)
    // Do not retain response data, error messages, owner identities or provider report contents.
    return response.status === 200 && payload?.status === 'success' &&
      payload.value && Array.isArray(payload.value.page) && typeof payload.value.isDone === 'boolean' &&
      typeof payload.value.continueCursor === 'string'
  }
  for (const token of tokens) {
    let authenticated = false
    try { authenticated = await request(token, 1) } catch { /* Fail closed without printing upstream content. */ }
    if (!authenticated) throw Error('Session preflight failed; no workload was started. Refresh the authorized session and verify the deployment.')
  }
  const startedAt = new Date().toISOString(), started = performance.now(), samples = []
  let stop = false
  await Promise.all(tokens.map((token, worker) => (async () => {
    for (let iteration = 0; iteration < profile.iterations && !stop; iteration++) {
      const tick = performance.now(); let ok = false
      try { ok = Boolean(await request(token, 5)) } catch { /* Redacted bounded failure. */ }
      samples.push({ worker, iteration, ok, durationMs: Math.round(performance.now() - tick) })
      if (samples.filter(row => !row.ok).length >= 5) stop = true
      const remaining = profile.intervalMs - (performance.now() - tick)
      if (remaining > 0 && iteration + 1 < profile.iterations && !stop) await wait(remaining)
    }
  })()))
  return { version: 'authenticated-read-capacity-v1', profile, startedAt, observedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started), sessionCount: tokens.length,
    authentication: 'Caller-supplied bearer sessions passed private-query preflight; distinct users are not inferred.',
    scope: 'Bounded authenticated provider-ledger reads only. Does not exercise inference, mission writes, delivery or sustained full-service capacity.',
    summary: assessSamples(profile, samples, stop), samples }
}
async function savePrivateReport(report) {
  const path = process.env.NEXUS_LOAD_REPORT_PATH || '/tmp/nexus-authenticated-capacity.json'
  await writeFile(path, JSON.stringify(report, null, 2), { mode: 0o600 })
  await chmod(path, 0o600)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.env.NEXUS_LOAD_PROFILE_PATH) throw Error('Set NEXUS_LOAD_PROFILE_PATH to the reviewed workload profile file')
    const profile = JSON.parse(await readFile(process.env.NEXUS_LOAD_PROFILE_PATH, 'utf8'))
    const tokens = JSON.parse(process.env.NEXUS_LOAD_SESSION_TOKENS || '[]')
    const report = await runWorkload(profile, tokens)
    await savePrivateReport(report)
    console.log(JSON.stringify({ version: report.version, scope: report.scope, summary: report.summary }))
    if (!report.summary.passed) process.exitCode = 1
  } catch {
    try { await savePrivateReport({ version: 'authenticated-read-capacity-v1', observedAt: new Date().toISOString(), scope: 'Workload did not complete; no capacity acceptance recorded.', summary: { passed: false } }) } catch { /* Report-write failure cannot become a pass. */ }
    console.error('Authenticated workload did not complete. Check the bounded profile, verified deployment and authorized session tokens. No pass is recorded.')
    process.exitCode = 1
  }
}
