# Mission contracts and spending safety — October 17, 2026

Mission creation now validates a finite $0–$500 cap, trims fields and bounds title (160), description (30000) and authority (80). API and interface share these rules. Existing records are not rewritten.

Approval is idempotent. Completed/cancelled missions cannot be rewound, review-held missions must use Portfolio resolution, and approval remains separate from execution. Runner entry and queued ticks independently guard cancellation, review and invalid legacy budgets before provider work. Review-preserving rejection retains review in its audit event. The interface directs completed missions to learning and cancelled missions to a new contract.

## Mission usage authorization

Both provider invocation paths already use the shared transactional wallet reservation. That reservation now reads its invocation's mission, validates owner and cap, and sums the mission's settled customer charges plus outstanding held/review authorizations in the current payment mode. Another $1 authorization must fit inside the cap before wallet debit or provider work. Concurrent reservations participate in indexed transaction conflict detection.

This is a customer usage cap, not provider invoice reconciliation. The existing $1 per-step authorization and pinned-rate settlement remain unchanged. Released authorization becomes available after settlement; unresolved holds count in full. Zero-cap missions cannot authorize paid AI. Pre-mission Manifest usage remains account-scoped. Missing historical billing evidence or more than 200 mission invocation records blocks further paid steps for review; no historical charges are invented and no holds are silently cleared. The cap cannot be raised on an existing mission.

## Verification

- Fresh reserved-OTP Testing browser acceptance: controlled $0 draft created, approved and persisted after reload; repeated approval added no audit; API $501 rejected with no extra mission; runner remained absent. Session signed out and closed. No provider inference was invoked by this acceptance.
- Backend and interface tests cover finite bounds, lengths, ownership, terminal/review transitions, queued tick protection, zero-cap rollback, concurrent $1 reservations, settled-charge reuse and missing billing evidence.
- Full regression: 584 tests across 105 files passed.
- Testing backend deployment and strict TypeScript checks passed.
- No real charge or new provider inference was needed for this release.

Production readiness remains partial. Required broader evidence includes sustained multi-user inference/write workloads, recurring backup observations, full managed-application interruption, genuine provider invoices and real business/payment activation.
