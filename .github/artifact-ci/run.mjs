import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from 'playwright'
const [input, output, expected] = process.argv.slice(2)
const bytes = fs.readFileSync(input)
const snapshotSha = createHash('sha256').update(bytes).digest('hex')
if (snapshotSha !== expected) throw new Error('Snapshot SHA-256 mismatch')
const bundle = JSON.parse(bytes.toString('utf8'))
if (bundle.version !== 'artifact-ci-v1' || typeof bundle.artifactSnapshot !== 'string' || !Array.isArray(bundle.plan) || !Array.isArray(bundle.criteria) || bundle.plan.length < 1 || bundle.plan.length > 20) throw new Error('Invalid snapshot bundle')
for (const test of bundle.plan) {
  if (!Number.isInteger(test.criterionIndex) || test.criterionIndex < 0 || test.criterionIndex >= bundle.criteria.length || !Array.isArray(test.steps) || test.steps.length < 1 || test.steps.length > 12 || !test.steps.some(step => String(step.action).startsWith('assert'))) throw new Error('Invalid criterion plan')
}
let browser, results = [], browserVersion = ''
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage'] })
  browserVersion = browser.version()
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, offline: true })
  const page = await context.newPage()
  page.setDefaultTimeout(1500)
  await page.route('**/*', route => route.abort())
  page.on('dialog', dialog => dialog.dismiss())
  await page.setContent(bundle.artifactSnapshot, { waitUntil: 'domcontentloaded', timeout: 10000 })
  for (const test of bundle.plan) {
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
        else if (step.action === 'assertValue') { const actual = await element.inputValue(); if (actual !== step.value) throw new Error('Expected value ' + step.value + '; observed ' + actual); detail = 'Observed value: ' + actual }
        else if (step.action === 'assertVisible') { if (!await element.isVisible()) throw new Error('Element not visible'); detail = 'Element visibly rendered' }
        else if (step.action === 'assertInvalid') { if (!await element.evaluate(element => typeof element.checkValidity === 'function' && !element.checkValidity())) throw new Error('Input was not invalid'); detail = 'Browser validity rejected input' }
        else throw new Error('Unsupported action')
        evidence.push({ status: 'pass', detail: detail.slice(0, 120) })
      } catch (cause) { failed = true; evidence.push({ status: 'fail', detail: String(cause.message || cause).slice(0, 120) }) }
    }
    results.push(evidence)
  }
} catch (cause) {
  console.error(String(cause && cause.stack || cause))
  results = bundle.plan.map(test => test.steps.map(() => ({ status: 'not_run', detail: ('Runner error: ' + String(cause.message || cause)).slice(0, 120) })))
} finally { if (browser) await browser.close() }
const passed = results.filter(test => test.every(step => step.status === 'pass')).length
const allPassed = new Set(bundle.plan.map(test => test.criterionIndex)).size === bundle.criteria.length && passed === bundle.criteria.length
fs.writeFileSync(output, JSON.stringify({ version: 'artifact-ci-v1', snapshotSha, testRunId: bundle.testRunId, browserVersion, results, allPassed }, null, 2))
