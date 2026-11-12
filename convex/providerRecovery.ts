import {admitEvidence,evidencePage} from './evidenceAdmission'
import { reserveUsage, settleUsage } from './billingUsage'
import { checkProviderClaim } from './providerClaimFence'
import { v } from 'convex/values'
import { internalMutation } from './_generated/server'

const identity = { executionClaimId: v.optional(v.id('executionClaims')), ownerKey: v.string(), missionId: v.optional(v.id('missions')), missionRunId: v.optional(v.id('missionRuns')), stage: v.string(), role: v.string(), requestDigest: v.string() }
export const reserve = internalMutation({
  args: identity,
  returns: v.object({ invocationId: v.id('providerInvocations'), answer: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    await checkProviderClaim(ctx, args)
    if (!args.ownerKey.trim() || args.ownerKey.length > 256 || !args.stage.trim() || args.stage.length > 120 || !args.role.trim() || args.role.length > 40 || !/^[a-f0-9]{64}$/.test(args.requestDigest)) throw new Error('Invalid invocation identity')
    if (args.missionId) {
      const mission = await ctx.db.get(args.missionId)
      if (!mission || mission.ownerKey !== args.ownerKey) throw new Error('Mission not found or access denied')
    }
    if (args.missionRunId) {
      const run = await ctx.db.get(args.missionRunId)
      if (!args.missionId || !run || run.missionId !== args.missionId) throw new Error('Run does not match this mission')
      // Two rows suffice to reject ambiguity, including legacy invocations.
      // Never select a success while hiding another unresolved matching row.
      const prior = await ctx.db.query('providerInvocations')
        .withIndex('by_missionRunId_and_stage_and_role_and_outcome', q => q.eq('missionRunId', args.missionRunId).eq('stage', args.stage).eq('role', args.role)).take(2)
      if (prior.length) {
        if (prior.length !== 1 || prior[0].outcome !== 'succeeded') throw new Error('Runner provider work is pending, failed or ambiguous; review before starting a new run')
        const row = prior[0]
        const result = await ctx.db.query('providerResults').withIndex('by_invocation', q => q.eq('invocationId', row._id)).unique()
        if (!result) throw new Error('Completed legacy invocation has no recoverable answer; review before starting a new run')
        if (result.requestDigest !== args.requestDigest) throw new Error('Runner stage request changed; an explicit new run is required')
        return { invocationId: row._id, answer: result.answer }
      }
    }
    await admitEvidence(ctx.db.query('providerInvocations').withIndex('by_owner',q=>q.eq('ownerKey',args.ownerKey)),'Provider invocation',500)
    const { requestDigest: _digest, executionClaimId: _claim, ...fields } = args
    const invocationId = await ctx.db.insert('providerInvocations', { ...fields, startedAt: Date.now(), outcome: 'pending', usageStatus: 'pending', reports: [] })
    await reserveUsage(ctx, invocationId, args.ownerKey)
    return { invocationId }
  },
})
export const complete = internalMutation({
  args: { invocationId: v.id('providerInvocations'), requestDigest: v.string(), answer: v.string(), observedReports: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bound UTF-8 bytes, not JS character count; no answers appear in public history.
    if (!/^[a-f0-9]{64}$/.test(args.requestDigest) || new TextEncoder().encode(args.answer).length > 256 * 1024) throw new Error('Invalid recoverable provider result')
    const row = await ctx.db.get(args.invocationId)
    if (!row) throw new Error('Invocation not found')
    if (!Number.isInteger(args.observedReports) || args.observedReports < row.reports.length || row.reports.some(report => report.ordinal > args.observedReports) || args.observedReports > 8) throw new Error('Invalid observed report count')
    const previous = await ctx.db.query('providerResults').withIndex('by_invocation', q => q.eq('invocationId', row._id)).unique()
    if (row.outcome !== 'pending') {
      if (row.outcome === 'succeeded' && row.observedReports === args.observedReports && previous?.requestDigest === args.requestDigest && previous.answer === args.answer) return null
      throw new Error('Completed invocation is immutable')
    }
    if (previous) throw new Error('Unexpected result for pending invocation')
    await ctx.db.insert('providerResults', { invocationId: row._id, requestDigest: args.requestDigest, answer: args.answer })
    const usageStatus = !args.observedReports ? 'missing' as const : row.reports.length === args.observedReports ? 'recorded' as const : 'gap' as const
    // Answer and success commit together. If this transaction fails, pending remains.
    await settleUsage(ctx, row, usageStatus)
    await ctx.db.patch(row._id, { outcome: 'succeeded', observedReports: args.observedReports, usageStatus, finishedAt: Date.now() })
    return null
  },
})
