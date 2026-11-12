import { v, ConvexError } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
import { requireOperator } from './permissions'
import { ownedProject } from './studio'
import { boundedText } from './boundedResponse'

const repository = 'nexus-forge1/nexus-forge-'
const workflowPath = '.github/workflows/nexus-forge-artifact-checks.yml'
const checkName = 'NEXUS artifact snapshot v1'

export function matchesDraftBinding(binding: any, source: { draftKey: string; revision: number; contentDigest: string }) {
  return binding?.kind === 'browser-qa-plan' && binding.draftKey === source.draftKey && binding.revision === source.revision && binding.contentDigest === source.contentDigest
}

export function parseRunUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new ConvexError('Enter a valid GitHub Actions run URL.') }
  const match = url.pathname.match(/^\/nexus-forge1\/nexus-forge-\/actions\/runs\/([1-9][0-9]*)\/?$/)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !match) throw new ConvexError('Use a NEXUS FORGE GitHub Actions run URL without query parameters.')
  return { id: match[1], url: 'https://github.com/' + repository + '/actions/runs/' + match[1] }
}
async function github(path: string) {
  const response = await fetch('https://api.github.com/repos/' + repository + path, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!response.ok) throw new ConvexError('Could not verify this GitHub Actions run (HTTP ' + response.status + '). Confirm it is public and completed.')
  return JSON.parse(await boundedText(response, 1024 * 1024))
}

export const listByDraft = query({
  args: { projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts') },
  returns: v.array(v.object({
    _id: v.id('appFactoryQaCiReceipts'), draftRevision: v.number(), draftDigest: v.string(),
    workflowRunId: v.string(), runUrl: v.string(), sourceCommit: v.string(), snapshotSha: v.string(),
    conclusion: v.union(v.literal('success'),v.literal('failure')), reportDigest: v.string(),
    criteriaCount: v.number(), screenshotCount: v.number(), pageErrorsCount: v.number(),
    allPassed: v.boolean(), verifiedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const ownerKey = await requireOperator(ctx)
    const project = await ownedProject(ctx, args.projectId)
    if (project.ownerKey !== ownerKey) throw new ConvexError('Project unavailable')
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.ownerKey !== ownerKey || draft.projectId !== project._id || draft.kind !== 'browser-qa-plan') throw new ConvexError('Browser QA plan unavailable')
    return (await ctx.db.query('appFactoryQaCiReceipts').withIndex('by_draft', q => q.eq('draftId', args.draftId)).order('desc').take(20))
      .map(({ ownerKey: _ownerKey, projectId: _projectId, draftId: _draftId, draftKey: _draftKey, _creationTime, ...row }) => row)
  },
})

export const storeVerified = internalMutation({
  args: {
    projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'), expectedRevision: v.number(), expectedDigest: v.string(),
    workflowRunId: v.string(), runUrl: v.string(), sourceCommit: v.string(), snapshotSha: v.string(), checkId: v.number(),
    conclusion: v.union(v.literal('success'),v.literal('failure')), reportDigest: v.string(),
    criteriaCount: v.number(), screenshotCount: v.number(), pageErrorsCount: v.number(), allPassed: v.boolean(),
  },
  returns: v.id('appFactoryQaCiReceipts'),
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId)
    if (!draft || draft.projectId !== args.projectId || draft.kind !== 'browser-qa-plan' || draft.revision !== args.expectedRevision || draft.contentDigest !== args.expectedDigest) throw new ConvexError('The selected Browser QA draft revision changed during CI verification.')
    const latest = await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', args.projectId).eq('draftKey', draft.draftKey)).order('desc').first()
    if (!latest || latest._id !== draft._id) throw new ConvexError('Only the latest Browser QA draft revision can receive a CI receipt.')
    const duplicate = await ctx.db.query('appFactoryQaCiReceipts').withIndex('by_run', q => q.eq('workflowRunId', args.workflowRunId)).first()
    if (duplicate) {
      if (duplicate.draftId === draft._id && duplicate.snapshotSha === args.snapshotSha && duplicate.reportDigest === args.reportDigest) return duplicate._id
      throw new ConvexError('This GitHub run is already retained against a different source record.')
    }
    return await ctx.db.insert('appFactoryQaCiReceipts', {
      ownerKey: draft.ownerKey, projectId: args.projectId, draftId: draft._id, draftKey: draft.draftKey,
      draftRevision: draft.revision, draftDigest: draft.contentDigest, workflowRunId: args.workflowRunId,
      runUrl: args.runUrl, sourceCommit: args.sourceCommit, snapshotSha: args.snapshotSha, checkId: args.checkId,
      conclusion: args.conclusion, reportDigest: args.reportDigest, criteriaCount: args.criteriaCount,
      screenshotCount: args.screenshotCount, pageErrorsCount: args.pageErrorsCount, allPassed: args.allPassed, verifiedAt: Date.now(),
    })
  },
})

