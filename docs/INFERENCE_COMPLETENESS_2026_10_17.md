# Real inference and incomplete-draft correction — October 17, 2026

## Actual Testing exercise

A fresh reserved-email OTP account completed a real test-only one-time $10 prepaid checkout through the browser. The server confirmed one paid test receipt and $10 available before inference. Two concurrent Manifest blueprint requests completed and saved results; each required its existing bounded structured-strategy retry. Four actual provider invocations completed using Groq and Cloudflare, with usage metadata persisted. All four billing holds settled at one test cent each: $9.96 remained, zero reserved funds and zero unresolved charges. No subscription, real customer charge or business delivery occurred. Token-rate calculations are not provider invoices.

Four workers then read that account's populated four-invocation ledger: 120/120 passed, zero failures, p95 75 ms, elapsed 29.047 seconds. The ledger was unchanged after the read workload. This is a small single-account workload, not sustained multi-user inference certification.

## Observed content defect and fix

One saved draft lacked Novelty hypothesis and Next action despite successful provider execution, three saved structured strategies and settled billing. Execution success therefore did not establish content completeness. The retained evidence marks content acceptance false and overall acceptance partial.

Manifest now checks the eleven required top-level sections, normalizing Unicode hyphens and excluding headings inside code fences. Missing sections produce an Incomplete AI draft warning and prevent guided blueprint-to-mission handoff. Complete section presence is only a structural check, not semantic, factual or execution verification. The existing incomplete draft was verified in the real browser: warning visible, missing Next action displayed, zero Create a governed mission handoff links. No paid inference was repeated to repair it.

Future synthesis responses include optional blueprintComplete/missingSections fields. New saved blueprint values retain the section check. Historical drafts are assessed when displayed without rewriting user records. Selecting saved history now also selects that draft's exact receipt key and resets strategy review, preventing mismatched handoff provenance.

The explicit one-time acceptance runner requires a genuine Testing bearer session, exactly one verified $10 test-credit receipt, and an empty ledger before starting. It issues two actions once, never retries uncertain actions, records usage/billing outcomes, and separately requires returned content-completeness flags for full acceptance. Session credentials remain in process memory. No provider, payment or auth keys were changed.

The funded test session was signed out and closed. Its test credit, blueprints, strategies, usage and test-payment receipt are retained under its own identity; existing user records were not modified. Aggregate receipt: docs/evidence/real-inference-populated-ledger-20261017.json.

## Release validation

Full regression passed 566 tests across 104 files. The required TypeScript/application check passed. Eighteen targeted completeness/persistence/receipt tests passed, including an incomplete provider fixture that returns missing-section flags while making exactly one provider call. Testing deployment accepted the additive API fields as backward-compatible. The actual incomplete saved draft was checked in the real browser without new inference.

## Remaining production work

Representative longer multi-user inference/write workloads, full application interruption/recovery, recurring backup evidence, actual provider invoices and payment business activation remain open. No incomplete draft was labeled a verified business outcome or repaired through automatic paid replay.
