import { action, mutation, query } from './_generated/server'
import { ConvexError, v } from 'convex/values'
import { requireOperator } from './permissions'
import { bounded, digest, secrets } from './studioModel'

const key = v.string()
const textList = v.array(v.string())
const check = v.object({ key: v.string(), passed: v.boolean(), required: v.boolean(), detail: v.string() })

function clean(value: string, label: string, max = 500): string {
  const result = bounded(value, label, max).trim()
  secrets(result)
  return result
}
function safeKey(value: string, label = 'Key', max = 100): string {
  const result = clean(value, label, max)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new ConvexError(label + ' contains unsupported characters')
  return result
}
function numberIn(value: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new ConvexError(label + ' is outside its permitted range')
  return value
}
function whole(value: number, label: string, min = 0, max = 1_000_000): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConvexError(label + ' must be a bounded whole number')
  return value
}
function evidenceList(items: string[], label = 'Evidence', max = 20): string[] {
  if (items.length < 1 || items.length > max) throw new ConvexError(label + ' must contain 1–' + max + ' items')
  return items.map((item, i) => clean(item, label + ' ' + (i + 1), 1000))
}
function ratio(actual: number, target: number, dir: 'higher' | 'lower') {
  numberIn(actual, 'Actual metric', -1e12, 1e12)
  numberIn(target, 'Target metric', -1e12, 1e12)
  const attained = dir === 'higher' ? actual >= target : actual <= target
  const attainmentRatio = target === 0 ? (actual === 0 ? 1 : attained ? 1 : 0) : dir === 'higher' ? actual / Math.abs(target) : Math.abs(target) / Math.max(Math.abs(actual), Number.EPSILON)
  return { attained, attainmentRatio: Math.max(0, Math.min(10, attainmentRatio)), delta: actual - target }
}

/* B13 — Capability and reliability */
export const aggregateSloMetrics = query({
  args: { windowStart: v.optional(v.number()), windowEnd: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ count: v.number(), successes: v.number(), failures: v.number(), availability: v.union(v.number(), v.null()), p95LatencyMs: v.union(v.number(), v.null()), windowStart: v.number(), windowEnd: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const end = numberIn(args.windowEnd ?? Date.now(), 'Window end', 0, Date.now() + 60_000)
    const start = numberIn(args.windowStart ?? end - 86_400_000, 'Window start', 0, end)
    const limit = whole(args.limit ?? 200, 'SLO sample limit', 1, 500)
    const rows = await ctx.db.query('scopeBProviderLatency').withIndex('by_owner_observedAt', q => q.eq('ownerKey', ownerKey).gte('observedAt', start).lte('observedAt', end)).order('desc').take(limit)
    const latencies = rows.map(r => r.latencyMs).sort((a, b) => a - b)
    const successes = rows.filter(r => r.outcome === 'success').length
    return { count: rows.length, successes, failures: rows.length - successes, availability: rows.length ? successes / rows.length : null, p95LatencyMs: latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * .95) - 1)] : null, windowStart: start, windowEnd: end }
  },
})
export const recordFailureClassification = mutation({
  args: { requestKey: key, category: v.union(v.literal('timeout'), v.literal('provider'), v.literal('validation'), v.literal('policy'), v.literal('capacity'), v.literal('unknown')), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), summary: key, evidence: textList, observedAt: v.optional(v.number()) },
  returns: v.id('scopeBFailureClassifications'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(args.requestKey, 'Request key', 120)
    const summary = clean(args.summary, 'Failure summary', 500); const evidence = evidenceList(args.evidence, 'Evidence', 12)
    const observedAt = numberIn(args.observedAt ?? Date.now(), 'Observation time', 0, Date.now() + 60_000)
    const old = await ctx.db.query('scopeBFailureClassifications').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.category !== args.category || old.severity !== args.severity || old.summary !== summary) throw new ConvexError('Request key conflicts with existing failure classification'); return old._id }
    return ctx.db.insert('scopeBFailureClassifications', { ownerKey, requestKey, category: args.category, severity: args.severity, summary, evidence, observedAt })
  },
})
export const evaluateDegradationAlert = query({
  args: { windowMs: v.optional(v.number()), minimumSamples: v.optional(v.number()), failureRateThreshold: v.optional(v.number()), p95ThresholdMs: v.optional(v.number()) },
  returns: v.object({ alert: v.boolean(), level: v.union(v.literal('none'), v.literal('warning'), v.literal('critical'), v.literal('insufficient_data')), sampleCount: v.number(), failureRate: v.number(), p95LatencyMs: v.union(v.number(), v.null()), reasons: textList }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx); const now = Date.now()
    const windowMs = whole(args.windowMs ?? 900_000, 'Window duration', 1000, 86_400_000)
    const minSamples = whole(args.minimumSamples ?? 5, 'Minimum samples', 1, 200)
    const failureThreshold = numberIn(args.failureRateThreshold ?? .2, 'Failure rate threshold', 0, 1)
    const p95Threshold = numberIn(args.p95ThresholdMs ?? 3000, 'P95 latency threshold', 1, 120_000)
    const rows = await ctx.db.query('scopeBProviderLatency').withIndex('by_owner_observedAt', q => q.eq('ownerKey', ownerKey).gte('observedAt', now - windowMs).lte('observedAt', now)).take(200)
    const failures = rows.filter(r => r.outcome !== 'success').length; const rate = rows.length ? failures / rows.length : 0
    const latencies = rows.map(r => r.latencyMs).sort((a, b) => a - b); const p95 = latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * .95) - 1)] : null
    const reasons: string[] = []; if (rows.length < minSamples) reasons.push('Insufficient recent SLO samples')
    if (rate >= failureThreshold && rows.length) reasons.push('Failure rate reached threshold')
    if (p95 !== null && p95 >= p95Threshold) reasons.push('P95 latency reached threshold')
    const critical = rows.length >= minSamples && (rate >= Math.min(1, failureThreshold * 2) || (p95 !== null && p95 >= p95Threshold * 2))
    const alert = rows.length >= minSamples && (rate >= failureThreshold || (p95 !== null && p95 >= p95Threshold))
    return { alert, level: rows.length < minSamples ? 'insufficient_data' as const : critical ? 'critical' as const : alert ? 'warning' as const : 'none' as const, sampleCount: rows.length, failureRate: rate, p95LatencyMs: p95, reasons }
  },
})

