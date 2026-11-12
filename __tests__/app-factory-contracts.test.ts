import { describe, expect, it } from 'vitest'
import { buildDatabasePlan, compareSchemaSnapshots, createBrowserQaPlan, validateIntegrationContract } from '../src/lib/app-factory-contracts'

describe('Database & Migration Studio contracts', () => {
  it('builds an additive owner-scoped schema plan without destructive instructions', () => {
    const plan = buildDatabasePlan({ tableName: 'projectNotes', ownerScoped: true, fields: [{ name: 'title', type: 'string', optional: false }, { name: 'body', type: 'string', optional: true }, { name: 'updatedAt', type: 'timestamp', optional: false }] })
    expect(plan.schemaAddition).toContain('.index("by_owner", ["ownerId"])')
    expect(plan.schemaAddition).toContain('ownerId: v.string()')
    expect(plan.schemaAddition).toContain('updatedAt: v.number(),')
    expect(plan.schemaAddition).toContain('// Unix milliseconds\n    updatedAt:')
    expect(plan.migration).toContain('No destructive table/field removal')
    expect(plan.status).toBe('draft')
  })
  it('rejects reserved tables, duplicate fields and malformed names', () => {
    expect(() => buildDatabasePlan({ tableName: 'users', ownerScoped: false, fields: [{ name: 'title', type: 'string', optional: false }] })).toThrow(/reserved/)
    expect(() => buildDatabasePlan({ tableName: 'newNotes', ownerScoped: false, fields: [{ name: 'title', type: 'string', optional: false }, { name: 'title', type: 'number', optional: false }] })).toThrow(/Duplicate/)
    expect(() => buildDatabasePlan({ tableName: '../schema', ownerScoped: false, fields: [{ name: 'title', type: 'string', optional: false }] })).toThrow()
  })
})
describe('Schema diff and migration gates', () => {
  const baseline = JSON.stringify({ tables: [{ name: 'projectNotes', fields: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string', optional: true }], indexes: ['by_owner'] }] })
  it('classifies optional fields, new tables and indexes as additive but still requiring review', () => {
    const proposed = JSON.stringify({ tables: [{ name: 'projectNotes', fields: [{ name: 'title', type: 'string' }, { name: 'body', type: 'string', optional: true }, { name: 'updatedAt', type: 'number', optional: true }], indexes: ['by_owner', 'by_owner_updatedAt'] }, { name: 'noteRevisions', fields: [{ name: 'ownerId', type: 'string' }], indexes: ['by_owner'] }] })
    const diff = compareSchemaSnapshots(baseline, proposed)
    expect(diff.safeAdditive).toBe(true)
    expect(diff.decision).toBe('ADDITIVE_REVIEW_REQUIRED')
    expect(diff.counts).toMatchObject({ addedTables: 1, addedFields: 1, addedIndexes: 1 })
    expect(diff.boundary).toMatch(/does not introspect a live database/)
  })
  it('blocks removals, type changes and newly required fields', () => {
    const proposed = JSON.stringify({ tables: [{ name: 'projectNotes', fields: [{ name: 'title', type: 'number' }, { name: 'requiredFlag', type: 'boolean' }], indexes: [] }] })
    const diff = compareSchemaSnapshots(baseline, proposed)
    expect(diff.safeAdditive).toBe(false)
    expect(diff.decision).toBe('BLOCKED_COMPATIBILITY_REVIEW')
    expect(diff.blockers.join(' ')).toMatch(/Field removal/)
    expect(diff.blockers.join(' ')).toMatch(/type\/optionality changed/)
    expect(diff.blockers.join(' ')).toMatch(/backfill\/default/)
    expect(diff.blockers.join(' ')).toMatch(/Index removal/)
  })
  it('rejects malformed JSON, duplicate tables and oversized snapshots', () => {
    expect(() => compareSchemaSnapshots('{', '{}')).toThrow(/valid JSON/)
    expect(() => compareSchemaSnapshots(JSON.stringify({ tables: [{ name: 'fooTable', fields: [] }, { name: 'fooTable', fields: [] }] }), JSON.stringify({ tables: [] }))).toThrow(/invalid or duplicate table/)
    expect(() => compareSchemaSnapshots('x'.repeat(65537), '{}')).toThrow(/64 KiB/)
  })
})
describe('Integration Contract Builder policy', () => {
  const base = { name: 'Task API', method: 'POST' as const, path: '/api/tasks', auth: 'bearer' as const, scope: 'tasks:write', timeoutMs: 5000, retries: 1, idempotencyKey: true, secretReference: 'integrations/task-api-token', sandboxEndpoint: 'https://sandbox.example.test/api' }
  it('returns a draft contract with scope and revocation checks but no live verification', () => {
    const contract = validateIntegrationContract(base)
    expect(contract.security.leastPrivilegeScope).toBe('tasks:write')
    expect(contract.security.secretReference).toBe('integrations/task-api-token')
    expect(contract.security.revocationCheckRequired).toBe(true)
    expect(contract.sandbox).toEqual({ endpoint: 'https://sandbox.example.test/api', executionStatus: 'not-verified', requiredBeforeApproval: true })
    expect(contract.boundary).toMatch(/No DNS lookup, network request/)
    expect(contract.liveConnectionVerified).toBe(false)
    expect(contract.checks.join(' ')).toMatch(/Revoke credentials/)
  })
  it('requires idempotency for retried POST and auth for writes', () => {
    expect(() => validateIntegrationContract({ ...base, idempotencyKey: false })).toThrow(/idempotency/)
    expect(() => validateIntegrationContract({ ...base, auth: 'none' })).toThrow(/restricted to GET/)
    expect(() => validateIntegrationContract({ ...base, path: '//evil.example' })).toThrow(/relative API path/)
    expect(() => validateIntegrationContract({ ...base, path: '/api/%2e%2e/admin' })).toThrow(/traversal/)
    expect(() => validateIntegrationContract({ ...base, retries: 4 })).toThrow(/between 0 and 3/)
  })
  it('requires safe managed secret references and rejects credential-like values', () => {
    expect(() => validateIntegrationContract({ ...base, secretReference: '' })).toThrow(/managed secret reference/)
    expect(() => validateIntegrationContract({ ...base, secretReference: 'Bearer abc123' })).toThrow(/managed secret reference/)
    expect(() => validateIntegrationContract({ ...base, auth: 'none', method: 'GET', secretReference: 'integrations/task-api-token' })).toThrow(/must not declare a secret reference/)
    const publicContract = validateIntegrationContract({ ...base, auth: 'none', method: 'GET', secretReference: '' })
    expect(publicContract.security.secretReference).toBeNull()
    expect(publicContract.security.revocationCheckRequired).toBe(false)
  })
  it('rejects unsafe sandbox endpoints and permits local loopback HTTP only', () => {
    for (const sandboxEndpoint of ['http://example.test/api', 'https://user:pass@example.test', 'https://example.test/?token=x', 'https://example.test/#fragment', 'https://service.internal', 'not a URL']) {
      expect(() => validateIntegrationContract({ ...base, sandboxEndpoint })).toThrow(/Sandbox endpoint/)
    }
    expect(validateIntegrationContract({ ...base, sandboxEndpoint: 'http://127.0.0.1:8080/api/' }).sandbox.endpoint).toBe('http://127.0.0.1:8080/api')
  })
})
describe('Browser QA plan', () => {
  it('produces evidence-required cases while explicitly remaining unexecuted', () => {
    const plan = createBrowserQaPlan({ appName: 'Demo app', route: '/features/tasks', featureKey: 'private-tasks' })
    expect(plan.execution).toBe('not-run')
    expect(plan.cases).toHaveLength(8)
    expect(plan.cases.every(test => test.evidenceRequired)).toBe(true)
    expect(plan.cases.find(test => test.id === 'auth-boundary')?.expected).toMatch(/isolated/)
  })
  it('rejects unsafe routes and invalid feature keys', () => {
    expect(() => createBrowserQaPlan({ appName: 'Demo', route: '/../admin', featureKey: 'private-tasks' })).toThrow()
    expect(() => createBrowserQaPlan({ appName: 'Demo', route: '/%2e%2e/admin', featureKey: 'private-tasks' })).toThrow()
    expect(() => createBrowserQaPlan({ appName: 'Demo', route: '/tasks', featureKey: 'UPPER' })).toThrow(/Feature key/)
  })
})
