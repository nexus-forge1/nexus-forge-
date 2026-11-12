# Compiler and UI contract repair

The Macaly application passed `.sandbox/check-errors --strict` after this repair. The patch applies to Macaly baseline `26f32b5`, not directly to this older GitHub snapshot.

Three explicit, validator-matched return annotations in scope A and scope E break generated API inference recursion. UI corrections align council consensus, workflow eligibility, portfolio rationale, visual revisions, feature dependency nodes, file language fields, and visual synchronization inputs with their existing backend contracts. Visual synchronization now records returned SHA-256 digests and actual additions/removals rather than raw JSON and an empty diff. Incident coordination retains a correctly typed nullable lockdown ID.

Validation: strict TypeScript passed; Macaly preview build succeeded; desktop signed-out welcome rendered; mobile Create account transition rendered. No automated test runner, OTP request, Live record mutation, database deployment, or payment activation was performed. Dependency comparison was reverted; schema is unchanged.

Repository synchronization remains incomplete: several modules in the current Macaly application are absent from this GitHub snapshot. This patch preserves the exact nine-file repair without introducing incomplete source modules into main. A full source reconciliation is still required before this repository can reproduce the deployed application.
