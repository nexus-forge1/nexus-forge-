import { ConvexError, v } from 'convex/values'
import { action, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { requireOperator, requireOwnedMission } from './permissions'
import { bounded, digest, secrets } from './studioModel'
import type { Id } from './_generated/dataModel'
import { getProviderRoutingPlan } from './aiProvider'

type ReadCtx = QueryCtx
type WriteCtx = MutationCtx
const direction = v.union(v.literal('higher'), v.literal('lower'))
const outcome = v.union(v.literal('success'), v.literal('failure'), v.literal('inconclusive'))
const stage = v.union(v.literal('intent'), v.literal('draft'), v.literal('review'), v.literal('verification'), v.literal('ready'))
const status = v.union(v.literal('pending'), v.literal('running'), v.literal('held'), v.literal('complete'), v.literal('rejected'))
const checklistItem = v.object({ key: v.string(), required: v.boolean(), passed: v.boolean(), detail: v.string() })
const metricInput = v.object({ key: v.string(), label: v.string(), target: v.number(), actual: v.number(), unit: v.string(), direction, evidence: v.array(v.string()) })
const resultInput = v.object({ caseKey: v.string(), status: v.union(v.literal('pass'), v.literal('fail'), v.literal('not_run')), critical: v.boolean(), detail: v.string() })
const configInput = v.object({ key: v.string(), value: v.string() })

function textBound(value: string, label: string, max: number, min = 1): string {
  const clean = bounded(value, label, max).trim()
  if (clean.length < min) throw new ConvexError(label + ' must contain at least ' + min + ' characters')
  secrets(clean)
  return clean
}
function keyBound(value: string, label = 'Key', max = 100): string {
  const clean = textBound(value, label, max)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(clean)) throw new ConvexError(label + ' contains unsupported characters')
  return clean
}
function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ConvexError(label + ' must be finite')
  return value
}
function integer(value: number, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConvexError(label + ' is outside the allowed integer range')
  return value
}
function parseObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new ConvexError(label + ' must be valid JSON') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConvexError(label + ' root must be an object')
  return parsed as Record<string, unknown>
}
function normalizedTerms(value: string): string[] {
  return value.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}_-]{2,48}/gu)?.slice(0, 500) ?? []
}
function attainment(actual: number, target: number, dir: 'higher' | 'lower') {
  if (!Number.isFinite(actual) || !Number.isFinite(target)) throw new ConvexError('Metric values must be finite')
  const pass = dir === 'higher' ? actual >= target : actual <= target
  const ratio = target === 0 ? (actual === 0 ? 1 : pass ? 1 : 0) : dir === 'higher' ? actual / Math.abs(target) : Math.abs(target) / Math.max(Math.abs(actual), Number.EPSILON)
  return { pass, ratio: Math.max(0, Math.min(10, ratio)), delta: actual - target }
}
async function owned(ctx: ReadCtx | WriteCtx, missionId: Id<'missions'>) {
  return requireOwnedMission(ctx, missionId)
}
async function latestLatency(ctx: ReadCtx, ownerKey: string, provider: string) {
  return ctx.db.query('scopeBProviderLatency').withIndex('by_owner_provider_observedAt', q => q.eq('ownerKey', ownerKey).eq('provider', provider)).order('desc').take(20)
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') {
    const r = value as Record<string, unknown>
    return '{' + Object.keys(r).sort().map(k => JSON.stringify(k) + ':' + stable(r[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}

/** B1. Evaluate retained provider health evidence; this query does not probe providers. */
export const evaluateLivePlatformHealth = query({
  args: { maxAgeMs: v.optional(v.number()), degradedLatencyMs: v.optional(v.number()) },
  returns: v.object({ state: v.union(v.literal('healthy'), v.literal('degraded'), v.literal('critical'), v.literal('unknown')), sampledProviders: v.number(), healthyProviders: v.number(), degradedProviders: v.number(), offlineProviders: v.number(), reasons: v.array(v.string()), evaluatedAt: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const maxAge = integer(args.maxAgeMs ?? 15 * 60_000, 'Maximum health evidence age', 1000, 24 * 60 * 60_000)
    const threshold = integer(args.degradedLatencyMs ?? 2500, 'Latency degradation threshold', 1, 120_000)
    const rows = await ctx.db.query('providerHealthChecks').withIndex('by_operator_checkedAt', q => q.eq('operatorId', ownerKey)).order('desc').take(100)
    const now = Date.now()
    const newest = new Map<string, typeof rows[number]>()
    for (const row of rows) if (now - row.checkedAt <= maxAge && !newest.has(row.name)) newest.set(row.name, row)
    const sampled = [...newest.values()].filter(row => row.configured)
    const healthy = sampled.filter(row => row.status === 'healthy' && row.latencyMs <= threshold).length
    const degraded = sampled.filter(row => row.status === 'degraded' || (row.status === 'healthy' && row.latencyMs > threshold)).length
    const offline = sampled.filter(row => row.status === 'offline').length
    const reasons: string[] = []
    if (!sampled.length) reasons.push('No recent configured-provider health samples are retained')
    if (offline) reasons.push(offline + ' configured provider(s) are offline')
    if (degraded) reasons.push(degraded + ' configured provider(s) are degraded or above the latency threshold')
    const state = !sampled.length ? 'unknown' as const : offline > 0 && healthy === 0 ? 'critical' as const : offline + degraded > 0 ? 'degraded' as const : 'healthy' as const
    return { state, sampledProviders: sampled.length, healthyProviders: healthy, degradedProviders: degraded, offlineProviders: offline, reasons, evaluatedAt: now }
  },
})

/** B1. Record one bounded latency sample from a trusted caller; no provider request is issued. */
export const recordProviderLatencySample = mutation({
  args: { provider: v.string(), role: v.string(), latencyMs: v.number(), outcome: v.union(v.literal('success'), v.literal('timeout'), v.literal('error')), source: v.string(), requestKey: v.string() },
  returns: v.id('scopeBProviderLatency'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const provider = keyBound(args.provider, 'Provider', 60).toLowerCase()
    const role = keyBound(args.role, 'Provider role', 40).toLowerCase()
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const latencyMs = integer(args.latencyMs, 'Latency', 0, 120_000)
    const source = textBound(args.source, 'Sample source', 120)
    const existing = await ctx.db.query('scopeBProviderLatency').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.provider !== provider || existing.role !== role || existing.latencyMs !== latencyMs || existing.outcome !== args.outcome) throw new ConvexError('Request key already exists with conflicting latency evidence')
      return existing._id
    }
    return ctx.db.insert('scopeBProviderLatency', { ownerKey, provider, role, latencyMs, outcome: args.outcome, source, requestKey, observedAt: Date.now() })
  },
})

/** B1. Calculate degradation from the current operator's bounded recent latency history. */
export const calculateSystemDegradation = query({
  args: { windowSize: v.optional(v.number()), p95ThresholdMs: v.optional(v.number()) },
  returns: v.object({ degraded: v.boolean(), p95LatencyMs: v.union(v.number(), v.null()), failureRate: v.number(), samples: v.number(), reasons: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const size = integer(args.windowSize ?? 50, 'Window size', 1, 200)
    const threshold = integer(args.p95ThresholdMs ?? 3000, 'P95 threshold', 1, 120_000)
    const rows = await ctx.db.query('scopeBProviderLatency').withIndex('by_owner_observedAt', q => q.eq('ownerKey', ownerKey)).order('desc').take(size)
    const sorted = rows.map(row => row.latencyMs).sort((a, b) => a - b)
    const p95 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] : null
    const failureRate = rows.length ? rows.filter(row => row.outcome !== 'success').length / rows.length : 0
    const reasons: string[] = []
    if (!rows.length) reasons.push('No latency samples retained')
    if (p95 !== null && p95 > threshold) reasons.push('P95 latency exceeds configured threshold')
    if (failureRate >= .25) reasons.push('At least one quarter of recent samples failed or timed out')
    return { degraded: rows.length === 0 || (p95 !== null && p95 > threshold) || failureRate >= .25, p95LatencyMs: p95, failureRate, samples: rows.length, reasons }
  },
})

/** B2. Validate measurable target contracts before outcomes are recorded. */
export const validateMeasuredTargetContract = query({
  args: { metric: v.string(), actual: v.number(), target: v.number(), unit: v.string(), direction, evidence: v.array(v.string()) },
  returns: v.object({ valid: v.boolean(), attained: v.boolean(), attainmentRatio: v.number(), delta: v.number(), reasons: v.array(v.string()) }),
  handler: async (_ctx, args) => {
    const reasons: string[] = []
    if (!args.metric.trim() || args.metric.length > 120) reasons.push('Metric label must contain 1–120 characters')
    if (!args.unit.trim() || args.unit.length > 40) reasons.push('Unit must contain 1–40 characters')
    if (!Number.isFinite(args.actual) || !Number.isFinite(args.target)) reasons.push('Actual and target must be finite numbers')
    if (!args.evidence.length || args.evidence.length > 12 || args.evidence.some(item => !item.trim() || item.length > 1000)) reasons.push('Provide 1–12 bounded evidence references')
    if (reasons.length) return { valid: false, attained: false, attainmentRatio: 0, delta: 0, reasons }
    const result = attainment(args.actual, args.target, args.direction)
    return { valid: true, attained: result.pass, attainmentRatio: result.ratio, delta: result.delta, reasons }
  },
})

/** B2. Record idempotent, evidence-backed measurable strategy outcomes. */
export const recordStrategyOutcome = mutation({
  args: { strategyKey: v.string(), requestKey: v.string(), metric: v.string(), actual: v.number(), target: v.number(), unit: v.string(), direction, evidence: v.array(v.string()), note: v.string() },
  returns: v.id('scopeBManifestOutcomes'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const strategyKey = keyBound(args.strategyKey, 'Strategy key')
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const metric = textBound(args.metric, 'Metric', 120)
    const unit = textBound(args.unit, 'Unit', 40)
    const note = textBound(args.note, 'Outcome note', 1200, 8)
    finite(args.actual, 'Actual')
    finite(args.target, 'Target')
    if (args.evidence.length < 1 || args.evidence.length > 12) throw new ConvexError('Provide 1–12 evidence references')
    const evidence = args.evidence.map((item, i) => textBound(item, 'Evidence ' + (i + 1), 1000, 4))
    const score = attainment(args.actual, args.target, args.direction)
    const existing = await ctx.db.query('scopeBManifestOutcomes').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.strategyKey !== strategyKey || existing.actual !== args.actual || existing.target !== args.target || existing.metric !== metric) throw new ConvexError('Request key already records a different strategy outcome')
      return existing._id
    }
    return ctx.db.insert('scopeBManifestOutcomes', { ownerKey, strategyKey, requestKey, metric, actual: args.actual, target: args.target, unit, direction: args.direction, evidence, note, attained: score.pass, attainmentRatio: score.ratio, recordedAt: Date.now() })
  },
})

