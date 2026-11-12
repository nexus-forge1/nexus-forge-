export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'timestamp'
export type SchemaField = { name: string; type: SchemaFieldType; optional: boolean }
export type SchemaSnapshot = { tables: Array<{ name: string; fields: Array<{ name: string; type: string; optional?: boolean }>; indexes?: string[] }> }

export function compareSchemaSnapshots(baselineText: string, proposedText: string) {
  if (!baselineText.trim() || !proposedText.trim()) throw new Error('Provide both baseline and proposed schema snapshots.')
  if (new TextEncoder().encode(baselineText).length > 65536 || new TextEncoder().encode(proposedText).length > 65536) throw new Error('Each schema snapshot must be at most 64 KiB.')
  const parse = (raw: string, label: string): SchemaSnapshot => {
    let value: unknown
    try { value = JSON.parse(raw) } catch { throw new Error(label + ' must be valid JSON.') }
    if (!value || typeof value !== 'object' || !Array.isArray((value as SchemaSnapshot).tables) || (value as SchemaSnapshot).tables.length > 200) throw new Error(label + ' must contain a tables array with at most 200 tables.')
    const snapshot = value as SchemaSnapshot
    const tableNames = new Set<string>()
    for (const table of snapshot.tables) {
      if (!table || typeof table.name !== 'string' || !/^[a-z][A-Za-z0-9]{1,47}$/.test(table.name) || tableNames.has(table.name) || !Array.isArray(table.fields) || table.fields.length > 100 || (table.indexes !== undefined && (!Array.isArray(table.indexes) || table.indexes.some(index => typeof index !== 'string' || index.length > 240)))) throw new Error(label + ' contains an invalid or duplicate table, field list, or index list.')
      tableNames.add(table.name)
      const fieldNames = new Set<string>()
      for (const field of table.fields) {
        if (!field || typeof field.name !== 'string' || !/^[a-zA-Z][A-Za-z0-9_]{0,63}$/.test(field.name) || typeof field.type !== 'string' || field.type.length > 120 || (field.optional !== undefined && typeof field.optional !== 'boolean') || fieldNames.has(field.name)) throw new Error(label + ' contains an invalid or duplicate field in table ' + table.name + '.')
        fieldNames.add(field.name)
      }
    }
    return snapshot
  }
  const before = parse(baselineText, 'Baseline schema'), after = parse(proposedText, 'Proposed schema')
  const beforeTables = new Map(before.tables.map(table => [table.name, table]))
  const afterTables = new Map(after.tables.map(table => [table.name, table]))
  const addedTables: string[] = [], removedTables: string[] = [], addedFields: string[] = [], removedFields: string[] = [], changedFields: string[] = [], requiredFields: string[] = [], addedIndexes: string[] = [], removedIndexes: string[] = []
  for (const table of after.tables) {
    const old = beforeTables.get(table.name)
    if (!old) { addedTables.push(table.name); continue }
    const oldFields = new Map(old.fields.map(field => [field.name, field]))
    const newFields = new Map(table.fields.map(field => [field.name, field]))
    for (const field of table.fields) {
      const prior = oldFields.get(field.name)
      const label = table.name + '.' + field.name
      if (!prior) { addedFields.push(label); if (!field.optional) requiredFields.push(label) }
      else if (prior.type !== field.type || Boolean(prior.optional) !== Boolean(field.optional)) changedFields.push(label + ' (' + prior.type + (prior.optional ? '?' : '') + ' → ' + field.type + (field.optional ? '?' : '') + ')')
    }
    for (const field of old.fields) if (!newFields.has(field.name)) removedFields.push(table.name + '.' + field.name)
    const oldIndexes = new Set(old.indexes ?? []), newIndexes = new Set(table.indexes ?? [])
    for (const index of newIndexes) if (!oldIndexes.has(index)) addedIndexes.push(table.name + ':' + index)
    for (const index of oldIndexes) if (!newIndexes.has(index)) removedIndexes.push(table.name + ':' + index)
  }
  for (const table of before.tables) if (!afterTables.has(table.name)) removedTables.push(table.name)
  const blockers = [
    ...removedTables.map(name => 'Table removal is destructive: ' + name),
    ...removedFields.map(name => 'Field removal may lose data: ' + name),
    ...changedFields.map(name => 'Field type/optionality changed and needs a compatibility plan: ' + name),
    ...removedIndexes.map(name => 'Index removal may break readers or queries: ' + name),
    ...requiredFields.map(name => 'New required field needs a backfill/default before rollout: ' + name),
  ]
  const safeAdditive = blockers.length === 0
  return {
    kind: 'schema-diff-gate' as const, version: 1, safeAdditive,
    decision: safeAdditive ? 'ADDITIVE_REVIEW_REQUIRED' as const : 'BLOCKED_COMPATIBILITY_REVIEW' as const,
    counts: { addedTables: addedTables.length, removedTables: removedTables.length, addedFields: addedFields.length, removedFields: removedFields.length, changedFields: changedFields.length, requiredFields: requiredFields.length, addedIndexes: addedIndexes.length, removedIndexes: removedIndexes.length },
    changes: { addedTables, removedTables, addedFields, removedFields, changedFields, requiredFields, addedIndexes, removedIndexes },
    blockers,
    gates: ['freeze-baseline-and-proposed-digests','review-diff-and-backfill-plan','deploy-to-testing','run-owner-isolation-and-regression-tests','verify-rollback-compatibility','retain-exact-commit-and-test-receipts'],
    boundary: 'This comparison validates the supplied JSON snapshots only. It does not introspect a live database, apply a migration, run a backfill, or authorize a deployment.',
  }
}
export type DatabasePlanInput = { tableName: string; fields: SchemaField[]; ownerScoped: boolean }
export type IntegrationInput = { name: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; auth: 'none' | 'bearer' | 'oauth2' | 'signed-webhook'; scope: string; timeoutMs: number; retries: number; idempotencyKey: boolean; secretReference: string; sandboxEndpoint: string }
export type QaCase = { id: string; title: string; steps: string[]; expected: string; evidenceRequired: true }
const identifier = /^[a-z][a-zA-Z0-9]{1,47}$/
const fieldIdentifier = /^[a-z][a-zA-Z0-9]{0,47}$/
const forbiddenNames = new Set(['users','authSessions','authAccounts','authRefreshTokens','authVerificationCodes','authVerifiers','authRateLimits','_storage','schema'])
function assertIdentifier(value: string, label: string) {
  if (!identifier.test(value) || forbiddenNames.has(value)) throw new Error(label + ' must be a new lowercase-leading identifier (2–48 characters); reserved names are blocked.')
}
function assertFieldName(value: string) {
  if (!fieldIdentifier.test(value) || value.startsWith('_') || ['_id','_creationTime','ownerId'].includes(value)) throw new Error('Field names must be safe camelCase identifiers; ownerId and system fields are reserved.')
}
export function buildDatabasePlan(input: DatabasePlanInput) {
  assertIdentifier(input.tableName.trim(), 'Table name')
  if (!input.fields.length || input.fields.length > 20) throw new Error('Add between 1 and 20 fields.')
  const seen = new Set<string>()
  for (const field of input.fields) {
    assertFieldName(field.name.trim())
    if (seen.has(field.name.trim())) throw new Error('Duplicate field: ' + field.name)
    seen.add(field.name.trim())
  }
  const rows = [...(input.ownerScoped ? [{ name: 'ownerId', type: 'string' as const, optional: false }] : []), ...input.fields]
  const schemaFields = rows.map(field => (field.type === 'timestamp' ? '    // Unix milliseconds\n' : '') + '    ' + field.name + ': v.' + (field.type === 'timestamp' ? 'number' : field.type) + '()' + (field.optional ? '.optional()' : '') + ',').join('\n')
  const table = input.tableName + ': defineTable({\n' + schemaFields + '\n  })' + (input.ownerScoped ? '\n    .index("by_owner", ["ownerId"])' : '') + ','
  const migration = [
    '# Additive Convex schema migration', '',
    'Status: DRAFT — review against the target schema before applying.',
    'Target table: ' + input.tableName, '',
    '## Generated schema addition',
    'Add the following table to the existing defineSchema({...}) object. Do not replace the existing schema file.', '',
    'Schema snippet:', table, '',
    '## Safe rollout sequence',
    '1. Confirm this table name does not already exist in the target schema.',
    '2. Review every field, validator, index and owner-scope requirement.',
    '3. Add the table as an additive schema change; preserve all existing tables and indexes.',
    '4. Deploy to an isolated Testing deployment first and run the generated query/mutation tests.',
    '5. Deploy compatible readers/writers only after the schema check succeeds.',
    '6. Verify owner isolation with two distinct authenticated identities and an anonymous caller.',
    '7. Record the exact commit, deployment, test results and rollback owner.', '',
    '## Explicitly out of scope',
    'No destructive table/field removal, automatic data backfill, production deployment or schema overwrite is generated.',
  ].join('\n')
  return { kind: 'database-migration-plan' as const, version: 1, tableName: input.tableName, ownerScoped: input.ownerScoped, fields: rows, schemaAddition: table, migration, gates: ['new-table-confirmed','schema-reviewed','testing-deployed','owner-isolation-tested','rollback-owner-recorded'], status: 'draft' as const }
}
export function validateIntegrationContract(input: IntegrationInput) {
  if (!input.name.trim() || input.name.trim().length > 100) throw new Error('Contract name is required (max 100 characters).')
  if (!input.path.startsWith('/') || input.path.startsWith('//') || /[?#\s\\]/.test(input.path) || input.path.includes('..') || /%(?:2e|2f|5c)/i.test(input.path) || input.path.length > 240) throw new Error('Path must be a relative API path beginning with one slash; query strings, spaces and encoded or literal traversal are blocked.')
  if (!input.scope.trim() || input.scope.length > 240) throw new Error('A least-privilege permission scope is required (max 240 characters).')
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 30000) throw new Error('Timeout must be 100–30000 ms.')
  if (!Number.isInteger(input.retries) || input.retries < 0 || input.retries > 3) throw new Error('Retries must be between 0 and 3.')
  if (input.method === 'POST' && input.retries > 0 && !input.idempotencyKey) throw new Error('Retrying POST requires an idempotency key to prevent duplicate side effects.')
  if (input.auth === 'none' && input.method !== 'GET') throw new Error('Unauthenticated contracts are restricted to GET; write methods require an explicit auth scheme.')
  const secretReference = input.secretReference.trim()
  if (input.auth === 'none' && secretReference) throw new Error('Public read-only contracts must not declare a secret reference.')
  if (input.auth !== 'none' && !/^[a-z][a-z0-9_-]{2,63}(?:\/[a-z][a-z0-9_-]{2,63})*$/.test(secretReference)) throw new Error('Authenticated contracts require a managed secret reference identifier, not a credential value.')
  let sandbox: URL
  try { sandbox = new URL(input.sandboxEndpoint) } catch { throw new Error('Sandbox endpoint must be an absolute HTTPS URL or a local HTTP URL.') }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(sandbox.hostname)
  if ((sandbox.protocol !== 'https:' && !(sandbox.protocol === 'http:' && localHost)) || sandbox.username || sandbox.password || sandbox.search || sandbox.hash || sandbox.hostname.endsWith('.local') || sandbox.hostname.endsWith('.internal')) throw new Error('Sandbox endpoint must use HTTPS (or HTTP on loopback only) and must not contain credentials, query, fragment or private-network hostnames.')
  const sandboxEndpoint = sandbox.origin + sandbox.pathname.replace(/\/$/, '')
  return {
    kind: 'integration-contract' as const, version: 1, name: input.name.trim(),
    request: { method: input.method, path: input.path, timeoutMs: input.timeoutMs, retries: input.retries, idempotencyKey: input.idempotencyKey },
    security: { auth: input.auth, leastPrivilegeScope: input.scope.trim(), secretReference: input.auth === 'none' ? null : secretReference, secretHandling: 'managed secret reference only; never export credential values' as const, revocationCheckRequired: input.auth !== 'none' },
    sandbox: { endpoint: sandboxEndpoint, executionStatus: 'not-verified' as const, requiredBeforeApproval: true },
    checks: [
      'Validate request and response payloads against a versioned schema.',
      'Verify authorization and tenant/owner scope with allowed and denied identities.',
      'Exercise timeout and retry behavior in a sandbox; confirm idempotency for writes.',
      'Verify webhook signature and replay-window checks when applicable.',
      'Resolve the managed secret reference in the server-side secret manager; never expose its value to the browser or export it.',
      'Revoke credentials and prove subsequent calls fail closed.',
      'Record sanitized request/response evidence, exact contract version and sandbox endpoint.',
    ],
    status: 'draft' as const, liveConnectionVerified: false,
    boundary: 'Endpoint syntax and secret-reference format are validated locally only. No DNS lookup, network request, secret resolution, sandbox execution or credential-revocation check has run.',
  }
}
export function createBrowserQaPlan(input: { appName: string; route: string; featureKey: string }): { kind: 'browser-qa-plan'; version: 1; appName: string; route: string; featureKey: string; execution: 'not-run'; cases: QaCase[]; repairPolicy: string[] } {
  if (!input.appName.trim() || input.appName.trim().length > 100) throw new Error('App name is required (max 100 characters).')
  if (!input.route.startsWith('/') || input.route.startsWith('//') || input.route.includes('..') || /[?#\s\\]/.test(input.route) || /%(?:2e|2f|5c)/i.test(input.route) || input.route.length > 240) throw new Error('Route must be an app-relative path without encoded or literal traversal, query or fragment.')
  if (!/^[a-z][a-z0-9-]{2,31}$/.test(input.featureKey)) throw new Error('Feature key must be 3–32 lowercase letters, digits or hyphens.')
  const cases: QaCase[] = [
    { id: 'route-load', title: 'Route loads and hydrates', steps: ['Open the target route in a clean browser context.', 'Wait for hydration and network idle.'], expected: 'No uncaught page errors, hydration warnings or failed required requests.', evidenceRequired: true },
    { id: 'responsive-mobile', title: 'Mobile layout at 375px', steps: ['Set viewport to 375×812.', 'Inspect navigation, forms, tables and primary actions.'], expected: 'Document width does not exceed viewport; controls remain visible and operable.', evidenceRequired: true },
    { id: 'responsive-desktop', title: 'Desktop layout at 1280px', steps: ['Set viewport to 1280×900.', 'Inspect content width and keyboard focus.'], expected: 'No clipped content; focus order is logical and visible.', evidenceRequired: true },
    { id: 'auth-boundary', title: 'Authentication and owner isolation', steps: ['Repeat as owner A, owner B and anonymous user.', 'Attempt cross-owner reads and writes.'], expected: 'Private data is isolated; denied actions fail closed.', evidenceRequired: true },
    { id: 'primary-journey', title: 'Primary feature journey', steps: ['Create one uniquely keyed test record.', 'Reload, update, reload again, then archive or remove only test data.'], expected: 'Changes persist exactly once and the expected state survives reload.', evidenceRequired: true },
    { id: 'validation-errors', title: 'Validation and failure states', steps: ['Submit missing, oversized and malformed values.', 'Exercise a rejected request and retry.'], expected: 'Useful inline errors; no secret or sensitive payload leakage.', evidenceRequired: true },
    { id: 'keyboard-access', title: 'Keyboard and accessible names', steps: ['Complete the journey using keyboard only.', 'Inspect accessible names, labels and alert announcements.'], expected: 'Controls have labels and actions work without a pointer.', evidenceRequired: true },
    { id: 'security-egress', title: 'Protected source and egress checks', steps: ['Inspect network calls and browser console.', 'Confirm secrets remain server-side and external calls use approved origins.'], expected: 'No client secrets, unexpected egress or cross-origin sandbox escape.', evidenceRequired: true },
  ]
  return { kind: 'browser-qa-plan', version: 1, appName: input.appName.trim(), route: input.route, featureKey: input.featureKey, execution: 'not-run', cases, repairPolicy: ['Capture the failing test, trace, console and exact commit before proposing a repair.', 'Allow only a bounded patch against the reproduced failure.', 'Re-run the failing case and the protected security assertions.', 'Do not auto-merge, deploy, change secrets or mark a test passed without retained execution evidence.'] }
}
