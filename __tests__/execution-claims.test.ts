// @vitest-environment edge-runtime
import {ollamaFixture} from './helpers/ollama-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { getFunctionName } from 'convex/server'
import schema from '../convex/schema'
import { api, internal } from '../convex/_generated/api'
import { exclusiveWork } from '../convex/exclusiveWork'
const modules = import.meta.glob('../convex/**/*.ts')
async function fixture() {
  const t = convexTest(schema, modules)
  const missionId = await t.run(c => c.db.insert('missions', { title: 'Claims', mission: 'Controlled recovery check', autonomy: 'guided', budget: 0, status: 'running', completion: 0, approved: true, ownerKey: 'claims-owner' }))
  const runId = await t.run(c => c.db.insert('missionRuns', { missionId, startedAt: Date.now(), deadlineAt: Date.now() + 60000, maxRetries: 2, retries: 0, status: 'running', currentStage: 'orchestration', nextActionAt: Date.now() }))
  const ctx = { runMutation: (ref: any, args: any) => t.mutation(ref, args) }
  const options = { missionId, scope: 'council' as const, workKey: 'runner:' + runId, retain: true }
  return { t, missionId, runId, ctx, options }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })
describe('durable mission execution claims', () => {
  it('rejects a contender before its work runs, then reuses the completed outcome', async () => {
    const { t, ctx, options } = await fixture()
    let release!: () => void, entered!: () => void
    const active = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const winner = vi.fn(async () => { entered(); await gate; return { ok: true, summary: 'Persisted Council outcome' } })
    const loser = vi.fn(async () => ({ ok: true, summary: 'Duplicate' }))
    const first = exclusiveWork(ctx, options, winner)
    await active
    try { await expect(exclusiveWork(ctx, options, loser)).rejects.toThrow(/already active/) }
    finally { release() }
    expect(await first).toEqual({ ok: true, summary: 'Persisted Council outcome' })
    expect(await exclusiveWork(ctx, options, loser)).toEqual({ ok: true, summary: 'Persisted Council outcome' })
    expect(winner).toHaveBeenCalledOnce()
    expect(loser).not.toHaveBeenCalled()
    expect(await t.run(c => c.db.query('executionClaims').collect())).toHaveLength(1)
  })
  it('keeps interrupted work uncertain and blocks a different attempt for the mission', async () => {
    const { t, ctx, options } = await fixture()
    await expect(exclusiveWork(ctx, options, async () => { throw new Error('Interrupted') })).rejects.toThrow('Interrupted')
    await expect(exclusiveWork(ctx, { ...options, workKey: 'new-attempt' }, async () => null)).rejects.toThrow(/already active/)
    expect((await t.run(c => c.db.query('executionClaims').collect()))[0].status).toBe('uncertain')
  })
  it('recovers retained completion after its acknowledgement is lost', async () => {
    const { ctx, options } = await fixture()
    const fault = { runMutation: async (ref: any, args: any) => {
      const result = await ctx.runMutation(ref, args)
      if (getFunctionName(ref) === 'executionClaims:finish') throw new Error('Lost acknowledgement')
      return result
    } }
    await expect(exclusiveWork(fault, options, async () => 'Retained')).rejects.toThrow('Lost acknowledgement')
    const repeat = vi.fn(async () => 'Repeated')
    expect(await exclusiveWork(ctx, options, repeat)).toBe('Retained')
    expect(repeat).not.toHaveBeenCalled()
  })
  it('fences stale writes and deduplicates exact evidence, Council and learning commits', async () => {
    const { t, missionId, options } = await fixture()
    await t.mutation(internal.forge.createRuns, { missionId })
    const claim = await t.mutation(internal.executionClaims.acquire, { missionId: options.missionId, scope: options.scope, workKey: options.workKey })
    const evidence = { missionId, agent: 'Vision Architect', message: 'Saved finding', score: 0.8, severity: 'verified', executionClaimId: claim.claimId! }
    await t.mutation(internal.forge.recordAgentEvidence, evidence)
    await t.mutation(internal.forge.recordAgentEvidence, evidence)
    await expect(t.mutation(internal.forge.recordAgentEvidence, { ...evidence, message: 'Conflicting finding' })).rejects.toThrow(/Conflicting/)
    const council = { missionId, summary: 'Council decision', executionClaimId: claim.claimId! }
    await t.mutation(internal.forge.recordCouncilResult, council)
    await t.mutation(internal.forge.recordCouncilResult, council)
    const lesson = { missionId, lesson: 'Verified lesson', confidence: 0.8, executionClaimId: claim.claimId! }
    await t.mutation(internal.forge.recordLearningLesson, lesson)
    await t.mutation(internal.forge.recordLearningLesson, lesson)
    expect(await t.run(c => c.db.query('evidence').collect())).toHaveLength(2)
    expect(await t.run(c => c.db.query('memories').collect())).toHaveLength(1)
    await t.mutation(internal.executionClaims.finish, { claimId: claim.claimId!, result: '{}', retain: true })
    await expect(t.mutation(internal.forge.updateRun, { missionId, agent: 'Vision Architect', status: 'blocked', progress: 100, note: 'Stale', executionClaimId: claim.claimId! })).rejects.toThrow(/no longer active/)
    await expect(t.mutation(internal.forge.recordAgentEvidence, { ...evidence, effectKey: 'late' })).rejects.toThrow(/no longer active/)
    // An identical acknowledgement retry remains a no-op even after claim closure.
    await t.mutation(internal.forge.recordAgentEvidence, evidence)
    expect(await t.run(c => c.db.query('evidence').collect())).toHaveLength(2)
  })
  it('rejects cross-mission claim tokens and rolls back effect receipts on failed writes', async () => {
    const { t, missionId, options } = await fixture()
    const claim = await t.mutation(internal.executionClaims.acquire, { missionId: options.missionId, scope: options.scope, workKey: options.workKey })
    const foreign = await t.run(c => c.db.insert('missions', { title: 'Other', mission: 'Other', autonomy: 'guided', budget: 0, status: 'draft', completion: 0, approved: false, ownerKey: 'other-owner' }))
    await expect(t.mutation(internal.forge.recordAgentEvidence, { missionId: foreign, agent: 'Test', message: 'Private', score: 1, severity: 'verified', executionClaimId: claim.claimId! })).rejects.toThrow(/does not match/)
    expect(await t.run(c => c.db.query('executionEffects').collect())).toHaveLength(0)
    await t.mutation(internal.executionClaims.uncertain, { claimId: claim.claimId! })
    await expect(t.mutation(internal.forge.recordCouncilResult, { missionId, summary: 'Late', executionClaimId: claim.claimId! })).rejects.toThrow(/no longer active/)
    expect(await t.run(c => c.db.query('executionEffects').collect())).toHaveLength(0)
  })
  it('serializes ticks and rejects completion by a deleted old token', async () => {
    const { t, ctx, missionId } = await fixture()
    const options = { missionId, scope: 'tick' as const, workKey: 'tick-1', retain: false, skipBusy: true }
    const claim = await t.mutation(internal.executionClaims.acquire, { missionId, scope: 'tick', workKey: 'old' })
    const work = vi.fn(async () => null)
    expect(await exclusiveWork(ctx, options, work)).toBeNull()
    expect(work).not.toHaveBeenCalled()
    await t.mutation(internal.executionClaims.finish, { claimId: claim.claimId!, result: 'null', retain: false })
    expect(await exclusiveWork(ctx, options, work)).toBeNull()
    expect(work).toHaveBeenCalledOnce()
    await expect(t.mutation(internal.executionClaims.finish, { claimId: claim.claimId!, result: 'null', retain: false })).rejects.toThrow(/no longer active/)
  })
  it('guards actual Council actions before writes and reuses their completed domain outcome', async () => {
    const { t, missionId, runId } = await fixture()
    vi.stubEnv('OLLAMA_API_KEY', 'controlled-test-key')
    vi.stubEnv('CEREBRAS_API_KEY', '')
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '')
    let entered!: () => void, release!: () => void
    const active = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const response = () => new Response(JSON.stringify(ollamaFixture({ choices: [{ message: { content: 'Controlled Council finding and decision' } }] })), { status: 200 })
    const fetchMock = vi.fn(async () => response())
    fetchMock.mockImplementationOnce(async () => { entered(); await gate; return response() })
    vi.stubGlobal('fetch', fetchMock)
    const args = { missionId, mission: 'Controlled recovery check', missionRunId: runId }
    const first = t.action(internal.forge.orchestrateInternal, args)
    await active
    const counts = async () => t.run(async c => ({
      evidence: (await c.db.query('evidence').collect()).length,
      memories: (await c.db.query('memories').collect()).length,
      receipts: (await c.db.query('councilMemoryReceipts').collect()).length,
    }))
    const beforeContender = await counts()
    try {
      await expect(t.action(internal.forge.orchestrateInternal, args)).rejects.toThrow(/already active/)
      await expect(t.action(internal.forge.orchestrateInternal, { missionId, mission: args.mission })).rejects.toThrow(/already active/)
      expect(await counts()).toEqual(beforeContender)
    } finally { release() }
    const outcome = await first
    expect(outcome.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(8)
    const completedCounts = await counts()
    expect(completedCounts.evidence).toBeGreaterThan(6)
    expect(await t.action(internal.forge.orchestrateInternal, args)).toEqual(outcome)
    expect(await counts()).toEqual(completedCounts)
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })
  it('retries active contention only and never retries an uncertain reservation', async () => {
    const { t, ctx, missionId } = await fixture()
    const claim = await t.mutation(internal.executionClaims.acquire, { missionId, scope: 'tick', workKey: 'held' })
    const onBusy = vi.fn(async () => {})
    const work = vi.fn(async () => null)
    const options = { missionId, scope: 'tick' as const, workKey: 'contender', retain: false, skipBusy: true, onBusy }
    await exclusiveWork(ctx, options, work)
    expect(onBusy).toHaveBeenCalledOnce()
    await t.mutation(internal.executionClaims.uncertain, { claimId: claim.claimId! })
    await exclusiveWork(ctx, options, work)
    expect(onBusy).toHaveBeenCalledOnce()
    expect(work).not.toHaveBeenCalled()
  })
  it('waits for the final Council result even when all specialist rows are complete', async () => {
    const { t, missionId, runId, options } = await fixture()
    await t.mutation(internal.forge.createRuns, { missionId })
    await t.run(async c => { for (const row of await c.db.query('agentRuns').collect()) await c.db.patch(row._id, { status: 'complete', progress: 100 }) })
    const claim = await t.mutation(internal.executionClaims.acquire, { missionId, scope: 'council', workKey: options.workKey })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await t.action(internal.missionRunner.tickInternal, { runId })
    expect(await t.run(c => c.db.get(runId))).toMatchObject({ currentStage: 'agent_coordination', status: 'running' })
    expect(await t.run(c => c.db.query('artifacts').collect())).toHaveLength(0)
    await t.mutation(internal.executionClaims.uncertain, { claimId: claim.claimId! })
    await t.action(internal.missionRunner.tickInternal, { runId })
    expect(await t.run(c => c.db.get(runId))).toMatchObject({ currentStage: 'execution_recovery', status: 'paused' })
    expect(await t.run(c => c.db.query('artifacts').collect())).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects late Council writes after the runner has been blocked', async () => {
    const { t, missionId, runId, options } = await fixture()
    const claim = await t.mutation(internal.executionClaims.acquire, { missionId, scope: 'council', workKey: options.workKey })
    await t.run(c => c.db.patch(runId, { status: 'blocked' }))
    await expect(t.mutation(internal.forge.recordAgentEvidence, { missionId, agent: 'Late worker', message: 'Stale', score: 1, severity: 'verified', executionClaimId: claim.claimId! })).rejects.toThrow(/Runner no longer permits/)
    expect(await t.run(c => c.db.query('evidence').collect())).toHaveLength(0)
    expect(await t.run(c => c.db.query('executionEffects').collect())).toHaveLength(0)
  })
  it('limits unresolved metadata to the mission owner and excludes cached answers', async () => {
    const { t, missionId, options } = await fixture()
    await t.mutation(internal.executionClaims.acquire, { missionId, scope: options.scope, workKey: options.workKey })
    const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })
    await expect(t.query(api.executionClaims.unresolved, { missionId })).rejects.toThrow()
    await expect(t.withIdentity(identity('other-owner')).query(api.executionClaims.unresolved, { missionId })).rejects.toThrow()
    const rows = await t.withIdentity(identity('claims-owner')).query(api.executionClaims.unresolved, { missionId })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ scope: 'council', status: 'running' })
    expect(rows[0]).not.toHaveProperty('result')
    expect(rows[0]).not.toHaveProperty('workKey')
  })
  it('reconciles overlapping completed-mission ticks without duplicate outcomes or incidents', async () => {
    const { t, missionId, runId } = await fixture()
    await t.run(c => c.db.patch(missionId, { status: 'complete', completion: 100 }))
    await Promise.all(Array.from({ length: 4 }, () => t.action(internal.missionRunner.tickInternal, { runId })))
    const run = await t.run(c => c.db.get(runId))
    expect(run).toMatchObject({ status: 'complete', currentStage: 'complete', retries: 0 })
    const audits = await t.run(c => c.db.query('auditEvents').collect())
    expect(audits.filter(row => row.eventType === 'outcome:mission_complete')).toHaveLength(1)
    expect(await t.run(c => c.db.query('incidents').collect())).toHaveLength(0)
    expect(await t.run(c => c.db.query('executionClaims').collect())).toHaveLength(0)
  })
})
