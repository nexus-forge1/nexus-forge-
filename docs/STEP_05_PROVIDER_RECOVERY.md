# Step 5 — Council, providers and recovery

Acceptance scope: supported durable Council continuation and provider fallback safety. Existing accepted continuation evidence in COUNCIL_CONTINUATION.md is retained: original inputs and dependency ordering, immutable confirmed answers, worker fencing, bounded retries and explicit operator continuation. No automatic replay of pending, failed or answerless stages.

## Defect corrected
The provider router previously tried another configured provider after every error. A timeout, lost transport/body, server error, malformed JSON or empty successful response can follow remote inference. It now stops with a review message for these uncertain cases. Only explicit request-rejection HTTP statuses 400/401/403/404/405/413/415/422/429 permit automatic fallback. 408/409/425 and all 5xx stop conservatively. This is an application routing rule, not a provider invoice or exactly-once guarantee.

Provider accounting retains failed/missing usage receipts; existing billing settlement keeps unknown costs under review and blocks additional funded execution until reviewed. Failed durable runner stages cannot be silently replayed. A response whose accounting write fails is never regenerated. Direct operator requests remain distinct requests and require explicit action.

## Verification
- 20 deterministic router fault/rejection cases: transport loss, body interruption, invalid JSON, empty content, seven ambiguous HTTP statuses and nine allowed rejection statuses.
- Updated unusable-answer/accounting-failure regression asserts one inference only.
- Added durable accounting integration: lost response, one fetch, failed/missing receipt, same-stage replay blocked before another fetch.
- Existing Council continuation, billing unknown-cost review and authorization regressions reused in the full suite.
- Faults are controlled mocks, not production provider outages. No paid inference or checkout required.

## Limits
Managed-host interruption and compatible deployment rollback remain Step 14's access dependency. Actual provider invoice reconciliation remains Step 15. Mistral/Hugging Face remain deferred; OpenRouter remains manual only. Payment activation remains Step 17. This step does not certify remote providers never bill rejected requests or guarantee exactly-once execution across their infrastructure.
