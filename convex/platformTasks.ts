import {admitEvidence} from './evidenceAdmission'
import { v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import { requireOperator, requireOwnedMission } from './permissions'

import { taskKind } from './platformTaskModel'

export const begin = internalMutation({
  args: { missionId: v.id('missions'), kind: taskKind }, returns: v.id('platformTaskRuns'),
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId)
    if (!mission) throw new Error('Mission not found')
    await admitEvidence(ctx.db.query('platformTaskRuns').withIndex('by_mission',q=>q.eq('missionId',args.missionId)),'Mission task')
    return await ctx.db.insert('platformTaskRuns', { ...args, ownerKey: mission.ownerKey, status: 'pending', startedAt: Date.now() })
  },
})
export const finish = internalMutation({
  args: { id: v.id('platformTaskRuns'), success: v.boolean(), sourceRef: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id)
    if (!run) throw new Error('Task measurement not found')
    const status = args.success ? 'success' : 'failed'
    if (run.status !== 'pending') {
      if (run.status === status && run.sourceRef === args.sourceRef) return null
      throw new Error('Conflicting immutable task result')
    }
    await ctx.db.patch(args.id, { status, finishedAt: Math.max(run.startedAt, Date.now()), ...(args.sourceRef ? { sourceRef: args.sourceRef.slice(0, 200) } : {}) })
    return null
  },
})

export async function beginDeliveryTask(ctx: any, delivery: any) {
  const sourceRef = String(delivery._id)
  const existing = await ctx.db.query('platformTaskRuns').withIndex('by_source', (q: any) => q.eq('sourceRef', sourceRef)).unique()
  if (existing) return
  const mission = await ctx.db.get(delivery.missionId)
  if (!mission) throw new Error('Mission not found')
  await ctx.db.insert('platformTaskRuns', { ownerKey: mission.ownerKey, missionId: mission._id, kind: 'delivery', status: 'pending', startedAt: delivery.createdAt, sourceRef })
}

// Called only after the delivery callback's approval, provenance and immutability checks.
export async function recordDeliveryTask(ctx: any, delivery: any, success: boolean) {
  const sourceRef = String(delivery._id)
  const existing = await ctx.db.query('platformTaskRuns').withIndex('by_source', (q: any) => q.eq('sourceRef', sourceRef)).unique()
  if (existing) {
    const status = success ? 'success' : 'failed'
    if (existing.status === 'pending') await ctx.db.patch(existing._id, { status, finishedAt: Math.max(existing.startedAt, Date.now()) })
    else if (existing.status !== status) throw new Error('Conflicting immutable task result')
    return
  }
  const mission = await ctx.db.get(delivery.missionId)
  if (!mission) throw new Error('Mission not found')
  await ctx.db.insert('platformTaskRuns', {
    ownerKey: mission.ownerKey, missionId: mission._id, kind: 'delivery',
    status: success ? 'success' : 'failed', startedAt: delivery.createdAt,
    finishedAt: Math.max(delivery.createdAt, Date.now()), sourceRef,
  })
}

const summaryRow = v.object({
  kind: taskKind, successes: v.number(), failures: v.number(), pending: v.number(),
  successRate: v.union(v.number(), v.null()), meanSeconds: v.union(v.number(), v.null()), timedCount: v.number(),
})
export const summary = query({
  args: { missionId: v.optional(v.id('missions')) },
  returns: v.object({ rows: v.array(summaryRow), sampled: v.number(), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    if (args.missionId) await requireOwnedMission(ctx, args.missionId)
    const records = args.missionId
      ? await ctx.db.query('platformTaskRuns').withIndex('by_mission', q => q.eq('missionId', args.missionId!)).order('desc').take(101)
      : await ctx.db.query('platformTaskRuns').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('desc').take(101)
    const sample = records.slice(0, 100).filter(r => r.ownerKey === ownerKey)
    const rows = (['research', 'artifact', 'delivery'] as const).map(kind => {
      const group = sample.filter(r => r.kind === kind)
      const successes = group.filter(r => r.status === 'success').length
      const failures = group.filter(r => r.status === 'failed').length
      const timed = group.filter(r => r.finishedAt !== undefined && r.status !== 'pending')
      return { kind, successes, failures, pending: group.filter(r => r.status === 'pending').length,
        successRate: successes + failures ? successes / (successes + failures) * 100 : null,
        meanSeconds: timed.length ? timed.reduce((total, r) => total + (r.finishedAt! - r.startedAt) / 1000, 0) / timed.length : null,
        timedCount: timed.length }
    })
    return { rows, sampled: sample.length, truncated: records.length > 100 }
  },
})