/** B2. Aggregate historical attainment without treating missing outcomes as successes. */
export const aggregateHistoricalAttainment = query({
  args: { strategyKey: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({ total: v.number(), attained: v.number(), missed: v.number(), inconclusive: v.number(), attainmentRate: v.union(v.number(), v.null()), strategies: v.array(v.object({ strategyKey: v.string(), total: v.number(), attained: v.number(), rate: v.number() })) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const limit = integer(args.limit ?? 100, 'History limit', 1, 250)
    const rows = await ctx.db.query('scopeBManifestOutcomes').withIndex('by_owner_recordedAt', q => q.eq('ownerKey', ownerKey)).order('desc').take(limit)
    const included = args.strategyKey ? rows.filter(row => row.strategyKey === args.strategyKey) : rows
    const byStrategy = new Map<string, { strategyKey: string; total: number; attained: number; rate: number }>()
    for (const row of included) {
      const item = byStrategy.get(row.strategyKey) ?? { strategyKey: row.strategyKey, total: 0, attained: 0, rate: 0 }
      item.total++; if (row.attained) item.attained++; item.rate = item.attained / item.total; byStrategy.set(row.strategyKey, item)
    }
    const attained = included.filter(row => row.attained).length
    return { total: included.length, attained, missed: included.length - attained, inconclusive: 0, attainmentRate: included.length ? attained / included.length : null, strategies: [...byStrategy.values()].sort((a, b) => b.rate - a.rate).slice(0, 50) }
  },
})

/** B3. Resolve an ordered fallback chain while excluding providers without recent successful samples. */
export const resolveProviderFallbackOrder = query({
  args: { role: v.string(), includeUnmeasured: v.optional(v.boolean()) },
  returns: v.object({ role: v.string(), fallbackOrder: v.array(v.string()), excluded: v.array(v.object({ provider: v.string(), reason: v.string() })) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const role = keyBound(args.role, 'Role', 40).toLowerCase()
    const plan = getProviderRoutingPlan()
    const candidates = plan.fallbackOrder
    const fallbackOrder: string[] = []
    const excluded: Array<{ provider: string; reason: string }> = []
    for (const provider of candidates) {
      const rows = await latestLatency(ctx, ownerKey, provider)
      const matching = rows.filter(row => row.role === role).slice(0, 5)
      if (!matching.length) {
        if (args.includeUnmeasured) fallbackOrder.push(provider)
        else excluded.push({ provider, reason: 'No recent role-specific latency evidence' })
      } else if (matching[0].outcome !== 'success') excluded.push({ provider, reason: 'Most recent role-specific sample was not successful' })
      else fallbackOrder.push(provider)
    }
    return { role, fallbackOrder, excluded }
  },
})

/** B3. Record provider routing latency. */
export const recordRoutingLatency = mutation({
  args: { provider: v.string(), role: v.string(), latencyMs: v.number(), succeeded: v.boolean(), requestKey: v.string(), evidenceRef: v.string() },
  returns: v.id('scopeBProviderLatency'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const provider = keyBound(args.provider, 'Provider', 60).toLowerCase()
    const role = keyBound(args.role, 'Role', 40).toLowerCase()
    const latencyMs = integer(args.latencyMs, 'Latency', 0, 120_000)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const evidenceRef = textBound(args.evidenceRef, 'Evidence reference', 1000, 4)
    const existing = await ctx.db.query('scopeBProviderLatency').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.provider !== provider || existing.latencyMs !== latencyMs || existing.outcome !== (args.succeeded ? 'success' : 'error')) throw new ConvexError('Conflicting latency sample for request key')
      return existing._id
    }
    return ctx.db.insert('scopeBProviderLatency', { ownerKey, provider, role, latencyMs, outcome: args.succeeded ? 'success' : 'error', source: evidenceRef, requestKey, observedAt: Date.now() })
  },
})

/** B3. Filter candidates to configured automatic routes and evidence-supported eligibility. */
export const filterDynamicRouteEligibility = query({
  args: { role: v.string(), providers: v.array(v.string()), maxLatencyMs: v.optional(v.number()), requireRecentSuccess: v.optional(v.boolean()) },
  returns: v.object({ eligible: v.array(v.object({ provider: v.string(), latestLatencyMs: v.union(v.number(), v.null()) })), excluded: v.array(v.object({ provider: v.string(), reason: v.string() })) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    if (args.providers.length > 12) throw new ConvexError('At most 12 provider candidates are allowed')
    const role = keyBound(args.role, 'Role', 40).toLowerCase()
    const maxLatency = integer(args.maxLatencyMs ?? 8000, 'Maximum latency', 1, 120_000)
    const allowed = new Set<string>(getProviderRoutingPlan().fallbackOrder)
    const eligible: Array<{ provider: string; latestLatencyMs: number | null }> = []
    const excluded: Array<{ provider: string; reason: string }> = []
    for (const raw of args.providers) {
      const provider = keyBound(raw, 'Provider', 60).toLowerCase()
      if (!allowed.has(provider)) { excluded.push({ provider, reason: 'Provider is not in the automatic routing allowlist' }); continue }
      const rows = await latestLatency(ctx, ownerKey, provider)
      const sample = rows.find(row => row.role === role)
      if (!sample) { excluded.push({ provider, reason: 'No role-specific sample' }); continue }
      if ((args.requireRecentSuccess ?? true) && sample.outcome !== 'success') { excluded.push({ provider, reason: 'Latest sample is not successful' }); continue }
      if (sample.latencyMs > maxLatency) { excluded.push({ provider, reason: 'Latency exceeds configured ceiling' }); continue }
      eligible.push({ provider, latestLatencyMs: sample.latencyMs })
    }
    return { eligible, excluded }
  },
})

/** B4. Persist guarded multi-stage pipeline transitions with revision and idempotency. */
export const transitionIntelligencePipeline = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), expectedRevision: v.number(), fromStage: stage, toStage: stage, intentDigest: v.string(), draftDigest: v.optional(v.string()), note: v.string() },
  returns: v.object({ stateId: v.id('scopeBPipelineStates'), revision: v.number(), stage, status }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const intentDigest = keyBound(args.intentDigest, 'Intent digest', 128)
    const note = textBound(args.note, 'Transition note', 800, 4)
    integer(args.expectedRevision, 'Expected revision', 0, 100000)
    const existingRequest = await ctx.db.query('scopeBPipelineStates').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existingRequest) {
      if (existingRequest.missionId !== args.missionId || existingRequest.toStage !== args.toStage || existingRequest.intentDigest !== intentDigest) throw new ConvexError('Request key conflicts with an earlier pipeline transition')
      return { stateId: existingRequest._id, revision: existingRequest.revision, stage: existingRequest.toStage, status: existingRequest.status }
    }
    const prior = await ctx.db.query('scopeBPipelineStates').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').first()
    const currentStage = prior?.toStage ?? 'intent'
    const revision = prior?.revision ?? 0
    if (revision !== args.expectedRevision || currentStage !== args.fromStage) throw new ConvexError('Pipeline revision or source stage changed; reload state before transition')
    if (prior?.status === 'held') throw new ConvexError('Pipeline is held; explicitly resume its stage lock before advancing')
    const allowed: Record<string, string[]> = { intent: ['draft'], draft: ['review', 'intent'], review: ['verification', 'draft'], verification: ['ready', 'review'], ready: [] }
    if (!allowed[currentStage]?.includes(args.toStage)) throw new ConvexError('Illegal pipeline stage transition')
    if (args.toStage === 'ready' && (!args.draftDigest || !/^[a-f0-9]{32,128}$/i.test(args.draftDigest))) throw new ConvexError('Ready stage requires a verified draft digest')
    const nextStatus = args.toStage === 'ready' ? 'complete' as const : 'running' as const
    const stateId = await ctx.db.insert('scopeBPipelineStates', { ownerKey, missionId: args.missionId, requestKey, fromStage: args.fromStage, toStage: args.toStage, status: nextStatus, revision: revision + 1, intentDigest, draftDigest: args.draftDigest, note, lockKey: null, updatedAt: Date.now() })
    return { stateId, revision: revision + 1, stage: args.toStage, status: nextStatus }
  },
})

