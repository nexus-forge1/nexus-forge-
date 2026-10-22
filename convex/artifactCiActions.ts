"use node"
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { v } from 'convex/values'
import {boundedText} from './boundedResponse'
import { action } from './_generated/server'
import { internal } from './_generated/api'
import { artifactCiRepository, artifactCiWorkflow, artifactCiCheckName, exactRunId, verifyExactCiReport } from './artifactCiProvenance'
import { validateBrowserPlan } from './artifactTestPlan'
const apiBase = 'https://api.github.com/repos/' + artifactCiRepository
function client(write: boolean) {
  const token = process.env.GITHUB_ACCESS_TOKEN
  if (write && !token) throw new Error('GITHUB_ACCESS_TOKEN is required for explicit snapshot publication and CI dispatch')
  return async (path: string, method = 'GET', body?: unknown, allowed: number[] = []) => {
    const response = await fetch(apiBase + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (allowed.includes(response.status)) return { status: response.status }
    if (!response.ok) throw new Error('GitHub artifact CI request failed (HTTP ' + response.status + '). Review repository access and retry.')
    if (response.status === 204) return null
    return JSON.parse(await boundedText(response,1024*1024))
  }
}
export const publish = action({
  args: { testRunId: v.id('artifactTestRuns'), publishSnapshot: v.literal(true) }, returns: v.object({ workflowUrl: v.string() }),
  handler: async (ctx, args): Promise<{ workflowUrl: string }> => {
    const operatorId = await ctx.runQuery(internal.permissions.currentOperator, {})
    if (!operatorId) throw new Error('Authenticated operator session required')
    const row = await ctx.runQuery(internal.artifactCi.context, { testRunId: args.testRunId, operatorId, currentRequired: true })
    validateBrowserPlan(row.criteria, row.plan)
    const bundle = JSON.stringify({ version: 'artifact-ci-v1', testRunId: row._id, artifactId: row.artifactId, missionSnapshot: row.missionSnapshot, artifactSnapshot: row.artifactSnapshot, criteria: row.criteria, plan: row.plan })
    if (Buffer.byteLength(bundle) > 200000) throw new Error('This CI snapshot exceeds the 200 KB limit.')
    const snapshotSha = createHash('sha256').update(bundle).digest('hex')
    const branch = 'nexus-forge-checks/' + row._id, bundlePath = 'nexus-forge-checks/' + row._id + '/bundle.json'
    const workflowUrl = 'https://github.com/' + artifactCiRepository + '/actions/workflows/nexus-forge-artifact-checks.yml?query=' + encodeURIComponent('branch:' + branch)
    if (row.ci?.dispatchedAt) return { workflowUrl }
    const gh = client(true)
    let state = row.ci
    if (!state) {
      const main = await gh('/git/ref/heads/main')
      await gh('/git/refs', 'POST', { ref: 'refs/heads/' + branch, sha: main.object.sha }, [422])
      const existing = await gh('/contents/' + bundlePath + '?ref=' + encodeURIComponent(branch), 'GET', undefined, [404])
      let commitSha: string
      if (existing.status === 404) {
        const created = await gh('/contents/' + bundlePath, 'PUT', { message: 'test: publish exact artifact CI snapshot ' + row._id, content: Buffer.from(bundle).toString('base64'), branch })
        commitSha = created.commit.sha
      } else {
        if (Buffer.from(existing.content.replace(/\s/g, ''), 'base64').toString('utf8') !== bundle) throw new Error('Existing GitHub snapshot differs; no content was overwritten.')
        commitSha = (await gh('/git/ref/heads/' + branch)).object.sha
      }
      state = { branch, commitSha, snapshotSha, bundlePath, publishedAt: Date.now() }
      await ctx.runMutation(internal.artifactCi.published, { testRunId: row._id, state })
    }
    const head = await gh('/git/ref/heads/' + state.branch)
    if (head.object.sha !== state.commitSha || state.snapshotSha !== snapshotSha) throw new Error('Published CI branch or snapshot changed. Do not dispatch this record.')
    await gh('/actions/workflows/nexus-forge-artifact-checks.yml/dispatches', 'POST', { ref: state.branch, inputs: { snapshot_path: state.bundlePath, snapshot_sha: state.snapshotSha } })
    await ctx.runMutation(internal.artifactCi.published, { testRunId: row._id, state: { ...state, dispatchedAt: Date.now() } })
    return { workflowUrl }
  },
})
export const importRun = action({
  args: { testRunId: v.id('artifactTestRuns'), runUrl: v.string() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const operatorId = await ctx.runQuery(internal.permissions.currentOperator, {})
    if (!operatorId) throw new Error('Authenticated operator session required')
    const row = await ctx.runQuery(internal.artifactCi.context, { testRunId: args.testRunId, operatorId, currentRequired: false })
    if (!row.ci?.dispatchedAt) throw new Error('Publish and dispatch this saved snapshot first.')
    const runId = exactRunId(args.runUrl.trim()), gh = client(false)
    const run = await gh('/actions/runs/' + runId)
    if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Invalid GitHub attempt evidence')
    const jobs = await gh('/actions/runs/' + runId + '/attempts/' + run.run_attempt + '/jobs?per_page=100')
    const checks = await gh('/commits/' + row.ci.commitSha + '/check-runs?check_name=' + encodeURIComponent(artifactCiCheckName) + '&per_page=100')
    const report = verifyExactCiReport({ ...row, ci: row.ci }, run, jobs, checks)
    await ctx.runMutation(internal.artifactCi.verified, { testRunId: row._id, snapshotSha: row.ci.snapshotSha, runUrl: report.runUrl, attempt: report.attempt, checkId: report.checkId, results: report.results })
    return null
  },
})
