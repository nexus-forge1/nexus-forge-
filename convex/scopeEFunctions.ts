import { action, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { ConvexError, v } from 'convex/values'
import { requireOperator } from './permissions'
import type { Id } from './_generated/dataModel'

const strings = v.array(v.string())
const buildFile = v.object({ path: v.string(), content: v.string(), language: v.string() })
const patchFile = v.object({ path: v.string(), beforeDigest: v.string(), afterDigest: v.string() })
const severity = v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical'))
const digestPattern = /^[a-f0-9]{64}$/i

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
function text(value: string, label: string, max = 2000): string {
  const result = value.trim()
  if (!result || result.length > max) throw new ConvexError(label + ' must be 1–' + max + ' characters')
  if (/\u0000/.test(result)) throw new ConvexError(label + ' contains invalid characters')
  return result
}
function key(value: string, label = 'Key'): string {
  const result = text(value, label, 160)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(result)) throw new ConvexError(label + ' has unsupported characters')
  return result
}
function boundedNumber(value: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new ConvexError(label + ' must be between ' + min + ' and ' + max)
  return value
}
function integer(value: number, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConvexError(label + ' must be a bounded integer')
  return value
}
function uniqueList(values: string[], label: string, max: number): string[] {
  if (values.length > max) throw new ConvexError(label + ' exceeds ' + max + ' entries')
  const clean = values.map((item, index) => text(item, label + ' #' + (index + 1), 300))
  if (new Set(clean).size !== clean.length) throw new ConvexError(label + ' must not contain duplicates')
  return clean
}
function safePath(value: string): string {
  const path = text(value, 'File path', 240)
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '.' || part === '..')) throw new ConvexError('File path must be relative and traversal-free')
  if (!/^[A-Za-z0-9_.@/-]+$/.test(path)) throw new ConvexError('File path contains unsupported characters')
  return path
}
function validatePatch(files: Array<{path:string;beforeDigest:string;afterDigest:string}>, maxFiles: number) {
  if (!files.length || files.length > maxFiles) throw new ConvexError('Patch must contain 1–' + maxFiles + ' files')
  const seen = new Set<string>()
  for (const file of files) {
    const path = safePath(file.path)
    if (seen.has(path)) throw new ConvexError('Duplicate patch path: ' + path)
    seen.add(path)
    if (!digestPattern.test(file.beforeDigest) || !digestPattern.test(file.afterDigest)) throw new ConvexError('Patch file digests must be SHA-256')
    if (file.beforeDigest === file.afterDigest) throw new ConvexError('Patch must change each listed file')
  }
  return files.map(file => ({ path: safePath(file.path), beforeDigest: file.beforeDigest.toLowerCase(), afterDigest: file.afterDigest.toLowerCase() }))
}
function parseObject(raw: string, label: string): Record<string, unknown> {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new ConvexError(label + ' must be valid JSON') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ConvexError(label + ' must be a JSON object')
  return parsed as Record<string, unknown>
}
async function ownedMission(ctx: any, ownerKey: string, missionKey: string) {
  try {
    const mission = await ctx.db.get(missionKey as Id<'missions'>)
    if (!mission || mission.ownerKey !== ownerKey) throw new ConvexError('Mission not found or access denied')
    return mission
  } catch {
    throw new ConvexError('Mission not found or access denied')
  }
}

/* E1 — Super-Intelligence App Builder */
export const intakeAppBuilderSpec = mutation({
  args: { requestKey: v.string(), specKey: v.string(), title: v.string(), description: v.string(), requirements: strings, d17IntentJson: v.optional(v.string()), d19IntentJson: v.optional(v.string()) },
  returns: v.object({ specId: v.id('scopeEAppBuildSpecs'), specDigest: v.string(), lane: v.string(), created: v.boolean() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), specKey = key(a.specKey, 'Specification key')
    const title = text(a.title, 'Title', 160), description = text(a.description, 'Description', 6000), requirements = uniqueList(a.requirements, 'Requirements', 100)
    if (!requirements.length) throw new ConvexError('At least one requirement is required')
    const d17Digest = a.d17IntentJson ? await sha256(text(a.d17IntentJson, 'D17 intent artifact', 30000)) : undefined
    const d19Digest = a.d19IntentJson ? await sha256(text(a.d19IntentJson, 'D19 intent artifact', 30000)) : undefined
    if (a.d17IntentJson) parseObject(a.d17IntentJson, 'D17 intent artifact')
    if (a.d19IntentJson) parseObject(a.d19IntentJson, 'D19 intent artifact')
    const specDigest = await sha256(JSON.stringify({ title, description, requirements, stack: 'tanstack-convex', d17Digest: d17Digest ?? null, d19Digest: d19Digest ?? null }))
    const prior = await ctx.db.query('scopeEAppBuildSpecs').withIndex('by_owner_spec', q => q.eq('ownerKey', ownerKey).eq('specKey', specKey)).first()
    if (prior) {
      if (prior.specDigest !== specDigest || prior.requestKey !== requestKey) throw new ConvexError('Specification key is already bound to different immutable content')
      return { specId: prior._id, specDigest, lane: prior.lane, created: false }
    }
    const now = Date.now()
    const specId = await ctx.db.insert('scopeEAppBuildSpecs', { ownerKey, requestKey, specKey, title, description, requirements, stack: 'tanstack-convex', d17Digest, d19Digest, specDigest, lane: 'Draft', scaffoldFiles: [], createdAt: now, updatedAt: now })
    return { specId, specDigest, lane: 'Draft', created: true }
  },
})