/** B4. Validate intent-to-draft transition from persisted pipeline state. */
export const validateIntentDraftStateMachine = query({
  args: { missionId: v.id('missions'), intentDigest: v.string(), draftDigest: v.optional(v.string()) },
  returns: v.object({ valid: v.boolean(), currentStage: stage, reasons: v.array(v.string()), revision: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const rows = await ctx.db.query('scopeBPipelineStates').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').take(1)
    const latest = rows[0]
    const reasons: string[] = []
    if (!latest) reasons.push('No pipeline transition has been persisted')
    if (latest && latest.intentDigest !== args.intentDigest) reasons.push('Intent digest differs from the active pipeline')
    if (latest && latest.toStage === 'ready' && latest.draftDigest !== args.draftDigest) reasons.push('Draft digest differs from the accepted draft')
    if (latest && latest.status === 'held') reasons.push('Pipeline is held')
    return { valid: reasons.length === 0 && Boolean(latest), currentStage: latest?.toStage ?? 'intent', reasons, revision: latest?.revision ?? 0 }
  },
})

/** B4. Persist an explicit stage hold/resume transition with optimistic concurrency. */
export const setPipelineStageLock = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), expectedRevision: v.number(), operation: v.union(v.literal('hold'), v.literal('resume')), reason: v.string() },
  returns: v.object({ stateId: v.id('scopeBPipelineStates'), locked: v.boolean(), revision: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const reason = textBound(args.reason, 'Lock transition reason', 1000, 8)
    integer(args.expectedRevision, 'Expected pipeline revision', 0, 100000)
    const existingRequest = await ctx.db.query('scopeBPipelineStates').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existingRequest) {
      const expectedStatus = args.operation === 'hold' ? 'held' : 'running'
      if (existingRequest.missionId !== args.missionId || existingRequest.status !== expectedStatus || existingRequest.note !== reason) throw new ConvexError('Request key conflicts with a different pipeline lock transition')
      return { stateId: existingRequest._id, locked: existingRequest.status === 'held', revision: existingRequest.revision }
    }
    const prior = await ctx.db.query('scopeBPipelineStates').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').first()
    if (!prior || prior.revision !== args.expectedRevision) throw new ConvexError('Pipeline revision changed or no stage exists')
    if (args.operation === 'hold' && prior.status === 'held') throw new ConvexError('Pipeline is already held')
    if (args.operation === 'resume' && prior.status !== 'held') throw new ConvexError('Only a held pipeline can be resumed')
    const locked = args.operation === 'hold'
    const stateId = await ctx.db.insert('scopeBPipelineStates', { ownerKey, missionId: args.missionId, requestKey, fromStage: prior.toStage, toStage: prior.toStage, status: locked ? 'held' : 'running', revision: prior.revision + 1, intentDigest: prior.intentDigest, draftDigest: prior.draftDigest, note: reason, lockKey: locked ? requestKey : null, updatedAt: Date.now() })
    return { stateId, locked, revision: prior.revision + 1 }
  },
})

