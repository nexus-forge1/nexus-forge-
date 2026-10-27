// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTest } from 'convex-test'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { internal } from '../convex/_generated/api'
import { normalizeUrl } from '../convex/readiness'

const modules = import.meta.glob('../convex/**/*.ts')
const runUrl = 'https://github.com/nexus-forge1/no-dispatch/actions/runs/123'
const commitSha = 'a'.repeat(40)
// Minimal database harness for these handlers, including the task receipt index.
// Full-schema integration tests remain separate from this focused regression set.
const schema = defineSchema({
  platformTaskRuns: defineTable(v.any()).index('by_source', ['sourceRef']),
}, { schemaValidation: false, strictTableNameTypes: false })
async function fixture(stage = 'github', approved = true) {
  // Exercise the real handlers without loading unrelated optional feature schemas.
  const t = convexTest(schema, modules)
  const ids = await t.run(async ctx => {
    const missionId = await ctx.db.insert('missions', { title: 'Hardening', mission: 'Verify production guards', ownerKey: 'owner', autonomy: 'guided', budget: 0, approved: true, status: 'running', completion: 0 })
    const id = await ctx.db.insert('deliveries', { missionId, target: 'nexus-forge1/no-dispatch', branch: 'main', stage: stage as any, approved, status: 'Fixture', evidence: 'Fixture', createdAt: 1 })
    return { missionId, id }
  })
  return { t, ...ids }
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers() })

describe('production hardening', () => {
  it.each(['prepared', 'approval', 'build', 'test', 'deploy', 'blocked'])('rejects a first workflow receipt in stage %s atomically', async stage => {
    const { t, id } = await fixture(stage)
    const before = await t.run(ctx => ctx.db.get(id))
    await expect(t.mutation(internal.delivery.recordWorkflowResult, { id, runUrl, commitSha, conclusion: 'success', summary: '' })).rejects.toThrow(/transition/i)
    expect(await t.run(ctx => ctx.db.get(id))).toEqual(before)
    expect(await t.run(ctx => ctx.db.query('auditEvents').collect())).toHaveLength(0)
  })
  it('makes failure terminal and rejects later success', async () => {
    const { t, id } = await fixture()
    await t.mutation(internal.delivery.recordWorkflowResult, { id, runUrl, commitSha, conclusion: 'failure', summary: '' })
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ stage: 'blocked' })
    await expect(t.mutation(internal.delivery.recordWorkflowResult, { id, runUrl, commitSha, conclusion: 'success', summary: '' })).rejects.toThrow(/conflicting/i)
  })
  it.each([undefined, 'Basic secret', 'Bearer incorrect', 'Bearer test-secret-extra'])('rejects invalid callback authorization %s', async authorization => {
    vi.stubEnv('NEXUS_FORGE_DELIVERY_SECRET', 'test-secret')
    const { t } = await fixture()
    const response = await t.fetch('/github-actions/delivery-result', { method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body: '{}' })
    expect(response.status).toBe(401)
  })
  it('accepts valid authorization and records the expected workflow stage', async () => {
    vi.stubEnv('NEXUS_FORGE_DELIVERY_SECRET', 'test-secret')
    const { t, id } = await fixture()
    const response = await t.fetch('/github-actions/delivery-result', { method: 'POST', headers: { Authorization: 'Bearer test-secret' }, body: JSON.stringify({ deliveryId: id, runUrl, commitSha, conclusion: 'success' }) })
    expect(response.status).toBe(200)
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ stage: 'test' })
  })
  it.each([false, true])('rejects invalid deployment provenance before fetching (approved=%s)', async approved => {
    vi.stubEnv('NEXUS_FORGE_DELIVERY_SECRET', 'test-secret')
    const { t, id } = await fixture('test', approved)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await t.fetch('/github-actions/deployment-result', { method: 'POST', headers: { Authorization: 'Bearer test-secret' }, body: JSON.stringify({ deliveryId: id, runUrl, commitSha, deploymentUrl: 'https://example.com/' }) })
    expect(response.status).toBe(409)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await t.run(ctx => ctx.db.query('readinessRuns').collect())).toHaveLength(0)
  })
  it.each(['https://localhost./', 'https://service.local./', 'https://metadata.google.internal./', 'https://[::1]/', 'https://127.1/'])('rejects canonical local target %s', url => {
    expect(() => normalizeUrl(url)).toThrow()
  })
  it('does not follow redirects to local hosts', async () => {
    const { t, id } = await fixture()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://localhost./secret' } }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await t.action(internal.readiness.runForDelivery, { deliveryId: id, siteUrl: 'https://example.com/' })
    expect(result.status).toBe('fail')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('bounds readiness response size', async () => {
    const { t, id } = await fixture()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a'.repeat(1_000_001))))
    const result = await t.action(internal.readiness.runForDelivery, { deliveryId: id, siteUrl: 'https://example.com/' })
    expect(result.status).toBe('fail')
  })
  it('does not start a cancelled mission even if its approval flag is stale', async () => {
    const { t, missionId } = await fixture()
    await t.run(ctx => ctx.db.patch(missionId, { status: 'cancelled', approved: true }))
    expect(await t.mutation(internal.missionRunner.startApproved, { missionId })).toBeNull()
    expect(await t.run(ctx => ctx.db.query('missionRuns').collect())).toHaveLength(0)
  })
  it('keeps identical callback receipts idempotent after verification', async () => {
    const { t, id } = await fixture()
    const workflow = { id, runUrl, commitSha, conclusion: 'success', summary: '' }
    const deployment = { id, runUrl, commitSha, deploymentUrl: 'https://example.com/', summary: '', readinessPassedCount: 6, readinessTotalCount: 6 }
    await t.mutation(internal.delivery.recordWorkflowResult, workflow)
    await t.mutation(internal.delivery.recordDeploymentResult, deployment)
    const before = await t.run(ctx => ctx.db.get(id))
    const audits = await t.run(ctx => ctx.db.query('auditEvents').collect())
    await t.mutation(internal.delivery.recordWorkflowResult, workflow)
    await t.mutation(internal.delivery.recordDeploymentResult, deployment)
    expect(await t.run(ctx => ctx.db.get(id))).toEqual(before)
    expect(await t.run(ctx => ctx.db.query('auditEvents').collect())).toEqual(audits)
  })
  it('follows a public redirect once and records a passing canonical gate', async () => {
    const { t, id } = await fixture()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://public.example/' } }))
      .mockResolvedValueOnce(new Response('<!doctype html><html><head><title>Ready</title><meta name="viewport" content="width=device-width"><meta charset="utf-8"></head><body>Ready</body></html>'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await t.action(internal.readiness.runForDelivery, { deliveryId: id, siteUrl: 'https://example.com/' })
    expect(result).toMatchObject({ status: 'pass', passedCount: 6, totalCount: 6 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://public.example/')
  })
})
