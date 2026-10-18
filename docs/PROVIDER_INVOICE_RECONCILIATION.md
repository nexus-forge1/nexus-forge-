# Provider invoice reconciliation

AI Providers now includes a private invoice-comparison panel next to the durable invocation ledger. Enter a completed UTC period (start inclusive, end exclusive), provider, declared USD usage amount, invoice/export reference and private evidence reference. Confirm scope only when the amount covers this operator's usage for that provider and exact period, excluding taxes, subscriptions and unrelated account usage. A shared provider-account invoice needs a correctly scoped export.

The server derives ownership from authentication and reads at most 201 owner/time-indexed invocations. More than 200 is rejected rather than truncated. Periods are capped at 93 days; each owner can retain 100 immutable comparisons. Record Capacity shows this admission limit. History is cursor-paginated and retains exact invocation IDs, selected report ordinals/model/charge values and calculated totals at comparison time. Later reports cannot silently rewrite old evidence; record another comparison after review.

Statuses:

- Scope not confirmed: invoice/export scope has not been attested.
- Incomplete ledger: no matching reports, an unknown/invalid charge, unfinished invocation, accounting gap, or an invocation finishing at/after the exclusive period end.
- Variance needs review: complete captured reports differ from the declared amount by at least half a cent.
- Matches declared amount: arithmetic difference below half a cent with complete captured reports and attested scope. This is not provider invoice authentication or production accounting certification.

Unassigned missing attempts are conservatively retained as uncertainty for every provider because their provider cannot be inferred. An explicit reported zero is retained; missing charges never become zero. Ledger selection uses invocation start time, not provider invoice posting time, which must be considered when matching exports.

No external invoice is fetched. Do not paste credentials or publish raw invoices. References are displayed as text, not fetched or opened automatically. The feature does not change customer balances, charges, provider routing, inference reservations, delivery, release gates or approval records.

Validation: eight backend tests cover ownership/authentication, exact boundaries, missing attempts, unknown costs, immutable snapshots, explicit zero, variance, financial noninterference, bounded scans and history pagination. Three UI tests cover loading/empty states, explicit UTC interpretation, failed-save draft preservation, provenance and history pagination. Existing provider-accounting and billing checks passed. Controlled real Testing CLI acceptance saved a clearly labeled non-invoice test comparison, read the same snapshot twice, and confirmed a separate administrative identity had no records. That administrative check did not represent a real invoice, real user session or live provider billing reconciliation. A later fresh reserved OTP browser session submitted a uniquely labeled controlled comparison through the actual form, reloaded, and verified persistence with Scope not confirmed. At a 375px viewport, document width remained 375px. The comparison is retained only under that new test identity because history is immutable; no existing user records were changed. The session was signed out and closed. This browser acceptance does not establish genuine invoice authenticity.
