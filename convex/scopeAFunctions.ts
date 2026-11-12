import { ConvexError, v } from 'convex/values'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { requireOperator, requireOwnedMission } from './permissions'
import { bounded, digest, secrets } from './studioModel'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, stableValue(record[key])]))
  }
  return value
}
const canonical = (value: unknown) => JSON.stringify(stableValue(value))

type ReadCtx = QueryCtx
type WriteCtx = MutationCtx
const checkpointInput = v.object({ key: v.string(), required: v.boolean() })
const checkpointResult = v.object({ key: v.string(), required: v.boolean(), passed: v.boolean(), detail: v.string() })
const missionStatus = v.union(v.literal('draft'), v.literal('running'), v.literal('review'), v.literal('complete'), v.literal('cancelled'))
const severity = v.union(v.literal('info'), v.literal('warning'), v.literal('critical'))
const boundedKey = (value: string, label: string, max = 100) => {
  const result = bounded(value, label, max)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new ConvexError(label + ' contains unsupported characters')
  return result
}
async function ownedProject(ctx: ReadCtx | WriteCtx, projectId: Id<'studioProjects'>) {
  const ownerKey = await requireOperator(ctx)
  const project = await ctx.db.get(projectId)
  if (!project || project.ownerKey !== ownerKey) throw new ConvexError('Project not found or access denied')
  return project
}
async function guideCheckpoint(ctx: ReadCtx, missionId: Id<'missions'>, key: string) {
  const mission = await ctx.db.get(missionId)
  if (!mission) return { passed: false, detail: 'Mission unavailable' }
  if (key === 'approval') return { passed: mission.approved, detail: mission.approved ? 'Explicit operator approval recorded' : 'Explicit operator approval is missing' }
  if (key === 'completion') return { passed: mission.status === 'complete' && mission.completion >= 100, detail: 'Requires completed mission state and 100% completion' }
  if (key === 'evidence') {
    const rows = await ctx.db.query('evidence').withIndex('by_mission', q => q.eq('missionId', missionId)).take(100)
    const pass = rows.some(row => row.score >= 70 && row.message.trim().length >= 3)
    return { passed: pass, detail: pass ? 'At least one retained evidence record meets the score threshold' : 'No retained evidence record meets the score threshold' }
  }
  if (key === 'verification') {
    const rows = await ctx.db.query('verifications').withIndex('by_mission', q => q.eq('missionId', missionId)).take(100)
    const pass = rows.some(row => row.passed && row.criteria.length > 0 && row.evidence.length > 0)
    return { passed: pass, detail: pass ? 'Passing verification with criteria and evidence exists' : 'Passing verification evidence is missing' }
  }
  if (key === 'delivery') {
    const rows = await ctx.db.query('deliveries').withIndex('by_mission', q => q.eq('missionId', missionId)).take(100)
    const pass = rows.some(row => row.stage === 'verified' && row.readinessStatus === 'pass' && row.readinessTotalCount !== undefined && row.readinessTotalCount > 0 && row.readinessPassedCount === row.readinessTotalCount && !!row.workflowCommitSha && row.workflowCommitSha.toLowerCase() === row.deploymentCommitSha?.toLowerCase() && !!row.deploymentUrl)
    return { passed: pass, detail: pass ? 'Verified delivery has matching commit provenance and complete readiness evidence' : 'Verified delivery provenance and passing readiness evidence are missing' }
  }
  if (key === 'artifact') {
    const rows = await ctx.db.query('artifacts').withIndex('by_mission', q => q.eq('missionId', missionId)).take(100)
    const pass = rows.some(row => ['approved', 'accepted', 'verified', 'complete'].includes(row.status.toLowerCase()))
    return { passed: pass, detail: pass ? 'At least one artifact has an accepted terminal status' : 'No accepted artifact exists' }
  }
  if (key === 'active') return { passed: mission.status === 'running', detail: 'Mission must be in the running state' }
  return { passed: false, detail: 'Unknown checkpoint key; unknown criteria never pass automatically' }
}

