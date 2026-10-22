import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api, internal } from '../convex/_generated/api'
import { artifactCiCheckName, artifactCiRepository, artifactCiWorkflow, verifyExactCiReport } from '../convex/artifactCiProvenance'
import { createHash } from 'node:crypto'
const modules = import.meta.glob('../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus-forge.test', tokenIdentifier: 'https://nexus-forge.test|' + subject })
const contract = 'ACCEPTANCE CRITERIA:\n- Show a doubled result'
const content = '<html><body><output id="result">14</output></body></html>'
const plan = [{ criterionIndex: 0, steps: [{ action: 'assertText' as const, selector: '#result', value: '14' }] }]
const results = [[{ status: 'pass' as const, detail: 'Observed 14' }]]
async function fixture() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const missionId = await ctx.db.insert('missions', { title: 'Exact artifact CI', mission: contract, autonomy: 'guided', budget: 0, status: 'draft', completion: 0, approved: false, ownerKey: 'owner-a' })
    const artifactId = await ctx.db.insert('artifacts', { missionId, content, type: 'web-app', name: 'Doubler', status: 'awaiting_approval', requiresApproval: true })
    return { missionId, artifactId }
  })
  const owner = t.withIdentity(identity('owner-a'))
  const testRunId = await owner.mutation(api.artifactTests.record, { artifactId: ids.artifactId, missionSnapshot: contract, artifactSnapshot: content, plan, results })
  return { t, owner, testRunId, ...ids }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
