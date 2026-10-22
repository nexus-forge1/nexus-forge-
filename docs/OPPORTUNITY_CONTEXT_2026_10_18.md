# Opportunity context and validation plans — October 18 UTC / October 17 New York

Manifest already supported assumption references, outcome records and linked learning comparisons. This addition reuses them rather than introducing another feature workspace.

## Added functions

A comparison table shows only strategies matched to the selected blueprint receipt. It brings together prerequisites, unverified assumptions, reference counts, expected value, proposed time to evidence, failure modes, reversibility and recorded outcomes/evidence. It does not rank a universal winner or treat proposed value as measured benefit.

An operator can select one strategy and preregister a validation plan: assumption, action, metric, unit, numeric target, at-least/at-most comparison, 1–365-day review period and stop condition. Existing Research & Memory and Verified Learning Engine links lead to collection and comparison.

The immutable private plan captures the server's strategy key and complete strategy JSON at save time. Later strategy changes display a review cue, preserving the original plan context. Targets may be zero or negative where meaningful, but must be finite and bounded to ±1 trillion. Text fields are bounded. No experiment, provider call, deployment, charge or scheduled reminder is triggered by saving. The review period is an operator plan, not an automation.

## Access and bounds

Only the owner of a manifest-strategy memory can create/read its plans. Wrong categories and malformed snapshots are rejected. Each strategy admits at most twenty plans using transactional indexed reads. Exact repeated submissions against the same snapshot return the existing receipt. Plans have no public update/delete endpoint; changes require another retained plan. Failed drafts remain available.

## Validation and limits

Seven backend and three interface tests passed, covering ownership, snapshots, malformed data, numeric/text bounds, concurrent limits, private scoped comparison and failure recovery. Testing deployment accepted the additive contract. No synthetic customer outcomes or provider inference were used.

Evidence remains operator-authored. This does not establish market demand, independent source validation, causal improvement or real experiment completion. Existing broader launch gates remain open. Payment activation is reserved for the final launch step.

Next feature priority: improve blueprint completeness at generation time while retaining the existing incomplete-draft protections and avoiding automatic paid regeneration.
