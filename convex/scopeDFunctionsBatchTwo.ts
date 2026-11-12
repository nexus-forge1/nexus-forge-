import { action, mutation, query } from './_generated/server'
import { ConvexError, v } from 'convex/values'
import { requireOperator } from './permissions'
import { bounded, digest, secrets } from './studioModel'

const strings = v.array(v.string())
const fileSpec = v.object({ path: v.string(), content: v.string(), language: v.string() })
const dependency = v.object({ key: v.string(), dependsOn: strings })
const patchFile = v.object({ path: v.string(), beforeDigest: v.string(), afterDigest: v.string() })
function txt(value: string, label: string, max = 2000): string {
  const result = bounded(value, label, max).trim()
  if (!result) throw new ConvexError(label + ' is required')
  secrets(result)
  return result
}
function key(value: string, label = 'Key'): string {
  const result = txt(value, label, 160)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(result)) throw new ConvexError(label + ' has unsupported characters')
  return result
}
function finite(value: number, label: string, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new ConvexError(label + ' must be between ' + min + ' and ' + max)
  return value
}
function int(value: number, label: string, min = 0, max = 1000000): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConvexError(label + ' must be a bounded integer')
  return value
}
function list(values: string[], label: string, max = 100): string[] {
  if (values.length > max) throw new ConvexError(label + ' exceeds ' + max + ' entries')
  const result = values.map((x, i) => txt(x, label + ' #' + (i + 1), 500))
  if (new Set(result).size !== result.length) throw new ConvexError(label + ' must not contain duplicates')
  return result
}
function requireEvidence(values: string[], label = 'Evidence'): string[] {
  const result = list(values, label, 50)
  if (!result.length) throw new ConvexError(label + ' requires at least one item')
  return result
}
function safePath(path: string): string {
  const result = txt(path, 'File path', 300)
  if (result.startsWith('/') || result.split('/').some(part => part === '..' || part === '.')) throw new ConvexError('File paths must be relative and traversal-free')
  if (!/^[A-Za-z0-9_.@/-]+$/.test(result)) throw new ConvexError('File path contains unsupported characters')
  return result
}
function topologicalOrder(nodes: Array<{ key: string; dependsOn: string[] }>): string[] {
  if (nodes.length > 300) throw new ConvexError('At most 300 dependency nodes are allowed')
  const byKey = new Map<string, string[]>()
  for (const node of nodes) {
    const k = key(node.key, 'Dependency key')
    if (byKey.has(k)) throw new ConvexError('Dependency keys must be unique')
    byKey.set(k, list(node.dependsOn, 'Dependencies', 100))
  }
  for (const [k, deps] of byKey) for (const dep of deps) if (!byKey.has(dep)) throw new ConvexError('Unknown dependency ' + dep + ' referenced by ' + k)
  const temporary = new Set<string>(), permanent = new Set<string>(), order: string[] = []
  const visit = (k: string) => {
    if (permanent.has(k)) return
    if (temporary.has(k)) throw new ConvexError('Dependency cycle detected at ' + k)
    temporary.add(k)
    for (const dep of byKey.get(k) ?? []) visit(dep)
    temporary.delete(k); permanent.add(k); order.push(k)
  }
  for (const k of byKey.keys()) visit(k)
  return order
}

/* D19 — Full-stack feature builder */
export const compileFeatureScaffold = action({
  args: { featureKey: v.string(), dependencies: strings, files: v.array(fileSpec), language: v.string() },
  returns: v.object({ featureKey: v.string(), files: v.array(fileSpec), dependencyCount: v.number(), artifactDigest: v.string(), warnings: strings }),
  handler: async (_ctx, a) => {
    const featureKey = key(a.featureKey, 'Feature key'), dependencies = list(a.dependencies, 'Feature dependencies', 100), language = txt(a.language, 'Language', 80)
    if (!a.files.length || a.files.length > 100) throw new ConvexError('Scaffold must contain 1–100 files')
    const paths = new Set<string>()
    const files = a.files.map(f => { const path = safePath(f.path); if (paths.has(path)) throw new ConvexError('Duplicate scaffold path: ' + path); paths.add(path); return { path, content: txt(f.content, 'Scaffold content', 20000), language: txt(f.language || language, 'File language', 80) } })
    return { featureKey, files, dependencyCount: dependencies.length, artifactDigest: await digest(JSON.stringify({ featureKey, dependencies, files })), warnings: ['Scaffold output is generated for review; no files are written to a repository by this action.'] }
  },
})
export const validateFeatureDependencyMap = query({
  args: { nodes: v.array(dependency) },
  returns: v.object({ valid: v.boolean(), order: strings, nodeCount: v.number(), error: v.union(v.string(), v.null()) }),
  handler: async (_ctx, a) => { try { const order = topologicalOrder(a.nodes); return { valid: true, order, nodeCount: a.nodes.length, error: null } } catch (error) { return { valid: false, order: [], nodeCount: a.nodes.length, error: error instanceof Error ? error.message : 'Dependency validation failed' } } },
})
export const handoffFeatureArtifact = mutation({
  args: { requestKey: v.string(), featureKey: v.string(), artifactKey: v.string(), dependencies: strings, files: v.array(fileSpec), handoffState: v.union(v.literal('draft'), v.literal('ready'), v.literal('accepted'), v.literal('blocked')) },
  returns: v.id('scopeD19FeatureArtifacts'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), featureKey = key(a.featureKey, 'Feature key'), artifactKey = key(a.artifactKey, 'Artifact key')
    const dependencies = list(a.dependencies, 'Dependencies', 100)
    if (a.files.length > 100) throw new ConvexError('At most 100 artifact files are allowed')
    const paths = new Set<string>(), files = a.files.map(f => { const path = safePath(f.path); if (paths.has(path)) throw new ConvexError('Duplicate artifact path'); paths.add(path); return { path, content: txt(f.content, 'Artifact content', 20000), language: txt(f.language, 'Language', 80) } })
    const artifactDigest = await digest(JSON.stringify({ featureKey, dependencies, files }))
    const old = await ctx.db.query('scopeD19FeatureArtifacts').withIndex('by_owner_artifact', q => q.eq('ownerKey', ownerKey).eq('artifactKey', artifactKey)).first()
    if (old) { if (old.artifactDigest !== artifactDigest) throw new ConvexError('Artifact key is immutable for different content'); await ctx.db.patch(old._id, { handoffState: a.handoffState, updatedAt: Date.now() }); return old._id }
    return ctx.db.insert('scopeD19FeatureArtifacts', { ownerKey, requestKey, featureKey, artifactKey, dependencies, files, handoffState: a.handoffState, artifactDigest, createdAt: Date.now(), updatedAt: Date.now() })
  },
})

