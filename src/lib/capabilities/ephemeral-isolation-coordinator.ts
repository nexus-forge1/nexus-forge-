import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type RuntimeArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.evaluateRuntimeCompatibility>;
type LeaseArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.requestEphemeralEnvironment>;
type ExpirationArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.calculatePreviewLeaseExpiration>;
type SecretArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.generateMaskedSecretReferences>;

export async function coordinateEphemeralIsolation(
  client: ConvexReactClient,
  input: { runtime: RuntimeArgs; lease: LeaseArgs; expiration: ExpirationArgs; secrets: SecretArgs },
) {
  if (input.expiration.ttlMs !== input.lease.ttlMs) {
    return { runtime: null, expiration: null, secrets: null, leaseId: null, eligible: false, blockers: ["Lease duration differs between the requested lease and expiration check."] };
  }
  const rawLike = input.secrets.references.some(({ reference }) =>
    !/^(secret|vault|env|ref):[A-Za-z0-9._:/-]+$/.test(reference)
  );
  if (rawLike) {
    return { runtime: null, expiration: null, secrets: null, leaseId: null, eligible: false, blockers: ["Only opaque secret references are accepted; raw secret values are forbidden."] };
  }

  const [runtime, expiration, secrets] = await Promise.all([
    client.query(api.scopeDFunctionsBatchTwo.evaluateRuntimeCompatibility, input.runtime),
    client.query(api.scopeDFunctionsBatchTwo.calculatePreviewLeaseExpiration, input.expiration),
    client.query(api.scopeDFunctionsBatchTwo.generateMaskedSecretReferences, input.secrets),
  ]);
  if (!runtime.compatible || runtime.missingFeatures.length > 0) {
    return { runtime, expiration, secrets, leaseId: null, eligible: false, blockers: runtime.missingFeatures.map((feature) => "Runtime feature unavailable: " + feature) };
  }
  if (expiration.expired || expiration.remainingMs <= 0) {
    return { runtime, expiration, secrets, leaseId: null, eligible: false, blockers: ["Preview lease expiration check says the lease is expired."] };
  }
  if (secrets.count !== input.secrets.references.length || secrets.references.some((reference) => !reference.masked.startsWith("[MASKED:"))) {
    return { runtime, expiration, secrets, leaseId: null, eligible: false, blockers: ["Secret reference masking did not satisfy the expected bounded output contract."] };
  }

  const leaseId = await client.mutation(api.scopeDFunctionsBatchTwo.requestEphemeralEnvironment, input.lease);
  return { runtime, expiration, secrets, leaseId, eligible: true, blockers: [] as string[] };
}
