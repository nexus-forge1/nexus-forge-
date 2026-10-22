import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { resolvePublicHttps, validatePublicHttps } from './public-https-target.mjs';
import { createPinnedHostResolverRule, isAllowedTargetOrigin } from './target-browser-network-policy.mjs';

const env = process.env;
const required = ['TARGET_URL', 'DRAFT_KEY', 'DRAFT_REVISION', 'DRAFT_DIGEST', 'SOURCE_COMMIT'];
for (const key of required) if (!env[key]) throw new Error(`Missing required environment value: ${key}`);
if (!/^[a-z][a-z0-9-]{2,63}$/.test(env.DRAFT_KEY)) throw new Error('Invalid draft key');
if (!/^[1-9][0-9]{0,5}$/.test(env.DRAFT_REVISION)) throw new Error('Invalid draft revision');
if (!/^[a-f0-9]{64}$/.test(env.DRAFT_DIGEST)) throw new Error('Draft digest must be a SHA-256 hex digest');
if (!/^[a-f0-9]{40}$/.test(env.SOURCE_COMMIT)) throw new Error('Source commit must be a full 40-character Git SHA');

const { url: baseUrl, addresses: targetAddresses } = await resolvePublicHttps(env.TARGET_URL);
// Pin Chromium's resolver to an address already checked above. This prevents a
// second DNS lookup from rebinding the target hostname after validation.
const pinnedAddress = targetAddresses[0].address;
const hostResolverRule = createPinnedHostResolverRule(baseUrl.hostname, pinnedAddress);
const routesInput = env.ROUTES_JSON || '["/"]';
let routes;
try { routes = JSON.parse(routesInput); } catch { throw new Error('ROUTES_JSON must be a JSON array of route paths.'); }
if (!Array.isArray(routes) || routes.length < 1 || routes.length > 30 || routes.some(route => typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || route.includes('\\'))) {
  throw new Error('Provide 1–30 same-origin absolute route paths beginning with /.');
}
const routeUrls = routes.map(route => {
  const url = new URL(route, baseUrl.origin);
  if (url.origin !== baseUrl.origin || url.search || url.hash || url.username || url.password) throw new Error('Routes must remain on the exact target origin and omit query/fragment values.');
  return url;
});
const expectedText = (env.EXPECTED_TEXT || '').trim();
if (expectedText.length > 300) throw new Error('Expected text must be 300 characters or fewer.');
const outDir = path.resolve(env.OUTPUT_DIR || 'qa-output');
await fs.mkdir(path.join(outDir, 'screenshots'), { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: hostResolverRule ? [`--host-resolver-rules=${hostResolverRule}`] : [],
});
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, acceptDownloads: false, serviceWorkers: 'block' });
const page = await context.newPage();
const report = {
  version: 'target-app-browser-qa-v1',
  draftBinding: { draftKey: env.DRAFT_KEY, revision: Number(env.DRAFT_REVISION), contentDigest: env.DRAFT_DIGEST },
  // GITHUB_SHA is supplied by Actions and is independently checked against the run API.
  workflowCommit: env.GITHUB_SHA || '',
  // SOURCE_COMMIT is the operator-declared deployed target revision, not assumed from the workflow revision.
  sourceCommit: env.SOURCE_COMMIT,
  targetOrigin: baseUrl.origin,
  startedAt: new Date().toISOString(),
  browserVersion: browser.version(),
  routes: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  allPassed: false,
};
page.on('pageerror', error => report.pageErrors.push(String(error.message).slice(0, 1000)));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000)); });
page.on('requestfailed', request => report.requestFailures.push({ url: request.url().slice(0, 1000), error: (request.failure()?.errorText || 'request failed').slice(0, 500) }));
await page.route('**/*', async route => {
  try {
    const requestUrl = new URL(route.request().url());
    // The browser is deliberately constrained to the pinned target origin.
    // Validating then allowing arbitrary origins would leave a DNS-rebinding
    // window between the DNS check and Chromium's independent connection.
    if (!isAllowedTargetOrigin(requestUrl.href, baseUrl.origin)) throw new Error('Cross-origin request blocked');
    await validatePublicHttps(requestUrl.href);
    await route.continue();
  } catch {
    await route.abort('blockedbyclient');
  }
});
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
try {
  for (let i = 0; i < routeUrls.length; i++) {
    const url = routeUrls[i];
    await validatePublicHttps(url.href);
    const item = { path: url.pathname, url: url.href, status: null, title: '', bodyTextLength: 0, expectedTextFound: expectedText.length === 0, passed: false, errors: [] };
    try {
      const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      item.status = response?.status() ?? null;
      await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(750);
      item.title = (await page.title()).slice(0, 300);
      const bodyText = ((await page.locator('body').innerText({ timeout: 5000 })) || '').slice(0, 200000);
      item.bodyTextLength = bodyText.length;
      item.expectedTextFound = expectedText.length === 0 || bodyText.includes(expectedText);
      if (new URL(page.url()).origin !== baseUrl.origin) item.errors.push('Navigation redirected outside the exact target origin.');
      if (item.status === null || item.status < 200 || item.status >= 400) item.errors.push(`Unexpected HTTP status: ${item.status}`);
      if (bodyText.trim().length < 1) item.errors.push('Page body was empty.');
      if (!item.expectedTextFound) item.errors.push('Configured expected text was not found.');
      if (report.pageErrors.length) item.errors.push('A page-level JavaScript error was observed during this run.');
      const shotName = `route-${String(i + 1).padStart(2, '0')}.png`;
      await page.screenshot({ path: path.join(outDir, 'screenshots', shotName), fullPage: true, animations: 'disabled', timeout: 15000 });
      item.screenshot = `screenshots/${shotName}`;
      item.passed = item.errors.length === 0;
    } catch (error) {
      item.errors.push(String(error?.message || error).slice(0, 1000));
    }
    report.routes.push(item);
  }
} finally {
  report.finishedAt = new Date().toISOString();
  report.allPassed = report.routes.length > 0 && report.routes.every(item => item.passed) && report.pageErrors.length === 0 && report.consoleErrors.length === 0 && report.requestFailures.length === 0;
  await context.tracing.stop({ path: path.join(outDir, 'trace.zip') });
  await context.close();
  await browser.close();
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ allPassed: report.allPassed, routes: report.routes.length, failed: report.routes.filter(item => !item.passed).length, pageErrors: report.pageErrors.length, report: path.join(outDir, 'report.json') }, null, 2));
if (!report.allPassed) process.exitCode = 1;
