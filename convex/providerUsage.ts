import {admitEvidence,evidencePage} from './evidenceAdmission'
import { reserveUsage, settleUsage } from './billingUsage'
import { checkProviderClaim } from './providerClaimFence'
import { v } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { internalMutation, query } from './_generated/server'
import { invocationFields } from './providerUsageModel'
import { requireOperator, requireOwnedMission } from './permissions'

export const begin = internalMutation({
  args: { executionClaimId: v.optional(v.id('executionClaims')), ownerKey: v.string(), missionId: v.optional(v.id('missions')), missionRunId: v.optional(v.id('missionRuns')), stage: v.string(), role: v.string() }, returns: v.id('providerInvocations'),
  handler: async (ctx, args) => {
    await checkProviderClaim(ctx, args)
    if (!args.ownerKey.trim() || args.ownerKey.length > 256 || !args.stage.trim() || args.stage.length > 120 || !args.role.trim() || args.role.length > 40) throw new Error('Invalid invocation identity')
    if (args.missionId) {
      const mission = await ctx.db.get(args.missionId)
      if (!mission || mission.ownerKey !== args.ownerKey) throw new Error('Mission not found or access denied')
    }
    if (args.missionRunId) {
      const run = await ctx.db.get(args.missionRunId)
      if (!args.missionId || !run || run.missionId !== args.missionId) throw new Error('Run does not match this mission')
      // The indexed read and insert share one transaction: overlapping workers
      // cannot both reserve the same active runner stage. Never expire an
      // unresolved reservation automatically: inference may already have run.
      const active = await ctx.db.query('providerInvocations')
        .withIndex('by_missionRunId_and_stage_and_role_and_outcome', q => q.eq('missionRunId', args.missionRunId).eq('stage', args.stage).eq('role', args.role).eq('outcome', 'pending'))
        .first()
      if (active) throw new Error('Provider work is already pending for this run stage; review its invocation before retrying')
    }
    await admitEvidence(ctx.db.query('providerInvocations').withIndex('by_owner',q=>q.eq('ownerKey',args.ownerKey)),'Provider invocation',500)
    const { executionClaimId: _claim, ...fields } = args
    const id = await ctx.db.insert('providerInvocations', { ...fields, startedAt: Date.now(), outcome: 'pending', usageStatus: 'pending', reports: [] })
    await reserveUsage(ctx, id, args.ownerKey)
    return id
  },
})
export const finish = internalMutation({
  args: { invocationId: v.id('providerInvocations'), outcome: v.union(v.literal('succeeded'), v.literal('failed')), observedReports: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.invocationId)
    if (!row) throw new Error('Invocation not found')
    if (!Number.isInteger(args.observedReports) || args.observedReports < row.reports.length || row.reports.some(report => report.ordinal > args.observedReports) || args.observedReports > 8) throw new Error('Invalid observed report count')
    if (row.outcome !== 'pending') {
      if (row.outcome !== args.outcome || row.observedReports !== args.observedReports) throw new Error('Completed invocation is immutable')
      return null
    }
    const usageStatus = !args.observedReports ? 'missing' as const : row.reports.length === args.observedReports ? 'recorded' as const : 'gap' as const
    await settleUsage(ctx, row, usageStatus)
    await ctx.db.patch(row._id, { outcome: args.outcome, observedReports: args.observedReports, usageStatus, finishedAt: Date.now() })
    return null
  },
})
export const history = query({
  args: { missionId: v.optional(v.id('missions')), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ _id: v.id('providerInvocations'), _creationTime: v.number(), ...invocationFields })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    if (args.missionId) {
      await requireOwnedMission(ctx, args.missionId)
      return ctx.db.query('providerInvocations').withIndex('by_mission', q => q.eq('missionId', args.missionId)).order('desc').paginate(evidencePage(args.paginationOpts))
    }
    return ctx.db.query('providerInvocations').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('desc').paginate(evidencePage(args.paginationOpts))
  },
})