export const compileAppScaffold = action({
  args: { title: v.string(), description: v.string(), requirements: strings, specDigest: v.string() },
  returns: v.object({ stack: v.string(), files: v.array(buildFile), scaffoldDigest: v.string(), handoff: v.string() }),
  handler: async (_ctx, a) => {
    await requireOperator(_ctx)
    const title = text(a.title, 'Title', 160), description = text(a.description, 'Description', 6000), requirements = uniqueList(a.requirements, 'Requirements', 100)
    if (!digestPattern.test(a.specDigest)) throw new ConvexError('Specification digest must be SHA-256')
    if (!requirements.length) throw new ConvexError('Scaffold requires at least one requirement')
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'generated-app'
    const componentName = 'Generated' + slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^([a-z])/, c => c.toUpperCase()) + 'Page'
    const files = [
      { path: 'src/routes/' + slug + '.tsx', language: 'typescript', content: "import { createFileRoute } from '@tanstack/react-router'\n\nexport const Route = createFileRoute('/" + slug + "')({ component: " + componentName + " })\n\nfunction " + componentName + "() {\n  return <main><h1>" + title.replace(/[<>]/g, '') + "</h1><p>" + description.replace(/[<>]/g, '') + "</p></main>\n}\n" },
      { path: 'convex/' + slug + 'Functions.ts', language: 'typescript', content: "import { mutation } from './_generated/server'\nimport { ConvexError, v } from 'convex/values'\nimport { requireOperator } from './permissions'\n\n// Scaffold only. Review and integrate before registering or deploying.\nexport const saveSpecification = mutation({\n  args: { requestKey: v.string(), payload: v.string() },\n  returns: v.object({ accepted: v.boolean(), digest: v.string() }),\n  handler: async (ctx, args) => {\n    await requireOperator(ctx)\n    if (!args.requestKey.trim() || !args.payload.trim()) throw new ConvexError('Request key and payload are required')\n    return { accepted: true, digest: 'REPLACE_WITH_SERVER_SHA256' }\n  },\n})\n" },
      { path: 'docs/' + slug + '-requirements.md', language: 'markdown', content: '# ' + title + '\n\n' + description + '\n\n## Requirements\n' + requirements.map((r, i) => (i + 1) + '. ' + r).join('\n') + '\n\n## Stack\n- TanStack Start / React\n- Convex backend\n\n## Safety\nGenerated scaffold only; no file writes, deployment, provisioning, or external side effects were performed.\n' },
    ]
    const scaffoldDigest = await sha256(JSON.stringify({ specDigest: a.specDigest, stack: 'tanstack-convex', files }))
    return { stack: 'TanStack Start + Convex', files, scaffoldDigest, handoff: 'Generated in memory only; review and persist through the governed build lane.' }
  },
})

export const transitionBuildLane = mutation({
  args: { specKey: v.string(), nextLane: v.union(v.literal('Draft'), v.literal('Scaffolded'), v.literal('Ready to Synthesize')), scaffoldFiles: v.optional(v.array(buildFile)), scaffoldDigest: v.optional(v.string()) },
  returns: v.object({ specKey: v.string(), lane: v.string(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), specKey = key(a.specKey, 'Specification key')
    const row = await ctx.db.query('scopeEAppBuildSpecs').withIndex('by_owner_spec', q => q.eq('ownerKey', ownerKey).eq('specKey', specKey)).first()
    if (!row) throw new ConvexError('Specification not found')
    const allowed = row.lane === 'Draft' && a.nextLane === 'Scaffolded' || row.lane === 'Scaffolded' && a.nextLane === 'Ready to Synthesize'
    if (a.nextLane === row.lane) return { specKey, lane: row.lane, updatedAt: row.updatedAt }
    if (!allowed) throw new ConvexError('Build lane transition is not permitted')
    let scaffoldFiles = row.scaffoldFiles, scaffoldDigest = row.scaffoldDigest
    if (a.nextLane === 'Scaffolded') {
      if (!a.scaffoldFiles || !a.scaffoldDigest || !digestPattern.test(a.scaffoldDigest)) throw new ConvexError('Scaffolded lane requires files and a SHA-256 digest')
      if (!a.scaffoldFiles.length || a.scaffoldFiles.length > 100) throw new ConvexError('Scaffold must contain 1–100 files')
      const paths = new Set<string>()
      scaffoldFiles = a.scaffoldFiles.map(f => { const path = safePath(f.path); if (paths.has(path)) throw new ConvexError('Duplicate scaffold path'); paths.add(path); return { path, content: text(f.content, 'Scaffold content', 20000), language: text(f.language, 'Language', 60) } })
      scaffoldDigest = a.scaffoldDigest
    } else if (!row.scaffoldDigest || !row.scaffoldFiles.length) throw new ConvexError('Ready to Synthesize requires a persisted scaffold')
    const updatedAt = Date.now()
    await ctx.db.patch(row._id, { lane: a.nextLane, scaffoldFiles, scaffoldDigest, updatedAt })
    return { specKey, lane: a.nextLane, updatedAt }
  },
})

/* E2 — Self-Healing Platform Engine */
export const ingestDiagnosticTrace = mutation({
  args: { requestKey: v.string(), incidentKey: v.string(), source: v.union(v.literal('runtime'), v.literal('compiler'), v.literal('diagnostic')), trace: strings, severity, d35IncidentKey: v.optional(v.string()) },
  returns: v.object({ incidentKey: v.string(), traceDigest: v.string(), correlatedD35: v.boolean() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), incidentKey = key(a.incidentKey, 'Incident key')
    if (!a.trace.length || a.trace.length > 500) throw new ConvexError('Trace must contain 1–500 entries')
    const trace = a.trace.map((line, i) => text(line, 'Trace line ' + (i + 1), 2000)), traceDigest = await sha256(JSON.stringify(trace))
    let correlatedD35 = false
    if (a.d35IncidentKey) {
      const d35 = await ctx.db.query('scopeD35RepairIncidents').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey).eq('incidentKey', key(a.d35IncidentKey!, 'D35 incident key'))).first()
      if (!d35) throw new ConvexError('Referenced D35 diagnostic trace is not accessible')
      correlatedD35 = true
    }
    const signature = trace.join('\n').slice(0, 4000), prior = await ctx.db.query('scopeERepairTraces').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey).eq('incidentKey', incidentKey)).first(), now = Date.now()
    if (prior) {
      if (prior.traceDigest !== traceDigest || prior.requestKey !== requestKey) throw new ConvexError('Incident key is already bound to different trace content')
      return { incidentKey, traceDigest, correlatedD35 }
    }
    await ctx.db.insert('scopeERepairTraces', { ownerKey, requestKey, incidentKey, source: a.source, traceDigest, signature, severity: a.severity, patchFiles: [], sandboxStatus: 'captured', containmentState: 'not_contained', createdAt: now, updatedAt: now })
    return { incidentKey, traceDigest, correlatedD35 }
  },
})

