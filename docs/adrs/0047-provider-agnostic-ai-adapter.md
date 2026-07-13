# ADR-0047: Provider-Agnostic AI Image Adapter (`AiImageProvider` Seam)

**Status:** Active **Date:** 2026-07

## Context

The AI features ride on Gemini's image model, and `@google/genai` was imported directly wherever it
was needed: `routes/api/generate-image/+server.ts` built the client, safety settings, and call
inline; `routes/api/verify-key/+server.ts` built its own client for the key probe; and the response
classifier (`aiSafety.ts`) plus its test threaded Gemini's `GenerateContentResponse` type through
`lib/server/`. That worked, but image-model deprecation is a *when*, not an *if* — Google has
already cycled image-model generations quickly — and a model or vendor swap would have meant
touching route handlers, safety classification, and tests all at once.

Alternatives considered:

* **YAGNI — leave it inline.** Defensible while the surface was four files, but the swap cost was
  growing (the safety hardening and classification logic are now substantial) and the route handlers
  were accumulating vendor knowledge (SDK enums, model ids, response shapes) that has nothing to do
  with their HTTP concerns.
* **A full multi-provider abstraction** (config-selected providers, capability flags, per-provider
  prompt dialects). Overkill: there is one provider today and no product reason to run two at once.

## Decision

Introduce a thin provider-agnostic seam in `web/src/lib/server/ai/` and confine the vendor SDK
behind it:

* **`provider.ts`** defines the boundary: `AiImageRequest` (API key + drawing + assembled prompt
  in), `AiImageResult` (`image` | `refusal` | `error` out — mirroring the 200 / 422 / 502 contract
  of ADR-0023), a `verifyKey` probe for the BYOK flow, and the active-provider export
  (`aiProvider`). Swapping vendors means writing one new adapter and changing this one re-export
  line.
* **`gemini.ts`** is the Gemini adapter and the app's sole runtime importer of `@google/genai`. It
  owns the model ids, the toddler-safety `systemInstruction` + `safetySettings` (whose exact wording
  the response classifier's prose-refusal heuristic depends on — they move providers together), the
  120s timeout, and the mapping from SDK responses/throws to `AiImageResult`. It is unit-tested with
  a mocked SDK (`gemini.test.ts`).
* **`geminiSafety.ts`** (moved from `lib/server/aiSafety.ts`, ADR-0023) stays a standalone
  dependency-free module inside the adapter directory because the asset scripts
  (`tools/asset-gen/scripts/gen-style-covers.mjs`, `gen-coloring-fills.mjs`) import it directly via
  `--experimental-strip-types`.
* Routes (`generate-image`, `verify-key`) keep everything HTTP-shaped — auth, rate limits, upload
  validation, usage tallies, status codes, response bodies — and call `aiProvider` for the model
  work. Client-visible behavior (status codes and message formats) is unchanged.
* The boundary is enforced as a rule in `.claude/rules/server-api.md`: no `@google/genai` import
  (runtime or type) outside `lib/server/ai/`.

Deliberately **out of scope**: the dev-time asset scripts keep using the SDK directly — they are
Gemini-tuned tools (temperature knobs, no safety hardening wanted), not part of the shipped app's
swap surface. The `GEMINI_API_KEY` env-var name and the BYOK UX (which asks parents for a *Gemini*
key) are product-level vendor commitments a swap would revisit anyway.

## Consequences

* \+ A model deprecation or vendor swap is contained to `lib/server/ai/`: one new adapter, one
  changed export. Route handlers, tests, and docs stay put.
* \+ Route handlers read as pure HTTP orchestration; the vendor-specific safety hardening and
  response-classification quirks live in one directory next to each other.
* \+ The adapter's response/error mapping — previously inline route logic with no unit coverage — is
  now tested against a mocked SDK.
* − One more indirection layer to step through when debugging a generation failure, for an app with
  exactly one provider.
* − The seam's result shape is modeled on Gemini's failure modes (prompt-level block, policy
  finishReason, prose refusal). A future provider may not map cleanly onto `refusal` vs `error`,
  forcing the interface to evolve then.
* − `refusal`/`error` reason strings still carry provider wording (e.g. "Gemini request failed: …")
  into HTTP error bodies; fully neutral messages were not worth breaking log/message continuity for.