/* B14 — Automated research and discovery */
export const persistOpportunityCandidate = mutation({
  args: { requestKey: key, title: key, problem: key, targetMarket: key, evidence: textList, estimatedMarketUsd: v.number(), confidence: v.number(), risks: textList },
  returns: v.id('scopeBOpportunityCandidates'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(args.requestKey, 'Request key', 120)
    const title = clean(args.title, 'Candidate title', 160); const problem = clean(args.problem, 'Problem statement', 1200); const targetMarket = clean(args.targetMarket, 'Target market', 240)
    const evidence = evidenceList(args.evidence, 'Research evidence', 20); const risks = args.risks.map((r, i) => clean(r, 'Risk ' + (i + 1), 500))
    if (risks.length > 20) throw new ConvexError('At most 20 risks are permitted')
    const estimatedMarketUsd = numberIn(args.estimatedMarketUsd, 'Estimated market size', 0, 1e15); const confidence = numberIn(args.confidence, 'Confidence', 0, 1)
    const old = await ctx.db.query('scopeBOpportunityCandidates').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.title !== title || old.problem !== problem) throw new ConvexError('Request key conflicts with a different opportunity'); return old._id }
    return ctx.db.insert('scopeBOpportunityCandidates', { ownerKey, requestKey, title, problem, targetMarket, evidence, estimatedMarketUsd, confidence, risks, status: 'candidate', createdAt: Date.now() })
  },
})
export const calculateMarketFeasibilityScore = query({
  args: { demandEvidence: v.number(), competition: v.number(), marginPercent: v.number(), executionReadiness: v.number(), regulatoryRisk: v.number(), capitalRequiredUsd: v.number(), capitalAvailableUsd: v.number() },
  returns: v.object({ score: v.number(), band: v.union(v.literal('low'), v.literal('moderate'), v.literal('high')), factors: textList, capitalCoverage: v.number() }),
  handler: async (_ctx, a) => {
    for (const [k, n] of Object.entries({ demandEvidence: a.demandEvidence, competition: a.competition, executionReadiness: a.executionReadiness, regulatoryRisk: a.regulatoryRisk })) numberIn(n, k, 0, 100)
    numberIn(a.marginPercent, 'Margin percent', -100, 1000); numberIn(a.capitalRequiredUsd, 'Capital required', 0, 1e15); numberIn(a.capitalAvailableUsd, 'Capital available', 0, 1e15)
    const capitalCoverage = a.capitalRequiredUsd === 0 ? 1 : Math.min(1, a.capitalAvailableUsd / a.capitalRequiredUsd)
    const margin = Math.max(0, Math.min(100, a.marginPercent)) / 100
    const score = Math.round(Math.max(0, Math.min(100, a.demandEvidence * .3 + (100 - a.competition) * .15 + margin * 100 * .15 + a.executionReadiness * .2 + (100 - a.regulatoryRisk) * .1 + capitalCoverage * 100 * .1)))
    const factors = [a.demandEvidence < 40 ? 'Demand evidence is weak' : 'Demand evidence is adequate', a.competition > 70 ? 'Competitive pressure is high' : 'Competitive pressure is manageable', a.regulatoryRisk > 60 ? 'Regulatory risk needs mitigation' : 'Regulatory risk is within evaluated tolerance', capitalCoverage < 1 ? 'Available capital does not cover estimated need' : 'Capital coverage is sufficient']
    return { score, band: score >= 70 ? 'high' as const : score >= 45 ? 'moderate' as const : 'low' as const, factors, capitalCoverage }
  },
})
export const synthesizeResearchDossier = action({
  args: { title: key, question: key, findings: v.array(v.object({ claim: key, evidence: textList, confidence: v.number() })), limitations: textList, nextSteps: textList },
  returns: v.object({ title: v.string(), question: v.string(), findings: v.array(v.object({ claim: v.string(), evidence: textList, confidence: v.number() })), limitations: textList, nextSteps: textList, confidenceMean: v.number(), status: v.union(v.literal('usable'), v.literal('insufficient_evidence')) }),
  handler: async (_ctx, a) => {
    const title = clean(a.title, 'Dossier title', 160); const question = clean(a.question, 'Research question', 1000)
    if (a.findings.length > 30) throw new ConvexError('At most 30 findings are permitted')
    const findings = a.findings.map((f, i) => ({ claim: clean(f.claim, 'Finding ' + (i + 1), 1000), evidence: evidenceList(f.evidence, 'Finding evidence', 10), confidence: numberIn(f.confidence, 'Finding confidence', 0, 1) }))
    const limitations = a.limitations.map((x, i) => clean(x, 'Limitation ' + (i + 1), 500)); const nextSteps = a.nextSteps.map((x, i) => clean(x, 'Next step ' + (i + 1), 500))
    if (limitations.length > 30 || nextSteps.length > 30) throw new ConvexError('Dossier lists are limited to 30 items')
    const confidenceMean = findings.length ? findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length : 0
    return { title, question, findings, limitations, nextSteps, confidenceMean, status: findings.length >= 2 && findings.some(f => f.evidence.length) ? 'usable' as const : 'insufficient_evidence' as const }
  },
})