export const proposeSelfRepairPatch = query({
  args: { incidentKey: v.string(), patchFiles: v.array(patchFile), maxFiles: v.number(), rollbackDigest: v.string() },
  returns: v.object({ valid: v.boolean(), blockers: strings, patchDigest: v.string(), fileCount: v.number(), reversible: v.boolean() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx)
    const emptyProposal = { valid: false, reversible: false, fileCount: 0, blockers: ['No repair incident registered yet. Ingest a diagnostic trace to begin.'], patchDigest: '' }
    if (!a.incidentKey.trim()) return emptyProposal
    const incidentKey = key(a.incidentKey, 'Incident key'), row = await ctx.db.query('scopeERepairTraces').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey).eq('incidentKey', incidentKey)).first()
    if (!row) return emptyProposal
    const maxFiles = integer(a.maxFiles, 'Maximum patch files', 1, 20), blockers: string[] = []
    if (!a.patchFiles.length) blockers.push('Patch is empty')
    if (a.patchFiles.length > maxFiles) blockers.push('Patch exceeds configured blast-radius bound')
    if (!digestPattern.test(a.rollbackDigest)) blockers.push('Rollback snapshot must have a SHA-256 digest')
    let files: Array<{path:string;beforeDigest:string;afterDigest:string}> = []
    try { files = validatePatch(a.patchFiles, maxFiles) } catch (error) { blockers.push(error instanceof Error ? error.message : 'Patch validation failed') }
    const patchDigest = await sha256(JSON.stringify(files))
    return { valid: blockers.length === 0, blockers, patchDigest, fileCount: files.length, reversible: digestPattern.test(a.rollbackDigest) && files.every(f => digestPattern.test(f.beforeDigest)) }
  },
})

export const recordRepairSandboxReceipt = mutation({
  args: { requestKey: v.string(), incidentKey: v.string(), patchFiles: v.array(patchFile), rollbackDigest: v.string(), sandboxPassed: v.boolean(), containmentState: v.union(v.literal('contained'), v.literal('not_contained')), receipt: v.string() },
  returns: v.object({ incidentKey: v.string(), sandboxStatus: v.string(), containmentState: v.string(), receiptDigest: v.string() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), incidentKey = key(a.incidentKey, 'Incident key'), requestKey = key(a.requestKey, 'Request key')
    const row = await ctx.db.query('scopeERepairTraces').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey).eq('incidentKey', incidentKey)).first()
    if (!row) throw new ConvexError('Repair incident must be captured before sandbox receipt')
    if (!digestPattern.test(a.rollbackDigest)) throw new ConvexError('Rollback digest must be SHA-256')
    const files = validatePatch(a.patchFiles, 20), receipt = text(a.receipt, 'Sandbox receipt', 5000)
    if (a.sandboxPassed && a.containmentState !== 'contained') throw new ConvexError('A passing sandbox receipt requires explicit containment')
    const receiptDigest = await sha256(JSON.stringify({ incidentKey, requestKey, rollbackDigest: a.rollbackDigest, sandboxPassed: a.sandboxPassed, containmentState: a.containmentState, files, receipt }))
    const sandboxStatus = a.sandboxPassed ? 'verified' as const : 'rejected' as const, updatedAt = Date.now()
    await ctx.db.patch(row._id, { requestKey, patchFiles: files, rollbackDigest: a.rollbackDigest, sandboxStatus, containmentState: a.containmentState, receiptDigest, updatedAt })
    return { incidentKey, sandboxStatus, containmentState: a.containmentState, receiptDigest }
  },
})

/* E3 — Dynamic Agent Swarm Foundry */
export const registerSwarmTask = mutation({
  args: { requestKey: v.string(), missionKey: v.string(), taskKey: v.string(), requiredCapabilities: strings, priority: v.number() },
  returns: v.object({ taskId: v.id('scopeESwarmTasks'), taskKey: v.string(), created: v.boolean() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), missionKey = key(a.missionKey, 'Mission key'), taskKey = key(a.taskKey, 'Task key'), requiredCapabilities = uniqueList(a.requiredCapabilities, 'Required capabilities', 100), priority = integer(a.priority, 'Task priority', 0, 1000)
    await ownedMission(ctx, ownerKey, missionKey)
    const prior = await ctx.db.query('scopeESwarmTasks').withIndex('by_owner_task', q => q.eq('ownerKey', ownerKey).eq('taskKey', taskKey)).first()
    if (prior) {
      if (prior.missionKey !== missionKey || prior.requestKey !== requestKey || JSON.stringify(prior.requiredCapabilities) !== JSON.stringify(requiredCapabilities) || prior.priority !== priority) throw new ConvexError('Task key is already bound to different task content')
      return { taskId: prior._id, taskKey, created: false }
    }
    const taskId = await ctx.db.insert('scopeESwarmTasks', { ownerKey, requestKey, missionKey, taskKey, requiredCapabilities, priority, status: 'queued', updatedAt: Date.now() })
    return { taskId, taskKey, created: true }
  },
})

export const evaluateSwarmCapacity = query({
  args: { missionKey: v.string(), queueDepth: v.number(), bottleneckThreshold: v.number(), desiredCapabilities: strings },
  returns: v.object({ queueDepth: v.number(), threshold: v.number(), activeAgents: v.number(), eligibleAgents: v.number(), recommendation: v.string(), missingCapabilities: strings }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), missionKey = key(a.missionKey, 'Mission key'), queueDepth = integer(a.queueDepth, 'Queue depth', 0, 100000), threshold = integer(a.bottleneckThreshold, 'Bottleneck threshold', 1, 100000), desired = uniqueList(a.desiredCapabilities, 'Desired capabilities', 100)
    const agents = await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_status', q => q.eq('ownerKey', ownerKey).eq('status', 'active')).take(200)
    const eligible = agents.filter(agent => agent.currentLoad < agent.capacity && desired.every(cap => agent.capabilities.includes(cap)))
    const assigned = await ctx.db.query('scopeESwarmTasks').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).take(500)
    const missing = desired.filter(cap => !agents.some(agent => agent.capabilities.includes(cap)))
    const depth = Math.max(queueDepth, assigned.filter(task => task.status === 'queued' || task.status === 'blocked').length)
    const recommendation = missing.length ? 'capability-gap' : depth >= threshold || eligible.length === 0 ? 'scale-out-recommended' : 'capacity-sufficient'
    return { queueDepth: depth, threshold, activeAgents: agents.length, eligibleAgents: eligible.length, recommendation, missingCapabilities: missing }
  },
})

