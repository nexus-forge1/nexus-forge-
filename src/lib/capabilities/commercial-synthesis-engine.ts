import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type SignalArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.logInterviewSignal>;
type FunnelArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.aggregateConversionFunnel>;
type EntitlementArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.validatePricingEntitlements>;
type SensitivityArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.calculateCacLtvSensitivity>;

export async function coordinateCommercialSynthesis(
  client: ConvexReactClient,
  input: {
    signal: SignalArgs;
    funnel: FunnelArgs;
    entitlements: EntitlementArgs;
    sensitivity: SensitivityArgs;
  },
) {
  if (input.signal.studyKey !== input.funnel.studyKey) {
    return { entitlements: null, sensitivity: null, signalId: null, funnel: null, eligible: false, blockers: ["Demand signal and funnel study keys must match."] };
  }

  const [entitlements, sensitivity] = await Promise.all([
    client.query(api.scopeDFunctionsBatchTwo.validatePricingEntitlements, input.entitlements),
    client.query(api.scopeDFunctionsBatchTwo.calculateCacLtvSensitivity, input.sensitivity),
  ]);
  if (!entitlements.valid || entitlements.missing.length > 0 || entitlements.unexpected.length > 0) {
    return { entitlements, sensitivity, signalId: null, funnel: null, eligible: false, blockers: [...entitlements.missing.map((x) => "Missing entitlement: " + x), ...entitlements.unexpected.map((x) => "Unexpected entitlement: " + x)] };
  }
  if (sensitivity.scenarios.length === 0 || sensitivity.scenarios.some((scenario) =>
    !Number.isFinite(scenario.ltvCacRatio) || !Number.isFinite(scenario.ltv) || scenario.ltv < 0 || scenario.ltvCacRatio < 0
  )) {
    return { entitlements, sensitivity, signalId: null, funnel: null, eligible: false, blockers: ["CAC/LTV sensitivity scenarios are empty or contain invalid economics."] };
  }

  const signalId = await client.mutation(api.scopeDFunctionsBatchTwo.logInterviewSignal, input.signal);
  const funnel = await client.query(api.scopeDFunctionsBatchTwo.aggregateConversionFunnel, input.funnel);
  return { entitlements, sensitivity, signalId, funnel, eligible: true, blockers: [] as string[] };
}
