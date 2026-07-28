# The `/dev/engine` readiness `beforeEach` and state readers are duplicated across engine and multitouch specs

**Original finding:** [P2][duplication] — `web/tests/engine.spec.ts:24-40`,
`web/tests/multitouch.spec.ts:15-55` (pinned at f934d43) — deferred because the implementer failed
to deliver a fix round that satisfied the reviewer. **Verdict:** FIX

## Context

At f934d43, `multitouch.spec.ts` copied the `engine.spec.ts` navigate-and-poll `beforeEach`
character-for-character (same explanatory comment included), duplicated the `count` reader, and
overlapped on `state`/`alphaAt`. The `__engineReady === true` poll lived in three files (`engine`,
`multitouch`, `global-setup`), so any change to how the dev harness signals readiness had to be
edited in lockstep. The proposed solution was a shared `web/tests/engine-harness.ts` exporting the
readiness hook plus the `count`/`state`/`alphaAt` readers — kept out of `helpers.ts`, which must
stay free of dev-harness `window.__engine` globals so the WebKit smoke project can keep importing it
(see the note in `web/tests/.ruler/AGENTS.md` / `.claude/rules/testing.md`).

The burndown attempt migrated only part of the multitouch spec and was rolled back. The single
unresolved reviewer objection:

> The reader extraction is incomplete: `multitouch.spec.ts:16` still defines its own `alphaAt`, and
> lines 62, 68, and 75 bypass the shared `state` reader. Export the pixel-alpha reader from
> `engine-harness.ts` and use it together with `state` in the multitouch spec so the dev-harness
> readers are actually centralized.

The rolled-back draft
(`docs/audit-deferred/p2-duplication-the-dev-engine-readiness-beforeeach-and-state-readers-are.patch`)
did two of the four steps: it imported the shared `count` and deleted the local `beforeEach`
(relying on the harness module registering its readiness hook at import time). It left `alphaAt`
local and left the inline `window.__engineState` evaluates in place — exactly what the reviewer
flagged.

## Current state (verified at HEAD 63a7aa49)

The finding is **about 85% fixed already**. `web/tests/engine-harness.ts` exists and is the shared
harness the finding asked for:

* It registers the canonical readiness `beforeEach` (navigate once, poll `__engineReady`, ride
  through the DEV_SERVER=1 dep-optimize reload) at module scope — importing the module installs the
  hook.
* It exports `drawStroke(page, box, points)`, `state(page)` (reads `window.__engineState`), and
  `count(page)` (reads `window.__engine.nonTransparentCount()`).
* `engine.spec.ts` no longer exists; it was split into nine `engine-*.spec.ts` files
  (`engine-crayon`, `engine-eraser`, `engine-export`, `engine-lifecycle`, `engine-pointer-recovery`,
  `engine-resize`, `engine-rotation`, `engine-snapshot-tier`, `engine-undo`), and **every one of
  them imports from `./engine-harness`**.

The one remaining holdout is `web/tests/multitouch.spec.ts`, unchanged from the finding's
description:

* Line 15: local `count` — verbatim duplicate of `engine-harness.ts:20`.
* Lines 16–17: local `alphaAt` — the pixel-alpha reader the reviewer wanted exported.
* Lines 45–54: a full copy of the readiness `beforeEach` (shorter comment, same body). This is the
  only `__engineReady` occurrence left in any `*.spec.ts`; the other occurrences are the legitimate
  homes (`engine-harness.ts`, `global-setup.ts`, `global.d.ts`).
* Lines 78, 87, 94: inline `page.evaluate(() => window.__engineState)` instead of the shared `state`
  reader.

No `alphaAt`/pixel-alpha export exists in `engine-harness.ts` yet. (Many `engine-*` specs read
`window.__engine.pixelAt(x, y)[3]` inline, but usually inside larger `evaluate` closures or with
browser-side-computed coordinates — see "out of scope" below.)

## Decision / lean

