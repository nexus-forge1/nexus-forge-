import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api } from '../convex/_generated/api'
import { benchmarkSuite } from '../convex/artifactBenchmarkCatalog'
import { parseBenchmarkRunUrl, verifyBenchmarkMetadata } from '../convex/benchmarkProvenance'
const modules = import.meta.glob('../convex/**/*.ts')
const runId = '12345678'
const runUrl = 'https://github.com/' + benchmarkSuite.repository + '/actions/runs/' + runId
const identity = (subject: string) => ({ subject, issuer: 'https://nexus-forge.test', tokenIdentifier: 'https://nexus-forge.test|' + subject })
function metadata(outcome = 'success') {
  return {
    run: { id: Number(runId), repository: { full_name: benchmarkSuite.repository }, head_repository: { full_name: benchmarkSuite.repository }, html_url: runUrl, path: benchmarkSuite.workflowPath, status: 'completed', conclusion: outcome, head_sha: 'a'.repeat(40), run_attempt: 1 },
    jobs: { total_count: 1, jobs: [{ name: benchmarkSuite.jobName, run_id: Number(runId), status: 'completed', conclusion: outcome, steps: [{ name: benchmarkSuite.stepName, conclusion: outcome }, { name: benchmarkSuite.chromiumStepName, conclusion: outcome }] }] },
  }
}
function mockGitHub(data: ReturnType<typeof metadata>) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/attempts/') ? data.jobs : data.run), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('benchmark provenance boundaries', () => {
  it('rejects oversized metadata without recording a benchmark receipt',async()=>{
    const t=convexTest(schema,modules),owner=t.withIdentity(identity('owner-a'))
    const network=vi.fn().mockResolvedValue(new Response('x'.repeat(512*1024+1)))
    vi.stubGlobal('fetch',network)
    await expect(owner.action(api.benchmarks.verifyRun,{runUrl})).rejects.toThrow(/exceeds limit/)
    expect(network).toHaveBeenCalledTimes(1)
    expect(await owner.query(api.benchmarks.history,{})).toEqual([])
  })
  it('accepts only a canonical project run URL', () => {
    expect(parseBenchmarkRunUrl(runUrl + '/')).toEqual({ runId, runUrl })
    for (const value of [runUrl.replace('https:', 'http:'), runUrl.replace('github.com', 'attacker.example'), runUrl.replace('nexus-forge1/nexus-forge-', 'nexus-forge1/no-dispatch'), runUrl + '?override=1', runUrl + '/job/1', 'https://github.com/']) expect(() => parseBenchmarkRunUrl(value)).toThrow()
  })
  it('distinguishes a passed suite, failed assertions, and a suite that never ran', () => {
    const pass = metadata()
    expect(verifyBenchmarkMetadata(runId, pass.run, pass.jobs).outcome).toBe('passed')
    const fail = metadata('failure')
    expect(verifyBenchmarkMetadata(runId, fail.run, fail.jobs).outcome).toBe('failed')
    fail.jobs.jobs[0].steps = []
    expect(verifyBenchmarkMetadata(runId, fail.run, fail.jobs).outcome).toBe('not_run')
  })
  it('does not relabel a historical v1 job as v3 evidence', () => {
    const { run, jobs } = metadata()
    const historical = { ...jobs, jobs: [{ ...jobs.jobs[0], name: 'Artifact DOM benchmarks v1', steps: [{ name: 'Run artifact DOM benchmark suite v1', conclusion: 'success' }] }] }
    expect(() => verifyBenchmarkMetadata(runId, run, historical)).toThrow(/no completed/)
  })
  it('requires both engines and preserves a Chromium failure', () => {
    const { run, jobs } = metadata()
    jobs.jobs[0].steps = [{ name: benchmarkSuite.stepName, conclusion: 'success' }]
    expect(verifyBenchmarkMetadata(runId, run, jobs).outcome).toBe('not_run')
    jobs.jobs[0].steps.push({ name: benchmarkSuite.chromiumStepName, conclusion: 'failure' })
    expect(verifyBenchmarkMetadata(runId, run, jobs).outcome).toBe('failed')
    const historical = { ...jobs, jobs: [{ ...jobs.jobs[0], name: 'Artifact DOM benchmarks v2' }] }
    expect(() => verifyBenchmarkMetadata(runId, run, historical)).toThrow(/no completed/)
  })
  it('rejects wrong workflows, commits, unfinished runs, and missing benchmark jobs', () => {
    const { run, jobs } = metadata()
    expect(() => verifyBenchmarkMetadata(runId, { ...run, path: '.github/workflows/other.yml' }, jobs)).toThrow(/workflow/)
    expect(() => verifyBenchmarkMetadata(runId, { ...run, head_sha: 'invalid' }, jobs)).toThrow(/commit/)
    expect(() => verifyBenchmarkMetadata(runId, { ...run, status: 'in_progress' }, jobs)).toThrow(/complete/)
    expect(() => verifyBenchmarkMetadata(runId, run, { total_count: 0, jobs: [] })).toThrow(/no completed/)
  })
})
describe('GitHub-verified operator-private receipts', () => {
  it('rejects anonymous imports before network access', async () => {
    const t = convexTest(schema, modules)
    const fetchMock = mockGitHub(metadata())
    await expect(t.action(api.benchmarks.verifyRun, { runUrl })).rejects.toThrow(/Authenticated operator/)
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(t.query(api.benchmarks.history, {})).rejects.toThrow()
  })
  it('fetches the exact attempt, deduplicates receipts, and isolates operator history', async () => {
    const t = convexTest(schema, modules)
    const fetchMock = mockGitHub(metadata())
    const owner = t.withIdentity(identity('owner-a'))
    const first = await owner.action(api.benchmarks.verifyRun, { runUrl })
    expect(await owner.action(api.benchmarks.verifyRun, { runUrl })).toBe(first)
    expect(fetchMock.mock.calls[1][0]).toContain('/attempts/1/jobs?per_page=100')
    const rows = await owner.query(api.benchmarks.history, {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ outcome: 'passed', runId, attempt: 1, commitSha: 'a'.repeat(40), suiteVersion: 'artifact-dom-v3' })
    expect(await t.withIdentity(identity('owner-b')).query(api.benchmarks.history, {})).toEqual([])
  })
  it('records failed suite evidence instead of accepting an overall workflow claim', async () => {
    const t = convexTest(schema, modules)
    const data = metadata('failure'); data.run.conclusion = 'success'
    mockGitHub(data)
    const owner = t.withIdentity(identity('owner-a'))
    await owner.action(api.benchmarks.verifyRun, { runUrl })
    expect((await owner.query(api.benchmarks.history, {}))[0]).toMatchObject({ outcome: 'failed', jobConclusion: 'failure', runConclusion: 'success' })
  })
  it('preserves separate rerun attempts', async () => {
    const t = convexTest(schema, modules)
    const data = metadata(); mockGitHub(data)
    const owner = t.withIdentity(identity('owner-a'))
    const first = await owner.action(api.benchmarks.verifyRun, { runUrl })
    data.run.run_attempt = 2
    expect(await owner.action(api.benchmarks.verifyRun, { runUrl })).not.toBe(first)
    expect((await owner.query(api.benchmarks.history, {})).map(row => row.attempt).sort()).toEqual([1, 2])
  })
  it('does not save failed lookups or disclose provider response content', async () => {
    const t = convexTest(schema, modules)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive diagnostic body', { status: 403 })))
    const owner = t.withIdentity(identity('owner-a'))
    await expect(owner.action(api.benchmarks.verifyRun, { runUrl })).rejects.toThrow('HTTP 403')
    expect(await owner.query(api.benchmarks.history, {})).toEqual([])
  })
})
