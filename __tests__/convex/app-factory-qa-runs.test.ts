// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')
const passingCases = [
  { key: 'route-load', status: 'passed' as const, evidenceReference: 'evidence:route-load-001', note: 'Route root rendered.' },
  { key: 'responsive-375', status: 'passed' as const, evidenceReference: 'evidence:responsive-375-001', note: 'No horizontal overflow.' },
]

async function fixture() {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ subject: 'owner' })
  const other = t.withIdentity({ subject: 'other' })
  const seeded = await t.run(async ctx => {
    const missionId = await ctx.db.insert('missions', {
      ownerKey: 'owner', title: 'QA fixture', mission: 'QA fixture mission',
      autonomy: 'governed', budget: 0, status: 'draft', completion: 0, approved: false,
    })
    const templateId = await ctx.db.insert('studioTemplates', {
      ownerKey: 'owner', title: 'QA fixture template', brief: 'QA fixture',
      audience: 'test operator', criteria: ['Route loads'], budget: 0, createdAt: 1,
    })
    const projectId = await ctx.db.insert('studioProjects', {
      ownerKey: 'owner', title: 'QA project', description: 'fixture',
      missionId, templateId, createdAt: 1,
    })
    const draftId = await ctx.db.insert('appFactoryDrafts', {
      ownerKey: 'owner', projectId, draftKey: 'browser-qa-plan', kind: 'browser-qa-plan',
      title: 'Browser acceptance', revision: 1, content: '{"kind":"browser-qa-plan"}',
      contentDigest: 'digest-v1', status: 'draft', createdAt: 1,
    })
    return { projectId, draftId }
  })
  return { t, owner, other, ...seeded }
}

describe('persistent Browser QA receipts', () => {
  it('derives a passing result on the server and only accepts the retained receipt reference', async () => {
    const { t, owner, projectId, draftId } = await fixture()
    const receiptId = await owner.mutation(api.appFactoryQaRuns.record, {
      projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1',
      targetUrl: 'https://qa.example.test/features/private-tasks',
      runner: 'agent-browser 1.0', runReference: 'evidence:qa-run-001',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12', cases: passingCases,
    })
    const rows = await owner.query(api.appFactoryQaRuns.listByDraft, { projectId, draftId })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ _id: receiptId, outcome: 'passed', draftRevision: 1, draftDigest: 'digest-v1', targetUrl: 'https://qa.example.test/features/private-tasks' })
    await expect(owner.mutation(api.appFactoryDrafts.review, {
      draftId, expectedRevision: 1, status: 'accepted', evidenceReference: 'evidence:made-up-run',
    })).rejects.toThrow(/target-app run/)
    const acceptedId = await owner.mutation(api.appFactoryDrafts.review, {
      draftId, expectedRevision: 1, status: 'accepted', evidenceReference: receiptId,
    })
    expect((await t.run(ctx => ctx.db.get('appFactoryDrafts', acceptedId)))?.status).toBe('accepted')
    expect((await t.run(ctx => ctx.db.get('appFactoryQaRuns', receiptId)))?.draftDigest).toBe('digest-v1')
  })

  it('rejects anonymous and cross-owner receipt access without changing retained evidence', async () => {
    const { t, owner, other, projectId, draftId } = await fixture()
    const receiptId = await owner.mutation(api.appFactoryQaRuns.record, {
      projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1',
      targetUrl: 'https://qa.example.test/', runner: 'agent-browser',
      runReference: 'evidence:qa-run-002', commitSha: 'abcdef1234567890abcdef1234567890abcdef12', cases: passingCases,
    })
    const before = await t.run(ctx => ctx.db.query('appFactoryQaRuns').collect())
    for (const caller of [t, other]) {
      await expect(caller.query(api.appFactoryQaRuns.listByDraft, { projectId, draftId })).rejects.toThrow()
      await expect(caller.mutation(api.appFactoryQaRuns.record, {
        projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1',
        targetUrl: 'https://qa.example.test/', runner: 'agent-browser',
        runReference: 'evidence:qa-run-003', commitSha: 'abcdef1234567890abcdef1234567890abcdef12', cases: passingCases,
      })).rejects.toThrow()
    }
    expect(await t.run(ctx => ctx.db.query('appFactoryQaRuns').collect())).toEqual(before)
    expect(before[0]._id).toBe(receiptId)
  })

  it('rejects stale source revisions and unsafe targets or incomplete pass claims', async () => {
    const { t, owner, projectId, draftId } = await fixture()
    await t.run(ctx => ctx.db.insert('appFactoryDrafts', {
      ownerKey: 'owner', projectId, draftKey: 'browser-qa-plan', kind: 'browser-qa-plan',
      title: 'Browser acceptance v2', revision: 2, previousRevisionId: draftId,
      content: '{"kind":"browser-qa-plan","version":2}', contentDigest: 'digest-v2',
      status: 'draft', createdAt: 2,
    }))
    const base = {
      projectId, draftId, expectedRevision: 1, expectedDigest: 'digest-v1',
      runner: 'agent-browser', runReference: 'evidence:qa-run-004',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12', cases: passingCases,
    }
    await expect(owner.mutation(api.appFactoryQaRuns.record, { ...base, targetUrl: 'https://qa.example.test/' })).rejects.toThrow(/latest plan revision/)
    const latestId = await t.run(async ctx => (await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', projectId).eq('draftKey', 'browser-qa-plan')).order('desc').first())!._id)
    const latestBase = { ...base, draftId: latestId, expectedRevision: 2, expectedDigest: 'digest-v2' }
    for (const targetUrl of ['http://example.com/', 'https://user:pass@qa.example.test/', 'https://qa.example.test/?token=abc', 'https://qa.example.test/#fragment']) {
      await expect(owner.mutation(api.appFactoryQaRuns.record, { ...latestBase, targetUrl })).rejects.toThrow()
    }
    await expect(owner.mutation(api.appFactoryQaRuns.record, {
      ...latestBase, targetUrl: 'https://qa.example.test/',
      cases: [{ key: 'route-load', status: 'passed', evidenceReference: '', note: 'No retained proof' }],
    })).rejects.toThrow(/evidence reference/)
    const partialId = await owner.mutation(api.appFactoryQaRuns.record, {
      ...latestBase, targetUrl: 'https://qa.example.test/',
      cases: [{ key: 'route-load', status: 'passed', evidenceReference: 'evidence:route-load-002', note: 'Route loaded.' }, { key: 'auth-boundary', status: 'not-run', evidenceReference: '', note: 'Not executed.' }],
    })
    expect((await t.run(ctx => ctx.db.get('appFactoryQaRuns', partialId)))?.outcome).toBe('partial')
  })
})