/** A1: Evaluate and persist an explicit, bounded mission guide checklist. */
export const evaluateMissionGuide = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), checkpoints: v.array(checkpointInput) },
  returns: v.object({ evaluationId: v.id('scopeAMissionGuideEvaluations'), status: v.union(v.literal('ready'), v.literal('blocked')), score: v.number(), checkpoints: v.array(checkpointResult) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const mission = await requireOwnedMission(ctx, args.missionId)
    const requestKey = boundedKey(args.requestKey, 'Evaluation request key', 80)
    if (args.checkpoints.length < 1 || args.checkpoints.length > 20 || new Set(args.checkpoints.map(row => row.key)).size !== args.checkpoints.length) throw new ConvexError('Provide 1–20 uniquely keyed guide checkpoints')
    const checkpoints = args.checkpoints.map(row => ({ key: boundedKey(row.key, 'Checkpoint key', 60), required: row.required }))
    const inputDigest = await digest(canonical({ missionId: args.missionId, checkpoints }))
    const prior = await ctx.db.query('scopeAMissionGuideEvaluations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).unique()
    if (prior) {
      if (prior.digest !== inputDigest || prior.missionId !== mission._id) throw new ConvexError('Evaluation request key is bound to different immutable input')
      return { evaluationId: prior._id, status: prior.status, score: prior.score, checkpoints: prior.checkpoints }
    }
    const results: Array<{ key: string; required: boolean; passed: boolean; detail: string }> = []
    for (const checkpoint of checkpoints) {
      const result = await guideCheckpoint(ctx, mission._id, checkpoint.key)
      results.push({ ...checkpoint, passed: result.passed, detail: result.detail })
    }
    const required = results.filter(row => row.required)
    const score = required.length ? Math.round(required.filter(row => row.passed).length / required.length * 100) : 100
    const status = required.every(row => row.passed) ? 'ready' as const : 'blocked' as const
    const summary = status === 'ready' ? 'All required guide checkpoints have retained evidence.' : 'One or more required checkpoints are unresolved; execution must not be inferred from this evaluation.'
    const evaluationId = await ctx.db.insert('scopeAMissionGuideEvaluations', { ownerKey, missionId: mission._id, requestKey, digest: inputDigest, status, score, summary, checkpoints: results, createdAt: Date.now() })
    return { evaluationId, status, score, checkpoints: results }
  },
})

/** A2: Persist guarded mission-console transitions and immutable transition history. */
export const transitionMissionConsole = mutation({
  args: { missionId: v.id('missions'), operation: v.union(v.literal('start'), v.literal('hold'), v.literal('resume'), v.literal('complete'), v.literal('cancel')), reason: v.string() },
  returns: v.object({ missionId: v.id('missions'), fromStatus: missionStatus, toStatus: missionStatus, revision: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const mission = await requireOwnedMission(ctx, args.missionId)
    const reason = bounded(args.reason, 'Transition reason', 1200, 8)
    secrets(reason)
    let toStatus = mission.status
    if (args.operation === 'start') {
      if (mission.status !== 'draft' || !mission.approved) throw new ConvexError('Only an explicitly approved draft mission can start')
      toStatus = 'running'
    } else if (args.operation === 'hold') {
      if (mission.status !== 'running') throw new ConvexError('Only a running mission can be placed on review hold')
      toStatus = 'review'
    } else if (args.operation === 'resume') {
      if (mission.status !== 'review' || !mission.approved) throw new ConvexError('Only an approved mission on review hold can resume')
      toStatus = 'running'
    } else if (args.operation === 'complete') {
      if (mission.status !== 'running') throw new ConvexError('Only a running mission can be completed')
      const verifications = await ctx.db.query('verifications').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(100)
      const deliveries = await ctx.db.query('deliveries').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(100)
      const verified = verifications.some(row => row.passed && row.criteria.length > 0 && row.evidence.length > 0)
      const deliveryVerified = deliveries.some(row => row.stage === 'verified' && row.readinessStatus === 'pass' && row.readinessTotalCount !== undefined && row.readinessTotalCount > 0 && row.readinessPassedCount === row.readinessTotalCount && !!row.workflowCommitSha && row.workflowCommitSha.toLowerCase() === row.deploymentCommitSha?.toLowerCase() && !!row.deploymentUrl)
      if (!verified || !deliveryVerified) throw new ConvexError('Completion requires a retained passing verification and verified delivery with matching provenance and full readiness evidence')
      toStatus = 'complete'
    } else {
      if (mission.status === 'complete' || mission.status === 'cancelled') throw new ConvexError('Terminal mission state cannot be cancelled again')
      toStatus = 'cancelled'
    }
    const priorEvents = await ctx.db.query('scopeAConsoleEvents').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(100)
    if (priorEvents.length >= 100) throw new ConvexError('Mission console transition history reached its 100-event bound')
    const revision = priorEvents.length + 1
    await ctx.db.patch(mission._id, { status: toStatus, ...(toStatus === 'complete' ? { completion: 100 } : {}) })
    await ctx.db.insert('scopeAConsoleEvents', { ownerKey, missionId: mission._id, fromStatus: mission.status, toStatus, operation: args.operation, reason, revision, createdAt: Date.now() })
    await ctx.db.insert('auditEvents', { missionId: mission._id, eventType: 'scope_a_console_transition', source: 'scopeAFunctions.transitionMissionConsole', message: reason, metadata: JSON.stringify({ operation: args.operation, fromStatus: mission.status, toStatus, revision }), createdAt: Date.now() })
    return { missionId: mission._id, fromStatus: mission.status, toStatus, revision }
  },
})

/** A3: Validate, persist and idempotently admit mission evidence. */
export const submitMissionEvidence = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), agent: v.string(), reference: v.string(), message: v.string(), score: v.number(), severity },
  returns: v.id('scopeAEvidenceSubmissions'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await requireOwnedMission(ctx, args.missionId)
    const requestKey = boundedKey(args.requestKey, 'Evidence request key', 80)
    const agent = bounded(args.agent, 'Evidence owner', 100, 2)
    const reference = bounded(args.reference, 'Evidence reference', 500, 3)
    const message = bounded(args.message, 'Evidence summary', 4000, 3)
    if (!Number.isFinite(args.score) || args.score < 0 || args.score > 100) throw new ConvexError('Evidence score must be finite and between 0 and 100')
    secrets([reference, message].join('\n'))
    const prior = await ctx.db.query('scopeAEvidenceSubmissions').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).unique()
    if (prior) {
      if (prior.missionId !== args.missionId || prior.agent !== agent || prior.reference !== reference || prior.message !== message || prior.score !== args.score || prior.severity !== args.severity) throw new ConvexError('Evidence request key is bound to different immutable content')
      return prior._id
    }
    const id = await ctx.db.insert('scopeAEvidenceSubmissions', { ownerKey, missionId: args.missionId, requestKey, agent, reference, message, score: args.score, severity: args.severity, status: 'submitted', createdAt: Date.now() })
    await ctx.db.insert('evidence', { missionId: args.missionId, agent, message: message + '\nEvidence reference: ' + reference, score: args.score, severity: args.severity })
    await ctx.db.insert('auditEvents', { missionId: args.missionId, eventType: 'scope_a_evidence_submitted', source: 'scopeAFunctions.submitMissionEvidence', message: message.slice(0, 1000), metadata: JSON.stringify({ requestKey, reference, score: args.score, severity: args.severity }), createdAt: Date.now() })
    return id
  },
})