/** B4. Resolve stage locks; lock is advisory and never grants execution authority. */
export const resolvePipelineStageLock = query({
  args: { missionId: v.id('missions') },
  returns: v.object({ locked: v.boolean(), reason: v.string(), stage: v.union(stage, v.null()), revision: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const latest = await ctx.db.query('scopeBPipelineStates').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').first()
    const locked = !latest || latest.status === 'held' || latest.status === 'rejected'
    return { locked, reason: !latest ? 'No persisted pipeline state' : latest.status === 'held' ? 'Pipeline is held' : latest.status === 'rejected' ? 'Pipeline was rejected' : 'No stage lock is active', stage: latest?.toStage ?? null, revision: latest?.revision ?? 0 }
  },
})

/** B5. Validate bounded AST JSON and an allowlisted node grammar; never evaluate source code. */
export const validateStructuredAst = query({
  args: { astJson: v.string() },
  returns: v.object({ valid: v.boolean(), nodeCount: v.number(), maxDepth: v.number(), errors: v.array(v.string()) }),
  handler: async (_ctx, args) => {
    const errors: string[] = []
    if (new TextEncoder().encode(args.astJson).length > 64 * 1024) return { valid: false, nodeCount: 0, maxDepth: 0, errors: ['AST exceeds 64 KiB'] }
    let root: unknown
    try { root = JSON.parse(args.astJson) } catch { return { valid: false, nodeCount: 0, maxDepth: 0, errors: ['AST is not valid JSON'] } }
    const allowed = new Set(['spec', 'goal', 'constraint', 'requirement', 'dependency', 'acceptance', 'risk', 'sequence'])
    let nodeCount = 0, maxDepth = 0
    const walk = (node: unknown, depth: number) => {
      if (depth > 16) { errors.push('AST depth exceeds 16'); return }
      if (!node || typeof node !== 'object' || Array.isArray(node)) { errors.push('Every AST node must be an object'); return }
      nodeCount++; maxDepth = Math.max(maxDepth, depth)
      if (nodeCount > 500) { errors.push('AST node count exceeds 500'); return }
      const n = node as Record<string, unknown>
      if (typeof n.type !== 'string' || !allowed.has(n.type)) errors.push('Unknown or missing AST node type')
      if (n.label !== undefined && (typeof n.label !== 'string' || n.label.length > 500)) errors.push('Node label must be a string up to 500 characters')
      if (n.children !== undefined) {
        if (!Array.isArray(n.children) || n.children.length > 100) { errors.push('children must be an array of at most 100 nodes'); return }
        for (const child of n.children) walk(child, depth + 1)
      }
    }
    walk(root, 1)
    return { valid: errors.length === 0, nodeCount, maxDepth, errors: [...new Set(errors)].slice(0, 40) }
  },
})

/** B5. Parse constraints into a durable, revisioned contract. */
export const parseAndStoreConstraints = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), constraints: v.array(v.string()), expectedRevision: v.number() },
  returns: v.object({ constraintId: v.id('scopeBIntentConstraints'), revision: v.number(), digest: v.string(), count: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    integer(args.expectedRevision, 'Expected revision', 0, 100000)
    if (args.constraints.length < 1 || args.constraints.length > 40) throw new ConvexError('Provide 1–40 constraints')
    const constraints = args.constraints.map((item, i) => textBound(item, 'Constraint ' + (i + 1), 1000, 4))
    if (new Set(constraints.map(item => item.toLocaleLowerCase())).size !== constraints.length) throw new ConvexError('Duplicate constraints are not allowed')
    const old = await ctx.db.query('scopeBIntentConstraints').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    const serialized = stable(constraints)
    const digestValue = await digest(serialized)
    if (old) {
      if (old.digest !== digestValue || old.missionId !== args.missionId) throw new ConvexError('Request key conflicts with saved constraint contract')
      return { constraintId: old._id, revision: old.revision, digest: old.digest, count: old.constraints.length }
    }
    const latest = await ctx.db.query('scopeBIntentConstraints').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').first()
    const revision = latest?.revision ?? 0
    if (revision !== args.expectedRevision) throw new ConvexError('Constraint contract revision changed')
    const constraintId = await ctx.db.insert('scopeBIntentConstraints', { ownerKey, missionId: args.missionId, requestKey, constraints, revision: revision + 1, digest: digestValue, createdAt: Date.now() })
    return { constraintId, revision: revision + 1, digest: digestValue, count: constraints.length }
  },
})

/** B5. Deterministically compile a supplied structured spec; no external model call is made. */
export const compileStructuredSpecification = action({
  args: { objective: v.string(), constraints: v.array(v.string()), dependencies: v.array(v.string()), acceptanceCriteria: v.array(v.string()), risks: v.array(v.string()), deadline: v.string() },
  returns: v.object({ specification: v.string(), digest: v.string(), approvalRequired: v.literal(true), executable: v.literal(false) }),
  handler: async (ctx, args) => {
    await requireOperator(ctx)
    const objective = textBound(args.objective, 'Objective', 2000, 8)
    const deadline = textBound(args.deadline, 'Deadline or horizon', 120, 2)
    const normalizeList = (items: string[], label: string, min: number, max: number) => {
      if (items.length < min || items.length > max) throw new ConvexError(label + ' count must be ' + min + '–' + max)
      return items.map((item, i) => textBound(item, label + ' ' + (i + 1), 1000, 3))
    }
    const specification = { version: 'nexus-spec-v1', objective, constraints: normalizeList(args.constraints, 'Constraint', 0, 40), dependencies: normalizeList(args.dependencies, 'Dependency', 0, 40), acceptanceCriteria: normalizeList(args.acceptanceCriteria, 'Acceptance criterion', 1, 40), risks: normalizeList(args.risks, 'Risk', 0, 40), deadline, approvalRequired: true, executionAuthorized: false }
    const serialized = stable(specification)
    return { specification: serialized, digest: await digest(serialized), approvalRequired: true as const, executable: false as const }
  },
})

/** B6. Compute weighted strategy trade-offs from operator-supplied normalized metrics. */
export const calculateStrategyTradeoffScore = query({
  args: { metrics: v.array(v.object({ key: v.string(), score: v.number(), weight: v.number(), direction: v.union(v.literal('benefit'), v.literal('cost')) })) },
  returns: v.object({ score: v.number(), normalizedScore: v.number(), metricCount: v.number(), explanation: v.array(v.string()) }),
  handler: async (_ctx, args) => {
    if (args.metrics.length < 1 || args.metrics.length > 20) throw new ConvexError('Provide 1–20 strategy metrics')
    let weighted = 0, totalWeight = 0
    const explanation: string[] = []
    const seen = new Set<string>()
    for (const metric of args.metrics) {
      const key = keyBound(metric.key, 'Metric key', 80)
      if (seen.has(key)) throw new ConvexError('Metric keys must be unique')
      seen.add(key)
      finite(metric.score, 'Metric score'); finite(metric.weight, 'Metric weight')
      if (metric.score < 0 || metric.score > 100 || metric.weight <= 0 || metric.weight > 100) throw new ConvexError('Scores must be 0–100 and weights must be greater than 0 up to 100')
      const score = metric.direction === 'benefit' ? metric.score : 100 - metric.score
      weighted += score * metric.weight; totalWeight += metric.weight
      explanation.push(key + ': ' + score.toFixed(2) + ' weighted at ' + metric.weight)
    }
    const normalizedScore = weighted / totalWeight
    return { score: Math.round(weighted * 100) / 100, normalizedScore: Math.round(normalizedScore * 100) / 100, metricCount: args.metrics.length, explanation }
  },
})

/** B6. Persist proposed model assignment; recording does not imply provider execution. */
export const recordModelAssignment = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), strategyKey: v.string(), modelKey: v.string(), tradeoffScore: v.number(), evidence: v.array(v.string()) },
  returns: v.id('scopeBModelAssignments'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const strategyKey = keyBound(args.strategyKey, 'Strategy key')
    const modelKey = keyBound(args.modelKey, 'Model key', 120)
    finite(args.tradeoffScore, 'Trade-off score')
    if (args.tradeoffScore < 0 || args.tradeoffScore > 100) throw new ConvexError('Trade-off score must be 0–100')
    if (args.evidence.length < 1 || args.evidence.length > 12) throw new ConvexError('Provide 1–12 evidence references')
    const evidence = args.evidence.map((item, i) => textBound(item, 'Evidence ' + (i + 1), 1000, 4))
    const old = await ctx.db.query('scopeBModelAssignments').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) {
      if (old.missionId !== args.missionId || old.modelKey !== modelKey || old.strategyKey !== strategyKey) throw new ConvexError('Request key conflicts with an earlier model assignment')
      return old._id
    }
    return ctx.db.insert('scopeBModelAssignments', { ownerKey, missionId: args.missionId, requestKey, strategyKey, modelKey, tradeoffScore: args.tradeoffScore, evidence, approvalStatus: 'pending', createdAt: Date.now() })
  },
})