export const importRun = action({
  args: { projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'), expectedRevision: v.number(), expectedDigest: v.string(), runUrl: v.string(), targetApp: v.optional(v.boolean()) },
  returns: v.object({ receiptId: v.id('appFactoryQaCiReceipts'), allPassed: v.boolean(), conclusion: v.union(v.literal('success'),v.literal('failure')), snapshotSha: v.string(), sourceCommit: v.string(), screenshotCount: v.number(), pageErrorsCount: v.number() }),
  handler: async (ctx, args) => {
    const ownerKey = await ctx.runQuery(internal.permissions.currentOperator, {})
    if (!ownerKey) throw new ConvexError('Authenticated operator session required')
    const source = await ctx.runQuery(internal.appFactoryQaCi.context, { projectId: args.projectId, draftId: args.draftId, expectedRevision: args.expectedRevision, expectedDigest: args.expectedDigest, ownerKey })
    if (args.targetApp) return await importTargetAppRun(ctx, args, source)
    const parsed = parseRunUrl(args.runUrl.trim())
    const run = await github('/actions/runs/' + parsed.id)
    if (String(run.id) !== parsed.id || run.html_url !== parsed.url || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository || run.path !== workflowPath || run.status !== 'completed' || !['success','failure'].includes(run.conclusion) || !/^[a-f0-9]{40}$/i.test(run.head_sha ?? '') || !Number.isInteger(run.run_attempt) || run.run_attempt < 1) throw new ConvexError('The run is not a completed NEXUS FORGE exact-artifact CI workflow.')
    const jobs = await github('/actions/runs/' + parsed.id + '/attempts/' + run.run_attempt + '/jobs?per_page=100')
    const checks = await github('/commits/' + run.head_sha + '/check-runs?check_name=' + encodeURIComponent(checkName) + '&per_page=100')
    if (jobs.total_count > 100 || checks.total_count > 100) throw new ConvexError('GitHub returned an oversized CI evidence set.')
    const job = jobs.jobs?.find((item: any) => item.name === 'Exact artifact Chromium checks' && String(item.run_id) === parsed.id && item.status === 'completed')
    const check = checks.check_runs?.find((item: any) => item.name === checkName && item.app?.slug === 'github-actions' && item.head_sha === run.head_sha && item.details_url === parsed.url + '/attempts/' + run.run_attempt && item.status === 'completed')
    if (!job || !check || !['success','failure'].includes(check.conclusion) || typeof check.output?.text !== 'string' || check.output.text.length > 60000) throw new ConvexError('A matching completed Chromium check and bounded report are required.')
    let report: any
    try { report = JSON.parse(check.output.text) } catch { throw new ConvexError('The GitHub check report is not valid JSON.') }
    if (report.version !== 'artifact-ci-v1' || !/^[a-f0-9]{64}$/i.test(report.snapshotSha ?? '') || report.snapshotSha !== check.external_id || report.sourceCommit !== run.head_sha || !matchesDraftBinding(report.draftBinding, source) || !Array.isArray(report.results) || !Array.isArray(report.screenshots) || !Array.isArray(report.pageErrors) || typeof report.allPassed !== 'boolean') throw new ConvexError('The retained report does not match this workflow run, snapshot and exact Browser QA draft revision.')
    if (report.results.length < 1 || report.results.length > 20 || report.screenshots.length !== report.results.length || report.pageErrors.length > 50 || report.screenshots.some((shot: any) => !Number.isInteger(shot.criterionIndex) || !/^[a-f0-9]{64}$/i.test(shot.sha256 ?? '') || !/^case-[0-9]{2}\.png$/.test(shot.file) || !Number.isInteger(shot.bytes) || shot.bytes < 1)) throw new ConvexError('The report has incomplete or malformed screenshot evidence.')
    const resultsPassed = report.results.every((test: any[]) => Array.isArray(test) && test.length > 0 && test.every(step => step?.status === 'pass'))
    const computedPassed = resultsPassed && report.pageErrors.length === 0 && new Set(report.screenshots.map((shot: any) => shot.criterionIndex)).size === report.results.length
    if (report.allPassed !== computedPassed || check.conclusion !== (computedPassed ? 'success' : 'failure')) throw new ConvexError('The report and GitHub check conclusion disagree.')
    const reportDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(check.output.text))
    const hexDigest = Array.from(new Uint8Array(reportDigest), b => b.toString(16).padStart(2, '0')).join('')
    const receiptId = await ctx.runMutation(internal.appFactoryQaCi.storeVerified, {
      projectId: args.projectId, draftId: args.draftId, expectedRevision: source.revision, expectedDigest: source.contentDigest,
      workflowRunId: String(run.id), runUrl: parsed.url, sourceCommit: run.head_sha, snapshotSha: report.snapshotSha,
      checkId: check.id, conclusion: check.conclusion, reportDigest: hexDigest, criteriaCount: report.results.length,
      screenshotCount: report.screenshots.length, pageErrorsCount: report.pageErrors.length, allPassed: computedPassed,
    })
    return { receiptId, allPassed: computedPassed, conclusion: check.conclusion, snapshotSha: report.snapshotSha, sourceCommit: run.head_sha, screenshotCount: report.screenshots.length, pageErrorsCount: report.pageErrors.length }
  },
})

