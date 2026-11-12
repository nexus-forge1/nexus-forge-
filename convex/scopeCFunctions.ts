import { action, mutation, query } from './_generated/server'
import { ConvexError, v } from 'convex/values'
import { requireOperator } from './permissions'
import { bounded, digest, secrets } from './studioModel'

const textList = v.array(v.string())
const scoreInput = v.number()

function clean(value: string, label: string, max = 500): string {
  const result = bounded(value, label, max).trim()
  if (!result) throw new ConvexError(label + ' is required')
  secrets(result)
  return result
}
function safeKey(value: string, label = 'Key', max = 100): string {
  const result = clean(value, label, max)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new ConvexError(label + ' contains unsupported characters')
  return result
}
function finite(value: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new ConvexError(label + ' is outside its permitted range')
  return value
}
function whole(value: number, label: string, min = 0, max = 1_000_000): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConvexError(label + ' must be a bounded integer')
  return value
}
function list(values: string[], label: string, max = 30): string[] {
  if (values.length > max) throw new ConvexError(label + ' exceeds ' + max + ' entries')
  const result = values.map((x, i) => clean(x, label + ' ' + (i + 1), 300))
  if (new Set(result).size !== result.length) throw new ConvexError(label + ' must not contain duplicates')
  return result
}
function requireEvidence(values: string[], label = 'Evidence'): string[] {
  const result = list(values, label, 20)
  if (!result.length) throw new ConvexError(label + ' must include at least one item')
  return result
}
function clampScore(value: number, label: string): number {
  return finite(value, label, 0, 100)
}

/* C1 — Comparative validation */
export const ingestCandidateBenchmark = mutation({
  args: {
    requestKey: v.string(), candidateKey: v.string(), benchmarkKey: v.string(),
    score: v.number(), weight: v.number(), evidence: textList, sampleCount: v.number(),
    notes: v.string(),
  },
  returns: v.id('scopeCCandidateBenchmarks'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const candidateKey = safeKey(args.candidateKey, 'Candidate key')
    const benchmarkKey = safeKey(args.benchmarkKey, 'Benchmark key')
    const score = clampScore(args.score, 'Benchmark score')
    const weight = finite(args.weight, 'Benchmark weight', 0, 100)
    if (weight === 0) throw new ConvexError('Benchmark weight must be greater than zero')
    const sampleCount = whole(args.sampleCount, 'Sample count', 1, 1_000_000)
    const evidence = requireEvidence(args.evidence)
    const notes = bounded(args.notes, 'Notes', 2000)
    const existing = await ctx.db.query('scopeCCandidateBenchmarks').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing && existing.candidateKey === candidateKey && existing.benchmarkKey === benchmarkKey) {
      await ctx.db.patch(existing._id, { score, weight, evidence, sampleCount, notes, recordedAt: Date.now() })
      return existing._id
    }
    return await ctx.db.insert('scopeCCandidateBenchmarks', { ownerKey, requestKey, candidateKey, benchmarkKey, score, weight, evidence, sampleCount, notes, recordedAt: Date.now() })
  },
})
export const calculatePairwiseBenchmarkResults = query({
  args: { candidateA: v.string(), candidateB: v.string(), benchmarkKey: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({ candidateA: v.string(), candidateB: v.string(), winsA: v.number(), winsB: v.number(), ties: v.number(), comparisons: v.number(), winRateA: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const a = safeKey(args.candidateA, 'Candidate A')
    const b = safeKey(args.candidateB, 'Candidate B')
    if (a === b) throw new ConvexError('Pairwise candidates must be different')
    const limit = whole(args.limit ?? 200, 'Comparison limit', 1, 500)
    const rows = await ctx.db.query('scopeCCandidateBenchmarks').withIndex('by_owner_candidate', q => q.eq('ownerKey', ownerKey).eq('candidateKey', a)).take(limit)
    const bRows = await ctx.db.query('scopeCCandidateBenchmarks').withIndex('by_owner_candidate', q => q.eq('ownerKey', ownerKey).eq('candidateKey', b)).take(limit)
    const bMap = new Map(bRows.filter(x => !args.benchmarkKey || x.benchmarkKey === args.benchmarkKey).map(x => [x.benchmarkKey, x]))
    let winsA = 0, winsB = 0, ties = 0
    for (const row of rows) {
      if (args.benchmarkKey && row.benchmarkKey !== args.benchmarkKey) continue
      const other = bMap.get(row.benchmarkKey)
      if (!other) continue
      const left = row.score * row.weight
      const right = other.score * other.weight
      if (left > right) winsA++
      else if (right > left) winsB++
      else ties++
    }
    const comparisons = winsA + winsB + ties
    return { candidateA: a, candidateB: b, winsA, winsB, ties, comparisons, winRateA: comparisons ? (winsA + ties * 0.5) / comparisons : null }
  },
})
export const resolveWeightedCandidateScores = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({ candidateKey: v.string(), weightedScore: v.number(), totalWeight: v.number(), benchmarkCount: v.number(), evidenceCount: v.number() })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const rows = await ctx.db.query('scopeCCandidateBenchmarks').withIndex('by_owner_recordedAt', q => q.eq('ownerKey', ownerKey)).order('desc').take(whole(args.limit ?? 300, 'Candidate limit', 1, 500))
    const grouped = new Map<string, { weighted: number; weight: number; count: number; evidence: number }>()
    for (const row of rows) {
      const g = grouped.get(row.candidateKey) ?? { weighted: 0, weight: 0, count: 0, evidence: 0 }
      g.weighted += row.score * row.weight
      g.weight += row.weight
      g.count++
      g.evidence += row.evidence.length
      grouped.set(row.candidateKey, g)
    }
    return [...grouped.entries()].map(([candidateKey, g]) => ({ candidateKey, weightedScore: g.weight ? g.weighted / g.weight : 0, totalWeight: g.weight, benchmarkCount: g.count, evidenceCount: g.evidence })).sort((a, b) => b.weightedScore - a.weightedScore)
  },
})
export const recordComparativeValidationDecision = mutation({
  args: { requestKey: v.string(), candidateKey: v.string(), decision: v.union(v.literal('advance'), v.literal('hold'), v.literal('reject')), score: v.number(), rationale: v.string(), evidence: textList },
  returns: v.id('scopeCValidationDecisions'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const candidateKey = safeKey(args.candidateKey, 'Candidate key')
    const score = clampScore(args.score, 'Validation score')
    const rationale = clean(args.rationale, 'Rationale', 2000)
    const evidence = requireEvidence(args.evidence)
    return await ctx.db.insert('scopeCValidationDecisions', { ownerKey, requestKey, candidateKey, decision: args.decision, score, rationale, evidence, recordedAt: Date.now() })
  },
})