export const instantiateSwarmAgent = mutation({
  args: { requestKey: v.string(), agentKey: v.string(), role: v.string(), capabilities: strings, capacity: v.number() },
  returns: v.object({ agentId: v.id('scopeESwarmAgents'), agentKey: v.string(), status: v.string(), created: v.boolean() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), agentKey = key(a.agentKey, 'Agent key'), role = text(a.role, 'Agent role', 100), capabilities = uniqueList(a.capabilities, 'Capabilities', 100), capacity = integer(a.capacity, 'Agent capacity', 1, 100)
    if (!capabilities.length) throw new ConvexError('At least one capability is required')
    const prior = await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', agentKey)).first()
    if (prior) {
      if (prior.role !== role || JSON.stringify(prior.capabilities) !== JSON.stringify(capabilities) || prior.requestKey !== requestKey) throw new ConvexError('Agent key is already bound to another role contract')
      return { agentId: prior._id, agentKey, status: prior.status, created: false }
    }
    const now = Date.now(), agentId = await ctx.db.insert('scopeESwarmAgents', { ownerKey, requestKey, agentKey, role, capabilities, status: 'active', capacity, currentLoad: 0, lastHeartbeatAt: now, createdAt: now, updatedAt: now })
    return { agentId, agentKey, status: 'active', created: true }
  },
})

export const rebalanceSwarmTasks = mutation({
  args: { requestKey: v.string(), missionKey: v.string(), taskKeys: strings },
  returns: v.object({ missionKey: v.string(), assigned: v.number(), unassignedTaskKeys: strings, assignments: v.array(v.object({ taskKey: v.string(), agentKey: v.string() })) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), missionKey = key(a.missionKey, 'Mission key'), taskKeys = uniqueList(a.taskKeys, 'Task keys', 200)
    const agents = await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_status', q => q.eq('ownerKey', ownerKey).eq('status', 'active')).take(200)
    const assignments: Array<{taskKey:string;agentKey:string}> = [], unassignedTaskKeys: string[] = [], load = new Map(agents.map(agent => [agent.agentKey, agent.currentLoad]))
    for (const taskKey of taskKeys) {
      const task = await ctx.db.query('scopeESwarmTasks').withIndex('by_owner_task', q => q.eq('ownerKey', ownerKey).eq('taskKey', taskKey)).first()
      if (!task || task.missionKey !== missionKey || task.status === 'complete') { unassignedTaskKeys.push(taskKey); continue }
      const eligible = agents.filter(agent => (load.get(agent.agentKey) ?? agent.capacity) < agent.capacity && task.requiredCapabilities.every(cap => agent.capabilities.includes(cap))).sort((x,y) => (load.get(x.agentKey) ?? 0) - (load.get(y.agentKey) ?? 0))
      const chosen = eligible[0]
      if (!chosen) { unassignedTaskKeys.push(taskKey); continue }
      await ctx.db.patch(task._id, { requestKey, status: 'assigned', assignedAgentKey: chosen.agentKey, updatedAt: Date.now() })
      load.set(chosen.agentKey, (load.get(chosen.agentKey) ?? 0) + 1)
      assignments.push({ taskKey, agentKey: chosen.agentKey })
    }
    for (const agent of agents) if (load.has(agent.agentKey) && load.get(agent.agentKey) !== agent.currentLoad) await ctx.db.patch(agent._id, { currentLoad: load.get(agent.agentKey)!, updatedAt: Date.now() })
    return { missionKey, assigned: assignments.length, unassignedTaskKeys, assignments }
  },
})

/* E4 — Autonomous Agent Watchdog */
export const recordAgentHeartbeat = mutation({
  args: { requestKey: v.string(), agentKey: v.string(), pulseAt: v.number(), currentLoad: v.number(), status: v.union(v.literal('healthy'), v.literal('degraded'), v.literal('offline')), deadManTimeoutMs: v.number(), failoverTargetKey: v.optional(v.string()) },
  returns: v.object({ agentKey: v.string(), pulseAt: v.number(), status: v.string(), heartbeatId: v.id('scopeEAgentHeartbeats') }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), agentKey = key(a.agentKey, 'Agent key'), now = Date.now()
    const pulseAt = integer(a.pulseAt, 'Pulse timestamp', now - 86400000, now + 30000), currentLoad = boundedNumber(a.currentLoad, 'Current load', 0, 1), deadManTimeoutMs = integer(a.deadManTimeoutMs, 'Dead-man timeout', 1000, 3600000)
    if (pulseAt > now + 5000) throw new ConvexError('Heartbeat timestamp is too far in the future')
    const agent = await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', agentKey)).first()
    if (!agent) throw new ConvexError('Agent must be registered before heartbeat')
    const failoverTargetKey = a.failoverTargetKey ? key(a.failoverTargetKey, 'Failover target') : undefined
    if (failoverTargetKey === agentKey) throw new ConvexError('Agent cannot fail over to itself')
    if (failoverTargetKey) {
      const target = await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', failoverTargetKey)).first()
      if (!target || target.status === 'offline') throw new ConvexError('Failover target must be a registered non-offline agent')
    }
    const prior = await ctx.db.query('scopeEAgentHeartbeats').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', agentKey)).first()
    if (prior && pulseAt < prior.pulseAt) throw new ConvexError('Heartbeat timestamps must be monotonic')
    const fields = { requestKey, pulseAt, currentLoad, status: a.status, deadManTimeoutMs, failoverTargetKey, updatedAt: now }
    let heartbeatId
    if (prior) { await ctx.db.patch(prior._id, fields); heartbeatId = prior._id }
    else heartbeatId = await ctx.db.insert('scopeEAgentHeartbeats', { ownerKey, agentKey, ...fields, reroutedTaskKeys: [], createdAt: now })
    await ctx.db.patch(agent._id, { currentLoad: Math.min(agent.capacity, Math.round(currentLoad * agent.capacity)), lastHeartbeatAt: pulseAt, status: a.status === 'offline' ? 'offline' : 'active', updatedAt: now })
    return { agentKey, pulseAt, status: a.status, heartbeatId }
  },
})

export const evaluateDeadManSwitch = query({
  args: { agentKey: v.string(), at: v.optional(v.number()) },
  returns: v.object({ agentKey: v.string(), timedOut: v.boolean(), ageMs: v.number(), timeoutMs: v.number(), action: v.string(), failoverTargetKey: v.optional(v.string()), pulseAgeMs: v.optional(v.number()), status: v.optional(v.string()), failoverEligible: v.optional(v.boolean()), targetKey: v.optional(v.union(v.string(), v.null())), message: v.optional(v.string()) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx)
    const idle = { agentKey: a.agentKey.trim(), timedOut: false, ageMs: 0, timeoutMs: 0, action: 'idle', pulseAgeMs: 0, status: 'idle', failoverEligible: false, targetKey: null, message: 'No heartbeat recorded yet' }
    if (!a.agentKey.trim()) return idle
    const agentKey = key(a.agentKey, 'Agent key'), at = a.at === undefined ? Date.now() : integer(a.at, 'Evaluation timestamp', 0, Date.now() + 30000)
    const heartbeat = await ctx.db.query('scopeEAgentHeartbeats').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', agentKey)).first()
    if (!heartbeat) return idle
    const ageMs = Math.max(0, at - heartbeat.pulseAt), timedOut = heartbeat.status === 'offline' || ageMs > heartbeat.deadManTimeoutMs
    return { agentKey, timedOut, ageMs, timeoutMs: heartbeat.deadManTimeoutMs, action: timedOut ? heartbeat.failoverTargetKey ? 'failover-eligible' : 'offline-no-target' : 'healthy', failoverTargetKey: heartbeat.failoverTargetKey }
  },
})