/** A4: Resolve roadmap acceptance only from recorded verification and delivery evidence. */
export const resolveRoadmapAcceptance = mutation({
  args: { missionId: v.id('missions'), milestoneKey: v.string(), accepted: v.boolean(), expectedRevision: v.number(), evidenceReferences: v.array(v.string()), note: v.string() },
  returns: v.object({ acceptanceId: v.id('scopeARoadmapAcceptances'), accepted: v.boolean(), revision: v.number(), blockers: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const mission = await requireOwnedMission(ctx, args.missionId)
    const milestoneKey = boundedKey(args.milestoneKey, 'Milestone key', 80)
    const note = bounded(args.note, 'Acceptance note', 1600, 3)
    if (args.evidenceReferences.length > 12 || new Set(args.evidenceReferences).size !== args.evidenceReferences.length) throw new ConvexError('Use up to 12 distinct evidence references')
    const references = args.evidenceReferences.map(ref => bounded(ref, 'Evidence reference', 500, 3))
    const existing = await ctx.db.query('scopeARoadmapAcceptances').withIndex('by_owner_mission_milestone', q => q.eq('ownerKey', ownerKey).eq('missionId', mission._id).eq('milestoneKey', milestoneKey)).unique()
    const revision = existing?.revision ?? 0
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision !== revision) throw new ConvexError('Roadmap acceptance revision changed; reload before updating')
    const blockers: string[] = []
    if (args.accepted) {
      const verifications = await ctx.db.query('verifications').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(100)
      const passing = verifications.filter(row => row.passed && row.criteria.length > 0 && row.evidence.length > 0)
      if (!passing.length) blockers.push('No retained passing verification includes criteria and evidence')
      const available = new Set(passing.flatMap(row => row.evidence))
      if (!references.length || references.some(ref => !available.has(ref))) blockers.push('Acceptance references must match retained evidence on a passing verification')
      if (mission.status === 'cancelled') blockers.push('Cancelled missions cannot accept roadmap milestones')
    }
    const accepted = args.accepted && blockers.length === 0
    const nextRevision = revision + 1
    const payload = { ownerKey, missionId: mission._id, milestoneKey, accepted, revision: nextRevision, evidenceReferences: references, note, createdAt: Date.now() }
    let acceptanceId: Id<'scopeARoadmapAcceptances'>
    if (existing) { await ctx.db.patch(existing._id, payload); acceptanceId = existing._id }
    else acceptanceId = await ctx.db.insert('scopeARoadmapAcceptances', payload)
    await ctx.db.insert('auditEvents', { missionId: mission._id, eventType: 'roadmap_acceptance_resolved', source: 'scopeAFunctions.resolveRoadmapAcceptance', message: note.slice(0, 1000), metadata: JSON.stringify({ milestoneKey, requested: args.accepted, accepted, revision: nextRevision, blockers }), createdAt: Date.now() })
    return { acceptanceId, accepted, revision: nextRevision, blockers }
  },
})

