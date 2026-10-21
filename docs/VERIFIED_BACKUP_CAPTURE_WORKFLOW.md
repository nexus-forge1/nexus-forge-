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

1. Requires explicit confirmation before running a Live export.
2. Exports Convex data including Convex file storage.
3. Uploads the archive to the configured S3-compatible bucket.
4. Downloads the saved object independently and compares byte count and SHA-256.
5. Runs `scripts/check-recovery-point.py` against the source and independently retrieved archive.
6. Uploads a verification report, including a failure report when available.
7. Writes and uploads a receipt only after all prior steps succeed.

The receipt records the capture key, Live source, manual trigger, capture time, object keys, SHA-256, bytes, independent retrieval and equality checks, verification outcome, and GitHub Actions run URL and ID. It does not contain credentials or raw exported records.

## Important scope limits

- This workflow does not restore data; a restore drill is a separate operation.
- It covers the Convex export and Convex file storage included in that export. It does not claim coverage of external Macaly assets, environment secrets, source control, or full-service recovery.
- It does not create a schedule or change any existing scheduled backup configuration.
- A successful workflow receipt does not automatically populate the application's backup inventory; that inventory must be updated only from the verified receipt.
- The recovery verifier intentionally applies archive size, entry, structure, and relationship checks. A failure is a failed verification, not a successful backup.
