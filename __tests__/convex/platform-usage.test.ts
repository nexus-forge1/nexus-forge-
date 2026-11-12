// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')
const counters = {
  functionHoursReported: 1,
  storageHoursReported: 1,
  functionCalls: 100,
  databaseReadDocuments: 20,
  databaseReadBytes: 2048,
  ioBytes: 4096,
  egressBytes: 1024,
  storageRequests: 4,
}
function snapshot(overrides: Record<string, any> = {}) {
  const now = Date.now()
  const start = new Date(now - 48 * 60 * 60_000).toISOString()
  const end = new Date(now - 60_000).toISOString()
  const capturedAt = new Date(now - 30_000).toISOString()
  const day = new Date(now - 60 * 60_000).toISOString().slice(0, 10)
  return {
    history: {
      status: 'available',
      source: 'persisted_convex_webhooks',
      scope: 'chat_live_and_testing_combined',
      capturedAt,
      start,
      end,
      coverage: 'Two complete daily buckets reported by managed usage history.',
      days: [{ date: day, ...counters }],
    },
    functions: {
      status: 'available',
      capturedAt,
      windowSeconds: 900,
      failedFunctionCount: 0,
      skippedFunctionCount: 0,
      truncated: false,
      functions: [{ udfPath: 'missions:list', udfType: 'query', isPublic: true, invocations: 10, errors: 1, p50Ms: 10, p99Ms: 40, cacheHitPercentage: 20, available: true }],
    },
    ...overrides,
  }
}
function fixture() {
  const t = convexTest(schema, modules)
  return { t, owner: t.withIdentity({ subject: 'owner' }), other: t.withIdentity({ subject: 'other' }) }
}
describe('platform usage snapshot integrity', () => {
  it('retains a valid sanitized report idempotently and keeps it owner-private', async () => {
    const { owner, other } = fixture()
    const rawSnapshot = JSON.stringify(snapshot())
    const id = await owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot, functionTarget: 'live' })
    expect(await owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot, functionTarget: 'live' })).toBe(id)
    const rows = await owner.query(api.platformUsage.history, {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ functionTarget: 'live', source: 'macaly-database-usage', historyTotals: counters })
    expect(rows[0]).not.toHaveProperty('ownerKey')
    expect(await other.query(api.platformUsage.history, {})).toEqual([])
  })

  it('rejects impossible calendar dates, duplicate days and days outside the report period', async () => {
    const { owner } = fixture()
    const valid = snapshot()
    const day = valid.history.days[0]
    for (const days of [
      [day, { ...day, functionCalls: day.functionCalls + 1 }],
      [{ ...day, date: '2026-02-30' }],
      [{ ...day, date: '1900-01-01' }],
    ]) {
      await expect(owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot: JSON.stringify({ ...valid, history: { ...valid.history, days } }), functionTarget: 'live' })).rejects.toThrow()
    }
    expect(await owner.query(api.platformUsage.history, {})).toEqual([])
  })

  it('rejects future reports and reporting periods that end after their capture time', async () => {
    const { owner } = fixture()
    const valid = snapshot()
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    await expect(owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot: JSON.stringify({ ...valid, history: { ...valid.history, capturedAt: future } }), functionTarget: 'live' })).rejects.toThrow(/future/)
    await expect(owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot: JSON.stringify({ ...valid, history: { ...valid.history, end: new Date(Date.now() + 60 * 60_000).toISOString() } }), functionTarget: 'live' })).rejects.toThrow(/future/)
  })

  it('rejects unsafe aggregate precision and inconsistent or duplicated function metrics', async () => {
    const { owner } = fixture()
    const valid = snapshot()
    const day = valid.history.days[0]
    const largeCounters = { ...day, functionCalls: Number.MAX_SAFE_INTEGER }
    await expect(owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot: JSON.stringify({ ...valid, history: { ...valid.history, days: [largeCounters, { ...largeCounters, date: new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10) }] } }), functionTarget: 'live' })).rejects.toThrow(/safe integer/)
    const fn = valid.functions.functions[0]
    for (const functions of [
      [fn, { ...fn }],
      [{ ...fn, errors: fn.invocations + 1 }],
      [{ ...fn, p50Ms: 80, p99Ms: 40 }],
    ]) {
      await expect(owner.mutation(api.platformUsage.recordSnapshot, { rawSnapshot: JSON.stringify({ ...valid, functions: { ...valid.functions, functions } }), functionTarget: 'live' })).rejects.toThrow()
    }
    expect(await owner.query(api.platformUsage.history, {})).toEqual([])
  })
})