export const triggerFailoverReroute = mutation({
  args: { requestKey: v.string(), agentKey: v.string() },
  returns: v.object({ agentKey: v.string(), offline: v.boolean(), reroutedTaskKeys: strings, blockedTaskKeys: strings }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), agentKey = key(a.agentKey, 'Agent key')
    const heartbeat = await ctx.db.query('scopeEAgentHeartbeats').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', agentKey)).first()
    if (!heartbeat) throw new ConvexError('Heartbeat record not found')
    if (Date.now() - heartbeat.pulseAt <= heartbeat.deadManTimeoutMs && heartbeat.status !== 'offline') throw new ConvexError('Dead-man timeout has not elapsed')
    const agent = await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', agentKey)).first()
    if (agent) await ctx.db.patch(agent._id, { status: 'offline', currentLoad: 0, updatedAt: Date.now() })
    const targetKey = heartbeat.failoverTargetKey, reroutedTaskKeys: string[] = [], blockedTaskKeys: string[] = []
    const tasks = await ctx.db.query('scopeESwarmTasks').withIndex('by_owner_status', q => q.eq('ownerKey', ownerKey).eq('status', 'assigned')).take(200)
    let target = targetKey ? await ctx.db.query('scopeESwarmAgents').withIndex('by_owner_agent', q => q.eq('ownerKey', ownerKey).eq('agentKey', targetKey)).first() : null
    if (target && target.status === 'offline') target = null
    for (const task of tasks.filter(t => t.assignedAgentKey === agentKey)) {
      if (target && target.currentLoad < target.capacity && task.requiredCapabilities.every(cap => target!.capabilities.includes(cap))) {
        await ctx.db.patch(task._id, { requestKey, assignedAgentKey: target.agentKey, status: 'assigned', updatedAt: Date.now() })
        reroutedTaskKeys.push(task.taskKey)
        target = { ...target, currentLoad: target.currentLoad + 1 }
      } else {
        await ctx.db.patch(task._id, { requestKey, assignedAgentKey: undefined, status: 'blocked', updatedAt: Date.now() })
        blockedTaskKeys.push(task.taskKey)
      }
    }
    if (target && targetKey) await ctx.db.patch(target._id, { currentLoad: target.currentLoad, updatedAt: Date.now() })
    await ctx.db.patch(heartbeat._id, { status: 'offline', reroutedTaskKeys, updatedAt: Date.now() })
    return { agentKey, offline: true, reroutedTaskKeys, blockedTaskKeys }
  },
})

/* E5 — Multi-Model Arbitrage Router */
export const ingestProviderPricingSample = mutation({
  args: { requestKey: v.string(), provider: v.string(), model: v.string(), inputCostPerMillion: v.number(), outputCostPerMillion: v.number(), latencyMs: v.number(), tokensPerSecond: v.number(), available: v.boolean(), sampledAt: v.optional(v.number()) },
  returns: v.object({ sampleId: v.id('scopeEProviderSamples'), sampledAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), provider = text(a.provider, 'Provider', 100), model = text(a.model, 'Model', 120), now = Date.now()
    const inputCostPerMillion = boundedNumber(a.inputCostPerMillion, 'Input token cost', 0, 100000), outputCostPerMillion = boundedNumber(a.outputCostPerMillion, 'Output token cost', 0, 100000), latencyMs = boundedNumber(a.latencyMs, 'Latency', 0, 600000), tokensPerSecond = boundedNumber(a.tokensPerSecond, 'Throughput', 0, 1000000), sampledAt = a.sampledAt === undefined ? now : integer(a.sampledAt, 'Sample timestamp', now - 86400000, now + 30000)
    const sampleId = await ctx.db.insert('scopeEProviderSamples', { ownerKey, requestKey, provider, model, inputCostPerMillion, outputCostPerMillion, latencyMs, tokensPerSecond, available: a.available, sampledAt })
    return { sampleId, sampledAt }
  },
})

export const calculateArbitrageRanking = query({
  args: { maxSamples: v.optional(v.number()), costWeight: v.optional(v.number()), maxLatencyMs: v.optional(v.number()), ruleKey: v.optional(v.string()) },
  returns: v.object({ ranking: v.array(v.object({ provider: v.string(), model: v.string(), estimatedCostPerMillion: v.number(), latencyMs: v.number(), tokensPerSecond: v.number(), score: v.number(), eligible: v.boolean() })), sampledAt: v.number(), appliedRule: v.optional(v.string()) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), maxSamples = integer(a.maxSamples ?? 100, 'Maximum samples', 1, 200), ruleKey = a.ruleKey?.trim() ? key(a.ruleKey, 'Rule key') : undefined
    const configuredRule = ruleKey ? await ctx.db.query('scopeEArbitrageRules').withIndex('by_owner_rule', q => q.eq('ownerKey', ownerKey).eq('ruleKey', ruleKey)).first() : null
    // Missing or disabled rules are initial configuration states, not query failures.
    // Rank with the existing neutral defaults and explicit caller overrides.
    const rule = configuredRule?.enabled ? configuredRule : null
    const costWeight = boundedNumber(a.costWeight ?? rule?.costWeight ?? 0.5, 'Cost weight', 0, 1), maxLatencyMs = boundedNumber(a.maxLatencyMs ?? rule?.maxLatencyMs ?? 10000, 'Latency threshold', 1, 600000), maxCostPerMillion = rule?.maxCostPerMillion ?? Number.MAX_SAFE_INTEGER, minTokensPerSecond = rule?.minTokensPerSecond ?? 0
    const samples = await ctx.db.query('scopeEProviderSamples').withIndex('by_owner_model_sampled', q => q.eq('ownerKey', ownerKey)).order('desc').take(maxSamples)
    const latest = new Map<string, typeof samples[number]>()
    for (const sample of samples) { const k = sample.provider + ':' + sample.model; if (!latest.has(k)) latest.set(k, sample) }
    const rows = [...latest.values()], maxCost = Math.max(1, ...rows.map(s => s.inputCostPerMillion + s.outputCostPerMillion)), maxLatency = Math.max(1, ...rows.map(s => s.latencyMs))
    const ranking = rows.map(s => { const estimatedCostPerMillion = s.inputCostPerMillion + s.outputCostPerMillion, eligible = s.available && s.latencyMs <= maxLatencyMs && estimatedCostPerMillion <= maxCostPerMillion && s.tokensPerSecond >= minTokensPerSecond; const score = (1 - costWeight) * estimatedCostPerMillion / maxCost + costWeight * s.latencyMs / maxLatency; return { provider: s.provider, model: s.model, estimatedCostPerMillion, latencyMs: s.latencyMs, tokensPerSecond: s.tokensPerSecond, score, eligible } }).sort((x,y) => Number(y.eligible) - Number(x.eligible) || x.score - y.score)
    return { ranking, sampledAt: rows.reduce((latestAt, row) => Math.max(latestAt, row.sampledAt), 0), appliedRule: rule ? ruleKey : undefined }
  },
})