/* C2 — Team governance */
export const configureApprovalPolicy = mutation({
  args: { requestKey: v.string(), policyKey: v.string(), requiredApprovals: v.number(), eligibleRoles: textList, protectedActions: textList, enabled: v.boolean() },
  returns: v.id('scopeCApprovalPolicies'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const policyKey = safeKey(args.policyKey, 'Policy key')
    const requiredApprovals = whole(args.requiredApprovals, 'Required approvals', 1, 20)
    const eligibleRoles = requireEvidence(args.eligibleRoles, 'Eligible roles')
    const protectedActions = requireEvidence(args.protectedActions, 'Protected actions')
    const prior = await ctx.db.query('scopeCApprovalPolicies').withIndex('by_owner_policy', q => q.eq('ownerKey', ownerKey).eq('policyKey', policyKey)).first()
    const values = { ownerKey, requestKey, policyKey, requiredApprovals, eligibleRoles, protectedActions, enabled: args.enabled, updatedAt: Date.now() }
    if (prior) { await ctx.db.patch(prior._id, values); return prior._id }
    return await ctx.db.insert('scopeCApprovalPolicies', { ...values, createdAt: Date.now() })
  },
})
export const verifyRolePermissionMatrix = query({
  args: { role: v.string(), permissions: textList },
  returns: v.object({ role: v.string(), allowed: v.array(v.string()), denied: v.array(v.string()), valid: v.boolean() }),
  handler: async (ctx, args) => {
    await requireOperator(ctx)
    const role = safeKey(args.role, 'Role').toLowerCase()
    const permissions = list(args.permissions, 'Permissions')
    const matrix: Record<string, string[]> = {
      owner: ['workspace.read','workspace.write','members.manage','policy.manage','secrets.manage','release.approve','audit.read','billing.manage'],
      admin: ['workspace.read','workspace.write','members.manage','policy.manage','release.approve','audit.read'],
      editor: ['workspace.read','workspace.write'],
      viewer: ['workspace.read'],
      auditor: ['workspace.read','audit.read'],
    }
    const allowedSet = new Set(matrix[role] ?? [])
    const allowed = permissions.filter(p => allowedSet.has(p))
    const denied = permissions.filter(p => !allowedSet.has(p))
    return { role, allowed, denied, valid: denied.length === 0 }
  },
})
export const assignCrossOperatorTask = mutation({
  args: { requestKey: v.string(), taskKey: v.string(), fromOperator: v.string(), toOperator: v.string(), role: v.union(v.literal('owner'), v.literal('admin'), v.literal('editor'), v.literal('viewer'), v.literal('auditor')), requiredApprovals: v.number(), evidence: textList },
  returns: v.id('scopeCCrossOperatorTasks'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const taskKey = safeKey(args.taskKey, 'Task key')
    const fromOperator = safeKey(args.fromOperator, 'Source operator')
    const toOperator = safeKey(args.toOperator, 'Target operator')
    if (fromOperator === toOperator) throw new ConvexError('Cross-operator assignment requires distinct operators')
    const requiredApprovals = whole(args.requiredApprovals, 'Required approvals', 1, 20)
    const evidence = requireEvidence(args.evidence)
    return await ctx.db.insert('scopeCCrossOperatorTasks', { ownerKey, requestKey, taskKey, fromOperator, toOperator, role: args.role, requiredApprovals, evidence, status: 'pending', createdAt: Date.now() })
  },
})
export const evaluateMultiSigQuorum = query({
  args: { policyKey: v.string(), approvals: v.array(v.object({ operatorKey: v.string(), role: v.string(), approved: v.boolean() })) },
  returns: v.object({ required: v.number(), approvals: v.number(), rejected: v.number(), eligibleApprovals: v.number(), quorumMet: v.boolean(), distinctOperators: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const policyKey = safeKey(args.policyKey, 'Policy key')
    const policy = await ctx.db.query('scopeCApprovalPolicies').withIndex('by_owner_policy', q => q.eq('ownerKey', ownerKey).eq('policyKey', policyKey)).first()
    if (!policy || !policy.enabled) throw new ConvexError('Enabled approval policy not found')
    if (args.approvals.length > 100) throw new ConvexError('Approval set exceeds maximum size')
    const distinct = new Set<string>()
    let eligibleApprovals = 0, rejected = 0
    for (const item of args.approvals) {
      const op = safeKey(item.operatorKey, 'Approver')
      const role = safeKey(item.role, 'Approver role')
      if (distinct.has(op)) continue
      distinct.add(op)
      if (!item.approved) { rejected++; continue }
      if (policy.eligibleRoles.includes(role)) eligibleApprovals++
    }
    return { required: policy.requiredApprovals, approvals: args.approvals.filter(x => x.approved).length, rejected, eligibleApprovals, quorumMet: eligibleApprovals >= policy.requiredApprovals, distinctOperators: distinct.size }
  },
})

/* C3 — Developer integrations */
export const transitionApiCredentialLifecycle = mutation({
  args: { requestKey: v.string(), credentialKey: v.string(), operation: v.union(v.literal('issue_draft'), v.literal('revoke'), v.literal('expire')), scopes: textList, expiresAt: v.optional(v.number()), reason: v.string() },
  returns: v.id('scopeCApiCredentials'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const credentialKey = safeKey(args.credentialKey, 'Credential key')
    const reason = clean(args.reason, 'Reason', 1000)
    const prior = await ctx.db.query('scopeCApiCredentials').withIndex('by_owner_credential', q => q.eq('ownerKey', ownerKey).eq('credentialKey', credentialKey)).first()
    const now = Date.now()
    if (args.operation === 'issue_draft') {
      if (prior && prior.status !== 'revoked' && prior.status !== 'expired') throw new ConvexError('Credential key already has an active lifecycle record')
      const scopes = requireEvidence(args.scopes, 'Credential scopes')
      const expiresAt = finite(args.expiresAt ?? now + 86_400_000, 'Credential expiry', now + 60_000, now + 366 * 86_400_000)
      return await ctx.db.insert('scopeCApiCredentials', { ownerKey, requestKey, credentialKey, scopes, status: 'draft', reason, createdAt: now, updatedAt: now, expiresAt })
    }
    if (!prior) throw new ConvexError('Credential lifecycle record not found')
    if (prior.status === 'revoked' || prior.status === 'expired') return prior._id
    await ctx.db.patch(prior._id, { status: args.operation === 'revoke' ? 'revoked' : 'expired', reason, updatedAt: now })
    return prior._id
  },
})
export const simulateIntegrationEventTrigger = action({
  args: { triggerKey: v.string(), eventType: v.string(), payload: v.any(), schema: v.array(v.object({ key: v.string(), type: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('object'), v.literal('array')), required: v.boolean() })) },
  returns: v.object({ triggerKey: v.string(), eventType: v.string(), valid: v.boolean(), issues: v.array(v.string()), simulated: v.literal(true), sideEffectsPerformed: v.literal(false), payloadDigest: v.string() }),
  handler: async (_ctx, args) => {
    const triggerKey = safeKey(args.triggerKey, 'Trigger key')
    const eventType = safeKey(args.eventType, 'Event type')
    if (args.schema.length > 100) throw new ConvexError('Payload schema exceeds maximum size')
    const issues: string[] = []
    const payload = args.payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new ConvexError('Event payload must be a plain object')
    const record = payload as Record<string, unknown>
    for (const field of args.schema) {
      const fieldKey = safeKey(field.key, 'Payload field')
      const value = record[fieldKey]
      if (value === undefined || value === null) { if (field.required) issues.push(fieldKey + ' is required'); continue }
      const actual = Array.isArray(value) ? 'array' : typeof value
      if (actual !== field.type) issues.push(fieldKey + ' expected ' + field.type + ' but received ' + actual)
    }
    const payloadDigest = await digest(JSON.stringify(payload))
    return { triggerKey, eventType, valid: issues.length === 0, issues, simulated: true as const, sideEffectsPerformed: false as const, payloadDigest }
  },
})
export const persistWebhookEndpoint = mutation({
  args: { requestKey: v.string(), endpointKey: v.string(), url: v.string(), events: textList, signingSecretConfigured: v.boolean(), status: v.union(v.literal('draft'), v.literal('enabled'), v.literal('disabled')) },
  returns: v.id('scopeCWebhookEndpoints'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const endpointKey = safeKey(args.endpointKey, 'Endpoint key')
    const url = clean(args.url, 'Webhook URL', 2000)
    if (!/^https:\/\//i.test(url)) throw new ConvexError('Webhook endpoint must use HTTPS')
    const events = requireEvidence(args.events, 'Webhook events')
    const prior = await ctx.db.query('scopeCWebhookEndpoints').withIndex('by_owner_endpoint', q => q.eq('ownerKey', ownerKey).eq('endpointKey', endpointKey)).first()
    const values = { ownerKey, requestKey, endpointKey, url, events, signingSecretConfigured: args.signingSecretConfigured, status: args.status, updatedAt: Date.now() }
    if (prior) { await ctx.db.patch(prior._id, values); return prior._id }
    return await ctx.db.insert('scopeCWebhookEndpoints', { ...values, createdAt: Date.now() })
  },
})
export const validateIntegrationPayloadSchema = query({
  args: { payload: v.any(), fields: v.array(v.object({ key: v.string(), type: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('object'), v.literal('array')), required: v.boolean() })), rejectUnknown: v.optional(v.boolean()) },
  returns: v.object({ valid: v.boolean(), issues: v.array(v.string()), checkedFields: v.number() }),
  handler: async (ctx, args) => {
    await requireOperator(ctx)
    if (!args.payload || typeof args.payload !== 'object' || Array.isArray(args.payload)) throw new ConvexError('Payload must be a plain object')
    if (args.fields.length > 100) throw new ConvexError('Field schema exceeds maximum size')
    const payload = args.payload as Record<string, unknown>
    const known = new Set<string>()
    const issues: string[] = []
    for (const field of args.fields) {
      const key = safeKey(field.key, 'Field key')
      if (known.has(key)) throw new ConvexError('Duplicate payload schema field: ' + key)
      known.add(key)
      const value = payload[key]
      if (value === undefined || value === null) { if (field.required) issues.push(key + ' is required'); continue }
      const type = Array.isArray(value) ? 'array' : typeof value
      if (type !== field.type) issues.push(key + ' has incorrect type')
      if (type === 'number' && !Number.isFinite(value as number)) issues.push(key + ' must be finite')
    }
    if (args.rejectUnknown) for (const key of Object.keys(payload)) if (!known.has(key)) issues.push('Unknown field: ' + key)
    return { valid: issues.length === 0, issues, checkedFields: args.fields.length }
  },
})

