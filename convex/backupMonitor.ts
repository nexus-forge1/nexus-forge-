import { internalMutation, query } from './_generated/server'
import { v } from 'convex/values'
import { requireOperator } from './permissions'

const DAY = 24 * 60 * 60 * 1000
const digestOk = (value: string) => /^[a-f0-9]{64}$/i.test(value)
const isEligible = (point: {
  sourceEnvironment: string; capturedAt: number; sourceSha256: string; storedSha256: string; bytes: number
  dataTables: number; dataDocuments: number; independentRetrieval: boolean
  zipCrcPassed: boolean; relationshipsPassed: boolean; archiveReference: string
  evidenceReference: string
}) => point.sourceEnvironment === 'live' && point.capturedAt > 0 && point.capturedAt <= Date.now() &&
  digestOk(point.sourceSha256) && point.sourceSha256.toLowerCase() === point.storedSha256.toLowerCase() &&
  point.bytes > 0 && point.dataTables > 0 && point.dataDocuments >= 0 &&
  point.independentRetrieval && point.zipCrcPassed && point.relationshipsPassed &&
  !!point.archiveReference.trim() && !!point.evidenceReference.trim()

export const statusFor = (latestEligibleAt: number | null, now: number) =>
  latestEligibleAt === null ? 'missing' as const : now - latestEligibleAt > DAY ? 'stale' as const : 'fresh' as const

export const getMyStatus = query({
  args: {},
  returns: v.union(v.object({
    status: v.union(v.literal('fresh'), v.literal('stale'), v.literal('missing')),
    checkedAt: v.number(),
    latestEligibleAt: v.union(v.number(), v.null()),
    transitionCount: v.number(),
    lastTransitionAt: v.number(),
    detail: v.string(),
  }), v.null()),
  handler: async (ctx) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.query('backupMonitorStates').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).unique()
    if (!row) return null
    return { status: row.status, checkedAt: row.checkedAt, latestEligibleAt: row.latestEligibleAt, transitionCount: row.transitionCount, lastTransitionAt: row.lastTransitionAt, detail: row.detail }
  },
})

export const check = internalMutation({
  args: {},
  returns: v.object({ ownersChecked: v.number(), transitions: v.number(), truncated: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now()
    // Hard cap makes the scheduled scan predictable; alert if the cap is reached.
    const [points, gates, drills, priorStates] = await Promise.all([
      ctx.db.query('backupRecoveryPoints').order('desc').take(5000),
      ctx.db.query('releaseEvidenceGates').order('desc').take(5000),
      ctx.db.query('recoveryDrills').order('desc').take(5000),
      ctx.db.query('backupMonitorStates').order('desc').take(5000),
    ])
    const truncated = points.length === 5000 || gates.length === 5000 || drills.length === 5000 || priorStates.length === 5000
    // Seed owners from the release/resilience workflows as well as the backup
    // inventory. Otherwise an owner with zero captures would never be marked missing.
    const byOwner = new Map<string, number | null>()
    for (const row of [...gates, ...drills, ...priorStates]) {
      if (!byOwner.has(row.ownerKey)) byOwner.set(row.ownerKey, null)
    }
    for (const point of points) {
      const latest = byOwner.get(point.ownerKey)
      if (isEligible(point) && (latest === undefined || latest === null || point.capturedAt > latest)) byOwner.set(point.ownerKey, point.capturedAt)
      else if (latest === undefined) byOwner.set(point.ownerKey, null)
    }
    let transitions = 0
    for (const [ownerKey, latestEligibleAt] of byOwner) {
      const status = statusFor(latestEligibleAt, now)
      const prior = await ctx.db.query('backupMonitorStates').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).unique()
      const changed = !prior || prior.status !== status
      const detail = status === 'fresh'
        ? 'An eligible recovery point was recorded within the 24-hour freshness window.'
        : status === 'stale'
          ? 'The newest eligible recovery point is older than 24 hours. Capture and independently verify a new backup.'
          : 'No eligible recovery point is recorded. Capture and independently verify a backup.'
      const next = {
        ownerKey, status, checkedAt: now, latestEligibleAt,
        transitionCount: (prior?.transitionCount ?? 0) + (changed && prior ? 1 : 0),
        lastTransitionAt: changed ? now : (prior?.lastTransitionAt ?? now),
        detail,
      }
      if (prior) await ctx.db.patch(prior._id, next)
      else await ctx.db.insert('backupMonitorStates', next)
      if (changed && prior) {
        transitions++
        await ctx.db.insert('backupMonitorEvents', {
          ownerKey, fromStatus: prior.status, toStatus: status, checkedAt: now,
          latestEligibleAt, detail,
        })
      }
    }
    return { ownersChecked: byOwner.size, transitions, truncated }
  },
})

export const listEvents = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id('backupMonitorEvents'), fromStatus: v.union(v.literal('fresh'), v.literal('stale'), v.literal('missing')),
    toStatus: v.union(v.literal('fresh'), v.literal('stale'), v.literal('missing')),
    checkedAt: v.number(), latestEligibleAt: v.union(v.number(), v.null()), detail: v.string(),
    _creationTime: v.number(),
  })),
  handler: async (ctx) => {
    const ownerKey = await requireOperator(ctx)
    const rows = await ctx.db.query('backupMonitorEvents').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('desc').take(50)
    return rows.map(({ ownerKey: _ownerKey, ...row }) => row)
  },
})
