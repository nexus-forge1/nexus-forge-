import { action, mutation, query } from './_generated/server'
import { ConvexError, v } from 'convex/values'
import { requireOperator } from './permissions'
import { bounded, digest, secrets } from './studioModel'

const strings = v.array(v.string())
function text(value: string, label: string, max = 1000): string {
  const result = bounded(value, label, max).trim()
  if (!result) throw new ConvexError(label + ' is required')
  secrets(result)
  return result
}
function key(value: string, label = 'Key', max = 120): string {
  const result = text(value, label, max)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new ConvexError(label + ' contains unsupported characters')
  return result
}
function num(value: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new ConvexError(label + ' is outside its permitted range')
  return value
}
function int(value: number, label: string, min = 0, max = 1_000_000): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConvexError(label + ' must be a bounded integer')
  return value
}
function uniqueList(values: string[], label: string, max = 50): string[] {
  if (values.length > max) throw new ConvexError(label + ' exceeds ' + max + ' entries')
  const result = values.map((x, i) => text(x, label + ' ' + (i + 1), 300))
  if (new Set(result).size !== result.length) throw new ConvexError(label + ' must not contain duplicates')
  return result
}
function evidence(values: string[], label = 'Evidence'): string[] {
  const result = uniqueList(values, label, 30)
  if (!result.length) throw new ConvexError(label + ' requires at least one item')
  return result
}

/* D1 — Mission templates */
export const instantiateMissionTemplate = mutation({
  args: { requestKey: v.string(), templateKey: v.string(), instanceKey: v.string(), parameters: v.array(v.object({ key: v.string(), value: v.string(), required: v.boolean() })), evidence: strings },
  returns: v.id('scopeDMissionTemplates'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), templateKey = key(a.templateKey, 'Template key'), instanceKey = key(a.instanceKey, 'Instance key')
    if (a.parameters.length > 100) throw new ConvexError('At most 100 template parameters are allowed')
    const seen = new Set<string>()
    const parameters = a.parameters.map(p => { const k = key(p.key, 'Parameter key'); if (seen.has(k)) throw new ConvexError('Template parameter keys must be unique'); seen.add(k); const value = text(p.value, 'Parameter value', 2000); return { key: k, value, required: p.required } })
    const missing = parameters.filter(p => p.required && !p.value.trim()).map(p => p.key)
    if (missing.length) throw new ConvexError('Required template parameters are missing: ' + missing.join(', '))
    const proof = evidence(a.evidence, 'Instantiation evidence')
    const old = await ctx.db.query('scopeDMissionTemplates').withIndex('by_owner_instance', q => q.eq('ownerKey', ownerKey).eq('instanceKey', instanceKey)).first()
    const templateDigest = await digest(JSON.stringify({ templateKey, parameters }))
    if (old) { if (old.templateDigest !== templateDigest) throw new ConvexError('Instance key already belongs to a different template configuration'); return old._id }
    return ctx.db.insert('scopeDMissionTemplates', { ownerKey, requestKey, templateKey, instanceKey, parameters, evidence: proof, templateDigest, status: 'instantiated', createdAt: Date.now() })
  },
})
export const validateMissionTemplateParameters = query({
  args: { parameters: v.array(v.object({ key: v.string(), value: v.string(), required: v.boolean() })) },
  returns: v.object({ valid: v.boolean(), missing: strings, duplicateKeys: strings, count: v.number() }),
  handler: async (_ctx, a) => {
    if (a.parameters.length > 100) throw new ConvexError('At most 100 template parameters are allowed')
    const seen = new Set<string>(), duplicates = new Set<string>(), missing: string[] = []
    for (const p of a.parameters) { const k = key(p.key, 'Parameter key'); if (seen.has(k)) duplicates.add(k); seen.add(k); if (p.required && !p.value.trim()) missing.push(k) }
    return { valid: missing.length === 0 && duplicates.size === 0, missing, duplicateKeys: [...duplicates], count: a.parameters.length }
  },
})
export const getMissionTemplateCloneSource = query({
  args: { instanceKey: v.string() },
  returns: v.union(v.object({ instanceKey: v.string(), templateKey: v.string(), parameters: v.array(v.object({ key: v.string(), value: v.string(), required: v.boolean() })), templateDigest: v.string() }), v.null()),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), instanceKey = key(a.instanceKey, 'Instance key')
    const row = await ctx.db.query('scopeDMissionTemplates').withIndex('by_owner_instance', q => q.eq('ownerKey', ownerKey).eq('instanceKey', instanceKey)).first()
    return row ? { instanceKey: row.instanceKey, templateKey: row.templateKey, parameters: row.parameters, templateDigest: row.templateDigest } : null
  },
})

