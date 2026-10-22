// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api, internal } from '../convex/_generated/api'
const modules = import.meta.glob('../convex/**/*.ts')
const input = { title: ' Controlled contract ', mission: ' Verify mission contract boundaries. ', autonomy: 'Approval required', budget: 25, ownerKey: 'untrusted-client-owner' }
function fixture() {
  const t = convexTest(schema, modules)
  return { t, owner: t.withIdentity({ subject: 'contract-owner' }), other: t.withIdentity({ subject: 'other-owner' }) }
}
describe('mission contract and terminal state safety', () => {
  it('rejects nonfinite, negative and over-UI-limit budgets before any durable write', async () => {
    const { t, owner } = fixture()
    for (const budget of [NaN, Infinity, -Infinity, -1, 500.01])
      await expect(owner.mutation(api.missions.create, { ...input, budget })).rejects.toThrow(/finite amount/)
    expect(await t.run(ctx => ctx.db.query('missions').collect())).toEqual([])
    expect(await t.run(ctx => ctx.db.query('auditEvents').collect())).toEqual([])
  })
  it('preserves explicit zero/max budgets, trims text and derives ownership from the session', async () => {
    const { t, owner } = fixture()
    for (const budget of [0, 500]) {
      const id = await owner.mutation(api.missions.create, { ...input, budget })
      expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ title: 'Controlled contract', mission: 'Verify mission contract boundaries.', budget, ownerKey: 'contract-owner', approved: false, status: 'draft' })
    }
  })
  it('rejects oversized or blank contracts without creating orphan records', async () => {
    const { t, owner } = fixture()
    for (const patch of [{ title: 'x'.repeat(161) }, { mission: '' }, { mission: 'x'.repeat(30001) }, { autonomy: ' ' }, { autonomy: 'x'.repeat(81) }])
      await expect(owner.mutation(api.missions.create, { ...input, ...patch })).rejects.toThrow()
    expect(await t.run(ctx => ctx.db.query('missions').collect())).toHaveLength(0)
  })
  it('does not rewind completed or cancelled missions and makes repeat approval idempotent', async () => {
    const { t, owner } = fixture()
    const id = await owner.mutation(api.missions.create, input)
    await owner.mutation(api.missions.approve, { id, approved: true })
    const before = await t.run(ctx => ctx.db.query('auditEvents').collect())
    await owner.mutation(api.missions.approve, { id, approved: true })
    expect(await t.run(ctx => ctx.db.query('auditEvents').collect())).toHaveLength(before.length)
    await t.run(ctx => ctx.db.patch(id, { status: 'complete', completion: 100 }))
    await owner.mutation(api.missions.approve, { id, approved: true })
    await expect(owner.mutation(api.missions.approve, { id, approved: false })).rejects.toThrow(/cannot change approval/)
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'complete', completion: 100 })
    await t.run(ctx => ctx.db.patch(id, { status: 'cancelled', approved: false }))
    await expect(owner.mutation(api.missions.approve, { id, approved: true })).rejects.toThrow(/cannot change approval/)
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'cancelled', approved: false })
  })
  it('requires portfolio resolution and still permits revoking active authorization', async () => {
    const { t, owner } = fixture()
    const id = await owner.mutation(api.missions.create, input)
    await t.run(ctx => ctx.db.patch(id, { status: 'review', approved: true }))
    await expect(owner.mutation(api.missions.approve, { id, approved: true })).rejects.toThrow(/portfolio review/)
    await owner.mutation(api.missions.approve, { id, approved: false })
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'review', approved: false })
    await owner.mutation(api.portfolio.resolveReview, { missionId: id, decision: 'reopen', note: 'Controlled owner review resolution' })
    await owner.mutation(api.missions.approve, { id, approved: true })
    await owner.mutation(api.missions.approve, { id, approved: false })
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ status: 'draft', approved: false })
  })
  it('rejects invalid legacy budgets on approval and runner admission without scheduling work', async () => {
    const { t, owner } = fixture()
    const id = await owner.mutation(api.missions.create, input)
    await t.run(ctx => ctx.db.patch(id, { budget: NaN }))
    await expect(owner.mutation(api.missions.approve, { id, approved: true })).rejects.toThrow(/finite amount/)
    await t.run(ctx => ctx.db.patch(id, { approved: true }))
    await expect(t.mutation(internal.missionRunner.startApproved, { missionId: id })).rejects.toThrow(/finite amount/)
    await t.run(ctx => ctx.db.patch(id, { budget: 25, status: 'cancelled' }))
    await expect(t.mutation(internal.missionRunner.startApproved, { missionId: id })).rejects.toThrow(/cannot start/)
    await t.run(ctx => ctx.db.patch(id, { status: 'review' }))
    await expect(t.mutation(internal.missionRunner.startApproved, { missionId: id })).rejects.toThrow(/cannot start/)
    expect(await t.run(ctx => ctx.db.query('missionRuns').collect())).toEqual([])
  })
  it.each([
    ['cancelled', 25, 'blocked', 'mission_cancelled'],
    ['review', 25, 'paused', 'awaiting_portfolio_review'],
    ['running', NaN, 'blocked', 'invalid_mission_budget'],
  ])('stops queued ticks for %s before provider work or timeout escalation', async (status, budget, runStatus, stage) => {
    const { t, owner } = fixture()
    const id = await owner.mutation(api.missions.create, input)
    const runId = await t.run(async ctx => {
      await ctx.db.patch(id, { status: status as any, budget: budget as number, approved: true })
      return ctx.db.insert('missionRuns', { missionId: id, startedAt: Date.now() - 1000, deadlineAt: Date.now() - 1, maxRetries: 2, retries: 0, status: 'running', currentStage: 'orchestration', nextActionAt: 0 })
    })
    await t.action(internal.missionRunner.tickInternal, { runId })
    expect(await t.run(ctx => ctx.db.get(runId))).toMatchObject({ status: runStatus, currentStage: stage })
    expect(await t.run(ctx => ctx.db.query('providerInvocations').collect())).toEqual([])
    expect(await t.run(ctx => ctx.db.query('incidents').collect())).toEqual([])
  })
  it('retains authentication and foreign-owner rejection', async () => {
    const { t, owner, other } = fixture()
    await expect(t.mutation(api.missions.create, input)).rejects.toThrow(/Authenticated/)
    const id = await owner.mutation(api.missions.create, input)
    await expect(other.mutation(api.missions.approve, { id, approved: true })).rejects.toThrow(/access denied/)
    expect(await owner.query(api.missions.getById, { id })).toMatchObject({ approved: false, status: 'draft' })
  })
})
