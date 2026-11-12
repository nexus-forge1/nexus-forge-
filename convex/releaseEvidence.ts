import { v, ConvexError } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOperator } from './permissions'

const gateKey = v.union(v.literal('backup'), v.literal('recovery'), v.literal('invoices'), v.literal('workspace'))
const gateStatus = v.union(v.literal('blocked'), v.literal('evidence-submitted'), v.literal('approved'), v.literal('rejected'))
const gateFields = { gateKey, status: gateStatus, evidenceReference: v.string(), summary: v.string(), submittedBy: v.optional(v.string()), submittedAt: v.optional(v.number()), reviewedBy: v.optional(v.string()), reviewedAt: v.optional(v.number()), reviewNote: v.optional(v.string()), revision: v.number(), updatedAt: v.number() }

export const workspaceKey = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await requireOperator(ctx),
})

export const list = query({
  args: {},
  returns: v.array(v.object({ _id: v.id('releaseEvidenceGates'), ...gateFields, _creationTime: v.number() })),
  handler: async (ctx) => {
    const ownerKey = await requireOperator(ctx)
    const rows = await ctx.db.query('releaseEvidenceGates').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('asc').take(20)
    return rows.map(({ ownerKey: _ownerKey, ...row }) => row)
  },
})

export const submit = mutation({
  args: { gateKey, evidenceReference: v.string(), summary: v.string() },
  returns: v.id('releaseEvidenceGates'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const evidenceReference = args.evidenceReference.trim(), summary = args.summary.trim()
    if (!evidenceReference || evidenceReference.length > 500 || !summary || summary.length > 4000) throw new ConvexError('Provide a bounded evidence reference and review summary')
    const existing = await ctx.db.query('releaseEvidenceGates').withIndex('by_owner_gate', q => q.eq('ownerKey', ownerKey).eq('gateKey', args.gateKey)).unique()
    const now = Date.now()
    const next = { ownerKey, gateKey: args.gateKey, status: 'evidence-submitted' as const, evidenceReference, summary, submittedBy: ownerKey, submittedAt: now, reviewedBy: undefined, reviewedAt: undefined, reviewNote: undefined, revision: (existing?.revision ?? 0) + 1, updatedAt: now }
    let gateId
    if (existing) { gateId = existing._id; await ctx.db.replace(existing._id, next) }
    else gateId = await ctx.db.insert('releaseEvidenceGates', next)
    await ctx.db.insert('releaseEvidenceEvents', { ownerKey, gateKey: args.gateKey, gateId, eventType: 'evidence-submitted', actorKey: ownerKey, revision: next.revision, detail: summary.slice(0, 1000), evidenceReference, createdAt: now })
    return gateId
  },
})

export const grantReviewer = mutation({
  args: { reviewerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const reviewerKey = args.reviewerKey.trim()
    if (!reviewerKey || reviewerKey.length > 256 || reviewerKey === ownerKey) throw new ConvexError('Provide a different authenticated operator ID for independent review')
    const existing = await ctx.db.query('releaseEvidenceReviewers').withIndex('by_owner_reviewer', q => q.eq('ownerKey', ownerKey).eq('reviewerKey', reviewerKey)).unique()
    if (!existing) await ctx.db.insert('releaseEvidenceReviewers', { ownerKey, reviewerKey, grantedBy: ownerKey, createdAt: Date.now() })
    return null
  },
})

export const reviewQueue = query({
  args: { ownerKey: v.string() },
  returns: v.array(v.object({ _id: v.id('releaseEvidenceGates'), ...gateFields, _creationTime: v.number() })),
  handler: async (ctx, args) => {
    const reviewerKey = await requireOperator(ctx)
    const grant = await ctx.db.query('releaseEvidenceReviewers').withIndex('by_owner_reviewer', q => q.eq('ownerKey', args.ownerKey).eq('reviewerKey', reviewerKey)).unique()
    if (!grant) return []
    const rows = await ctx.db.query('releaseEvidenceGates').withIndex('by_owner', q => q.eq('ownerKey', args.ownerKey)).order('asc').take(20)
    return rows.map(({ ownerKey: _ownerKey, ...row }) => row)
  },
})

