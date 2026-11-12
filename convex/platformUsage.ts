import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOperator } from './permissions'
import { digest } from './studioModel'

type UsageDay = {
  date: string
  functionHoursReported: number
  storageHoursReported: number
  functionCalls: number
  databaseReadDocuments: number
  databaseReadBytes: number
  ioBytes: number
  egressBytes: number
  storageRequests: number
}
type UsageFunction = {
  udfPath: string
  udfType: string
  isPublic: boolean
  invocations: number
  errors: number
  p50Ms: number | null
  p99Ms: number | null
  cacheHitPercentage: number | null
  available: boolean
}
const nonnegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const shortText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const validIso = (value: unknown): value is string => shortText(value, 40) && Number.isFinite(Date.parse(value))
const optionalMetric = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)

function parseSnapshot(raw: string, functionTarget: 'live' | 'testing') {
  if (new TextEncoder().encode(raw).length > 50000) throw new ConvexError('Usage snapshot exceeds 50 KB')
  let root: any
  try { root = JSON.parse(raw) } catch { throw new ConvexError('Paste the complete JSON usage snapshot') }
  const history = root?.history
  const functions = root?.functions
  if (!history || history.status !== 'available' || history.source !== 'persisted_convex_webhooks' || history.scope !== 'chat_live_and_testing_combined') {
    throw new ConvexError('Expected the managed Convex usage history with its explicit combined Live + Testing scope')
  }
  if (!validIso(history.capturedAt) || !validIso(history.start) || !validIso(history.end) || Date.parse(history.end) <= Date.parse(history.start) || !shortText(history.coverage, 1000)) {
    throw new ConvexError('Usage history dates or coverage metadata are invalid')
  }
  const capturedAtMs = Date.parse(history.capturedAt)
  if (capturedAtMs > Date.now() + 5 * 60_000 || Date.parse(history.end) > capturedAtMs + 5 * 60_000) throw new ConvexError('Usage reports cannot be captured materially in the future or before their completed period ends')
  if (!Array.isArray(history.days) || history.days.length < 1 || history.days.length > 7) throw new ConvexError('Include 1–7 reported daily usage buckets')
  const seenDays = new Set<string>()
  for (const row of history.days) {
    const validDay = typeof row?.date === 'string' && row.date.length === 10 && Number.isFinite(Date.parse(row.date + 'T00:00:00.000Z')) && new Date(row.date + 'T00:00:00.000Z').toISOString().slice(0, 10) === row.date
    if (!row || !validDay || seenDays.has(row.date) || row.date < history.start.slice(0, 10) || row.date > history.end.slice(0, 10)) throw new ConvexError('A daily usage bucket contains an invalid date, duplicate day, or out-of-period day')
    seenDays.add(row.date)
  }
  const dayKeys = ['functionHoursReported', 'storageHoursReported', 'functionCalls', 'databaseReadDocuments', 'databaseReadBytes', 'ioBytes', 'egressBytes', 'storageRequests'] as const
  const days: UsageDay[] = history.days.map((row: any) => {
    if (!row || !dayKeys.every(key => nonnegativeInteger(row[key]))) throw new ConvexError('A daily usage bucket contains an invalid or missing counter')
    return { date: row.date, functionHoursReported: row.functionHoursReported, storageHoursReported: row.storageHoursReported, functionCalls: row.functionCalls, databaseReadDocuments: row.databaseReadDocuments, databaseReadBytes: row.databaseReadBytes, ioBytes: row.ioBytes, egressBytes: row.egressBytes, storageRequests: row.storageRequests }
  })
  const totals = Object.fromEntries(dayKeys.map(key => [key, days.reduce((sum, row) => sum + row[key], 0)])) as Omit<UsageDay, 'date'>
  if (dayKeys.some(key => !Number.isSafeInteger(totals[key]))) throw new ConvexError('Daily usage totals exceed safe integer precision')
  if (!functions || typeof functions !== 'object') throw new ConvexError('Function usage snapshot section is missing')
  const functionStatus = functions.status
  if (!['available', 'partial', 'unavailable'].includes(functionStatus)) throw new ConvexError('Function usage snapshot status is invalid')
  const rows = Array.isArray(functions.functions) ? functions.functions : []
  if (rows.length > 20) throw new ConvexError('Function snapshot exceeds 20 rows')
  const functionPaths = rows.map((row: any) => row?.udfPath).filter((path: unknown): path is string => typeof path === 'string')
  if (new Set(functionPaths).size !== functionPaths.length) throw new ConvexError('Function usage snapshot contains duplicate function paths')
  const normalizedFunctions: UsageFunction[] = rows.map((row: any) => {
    if (!row || !shortText(row.udfPath, 200) || !shortText(row.udfType, 30) || typeof row.isPublic !== 'boolean' || !nonnegativeInteger(row.invocations) || !nonnegativeInteger(row.errors) || row.errors > row.invocations || !optionalMetric(row.p50Ms ?? null) || !optionalMetric(row.p99Ms ?? null) || (row.p50Ms != null && row.p99Ms != null && row.p50Ms > row.p99Ms) || !(row.cacheHitPercentage === null || row.cacheHitPercentage === undefined || (typeof row.cacheHitPercentage === 'number' && Number.isFinite(row.cacheHitPercentage) && row.cacheHitPercentage >= 0 && row.cacheHitPercentage <= 100)) || typeof row.available !== 'boolean') {
      throw new ConvexError('A function usage row contains invalid metrics')
    }
    return { udfPath: row.udfPath, udfType: row.udfType, isPublic: row.isPublic, invocations: row.invocations, errors: row.errors, p50Ms: row.p50Ms ?? null, p99Ms: row.p99Ms ?? null, cacheHitPercentage: row.cacheHitPercentage ?? null, available: row.available }
  })
  if (functionStatus !== 'unavailable' && (!validIso(functions.capturedAt) || !nonnegativeInteger(functions.windowSeconds) || functions.windowSeconds < 60 || functions.windowSeconds > 3600 || !nonnegativeInteger(functions.failedFunctionCount) || !nonnegativeInteger(functions.skippedFunctionCount) || typeof functions.truncated !== 'boolean')) {
    throw new ConvexError('Function snapshot timing or completeness metadata is invalid')
  }
  const normalized = {
    source: 'macaly-database-usage' as const,
    capturedAt: history.capturedAt,
    historyStart: history.start,
    historyEnd: history.end,
    historyScope: 'chat_live_and_testing_combined' as const,
    historyCoverage: history.coverage,
    historyDays: days,
    historyTotals: totals,
    functionTarget,
    functionSnapshotStatus: functionStatus as 'available' | 'partial' | 'unavailable',
    ...(validIso(functions?.capturedAt) ? { functionSnapshotCapturedAt: functions.capturedAt } : {}),
    ...(nonnegativeInteger(functions?.windowSeconds) ? { functionWindowSeconds: functions.windowSeconds } : {}),
    functions: normalizedFunctions,
    failedFunctionCount: nonnegativeInteger(functions?.failedFunctionCount) ? functions.failedFunctionCount : 0,
    skippedFunctionCount: nonnegativeInteger(functions?.skippedFunctionCount) ? functions.skippedFunctionCount : 0,
    truncated: typeof functions?.truncated === 'boolean' ? functions.truncated : true,
  }
  return normalized
}

