# Step 8 — Developer integration support

Accepted scope: private versioned field contracts, explicit public HTTPS GET JSON lookups through hardened egress, and mission-authorized data files on isolated GitHub branches. This does not implement arbitrary package/code installation, general MCP server execution, custom authenticated HTTP services, arbitrary POST/PUT services or an unlimited integration marketplace.

## Changes
- Connector authorization is now checked in the same transaction that admits its immutable runtime receipt. A permission read before admission cannot authorize a request after revocation or contract retirement.
- Successful connector settlement checks the current adapter, package ownership and validation status in the same transaction that records the result. Revoked responses are not released as successful results.
- Lookup inputs retain a visible request key across submissions and errors. The same key plus exact input retrieves an existing completed receipt without another lookup; pending/failed keys and changed input stay blocked. A separate new-key action permits a fresh external call without submitting it automatically. Keys are editable for restoring a known request; they are not automatically persisted across browser reload.
- Gateway results require numeric successful HTTP status, explicit nontruncation, the exact one-hop URL, application/json media type, a string JSON body within 20,000 UTF-8 bytes and the exact declared fields. JSON-like media types, array-to-string coercion, redirect drift, extra fields and malformed envelopes fail closed.
- Receipt settlement failures preserve uncertainty and instruct review instead of retrying the external lookup.
- GitHub execution now rejects completed missions as well as cancelled, review-blocked or unapproved missions. Existing completed write receipts remain readable and reusable; this does not authorize another write.
- The developer page states the supported scope and warns that explicitly entered inputs become receiving-service URL parameters. No credentials or private mission context are automatically forwarded.

## Verification
New deterministic acceptance covers:
- revocation between authorization read and transactional admission;
- revocation during the external request, failed receipt retention and no same-key replay;
- wrong-owner/wrong-adapter settlement and immutable successful receipts;
- nine transport/contract/uncertainty failures, each with only one outbound mock request;
- identical completed-result replay with no second fetch;
- completed mission rejected before any GitHub request;
- four UI cases for stable keys, retained input after failure, explicit new keys and revoked controls.

Full regression: **725 tests / 127 files passed**. Existing GitHub ownership, immutable payload, isolated path rules, uncertain writes, revocation and authorization-before-branch checks passed.

## Deployed controlled JSON lookup
One fresh contract and adapter in Testing called public HTTPBin GET through the real configured egress gateway. The authenticated browser submitted only a synthetic non-sensitive string. Returned args preserved the exact JSON-encoded value. Returned headers contained neither Authorization nor Cookie. Output retained the untrusted-data label.

A second browser submission with the same key returned the identical immutable receipt. Revoking the adapter disabled the page controls and a server action returned the structured authorization denial. Billing remained unchanged; no AI inference, checkout or new GitHub branch write occurred. The controlled adapter remains revoked and its package/receipt retained; existing user records were untouched. The session was signed out and closed.

Evidence: docs/evidence/step8-developer-lookup-20261018.json. Reproduction helper: scripts/check-developer-lookup.mjs. Its first final check needed an error-classifier correction because Convex returns the denial text in errorData; the successful final check distinguishes that exact authorization denial from network or unexpected errors.

## Reused GitHub service evidence
The previously accepted real data-only branch, exact source commit and independent remote read-back are retained in REMAINING_ENGINEERING_BATCH.md and evidence/enterprise-write-telemetry-20261015.json. The main project repository is now nexus-forge1/nexus-forge-; historical evidence retains the earlier repository identity. The no-dispatch repository remains dispatch QA only.

No duplicate remote write was needed for this scoped safety acceptance. The supported writer saves exact immutable mission-bound contents and base commit/tree, publishes only a new nexus-agent branch, rechecks owner mission clearance before branch creation, reads back the exact commit and records uncertainty without automatic replay. Repository CI may run according to its own rules. The tool does not merge, modify main or request workflow dispatch.

## Limits and next step
JSON declarations validate field presence, not semantic truth or arbitrary tool capability. GET is the supported request method, not proof that an external service has no side effects. Revocation prevents later admissions and successful settlement; it cannot recall a request already transmitted. Runtime failures and uncertain GitHub outcomes require receipt/remote-branch review before a deliberately new request. There is no cross-provider exactly-once guarantee.

Next: Step 9, comparison and research evaluations. Step 7's genuine Workspace tenant sign-in remains open. Managed-host interruption and actual provider invoices remain Steps 14 and 15. Payment activation remains Step 17, last.