export const setArbitrageSwitchRule = mutation({
  args: { requestKey: v.string(), ruleKey: v.string(), maxLatencyMs: v.number(), maxCostPerMillion: v.number(), minTokensPerSecond: v.number(), costWeight: v.number(), enabled: v.boolean() },
  returns: v.object({ ruleId: v.id('scopeEArbitrageRules'), ruleKey: v.string(), updatedAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), ruleKey = key(a.ruleKey, 'Rule key'), maxLatencyMs = boundedNumber(a.maxLatencyMs, 'Maximum latency', 1, 600000), maxCostPerMillion = boundedNumber(a.maxCostPerMillion, 'Maximum cost', 0, 200000), minTokensPerSecond = boundedNumber(a.minTokensPerSecond, 'Minimum throughput', 0, 1000000), costWeight = boundedNumber(a.costWeight, 'Cost weight', 0, 1), updatedAt = Date.now()
    const fields = { requestKey, maxLatencyMs, maxCostPerMillion, minTokensPerSecond, costWeight, enabled: a.enabled, updatedAt }, prior = await ctx.db.query('scopeEArbitrageRules').withIndex('by_owner_rule', q => q.eq('ownerKey', ownerKey).eq('ruleKey', ruleKey)).first()
    if (prior) { await ctx.db.patch(prior._id, fields); return { ruleId: prior._id, ruleKey, updatedAt } }
    const ruleId = await ctx.db.insert('scopeEArbitrageRules', { ownerKey, ruleKey, ...fields })
    return { ruleId, ruleKey, updatedAt }
  },
})

/* E6 — Interactive Event Scrubber */
export const recordMissionStateSnapshot = mutation({
  args: { requestKey: v.string(), missionKey: v.string(), snapshotKey: v.string(), sequence: v.number(), stateJson: v.string(), astJson: v.string() },
  returns: v.object({ snapshotKey: v.string(), sequence: v.number(), stateDigest: v.string(), astDigest: v.string(), createdAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), missionKey = key(a.missionKey, 'Mission key'), snapshotKey = key(a.snapshotKey, 'Snapshot key'), sequence = integer(a.sequence, 'Snapshot sequence', 1, 1000000000), stateJson = text(a.stateJson, 'Mission state JSON', 50000), astJson = text(a.astJson, 'AST JSON', 50000)
    await ownedMission(ctx, ownerKey, missionKey)
    parseObject(stateJson, 'Mission state'); parseObject(astJson, 'AST snapshot')
    const prior = await ctx.db.query('scopeEMissionSnapshots').withIndex('by_owner_snapshot', q => q.eq('ownerKey', ownerKey).eq('snapshotKey', snapshotKey)).first()
    const stateDigest = await sha256(stateJson), astDigest = await sha256(astJson)
    if (prior) {
      if (prior.missionKey !== missionKey || prior.sequence !== sequence || prior.stateDigest !== stateDigest || prior.astDigest !== astDigest || prior.requestKey !== requestKey) throw new ConvexError('Snapshot key is already bound to different immutable content')
      return { snapshotKey, sequence, stateDigest, astDigest, createdAt: prior.createdAt }
    }
    const recent = await ctx.db.query('scopeEMissionSnapshots').withIndex('by_owner_mission_sequence', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).order('desc').take(1)
    if (recent.length && sequence <= recent[0].sequence) throw new ConvexError('Snapshot sequence must increase monotonically')
    const createdAt = Date.now()
    await ctx.db.insert('scopeEMissionSnapshots', { ownerKey, requestKey, missionKey, snapshotKey, sequence, stateJson, astJson, stateDigest, astDigest, createdAt })
    return { snapshotKey, sequence, stateDigest, astDigest, createdAt }
  },
})

export const fetchMissionHistoricalStates = query({
  args: { missionKey: v.string(), limit: v.optional(v.number()) },
  returns: v.array(v.object({ snapshotKey: v.string(), sequence: v.number(), stateJson: v.string(), astJson: v.string(), stateDigest: v.string(), astDigest: v.string(), createdAt: v.number() })),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), missionKey = key(a.missionKey, 'Mission key'), limit = integer(a.limit ?? 100, 'Snapshot limit', 1, 200)
    const rows = await ctx.db.query('scopeEMissionSnapshots').withIndex('by_owner_mission_sequence', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).order('asc').take(limit)
    return rows.map(row => ({ snapshotKey: row.snapshotKey, sequence: row.sequence, stateJson: row.stateJson, astJson: row.astJson, stateDigest: row.stateDigest, astDigest: row.astDigest, createdAt: row.createdAt }))
  },
})