export const context = internalQuery({
  args: { projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'), expectedRevision: v.number(), expectedDigest: v.string(), ownerKey: v.string() },
  returns: v.object({ draftKey: v.string(), revision: v.number(), contentDigest: v.string() }),
  handler: async (ctx, args) => {
    const project = await ownedProject(ctx, args.projectId)
    const draft = await ctx.db.get(args.draftId)
    if (project.ownerKey !== args.ownerKey || !draft || draft.ownerKey !== args.ownerKey || draft.projectId !== project._id || draft.kind !== 'browser-qa-plan' || draft.revision !== args.expectedRevision || draft.contentDigest !== args.expectedDigest) throw new ConvexError('Reload the exact Browser QA draft before importing CI evidence.')
    const latest = await ctx.db.query('appFactoryDrafts').withIndex('by_project_key_revision', q => q.eq('projectId', project._id).eq('draftKey', draft.draftKey)).order('desc').first()
    if (!latest || latest._id !== draft._id) throw new ConvexError('Only the latest Browser QA revision can receive CI evidence.')
    return { draftKey: draft.draftKey, revision: draft.revision, contentDigest: draft.contentDigest }
  },
})


const targetWorkflowPath = '.github/workflows/nexus-forge-target-browser-qa.yml'
const targetCheckName = 'NEXUS target browser QA v1'

export function matchesTargetWorkflowCommit(reportCommit: string, workflowCommit: string) {
  return /^[a-f0-9]{40}$/i.test(reportCommit) && /^[a-f0-9]{40}$/i.test(workflowCommit) &&
    reportCommit.toLowerCase() === workflowCommit.toLowerCase()
}

export function parseTargetQaRunUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new ConvexError('Enter a valid GitHub Actions run URL.') }
  const segments = url.pathname.split('/').filter(Boolean)
  const runId = segments.length === 5 && segments[0] === 'nexus-forge1' && segments[1] === 'nexus-forge-' && segments[2] === 'actions' && segments[3] === 'runs' ? segments[4] : ''
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash || !/^[1-9][0-9]*$/.test(runId)) {
    throw new ConvexError('Use a NEXUS FORGE GitHub Actions run URL without query parameters.')
  }
  return { id: runId, url: 'https://github.com/' + repository + '/actions/runs/' + runId }
}

