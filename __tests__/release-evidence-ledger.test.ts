// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../convex/schema'
import { api } from '../convex/_generated/api'
const digest = 'a'.repeat(64)
const goodPoint = { captureKey: 'capture-release-gate', sourceEnvironment: 'live' as const, capturedAt: Date.now() - 60 * 60 * 1000, archiveReference: 'private://backup.zip', sourceSha256: digest, storedSha256: digest, bytes: 1200, dataTables: 75, dataDocuments: 2011, independentRetrieval: true, zipCrcPassed: true, relationshipsPassed: true, mediaInventoryNote: 'Media inventory checked.', evidenceReference: 'private://verification.json' }
const modules = import.meta.glob('../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })
describe('release evidence ledger', () => {
  it('persists authenticated submissions and append-only event history', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.releaseEvidence.list, {})).rejects.toThrow(/Authenticated/)
    const owner = t.withIdentity(identity('owner-a'))
    const id = await owner.mutation(api.releaseEvidence.submit, { gateKey: 'backup', evidenceReference: 'controlled://backup-report', summary: 'Retention evidence submitted for review.' })
    expect((await owner.query(api.releaseEvidence.list, {}))[0]).toMatchObject({ _id: id, gateKey: 'backup', status: 'evidence-submitted', revision: 1 })
    expect((await owner.query(api.releaseEvidence.history, {}))[0]).toMatchObject({ gateId: id, eventType: 'evidence-submitted' })
    await owner.mutation(api.releaseEvidence.submit, { gateKey: 'backup', evidenceReference: 'controlled://backup-report-v2', summary: 'Updated evidence.' })
    expect((await owner.query(api.releaseEvidence.list, {}))[0].revision).toBe(2)
    expect(await owner.query(api.releaseEvidence.history, {})).toHaveLength(2)
  })
  it('blocks backup approval until a fresh eligible recovery point is retained and reference-matched', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('backup-gate-owner'))
    const reviewer = t.withIdentity(identity('backup-gate-reviewer'))
    const gateId = await owner.mutation(api.releaseEvidence.submit, { gateKey: 'backup', evidenceReference: 'private://verification.json', summary: 'Backup evidence submitted.' })
    await owner.mutation(api.releaseEvidence.grantReviewer, { reviewerKey: 'backup-gate-reviewer' })
    await expect(reviewer.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'Reviewed.' })).rejects.toThrow(/no eligible recovery point/)
    await owner.mutation(api.backupInventory.record, { ...goodPoint, captureKey: 'testing-only-release-gate', sourceEnvironment: 'testing' })
    await expect(reviewer.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'Testing archive must not pass.' })).rejects.toThrow(/no eligible recovery point/)
    await owner.mutation(api.backupInventory.record, goodPoint)
    const mismatched = await owner.mutation(api.releaseEvidence.submit, { gateKey: 'backup', evidenceReference: 'private://other.json', summary: 'Mismatched evidence reference.' })
    await expect(reviewer.mutation(api.releaseEvidence.review, { gateId: mismatched, decision: 'approved', note: 'Reviewed.' })).rejects.toThrow(/must match/)
    const matching = await owner.mutation(api.releaseEvidence.submit, { gateKey: 'backup', evidenceReference: 'private://verification.json', summary: 'Matching backup evidence.' })
    await reviewer.mutation(api.releaseEvidence.review, { gateId: matching, decision: 'approved', note: 'Checked against the recorded recovery point.' })
    expect((await owner.query(api.releaseEvidence.list, {})).find(g => g._id === matching)?.status).toBe('approved')
  })

  it('blocks recovery approval unless a retained passing drill matches the submitted evidence', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('recovery-gate-owner'))
    const reviewer = t.withIdentity(identity('recovery-gate-reviewer'))
    const gateId = await owner.mutation(api.releaseEvidence.submit, { gateKey: 'recovery', evidenceReference: 'private://recovery-report', summary: 'Recovery evidence submitted.' })
    await owner.mutation(api.releaseEvidence.grantReviewer, { reviewerKey: 'recovery-gate-reviewer' })
    await expect(reviewer.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'Reviewed.' })).rejects.toThrow(/no submitted drill/)
    const drillId = await owner.mutation(api.recoveryDrills.create, { title: 'Isolated restore acceptance', environment: 'isolated-lab' })
    await owner.mutation(api.recoveryDrills.update, { id: drillId, title: 'Isolated restore acceptance', environment: 'isolated-lab', backupCapture: 'pass', checksumVerification: 'pass', isolatedRestore: 'pass', ownershipVerification: 'pass', smokeChecks: 'pass', baselineReturn: 'pass', durationMinutes: 90, evidenceReference: 'private://recovery-report', summary: 'All six recovery checks passed in isolated lab.' })
    await reviewer.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'Checked against the retained passing drill.' })
    expect((await owner.query(api.releaseEvidence.list, {})).find(g => g._id === gateId)?.status).toBe('approved')
  })

  it('blocks invoice approval without a matching complete provider reconciliation', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('invoice-gate-owner'))
    const reviewer = t.withIdentity(identity('invoice-gate-reviewer'))
    const gateId = await owner.mutation(api.releaseEvidence.submit, {
      gateKey: 'invoices',
      evidenceReference: 'private://provider-invoice-reconciliation',
      summary: 'Provider invoice reconciliation submitted for independent review.',
    })
    await owner.mutation(api.releaseEvidence.grantReviewer, { reviewerKey: 'invoice-gate-reviewer' })
    await expect(reviewer.mutation(api.releaseEvidence.review, {
      gateId, decision: 'approved', note: 'Reviewed invoice evidence.',
    })).rejects.toThrow(/no matching retained provider reconciliation/)
  })

  it('isolates operators and enforces independent reviewer authorization', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('owner-a'))
    const reviewer = t.withIdentity(identity('reviewer-b'))
    const gateId = await owner.mutation(api.releaseEvidence.submit, { gateKey: 'workspace', evidenceReference: 'private://tenant-check', summary: 'Redacted tenant sign-in result attached.' })
    expect(await reviewer.query(api.releaseEvidence.list, {})).toEqual([])
    await expect(owner.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'verified' })).rejects.toThrow(/Independent review/)
    await expect(reviewer.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'verified' })).rejects.toThrow(/authorized/)
    await owner.mutation(api.releaseEvidence.grantReviewer, { reviewerKey: 'reviewer-b' })
    await reviewer.mutation(api.releaseEvidence.review, { gateId, decision: 'approved', note: 'Verified against the redacted sign-in result.' })
    expect((await owner.query(api.releaseEvidence.list, {}))[0].status).toBe('approved')
  })
})
