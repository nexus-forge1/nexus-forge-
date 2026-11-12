// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api, internal } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })
const digest = 'a'.repeat(64)
const goodPoint = (overrides: Record<string, unknown> = {}) => ({
  captureKey: 'capture-2026-10-20',
  sourceEnvironment: 'live' as const,
  capturedAt: Date.now() - 60 * 60 * 1000,
  triggerType: 'manual' as const,
  archiveReference: 'private://backup.zip',
  sourceSha256: digest,
  storedSha256: digest,
  bytes: 1200,
  dataTables: 75,
  dataDocuments: 2011,
  independentRetrieval: true,
  zipCrcPassed: true,
  relationshipsPassed: true,
  mediaInventoryNote: 'Media inventory checked; no app-upload payloads present at capture time.',
  evidenceReference: 'private://verification.json',
  ...overrides,
})

describe('immutable backup recovery point inventory', () => {
  it('requires authentication and isolates points by owner', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.backupInventory.list, {})).rejects.toThrow(/Authenticated/)
    const owner = t.withIdentity(identity('backup-owner'))
    const other = t.withIdentity(identity('backup-other'))
    await owner.mutation(api.backupInventory.record, goodPoint())
    expect((await owner.query(api.backupInventory.list, {})).points).toHaveLength(1)
    expect((await other.query(api.backupInventory.list, {})).points).toEqual([])
  })

  it('counts only eligible points toward freshness and retention', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-owner'))
    await owner.mutation(api.backupInventory.record, goodPoint())
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-incomplete', sourceSha256: 'b'.repeat(64), capturedAt: Date.now() - 2 * 60 * 60 * 1000 }))
    const result = await owner.query(api.backupInventory.list, {})
    expect(result.points.map(point => point.eligible)).toEqual([false, true])
    expect(result.summary.freshness).toBe('fresh')
    expect(result.summary.eligiblePoints).toBe(1)
    expect(result.summary.retainedDaysLast30).toBe(1)
    expect(result.summary.missingDaysLast30).toBe(29)
  })

  it('does not let a future-dated capture satisfy production freshness', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-future-owner'))
    await owner.mutation(api.backupInventory.record, goodPoint({
      captureKey: 'future-skew-capture',
      capturedAt: Date.now() + 2 * 60 * 1000,
    }))
    const result = await owner.query(api.backupInventory.list, {})
    expect(result.points).toHaveLength(1)
    expect(result.points[0].eligible).toBe(false)
    expect(result.summary.freshness).toBe('missing')
    expect(result.summary.eligiblePoints).toBe(0)
    expect(result.summary.retainedDaysLast30).toBe(0)
  })

  it('does not let Testing or isolated-lab captures satisfy production freshness', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-environment-owner'))
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'testing-only-capture', sourceEnvironment: 'testing' }))
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'isolated-only-capture', sourceEnvironment: 'isolated-lab' }))
    const result = await owner.query(api.backupInventory.list, {})
    expect(result.summary.freshness).toBe('missing')
    expect(result.summary.eligiblePoints).toBe(0)
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'actual-live-capture', sourceEnvironment: 'live' }))
    expect((await owner.query(api.backupInventory.list, {})).summary.freshness).toBe('fresh')
  })

  it('reports timer-declared evidence separately and excludes ineligible timer points', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-trigger-owner'))
    const timerAt = Date.now() - 30 * 60 * 1000
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-timer-good', triggerType: 'timer-triggered', schedulerReceiptReference: 'private://scheduler-run-20261020', capturedAt: timerAt }))
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-timer-ineligible', triggerType: 'timer-triggered', sourceSha256: 'b'.repeat(64), capturedAt: timerAt - 60_000 }))
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-manual-good', capturedAt: timerAt + 60_000 }))
    const result = await owner.query(api.backupInventory.list, {})
    expect(result.summary.eligibleTimerTriggeredPoints).toBe(1)
    expect(result.summary.latestTimerTriggeredAt).toBe(timerAt)
    expect(result.points.find(point => point.captureKey === 'capture-timer-good')?.triggerType).toBe('timer-triggered')
    expect(result.points.find(point => point.captureKey === 'capture-timer-ineligible')?.eligible).toBe(false)
  })

  it('does not count timer declarations that have no scheduler receipt reference', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-trigger-without-receipt'))
    const timerAt = Date.now() - 20 * 60 * 1000
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-timer-no-receipt', triggerType: 'timer-triggered', capturedAt: timerAt }))
    const result = await owner.query(api.backupInventory.list, {})
    expect(result.summary.eligiblePoints).toBe(1)
    expect(result.summary.eligibleTimerTriggeredPoints).toBe(0)
    expect(result.summary.latestTimerTriggeredAt).toBeNull()
  })

  it('rejects duplicate capture keys and invalid evidence instead of overwriting history', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-owner'))
    await owner.mutation(api.backupInventory.record, goodPoint())
    await expect(owner.mutation(api.backupInventory.record, goodPoint())).rejects.toThrow(/cannot be overwritten/)
    await expect(owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-invalid-digest', sourceSha256: 'not-a-hash' }))).rejects.toThrow(/64 hexadecimal/)
    expect((await owner.query(api.backupInventory.list, {})).points).toHaveLength(1)
  })

  it('tracks scheduled freshness and retains status transitions per owner', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-monitor-owner'))
    const other = t.withIdentity(identity('backup-monitor-other'))
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-stale-monitor', capturedAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }))
    await t.mutation(internal.backupMonitor.check, {})
    expect((await owner.query(api.backupMonitor.getMyStatus, {}))?.status).toBe('stale')
    expect(await other.query(api.backupMonitor.getMyStatus, {})).toBeNull()
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'capture-fresh-monitor' }))
    await t.mutation(internal.backupMonitor.check, {})
    expect((await owner.query(api.backupMonitor.getMyStatus, {}))?.status).toBe('fresh')
    const events = await owner.query(api.backupMonitor.listEvents, {})
    expect(events.map(event => [event.fromStatus, event.toStatus])).toEqual([['stale', 'fresh']])
  })

  it('marks release owners with no recorded backup as missing', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-missing-owner'))
    await owner.mutation(api.releaseEvidence.submit, {
      gateKey: 'backup',
      evidenceReference: 'ticket://backup-readiness',
      summary: 'Backup readiness evidence submitted for review.',
    })
    await owner.mutation(api.backupInventory.record, goodPoint({ captureKey: 'testing-does-not-count', sourceEnvironment: 'testing' }))
    await t.mutation(internal.backupMonitor.check, {})
    expect((await owner.query(api.backupMonitor.getMyStatus, {}))?.status).toBe('missing')
    expect((await owner.query(api.backupMonitor.getMyStatus, {}))?.latestEligibleAt).toBeNull()
  })

  it('rejects future capture timestamps and cross-owner duplicate identity does not leak', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-owner'))
    const other = t.withIdentity(identity('backup-other'))
    await expect(owner.mutation(api.backupInventory.record, goodPoint({ capturedAt: Date.now() + 60 * 60 * 1000 }))).rejects.toThrow(/past timestamp/)
    await owner.mutation(api.backupInventory.record, goodPoint())
    await expect(other.mutation(api.backupInventory.record, goodPoint())).resolves.toBeDefined()
    expect((await owner.query(api.backupInventory.list, {})).points).toHaveLength(1)
    expect((await other.query(api.backupInventory.list, {})).points).toHaveLength(1)
  })
})
