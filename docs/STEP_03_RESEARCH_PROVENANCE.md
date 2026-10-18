# Step 3 of 17 — research evidence quality

Status: implemented and accepted for bounded source-provenance functionality. Next: Step 4, memory and learning effectiveness. Payment activation remains Step 17.

## Source capture

Research & Memory can explicitly retrieve an exact citation from an owned research record through the existing fail-closed egress gateway. Destination and redirect validation are reused; no direct-source fetch, AI fallback, login bypass or paid inference is introduced.

A durable pending attempt is admitted before network retrieval. At most ten attempts per research record are admitted transactionally, including pending/failed attempts. Successful terminal receipts retain original citation, validated final URL, HTTP/content type, title, bounded extracted text, response/text hashes, response bytes and capture time. Failed attempts retain a sanitized reason; ambiguous pending records are not silently retried. Terminal receipts have no public update/delete path.

Only HTTP 200 HTML/XHTML/plain text responses are supported. The gateway response body is bounded to 120000 UTF-8 bytes; extracted text to 24000 characters. Scripts, styles, noscript and comments are omitted, including truncated script/comment tails. HTML is never executed or rendered. A response reaching the byte bound or a truncated text extraction displays a partial-context cue.

## Date provenance

Publication-specific HTML meta declarations are retained with their field names. Valid ISO dates are labeled declared; absent, invalid, future and conflicting dates remain explicit. Generic dates and modification metadata are not silently treated as publication dates. No publication date is invented from capture time.

This is conservative metadata extraction, not independent timestamp verification. JSON-LD, JavaScript rendering, paywalled content, PDFs and dates only in prose remain outside the parser; unknown is an expected valid result.

## Claim reviews

The operator chooses either saved research summary or a captured source snapshot as the excerpt basis. Source excerpts must match exact captured text and the capture must belong to the same owner, research record and citation. Reviews pin the capture ID, text hash, final URL and capture time. Existing review calls and historical summary records remain compatible and are explicitly labeled summary-based.

A captured text match establishes provenance only. It does not establish factual truth, source independence, semantic support, causality or scientific novelty. Original response hashes are fingerprints of bounded gateway responses; raw full-page archives are not retained. The retained extracted-text hash can be independently recomputed.

## Acceptance evidence

See evidence/step3-source-provenance-20261018.json. One new uniquely identified QA mission and manually labeled summary fixture were created under the existing reserved QA identity; earlier records were not modified. The public Example Domain page was captured through configured protected egress: HTTP 200, 577 bytes, declared publication date unknown. Node independently recomputed the stored text hash. A source-backed claim pinned that exact excerpt and hash. Source selection and unknown-date labels rendered; the pinned review survived reload. Billing was unchanged; no model call or checkout occurred. QA session signed out and browser closed. Controlled records retained.

Eighteen new tests cover content extraction, date states, protected retrieval, unsafe/foreign sources, failure receipts, exact excerpts, cross-research rejection, immutable terminal state, concurrent admission and source-basis UI. Existing summary-review tests continue to pass. Full regression passed 652 tests across 116 files. Final strict checks are required before publication.

The strict preflight also exposed a default admission-policy union without updatedAt; the existing form now checks for that field before using it as a React key. No policy data or behavior was changed.
