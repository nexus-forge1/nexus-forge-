# GitHub reconciliation — November 12, 2026

PR #152 reconciles the deployed Macaly application with GitHub. The initial 828-file source/configuration inventory matched the candidate branch exactly. The subsequent TypeScript checker setting is included on both sides. Cloudflare workers and all seven tracked static assets also match. The two Python backup verification helpers match the current operational repository, nexus-forge1/no-dispatch, and are included in this follow-up.

The first candidate CI run installed locked dependencies successfully but stopped at four production dependency advisories. Applying pnpm's audit fixes added seven scoped transitive overrides, including development dependency repairs, and regenerated pnpm-lock.yaml. The subsequent production audit reports zero findings at every severity. The project .sandbox/check-errors --strict command passes. No automated test runner was invoked during this follow-up; existing GitHub CI runs automatically on PR updates.

pnpm-lock.yaml and pnpm-workspace.yaml are authoritative for the existing GitHub CI, which uses the packageManager declared in package.json. The historical npm lockfile is retained; it does not encode pnpm overrides. Use pnpm for a reproducible CI installation.

This reconciliation does not establish representative service capacity, full-service recovery, invoice reconciliation or payment activation. Database target remains Live; no load or restore work was run against Live. B17 remains locked.
