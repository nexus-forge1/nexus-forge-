// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api } from '../convex/_generated/api'
const modules = import.meta.glob('../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })
const input = { provider: 'groq' as const, periodStart: 1000, periodEnd: 10000, invoiceReference: 'invoice-one', invoiceUsd: 0.25, evidenceReference: 'private-export.csv', scopeConfirmed: true }
const page = { numItems: 10, cursor: null }
async function fixture() {
  const t = convexTest(schema, modules), owner = t.withIdentity(identity('owner-a'))
  const insert = (extra: Record<string, unknown> = {}) => t.run(ctx => ctx.db.insert('providerInvocations', {
    ownerKey: 'owner-a', stage: 'controlled', role: 'planner', startedAt: 2000, finishedAt: 3000,
    outcome: 'succeeded', usageStatus: 'recorded', observedReports: 1,
    reports: [{ ordinal: 1, provider: 'groq', model: 'controlled', reportedCostUsd: 0.25, capturedAt: 2500 }], ...extra,
  } as any))
  const history = async () => (await owner.query(api.providerReconciliation.history, { paginationOpts: page })).page
  return { t, owner, insert, history }
}
describe('private provider invoice comparisons', () => {
  it('captures exact owned provenance, preserves zero, and never changes financial balances', async () => {
    const { t, owner, insert, history } = await fixture()
    const id = await insert()
    await insert({ ownerKey: 'owner-b' })
    await owner.mutation(api.providerReconciliation.record, input)
    expect((await history())[0]).toMatchObject({ status: 'matched-declared', ledgerUsd: .25, varianceUsd: 0, invocationCount: 1, invocationIds: [id] })
    expect(await t.run(ctx => ctx.db.query('billingReceipts').collect())).toEqual([])
    const zero = await insert({ startedAt: 11000, finishedAt: 12000, reports: [{ ordinal: 1, provider: 'groq', model: 'zero', reportedCostUsd: 0, capturedAt: 11500 }] })
    await owner.mutation(api.providerReconciliation.record, { ...input, periodStart: 10000, periodEnd: 13000, invoiceUsd: 0 })
    expect((await history())[0]).toMatchObject({ status: 'matched-declared', ledgerUsd: 0, invocationIds: [zero] })
  })
  it('does not certify an empty ledger, undeclared scope, missing charges or a pending attempt', async () => {
    const { owner, insert, history } = await fixture()
    await owner.mutation(api.providerReconciliation.record, { ...input, invoiceUsd: 0 })
    expect((await history())[0].status).toBe('incomplete')
    await insert()
    await owner.mutation(api.providerReconciliation.record, { ...input, scopeConfirmed: false })
    expect((await history())[0].status).toBe('scope-mismatch')
    await insert({ reports: [{ ordinal: 1, provider: 'groq', model: 'unknown', capturedAt: 2500 }] })
    await insert({ outcome: 'pending', usageStatus: 'pending', observedReports: undefined, finishedAt: undefined, reports: [] })
    await owner.mutation(api.providerReconciliation.record, input)
    expect((await history())[0]).toMatchObject({ status: 'incomplete', missingCharges: 1, unresolvedInvocations: 1 })
  })
  it('retains missing-attempt uncertainty even when reports name another provider', async () => {
    const { owner, insert, history } = await fixture()
    await insert()
    await insert({ usageStatus: 'gap', observedReports: 2, reports: [{ ordinal: 1, provider: 'cerebras', model: 'other', reportedCostUsd: 5, capturedAt: 2500 }] })
    await owner.mutation(api.providerReconciliation.record, input)
    expect((await history())[0]).toMatchObject({ status: 'incomplete', ledgerUsd: .25, matchedReports: 1, unresolvedInvocations: 1 })
  })
  it('uses half-open start bounds and flags an invocation crossing the period end', async () => {
    const { owner, insert, history } = await fixture()
    await insert({ startedAt: 1000 })
    await insert({ startedAt: 999 })
    await insert({ startedAt: 10000, finishedAt: 11000 })
    await owner.mutation(api.providerReconciliation.record, input)
    expect((await history())[0].invocationCount).toBe(1)
    await insert({ startedAt: 9000, finishedAt: 10000 })
    await owner.mutation(api.providerReconciliation.record, { ...input, invoiceUsd: .5 })
    expect((await history())[0]).toMatchObject({ status: 'incomplete', unresolvedInvocations: 1 })
  })
  it('records variance without modifying the immutable prior snapshot after late usage', async () => {
    const { t, owner, insert, history } = await fixture()
    const id = await insert()
    const saved = await owner.mutation(api.providerReconciliation.record, { ...input, invoiceUsd: .26 })
    expect((await history())[0]).toMatchObject({ status: 'variance', varianceUsd: .01 })
    await t.run(ctx => ctx.db.patch(id, { reports: [{ ordinal: 1, provider: 'groq', model: 'late', reportedCostUsd: .26, capturedAt: 3500 }] }))
    const unchanged = (await history()).find(row => row._id === saved)!
    expect(unchanged.ledgerUsd).toBe(.25)
    expect(unchanged.reports[0].model).toBe('controlled')
  })
  it('enforces ownership and authentication on both write and paginated history', async () => {
    const { t, owner, insert } = await fixture()
    await insert()
    await owner.mutation(api.providerReconciliation.record, input)
    const other = t.withIdentity(identity('owner-b'))
    expect((await other.query(api.providerReconciliation.history, { paginationOpts: page })).page).toEqual([])
    await expect(t.mutation(api.providerReconciliation.record, input)).rejects.toThrow(/Authenticated/)
    await expect(t.query(api.providerReconciliation.history, { paginationOpts: page })).rejects.toThrow(/Authenticated/)
  })
  it('rejects incomplete/future periods, nonfinite amounts and unbounded references', async () => {
    const { owner } = await fixture()
    for (const patch of [{ periodEnd: 1000 }, { periodEnd: Date.now() + 60000 }, { invoiceUsd: NaN }, { invoiceUsd: -1 }, { invoiceReference: 'x'.repeat(161) }, { evidenceReference: '' }, { periodEnd: 94 * 86400000 }]) {
      await expect(owner.mutation(api.providerReconciliation.record, { ...input, ...patch })).rejects.toThrow()
    }
  })
  it('refuses truncated scans and paginates immutable history', async () => {
    const { t, owner, insert } = await fixture()
    for (let i = 0; i < 11; i++) await owner.mutation(api.providerReconciliation.record, { ...input, invoiceReference: 'invoice-' + i })
    const first = await owner.query(api.providerReconciliation.history, { paginationOpts: page })
    expect(first.page).toHaveLength(10); expect(first.isDone).toBe(false)
    const second = await owner.query(api.providerReconciliation.history, { paginationOpts: { ...page, cursor: first.continueCursor } })
    expect(second.page).toHaveLength(1)
    for (let i = 0; i < 201; i++) await insert()
    await expect(owner.mutation(api.providerReconciliation.record, input)).rejects.toThrow(/narrow the period/)
    expect(await t.run(ctx => ctx.db.query('providerReconciliations').collect())).toHaveLength(11)
  })
})