/* D20 — Visual builder with code sync */
export const diffVisualStateToAst = query({
  args: { state: strings, ast: strings },
  returns: v.object({ equal: v.boolean(), additions: strings, removals: strings, stateDigest: v.string(), astDigest: v.string() }),
  handler: async (_ctx, a) => {
    const state = list(a.state, 'Visual state paths', 500), ast = list(a.ast, 'AST paths', 500)
    return { equal: JSON.stringify([...state].sort()) === JSON.stringify([...ast].sort()), additions: ast.filter(x => !state.includes(x)), removals: state.filter(x => !ast.includes(x)), stateDigest: await digest(JSON.stringify([...state].sort())), astDigest: await digest(JSON.stringify([...ast].sort())) }
  },
})
export const syncVisualCodeRevision = mutation({
  args: { requestKey: v.string(), projectKey: v.string(), revision: v.number(), stateDigest: v.string(), astDigest: v.string(), diff: v.array(v.object({ path: v.string(), kind: v.union(v.literal('add'), v.literal('remove'), v.literal('change')), summary: v.string() })) },
  returns: v.id('scopeD20VisualSync'),
  handler: async (ctx, a) => {
    const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), projectKey = key(a.projectKey, 'Project key'), revision = int(a.revision, 'Revision', 1)
    if (a.diff.length > 500) throw new ConvexError('Diff exceeds 500 entries')
    const diff = a.diff.map(d => ({ path: safePath(d.path), kind: d.kind, summary: txt(d.summary, 'Diff summary', 1000) }))
    const status = a.stateDigest === a.astDigest ? 'synced' as const : 'conflict' as const
    const old = await ctx.db.query('scopeD20VisualSync').withIndex('by_owner_project', q => q.eq('ownerKey', ownerKey).eq('projectKey', projectKey)).first()
    if (old && revision <= old.revision) throw new ConvexError('Revision must be greater than the last recorded revision')
    return ctx.db.insert('scopeD20VisualSync', { ownerKey, requestKey, projectKey, revision, stateDigest: key(a.stateDigest, 'State digest'), astDigest: key(a.astDigest, 'AST digest'), diff, status, createdAt: Date.now() })
  },
})
export const generateCleanCodeExport = action({
  args: { files: v.array(fileSpec), excludePatterns: strings },
  returns: v.object({ files: v.array(fileSpec), fileCount: v.number(), exportDigest: v.string(), excluded: strings }),
  handler: async (_ctx, a) => {
    const excludes = list(a.excludePatterns, 'Exclude patterns', 100)
    if (a.files.length > 500) throw new ConvexError('Export exceeds 500 files')
    const files = a.files.filter(f => !excludes.some(pattern => f.path.includes(pattern))).map(f => ({ path: safePath(f.path), content: txt(f.content, 'Export content', 20000), language: txt(f.language, 'Language', 80) }))
    if (new Set(files.map(f => f.path)).size !== files.length) throw new ConvexError('Export contains duplicate file paths')
    return { files, fileCount: files.length, exportDigest: await digest(JSON.stringify(files)), excluded: a.files.filter(f => excludes.some(pattern => f.path.includes(pattern))).map(f => f.path) }
  },
})

/* D21 — Database and migration studio */
export const evaluateSchemaDiff = query({
  args: { current: v.array(v.object({ key: v.string(), type: v.string(), nullable: v.boolean() })), target: v.array(v.object({ key: v.string(), type: v.string(), nullable: v.boolean() })) },
  returns: v.object({ additions: strings, removals: strings, alterations: strings, destructive: v.boolean() }),
  handler: async (_ctx, a) => {
    const map = (rows: typeof a.current) => { if (rows.length > 500) throw new ConvexError('Schema exceeds 500 fields'); const m = new Map<string, { type: string; nullable: boolean }>(); for (const r of rows) { const k = key(r.key, 'Schema field'); if (m.has(k)) throw new ConvexError('Duplicate schema field ' + k); m.set(k, { type: txt(r.type, 'Field type', 100), nullable: r.nullable }) } return m }
    const current = map(a.current), target = map(a.target), additions = [...target.keys()].filter(k => !current.has(k)), removals = [...current.keys()].filter(k => !target.has(k)), alterations = [...target.keys()].filter(k => current.has(k) && JSON.stringify(current.get(k)) !== JSON.stringify(target.get(k)))
    return { additions, removals, alterations, destructive: removals.length > 0 || alterations.some(k => current.get(k)?.nullable && !target.get(k)?.nullable) }
  },
})
export const dryRunMigration = action({
  args: { planKey: v.string(), changes: v.array(v.object({ objectKey: v.string(), kind: v.union(v.literal('add'), v.literal('remove'), v.literal('alter')), destructive: v.boolean() })), allowDestructive: v.boolean() },
  returns: v.object({ planKey: v.string(), accepted: v.boolean(), applied: v.literal(false), changeCount: v.number(), blockers: strings, dryRunDigest: v.string() }),
  handler: async (_ctx, a) => { const planKey = key(a.planKey, 'Plan key'); if (a.changes.length > 500) throw new ConvexError('Migration has too many changes'); const changes = a.changes.map(c => ({ objectKey: key(c.objectKey, 'Object key'), kind: c.kind, destructive: c.destructive })); const blockers = changes.filter(c => c.destructive && !a.allowDestructive).map(c => 'Destructive change blocked: ' + c.objectKey); return { planKey, accepted: blockers.length === 0, applied: false as const, changeCount: changes.length, blockers, dryRunDigest: await digest(JSON.stringify(changes)) } },
})
export const signOffMigrationPlan = mutation({
  args: { requestKey: v.string(), planKey: v.string(), schemaDigest: v.string(), targetDigest: v.string(), changes: v.array(v.object({ objectKey: v.string(), kind: v.union(v.literal('add'), v.literal('remove'), v.literal('alter')), destructive: v.boolean() })), dryRunDigest: v.string(), decision: v.union(v.literal('approved'), v.literal('rejected')), approverKey: v.string() },
  returns: v.id('scopeD21MigrationPlans'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), planKey = key(a.planKey, 'Plan key'), approverKey = key(a.approverKey, 'Approver key'); if (a.changes.length > 500) throw new ConvexError('Migration has too many changes'); const changes = a.changes.map(c => ({ objectKey: key(c.objectKey, 'Object key'), kind: c.kind, destructive: c.destructive })); if (a.decision === 'approved' && changes.some(c => c.destructive)) throw new ConvexError('Destructive migration requires a separate guarded release approval'); const old = await ctx.db.query('scopeD21MigrationPlans').withIndex('by_owner_plan', q => q.eq('ownerKey', ownerKey).eq('planKey', planKey)).first(); const values = { requestKey, schemaDigest: key(a.schemaDigest, 'Schema digest'), targetDigest: key(a.targetDigest, 'Target digest'), changes, dryRunDigest: key(a.dryRunDigest, 'Dry-run digest'), signoff: a.decision, approverKey, updatedAt: Date.now() }; if (old) { await ctx.db.patch(old._id, values); return old._id } return ctx.db.insert('scopeD21MigrationPlans', { ownerKey, planKey, ...values, createdAt: Date.now() }) },
})

/* D22 — Real browser QA and repair */
export const ingestBrowserQAScenario = mutation({
  args: { requestKey: v.string(), scenarioKey: v.string(), route: v.string(), steps: strings, baselineDigest: v.string() },
  returns: v.id('scopeD22BrowserQAScenarios'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), scenarioKey = key(a.scenarioKey, 'Scenario key'), route = txt(a.route, 'Route', 500); if (!route.startsWith('/') || route.startsWith('//')) throw new ConvexError('Scenario route must be a local absolute path'); const steps = list(a.steps, 'Replay steps', 100); if (!steps.length) throw new ConvexError('At least one replay step is required'); const old = await ctx.db.query('scopeD22BrowserQAScenarios').withIndex('by_owner_scenario', q => q.eq('ownerKey', ownerKey).eq('scenarioKey', scenarioKey)).first(); const values = { requestKey, route, steps, baselineDigest: key(a.baselineDigest, 'Baseline digest'), observedDigest: '', regressionScore: 0, remediation: '', status: 'queued' as const, updatedAt: Date.now() }; if (old) { await ctx.db.patch(old._id, values); return old._id } return ctx.db.insert('scopeD22BrowserQAScenarios', { ownerKey, scenarioKey, ...values, createdAt: Date.now() }) },
})
export const calculateVisualRegressionScore = query({
  args: { baselinePixels: v.number(), changedPixels: v.number(), threshold: v.number() },
  returns: v.object({ score: v.number(), withinThreshold: v.boolean(), changedPixels: v.number(), baselinePixels: v.number() }),
  handler: async (_ctx, a) => { const base = int(a.baselinePixels, 'Baseline pixels', 1, 1_000_000_000), changed = int(a.changedPixels, 'Changed pixels', 0, 1_000_000_000), threshold = finite(a.threshold, 'Regression threshold', 0, 1); const score = Math.min(1, changed / base); return { score, withinThreshold: score <= threshold, changedPixels: changed, baselinePixels: base } },
})
export const recordBrowserRemediationProposal = mutation({
  args: { scenarioKey: v.string(), observedDigest: v.string(), regressionScore: v.number(), remediation: v.string() },
  returns: v.object({ scenarioKey: v.string(), status: v.union(v.literal('replayed'), v.literal('needs_repair')), updatedAt: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), scenarioKey = key(a.scenarioKey, 'Scenario key'), observedDigest = key(a.observedDigest, 'Observed digest'), score = finite(a.regressionScore, 'Regression score', 0, 1), remediation = txt(a.remediation, 'Remediation proposal', 3000); const row = await ctx.db.query('scopeD22BrowserQAScenarios').withIndex('by_owner_scenario', q => q.eq('ownerKey', ownerKey).eq('scenarioKey', scenarioKey)).first(); if (!row) throw new ConvexError('QA scenario not found'); const status = score > 0 ? 'needs_repair' as const : 'replayed' as const, updatedAt = Date.now(); await ctx.db.patch(row._id, { observedDigest, regressionScore: score, remediation, status, updatedAt }); return { scenarioKey, status, updatedAt } },
})