/* B15 — Safe capability expansion */
export const validateContainmentBoundary = query({
  args: { requestedCapabilities: textList, allowedCapabilities: textList, deniedCapabilities: textList, requiresHumanApproval: v.boolean() },
  returns: v.object({ valid: v.boolean(), denied: textList, unapproved: textList, requiresHumanApproval: v.boolean() }),
  handler: async (_ctx, a) => {
    if (a.requestedCapabilities.length > 100 || a.allowedCapabilities.length > 100 || a.deniedCapabilities.length > 100) throw new ConvexError('Capability lists are limited to 100 entries')
    const requested = [...new Set(a.requestedCapabilities.map(x => safeKey(x, 'Capability', 100)))]
    const allowed = new Set(a.allowedCapabilities.map(x => safeKey(x, 'Allowed capability', 100)))
    const deniedSet = new Set(a.deniedCapabilities.map(x => safeKey(x, 'Denied capability', 100)))
    const denied = requested.filter(x => deniedSet.has(x)); const unapproved = requested.filter(x => !allowed.has(x))
    return { valid: denied.length === 0 && unapproved.length === 0 && !a.requiresHumanApproval, denied, unapproved, requiresHumanApproval: a.requiresHumanApproval }
  },
})
export const recordPermissionEscalationReview = mutation({
  args: { requestKey: key, subjectKey: key, currentPermissions: textList, requestedPermissions: textList, decision: v.union(v.literal('approved'), v.literal('rejected'), v.literal('pending')), rationale: key, evidence: textList },
  returns: v.id('scopeBPermissionEscalationReviews'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120)
    const subjectKey = safeKey(a.subjectKey, 'Subject key'); const currentPermissions = [...new Set(a.currentPermissions.map(x => safeKey(x, 'Permission')))]
    const requestedPermissions = [...new Set(a.requestedPermissions.map(x => safeKey(x, 'Permission')))]
    if (currentPermissions.length > 100 || requestedPermissions.length < 1 || requestedPermissions.length > 100) throw new ConvexError('Permission lists are out of bounds')
    const rationale = clean(a.rationale, 'Review rationale', 1200); const evidence = evidenceList(a.evidence)
    const old = await ctx.db.query('scopeBPermissionEscalationReviews').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.subjectKey !== subjectKey) throw new ConvexError('Request key belongs to a different review'); return old._id }
    return ctx.db.insert('scopeBPermissionEscalationReviews', { ownerKey, requestKey, subjectKey, currentPermissions, requestedPermissions, decision: a.decision, rationale, evidence, createdAt: Date.now() })
  },
})
export const checkBoundaryViolation = mutation({
  args: { requestKey: key, capability: key, attemptedOperation: key, boundaryKey: key, severity: v.union(v.literal('warning'), v.literal('high'), v.literal('critical')) },
  returns: v.id('scopeBBoundaryViolations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120)
    const capability = safeKey(a.capability, 'Capability'); const attemptedOperation = clean(a.attemptedOperation, 'Attempted operation', 300); const boundaryKey = safeKey(a.boundaryKey, 'Boundary')
    const old = await ctx.db.query('scopeBBoundaryViolations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) return old._id
    return ctx.db.insert('scopeBBoundaryViolations', { ownerKey, requestKey, capability, attemptedOperation, boundaryKey, severity: a.severity, status: 'open', createdAt: Date.now() })
  },
})

/* B16 — Cost and resource intelligence */
export const calculateTokenCostEstimate = query({
  args: { inputTokens: v.number(), outputTokens: v.number(), inputUsdPerMillion: v.number(), outputUsdPerMillion: v.number(), retryMultiplier: v.optional(v.number()) },
  returns: v.object({ inputCostUsd: v.number(), outputCostUsd: v.number(), totalCostUsd: v.number(), estimatedTokens: v.number() }),
  handler: async (_ctx, a) => {
    const input = whole(a.inputTokens, 'Input tokens', 0, 100_000_000); const output = whole(a.outputTokens, 'Output tokens', 0, 100_000_000)
    const inputRate = numberIn(a.inputUsdPerMillion, 'Input token rate', 0, 1_000_000); const outputRate = numberIn(a.outputUsdPerMillion, 'Output token rate', 0, 1_000_000)
    const retry = numberIn(a.retryMultiplier ?? 1, 'Retry multiplier', 1, 20)
    const inputCostUsd = input * inputRate / 1_000_000 * retry; const outputCostUsd = output * outputRate / 1_000_000 * retry
    return { inputCostUsd, outputCostUsd, totalCostUsd: inputCostUsd + outputCostUsd, estimatedTokens: input + output }
  },
})
export const aggregateDailyBurnRate = query({
  args: { dayStart: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ dayStart: v.number(), totalUsd: v.number(), eventCount: v.number(), byCategory: v.array(v.object({ category: v.string(), totalUsd: v.number() })) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const dayStart = a.dayStart ?? Math.floor(Date.now() / 86_400_000) * 86_400_000
    numberIn(dayStart, 'Day start', 0, Date.now()); if (dayStart % 86_400_000 !== 0) throw new ConvexError('Day start must be UTC midnight')
    const limit = whole(a.limit ?? 500, 'Burn history limit', 1, 1000)
    const rows = await ctx.db.query('scopeBTokenCostEvents').withIndex('by_owner_createdAt', q => q.eq('ownerKey', ownerKey).gte('createdAt', dayStart).lt('createdAt', dayStart + 86_400_000)).take(limit)
    const sums = new Map<string, number>(); let totalUsd = 0
    for (const row of rows) { totalUsd += row.costUsd; sums.set(row.category, (sums.get(row.category) ?? 0) + row.costUsd) }
    return { dayStart, totalUsd, eventCount: rows.length, byCategory: [...sums].map(([category, amount]) => ({ category, totalUsd: amount })) }
  },
})
export const evaluateBudgetQuotaBreach = query({
  args: { dailyBudgetUsd: v.number(), currentBurnUsd: v.number(), projectedDailyBurnUsd: v.number(), alertFraction: v.optional(v.number()) },
  returns: v.object({ breached: v.boolean(), projectedBreach: v.boolean(), utilization: v.number(), projectedUtilization: v.number(), status: v.union(v.literal('within_budget'), v.literal('near_limit'), v.literal('breached')) }),
  handler: async (_ctx, a) => {
    const budget = numberIn(a.dailyBudgetUsd, 'Daily budget', 0.000001, 1e12); const current = numberIn(a.currentBurnUsd, 'Current burn', 0, 1e12); const projected = numberIn(a.projectedDailyBurnUsd, 'Projected burn', 0, 1e12)
    const alert = numberIn(a.alertFraction ?? .8, 'Alert fraction', .1, 1)
    const utilization = current / budget; const projectedUtilization = projected / budget; const breached = current > budget || projected > budget
    return { breached, projectedBreach: projected > budget, utilization, projectedUtilization, status: breached ? 'breached' as const : projectedUtilization >= alert ? 'near_limit' as const : 'within_budget' as const }
  },
})

/* B17 — Payment activation is readiness-only and permanently release-locked here. */
export const verifyPaymentPrerequisiteChecklist = query({
  args: { checklist: v.array(check), policyVersion: key },
  returns: v.object({ ready: v.boolean(), passedRequired: v.number(), failedRequired: v.number(), missingRequired: textList, releaseLocked: v.literal(true), policyVersion: v.string() }),
  handler: async (_ctx, a) => {
    const policyVersion = safeKey(a.policyVersion, 'Policy version')
    if (a.checklist.length > 100) throw new ConvexError('Checklist is limited to 100 items')
    const seen = new Set<string>(); let passedRequired = 0; let failedRequired = 0; const missingRequired: string[] = []
    for (const item of a.checklist) { const k = safeKey(item.key, 'Checklist key'); if (seen.has(k)) throw new ConvexError('Checklist keys must be unique'); seen.add(k); clean(item.detail, 'Checklist detail', 500); if (item.required) { if (item.passed) passedRequired++; else { failedRequired++; missingRequired.push(k) } } }
    return { ready: a.checklist.length > 0 && failedRequired === 0, passedRequired, failedRequired, missingRequired, releaseLocked: true as const, policyVersion }
  },
})
export const validatePaymentReleaseGate = mutation({
  args: { requestKey: key, prerequisites: v.array(check), policyVersion: key, reviewerNote: key },
  returns: v.id('scopeBPaymentReleaseGates'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const policyVersion = safeKey(a.policyVersion, 'Policy version')
    if (a.prerequisites.length > 100) throw new ConvexError('Prerequisite checklist is limited to 100 items')
    const failed = a.prerequisites.filter(c => c.required && !c.passed); const reviewerNote = clean(a.reviewerNote, 'Reviewer note', 1000)
    const prerequisiteDigest = await digest(JSON.stringify(a.prerequisites))
    const old = await ctx.db.query('scopeBPaymentReleaseGates').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.prerequisiteDigest !== prerequisiteDigest || old.policyVersion !== policyVersion) throw new ConvexError('Request key conflicts with existing payment release review'); return old._id }
    return ctx.db.insert('scopeBPaymentReleaseGates', { ownerKey, requestKey, policyVersion, prerequisiteDigest, failedRequired: failed.length, ready: a.prerequisites.length > 0 && failed.length === 0, releaseLocked: true, reviewerNote, createdAt: Date.now() })
  },
})
export const assertLivePaymentExecutionLocked = mutation({
  args: { executionMode: v.union(v.literal('live'), v.literal('testing'), v.literal('isolated')), operation: key, requestKey: key },
  returns: v.object({ blocked: v.literal(true), releaseLocked: v.literal(true), reason: v.string() }),
  handler: async (ctx, a) => {
    await requireOperator(ctx); clean(a.operation, 'Payment operation', 120); safeKey(a.requestKey, 'Request key', 120)
    // This function intentionally has no payment provider, credential, or execution path.
    if (a.executionMode === 'live') throw new ConvexError('B17 release lock: live payment execution is forbidden; readiness evaluation cannot authorize transactions')
    throw new ConvexError('B17 hard lock: payment execution is not implemented in any environment; use readiness-only workflows')
  },
})

