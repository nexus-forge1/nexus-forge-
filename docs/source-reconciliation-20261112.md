# NEXUS FORGE source reconciliation

Macaly source: `594be0f021128b3011fb8facd615f46851e9ee62`.
GitHub parent: `a30f786ad9eaca00fdb7a093a32dd100fe9777ee`.

This snapshot reconciles current deployed application source, tests, build configuration, lockfiles, scripts and static text assets. It includes the compiler recursion repair and UI/backend contract fixes. The deployed source passed `.sandbox/check-errors --strict`; the preview build succeeded, and the signed-out live welcome and mobile account-mode transition were verified. No automated test runner was executed in this reconciliation.

Counts: 439 new and 144 modified source/configuration files, five static text files, and seven files removed because they are absent from current Macaly source. All 583 transferred source/configuration blobs were independently checked against Git blob SHA-1 values. Existing repository delivery workflows, documents and delivery/outcome receipts remain untouched. Platform files, environment files, credentials and database exports are excluded.

The credential-like string detected by screening occurs only in the factory operations negative test for rejecting secret-like input. It is a rejection fixture, not an application credential.

Live application: https://www.network-x-ai.com
Deployment: `dpl_CGm4jtXyE3mgFBXZFiyxENGNkMQP` (READY).

Payment activation B17 remains locked. This source synchronization does not establish capacity, host recovery, provider invoice reconciliation or full production readiness. Secrets and external service configuration are intentionally not stored here and must be provided separately when reproducing the app.