/* D23 — Integration contract builder */
export const validateOpenApiContract = query({
  args: { endpoints: v.array(v.object({ method: v.string(), path: v.string(), operationId: v.string() })) },
  returns: v.object({ valid: v.boolean(), errors: strings, endpointCount: v.number() }),
  handler: async (_ctx, a) => { const errors: string[] = [], ids = new Set<string>(), routes = new Set<string>(); if (!a.endpoints.length || a.endpoints.length > 300) errors.push('Contract must contain 1–300 endpoints'); for (const e of a.endpoints) { const method = e.method.toUpperCase(), path = e.path.trim(), id = e.operationId.trim(); if (!['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(method)) errors.push('Unsupported HTTP method: ' + e.method); if (!path.startsWith('/') || path.includes('..')) errors.push('Invalid endpoint path: ' + path); if (!id) errors.push('Operation ID is required'); if (ids.has(id)) errors.push('Duplicate operation ID: ' + id); ids.add(id); const route = method + ' ' + path; if (routes.has(route)) errors.push('Duplicate endpoint: ' + route); routes.add(route) } return { valid: errors.length === 0, errors, endpointCount: a.endpoints.length } },
})
export const generateContractMockPayload = action({
  args: { fields: v.array(v.object({ key: v.string(), type: v.union(v.literal('string'), v.literal('number'), v.literal('boolean'), v.literal('array'), v.literal('object')), required: v.boolean() })) },
  returns: v.object({ payload: v.string(), fieldCount: v.number(), generatedDigest: v.string() }),
  handler: async (_ctx, a) => { if (a.fields.length > 200) throw new ConvexError('Mock schema exceeds 200 fields'); const seen = new Set<string>(), payload: Record<string, unknown> = {}; for (const f of a.fields) { const k = key(f.key, 'Payload field'); if (seen.has(k)) throw new ConvexError('Duplicate mock field ' + k); seen.add(k); if (f.required) payload[k] = f.type === 'string' ? 'example' : f.type === 'number' ? 1 : f.type === 'boolean' ? true : f.type === 'array' ? [] : {} } const serialized = JSON.stringify(payload, null, 2); return { payload: serialized, fieldCount: Object.keys(payload).length, generatedDigest: await digest(serialized) } },
})
export const persistIntegrationContract = mutation({
  args: { requestKey: v.string(), contractKey: v.string(), version: v.string(), schema: v.string(), endpoints: v.array(v.object({ method: v.string(), path: v.string(), operationId: v.string() })), status: v.union(v.literal('draft'), v.literal('validated'), v.literal('approved')) },
  returns: v.id('scopeD23IntegrationContracts'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), contractKey = key(a.contractKey, 'Contract key'), version = key(a.version, 'Version'); if (a.schema.length > 100000) throw new ConvexError('Contract schema exceeds 100 KB'); const schema = txt(a.schema, 'Contract schema', 100000); let parsed: unknown; try { parsed = JSON.parse(schema) } catch { throw new ConvexError('Contract schema must be valid JSON') } if (!parsed || typeof parsed !== 'object') throw new ConvexError('Contract schema must be a JSON object'); if (a.endpoints.length > 300) throw new ConvexError('Contract has too many endpoints'); const endpoints = a.endpoints.map(e => ({ method: key(e.method.toUpperCase(), 'HTTP method'), path: txt(e.path, 'Endpoint path', 500), operationId: key(e.operationId, 'Operation ID') })); if (new Set(endpoints.map(e => e.operationId)).size !== endpoints.length) throw new ConvexError('Operation IDs must be unique'); const schemaDigest = await digest(JSON.stringify({ version, schema: parsed, endpoints })); const old = await ctx.db.query('scopeD23IntegrationContracts').withIndex('by_owner_contract', q => q.eq('ownerKey', ownerKey).eq('contractKey', contractKey)).first(); if (old) { await ctx.db.patch(old._id, { requestKey, version, schemaDigest, endpoints, status: a.status, updatedAt: Date.now() }); return old._id } return ctx.db.insert('scopeD23IntegrationContracts', { ownerKey, requestKey, contractKey, version, schemaDigest, endpoints, status: a.status, createdAt: Date.now(), updatedAt: Date.now() }) },
})

/* D24 — Demand validation */
export const logInterviewSignal = mutation({
  args: { requestKey: v.string(), studyKey: v.string(), signalKey: v.string(), channel: v.string(), sentiment: v.union(v.literal('positive'), v.literal('neutral'), v.literal('negative')), intentScore: v.number(), funnelStage: v.union(v.literal('visit'), v.literal('signup'), v.literal('activation'), v.literal('paid'), v.literal('retained')), notes: v.string() },
  returns: v.id('scopeD24DemandSignals'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), studyKey = key(a.studyKey, 'Study key'), signalKey = key(a.signalKey, 'Signal key'); const intentScore = finite(a.intentScore, 'Intent score', 0, 100), channel = txt(a.channel, 'Channel', 100), notes = txt(a.notes, 'Interview notes', 3000); const old = await ctx.db.query('scopeD24DemandSignals').withIndex('by_owner_signal', q => q.eq('ownerKey', ownerKey).eq('signalKey', signalKey)).first(); if (old) throw new ConvexError('Signal key already exists'); return ctx.db.insert('scopeD24DemandSignals', { ownerKey, requestKey, studyKey, signalKey, channel, sentiment: a.sentiment, intentScore, funnelStage: a.funnelStage, notes, createdAt: Date.now() }) },
})
export const aggregateConversionFunnel = query({
  args: { studyKey: v.string() },
  returns: v.object({ studyKey: v.string(), stages: v.array(v.object({ stage: v.string(), count: v.number(), conversionFromPrior: v.union(v.number(), v.null()) })), totalSignals: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), studyKey = key(a.studyKey, 'Study key'), rows = await ctx.db.query('scopeD24DemandSignals').withIndex('by_owner_study', q => q.eq('ownerKey', ownerKey).eq('studyKey', studyKey)).take(1000), names = ['visit','signup','activation','paid','retained'], counts = names.map(stage => rows.filter(r => r.funnelStage === stage).length); return { studyKey, stages: names.map((stage, i) => ({ stage, count: counts[i], conversionFromPrior: i === 0 ? null : counts[i - 1] === 0 ? null : counts[i] / counts[i - 1] })), totalSignals: rows.length } },
})
export const recordDemandValidationVerdict = mutation({
  args: { studyKey: v.string(), verdict: v.union(v.literal('validated'), v.literal('inconclusive'), v.literal('invalidated')), rationale: v.string() },
  returns: v.object({ studyKey: v.string(), verdict: v.union(v.literal('validated'), v.literal('inconclusive'), v.literal('invalidated')), updatedCount: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), studyKey = key(a.studyKey, 'Study key'); txt(a.rationale, 'Verdict rationale', 2000); const rows = await ctx.db.query('scopeD24DemandSignals').withIndex('by_owner_study', q => q.eq('ownerKey', ownerKey).eq('studyKey', studyKey)).take(1000); if (!rows.length) throw new ConvexError('Cannot record a verdict without demand signals'); for (const row of rows) await ctx.db.patch(row._id, { verdict: a.verdict }); return { studyKey, verdict: a.verdict, updatedCount: rows.length } },
})

/* D25 — Monetization studio */
export const validatePricingEntitlements = query({
  args: { requested: strings, granted: strings },
  returns: v.object({ valid: v.boolean(), missing: strings, unexpected: strings }),
  handler: async (_ctx, a) => { const requested = list(a.requested, 'Requested entitlements', 200), granted = list(a.granted, 'Granted entitlements', 200), missing = requested.filter(x => !granted.includes(x)), unexpected = granted.filter(x => !requested.includes(x)); return { valid: missing.length === 0, missing, unexpected } },
})
export const updatePlanCatalog = mutation({
  args: { requestKey: v.string(), catalogKey: v.string(), tiers: v.array(v.object({ key: v.string(), priceCents: v.number(), entitlements: strings, active: v.boolean() })) },
  returns: v.id('scopeD25MonetizationPlans'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), catalogKey = key(a.catalogKey, 'Catalog key'); if (!a.tiers.length || a.tiers.length > 50) throw new ConvexError('Catalog must contain 1–50 tiers'); const seen = new Set<string>(), tiers = a.tiers.map(t => { const k = key(t.key, 'Tier key'); if (seen.has(k)) throw new ConvexError('Tier keys must be unique'); seen.add(k); return { key: k, priceCents: int(t.priceCents, 'Price in cents', 0, 100000000), entitlements: list(t.entitlements, 'Entitlements', 200), active: t.active } }); const catalogDigest = await digest(JSON.stringify(tiers)); const old = await ctx.db.query('scopeD25MonetizationPlans').withIndex('by_owner_catalog', q => q.eq('ownerKey', ownerKey).eq('catalogKey', catalogKey)).first(); if (old) { await ctx.db.patch(old._id, { requestKey, tiers, catalogDigest, updatedAt: Date.now() }); return old._id } return ctx.db.insert('scopeD25MonetizationPlans', { ownerKey, requestKey, catalogKey, tiers, catalogDigest, createdAt: Date.now(), updatedAt: Date.now() }) },
})
export const calculateRevenueProjection = query({
  args: { customers: v.number(), monthlyPrice: v.number(), conversionRate: v.number(), churnRate: v.number(), months: v.number() },
  returns: v.object({ monthlyRevenue: v.number(), projectedRevenue: v.number(), expectedCustomersAtEnd: v.number() }),
  handler: async (_ctx, a) => { const customers = int(a.customers, 'Customers', 0, 100000000), price = finite(a.monthlyPrice, 'Monthly price', 0, 100000000), conversion = finite(a.conversionRate, 'Conversion rate', 0, 1), churn = finite(a.churnRate, 'Churn rate', 0, 1), months = int(a.months, 'Projection months', 1, 120); const starting = customers * conversion; let total = 0, current = starting; for (let i = 0; i < months; i++) { total += current * price; current *= 1 - churn } return { monthlyRevenue: starting * price, projectedRevenue: total, expectedCustomersAtEnd: current } },
})

/* D26 — Unit economics simulator */
export const calculateCacLtvSensitivity = query({
  args: { cac: v.number(), monthlyRevenue: v.number(), grossMargin: v.number(), monthlyChurn: v.number(), cacMultipliers: v.array(v.number()), churnDeltas: v.array(v.number()) },
  returns: v.object({ scenarios: v.array(v.object({ cac: v.number(), churn: v.number(), ltv: v.number(), ltvCacRatio: v.number() })) }),
  handler: async (_ctx, a) => { const cac = finite(a.cac, 'CAC', 0.01, 100000000), revenue = finite(a.monthlyRevenue, 'Monthly revenue', 0, 100000000), margin = finite(a.grossMargin, 'Gross margin', 0, 1), churn = finite(a.monthlyChurn, 'Monthly churn', 0.0001, 1); if (a.cacMultipliers.length > 20 || a.churnDeltas.length > 20) throw new ConvexError('Sensitivity axes are limited to 20 values each'); const scenarios = a.cacMultipliers.flatMap(m => a.churnDeltas.map(d => { const adjustedCac = cac * finite(m, 'CAC multiplier', 0.1, 10), adjustedChurn = Math.max(0.0001, Math.min(1, churn + finite(d, 'Churn delta', -0.5, 0.5))), ltv = revenue * margin / adjustedChurn; return { cac: adjustedCac, churn: adjustedChurn, ltv, ltvCacRatio: ltv / adjustedCac } })); if (scenarios.length > 100) throw new ConvexError('Sensitivity grid exceeds 100 scenarios'); return { scenarios } },
})
export const resolveCustomerPaybackPeriod = query({
  args: { cac: v.number(), monthlyRevenue: v.number(), grossMargin: v.number() },
  returns: v.object({ months: v.union(v.number(), v.null()), recoverable: v.boolean() }),
  handler: async (_ctx, a) => { const cac = finite(a.cac, 'CAC', 0, 100000000), revenue = finite(a.monthlyRevenue, 'Monthly revenue', 0, 100000000), margin = finite(a.grossMargin, 'Gross margin', 0, 1), contribution = revenue * margin; return { months: contribution > 0 ? cac / contribution : null, recoverable: contribution > 0 } },
})
export const modelGrossMarginCurve = query({
  args: { volumes: v.array(v.number()), fixedCost: v.number(), variableCostPerUnit: v.number(), pricePerUnit: v.number() },
  returns: v.object({ points: v.array(v.object({ volume: v.number(), revenue: v.number(), cost: v.number(), margin: v.number(), marginRate: v.number() })) }),
  handler: async (_ctx, a) => { const fixed = finite(a.fixedCost, 'Fixed cost', 0, 1e12), variable = finite(a.variableCostPerUnit, 'Variable cost', 0, 1e9), price = finite(a.pricePerUnit, 'Unit price', 0, 1e9); if (a.volumes.length > 100) throw new ConvexError('At most 100 curve points are allowed'); return { points: a.volumes.map(vv => { const volume = int(vv, 'Volume', 0, 1e9), revenue = volume * price, cost = fixed + volume * variable, margin = revenue - cost; return { volume, revenue, cost, margin, marginRate: revenue > 0 ? margin / revenue : 0 } }) } },
})

/* D27 — Customer operations builder */
export const configureSupportTriageRules = mutation({
  args: { requestKey: v.string(), queueKey: v.string(), rules: v.array(v.object({ key: v.string(), priority: v.number(), maxMinutes: v.number(), escalationTarget: v.string() })) },
  returns: v.id('scopeD27SupportOperations'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), queueKey = key(a.queueKey, 'Queue key'); if (a.rules.length > 100) throw new ConvexError('At most 100 triage rules are allowed'); const seen = new Set<string>(), rules = a.rules.map(r => { const k = key(r.key, 'Rule key'); if (seen.has(k)) throw new ConvexError('Triage rule keys must be unique'); seen.add(k); return { key: k, priority: int(r.priority, 'Priority', 0, 1000), maxMinutes: int(r.maxMinutes, 'Maximum minutes', 1, 525600), escalationTarget: key(r.escalationTarget, 'Escalation target') } }).sort((a,b) => b.priority-a.priority); const old = await ctx.db.query('scopeD27SupportOperations').withIndex('by_owner_queue', q => q.eq('ownerKey', ownerKey).eq('queueKey', queueKey)).first(); if (old) { await ctx.db.patch(old._id, { requestKey, rules, updatedAt: Date.now() }); return old._id } return ctx.db.insert('scopeD27SupportOperations', { ownerKey, requestKey, queueKey, rules, updatedAt: Date.now() }) },
})
export const detectSupportSlaBreach = query({
  args: { queueKey: v.string(), elapsedMinutes: v.number(), priority: v.number() },
  returns: v.object({ breached: v.boolean(), matchedRule: v.union(v.string(), v.null()), escalationTarget: v.union(v.string(), v.null()), deadlineMinutes: v.union(v.number(), v.null()) }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), queueKey = key(a.queueKey, 'Queue key'), elapsed = int(a.elapsedMinutes, 'Elapsed minutes', 0, 525600), priority = int(a.priority, 'Priority', 0, 1000), row = await ctx.db.query('scopeD27SupportOperations').withIndex('by_owner_queue', q => q.eq('ownerKey', ownerKey).eq('queueKey', queueKey)).first(); if (!row) throw new ConvexError('Support queue policy not found'); const rule = row.rules.find(r => priority >= r.priority); const breached = !!rule && elapsed > rule.maxMinutes; return { breached, matchedRule: rule?.key ?? null, escalationTarget: breached ? rule?.escalationTarget ?? null : null, deadlineMinutes: rule?.maxMinutes ?? null } },
})
export const recordEscalationDispatch = mutation({
  args: { queueKey: v.string(), incidentKey: v.string(), dispatchKey: v.string(), breached: v.boolean() },
  returns: v.object({ queueKey: v.string(), dispatchKey: v.string(), recorded: v.boolean() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), queueKey = key(a.queueKey, 'Queue key'), incidentKey = key(a.incidentKey, 'Incident key'), dispatchKey = key(a.dispatchKey, 'Dispatch key'), row = await ctx.db.query('scopeD27SupportOperations').withIndex('by_owner_queue', q => q.eq('ownerKey', ownerKey).eq('queueKey', queueKey)).first(); if (!row) throw new ConvexError('Support queue not found'); if (!a.breached) throw new ConvexError('Escalation dispatch requires a confirmed SLA breach'); await ctx.db.patch(row._id, { incidentKey, breach: true, dispatchKey, updatedAt: Date.now() }); return { queueKey, dispatchKey, recorded: true } },
})

