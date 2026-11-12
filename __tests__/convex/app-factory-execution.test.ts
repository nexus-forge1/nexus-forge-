// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')

async function fixture(status: 'draft' | 'accepted' = 'accepted', kind: 'database-migration-plan' | 'browser-qa-plan' | 'integration-contract' = 'integration-contract') {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ subject: 'owner' })
  const other = t.withIdentity({ subject: 'other' })
  const seeded = await t.run(async ctx => {
    const missionId = await ctx.db.insert('missions', { ownerKey: 'owner', title: 'Exec fixture', mission: 'Exec fixture', autonomy: 'governed', budget: 0, status: 'draft', completion: 0, approved: false })
    const templateId = await ctx.db.insert('studioTemplates', { ownerKey: 'owner', title: 'Exec template', brief: 'fixture', audience: 'operator', criteria: ['Safe'], budget: 0, createdAt: 1 })
    const projectId = await ctx.db.insert('studioProjects', { ownerKey: 'owner', title: 'Exec project', description: 'fixture', missionId, templateId, createdAt: 1 })
    const draftId = await ctx.db.insert('appFactoryDrafts', { ownerKey: 'owner', projectId, draftKey: 'integration-task-api', kind, title: 'Task API', revision: 1, content: '{"kind":"integration-contract"}', contentDigest: 'digest-v1', status, createdAt: 1 })
    return { projectId, draftId }
  })
  return { t, owner, other, ...seeded }
}

describe('App Factory execution lifecycle ledger', () => {
  it('prepares only accepted exact latest revisions and requires evidence for completion', async () => {
    const { t, owner, projectId, draftId } = await fixture()
    const runId = await owner.mutation(api.appFactoryExecution.prepare, { projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1', sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12', operatorReference: 'change:ticket-123' })
    expect((await owner.query(api.appFactoryExecution.list, { projectId }))[0]).toMatchObject({ _id: runId, status: 'prepared', draftRevision: 1, draftDigest: 'digest-v1' })
    await owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'prepared', status: 'running', summary: 'Operator started controlled work.' })
    await expect(owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'running', status: 'completed', summary: 'done' })).rejects.toThrow(/evidence reference/)
    await expect(owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'prepared', status: 'completed', summary: 'stale transition', evidenceReference: 'evidence:run-123' })).rejects.toThrow(/status changed/)
    await expect(owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'running', status: 'completed', summary: 'Operator attached completion proof.', evidenceReference: 'evidence:run-123' })).rejects.toThrow(/verified evidence adapter/)
    const saved = await t.run(ctx => ctx.db.get('appFactoryExecutionRuns', runId))
    expect(saved).toMatchObject({ status: 'running', draftDigest: 'digest-v1' })
  })

  it('requires a retained passing exact-revision receipt for browser QA completion', async () => {
    const { t, owner, projectId, draftId } = await fixture('accepted', 'browser-qa-plan')
    await t.run(async ctx => {
      await ctx.db.insert('appFactoryQaRuns', { ownerKey: 'owner', projectId, draftId, draftKey: 'integration-task-api', draftRevision: 1, draftDigest: 'digest-v1', targetUrl: 'https://example.com', runner: 'operator-runner', runReference: 'qa-run-456', commitSha: 'abcdef1234567890abcdef1234567890abcdef12', outcome: 'passed', cases: [{ key: 'home-loads', status: 'passed', evidenceReference: 'screenshot:home', note: 'Home page loaded' }], createdAt: 2 })
    })
    const runId = await owner.mutation(api.appFactoryExecution.prepare, { projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1', sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12', operatorReference: 'ticket-456' })
    await owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'prepared', status: 'running', summary: 'QA started.' })
    await expect(owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'running', status: 'completed', summary: 'Wrong receipt', evidenceReference: 'qa-run-other' })).rejects.toThrow(/exact draft revision, digest, and source commit/)
    await owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'running', status: 'completed', summary: 'Exact QA receipt attached.', evidenceReference: 'qa-run-456' })
    expect(await t.run(ctx => ctx.db.get('appFactoryExecutionRuns', runId))).toMatchObject({ status: 'completed', evidenceReference: 'qa-run-456' })
  })

  it('accepts a verified target-app CI receipt bound to the exact draft and source commit', async () => {
    const { t, owner, projectId, draftId } = await fixture('accepted', 'browser-qa-plan')
    const sourceCommit = 'abcdef1234567890abcdef1234567890abcdef12'
    const receiptId = await t.run(ctx => ctx.db.insert('appFactoryQaCiReceipts', {
      ownerKey: 'owner', projectId, draftId, draftKey: 'integration-task-api', draftRevision: 1, draftDigest: 'digest-v1',
      workflowRunId: 'target-app:123456:1', runUrl: 'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456',
      sourceCommit, snapshotSha: 'https://target.example.test', checkId: 98765, conclusion: 'success',
      reportDigest: 'a'.repeat(64), criteriaCount: 2, screenshotCount: 2, pageErrorsCount: 0, allPassed: true, verifiedAt: 3,
    }))
    const runId = await owner.mutation(api.appFactoryExecution.prepare, { projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1', sourceCommit, operatorReference: 'ticket-target-qa-1' })
    await owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'prepared', status: 'running', summary: 'Target QA running.' })
    await owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'running', status: 'completed', summary: 'Verified target run attached.', evidenceReference: 'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456' })
    expect(await t.run(ctx => ctx.db.get('appFactoryExecutionRuns', runId))).toMatchObject({ status: 'completed', evidenceReference: 'https://github.com/nexus-forge1/nexus-forge-/actions/runs/123456' })
    expect(receiptId).toBeTruthy()
  })

  it('rejects unaccepted, stale, cross-owner and invalid transitions', async () => {
    const { owner, other, projectId, draftId } = await fixture('draft')
    await expect(owner.mutation(api.appFactoryExecution.prepare, { projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1', sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12', operatorReference: 'ticket-123' })).rejects.toThrow(/accepted/)
    const accepted = await fixture()
    const runId = await accepted.owner.mutation(api.appFactoryExecution.prepare, { projectId: accepted.projectId, draftId: accepted.draftId, expectedRevision: 1, expectedDigest: 'digest-v1', sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12', operatorReference: 'ticket-124' })
    await expect(other.query(api.appFactoryExecution.list, { projectId: accepted.projectId })).rejects.toThrow()
    await expect(other.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'prepared', status: 'running', summary: 'not allowed' })).rejects.toThrow()
    await expect(accepted.owner.mutation(api.appFactoryExecution.transition, { runId, expectedStatus: 'prepared', status: 'completed', summary: 'skip state', evidenceReference: 'evidence:run-124' })).rejects.toThrow(/Invalid execution lifecycle/)
    await expect(accepted.owner.mutation(api.appFactoryExecution.prepare, { projectId: accepted.projectId, draftId: accepted.draftId, expectedRevision: 1, expectedDigest: 'stale-digest', sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12', operatorReference: 'ticket-125' })).rejects.toThrow(/Exact accepted revision/)
  })
})