export const recordSnapshot = mutation({
  args: { rawSnapshot: v.string(), functionTarget: v.union(v.literal('live'), v.literal('testing')) },
  returns: v.id('platformUsageReceipts'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const snapshot = parseSnapshot(args.rawSnapshot, args.functionTarget)
    const hash = await digest(JSON.stringify(snapshot))
    const prior = await ctx.db.query('platformUsageReceipts').withIndex('by_owner_digest', q => q.eq('ownerKey', ownerKey).eq('digest', hash)).first()
    if (prior) return prior._id
    const rows = await ctx.db.query('platformUsageReceipts').withIndex('by_owner_recorded', q => q.eq('ownerKey', ownerKey)).take(50)
    if (rows.length >= 50) throw new ConvexError('50 usage snapshots retained; history is kept and new snapshots are blocked')
    return ctx.db.insert('platformUsageReceipts', { ownerKey, ...snapshot, digest: hash, recordedAt: Date.now() })
  },
})

export const history = query({
  args: {},
  handler: async ctx => {
    const ownerKey = await requireOperator(ctx)
    return (await ctx.db.query('platformUsageReceipts').withIndex('by_owner_recorded', q => q.eq('ownerKey', ownerKey)).order('desc').take(10))
      .map(({ ownerKey: _ownerKey, _creationTime, ...row }) => row)
  },
})