/* D28 — Governed launch and growth studio */
export const gateLaunchStage = mutation({
  args: { requestKey: v.string(), launchKey: v.string(), stage: v.union(v.literal('alpha'), v.literal('beta'), v.literal('ga')), checklist: v.array(v.object({ key: v.string(), complete: v.boolean(), evidence: strings })) },
  returns: v.object({ launchKey: v.string(), stage: v.union(v.literal('alpha'), v.literal('beta'), v.literal('ga')), ready: v.boolean(), blockers: strings }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), launchKey = key(a.launchKey, 'Launch key'); if (a.checklist.length > 100) throw new ConvexError('Checklist exceeds 100 items'); const seen = new Set<string>(), checklist = a.checklist.map(c => { const k = key(c.key, 'Checklist key'); if (seen.has(k)) throw new ConvexError('Checklist keys must be unique'); seen.add(k); const evidence = list(c.evidence, 'Checklist evidence', 30); if (c.complete && !evidence.length) throw new ConvexError('Completed checklist items require evidence'); return { key: k, complete: c.complete, evidence } }); const blockers = checklist.filter(c => !c.complete).map(c => c.key); const old = await ctx.db.query('scopeD28LaunchGates').withIndex('by_owner_launch', q => q.eq('ownerKey', ownerKey).eq('launchKey', launchKey)).first(); const fields = { requestKey, stage: a.stage, checklist, signoff: blockers.length ? 'pending' as const : 'pending' as const, updatedAt: Date.now() }; if (old) await ctx.db.patch(old._id, fields); else await ctx.db.insert('scopeD28LaunchGates', { ownerKey, launchKey, ...fields, conversionCount: 0, visitorCount: 0 }); return { launchKey, stage: a.stage, ready: blockers.length === 0, blockers } },
})
export const aggregateLaunchExperimentConversion = query({
  args: { launchKey: v.string() },
  returns: v.object({ launchKey: v.string(), visitors: v.number(), conversions: v.number(), conversionRate: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), launchKey = key(a.launchKey, 'Launch key'), row = await ctx.db.query('scopeD28LaunchGates').withIndex('by_owner_launch', q => q.eq('ownerKey', ownerKey).eq('launchKey', launchKey)).first(); if (!row) throw new ConvexError('Launch gate not found'); return { launchKey, visitors: row.visitorCount, conversions: row.conversionCount, conversionRate: row.visitorCount ? row.conversionCount / row.visitorCount : 0 } },
})
export const recordLaunchPhaseSignoff = mutation({
  args: { launchKey: v.string(), decision: v.union(v.literal('approved'), v.literal('rejected')), approverKey: v.string(), visitors: v.number(), conversions: v.number() },
  returns: v.object({ launchKey: v.string(), signoff: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')), updatedAt: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), launchKey = key(a.launchKey, 'Launch key'), approverKey = key(a.approverKey, 'Approver key'), visitors = int(a.visitors, 'Visitors', 0, 1e9), conversions = int(a.conversions, 'Conversions', 0, 1e9); if (conversions > visitors) throw new ConvexError('Conversions cannot exceed visitors'); const row = await ctx.db.query('scopeD28LaunchGates').withIndex('by_owner_launch', q => q.eq('ownerKey', ownerKey).eq('launchKey', launchKey)).first(); if (!row) throw new ConvexError('Launch gate not found'); if (a.decision === 'approved' && row.checklist.some(c => !c.complete || !c.evidence.length)) throw new ConvexError('Launch checklist gate is not satisfied'); const updatedAt = Date.now(); await ctx.db.patch(row._id, { signoff: a.decision, approverKey, visitorCount: visitors, conversionCount: conversions, updatedAt }); return { launchKey, signoff: a.decision, updatedAt } },
})

/* D29 — Business readiness dossier */
export const verifyComplianceChecklist = query({
  args: { checklist: v.array(v.object({ key: v.string(), required: v.boolean(), complete: v.boolean(), evidence: strings })) },
  returns: v.object({ ready: v.boolean(), missing: strings, evidenceGaps: strings }),
  handler: async (_ctx, a) => { if (a.checklist.length > 200) throw new ConvexError('Compliance checklist exceeds 200 items'); const missing: string[] = [], evidenceGaps: string[] = [], seen = new Set<string>(); for (const item of a.checklist) { const k = key(item.key, 'Compliance item'); if (seen.has(k)) throw new ConvexError('Compliance checklist keys must be unique'); seen.add(k); if (item.required && !item.complete) missing.push(k); if (item.required && item.complete && !item.evidence.length) evidenceGaps.push(k) } return { ready: missing.length === 0 && evidenceGaps.length === 0, missing, evidenceGaps } },
})
export const recordOperationalRisk = mutation({
  args: { requestKey: v.string(), dossierKey: v.string(), checklist: v.array(v.object({ key: v.string(), required: v.boolean(), complete: v.boolean(), evidence: strings })), risk: v.object({ key: v.string(), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), mitigation: v.string(), owner: v.string() }) },
  returns: v.id('scopeD29ReadinessDossiers'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), dossierKey = key(a.dossierKey, 'Dossier key'); if (a.checklist.length > 200) throw new ConvexError('Checklist exceeds 200 items'); const checklist = a.checklist.map(c => ({ key: key(c.key, 'Checklist key'), required: c.required, complete: c.complete, evidence: list(c.evidence, 'Evidence', 30) })), risk = { key: key(a.risk.key, 'Risk key'), severity: a.risk.severity, mitigation: txt(a.risk.mitigation, 'Mitigation', 2000), owner: key(a.risk.owner, 'Risk owner') }; const old = await ctx.db.query('scopeD29ReadinessDossiers').withIndex('by_owner_dossier', q => q.eq('ownerKey', ownerKey).eq('dossierKey', dossierKey)).first(), risks = [...(old?.risks ?? []).filter(r => r.key !== risk.key), risk], dossierDigest = await digest(JSON.stringify({ checklist, risks })); if (old) { await ctx.db.patch(old._id, { requestKey, checklist, risks, dossierDigest }); return old._id } return ctx.db.insert('scopeD29ReadinessDossiers', { ownerKey, requestKey, dossierKey, checklist, risks, dossierDigest, createdAt: Date.now() }) },
})
export const compileExecutiveReadinessDossier = action({
  args: { dossierKey: v.string(), checklist: v.array(v.object({ key: v.string(), required: v.boolean(), complete: v.boolean(), evidence: strings })), risks: v.array(v.object({ key: v.string(), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), mitigation: v.string(), owner: v.string() })) },
  returns: v.object({ dossierKey: v.string(), readiness: v.union(v.literal('ready'), v.literal('conditional'), v.literal('blocked')), summary: v.string(), digest: v.string() }),
  handler: async (_ctx, a) => { const dossierKey = key(a.dossierKey, 'Dossier key'), missing = a.checklist.filter(c => c.required && (!c.complete || !c.evidence.length)).map(c => c.key), critical = a.risks.filter(r => r.severity === 'critical'); const readiness = missing.length || critical.length ? 'blocked' as const : a.risks.some(r => r.severity === 'high') ? 'conditional' as const : 'ready' as const; const summary = 'Readiness ' + readiness + '; ' + missing.length + ' required checklist gaps; ' + critical.length + ' critical risks; ' + a.risks.length + ' registered risks.'; return { dossierKey, readiness, summary, digest: await digest(JSON.stringify({ dossierKey, checklist: a.checklist, risks: a.risks, readiness })) } },
})