/* D2 — Document knowledge hub */
export const indexKnowledgeDocument = mutation({
  args: { requestKey: v.string(), documentKey: v.string(), title: v.string(), sources: v.array(v.object({ sourceKey: v.string(), sourceType: v.union(v.literal('upload'), v.literal('url'), v.literal('connector'), v.literal('manual')), content: v.string(), citation: v.string() })), tags: strings },
  returns: v.id('scopeDKnowledgeDocuments'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), documentKey = key(a.documentKey, 'Document key'), title = text(a.title, 'Document title', 300)
    if (!a.sources.length || a.sources.length > 50) throw new ConvexError('Provide 1–50 document sources')
    const sourceKeys = new Set<string>()
    const sources = a.sources.map(s => { const sourceKey = key(s.sourceKey, 'Source key'); if (sourceKeys.has(sourceKey)) throw new ConvexError('Source keys must be unique'); sourceKeys.add(sourceKey); return { sourceKey, sourceType: s.sourceType, content: text(s.content, 'Source content', 12000), citation: text(s.citation, 'Source citation', 1500) } })
    const tags = uniqueList(a.tags, 'Document tags', 50)
    const contentDigest = await digest(JSON.stringify(sources))
    const old = await ctx.db.query('scopeDKnowledgeDocuments').withIndex('by_owner_document', q => q.eq('ownerKey', ownerKey).eq('documentKey', documentKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, title, sources, tags, contentDigest, indexedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDKnowledgeDocuments', { ownerKey, requestKey, documentKey, title, sources, tags, contentDigest, indexedAt: Date.now() })
  },
})
export const linkPassageCitation = mutation({
  args: { requestKey: v.string(), documentKey: v.string(), passageKey: v.string(), passage: v.string(), citation: v.string(), confidence: v.number() },
  returns: v.id('scopeDPassageCitations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), documentKey = key(a.documentKey, 'Document key'), passageKey = key(a.passageKey, 'Passage key')
    const doc = await ctx.db.query('scopeDKnowledgeDocuments').withIndex('by_owner_document', q => q.eq('ownerKey', ownerKey).eq('documentKey', documentKey)).first()
    if (!doc) throw new ConvexError('Document must be indexed before passages can be cited')
    const passage = text(a.passage, 'Passage', 4000), citation = text(a.citation, 'Citation', 1500), confidence = num(a.confidence, 'Citation confidence', 0, 1)
    const old = await ctx.db.query('scopeDPassageCitations').withIndex('by_owner_passage', q => q.eq('ownerKey', ownerKey).eq('passageKey', passageKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, documentKey, passage, citation, confidence, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDPassageCitations', { ownerKey, requestKey, documentKey, passageKey, passage, citation, confidence, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const assignKnowledgeDocumentTags = mutation({
  args: { documentKey: v.string(), tags: strings },
  returns: v.object({ documentKey: v.string(), tags: strings, updated: v.boolean() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), documentKey = key(a.documentKey, 'Document key'), tags = uniqueList(a.tags, 'Document tags', 50)
    const row = await ctx.db.query('scopeDKnowledgeDocuments').withIndex('by_owner_document', q => q.eq('ownerKey', ownerKey).eq('documentKey', documentKey)).first()
    if (!row) throw new ConvexError('Knowledge document not found')
    await ctx.db.patch(row._id, { tags, indexedAt: Date.now() })
    return { documentKey, tags, updated: true }
  },
})

/* D3 — Notification center */
export const emitNotificationEvent = mutation({
  args: { requestKey: v.string(), eventKey: v.string(), title: v.string(), message: v.string(), priority: v.union(v.literal('low'), v.literal('normal'), v.literal('high'), v.literal('critical')), targetKey: v.string(), metadata: strings },
  returns: v.id('scopeDNotifications'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), eventKey = key(a.eventKey, 'Event key')
    const title = text(a.title, 'Notification title', 200), message = text(a.message, 'Notification message', 2000), targetKey = key(a.targetKey, 'Target key'), metadata = uniqueList(a.metadata, 'Metadata', 30)
    const old = await ctx.db.query('scopeDNotifications').withIndex('by_owner_event', q => q.eq('ownerKey', ownerKey).eq('eventKey', eventKey)).first()
    if (old) { if (old.title !== title || old.targetKey !== targetKey) throw new ConvexError('Notification event key conflicts with an existing event'); return old._id }
    return ctx.db.insert('scopeDNotifications', { ownerKey, requestKey, eventKey, title, message, priority: a.priority, targetKey, metadata, status: 'unacknowledged', createdAt: Date.now(), acknowledgedAt: undefined })
  },
})
export const updateNotificationAcknowledgment = mutation({
  args: { eventKey: v.string(), status: v.union(v.literal('acknowledged'), v.literal('dismissed')) },
  returns: v.object({ eventKey: v.string(), status: v.union(v.literal('acknowledged'), v.literal('dismissed')), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), eventKey = key(a.eventKey, 'Event key')
    const row = await ctx.db.query('scopeDNotifications').withIndex('by_owner_event', q => q.eq('ownerKey', ownerKey).eq('eventKey', eventKey)).first()
    if (!row) throw new ConvexError('Notification event not found')
    const updatedAt = Date.now()
    await ctx.db.patch(row._id, { status: a.status, acknowledgedAt: updatedAt })
    return { eventKey, status: a.status, updatedAt }
  },
})
export const filterNotificationsByPriority = query({
  args: { priorities: v.array(v.union(v.literal('low'), v.literal('normal'), v.literal('high'), v.literal('critical'))), includeAcknowledged: v.optional(v.boolean()), limit: v.optional(v.number()) },
  returns: v.array(v.object({ eventKey: v.string(), title: v.string(), message: v.string(), priority: v.union(v.literal('low'), v.literal('normal'), v.literal('high'), v.literal('critical')), status: v.union(v.literal('unacknowledged'), v.literal('acknowledged'), v.literal('dismissed')), createdAt: v.number() })),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), limit = int(a.limit ?? 100, 'Notification limit', 1, 300), priorities = new Set(a.priorities)
    const rows = await ctx.db.query('scopeDNotifications').withIndex('by_owner_created', q => q.eq('ownerKey', ownerKey)).order('desc').take(limit)
    return rows.filter(r => (!priorities.size || priorities.has(r.priority)) && (a.includeAcknowledged || r.status === 'unacknowledged')).map(r => ({ eventKey: r.eventKey, title: r.title, message: r.message, priority: r.priority, status: r.status, createdAt: r.createdAt }))
  },
})

/* D4 — Integration center */
export const updateConnectorStatus = mutation({
  args: { requestKey: v.string(), connectorKey: v.string(), status: v.union(v.literal('connected'), v.literal('degraded'), v.literal('disconnected'), v.literal('disabled')), detail: v.string() },
  returns: v.id('scopeDConnectors'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), connectorKey = key(a.connectorKey, 'Connector key'), detail = text(a.detail, 'Connector detail', 1000)
    const old = await ctx.db.query('scopeDConnectors').withIndex('by_owner_connector', q => q.eq('ownerKey', ownerKey).eq('connectorKey', connectorKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, status: a.status, detail, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDConnectors', { ownerKey, requestKey, connectorKey, status: a.status, detail, syncIntervalMinutes: 60, authState: 'unknown', createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const recordConnectorSyncInterval = mutation({
  args: { connectorKey: v.string(), intervalMinutes: v.number() },
  returns: v.object({ connectorKey: v.string(), intervalMinutes: v.number(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), connectorKey = key(a.connectorKey, 'Connector key'), intervalMinutes = int(a.intervalMinutes, 'Sync interval', 1, 10080)
    const row = await ctx.db.query('scopeDConnectors').withIndex('by_owner_connector', q => q.eq('ownerKey', ownerKey).eq('connectorKey', connectorKey)).first()
    if (!row) throw new ConvexError('Connector must be registered before configuring sync')
    const updatedAt = Date.now(); await ctx.db.patch(row._id, { syncIntervalMinutes: intervalMinutes, updatedAt })
    return { connectorKey, intervalMinutes, updatedAt }
  },
})
export const setConnectorAuthState = mutation({
  args: { connectorKey: v.string(), authState: v.union(v.literal('unknown'), v.literal('valid'), v.literal('expired'), v.literal('revoked')) },
  returns: v.object({ connectorKey: v.string(), authState: v.union(v.literal('unknown'), v.literal('valid'), v.literal('expired'), v.literal('revoked')), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), connectorKey = key(a.connectorKey, 'Connector key')
    const row = await ctx.db.query('scopeDConnectors').withIndex('by_owner_connector', q => q.eq('ownerKey', ownerKey).eq('connectorKey', connectorKey)).first()
    if (!row) throw new ConvexError('Connector not found')
    const updatedAt = Date.now(); await ctx.db.patch(row._id, { authState: a.authState, updatedAt })
    return { connectorKey, authState: a.authState, updatedAt }
  },
})
export const checkConnectorAuthState = query({
  args: { connectorKey: v.string() },
  returns: v.object({ connectorKey: v.string(), authState: v.union(v.literal('unknown'), v.literal('valid'), v.literal('expired'), v.literal('revoked')), connected: v.boolean(), status: v.union(v.literal('connected'), v.literal('degraded'), v.literal('disconnected'), v.literal('disabled')) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), connectorKey = key(a.connectorKey, 'Connector key')
    const row = await ctx.db.query('scopeDConnectors').withIndex('by_owner_connector', q => q.eq('ownerKey', ownerKey).eq('connectorKey', connectorKey)).first()
    if (!row) throw new ConvexError('Connector not found')
    return { connectorKey, authState: row.authState, connected: row.status === 'connected' && row.authState === 'valid', status: row.status }
  },
})

/* D5 — Client delivery portal */
export const signOffClientDeliverable = mutation({
  args: { requestKey: v.string(), deliverableKey: v.string(), decision: v.union(v.literal('approved'), v.literal('changes_requested'), v.literal('rejected')), signerKey: v.string(), note: v.string(), evidence: strings },
  returns: v.id('scopeDDeliverables'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), deliverableKey = key(a.deliverableKey, 'Deliverable key'), signerKey = key(a.signerKey, 'Signer key')
    const note = text(a.note, 'Sign-off note', 2000), proof = evidence(a.evidence, 'Sign-off evidence')
    const old = await ctx.db.query('scopeDDeliverables').withIndex('by_owner_deliverable', q => q.eq('ownerKey', ownerKey).eq('deliverableKey', deliverableKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, signoff: a.decision, signerKey, note, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDDeliverables', { ownerKey, requestKey, deliverableKey, signoff: a.decision, signerKey, note, feedback: [], accessGranted: false, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const annotateDeliverableFeedback = mutation({
  args: { deliverableKey: v.string(), feedbackKey: v.string(), annotation: v.string(), severity: v.union(v.literal('info'), v.literal('minor'), v.literal('major'), v.literal('blocking')) },
  returns: v.object({ deliverableKey: v.string(), feedbackCount: v.number(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), deliverableKey = key(a.deliverableKey, 'Deliverable key'), feedbackKey = key(a.feedbackKey, 'Feedback key'), annotation = text(a.annotation, 'Feedback annotation', 2000)
    const row = await ctx.db.query('scopeDDeliverables').withIndex('by_owner_deliverable', q => q.eq('ownerKey', ownerKey).eq('deliverableKey', deliverableKey)).first()
    if (!row) throw new ConvexError('Deliverable not found')
    if (row.feedback.some(f => f.feedbackKey === feedbackKey)) throw new ConvexError('Feedback key already exists')
    if (row.feedback.length >= 100) throw new ConvexError('Feedback limit reached')
    const feedback = [...row.feedback, { feedbackKey, annotation, severity: a.severity, createdAt: Date.now() }], updatedAt = Date.now()
    await ctx.db.patch(row._id, { feedback, updatedAt }); return { deliverableKey, feedbackCount: feedback.length, updatedAt }
  },
})
export const grantDeliverableAccess = mutation({
  args: { deliverableKey: v.string(), granted: v.boolean(), reason: v.string() },
  returns: v.object({ deliverableKey: v.string(), accessGranted: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), deliverableKey = key(a.deliverableKey, 'Deliverable key'), reason = text(a.reason, 'Access grant reason', 1200)
    const row = await ctx.db.query('scopeDDeliverables').withIndex('by_owner_deliverable', q => q.eq('ownerKey', ownerKey).eq('deliverableKey', deliverableKey)).first()
    if (!row) throw new ConvexError('Deliverable not found')
    if (a.granted && row.signoff !== 'approved') throw new ConvexError('Access cannot be granted before approved sign-off')
    if (a.granted && row.feedback.some(f => f.severity === 'blocking')) throw new ConvexError('Access cannot be granted while blocking feedback remains')
    const updatedAt = Date.now(); await ctx.db.patch(row._id, { accessGranted: a.granted, note: row.note + '\\nAccess ' + (a.granted ? 'granted: ' : 'revoked: ') + reason, updatedAt })
    return { deliverableKey, accessGranted: a.granted, updatedAt }
  },
})
export const validateDeliverableAccessGrant = query({
  args: { deliverableKey: v.string() },
  returns: v.object({ deliverableKey: v.string(), allowed: v.boolean(), reasons: strings }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), deliverableKey = key(a.deliverableKey, 'Deliverable key')
    const row = await ctx.db.query('scopeDDeliverables').withIndex('by_owner_deliverable', q => q.eq('ownerKey', ownerKey).eq('deliverableKey', deliverableKey)).first()
    if (!row) throw new ConvexError('Deliverable not found')
    const reasons: string[] = []
    if (row.signoff !== 'approved') reasons.push('Deliverable has no approved sign-off')
    if (row.feedback.some(f => f.severity === 'blocking')) reasons.push('Blocking feedback remains open')
    if (!row.accessGranted) reasons.push('Access has not been granted')
    return { deliverableKey, allowed: reasons.length === 0, reasons }
  },
})

/* D6 — Change review */
export const decideChangeRequest = mutation({
  args: { requestKey: v.string(), changeKey: v.string(), decision: v.union(v.literal('approve'), v.literal('reject'), v.literal('revise')), rationale: v.string(), evidence: strings },
  returns: v.id('scopeDChangeReviews'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), changeKey = key(a.changeKey, 'Change key'), rationale = text(a.rationale, 'Decision rationale', 2000), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDChangeReviews').withIndex('by_owner_change', q => q.eq('ownerKey', ownerKey).eq('changeKey', changeKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, decision: a.decision, rationale, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDChangeReviews', { ownerKey, requestKey, changeKey, decision: a.decision, rationale, evidence: proof, impactScore: 0, diffAudit: [], createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const scoreChangeImpactRadius = query({
  args: { affectedSystems: v.number(), dependencyEdges: v.number(), dataSensitivity: v.number(), reversibility: v.number(), customerImpact: v.number() },
  returns: v.object({ score: v.number(), band: v.union(v.literal('low'), v.literal('moderate'), v.literal('high'), v.literal('critical')) }),
  handler: async (_ctx, a) => {
    const systems = int(a.affectedSystems, 'Affected systems', 0, 1000), edges = int(a.dependencyEdges, 'Dependency edges', 0, 10000)
    const sensitivity = num(a.dataSensitivity, 'Data sensitivity', 0, 100), reversibility = num(a.reversibility, 'Reversibility', 0, 100), customers = num(a.customerImpact, 'Customer impact', 0, 100)
    const score = Math.min(100, Math.round(Math.min(30, systems * 3) + Math.min(20, edges * .2) + sensitivity * .2 + (100 - reversibility) * .2 + customers * .2))
    return { score, band: score >= 80 ? 'critical' as const : score >= 60 ? 'high' as const : score >= 30 ? 'moderate' as const : 'low' as const }
  },
})
export const logDiffReviewAudit = mutation({
  args: { changeKey: v.string(), revision: v.number(), reviewerKey: v.string(), outcome: v.union(v.literal('accepted'), v.literal('rejected'), v.literal('needs_revision')), summary: v.string(), evidence: strings },
  returns: v.object({ changeKey: v.string(), auditCount: v.number(), revision: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), changeKey = key(a.changeKey, 'Change key'), revision = int(a.revision, 'Revision', 1, 100000), reviewerKey = key(a.reviewerKey, 'Reviewer key'), summary = text(a.summary, 'Diff summary', 2000), proof = evidence(a.evidence)
    const row = await ctx.db.query('scopeDChangeReviews').withIndex('by_owner_change', q => q.eq('ownerKey', ownerKey).eq('changeKey', changeKey)).first()
    if (!row) throw new ConvexError('Change request must exist before diff review audit')
    if (row.diffAudit.some(x => x.revision === revision)) throw new ConvexError('Diff revision has already been audited')
    const diffAudit = [...row.diffAudit, { revision, reviewerKey, outcome: a.outcome, summary, evidence: proof, recordedAt: Date.now() }]
    await ctx.db.patch(row._id, { diffAudit, impactScore: row.impactScore, updatedAt: Date.now() })
    return { changeKey, auditCount: diffAudit.length, revision }
  },
})

/* D7 — Adaptive mission orchestrator */
export const triggerDynamicReplanning = mutation({
  args: { requestKey: v.string(), missionKey: v.string(), trigger: v.string(), reason: v.string(), currentPlanDigest: v.string(), proposedActions: strings },
  returns: v.id('scopeDOrchestrations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), missionKey = key(a.missionKey, 'Mission key'), trigger = key(a.trigger, 'Replanning trigger'), reason = text(a.reason, 'Replanning reason', 2000), currentPlanDigest = key(a.currentPlanDigest, 'Plan digest'), proposedActions = uniqueList(a.proposedActions, 'Proposed actions', 50)
    const old = await ctx.db.query('scopeDOrchestrations').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { if (old.missionKey !== missionKey || old.currentPlanDigest !== currentPlanDigest) throw new ConvexError('Replanning request key conflicts with existing plan'); return old._id }
    return ctx.db.insert('scopeDOrchestrations', { ownerKey, requestKey, missionKey, trigger, reason, currentPlanDigest, proposedActions, bottlenecks: [], priorityOrder: proposedActions, state: 'replan_requested', createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const recordMissionBottleneck = mutation({
  args: { missionKey: v.string(), bottleneckKey: v.string(), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), blockedTasks: strings, evidence: strings },
  returns: v.object({ missionKey: v.string(), bottleneckCount: v.number(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), missionKey = key(a.missionKey, 'Mission key'), bottleneckKey = key(a.bottleneckKey, 'Bottleneck key'), blockedTasks = uniqueList(a.blockedTasks, 'Blocked tasks', 100), proof = evidence(a.evidence)
    const row = await ctx.db.query('scopeDOrchestrations').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).first()
    if (!row) throw new ConvexError('Create a replanning record before recording bottlenecks')
    if (row.bottlenecks.some(b => b.bottleneckKey === bottleneckKey)) throw new ConvexError('Bottleneck key already recorded')
    const bottlenecks = [...row.bottlenecks, { bottleneckKey, severity: a.severity, blockedTasks, evidence: proof, recordedAt: Date.now() }]
    await ctx.db.patch(row._id, { bottlenecks, updatedAt: Date.now() })
    return { missionKey, bottleneckCount: bottlenecks.length, updatedAt: Date.now() }
  },
})
export const evaluateMissionReprioritization = query({
  args: { missionKey: v.string(), priorities: v.array(v.object({ actionKey: v.string(), value: v.number(), urgency: v.number(), effort: v.number(), blocked: v.boolean() })) },
  returns: v.object({ missionKey: v.string(), priorityOrder: strings, blockedActions: strings, rationale: v.string() }),
  handler: async (_ctx, a) => {
    const missionKey = key(a.missionKey, 'Mission key')
    if (a.priorities.length > 100) throw new ConvexError('At most 100 actions may be reprioritized')
    const cleanRows = a.priorities.map(p => ({ actionKey: key(p.actionKey, 'Action key'), value: num(p.value, 'Action value', 0, 100), urgency: num(p.urgency, 'Urgency', 0, 100), effort: num(p.effort, 'Effort', 1, 100), blocked: p.blocked }))
    const blockedActions = cleanRows.filter(p => p.blocked).map(p => p.actionKey)
    const priorityOrder = cleanRows.filter(p => !p.blocked).sort((x, y) => ((y.value * .45 + y.urgency * .55) / y.effort) - ((x.value * .45 + x.urgency * .55) / x.effort)).map(p => p.actionKey)
    return { missionKey, priorityOrder, blockedActions, rationale: 'Unblocked actions are ranked by weighted value and urgency per effort; blocked actions are excluded. Persist a new plan revision through the orchestration state transition.' }
  },
})

/* D8 — Evidence graph and uncertainty ledger */
export const linkEvidenceNodes = mutation({
  args: { requestKey: v.string(), linkKey: v.string(), fromNode: v.string(), toNode: v.string(), relation: v.union(v.literal('supports'), v.literal('contradicts'), v.literal('derived_from'), v.literal('qualifies')), strength: v.number(), evidence: strings },
  returns: v.id('scopeDEvidenceLinks'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), linkKey = key(a.linkKey, 'Link key'), fromNode = key(a.fromNode, 'From node'), toNode = key(a.toNode, 'To node')
    if (fromNode === toNode) throw new ConvexError('Evidence link cannot connect a node to itself')
    const strength = num(a.strength, 'Link strength', 0, 1), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDEvidenceLinks').withIndex('by_owner_link', q => q.eq('ownerKey', ownerKey).eq('linkKey', linkKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, fromNode, toNode, relation: a.relation, strength, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDEvidenceLinks', { ownerKey, requestKey, linkKey, fromNode, toNode, relation: a.relation, strength, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const recordUncertaintyAssessment = mutation({
  args: { requestKey: v.string(), claimKey: v.string(), probability: v.number(), impact: v.number(), rationale: v.string(), evidence: strings },
  returns: v.id('scopeDUncertaintyAssessments'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), claimKey = key(a.claimKey, 'Claim key'), probability = num(a.probability, 'Probability', 0, 1), impact = num(a.impact, 'Impact', 0, 100), rationale = text(a.rationale, 'Uncertainty rationale', 2000), proof = evidence(a.evidence)
    const riskScore = Math.round(probability * impact)
    const old = await ctx.db.query('scopeDUncertaintyAssessments').withIndex('by_owner_claim', q => q.eq('ownerKey', ownerKey).eq('claimKey', claimKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, probability, impact, rationale, evidence: proof, riskScore, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDUncertaintyAssessments', { ownerKey, requestKey, claimKey, probability, impact, rationale, evidence: proof, riskScore, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const resolveEvidenceContradiction = mutation({
  args: { requestKey: v.string(), contradictionKey: v.string(), claimA: v.string(), claimB: v.string(), resolution: v.union(v.literal('prefer_a'), v.literal('prefer_b'), v.literal('unresolved')), rationale: v.string(), evidence: strings },
  returns: v.id('scopeDContradictionResolutions'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), contradictionKey = key(a.contradictionKey, 'Contradiction key'), claimA = key(a.claimA, 'Claim A'), claimB = key(a.claimB, 'Claim B')
    if (claimA === claimB) throw new ConvexError('Contradiction claims must differ')
    const rationale = text(a.rationale, 'Resolution rationale', 2000), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDContradictionResolutions').withIndex('by_owner_contradiction', q => q.eq('ownerKey', ownerKey).eq('contradictionKey', contradictionKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, claimA, claimB, resolution: a.resolution, rationale, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDContradictionResolutions', { ownerKey, requestKey, contradictionKey, claimA, claimB, resolution: a.resolution, rationale, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

/* D9 — Experiment designer and causal learning */
export const persistExperimentTrialSetup = mutation({
  args: { requestKey: v.string(), experimentKey: v.string(), hypothesis: v.string(), controlDefinition: v.string(), treatmentDefinition: v.string(), sampleSize: v.number(), randomization: v.boolean(), preregistered: v.boolean(), evidence: strings },
  returns: v.id('scopeDExperimentTrials'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), experimentKey = key(a.experimentKey, 'Experiment key'), hypothesis = text(a.hypothesis, 'Hypothesis', 2000), controlDefinition = text(a.controlDefinition, 'Control definition', 1000), treatmentDefinition = text(a.treatmentDefinition, 'Treatment definition', 1000), sampleSize = int(a.sampleSize, 'Sample size', 2, 1000000), proof = evidence(a.evidence)
    if (a.randomization && !a.preregistered) throw new ConvexError('Randomized trials must be preregistered before enrollment')
    const old = await ctx.db.query('scopeDExperimentTrials').withIndex('by_owner_experiment', q => q.eq('ownerKey', ownerKey).eq('experimentKey', experimentKey)).first()
    if (old) { if (old.hypothesis !== hypothesis) throw new ConvexError('Experiment key already has a different hypothesis'); return old._id }
    return ctx.db.insert('scopeDExperimentTrials', { ownerKey, requestKey, experimentKey, hypothesis, controlDefinition, treatmentDefinition, sampleSize, randomization: a.randomization, preregistered: a.preregistered, evidence: proof, status: 'configured', createdAt: Date.now() })
  },
})
export const validateConfoundingVariables = query({
  args: { variables: v.array(v.object({ key: v.string(), measured: v.boolean(), controlled: v.boolean(), impact: v.number() })) },
  returns: v.object({ valid: v.boolean(), unmitigated: strings, highImpactUnmeasured: strings, riskScore: v.number() }),
  handler: async (_ctx, a) => {
    if (a.variables.length > 100) throw new ConvexError('At most 100 confounders are allowed')
    const seen = new Set<string>(), unmitigated: string[] = [], highImpactUnmeasured: string[] = []
    let riskScore = 0
    for (const x of a.variables) { const k = key(x.key, 'Confounder key'); if (seen.has(k)) throw new ConvexError('Confounder keys must be unique'); seen.add(k); const impact = num(x.impact, 'Confounder impact', 0, 100); if (!x.measured && impact >= 60) highImpactUnmeasured.push(k); if (!x.controlled) { unmitigated.push(k); riskScore += impact * (x.measured ? .25 : 1) } }
    riskScore = Math.min(100, Math.round(riskScore / Math.max(1, a.variables.length)))
    return { valid: unmitigated.length === 0, unmitigated, highImpactUnmeasured, riskScore }
  },
})
export const recordCausalAttribution = mutation({
  args: { requestKey: v.string(), experimentKey: v.string(), outcomeKey: v.string(), effectEstimate: v.number(), confidence: v.number(), method: v.string(), confounders: strings, evidence: strings },
  returns: v.id('scopeDCausalAttributions'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), experimentKey = key(a.experimentKey, 'Experiment key'), outcomeKey = key(a.outcomeKey, 'Outcome key'), effectEstimate = num(a.effectEstimate, 'Effect estimate', -1e9, 1e9), confidence = num(a.confidence, 'Confidence', 0, 1), method = text(a.method, 'Attribution method', 200), confounders = uniqueList(a.confounders, 'Confounders', 50), proof = evidence(a.evidence)
    const trial = await ctx.db.query('scopeDExperimentTrials').withIndex('by_owner_experiment', q => q.eq('ownerKey', ownerKey).eq('experimentKey', experimentKey)).first()
    if (!trial) throw new ConvexError('Experiment setup must exist before attribution')
    return ctx.db.insert('scopeDCausalAttributions', { ownerKey, requestKey, experimentKey, outcomeKey, effectEstimate, confidence, method, confounders, evidence: proof, interpretation: trial.randomization && trial.preregistered ? 'candidate_causal_estimate' : 'associational_only', createdAt: Date.now() })
  },
})

/* D10 — Evaluation lab and competency registry */
export const gradeCompetency = mutation({
  args: { requestKey: v.string(), competencyKey: v.string(), learnerKey: v.string(), score: v.number(), rubricVersion: v.string(), evidence: strings },
  returns: v.id('scopeDCompetencyGrades'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), competencyKey = key(a.competencyKey, 'Competency key'), learnerKey = key(a.learnerKey, 'Learner key'), score = num(a.score, 'Competency score', 0, 100), rubricVersion = key(a.rubricVersion, 'Rubric version'), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDCompetencyGrades').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) { await ctx.db.patch(old._id, { competencyKey, learnerKey, score, rubricVersion, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDCompetencyGrades', { ownerKey, requestKey, competencyKey, learnerKey, score, rubricVersion, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const assignEvaluationScenario = mutation({
  args: { requestKey: v.string(), scenarioKey: v.string(), learnerKey: v.string(), competencyKeys: strings, dueAt: v.number() },
  returns: v.id('scopeDEvaluationScenarios'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), scenarioKey = key(a.scenarioKey, 'Scenario key'), learnerKey = key(a.learnerKey, 'Learner key'), competencyKeys = uniqueList(a.competencyKeys, 'Competencies', 50), dueAt = num(a.dueAt, 'Due date', Date.now(), Date.now() + 366 * 86400000)
    if (!competencyKeys.length) throw new ConvexError('At least one competency must be assigned')
    const old = await ctx.db.query('scopeDEvaluationScenarios').withIndex('by_owner_request', q => q.eq('ownerKey', ownerKey).eq('requestKey', requestKey)).first()
    if (old) return old._id
    return ctx.db.insert('scopeDEvaluationScenarios', { ownerKey, requestKey, scenarioKey, learnerKey, competencyKeys, dueAt, status: 'assigned', createdAt: Date.now() })
  },
})
export const aggregateMasteryGrades = query({
  args: { learnerKey: v.string(), minimumSamples: v.optional(v.number()) },
  returns: v.object({ learnerKey: v.string(), competencyCount: v.number(), meanScore: v.union(v.number(), v.null()), mastery: v.union(v.literal('mastered'), v.literal('developing'), v.literal('insufficient_evidence')), competencies: v.array(v.object({ competencyKey: v.string(), meanScore: v.number(), samples: v.number() })) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), learnerKey = key(a.learnerKey, 'Learner key'), minimumSamples = int(a.minimumSamples ?? 2, 'Minimum samples', 1, 100)
    const rows = await ctx.db.query('scopeDCompetencyGrades').withIndex('by_owner_learner', q => q.eq('ownerKey', ownerKey).eq('learnerKey', learnerKey)).take(1000)
    const map = new Map<string, number[]>()
    for (const row of rows) { const arr = map.get(row.competencyKey) ?? []; arr.push(row.score); map.set(row.competencyKey, arr) }
    const competencies = [...map.entries()].map(([competencyKey, scores]) => ({ competencyKey, meanScore: scores.reduce((s, x) => s + x, 0) / scores.length, samples: scores.length }))
    const meanScore = competencies.length ? competencies.reduce((s, x) => s + x.meanScore, 0) / competencies.length : null
    const mastery = !competencies.length || competencies.some(c => c.samples < minimumSamples) ? 'insufficient_evidence' as const : (meanScore ?? 0) >= 85 && competencies.every(c => c.meanScore >= 80) ? 'mastered' as const : 'developing' as const
    return { learnerKey, competencyCount: competencies.length, meanScore, mastery, competencies }
  },
})

/* D11 — Outcome-aware provider routing */
export const configureRouteThresholds = mutation({
  args: { requestKey: v.string(), routeKey: v.string(), minReliability: v.number(), maxLatencyMs: v.number(), maxCostUsd: v.number(), minimumEvidence: v.number() },
  returns: v.id('scopeDRoutePolicies'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), routeKey = key(a.routeKey, 'Route key'), minReliability = num(a.minReliability, 'Minimum reliability', 0, 1), maxLatencyMs = num(a.maxLatencyMs, 'Maximum latency', 1, 600000), maxCostUsd = num(a.maxCostUsd, 'Maximum cost', 0, 10000), minimumEvidence = int(a.minimumEvidence, 'Minimum evidence', 1, 100000)
    const old = await ctx.db.query('scopeDRoutePolicies').withIndex('by_owner_route', q => q.eq('ownerKey', ownerKey).eq('routeKey', routeKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, minReliability, maxLatencyMs, maxCostUsd, minimumEvidence, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDRoutePolicies', { ownerKey, requestKey, routeKey, minReliability, maxLatencyMs, maxCostUsd, minimumEvidence, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const filterParetoEfficientRoutes = query({
  args: { candidates: v.array(v.object({ key: v.string(), reliability: v.number(), latencyMs: v.number(), costUsd: v.number(), evidenceCount: v.number() })) },
  returns: v.object({ efficient: v.array(v.object({ key: v.string(), reliability: v.number(), latencyMs: v.number(), costUsd: v.number(), evidenceCount: v.number() })), rejected: strings }),
  handler: async (_ctx, a) => {
    if (a.candidates.length > 200) throw new ConvexError('At most 200 routing candidates are allowed')
    const candidates = a.candidates.map(c => ({ key: key(c.key, 'Route candidate'), reliability: num(c.reliability, 'Reliability', 0, 1), latencyMs: num(c.latencyMs, 'Latency', 0, 600000), costUsd: num(c.costUsd, 'Cost', 0, 10000), evidenceCount: int(c.evidenceCount, 'Evidence count', 0, 100000) }))
    const efficient = candidates.filter((c, i) => !candidates.some((o, j) => j !== i && o.reliability >= c.reliability && o.latencyMs <= c.latencyMs && o.costUsd <= c.costUsd && (o.reliability > c.reliability || o.latencyMs < c.latencyMs || o.costUsd < c.costUsd)))
    return { efficient, rejected: candidates.filter(c => !efficient.some(e => e.key === c.key)).map(c => c.key) }
  },
})
export const recordRouteOverride = mutation({
  args: { requestKey: v.string(), routeKey: v.string(), selectedProvider: v.string(), reason: v.string(), expiresAt: v.number(), evidence: strings },
  returns: v.id('scopeDRouteOverrides'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), routeKey = key(a.routeKey, 'Route key'), selectedProvider = key(a.selectedProvider, 'Provider'), reason = text(a.reason, 'Override reason', 2000), expiresAt = num(a.expiresAt, 'Override expiry', Date.now() + 1000, Date.now() + 30 * 86400000), proof = evidence(a.evidence)
    return ctx.db.insert('scopeDRouteOverrides', { ownerKey, requestKey, routeKey, selectedProvider, reason, expiresAt, evidence: proof, status: 'active', createdAt: Date.now() })
  },
})

/* D12 — Governed memory lifecycle */
export const transitionGovernedMemoryStage = mutation({
  args: { requestKey: v.string(), memoryKey: v.string(), fromStage: v.union(v.literal('capture'), v.literal('validate'), v.literal('retain'), v.literal('retire')), toStage: v.union(v.literal('capture'), v.literal('validate'), v.literal('retain'), v.literal('retire')), rationale: v.string(), expiresAt: v.optional(v.number()) },
  returns: v.id('scopeDMemoryLifecycle'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), memoryKey = key(a.memoryKey, 'Memory key'), rationale = text(a.rationale, 'Transition rationale', 1500)
    const allowed: Record<string, string[]> = { capture: ['validate'], validate: ['retain', 'capture'], retain: ['retire'], retire: [] }
    if (!allowed[a.fromStage].includes(a.toStage)) throw new ConvexError('Invalid memory lifecycle transition ' + a.fromStage + ' -> ' + a.toStage)
    const expiresAt = a.expiresAt === undefined ? undefined : num(a.expiresAt, 'Memory expiry', Date.now() + 1000, Date.now() + 10 * 365 * 86400000)
    const old = await ctx.db.query('scopeDMemoryLifecycle').withIndex('by_owner_memory', q => q.eq('ownerKey', ownerKey).eq('memoryKey', memoryKey)).first()
    if (old && old.stage !== a.fromStage) throw new ConvexError('Memory stage changed; refresh state before transitioning')
    if (old) { await ctx.db.patch(old._id, { requestKey, stage: a.toStage, rationale, expiresAt, updatedAt: Date.now() }); return old._id }
    if (a.fromStage !== 'capture') throw new ConvexError('New memory records must begin at capture')
    return ctx.db.insert('scopeDMemoryLifecycle', { ownerKey, requestKey, memoryKey, stage: a.toStage, rationale, expiresAt, quarantined: false, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const evaluateMemoryExpiration = query({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ due: v.array(v.string()), evaluated: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), now = num(a.now ?? Date.now(), 'Evaluation time', 0, Date.now() + 60000), limit = int(a.limit ?? 200, 'Expiration limit', 1, 500)
    const rows = await ctx.db.query('scopeDMemoryLifecycle').withIndex('by_owner_stage', q => q.eq('ownerKey', ownerKey).eq('stage', 'retain')).take(limit)
    return { due: rows.filter(r => r.expiresAt !== undefined && r.expiresAt <= now).map(r => r.memoryKey), evaluated: rows.length }
  },
})
export const manageMemoryQuarantine = mutation({
  args: { memoryKey: v.string(), quarantined: v.boolean(), reason: v.string() },
  returns: v.object({ memoryKey: v.string(), quarantined: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), memoryKey = key(a.memoryKey, 'Memory key'), reason = text(a.reason, 'Quarantine reason', 1500)
    const row = await ctx.db.query('scopeDMemoryLifecycle').withIndex('by_owner_memory', q => q.eq('ownerKey', ownerKey).eq('memoryKey', memoryKey)).first()
    if (!row) throw new ConvexError('Memory lifecycle record not found')
    if (row.stage === 'retire' && !a.quarantined) throw new ConvexError('Retired memory cannot be released from quarantine')
    const updatedAt = Date.now(); await ctx.db.patch(row._id, { quarantined: a.quarantined, rationale: reason, updatedAt })
    return { memoryKey, quarantined: a.quarantined, updatedAt }
  },
})

/* D13 — Durable runtime and replay lab */
export const transitionDeterministicReplayState = mutation({
  args: { requestKey: v.string(), replayKey: v.string(), fromState: v.union(v.literal('created'), v.literal('running'), v.literal('paused'), v.literal('complete'), v.literal('failed')), toState: v.union(v.literal('created'), v.literal('running'), v.literal('paused'), v.literal('complete'), v.literal('failed')), expectedRevision: v.number(), note: v.string() },
  returns: v.id('scopeDReplayStates'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), replayKey = key(a.replayKey, 'Replay key'), expectedRevision = int(a.expectedRevision, 'Expected revision', 0, 1000000), note = text(a.note, 'Transition note', 1500)
    const transitions: Record<string, string[]> = { created: ['running', 'failed'], running: ['paused', 'complete', 'failed'], paused: ['running', 'failed'], complete: [], failed: [] }
    if (!transitions[a.fromState].includes(a.toState)) throw new ConvexError('Replay state transition is not permitted')
    const old = await ctx.db.query('scopeDReplayStates').withIndex('by_owner_replay', q => q.eq('ownerKey', ownerKey).eq('replayKey', replayKey)).first()
    if (old) {
      if (old.state !== a.fromState || old.revision !== expectedRevision) throw new ConvexError('Replay state/revision conflict; reload before retrying')
      await ctx.db.patch(old._id, { requestKey, state: a.toState, revision: old.revision + 1, note, updatedAt: Date.now() }); return old._id
    }
    if (a.fromState !== 'created' || expectedRevision !== 0) throw new ConvexError('New replay must start at created revision 0')
    return ctx.db.insert('scopeDReplayStates', { ownerKey, requestKey, replayKey, state: a.toState, revision: 1, note, checkpointDigest: undefined, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const validateReplayCheckpointRestoration = query({
  args: { replayKey: v.string(), checkpointDigest: v.string(), expectedDigest: v.string(), checkpointRevision: v.number(), expectedRevision: v.number() },
  returns: v.object({ valid: v.boolean(), reasons: strings }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), replayKey = key(a.replayKey, 'Replay key'), checkpointDigest = key(a.checkpointDigest, 'Checkpoint digest'), expectedDigest = key(a.expectedDigest, 'Expected digest'), checkpointRevision = int(a.checkpointRevision, 'Checkpoint revision'), expectedRevision = int(a.expectedRevision, 'Expected revision')
    const reasons: string[] = []
    if (checkpointDigest !== expectedDigest) reasons.push('Checkpoint digest mismatch')
    if (checkpointRevision !== expectedRevision) reasons.push('Checkpoint revision mismatch')
    const row = await ctx.db.query('scopeDReplayStates').withIndex('by_owner_replay', q => q.eq('ownerKey', ownerKey).eq('replayKey', replayKey)).first()
    if (!row) reasons.push('Replay state not found')
    else if (row.revision < checkpointRevision) reasons.push('Checkpoint is newer than current replay state')
    return { valid: reasons.length === 0, reasons }
  },
})
export const appendReplayEventLog = mutation({
  args: { requestKey: v.string(), replayKey: v.string(), sequence: v.number(), eventType: v.string(), payloadDigest: v.string(), priorDigest: v.string() },
  returns: v.id('scopeDReplayEvents'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), replayKey = key(a.replayKey, 'Replay key'), sequence = int(a.sequence, 'Event sequence', 0, 10000000), eventType = key(a.eventType, 'Event type'), payloadDigest = key(a.payloadDigest, 'Payload digest'), priorDigest = text(a.priorDigest, 'Prior digest', 128)
    const replay = await ctx.db.query('scopeDReplayStates').withIndex('by_owner_replay', q => q.eq('ownerKey', ownerKey).eq('replayKey', replayKey)).first()
    if (!replay) throw new ConvexError('Replay state not found')
    const previous = await ctx.db.query('scopeDReplayEvents').withIndex('by_owner_replay_sequence', q => q.eq('ownerKey', ownerKey).eq('replayKey', replayKey)).order('desc').first()
    if (previous && sequence !== previous.sequence + 1) throw new ConvexError('Replay event sequence must be contiguous')
    if (!previous && sequence !== 0) throw new ConvexError('First replay event sequence must be zero')
    if (previous && previous.eventDigest !== priorDigest) throw new ConvexError('Replay event chain digest mismatch')
    const eventDigest = await digest([replayKey, String(sequence), eventType, payloadDigest, priorDigest].join('|'))
    return ctx.db.insert('scopeDReplayEvents', { ownerKey, requestKey, replayKey, sequence, eventType, payloadDigest, priorDigest, eventDigest, createdAt: Date.now() })
  },
})

/* D14 — Controlled evolution engine */
export const intakeEvolutionProposal = mutation({
  args: { requestKey: v.string(), proposalKey: v.string(), changeClass: v.string(), summary: v.string(), riskScore: v.number(), rollbackAvailable: v.boolean(), evidence: strings },
  returns: v.id('scopeDEvolutionProposals'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), proposalKey = key(a.proposalKey, 'Proposal key'), changeClass = key(a.changeClass, 'Change class'), summary = text(a.summary, 'Proposal summary', 2500), riskScore = num(a.riskScore, 'Risk score', 0, 100), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDEvolutionProposals').withIndex('by_owner_proposal', q => q.eq('ownerKey', ownerKey).eq('proposalKey', proposalKey)).first()
    if (old) { if (old.summary !== summary) throw new ConvexError('Proposal key is immutable for a different summary'); return old._id }
    return ctx.db.insert('scopeDEvolutionProposals', { ownerKey, requestKey, proposalKey, changeClass, summary, riskScore, rollbackAvailable: a.rollbackAvailable, evidence: proof, state: 'proposed', createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const verifyEvolutionSafetyBoundary = query({
  args: { changeClasses: strings, allowedClasses: strings, deniedClasses: strings, riskScore: v.number(), rollbackAvailable: v.boolean(), humanApproval: v.boolean() },
  returns: v.object({ eligibleForReview: v.boolean(), denied: strings, unapproved: strings, riskScore: v.number(), blockers: strings }),
  handler: async (_ctx, a) => {
    const changes = uniqueList(a.changeClasses, 'Change classes', 100), allowed = new Set(uniqueList(a.allowedClasses, 'Allowed classes', 100)), deniedSet = new Set(uniqueList(a.deniedClasses, 'Denied classes', 100)), riskScore = num(a.riskScore, 'Risk score', 0, 100)
    const denied = changes.filter(x => deniedSet.has(x)), unapproved = changes.filter(x => !allowed.has(x)), blockers: string[] = []
    if (denied.length) blockers.push('Explicitly denied change classes')
    if (unapproved.length) blockers.push('Change classes outside allowlist')
    if (riskScore >= 70) blockers.push('Risk score exceeds automated review threshold')
    if (!a.rollbackAvailable) blockers.push('Rollback is unavailable')
    if (a.humanApproval) blockers.push('Human approval is required')
    return { eligibleForReview: blockers.length === 0, denied, unapproved, riskScore, blockers }
  },
})
export const recordEvolutionRollbackState = mutation({
  args: { requestKey: v.string(), proposalKey: v.string(), rollbackKey: v.string(), state: v.union(v.literal('planned'), v.literal('ready'), v.literal('executed'), v.literal('failed')), reason: v.string(), evidence: strings },
  returns: v.id('scopeDEvolutionRollbacks'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), proposalKey = key(a.proposalKey, 'Proposal key'), rollbackKey = key(a.rollbackKey, 'Rollback key'), reason = text(a.reason, 'Rollback reason', 2000), proof = evidence(a.evidence)
    const proposal = await ctx.db.query('scopeDEvolutionProposals').withIndex('by_owner_proposal', q => q.eq('ownerKey', ownerKey).eq('proposalKey', proposalKey)).first()
    if (!proposal) throw new ConvexError('Evolution proposal not found')
    const old = await ctx.db.query('scopeDEvolutionRollbacks').withIndex('by_owner_rollback', q => q.eq('ownerKey', ownerKey).eq('rollbackKey', rollbackKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, state: a.state, reason, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDEvolutionRollbacks', { ownerKey, requestKey, proposalKey, rollbackKey, state: a.state, reason, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

/* D15 — Skill foundry */
export const validateSkillPackage = action({
  args: { packageKey: v.string(), version: v.string(), manifest: v.object({ name: v.string(), description: v.string(), entrypoint: v.string(), permissions: strings, inputs: v.array(v.object({ name: v.string(), type: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('object'), v.literal('array')), required: v.boolean() })) }) },
  returns: v.object({ valid: v.boolean(), errors: strings, normalizedKey: v.string(), version: v.string() }),
  handler: async (_ctx, a) => {
    const errors: string[] = []
    let packageKey = '', version = ''
    try { packageKey = key(a.packageKey, 'Package key') } catch (e) { errors.push(e instanceof Error ? e.message : 'Invalid package key') }
    try { version = text(a.version, 'Version', 80); if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) errors.push('Version must use semantic version format') } catch (e) { errors.push(e instanceof Error ? e.message : 'Invalid version') }
    try { text(a.manifest.name, 'Manifest name', 120); text(a.manifest.description, 'Manifest description', 1000); key(a.manifest.entrypoint, 'Entrypoint'); uniqueList(a.manifest.permissions, 'Permissions', 50); if (a.manifest.inputs.length > 100) errors.push('At most 100 input fields are allowed'); const names = a.manifest.inputs.map(i => key(i.name, 'Input name')); if (new Set(names).size !== names.length) errors.push('Input names must be unique') } catch (e) { errors.push(e instanceof Error ? e.message : 'Invalid manifest') }
    return { valid: errors.length === 0, errors, normalizedKey: packageKey, version }
  },
})
export const checkSkillContractSchema = query({
  args: { fields: v.array(v.object({ name: v.string(), type: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('object'), v.literal('array')), required: v.boolean() })), supplied: v.array(v.object({ name: v.string(), type: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('object'), v.literal('array')) })) },
  returns: v.object({ valid: v.boolean(), missing: strings, incompatible: strings, duplicates: strings }),
  handler: async (_ctx, a) => {
    if (a.fields.length > 100 || a.supplied.length > 100) throw new ConvexError('Contract schema is limited to 100 fields')
    const expected = new Map<string, string>(), supplied = new Map<string, string>(), missing: string[] = [], incompatible: string[] = [], duplicates: string[] = []
    for (const f of a.fields) { const name = key(f.name, 'Contract field'); if (expected.has(name)) duplicates.push(name); expected.set(name, f.type); if (f.required && !a.supplied.some(s => s.name === name)) missing.push(name) }
    for (const s of a.supplied) { const name = key(s.name, 'Supplied field'); if (supplied.has(name)) duplicates.push(name); supplied.set(name, s.type); if (expected.has(name) && expected.get(name) !== s.type) incompatible.push(name) }
    return { valid: !missing.length && !incompatible.length && !duplicates.length, missing, incompatible, duplicates: [...new Set(duplicates)] }
  },
})
export const registerSkillVersionTag = mutation({
  args: { requestKey: v.string(), packageKey: v.string(), version: v.string(), contentDigest: v.string(), channel: v.union(v.literal('development'), v.literal('candidate'), v.literal('stable'), v.literal('deprecated')) },
  returns: v.id('scopeDSkillVersions'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), packageKey = key(a.packageKey, 'Package key'), version = text(a.version, 'Version', 80), contentDigest = key(a.contentDigest, 'Content digest')
    if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new ConvexError('Version must use semantic version format')
    const old = await ctx.db.query('scopeDSkillVersions').withIndex('by_owner_package_version', q => q.eq('ownerKey', ownerKey).eq('packageKey', packageKey).eq('version', version)).first()
    if (old) { if (old.contentDigest !== contentDigest) throw new ConvexError('Published version tags are immutable'); return old._id }
    return ctx.db.insert('scopeDSkillVersions', { ownerKey, requestKey, packageKey, version, contentDigest, channel: a.channel, createdAt: Date.now() })
  },
})

/* D16 — Portfolio decision engine */
export const allocatePortfolioResources = mutation({
  args: { requestKey: v.string(), portfolioKey: v.string(), allocations: v.array(v.object({ projectKey: v.string(), units: v.number(), priority: v.number(), strategicFit: v.number() })), capacity: v.number() },
  returns: v.id('scopeDPortfolioAllocations'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), portfolioKey = key(a.portfolioKey, 'Portfolio key'), capacity = int(a.capacity, 'Portfolio capacity', 1, 1000000)
    if (!a.allocations.length || a.allocations.length > 100) throw new ConvexError('Provide 1–100 project allocations')
    const seen = new Set<string>(), allocations = a.allocations.map(x => { const projectKey = key(x.projectKey, 'Project key'); if (seen.has(projectKey)) throw new ConvexError('Project allocations must be unique'); seen.add(projectKey); return { projectKey, units: int(x.units, 'Resource units', 0, capacity), priority: num(x.priority, 'Priority', 0, 100), strategicFit: num(x.strategicFit, 'Strategic fit', 0, 100) } })
    const requested = allocations.reduce((s, x) => s + x.units, 0)
    if (requested > capacity) throw new ConvexError('Resource allocation exceeds available portfolio capacity')
    const score = allocations.reduce((s, x) => s + x.priority * x.strategicFit, 0) / Math.max(1, allocations.length)
    return ctx.db.insert('scopeDPortfolioAllocations', { ownerKey, requestKey, portfolioKey, allocations, capacity, requested, alignmentScore: Math.round(score), status: 'draft', createdAt: Date.now() })
  },
})
export const calculateStrategicAlignmentScore = query({
  args: { criteria: v.array(v.object({ key: v.string(), weight: v.number(), score: v.number() })) },
  returns: v.object({ score: v.number(), criteriaCount: v.number(), gaps: strings }),
  handler: async (_ctx, a) => {
    if (!a.criteria.length || a.criteria.length > 100) throw new ConvexError('Provide 1–100 strategic criteria')
    const seen = new Set<string>(); let weighted = 0, totalWeight = 0; const gaps: string[] = []
    for (const c of a.criteria) { const k = key(c.key, 'Criterion key'); if (seen.has(k)) throw new ConvexError('Strategic criteria must be unique'); seen.add(k); const weight = num(c.weight, 'Criterion weight', 0, 100); const score = num(c.score, 'Criterion score', 0, 100); weighted += weight * score; totalWeight += weight; if (score < 50) gaps.push(k) }
    if (!totalWeight) throw new ConvexError('At least one strategic criterion must have positive weight')
    return { score: Math.round(weighted / totalWeight), criteriaCount: a.criteria.length, gaps }
  },
})
export const signOffPortfolioDecision = mutation({
  args: { requestKey: v.string(), portfolioKey: v.string(), decisionKey: v.string(), approverKey: v.string(), decision: v.union(v.literal('approved'), v.literal('rejected'), v.literal('deferred')), rationale: v.string(), evidence: strings },
  returns: v.id('scopeDPortfolioSignoffs'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), portfolioKey = key(a.portfolioKey, 'Portfolio key'), decisionKey = key(a.decisionKey, 'Decision key'), approverKey = key(a.approverKey, 'Approver key'), rationale = text(a.rationale, 'Decision rationale', 2000), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDPortfolioSignoffs').withIndex('by_owner_decision', q => q.eq('ownerKey', ownerKey).eq('decisionKey', decisionKey)).first()
    if (old) { if (old.portfolioKey !== portfolioKey || old.approverKey !== approverKey) throw new ConvexError('Decision key is already used for a different sign-off'); await ctx.db.patch(old._id, { decision: a.decision, rationale, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDPortfolioSignoffs', { ownerKey, requestKey, portfolioKey, decisionKey, approverKey, decision: a.decision, rationale, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

/* D17 — Product specification compiler (local compilation only; no deployment/payment side effects) */
export const parseRequirementAst = action({
  args: { specification: v.string(), maxNodes: v.optional(v.number()) },
  returns: v.object({ valid: v.boolean(), nodeCount: v.number(), requirements: v.array(v.object({ id: v.string(), text: v.string(), acceptance: strings })), errors: strings, astDigest: v.string() }),
  handler: async (_ctx, a) => {
    const specification = text(a.specification, 'Specification', 20000), maxNodes = int(a.maxNodes ?? 200, 'AST node limit', 1, 1000), lines = specification.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
    const requirements: { id: string; text: string; acceptance: string[] }[] = [], errors: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (requirements.length >= maxNodes) { errors.push('AST node limit exceeded'); break }
      const line = lines[i]
      if (!/^(?:REQ-[A-Za-z0-9._-]+|[-*])\s+.+/.test(line)) { errors.push('Line ' + (i + 1) + ' must start with REQ-id or a bullet'); continue }
      const match = line.match(/^(REQ-[A-Za-z0-9._-]+)\s+(.+)$/)
      const id = match?.[1] ?? 'REQ-AUTO-' + String(requirements.length + 1).padStart(3, '0'), body = match?.[2] ?? line.replace(/^[-*]\s+/, '')
      requirements.push({ id, text: text(body, 'Requirement text', 1500), acceptance: ['Given the stated preconditions, when the requirement is exercised, then the expected outcome is observable.'] })
    }
    if (new Set(requirements.map(r => r.id)).size !== requirements.length) errors.push('Requirement identifiers must be unique')
    return { valid: errors.length === 0 && requirements.length > 0, nodeCount: requirements.length, requirements, errors, astDigest: await digest(JSON.stringify(requirements)) }
  },
})
export const generateAcceptanceCriteria = query({
  args: { requirement: v.string(), risk: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')) },
  returns: v.object({ criteria: strings, requiresHumanReview: v.boolean() }),
  handler: async (_ctx, a) => {
    const requirement = text(a.requirement, 'Requirement', 2000)
    const criteria = ['Given valid inputs, when the requirement is executed, then the documented outcome is produced.', 'Given invalid or missing inputs, when execution is attempted, then the operation is rejected with a clear validation error.', 'Given a repeated request with the same idempotency key, then duplicate side effects are prevented.']
    if (a.risk === 'high' || a.risk === 'critical') criteria.push('Given a failure or interrupted operation, then state remains recoverable and the failure is auditable.')
    if (a.risk === 'critical') criteria.push('A qualified human reviewer must approve the acceptance evidence before release.')
    criteria.push('Requirement under review: ' + requirement)
    return { criteria, requiresHumanReview: a.risk === 'high' || a.risk === 'critical' }
  },
})
export const persistSpecificationBundle = mutation({
  args: { requestKey: v.string(), bundleKey: v.string(), requirements: v.array(v.object({ requirementKey: v.string(), title: v.string(), acceptance: strings, status: v.union(v.literal('draft'), v.literal('reviewed'), v.literal('approved')) })) },
  returns: v.id('scopeDSpecificationBundles'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), bundleKey = key(a.bundleKey, 'Bundle key')
    if (!a.requirements.length || a.requirements.length > 500) throw new ConvexError('Specification bundle requires 1–500 requirements')
    const seen = new Set<string>(), requirements = a.requirements.map(r => { const requirementKey = key(r.requirementKey, 'Requirement key'); if (seen.has(requirementKey)) throw new ConvexError('Requirement keys must be unique'); seen.add(requirementKey); const title = text(r.title, 'Requirement title', 1000), acceptance = uniqueList(r.acceptance, 'Acceptance criteria', 50); if (!acceptance.length) throw new ConvexError('Each requirement needs acceptance criteria'); return { requirementKey, title, acceptance, status: r.status } })
    const bundleDigest = await digest(JSON.stringify(requirements))
    const old = await ctx.db.query('scopeDSpecificationBundles').withIndex('by_owner_bundle', q => q.eq('ownerKey', ownerKey).eq('bundleKey', bundleKey)).first()
    if (old) { if (old.bundleDigest !== bundleDigest) throw new ConvexError('Specification bundle key is immutable for different contents'); return old._id }
    return ctx.db.insert('scopeDSpecificationBundles', { ownerKey, requestKey, bundleKey, requirements, bundleDigest, createdAt: Date.now() })
  },
})
export const exportSpecificationBundle = query({
  args: { bundleKey: v.string() },
  returns: v.union(v.object({ bundleKey: v.string(), requirements: v.array(v.object({ requirementKey: v.string(), title: v.string(), acceptance: strings, status: v.union(v.literal('draft'), v.literal('reviewed'), v.literal('approved')) })), exportedAt: v.number(), digest: v.string() }), v.null()),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), bundleKey = key(a.bundleKey, 'Bundle key')
    const rows = await ctx.db.query('scopeDSpecificationBundles').withIndex('by_owner_bundle', q => q.eq('ownerKey', ownerKey).eq('bundleKey', bundleKey)).first()
    if (!rows) return null
    return { bundleKey, requirements: rows.requirements, exportedAt: Date.now(), digest: rows.bundleDigest }
  },
})

/* D18 — Existing-app import and modernization */
export const recordTechDebtAssessment = mutation({
  args: { requestKey: v.string(), appKey: v.string(), assessmentKey: v.string(), category: v.union(v.literal('architecture'), v.literal('security'), v.literal('dependencies'), v.literal('performance'), v.literal('maintainability')), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), description: v.string(), estimatedEffortHours: v.number(), evidence: strings },
  returns: v.id('scopeDTechDebtAssessments'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), appKey = key(a.appKey, 'App key'), assessmentKey = key(a.assessmentKey, 'Assessment key'), description = text(a.description, 'Debt description', 2500), estimatedEffortHours = num(a.estimatedEffortHours, 'Estimated effort hours', 0, 100000), proof = evidence(a.evidence)
    const old = await ctx.db.query('scopeDTechDebtAssessments').withIndex('by_owner_assessment', q => q.eq('ownerKey', ownerKey).eq('assessmentKey', assessmentKey)).first()
    if (old) { await ctx.db.patch(old._id, { requestKey, appKey, category: a.category, severity: a.severity, description, estimatedEffortHours, evidence: proof, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeDTechDebtAssessments', { ownerKey, requestKey, appKey, assessmentKey, category: a.category, severity: a.severity, description, estimatedEffortHours, evidence: proof, createdAt: Date.now(), updatedAt: Date.now() })
  },
})
export const validateMigrationRules = query({
  args: { rules: v.array(v.object({ key: v.string(), fromPattern: v.string(), toPattern: v.string(), destructive: v.boolean(), reversible: v.boolean() })) },
  returns: v.object({ valid: v.boolean(), errors: strings, highRiskRules: strings }),
  handler: async (_ctx, a) => {
    if (!a.rules.length || a.rules.length > 200) throw new ConvexError('Provide 1–200 migration rules')
    const seen = new Set<string>(), errors: string[] = [], highRiskRules: string[] = []
    for (const r of a.rules) { const k = key(r.key, 'Migration rule key'); if (seen.has(k)) errors.push('Duplicate rule: ' + k); seen.add(k); text(r.fromPattern, 'Source pattern', 1000); text(r.toPattern, 'Target pattern', 1000); if (r.destructive && !r.reversible) highRiskRules.push(k); if (r.fromPattern === r.toPattern) errors.push('Rule ' + k + ' has identical source and target') }
    if (highRiskRules.length) errors.push('Destructive non-reversible rules require manual review')
    return { valid: errors.length === 0, errors, highRiskRules }
  },
})
export const compileModernizationPlan = mutation({
  args: { requestKey: v.string(), appKey: v.string(), planKey: v.string(), targetStack: v.string(), rules: v.array(v.object({ key: v.string(), fromPattern: v.string(), toPattern: v.string(), destructive: v.boolean(), reversible: v.boolean() })), debtAssessmentKeys: strings, approvalRequired: v.boolean() },
  returns: v.id('scopeDModernizationPlans'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), appKey = key(a.appKey, 'App key'), planKey = key(a.planKey, 'Plan key'), targetStack = text(a.targetStack, 'Target stack', 200), debtAssessmentKeys = uniqueList(a.debtAssessmentKeys, 'Debt assessments', 100)
    if (!a.rules.length || a.rules.length > 200) throw new ConvexError('Provide 1–200 migration rules')
    const seen = new Set<string>(), rules = a.rules.map(r => { const k = key(r.key, 'Migration rule key'); if (seen.has(k)) throw new ConvexError('Migration rule keys must be unique'); seen.add(k); const fromPattern = text(r.fromPattern, 'Source pattern', 1000), toPattern = text(r.toPattern, 'Target pattern', 1000); if (r.destructive && !r.reversible && !a.approvalRequired) throw new ConvexError('Destructive non-reversible migration requires approval'); if (fromPattern === toPattern) throw new ConvexError('Migration source and target patterns must differ'); return { key: k, fromPattern, toPattern, destructive: r.destructive, reversible: r.reversible } })
    const planDigest = await digest(JSON.stringify({ appKey, targetStack, rules, debtAssessmentKeys, approvalRequired: a.approvalRequired }))
    const old = await ctx.db.query('scopeDModernizationPlans').withIndex('by_owner_plan', q => q.eq('ownerKey', ownerKey).eq('planKey', planKey)).first()
    if (old) { if (old.planDigest !== planDigest) throw new ConvexError('Plan key already exists with a different plan'); return old._id }
    return ctx.db.insert('scopeDModernizationPlans', { ownerKey, requestKey, appKey, planKey, targetStack, rules, debtAssessmentKeys, approvalRequired: a.approvalRequired, planDigest, status: 'draft', createdAt: Date.now() })
  },
})