/** A5: Resolve the guided workflow's next gate from durable mission, guide and roadmap state. */
export const guidedWorkflowGate = query({
  args: { missionId: v.id('missions') },
  returns: v.object({ missionStatus, approved: v.boolean(), latestGuideStatus: v.union(v.literal('ready'), v.literal('blocked'), v.null()), roadmapAccepted: v.number(), roadmapOpen: v.number(), nextGate: v.string(), executionAllowed: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const mission = await requireOwnedMission(ctx, args.missionId)
    const guide = await ctx.db.query('scopeAMissionGuideEvaluations').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(20)
    const latest = guide.find(row => row.ownerKey === ownerKey)
    const roadmap = await ctx.db.query('scopeARoadmapAcceptances').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(100)
    const accepted = roadmap.filter(row => row.ownerKey === ownerKey && row.accepted).length
    const open = roadmap.filter(row => row.ownerKey === ownerKey && !row.accepted).length
    const nextGate = mission.status === 'cancelled' ? 'Create or select a new mission' : mission.status === 'complete' ? 'Review recorded outcomes' : !mission.approved ? 'Record explicit mission approval' : latest?.status !== 'ready' ? 'Resolve required mission guide checkpoints' : mission.status === 'review' ? 'Review and resume mission explicitly' : 'Continue to the next governed execution checkpoint'
    return { missionStatus: mission.status, approved: mission.approved, latestGuideStatus: latest?.status ?? null, roadmapAccepted: accepted, roadmapOpen: open, nextGate, executionAllowed: mission.approved && mission.status === 'running' && latest?.status === 'ready' }
  },
})

/** A6: Compute council quorum from persisted agent runs and evidence, never from a generated claim alone. */
export const evaluateCouncilConsensus = query({
  args: { missionId: v.id('missions') },
  returns: v.object({ missionId: v.id('missions'), completedAgents: v.number(), totalAgents: v.number(), averageEvidenceScore: v.number(), quorumReached: v.boolean(), consensus: v.union(v.literal('converged'), v.literal('divergent'), v.literal('insufficient-evidence')), dissent: v.array(v.string()), evidenceCount: v.number() }),
  handler: async (ctx, args) => {
    const mission = await requireOwnedMission(ctx, args.missionId)
    const expected = ['Vision Architect', 'Research Oracle', 'Systems Engineer', 'Builder Agent', 'Creative Director', 'Critic Agent']
    const runs = await ctx.db.query('agentRuns').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(20)
    const unique = expected.map(agent => runs.find(row => row.agent === agent)).filter((row): row is NonNullable<typeof row> => !!row)
    const completed = unique.filter(row => row.status === 'complete')
    const evidence = await ctx.db.query('evidence').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(100)
    const scores = evidence.filter(row => expected.includes(row.agent) && Number.isFinite(row.score) && row.score >= 0 && row.score <= 100).map(row => row.score)
    const averageEvidenceScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0
    const dissent = unique.filter(row => row.status !== 'complete').map(row => row.agent + ': ' + row.status)
    const quorumReached = completed.length >= 4 && scores.length >= 3
    const consensus = !quorumReached ? 'insufficient-evidence' as const : averageEvidenceScore >= 70 && completed.length >= 5 ? 'converged' as const : 'divergent' as const
    return { missionId: mission._id, completedAgents: completed.length, totalAgents: expected.length, averageEvidenceScore, quorumReached, consensus, dissent, evidenceCount: scores.length }
  },
})

/** A7: Record immutable, idempotent measured outcomes for manifest strategies. */
export const recordManifestStrategyOutcome = mutation({
  args: { missionId: v.id('missions'), strategyKey: v.string(), requestKey: v.string(), outcome: v.union(v.literal('success'), v.literal('failure'), v.literal('inconclusive')), actualResult: v.string(), evidenceReferences: v.array(v.string()) },
  returns: v.id('scopeAManifestOutcomes'),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    await requireOwnedMission(ctx, args.missionId)
    const strategyKey = boundedKey(args.strategyKey, 'Strategy key', 80)
    const requestKey = boundedKey(args.requestKey, 'Outcome request key', 80)
    const actualResult = bounded(args.actualResult, 'Observed outcome', 2000, 3)
    if (args.evidenceReferences.length < 1 || args.evidenceReferences.length > 8 || new Set(args.evidenceReferences).size !== args.evidenceReferences.length) throw new ConvexError('Provide 1–8 distinct evidence references for a measured outcome')
    const evidenceReferences = args.evidenceReferences.map(ref => bounded(ref, 'Evidence reference', 400, 3))
    secrets(actualResult + '\n' + evidenceReferences.join('\n'))
    const prior = await ctx.db.query('scopeAManifestOutcomes').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).unique()
    if (prior) {
      if (prior.missionId !== args.missionId || prior.strategyKey !== strategyKey || prior.outcome !== args.outcome || prior.actualResult !== actualResult || canonical(prior.evidenceReferences) !== canonical(evidenceReferences)) throw new ConvexError('Outcome request key is bound to different immutable evidence')
      return prior._id
    }
    const rows = await ctx.db.query('scopeAManifestOutcomes').withIndex('by_mission', q => q.eq('missionId', args.missionId)).take(100)
    const revision = rows.filter(row => row.ownerKey === ownerKey && row.strategyKey === strategyKey).length + 1
    if (revision > 20) throw new ConvexError('Strategy outcome history reached its 20-record bound')
    return await ctx.db.insert('scopeAManifestOutcomes', { ownerKey, missionId: args.missionId, strategyKey, requestKey, outcome: args.outcome, actualResult, evidenceReferences, revision, createdAt: Date.now() })
  },
})