/** B6. Explicitly approve or reject a proposed assignment with an auditable reason. */
export const decideModelAssignment = mutation({
  args: { assignmentId: v.id('scopeBModelAssignments'), expectedStatus: v.literal('pending'), decision: v.union(v.literal('approve'), v.literal('reject')), reason: v.string() },
  returns: v.object({ assignmentId: v.id('scopeBModelAssignments'), approvalStatus: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.assignmentId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Model assignment unavailable')
    if (row.approvalStatus !== 'pending' || row.approvalStatus !== args.expectedStatus) throw new ConvexError('Only a pending model assignment can receive a decision')
    const reason = textBound(args.reason, 'Assignment decision reason', 1000, 8)
    const approvalStatus = args.decision === 'approve' ? 'approved' as const : 'rejected' as const
    await ctx.db.patch(row._id, { approvalStatus, decisionReason: reason })
    return { assignmentId: row._id, approvalStatus }
  },
})

/** B6. Resolve whether a proposed model assignment has explicit approval evidence. */
export const resolveStrategySelectionApprovalGate = query({
  args: { assignmentId: v.id('scopeBModelAssignments') },
  returns: v.object({ assignmentId: v.id('scopeBModelAssignments'), allowed: v.boolean(), status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')), reason: v.string() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.assignmentId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Model assignment unavailable')
    const allowed = row.approvalStatus === 'approved'
    return { assignmentId: row._id, allowed, status: row.approvalStatus, reason: allowed ? 'Explicit approval was retained; provider execution remains a separate gate' : row.approvalStatus === 'rejected' ? 'Assignment was rejected' : 'Explicit operator approval is missing' }
  },
})

/** B7. Persist a pre-execution safety checklist; any required failure holds the gate. */
export const evaluatePreExecutionSafetyChecklist = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), policyVersion: v.string(), checklist: v.array(checklistItem), evidence: v.array(v.string()) },
  returns: v.object({ reviewId: v.id('scopeBSafetyReviews'), gate: v.union(v.literal('held'), v.literal('eligible')), failedRequired: v.number(), revision: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const policyVersion = keyBound(args.policyVersion, 'Policy version', 60)
    if (args.checklist.length < 1 || args.checklist.length > 40) throw new ConvexError('Provide 1–40 safety checklist items')
    const keys = new Set<string>()
    const checklist = args.checklist.map((item, i) => {
      const key = keyBound(item.key, 'Checklist key ' + (i + 1), 80)
      if (keys.has(key)) throw new ConvexError('Safety checklist keys must be unique')
      keys.add(key)
      return { key, required: item.required, passed: item.passed, detail: textBound(item.detail, 'Checklist detail', 500, 3) }
    })
    if (args.evidence.length > 20) throw new ConvexError('At most 20 evidence references')
    const evidence = args.evidence.map((item, i) => textBound(item, 'Safety evidence ' + (i + 1), 1000, 4))
    const existing = await ctx.db.query('scopeBSafetyReviews').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.missionId !== args.missionId || existing.policyVersion !== policyVersion || stable(existing.checklist) !== stable(checklist)) throw new ConvexError('Request key conflicts with an earlier safety evaluation')
      return { reviewId: existing._id, gate: existing.gate, failedRequired: existing.failedRequired, revision: existing.revision }
    }
    const latest = await ctx.db.query('scopeBSafetyReviews').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').first()
    const revision = (latest?.revision ?? 0) + 1
    const failedRequired = checklist.filter(item => item.required && !item.passed).length
    const gate = failedRequired || evidence.length === 0 ? 'held' as const : 'eligible' as const
    const reviewId = await ctx.db.insert('scopeBSafetyReviews', { ownerKey, missionId: args.missionId, requestKey, policyVersion, checklist, evidence, gate, failedRequired, revision, createdAt: Date.now() })
    return { reviewId, gate, failedRequired, revision }
  },
})

/** B7. Apply the deterministic safety policy rule engine to supplied facts. */
export const evaluateSafetyPolicyRules = query({
  args: { facts: v.array(v.object({ key: v.string(), value: v.union(v.literal('pass'), v.literal('fail'), v.literal('unknown')) })) },
  returns: v.object({ decision: v.union(v.literal('allow_review'), v.literal('hold')), reasons: v.array(v.string()), ruleCount: v.number() }),
  handler: async (_ctx, args) => {
    if (args.facts.length > 60) throw new ConvexError('At most 60 policy facts')
    const seen = new Set<string>(), reasons: string[] = []
    for (const fact of args.facts) {
      const key = keyBound(fact.key, 'Policy fact key', 100)
      if (seen.has(key)) throw new ConvexError('Policy fact keys must be unique')
      seen.add(key)
      if (fact.value !== 'pass') reasons.push(key + ' is ' + fact.value + '; fail-closed policy holds the gate')
    }
    return { decision: reasons.length ? 'hold' as const : 'allow_review' as const, reasons, ruleCount: args.facts.length }
  },
})

