# Claim-level evidence review — October 17, 2026

Research & Memory now supports private, mission-bound claim reviews. The operator states a claim, selects an existing research record and exact saved citation, copies an exact excerpt from that research, selects supporting/contradicting/unresolved and explains the assessment.

The server verifies mission ownership, research mission identity, exact citation membership, usable HTTP(S) URLs without credentials and exact excerpt membership in the saved research result. Claims are bounded to 8–1500 characters; excerpts/rationales to 8–2000. Receipts retain claim, finding, citation, excerpt, rationale, research ID/query/saved timestamp, owner and server recording time.

Receipts are immutable through the public API. Opposing assessments are retained separately and neither is automatically treated as verified truth. Identical submissions return the existing receipt. A transactional indexed 100-review mission limit bounds storage and reads, including concurrent submissions. All reviews are shown newest-first within that limit. Form drafts survive server rejection, and selecting another mission remounts the form.

## Evidence limits

These are operator assessments of saved research. A saved research result can be an AI synthesis. Exact excerpt membership verifies that the text came from that saved result; it does not establish a quotation on the original web page, factual truth, source independence or novelty. No source fetching or paid inference is added. Existing research dossiers export research/source records; claim reviews are separate persisted receipts, not silently included in that earlier export format.

This is a function of Research & Memory, so no extra workspace or change to the 16-step guide was introduced. Existing mission and delivery authorization is unchanged. Payment activation remains the final launch step.

## Validation

Seven backend tests cover private access, cross-mission rejection, fabricated evidence, immutable snapshots, conflicting assessments, text bounds, idempotency and concurrent capacity. Three interface tests cover required inputs, usable source options, successful saving and failed-draft preservation. Testing deployment accepted the additive contract.

Next feature priority: richer opportunity context using existing strategies, assumptions and outcome evidence. Full production certification, actual customer outcomes and independent empirical validation remain separate open work.
