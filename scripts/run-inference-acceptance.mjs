// Explicit one-time Testing acceptance. No checkout, automatic funding or action retries.
import { readFile, writeFile, chmod } from 'node:fs/promises'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { runWorkload } from './check-authenticated-capacity.mjs'
const token = process.env.NEXUS_INFERENCE_SESSION
const origin = 'https://quick-rabbit-810.eu-west-1.convex.cloud'
async function call(kind, path, args, timeout = 15000) {
  const r = await fetch(origin + '/api/' + kind, {
    method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ path, args, format: 'json' }),
    signal: AbortSignal.timeout(timeout),
  })
  const p = await r.json()
  if (r.status !== 200 || p.status !== 'success') throw Error('Controlled request did not confirm success; no retry')
  return p.value
}
try {
  if (!token || /\s/.test(token)) throw Error('A genuine reserved Testing session is required')
  const before = await call('query', 'billing:mine', {})
  if (before.mode !== 'test' || before.account?.prepaid !== 1000 || before.receipts.length !== 1 ||
    before.account.held || before.account.unresolved) throw Error('Expected verified one-time test credit')
  const initial = await call('query', 'providerUsage:history', { paginationOpts: { numItems: 20, cursor: null } })
  if (initial.page.length) throw Error('Expected empty ledger; this one-time inference exercise must not be replayed')
  console.log(JSON.stringify({ phase: 'funding', verifiedTestCreditCents: 1000, paidTestReceipts: 1, realCustomerCharge: false }))
  const began = performance.now()
  const actions = await Promise.allSettled([1, 2].map(async index => {
    const started = performance.now()
    const r = await call('action', 'manifestIntelligence:synthesize', {
      intent: 'Controlled inference acceptance ' + index + ': propose a local text-only daily planning checklist for a fictional bakery. This is a QA proposal only.',
      domain: 'Controlled software acceptance', budget: 4, horizon: 'one day',
      constraints: 'Use only proposals. Do not send messages, deploy, buy anything, or claim external execution. Keep outputs concise.',
      acceptanceCriteria: 'Return three distinct strategies and the requested structured strategy block. No actual customer or business outcomes.',
    }, 150000)
    return { index, durationMs: Math.round(performance.now() - started), saved: r.saved,
      strategyCount: r.strategyCount, strategyBlockValid: r.strategyBlockValid,
      blueprintComplete: r.blueprintComplete === true, missingSections: r.missingSections || [],
      blueprintBytes: Buffer.byteLength(r.blueprint),
      blueprintSHA256: crypto.createHash('sha256').update(r.blueprint).digest('hex') }
  }))
  const ledger = await call('query', 'providerUsage:history', { paginationOpts: { numItems: 20, cursor: null } })
  const bill = await call('query', 'billing:mine', {})
  const invocations = ledger.page.map(row => ({ stage: row.stage, outcome: row.outcome, usageStatus: row.usageStatus,
    reports: row.reports.map(r => ({ provider: r.provider, model: r.model, promptTokens: r.promptTokens,
      completionTokens: r.completionTokens, totalTokens: r.totalTokens, reportedCostUsd: r.reportedCostUsd })) }))
  const receipt = {
    version: 'real-inference-workload-v1', observedAt: new Date().toISOString(), environment: 'Testing',
    identityScope: 'One fresh reserved-email OTP account; real configured providers; one actual test-payment fulfillment.',
    inference: { concurrency: 2, durationMs: Math.round(performance.now() - began),
      results: actions.map(r => r.status === 'fulfilled' ? { status: r.status, ...r.value } :
        { status: 'unconfirmed', detail: 'Action failed or timed out; no retry performed' }) },
    invocations,
    billing: { mode: bill.mode, paidTestReceipts: bill.receipts.length, availablePrepaidCents: bill.account?.prepaid,
      reservedCents: bill.account?.held, unresolved: bill.account?.unresolved,
      holds: bill.usage.map(h => ({ status: h.status, reservedCents: h.reserved, chargedCents: h.charged,
        providerCostUsd: h.providerCostUsd, costBasis: h.costBasis })) },
    scope: 'Two concurrent real inference proposals and optional structured retries, no delivery or external business execution. Test payment is not revenue; standard-rate calculation is not provider invoice reconciliation.',
  }
  const inferencePassed = actions.every(r => r.status === 'fulfilled' && r.value.saved &&
    r.value.strategyCount === 3 && r.value.strategyBlockValid) && ledger.isDone &&
    ledger.page.length >= 2 && ledger.page.length <= 4 &&
    ledger.page.every(r => r.outcome === 'succeeded' && r.usageStatus === 'recorded') &&
    bill.account.held === 0 && bill.account.unresolved === 0 &&
    bill.usage.every(h => h.status === 'settled') &&
    bill.account.prepaid + bill.usage.reduce((s, h) => s + (h.charged || 0), 0) === 1000
  receipt.inferencePassed = inferencePassed
  if (inferencePassed) {
    const profile = JSON.parse(await readFile('docs/workload-profiles/authenticated-read-testing.json', 'utf8'))
    profile.label = 'Populated real-inference ledger - four workers sharing one OTP session'
    const workload = await runWorkload(profile, Array(4).fill(token))
    const after = await call('query', 'providerUsage:history', { paginationOpts: { numItems: 20, cursor: null } })
    receipt.populatedLedgerReads = { ...workload, samples: undefined,
      ledgerUnchanged: JSON.stringify(after) === JSON.stringify(ledger), invocationCount: ledger.page.length }
  }
  receipt.contentPassed = actions.every(r => r.status === 'fulfilled' && r.value.blueprintComplete)
  receipt.passed = Boolean(receipt.contentPassed && inferencePassed && receipt.populatedLedgerReads?.summary.passed && receipt.populatedLedgerReads?.ledgerUnchanged)
  const path = '/tmp/nexus-real-inference-workload-20261017.json'
  await writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 }); await chmod(path, 0o600)
  console.log(JSON.stringify(receipt))
  if (!receipt.passed) process.exitCode = 1
} catch {
  console.error('Inference acceptance did not confirm. Do not retry actions; inspect the reserved account ledger and billing state.')
  process.exitCode = 1
}