/** A8: Compile a typed intent contract into a review-required artifact, with idempotency. */
export const compileIntentContract = mutation({
  args: { missionId: v.id('missions'), requestKey: v.string(), intent: v.string(), roles: v.array(v.string()), requirements: v.array(v.object({ key: v.string(), description: v.string(), acceptance: v.string() })) },
  returns: v.object({ artifactId: v.id('artifacts'), digest: v.string(), reused: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const mission = await requireOwnedMission(ctx, args.missionId)
    const requestKey = boundedKey(args.requestKey, 'Intent request key', 80)
    const intent = bounded(args.intent, 'Intent statement', 5000, 12)
    if (args.roles.length < 1 || args.roles.length > 12 || args.requirements.length < 1 || args.requirements.length > 40) throw new ConvexError('Intent requires 1–12 roles and 1–40 requirements')
    const roles = args.roles.map(role => bounded(role, 'Role', 100, 2))
    if (new Set(roles).size !== roles.length) throw new ConvexError('Intent roles must be unique')
    const requirements = args.requirements.map(row => ({ key: boundedKey(row.key, 'Requirement key', 60), description: bounded(row.description, 'Requirement description', 1200, 3), acceptance: bounded(row.acceptance, 'Acceptance condition', 1200, 3) }))
    if (new Set(requirements.map(row => row.key)).size !== requirements.length) throw new ConvexError('Requirement keys must be unique')
    secrets(intent + '\n' + canonical(requirements))
    const content = canonical({ version: 'scope-a-intent-contract-v1', intent, roles, requirements, limitations: 'Compiled contract only; no code execution, external mutation, or production authorization.' })
    const contentDigest = await digest(content)
    const old = await ctx.db.query('scopeAIntentCompilations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).unique()
    if (old) {
      if (old.missionId !== mission._id || old.digest !== contentDigest) throw new ConvexError('Intent request key is bound to different immutable content')
      return { artifactId: old.artifactId, digest: old.digest, reused: true }
    }
    const artifactId = await ctx.db.insert('artifacts', { missionId: mission._id, type: 'intent-contract', name: 'Intent contract · ' + intent.slice(0, 80), content, status: 'draft', requiresApproval: true })
    await ctx.db.insert('scopeAIntentCompilations', { ownerKey, missionId: mission._id, requestKey, digest: contentDigest, artifactId, createdAt: Date.now() })
    return { artifactId, digest: contentDigest, reused: false }
  },
})

/** A9: Compare two owned visual revisions without mutating either snapshot. */
export const diffVisualRevisions = query({
  args: { baselineId: v.id('visualRevisions'), candidateId: v.id('visualRevisions') },
  returns: v.object({ featureId: v.id('featurePackages'), baselineRevision: v.number(), candidateRevision: v.number(), changedFields: v.array(v.string()), baselineDigest: v.string(), candidateDigest: v.string(), baselineDiff: v.string(), candidateDiff: v.string() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const baseline = await ctx.db.get(args.baselineId)
    const candidate = await ctx.db.get(args.candidateId)
    if (!baseline || !candidate || baseline.ownerKey !== ownerKey || candidate.ownerKey !== ownerKey || baseline.featureId !== candidate.featureId) throw new ConvexError('Visual revisions must belong to the same owned feature')
    const fields = new Set([...Object.keys(baseline.config), ...Object.keys(candidate.config)])
    const changedFields = [...fields].filter(key => canonical((baseline.config as Record<string, unknown>)[key] ?? null) !== canonical((candidate.config as Record<string, unknown>)[key] ?? null)).sort()
    if (await digest(baseline.packageSnapshot) !== baseline.packageDigest || await digest(candidate.packageSnapshot) !== candidate.packageDigest) throw new ConvexError('Visual package snapshot integrity check failed')
    return { featureId: baseline.featureId, baselineRevision: baseline.revision, candidateRevision: candidate.revision, changedFields, baselineDigest: baseline.packageDigest, candidateDigest: candidate.packageDigest, baselineDiff: baseline.diff, candidateDiff: candidate.diff }
  },
})

/** A10: Compile a retained feature package into an approval-required artifact with digest checks. */
export const compileFeaturePackage = mutation({
  args: { featureId: v.id('featurePackages'), expectedDigest: v.string() },
  returns: v.object({ artifactId: v.id('artifacts'), packageDigest: v.string(), reused: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const feature = await ctx.db.get(args.featureId)
    if (!feature || feature.ownerKey !== ownerKey) throw new ConvexError('Feature package unavailable')
    const project = await ownedProject(ctx, feature.projectId)
    if (feature.packageDigest !== args.expectedDigest || await digest(feature.packageSnapshot) !== feature.packageDigest) throw new ConvexError('Exact, integrity-checked package digest required')
    const old = await ctx.db.query('featureArtifactReceipts').withIndex('by_feature', q => q.eq('featureId', feature._id)).first()
    if (old) {
      const artifact = await ctx.db.get(old.artifactId)
      if (!artifact || artifact.missionId !== project.missionId || artifact.content !== feature.packageSnapshot || old.packageDigest !== feature.packageDigest) throw new ConvexError('Retained feature artifact receipt failed integrity validation')
      return { artifactId: old.artifactId, packageDigest: feature.packageDigest, reused: true }
    }
    const mission = await ctx.db.get(project.missionId)
    if (!mission || mission.ownerKey !== ownerKey) throw new ConvexError('Owned linked mission required')
    const artifactId = await ctx.db.insert('artifacts', { missionId: mission._id, type: 'feature-source-bundle', name: feature.title + ' · source v' + feature.revision, content: feature.packageSnapshot, status: 'awaiting_approval', requiresApproval: true })
    await ctx.db.insert('featureArtifactReceipts', { ownerKey, featureId: feature._id, artifactId, packageDigest: feature.packageDigest, createdAt: Date.now() })
    return { artifactId, packageDigest: feature.packageDigest, reused: false }
  },
})

/** A11: Parse a retained repository snapshot report without fetching or executing repository content. */
export const parseRepositorySnapshot = query({
  args: { snapshotId: v.id('appImportSnapshots') },
  returns: v.object({ snapshotId: v.id('appImportSnapshots'), repository: v.string(), commitSha: v.string(), digest: v.string(), parseStatus: v.union(v.literal('parsed'), v.literal('unstructured'), v.literal('invalid')), fileCount: v.number(), dependencyCount: v.number(), languages: v.array(v.string()), findings: v.array(v.string()), summary: v.string() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const snapshot = await ctx.db.get(args.snapshotId)
    if (!snapshot || snapshot.ownerKey !== ownerKey) throw new ConvexError('Repository snapshot unavailable')
    if (await digest(snapshot.report) !== snapshot.digest) throw new ConvexError('Repository snapshot report digest mismatch')
    let data: unknown
    try { data = JSON.parse(snapshot.report) } catch { return { snapshotId: snapshot._id, repository: snapshot.repository, commitSha: snapshot.commitSha, digest: snapshot.digest, parseStatus: 'unstructured' as const, fileCount: 0, dependencyCount: 0, languages: [], findings: [], summary: 'Retained report is not JSON; no repository facts were inferred.' } }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { snapshotId: snapshot._id, repository: snapshot.repository, commitSha: snapshot.commitSha, digest: snapshot.digest, parseStatus: 'invalid' as const, fileCount: 0, dependencyCount: 0, languages: [], findings: [], summary: 'Snapshot JSON root must be an object.' }
    const raw = data as Record<string, unknown>
    const files = Array.isArray(raw.files) ? raw.files : []
    const dependencies = Array.isArray(raw.dependencies) ? raw.dependencies : []
    const languages = Array.isArray(raw.languages) ? raw.languages.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, 80)).slice(0, 30) : []
    const findings = Array.isArray(raw.findings) ? raw.findings.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, 500)).slice(0, 50) : []
    return { snapshotId: snapshot._id, repository: snapshot.repository, commitSha: snapshot.commitSha, digest: snapshot.digest, parseStatus: 'parsed' as const, fileCount: files.length, dependencyCount: dependencies.length, languages, findings, summary: 'Parsed the saved report only. This does not prove repository access, dependency installation, or code execution.' }
  },
})

/** A12: Evaluate portfolio decision criteria from bounded, retained mission outcomes. */
export const evaluatePortfolioCriteria = query({
  args: { missionId: v.id('missions') },
  returns: v.object({ missionId: v.id('missions'), recommendation: v.union(v.literal('continue'), v.literal('review'), v.literal('stop')), rationale: v.array(v.string()), passingVerifications: v.number(), failedVerifications: v.number(), openIncidents: v.number(), decisionHistory: v.number() }),
  handler: async (ctx, args) => {
    const mission = await requireOwnedMission(ctx, args.missionId)
    const verifications = await ctx.db.query('verifications').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(50)
    const incidents = await ctx.db.query('incidents').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(50)
    const decisions = await ctx.db.query('portfolioDecisions').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(20)
    const passingVerifications = verifications.filter(row => row.passed && row.criteria.length > 0 && row.evidence.length > 0).length
    const failedVerifications = verifications.length - passingVerifications
    const openIncidents = incidents.filter(row => row.status === 'open' || row.status === 'escalated').length
    const rationale: string[] = []
    if (!verifications.length) rationale.push('No retained verification history; do not treat missing evidence as success.')
    if (failedVerifications) rationale.push('One or more retained verifications failed or lacked complete evidence.')
    if (openIncidents) rationale.push('Open or escalated incidents require review before increasing commitment.')
    if (mission.status === 'complete' && passingVerifications > 0 && failedVerifications === 0 && openIncidents === 0) rationale.push('Completed mission has passing retained verification and no open incidents.')
    const recommendation = mission.status === 'cancelled' ? 'stop' as const : !verifications.length || failedVerifications > 0 || openIncidents > 0 || mission.status === 'review' ? 'review' as const : 'continue' as const
    return { missionId: mission._id, recommendation, rationale, passingVerifications, failedVerifications, openIncidents, decisionHistory: decisions.length }
  },
})

/** A13: Verify evolution proposal boundaries without activating a pilot. */
export const verifyEvolutionBoundary = query({
  args: { proposalId: v.id('evolutionProposals') },
  returns: v.object({ proposalId: v.id('evolutionProposals'), eligibleForIndependentReview: v.boolean(), pilotActivated: v.boolean(), reasons: v.array(v.string()), baselineDigest: v.string(), candidateDigest: v.string() }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const proposal = await ctx.db.get(args.proposalId)
    if (!proposal || proposal.ownerKey !== ownerKey) throw new ConvexError('Evolution proposal unavailable')
    const project = await ownedProject(ctx, proposal.projectId)
    const baseline = await ctx.db.get(proposal.baselineId)
    const candidate = await ctx.db.get(proposal.candidateId)
    const reasons: string[] = []
    if (!baseline || !candidate) reasons.push('Baseline or candidate version is missing')
    if (baseline && (baseline.ownerKey !== ownerKey || baseline.projectId !== project._id)) reasons.push('Baseline must belong to the same owner and project')
    if (candidate && (candidate.ownerKey !== ownerKey || candidate.projectId !== project._id)) reasons.push('Candidate must belong to the same owner and project')
    if (baseline && await digest(baseline.packageSnapshot) !== baseline.packageDigest) reasons.push('Baseline package digest does not match retained content')
    if (candidate && await digest(candidate.packageSnapshot) !== candidate.packageDigest) reasons.push('Candidate package digest does not match retained content')
    if (baseline && candidate && candidate.revision <= baseline.revision) reasons.push('Candidate revision must be newer than the protected baseline')
    if (!proposal.justification.trim()) reasons.push('A non-empty evolution justification is required')
    const pilots = await ctx.db.query('evolutionPilots').withIndex('by_proposal', q => q.eq('proposalId', proposal._id)).take(20)
    return { proposalId: proposal._id, eligibleForIndependentReview: reasons.length === 0, pilotActivated: pilots.some(pilot => pilot.status === 'active'), reasons, baselineDigest: baseline?.packageDigest ?? '', candidateDigest: candidate?.packageDigest ?? '' }
  },
})

/** A14: Validate skill package contract shape and digest without claiming skill execution. */
export const validateSkillContract = query({
  args: { skillId: v.id('skillVersions') },
  returns: v.object({ skillId: v.id('skillVersions'), valid: v.boolean(), revision: v.number(), digest: v.string(), inputFieldCount: v.number(), outputFieldCount: v.number(), reasons: v.array(v.string()), executionAuthorized: v.literal(false) }),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const skill = await ctx.db.get(args.skillId)
    if (!skill || skill.ownerKey !== ownerKey) throw new ConvexError('Skill version unavailable')
    await ownedProject(ctx, skill.projectId)
    const reasons: string[] = []
    if (await digest(skill.packageSnapshot) !== skill.packageDigest) reasons.push('Package snapshot digest mismatch')
    let parsed: Record<string, unknown> | null = null
    try { const value: unknown = JSON.parse(skill.packageSnapshot); if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown> } catch { reasons.push('Package snapshot is not valid JSON') }
    if (!parsed) reasons.push('Package root must be an object')
    else {
      if (parsed.version !== 'private-planning-skill-v1') reasons.push('Unsupported skill contract version')
      if (parsed.skillKey !== skill.skillKey || parsed.failurePolicy !== 'stop-and-review') reasons.push('Key or fail-closed policy differs from the stored skill contract')
      for (const [key, expected] of [['inputFields', skill.inputFields], ['outputFields', skill.outputFields], ['tools', skill.tools], ['permissions', skill.permissions]] as const) {
        if (canonical(parsed[key]) !== canonical(expected)) reasons.push(key + ' differ from the persisted typed contract')
      }
      if (!Array.isArray(parsed.inputFields) || parsed.inputFields.length < 1 || parsed.inputFields.length > 12) reasons.push('Input schema must have 1–12 fields')
      if (!Array.isArray(parsed.outputFields) || parsed.outputFields.length < 1 || parsed.outputFields.length > 12) reasons.push('Output schema must have 1–12 fields')
    }
    return { skillId: skill._id, valid: reasons.length === 0, revision: skill.revision, digest: skill.packageDigest, inputFieldCount: skill.inputFields.length, outputFieldCount: skill.outputFields.length, reasons, executionAuthorized: false as const }
  },
})