export const review = mutation({
  args: { gateId: v.id('releaseEvidenceGates'), decision: v.union(v.literal('approved'), v.literal('rejected')), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reviewerKey = await requireOperator(ctx)
    const note = args.note.trim()
    if (!note || note.length > 2000) throw new ConvexError('A review note of 1–2000 characters is required')
    const gate = await ctx.db.get(args.gateId)
    if (!gate) throw new ConvexError('Evidence gate not found or access denied')
    if (gate.submittedBy === reviewerKey) throw new ConvexError('Independent review required: the submitter cannot approve their own evidence')
    const grant = await ctx.db.query('releaseEvidenceReviewers').withIndex('by_owner_reviewer', q => q.eq('ownerKey', gate.ownerKey).eq('reviewerKey', reviewerKey)).unique()
    if (!grant) throw new ConvexError('Reviewer is not authorized for this release workspace')
    if (gate.status !== 'evidence-submitted') throw new ConvexError('Only submitted evidence can be reviewed')
    if (args.decision === 'approved' && gate.gateKey === 'backup') {
      const now = Date.now()
      const points = await ctx.db.query('backupRecoveryPoints').withIndex('by_owner_capturedAt', q => q.eq('ownerKey', gate.ownerKey)).order('desc').take(500)
      const latest = points.filter(point => {
        const digestValid = /^[a-f0-9]{64}$/i.test(point.sourceSha256) && point.sourceSha256.toLowerCase() === point.storedSha256.toLowerCase()
        return point.sourceEnvironment === 'live' && point.capturedAt > 0 && point.capturedAt <= now && now - point.capturedAt <= 24 * 60 * 60 * 1000 && digestValid && point.bytes > 0 && point.dataTables > 0 && point.dataDocuments >= 0 && point.independentRetrieval && point.zipCrcPassed && point.relationshipsPassed && !!point.archiveReference.trim() && !!point.evidenceReference.trim()
      }).sort((a, b) => b.capturedAt - a.capturedAt)[0]
      if (!latest) throw new ConvexError('Backup gate cannot be approved: no eligible recovery point was independently verified within the last 24 hours')
      if (gate.evidenceReference !== latest.evidenceReference && gate.evidenceReference !== latest.archiveReference) throw new ConvexError('Backup gate evidence reference must match the latest eligible recovery point or its retained verification evidence')
    }
    if (args.decision === 'approved' && gate.gateKey === 'recovery') {
      const drills = await ctx.db.query('recoveryDrills').withIndex('by_owner_updatedAt', q => q.eq('ownerKey', gate.ownerKey)).order('desc').take(30)
      const passing = drills.find(drill => drill.status === 'submitted' && drill.environment !== undefined && drill.durationMinutes !== undefined && Number.isSafeInteger(drill.durationMinutes) && drill.durationMinutes > 0 && drill.durationMinutes <= 240 && drill.backupCapture === 'pass' && drill.checksumVerification === 'pass' && drill.isolatedRestore === 'pass' && drill.ownershipVerification === 'pass' && drill.smokeChecks === 'pass' && drill.baselineReturn === 'pass' && !!drill.evidenceReference.trim() && !!drill.summary.trim())
      if (!passing) throw new ConvexError('Recovery gate cannot be approved: no submitted drill has all six checks passing and a measured end-to-end recovery duration of 1–240 minutes')
      if (gate.evidenceReference !== passing.evidenceReference) throw new ConvexError('Recovery gate evidence reference must match a retained passing recovery drill')
    }
    if (args.decision === 'approved' && gate.gateKey === 'invoices') {
      const reconciliations = await ctx.db.query('providerReconciliations').withIndex('by_owner', q => q.eq('ownerKey', gate.ownerKey)).order('desc').take(100)
      const matching = reconciliations.find(row => row.status === 'matched-declared' && row.scopeConfirmed &&
        row.missingCharges === 0 && row.unresolvedInvocations === 0 && row.matchedReports > 0 &&
        row.invoiceReference.trim() !== '' && row.evidenceReference === gate.evidenceReference)
      if (!matching) throw new ConvexError('Invoice gate cannot be approved: no matching retained provider reconciliation has confirmed scope, zero variance, no missing charges, no unresolved invocations, and the same evidence reference')
    }
    const now = Date.now()
    await ctx.db.patch(gate._id, { status: args.decision, reviewedBy: reviewerKey, reviewedAt: now, reviewNote: note, updatedAt: now })
    await ctx.db.insert('releaseEvidenceEvents', { ownerKey: gate.ownerKey, gateKey: gate.gateKey, gateId: gate._id, eventType: args.decision, actorKey: reviewerKey, revision: gate.revision, detail: note, evidenceReference: gate.evidenceReference, createdAt: now })
    return null
  },
})

export const history = query({
  args: {},
  returns: v.array(v.object({ _id: v.id('releaseEvidenceEvents'), gateKey, gateId: v.id('releaseEvidenceGates'), eventType: v.string(), actorKey: v.string(), revision: v.number(), detail: v.string(), evidenceReference: v.string(), createdAt: v.number(), _creationTime: v.number() })),
  handler: async (ctx) => {
    const ownerKey = await requireOperator(ctx)
    const rows = await ctx.db.query('releaseEvidenceEvents').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('desc').take(100)
    return rows.map(({ ownerKey: _ownerKey, ...row }) => row)
  },
})
