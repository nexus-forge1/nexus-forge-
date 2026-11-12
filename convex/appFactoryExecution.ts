import { v, ConvexError } from 'convex/values'
import { query, mutation } from './_generated/server'
import { requireOperator } from './permissions'
import { ownedProject } from './studio'
import { bounded } from './studioModel'

const runSummary = v.object({
  _id: v.id('appFactoryExecutionRuns'), draftId: v.id('appFactoryDrafts'),
  draftKey: v.string(), draftRevision: v.number(), draftDigest: v.string(), sourceCommit: v.optional(v.string()),
  kind: v.union(v.literal('database-migration-plan'),v.literal('browser-qa-plan'),v.literal('integration-contract')),
  status: v.union(v.literal('prepared'),v.literal('running'),v.literal('blocked'),v.literal('completed'),v.literal('failed'),v.literal('cancelled')),
  operatorReference: v.string(), summary: v.string(), evidenceReference: v.optional(v.string()),
  createdAt: v.number(), updatedAt: v.number(), completedAt: v.optional(v.number()),
})

export const list = query({
  args: { projectId: v.id('studioProjects') }, returns: v.array(runSummary),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const project = await ownedProject(ctx, args.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Project unavailable')
    return (await ctx.db.query('appFactoryExecutionRuns').withIndex('by_project_created', q => q.eq('projectId', project._id)).order('desc').take(50))
      .map(({ ownerKey: _ownerKey, projectId: _projectId, _creationTime, ...row }) => row)
  },
})

export const prepare = mutation({
  args: { projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'), expectedRevision: v.number(), expectedDigest: v.string(), sourceCommit: v.string(), operatorReference: v.string() },
  returns: v.id('appFactoryExecutionRuns'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const project = await ownedProject(ctx, args.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Project unavailable')
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.ownerKey !== ownerKey || draft.projectId !== project._id) throw new ConvexError('Draft unavailable')
    if (draft.status !== 'accepted') throw new ConvexError('Execution can only be prepared from an accepted draft revision.')
    if (draft.revision !== args.expectedRevision || draft.contentDigest !== args.expectedDigest) throw new ConvexError('Exact accepted revision and digest are required.')
    const latest = await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', project._id).eq('draftKey', draft.draftKey)).order('desc').first()
    if (!latest || latest._id !== draft._id) throw new ConvexError('Only the latest accepted revision can be prepared.')
    const sourceCommit = bounded(args.sourceCommit, 'Source commit SHA', 40).toLowerCase()
    if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new ConvexError('A full 40-character Git commit SHA is required to prepare execution.')
    const operatorReference = bounded(args.operatorReference, 'Operator execution reference', 300)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,299}$/.test(operatorReference) || /(?:token|secret|password|api[_-]?key)=/i.test(operatorReference)) throw new ConvexError('Use a non-secret operator reference or ticket identifier.')
    const now = Date.now()
    return await ctx.db.insert('appFactoryExecutionRuns', {
      ownerKey, projectId: project._id, draftId: draft._id, draftKey: draft.draftKey,
      draftRevision: draft.revision, draftDigest: draft.contentDigest, sourceCommit, kind: draft.kind,
      status: 'prepared', operatorReference, summary: 'Prepared; external work has not been executed.',
      createdAt: now, updatedAt: now,
    })
  },
})

export const transition = mutation({
  args: { runId: v.id('appFactoryExecutionRuns'), expectedStatus: v.union(v.literal('prepared'),v.literal('running'),v.literal('blocked'),v.literal('completed'),v.literal('failed'),v.literal('cancelled')), status: v.union(v.literal('running'),v.literal('blocked'),v.literal('completed'),v.literal('failed'),v.literal('cancelled')), summary: v.string(), evidenceReference: v.optional(v.string()) },
  returns: v.id('appFactoryExecutionRuns'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const run = await ctx.db.get(args.runId)
    if (!run || run.ownerKey !== ownerKey) throw new ConvexError('Execution record unavailable')
    const project = await ownedProject(ctx, run.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Execution record unavailable')
    if (run.status !== args.expectedStatus) throw new ConvexError('Execution status changed; reload before updating.')
    const allowed: Record<string, string[]> = { prepared: ['running','blocked','cancelled'], running: ['blocked','completed','failed','cancelled'], blocked: [], completed: [], failed: [], cancelled: [] }
    if (!allowed[run.status]?.includes(args.status)) throw new ConvexError('Invalid execution lifecycle transition.')
    const summary = bounded(args.summary, 'Execution summary', 1200)
    const evidenceReference = args.evidenceReference ? bounded(args.evidenceReference, 'Evidence reference', 500) : undefined
    if (args.status === 'completed' && !evidenceReference) throw new ConvexError('Completion requires a retained evidence reference.')
    if (evidenceReference && /(?:token|secret|password|api[_-]?key)=/i.test(evidenceReference)) throw new ConvexError('Evidence reference must not contain credentials.')
    if (args.status === 'completed' && run.kind === 'browser-qa-plan') {
      const qaRuns = await ctx.db.query('appFactoryQaRuns').withIndex('by_draft', q => q.eq('draftId', run.draftId)).order('desc').take(50)
      const hasExactPassingRun = qaRuns.some(receipt => receipt.outcome === 'passed' && receipt.draftRevision === run.draftRevision && receipt.draftDigest === run.draftDigest && receipt.commitSha.toLowerCase() === run.sourceCommit && (evidenceReference === receipt._id || evidenceReference === receipt.runReference))
      const ciReceipts = await ctx.db.query('appFactoryQaCiReceipts').withIndex('by_draft', q => q.eq('draftId', run.draftId)).order('desc').take(50)
      const hasVerifiedTargetRun = ciReceipts.some(receipt => receipt.workflowRunId.startsWith('target-app:') && receipt.allPassed && receipt.draftRevision === run.draftRevision && receipt.draftDigest === run.draftDigest && receipt.sourceCommit.toLowerCase() === run.sourceCommit && (evidenceReference === receipt._id || evidenceReference === receipt.runUrl))
      if (!hasExactPassingRun && !hasVerifiedTargetRun) throw new ConvexError('Target-app Browser QA completion requires a retained passing run for this exact draft revision, digest, and source commit. Saved-HTML snapshot CI evidence is not target-app execution proof.')
    }
    if (args.status === 'completed' && run.kind !== 'browser-qa-plan') throw new ConvexError('Completion is blocked until this execution kind has a verified evidence adapter. Record the external outcome as blocked or failed; a free-form reference cannot authorize completion.')
    const now = Date.now()
    await ctx.db.patch(run._id, {
      status: args.status, summary, evidenceReference, updatedAt: now,
      ...(args.status === 'completed' || args.status === 'failed' || args.status === 'cancelled' ? { completedAt: now } : {}),
    })
    return run._id
  },
})
