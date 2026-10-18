# Step13 — repeatable recovery-point verification

## Current consolidated Step13 attempt — October18,2026 after19:13UTC

At the operator's request to complete all of Step13, the existing daily backup task accepted an immediate-run request. Its saved03:00 America/New_York schedule is unchanged. Execution and delivery are asynchronous; acceptance of this request is not backup completion or timer-triggered success. No duplicate task was created. Accessible history did not resolve a successful capture receipt for the October18 07:01UTC invocation. Reconcile the immediate task's delivered result before requesting another capture.

The October18 retained archive is verified:75 data tables/2,011 documents, excluding export metadata; separate saved-copy retrieval, SHA-256, CRC and relationship/freshness checks passed. The prior approved Managed Testing restore and exact return remain accepted; older rejected-attempt descriptions do not invalidate that later evidence. No new restore, data replacement, inference or dispatch was performed in this attempt.

| Requirement | Accepted scope | Still required |
| --- | --- | --- |
| Capture and retrieval | Real private archive and separate-copy verification | Completed scheduled-capture receipt |
| Isolated restore and return | Prior approved Managed Testing verification | No duplicate database-only drill required |
| Media | Prior original banner retrieval/render; latest database has zero privateMedia rows | Current capture must inventory external assets and app uploads |
| Freshness and retention | Stale-point checker; tasks preserve previous copies and flag excess | Recurring24-hour freshness observations and30-point retention inventory; elapsed retention cannot be observed in one session |
| Four-hour full-service recovery | Database restore and synthetic helper results for their recorded scopes | Timed compatible application/backend/auth/media recovery and service verification; table-import duration alone is insufficient |

Step13 remains open for those actual operational results. No additional Step13 substeps are created. Payments remain Step17 LAST. This current entry supersedes older summary statuses while preserving historical evidence.

The offline operating utility `scripts/check-recovery-point.py` verifies a retrieved private database archive against a separate source export and its recorded SHA-256. It uses Python3's standard library only and is not application/backend runtime code. It has no network client, restore function or database mutation.

It checks bounded compressed/expanded sizes, safe unique archive paths, supported compression, CRC for every entry, actual source/saved-copy SHA agreement, a consistent Convex table registry, unique document IDs, mission and parent relationships, required privateMedia originals and24-hour capture freshness. Capture time must include a timezone and comes from the capture receipt, not file modification time. Reports contain aggregate counts/error codes, never raw records or credentials. Existing reports cannot be overwritten. A stale or incomplete point exits nonzero and is preserved for review.

Run privately where both original and independently retrieved bytes are available:

```sh
python3 scripts/check-recovery-point.py \
  --archive /private/retrieved.zip \
  --source /private/source.zip \
  --expected-sha256 RECORDED_64_CHARACTER_LOWERCASE_DIGEST \
  --captured-at CAPTURE_TIMESTAMP_WITH_TIMEZONE \
  --report /private/unique-verification.json
```

Reports and archive paths above are placeholders; use exact authorized capture/retrieval paths. Do not upload private archives to the source repository or public media. A checker requires the actual completed download; a download handle is insufficient. Do not execute any restored active mission to verify a backup.

## Actual retained Live acceptance — October18

The latest retained export and separately retrieved copy passed. Size1,554,319 bytes; SHA-256 `82b4d514a008cdfdb21a7429b181154d301e278ea59b2f7c3fa9749498b23892`. Data tables75, data documents2,011. The export also contains `_tables` registry metadata:75 entries, excluded from data counts. Earlier76-table/2,086-row aggregate reports counted that metadata; these counts are corrected with unchanged archive bytes/digest.

All linked mission/artifact/delivery/research/provider records inspected by the checker matched their parents. No privateMedia rows or file payloads are present in this export. This does not verify the separately retained Macaly banner or future nonempty storage coverage. No restore was performed.

Nine regression cases cover metadata separation, stale points, mismatched/same-file copies, missing parents, privacy, unsafe paths, registry mismatch, missing media, corrupt ZIPs, timezone requirements and refusal to overwrite a report.

## Remaining acceptance

Step13 stays NEXT. Repeated timer-triggered successful capture, continuing24-hour freshness, retention and four-hour full-service recovery still need observation. Existing daily capture and monthly drill tasks are retained; their use of this checker does not make an unobserved future run pass. The prior accepted Managed Testing restore/return is reused. Steps14–16 dependencies remain in STEP_13_16_OPERATIONS_20261018.md. Payments remain Step17 LAST.
