# Step 12 — resource admission increment

Status: RESOURCE FIXES VERIFIED; broader Step 12 security/resource acceptance remains OPEN.

## Changes

All three mission-creation paths now share an atomic owner cap and mission-contract bounds: Mission Console, portfolio recommendation acceptance and recommended-mission creation. Saved missions of every status count; lowering a limit preserves existing evidence and blocks only new admission.

New public manual-memory saves have an independent atomic cap, counted through small admission receipts. Existing notes are retained and excluded; internal/generated evidence follows its existing feature rules and is not blocked by the manual-save cap. Content is limited to 65,536 UTF-8 bytes; metadata, references and finite confidence are validated. The note and its admission receipt commit in one transaction.

Mission and manual-save limits are separate optional policy fields, defaulting to 100 each and independently configurable from 1–100. Existing experiment/integration maxRecords settings retain their meaning. Older policy calls preserve the new fields. Identical policy saves do not patch timestamps or append redundant audit entries.

The resource view loads thirteen owner-count queries independently instead of scanning unrelated potentially large reports in a combined UI transaction. The old overview endpoint remains compatible for published clients. Source attempts (10/research), claims (100/mission), validation plans (20/strategy), observations (50/plan) and trials (100/protocol) appear as separate parent-specific limits, never as invented account-wide counts or remaining slots. Retained learning reviews show their fixed owner limit of twenty.

Expected quota rejections now display intentional operator-facing error data. Generic transport details use review-saved-state guidance. A completed Council result remains retained if a subsequent manual-memory save is rejected; its warning and reviewed-lesson messages expose the actionable resource error.

## Actual Testing verification

One fresh genuine reserved-email OTP identity, with an initially empty mission and memory scope, set its two new limits to one through the mobile UI. Concurrent ordinary mission attempts admitted exactly one and rejected the competing request. Concurrent manual-note attempts admitted exactly one and rejected the competing request. Caller-supplied owner keys were ignored. An oversized Unicode note and the alternate portfolio-create path were rejected.

The configured cap appeared as 1/1, zero new slots and Limit reached for both collections. A new Mission Console form attempt was rejected without adding a mission. Its initial generic transport message was corrected and rechecked: the visible error now names the record limit and Security & Resilience. The page fit a 375-pixel viewport.

All thirteen count rows were ready; all five parent-specific policies were displayed. Counts and cap states persisted after reload. The saved mission and note were unchanged after rejections, and test billing was unchanged. No inference, checkout or delivery occurred. The session signed out and closed with no uncaught browser errors.

Controlled fixtures retained: mission k9770b3h6wzh39zrr8hw0khrvh8ggyx5 and note kh7b222qz81ztppgnanpx5wkc58ghhcp. No existing user record was modified. Evidence: docs/evidence/step12-record-admission-20261018.json. Harness: scripts/check-record-admission.mjs.

## Verification and remaining review

Targeted tests verify concurrent admission, all three mission paths, owner isolation, UTF-8 bounds, historical-record retention, separate policy defaults, legacy policy updates, no-op audit preservation, all count queries, parent-scope labeling and actionable errors. Final full regression passed 764 tests across 138 files. Strict TypeScript, overall checks and backward-compatible Testing deployment passed.

Step 12 stays active. Complete the remaining public-function/ownership inventory, secret and client exposure review, webhook and egress review, broader audit growth/admission controls and legacy aggregate read fan-out. Per-record and new manual-save limits are not total storage, request-rate or hosting-cost limits. The retained combined overview is a compatibility endpoint, not proof of high-volume capacity.

The current zero-advisory production dependency receipt remains in docs/evidence/step12-dependency-audit-20261018.json. It does not certify the whole application. Existing team, provider, accounting and controlled workload evidence remains accepted within its documented scope; no duplicate paid benchmark was run.

Payment activation remains Step 17. Workspace SSO, managed-host interruption and actual provider invoices remain explicit release dependencies.
