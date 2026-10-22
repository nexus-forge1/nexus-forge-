// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import type { Id } from '../convex/_generated/dataModel'
import schema from '../convex/schema'
import { api } from '../convex/_generated/api'
import { callAiProvider } from '../convex/aiProvider'

vi.mock('../convex/aiProvider', () => ({ callAiProvider: vi.fn() }))
const modules = import.meta.glob('../convex/**/*.ts')
afterEach(() => vi.clearAllMocks())

describe('artifact research handoff', () => {
  it('retains the first draft when corrective inference becomes uncertain', async () => {
    const t = convexTest(schema, modules)
    const missionId = await t.run(ctx => ctx.db.insert('missions', { title: 'Retained draft', mission: 'Create a local tool', ownerKey: 'owner-a', autonomy: 'guided', approved: true, budget: 0, status: 'running', completion: 0 }))
    vi.mocked(callAiProvider).mockResolvedValueOnce('<html>first incomplete draft</html>').mockRejectedValueOnce(new Error('Automatic fallback stopped; review invocation'))
    const owner = t.withIdentity({ subject: 'owner-a' })
    await expect(owner.action(api.artifacts.generate, { missionId, mission: 'ignored', artifactType: 'web-app', artifactName: 'Retained draft' })).rejects.toThrow(/Automatic fallback stopped/)
    const drafts = await owner.query(api.artifacts.list, { missionId })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ content: '<html>first incomplete draft</html>', requiresApproval: true, qualityPassed: false, status: 'awaiting_approval' })
    expect(callAiProvider).toHaveBeenCalledTimes(2)
    await expect(owner.mutation(api.artifacts.approve, { id: drafts[0]._id, approved: true })).rejects.toThrow()
    const metrics = await owner.query(api.platformTasks.summary, { missionId })
    expect(metrics.rows[1]).toMatchObject({ failures: 1, pending: 0 })
  })
  it('uses saved mission research and contract on the first attempt and retry', async () => {
    const t = convexTest(schema, modules)
    const missionId = await t.run(async ctx => {
      const mission = await ctx.db.insert('missions', { title: 'Builder context', mission: 'SAVED CONTRACT ONLY', ownerKey: 'owner-a', autonomy: 'guided', approved: true, budget: 0, status: 'running', completion: 0 })
      const other = await ctx.db.insert('missions', { title: 'Other mission', mission: 'Other', ownerKey: 'owner-a', autonomy: 'guided', approved: true, budget: 0, status: 'running', completion: 0 })
      await ctx.db.insert('research', { missionId: mission, query: 'Relevant question', result: 'SAVED RESEARCH SIGNAL', citations: ['https://example.com/source'], createdAt: 1 })
      await ctx.db.insert('research', { missionId: other, query: 'Other question', result: 'UNRELATED RESEARCH', citations: [], createdAt: 1 })
      return mission
    })
    // Intentionally short output exercises bounded regeneration, then draft persistence.
    vi.mocked(callAiProvider).mockResolvedValue('<html>draft</html>')
    const operator = t.withIdentity({ subject: 'owner-a', issuer: 'https://test', tokenIdentifier: 'https://test|owner-a' })
    const result = await operator.action(api.artifacts.generate, { missionId, mission: 'BROWSER OVERRIDE', artifactType: 'web-app', artifactName: 'Context test' })
    expect(callAiProvider).toHaveBeenCalledTimes(2)
    for (const call of vi.mocked(callAiProvider).mock.calls) {
      expect(call[1]).toContain('SAVED CONTRACT ONLY')
      expect(call[1]).toContain('SAVED RESEARCH SIGNAL')
      expect(call[1]).toContain('https://example.com/source')
      expect(call[1]).not.toContain('BROWSER OVERRIDE')
      expect(call[1]).not.toContain('UNRELATED RESEARCH')
    }
    const saved = await t.run(ctx => ctx.db.get(result.artifactId as Id<'artifacts'>))
    expect(saved?.missionId).toBe(missionId)
    expect(saved?.requiresApproval).toBe(true)
    const drafts = await operator.query(api.artifacts.list, { missionId })
    expect(drafts).toHaveLength(2)
    expect(drafts.every(row => row.requiresApproval && row.content === '<html>draft</html>')).toBe(true)
    const metrics = await operator.query(api.platformTasks.summary, { missionId })
    expect(metrics.rows[1]).toMatchObject({ successes: 0, failures: 1, pending: 0, timedCount: 1 })
  })
})
