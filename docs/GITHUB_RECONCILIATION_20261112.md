# GitHub reconciliation — November 12, 2026

PR #152 reconciles the current NEXUS FORGE application, validation fixtures, operational scripts and build configuration with GitHub. Environment/platform files and private backup or billing material are excluded. Existing GitHub workflows and historical delivery/outcome evidence are retained. Both Python backup verification helpers match the operational repository nexus-forge1/no-dispatch.

## Resulting behavior

The app uses the selected six Ollama Cloud models. Controlled provider fixtures now emit Ollama's completed-message and usage-count protocol. Graph tests use the V2 read contracts while legacy API compatibility remains intact. Comparison fixtures cover all twelve model/prompt requests, immutable checkpoints, missing usage and admission failures. Diagnostics verify bounded responses, secret-free errors, retired-provider rejection and account-wide stop behavior. Ownership, replay, resource and billing invariants remain asserted.

UI fixtures match current document labels, notification acknowledgment language, authentication query identities, archive lifecycle and registered workspace count. Six existing dedicated routes now have metadata, and three duplicate page titles are distinct. The sixteen-page operating guide remains intact; retired multimodal features remain absent.

The research text extractor handles whitespace in script/style end tags and truncated blocks, and decodes supported entities once. Provider fixture URL checks use exact hostnames. CodeQL cleared the four earlier findings on the security repair; final-head GitHub validation is required before merge.

## Validation

The user authorized targeted tests and further regression validation on November 12. Full isolated suite: 1,311 passed, zero failed, 208 files. Targeted follow-up: 55 passed, zero failed. TypeScript compilation and the production build pass. No test called a real AI provider or modified Live data.

Clean-install repairs declare esbuild 0.27.0 directly and apply scoped pnpm overrides for audited transitive dependencies. The production audit reports zero findings at every severity. Frozen pnpm installation succeeds without regenerating its lockfile. pnpm-lock.yaml and pnpm-workspace.yaml are authoritative for existing CI; the retained historical npm lockfile does not encode pnpm overrides.

## Operational limits

These software checks do not establish current-release representative capacity, full-service recovery or provider invoice reconciliation. Historical bounded workload and isolated restore receipts remain valid only for their recorded scopes. Both current sandbox and publish targets report Live; no production load or data restore was performed. B17 payment activation remains locked. Merge and deployment status are reported separately after exact-head checks complete.