export const diffHistoricalStateSnapshots = action({
  args: { fromStateJson: v.string(), toStateJson: v.string(), fromAstJson: v.string(), toAstJson: v.string() },
  returns: v.object({ stateDiff: v.array(v.object({ path: v.string(), kind: v.string(), before: v.string(), after: v.string() })), astDiff: v.array(v.object({ path: v.string(), kind: v.string(), before: v.string(), after: v.string() })), diffDigest: v.string() }),
  handler: async (ctx, a) => {
    await requireOperator(ctx)
    const beforeState = parseObject(text(a.fromStateJson, 'Previous state JSON', 50000), 'Previous state'), afterState = parseObject(text(a.toStateJson, 'Current state JSON', 50000), 'Current state'), beforeAst = parseObject(text(a.fromAstJson, 'Previous AST JSON', 50000), 'Previous AST'), afterAst = parseObject(text(a.toAstJson, 'Current AST JSON', 50000), 'Current AST')
    const diff = (before: Record<string, unknown>, after: Record<string, unknown>) => {
      const out: Array<{path:string;kind:string;before:string;after:string}> = []
      const walk = (x: unknown, y: unknown, path: string) => {
        if (JSON.stringify(x) === JSON.stringify(y)) return
        if (out.length >= 1000) return
        if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
          const keys = [...new Set([...Object.keys(x as object), ...Object.keys(y as object)])].sort()
          for (const k of keys) walk((x as Record<string,unknown>)[k], (y as Record<string,unknown>)[k], path ? path + '.' + k : k)
        } else out.push({ path: path || '$', kind: x === undefined ? 'add' : y === undefined ? 'remove' : 'change', before: x === undefined ? '' : JSON.stringify(x).slice(0, 2000), after: y === undefined ? '' : JSON.stringify(y).slice(0, 2000) })
      }
      walk(before, after, '')
      return out
    }
    const stateDiff = diff(beforeState, afterState), astDiff = diff(beforeAst, afterAst), diffDigest = await sha256(JSON.stringify({ stateDiff, astDiff }))
    return { stateDiff, astDiff, diffDigest }
  },
})

export const exportEventScrubberReceipt = mutation({
  args: { requestKey: v.string(), missionKey: v.string(), fromSnapshotKey: v.string(), toSnapshotKey: v.string(), diffDigest: v.string() },
  returns: v.object({ receiptId: v.id('scopeEScrubberReceipts'), receiptDigest: v.string(), createdAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), missionKey = key(a.missionKey, 'Mission key'), fromSnapshotKey = key(a.fromSnapshotKey, 'From snapshot'), toSnapshotKey = key(a.toSnapshotKey, 'To snapshot')
    if (!digestPattern.test(a.diffDigest)) throw new ConvexError('Diff digest must be SHA-256')
    const from = await ctx.db.query('scopeEMissionSnapshots').withIndex('by_owner_snapshot', q => q.eq('ownerKey', ownerKey).eq('snapshotKey', fromSnapshotKey)).first(), to = await ctx.db.query('scopeEMissionSnapshots').withIndex('by_owner_snapshot', q => q.eq('ownerKey', ownerKey).eq('snapshotKey', toSnapshotKey)).first()
    if (!from || !to || from.missionKey !== missionKey || to.missionKey !== missionKey) throw new ConvexError('Both snapshots must belong to the requested mission and operator')
    const createdAt = Date.now(), receiptDigest = await sha256(JSON.stringify({ requestKey, missionKey, fromSnapshotKey, toSnapshotKey, fromDigest: from.stateDigest, toDigest: to.stateDigest, diffDigest: a.diffDigest, createdAt }))
    const receiptId = await ctx.db.insert('scopeEScrubberReceipts', { ownerKey, requestKey, missionKey, fromSnapshotKey, toSnapshotKey, diffDigest: a.diffDigest, receiptDigest, createdAt })
    return { receiptId, receiptDigest, createdAt }
  },
})

/* E7 — Governed Compliance Packager */
export const aggregateComplianceEvidence = query({
  args: { missionKey: v.string() },
  returns: v.object({ missionKey: v.string(), verificationSeals: v.array(v.object({ dossierKey: v.string(), payloadDigest: v.string(), createdAt: v.number() })), auditReceipts: v.array(v.object({ receiptDigest: v.string(), diffDigest: v.string(), createdAt: v.number() })), auditLogs: v.array(v.object({ eventType: v.string(), source: v.string(), message: v.string(), createdAt: v.number(), metadata: v.optional(v.string()) })), verifiedOutcomes: v.array(v.object({ passed: v.boolean(), score: v.number(), summary: v.string(), createdAt: v.number() })), riskRegister: v.array(v.object({ incidentKey: v.string(), severity, state: v.string(), traceDigest: v.string() })), evidenceDigest: v.string() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), missionKey = key(a.missionKey, 'Mission key'), mission = await ownedMission(ctx, ownerKey, missionKey)
    const seals = await ctx.db.query('scopeEComplianceSeals').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).take(100)
    const receipts = await ctx.db.query('scopeEScrubberReceipts').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).take(200)
    const incidents = await ctx.db.query('scopeERepairTraces').withIndex('by_owner_updated', q => q.eq('ownerKey', ownerKey)).order('desc').take(200)
    const d35Incidents = await ctx.db.query('scopeD35RepairIncidents').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey)).take(200)
    const riskRegister = [
      ...incidents.filter(i => i.incidentKey.startsWith(missionKey + ':') || i.requestKey === missionKey).map(i => ({ incidentKey: i.incidentKey, severity: i.severity, state: i.sandboxStatus, traceDigest: i.traceDigest })),
      ...d35Incidents.filter(i => i.requestKey === missionKey || i.incidentKey.startsWith(missionKey + ':')).map(i => ({ incidentKey: i.incidentKey, severity: i.severity, state: i.state, traceDigest: i.traceDigest })),
    ]
    const auditRows = await ctx.db.query('auditEvents').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(200)
    const verificationRows = await ctx.db.query('verifications').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(100)
    const verificationSeals = seals.map(s => ({ dossierKey: s.dossierKey, payloadDigest: s.payloadDigest, createdAt: s.createdAt })), auditReceipts = receipts.map(r => ({ receiptDigest: r.receiptDigest, diffDigest: r.diffDigest, createdAt: r.createdAt }))
    const auditLogs = auditRows.map(row => ({ eventType: row.eventType, source: row.source, message: row.message, createdAt: row.createdAt, metadata: row.metadata }))
    const verifiedOutcomes = verificationRows.map(row => ({ passed: row.passed, score: row.score, summary: row.summary, createdAt: row.createdAt }))
    const evidenceDigest = await sha256(JSON.stringify({ missionKey, verificationSeals, auditReceipts, auditLogs, verifiedOutcomes, riskRegister }))
    return { missionKey, verificationSeals, auditReceipts, auditLogs, verifiedOutcomes, riskRegister, evidenceDigest }
  },
})

