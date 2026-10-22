import {boundEvidence,evidenceWindow,requireEvidenceRoom} from './evidenceAdmission'
import { artifactCiState } from './artifactCiValidators'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { requireOperator, requireOwnedMission } from './permissions'
import { browserRunnerVersion, extractAcceptanceCriteria, summarizeBrowserRun } from './artifactTestPlan'

const action = v.union(v.literal('fill'), v.literal('click'), v.literal('assertText'), v.literal('assertTextEquals'), v.literal('assertValue'), v.literal('assertVisible'), v.literal('assertInvalid'))
const planValidator = v.array(v.object({ criterionIndex: v.number(), steps: v.array(v.object({ action, selector: v.string(), value: v.string() })) }))
const resultsValidator = v.array(v.array(v.object({ status: v.union(v.literal('pass'), v.literal('fail'), v.literal('not_run')), detail: v.string() })))
const row = v.object({
  _id: v.id('artifactTestRuns'), _creationTime: v.number(), missionId: v.id('missions'), artifactId: v.id('artifacts'), operatorId: v.string(),
  runnerVersion: v.string(), missionSnapshot: v.string(), artifactSnapshot: v.string(), criteria: v.array(v.string()),
  ci: v.optional(artifactCiState), plan: planValidator, results: resultsValidator, passed: v.number(), failed: v.number(), notRun: v.number(), covered: v.number(), total: v.number(), allPassed: v.boolean(), createdAt: v.number(),
})
// Keep the pre-v2 return contract for already loaded clients. Unsupported plans
// are omitted rather than silently changing their assertion semantics.
const legacyAction = v.union(v.literal('fill'), v.literal('click'), v.literal('assertText'), v.literal('assertValue'), v.literal('assertVisible'), v.literal('assertInvalid'))
const legacyPlan = v.array(v.object({ criterionIndex: v.number(), steps: v.array(v.object({ action: legacyAction, selector: v.string(), value: v.string() })) }))
const legacyRow = v.object({ ...row.fields, plan: legacyPlan })
export const list = query({
  args: { artifactId: v.id('artifacts') }, returns: v.array(legacyRow),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get('artifacts', args.artifactId)
    if (!artifact) throw new Error('Artifact not found')
    await requireOwnedMission(ctx, artifact.missionId)
    const rows = await ctx.db.query('artifactTestRuns').withIndex('by_artifact', q => q.eq('artifactId', args.artifactId)).order('desc').take(10)
    return rows.filter(item => item.plan.every(test => test.steps.every(step => step.action !== 'assertTextEquals'))) as Infer<typeof legacyRow>[]
  },
})
export const listWithExactText = query({
  args: { artifactId: v.id('artifacts') }, returns: v.array(row),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get('artifacts', args.artifactId)
    if (!artifact) throw new Error('Artifact not found')
    await requireOwnedMission(ctx, artifact.missionId)
    return ctx.db.query('artifactTestRuns').withIndex('by_artifact', q => q.eq('artifactId', args.artifactId)).order('desc').take(10)
  },
})
export const record = mutation({
  args: { artifactId: v.id('artifacts'), missionSnapshot: v.string(), artifactSnapshot: v.string(), plan: planValidator, results: resultsValidator },
  returns: v.id('artifactTestRuns'),
  handler: async (ctx, args) => {
    const operatorId = await requireOperator(ctx)
    const artifact = await ctx.db.get('artifacts', args.artifactId)
    if (!artifact) throw new Error('Artifact not found')
    const mission = await requireOwnedMission(ctx, artifact.missionId)
    if (artifact.content !== args.artifactSnapshot || mission.mission !== args.missionSnapshot) throw new Error('Artifact or mission changed. Run the checks again against the current saved records.')
    const criteria = extractAcceptanceCriteria(mission.mission)
    const summary = summarizeBrowserRun(criteria, args.plan, args.results)
    boundEvidence(args,'Browser test evidence',512*1024)
    const prior=await evidenceWindow(ctx.db.query('artifactTestRuns').withIndex('by_artifact',q=>q.eq('artifactId',args.artifactId)),'Browser test evidence',20)
    const old=prior.find(r=>r.runnerVersion===browserRunnerVersion&&r.missionSnapshot===args.missionSnapshot&&r.artifactSnapshot===args.artifactSnapshot&&JSON.stringify(r.plan)===JSON.stringify(args.plan)&&JSON.stringify(r.results)===JSON.stringify(args.results));if(old)return old._id
    requireEvidenceRoom(prior,'Browser test evidence',20)
    const id = await ctx.db.insert('artifactTestRuns', { ...args, missionId: artifact.missionId, operatorId, criteria, ...summary, runnerVersion: browserRunnerVersion, createdAt: Date.now() })
    await ctx.runMutation(internal.audit.record, { missionId: artifact.missionId, type: 'artifact', action: 'browser_checks_recorded', status: summary.allPassed ? 'reported_pass' : 'needs_review', detail: `Browser-reported functional evidence: ${summary.passed}/${summary.total} criteria passed, ${summary.failed} failed, ${summary.notRun} not run; ${summary.covered}/${summary.total} covered. Receipt ${id}. Approval and delivery state unchanged.` })
    return id
  },
})