/* D30 — Deployment compatibility planner */
export const evaluateRuntimeCompatibility = query({
  args: { runtime: v.string(), requiredFeatures: strings, availableFeatures: strings },
  returns: v.object({ compatible: v.boolean(), missingFeatures: strings, runtime: v.string() }),
  handler: async (_ctx, a) => { const runtime = key(a.runtime, 'Runtime'), required = list(a.requiredFeatures, 'Required runtime features', 200), available = list(a.availableFeatures, 'Available runtime features', 200), missingFeatures = required.filter(f => !available.includes(f)); return { compatible: missingFeatures.length === 0, missingFeatures, runtime } },
})
export const validateDeploymentManifest = query({
  args: { manifest: v.array(v.object({ key: v.string(), value: v.string(), sensitive: v.boolean() })) },
  returns: v.object({ valid: v.boolean(), errors: strings, manifestDigest: v.string(), masked: v.array(v.object({ key: v.string(), value: v.string() })) }),
  handler: async (_ctx, a) => { const errors: string[] = [], seen = new Set<string>(), masked: Array<{key:string;value:string}> = []; if (a.manifest.length > 300) throw new ConvexError('Manifest exceeds 300 entries'); for (const item of a.manifest) { const k = key(item.key, 'Manifest key'); if (seen.has(k)) errors.push('Duplicate manifest key: ' + k); seen.add(k); const value = txt(item.value, 'Manifest value', 2000); if (item.sensitive && !/^(secret|vault|env|ref):[A-Za-z0-9._:/-]+$/.test(value)) errors.push('Sensitive value must be a reference: ' + k); masked.push({ key: k, value: item.sensitive ? '[MASKED_REFERENCE]' : value }) } return { valid: errors.length === 0, errors, manifestDigest: await digest(JSON.stringify(a.manifest.map(m => ({ key: m.key, value: m.sensitive ? '[MASKED]' : m.value, sensitive: m.sensitive })))), masked } },
})
export const generateEnvironmentDifference = query({
  args: { source: v.array(v.object({ key: v.string(), value: v.string() })), target: v.array(v.object({ key: v.string(), value: v.string() })) },
  returns: v.object({ differences: v.array(v.object({ key: v.string(), sourceValue: v.string(), targetValue: v.string() })), count: v.number() }),
  handler: async (_ctx, a) => { const map = (xs: typeof a.source) => { if (xs.length > 300) throw new ConvexError('Environment exceeds 300 values'); const m = new Map<string,string>(); for (const x of xs) { const k = key(x.key, 'Environment key'); if (m.has(k)) throw new ConvexError('Duplicate environment key ' + k); m.set(k, txt(x.value, 'Environment value', 2000)) } return m }; const source = map(a.source), target = map(a.target), keys = new Set([...source.keys(), ...target.keys()]), differences = [...keys].filter(k => source.get(k) !== target.get(k)).map(k => ({ key: k, sourceValue: source.has(k) ? '[PRESENT]' : '[MISSING]', targetValue: target.has(k) ? '[PRESENT]' : '[MISSING]' })); return { differences, count: differences.length } },
})

