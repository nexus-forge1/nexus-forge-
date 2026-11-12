import {evidencePage} from './evidenceAdmission'
import { v, ConvexError } from 'convex/values'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { mutation, query } from './_generated/server'
import { requireOperator } from './permissions'
import { normalizeModelTotals, reconciliationFields, reconciliationInput } from './providerReconciliationModel'

export const record = mutation({
  args: reconciliationInput, returns: v.id('providerReconciliations'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    if (![args.periodStart, args.periodEnd].every(Number.isSafeInteger) || args.periodStart < 0 ||
      args.periodEnd <= args.periodStart || args.periodEnd > Date.now() ||
      args.periodEnd - args.periodStart > 93 * 86400000) throw new ConvexError('Use a completed accounting period of at most 93 days')
    if (!Number.isFinite(args.invoiceUsd) || args.invoiceUsd < 0 || args.invoiceUsd > 1000000)
      throw new ConvexError('Invoice amount must be a finite USD amount between zero and one million')
    const invoiceReference = args.invoiceReference.trim(), evidenceReference = args.evidenceReference.trim()
    if (!invoiceReference || invoiceReference.length > 160 || !evidenceReference || evidenceReference.length > 300 ||
      /[\u0000-\u001f]/.test(invoiceReference + evidenceReference))
      throw new ConvexError('Provide bounded invoice and private evidence references without control characters')
    if ((await ctx.db.query('providerReconciliations').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).take(100)).length >= 100)
      throw new ConvexError('Reconciliation history limit reached (100 immutable snapshots)')
    const rows = await ctx.db.query('providerInvocations').withIndex('by_owner_started',
      q => q.eq('ownerKey', ownerKey).gte('startedAt', args.periodStart).lt('startedAt', args.periodEnd)).take(201)
    if (rows.length > 200) throw new ConvexError('More than 200 invocations in this period; narrow the period and use a matching invoice export')
    const reports = rows.flatMap(row => row.reports.filter(report => report.provider === args.provider).map(report => ({
      invocationId: row._id, ordinal: report.ordinal, model: report.model, capturedAt: report.capturedAt,
      ...(report.reportedCostUsd === undefined ? {} : { reportedCostUsd: report.reportedCostUsd }),
    })))
    const missingCharges = reports.filter(report => report.reportedCostUsd === undefined || !Number.isFinite(report.reportedCostUsd) || report.reportedCostUsd < 0).length
    // Missing attempts cannot safely be attributed to a specific provider: retain them as uncertainty for every comparison.
    const unresolvedInvocations = rows.filter(row => row.outcome === 'pending' || row.usageStatus !== 'recorded' ||
      row.observedReports !== row.reports.length || row.finishedAt === undefined || row.finishedAt >= args.periodEnd).length
    const ledgerUsd = reports.reduce((sum, report) => sum + (Number.isFinite(report.reportedCostUsd) && report.reportedCostUsd! >= 0 ? report.reportedCostUsd! : 0), 0)
    const byModel = new Map<string, { reportCount: number; knownUsd: number; unknownCharges: number }>()
    for (const report of reports) {
      const key = report.model.slice(0, 160) || '(unnamed model)'
      const current = byModel.get(key) ?? { reportCount: 0, knownUsd: 0, unknownCharges: 0 }
      current.reportCount += 1
      if (Number.isFinite(report.reportedCostUsd) && report.reportedCostUsd! >= 0) current.knownUsd += report.reportedCostUsd!
      else current.unknownCharges += 1
      byModel.set(key, current)
    }
    const modelTotals = [...byModel.entries()].map(([model, totals]) => ({ model, ...totals, knownUsd: Math.round(totals.knownUsd * 1e9) / 1e9 })).sort((a, b) => a.model.localeCompare(b.model))
    const varianceUsd = Math.round((args.invoiceUsd - ledgerUsd) * 1e9) / 1e9
    const status = !args.scopeConfirmed ? 'scope-mismatch' as const :
      !reports.length || missingCharges || unresolvedInvocations ? 'incomplete' as const :
      Math.abs(varianceUsd) >= 0.005 ? 'variance' as const : 'matched-declared' as const
    return ctx.db.insert('providerReconciliations', {
      ...args, invoiceReference, evidenceReference, ownerKey, createdAt: Date.now(), status,
      ledgerUsd, varianceUsd, invocationCount: rows.length, matchedReports: reports.length,
      missingCharges, unresolvedInvocations, invocationIds: rows.map(row => row._id), reports, modelTotals,
    })
  },
})
export const history = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ _id: v.id('providerReconciliations'), _creationTime: v.number(), ...reconciliationFields })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const page = await ctx.db.query('providerReconciliations').withIndex('by_owner', q => q.eq('ownerKey', ownerKey)).order('desc').paginate(evidencePage(args.paginationOpts))
    return { ...page, page: page.page.map(row => normalizeModelTotals(row)) }
  },
})
