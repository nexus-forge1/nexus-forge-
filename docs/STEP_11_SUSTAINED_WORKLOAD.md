# Step 11 — sustained multi-user workload

Status: ACCEPTED · BOUNDED WORKLOAD.

The one actual run completed in 597,387 ms with a 595,118 ms active observation span (approximately ten minutes). Two distinct server-confirmed OTP users each completed 360 reads, forty owned notes and three Intent Compiler actions. All six actual provider invocations used Groq, saved separate intent drafts and retained usage metadata. All three paired inference pulses overlapped across users; four logical workers were configured. Independently rounded sample intervals are not treated as exact network-concurrency measurements.

| Measured operation | Planned/completed | Failures | Observed p95 | Target |
| --- | --- | --- | --- | --- |
| Private reads | 720 / 720 | 0 | 78 ms | ≤2,000 ms |
| Owned note writes | 80 / 80 | 0 | 80 ms | ≤2,000 ms |
| Real intent compilations | 6 / 6 | 0 | 1,971 ms | ≤45,000 ms |

Alpha prepaid credit changed from 999 to 996 test cents; beta from 1,000 to 997 test cents. Each account had exactly three new settled invocation holds, three test cents charged, zero held funds and zero unresolved charges. Existing missions, memories, usage rows and prior payment receipts were unchanged. Every new note/intent belonged to its correct owner; foreign mission reads were denied before and after.

Two new zero-budget draft missions remain as evidence: alpha k973tp2v8nrqpn2g1dhy5wfjc98gh6y8 and beta k97b7b09hzbs6hpyc4z6xc68ks8ghtar. Notes and generated intent drafts are synthetic QA data. Both sessions signed out and closed.

Receipt: docs/evidence/step11-mixed-workload-20261018.json, including compact timing samples, per-user counts, invocation IDs and model-token counts, billing invariants and source hashes. Full regression: 750 tests / 134 files passed. Strict TypeScript and overall checks passed before the run. Backend source remained unchanged throughout measurement.

Next: Step 12, final security and resource review. Its source notes and zero-advisory production dependency observation are preparatory evidence, not security acceptance.

## Reviewed engineering profile

Profile: docs/workload-profiles/mixed-two-user-testing.json. Harness: scripts/run-mixed-workload.mjs and mixed-workload-core.mjs.

Two distinct genuine reserved-email OTP accounts use the verified Testing deployment. Each has a separately server-verified test-credit account. Alpha reuses its existing test balance; beta completed one new $10 test-only prepaid checkout with synthetic test data. There is no subscription, real customer charge or real-payment activation.

Four logical workers comprise two concurrent mixed read/write lanes and two scheduled inference lanes. Each account performs 120 five-second cycles, each reading owned mission selection, provider usage and memory; every third cycle inserts one uniquely named, mission-bound synthetic note. Three inference pulses per account occur at 0, 300 and 595 seconds and use the existing Intent Compiler with real configured providers.

Planned measured totals: 720 private reads, 80 owned notes, six real inference actions. Minimum active observation span: 595 seconds, approximately ten minutes. Engineering p95 targets: reads and writes ≤2 seconds; inference ≤45 seconds. Zero observed operation failures are accepted. Read timeouts are ten seconds; inference timeouts sixty seconds.

Every inference requires its existing $1 authorization. The maximum accepted debit is $3 per account for three actions; actual settled charges are verified separately. There is no automatic top-up or action retry.

## Safety and evidence

The profile is fenced to Testing and exact finite bounds. Independent server-owned mission records establish distinct users. Existing missions, memories and provider-ledger rows are hashed before the run; existing records are not mutated. Each new draft and each note key is checked against the initial owned scope. Only two new draft missions and their own synthetic notes/intent drafts are created.

The process keeps genuine bearer sessions in memory only. Reports contain timing samples, controlled record IDs, aggregate billing evidence and redacted provider usage, never bearer tokens or private response bodies. Checkpoints remain non-passing while running. An exclusive report file and unique fixture scope prevent accidental reruns.

Any unconfirmed action or mutation stops new scheduled work; already-running requests may finish. The harness never retries uncertain writes or inference. Partial, short, stopped or empty runs cannot pass. Foreign mission access must be denied before and after. Every new note and saved intent must match the correct owner. New inference receipts, settled holds and balance deductions must agree exactly; no unresolved or held amounts may remain.

Four harness tests cover Testing/budget fences, incomplete and short observations, distinct-user requirements, latency/error/ownership/accounting rejection, and stopping later operations after an uncertain write.

## Reused evidence and limits

The short four-distinct-account read burst and populated-ledger reads are retained in AUTHENTICATED_WORKLOAD_VALIDATION.md and INFERENCE_COMPLETENESS_2026_10_17.md. They are not relabeled as sustained multi-user inference.

This profile is a bounded engineering observation with synthetic drafts and notes. It does not establish enterprise capacity, an SLA, a customer workload distribution, the full Council/build/deploy loop under load, provider invoice reconciliation or managed-host interruption behavior. Payment activation remains Step 17.
