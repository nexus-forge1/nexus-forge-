import { ConvexError, v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { requireOperator } from './permissions'

const check = v.union(v.literal('pending'), v.literal('pass'), v.literal('fail'), v.literal('blocked'))
const environment = v.union(v.literal('testing'), v.literal('isolated-lab'))
const drillFields = {
  title: v.string(),
  environment,
  backupCapture: check,
  checksumVerification: check,
  isolatedRestore: check,
  ownershipVerification: check,
  smokeChecks: check,
  baselineReturn: check,
  durationMinutes: v.optional(v.number()),
  evidenceReference: v.string(),
  summary: v.string(),
  status: v.union(v.literal('draft'), v.literal('blocked'), v.literal('submitted')),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
}

function deriveStatus(input: {
  backupCapture: 'pending' | 'pass' | 'fail' | 'blocked'
  checksumVerification: 'pending' | 'pass' | 'fail' | 'blocked'
  isolatedRestore: 'pending' | 'pass' | 'fail' | 'blocked'
  ownershipVerification: 'pending' | 'pass' | 'fail' | 'blocked'
  smokeChecks: 'pending' | 'pass' | 'fail' | 'blocked'
  baselineReturn: 'pending' | 'pass' | 'fail' | 'blocked'
  durationMinutes?: number
  evidenceReference: string
  summary: string
}) {
  const checks = [input.backupCapture, input.checksumVerification, input.isolatedRestore, input.ownershipVerification, input.smokeChecks, input.baselineReturn]
  if (checks.some(value => value === 'fail' || value === 'blocked')) return 'blocked' as const
  if (input.durationMinutes !== undefined && (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 240)) return 'blocked' as const
  if (checks.every(value => value === 'pass') && input.durationMinutes !== undefined && input.durationMinutes > 0 && input.durationMinutes <= 240 && input.evidenceReference.trim() && input.summary.trim()) return 'submitted' as const
  return 'draft' as const
}

export const list = query({
  args: {},
  returns: v.array(v.object({ _id: v.id('recoveryDrills'), ...drillFields, _creationTime: v.number() })),
  handler: async (ctx) => {
    const ownerKey = await requireOperator(ctx)
    const rows = await ctx.db.query('recoveryDrills').withIndex('by_owner_updatedAt', q => q.eq('ownerKey', ownerKey)).order('desc').take(30)
    return rows.map(({ ownerKey: _ownerKey, ...row }) => row)
  },
})

export const create = mutation({
  args: { title: v.string(), environment },
  returns: v.id('recoveryDrills'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const title = args.title.trim()
    if (!title || title.length > 120) throw new ConvexError('Drill title must be 1–120 characters')
    const now = Date.now()
    return await ctx.db.insert('recoveryDrills', {
      ownerKey,
      title,
      environment: args.environment,
      backupCapture: 'pending',
      checksumVerification: 'pending',
      isolatedRestore: 'pending',
      ownershipVerification: 'pending',
      smokeChecks: 'pending',
      baselineReturn: 'pending',
      durationMinutes: undefined,
      evidenceReference: '',
      summary: '',
      status: 'draft',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: {
    id: v.id('recoveryDrills'),
    title: v.string(),
    environment,
    backupCapture: check,
    checksumVerification: check,
    isolatedRestore: check,
    ownershipVerification: check,
    smokeChecks: check,
    baselineReturn: check,
    durationMinutes: v.optional(v.number()),
    evidenceReference: v.string(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const existing = await ctx.db.get(args.id)
    if (!existing || existing.ownerKey !== ownerKey) throw new ConvexError('Recovery drill not found or access denied')
    const title = args.title.trim()
    const evidenceReference = args.evidenceReference.trim()
    const summary = args.summary.trim()
    if (!title || title.length > 120) throw new ConvexError('Drill title must be 1–120 characters')
    if (evidenceReference.length > 500 || summary.length > 4000) throw new ConvexError('Evidence reference or summary exceeds the allowed length')
    if (args.durationMinutes !== undefined && (!Number.isFinite(args.durationMinutes) || !Number.isSafeInteger(args.durationMinutes) || args.durationMinutes <= 0 || args.durationMinutes > 10080)) throw new ConvexError('Recovery duration must be a positive whole number of minutes no greater than seven days')
    const next = {
      title,
      environment: args.environment,
      backupCapture: args.backupCapture,
      checksumVerification: args.checksumVerification,
      isolatedRestore: args.isolatedRestore,
      ownershipVerification: args.ownershipVerification,
      smokeChecks: args.smokeChecks,
      baselineReturn: args.baselineReturn,
      durationMinutes: args.durationMinutes,
      evidenceReference,
      summary,
    }
    await ctx.db.patch(args.id, {
      ...next,
      status: deriveStatus(next),
      revision: existing.revision + 1,
      updatedAt: Date.now(),
    })
    return null
  },
})