async function targetGithub(path: string) {
  const response = await fetch('https://api.github.com/repos/' + repository + path, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!response.ok) throw new ConvexError('Could not verify the target-browser GitHub run (HTTP ' + response.status + '). Confirm the run and check are publicly readable.')
  return JSON.parse(await boundedText(response, 1024 * 1024))
}

async function targetSha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function importTargetAppRun(ctx: any, args: any, source: { draftKey: string; revision: number; contentDigest: string }) {
    const parsed = parseTargetQaRunUrl(args.runUrl.trim())
    const run = await targetGithub('/actions/runs/' + parsed.id)
    if (String(run.id) !== parsed.id || run.html_url !== parsed.url || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || !(typeof run.path === 'string' && (run.path === targetWorkflowPath || run.path.startsWith(targetWorkflowPath + '@refs/'))) ||
      run.event !== 'workflow_dispatch' || run.status !== 'completed' || !['success', 'failure'].includes(run.conclusion) ||
      !/^[a-f0-9]{40}$/i.test(run.head_sha ?? '') || !Number.isInteger(run.run_attempt) || run.run_attempt < 1) {
      throw new ConvexError('This is not a completed NEXUS FORGE target-browser QA workflow run.')
    }
    const jobs = await targetGithub('/actions/runs/' + parsed.id + '/attempts/' + run.run_attempt + '/jobs?per_page=100')
    const checks = await targetGithub('/commits/' + run.head_sha + '/check-runs?check_name=' + encodeURIComponent(targetCheckName) + '&per_page=100')
    if (jobs.total_count > 100 || checks.total_count > 100) throw new ConvexError('GitHub returned an oversized target-browser evidence set.')
    const job = jobs.jobs?.find((item: any) => item.name === 'Real target-app Chromium QA' && String(item.run_id) === parsed.id && item.status === 'completed')
    const attemptUrl = parsed.url + '/attempts/' + run.run_attempt
    const check = checks.check_runs?.find((item: any) => item.name === targetCheckName && item.app?.slug === 'github-actions' &&
      item.head_sha === run.head_sha && item.details_url === attemptUrl && item.status === 'completed')
    if (!job || !check || !['success', 'failure'].includes(check.conclusion) || typeof check.output?.text !== 'string' ||
      check.output.text.length > 60000 || !/^[a-f0-9]{64}$/i.test(check.external_id ?? '')) {
      throw new ConvexError('A matching completed target-browser report check with bounded JSON is required.')
    }
    const reportText = check.output.text
    if (await targetSha256Hex(reportText) !== check.external_id.toLowerCase()) throw new ConvexError('The target-browser report digest does not match its GitHub check.')
    let report: any
    try { report = JSON.parse(reportText) } catch { throw new ConvexError('The target-browser report is not valid JSON.') }
    const sourceCommit = String(report.sourceCommit ?? '').toLowerCase()
    const workflowCommit = String(report.workflowCommit ?? '')
    if (!/^[a-f0-9]{40}$/.test(sourceCommit) || !matchesTargetWorkflowCommit(workflowCommit, run.head_sha) ||
      report.version !== 'target-app-browser-qa-v1' ||
      !report.draftBinding || report.draftBinding.draftKey !== source.draftKey ||
      report.draftBinding.revision !== source.revision || report.draftBinding.contentDigest !== source.contentDigest ||
      typeof report.targetOrigin !== 'string' || !Array.isArray(report.routes) || report.routes.length < 1 || report.routes.length > 30 ||
      !Array.isArray(report.pageErrors) || !Array.isArray(report.consoleErrors) || !Array.isArray(report.requestFailures) ||
      typeof report.allPassed !== 'boolean') {
      throw new ConvexError('The report does not match this workflow run and exact saved Browser QA revision.')
    }
    let targetOrigin: string
    try {
      const target = new URL(report.targetOrigin)
      if (target.protocol !== 'https:' || target.origin !== report.targetOrigin || target.username || target.password) throw new Error('invalid')
      targetOrigin = target.origin
    } catch { throw new ConvexError('The report target origin is not a valid public HTTPS origin.') }
    const seenPaths = new Set<string>()
    const routeCases = report.routes.map((route: any, index: number) => {
      if (!route || typeof route.path !== 'string' || !route.path.startsWith('/') || route.path.startsWith('//') ||
        typeof route.url !== 'string' || typeof route.passed !== 'boolean' || !Array.isArray(route.errors) ||
        typeof route.expectedTextFound !== 'boolean' || (route.status !== null && (!Number.isInteger(route.status) || route.status < 100 || route.status > 599)) ||
        (route.screenshot !== undefined && route.screenshot !== 'screenshots/route-' + String(index + 1).padStart(2, '0') + '.png')) throw new ConvexError('A target-browser route result is malformed.')
      const url = new URL(route.url)
      if (url.origin !== targetOrigin || url.pathname !== route.path || url.search || url.hash || seenPaths.has(route.path)) throw new ConvexError('The target-browser route list is inconsistent or cross-origin.')
      seenPaths.add(route.path)
      const hasScreenshot = route.screenshot === 'screenshots/route-' + String(index + 1).padStart(2, '0') + '.png'
      const passed = route.passed && hasScreenshot && route.status >= 200 && route.status < 400 && route.errors.length === 0 && route.expectedTextFound
      return { key: 'route-' + String(index + 1).padStart(2, '0'), status: passed ? 'passed' as const : 'failed' as const,
        evidenceReference: parsed.url, note: route.path + ' · HTTP ' + route.status + (route.errors.length ? ' · ' + route.errors.slice(0, 3).join('; ').slice(0, 600) : '') }
    })
    const noGlobalErrors = report.pageErrors.length === 0 && report.consoleErrors.length === 0 && report.requestFailures.length === 0
    const computedPassed = routeCases.every(item => item.status === 'passed') && noGlobalErrors
    if (report.allPassed !== computedPassed || check.conclusion !== (computedPassed ? 'success' : 'failure') ||
      (run.conclusion === 'success') !== computedPassed || job.conclusion !== run.conclusion) {
      throw new ConvexError('Target-browser report results disagree with the workflow and check conclusions.')
    }
    const reportDigest = await targetSha256Hex(reportText)
    const receiptId = await ctx.runMutation(internal.appFactoryQaCi.storeVerified, {
      projectId: args.projectId, draftId: args.draftId, expectedRevision: source.revision, expectedDigest: source.contentDigest,
      workflowRunId: 'target-app:' + parsed.id + ':' + run.run_attempt, runUrl: parsed.url, sourceCommit,
      snapshotSha: targetOrigin, checkId: check.id, conclusion: check.conclusion,
      reportDigest, criteriaCount: report.routes.length, screenshotCount: report.routes.filter((route: any, index: number) => route.screenshot === 'screenshots/route-' + String(index + 1).padStart(2, '0') + '.png').length,
      pageErrorsCount: report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length,
      allPassed: computedPassed,
    })
    return { receiptId, allPassed: computedPassed, conclusion: check.conclusion, snapshotSha: targetOrigin,
      sourceCommit, screenshotCount: report.routes.filter((route: any, index: number) => route.screenshot === 'screenshots/route-' + String(index + 1).padStart(2, '0') + '.png').length, pageErrorsCount: report.pageErrors.length + report.consoleErrors.length + report.requestFailures.length }
}
