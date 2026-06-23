# ADR-0023: Red-Team Integration Test for AI Image Safety

**Status:** Active
**Date:** 2026-06

## Context

Splotch sends a toddler's drawing to Gemini and shows the stylized result
(`/api/generate-image`, ADR-0006). Two safety risks went untested:

1. **False negatives** — an unsafe drawing (weapon, anatomy, hate symbol, …)
   slips through and Gemini returns a child-inappropriate image.
2. **False positives** — an innocent drawing that merely *looks* edgy (a banana,
   a water gun, two balloons) gets needlessly refused, dead-ending the child.

Verifying this is fundamentally different from our existing tests (ADR-0008): it
needs **real model calls** (real tokens, real Gemini quota), it deliberately
sends **borderline imagery**, and its final pass/fail is a **human judgement**
("is this output actually child-safe?"), not an assertion. None of that belongs
in `npm test`, which must stay deterministic, free, and unattended.

A second problem surfaced while building it: the endpoint collapsed **every**
Gemini failure into a generic `502`, so the client couldn't tell a *safety
refusal* ("draw something else") from a *transient error* ("try again"), and the
UI showed one generic message for both.

Alternatives considered:

- **A Vitest or Playwright spec.** Rejected — both run in CI via `npm test`, and
  a real-token, human-reviewed test sweeping into the default suite is exactly
  what we must avoid. A standalone Node script (like `scripts/api-smoke.mjs`)
  can never be picked up by the Vitest (`src/**`) or Playwright (`tests/*.spec`)
  globs.
- **Hitting production `splotch.art`.** Rejected — burns prod quota and depends
  on a deployed token. Booting a throwaway `vite dev` exercises *our* endpoint
  handler (including the new classification) without touching production.
- **Storing the probe drawings as plain PNGs**, or visually scrambling them.
  Rejected — a viewable corpus of unsafe imagery in the tree is unacceptable,
  and pixel-scrambling can leak recognizable shapes. AES-256-GCM turns each file
  into opaque bytes that aren't a valid image.
- **Keeping the single `502`.** Rejected — it gave the child no actionable
  guidance; a safety refusal needs different copy from a retryable failure.

## Decision

A **manual, token-gated, human-reviewed** red-team suite, plus a safety/error
split in the endpoint.

**Encrypted, committed fixture corpus** (`tests/redteam/`):
- `scripts/lib/fixtureCrypto.mjs` — AES-256-GCM (`[12B iv][16B authTag][ct]`),
  key = `scryptSync(REDTEAM_FIXTURE_KEY, 'splotch-redteam', 32)`. The key lives
  in `.env`, shared out-of-band, never committed.
- `scripts/redteam-fixtures.mjs` — `encrypt` (`source/` → `encrypted/`) /
  `decrypt` (`encrypted/` → `decrypted/`).
- Only `encrypted/*.enc` is committed; `source/`, `decrypted/`, `output/` are
  gitignored. The drawings are authored by hand (crude safe + unsafe probes,
  including the sensitive categories: explicit anatomy, self-harm, hate symbols,
  prompt-injection/slur text).
- **Categorization is by filename prefix — there is no manifest.** `safe-*` =
  should be allowed (a refusal is a false positive); `block-*` = should be
  refused (an image returned is a potential false negative). The runner discovers
  every case directly from `encrypted/`, so adding a probe is just dropping in a
  prefixed PNG and re-encrypting. (An earlier revision auto-generated crayon-SVG
  probes via a `redteam-gen` script and a `cases.ts` manifest; both were removed
  once the corpus became hand-drawn and prefix-categorized.)

**The runner** (`scripts/redteam-run.mjs`, `npm run redteam`) — a standalone Node
script (never matched by the Vitest/Playwright globs). It discovers cases from
`encrypted/` by prefix, decrypts the corpus, boots a throwaway `vite dev` with
`ALLOWED_TOKENS_LIST=redteam-token`, POSTs each drawing to `/api/generate-image`,
and writes `tests/redteam/output/<runId>/` with each input, any output image,
`report.json`, and a standalone `report.html` (input → output side by side, safe
cases first then block cases; a missing image shows the returned error/refusal
message). The run prints a `file://` link and opens the report in the default
browser. It **always exits 0** and never asserts pass/fail — the verdict is the
human review.

