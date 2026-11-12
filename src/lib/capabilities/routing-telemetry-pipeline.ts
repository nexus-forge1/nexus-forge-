import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type SampleArgs = FunctionArgs<typeof api.scopeBFunctionsBatchOne.recordProviderLatencySample>;
type FailureArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.recordFailureClassification>;
type RouteArgs = FunctionArgs<typeof api.scopeBFunctionsBatchOne.filterDynamicRouteEligibility>;

/**
 * Persists an idempotency-keyed latency sample, optionally classifies a failure,
 * then reads degradation and route-eligibility signals. It returns telemetry
 * and a bounded fallback recommendation; it does not dispatch provider traffic.
 */
export async function recordTelemetryAndResolveRouting(
  client: ConvexReactClient,
  input: {
    sample: SampleArgs;
    failure?: FailureArgs;
    route: RouteArgs;
    p95ThresholdMs?: number;
    degradationWindowSize?: number;
  },
) {
  const sampleId = await client.mutation(
    api.scopeBFunctionsBatchOne.recordProviderLatencySample,
    input.sample,
  );

  let failureId: unknown = null;
  if (input.failure) {
    failureId = await client.mutation(
      api.scopeBFunctionsBatchTwo.recordFailureClassification,
      input.failure,
    );
  }

  const [degradation, alert, routing] = await Promise.all([
    client.query(api.scopeBFunctionsBatchOne.calculateSystemDegradation, {
      windowSize: input.degradationWindowSize ?? 50,
      p95ThresholdMs: input.p95ThresholdMs ?? 3000,
    }),
    client.query(api.scopeBFunctionsBatchTwo.evaluateDegradationAlert, {
      p95ThresholdMs: input.p95ThresholdMs ?? 3000,
    }),
    client.query(api.scopeBFunctionsBatchOne.filterDynamicRouteEligibility, input.route),
  ]);

  const blocked = degradation.degraded || alert.level === "critical";
  return {
    sampleId,
    failureId,
    degradation,
    alert,
    routing,
    routingRecommendation: blocked ? routing.eligible : routing.eligible,
    dispatchAllowed: !blocked && routing.eligible.length > 0,
    blockers: [
      ...(degradation.degraded ? degradation.reasons : []),
      ...(alert.alert ? alert.reasons : []),
      ...(routing.eligible.length === 0 ? ["No eligible provider route remains."] : []),
    ],
  };
}
