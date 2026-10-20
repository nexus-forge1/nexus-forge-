import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
const [input, output, expected, sourceCommit = 'unknown', expectedDraftKey = '', expectedDraftRevision = '', expectedDraftDigest = '', expectedDraftKind = ''] = process.argv.slice(2)
const bytes = fs.readFileSync(input)
const snapshotSha = createHash('sha256').update(bytes).digest('hex')
if (snapshotSha !== expected) throw new Error('Snapshot SHA-256 mismatch')
if (!/^(?:[a-f0-9]{40}|unknown)$/i.test(sourceCommit)) throw new Error('Invalid source commit SHA')
const bundle = JSON.parse(bytes.toString('utf8'))
if (bundle.version !== 'artifact-ci-v1' || typeof bundle.artifactSnapshot !== 'string' || !Array.isArray(bundle.plan) || !Array.isArray(bundle.criteria) || bundle.plan.length < 1 || bundle.plan.length > 20 || bundle.criteria.length < 1 || bundle.criteria.length > 20 || bundle.plan.length !== bundle.criteria.length || new Set(bundle.plan.map(test => test.criterionIndex)).size !== bundle.criteria.length) throw new Error('Invalid snapshot bundle or incomplete criterion coverage')
const draftBinding = bundle.draftBinding
if (!draftBinding || !['browser-qa-plan', 'artifact-ci-snapshot'].includes(draftBinding.kind) || typeof draftBinding.draftKey !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(draftBinding.draftKey) || !Number.isSafeInteger(draftBinding.revision) || draftBinding.revision < 1 || !/^[a-f0-9]{64}$/i.test(draftBinding.contentDigest || '') || typeof bundle.draftContent !== 'string' || createHash('sha256').update(bundle.draftContent).digest('hex') !== draftBinding.contentDigest) throw new Error('Invalid exact draft binding or draft content digest')
if (expectedDraftKey && draftBinding.draftKey !== expectedDraftKey) throw new Error('Browser QA draft key mismatch')
if (expectedDraftRevision && String(draftBinding.revision) !== expectedDraftRevision) throw new Error('Browser QA draft revision mismatch')
if (expectedDraftDigest && draftBinding.contentDigest !== expectedDraftDigest) throw new Error('Browser QA draft content digest mismatch')
if (expectedDraftKind && draftBinding.kind !== expectedDraftKind) throw new Error('Browser QA draft kind mismatch')
let boundDraft
try { boundDraft = JSON.parse(bundle.draftContent) } catch { throw new Error('Bound draft content must be valid JSON') }
if (draftBinding.kind === 'browser-qa-plan' && (boundDraft.kind !== 'browser-qa-plan' || !Array.isArray(boundDraft.cases) || bundle.criteria.length !== boundDraft.cases.length || bundle.criteria.some((criterion, index) => criterion !== boundDraft.cases[index]?.id + ': ' + boundDraft.cases[index]?.expected))) throw new Error('Browser QA criteria must exactly match the bound draft acceptance cases')
for (const test of bundle.plan) {
  if (!Number.isInteger(test.criterionIndex) || test.criterionIndex < 0 || test.criterionIndex >= bundle.criteria.length || !Array.isArray(test.steps) || test.steps.length < 1 || test.steps.length > 12 || !test.steps.some(step => String(step.action).startsWith('assert'))) throw new Error('Invalid criterion plan')
}
let browser, results = [], browserVersion = '', pageErrors = [], screenshots = []
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage'] })
  browserVersion = browser.version()
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, offline: true, viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(1500)
  page.on('pageerror', error => pageErrors.push(String(error.message).slice(0, 300)))
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(('console: ' + message.text()).slice(0, 300)) })
  await page.route('**/*', route => route.abort())
  page.on('dialog', dialog => dialog.dismiss())
  await page.setContent(bundle.artifactSnapshot, { waitUntil: 'domcontentloaded', timeout: 10000 })
  for (const [testIndex, test] of bundle.plan.entries()) {
    const evidence = []; let failed = false
    for (const step of test.steps) {
      if (failed) { evidence.push({ status: 'not_run', detail: 'A prior step failed.' }); continue }
      try {
        if (typeof step.selector !== 'string' || step.selector.length > 200 || typeof step.value !== 'string' || step.value.length > 2000) throw new Error('Invalid bounded step')
        const element = page.locator(step.selector)
        if (await element.count() !== 1) throw new Error('Selector must match exactly one element')
        let detail = ''
        if (step.action === 'fill') { if (await element.evaluate(element => element.tagName) === 'SELECT') await element.selectOption(step.value); else await element.fill(step.value); detail = 'Filled ' + step.selector }
        else if (step.action === 'click') { await element.click(); detail = 'Clicked ' + step.selector }
        else if (step.action === 'assertText') { const actual = await element.textContent(); if (!step.value.trim() || !String(actual).includes(step.value)) throw new Error('Expected ' + step.value + '; observed ' + actual); detail = 'Observed text: ' + actual }
        else if (step.action === 'assertTextEquals') { const actual = await element.textContent(); if (String(actual ?? '') !== step.value) throw new Error('Expected ' + step.value + '; observed ' + actual); detail = 'Observed exact text: ' + actual }
        else if (step.action === 'assertValue') { const actual = await element.inputValue(); if (actual !== step.value) throw new Error('Expected value ' + step.value + '; observed ' + actual); detail = 'Observed value: ' + actual }
        else if (step.action === 'assertVisible') { if (!await element.isVisible()) throw new Error('Element not visible'); detail = 'Element visibly rendered' }
        else if (step.action === 'assertInvalid') { if (!await element.evaluate(element => typeof element.checkValidity === 'function' && !element.checkValidity())) throw new Error('Input was not invalid'); detail = 'Browser validity rejected input' }
        else throw new Error('Unsupported action')
        evidence.push({ status: 'pass', detail: detail.slice(0, 120) })
      } catch (cause) { failed = true; evidence.push({ status: 'fail', detail: String(cause.message || cause).slice(0, 120) }) }
    }
    results.push(evidence)
    const file = 'case-' + String(testIndex + 1).padStart(2, '0') + '.png'
    const screenshotPath = output.replace(/[^/]+$/, file)
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
    const screenshotBytes = fs.readFileSync(screenshotPath)
    screenshots.push({ criterionIndex: test.criterionIndex, file, sha256: createHash('sha256').update(screenshotBytes).digest('hex'), bytes: screenshotBytes.length })
  }
} catch (cause) {
  console.error(String(cause && cause.stack || cause))
  results = bundle.plan.map(test => test.steps.map(() => ({ status: 'not_run', detail: ('Runner error: ' + String(cause.message || cause)).slice(0, 120) })))
} finally { if (browser) await browser.close() }
const passed = results.filter(test => test.every(step => step.status === 'pass')).length
const allPassed = new Set(bundle.plan.map(test => test.criterionIndex)).size === bundle.criteria.length && passed === bundle.criteria.length && pageErrors.length === 0
fs.writeFileSync(output, JSON.stringify({ version: 'artifact-ci-v1', snapshotSha, sourceCommit, draftBinding, testRunId: bundle.testRunId, browserVersion, results, pageErrors: pageErrors.slice(0, 50), screenshots, allPassed }, null, 2))
