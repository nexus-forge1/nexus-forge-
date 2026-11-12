import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOperator } from './permissions'

const environment = v.union(v.literal('live'), v.literal('testing'), v.literal('isolated-lab'))
const pointFields = {
  captureKey: v.string(),
  sourceEnvironment: environment,
  capturedAt: v.number(),
  triggerType: v.optional(v.union(v.literal('manual'), v.literal('timer-triggered'), v.literal('unknown'))),
  schedulerReceiptReference: v.optional(v.string()),
  archiveReference: v.string(),
  sourceSha256: v.string(),
  storedSha256: v.string(),
  bytes: v.number(),
  dataTables: v.number(),
  dataDocuments: v.number(),
  independentRetrieval: v.boolean(),
  zipCrcPassed: v.boolean(),
  relationshipsPassed: v.boolean(),
  mediaInventoryNote: v.string(),
  evidenceReference: v.string(),
}
const validDigest = (value: string) => /^[a-f0-9]{64}$/i.test(value)
const eligible = (point: { sourceSha256: string; storedSha256: string; bytes: number; dataTables: number; dataDocuments: number; independentRetrieval: boolean; zipCrcPassed: boolean; relationshipsPassed: boolean; archiveReference: string; evidenceReference: string }) =>
  validDigest(point.sourceSha256) &&
  point.sourceSha256.toLowerCase() === point.storedSha256.toLowerCase() &&
  point.bytes > 0 && point.dataTables > 0 && point.dataDocuments >= 0 &&
  point.independentRetrieval && point.zipCrcPassed && point.relationshipsPassed &&
  point.archiveReference.trim().length > 0 && point.evidenceReference.trim().length > 0

export const list = query({
  args: {},
  returns: v.object({
    points: v.array(v.object({ _id: v.id('backupRecoveryPoints'), _creationTime: v.number(), ...pointFields, createdAt: v.number(), eligible: v.boolean() })),
    summary: v.object({
      latestEligibleAt: v.union(v.number(), v.null()),
      freshness: v.union(v.literal('fresh'), v.literal('stale'), v.literal('missing')),
      eligiblePoints: v.number(),
      retainedDaysLast30: v.number(),
      missingDaysLast30: v.number(),
      targetRetainedDays: v.number(),
      oldestEligibleAt: v.union(v.number(), v.null()),
      eligibleTimerTriggeredPoints: v.number(),
      latestTimerTriggeredAt: v.union(v.number(), v.null()),
    }),
  }),
  handler: async (ctx) => {
    const ownerKey = await requireOperator(ctx)
    const now = Date.now()
    const all = await ctx.db.query('backupRecoveryPoints').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('desc').take(500)
    const points = all.map(({ ownerKey: _owner, ...point }) => ({
      ...point,
      // The write validator permits a small clock-skew window for operator entry,
      // but a future timestamp must never certify production freshness or retention.
      eligible: point.capturedAt > 0 && point.capturedAt <= now && eligible(point),
    }))
    const accepted = points.filter(p => p.eligible && p.sourceEnvironment === 'live').sort((a, b) => b.capturedAt - a.capturedAt)
    const latestEligibleAt = accepted[0]?.capturedAt ?? null
    const oldestEligibleAt = accepted.at(-1)?.capturedAt ?? null
    // A declaration without a linked scheduler receipt is not counted as timer evidence.
    const timerTriggered = accepted.filter(point => point.triggerType === 'timer-triggered' && typeof point.schedulerReceiptReference === 'string' && point.schedulerReceiptReference.trim().length > 0)
    const latestTimerTriggeredAt = timerTriggered[0]?.capturedAt ?? null
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const days = new Set(accepted.filter(p => p.capturedAt >= cutoff && p.capturedAt <= now).map(p => new Date(p.capturedAt).toISOString().slice(0, 10)))
    return {
      points,
      summary: {
        latestEligibleAt,
        freshness: latestEligibleAt === null ? 'missing' as const : now - latestEligibleAt > 24 * 60 * 60 * 1000 ? 'stale' as const : 'fresh' as const,
        eligiblePoints: accepted.length,
        retainedDaysLast30: days.size,
        missingDaysLast30: Math.max(0, 30 - days.size),
        targetRetainedDays: 30,
        oldestEligibleAt,
        eligibleTimerTriggeredPoints: timerTriggered.length,
        latestTimerTriggeredAt,
      },
    }
  },
})

export const record = mutation({
  args: pointFields,
  returns: v.id('backupRecoveryPoints'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const captureKey = args.captureKey.trim()
    const archiveReference = args.archiveReference.trim()
    const evidenceReference = args.evidenceReference.trim()
    const schedulerReceiptReference = args.schedulerReceiptReference?.trim()
    const mediaInventoryNote = args.mediaInventoryNote.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/.test(captureKey)) throw new ConvexError('Capture key must be a 3–100 character stable identifier')
    if (args.capturedAt <= 0 || args.capturedAt > Date.now() + 5 * 60 * 1000) throw new ConvexError('Capture timestamp must be a valid past timestamp')
    if (!archiveReference || archiveReference.length > 500 || !evidenceReference || evidenceReference.length > 500) throw new ConvexError('Provide bounded private archive and verification evidence references')
    if (schedulerReceiptReference && schedulerReceiptReference.length > 500) throw new ConvexError('Scheduler receipt reference must be at most 500 characters')
    if (!mediaInventoryNote || mediaInventoryNote.length > 1000) throw new ConvexError('Record the media inventory result or explicitly state that it was not checked')
    if (!validDigest(args.sourceSha256) || !validDigest(args.storedSha256)) throw new ConvexError('Both source and independently retrieved archive SHA-256 values must be 64 hexadecimal characters')
    if (!Number.isSafeInteger(args.bytes) || args.bytes <= 0 || !Number.isSafeInteger(args.dataTables) || args.dataTables <= 0 || !Number.isSafeInteger(args.dataDocuments) || args.dataDocuments < 0) throw new ConvexError('Byte, table, and document counts must be valid non-negative integers (bytes/tables must be positive)')
    const prior = await ctx.db.query('backupRecoveryPoints').withIndex('by_owner_captureKey', q => q.eq('ownerKey', ownerKey).eq('captureKey', captureKey)).unique()
    if (prior) throw new ConvexError('Capture key already exists; recovery points are immutable and cannot be overwritten')
    const count = await ctx.db.query('backupRecoveryPoints').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).take(501)
    if (count.length >= 500) throw new ConvexError('Recovery point inventory reached its 500-record limit; preserve records and review retention manually')
    return await ctx.db.insert('backupRecoveryPoints', { ...args, ownerKey, captureKey, archiveReference, evidenceReference, mediaInventoryNote, ...(schedulerReceiptReference ? { schedulerReceiptReference } : {}), sourceSha256: args.sourceSha256.toLowerCase(), storedSha256: args.storedSha256.toLowerCase(), createdAt: Date.now() })
  },
})