/* D31 — Preview environment factory (intake only; no cloud provisioning) */
export const requestEphemeralEnvironment = mutation({
  args: { requestKey: v.string(), environmentKey: v.string(), leaseKey: v.string(), ttlMs: v.number() },
  returns: v.id('scopeD31PreviewLeases'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), environmentKey = key(a.environmentKey, 'Environment key'), leaseKey = key(a.leaseKey, 'Lease key'), ttlMs = int(a.ttlMs, 'Lease duration', 60000, 7 * 24 * 60 * 60 * 1000); const old = await ctx.db.query('scopeD31PreviewLeases').withIndex('by_owner_lease', q => q.eq('ownerKey', ownerKey).eq('leaseKey', leaseKey)).first(); if (old) throw new ConvexError('Lease key already exists'); const now = Date.now(); return ctx.db.insert('scopeD31PreviewLeases', { ownerKey, requestKey, environmentKey, leaseKey, ttlMs, expiresAt: now + ttlMs, state: 'requested', createdAt: now, updatedAt: now }) },
})
export const calculatePreviewLeaseExpiration = query({
  args: { createdAt: v.number(), ttlMs: v.number(), now: v.optional(v.number()) },
  returns: v.object({ expiresAt: v.number(), expired: v.boolean(), remainingMs: v.number() }),
  handler: async (_ctx, a) => { const createdAt = finite(a.createdAt, 'Creation time', 0, 9e15), ttlMs = int(a.ttlMs, 'Lease duration', 1, 7 * 24 * 60 * 60 * 1000), now = a.now === undefined ? Date.now() : finite(a.now, 'Current time', 0, 9e15), expiresAt = createdAt + ttlMs; return { expiresAt, expired: now >= expiresAt, remainingMs: Math.max(0, expiresAt - now) } },
})
export const transitionPreviewTeardownState = mutation({
  args: { leaseKey: v.string(), state: v.union(v.literal('ready'), v.literal('expired'), v.literal('teardown_requested'), v.literal('torn_down')) },
  returns: v.object({ leaseKey: v.string(), state: v.union(v.literal('ready'), v.literal('expired'), v.literal('teardown_requested'), v.literal('torn_down')), updatedAt: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), leaseKey = key(a.leaseKey, 'Lease key'), row = await ctx.db.query('scopeD31PreviewLeases').withIndex('by_owner_lease', q => q.eq('ownerKey', ownerKey).eq('leaseKey', leaseKey)).first(); if (!row) throw new ConvexError('Preview lease not found'); const allowed: Record<string,string[]> = { requested: ['ready','expired','teardown_requested'], ready: ['expired','teardown_requested'], expired: ['teardown_requested','torn_down'], teardown_requested: ['torn_down'], torn_down: [] }; if (!(allowed[row.state] ?? []).includes(a.state)) throw new ConvexError('Invalid preview lease transition ' + row.state + ' -> ' + a.state); const updatedAt = Date.now(); await ctx.db.patch(row._id, { state: a.state, updatedAt }); return { leaseKey, state: a.state, updatedAt } },
})

/* D32 — Environment and secrets manager; only references are accepted/stored */
export const generateMaskedSecretReferences = query({
  args: { references: v.array(v.object({ name: v.string(), reference: v.string() })) },
  returns: v.object({ references: v.array(v.object({ name: v.string(), masked: v.string() })), count: v.number() }),
  handler: async (_ctx, a) => { if (a.references.length > 200) throw new ConvexError('At most 200 secret references are allowed'); const seen = new Set<string>(), references = a.references.map(r => { const name = key(r.name, 'Secret name'), reference = txt(r.reference, 'Secret reference', 500); if (seen.has(name)) throw new ConvexError('Secret names must be unique'); seen.add(name); if (!/^(secret|vault|env|ref):[A-Za-z0-9._:/-]+$/.test(reference)) throw new ConvexError('Raw secret values are not accepted; use a secret reference'); return { name, masked: '[MASKED:' + name + ']' } }); return { references, count: references.length } },
})
export const recordEnvironmentSecretRotation = mutation({
  args: { requestKey: v.string(), environmentKey: v.string(), reference: v.string(), actorKey: v.string(), outcome: v.union(v.literal('planned'), v.literal('completed'), v.literal('failed')) },
  returns: v.object({ environmentKey: v.string(), reference: v.string(), outcome: v.union(v.literal('planned'), v.literal('completed'), v.literal('failed')), updatedAt: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), environmentKey = key(a.environmentKey, 'Environment key'), reference = txt(a.reference, 'Secret reference', 500), actorKey = key(a.actorKey, 'Actor key'); if (!/^(secret|vault|env|ref):[A-Za-z0-9._:/-]+$/.test(reference)) throw new ConvexError('Only a secret reference may be recorded; raw secrets are forbidden'); const row = await ctx.db.query('scopeD32EnvironmentSecurity').withIndex('by_owner_environment', q => q.eq('ownerKey', ownerKey).eq('environmentKey', environmentKey)).first(); const now = Date.now(), audit = { reference, actorKey, outcome: a.outcome, at: now }; if (row) await ctx.db.patch(row._id, { requestKey, rotationAudits: [...row.rotationAudits, audit].slice(-200), secretRefs: row.secretRefs.map(s => s.reference === reference && a.outcome === 'completed' ? { ...s, rotatedAt: now } : s), updatedAt: now }); else await ctx.db.insert('scopeD32EnvironmentSecurity', { ownerKey, requestKey, environmentKey, secretRefs: [], rotationAudits: [audit], allowedScopes: [], updatedAt: now }); return { environmentKey, reference, outcome: a.outcome, updatedAt: now } },
})
export const verifyEnvironmentScopePolicy = query({
  args: { requestedScopes: strings, allowedScopes: strings },
  returns: v.object({ allowed: v.boolean(), denied: strings }),
  handler: async (_ctx, a) => { const requested = list(a.requestedScopes, 'Requested scopes', 200), allowed = list(a.allowedScopes, 'Allowed scopes', 200), denied = requested.filter(x => !allowed.includes(x)); return { allowed: denied.length === 0, denied } },
})

