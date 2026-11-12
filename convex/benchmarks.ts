import { v } from 'convex/values'
import {boundedText} from './boundedResponse'
import type { Id } from './_generated/dataModel'
import { action, internalMutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { requireOperator } from './permissions'
import { benchmarkSuite } from './artifactBenchmarkCatalog'
import { parseBenchmarkRunUrl, verifyBenchmarkMetadata } from './benchmarkProvenance'
const fields = {
  operatorId: v.string(), repository: v.string(), runId: v.string(), runUrl: v.string(), commitSha: v.string(), attempt: v.number(),
  workflowPath: v.string(), jobName: v.string(), jobConclusion: v.string(), runConclusion: v.string(), suiteVersion: v.string(),
  outcome: v.union(v.literal('passed'), v.literal('failed'), v.literal('not_run')),
}
export const history = query({
  args: {}, returns: v.array(v.object({ _id: v.id('benchmarkReceipts'), _creationTime: v.number(), ...fields, recordedAt: v.number() })),
  handler: async ctx => {
    const operatorId = await requireOperator(ctx)
    return ctx.db.query('benchmarkReceipts').withIndex('by_operator', q => q.eq('operatorId', operatorId)).order('desc').take(20)
  },
})
export const recordInternal = internalMutation({
  args: fields, returns: v.id('benchmarkReceipts'),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('benchmarkReceipts').withIndex('by_operator_run', q => q.eq('operatorId', args.operatorId).eq('runId', args.runId).eq('attempt', args.attempt)).first()
    if (existing) {
      if (existing.commitSha !== args.commitSha || existing.outcome !== args.outcome || existing.jobConclusion !== args.jobConclusion) throw new Error('The recorded CI receipt cannot be replaced with conflicting provenance.')
      return existing._id
    }
    return ctx.db.insert('benchmarkReceipts', { ...args, recordedAt: Date.now() })
  },
})
export const verifyRun = action({
  args: { runUrl: v.string() }, returns: v.id('benchmarkReceipts'),
  handler: async (ctx, args): Promise<Id<'benchmarkReceipts'>> => {
    const operatorId = await ctx.runQuery(internal.permissions.currentOperator, {})
    if (!operatorId) throw new Error('Authenticated operator session required')
    const { runId } = parseBenchmarkRunUrl(args.runUrl)
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    if (process.env.GITHUB_ACCESS_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_ACCESS_TOKEN
    const base = 'https://api.github.com/repos/' + benchmarkSuite.repository + '/actions/runs/' + runId
    const read = async (url: string) => {
      const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error('GitHub CI evidence lookup failed (HTTP ' + response.status + '). Check access or rate limits and retry.')
      return JSON.parse(await boundedText(response,512*1024))
    }
    const run = await read(base)
    if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('GitHub did not return a valid run attempt.')
    const jobs = await read(base + '/attempts/' + run.run_attempt + '/jobs?per_page=100')
    const receipt = verifyBenchmarkMetadata(runId, run, jobs)
    return ctx.runMutation(internal.benchmarks.recordInternal, { ...receipt, operatorId })
  },
})
