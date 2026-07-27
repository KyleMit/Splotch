# Extract the oversized-body guard shared by generate-image and csp-report

**Priority/category:** P2[duplication] · **Cluster:** C11 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/api/generate-image/+server.ts:83-92` and
`web/src/routes/api/csp-report/+server.ts:114-122` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** Extract one result-returning capped-body reader into `http.ts` and let each
endpoint keep its own 413 response style. The deferred implementation matched this shape and was
blocked only by pre-existing failing test files that no longer exist.

## Original finding (condensed)

Both endpoints implement the same two-stage security cap — reject on declared `Content-Length`
before buffering, then re-check the actual byte length after the read (a code-unit check would
under-count multibyte payloads) — as two independent copies. A fix to one (e.g. chunked-encoding
handling) won't reach the other.

## Why it was deferred

"Implementation failed": a shared zero-copy raw-body reader was implemented, both endpoints
migrated, and byte-limit + UTF-8 coverage added — but the burndown's `npm run test:unit` gate was
red because of two pre-existing **untracked** test files with 13 unrelated failing assertions, so no
commit was made. No design or review objection was recorded.

## Current state of the code

Still holds at HEAD. generate-image's raw-branch guard is now at lines 80-90 (declared-length check,
zero-copy `Buffer.from(await request.arrayBuffer())`, empty-body 400, byte re-check); csp-report's
is at lines 121-131 (declared-length check, `request.text()`, `TextEncoder` re-encode to count
bytes). The working tree is clean — the untracked failing tests that blocked the run are gone.

## Options considered

1. **One result-returning helper (winner).** `readBodyWithinLimit(request, maxBytes)` returns
   `{ ok: true, bytes: Buffer } | { ok: false }`; each caller maps `ok: false` to its own 413. Pros:
   preserves both endpoints' deliberately different 413 styles — generate-image's
   `throw error(413, 'Image is too large')` (JSON body) versus csp-report's documented **bodyless**
   `new Response(null, { status: 413 })` (browsers ignore CSP-report responses) — keeps the
   zero-copy buffer, and csp-report's byte cap becomes exact by construction (`bytes.byteLength`
   then `bytes.toString('utf8')`), dropping the `TextEncoder` re-encode.
2. **Three throwing helpers (the finding's proposal:** `declaredLengthExceeds` / `readCappedBuffer`
   / `readCappedText` throwing `error(413)` **).** Cons: a thrown 413 in csp-report either changes
   its documented bodyless contract or forces a try/catch translation at the call site; three
   exports where one primitive suffices; and after finding 1's `apiHandler` wrapper lands, the
   thrown 413 would silently become a JSON body on an endpoint that must stay bodyless.

Option 1 wins because the two endpoints' response styles genuinely differ and should — the helper
should own the *measurement*, not the *response*.

## Recommendation

Add to `web/src/lib/server/http.ts`:

```ts
export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Buffer } | { ok: false }> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  // Buffer.from(ArrayBuffer) wraps without copying; Content-Length can lie, so re-check.
  const bytes = Buffer.from(await request.arrayBuffer());
  return bytes.byteLength > maxBytes ? { ok: false } : { ok: true, bytes };
}
```

generate-image's raw `readValidatedImage` thunk becomes: call the helper, `ok: false` →
`throw error(413, ...)`, then keep its own empty-body 400 and return
`{ bytes, mimeType: contentTypeOf(request) }`. (The multipart branch's `Blob.size` 413 is a
different source and stays as is.) csp-report becomes: call the helper, `ok: false` →
`new Response(null, { status: 413 })`, then `const raw = read.bytes.toString('utf8')` into the
existing `JSON.parse`. Move the "declared length first / re-check catches liars / multibyte" comment
onto the helper so the reasoning lives once.

Unit-test the helper directly: declared length over the cap (body never read), declared length
absent or lying low with an actual oversized body, and a multibyte payload whose code-unit length is
under the cap but byte length is over.

Interplay: independent of finding 1 (the helper returns no responses); pairs naturally with the
`contentTypeOf` extraction (finding 2) in a single `http.ts` change.

## Suggested next step

Re-stage in docs/AUDIT.md with the result-style helper substituted for the original three-helper
brief. Verify with the new unit tests plus `npm run test:api:smoke` (covers csp-report's cap).
