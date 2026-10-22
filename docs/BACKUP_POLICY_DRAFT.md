# Backup operating policy and activation status

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

## Held work resumed — 17 October 2026 UTC

Previously paused acceptance work is active again. A fresh private Live backup was saved and independently retrieved, daily capture resumed, actual test-payment receipts reconciled, concurrent funded inference and a real client disconnect passed, and 540 regressions passed. The isolated Testing overwrite was canceled after automatic approval review rejected it; specific approval for replacement-and-return remains necessary. See [current resumption results and exact dependencies](HELD_WORK_RESUMPTION_2026_10_17.md). Full readiness remains partial; business activation, actual provider invoices, representative workload targets and managed-host fault controls are not fabricated.


Status: Operating targets adopted for setup following the operator's Proceed instruction on 2026-10-14 America/New_York. External scheduled assistant tasks are enabled; first scheduled capture/drill evidence and retention enforcement remain pending. This document does not close the backup release gate. The filename is retained to preserve existing links.

Scope: NEXUS FORGE platform project bphntw8kdojl9qvuifywyjtk; platform source nexus-forge1/nexus-forge-. Dispatch repository nexus-forge1/no-dispatch is separate. Live database tame-rat-826; isolated Testing database quick-rabbit-810. Verify identities before every restore.

## Operating targets

| Requirement | Target | Current evidence |
| --- | --- | --- |
| Database capture | Daily at 03:00 America/New_York, and before production data/schema migrations | One retained Live snapshot and isolated restore verified; daily capture task enabled, first scheduled run unverified; pre-migration capture remains a separate operational step |
| Media capture | At each upload/change, with daily inventory comparison | Current single asset backed up and retrieved; app-upload inventories empty at observation time |
| Retention | Keep 30 daily recovery points and a pre-migration recovery point until migration acceptance | No automatic expiry/deletion enabled; do not delete current verified copies based on this draft |
| Maximum data loss (RPO) | 24 hours | Target only; requires successful recurring captures and freshness monitoring |
| Full service recovery (RTO) | 4 hours from declared incident to verified service | Target only; current drills do not measure full service recovery |
| Restore exercise | Monthly in isolated Testing, and after a material schema/storage change | One-time table and asset restores verified; monthly drill task enabled for the first day of each month, morning New York time; first scheduled drill unverified |
| Freshness escalation | Flag missing/failed capture or newest verified capture older than 24 hours | Existing public-route monitoring does not monitor backup freshness |

## Private recovery point contents

Preserve the database export, original uploaded assets, source/version identity, capture time, schema/function contract reference, file sizes and SHA-256 digests. Record each component separately; a source commit or table ZIP alone does not restore an entire service. Keep database ZIPs and their private records out of GitHub, public media storage and client bundles. The current database and banner copies are retained privately as user files; they are one-time copies, not a recurring backup system.

A backup is accepted only after transfer completed, stored-copy retrieval passed its checksum, and isolated restore checks passed for the documented scope. Retain receipts without exposing private records or credentials. Failed, incomplete or stale captures must not replace the last verified recovery point.

## Restore procedure

1. Preserve incident evidence and current state. Select the required recovery point; confirm schema/function compatibility.
2. Verify the restore destination is Testing quick-rabbit-810, distinct from Live tame-rat-826; export Testing's current state first.
3. Restore tables into Testing only. Compare expected table counts, representative mission/artifact/delivery relationships, owner isolation, ledger/report fields and original media bytes/rendering. Do not execute restored active missions or dispatches merely to validate a backup.
4. Restore the pre-drill Testing state after the exercise. Record actual elapsed times and limits. Never reinterpret a module rollback or snapshot import duration as the full service RTO.
5. A real Live recovery needs a specific incident recovery decision, compatible source and an explicit target check. This draft does not authorize replacing Live.

## Requirements before activation

- Operating targets accepted for setup; changes to these business targets should be recorded separately.
- External scheduled assistant tasks now orchestrate the supported Macaly export and private backup/retrieval path. This is not a native Macaly backup scheduler. Macaly, GitHub and private-file access were checked before task creation. A task existing does not prove a capture will succeed; blocked authentication or unavailable export/private saving must produce a failure report. No automatic retention deletion is configured.
- Validate at least one scheduled capture, retrieval and isolated restore; record the next due time and successful freshness escalation evidence. A reminder or CI cron without a captured private backup is insufficient.
- Confirm media inventory coverage, access recovery, scheduler timezone/DST behavior and retained-copy deletion/recovery semantics. No automatic deletion was performed by this work.

Release status remains HOLD until all required gates have demonstrated evidence. This proposal does not establish capacity, billing, managed-host recovery or whole-version rollback evidence.


## Enabled tasks — 2026-10-15 UTC

- NEXUS FORGE backups: daily at 03:00 America/New_York, first scheduled date 2026-10-15. Capture Live using supported export controls, retain privately, independently retrieve/checksum-check, inventory media, assess freshness and report exact success/failure. Never restore databases in this capture task. Keep 30 daily points as the target; excess points are identified for operator review, not deleted automatically.
- NEXUS FORGE restore drill: first day of each month, around 08:00 America/New_York (flexible morning scheduling), first scheduled date 2026-11-01. Verify Testing isolation and no active editor, preserve a safety snapshot, restore only into Testing, verify documented invariants and return Testing to its original state. Report blocked/failed runs explicitly.
- Creation returned enabled=true for both tasks; no scheduled run has yet been observed. No service RPO/RTO guarantee, retention enforcement or full recovery-gate completion follows from task creation. Daily freshness assessment is not an independent continuous alarm.
