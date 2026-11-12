import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api, internal } from '../convex/_generated/api'
const modules = import.meta.glob('../convex/**/*.ts')
afterEach(() => vi.useRealTimers())
async function fixture() {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ subject: 'owner' })
  const other = t.withIdentity({ subject: 'other' })
  const missionId = await t.run(ctx => ctx.db.insert('missions', { ownerKey: 'owner', title: 'Platform tasks', mission: 'Measure actual task outcomes', autonomy: 'guided', budget: 0, status: 'running', completion: 0, approved: true }))
  return { t, owner, other, missionId }
}
describe('private platform task measurements', () => {
  it('separates failures and unresolved attempts, measures elapsed time and preserves terminal results', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100000)
    const { t, owner, other, missionId } = await fixture()
    const success = await t.mutation(internal.platformTasks.begin, { missionId, kind: 'research' })
    const failed = await t.mutation(internal.platformTasks.begin, { missionId, kind: 'research' })
    await t.mutation(internal.platformTasks.begin, { missionId, kind: 'research' })
    vi.advanceTimersByTime(2000)
    await t.mutation(internal.platformTasks.finish, { id: success, success: true, sourceRef: 'saved-research' })
    await t.mutation(internal.platformTasks.finish, { id: failed, success: false })
    await t.mutation(internal.platformTasks.finish, { id: success, success: true, sourceRef: 'saved-research' })
    await expect(t.mutation(internal.platformTasks.finish, { id: success, success: false })).rejects.toThrow(/immutable/)
    const result = await owner.query(api.platformTasks.summary, { missionId })
    expect(result.rows[0]).toMatchObject({ successes: 1, failures: 1, pending: 1, successRate: 50, failureRate: 50, meanSeconds: 2, medianSeconds: 2, p95Seconds: 2, oldestPendingSeconds: 2, timedCount: 2 })
    expect((await other.query(api.platformTasks.summary, {})).sampled).toBe(0)
    await expect(other.query(api.platformTasks.summary, { missionId })).rejects.toThrow(/access denied/)
    await expect(t.query(api.platformTasks.summary, {})).rejects.toThrow(/Authenticated/)
  })
  it('records delivery only after validated callbacks, leaves build-only work pending and deduplicates replays', async () => {
    const { t, owner, missionId } = await fixture()
    const id = await t.run(ctx => ctx.db.insert('deliveries', { missionId, target: 'nexus-forge1/no-dispatch', branch: 'main', stage: 'github', approved: true, status: 'Ready', evidence: '', createdAt: Date.now() - 1000 }))
    await t.mutation(internal.delivery.markDispatched, { id, evidence: 'Confirmed dispatch' })
    await t.mutation(internal.delivery.markDispatched, { id, evidence: 'Confirmed dispatch' })
    const workflow = { id, runUrl: 'https://github.com/nexus-forge1/no-dispatch/actions/runs/123', commitSha: 'a'.repeat(40), conclusion: 'success', summary: '' }
    const deployment = { id, runUrl: workflow.runUrl, commitSha: workflow.commitSha, deploymentUrl: 'https://example.com/', readinessPassedCount: 6, readinessTotalCount: 6, summary: '' }
    await expect(t.mutation(internal.delivery.recordDeploymentResult, deployment)).rejects.toThrow()
    await t.mutation(internal.delivery.recordWorkflowResult, workflow)
    expect((await owner.query(api.platformTasks.summary, { missionId })).rows[2]).toMatchObject({ pending: 1, successes: 0, successRate: null, failureRate: null, oldestPendingSeconds: expect.any(Number) })
    await t.mutation(internal.delivery.recordDeploymentResult, deployment)
    await t.mutation(internal.delivery.recordDeploymentResult, deployment)
    expect((await owner.query(api.platformTasks.summary, { missionId })).rows[2]).toMatchObject({ pending: 0, successes: 1, failures: 0, successRate: 100, failureRate: 0, oldestPendingSeconds: null })
    expect(await t.run(ctx => ctx.db.query('productOutcomes').collect())).toEqual([])
  })
  it('counts failed workflow callbacks as failed deliveries', async () => {
    const { t, owner, missionId } = await fixture()
    const id = await t.run(ctx => ctx.db.insert('deliveries', { missionId, target: 'nexus-forge1/no-dispatch', branch: 'main', stage: 'github', approved: true, status: 'Dispatched', evidence: '', createdAt: Date.now() }))
    const args = { id, runUrl: 'https://github.com/nexus-forge1/no-dispatch/actions/runs/124', commitSha: 'b'.repeat(40), conclusion: 'failure', summary: '' }
    await t.mutation(internal.delivery.recordWorkflowResult, args)
    await t.mutation(internal.delivery.recordWorkflowResult, args)
    expect((await owner.query(api.platformTasks.summary, { missionId })).rows[2]).toMatchObject({ failures: 1, successes: 0, successRate: 0 })
  })
  it('reports a bounded sample without claiming missing data passed', async () => {
    const { t, owner, missionId } = await fixture()
    expect((await owner.query(api.platformTasks.summary, { missionId })).rows.every(r => r.successRate === null && r.meanSeconds === null)).toBe(true)
    await t.run(async ctx => { for (let i = 0; i < 101; i++) await ctx.db.insert('platformTaskRuns', { missionId, ownerKey: 'owner', kind: 'artifact', status: 'pending', startedAt: Date.now() }) })
    const result = await owner.query(api.platformTasks.summary, { missionId })
    expect(result).toMatchObject({ sampled: 100, truncated: true })
    expect(result.rows[1]).toMatchObject({ pending: 100, successRate: null, failureRate: null, oldestPendingSeconds: expect.any(Number) })
  })
})
