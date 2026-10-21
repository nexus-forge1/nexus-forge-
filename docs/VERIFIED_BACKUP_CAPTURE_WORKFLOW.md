# Verified manual backup capture (moved)

The Verified Backup Capture workflow now lives only in the dispatch repository:

- Workflow: https://github.com/nexus-forge1/no-dispatch/blob/main/.github/workflows/nexus-forge-backup-capture.yml
- Documentation: https://github.com/nexus-forge1/no-dispatch/blob/main/docs/VERIFIED_BACKUP_CAPTURE_WORKFLOW.md
- Runs: https://github.com/nexus-forge1/no-dispatch/actions/workflows/nexus-forge-backup-capture.yml

Backups are written to the private Supabase Storage bucket `nexus-forge-backups` through its S3-compatible API. The repository's `BACKUP_S3_*` and `CONVEX_DEPLOY_KEY` settings are configured on `no-dispatch`, not here.

`scripts/check-recovery-point.py` remains in this repository as the offline recovery-point verifier described in `docs/STEP_13_RECOVERY_VERIFICATION.md`.
