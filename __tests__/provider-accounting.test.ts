// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { getFunctionName } from 'convex/server'
import schema from '../convex/schema'
import { api, internal } from '../convex/_generated/api'
import { callManagedAi } from '../convex/providerAccounting'
const modules = import.meta.glob('../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })
const page = { numItems: 20, cursor: null }
async function fixture() {
  const t = convexTest(schema, modules), owner = t.withIdentity(identity('owner-a'))
  const missionId = await t.run(ctx => ctx.db.insert('missions', { title: 'Accounting', mission: 'Record controlled provider usage', autonomy: 'guided', budget: 5, status: 'running', completion: 0, approved: true, ownerKey: 'owner-a' }))
  const missionRunId = await t.run(ctx => ctx.db.insert('missionRuns', { missionId, startedAt: Date.now(), deadlineAt: Date.now() + 60000, maxRetries: 1, retries: 0, status: 'running', currentStage: 'council', nextActionAt: Date.now() }))
  vi.stubEnv('GROQ_API_KEY', 'controlled-test-key'); vi.stubEnv('CEREBRAS_API_KEY', ''); vi.stubEnv('CLOUDFLARE_API_TOKEN', '')
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Controlled answer' } }], model: 'served-test', usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, cost: 0.001 } }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const ctx = { runMutation: (ref: any, args: any) => t.mutation(ref, args) }
  const args = { ownerKey: 'owner-a', missionId, missionRunId, stage: 'controlled-council', role: 'planner' as const, prompt: 'Controlled prompt', maxTokens: 100 }
  return { t, owner, missionId, missionRunId, fetchMock, ctx, args }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
describe('durable provider invocation accounting', () => {
  it('stores explicit mission/run attribution and idempotent reports alongside legacy usage', async () => {
    const { t, owner, missionId, missionRunId, ctx, args, fetchMock } = await fixture()
    expect(await callManagedAi(ctx, args)).toBe('Controlled answer')
    const row = (await owner.query(api.providerUsage.history, { missionId, paginationOpts: page })).page[0]
    expect(row).toMatchObject({ missionId, missionRunId, outcome: 'succeeded', usageStatus: 'recorded', observedReports: 1 })
    expect(row.reports).toHaveLength(1)
    expect(row.reports[0]).toMatchObject({ provider: 'groq', model: 'served-test', totalTokens: 20, reportedCostUsd: 0.001 })
    const { ordinal, ...report } = row.reports[0]
    await t.mutation(internal.manifestIntelligence.recordProviderUsageInternal, { ownerKey: 'owner-a', invocationId: row._id, reportOrdinal: ordinal, ...report })
    expect(await t.run(async c => (await c.db.query('memories').collect()).filter(m => m.category === 'manifest-provider-usage'))).toHaveLength(1)
    await expect(t.mutation(internal.manifestIntelligence.recordProviderUsageInternal, { ownerKey: 'owner-a', invocationId: row._id, reportOrdinal: ordinal, ...report, reportedCostUsd: 1 })).rejects.toThrow(/Conflicting/)
    await expect(t.mutation(internal.providerUsage.finish, { invocationId: row._id, outcome: 'failed', observedReports: 1 })).rejects.toThrow(/immutable/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('retains a successful answer and visible accounting gap without replaying inference', async () => {
    const { t, owner, ctx, args, fetchMock } = await fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fault = { runMutation: (ref: any, values: any) => getFunctionName(ref) === 'manifestIntelligence:recordProviderUsageInternal' ? Promise.reject(new Error('Controlled recorder failure')) : ctx.runMutation(ref, values) }
    expect(await callManagedAi(fault, args)).toBe('Controlled answer')
    const row = (await owner.query(api.providerUsage.history, { paginationOpts: page })).page[0]
    expect(row).toMatchObject({ outcome: 'succeeded', usageStatus: 'gap', observedReports: 1, reports: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await t.run(c => c.db.query('memories').collect())).toEqual([])
  })
  it('leaves a durable pending record if finalization fails after inference', async () => {
    const { owner, ctx, args, fetchMock } = await fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fault = { runMutation: (ref: any, values: any) => getFunctionName(ref) === 'providerRecovery:complete' ? Promise.reject(new Error('Controlled finish failure')) : ctx.runMutation(ref, values) }
    await expect(callManagedAi(fault, args)).rejects.toThrow(/durable result confirmation failed/)
    expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page[0]).toMatchObject({ outcome: 'pending', usageStatus: 'pending' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('records missing metadata and provider failures without inventing zero cost', async () => {
    const { owner, ctx, args, fetchMock } = await fixture()
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'No usage metadata' } }] }), { status: 200 }))
    await callManagedAi(ctx, args)
    expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page[0]).toMatchObject({ outcome: 'succeeded', usageStatus: 'missing', reports: [] })
    fetchMock.mockImplementationOnce(async () => new Response('Unavailable', { status: 503 }))
    await expect(callManagedAi(ctx, { ...args, stage: 'failed-provider' })).rejects.toThrow()
    expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page[0]).toMatchObject({ outcome: 'failed', usageStatus: 'missing' })
  })
  it('retains an uncertain failure and blocks the same runner stage from replay', async () => {
    const { owner, ctx, args, fetchMock } = await fixture()
    vi.stubEnv('CEREBRAS_API_KEY', 'configured-fallback')
    fetchMock.mockRejectedValueOnce(new Error('connection lost after dispatch'))
    await expect(callManagedAi(ctx, args)).rejects.toThrow(/Automatic fallback stopped/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page[0]).toMatchObject({ outcome: 'failed', usageStatus: 'missing', reports: [] })
    await expect(callManagedAi(ctx, args)).rejects.toThrow(/No inference request was started/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects foreign history, mismatched runs and ledger start failure before network access', async () => {
    const { t, owner, ctx, args, missionId, fetchMock } = await fixture()
    await expect(t.query(api.providerUsage.history, { paginationOpts: page })).rejects.toThrow()
    await expect(t.withIdentity(identity('owner-b')).query(api.providerUsage.history, { missionId, paginationOpts: page })).rejects.toThrow()
    expect((await t.withIdentity(identity('owner-b')).query(api.providerUsage.history, { paginationOpts: page })).page).toEqual([])
    const foreign = await t.run(c => c.db.insert('missions', { title: 'Foreign', mission: 'Private', ownerKey: 'owner-b', budget: 0, status: 'draft', approved: false, completion: 0, autonomy: 'guided' }))
    await expect(callManagedAi(ctx, { ...args, missionId: foreign })).rejects.toThrow(/No inference request was started/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page).toEqual([])
  })
  it('rejects an active duplicate and reuses the completed answer for a delayed worker', async () => {
    const { owner, ctx, args, fetchMock } = await fixture()
    let release!: () => void
    let entered!: () => void
    const active = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    fetchMock.mockImplementationOnce(async () => {
      entered()
      await gate
      return new Response(JSON.stringify({ choices: [{ message: { content: 'First answer' } }] }), { status: 200 })
    })
    const first = callManagedAi(ctx, args)
    await active
    try {
      await expect(callManagedAi(ctx, args)).rejects.toThrow(/No inference request was started/)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page).toHaveLength(1)
    } finally { release() }
    expect(await first).toBe('First answer')
    expect(await callManagedAi(ctx, args)).toBe('First answer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('keeps unresolved finalization reserved across runner retries', async () => {
    const { t, owner, ctx, args, missionRunId, fetchMock } = await fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fault = { runMutation: (ref: any, values: any) => getFunctionName(ref) === 'providerRecovery:complete' ? Promise.reject(new Error('Interrupted finalization')) : ctx.runMutation(ref, values) }
    await expect(callManagedAi(fault, args)).rejects.toThrow(/durable result confirmation failed/)
    await t.run(c => c.db.patch(missionRunId, { retries: 1 }))
    await expect(callManagedAi(ctx, args)).rejects.toThrow(/No inference request was started/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await owner.query(api.providerUsage.history, { paginationOpts: page })).page).toHaveLength(1)
  })
  it('recovers a committed answer after a lost completion acknowledgement', async () => {
    const { owner, ctx, args, fetchMock } = await fixture()
    const fault = { runMutation: async (ref: any, values: any) => {
      const result = await ctx.runMutation(ref, values)
      if (getFunctionName(ref) === 'providerRecovery:complete') throw new Error('Lost acknowledgement')
      return result
    } }
    await expect(callManagedAi(fault, args)).rejects.toThrow(/durable result confirmation failed/)
    expect(await callManagedAi(ctx, args)).toBe('Controlled answer')
    const rows = (await owner.query(api.providerUsage.history, { paginationOpts: page })).page
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('answer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('rejects changed requests and preserves immutable stored answers', async () => {
    const { t, ctx, args, fetchMock } = await fixture()
    await callManagedAi(ctx, args)
    await expect(callManagedAi(ctx, { ...args, prompt: 'Changed prompt' })).rejects.toThrow(/No inference request was started/)
    await expect(callManagedAi(ctx, { ...args, maxTokens: 101 })).rejects.toThrow(/No inference request was started/)
    const result = (await t.run(c => c.db.query('providerResults').collect()))[0]
    await expect(t.mutation(internal.providerRecovery.complete, { invocationId: result.invocationId, requestDigest: result.requestDigest, answer: 'Conflicting answer', observedReports: 1 })).rejects.toThrow(/immutable/)
    expect(await callManagedAi(ctx, args)).toBe('Controlled answer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('blocks legacy succeeded rows without inventing an answer or rerunning inference', async () => {
    const { t, ctx, args, fetchMock } = await fixture()
    const { prompt: _prompt, maxTokens: _tokens, ...identityArgs } = args
    const invocationId = await t.mutation(internal.providerUsage.begin, identityArgs)
    await t.mutation(internal.providerUsage.finish, { invocationId, outcome: 'succeeded', observedReports: 0 })
    await expect(callManagedAi(ctx, args)).rejects.toThrow(/No inference request was started/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('keeps direct operator invocations independent', async () => {
    const { ctx, args, fetchMock } = await fixture()
    const { missionRunId: _run, ...direct } = args
    await callManagedAi(ctx, direct)
    await callManagedAi(ctx, direct)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('leaves oversized responses pending without persisting partial answers', async () => {
    const { t, ctx, args, fetchMock } = await fixture()
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'x'.repeat(262145) } }] }), { status: 200 }))
    await expect(callManagedAi(ctx, args)).rejects.toThrow(/durable result confirmation failed/)
    expect(await t.run(c => c.db.query('providerResults').collect())).toEqual([])
    await expect(callManagedAi(ctx, args)).rejects.toThrow(/No inference request was started/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('handles concurrent independent invocations without combining their receipts', async () => {
    const { owner, ctx, args, fetchMock } = await fixture()
    await Promise.all(Array.from({ length: 8 }, (_, i) => callManagedAi(ctx, { ...args, stage: 'concurrent-' + i })))
    const rows = (await owner.query(api.providerUsage.history, { paginationOpts: page })).page
    expect(rows).toHaveLength(8)
    expect(new Set(rows.map(row => row._id)).size).toBe(8)
    expect(rows.every(row => row.outcome === 'succeeded' && row.reports.length === 1)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
})
