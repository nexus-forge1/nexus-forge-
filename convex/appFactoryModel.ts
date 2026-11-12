import { defineTable } from 'convex/server'
import { v, ConvexError } from 'convex/values'
export const appFactoryKinds = ['database-migration-plan','browser-qa-plan','integration-contract'] as const
export const appFactoryStatuses = ['draft','in-review','accepted','blocked'] as const
export const appFactoryTables = {
  appFactoryExecutionRuns: defineTable({
    ownerKey: v.string(), projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'),
    draftKey: v.string(), draftRevision: v.number(), draftDigest: v.string(), sourceCommit: v.optional(v.string()),
    kind: v.union(v.literal('database-migration-plan'),v.literal('browser-qa-plan'),v.literal('integration-contract')),
    status: v.union(v.literal('prepared'),v.literal('running'),v.literal('blocked'),v.literal('completed'),v.literal('failed'),v.literal('cancelled')),
    operatorReference: v.string(), summary: v.string(), evidenceReference: v.optional(v.string()),
    createdAt: v.number(), updatedAt: v.number(), completedAt: v.optional(v.number()),
  }).index('by_project_created',['projectId','createdAt']).index('by_draft',['draftId']).index('by_owner',['ownerKey']),
  appFactoryQaCiReceipts: defineTable({
    ownerKey: v.string(), projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'), draftKey: v.string(), draftRevision: v.number(), draftDigest: v.string(), workflowRunId: v.string(), runUrl: v.string(), sourceCommit: v.string(), snapshotSha: v.string(), checkId: v.number(), conclusion: v.union(v.literal('success'),v.literal('failure')), reportDigest: v.string(), criteriaCount: v.number(), screenshotCount: v.number(), pageErrorsCount: v.number(), allPassed: v.boolean(), verifiedAt: v.number(),
  }).index('by_draft',['draftId']).index('by_owner',['ownerKey']).index('by_run',['workflowRunId']),
  appFactoryQaRuns: defineTable({
    ownerKey: v.string(), projectId: v.id('studioProjects'), draftId: v.id('appFactoryDrafts'), draftKey: v.string(), draftRevision: v.number(), draftDigest: v.string(), targetUrl: v.string(), runner: v.string(), runReference: v.string(), commitSha: v.string(), outcome: v.union(v.literal('passed'),v.literal('failed'),v.literal('partial')), cases: v.array(v.object({ key: v.string(), status: v.union(v.literal('passed'),v.literal('failed'),v.literal('not-run')), evidenceReference: v.string(), note: v.string() })), createdAt: v.number(),
  }).index('by_project_created',['projectId','createdAt']).index('by_draft',['draftId']).index('by_owner',['ownerKey']),
  appFactoryDrafts: defineTable({
    ownerKey: v.string(), projectId: v.id('studioProjects'), draftKey: v.string(), kind: v.union(v.literal('database-migration-plan'),v.literal('browser-qa-plan'),v.literal('integration-contract')), title: v.string(), revision: v.number(), previousRevisionId: v.optional(v.id('appFactoryDrafts')), featureId: v.optional(v.id('featurePackages')), sourceDigest: v.optional(v.string()), content: v.string(), contentDigest: v.string(), status: v.union(v.literal('draft'),v.literal('in-review'),v.literal('accepted'),v.literal('blocked')), evidenceReference: v.optional(v.string()), reviewNote: v.optional(v.string()), createdAt: v.number(),
  }).index('by_project_created',['projectId','createdAt']).index('by_project_key_revision',['projectId','draftKey','revision']).index('by_owner',['ownerKey']),
}
export function deriveQaOutcome(cases: { status: 'passed' | 'failed' | 'not-run' }[]): 'passed' | 'failed' | 'partial' {
  const executed = cases.filter(testCase => testCase.status !== 'not-run')
  if (executed.length === 0 || cases.some(testCase => testCase.status === 'not-run')) return 'partial'
  if (executed.some(testCase => testCase.status === 'failed')) return 'failed'
  return 'passed'
}
export function validateQaTargetUrl(value: string) {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new ConvexError('Target must be an absolute URL.') }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname)))) throw new ConvexError('Target URL must use HTTPS (or local loopback) without credentials, query strings or fragments.')
  return parsed.origin + parsed.pathname
}
export function validateDraftKey(value: string) {
  const key = value.trim()
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(key)) throw new ConvexError('Draft key must be 3–64 lowercase letters, digits or hyphens.')
  return key
}
export function validateDraftContent(content: string) {
  if (!content.trim() || new TextEncoder().encode(content).length > 65536 || content.includes('\0')) throw new ConvexError('Draft must contain 1–65536 UTF-8 bytes without NUL.')
  try { JSON.parse(content) } catch { throw new ConvexError('Draft content must be valid JSON.') }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|sk_live_[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{30,}/.test(content)) throw new ConvexError('Remove credential-like values before saving.')
  return content
}
