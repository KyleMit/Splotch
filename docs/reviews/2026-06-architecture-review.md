# Architecture Review — June 2026

A staff-level review of the Splotch codebase: what's strong, what's worth investing in, and
what looks like a problem but is actually a deliberate decision. The brief was explicitly to
surface **high-value** improvements only — not to manufacture findings.

## Executive summary

Splotch is a **mature, well-architected codebase.** The dual-target strategy (web SSR on Netlify
+ static Capacitor native) is driven cleanly by a single `CAPACITOR` build flag with no runtime
platform branching; state is pure Svelte 5 runes; the drawing engine is deliberately imperative for
hot-path performance; admin auth uses constant-time HMAC sessions; AI generation is safety-hardened;
and 31 ADRs document the decisions honestly, including their trade-offs.

There are no critical correctness, security, or performance defects. The recommendations below are a
small, focused set: three concrete investments plus two lower-priority notes. Everything else
examined was either already solid or a documented intentional choice (see [Non-findings](#non-findings)).

## Strengths

- **Single-signal dual-target build (ADR-0001).** `CAPACITOR=true` selects the adapter and build
  constants; native dead-code-eliminates `/api` and `/admin`. No runtime platform forks.
- **Pure Svelte 5 runes (ADR-0002), enforced by ESLint** (`no-restricted-imports` on `svelte/store`).
  Shared state lives in `web/src/lib/state/*.svelte.ts`; `settings.svelte.ts` is data-table-generated
  so a new setting can't be forgotten in reload logic.
- **Imperative canvas engine (ADR-0004)** with real care on the hot path: cached `canvasRect` to avoid
  per-move reflow, coalesced pointer events, capped render scale (ADR-0015), tiny-canvas emptiness scan.
- **Sound server security posture.** Constant-time admin session comparison (`timingSafeEqual`),
  stateless HMAC sessions, token masking in logs, image type/size validation, enum-validated style
  prompts, safety-hardened Gemini calls with 422/502 classification.
- **Strong E2E coverage.** Playwright specs exercise drawing, multitouch, admin (both transports),
  AI flow, PWA updates, and palette layout against a production build.
- **Exemplary ADR discipline.** 31 records with Context / Decision / Consequences, honest about
  trade-offs (ephemeral rate limiting, eventual-consistency Blobs, manual CSRF origin maintenance).

## Prioritized recommendations

### 1. Add unit tests for the security-critical server logic

Today the only server unit test is `web/src/lib/server/aiSafety.test.ts`. The most security-sensitive
code is untested at the unit level and only *indirectly* exercised through E2E:

- `web/src/lib/server/admin.ts` — `sessionToken()` HMAC-SHA256 derivation and `verifySessionToken()`
  constant-time comparison. A silent regression here (label drift, or a fallback path that isn't
  constant-time) would be a real security bug that E2E happy-paths would not catch.
- `web/src/lib/server/tokens.ts` — allowlist membership (`isAllowedToken()`) and the seed-on-empty
  behavior.
- `web/src/lib/server/rateLimit.ts` — the sliding-window counter: window boundary, reset after the
  window, and the exact limit edge (Nth request allowed, N+1 blocked).

These are unit-testable today without standing up Netlify functions — the Blobs-backed paths already
fall back to in-memory. Mirror the existing `aiSafety.test.ts` style with colocated `*.test.ts` files.

**Value:** high — security-critical, currently a blind spot. **Risk:** low — additive tests only.

### 2. Extract and unit-test `engine.ts` pure decision logic

`web/src/lib/drawing/engine.ts` (~745 lines) is imperative by design (ADR-0004) and should stay that
way. But several *pure* decisions are inlined and only reachable through the `/dev/engine` harness
(`web/tests/engine.spec.ts`):

- Edge-swipe vs. stroke decision (the `EDGE_SWIPE_*` buffering/commit logic).
- Pointer-resume detection (`POINTER_RESUME_GAP_MS` idle gap + jump-distance threshold).
- Multi-touch undo grouping (treating simultaneous touches as one undo entry).

`strokeMath.ts` (+ `strokeMath.test.ts`) already demonstrates the pattern. Pull these predicates into
pure helpers — in `engine.ts` or a sibling such as `pointerGestures.ts` — and unit-test them. This
gives fast regression coverage for the subtlest, hardest-to-E2E behavior without touching the
imperative rendering path.

**Value:** high — these are the gesture edge cases most likely to silently regress. **Risk:** low —
extraction is mechanical; behavior unchanged.

### 3. Wire the existing `ToggleRow` into `SettingsToggles`

`web/src/lib/components/parent/SettingsToggles.svelte` (~371 lines) hand-rolls 18 near-identical
boolean toggles, while `ToggleRow.svelte` already exists to abstract exactly that and is currently
unused. Drive the toggles from a definition array (`{ label, icon, getter, setter }`) looped through
`ToggleRow`. This finishes an abstraction that was already started and removes ~100 lines of
duplicated markup.

**Value:** medium — clear maintainability win, every future toggle becomes one array entry.
**Risk:** low.

## Secondary observations

Noted for awareness; not prioritized for action.

- **`AdminConsole.svelte` (~879 lines) is a god component** — login + token CRUD + usage display +
  copy-feedback state in one file. Acceptable for a low-traffic, non-user-facing admin surface; a
  future split (LoginForm / TokenList / UsageCard) would help if it keeps growing.
- **Undo snapshots are full-resolution canvases, up to 10 deep.** On a large tablet (~2732×2048 at
  2× cap) that approaches ~25–30 MB of retained image data. This ties directly into ADR-0015's own
  open item ("not yet verified on real device"). Worth on-device profiling before any change — not a
  blind optimization.

## Non-findings

Recorded so they aren't repeatedly re-raised. Each was checked and is fine as-is.

- **npm audit count.** Production-only `npm audit --omit=dev` reports **0 high / 0 critical** (the
  remaining moderate items are transitive via SvelteKit's `cookie` and Netlify's OpenTelemetry). The
  alarming "6 high" in the full audit are all dev/build-tool transitive (`tar`, `minimatch`, Capacitor
  asset scripts). CI deliberately gates at `critical` only (ADR-0031) — correct for this project.
- **The `patch-package` patch on `@capacitor/cli`.** It is a legitimate, documented Windows
  `gradlew.bat` fix (ADR-0011), not a workaround for a bug in our own code.
- **No pre-commit hooks** (ADR-0031) and **ephemeral in-memory rate limiting** (ADR-0014) are both
  deliberate, documented trade-offs with sound rationale.
