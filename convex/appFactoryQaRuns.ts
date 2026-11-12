import { v, ConvexError } from 'convex/values'
import { query, mutation } from './_generated/server'
import { requireOperator } from './permissions'
import { ownedProject } from './studio'
import { bounded } from './studioModel'
import { deriveQaOutcome, validateQaTargetUrl } from './appFactoryModel'

const caseValidator = v.object({
  key: v.string(),
  status: v.union(v.literal('passed'), v.literal('failed'), v.literal('not-run')),
  evidenceReference: v.string(),
  note: v.string(),
})
const runValidator = v.object({
  _id: v.id('appFactoryQaRuns'),
  draftId: v.id('appFactoryDrafts'),
  draftKey: v.string(),
  draftRevision: v.number(),
  draftDigest: v.string(),
  targetUrl: v.string(),
  runner: v.string(),
  runReference: v.string(),
  commitSha: v.string(),
  outcome: v.union(v.literal('passed'), v.literal('failed'), v.literal('partial')),
  cases: v.array(caseValidator),
  createdAt: v.number(),
})

export const listByDraft = query({
  args: { projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts') },
  returns: v.array(runValidator),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const project = await ownedProject(ctx, args.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Project unavailable')
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.projectId !== project._id || draft.ownerKey !== ownerKey || draft.kind !== 'browser-qa-plan') throw new ConvexError('Browser QA plan unavailable')
    return (await ctx.db.query('appFactoryQaRuns').withIndex('by_draft', q => q.eq('draftId', args.draftId)).order('desc').take(20))
      .map(({ ownerKey: _ownerKey, projectId: _projectId, _creationTime, ...row }) => row)
  },
})

export const record = mutation({
  args: {
    projectId: v.id('studioProjects'),
    draftId: v.id('appFactoryDrafts'),
    expectedRevision: v.number(),
    expectedDigest: v.string(),
    targetUrl: v.string(),
    runner: v.string(),
    runReference: v.string(),
    commitSha: v.string(),
    cases: v.array(caseValidator),
  },
  returns: v.id('appFactoryQaRuns'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const project = await ownedProject(ctx, args.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Project unavailable')
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.ownerKey !== ownerKey || draft.projectId !== project._id || draft.kind !== 'browser-qa-plan') throw new ConvexError('Browser QA plan unavailable')
    if (draft.revision !== args.expectedRevision || draft.contentDigest !== args.expectedDigest) throw new ConvexError('Source revision changed. Reload the exact browser QA plan before recording evidence.')
    const latest = await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', project._id).eq('draftKey', draft.draftKey)).order('desc').first()
    if (!latest || latest._id !== draft._id) throw new ConvexError('Evidence must be attached to the latest plan revision.')
    if (!Number.isInteger(args.expectedRevision) || args.expectedRevision < 1) throw new ConvexError('Invalid source revision.')
    const targetUrl = validateQaTargetUrl(args.targetUrl)
    const runner = bounded(args.runner, 'Runner identity', 120)
    const runReference = bounded(args.runReference, 'Run evidence reference', 500)
    const commitSha = args.commitSha.trim().toLowerCase()
    if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new ConvexError('Browser QA evidence requires a full 40-character Git commit SHA; local or abbreviated revisions cannot authorize acceptance.')
    if (/^https:\/\//i.test(runReference)) {
      let reportUrl: URL
      try { reportUrl = new URL(runReference) } catch { throw new ConvexError('Invalid report URL.') }
      if (reportUrl.username || reportUrl.password || reportUrl.search || reportUrl.hash) throw new ConvexError('Report URLs must not contain credentials, query strings or fragments.')
    } else if (!/^evidence:[a-z0-9][a-z0-9._:/-]{2,180}$/i.test(runReference)) throw new ConvexError('Run reference must be an HTTPS URL or a named evidence reference.')
    if (args.cases.length < 1 || args.cases.length > 30) throw new ConvexError('Record between 1 and 30 test cases.')
    const seen = new Set<string>()
    const cases = args.cases.map(testCase => {
      const key = bounded(testCase.key, 'Test case key', 100)
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,99}$/.test(key) || seen.has(key)) throw new ConvexError('Test case keys must be unique stable identifiers.')
      seen.add(key)
      const note = bounded(testCase.note, 'Test case note', 1000)
      const evidenceReference = testCase.evidenceReference.trim()
      if (testCase.status !== 'not-run' && !evidenceReference) throw new ConvexError('Every executed test case needs an evidence reference.')
      if (evidenceReference.length > 500 || /(?:token|secret|password|api[_-]?key)=/i.test(evidenceReference)) throw new ConvexError('Evidence references must be bounded and must not contain credentials.')
      return { key, status: testCase.status, evidenceReference, note }
    })
    const outcome = deriveQaOutcome(cases)
    return await ctx.db.insert('appFactoryQaRuns', {
      ownerKey, projectId: project._id, draftId: draft._id, draftKey: draft.draftKey,
      draftRevision: draft.revision, draftDigest: draft.contentDigest, targetUrl,
      runner, runReference, commitSha, outcome, cases, createdAt: Date.now(),
    })
  },
})
