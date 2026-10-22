# Step 2 of 17 — validation plans to observed outcomes

Status: implemented and functionally accepted with controlled synthetic Testing evidence. Next: Step 3, research evidence quality. Payment activation stays Step 17.

## Implemented

Each saved validation plan now accepts immutable observation receipts: optional measured value, sample size, completed measurement period, completeness declaration, reported stop condition, measurement method and evidence/reference notes.

The server resolves plan ownership, freezes the original metric/unit/target/direction in the receipt and derives the target assessment and next decision:
- Target met: complete measurement, nonzero sample, in-window period and threshold reached.
- Target not accepted: threshold missed or operator reports a stop condition.
- Inconclusive: partial/unmeasured data or period ending outside the original review window.
- A reported stop takes precedence over both a passing numeric value and late/partial data.

Periods before plan creation, future endpoints, invalid ranges, nonfinite/out-of-range values, fractional/negative samples and empty methods/evidence are rejected. Values are bounded to ±1 trillion, samples to 0–1 billion and evidence text to 3000 characters. A complete observation requires a value and nonzero sample.

Fifty receipts per plan are admitted transactionally; identical payloads return the existing receipt even at capacity. Conflicting and negative observations remain visible. No public update/delete endpoint is added. Forms preserve rejected drafts and lazily load receipts when the plan panel opens.

## Controlled acceptance

See evidence/step2-observations-20261018.json. The existing isolated QA identity created one new uniquely identified plan, linked read-only to its earlier controlled strategy. Three synthetic observations produced failed, inconclusive and passed assessments against the frozen target of five. The exact first submission was retried idempotently. All three were displayed in Manifest and remained after reload. The earlier strategy JSON and billing account/usage stayed unchanged. No inference, checkout, customer event or strategy promotion occurred. QA session signed out and browser closed; new controlled records retained.

Full regression passed 634 tests across 113 files. Nine backend and three interface tests cover threshold directions, ownership, immutable snapshots, stop/partial/late precedence, invalid data, conflicting receipts, draft recovery and concurrent limits.

## Evidence limits

These are operator-reported observations, not independently authenticated source facts or actual customer outcomes. Numeric target attainment does not prove causality, market demand or statistical sufficiency. Sample minimums beyond a nonzero complete observation were not preregistered in existing plans, so none are invented. Measurements can overlap and samples are not aggregated. Reported stop conditions are declarations, not automatic monitoring.

Saving observations changes neither the strategy's existing outcome fields nor mission approval, billing, learning policy or execution state. Evidence review and independent replication remain explicit decisions. Representative outcomes and sustained empirical evaluation remain later checklist steps.
