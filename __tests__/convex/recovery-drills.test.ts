// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })

const passingChecks = {
  backupCapture: 'pass' as const,
  checksumVerification: 'pass' as const,
  isolatedRestore: 'pass' as const,
  ownershipVerification: 'pass' as const,
  smokeChecks: 'pass' as const,
  baselineReturn: 'pass' as const,
}

describe('recovery drill evidence workflow', () => {
  it('requires authentication and isolates drill records by owner', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.recoveryDrills.list, {})).rejects.toThrow(/Authenticated/)
    const owner = t.withIdentity(identity('drill-owner'))
    const other = t.withIdentity(identity('drill-other'))
    const id = await owner.mutation(api.recoveryDrills.create, { title: 'Testing restore drill', environment: 'testing' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0]).toMatchObject({ _id: id, status: 'draft', backupCapture: 'pending' })
    expect(await other.query(api.recoveryDrills.list, {})).toEqual([])
    await expect(other.mutation(api.recoveryDrills.update, { id, title: 'Foreign edit', environment: 'testing', ...passingChecks, evidenceReference: 'private://evidence', summary: 'Attempted cross-owner update' })).rejects.toThrow(/access denied/)
  })

  it('submits only when every check passes and evidence is attached', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('drill-owner'))
    const id = await owner.mutation(api.recoveryDrills.create, { title: 'Isolated recovery drill', environment: 'isolated-lab' })
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Isolated recovery drill', environment: 'isolated-lab', ...passingChecks, durationMinutes: 90, evidenceReference: '', summary: 'All checks passed but evidence reference missing.' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0].status).toBe('draft')
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Isolated recovery drill', environment: 'isolated-lab', ...passingChecks, durationMinutes: 90, evidenceReference: 'controlled://restore-report', summary: 'Artifact hash, isolated restore, ownership, smoke checks, and baseline return verified.' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0]).toMatchObject({ status: 'submitted', revision: 3 })
  })

  it('requires a non-empty result summary before submission', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('drill-owner'))
    const id = await owner.mutation(api.recoveryDrills.create, { title: 'Summary gate drill', environment: 'testing' })
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Summary gate drill', environment: 'testing', ...passingChecks, durationMinutes: 90, evidenceReference: 'controlled://restore-report', summary: '   ' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0]).toMatchObject({ status: 'draft', evidenceReference: 'controlled://restore-report', summary: '' })
  })

  it('requires measured duration and blocks recovery exceeding four hours', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('drill-duration-owner'))
    const id = await owner.mutation(api.recoveryDrills.create, { title: 'Duration gate drill', environment: 'testing' })
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Duration gate drill', environment: 'testing', ...passingChecks, evidenceReference: 'controlled://duration-report', summary: 'All checks pass but no elapsed time is recorded.' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0].status).toBe('draft')
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Duration gate drill', environment: 'testing', ...passingChecks, durationMinutes: 241, evidenceReference: 'controlled://duration-report', summary: 'Measured recovery took more than four hours.' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0]).toMatchObject({ status: 'blocked', durationMinutes: 241 })
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Duration gate drill', environment: 'testing', ...passingChecks, durationMinutes: 240, evidenceReference: 'controlled://duration-report', summary: 'Measured recovery completed within four hours.' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0]).toMatchObject({ status: 'submitted', durationMinutes: 240 })
  })

  it('preserves failed drill status instead of allowing a false pass', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('drill-owner'))
    const id = await owner.mutation(api.recoveryDrills.create, { title: 'Failed restore drill', environment: 'testing' })
    await owner.mutation(api.recoveryDrills.update, { id, title: 'Failed restore drill', environment: 'testing', ...passingChecks, durationMinutes: 90, isolatedRestore: 'fail', evidenceReference: 'controlled://failed-restore', summary: 'Restore failed and is retained for review.' })
    expect((await owner.query(api.recoveryDrills.list, {}))[0]).toMatchObject({ status: 'blocked', isolatedRestore: 'fail' })
  })
})