/* B18 — Product and venture delivery pipeline */
export const transitionReleaseStagingState = mutation({
  args: { requestKey: key, releaseKey: key, fromState: v.union(v.literal('draft'), v.literal('staged'), v.literal('verified'), v.literal('blocked')), toState: v.union(v.literal('draft'), v.literal('staged'), v.literal('verified'), v.literal('blocked')), evidence: textList, note: key },
  returns: v.id('scopeBReleaseStageEvents'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const releaseKey = safeKey(a.releaseKey, 'Release key')
    const allowed: Record<string, string[]> = { draft: ['staged', 'blocked'], staged: ['verified', 'blocked', 'draft'], verified: ['blocked'], blocked: ['draft'] }
    if (!allowed[a.fromState].includes(a.toState)) throw new ConvexError('Invalid release staging transition')
    const evidence = evidenceList(a.evidence, 'Release evidence', 30); const note = clean(a.note, 'Transition note', 1000)
    const prior = await ctx.db.query('scopeBReleaseStageEvents').withIndex('by_owner_release', q => q.eq('ownerKey', ownerKey).eq('releaseKey', releaseKey)).order('desc').first()
    if (prior && prior.toState !== a.fromState) throw new ConvexError('Release staging state changed; reload before transitioning')
    const old = await ctx.db.query('scopeBReleaseStageEvents').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) return old._id
    return ctx.db.insert('scopeBReleaseStageEvents', { ownerKey, requestKey, releaseKey, fromState: a.fromState, toState: a.toState, evidence, note, revision: (prior?.revision ?? 0) + 1, createdAt: Date.now() })
  },
})
export const compileProductionReadinessDossier = action({
  args: { releaseKey: key, checks: v.array(check), artifactDigests: textList, blockers: textList, buildReference: key },
  returns: v.object({ releaseKey: v.string(), ready: v.boolean(), passed: v.number(), failed: v.number(), blockers: textList, artifactDigests: textList, buildReference: v.string(), compiledAt: v.number(), dossierDigest: v.string() }),
  handler: async (_ctx, a) => {
    const releaseKey = safeKey(a.releaseKey, 'Release key'); const buildReference = clean(a.buildReference, 'Build reference', 300)
    if (a.checks.length > 200 || a.artifactDigests.length > 100 || a.blockers.length > 100) throw new ConvexError('Readiness dossier exceeds bounds')
    const checks = a.checks.map(c => ({ key: safeKey(c.key, 'Check key'), passed: c.passed, required: c.required, detail: clean(c.detail, 'Check detail', 500) }))
    const artifactDigests = a.artifactDigests.map(x => { const s = clean(x, 'Artifact digest', 128); if (!/^[a-f0-9]{32,128}$/i.test(s)) throw new ConvexError('Artifact digest must be hexadecimal'); return s })
    const blockers = a.blockers.map(x => clean(x, 'Blocker', 500)); const passed = checks.filter(c => c.passed).length; const failed = checks.filter(c => c.required && !c.passed).length
    const allBlockers = [...blockers, ...checks.filter(c => c.required && !c.passed).map(c => c.key)]
    const dossierDigest = await digest(JSON.stringify({ releaseKey, checks, artifactDigests, blockers: allBlockers, buildReference }))
    return { releaseKey, ready: failed === 0 && allBlockers.length === 0 && checks.length > 0, passed, failed, blockers: allBlockers, artifactDigests, buildReference, compiledAt: Date.now(), dossierDigest }
  },
})
export const recordVerificationSeal = mutation({
  args: { requestKey: key, releaseKey: key, dossierDigest: key, signerLabel: key, evidence: textList },
  returns: v.id('scopeBVerificationSeals'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const releaseKey = safeKey(a.releaseKey, 'Release key')
    const dossierDigest = clean(a.dossierDigest, 'Dossier digest', 128); if (!/^[a-f0-9]{32,128}$/i.test(dossierDigest)) throw new ConvexError('Dossier digest must be hexadecimal')
    const signerLabel = clean(a.signerLabel, 'Signer label', 120); const evidence = evidenceList(a.evidence, 'Seal evidence', 20)
    const old = await ctx.db.query('scopeBVerificationSeals').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.dossierDigest !== dossierDigest || old.releaseKey !== releaseKey) throw new ConvexError('Verification request key conflicts with existing seal'); return old._id }
    return ctx.db.insert('scopeBVerificationSeals', { ownerKey, requestKey, releaseKey, dossierDigest, signerLabel, evidence, status: 'recorded', createdAt: Date.now() })
  },
})