**FIX** — finish the migration the previous attempt left half-done. The shared harness already
exists, the pattern is proven across nine specs, and the remaining change is small, mechanical, and
behavior-preserving. There is no competing design worth an OPTIONS doc: the only open question the
review left was "centralize the readers fully", and the answer is to do so.

Concretely, two files:

**1. `web/tests/engine-harness.ts`** — add the pixel-alpha reader, named `alphaAt` (matching the
multitouch spec's existing name means zero churn at call sites; the finding's alternative name
`pixelAlpha` buys nothing):

```ts
export const alphaAt = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => window.__engine.pixelAt(px, py)[3], [x, y] as const);
```

**2. `web/tests/multitouch.spec.ts`** —

* Replace the local `count` (line 15), local `alphaAt` (lines 16–17), and the whole local
  `beforeEach` (lines 45–54) with a single import:

  ```ts
  import { alphaAt, count, state } from './engine-harness';
  ```

  Importing the module registers the shared readiness hook — the exact mechanism every
  `engine-*.spec.ts` already relies on (e.g. `engine-crayon.spec.ts` imports only `count` and gets
  the `beforeEach` for free).
* Replace the three inline `page.evaluate(() => window.__engineState)` uses (lines 78, 87, 94) with
  `state(page)` — e.g. line 94 becomes `const s = await state(page);`.
* Drop `type Page` from the `@playwright/test` import if nothing else in the file needs it after the
  local readers go (nothing does — `horizontalStroke` and the tests use only fixtures).

**Verification:**

* `grep -l "__engineReady" web/tests/*.spec.ts` → no matches (only `engine-harness.ts`,
  `global-setup.ts`, `global.d.ts` remain).
* `grep -n "window.__engine" web/tests/multitouch.spec.ts` → only the `multiStrokeSync` and `undo()`
  driver calls remain (those are the spec's subject, not readers — leaving them inline is correct).
* `npm run test:e2e -- multitouch.spec.ts` green (add `--repeat-each=3` for cheap flake confidence;
  this is a pure refactor, so identical behavior is the expectation, not a hope).

## Why the previous attempt failed, and how this path avoids it

The reviewer's one objection maps directly onto the remaining work:

* *"`multitouch.spec.ts:16` still defines its own `alphaAt` … export the pixel-alpha reader from
  `engine-harness.ts`"* → resolved by step 1 (export `alphaAt`) plus using it in multitouch. The
  previous implementer stopped at `count` + the `beforeEach`; this completes the reader set.
* *"lines 62, 68, and 75 bypass the shared `state` reader"* (lines 78/87/94 at HEAD) → resolved by
  replacing the three inline `__engineState` evaluates with `state(page)`.

The objection was **not** scope creep — it named specific lines in the one file being touched and
asked for exactly what the finding's own proposed solution promised. The failure was incomplete
execution, not reviewer overreach. Doing the whole (small) job satisfies it.

**Explicitly out of scope**, to prevent the opposite failure mode (scope ballooning) on the fix
round:

* The dozens of inline `window.__engine.pixelAt(...)[3]` reads across `engine-rotation`,
  `engine-snapshot-tier`, `engine-undo`, `engine-resize`, and `engine-pointer-recovery`. Many cannot
  use a two-arg `alphaAt(page, x, y)` at all — they compute coordinates browser-side from canvas
  dimensions (`engine-snapshot-tier.spec.ts:80`) or sit inside larger `evaluate`
  closures/`expect.poll` callbacks. A repo-wide reader migration is a different, larger change with
  its own review; the sibling deferred finding on crayon-test point generators/samplers
  (`crayon-test-helpers.md`) already covers the worst cluster. The reviewer never asked for this.
* `helpers.ts` stays untouched — the WebKit-portability constraint (no dev-harness `window.__engine`
  globals in `helpers.ts`, nothing CDP/dev-harness importable by `webkit-smoke.spec.ts`) is honored
  by placing `alphaAt` in `engine-harness.ts`, which the WebKit smoke spec does not import.