/** B7. Hold/release a gate with optimistic revision; release needs the latest clean review. */
export const validateSafetyGateTransition = mutation({
  args: { reviewId: v.id('scopeBSafetyReviews'), expectedRevision: v.number(), operation: v.union(v.literal('hold'), v.literal('release')), reason: v.string() },
  returns: v.object({ gate: v.union(v.literal('held'), v.literal('eligible')), revision: v.number(), released: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.reviewId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Safety review unavailable')
    integer(args.expectedRevision, 'Expected safety revision', 1, 100000)
    const reason = textBound(args.reason, 'Gate transition reason', 1000, 8)
    if (row.revision !== args.expectedRevision) throw new ConvexError('Safety review revision changed')
    if (args.operation === 'release' && row.failedRequired > 0) throw new ConvexError('Required safety checks are failing; gate cannot be released')
    if (args.operation === 'release' && !row.evidence.length) throw new ConvexError('Release requires retained safety evidence')
    const gate = args.operation === 'hold' ? 'held' as const : 'eligible' as const
    const revision = row.revision + 1
    await ctx.db.patch(row._id, { gate, revision, decisionReason: reason, updatedAt: Date.now() })
    return { gate, revision, released: gate === 'eligible' }
  },
})

/** B8. Extract and persist a heuristic candidate from measured outcome data; never auto-promote. */
export const extractHeuristicFromOutcome = mutation({
  args: { outcomeId: v.id('scopeBOutcomeObservations'), requestKey: v.string() },
  returns: v.object({ candidateId: v.id('scopeBKnowledgeCandidates'), title: v.string(), heuristic: v.string(), confidence: v.number(), evidence: v.array(v.string()), limitations: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.outcomeId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Outcome observation unavailable')
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const old = await ctx.db.query('scopeBKnowledgeCandidates').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) {
      if (old.sourceMissionId !== row.missionId || old.sourceOutcomeId !== row._id) throw new ConvexError('Request key already identifies another knowledge candidate')
      return { candidateId: old._id, title: old.title, heuristic: old.heuristic, confidence: old.confidence, evidence: old.evidence, limitations: ['Generated from one retained observation; candidate is not verified general knowledge', 'No model inference or automatic promotion was performed'] }
    }
    const result = attainment(row.actual, row.target, row.direction)
    const title = 'Outcome heuristic: ' + row.metric.slice(0, 100)
    const heuristic = result.pass ? 'When optimizing ' + row.metric + ', retain the measured approach only when comparable evidence confirms the target remains attained.' : 'For ' + row.metric + ', do not repeat the recorded approach without investigating the target miss and collecting a comparable follow-up measurement.'
    const confidence = row.evidence.length >= 2 ? 0.72 : 0.55
    const candidateId = await ctx.db.insert('scopeBKnowledgeCandidates', { ownerKey, sourceMissionId: row.missionId, sourceOutcomeId: row._id, requestKey, title, heuristic, confidence, evidence: row.evidence.slice(0, 8), status: 'candidate', createdAt: Date.now() })
    return { candidateId, title, heuristic, confidence, evidence: row.evidence.slice(0, 8), limitations: ['Generated from one retained observation; candidate is not verified general knowledge', 'No model inference or automatic promotion was performed'] }
  },
})

/** B8. Validate candidate knowledge against bounded evidence and provenance. */
export const validateKnowledgeCandidate = query({
  args: { candidateId: v.id('scopeBKnowledgeCandidates') },
  returns: v.object({ valid: v.boolean(), promotable: v.boolean(), reasons: v.array(v.string()), confidence: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.candidateId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Knowledge candidate unavailable')
    const reasons: string[] = []
    if (row.title.trim().length < 4 || row.heuristic.trim().length < 20) reasons.push('Candidate title or heuristic is too short')
    if (row.evidence.length < 1) reasons.push('At least one evidence reference is required')
    if (row.confidence < 0 || row.confidence > 1) reasons.push('Confidence must be between 0 and 1')
    if (row.status === 'rejected') reasons.push('Candidate has been rejected')
    return { valid: reasons.length === 0, promotable: reasons.length === 0 && row.confidence >= 0.7 && row.evidence.length >= 2, reasons, confidence: row.confidence }
  },
})

/** B8. Record an explicit promotion decision; promotion never runs code or changes provider policy. */
export const approveKnowledgePromotion = mutation({
  args: { candidateId: v.id('scopeBKnowledgeCandidates'), decision: v.union(v.literal('approve'), v.literal('reject')), reason: v.string(), expectedStatus: v.literal('candidate') },
  returns: v.object({ candidateId: v.id('scopeBKnowledgeCandidates'), status: v.union(v.literal('candidate'), v.literal('approved'), v.literal('rejected')), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.candidateId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Knowledge candidate unavailable')
    const reason = textBound(args.reason, 'Promotion decision reason', 1000, 8)
    if (row.status !== args.expectedStatus || row.status !== 'candidate') throw new ConvexError('Only a candidate in the expected state can receive a promotion decision')
    if (args.decision === 'approve') {
      if (row.confidence < 0.7 || row.evidence.length < 2) throw new ConvexError('Promotion requires confidence ≥0.7 and at least two evidence references')
      await ctx.db.patch(row._id, { status: 'approved', decisionReason: reason, approvedAt: Date.now() })
      return { candidateId: row._id, status: 'approved' as const, changed: true }
    }
    await ctx.db.patch(row._id, { status: 'rejected', decisionReason: reason, approvedAt: undefined })
    return { candidateId: row._id, status: 'rejected' as const, changed: true }
  },
})

/** B9. Score lexical term vectors (TF-IDF-style overlap); no embedding claim is made. */
export const scoreDocumentVectorSpace = query({
  args: { documentId: v.id('scopeBKnowledgeDocuments'), queryText: v.string() },
  returns: v.object({ documentId: v.id('scopeBKnowledgeDocuments'), score: v.number(), matchedTerms: v.array(v.string()), method: v.literal('lexical-tf-overlap') }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const row = await ctx.db.get(args.documentId)
    if (!row || row.ownerKey !== ownerKey) throw new ConvexError('Knowledge document unavailable')
    const queryTerms = [...new Set(normalizedTerms(textBound(args.queryText, 'Search query', 1000, 2)))]
    const docTerms = normalizedTerms(row.title + ' ' + row.keywords.join(' ') + ' ' + row.content)
    const counts = new Map<string, number>()
    for (const term of docTerms) counts.set(term, (counts.get(term) ?? 0) + 1)
    const matchedTerms = queryTerms.filter(term => counts.has(term))
    const score = matchedTerms.reduce((sum, term) => sum + (1 + Math.log(counts.get(term) ?? 1)), 0) / Math.max(1, Math.sqrt(queryTerms.length))
    return { documentId: row._id, score: Math.round(score * 1000) / 1000, matchedTerms, method: 'lexical-tf-overlap' as const }
  },
})

/** B9. Index bounded searchable document text and facets. */
export const indexKnowledgeDocument = mutation({
  args: { docKey: v.string(), title: v.string(), content: v.string(), keywords: v.array(v.string()), facets: v.array(v.object({ key: v.string(), value: v.string() })), requestKey: v.string() },
  returns: v.id('scopeBKnowledgeDocuments'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const docKey = keyBound(args.docKey, 'Document key', 120)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const title = textBound(args.title, 'Document title', 200, 3)
    const content = textBound(args.content, 'Document content', 24000, 8)
    if (args.keywords.length > 60 || args.facets.length > 20) throw new ConvexError('Document allows up to 60 keywords and 20 facets')
    const keywords = [...new Set(args.keywords.map((item, i) => textBound(item, 'Keyword ' + (i + 1), 80, 2).toLowerCase()))]
    const facets = args.facets.map((item, i) => ({ key: keyBound(item.key, 'Facet key ' + (i + 1), 60), value: textBound(item.value, 'Facet value', 100) }))
    const existing = await ctx.db.query('scopeBKnowledgeDocuments').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.docKey !== docKey || existing.content !== content) throw new ConvexError('Request key conflicts with existing knowledge document')
      return existing._id
    }
    const prior = await ctx.db.query('scopeBKnowledgeDocuments').withIndex('by_owner_docKey', q => q.eq('ownerKey', ownerKey).eq('docKey', docKey)).first()
    if (prior) throw new ConvexError('Document key already exists; use a new key to preserve the immutable index snapshot')
    const contentDigest = await digest(stable({ title, content, keywords, facets }))
    return ctx.db.insert('scopeBKnowledgeDocuments', { ownerKey, docKey, requestKey, title, content, keywords, facets, contentDigest, indexedAt: Date.now() })
  },
})

/** B9. Bounded faceted lexical search over the current operator's documents. */
export const searchKnowledgeFacets = query({
  args: { queryText: v.string(), facets: v.array(v.object({ key: v.string(), value: v.string() })), limit: v.optional(v.number()) },
  returns: v.array(v.object({ documentId: v.id('scopeBKnowledgeDocuments'), docKey: v.string(), title: v.string(), score: v.number(), matchedTerms: v.array(v.string()), facets: v.array(v.object({ key: v.string(), value: v.string() })) })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const queryTerms = [...new Set(normalizedTerms(textBound(args.queryText, 'Search query', 1000, 2)))]
    const limit = integer(args.limit ?? 20, 'Search limit', 1, 50)
    if (args.facets.length > 20) throw new ConvexError('At most 20 search facets')
    const requestedFacets = args.facets.map(item => ({ key: keyBound(item.key, 'Facet key', 60), value: textBound(item.value, 'Facet value', 100) }))
    const rows = await ctx.db.query('scopeBKnowledgeDocuments').withIndex('by_owner_indexedAt', q => q.eq('ownerKey', ownerKey)).order('desc').take(250)
    const scored = rows.filter(row => requestedFacets.every(f => row.facets.some(x => x.key === f.key && x.value === f.value))).map(row => {
      const terms = normalizedTerms(row.title + ' ' + row.keywords.join(' ') + ' ' + row.content)
      const counts = new Map<string, number>()
      for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1)
      const matchedTerms = queryTerms.filter(term => counts.has(term))
      const score = matchedTerms.reduce((sum, term) => sum + 1 + Math.log(counts.get(term) ?? 1), 0) / Math.max(1, Math.sqrt(queryTerms.length))
      return { documentId: row._id, docKey: row.docKey, title: row.title, score: Math.round(score * 1000) / 1000, matchedTerms, facets: row.facets }
    }).filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
    return scored
  },
})