/* B19 — Advanced security and resilience */
export const ingestRateLimitEvent = mutation({
  args: { requestKey: key, subjectKey: key, routeKey: key, observedCount: v.number(), limit: v.number(), windowMs: v.number(), source: key },
  returns: v.id('scopeBRateLimitEvents'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const subjectKey = safeKey(a.subjectKey, 'Subject key'); const routeKey = safeKey(a.routeKey, 'Route key')
    const observedCount = whole(a.observedCount, 'Observed request count', 0, 1e9); const limit = whole(a.limit, 'Rate limit', 1, 1e9); const windowMs = whole(a.windowMs, 'Rate-limit window', 1, 86_400_000); const source = clean(a.source, 'Event source', 120)
    const old = await ctx.db.query('scopeBRateLimitEvents').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) return old._id
    return ctx.db.insert('scopeBRateLimitEvents', { ownerKey, requestKey, subjectKey, routeKey, observedCount, limit, windowMs, source, exceeded: observedCount > limit, createdAt: Date.now() })
  },
})
export const mutateSecurityIncidentLedger = mutation({
  args: { requestKey: key, incidentKey: key, category: key, severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), summary: key, evidence: textList, status: v.union(v.literal('open'), v.literal('triaged'), v.literal('contained'), v.literal('closed')) },
  returns: v.id('scopeBSecurityIncidents'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const incidentKey = safeKey(a.incidentKey, 'Incident key')
    const category = safeKey(a.category, 'Incident category'); const summary = clean(a.summary, 'Incident summary', 1000); const evidence = evidenceList(a.evidence, 'Incident evidence', 30)
    const old = await ctx.db.query('scopeBSecurityIncidents').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey).eq('incidentKey', incidentKey)).first()
    if (old) { if (old.requestKey !== requestKey && old.status === 'closed') throw new ConvexError('Closed incidents cannot be reopened by a different request'); await ctx.db.patch(old._id, { severity: a.severity, summary, evidence, status: a.status, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeBSecurityIncidents', { ownerKey, requestKey, incidentKey, category, severity: a.severity, summary, evidence, status: a.status, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const evaluateSecurityPolicyThresholds = query({
  args: { windowMs: v.optional(v.number()), highSeverityThreshold: v.optional(v.number()), rateLimitEventThreshold: v.optional(v.number()) },
  returns: v.object({ policyTriggered: v.boolean(), openCriticalIncidents: v.number(), highSeverityEvents: v.number(), rateLimitExceedances: v.number(), reasons: textList }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const now = Date.now(); const windowMs = whole(a.windowMs ?? 3_600_000, 'Security window', 1000, 7 * 86_400_000)
    const highThreshold = whole(a.highSeverityThreshold ?? 3, 'High severity threshold', 1, 1000); const rateThreshold = whole(a.rateLimitEventThreshold ?? 10, 'Rate-limit event threshold', 1, 10000)
    const incidents = await ctx.db.query('scopeBSecurityIncidents').withIndex('by_owner_createdAt', q => q.eq('ownerKey', ownerKey).gte('createdAt', now - windowMs)).take(500)
    const rateEvents = await ctx.db.query('scopeBRateLimitEvents').withIndex('by_owner_createdAt', q => q.eq('ownerKey', ownerKey).gte('createdAt', now - windowMs)).take(500)
    const critical = incidents.filter(i => i.severity === 'critical' && i.status !== 'closed').length; const high = incidents.filter(i => i.severity === 'high' || i.severity === 'critical').length; const exceeded = rateEvents.filter(e => e.exceeded).length
    const reasons: string[] = []; if (critical) reasons.push('Open critical security incident exists'); if (high >= highThreshold) reasons.push('High-severity incident threshold reached'); if (exceeded >= rateThreshold) reasons.push('Rate-limit exceedance threshold reached')
    return { policyTriggered: critical > 0 || high >= highThreshold || exceeded >= rateThreshold, openCriticalIncidents: critical, highSeverityEvents: high, rateLimitExceedances: exceeded, reasons }
  },
})

/* B20 — Multi-user and enterprise governance */
export const assignWorkspaceMembership = mutation({
  args: { requestKey: key, workspaceKey: key, memberKey: key, role: v.union(v.literal('owner'), v.literal('admin'), v.literal('editor'), v.literal('viewer'), v.literal('auditor')), permissions: textList },
  returns: v.id('scopeBWorkspaceMemberships'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const workspaceKey = safeKey(a.workspaceKey, 'Workspace key'); const memberKey = safeKey(a.memberKey, 'Member key')
    const permissions = [...new Set(a.permissions.map(p => safeKey(p, 'Permission')))]
    if (permissions.length > 100) throw new ConvexError('At most 100 permissions are allowed')
    if (a.role === 'owner' && memberKey !== ownerKey) throw new ConvexError('Only the authenticated operator can retain the owner role through this assignment endpoint')
    const old = await ctx.db.query('scopeBWorkspaceMemberships').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.workspaceKey !== workspaceKey || old.memberKey !== memberKey) throw new ConvexError('Membership request key conflict'); return old._id }
    const existing = await ctx.db.query('scopeBWorkspaceMemberships').withIndex('by_owner_workspace_member', q => q.eq('ownerKey', ownerKey).eq('workspaceKey', workspaceKey).eq('memberKey', memberKey)).first()
    if (existing) { await ctx.db.patch(existing._id, { role: a.role, permissions, updatedAt: Date.now(), requestKey }); return existing._id }
    return ctx.db.insert('scopeBWorkspaceMemberships', { ownerKey, requestKey, workspaceKey, memberKey, role: a.role, permissions, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const validateRbacRolePermission = query({
  args: { workspaceKey: key, memberKey: key, permission: key },
  returns: v.object({ allowed: v.boolean(), role: v.union(v.literal('owner'), v.literal('admin'), v.literal('editor'), v.literal('viewer'), v.literal('auditor'), v.literal('none')), reason: v.string() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const workspaceKey = safeKey(a.workspaceKey, 'Workspace key'); const memberKey = safeKey(a.memberKey, 'Member key'); const permission = safeKey(a.permission, 'Permission')
    const row = await ctx.db.query('scopeBWorkspaceMemberships').withIndex('by_owner_workspace_member', q => q.eq('ownerKey', ownerKey).eq('workspaceKey', workspaceKey).eq('memberKey', memberKey)).first()
    if (!row) return { allowed: false, role: 'none' as const, reason: 'No membership exists in this operator-owned workspace' }
    const rolePermissions: Record<string, string[]> = { owner: ['*'], admin: ['workspace.read','workspace.manage','members.manage','missions.read','missions.write','audit.read','artifacts.read','artifacts.write'], editor: ['workspace.read','missions.read','missions.write','artifacts.read','artifacts.write'], viewer: ['workspace.read','missions.read','artifacts.read'], auditor: ['workspace.read','audit.read','artifacts.read'] }
    const allowed = rolePermissions[row.role].includes('*') || rolePermissions[row.role].includes(permission) || row.permissions.includes(permission)
    return { allowed, role: row.role, reason: allowed ? 'Permission is granted by role or explicit scoped grant' : 'Permission is not granted to this workspace membership' }
  },
})
export const queryScopedAuditTrail = query({
  args: { workspaceKey: v.optional(v.string()), actorKey: v.optional(v.string()), actionKey: v.optional(v.string()), since: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.array(v.object({ workspaceKey: v.string(), actorKey: v.string(), actionKey: v.string(), subjectKey: v.string(), detail: v.string(), createdAt: v.number() })),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const limit = whole(a.limit ?? 100, 'Audit limit', 1, 500)
    if (a.since !== undefined) numberIn(a.since, 'Audit start time', 0, Date.now())
    const rows = await ctx.db.query('scopeBGovernanceAuditEvents').withIndex('by_owner_createdAt', q => a.since === undefined ? q.eq('ownerKey', ownerKey) : q.eq('ownerKey', ownerKey).gte('createdAt', a.since!)).order('desc').take(limit)
    return rows.filter(r => (!a.workspaceKey || r.workspaceKey === a.workspaceKey) && (!a.actorKey || r.actorKey === a.actorKey) && (!a.actionKey || r.actionKey === a.actionKey)).map(r => ({ workspaceKey: r.workspaceKey, actorKey: r.actorKey, actionKey: r.actionKey, subjectKey: r.subjectKey, detail: r.detail, createdAt: r.createdAt }))
  },
})

/* B21 — External agent and developer ecosystem */
export const recordWebhookSubscription = mutation({
  args: { requestKey: key, subscriptionKey: key, endpoint: key, events: textList, secretConfigured: v.boolean(), status: v.union(v.literal('draft'), v.literal('active'), v.literal('paused')) },
  returns: v.id('scopeBWebhookSubscriptions'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const subscriptionKey = safeKey(a.subscriptionKey, 'Subscription key')
    const endpoint = clean(a.endpoint, 'Webhook endpoint', 500); let parsed: URL
    try { parsed = new URL(endpoint) } catch { throw new ConvexError('Webhook endpoint must be a valid HTTPS URL') }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new ConvexError('Webhook endpoint must use HTTPS and omit credentials/fragments')
    const events = [...new Set(a.events.map(e => safeKey(e, 'Webhook event')))]
    if (!events.length || events.length > 50) throw new ConvexError('Provide 1–50 webhook event names')
    if (a.status === 'active' && !a.secretConfigured) throw new ConvexError('Webhook cannot be activated without a configured signing secret')
    const old = await ctx.db.query('scopeBWebhookSubscriptions').withIndex('by_owner_subscription', q => q.eq('ownerKey', ownerKey).eq('subscriptionKey', subscriptionKey)).first()
    if (old) { await ctx.db.patch(old._id, { endpoint, events, secretConfigured: a.secretConfigured, status: a.status, updatedAt: Date.now(), requestKey }); return old._id }
    return ctx.db.insert('scopeBWebhookSubscriptions', { ownerKey, requestKey, subscriptionKey, endpoint, events, secretConfigured: a.secretConfigured, status: a.status, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const generateScopedApiTokenDraft = mutation({
  args: { requestKey: key, tokenLabel: key, scopes: textList, clientHash: key, expectedClientHash: key, expiresAt: v.number() },
  returns: v.id('scopeBApiTokenDrafts'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const tokenLabel = clean(a.tokenLabel, 'Token label', 120)
    const scopes = [...new Set(a.scopes.map(s => safeKey(s, 'Token scope')))]
    if (!scopes.length || scopes.length > 50) throw new ConvexError('Provide 1–50 scopes')
    const clientHash = clean(a.clientHash, 'Client hash', 128); const expectedClientHash = clean(a.expectedClientHash, 'Expected client hash', 128)
    if (!/^[a-f0-9]{64}$/i.test(clientHash) || !/^[a-f0-9]{64}$/i.test(expectedClientHash) || clientHash.toLowerCase() !== expectedClientHash.toLowerCase()) throw new ConvexError('Client hash check failed; no token draft was recorded')
    const expiresAt = numberIn(a.expiresAt, 'Token expiry', Date.now() + 60_000, Date.now() + 366 * 86_400_000)
    const old = await ctx.db.query('scopeBApiTokenDrafts').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.clientHash !== clientHash || old.tokenLabel !== tokenLabel) throw new ConvexError('Token draft request key conflict'); return old._id }
    const draftDigest = await digest([ownerKey, requestKey, tokenLabel, scopes.join(','), clientHash, String(expiresAt)].join('|'))
    return ctx.db.insert('scopeBApiTokenDrafts', { ownerKey, requestKey, tokenLabel, scopes, clientHash, draftDigest, expiresAt, status: 'draft', createdAt: Date.now() })
  },
})
export const updateListenerStatus = mutation({
  args: { requestKey: key, listenerKey: key, status: v.union(v.literal('healthy'), v.literal('degraded'), v.literal('offline'), v.literal('disabled')), lastHeartbeatAt: v.number(), detail: key },
  returns: v.id('scopeBListenerStatuses'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const listenerKey = safeKey(a.listenerKey, 'Listener key')
    const lastHeartbeatAt = numberIn(a.lastHeartbeatAt, 'Heartbeat time', 0, Date.now() + 60_000); const detail = clean(a.detail, 'Listener detail', 500)
    const old = await ctx.db.query('scopeBListenerStatuses').withIndex('by_owner_listener', q => q.eq('ownerKey', ownerKey).eq('listenerKey', listenerKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, status: a.status, lastHeartbeatAt, detail, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeBListenerStatuses', { ownerKey, requestKey, listenerKey, status: a.status, lastHeartbeatAt, detail, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

/* B22 — Competitive validation and novelty */
export const recordPriorArtCitation = mutation({
  args: { requestKey: key, ideaKey: key, citationKey: key, title: key, sourceUrl: key, publishedAt: v.optional(v.number()), relevance: v.number(), notes: key },
  returns: v.id('scopeBPriorArtCitations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const ideaKey = safeKey(a.ideaKey, 'Idea key'); const citationKey = safeKey(a.citationKey, 'Citation key')
    const title = clean(a.title, 'Citation title', 300); const sourceUrl = clean(a.sourceUrl, 'Citation URL', 1000); let parsed: URL
    try { parsed = new URL(sourceUrl) } catch { throw new ConvexError('Citation URL is invalid') }
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new ConvexError('Citation must use HTTP(S) without embedded credentials')
    const publishedAt = a.publishedAt === undefined ? undefined : numberIn(a.publishedAt, 'Publication date', 0, Date.now() + 60_000)
    const relevance = numberIn(a.relevance, 'Citation relevance', 0, 1); const notes = clean(a.notes, 'Citation notes', 1200)
    const old = await ctx.db.query('scopeBPriorArtCitations').withIndex('by_owner_citation', q => q.eq('ownerKey', ownerKey).eq('citationKey', citationKey)).first()
    if (old) return old._id
    return ctx.db.insert('scopeBPriorArtCitations', { ownerKey, requestKey, ideaKey, citationKey, title, sourceUrl, publishedAt, relevance, notes, createdAt: Date.now() })
  },
})
export const calculateCompetitiveScorecard = query({
  args: { differentiation: v.number(), switchingCost: v.number(), distributionAdvantage: v.number(), executionSpeed: v.number(), evidenceStrength: v.number(), competitorDensity: v.number() },
  returns: v.object({ score: v.number(), band: v.union(v.literal('weak'), v.literal('defensible'), v.literal('strong')), factors: textList }),
  handler: async (_ctx, a) => {
    for (const [k, n] of Object.entries(a)) numberIn(n, k, 0, 100)
    const score = Math.round(a.differentiation * .25 + a.switchingCost * .2 + a.distributionAdvantage * .15 + a.executionSpeed * .15 + a.evidenceStrength * .2 + (100 - a.competitorDensity) * .05)
    const factors = [a.differentiation < 40 ? 'Differentiation requires evidence' : 'Differentiation is a relative strength', a.switchingCost < 30 ? 'Switching costs appear low' : 'Switching costs may support retention', a.evidenceStrength < 50 ? 'Claims need stronger independent evidence' : 'Evidence strength is supportive', a.competitorDensity > 75 ? 'Crowded competitive field' : 'Competitive density is manageable']
    return { score, band: score >= 75 ? 'strong' as const : score >= 50 ? 'defensible' as const : 'weak' as const, factors }
  },
})
export const mutateMoatEvaluationRecord = mutation({
  args: { requestKey: key, ideaKey: key, score: v.number(), moatTypes: textList, evidence: textList, weaknesses: textList, reviewerNote: key },
  returns: v.id('scopeBMoatEvaluations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const ideaKey = safeKey(a.ideaKey, 'Idea key')
    const score = numberIn(a.score, 'Moat score', 0, 100); const moatTypes = [...new Set(a.moatTypes.map(x => safeKey(x, 'Moat type')))]
    if (moatTypes.length > 20) throw new ConvexError('At most 20 moat types are allowed')
    const evidence = evidenceList(a.evidence, 'Moat evidence', 30); const weaknesses = a.weaknesses.map(x => clean(x, 'Weakness', 500))
    if (weaknesses.length > 30) throw new ConvexError('At most 30 weaknesses are allowed')
    const reviewerNote = clean(a.reviewerNote, 'Reviewer note', 1000)
    const old = await ctx.db.query('scopeBMoatEvaluations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.ideaKey !== ideaKey) throw new ConvexError('Moat evaluation request key conflict'); return old._id }
    return ctx.db.insert('scopeBMoatEvaluations', { ownerKey, requestKey, ideaKey, score, moatTypes, evidence, weaknesses, reviewerNote, createdAt: Date.now() })
  },
})

/* B23 — Frontier scientific research */
export const preregisterResearchProtocol = mutation({
  args: { requestKey: key, protocolKey: key, hypothesis: key, primaryEndpoint: key, sampleSize: v.number(), alpha: v.number(), method: key, exclusions: textList, analysisPlan: key },
  returns: v.id('scopeBResearchProtocols'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const protocolKey = safeKey(a.protocolKey, 'Protocol key')
    const hypothesis = clean(a.hypothesis, 'Hypothesis', 2000); const primaryEndpoint = clean(a.primaryEndpoint, 'Primary endpoint', 500); const sampleSize = whole(a.sampleSize, 'Sample size', 2, 1_000_000)
    const alpha = numberIn(a.alpha, 'Alpha', .000001, .2); const method = clean(a.method, 'Statistical method', 200)
    const exclusions = a.exclusions.map(x => clean(x, 'Exclusion criterion', 500)); if (exclusions.length > 50) throw new ConvexError('At most 50 exclusion criteria are allowed')
    const analysisPlan = clean(a.analysisPlan, 'Analysis plan', 5000); const protocolDigest = await digest(JSON.stringify({ hypothesis, primaryEndpoint, sampleSize, alpha, method, exclusions, analysisPlan }))
    const old = await ctx.db.query('scopeBResearchProtocols').withIndex('by_owner_protocol', q => q.eq('ownerKey', ownerKey).eq('protocolKey', protocolKey)).first()
    if (old) { if (old.protocolDigest !== protocolDigest) throw new ConvexError('Preregistered protocol is immutable; use a new protocol key for a revision'); return old._id }
    return ctx.db.insert('scopeBResearchProtocols', { ownerKey, requestKey, protocolKey, hypothesis, primaryEndpoint, sampleSize, alpha, method, exclusions, analysisPlan, protocolDigest, status: 'preregistered', createdAt: Date.now() })
  },
})
export const ingestTrialObservation = mutation({
  args: { requestKey: key, protocolKey: key, subjectKey: key, group: v.union(v.literal('control'), v.literal('treatment'), v.literal('other')), value: v.number(), unit: key, evidence: textList, observedAt: v.optional(v.number()) },
  returns: v.id('scopeBTrialObservations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const protocolKey = safeKey(a.protocolKey, 'Protocol key'); const subjectKey = safeKey(a.subjectKey, 'Subject key')
    const protocol = await ctx.db.query('scopeBResearchProtocols').withIndex('by_owner_protocol', q => q.eq('ownerKey', ownerKey).eq('protocolKey', protocolKey)).first()
    if (!protocol || protocol.status !== 'preregistered') throw new ConvexError('Trial observations require an existing preregistered protocol')
    const value = numberIn(a.value, 'Observation value', -1e15, 1e15); const unit = clean(a.unit, 'Observation unit', 80); const evidence = evidenceList(a.evidence, 'Observation evidence', 20)
    const observedAt = numberIn(a.observedAt ?? Date.now(), 'Observation time', 0, Date.now() + 60_000)
    const old = await ctx.db.query('scopeBTrialObservations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.protocolKey !== protocolKey || old.subjectKey !== subjectKey || old.value !== value) throw new ConvexError('Observation request key conflicts with existing data'); return old._id }
    return ctx.db.insert('scopeBTrialObservations', { ownerKey, requestKey, protocolKey, subjectKey, group: a.group, value, unit, evidence, observedAt })
  },
})
export const screenStatisticalSignificance = query({
  args: { protocolKey: key, controlGroup: v.optional(v.string()), treatmentGroup: v.optional(v.string()) },
  returns: v.object({ nControl: v.number(), nTreatment: v.number(), meanControl: v.union(v.number(), v.null()), meanTreatment: v.union(v.number(), v.null()), varianceControl: v.union(v.number(), v.null()), varianceTreatment: v.union(v.number(), v.null()), tStatistic: v.union(v.number(), v.null()), degreesOfFreedom: v.number(), alpha: v.number(), screenedSignificant: v.boolean(), caveat: v.string() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const protocolKey = safeKey(a.protocolKey, 'Protocol key')
    const protocol = await ctx.db.query('scopeBResearchProtocols').withIndex('by_owner_protocol', q => q.eq('ownerKey', ownerKey).eq('protocolKey', protocolKey)).first()
    if (!protocol) throw new ConvexError('Research protocol not found')
    const rows = await ctx.db.query('scopeBTrialObservations').withIndex('by_owner_protocol', q => q.eq('ownerKey', ownerKey).eq('protocolKey', protocolKey)).take(10000)
    const cName = a.controlGroup ?? 'control'; const tName = a.treatmentGroup ?? 'treatment'
    const c = rows.filter(r => r.group === cName).map(r => r.value); const t = rows.filter(r => r.group === tName).map(r => r.value)
    const stats = (x: number[]) => { if (!x.length) return { mean: null as number | null, variance: null as number | null }; const mean = x.reduce((s, n) => s + n, 0) / x.length; const variance = x.length > 1 ? x.reduce((s, n) => s + (n - mean) ** 2, 0) / (x.length - 1) : null; return { mean, variance } }
    const cs = stats(c); const ts = stats(t); const df = Math.max(0, c.length + t.length - 2)
    const denom = cs.variance !== null && ts.variance !== null && c.length && t.length ? Math.sqrt(cs.variance / c.length + ts.variance / t.length) : 0
    const tStatistic = denom > 0 && cs.mean !== null && ts.mean !== null ? (ts.mean - cs.mean) / denom : null
    // This is a screening approximation, not a calibrated p-value or a substitute for a preregistered analysis.
    const screenedSignificant = tStatistic !== null && df > 0 && Math.abs(tStatistic) >= (protocol.alpha <= .01 ? 2.8 : protocol.alpha <= .05 ? 2 : 1.65)
    return { nControl: c.length, nTreatment: t.length, meanControl: cs.mean, meanTreatment: ts.mean, varianceControl: cs.variance, varianceTreatment: ts.variance, tStatistic, degreesOfFreedom: df, alpha: protocol.alpha, screenedSignificant, caveat: 'Approximate two-sided t-statistic screening only; not a p-value, causal conclusion, or substitute for a validated statistical analysis plan.' }
  },
})

/* B24 — AGI generality and alignment */
export const aggregateMultiDomainTransferMatrix = query({
  args: { observations: v.array(v.object({ sourceDomain: key, targetDomain: key, baselineScore: v.number(), transferScore: v.number(), sampleCount: v.number() })) },
  returns: v.object({ cells: v.array(v.object({ sourceDomain: v.string(), targetDomain: v.string(), baselineScore: v.number(), transferScore: v.number(), transferDelta: v.number(), sampleCount: v.number() })), meanTransferDelta: v.union(v.number(), v.null()), coverage: v.number(), weakTransfers: v.number() }),
  handler: async (_ctx, a) => {
    if (a.observations.length > 500) throw new ConvexError('Transfer matrix is limited to 500 cells')
    const seen = new Set<string>()
    const cells = a.observations.map(o => { const sourceDomain = safeKey(o.sourceDomain, 'Source domain'); const targetDomain = safeKey(o.targetDomain, 'Target domain'); const id = sourceDomain + '::' + targetDomain; if (seen.has(id)) throw new ConvexError('Transfer matrix contains duplicate domain pairs'); seen.add(id)
      const baselineScore = numberIn(o.baselineScore, 'Baseline score', 0, 100); const transferScore = numberIn(o.transferScore, 'Transfer score', 0, 100); const sampleCount = whole(o.sampleCount, 'Sample count', 1, 1_000_000)
      return { sourceDomain, targetDomain, baselineScore, transferScore, transferDelta: transferScore - baselineScore, sampleCount } })
    const meanTransferDelta = cells.length ? cells.reduce((s, c) => s + c.transferDelta, 0) / cells.length : null
    return { cells, meanTransferDelta, coverage: cells.length, weakTransfers: cells.filter(c => c.transferScore < c.baselineScore).length }
  },
})
export const guardRecursiveSelfImprovementContainment = query({
  args: { proposedChanges: textList, allowedChangeClasses: textList, deniedChangeClasses: textList, changesSafetyPolicy: v.boolean(), humanApproval: v.boolean(), rollbackAvailable: v.boolean() },
  returns: v.object({ permittedForReview: v.boolean(), denied: textList, unapproved: textList, requiresHumanApproval: v.boolean(), reason: v.string() }),
  handler: async (_ctx, a) => {
    if (a.proposedChanges.length > 100 || a.allowedChangeClasses.length > 100 || a.deniedChangeClasses.length > 100) throw new ConvexError('Change lists are limited to 100 items')
    const proposed = [...new Set(a.proposedChanges.map(x => safeKey(x, 'Change class')))]
    const allowed = new Set(a.allowedChangeClasses.map(x => safeKey(x, 'Allowed change'))); const deniedSet = new Set(a.deniedChangeClasses.map(x => safeKey(x, 'Denied change')))
    const denied = proposed.filter(x => deniedSet.has(x)); const unapproved = proposed.filter(x => !allowed.has(x))
    const requiresHumanApproval = a.humanApproval || a.changesSafetyPolicy || !a.rollbackAvailable
    const permittedForReview = proposed.length > 0 && denied.length === 0 && unapproved.length === 0 && !requiresHumanApproval
    return { permittedForReview, denied, unapproved, requiresHumanApproval, reason: denied.length ? 'Explicitly denied change class' : unapproved.length ? 'Change class is outside the allowlist' : requiresHumanApproval ? 'Human approval, safety-policy review, or rollback capability is required' : 'Change remains subject to independent review; this guard does not execute self-modification' }
  },
})
export const verifyAlignmentConstraints = mutation({
  args: { requestKey: key, systemKey: key, constraints: v.array(v.object({ key: key, required: v.boolean(), satisfied: v.boolean(), evidence: textList, rationale: key })), policyVersion: key },
  returns: v.id('scopeBAlignmentConstraintReviews'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx); const requestKey = safeKey(a.requestKey, 'Request key', 120); const systemKey = safeKey(a.systemKey, 'System key'); const policyVersion = safeKey(a.policyVersion, 'Policy version')
    if (!a.constraints.length || a.constraints.length > 100) throw new ConvexError('Provide 1–100 alignment constraints')
    const seen = new Set<string>(); const constraints = a.constraints.map(c => { const k = safeKey(c.key, 'Constraint key'); if (seen.has(k)) throw new ConvexError('Constraint keys must be unique'); seen.add(k); return { key: k, required: c.required, satisfied: c.satisfied, evidence: evidenceList(c.evidence, 'Constraint evidence', 10), rationale: clean(c.rationale, 'Constraint rationale', 1000) } })
    const failedRequired = constraints.filter(c => c.required && !c.satisfied).map(c => c.key); const reviewDigest = await digest(JSON.stringify({ systemKey, policyVersion, constraints }))
    const old = await ctx.db.query('scopeBAlignmentConstraintReviews').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.reviewDigest !== reviewDigest) throw new ConvexError('Alignment review request key conflicts with different constraints'); return old._id }
    return ctx.db.insert('scopeBAlignmentConstraintReviews', { ownerKey, requestKey, systemKey, policyVersion, constraints, failedRequired, status: failedRequired.length ? 'blocked' : 'eligible_for_review', reviewDigest, createdAt: Date.now() })
  },
})
