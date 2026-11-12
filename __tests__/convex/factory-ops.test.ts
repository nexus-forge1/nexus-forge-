// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { convexTest } from 'convex-test'
import schema from '../../convex/schema'
import { api } from '../../convex/_generated/api'

const modules = import.meta.glob('../../convex/**/*.ts')
const identity = (subject: string) => ({ subject, issuer: 'https://nexus.test', tokenIdentifier: 'https://nexus.test|' + subject })

describe('business factory operations', () => {
  it('requires authentication and isolates records by owner', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.businessFactory.demandList, {})).rejects.toThrow(/Authenticated/)
    const owner = t.withIdentity(identity('factory-owner'))
    const other = t.withIdentity(identity('factory-other'))
    await owner.mutation(api.businessFactory.demandSave, { segment: 'Solo founders', hypothesis: 'They will pay for governed delivery', evidence: [] })
    expect((await owner.query(api.businessFactory.demandList, {}))).toHaveLength(1)
    expect((await other.query(api.businessFactory.demandList, {}))).toEqual([])
  })

  it('requires evidence for a go decision and records one decision per hypothesis', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('factory-owner'))
    const id = await owner.mutation(api.businessFactory.demandSave, { segment: 'Agencies', hypothesis: 'Pilot offer converts', evidence: [] })
    await expect(owner.mutation(api.businessFactory.demandDecide, { id, status: 'validated', decision: 'go', decisionNote: 'proceed with the pilot offer' })).rejects.toThrow(/evidence/)
    await owner.mutation(api.businessFactory.demandDecide, { id, status: 'rejected', decision: 'no-go', decisionNote: 'no pilot demand observed' })
    await expect(owner.mutation(api.businessFactory.demandDecide, { id, status: 'validated', decision: 'go', decisionNote: 'revisit after new evidence' })).rejects.toThrow(/recorded decision/)
  })

  it('enforces the quote lifecycle including holds and refunds', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('factory-owner'))
    const id = await owner.mutation(api.businessFactory.quoteSave, { label: 'Delivery retainer', scope: 'Two governed deliveries', priceUsd: 500, entitlement: 'Retainer hours' })
    await expect(owner.mutation(api.businessFactory.quoteAdvance, { id, action: 'accept', note: '' })).rejects.toThrow(/sent quote/)
    await owner.mutation(api.businessFactory.quoteAdvance, { id, action: 'quote', note: '' })
    await owner.mutation(api.businessFactory.quoteAdvance, { id, action: 'accept', note: '' })
    await expect(owner.mutation(api.businessFactory.quoteAdvance, { id, action: 'settle', note: 'short' })).rejects.toThrow()
    await owner.mutation(api.businessFactory.quoteAdvance, { id, action: 'settle', note: 'invoice paid and reconciled' })
    const rows = await owner.query(api.businessFactory.quoteList, {})
    expect(rows[0].status).toBe('settled')
    expect(rows[0].settlement).toBe('settled')
  })

  it('gates campaign publishing behind review and requires a measurement after publishing', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('factory-owner'))
    const id = await owner.mutation(api.businessFactory.campaignSave, { audience: 'Local businesses', offer: 'Governed launch pilot', channels: ['email'] })
    await expect(owner.mutation(api.businessFactory.campaignAdvance, { id, action: 'publish', note: 'reviewed and approved for launch' })).rejects.toThrow(/reviewed/)
    await owner.mutation(api.businessFactory.campaignAdvance, { id, action: 'review', note: '' })
    await owner.mutation(api.businessFactory.campaignAdvance, { id, action: 'publish', note: 'reviewed and approved for launch' })
    await owner.mutation(api.businessFactory.campaignAdvance, { id, action: 'measure', note: '12 qualified leads in two weeks' })
    expect((await owner.query(api.businessFactory.campaignList, {}))[0].status).toBe('measured')
  })

  it('links dossier evidence per product section and allows reopening', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('factory-owner'))
    await owner.mutation(api.businessFactory.dossierLink, { product: 'Forge', section: 'payments', evidence: 'Provider account verified with payout receipt' })
    const rows = await owner.query(api.businessFactory.dossierList, {})
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('evidence-linked')
    await owner.mutation(api.businessFactory.dossierReopen, { id: rows[0]._id })
    expect((await owner.query(api.businessFactory.dossierList, {}))[0].status).toBe('open')
  })
})

