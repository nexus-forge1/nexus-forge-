import {admitEvidence,evidencePage} from './evidenceAdmission'
import { reserveUsage, settleUsage } from './billingUsage'
import { checkProviderClaim } from './providerClaimFence'
import { v } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { internalMutation, query } from './_generated/server'
import { invocationFields } from './providerUsageModel'
import { RATE_VERSION, reportCost } from './billingRates'
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
export const summary = query({
  args: { missionId: v.optional(v.id('missions')) },
  returns: v.object({
    scope: v.union(v.literal('mission'), v.literal('owner')),
    invocationCount: v.number(), successfulInvocations: v.number(), failedInvocations: v.number(), pendingInvocations: v.number(),
    incompleteInvocations: v.number(), reportCount: v.number(), knownChargeReports: v.number(), unknownChargeReports: v.number(),
    knownCostUsd: v.number(), estimatedCostUsd: v.number(), estimatedChargeReports: v.number(), unpricedReports: v.number(), promptTokens: v.number(), completionTokens: v.number(), totalTokens: v.number(), missingTokenReports: v.number(),
    timedInvocations: v.number(), meanInvocationMs: v.union(v.number(), v.null()), p50InvocationMs: v.union(v.number(), v.null()), p95InvocationMs: v.union(v.number(), v.null()),
    truncated: v.boolean(), complete: v.boolean(), providers: v.array(v.object({ provider: v.string(), reports: v.number(), knownCostUsd: v.number(), estimatedCostUsd: v.number(), estimatedChargeReports: v.number(), unpricedReports: v.number(), promptTokens: v.number(), completionTokens: v.number(), totalTokens: v.number(), unknownChargeReports: v.number() })),
  }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    let rows
    if (args.missionId) {
      await requireOwnedMission(ctx, args.missionId)
      rows = await ctx.db.query('providerInvocations').withIndex('by_mission', q => q.eq('missionId', args.missionId)).order('desc').take(501)
    } else {
      rows = await ctx.db.query('providerInvocations').withIndex('by_owner_started', q => q.eq('ownerKey', ownerKey)).order('desc').take(501)
    }
    const truncated = rows.length > 500
    const included = rows.slice(0, 500)
    const providers = new Map<string, { provider: string; reports: number; knownCostUsd: number; estimatedCostUsd: number; estimatedChargeReports: number; unpricedReports: number; promptTokens: number; completionTokens: number; totalTokens: number; unknownChargeReports: number }>()
    let reportCount = 0, knownChargeReports = 0, unknownChargeReports = 0, knownCostUsd = 0, estimatedCostUsd = 0, estimatedChargeReports = 0, unpricedReports = 0
    let promptTokens = 0, completionTokens = 0, totalTokens = 0, missingTokenReports = 0
    let successfulInvocations = 0, failedInvocations = 0, pendingInvocations = 0, incompleteInvocations = 0
    const durations: number[] = []
    for (const row of included) {
      if (row.outcome === 'succeeded') successfulInvocations++
      else if (row.outcome === 'failed') failedInvocations++
      else pendingInvocations++
      if (row.outcome === 'pending' || row.usageStatus !== 'recorded' || row.finishedAt === undefined || row.observedReports !== row.reports.length) incompleteInvocations++
      if (row.finishedAt !== undefined && Number.isSafeInteger(row.startedAt) && Number.isSafeInteger(row.finishedAt) && row.finishedAt >= row.startedAt) durations.push(row.finishedAt - row.startedAt)
      for (const report of row.reports) {
        reportCount++
        let provider = providers.get(report.provider)
        if (!provider) { provider = { provider: report.provider, reports: 0, knownCostUsd: 0, estimatedCostUsd: 0, estimatedChargeReports: 0, unpricedReports: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, unknownChargeReports: 0 }; providers.set(report.provider, provider) }
        provider.reports++
        const validCost = typeof report.reportedCostUsd === 'number' && Number.isFinite(report.reportedCostUsd) && report.reportedCostUsd >= 0
        if (validCost) { knownChargeReports++; knownCostUsd += report.reportedCostUsd!; provider.knownCostUsd += report.reportedCostUsd! }
        else {
          unknownChargeReports++; provider.unknownChargeReports++
          const estimate = reportCost(report, RATE_VERSION)
          if (estimate?.basis === RATE_VERSION) { estimatedChargeReports++; estimatedCostUsd += estimate.usd; provider.estimatedChargeReports++; provider.estimatedCostUsd += estimate.usd }
          else { unpricedReports++; provider.unpricedReports++ }
        }
        const validPrompt = typeof report.promptTokens === 'number' && Number.isSafeInteger(report.promptTokens) && report.promptTokens >= 0
        const validCompletion = typeof report.completionTokens === 'number' && Number.isSafeInteger(report.completionTokens) && report.completionTokens >= 0
        const validTotal = typeof report.totalTokens === 'number' && Number.isSafeInteger(report.totalTokens) && report.totalTokens >= 0
        if (validPrompt) { promptTokens += report.promptTokens!; provider.promptTokens += report.promptTokens! }
        if (validCompletion) { completionTokens += report.completionTokens!; provider.completionTokens += report.completionTokens! }
        if (validTotal) { totalTokens += report.totalTokens!; provider.totalTokens += report.totalTokens! }
        if (!validPrompt || !validCompletion || !validTotal) missingTokenReports++
      }
    }
    durations.sort((a, b) => a - b)
    const meanInvocationMs = durations.length ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length) : null
    const p50InvocationMs = durations.length ? durations[Math.ceil(durations.length * 0.5) - 1] : null
    const p95InvocationMs = durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null
    return { scope: args.missionId ? 'mission' as const : 'owner' as const, invocationCount: included.length, successfulInvocations, failedInvocations, pendingInvocations, incompleteInvocations, reportCount, knownChargeReports, unknownChargeReports, knownCostUsd: Math.round(knownCostUsd * 1e9) / 1e9, estimatedCostUsd: Math.round(estimatedCostUsd * 1e9) / 1e9, estimatedChargeReports, unpricedReports, promptTokens, completionTokens, totalTokens, missingTokenReports, timedInvocations: durations.length, meanInvocationMs, p50InvocationMs, p95InvocationMs, truncated, complete: !truncated && incompleteInvocations === 0 && unknownChargeReports === 0 && missingTokenReports === 0, providers: [...providers.values()].sort((a, b) => a.provider.localeCompare(b.provider)).map(provider => ({ ...provider, knownCostUsd: Math.round(provider.knownCostUsd * 1e9) / 1e9, estimatedCostUsd: Math.round(provider.estimatedCostUsd * 1e9) / 1e9 })) }
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
