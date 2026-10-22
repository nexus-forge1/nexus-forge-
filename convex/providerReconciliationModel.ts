import { v } from 'convex/values'
export const reconciliationInput = {
  provider: v.union(v.literal('groq'), v.literal('cerebras'), v.literal('cloudflare'), v.literal('openrouter'), v.literal('mistral'), v.literal('huggingface')),
  periodStart: v.number(), periodEnd: v.number(), invoiceReference: v.string(),
  invoiceUsd: v.number(), evidenceReference: v.string(), scopeConfirmed: v.boolean(),
}
export const reconciliationFields = {
  ...reconciliationInput, ownerKey: v.string(), createdAt: v.number(),
  status: v.union(v.literal('incomplete'), v.literal('scope-mismatch'), v.literal('variance'), v.literal('matched-declared')),
  ledgerUsd: v.number(), varianceUsd: v.number(), invocationCount: v.number(),
  matchedReports: v.number(), missingCharges: v.number(), unresolvedInvocations: v.number(),
  invocationIds: v.array(v.id('providerInvocations')),
  reports: v.array(v.object({ invocationId: v.id('providerInvocations'), ordinal: v.number(), model: v.string(), capturedAt: v.number(), reportedCostUsd: v.optional(v.number()) })),
}