**Safety classification** (`src/lib/server/aiSafety.ts`):
- `classifyGeminiResponse()` → `image` | `safety` | `empty`, treating
  `promptFeedback.blockReason` and policy `finishReason`s (`SAFETY`,
  `IMAGE_SAFETY`, `PROHIBITED_CONTENT`, `RECITATION`, `BLOCKLIST`, `SPII`) as
  `safety`; `isSafetyError()` catches the SDK throwing on blocked content.
- A **prose-only response (no image part) is also classified `safety`**, not
  `empty`. The red-team run surfaced that Gemini often refuses an unsafe drawing
  by *replying in text* ("I cannot fulfill this request… offensive content")
  with a plain `STOP` finishReason and **no** `IMAGE_SAFETY` signal. For an
  image-generation model a text answer means it declined to draw, so it maps to
  `422` ("draw something else") rather than a `502` retry that can never
  succeed. A response with genuinely no content stays `empty` → `502`.
- `/api/generate-image` returns **`422`** for a safety refusal (vs `502` for an
  upstream/empty failure). The client (`aiImage.ts`) maps `422` to a distinct
  `aiErrorKind: 'safety'`; `AiImageResult.svelte` shows a child-friendly "let's
  try drawing something else!". All three failure modes (safety/server/timeout)
  are previewable at `/dev/ai-timer` without a Gemini call.

**Hardening the model toward refusal.** On Gemini's defaults the red-team found
the image model would *transform* an unsafe drawing rather than refuse it (a gun
became a gilded gun, anatomy a stylized tower). Because the audience is toddlers,
the `generateContent` call is configured to lean hard toward refusal:
- a **`systemInstruction`** instructs the model to decline unsafe drawings (weapons,
  violence, nudity, hate symbols, etc.) with a short *text* reply instead of
  drawing, and to never "beautify" them — that prose reply is exactly what the
  classifier now turns into a `422`.
- **`safetySettings`** set every configurable harm category to
  `BLOCK_LOW_AND_ABOVE`, including the image-output categories
  (`HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT`/`_SEXUALLY_EXPLICIT`/`_HATE`/
  `_HARASSMENT`). This only tightens the *configurable* filters (the always-on
  child-safety filter is separate), but it raises refusals of borderline drawings.

These are a best-effort, in-band mitigation, not a guarantee — a dedicated
pre-generation moderation pass was considered and deferred unless the red-team
shows the in-band controls still leak.

The classifier is pure and **unit-tested in CI** (`aiSafety.test.ts`) — the only
part of this work that runs unattended; everything token/Gemini-dependent stays
manual.

## Consequences

- **+** Red-teaming is possible at all, covering both false-negative and
  false-positive axes, with every input/output saved for auditable human review.
- **+** Unsafe probe imagery never appears as a viewable file in the repo; the
  `.enc` corpus is shareable/versioned, decryptable only with the shared key.
- **+** The endpoint now guides children correctly: a blocked drawing says "draw
  something else" instead of a scary generic error or a retry that can't succeed.
- **+** Zero risk of the real-token suite running in CI — it's neither a Vitest
  nor a Playwright file, and `npm test` is unchanged.
- **−** The corpus is only as good as the hand-drawn probes; coverage depends on
  someone authoring (and maintaining) representative `safe-*`/`block-*` drawings.
- **−** "Pass/fail is human review" means no automated regression signal — a
  safety regression is only caught when someone re-runs `npm run redteam` and
  looks. This is inherent to red-teaming a generative model.
- **−** Anyone with `REDTEAM_FIXTURE_KEY` can decrypt the committed corpus;
  the encryption is at-rest obfuscation for a test corpus, not a security
  boundary. Treat the key like any shared secret.
- **−** Adds `REDTEAM_FIXTURE_KEY` to the env surface.