/* C4 — Capability and reliability */
export const recordStressSimulationParameters = mutation({
  args: { requestKey: v.string(), scenarioKey: v.string(), concurrency: v.number(), durationMs: v.number(), errorInjectionRate: v.number(), targetLatencyMs: v.number(), notes: v.string() },
  returns: v.id('scopeCStressSimulations'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const scenarioKey = safeKey(args.scenarioKey, 'Scenario key')
    const concurrency = whole(args.concurrency, 'Concurrency', 1, 100_000)
    const durationMs = whole(args.durationMs, 'Duration', 100, 3_600_000)
    const errorInjectionRate = finite(args.errorInjectionRate, 'Error injection rate', 0, 1)
    const targetLatencyMs = finite(args.targetLatencyMs, 'Target latency', 1, 600_000)
    const notes = bounded(args.notes, 'Notes', 2000)
    return await ctx.db.insert('scopeCStressSimulations', { ownerKey, requestKey, scenarioKey, concurrency, durationMs, errorInjectionRate, targetLatencyMs, notes, status: 'parameters_recorded', createdAt: Date.now() })
  },
})
export const selectDegradedFallbackStrategy = query({
  args: { strategies: v.array(v.object({ key: v.string(), healthy: v.boolean(), latencyMs: v.number(), costScore: v.number(), reliabilityScore: v.number() })), latencyBudgetMs: v.number(), minimumReliability: v.number() },
  returns: v.object({ selected: v.union(v.string(), v.null()), reason: v.string(), eligibleCount: v.number() }),
  handler: async (ctx, args) => {
    await requireOperator(ctx)
    const latencyBudget = finite(args.latencyBudgetMs, 'Latency budget', 1, 600_000)
    const minReliability = finite(args.minimumReliability, 'Minimum reliability', 0, 100)
    if (!args.strategies.length || args.strategies.length > 100) throw new ConvexError('Provide 1–100 fallback strategies')
    const eligible = args.strategies.map(s => ({ key: safeKey(s.key, 'Strategy key'), healthy: s.healthy, latencyMs: finite(s.latencyMs, 'Strategy latency', 0, 600_000), costScore: clampScore(s.costScore, 'Cost score'), reliabilityScore: clampScore(s.reliabilityScore, 'Reliability score') })).filter(s => s.healthy && s.latencyMs <= latencyBudget && s.reliabilityScore >= minReliability)
    eligible.sort((a, b) => b.reliabilityScore - a.reliabilityScore || a.latencyMs - b.latencyMs || a.costScore - b.costScore)
    return { selected: eligible[0]?.key ?? null, reason: eligible.length ? 'Selected highest reliability within latency and health constraints' : 'No strategy meets all fallback constraints', eligibleCount: eligible.length }
  },
})
export const detectSlaBreaches = query({
  args: { windowStart: v.number(), windowEnd: v.number(), availabilityTarget: v.number(), latencyP95TargetMs: v.number(), errorRateLimit: v.number() },
  returns: v.object({ sampleCount: v.number(), availability: v.union(v.number(), v.null()), p95LatencyMs: v.union(v.number(), v.null()), errorRate: v.union(v.number(), v.null()), breached: v.boolean(), breaches: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const start = finite(args.windowStart, 'Window start', 0, Date.now())
    const end = finite(args.windowEnd, 'Window end', start, Date.now() + 60_000)
    const target = finite(args.availabilityTarget, 'Availability target', 0, 1)
    const latencyTarget = finite(args.latencyP95TargetMs, 'P95 target', 1, 600_000)
    const errorLimit = finite(args.errorRateLimit, 'Error rate limit', 0, 1)
    const rows = await ctx.db.query('scopeBProviderLatency').withIndex('by_owner_observedAt', q => q.eq('ownerKey', ownerKey).gte('observedAt', start).lte('observedAt', end)).take(500)
    const good = rows.filter(r => r.outcome === 'success').length
    const availability = rows.length ? good / rows.length : null
    const errorRate = rows.length ? (rows.length - good) / rows.length : null
    const latencies = rows.map(r => r.latencyMs).sort((a, b) => a - b)
    const p95 = latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * .95) - 1)] : null
    const breaches: string[] = []
    if (!rows.length) breaches.push('insufficient_samples')
    if (availability !== null && availability < target) breaches.push('availability')
    if (p95 !== null && p95 > latencyTarget) breaches.push('p95_latency')
    if (errorRate !== null && errorRate > errorLimit) breaches.push('error_rate')
    return { sampleCount: rows.length, availability, p95LatencyMs: p95, errorRate, breached: breaches.length > 0, breaches }
  },
})
export const logRecoveryEvent = mutation({
  args: { requestKey: v.string(), incidentKey: v.string(), recoveryAction: v.string(), outcome: v.union(v.literal('recovered'), v.literal('partial'), v.literal('failed')), evidence: textList, elapsedMs: v.number() },
  returns: v.id('scopeCRecoveryEvents'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const incidentKey = safeKey(args.incidentKey, 'Incident key')
    const recoveryAction = clean(args.recoveryAction, 'Recovery action', 1000)
    const evidence = requireEvidence(args.evidence)
    const elapsedMs = whole(args.elapsedMs, 'Elapsed milliseconds', 0, 86_400_000)
    return await ctx.db.insert('scopeCRecoveryEvents', { ownerKey, requestKey, incidentKey, recoveryAction, outcome: args.outcome, evidence, elapsedMs, recordedAt: Date.now() })
  },
})