/** B10. Persist an outcome observation tied to an owned mission. */
export const persistOutcomeObservation = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), metric: v.string(), actual: v.number(), target: v.number(), unit: v.string(), direction, evidence: v.array(v.string()), observedAt: v.optional(v.number()) },
  returns: v.id('scopeBOutcomeObservations'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const metric = textBound(args.metric, 'Metric', 120)
    const unit = textBound(args.unit, 'Unit', 40)
    finite(args.actual, 'Actual'); finite(args.target, 'Target')
    if (args.evidence.length < 1 || args.evidence.length > 12) throw new ConvexError('Provide 1–12 evidence references')
    const evidence = args.evidence.map((item, i) => textBound(item, 'Evidence ' + (i + 1), 1000, 4))
    const observedAt = integer(args.observedAt ?? Date.now(), 'Observation time', 0, Date.now() + 60_000)
    const old = await ctx.db.query('scopeBOutcomeObservations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) {
      if (old.missionId !== args.missionId || old.metric !== metric || old.actual !== args.actual || old.target !== args.target) throw new ConvexError('Request key conflicts with existing outcome observation')
      return old._id
    }
    const score = attainment(args.actual, args.target, args.direction)
    return ctx.db.insert('scopeBOutcomeObservations', { ownerKey, missionId: args.missionId, requestKey, metric, actual: args.actual, target: args.target, unit, direction: args.direction, evidence, attained: score.pass, attainmentRatio: score.ratio, observedAt })
  },
})

/** B10. Calculate attainment across retained outcomes for one owned mission. */
export const calculateMetricAttainment = query({
  args: { missionId: v.id('missions'), metric: v.optional(v.string()) },
  returns: v.object({ missionId: v.id('missions'), observations: v.number(), attained: v.number(), missed: v.number(), rate: v.union(v.number(), v.null()), latest: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const rows = await ctx.db.query('scopeBOutcomeObservations').withIndex('by_owner_mission_observedAt', q => q.eq('ownerKey', ownerKey).eq('missionId', args.missionId)).order('desc').take(250)
    const included = args.metric ? rows.filter(row => row.metric === args.metric) : rows
    const attained = included.filter(row => row.attained).length
    return { missionId: args.missionId, observations: included.length, attained, missed: included.length - attained, rate: included.length ? attained / included.length : null, latest: included[0]?.observedAt ?? null }
  },
})

/** B10. Link a mission to a retained outcome with immutable provenance. */
export const linkMissionToOutcome = mutation({
  args: { missionId: v.id('missions'), outcomeId: v.id('scopeBOutcomeObservations'), requestKey: v.string(), relation: v.string(), note: v.string() },
  returns: v.id('scopeBMissionOutcomeLinks'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const outcomeRow = await ctx.db.get(args.outcomeId)
    if (!outcomeRow || outcomeRow.ownerKey !== ownerKey || outcomeRow.missionId !== args.missionId) throw new ConvexError('Outcome must belong to the same owned mission')
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const relation = keyBound(args.relation, 'Relation', 80)
    const note = textBound(args.note, 'Link note', 1000, 4)
    const existing = await ctx.db.query('scopeBMissionOutcomeLinks').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.missionId !== args.missionId || existing.outcomeId !== args.outcomeId) throw new ConvexError('Request key conflicts with an existing mission-outcome link')
      return existing._id
    }
    return ctx.db.insert('scopeBMissionOutcomeLinks', { ownerKey, missionId: args.missionId, outcomeId: args.outcomeId, requestKey, relation, note, createdAt: Date.now() })
  },
})

