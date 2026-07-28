# Extract the six near-identical Gemini `generateContent` wrappers into `lib/gemini.mjs`

**Priority/category:** P1[duplication] · **Cluster:** C15 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs:75-97`,
`gen-coloring-fills-dark.mjs:119-141`, `gen-coloring-chalk.mjs:253-278`,
`normalize-outline-strokes.mjs:111-136`, `gen-coloring-outlines-fresh.mjs:84-97`,
`gen-style-covers.mjs:29-52` — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p1-duplication-extract-the-six-near-identical-gemini-generatecontent-wra.patch

## Verdict

**FIX — clear winner.** Both reviewer objections were about `makeClient()`, and a `makeClient()`
that does exactly what the reviewer demanded has since landed at HEAD by other means. What remains
is the original core of the finding — the duplicated transport — and the draft's `generateImage`
half is the right shape for it; it just has to be rebased onto today's `lib/gemini.mjs` instead of
recreating it.

## Original finding (condensed)

All six generators hand-roll the same `ai.models.generateContent` call: base64 the input image into
`inlineData`, append the prompt part, set `abortSignal: AbortSignal.timeout(120_000)` and optional
`temperature`, then `classifyGeminiResponse` and throw on a non-image kind. They differ only in
prompt, webp quality, and (fresh) text-only contents plus `imageConfig.aspectRatio`. Proposed a
`lib/gemini.mjs` exporting `IMAGE_MODEL`, the timeout, `makeClient()` (env-key-checked), and
`generateImage(ai, { imageBytes, mimeType, prompt, temperature, aspectRatio })`.

## Why it was deferred

Implementer failed to deliver a fix round. The reviewer's two unresolved objections both targeted
the client-factory half: the first draft commit omitted `makeClient()` entirely, and the second
shipped `makeClient(apiKey)` as an unchecked constructor pass-through instead of the required
factory that reads `GEMINI_API_KEY`, rejects a missing key, and preserves the null-client
dry-run/rescore paths.

## Current state of the code

Partially resolved at HEAD, in a way that moots both objections:

* `tools/asset-gen/lib/gemini.mjs` now exists and contains exactly the demanded factory:
  `makeClient({ optional = false })` reads `process.env.GEMINI_API_KEY`, calls `fail()` when the key
  is absent, and returns `null` for the opt-in dry-run/rescore paths. All six bins use it
  (`gen-coloring-chalk.mjs:222` and `gen-coloring-fills-dark.mjs:223` pass
  `{ optional: values['dry-run'] || ... }`).
* The transport duplication is untouched: `grep -c 'AbortSignal.timeout' bin/*.mjs` still hits 6
  (chalk:277, dark:103, fills:87, fresh:82, covers:43, normalize:117), each with its own
  `MODEL = 'gemini-3.1-flash-image'`, base64 dance, and `classifyGeminiResponse` + throw.
* The draft patch no longer applies (`git apply --check` fails): it creates `lib/gemini.mjs` from
  scratch and its `makeClient(apiKey)` would *regress* HEAD's env-checked factory.

## Options considered

Only one real shape: the draft's `generateImage` (image-or-text-only parts, timeout, optional
temperature/`imageConfig`, classify-and-throw, returns `{ bytes, mimeType }`) already matches all
six call sites and came with a mocked contract test. The alternative — leave transport duplicated
now that `makeClient` landed — forfeits the single largest duplicated block in the directory for no
saving, since the port is mechanical.

## Recommendation

Re-implement the draft's transport half on top of HEAD's `lib/gemini.mjs`. Exactly what must change
vs the rejected draft:

* **Do not touch `makeClient`.** Keep HEAD's `makeClient({ optional })`; drop the draft's
  `makeClient(apiKey)` and every `makeClient(process.env.GEMINI_API_KEY)` call-site edit — the bins
  already construct clients correctly. This is what satisfies both recorded objections.
* Add to the existing `lib/gemini.mjs`: `IMAGE_MODEL`, `IMAGE_TIMEOUT_MS = 120_000`, and the draft's
  `generateImage` verbatim (it already handles text-only contents and `aspectRatio` for fresh
  outlines). `classifyGeminiResponse` is a sanctioned `web/src` import.
* Port the six wrappers exactly as the draft's bin hunks do (those hunks are correct; only the
  surrounding import lines drifted, so re-apply by hand or with 3-way merge).
* Bring over `tests/gemini.test.mjs`, minus its `makeClient('test-key')` case — HEAD's factory has a
  different signature and `tests/cli.test.mjs` already imports/exercises it.

Verification per the finding: `AbortSignal.timeout` count in `bin/` drops 6 → 0,
`classifyGeminiResponse` disappears from `bin/` imports, `npm run test:asset-gen` green. Request
payloads are byte-identical, so no golden/asset impact. Note this also centralizes the model id and
timeout, which subsumes the substantive half of the sibling constants finding
([issue \#566](https://github.com/KyleMit/Splotch/issues/566)).

## Suggested next step

Re-stage in docs/AUDIT.md with the note "makeClient already landed — extract `generateImage` only,
rebase the draft's bin hunks, keep HEAD's `makeClient({ optional })` untouched".
