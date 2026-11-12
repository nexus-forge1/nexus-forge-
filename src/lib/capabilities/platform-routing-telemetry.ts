import type { ConvexReactClient } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export type ProviderOutcome = 'success' | 'timeout' | 'error'
export type FailureCategory = 'timeout' | 'provider' | 'validation' | 'policy' | 'capacity' | 'unknown'
export type FailureSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Records one idempotency-keyed provider observation in both latency and routing
 * telemetry, classifies failures when needed, then evaluates aggregate degradation
 * and SLO alert state before returning a bounded fallback plan.
 */
export async function coordinatePlatformRoutingTelemetry(
  client: ConvexReactClient,
  input: {
    provider: string
    role: string
    latencyMs: number
    outcome: ProviderOutcome
    requestKey: string
    evidenceRef: string
    failure?: { category: FailureCategory; severity: FailureSeverity; summary: string; evidence: string[] }
    windowSize?: number
    p95ThresholdMs?: number
    minimumSamples?: number
    failureRateThreshold?: number
    providersForRole?: string[]
  },
) {
  if (!Number.isFinite(input.latencyMs) || input.latencyMs < 0) throw new Error('Latency must be a finite non-negative number')
  const latencySampleId = await client.mutation(api.scopeBFunctionsBatchOne.recordProviderLatencySample, {
    provider: input.provider,
    role: input.role,
    latencyMs: input.latencyMs,
    outcome: input.outcome,
    source: 'capability-coordinator',
    requestKey: input.requestKey,
  })
  const routingSampleId = await client.mutation(api.scopeBFunctionsBatchOne.recordRoutingLatency, {
    provider: input.provider,
    role: input.role,
    latencyMs: input.latencyMs,
    succeeded: input.outcome === 'success',
    requestKey: input.requestKey + '-routing',
    evidenceRef: input.evidenceRef,
  })
  const failureId = input.outcome === 'success' || !input.failure
    ? null
    : await client.mutation(api.scopeBFunctionsBatchTwo.recordFailureClassification, {
        requestKey: input.requestKey + '-failure',
        category: input.failure.category,
        severity: input.failure.severity,
        summary: input.failure.summary,
        evidence: input.failure.evidence,
      })
  const [degradation, alert, slo, fallback, eligible] = await Promise.all([
    client.query(api.scopeBFunctionsBatchOne.calculateSystemDegradation, {
      windowSize: input.windowSize,
      p95ThresholdMs: input.p95ThresholdMs,
    }),
    client.query(api.scopeBFunctionsBatchTwo.evaluateDegradationAlert, {
      minimumSamples: input.minimumSamples,
      failureRateThreshold: input.failureRateThreshold,
      p95ThresholdMs: input.p95ThresholdMs,
    }),
    client.query(api.scopeBFunctionsBatchTwo.aggregateSloMetrics, {}),
    client.query(api.scopeBFunctionsBatchOne.resolveProviderFallbackOrder, {
      role: input.role,
      includeUnmeasured: false,
    }),
    client.query(api.scopeBFunctionsBatchOne.filterDynamicRouteEligibility, {
      role: input.role,
      providers: input.providersForRole ?? [input.provider],
      maxLatencyMs: input.p95ThresholdMs,
      requireRecentSuccess: true,
    }),
  ])
  return {
    trace: { requestKey: input.requestKey, latencySampleId, routingSampleId, failureId },
    telemetry: { degradation, alert, slo },
    routing: {
      fallbackOrder: fallback.fallbackOrder,
      eligible: eligible.eligible,
      excluded: eligible.excluded,
      dispatchAllowed: !alert.alert && eligible.eligible.length > 0,
    },
  }
}
