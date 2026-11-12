import { v, ConvexError } from 'convex/values'
import { query, mutation } from './_generated/server'
import { requireOperator } from './permissions'
import { ownedProject } from './studio'
import { digest, bounded } from './studioModel'
import { validateDraftContent, validateDraftKey } from './appFactoryModel'

const draftSummary = v.object({
  _id: v.id('appFactoryDrafts'),
  draftKey: v.string(),
  kind: v.union(v.literal('database-migration-plan'),v.literal('browser-qa-plan'),v.literal('integration-contract')),
  title: v.string(),
  revision: v.number(),
  previousRevisionId: v.optional(v.id('appFactoryDrafts')),
  featureId: v.optional(v.id('featurePackages')),
  sourceDigest: v.optional(v.string()),
  contentDigest: v.string(),
  status: v.union(v.literal('draft'),v.literal('in-review'),v.literal('accepted'),v.literal('blocked')),
  evidenceReference: v.optional(v.string()),
  reviewNote: v.optional(v.string()),
  createdAt: v.number(),
})
const draftRevision = v.object({
  ...draftSummary.fields,
  content: v.string(),
})
export const list = query({
  args: { projectId: v.id('studioProjects') },
  returns: v.array(draftSummary),
  handler: async (ctx, args) => {
    await ownedProject(ctx, args.projectId)
    return (await ctx.db.query('appFactoryDrafts').withIndex('by_project_created', q => q.eq('projectId', args.projectId)).order('desc').take(100))
      .map(({ ownerKey, projectId, _creationTime, content, ...row }) => row)
  },
})
export const history = query({
  args: { projectId: v.id('studioProjects'), draftKey: v.string() },
  returns: v.array(draftRevision),
  handler: async (ctx, args) => {
    await ownedProject(ctx, args.projectId)
    const draftKey = validateDraftKey(args.draftKey)
    return (await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', args.projectId).eq('draftKey', draftKey)).order('desc').take(50))
      .map(({ ownerKey, projectId, _creationTime, ...row }) => row)
  },
})
export const save = mutation({
  args: {
    projectId: v.id('studioProjects'),
    draftKey: v.string(),
    kind: v.union(v.literal('database-migration-plan'),v.literal('browser-qa-plan'),v.literal('integration-contract')),
    title: v.string(),
    content: v.string(),
    expectedRevision: v.number(),
    featureId: v.optional(v.id('featurePackages')),
    sourceDigest: v.optional(v.string()),
  },
  returns: v.id('appFactoryDrafts'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const project = await ownedProject(ctx, args.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Project unavailable')
    const draftKey = validateDraftKey(args.draftKey)
    const title = bounded(args.title, 'Draft title', 160)
    const content = validateDraftContent(args.content)
    if (!Number.isInteger(args.expectedRevision) || args.expectedRevision < 0) throw new ConvexError('Reload the latest revision before saving.')
    if (args.featureId) {
      const feature = await ctx.db.get(args.featureId)
      if (!feature || feature.ownerKey !== ownerKey || feature.projectId !== project._id) throw new ConvexError('Feature source revision unavailable')
      if (!args.sourceDigest || args.sourceDigest !== feature.packageDigest) throw new ConvexError('Exact feature source digest is required when linking a source revision.')
    } else if (args.sourceDigest) throw new ConvexError('A source digest cannot be saved without a linked feature revision.')
    const contentDigest = await digest(content)
    const latest = await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', project._id).eq('draftKey', draftKey)).order('desc').first()
    if ((latest?.revision ?? 0) !== args.expectedRevision) throw new ConvexError('Draft changed. Reload the latest revision before saving.')
    if (latest && latest.contentDigest === contentDigest && latest.kind === args.kind && latest.title === title && latest.featureId === args.featureId && latest.sourceDigest === args.sourceDigest) return latest._id
    if ((latest?.revision ?? 0) >= 50) throw new ConvexError('50 revisions reached; export the history before starting a new draft key.')
    const id = await ctx.db.insert('appFactoryDrafts', {
      ownerKey, projectId: project._id, draftKey, kind: args.kind, title,
      revision: (latest?.revision ?? 0) + 1, previousRevisionId: latest?._id,
      featureId: args.featureId, sourceDigest: args.sourceDigest, content,
      contentDigest, status: 'draft', createdAt: Date.now(),
    })
    return id
  },
})
export const review = mutation({
  args: {
    draftId: v.id('appFactoryDrafts'),
    expectedRevision: v.number(),
    status: v.union(v.literal('in-review'),v.literal('accepted'),v.literal('blocked')),
    evidenceReference: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
  },
  returns: v.id('appFactoryDrafts'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const current = await ctx.db.get(args.draftId)
    if (!current || current.ownerKey !== ownerKey) throw new ConvexError('Draft unavailable')
    const project = await ownedProject(ctx, current.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Draft unavailable')
    const latest = await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', current.projectId).eq('draftKey', current.draftKey)).order('desc').first()
    if (!latest || latest._id !== current._id || latest.revision !== args.expectedRevision) throw new ConvexError('Only the latest revision can be reviewed. Reload draft history.')
    if (args.status === 'accepted' && !args.evidenceReference?.trim()) throw new ConvexError('Acceptance requires a retained evidence reference.')
    if (args.status === 'accepted' && latest.kind === 'browser-qa-plan') {
      const receipts = await ctx.db.query('appFactoryQaRuns').withIndex('by_draft', q => q.eq('draftId', latest._id)).order('desc').take(20)
      const hasPassingReceipt = receipts.some(receipt => receipt.outcome === 'passed' && receipt.draftRevision === latest.revision && receipt.draftDigest === latest.contentDigest && (args.evidenceReference === receipt._id || args.evidenceReference === receipt.runReference))
      const ciReceipts = await ctx.db.query('appFactoryQaCiReceipts').withIndex('by_draft', q => q.eq('draftId', latest._id)).order('desc').take(20)
      const hasVerifiedTargetRun = ciReceipts.some(receipt => receipt.workflowRunId.startsWith('target-app:') && receipt.allPassed && receipt.draftRevision === latest.revision && receipt.draftDigest === latest.contentDigest && (args.evidenceReference === receipt._id || args.evidenceReference === receipt.runUrl))
      if (!hasPassingReceipt && !hasVerifiedTargetRun) throw new ConvexError('Browser QA acceptance requires a retained passing target-app run for this exact revision and digest. Saved-HTML snapshot CI evidence is informational only and cannot authorize acceptance.')
    }
    if (args.status === 'blocked' && !args.reviewNote?.trim()) throw new ConvexError('A reason is required when blocking a draft.')
    const evidenceReference = args.evidenceReference ? bounded(args.evidenceReference, 'Evidence reference', 500) : undefined
    const reviewNote = args.reviewNote ? bounded(args.reviewNote, 'Review note', 1200) : undefined
    if (args.status === latest.status && evidenceReference === latest.evidenceReference && reviewNote === latest.reviewNote) return latest._id
    if (latest.revision >= 50) throw new ConvexError('50 revisions reached; export the history before starting a new draft key.')
    return await ctx.db.insert('appFactoryDrafts', {
      ownerKey, projectId: current.projectId, draftKey: current.draftKey, kind: current.kind,
      title: current.title, revision: latest.revision + 1, previousRevisionId: latest._id,
      featureId: current.featureId, sourceDigest: current.sourceDigest, content: current.content,
      contentDigest: current.contentDigest, status: args.status, evidenceReference, reviewNote, createdAt: Date.now(),
    })
  },
})
