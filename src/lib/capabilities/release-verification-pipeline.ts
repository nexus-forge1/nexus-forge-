import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type StageArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.transitionReleaseStagingState>;
type DossierArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.compileProductionReadinessDossier>;
type SealArgs = FunctionArgs<typeof api.scopeBFunctionsBatchTwo.recordVerificationSeal>;

export async function coordinateReleaseVerification(
  client: ConvexReactClient,
  input: {
    stage: StageArgs;
    dossier: DossierArgs;
    seal: Omit<SealArgs, "dossierDigest" | "releaseKey">;
  },
) {
  if (input.stage.releaseKey !== input.dossier.releaseKey) {
    return { staged: null, dossier: null, seal: null, verified: false, blockers: ["Release key mismatch between staging request and readiness dossier."] };
  }

  const staged = await client.mutation(api.scopeBFunctionsBatchTwo.transitionReleaseStagingState, input.stage);
  if (input.stage.toState !== "staged") {
    return { staged, dossier: null, seal: null, verified: false, blockers: ["Release staging transition did not end in staged state."] };
  }

  const dossier = await client.action(api.scopeBFunctionsBatchTwo.compileProductionReadinessDossier, input.dossier);
  if (!dossier.ready || dossier.blockers.length > 0) {
    return { staged, dossier, seal: null, verified: false, blockers: dossier.blockers.length ? dossier.blockers : ["Readiness dossier is not ready."] };
  }

  const verifiedStage = await client.mutation(api.scopeBFunctionsBatchTwo.transitionReleaseStagingState, {
    ...input.stage,
    requestKey: input.stage.requestKey + ":verified",
    fromState: "staged",
    toState: "verified",
    evidence: [...input.stage.evidence, dossier.dossierDigest],
    note: "Readiness dossier passed; verification seal follows.",
  });

  const seal = await client.mutation(api.scopeBFunctionsBatchTwo.recordVerificationSeal, {
    ...input.seal,
    requestKey: input.seal.requestKey,
    releaseKey: input.stage.releaseKey,
    dossierDigest: dossier.dossierDigest,
    evidence: [...input.stage.evidence, dossier.dossierDigest],
  });

  return { staged, verifiedStage, dossier, seal, verified: true, blockers: [] as string[] };
}
