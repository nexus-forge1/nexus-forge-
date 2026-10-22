# Step 4 of 17 — memory and learning effectiveness

Status: implemented and accepted for bounded evidence-review functionality and controlled retrieval evaluation. Next: Step 5, Council/providers/recovery. Payments remain Step 17.

## Existing work reused

Research & Memory already recorded server-observed content-search versus newest-five retrieval with operator relevance labels. Verified Learning Engine already preserved reviewed-lesson handoffs and matched before/after cost, readiness and product observations. Those tools were retained.

## Added repeated-evidence review

Verified Learning Engine now reviews 2–20 selected existing receipts of one evidence type. Sources must be privately owned and use the protected retrieval-evaluation or strategy-reuse-comparison categories. Client input supplies receipt references and comparability notes/attestation, never numeric scores.

Retrieval precision@5, recall@5 and reciprocal rank are recomputed from frozen result IDs and expected labels. Duplicate ranked IDs/labels and repeated normalized questions within the same scope are rejected as independent units. Distinct wording does not independently establish different semantic tasks.

Reuse reviews group the same lesson, strategy, version, metric, unit, target and direction; product comparisons additionally match method, sample size and observation duration. Reused baseline/candidate measurements and repeated candidate missions are rejected. Numeric benefits and outcomes are recomputed rather than trusting recorded outcome labels. Existing source receipts already enforce handoff and within-pair compatibility.

Per-metric means and counts preserve improved, regressed and unchanged observations. Any regression flags the review even if the average benefit is positive. The review never changes memory selection, strategy approval, learning policy, mission execution or billing.

Reviews retain original source JSON, selection and notes outside the memories table, so review history does not displace actual lessons. Source snapshots are bounded to 300000 UTF-8 bytes; twenty immutable reviews per owner, all reachable in history. Full snapshots load on explicit inspection. Identical sources and notes are idempotent after canonicalizing database field ordering; concurrent admission is transactional.

## Controlled actual-query acceptance

See evidence/step4-learning-review-20261018.json. One uniquely identified QA mission held a new nine-lesson synthetic corpus. Earlier records were untouched. Three distinct actual indexed retrieval evaluations used explicit QA relevance labels against the same corpus:

- Two exact-term questions retrieved an older relevant lesson missed by the newest-five baseline.
- One semantic-match question missed its relevant lesson while the recency baseline included it.
- Mean precision@5: baseline 0.0667; content search 0.1333.
- Mean recall@5 and reciprocal rank: baseline 0.3333; candidate 0.6667.
- Every metric retained two gains and one regression; overall status regression-observed, despite positive means.
- Reordered identical review submission returned the same receipt. Three frozen source snapshots were inspectable, and the exact review survived reload.
- Billing and model usage remained unchanged. No inference, checkout or policy promotion occurred.
- QA identity signed out; browser closed; controlled records retained.

The lexical semantic-match miss is a retained negative finding, not hidden or relabeled success. This establishes the evaluation tool's behavior and the observed fixture rankings, not superiority or general memory effectiveness. Representative corpora, independent labels and repeated real product/lesson outcomes remain empirical work in later workload/journey acceptance.

Fifteen new pure-model, backend and interface tests cover score recomputation, negative findings despite positive means, incompatible/reused measurements, unchanged evidence, private access, snapshots, quotas, canonical retries and failed-draft preservation. Reuse branch acceptance uses controlled receipt fixtures; no real spending reduction or causal lesson benefit is claimed. Full regression passed 667 tests across 119 files. Final strict checks are required before publication. The source picker exposes the latest twenty receipts per evidence kind; each review covers only its explicitly selected sources.