/** B11. Create a revisioned replay branch from bounded snapshots without restoring or executing it. */
export const createReplayBranch = mutation({
  args: { missionId: v.id('missions'), branchKey: v.string(), baseRevision: v.number(), baseState: v.string(), branchState: v.string() },
  returns: v.id('scopeBReplayBranches'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await owned(ctx, args.missionId)
    const branchKey = keyBound(args.branchKey, 'Branch key', 100)
    const baseRevision = integer(args.baseRevision, 'Base revision', 0, 100000)
    if (new TextEncoder().encode(args.baseState).length > 64 * 1024 || new TextEncoder().encode(args.branchState).length > 64 * 1024) throw new ConvexError('Replay snapshots are limited to 64 KiB each')
    parseObject(args.baseState, 'Replay base snapshot')
    parseObject(args.branchState, 'Replay branch snapshot')
    const existing = await ctx.db.query('scopeBReplayBranches').withIndex('by_owner_branchKey', q => q.eq('ownerKey', ownerKey).eq('branchKey', branchKey)).first()
    const baseDigest = await digest(args.baseState)
    const branchDigest = await digest(args.branchState)
    if (existing) {
      if (existing.missionId !== args.missionId || existing.baseDigest !== baseDigest || existing.branchDigest !== branchDigest) throw new ConvexError('Branch key already exists with different snapshots')
      return existing._id
    }
    return ctx.db.insert('scopeBReplayBranches', { ownerKey, missionId: args.missionId, branchKey, baseRevision, revision: baseRevision, baseState: args.baseState, branchState: args.branchState, baseDigest, branchDigest, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

/** B11. Compute a replay branch delta against its immutable base snapshot. */
export const calculateReplayBranchDelta = query({
  args: { branchId: v.id('scopeBReplayBranches') },
  returns: v.object({ branchId: v.id('scopeBReplayBranches'), baseRevision: v.number(), revision: v.number(), changedKeys: v.array(v.string()), addedKeys: v.array(v.string()), removedKeys: v.array(v.string()), digestValid: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const branch = await ctx.db.get(args.branchId)
    if (!branch || branch.ownerKey !== ownerKey) throw new ConvexError('Replay branch unavailable')
    const base = parseObject(branch.baseState, 'Replay base snapshot')
    const current = parseObject(branch.branchState, 'Replay branch snapshot')
    const before = new Set(Object.keys(base)), after = new Set(Object.keys(current))
    const changedKeys = [...before].filter(key => after.has(key) && stable(base[key]) !== stable(current[key])).sort()
    const addedKeys = [...after].filter(key => !before.has(key)).sort()
    const removedKeys = [...before].filter(key => !after.has(key)).sort()
    const digestValid = await digest(branch.baseState) === branch.baseDigest && await digest(branch.branchState) === branch.branchDigest
    return { branchId: branch._id, baseRevision: branch.baseRevision, revision: branch.revision, changedKeys, addedKeys, removedKeys, digestValid }
  },
})

/** B11. Validate a checkpoint restoration against current owned mission and expected digest/revision. */
export const validateCheckpointRestoration = query({
  args: { branchId: v.id('scopeBReplayBranches'), expectedRevision: v.number(), expectedDigest: v.string() },
  returns: v.object({ valid: v.boolean(), reasons: v.array(v.string()), revision: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const branch = await ctx.db.get(args.branchId)
    if (!branch || branch.ownerKey !== ownerKey) throw new ConvexError('Replay branch unavailable')
    await owned(ctx, branch.missionId)
    integer(args.expectedRevision, 'Expected branch revision', 0, 100000)
    const reasons: string[] = []
    if (branch.revision !== args.expectedRevision) reasons.push('Branch revision changed')
    if (branch.revision < branch.baseRevision) reasons.push('Branch revision predates its base checkpoint')
    if (await digest(branch.baseState) !== branch.baseDigest || await digest(branch.branchState) !== branch.branchDigest) reasons.push('Snapshot digest mismatch')
    if (args.expectedDigest !== branch.baseDigest) reasons.push('Expected checkpoint digest differs from retained base')
    return { valid: reasons.length === 0, reasons, revision: branch.revision }
  },
})

/** B11. Guard execution resume based on mission/run state and unresolved incidents. */
export const guardExecutionResume = query({
  args: { missionId: v.id('missions'), runId: v.id('missionRuns') },
  returns: v.object({ allowed: v.boolean(), reasons: v.array(v.string()), runStatus: v.union(v.literal('running'), v.literal('paused'), v.literal('blocked'), v.literal('complete')) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const mission = await owned(ctx, args.missionId)
    const run = await ctx.db.get(args.runId)
    if (!run || run.missionId !== mission._id) throw new ConvexError('Mission run unavailable')
    const reasons: string[] = []
    if (run.status !== 'paused') reasons.push('Only a paused run can be resumed by this guard')
    if (run.retries >= run.maxRetries) reasons.push('Retry budget is exhausted')
    if (run.deadlineAt <= Date.now()) reasons.push('Run deadline has passed')
    const incidents = await ctx.db.query('incidents').withIndex('by_mission_status', q => q.eq('missionId', mission._id).eq('status', 'open')).take(50)
    const escalated = await ctx.db.query('incidents').withIndex('by_mission_status', q => q.eq('missionId', mission._id).eq('status', 'escalated')).take(50)
    if (incidents.length || escalated.length) reasons.push('Open or escalated incidents require review')
    return { allowed: reasons.length === 0, reasons, runStatus: run.status }
  },
})

/** B12. Grade operator-submitted scenario evidence and persist a deterministic result. */
export const gradeScenarioSuiteResults = mutation({
  args: { suiteKey: v.string(), requestKey: v.string(), configMatrix: v.array(configInput), results: v.array(resultInput), notes: v.string() },
  returns: v.object({ runId: v.id('scopeBBenchmarkRuns'), passed: v.number(), failed: v.number(), notRun: v.number(), score: v.number(), status: v.union(v.literal('passed'), v.literal('failed'), v.literal('incomplete')) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const suiteKey = keyBound(args.suiteKey, 'Suite key', 100)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const notes = textBound(args.notes, 'Benchmark notes', 2000, 4)
    if (args.configMatrix.length > 40 || args.results.length < 1 || args.results.length > 200) throw new ConvexError('Configuration matrix supports up to 40 entries and suites require 1–200 results')
    const keys = new Set<string>()
    const results = args.results.map(item => {
      const caseKey = keyBound(item.caseKey, 'Scenario key', 100)
      if (keys.has(caseKey)) throw new ConvexError('Scenario keys must be unique')
      keys.add(caseKey)
      return { ...item, caseKey, detail: textBound(item.detail, 'Scenario detail', 1000, 2) }
    })
    const configMatrix = args.configMatrix.map((item, i) => ({ key: keyBound(item.key, 'Configuration key ' + (i + 1), 100), value: textBound(item.value, 'Configuration value', 300, 1) }))
    const passed = results.filter(item => item.status === 'pass').length
    const failed = results.filter(item => item.status === 'fail').length
    const notRun = results.filter(item => item.status === 'not_run').length
    const score = (passed / results.length) * 100
    const status = failed || results.some(item => item.critical && item.status !== 'pass') ? 'failed' as const : notRun ? 'incomplete' as const : 'passed' as const
    const old = await ctx.db.query('scopeBBenchmarkRuns').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) {
      if (old.suiteKey !== suiteKey || stable(old.configMatrix) !== stable(configMatrix) || (old.results.length > 0 && stable(old.results) !== stable(results))) throw new ConvexError('Request key conflicts with an earlier benchmark run')
      if (old.results.length === 0) {
        await ctx.db.patch(old._id, { configMatrix, results, notes, passed, failed, notRun, score, status, source: 'operator-submitted-results', recordedAt: Date.now() })
        return { runId: old._id, passed, failed, notRun, score, status }
      }
      return { runId: old._id, passed: old.passed, failed: old.failed, notRun: old.notRun, score: old.score, status: old.status }
    }
    const runId = await ctx.db.insert('scopeBBenchmarkRuns', { ownerKey, requestKey, suiteKey, configMatrix, results, notes, passed, failed, notRun, score, status, recordedAt: Date.now(), source: 'operator-submitted-results' })
    return { runId, passed, failed, notRun, score, status }
  },
})

/** B12. Aggregate benchmark configuration matrix outcomes for the current operator. */
export const aggregateConfigurationMatrix = query({
  args: { suiteKey: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({ runs: v.number(), passedRuns: v.number(), failedRuns: v.number(), incompleteRuns: v.number(), averageScore: v.union(v.number(), v.null()), configurations: v.array(v.object({ key: v.string(), value: v.string(), runs: v.number(), averageScore: v.number() })) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const limit = integer(args.limit ?? 100, 'Benchmark history limit', 1, 250)
    const rows = await ctx.db.query('scopeBBenchmarkRuns').withIndex('by_owner_recordedAt', q => q.eq('ownerKey', ownerKey)).order('desc').take(limit)
    const included = args.suiteKey ? rows.filter(row => row.suiteKey === args.suiteKey) : rows
    const configs = new Map<string, { key: string; value: string; runs: number; total: number; averageScore: number }>()
    for (const run of included) for (const item of run.configMatrix) {
      const key = item.key + '\u0000' + item.value
      const entry = configs.get(key) ?? { key: item.key, value: item.value, runs: 0, total: 0, averageScore: 0 }
      entry.runs++; entry.total += run.score; entry.averageScore = entry.total / entry.runs; configs.set(key, entry)
    }
    return { runs: included.length, passedRuns: included.filter(row => row.status === 'passed').length, failedRuns: included.filter(row => row.status === 'failed').length, incompleteRuns: included.filter(row => row.status === 'incomplete').length, averageScore: included.length ? included.reduce((sum, row) => sum + row.score, 0) / included.length : null, configurations: [...configs.values()].map(({ key, value, runs, averageScore }) => ({ key, value, runs, averageScore })).sort((a, b) => b.averageScore - a.averageScore).slice(0, 100) }
  },
})

/** B12. Record benchmark run metadata without triggering any benchmark execution. */
export const recordBenchmarkRun = mutation({
  args: { suiteKey: v.string(), requestKey: v.string(), configMatrix: v.array(configInput), source: v.string(), notes: v.string(), runReference: v.optional(v.string()) },
  returns: v.id('scopeBBenchmarkRuns'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const suiteKey = keyBound(args.suiteKey, 'Suite key', 100)
    const requestKey = keyBound(args.requestKey, 'Request key', 120)
    const source = textBound(args.source, 'Run evidence source', 120)
    const notes = textBound(args.notes, 'Benchmark notes', 2000, 4)
    if (args.configMatrix.length > 40) throw new ConvexError('At most 40 configuration entries')
    const configMatrix = args.configMatrix.map((item, i) => ({ key: keyBound(item.key, 'Configuration key ' + (i + 1), 100), value: textBound(item.value, 'Configuration value', 300, 1) }))
    const runReference = args.runReference ? textBound(args.runReference, 'Run reference', 1000, 4) : undefined
    const existing = await ctx.db.query('scopeBBenchmarkRuns').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (existing) {
      if (existing.suiteKey !== suiteKey || stable(existing.configMatrix) !== stable(configMatrix)) throw new ConvexError('Request key conflicts with an existing benchmark record')
      return existing._id
    }
    return ctx.db.insert('scopeBBenchmarkRuns', { ownerKey, requestKey, suiteKey, configMatrix, results: [], notes, passed: 0, failed: 0, notRun: 0, score: 0, status: 'incomplete', recordedAt: Date.now(), source, runReference })
  },
})
