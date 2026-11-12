import type { ConvexReactClient } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";

type TraceArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.classifyIncidentTrace>;
type PatchArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.validateBoundedRepairPatch>;
type ManifestArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.compileComprehensiveAssetManifest>;
type BundleArgs = FunctionArgs<typeof api.scopeDFunctionsBatchTwo.generateDetachedRepositoryBundle>;

export async function coordinateDiagnosticsAndSovereignExit(
  client: ConvexReactClient,
  input: { trace: TraceArgs; patch: PatchArgs; manifest: ManifestArgs; bundle: BundleArgs },
) {
  const [trace, patch, manifest] = await Promise.all([
    client.query(api.scopeDFunctionsBatchTwo.classifyIncidentTrace, input.trace),
    client.query(api.scopeDFunctionsBatchTwo.validateBoundedRepairPatch, input.patch),
    client.action(api.scopeDFunctionsBatchTwo.compileComprehensiveAssetManifest, input.manifest),
  ]);
  if (!patch.valid || patch.blockers.length > 0) {
    return { trace, patch, manifest, bundle: null, eligible: false, blockers: patch.blockers.length ? patch.blockers : ["Bounded repair patch validation failed."] };
  }
  if (manifest.blockedAssets.length > 0 || manifest.manifestDigest !== input.bundle.manifestDigest) {
    return { trace, patch, manifest, bundle: null, eligible: false, blockers: [...manifest.blockedAssets.map((asset) => "Asset is not exportable: " + asset), ...(manifest.manifestDigest !== input.bundle.manifestDigest ? ["Repository bundle manifest digest mismatch."] : [])] };
  }
  if (!input.bundle.excludeSensitive) {
    return { trace, patch, manifest, bundle: null, eligible: false, blockers: ["Detached repository generation must exclude sensitive files."] };
  }

  const bundle = await client.action(api.scopeDFunctionsBatchTwo.generateDetachedRepositoryBundle, input.bundle);
  if (bundle.fileCount !== bundle.files.length || bundle.fileCount === 0) {
    return { trace, patch, manifest, bundle, eligible: false, blockers: ["Detached repository bundle is empty or its file count is inconsistent."] };
  }
  return { trace, patch, manifest, bundle, eligible: true, blockers: [] as string[] };
}
