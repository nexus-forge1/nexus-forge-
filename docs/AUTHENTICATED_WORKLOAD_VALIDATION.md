# Authenticated workload validation

## Implemented runner

Run `pnpm check:capacity:authenticated` from the existing project after setting:

- NEXUS_LOAD_PROFILE_PATH: path to the reviewed JSON profile.
- NEXUS_LOAD_SESSION_TOKENS: a JSON array containing one authorized signed-in bearer session token per worker, supplied privately through the process environment. Never commit tokens, put them in the profile or include them in a report.
- NEXUS_LOAD_REPORT_PATH: optional private output path; defaults to /tmp/nexus-authenticated-capacity.json with mode 0600.

The sample docs/workload-profiles/authenticated-read-testing.json proposes four workers, thirty reads each, one-second minimum pacing, two-second p95 and zero observed errors. These are explicit engineering targets for a short bounded observation, not an accepted customer workload or SLA.

Before running, verify the current environment mapping using Macaly get_project. The runner rejects deployment origins other than the known Testing/Live mapping and rejects mismatched environment labels. If the platform moves deployments, review and update this mapping explicitly before using any session token. A Testing session must not be reused for Live.

Every worker must pass a read-only private-query session preflight before any workload starts. A failed or missing session produces no pass and starts no workload. The runner reads the providerUsage:history endpoint, at most five records per request. It does not call inference, write missions, send messages, dispatch deliveries, modify billing or expire reservations.

## Bounds and report

Concurrency: 1–8 workers. Iterations: 1–120 per worker. Minimum pacing: 1 second; maximum configured pacing 10 seconds. Request timeout: 1–15 seconds. Responses are capped at 256 KiB, redirects are rejected, and five observed failures stop new work. Already-running requests can finish. This is a finite request/pacing budget, not a hard wall-clock limit; slow requests can extend elapsed time.

The report contains the reviewed targets, deployment/environment, aggregate p95/error rate, numeric worker/iteration timing observations, start/end times and an explicit scope. Empty, malformed, partial or stopped workloads cannot pass. Tokens, user identities, private records and upstream error bodies are never retained. CLI setup or session failure replaces any previous report at the chosen path with a dated explicit failure receipt; file permissions are enforced as 0600. Worker count does not establish distinct user count; multiple tokens may belong to the same account.

## Verification and remaining evidence

Fourteen targeted harness/release/roadmap tests passed. An actual CLI negative check confirmed missing sessions are rejected, a stale passing report is replaced with failure and file permissions are 0600. Seven controlled harness tests cover project/environment fencing, workload bounds, empty/partial/slow/error-budget assessment, preflight failure, secret/response redaction, early-stop behavior and the distinction between workers and users. These are harness correctness tests, not actual authenticated capacity observations. A real reserved-email OTP Testing account subsequently completed the sample profile: four workers sharing its session, 120/120 private-ledger reads, zero failures, p95 89 ms, elapsed 29.045 seconds. The account had no provider-invocation history. Aggregate receipt: docs/evidence/authenticated-read-workload-20261017.json. This closes a short single-account authenticated-read observation; a subsequent four-distinct-account reserved OTP run also passed 120/120 reads with zero failures and p95 78 ms in 29.044 seconds. Each worker used a separate account and independently authenticated session. Full compact observations and cleanup are retained in docs/evidence/distinct-otp-workload-20261017.json. All four sessions were signed out and closed. All accounts had empty provider ledgers; populated-history and broader representative acceptance remain pending. The test session was signed out and the browser closed. Inference/write/delivery interruption, sustained full-service capacity and business workload targets remain separate production requirements.

## Production dependency audit

On October 17, 2026 the existing pnpm production lockfile audit reported zero info/low/moderate/high/critical advisories across the production graph (306 dependencies plus 91 optional dependencies). This is an observed package advisory result, not a whole-application security certification. No package update or second lockfile was needed.