/* D33 — Governed release pipeline; gates only, never deploys */
export const evaluateCanaryAllocationThreshold = query({
  args: { allocationPercent: v.number(), minPercent: v.number(), maxPercent: v.number(), errorRate: v.number(), maxErrorRate: v.number(), latencyP95Ms: v.number(), maxLatencyP95Ms: v.number() },
  returns: v.object({ eligible: v.boolean(), blockers: strings }),
  handler: async (_ctx, a) => { const allocation = finite(a.allocationPercent, 'Canary allocation', 0, 100), min = finite(a.minPercent, 'Minimum allocation', 0, 100), max = finite(a.maxPercent, 'Maximum allocation', min, 100), errors = finite(a.errorRate, 'Error rate', 0, 1), maxErrors = finite(a.maxErrorRate, 'Maximum error rate', 0, 1), latency = finite(a.latencyP95Ms, 'P95 latency', 0, 1e9), maxLatency = finite(a.maxLatencyP95Ms, 'Maximum P95 latency', 0, 1e9), blockers: string[] = []; if (allocation < min || allocation > max) blockers.push('Canary allocation outside configured range'); if (errors > maxErrors) blockers.push('Error rate exceeds threshold'); if (latency > maxLatency) blockers.push('P95 latency exceeds threshold'); return { eligible: blockers.length === 0, blockers } },
})
export const recordPromotionGateApproval = mutation({
  args: { requestKey: v.string(), releaseKey: v.string(), canaryPercent: v.number(), errorThreshold: v.number(), latencyThresholdMs: v.number(), approverKey: v.string(), approved: v.boolean() },
  returns: v.id('scopeD33ReleaseGates'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), releaseKey = key(a.releaseKey, 'Release key'), approverKey = key(a.approverKey, 'Approver key'), canaryPercent = finite(a.canaryPercent, 'Canary percent', 0, 100), errorThreshold = finite(a.errorThreshold, 'Error threshold', 0, 1), latencyThresholdMs = finite(a.latencyThresholdMs, 'Latency threshold', 1, 1e9); const old = await ctx.db.query('scopeD33ReleaseGates').withIndex('by_owner_release', q => q.eq('ownerKey', ownerKey).eq('releaseKey', releaseKey)).first(); const approvals = [...new Set([...(old?.approvals ?? []), ...(a.approved ? [approverKey] : [])])], updatedAt = Date.now(); if (old) { await ctx.db.patch(old._id, { requestKey, canaryPercent, errorThreshold, latencyThresholdMs, approvals, promotionState: a.approved ? 'approved' : 'blocked', updatedAt }); return old._id } return ctx.db.insert('scopeD33ReleaseGates', { ownerKey, requestKey, releaseKey, canaryPercent, errorThreshold, latencyThresholdMs, approvals, promotionState: a.approved ? 'approved' : 'blocked', rollbackLocked: false, lockReason: '', updatedAt }) },
})
export const enforceReleaseRollbackLock = mutation({
  args: { releaseKey: v.string(), operation: v.union(v.literal('promote'), v.literal('rollback')), lock: v.boolean(), reason: v.string() },
  returns: v.object({ releaseKey: v.string(), allowed: v.boolean(), rollbackLocked: v.boolean(), reason: v.string() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), releaseKey = key(a.releaseKey, 'Release key'), reason = txt(a.reason, 'Lock rationale', 1500), row = await ctx.db.query('scopeD33ReleaseGates').withIndex('by_owner_release', q => q.eq('ownerKey', ownerKey).eq('releaseKey', releaseKey)).first(); if (!row) throw new ConvexError('Release gate not found'); const rollbackLocked = a.lock ? true : row.rollbackLocked, allowed = a.operation === 'promote' ? row.promotionState === 'approved' && !rollbackLocked : !rollbackLocked; if (a.lock) await ctx.db.patch(row._id, { rollbackLocked: true, lockReason: reason, promotionState: 'blocked', updatedAt: Date.now() }); return { releaseKey, allowed: a.lock ? false : allowed, rollbackLocked, reason: a.lock ? reason : row.lockReason } },
})

/* D34 — Rollback and recovery planner */
export const resolveRecoveryDependencyOrder = query({
  args: { dependencies: v.array(dependency) },
  returns: v.object({ order: strings, valid: v.boolean() }),
  handler: async (_ctx, a) => { try { return { order: topologicalOrder(a.dependencies), valid: true } } catch (error) { throw new ConvexError(error instanceof Error ? error.message : 'Recovery dependency graph invalid') } },
})
export const verifyRecoveryPoint = mutation({
  args: { requestKey: v.string(), drillKey: v.string(), recoveryPoint: v.string(), expectedDigest: v.string(), observedDigest: v.string() },
  returns: v.object({ drillKey: v.string(), verified: v.boolean(), updatedAt: v.number() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), drillKey = key(a.drillKey, 'Drill key'), recoveryPoint = key(a.recoveryPoint, 'Recovery point'), expectedDigest = key(a.expectedDigest, 'Expected digest'), observedDigest = key(a.observedDigest, 'Observed digest'), verified = expectedDigest === observedDigest; const row = await ctx.db.query('scopeD34RecoveryDrills').withIndex('by_owner_drill', q => q.eq('ownerKey', ownerKey).eq('drillKey', drillKey)).first(); const fields = { requestKey, recoveryPoint, verified, outcome: 'planned' as const, updatedAt: Date.now() }; if (row) { await ctx.db.patch(row._id, fields); return { drillKey, verified, updatedAt: fields.updatedAt } } await ctx.db.insert('scopeD34RecoveryDrills', { ownerKey, drillKey, dependencies: [], ...fields, createdAt: Date.now() }); return { drillKey, verified, updatedAt: fields.updatedAt } },
})
export const logRecoveryDrillRehearsal = mutation({
  args: { drillKey: v.string(), dependencies: v.array(dependency), outcome: v.union(v.literal('passed'), v.literal('failed')), rehearsalEvidence: v.string() },
  returns: v.object({ drillKey: v.string(), outcome: v.union(v.literal('passed'), v.literal('failed')), rehearsalDigest: v.string() }),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), drillKey = key(a.drillKey, 'Drill key'), order = topologicalOrder(a.dependencies), rehearsalDigest = await digest(JSON.stringify({ order, outcome: a.outcome, evidence: txt(a.rehearsalEvidence, 'Rehearsal evidence', 3000) })), row = await ctx.db.query('scopeD34RecoveryDrills').withIndex('by_owner_drill', q => q.eq('ownerKey', ownerKey).eq('drillKey', drillKey)).first(); if (!row) throw new ConvexError('Recovery drill must exist before rehearsal'); await ctx.db.patch(row._id, { dependencies: a.dependencies.map(d => ({ key: key(d.key, 'Dependency key'), dependsOn: list(d.dependsOn, 'Dependencies', 100) })), rehearsalDigest, outcome: a.outcome, updatedAt: Date.now() }); return { drillKey, outcome: a.outcome, rehearsalDigest } },
})

