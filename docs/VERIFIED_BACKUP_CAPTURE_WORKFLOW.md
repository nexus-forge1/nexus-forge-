# Verified manual backup capture

This workflow is intentionally manual-only. It exports the **Live** Convex deployment only when an operator explicitly sets `confirm_live_export=true` in the GitHub Actions dispatch form.

## Required GitHub Actions configuration

Secrets:
- `CONVEX_DEPLOY_KEY`: a Convex deploy key authorized for the Live deployment.
- `BACKUP_S3_ACCESS_KEY_ID`: dedicated S3-compatible storage access key.
- `BACKUP_S3_SECRET_ACCESS_KEY`: matching secret key.

Variables:
- `BACKUP_S3_BUCKET`: private bucket name, without a path.
- `BACKUP_S3_REGION`: region required by the storage provider.
- `BACKUP_S3_ENDPOINT`: optional S3-compatible endpoint URL; set this for Supabase Storage S3 API.

Prefer a dedicated Supabase project and private bucket for backups. Supabase S3 access keys can have broad project-level access; do not use public buckets or reuse broad production credentials. Do not put credentials in source control, workflow inputs, logs, or chat.

## Workflow behavior

1. Requires explicit confirmation before running a Live export. A dispatch without `confirm_live_export=true` runs only the `confirmation-required` job, which fails on purpose with "No backup was taken" so it can never be mistaken for a backup.
2. Fails before exporting if any required secret or variable is missing (names are reported, values never are).
3. Exports Convex data including Convex file storage.
4. Records the archive's SHA-256 and byte count **before** upload, refuses to overwrite an existing object key, and requires the upload to return an ETag.
5. In a separate step, fetches the object metadata and bytes fresh from storage into a new directory, recomputes SHA-256 and byte count from the retrieved bytes, and compares them exactly with the pre-upload values and the stored object size (`scripts/backup-receipt.py compare`).
6. Runs `scripts/check-recovery-point.py` against the source and independently retrieved archive.
7. Uploads a verification report, including a failure report when available.
8. Writes a receipt only when the report passed and its digest, byte count and capture time match the archive (`scripts/backup-receipt.py build`), then uploads it.
9. Retrieves the stored receipt and report back from storage and validates that both refer to the same capture, archive key, digest, byte count, commit and run (`scripts/backup-receipt.py validate`).

The receipt (`verified-backup-receipt-v2`) records the capture key, Live source, manual trigger, capture time, bucket, object keys, ETag/version ID when provided, SHA-256 and bytes as reported before upload, SHA-256 and bytes recomputed from the retrieved copy, verification outcome, commit SHA, and GitHub Actions run URL and ID. It does not contain credentials or raw exported records.

## Important scope limits

- This workflow does not restore data; a restore drill is a separate operation.
- It covers the Convex export and Convex file storage included in that export. It does not claim coverage of external Macaly assets, environment secrets, source control, or full-service recovery.
- It does not create a schedule or change any existing scheduled backup configuration.
- A successful workflow receipt does not automatically populate the application's backup inventory; that inventory must be updated only from the verified receipt.
- The recovery verifier intentionally applies archive size, entry, structure, and relationship checks. A failure is a failed verification, not a successful backup.
