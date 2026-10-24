import type { ConvexReactClient } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../scope-e-api'

type SampleArgs = FunctionArgs<typeof api.scopeEFunctions.ingestProviderPricingSample>
type RankingArgs = FunctionArgs<typeof api.scopeEFunctions.calculateArbitrageRanking>
type RuleArgs = FunctionArgs<typeof api.scopeEFunctions.setArbitrageSwitchRule>

export type ArbitrageRoutingInput = {
  sample?: SampleArgs
  ranking: RankingArgs
  rule?: RuleArgs
}

export async function coordinateArbitrageRouting(client: ConvexReactClient, input: ArbitrageRoutingInput) {
  const blockers: string[] = []
  if (input.sample) {
    if (!input.sample.provider.trim() || !input.sample.model.trim() || !input.sample.requestKey.trim()) blockers.push('Provider, model, and request keys are required.')
    if (![input.sample.inputCostPerMillion, input.sample.outputCostPerMillion, input.sample.latencyMs, input.sample.tokensPerSecond].every(value => Number.isFinite(value) && value >= 0)) blockers.push('Pricing, latency, and throughput values must be finite and non-negative.')
  }
  if (input.ranking.maxSamples !== undefined && (!Number.isInteger(input.ranking.maxSamples) || input.ranking.maxSamples < 1 || input.ranking.maxSamples > 500)) blockers.push('Ranking sample limit must be between 1 and 500.')
  if (input.ranking.costWeight !== undefined && (!Number.isFinite(input.ranking.costWeight) || input.ranking.costWeight < 0 || input.ranking.costWeight > 1)) blockers.push('Cost weight must be between 0 and 1.')
  if (input.rule && (!input.rule.ruleKey.trim() || !input.rule.requestKey.trim())) blockers.push('Switch rule and request keys are required.')
  if (input.rule && input.ranking.ruleKey && input.rule.ruleKey !== input.ranking.ruleKey) blockers.push('Ranking and switch-rule keys must match.')
  if (input.rule && (!Number.isFinite(input.rule.maxLatencyMs) || input.rule.maxLatencyMs < 1 || !Number.isFinite(input.rule.maxCostPerMillion) || input.rule.maxCostPerMillion < 0 || !Number.isFinite(input.rule.minTokensPerSecond) || input.rule.minTokensPerSecond < 0 || !Number.isFinite(input.rule.costWeight) || input.rule.costWeight < 0 || input.rule.costWeight > 1)) blockers.push('Switch rule thresholds are outside their allowed bounds.')
  if (blockers.length) return { status: 'blocked' as const, blockers, sample: null, ranking: null, rule: null }

  const sample = input.sample ? await client.mutation(api.scopeEFunctions.ingestProviderPricingSample, input.sample) : null
  const rule = input.rule ? await client.mutation(api.scopeEFunctions.setArbitrageSwitchRule, input.rule) : null
  const rankingArgs: RankingArgs = {
    ...input.ranking,
    ...(input.rule ? { ruleKey: input.rule.ruleKey } : {}),
  }
  const ranking = await client.query(api.scopeEFunctions.calculateArbitrageRanking, rankingArgs)
  return { status: 'completed' as const, blockers, sample, ranking, rule }
}