function mocks(failDispatch = false) {
  let bundle = ''
  const fetchMock = vi.fn().mockImplementation(async (url: string, init: any) => {
    if (url.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'b'.repeat(40) } })
    if (url.endsWith('/git/refs')) return Response.json({ ref: 'created' }, { status: 201 })
    if (url.includes('/contents/') && init.method === 'GET') return new Response('', { status: 404 })
    if (url.includes('/contents/') && init.method === 'PUT') { bundle = Buffer.from(JSON.parse(init.body).content, 'base64').toString('utf8'); return Response.json({ commit: { sha: 'a'.repeat(40) } }, { status: 201 }) }
    if (url.includes('/git/ref/heads/nexus-forge-checks/')) return Response.json({ object: { sha: 'a'.repeat(40) } })
    if (url.includes('/dispatches')) return new Response(null, { status: failDispatch ? 500 : 204 })
    throw new Error('Unexpected request ' + url)
  })
  vi.stubEnv('GITHUB_ACCESS_TOKEN', 'test-token')
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, bundle: () => bundle }
}
describe('exact artifact snapshot publication', () => {
  it('rejects oversized metadata before remote writes or CI receipt creation',async()=>{
    const{t,owner,testRunId}=await fixture()
    vi.stubEnv('GITHUB_ACCESS_TOKEN','fixture-token')
    const network=vi.fn().mockResolvedValue(new Response('x'.repeat(1024*1024+1)))
    vi.stubGlobal('fetch',network)
    await expect(owner.action(api.artifactCiActions.publish,{testRunId,publishSnapshot:true})).rejects.toThrow(/exceeds limit/)
    expect(network).toHaveBeenCalledTimes(1)
    expect((await t.run(c=>c.db.get('artifactTestRuns',testRunId)))?.ci).toBeUndefined()
  })
  it('rejects anonymous and other-owner publication before external requests', async () => {
    const { t, testRunId } = await fixture(), { fetchMock } = mocks()
    await expect(t.action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })).rejects.toThrow(/Authenticated operator/)
    await expect(t.withIdentity(identity('owner-b')).action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })).rejects.toThrow(/access denied/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('publishes exact content and plan, stores its digest/commit, and dispatches once', async () => {
    const { t, owner, testRunId } = await fixture(), net = mocks()
    await owner.action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })
    const row = await t.run(ctx => ctx.db.get('artifactTestRuns', testRunId))
    expect(JSON.parse(net.bundle())).toMatchObject({ testRunId, missionSnapshot: contract, artifactSnapshot: content, plan })
    expect(row?.ci?.snapshotSha).toBe(createHash('sha256').update(net.bundle()).digest('hex'))
    expect(row?.ci?.commitSha).toBe('a'.repeat(40))
    expect(row?.ci?.dispatchedAt).toBeGreaterThan(0)
    const count = net.fetchMock.mock.calls.length
    await owner.action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })
    expect(net.fetchMock).toHaveBeenCalledTimes(count)
  })
  it('rejects changed artifact content before publication', async () => {
    const { t, owner, testRunId, artifactId } = await fixture(), net = mocks()
    await t.run(ctx => ctx.db.patch('artifacts', artifactId, { content: 'Changed artifact' }))
    await expect(owner.action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })).rejects.toThrow(/historical/)
    expect(net.fetchMock).not.toHaveBeenCalled()
  })
  it('retains publication provenance after dispatch failure for a safe retry', async () => {
    const { t, owner, testRunId } = await fixture()
    const first = mocks(true)
    await expect(owner.action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })).rejects.toThrow(/HTTP 500/)
    const row = await t.run(ctx => ctx.db.get('artifactTestRuns', testRunId))
    expect(row?.ci?.commitSha).toBe('a'.repeat(40))
    expect(row?.ci?.dispatchedAt).toBeUndefined()
    const retry = mocks()
    await owner.action(api.artifactCiActions.publish, { testRunId, publishSnapshot: true })
    expect(retry.fetchMock.mock.calls.some(call => call[1].method === 'PUT')).toBe(false)
    expect(first.bundle()).toContain('artifact-ci-v1')
  })
})
describe('exact GitHub Check report binding', () => {
  function data() {
    const snapshot = { _id: 'saved-run', criteria: ['Show a doubled result'], plan, ci: { branch: 'nexus-forge-checks/saved-run', commitSha: 'a'.repeat(40), snapshotSha: 'c'.repeat(64) } }
    const base = 'https://github.com/' + artifactCiRepository + '/actions/runs/123'
    const run = { id: 123, repository: { full_name: artifactCiRepository }, head_repository: { full_name: artifactCiRepository }, path: artifactCiWorkflow, status: 'completed', head_sha: snapshot.ci.commitSha, head_branch: snapshot.ci.branch, html_url: base, run_attempt: 1 }
    const jobs = { total_count: 1, jobs: [{ name: 'Exact artifact Chromium checks', run_id: 123, status: 'completed' }] }
    const report = { version: 'artifact-ci-v1', testRunId: snapshot._id, snapshotSha: snapshot.ci.snapshotSha, results }
    const checks = { total_count: 1, check_runs: [{ id: 456, name: artifactCiCheckName, app: { slug: 'github-actions' }, head_sha: snapshot.ci.commitSha, external_id: snapshot.ci.snapshotSha, details_url: base + '/attempts/1', status: 'completed', conclusion: 'success', output: { text: JSON.stringify(report) } }] }
    return { snapshot, run, jobs, checks }
  }
  it('accepts a matching report and computes criterion coverage from observed steps', () => {
    const d = data()
    expect(verifyExactCiReport(d.snapshot, d.run, d.jobs, d.checks)).toMatchObject({ checkId: 456, attempt: 1, summary: { allPassed: true, passed: 1 } })
  })
  it('rejects a wrong source commit, digest, issuer, attempt, or report shape', () => {
    for (const variant of ['commit', 'digest', 'issuer', 'attempt', 'shape']) {
      const d = data()
      if (variant === 'commit') d.run.head_sha = 'b'.repeat(40)
      if (variant === 'digest') d.checks.check_runs[0].external_id = 'd'.repeat(64)
      if (variant === 'issuer') d.checks.check_runs[0].app.slug = 'untrusted'
      if (variant === 'attempt') d.checks.check_runs[0].details_url += '2'
      if (variant === 'shape') d.checks.check_runs[0].output.text = JSON.stringify({ version: 'artifact-ci-v1', testRunId: d.snapshot._id, snapshotSha: d.snapshot.ci.snapshotSha, results: [] })
      expect(() => verifyExactCiReport(d.snapshot, d.run, d.jobs, d.checks)).toThrow()
    }
  })
  it('preserves verification receipts without repeated audit writes or approval changes', async () => {
    const { t, testRunId, artifactId } = await fixture()
    const state = { branch: 'nexus-forge-checks/' + testRunId, commitSha: 'a'.repeat(40), snapshotSha: 'c'.repeat(64), bundlePath: 'bundle.json', publishedAt: 1, dispatchedAt: 2 }
    await t.mutation(internal.artifactCi.published, { testRunId, state })
    const args = { testRunId, snapshotSha: state.snapshotSha, runUrl: 'https://github.com/' + artifactCiRepository + '/actions/runs/123', attempt: 1, checkId: 456, results }
    await t.mutation(internal.artifactCi.verified, args)
    const before = await t.run(ctx => ctx.db.query('auditEvents').collect())
    await t.mutation(internal.artifactCi.verified, args)
    expect(await t.run(ctx => ctx.db.query('auditEvents').collect())).toHaveLength(before.length)
    expect(await t.run(ctx => ctx.db.get('artifacts', artifactId))).toMatchObject({ status: 'awaiting_approval', requiresApproval: true })
    await expect(t.mutation(internal.artifactCi.verified, { ...args, attempt: 2 })).rejects.toThrow(/immutable/)
  })
})