describe('release command operations', () => {
  it('requires authentication and isolates releases by owner', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.releaseCommand.releaseList, {})).rejects.toThrow(/Authenticated/)
    const owner = t.withIdentity(identity('release-owner'))
    const other = t.withIdentity(identity('release-other'))
    await owner.mutation(api.releaseCommand.releaseSave, { label: 'October release', commitSha: 'a1b2c3d', environment: 'testing', checks: [{ name: 'build', status: 'pass' }] })
    expect((await owner.query(api.releaseCommand.releaseList, {}))).toHaveLength(1)
    expect((await other.query(api.releaseCommand.releaseList, {}))).toEqual([])
  })

  it('rejects invalid commit SHAs and approvals with failing checks', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('release-owner'))
    await expect(owner.mutation(api.releaseCommand.releaseSave, { label: 'Bad sha', commitSha: 'not-a-sha', environment: 'testing', checks: [{ name: 'build', status: 'pass' }] })).rejects.toThrow(/hex SHA/)
    const id = await owner.mutation(api.releaseCommand.releaseSave, { label: 'Failing checks', commitSha: 'a1b2c3d', environment: 'testing', checks: [{ name: 'build', status: 'pass' }, { name: 'browser QA', status: 'fail' }] })
    await expect(owner.mutation(api.releaseCommand.releaseAdvance, { id, action: 'approve', note: 'all checks observed passing' })).rejects.toThrow(/Every check must pass/)
    await owner.mutation(api.releaseCommand.releaseAdvance, { id, action: 'reject', note: 'browser QA failed on the target build' })
    expect((await owner.query(api.releaseCommand.releaseList, {}))[0].status).toBe('rejected')
  })

  it('verifies live only after approval of a passing release', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('release-owner'))
    const id = await owner.mutation(api.releaseCommand.releaseSave, { label: 'Good release', commitSha: 'a1b2c3d4e5f6a7b8', environment: 'live', checks: [{ name: 'build', status: 'pass' }] })
    await expect(owner.mutation(api.releaseCommand.releaseAdvance, { id, action: 'verify', note: 'verified the live deployment target' })).rejects.toThrow(/approved/)
    await owner.mutation(api.releaseCommand.releaseAdvance, { id, action: 'approve', note: 'all checks observed passing' })
    await owner.mutation(api.releaseCommand.releaseAdvance, { id, action: 'verify', note: 'live smoke probe passed' })
    expect((await owner.query(api.releaseCommand.releaseList, {}))[0].status).toBe('verified')
  })

  it('bounds previews and records cleanup receipts', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('release-owner'))
    await expect(owner.mutation(api.releaseCommand.previewCreate, { branch: 'feature/x', note: 'owner review', days: 45, budgetUsd: 10 })).rejects.toThrow(/1–30 days/)
    const id = await owner.mutation(api.releaseCommand.previewCreate, { branch: 'feature/x', note: 'owner review', days: 7, budgetUsd: 10 })
    await expect(owner.mutation(api.releaseCommand.previewCleanup, { id, note: 'in use' })).rejects.toThrow(/1–1000 UTF-8 bytes|Cleanup receipt/)
    await owner.mutation(api.releaseCommand.previewCleanup, { id, note: 'branch merged and preview removed' })
    expect((await owner.query(api.releaseCommand.previewList, {}))[0].status).toBe('cleaned')
  })

  it('keeps managed environment entries as references and rotates revisions', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('release-owner'))
    await expect(owner.mutation(api.releaseCommand.manifestSave, { name: 'prod', entries: [{ key: 'API_KEY', classification: 'managed', valueOrReference: 'secret value live' }] })).rejects.toThrow()
    const first = await owner.mutation(api.releaseCommand.manifestSave, { name: 'prod', entries: [{ key: 'PUBLIC_URL', classification: 'browser', valueOrReference: 'https://www.network-x-ai.com' }] })
    expect(first.revision).toBe(1)
    const second = await owner.mutation(api.releaseCommand.manifestSave, { name: 'prod', entries: [{ key: 'PUBLIC_URL', classification: 'browser', valueOrReference: 'https://www.network-x-ai.com' }], rotationNote: 'no change, receipt only' })
    expect(second.revision).toBe(2)
    expect((await owner.query(api.releaseCommand.manifestList, {}))).toHaveLength(1)
  })

  it('runs recovery drills only after a compatibility check and verifies bounded repairs in preview', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('release-owner'))
    const planId = await owner.mutation(api.releaseCommand.planSave, { label: 'Live rollback', knownGoodSha: '150241c', steps: ['Export live data', 'Restore compatible version in isolation', 'Verify smoke checks'] })
    await owner.mutation(api.releaseCommand.planCheck, { id: planId, note: 'schema is additive and backward compatible' })
    await owner.mutation(api.releaseCommand.planDrill, { id: planId, outcome: 'isolated restore passed in the local lab', durationMinutes: 12 })
    const caseId = await owner.mutation(api.releaseCommand.caseOpen, { title: 'Search timeout on live', correlation: 'incident 42', reproduction: 'Open /evidence and run a source search twice' })
    await owner.mutation(api.releaseCommand.caseRepair, { id: caseId, repair: 'Bound the query result window and add an index' })
    await owner.mutation(api.releaseCommand.caseVerify, { id: caseId, note: 'preview run reproduced and passed twice' })
    expect((await owner.query(api.releaseCommand.caseList, {}))[0].status).toBe('verified')
  })

  it('records a secret-free ownership export', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity('release-owner'))
    const id = await owner.mutation(api.releaseCommand.exportSave, { label: 'Exit package', resources: 'Domain, repo and provider accounts held by the operator', artifacts: [{ kind: 'code', reference: 'https://github.com/eugenemcmillian3-tech/nexus-forge-' }], attestationNote: 'No credential values are included in this manifest' })
    expect((await owner.query(api.releaseCommand.exportList, {}))).toHaveLength(1)
    await expect(owner.mutation(api.releaseCommand.exportSave, { label: 'Leaky', resources: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA account', artifacts: [{ kind: 'code', reference: 'https://example.com' }], attestationNote: 'should be rejected for secrets' })).rejects.toThrow(/credential-like/)
  })
})