/* C5 — Security and resilience */
export const recordCredentialRotationAudit = mutation({
  args: { requestKey: v.string(), credentialKey: v.string(), rotationKey: v.string(), outcome: v.union(v.literal('planned'), v.literal('rotated'), v.literal('failed')), actorKey: v.string(), evidence: textList, notes: v.string() },
  returns: v.id('scopeCCredentialRotationAudits'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const credentialKey = safeKey(args.credentialKey, 'Credential key')
    const rotationKey = safeKey(args.rotationKey, 'Rotation key')
    const actorKey = safeKey(args.actorKey, 'Actor key')
    const evidence = requireEvidence(args.evidence)
    const notes = clean(args.notes, 'Rotation notes', 2000)
    const existing = await ctx.db.query('scopeCCredentialRotationAudits').withIndex('by_owner_rotation', q => q.eq('ownerKey', ownerKey).eq('rotationKey', rotationKey)).first()
    if (existing) throw new ConvexError('Rotation audit key already exists')
    return await ctx.db.insert('scopeCCredentialRotationAudits', { ownerKey, requestKey, credentialKey, rotationKey, outcome: args.outcome, actorKey, evidence, notes, recordedAt: Date.now() })
  },
})
export const triggerEmergencyLockdown = mutation({
  args: { requestKey: v.string(), lockdownKey: v.string(), reason: v.string(), affectedZones: textList, severity: v.union(v.literal('high'), v.literal('critical')), expiresAt: v.optional(v.number()) },
  returns: v.id('scopeCEmergencyLockdowns'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const lockdownKey = safeKey(args.lockdownKey, 'Lockdown key')
    const reason = clean(args.reason, 'Lockdown reason', 2000)
    const affectedZones = requireEvidence(args.affectedZones, 'Affected zones')
    const expiresAt = args.expiresAt === undefined ? undefined : finite(args.expiresAt, 'Lockdown expiry', Date.now() + 60_000, Date.now() + 7 * 86_400_000)
    const existing = await ctx.db.query('scopeCEmergencyLockdowns').withIndex('by_owner_lockdown', q => q.eq('ownerKey', ownerKey).eq('lockdownKey', lockdownKey)).first()
    if (existing) { await ctx.db.patch(existing._id, { status: 'active', reason, affectedZones, severity: args.severity, expiresAt, updatedAt: Date.now() }); return existing._id }
    return await ctx.db.insert('scopeCEmergencyLockdowns', { ownerKey, requestKey, lockdownKey, reason, affectedZones, severity: args.severity, status: 'active', expiresAt, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const resolveIsolationZoneState = query({
  args: { zoneKey: v.string() },
  returns: v.object({ zoneKey: v.string(), isolated: v.boolean(), activeLockdowns: v.number(), reasons: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const zoneKey = safeKey(args.zoneKey, 'Zone key')
    const rows = await ctx.db.query('scopeCEmergencyLockdowns').withIndex('by_owner_status', q => q.eq('ownerKey', ownerKey).eq('status', 'active')).take(200)
    const now = Date.now()
    const active = rows.filter(r => (!r.expiresAt || r.expiresAt > now) && r.affectedZones.includes(zoneKey))
    return { zoneKey, isolated: active.length > 0, activeLockdowns: active.length, reasons: active.map(r => r.reason) }
  },
})
export const calculateSecurityPostureScore = query({
  args: { controls: v.array(v.object({ key: v.string(), weight: v.number(), satisfied: v.boolean(), critical: v.boolean() })) },
  returns: v.object({ score: v.number(), status: v.union(v.literal('strong'), v.literal('guarded'), v.literal('weak'), v.literal('critical')), failedControls: v.array(v.string()), criticalFailures: v.number(), totalWeight: v.number() }),
  handler: async (ctx, args) => {
    await requireOperator(ctx)
    if (!args.controls.length || args.controls.length > 100) throw new ConvexError('Provide 1–100 security controls')
    const seen = new Set<string>()
    let totalWeight = 0, earned = 0, criticalFailures = 0
    const failedControls: string[] = []
    for (const c of args.controls) {
      const key = safeKey(c.key, 'Control key')
      if (seen.has(key)) throw new ConvexError('Duplicate security control: ' + key)
      seen.add(key)
      const weight = finite(c.weight, 'Control weight', 0, 100)
      if (weight === 0) throw new ConvexError('Control weight must be positive')
      totalWeight += weight
      if (c.satisfied) earned += weight
      else { failedControls.push(key); if (c.critical) criticalFailures++ }
    }
    const score = totalWeight ? Math.round(100 * earned / totalWeight) : 0
    const status: 'critical' | 'strong' | 'guarded' | 'weak' = criticalFailures ? 'critical' : score >= 90 ? 'strong' : score >= 70 ? 'guarded' : 'weak'
    return { score, status, failedControls, criticalFailures, totalWeight }
  },
})

/* C6 — Generality research */
export const recordZeroShotTaskDistribution = mutation({
  args: { requestKey: v.string(), studyKey: v.string(), domain: v.string(), taskKey: v.string(), difficulty: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('frontier')), success: v.boolean(), score: v.number(), evidence: textList, sampleKey: v.string() },
  returns: v.id('scopeCZeroShotObservations'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const studyKey = safeKey(args.studyKey, 'Study key')
    const domain = safeKey(args.domain, 'Domain')
    const taskKey = safeKey(args.taskKey, 'Task key')
    const sampleKey = safeKey(args.sampleKey, 'Sample key')
    const score = clampScore(args.score, 'Zero-shot score')
    const evidence = requireEvidence(args.evidence)
    const prior = await ctx.db.query('scopeCZeroShotObservations').withIndex('by_owner_sample', q => q.eq('ownerKey', ownerKey).eq('sampleKey', sampleKey)).first()
    if (prior) throw new ConvexError('Sample key already recorded')
    return await ctx.db.insert('scopeCZeroShotObservations', { ownerKey, requestKey, studyKey, domain, taskKey, difficulty: args.difficulty, success: args.success, score, evidence, sampleKey, recordedAt: Date.now() })
  },
})
export const calculateCrossDomainAdaptationMetrics = query({
  args: { studyKey: v.string(), limit: v.optional(v.number()) },
  returns: v.object({ studyKey: v.string(), domains: v.array(v.object({ domain: v.string(), samples: v.number(), successes: v.number(), successRate: v.number(), meanScore: v.number() })), domainCount: v.number(), overallMeanScore: v.union(v.number(), v.null()), transferSpread: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const studyKey = safeKey(args.studyKey, 'Study key')
    const limit = whole(args.limit ?? 300, 'Observation limit', 1, 500)
    const rows = await ctx.db.query('scopeCZeroShotObservations').withIndex('by_owner_study', q => q.eq('ownerKey', ownerKey).eq('studyKey', studyKey)).take(limit)
    const groups = new Map<string, { n: number; success: number; sum: number }>()
    for (const row of rows) {
      const g = groups.get(row.domain) ?? { n: 0, success: 0, sum: 0 }
      g.n++; if (row.success) g.success++; g.sum += row.score
      groups.set(row.domain, g)
    }
    const domains = [...groups.entries()].map(([domain, g]) => ({ domain, samples: g.n, successes: g.success, successRate: g.n ? g.success / g.n : 0, meanScore: g.n ? g.sum / g.n : 0 }))
    const means = domains.map(d => d.meanScore)
    return { studyKey, domains, domainCount: domains.length, overallMeanScore: rows.length ? rows.reduce((s, r) => s + r.score, 0) / rows.length : null, transferSpread: means.length ? Math.max(...means) - Math.min(...means) : null }
  },
})
export const annotateReasoningTrace = mutation({
  args: { requestKey: v.string(), traceKey: v.string(), domain: v.string(), annotation: v.string(), quality: v.union(v.literal('sound'), v.literal('uncertain'), v.literal('invalid')), evidence: textList, reviewer: v.string() },
  returns: v.id('scopeCReasoningAnnotations'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const requestKey = safeKey(args.requestKey, 'Request key')
    const traceKey = safeKey(args.traceKey, 'Trace key')
    const domain = safeKey(args.domain, 'Domain')
    const annotation = clean(args.annotation, 'Annotation', 3000)
    const reviewer = safeKey(args.reviewer, 'Reviewer')
    const evidence = requireEvidence(args.evidence)
    return await ctx.db.insert('scopeCReasoningAnnotations', { ownerKey, requestKey, traceKey, domain, annotation, quality: args.quality, evidence, reviewer, createdAt: Date.now() })
  },
})
export const evaluateGeneralizationFailureBoundary = query({
  args: { studyKey: v.string(), minimumSamples: v.optional(v.number()), minimumSuccessRate: v.number(), minimumMeanScore: v.number() },
  returns: v.object({ studyKey: v.string(), boundaryDetected: v.boolean(), domainsEvaluated: v.number(), failingDomains: v.array(v.object({ domain: v.string(), samples: v.number(), successRate: v.number(), meanScore: v.number(), reasons: v.array(v.string()) })), insufficientEvidenceDomains: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const studyKey = safeKey(args.studyKey, 'Study key')
    const minimumSamples = whole(args.minimumSamples ?? 5, 'Minimum samples', 1, 1000)
    const minimumSuccessRate = finite(args.minimumSuccessRate, 'Minimum success rate', 0, 1)
    const minimumMeanScore = clampScore(args.minimumMeanScore, 'Minimum mean score')
    const rows = await ctx.db.query('scopeCZeroShotObservations').withIndex('by_owner_study', q => q.eq('ownerKey', ownerKey).eq('studyKey', studyKey)).take(500)
    const groups = new Map<string, { n: number; success: number; sum: number }>()
    for (const row of rows) {
      const g = groups.get(row.domain) ?? { n: 0, success: 0, sum: 0 }
      g.n++; if (row.success) g.success++; g.sum += row.score; groups.set(row.domain, g)
    }
    const failingDomains: Array<{ domain: string; samples: number; successRate: number; meanScore: number; reasons: string[] }> = []
    const insufficientEvidenceDomains: string[] = []
    for (const [domain, g] of groups) {
      if (g.n < minimumSamples) { insufficientEvidenceDomains.push(domain); continue }
      const successRate = g.success / g.n, meanScore = g.sum / g.n
      const reasons: string[] = []
      if (successRate < minimumSuccessRate) reasons.push('success_rate_below_threshold')
      if (meanScore < minimumMeanScore) reasons.push('mean_score_below_threshold')
      if (reasons.length) failingDomains.push({ domain, samples: g.n, successRate, meanScore, reasons })
    }
    return { studyKey, boundaryDetected: failingDomains.length > 0, domainsEvaluated: groups.size, failingDomains, insufficientEvidenceDomains }
  },
})
