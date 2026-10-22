# Step 6 — Artifacts and delivery coverage

Accepted scope: self-contained HTML tools, finished content pages and local JSON export tools. These are content/behavior categories within the existing HTML delivery format, not native mobile apps, arbitrary server applications, binary media generation or a promise of arbitrary integration support.

## Changes
- Artifact Forge offers **Download saved HTML** for the exact selected saved source, including drafts and failed verification results. UTF-8 bytes are not trimmed, wrapped or rewritten. The download request receipt includes filename, byte count and SHA-256; it does not claim the browser saved the file.
- Source is downloaded through a temporary Blob URL and never rendered into the application origin. The link is removed and URL revoked after the browser has time to accept it. Failure remains visible. No approval, delivery, mission or billing mutation occurs.
- Each returned Builder response is saved before any bounded correction. One correction is retained as a separate draft, linked to the first through audit records. If correction inference fails, the first saved response remains available for inspection or revision. Storage outages remain a separate operational limitation.
- The existing generation path can use up to two billed AI steps. The page now explains the scope and correction behavior and wraps long digest receipts on mobile.

## Controlled acceptance
Fixtures and reproduction:
- scripts/fixtures/artifact-coverage.ts
- scripts/check-artifact-coverage.mjs
- docs/evidence/step6-artifact-coverage-20261018.json

Three complete authored snapshots: nonnegative calculator with zero and invalid-input checks; visibly completed fictional campaign with a local review action; Unicode JSON export with a zero-valued field. Each passed structural checks and exact-output browser assertions. Chromium ran all three at 390px and 1280px, checked horizontal containment and actual HTML download bytes/digest/filename, and detected a deliberately wrong output for each. Actual JSON downloads preserved Café/emoji content and zero values. Six of six cases passed.

The harness initially confirmed the existing scripts-only sandbox blocks native form submission. Final fixtures use explicit local button actions and browser form validity checks. Sandbox permissions were not expanded. JSON download testing runs the authored fixture in a separate credential-free browser context with all external network blocked; in-app sandbox receipts still do not certify downloads.

Backend edge-runtime tests retain the first incomplete draft when correction becomes uncertain, retain both returned failed responses, and reject approval of failed content. UI tests verify the selected exact snapshot, visible request/failure state and no approval/action calls. Export tests verify exact UTF-8/line-ending bytes, SHA-256, cleanup and browser/hash failures.

Regression: full run passed 696 tests / 122 files. Two subsequently added download page integration cases passed, bringing accepted coverage to 698 tests / 123 files. The backend handoff file additionally passed after switching to edge-runtime.

## Reused external delivery evidence
The existing exact-snapshot Chromium CI provenance/immutable-import contract remains accepted; see EXACT_ARTIFACT_CI.md. The prior real QA GitHub build/test/Pages deployment, deployed-URL verification, both callbacks and six-of-six readiness evidence remain accepted; see QA_DELIVERY_CLOSURE_2026_10_17.md. Callback replay, stale snapshots, ownership, lifecycle and outcome guards passed in the full regression. No duplicate external deployment or paid artifact generation was needed for this step.

## Boundaries and retained QA state
Authenticated current-page load and sign-out passed. A new owned Testing mission k9785971s11decjbpnpgf9cmrs8ghkkj was created for an intended page download check, but direct administrative CLI fixture seeding was unavailable. No artifact was inserted by that attempt, no inference or checkout was performed, and no existing record was modified. The unsupported seeding script was removed. Therefore this step does not claim a newly seeded persistent artifact was downloaded through the authenticated page; page wiring is covered by component integration tests and actual production download-function bytes by Chromium.

Authored fixtures do not establish arbitrary generated quality, visual accessibility completeness, external service behavior or real customer outcomes. Existing outcome evidence remains separate. Managed-host interruption, genuine invoices and payment activation remain Steps 14, 15 and 17. Next: Step 7, team and enterprise support.