/** A15: Append a replay event through the canonical revision-checked, hash-chained runtime mutation. */
export const appendReplayEvent = mutation({
  args: { replayId: v.id('runtimeReplays'), eventKey: v.string(), expectedRevision: v.number(), operation: v.union(v.literal('advance'), v.literal('pause'), v.literal('resume')), reason: v.string() },
  returns: v.id('runtimeReplayEvents'),
  handler: async (ctx, args): Promise<Id<'runtimeReplayEvents'>> => {
    const eventKey = boundedKey(args.eventKey, 'Replay event key', 100)
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || args.expectedRevision > 32) throw new ConvexError('Expected replay revision must be an integer from 0 to 32')
    const reason = bounded(args.reason, 'Replay control reason', 800, 8)
    return await ctx.runMutation(api.missionRuntime.control, { ...args, eventKey, reason })
  },
})

/** A16: Delegate explicit payload purge to the existing consent-gated memory authority. */
export const purgeGovernedMemory = mutation({
  args: { memoryId: v.id('memories'), expectedRevision: v.number(), expectedSourceDigest: v.string(), consentKey: v.string(), reason: v.string() },
  returns: v.id('memoryGovernanceReviews'),
  handler: async (ctx, args): Promise<Id<'memoryGovernanceReviews'>> => {
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || args.expectedRevision > 30) throw new ConvexError('Memory lifecycle revision must be an integer from 0 to 30')
    const reason = bounded(args.reason, 'Purge reason', 1200, 12)
    const consentKey = bounded(args.consentKey, 'Purge consent confirmation', 200)
    return await ctx.runMutation(api.memoryGovernance.purge, { ...args, reason, consentKey })
  },
})