/* D35 — Production diagnostics and bounded repair */
export const classifyIncidentTrace = query({
  args: { trace: strings },
  returns: v.object({ category: v.union(v.literal('availability'), v.literal('security'), v.literal('data'), v.literal('performance'), v.literal('unknown')), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), traceDigest: v.string(), indicators: strings }),
  handler: async (_ctx, a) => { if (a.trace.length > 500) throw new ConvexError('Trace exceeds 500 entries'); const trace = a.trace.map(x => txt(x, 'Trace entry', 2000)), joined = trace.join(' ').toLowerCase(), indicators: string[] = []; let category: 'availability'|'security'|'data'|'performance'|'unknown' = 'unknown'; if (/unauthorized|credential|injection|permission|secret leak/.test(joined)) { category = 'security'; indicators.push('security-pattern') } else if (/corrupt|constraint|migration|integrity|missing row/.test(joined)) { category = 'data'; indicators.push('data-integrity-pattern') } else if (/timeout|latency|slow|cpu|memory/.test(joined)) { category = 'performance'; indicators.push('performance-pattern') } else if (/unavailable|crash|connection refused|5xx|outage/.test(joined)) { category = 'availability'; indicators.push('availability-pattern') } const severity = /credential leak|data loss|remote code|secret leak/.test(joined) ? 'critical' as const : /unauthorized|corrupt|outage|injection/.test(joined) ? 'high' as const : indicators.length ? 'medium' as const : 'low' as const; return { category, severity, traceDigest: await digest(JSON.stringify(trace)), indicators } },
})
export const validateBoundedRepairPatch = query({
  args: { files: v.array(patchFile), maxFiles: v.number(), requireReversible: v.boolean() },
  returns: v.object({ valid: v.boolean(), blockers: strings, fileCount: v.number() }),
  handler: async (_ctx, a) => { const maxFiles = int(a.maxFiles, 'Maximum patch files', 1, 50), blockers: string[] = []; if (!a.files.length) blockers.push('Patch is empty'); if (a.files.length > maxFiles) blockers.push('Patch exceeds configured file bound'); const paths = new Set<string>(); for (const f of a.files) { const path = safePath(f.path); if (paths.has(path)) blockers.push('Duplicate patch path: ' + path); paths.add(path); if (!/^[a-f0-9]{16,128}$/i.test(f.beforeDigest) || !/^[a-f0-9]{16,128}$/i.test(f.afterDigest)) blockers.push('Invalid content digest: ' + path); if (a.requireReversible && f.beforeDigest === f.afterDigest) blockers.push('Patch does not change content: ' + path) } return { valid: blockers.length === 0, blockers, fileCount: a.files.length } },
})
export const recordIncidentContainmentReceipt = mutation({
  args: { requestKey: v.string(), incidentKey: v.string(), traceDigest: v.string(), category: v.union(v.literal('availability'), v.literal('security'), v.literal('data'), v.literal('performance'), v.literal('unknown')), severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('critical')), patchFiles: v.array(patchFile), containmentReceipt: v.string() },
  returns: v.id('scopeD35RepairIncidents'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), incidentKey = key(a.incidentKey, 'Incident key'), traceDigest = key(a.traceDigest, 'Trace digest'), receipt = txt(a.containmentReceipt, 'Containment receipt', 3000); if (a.patchFiles.length > 50) throw new ConvexError('Repair patch exceeds 50 files'); const patchFiles = a.patchFiles.map(f => ({ path: safePath(f.path), beforeDigest: key(f.beforeDigest, 'Before digest'), afterDigest: key(f.afterDigest, 'After digest') })); const row = await ctx.db.query('scopeD35RepairIncidents').withIndex('by_owner_incident', q => q.eq('ownerKey', ownerKey).eq('incidentKey', incidentKey)).first(), updatedAt = Date.now(), fields = { requestKey, traceDigest, category: a.category, severity: a.severity, patchFiles, containmentReceipt: receipt, state: 'contained' as const, updatedAt }; if (row) { await ctx.db.patch(row._id, fields); return row._id } return ctx.db.insert('scopeD35RepairIncidents', { ownerKey, incidentKey, ...fields, createdAt: Date.now() }) },
})

/* D36 — Ownership, export and exit */
export const compileComprehensiveAssetManifest = action({
  args: { manifestKey: v.string(), assets: v.array(v.object({ key: v.string(), kind: v.string(), digest: v.string(), exportable: v.boolean() })) },
  returns: v.object({ manifestKey: v.string(), assets: v.array(v.object({ key: v.string(), kind: v.string(), digest: v.string(), exportable: v.boolean() })), manifestDigest: v.string(), blockedAssets: strings }),
  handler: async (_ctx, a) => { const manifestKey = key(a.manifestKey, 'Manifest key'); if (a.assets.length > 2000) throw new ConvexError('Asset manifest exceeds 2,000 entries'); const seen = new Set<string>(), assets = a.assets.map(asset => { const k = key(asset.key, 'Asset key'); if (seen.has(k)) throw new ConvexError('Asset keys must be unique'); seen.add(k); return { key: k, kind: key(asset.kind, 'Asset kind'), digest: key(asset.digest, 'Asset digest'), exportable: asset.exportable } }); return { manifestKey, assets, manifestDigest: await digest(JSON.stringify(assets)), blockedAssets: assets.filter(a => !a.exportable).map(a => a.key) } },
})
export const generateDetachedRepositoryBundle = action({
  args: { files: v.array(fileSpec), manifestDigest: v.string(), excludeSensitive: v.boolean() },
  returns: v.object({ bundleDigest: v.string(), fileCount: v.number(), files: v.array(fileSpec), exclusions: strings }),
  handler: async (_ctx, a) => { const manifestDigest = key(a.manifestDigest, 'Manifest digest'); if (a.files.length > 1000) throw new ConvexError('Repository bundle exceeds 1,000 files'); const files: Array<{path:string;content:string;language:string}> = [], exclusions: string[] = []; for (const f of a.files) { const path = safePath(f.path); if (a.excludeSensitive && /(^|\/)(\.env|secrets?\.|credentials?\.|private[-_]?key)/i.test(path)) { exclusions.push(path); continue } const content = txt(f.content, 'Bundle file content', 20000); if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) { exclusions.push(path); continue } files.push({ path, content, language: txt(f.language, 'Language', 80) }) } if (new Set(files.map(f => f.path)).size !== files.length) throw new ConvexError('Repository bundle has duplicate paths'); return { bundleDigest: await digest(JSON.stringify({ manifestDigest, files })), fileCount: files.length, files, exclusions } },
})
export const recordPermanentExitSignoff = mutation({
  args: { requestKey: v.string(), manifestKey: v.string(), approverKey: v.string(), decision: v.union(v.literal('approved'), v.literal('rejected')), assets: v.array(v.object({ key: v.string(), kind: v.string(), digest: v.string(), exportable: v.boolean() })), bundleDigest: v.string() },
  returns: v.id('scopeD36ExitManifests'),
  handler: async (ctx, a) => { const ownerKey = await requireOperator(ctx), requestKey = key(a.requestKey, 'Request key'), manifestKey = key(a.manifestKey, 'Manifest key'), approverKey = key(a.approverKey, 'Approver key'), bundleDigest = key(a.bundleDigest, 'Bundle digest'); if (!a.assets.length || a.assets.length > 2000) throw new ConvexError('Exit sign-off requires 1–2,000 manifest assets'); const seen = new Set<string>(), assets = a.assets.map(asset => { const k = key(asset.key, 'Asset key'); if (seen.has(k)) throw new ConvexError('Asset keys must be unique'); seen.add(k); return { key: k, kind: key(asset.kind, 'Asset kind'), digest: key(asset.digest, 'Asset digest'), exportable: asset.exportable } }); if (a.decision === 'approved' && assets.some(asset => !asset.exportable)) throw new ConvexError('Cannot approve exit while non-exportable assets remain'); const manifestDigest = await digest(JSON.stringify(assets)), old = await ctx.db.query('scopeD36ExitManifests').withIndex('by_owner_manifest', q => q.eq('ownerKey', ownerKey).eq('manifestKey', manifestKey)).first(), updatedAt = Date.now(), fields = { requestKey, assets, manifestDigest, bundleDigest, signoff: a.decision, approverKey, updatedAt }; if (old) { await ctx.db.patch(old._id, fields); return old._id } return ctx.db.insert('scopeD36ExitManifests', { ownerKey, manifestKey, ...fields, createdAt: Date.now() }) },
})
