# Step 9 — Comparison and research evaluations

Accepted scope: reproducible software behavior for named-model comparisons and preregistered paired observations, including positive, negative and inconclusive results. Independent competitor certification, scientific discovery, unseen transfer, AGI and general superiority remain unestablished research claims.

## Changes
- New named-model reports use matched-provider-comparison-v2. Each row is checkpointed before another provider is admitted. Saved rows form an immutable prefix; pending/terminal ownership and frozen case/order checks reject replacements or reordered progress.
- If initial or later provider accounting admission fails, remaining rows are explicitly not_run. An interrupted batch retains its existing report and invocation references instead of losing prior answers. Unstarted cases display Not run, not a zero model score.
- Pending/partial requests cannot resume automatically or replay paid calls. Completed identical requests reuse their receipt. The UI retains an editable visible request key and requires a separate action for a new key, disclosing up to six new billed requests.
- Answer scoring rejects extra JSON fields, nonobject envelopes and Markdown-wrapped output. Existing case-specific string checks and trimmed boundary whitespace remain; wrong answers/types/format remain failures. Historical v1 reports and scores are retained.
- Lab summaries now expose improved/regressed/unchanged paired counts and a separate held-out domain-mean target result. An aggregate target pass does not hide a held-out miss or individual regression.
- Existing frozen thresholds are preserved: the sample minimum applies to the total and every preregistered domain needs coverage. UI and closure text now state that accurately. No retrospective per-domain sample requirement is invented.
- Existing immutable trials, idempotent identical replay, bounded evidence, ownership, quotas and closed-protocol guards remain.

## Deterministic acceptance
Eleven new cases cover:
- one answered call followed by a billing-review admission stop: one outbound mock call, retained answer and five unstarted rows;
- zero initial funding: six unstarted rows and no inference;
- checkpoint ownership, immutable prefixes and blocked pending replay;
- exact answer envelopes;
- aggregate/held-out disagreement, direction normalization, missing domain coverage, regressions and unchanged observations;
- visible held-out miss, stable comparison keys and separate unstarted display.

Full regression: **736 tests / 130 files passed**.

## Deployed controlled protocols
Three fresh owned protocols in Testing exercised seven authored observations:
| Protocol | Observation | Result |
|---|---|---|
| Comparison | Improvements +2 and +3; target +1 | Mean +2.5, target met |
| Science | Improvements -2 and 0; target +1 | Mean -1, target missed; regression and unchanged case retained |
| Generality | Training +10/+10, held-out -1; target +1 | Aggregate +6.333 met; held-out mean missed; one regression retained |

The generality protocol initially had missing held-out coverage. Summary stayed inconclusive and premature closure was refused. After coverage, negative results could be closed and retained. All three protocols rejected conflicting case reuse and new trials after closure, while identical replay remained idempotent.

The actual held-out browser panel showed the target miss before and after reload/reopen. Its downloaded report preserved the closed protocol, three observations, aggregate pass and held-out miss. Billing was unchanged; no AI inference or checkout was made. The controlled session was signed out and closed; only the newly created QA protocols/trials were written.

Evidence: docs/evidence/step9-research-evaluations-20261018.json. Helper: scripts/check-research-evaluations.mjs. The HTTPS evidence locator is deliberately synthetic, and digests identify authored fixture payloads. The locator was not fetched and does not certify external measurements. These numbers are functional test data, not real experimental findings.

## Reused evidence and limits
Existing published policy fixtures and prior actual configured Cloudflare/Groq/Cerebras v1 transport/results are retained in reproducibleBenchmarks.ts and docs/evidence/matched-provider-comparison-20261015.json. No extra paid batch was run merely to repeat accepted transport evidence. New v2 failure/checkpoint/scoring paths were verified with controlled provider responses; no new real-model performance result is claimed.

A checkpoint acknowledges saved progress; a process can still fail after remote work and before its answer is durably confirmed. Pending receipt and invocation accounting require review and cannot automatically retry. Managed-host interruption remains Step 14. Exact-once execution across remote provider infrastructure is not certified.

Operator URLs, digests, labels and frozen domain splits establish recorded provenance and planning discipline, not measurement truth, experimental blindness, causal improvement, statistical significance or independent replication. A single held-out observation is coverage under the existing protocol, not strong transfer evidence. Each feature remains on its dedicated comparison/science/generality page.

Next: Step 10, complete user journey and usability. Step 7 genuine Workspace tenant sign-in, Step 14 managed-host controls and Step 15 actual invoices remain open dependencies. Real payment activation remains Step 17, last.