export const recordComplianceDossierSeal = mutation({
  args: { requestKey: v.string(), missionKey: v.string(), dossierKey: v.string(), payloadJson: v.string(), evidenceCount: v.number(), riskCount: v.number(), provenanceJson: v.string() },
  returns: v.object({ sealId: v.id('scopeEComplianceSeals'), payloadDigest: v.string(), algorithm: v.string(), createdAt: v.number() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), missionKey = key(a.missionKey, 'Mission key'), dossierKey = key(a.dossierKey, 'Dossier key'), payload = text(a.payloadJson, 'Dossier payload', 100000), provenance = text(a.provenanceJson, 'Provenance', 20000), evidenceCount = integer(a.evidenceCount, 'Evidence count', 0, 100000), riskCount = integer(a.riskCount, 'Risk count', 0, 100000)
    await ownedMission(ctx, ownerKey, missionKey)
    parseObject(payload, 'Dossier payload'); parseObject(provenance, 'Provenance')
    const payloadDigest = await sha256(payload), prior = await ctx.db.query('scopeEComplianceSeals').withIndex('by_owner_dossier', q => q.eq('ownerKey', ownerKey).eq('dossierKey', dossierKey)).first()
    if (prior) {
      if (prior.payloadDigest !== payloadDigest || prior.missionKey !== missionKey) throw new ConvexError('Dossier key is already sealed to different content')
      return { sealId: prior._id, payloadDigest, algorithm: 'SHA-256', createdAt: prior.createdAt }
    }
    const createdAt = Date.now(), sealId = await ctx.db.insert('scopeEComplianceSeals', { ownerKey, requestKey, missionKey, dossierKey, payloadDigest, algorithm: 'SHA-256', evidenceCount, riskCount, provenanceJson: provenance, createdAt })
    return { sealId, payloadDigest, algorithm: 'SHA-256', createdAt }
  },
})

export const generateComplianceExportBundle = action({
  args: { missionKey: v.string(), dossierKey: v.string(), manifest: v.string(), provenanceJson: v.string() },
  returns: v.object({ bundleJson: v.string(), bundleDigest: v.string(), fileName: v.string(), evidenceDigest: v.string() }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), missionKey = key(a.missionKey, 'Mission key'), dossierKey = key(a.dossierKey, 'Dossier key'), manifest = parseObject(text(a.manifest, 'Compliance manifest', 100000), 'Compliance manifest'), provenance = parseObject(text(a.provenanceJson, 'Provenance', 20000), 'Provenance')
    const seals = await ctx.runQuery(internal.scopeEFunctions._getComplianceExportContext, { missionKey, dossierKey })
    if (seals.ownerKey !== ownerKey) throw new ConvexError('Compliance export context is not available')
    const bundle = { schema: 'nexus-forge-compliance-bundle-v1', missionKey, dossierKey, manifest, provenance, seal: seals.seal, evidence: seals.evidence, generatedAt: Date.now(), limitations: ['Export generated by an authenticated operator.', 'This bundle is not a legal certification or proof of external system execution.'] }
    const bundleJson = JSON.stringify(bundle, null, 2), bundleDigest = await sha256(bundleJson)
    return { bundleJson, bundleDigest, fileName: 'nexus-forge-' + dossierKey.replace(/[^A-Za-z0-9._-]/g, '-') + '-compliance.json', evidenceDigest: seals.evidence.evidenceDigest }
  },
})

export const _getComplianceExportContext = internalQuery({
  args: { missionKey: v.string(), dossierKey: v.string() },
  returns: v.object({ ownerKey: v.string(), seal: v.object({ payloadDigest: v.string(), algorithm: v.string(), createdAt: v.number() }), evidence: v.object({ evidenceDigest: v.string(), verificationSeals: v.array(v.object({ dossierKey: v.string(), payloadDigest: v.string(), createdAt: v.number() })), auditReceipts: v.array(v.object({ receiptDigest: v.string(), diffDigest: v.string(), createdAt: v.number() })), auditLogs: v.array(v.object({ eventType: v.string(), source: v.string(), message: v.string(), createdAt: v.number(), metadata: v.optional(v.string()) })), verifiedOutcomes: v.array(v.object({ passed: v.boolean(), score: v.number(), summary: v.string(), createdAt: v.number() })), riskRegister: v.array(v.object({ incidentKey: v.string(), severity, state: v.string(), traceDigest: v.string() })) }) }),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), missionKey = key(a.missionKey, 'Mission key'), dossierKey = key(a.dossierKey, 'Dossier key'), mission = await ownedMission(ctx, ownerKey, missionKey)
    const seal = await ctx.db.query('scopeEComplianceSeals').withIndex('by_owner_dossier', q => q.eq('ownerKey', ownerKey).eq('dossierKey', dossierKey)).first()
    if (!seal || seal.missionKey !== missionKey) throw new ConvexError('A matching dossier seal is required before export')
    const receipts = await ctx.db.query('scopeEScrubberReceipts').withIndex('by_owner_mission', q => q.eq('ownerKey', ownerKey).eq('missionKey', missionKey)).take(200)
    const incidents = await ctx.db.query('scopeERepairTraces').withIndex('by_owner_updated', q => q.eq('ownerKey', ownerKey)).order('desc').take(200)
    const d35Incidents = await ctx.db.query('scopeD35RepairIncidents').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey)).take(200)
    const riskRegister = [
      ...incidents.filter(i => i.incidentKey.startsWith(missionKey + ':') || i.requestKey === missionKey).map(i => ({ incidentKey: i.incidentKey, severity: i.severity, state: i.sandboxStatus, traceDigest: i.traceDigest })),
      ...d35Incidents.filter(i => i.requestKey === missionKey || i.incidentKey.startsWith(missionKey + ':')).map(i => ({ incidentKey: i.incidentKey, severity: i.severity, state: i.state, traceDigest: i.traceDigest })),
    ]
    const auditRows = await ctx.db.query('auditEvents').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(200)
    const verificationRows = await ctx.db.query('verifications').withIndex('by_mission', q => q.eq('missionId', mission._id)).order('desc').take(100)
    const verificationSeals = [{ dossierKey: seal.dossierKey, payloadDigest: seal.payloadDigest, createdAt: seal.createdAt }], auditReceipts = receipts.map(r => ({ receiptDigest: r.receiptDigest, diffDigest: r.diffDigest, createdAt: r.createdAt }))
    const auditLogs = auditRows.map(row => ({ eventType: row.eventType, source: row.source, message: row.message, createdAt: row.createdAt, metadata: row.metadata }))
    const verifiedOutcomes = verificationRows.map(row => ({ passed: row.passed, score: row.score, summary: row.summary, createdAt: row.createdAt }))
    const evidenceDigest = await sha256(JSON.stringify({ missionKey, verificationSeals, auditReceipts, auditLogs, verifiedOutcomes, riskRegister }))
    return { ownerKey, seal: { payloadDigest: seal.payloadDigest, algorithm: seal.algorithm, createdAt: seal.createdAt }, evidence: { evidenceDigest, verificationSeals, auditReceipts, auditLogs, verifiedOutcomes, riskRegister } }
  },
})
