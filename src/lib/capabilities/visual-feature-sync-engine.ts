import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type DiffArgs = FunctionArgs<typeof api.scopeAFunctions.diffVisualRevisions>;
type CompileArgs = FunctionArgs<typeof api.scopeAFunctions.compileFeaturePackage>;

/**
 * Computes the server-owned revision diff and compiles a feature artifact only
 * when the caller's expected source digest matches the selected visual revision.
 * Source integrity and ownership are rechecked by the backend mutation.
 */
export async function synchronizeVisualToFeature(
  client: ConvexReactClient,
  input: {
    revisions: DiffArgs;
    compile: CompileArgs;
    requireNoChangedFields?: boolean;
  },
) {
  const diff = await client.query(api.scopeAFunctions.diffVisualRevisions, input.revisions);
  const blockers: string[] = [];

  if (input.compile.featureId !== diff.featureId) {
    blockers.push("Selected feature package does not match the visual revision feature.");
  }
  if (input.compile.expectedDigest !== diff.candidateDigest) {
    blockers.push("Expected package digest does not match the candidate visual revision.");
  }
  if (input.requireNoChangedFields && diff.changedFields.length > 0) {
    blockers.push("Visual changes remain; review the diff before compiling.");
  }

  if (blockers.length) return { diff, compiled: null, blockers };

  const compiled = await client.mutation(api.scopeAFunctions.compileFeaturePackage, input.compile);
  return { diff, compiled, blockers };
}
