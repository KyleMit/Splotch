# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

## Source: Session audit

## Source: Deferred-audit triage — FIX verdicts (2026-07-27)

These 30 findings were deferred by earlier `burn-down-audits` runs (failed implementation or failed
adversarial review), then triaged on 2026-07-27 with a FIX verdict: a single clear-winner solution,
including — where a rolled-back draft exists in `docs/audit-deferred/*.patch` — exactly what must
change versus that draft to survive the recorded reviewer objections. Each entry carries its prior
review context; line numbers cite the SHAs noted inline. The triage's disposition index
(`docs/audit-deferred/triage/README.md`) lives in git history; the directory was removed once every
verdict was dispatched.

### [P2][complexity] `readStore` bundles store-open, read, seed, confirmation-loop, and fallback into one function

**File(s):** `web/src/lib/server/tokens.ts:67-111` — pinned at SHA f934d43

#### Problem

`readStore` is the token module's linchpin and carries five responsibilities in one ~45-line body:
open the store, read the key, seed from env on empty, run the multi-attempt seed-race confirmation
loop, and degrade to the memory fallback. The nested confirmation loop (a `for` with an inner
`try/catch` inside the outer `try`) is the subtle, correctness-critical ADR-0025 lost-seed-race
handling, buried where it is hard to read in isolation. Proposed: extract it as
`confirmSeedRaceWinner(store): Promise<StoreRead>`.

**State at triage (2026-07-27):** Fully holds. `readStore` (`web/src/lib/server/tokens.ts:67-111`)
is byte-identical to the pinned version — the f934d43..HEAD churn in this file (67bb0ac's
`mutateList` extraction, 782cf6e's `reason` discriminant, c16b441's comment) all landed in the
mutation half below it. The confirmation loop is at lines 88-98, the `unconfirmed` degradation at
99-100. The test surface is unchanged too: `tokens.test.ts` has the
`freshTokensWithSeedRace(seed, list, hiddenReads)` helper (line 81) and the `stale-empty seed races`
describe block (line 147) exercising the loop through the public API.

**Prior attempt / why it was deferred:** Driver defect, not a code judgment: the run's
`.audit-work/current-brief.md` was stale (it still described the invite-actions finding deferred
minutes earlier), the verifier marked this finding VALID without writing a fresh brief, and the
implementer correctly refused to act on the wrong brief. No implementation was attempted; no
objections exist.

#### Proposed solution

**FIX — clear winner.** The proposed `confirmSeedRaceWinner` extraction is a small,
behavior-preserving cut along a real seam, it matches the house style the neighboring `mutateList`
extraction (67bb0ac) already set in this same file, and no reviewer ever objected to anything — the
deferral was purely a driver defect.

Implement option 1. Sketch (the `:88-100` block moves verbatim, with the
`SEED_CONFIRMATION_BACKOFF_MS` rationale comment traveling with it):

```ts
// ADR-0025: we lost the seed race (`onlyIfNew` write not modified) — some other
// instance seeded first. Reread until the winner's list is visible; never throws,
// so a transient read failure does not deny a current token.
async function confirmSeedRaceWinner(store: TokenStore): Promise<StoreRead> {
  for (let attempt = 1; attempt <= SEED_CONFIRMATION_ATTEMPTS; attempt++) {
    await sleep(SEED_CONFIRMATION_BACKOFF_MS * attempt);
    try {
      const winner = await store.getWithMetadata(KEY, { type: 'json' });
      if (winner && Array.isArray(winner.data)) {
        return { source: 'blobs', store, list: winner.data, etag: winner.etag };
      }
    } catch {
      // Keep trying so a single transient read failure does not deny a current token.
    }
  }
  console.warn('[tokens] Lost env-seed race but could not confirm the current list');
  return { source: 'unconfirmed', store, list: [] };
}
```

and in `readStore`: `if (!seededWrite.modified) return confirmSeedRaceWinner(store);` (inverting the
current `if (seededWrite.modified)` early-return keeps both arms explicit). Two invariants the
implementer must preserve, both trivially satisfied by a verbatim move:

* The helper **never throws** — the per-attempt inner `catch` stays inside the loop, so the outer
  `catch` in `readStore` (transient-error → memory fallback, no `blobsUnavailable` latch) keeps
  exactly its current reach.
* The `unconfirmed` return keeps `list: []` and no etag, which is what makes `isAllowedToken` deny
  and `mutateList` refuse to write against an unconfirmed read.

Keep the helper unexported: the existing `stale-empty seed races` tests already pin its behavior
through the public API, and exporting it just to test it directly would widen the module surface for
no coverage gain. Verification: `npm run test:unit` (the seed-race describe block), `npm run check`.

**Alternatives weighed:** 1. **Extract `confirmSeedRaceWinner(store)` as proposed** (winner). Names
the one subtle block, leaves `readStore` reading as open → get → present?-return : seed → confirm →
outer-catch → memory. Zero behavior change; consistent with `mutateList`. 2. **Also split the seed
branch / go further (e.g. `readFromBlobs` helper).** More uniform, but the remaining pieces are
already flat and self-describing; further cuts would just scatter the ADR-0025 commentary. Not worth
it. 3. **Do nothing.** The function works and is well-commented — but the finding is right that the
correctness-critical loop is the one part that deserves a name, and the cost is near zero.

**Landing note:** Re-stage in docs/AUDIT.md as-is (the original Proposed solution is an accurate
brief; the only fix needed is re-running verification so the driver writes a non-stale brief), or
just implement directly — it is a one-function mechanical move.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P2][complexity] `$effect` bodies use bare member-access statements purely to register reactive dependencies — a fragile, non-obvious pattern

**File(s):** `web/src/routes/+page.svelte:37-41` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch

#### Problem

The drawing shell's orientation `$effect` opens with two expression statements
(`settings.lockRotationEnabled; settings.forceLandscapeOrientation;`) whose only job is to trip
Svelte's dependency tracker, because `applyDeviceOrientationPreference()` reads the settings
internally, outside the tracked scope. A cleanup commit or lint pass can delete the bare reads and
silently kill reactivity. Proposed making the reads load-bearing (pass the values as arguments, or
read them into a `$derived`), "same for any other effect using this pattern".

**State at triage (2026-07-27):** Nothing from the draft landed. All four sites are unchanged at
HEAD:

* `web/src/routes/+page.svelte:27-31` — the two bare `settings.*` reads, and
  `web/src/lib/orientation.ts:14-25` still reads `settings` from module scope
  (`lib/boot/persistedState.ts:21` is the second zero-arg call site).
* `web/src/lib/components/ClearButton.svelte:32-35` — bare `layout.orientation;` +
  `untrack(resetButtonPosition)`.
* `web/src/lib/actions/pinchZoom.svelte.ts:228-233` and `pinchTextZoom.svelte.ts:122-127` — the
  inert `void` reads, still under the false comment "Reading these runes here is what subscribes the
  action to them".
* `eslint.config.js:52-55` — the `'@typescript-eslint/no-unused-expressions': 'off'` rule-off with
  its "idiomatic Svelte 5" justification comment.

Surrounding code has drifted (`persistedState.ts` is now async and reordered), so the patch no
longer applies plainly — `git apply --3way` succeeds with conflicts in `pinchTextZoom.svelte.ts` and
`persistedState.ts`. Since the prescription below reverts the draft's pinch-action hunks anyway,
re-deriving those two files by hand is cheaper than resolving the conflicts.

**The Svelte 5 idiom question, answered:** there is no officially sanctioned dependency-registration
API. Svelte 5 deliberately ships no dependency arrays; the documented model is that an effect
depends on whatever state it *read synchronously* during its last run, and the only official escape
hatch runs the other direction (`untrack`, for reading without depending). `$effect.tracking()`
merely reports whether you are in a tracking context — it registers nothing. Bare reads and
`void`-prefixed reads are both undocumented community conventions; the ecosystem's ergonomic wrapper
(e.g. runed's `watch(getter, cb)`) is precisely the read-then-`untrack` shape `ClearButton` already
hand-rolls. The Svelte-native answer to "depend on X without consuming it" is to restructure so the
value *is* consumed — which is what the draft's parameterization does. So the finding's direction is
sound; only its two dedupe embellishments were wrong.

**Prior attempt / why it was deferred:** Failed adversarial review across three rounds. Rounds 1-2
objections (ClearButton and the two pinch actions also use the pattern; the eslint rule-off would go
stale; `lastResetOrientation` assigned before the early-return guard) were all addressed. Round 3
left two unresolved objections against the amended draft:

* The `lastResetOrientation` dedupe added to `ClearButton.svelte` silently drops a reset the old
  code performed: `layout.orientation` is binary and the effect's only dependency, so the guard can
  only fire after a reset was *skipped* mid-gesture — drag the button, rotate mid-drag, rotate back,
  and the stale `transform` is never cleared and `coachmark?.dismiss()` never runs. The reviewer's
  own prescription: drop the dedupe; `untrack(() => resetButtonPosition(orientation))` already makes
  the dependency load-bearing, which is all the finding asked for.
* The `lastReset` dedupe added to `pinchZoom`/`pinchTextZoom` is an untested behavior change beyond
  the finding's scope; the smaller change is to pass the options in and reset unconditionally.

Round 3 also surfaced a decisive fact: the pinch actions' `void o.enabled; void o.resetKey;` were
**never dependency registrations at all**. Both call sites pass a getter returning a plain object
literal, so calling `getOptions()` inside the effect is what reads the runes and subscribes;
property reads off the returned plain object track nothing. Those lines are dead code under a false
comment.

#### Proposed solution

**FIX — clear winner.** Apply the draft's core (parameterize the orientation apply, re-enable
`@typescript-eslint/no-unused-expressions`) but strip both `lastReset*` dedupes it grew — they are
exactly the two objections that killed round 3, one of them a real behavior bug — and fix the pinch
actions by *deleting* the inert `void` reads rather than re-plumbing `reset`. Details below.

Apply the draft's intent with these exact deltas (the changes required to survive the recorded
objections):

1. **Keep from the draft:** the
   `applyDeviceOrientationPreference(lockRotationEnabled, forceLandscapeOrientation)` signature, the
   `+page.svelte` call passing `settings.*`, the eslint rule-off removal, and the probe-verified
   claim discipline (state that the re-enabled rule catches only the *bare-read* form — `void x;`
   still lints green, which is fine: after this change the only `void` reads left are genuine, like
   `ClearCoachmark.svelte:50`'s forced reflow). Re-derive the `persistedState.ts:21` threading by
   hand against its new async shape.
2. **ClearButton — drop the dedupe** (`lastResetOrientation`, its guard, and the inverted "still
   pending if the orientation flips back" comment). Keep only:

   ```svelte
   function resetButtonPosition(_orientation: Orientation) {
     coachmark?.dismiss();
     if (!containerEl || isDragging) return;
     containerEl.style.transform = '';
   }

   $effect(() => {
     const orientation = layout.orientation;
     untrack(() => resetButtonPosition(orientation));
   });
   ```

   Behavior is identical to today; deleting the effect's read is now a compile error (the argument
   references it), and the `_`-prefix keeps `@typescript-eslint/no-unused-vars`
   (`argsIgnorePattern: '^_'`) quiet without pretending the function consumes the value.
3. **Pinch actions — revert the draft's hunks entirely** (no signature change, no `lastReset`). Just
   delete `void o.enabled; void o.resetKey;` from both effects and replace the false comment with
   the truth: calling the getter is what subscribes the action to every rune it reads (`enabled`,
   `resetKey`, and the bound `target`). This is a pure dead-code/comment fix with no behavior change
   — the safest possible answer to the round-3 objection.

**Alternatives weighed:** 1. **Trimmed draft (winner).** Parameterize
`applyDeviceOrientationPreference`; delete the inert `void` reads and correct the false comments in
the pinch actions; thread the orientation through `untrack` in `ClearButton` with no dedupe;
re-enable `no-unused-expressions`. Every piece either strictly improves the code (the pinch lines
are dead code under a wrong comment), survived three review rounds unobjected (the orientation
parameterization), or is the reviewer's own final prescription (the ClearButton shape). The
re-enabled rule converts the finding's core hazard — a cleanup deleting a bare read — from silent
breakage into a lint error. 2. **Status quo + comments.** Keep the bare reads, strengthen comments,
keep the rule-off. Zero behavior risk, but the pinch comments are *factually false* today and would
need fixing anyway — at which point half of option 1 has happened — and the lint guard stays off
repo-wide, so the hazard the finding names remains silent. Loses. 3. **Shared `watch(getter, cb)`
helper** used by all sites. A new abstraction for three sites, only one of which (`ClearButton`)
actually wants untrack semantics; the shell effect and pinch effects don't. Indirection without
payoff. Loses.

**Landing note:** Re-stage in docs/AUDIT.md with the trimmed prescription above (apply the patch
with `git apply --3way`, resolve the two conflicts by re-deriving `persistedState.ts`, then make
deltas 2-3); one commit.

#### Verification

re-run the burndown's probe check (a throwaway component with a bare `layout.orientation;` in an
`$effect` must fail lint), then `npm run check`, `npm run lint`, `npm run test:unit`, and the E2E
suites the rounds used (`flows`, `clear-tutorial`, `parent-zoom`, `multitouch`); manually toggle
lock-rotation / force-landscape in Parent Center.

### [P5][readability] `+error.svelte` and both `handleError` hooks produce a `{ message }` that nothing ever displays

**File(s):** `web/src/routes/+error.svelte:1-7`, `web/src/hooks.client.ts:6-9`,
`web/src/hooks.server.ts:52-55` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p5-readability-error-svelte-and-both-handleerror-hooks-produce-a-message.patch

#### Problem

Both `handleError` hooks return `{ message: GENERIC_ERROR_MESSAGE }` (the `App.Error` shape), but
`+error.svelte` renders `<ErrorScreen />` with no props, and `ErrorScreen` hardcodes its own
"Something went wrong. Let's start a fresh drawing." A reader reasonably assumes the hook message
reaches the UI; it doesn't. Proposed either wiring `page.error?.message` into `ErrorScreen` or
dropping the payload to a comment saying the UI copy is intentionally fixed.

**State at triage (2026-07-27):** Unchanged at HEAD; the finding's surface facts all still hold, and
so do the review's counter-facts:

* `web/src/hooks.client.ts:7-10` and `web/src/hooks.server.ts:75-78` both return
  `{ message: GENERIC_ERROR_MESSAGE }` with no comment about who consumes it.
* `web/src/routes/+error.svelte` renders a prop-less `<ErrorScreen />`; `ErrorScreen.svelte`
  hardcodes its copy and is shared with the root layout's `<svelte:boundary>` (`+layout.svelte:30`),
  which has no `page.error` at all.
* `web/src/lib/errorLog.ts:1-3` still carries the actively false claim that the three sinks'
  "user-facing fallback stay[s] in step" — the render boundary never imports
  `GENERIC_ERROR_MESSAGE`.
* There is still no `web/src/error.html`, so SvelteKit's default fallback template (which renders
  `%sveltekit.error.message%`) is live for errors that escape `+error.svelte`, and a thrown `/api/*`
  handler returns the server hook's `{ message }` as its JSON error body.

The patch applies at HEAD only via `git apply --recount` — the final hunk's line counts are
truncated, so a plain `git apply` fails with "corrupt patch at line 54". Content-wise it is current.

**Prior attempt / why it was deferred:** Failed adversarial review. The driver correctly chose a
comment-only fix, but three rounds of comment wording each drew factual objections. Rounds 1-2
objections were all fixed in the draft (don't claim the message is never surfaced — SvelteKit's
default fallback error page renders `%sveltekit.error.message%` since there is no custom
`error.html`; don't claim it's "required by App.Error" — the hooks may return void; drop the false
"data-request error responses" clause — that path transports the message into `page.error` but
`+error.svelte` ignores it; name the real second consumer, the JSON error body of a thrown `/api/*`
`+server.ts` handler; fix `errorLog.ts`'s false "user-facing fallback stay in step" claim; add the
deliberate-ignore note to `+error.svelte`). One objection remains unresolved against the draft:

* The `+error.svelte` comment attributes `page.error.message` to the two `handleError` hooks, but
  the hooks set it only for *unexpected* errors. For expected `error(4xx)` throws it is the
  `error()` body — the common path in this repo (`web/src/routes/admin/+page.server.ts:45` throws
  `error(403, 'Forbidden')`, plus SvelteKit's own 404 `'Not Found'`) — and `hooks.server.ts` already
  documents that expected 4xx responses never reach `handleError`. The parenthetical must cover both
  sources.

#### Proposed solution

**FIX — clear winner.** Leave SvelteKit's error contract alone and land the draft's comment-only
documentation, with one sentence reworded to survive the last unresolved objection. Neither of the
finding's two code-change proposals (surface the message, or delete the plumbing) is correct — the
adversarial review itself proved the message is *not* dead data.

Apply the draft patch (with `--recount`), then make the single change that answers the surviving
objection: reword `+error.svelte`'s added comment so it no longer names the hooks as the setter.
Sketch:

```svelte
// page.error.message is deliberately ignored — ErrorScreen owns the user-facing
// copy. (Its value is the error() body for expected 4xx throws — the admin
// route's 403 'Forbidden', SvelteKit's own 404 'Not Found' — and handleError's
// returned message for unexpected failures.)
```

Everything else in the draft already incorporates the round 1-3 corrections and should land as-is:
the client-hook comment names only the fallback error page (no `/api/*` consumer client-side), the
server-hook comment names the fallback page plus the thrown-`/api/*` JSON body, and `errorLog.ts`
now states the constant is consumed only by the two hooks while the boundary/`+error.svelte` render
`ErrorScreen`'s own copy.

Verify with `npm run check`, eslint on the four touched files, and `npm run test:unit`; optionally
confirm behavior by visiting an unknown route (404 renders `ErrorScreen`, message ignored) and by
curling a throwing `/api/*` route to see `{ "message": "Something went wrong." }` in the JSON body.

**Alternatives weighed:** 1. **Leave the contract, document the flow (winner — the draft).** The
return value is framework API with two real consumers (fallback error page, `/api/*` JSON error
bodies); the only genuine defect is misleading comments, and the draft fixes exactly those. 2.
**Delete the plumbing** (return void from both hooks). Regresses the two surfaces that *do* show the
message to SvelteKit's generic `'Internal Error'`, and does nothing about `errorLog.ts`'s false
comment. The finding's "nothing ever displays it" premise is simply wrong. 3. **Surface
`page.error.message` in `ErrorScreen`.** Wrong for this app: the crash screen is toddler-facing with
deliberately fixed, friendly copy; `ErrorScreen` is shared with the render boundary, which has no
`page.error`; and on the common expected-error path the message would be `'Forbidden'` or
`'Not Found'` — developer copy, not a child-appropriate improvement.

**Landing note:** Apply the patch
(`git apply --recount docs/audit-deferred/p5-readability-error-svelte-and-both-handleerror-hooks-produce-a-message.patch`),
make the one comment reword above, and commit — small enough to fold into any nearby cleanup PR; no
re-staging in docs/AUDIT.md needed.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P3][maintainability] Hexagon geometry constants are scattered and coupled to a JS comment

**File(s):** `web/src/lib/components/ColorPicker.svelte:372-377` (CSS) and `:53-58` (JS comment) —
pinned at SHA f934d43

#### Problem

The hexagon is `width: 60px; height: 69px; /* height = width * 1.15 */`, and the snap logic's
comment asserts "a hexagon's farthest edge point is ~35px from its center" to justify
`HEX_SNAP_RADIUS = 40`. The JS numbers depend on the CSS numbers, but the coupling is only prose —
resizing the hexagon in CSS silently makes the snap radius wrong with no failing check. Proposed CSS
custom properties (`--hex-w`/`--hex-h`) plus deriving the snap radius from them.

**State at triage (2026-07-27):** Substantially resolved by drift since f934d43 (commits 7381a6c,
4288672, dae9fcb):

* `web/src/lib/design/trimGeometry.ts:139-146` — `HEX_GRID_GEOMETRY` centralizes the honeycomb
  geometry: `firstRowPx: 69` *is* the hexagon height and `columnPitchPx: 60` *is* its width.
* `web/src/lib/design/trimGeometry.test.ts:189-190` — the test parses the `.hexagon` block's
  `width`/`height` back out of `ColorPicker.svelte`'s `<style>` and asserts they equal the module's
  values. Bumping `width: 60px` in CSS now fails a unit test — the exact "no failing check" gap the
  finding described is gone.

The residue: `web/src/lib/components/ColorPicker.svelte:56-64` still hard-codes
`const HEX_SNAP_RADIUS = 40` beneath the "~35px from its center" prose (the farthest point of a
60×69 hexagon is its top/bottom vertex, height/2 = 34.5px; 40 = that plus ~5.5px of gap slop). A
future resize would fail `trimGeometry.test.ts` and force an update of `HEX_GRID_GEOMETRY`, but
nothing points the fixer at the snap radius two screens up — it would stay 40 silently.

**Prior attempt / why it was deferred:** Implementation failed (no further detail recorded).
Plausibly the attempt took the original proposal's heavier path — CSS custom properties read back
from JS — which has SSR/prerender and runtime-read complications and is now redundant anyway (see
below).

#### Proposed solution

**FIX — clear winner.** The finding's headline hazard — resizing the hexagon in CSS with no failing
check — was already closed by the trim-geometry work that landed after the pin. What remains is one
narrow residue: `HEX_SNAP_RADIUS = 40` is still an independent literal whose derivation lives only
in prose. Derive it from the already-test-pinned `HEX_GRID_GEOMETRY` module.

Import the module constant and make the derivation executable, keeping the value exactly 40:

```ts
import { HEX_GRID_GEOMETRY } from '$lib/design/trimGeometry';

// Farthest hexagon point from its center is the top/bottom vertex, half the
// height; the slop covers the clip-path gaps between hexagons.
const HEX_GAP_SLOP_PX = 5.5;
const HEX_SNAP_RADIUS = HEX_GRID_GEOMETRY.firstRowPx / 2 + HEX_GAP_SLOP_PX;
```

Trim the "~35px" prose to reference the derivation instead of restating the number. Do not resurrect
the `--hex-w`/`--hex-h` custom-property half of the original proposal — `trimGeometry.test.ts`
already guards the CSS side, and the module is the established home for these numbers.

**Alternatives weighed:** 1. **Derive `HEX_SNAP_RADIUS` from `HEX_GRID_GEOMETRY` (winner).** Zero
runtime cost, one source of truth, and it rides the test-pinning machinery the repo already built
for exactly this geometry. Beats the runner-up because the constant stays static and inspectable. 2.
**Measure at runtime in `snapshotHexCenters`** (radius = measured `rect.height / 2` + slop).
Self-adjusting even for per-breakpoint size changes — but the hexagon size never varies at runtime
today, so this adds a dynamic value and a subtle drag-time dependency for no observed need. 3. **CSS
custom properties read via `getComputedStyle`** (the original proposal). Runtime read, SSR/prerender
awkwardness, and now redundant: the test pinning already provides the failing check the custom
properties were meant to enable.

**Landing note:** Re-stage in `docs/AUDIT.md` narrowed to the snap-radius derivation above (the rest
of the original finding is already done).

#### Verification

the constant still evaluates to 40 (behavior unchanged), the picker gap-drag E2E still passes, and
`trimGeometry.test.ts` needs no changes.

### [P3][performance] Every swatch element is captured into `$state`, but only the custom swatch's ref is read

**File(s):** `web/src/lib/components/ColorPalette.svelte:23, 137, 85` — pinned at SHA f934d43

#### Problem

`let swatchEls = $state<Record<string, HTMLButtonElement>>({})` receives a `bind:this` from every
palette button, but the only consumer is `selectCustomColor` reading `swatchEls[CUSTOM_SWATCH]`. All
ten color-swatch refs are stored into a reactive `$state` record nothing reads, causing "needless
proxy writes on mount/trim". Proposed binding only the custom swatch into a single variable.

**State at triage (2026-07-27):** Still present, shifted a few lines:
`web/src/lib/components/ColorPalette.svelte:23` (the `$state` record), `:133` (per-swatch
`bind:this`), `:149` (custom-swatch `bind:this`), `:80` (the sole read, inside `selectCustomColor`).
`rg swatchEls` confirms those four sites are the only uses.

The perf claim does not hold up:

* `PALETTE_COLORS` is a static list and swatch trimming is pure CSS (`display: none` media queries)
  — buttons never mount or unmount at runtime, so there are no "trim" writes at all. The proxy
  receives exactly eleven writes, once, at mount.
* Nothing reads the record in a reactive context — the one read is inside a pointer-event handler —
  so the `$state` proxy never triggers an effect, a derived, or a template invalidation.

Total cost: nanoseconds at mount, zero steady-state. As a performance finding this is invalid. As a
readability finding it is real: the reactive record signals "these refs drive reactivity" when ten
of eleven are dead weight, and `$state` isn't needed even for the live one.

**Prior attempt / why it was deferred:** Verifier unavailable — the burndown recorded no
verification brief either way.

#### Proposed solution

**FIX — clear winner**, but reframed: the performance claim is negligible and should not be the
justification. The cleanup stands on readability — ten dead `bind:this` bindings and a reactive
record that misleads a reader into thinking per-swatch refs matter. Replace the record with a single
plain `let customSwatchEl`, matching the `paletteEl` precedent in the same file.

Three-line change, behavior identical:

```svelte
let customSwatchEl: HTMLButtonElement | undefined;
...
colorPicker.show(customSwatchEl ? buttonCenter(customSwatchEl) : null);
```

Delete `bind:this={swatchEls[hex]}` from the palette-button `{#each}` (line 133) and change the
custom swatch's binding (line 149) to `bind:this={customSwatchEl}`. When re-staging, file it as
maintainability/readability, not performance.

**Alternatives weighed:** 1. **Single plain `let customSwatchEl` (winner).** `paletteEl` at line 22
is already a plain (non-`$state`) `bind:this` target in this component, and the ref is only read
inside an event handler, so no reactivity is required. Smallest diff, removes all dead bindings. 2.
**Keep the record but make it non-reactive** (plain object). Fixes the misleading `$state` but keeps
ten dead bindings and the misleading record shape. Strictly worse than option 1.

**Landing note:** Re-stage in `docs/AUDIT.md` reframed as a P4 readability cleanup (or fold into any
small palette touch-up PR).

#### Verification

`rg swatchEls` returns nothing; opening the picker still flies in from the custom swatch's center
(`buttonCenter` anchor) — covered by tapping the gradient swatch in the existing picker E2E flow.

### [P1][consistency] Unify the two error-response shapes across the API surface

**File(s):** `web/src/lib/server/http.ts:9-15,22-27`;
`web/src/routes/api/generate-image/+server.ts:17-19,71,72,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:32,60`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24` — pinned at SHA f934d43

#### Problem

Endpoints emit two incompatible JSON error shapes with no rule for which: `{ ok: false, error }`
(from `throttled()`, `verify-access-code`, `verify-key`, `report`) versus SvelteKit's `{ message }`
(every `throw error(...)` in generate-image / `generationAuthorization`, plus `readJsonBody`'s 400).
The same endpoint can return both — in `report`, a malformed body yields `{ message }` while a
missing `kind` yields `{ ok: false, error }` — so a client cannot parse a 400 without sniffing the
shape. The API skill even advertises "clients surface the `error` field directly", which is false
for every `error()`-thrown response.

**State at triage (2026-07-27):** Still fully present at HEAD. The routes drifted since f934d43
(`asRecord`/`stringField` helpers, `rateLimitPolicy`/`rateLimitKeys` extraction,
`config.geminiApiKey()`), but none of that touched the error shapes. The client-facing
`throw error(...)` inventory at HEAD:

* `generate-image/+server.ts` — 400 ("Missing image" ×2), 413 ("Image is too large" ×3), 415
  ("Unsupported image type"), 422 (safety refusal), 502 (upstream failure)
* `generationAuthorization.ts` — 403 ("Invalid access token"), 500 (missing `GEMINI_API_KEY`)
* `http.ts` `readJsonBody` — 400 ("Expected a JSON body"), reachable from every JSON endpoint
* `admin/tokens/+server.ts` — 401 ("Unauthorized") (documented in the API skill as `{ message }`;
  not in the finding's file list but part of the same inconsistency)

`csp-report` is a deliberate exception: its 413/415/204 responses are bodyless by design (browsers
ignore the response) and should stay exempt.

**Wire-compat check (the deployed-native-app hazard):** unification is safe. What clients parse
today, verified at HEAD:

* generate-image — `readAiImageResponse` (`web/src/lib/drawing/aiImageResponse.ts`) branches on
  status only (422 → safety, 429 → throttled) and reads the body via `.text()` into a `detail` that
  `aiImage.ts` only ever logs to the console. Shipped native/multipart clients run the same parser.
  No client reads `message`.
* verify-access-code / verify-key — `aiCredential.ts` reads `data.error` with a `.catch(() => ({}))`
  fallback; a `{ message }` 400 today yields `undefined` and generic copy, so switching it to
  `{ ok, error }` strictly improves what the client can show.
* report — `ReportForm.svelte` reads `data.error` with a fallback string; same strict improvement.
* admin 401 — the native admin page (`routes/admin/native/+page.svelte:79`) branches on
  `response.status === 401` and never reads that body.

No deployed client parses `{ message }`, so no app-store release needs to precede the change.

**Prior attempt / why it was deferred:** "Implementation failed": the code change itself was
implemented and verified, but Ruler regeneration could not update `.agents/skills/api/SKILL.md`
because the burndown's nested sandbox denied writes under `.agents/`, leaving the doc-sync half of
the change incomplete. No reviewer objection was recorded and no patch was kept. In a normal session
`npm run ruler:apply` writes both generated trees fine — the blocker does not exist outside that
sandbox.

#### Proposed solution

**FIX — clear winner.** Normalize every client-facing JSON error to `{ ok: false, error }` via a
`fail()` builder plus a thin per-route wrapper that converts thrown SvelteKit `HttpError`s at the
handler boundary. The deferred run's only blocker was environmental (a sandbox that couldn't write
`.agents/`), not a design or review objection, and the wire change is verifiably safe for every
deployed client.

In `web/src/lib/server/http.ts`:

```ts
export function fail(status: number, error: string, headers?: HeadersInit): Response {
  return json({ ok: false, error }, { status, headers });
}

export function apiHandler(handler: RequestHandler): RequestHandler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, err.body.message);
      throw err; // genuinely unexpected → SvelteKit 500 + handleError, as today
    }
  };
}
```

Then: reimplement `throttled()` on top of `fail()` (adding the `Retry-After` header); wrap every
`/api/*` handler export in `apiHandler(...)` — including `admin/login` and `admin/tokens`, so the
401 also becomes `{ ok: false, error: 'Unauthorized' }` (client-safe per the check above) — except
`csp-report`, which keeps its documented bodyless responses (leave it unwrapped, or wrapped is
harmless since it throws nothing).

Doc sync in the same change (the part the sandbox blocked): update `.ruler/skills/api/SKILL.md` (the
"clients surface the `error` field directly" claim becomes true; the admin 401 example body; note
csp-report's bodyless exemption) and add the `fail()`/`apiHandler` convention to
`.claude/rules/server-api.md` (direct-edited, not generated), then `npm run ruler:apply`.

Extend `scripts/api-smoke.mjs` with the assertion the finding asked for: every JSON failure body it
already exercises (403 invalid token, 400 missing image, malformed-body 400, admin 401) is
`{ ok: false, error: string }`.

Sequencing within C11: land this first — the contract-types finding
([issue \#567](https://github.com/KyleMit/Splotch/issues/567)) wants an
`ApiError = { ok: false; error: string }` type that is only truthful once this ships. Findings 2 and
3 (helper extractions) are independent.

**Alternatives weighed:** 1. **`fail()` + a handler-boundary wrapper (winner).** Add
`fail(status, error, headers?)` to `http.ts` and a small `apiHandler()` that catches thrown
`HttpError`s and re-emits them through `fail()`. Throw-based control flow stays exactly as written —
`readJsonBody`'s signature, generate-image's deferred `readValidatedImage` thunk, and
`generationAuthorization`'s throws all survive unchanged — and the invariant is enforced in one
place that new endpoints inherit. 2. **Convert every throw site to a returned `fail()` Response (the
finding's original proposal).** Same wire result, but it threads `Response` unions through
`readJsonBody`, the image-reading thunk, and `authorizeGenerationRequest`'s already-union return
type — more churn, and nothing stops the next endpoint from reintroducing a bare `throw error(...)`.

Option 1 wins on churn and on making the shape a guarantee rather than a convention.

**Landing note:** Re-stage in docs/AUDIT.md with the wrapper approach and the doc-sync + smoke-test
additions folded into the brief; no patch exists to apply. Land before the contract-types finding.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P2][duplication] Move content-type parsing into a shared `http.ts` helper

**File(s):** `web/src/routes/api/generate-image/+server.ts:33-34` (`contentTypeOf`) and
`web/src/routes/api/csp-report/+server.ts:104-107` — pinned at SHA f934d43

#### Problem

The exact "strip params, trim, lowercase the Content-Type" expression is written twice —
generate-image's `contentTypeOf` arrow and an inline copy in csp-report. Both endpoints branch on
Content-Type for correctness (multipart vs raw body; the telemetry format allowlist), so silent
divergence is a real behavioral bug risk, and the pattern belongs beside `readJsonBody`.

**State at triage (2026-07-27):** Still holds verbatim at HEAD. generate-image moved to lines 31-32
(`contentTypeOf`, used at line 59 for the multipart branch and line 91 for the raw `mimeType`);
csp-report's inline copy is now at lines 113-116. The working tree is clean — the untracked failing
test files that blocked the burndown run are gone, so the original blocker no longer exists.

**Prior attempt / why it was deferred:** "Implementation failed": the shared normalizer and both
route updates were implemented with passing focused tests, but the burndown's `npm run test:unit`
gate was red because of **two pre-existing, unrelated untracked test files** in that environment (13
unrelated failing assertions), so no commit was made. No design or review objection was recorded.

#### Proposed solution

**FIX — clear winner.** Extract the one-line normalizer into `web/src/lib/server/http.ts` and use it
in both routes. The deferred implementation was correct; it was only blocked by pre-existing failing
test files that no longer exist.

Add to `web/src/lib/server/http.ts`:

```ts
export function contentTypeOf(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}
```

Delete generate-image's local arrow (its two call sites keep the same name) and replace csp-report's
four-line inline expression with `const contentType = contentTypeOf(request);`. Add a small unit
test (params stripped, case folded, absent header → `''`).

No interaction with the error-shape decision (finding 1) — this helper never touches a response. It
composes trivially with the oversized-body extraction (finding 3); doing both in one `http.ts` pass
is fine.

**Alternatives weighed:** Only trivial variants exist (helper location, name). `http.ts` is the
right home — both callers are server routes, and it already hosts the sibling request-parsing
helpers (`readJsonBody`, `asRecord`, `stringField`). One naming note: the finding proposes
`contentType(request)`, but csp-report already has a local `const contentType` it would shadow;
prefer generate-image's existing name `contentTypeOf(request)` so both call sites read the same and
no local rename is forced beyond deleting the duplicates.

**Landing note:** Re-stage in docs/AUDIT.md as-is (with the `contentTypeOf` naming note); the
verification gate that killed the run was environmental and is already clear. Verify with
`grep -rn "split(';')" web/src/routes` (expect no hits) and `npm run test:api:smoke`.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P2][duplication] Extract the oversized-body guard shared by generate-image and csp-report

**File(s):** `web/src/routes/api/generate-image/+server.ts:83-92` and
`web/src/routes/api/csp-report/+server.ts:114-122` — pinned at SHA f934d43

#### Problem

Both endpoints implement the same two-stage security cap — reject on declared `Content-Length`
before buffering, then re-check the actual byte length after the read (a code-unit check would
under-count multibyte payloads) — as two independent copies. A fix to one (e.g. chunked-encoding
handling) won't reach the other.

**State at triage (2026-07-27):** Still holds at HEAD. generate-image's raw-branch guard is now at
lines 80-90 (declared-length check, zero-copy `Buffer.from(await request.arrayBuffer())`, empty-body
400, byte re-check); csp-report's is at lines 121-131 (declared-length check, `request.text()`,
`TextEncoder` re-encode to count bytes). The working tree is clean — the untracked failing tests
that blocked the run are gone.

**Prior attempt / why it was deferred:** "Implementation failed": a shared zero-copy raw-body reader
was implemented, both endpoints migrated, and byte-limit + UTF-8 coverage added — but the burndown's
`npm run test:unit` gate was red because of two pre-existing **untracked** test files with 13
unrelated failing assertions, so no commit was made. No design or review objection was recorded.

#### Proposed solution

**FIX — clear winner.** Extract one result-returning capped-body reader into `http.ts` and let each
endpoint keep its own 413 response style. The deferred implementation matched this shape and was
blocked only by pre-existing failing test files that no longer exist.

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

**Alternatives weighed:** 1. **One result-returning helper (winner).**
`readBodyWithinLimit(request, maxBytes)` returns `{ ok: true, bytes: Buffer } | { ok: false }`; each
caller maps `ok: false` to its own 413. Pros: preserves both endpoints' deliberately different 413
styles — generate-image's `throw error(413, 'Image is too large')` (JSON body) versus csp-report's
documented **bodyless** `new Response(null, { status: 413 })` (browsers ignore CSP-report responses)
— keeps the zero-copy buffer, and csp-report's byte cap becomes exact by construction
(`bytes.byteLength` then `bytes.toString('utf8')`), dropping the `TextEncoder` re-encode. 2. **Three
throwing helpers (the finding's proposal:** `declaredLengthExceeds` / `readCappedBuffer` /
`readCappedText` throwing `error(413)` **).** Cons: a thrown 413 in csp-report either changes its
documented bodyless contract or forces a try/catch translation at the call site; three exports where
one primitive suffices; and after finding 1's `apiHandler` wrapper lands, the thrown 413 would
silently become a JSON body on an endpoint that must stay bodyless.

Option 1 wins because the two endpoints' response styles genuinely differ and should — the helper
should own the *measurement*, not the *response*.

**Landing note:** Re-stage in docs/AUDIT.md with the result-style helper substituted for the
original three-helper brief. Verify with the new unit tests plus `npm run test:api:smoke` (covers
csp-report's cap).

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P2][platform-branching] Install-prompt module branches on `isNative()` at runtime where it could be a build-time exclusion

**File(s):** `web/src/lib/state/install.svelte.ts:82-120`, `web/src/routes/+page.svelte:164-167` —
pinned at SHA f934d43

#### Problem

The install feature is dead inside the native shell yet ships in the native bundle, gated three
times at runtime: the module-load `beforeinstallprompt`/`appinstalled` listener block
(`if (browser && !isNative())`), an `isNative()` early return inside `initInstallPrompt()`, and an
`if (!isNative())` guard at the `+page.svelte` call site. CLAUDE.md's rule says `CAPACITOR=true` is
the single signal for web-vs-native branching; guarding on the compile-time literal
`__IS_CAPACITOR__` would let Rollup drop the code from the native bundle, where `isNative()` cannot
tree-shake.

**State at triage (2026-07-27):** Substantially drifted since f934d43 — the finding is one-third
resolved and the codebase has grown the exact convention that resolves the deferral blocker:

* The caller-side guard is now build-time. `+page.svelte` no longer checks `isNative()`; it calls
  `initWebOnlyServices()` (`web/src/lib/boot/webOnlyServices.ts:8`), which returns early on
  `if (__IS_CAPACITOR__)` before touching PWA updates or `initInstallPrompt()`.
* The two in-module runtime guards remain verbatim: the module-load listener block at
  `web/src/lib/state/install.svelte.ts:83` (`if (browser && !isNative())`) and the early return in
  `initInstallPrompt` at line 105 (`if (!browser || initialized || isNative()) return;`).
* The whole-module-drop payoff is now unattainable regardless of guards:
  `web/src/lib/components/parent/SetupInstructions.svelte:6-11` imports `install`, `promptInstall`,
  and `installDeviceOs` from this module, and that component ships on native (it renders the Guided
  Access / App Pinning setup there). The module stays in the native bundle; only branch bodies
  inside it can be eliminated.
* The repo has codified a composite idiom for exactly this situation, post-pin:
  `web/vitest.config.ts:15-18` documents that `__IS_CAPACITOR__` is defined `true` in tests so
  branches written as `__IS_CAPACITOR__ && isNative()` stay compiled in and tests steer via runtime
  `isNative()` mocks. `SetupInstructions.svelte:39-44`
  (`const native = __IS_CAPACITOR__ && isNative();`) and `web/src/lib/orientation.ts:35` both use
  it, with comments explaining the shape.

**Prior attempt / why it was deferred:** Implementation failed on a verification note the brief got
wrong: `web/vitest.config.ts` defines `__IS_CAPACITOR__` as `true`, so a bare
`if (browser && !__IS_CAPACITOR__)` guard compiles the listener block *out* under Vitest and 15 web
install-state tests go inert before their mocked `isNative()` is ever consulted. Fixing that seemed
to require an out-of-scope test-config change, so the scoped change was abandoned.

#### Proposed solution

**FIX — clear winner.** Convert the two remaining runtime `isNative()` guards in `install.svelte.ts`
to the composite `__IS_CAPACITOR__ && isNative()` idiom the repo has since codified. That idiom is
precisely the answer to the test-config blocker that killed the original attempt — but the original
brief's goal ("Rollup drops the whole module from the native bundle") must be rewritten: it is
unattainable at HEAD, and the caller-side guard is already build-time.

Rewrite the finding around option 1 before re-staging — the original brief's verification step
("grep the native bundle for `beforeinstallprompt` — should be absent") is wrong and would fail
review again, since `SetupInstructions` pins the module into the native bundle. Sketch:

```ts
// install.svelte.ts — module-load block (line 83)
// Build-time first, runtime factor for tests (which define __IS_CAPACITOR__ as
// true and steer via isNative() mocks) — see vitest.config.ts.
if (browser && !(__IS_CAPACITOR__ && isNative())) { ... }

// initInstallPrompt (line 105)
if (!browser || initialized || (__IS_CAPACITOR__ && isNative())) return;
```

**Alternatives weighed:** 1. **Composite guard (winner).** Change line 83 to
`if (browser && !(__IS_CAPACITOR__ &&
   isNative()))` and line 105's condition to
`(__IS_CAPACITOR__ && isNative())`. Web build: `__IS_CAPACITOR__` is `false`, the guard is
statically true, and the `isNative()` call is dropped — the web-vs-native decision becomes
build-time, per the CLAUDE.md rule. Vitest: the guard reduces to `!isNative()`, so all 15 tests keep
steering through their existing `isNative()` mock (`install.svelte.test.ts:8-11`) — zero test churn,
which is what killed the last attempt. Native build: reduces to `!isNative()`, runtime-inert exactly
as today. 2. **Bare `!__IS_CAPACITOR__` guard + test-config surgery.** The original brief's letter;
achieves dead-code elimination of the listener bodies from the native bundle. Rejected: it requires
flipping or per-file-overriding the Vitest define, contradicting the deliberate, documented
convention at `vitest.config.ts:15-18` that every other composite-guarded module now relies on — and
the bundle it slims is the on-device native bundle, where a KB of never-registered listeners costs
nothing (the module itself is retained via `SetupInstructions` anyway). 3. **DROP as
mostly-resolved.** Rejected narrowly: the two remaining guards are still the anti-pattern CLAUDE.md
names (a runtime branch that has a build-time form), the codified idiom makes the fix two lines with
no test impact, and leaving them invites the next reader to copy the bare-`isNative()` shape into
new web-only modules.

**Landing note:** Re-stage in `docs/AUDIT.md` with the corrected brief above (composite idiom,
corrected verification, explicit note that `SetupInstructions` keeps the module in the native bundle
so module-drop is a non-goal). Trivial to implement alongside the C12 folder move or independently.

#### Verification

that *is* attainable: `npm run test:unit` green with no changes to `install.svelte.test.ts`;
`npm run build` then grep the **web** bundle's install chunk — the `isNative` call disappears from
those guards; `CAPACITOR=true npm run build:cap` still succeeds. Note the triple-guard collapse the
original promised is already two-thirds done by `webOnlyServices.ts`; keep `initInstallPrompt`'s own
guard as defense-in-depth (it is an exported entry point and its native no-op is test-asserted).

### [P4][duplication] Reload-side-effect pair (`refreshState = 'idle'; window.location.reload()`) is repeated across three lifecycle paths

**File(s):** `web/src/lib/pwa/updates.ts:164-166,184-186` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location.patch

#### Problem

The "commit the reload" step — reset the update state machine, then `window.location.reload()` — is
written out twice (in `onControllerChange` and in `checkForUpdates`' owed path), and the inverse
"defer instead" transition is a third inline copy. The discipline "always reset state before
reloading" is enforced only by copy-paste; a future path that reloads without resetting would strand
the state machine.

**State at triage (2026-07-27):** The file moved (`web/src/lib/updates.ts` →
`web/src/lib/pwa/updates.ts`) and the state machine was renamed
(`refreshState`/`'idle'`/`'deferred'` → `updateReload`/`'none'`/`'owed'`), but the duplication holds
at HEAD: the reset-and-reload pair sits at `updates.ts:162-163` (`onControllerChange`) and
`updates.ts:193-194` (`checkForUpdates`' owed path); the deferral transition is inline at
`updates.ts:158-160`. The draft patch was cut against the post-rename code — `git apply --check`
passes at HEAD, and its `reloadForUpdate()` covers exactly the two reload sites. Note two *other*
`updateReload = 'none'` writes at lines 173 and 185 are rollback-without-reload paths (postMessage
failure, activation-recovery timeout) and must stay out of the helper.

**Prior attempt / why it was deferred:** The implementer extracted `reloadForUpdate()` for the two
reload sites but never delivered a fix round for the reviewer's one unresolved objection: the
deferral transition (`updateReload = 'owed'`) stayed inline in `onControllerChange`, so the
finding's requested centralization of *both* lifecycle outcomes was incomplete. The reviewer
prescribed the remedy verbatim: extract and call a `deferReload()` helper alongside
`reloadForUpdate()`.

#### Proposed solution

**FIX — clear winner.** Apply the draft patch (it applies cleanly at HEAD) and add the one helper
the reviewer demanded — a `deferReload()` for the `updateReload = 'owed'` transition — so both
lifecycle outcomes are named, not just the reload.

Apply the patch with `git apply`, then satisfy the objection:

```ts
function deferReload() {
  updateReload = 'owed';
}

const onControllerChange = () => {
  clearTimeout(recoveryTimer);
  if (!canvasState.canvasEmpty) {
    deferReload();
    return;
  }
  reloadForUpdate();
};
```

Leave the two rollback resets (lines 173, 185) inline — they reset *without* reloading and belong to
neither helper. Verification: `npm run check` + `npm run test:unit` — the existing reload-count and
defer assertions in `web/src/lib/pwa/updates.test.ts` cover both helpers with no test edits.

**Alternatives weighed:** 1. **Apply the draft + add `deferReload()` (winner).** The reload
extraction is done and passed type-check/unit/lint gates; the residual objection is a three-line
helper. Honest caveat: at HEAD the `'owed'` assignment occurs exactly once, so `deferReload()`
centralizes nothing today — its value is that the state machine's two legal outcomes become named,
greppable moves, which is the invariant the finding is about and the condition the recorded review
made explicit. 2. **Apply the draft as-is and argue the objection down.** Rejected: re-litigating a
recorded objection over three lines costs more than writing them, and an unnamed inline transition
next to a named one reads as an accident. 3. **DROP as P4 noise.** Rejected: the patch exists,
applies cleanly, and already passed the driver's gates — the marginal cost from here is one tiny
helper, and the reload-count assertions in `updates.test.ts` (`toHaveBeenCalledTimes(1)` at lines
197, 216, 340) verify it for free.

**Landing note:** Re-stage in `docs/AUDIT.md` as "apply the draft patch, then extract
`deferReload()` for the inline `'owed'` transition in `onControllerChange`" — cite the reviewer's
objection as the acceptance criterion. Independent of the other C12 findings (different file; no
ordering constraint).

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P1][duplication] Book id is re-typed as a string argument on every `page()` call, silently generating asset paths on mismatch

**File(s):** `web/src/lib/state/books.ts:92-122` (`page()` factory) and `124-237` (`BOOKS`) — pinned
at SHA f934d43

**Rolled-back draft patch:**
`docs/audit-deferred/p1-duplication-book-id-is-re-typed-as-a-string-argument-on-every-page-ca.patch`

#### Problem

`page()` takes the enclosing book's id as a bare string first argument, so each book repeats its id
6× (48 calls total) in `BOOKS`. Nothing ties a page to its book in the type system: pasting a
`page('farm', …)` line into the `dinosaur` block compiles cleanly and silently emits
`/coloring/farm/...` asset paths under the Dinosaurs book. Proposed a builder that binds the book id
once so `Book.id` becomes the single source.

**State at triage (2026-07-27):** The finding still fully holds at HEAD, but the file has been
refactored underneath the patch:

* `books.ts` now builds paths through extracted helpers —
  `pageAssetPath(bookId, pageId,
  orientation, variant)`, `optionalPageAssetPaths(…)`,
  `coverPath(bookId)` — and `Book.platforms` is now required. `page()` still takes `book: string` as
  its first positional arg (`books.ts:135-155`), and all 48 call sites still repeat the enclosing
  book's id (`books.ts:157-270`). The mismatch failure mode is unchanged.
* `books.test.ts` has no path-membership invariant; the draft's table-driven
  `startsWith('/coloring/${book.id}/')` test is still novel and worth keeping.
* `pipeline.md:335-337` and `night-fills.md:240` are unchanged — still stale-in-waiting. Notably,
  `night-fills.md:22` is *already wrong today*: it shows
  `page('nature', 'ant', 'Ant', ['portrait', 'landscape'], ['portrait', 'landscape'])` — positional
  array arguments that predate even the current `{ nightExcept, chalkExcept }` options object.
* Because of the helper refactor, `git apply` of the draft patch will conflict in `books.ts` (its
  context is the old inline-template-literal factory). `night-fills.md` also changed since the pin
  (script paths moved to `legacy/`), though the draft's specific hunk region survives.

**Prior attempt / why it was deferred:** Failed adversarial review. All three unresolved objections
are doc-drift, not code:

1. `tools/asset-gen/docs/pipeline.md:334-337` still teaches the obsolete three-argument
   `page('nature', 'ant', 'Ant', …)` wiring step.
2. `tools/asset-gen/legacy/night-fills.md` (the live catalog-wiring guidance, ~line 240) still shows
   `page('farm', 'cat', 'Cat')`.
3. `tools/asset-gen/legacy/night-fills.md:22` still presents a three-argument form as current
   ship/wire guidance.

The draft's commits 2-3 fixed objections 1 and 2 (both hunks are in the patch); objection 3 — the
blockquote example at line 22 — was never addressed and is what kept the review red.

#### Proposed solution

**FIX — clear winner.** The draft's `book()` builder — the book id typed once, the inner `page()`
closing over it — was accepted by the reviewer on its merits; every unresolved objection is a stale
documentation site still showing the old `page(book, id, name)` signature. Re-implement the builder
on top of HEAD's refactored `books.ts` (the patch no longer applies cleanly) and sweep *all* stale
doc sites this time, including the one the draft missed
(`tools/asset-gen/legacy/night-fills.md:22`).

Re-implement (don't `git apply`) the draft's shape on HEAD's helper structure:

```ts
function book(
  id: string,
  name: string,
  platforms: BookPlatform[],
  buildPages: (
    page: (id: string, name: string, exceptions?: PageExceptions) => ColoringPage,
  ) => ColoringPage[],
): Book {
  function page(
    pageId: string,
    pageName: string,
    { nightExcept = [], chalkExcept = [] }: PageExceptions = {},
  ) {
    return {
      id: pageId,
      name: pageName,
      images: {
        portrait: pageAssetPath(id, pageId, 'portrait', 'outline'),
        landscape: pageAssetPath(id, pageId, 'landscape', 'outline'),
      },
      colorImages: {/* …same, variant 'light' */},
      nightImages: optionalPageAssetPaths(id, pageId, nightExcept, 'night'),
      chalkImages: optionalPageAssetPaths(id, pageId, chalkExcept, 'chalk'),
    };
  }
  return { id, name, platforms, cover: coverPath(id), pages: buildPages(page) };
}
```

`BOOKS` becomes `book('farm', 'Farm', ['web', 'mobile'], (page) => [page('cat', 'Cat'), …])` — the
draft's catalog hunks carry over almost verbatim. Keep the draft's `books.test.ts` path-membership
test and extend it to assert `book.cover` too.

To survive the recorded objections, the doc sweep must cover **all three** sites — the draft fixed
two of three:

* `tools/asset-gen/docs/pipeline.md:335-337` → book-bound `page('ant', 'Ant')` +
  `page('ant', 'Ant', { nightExcept: ['portrait'] })` (the draft's hunk, still correct).
* `tools/asset-gen/legacy/night-fills.md:240` → `page('cat', 'Cat')` (the draft's hunk, still
  correct — re-anchor it past the `legacy/` path edits).
* `tools/asset-gen/legacy/night-fills.md:22` → the missed one. Rewrite the blockquote's wiring
  example to the book-bound options-object form, e.g.
  `page('ant', 'Ant', { nightExcept: [...], chalkExcept: [...] })` — mechanically, sweep
  `grep -rn "page('" tools/` until every hit shows the two-arg (+ optional exceptions) form.

**Alternatives weighed:** 1. **Builder closing over the book id (winner — the draft's approach,
rebased).** Single source for the id, cross-book mismatch becomes unrepresentable, and it now
composes *better* with HEAD: the inner `page()` just forwards the captured `bookId` to
`pageAssetPath`, and `cover` falls out of `coverPath(bookId)`. 2. **Keep the shape, add a
runtime/test assertion only.** The draft's invariant test would catch a mismatch in CI, but the id
stays typed 48×, and the test catches the slip after the fact instead of making it impossible.
Strictly weaker; keep the test *and* the builder. 3. **Per-book string-literal union types.**
Type-level enforcement without restructuring, but it duplicates every id into a type and still lets
`page('farm', …)` appear under `dinosaur` unless each book gets its own branded call — more
machinery than option 1 for less safety.

**Landing note:** Re-stage in docs/AUDIT.md with amended instructions: "re-implement the patch's
design on the current helper-based `books.ts` (the patch conflicts at HEAD); fix all three doc
sites, including `night-fills.md:22`; verify with `grep -rn \"page('\" tools/`". A single small PR.

#### Verification

`npm run check`, `npm run test:unit -- books`, the grep above coming back clean, and a spot-check
that `scripts/strip-native-assets.mjs` (which imports `BOOKS`) still runs — the exported shape is
unchanged, so no behavioral diff is expected.

### [P4][design-tokens] Hardcoded brand RGB `171,113,225` fallback will silently drift from `--brand`

**File(s):** `web/src/lib/components/ColoringBook.svelte:296-298` — pinned at SHA f934d43

**Rolled-back draft patch:**
`docs/audit-deferred/p4-design-tokens-hardcoded-brand-rgb-171-113-225-fallback-will-silently.patch`

#### Problem

The tile-hover shadow carries the documented pre-`color-mix` fallback pattern —
`box-shadow: … rgba(171, 113, 225, 0.25)` before
`box-shadow: … color-mix(in srgb, var(--brand) 25%,
transparent)` — but the fallback bakes
`--brand`'s literal RGB into the component. Retune the brand token and below-floor browsers keep the
old color, with nothing linking the two. Proposed centralizing a `--brand-shadow`/`--brand-rgb`
token, or dropping the fallback if the compat floor no longer needs it; also flagged the raw
`4px`/`12px` offsets.

**State at triage (2026-07-27):** Unchanged at HEAD except line drift: the pair now sits at
`ColoringBook.svelte:294-295`. The literal appears at **seven** sites, every one an
rgba-before-`color-mix` fallback pair: `app.css:327` (`.flyout-option.active` selection ring),
`AdminConsole.svelte:499` and `AiImagePrompt.svelte:188` (focus rings),
`ActionsPanel.svelte:629,683`, `AiImageResult.svelte:359`, and the ColoringBook tile hover. The
compat floor (`docs/COMPATIBILITY.md`) is Chrome 111 / Safari 16.4, so `color-mix` (111 / 16.2) is
within floor and the fallbacks are below-floor graceful degradation only — but the register
documents that degradation as a maintained invariant, and `tokens.ts:23-28` restates it. The finding
is real and untouched; its scope is actually 7×, not 1×.

**Prior attempt / why it was deferred:** Implementer failed to deliver a fix round. The draft simply
deleted the rgba line at the one ColoringBook site. Unresolved objections:

1. `ColoringBook.svelte:293` still hardcodes the `4px` offset and `12px` blur the finding said to
   tokenize against the elevation/spacing scale.
2. The removal falsifies two documented invariants: `docs/COMPATIBILITY.md` (the `color-mix` row:
   "plain-rgba declaration precedes each") and the brand comment in `web/src/lib/design/tokens.ts`
   ("each preceded by a plain-rgba fallback declaration for pre-color-mix engines").

#### Proposed solution

**FIX — clear winner.** Mint a `--brand-rgb` triple in `tokens.ts`, *derived programmatically from
the brand hex* so it cannot drift, and rewrite every rgba fallback site as
`rgba(var(--brand-rgb), α)` — the fallback survives (custom-property support long predates
`color-mix`), the drift is killed at all seven sites at once, and both documentation claims the
draft falsified stay true. The draft's direction (delete the fallback) was wrong, not just
incomplete: several of the seven sites are selected-state/focus rings whose below-floor rendering
would vanish entirely.

In `tokens.ts`, beside `brand`:

```ts
const brandHex = '#ab71e1';
const hexToRgbTriple = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

export const brand = {
  brand: brandHex,
  // Pre-color-mix fallback channel triple — derived from brandHex above so the
  // rgba fallbacks (see docs/COMPATIBILITY.md) can never drift from --brand.
  brandRgb: hexToRgbTriple(brandHex), // -> '171, 113, 225', emitted as --brand-rgb
  …
};
```

Run `npm run gen:tokens`, then at all seven sites:

```css
box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.25);
box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
```

What a resurrected attempt must do differently, per objection:

* **Objection 2 (docs falsified): dissolved by not removing the fallback.** Touch both texts anyway
  so they describe the new form: COMPATIBILITY.md's `color-mix` row → "a plain-rgba declaration
  (`rgba(var(--brand-rgb), …)` at the brand sites) precedes each"; the `tokens.ts` brand comment →
  note the fallbacks now derive from `--brand-rgb`. Register `--brand-rgb` in the design skill's
  Brand token row (edit `.ruler/skills/design/SKILL.md`, `npm run ruler:apply`).
* **Objection 1 (raw 4px/12px offsets): overrule it, on the record.** The elevation scale's tokens
  are *complete shadow literals* that embed their own geometry (`--shadow-sm` = `0 2px 6px …`,
  `--shadow-pop`, `--shadow-segment`); no offset ramp exists, minting one for a single hover shadow
  fails the skill's "a token must earn its place" rule, and option 2 above shows why the whole
  shadow can't be tokenized without killing the fallback. `0 4px 12px` is per-site shadow geometry
  exactly like every other brand-shadow site (ActionsPanel uses the same trio) — out of scope for
  this finding. Put a sentence to that effect in the PR so the next adversarial review meets the
  rebuttal instead of rediscovering the objection.

**Alternatives weighed:** 1. **`--brand-rgb` triple, derived in `tokens.ts` (winner).** One token,
seven mechanical rewrites, drift becomes impossible (the triple is computed from `brand.brand` at
generation time, not hand-copied), below-floor behavior is preserved *and improved* (the fallback
now tracks a brand retune), and the two documentation invariants stay true with a one-line wording
touch each. 2. **Whole-shadow tokens (`--shadow-brand-hover` with the color-mix baked in).** Looks
cleaner but **cannot work**: the two-declaration fallback breaks through `var()` indirection. On a
pre-`color-mix` engine, a literal `box-shadow: … color-mix(…)` fails at *parse* time and the earlier
rgba declaration wins; but `box-shadow: var(--shadow-brand-hover)` only fails at *computed-value*
time, which resets the property to its initial value instead of falling back to the earlier
declaration. The fallback line would become dead code on every engine. 3. **Delete the fallbacks
(the draft, done completely — all 7 sites + doc rewrites).** Defensible under "anything older is not
supported", but below the floor the flyout selection ring, two focus rings, and the hover shadows
disappear outright instead of rendering in a stale tint — a strictly worse degradation for two lines
of CSS per site — and it requires rewriting the COMPATIBILITY.md row and tokens.ts comment for
negative value. Rejected.

**Landing note:** Discard the draft patch (a one-line deletion in the wrong direction) and re-stage
in docs/AUDIT.md with the `--brand-rgb` approach and the seven-site list above. Small mechanical PR;
pairs naturally with the C14 sibling ([issue \#565](https://github.com/KyleMit/Splotch/issues/565))
since both touch the same stylesheet.

#### Verification

`npm run gen:tokens:check`; `grep -rn "171, 113, 225" web/src` returns nothing; `run-splotch` visual
check of the tile hover and flyout active ring in both themes (identical — modern engines take the
`color-mix` line, so nothing above the floor changes at all).

### [P2][architecture] Scatter of platform/device utilities across `lib/` root hurts grepability — group under one folder

**File(s):** `web/src/lib/platform.ts`, `deviceInfo.ts`, `deviceReport.ts`, `orientation.ts`,
`safeArea.ts`, `haptics.ts`, `notchBand.ts` (whole files) — pinned at SHA f934d43

#### Problem

Seven closely related "what device/platform am I on and how do I adapt" modules sit loose in the
`lib/` root among unrelated utilities. They form a natural import cluster (`deviceInfo`,
`orientation`, `haptics`, `notchBand` all lean on `platform.ts`; `safeArea` feeds
`notchBand`/layout), but answering "where does the app detect iOS / read insets / lock rotation?"
requires already knowing each filename. Proposal: group them under `lib/platform/` (or `device/`)
with an index re-export; pure move, no behavior change.

**State at triage (2026-07-27):** The finding fully holds at HEAD: all seven files still sit loose
in `web/src/lib/` (confirmed by listing), alongside topic folders that already exist for other
clusters (`pwa/`, `plugins/`, `boot/`, `audio/`, `ai/`, `design/`, …) — `updates.ts` itself moved
into `lib/pwa/` since the pin, so the repo is actively converging on this layout. Import churn
measured at HEAD: `$lib/platform` has 21 importers; the six siblings total ~15 (`deviceInfo` 1,
`deviceReport` 4, `orientation` 2, `safeArea` 3, `haptics` 3, `notchBand` 2). The `architecture`
skill's file map lists only `platform.ts` and `orientation.ts` — the other five are entirely absent,
which strengthens the grepability claim (the map won't help you find them either).

**Prior attempt / why it was deferred:** Implementation *succeeded* functionally — cluster moved,
consumers and tests rewired, the `.ruler/` architecture source updated — but the sandbox could not
write `.agents/skills/` when running `npm run ruler:apply`, so the generated Codex mirror of the
architecture skill stayed stale and the change was rolled back rather than land with drifted
generated output (which `npm run ruler:check` gates in CI). An environmental blocker, not a design
objection.

#### Proposed solution

**FIX — clear winner.** Move the cluster to `web/src/lib/platform/` with `index.ts` carrying the
current `platform.ts` exports (so the `$lib/platform` specifier and its 21 importers don't change),
siblings imported by full path, and — the part the failed attempt could not finish — regenerate the
ruler output so the Codex architecture mirror isn't left stale. The design already survived
implementation; only the environment killed it.

Redo the validated move in an environment where `npm run ruler:apply` can write both generated trees
(a normal checkout can). Concretely: `git mv` the seven modules (+ their colocated `*.test.ts`
files: `platform.test.ts`, `platform.osLabel.test.ts`, `deviceReport.test.ts`, `safeArea.test.ts`,
`notchBand.test.ts`) into `web/src/lib/platform/`, rename `platform.ts` → `platform/index.ts`,
update the ~15 sibling-import sites, update the `.ruler/` sources (the architecture skill's file map
— adding the five currently-missing modules while there — and the `web/src/.ruler/AGENTS.md` line
that names `lib/platform.ts`), run `npm run ruler:apply`, and commit the regenerated output.
Verification: `npm run check`, `npm test`, and `npm run
ruler:check` green — the last one is
precisely the gate the failed attempt could not satisfy.

Sequencing within C12: land the Orientation-type patch (see the sibling entry
"`Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places") **before** this move — that
draft patches `web/src/lib/platform.ts` by path and stops applying once the file is renamed. This
move then carries the canonical `Orientation` export along into `platform/index.ts` with no further
edits, and the `$lib/platform` import specifier in all its consumers survives unchanged.

**Alternatives weighed:** 1. **`lib/platform/` with a detection-only `index.ts` (winner).**
`platform.ts` becomes `platform/index.ts` verbatim; `$lib/platform` keeps resolving for all 21
importers with zero edits. Siblings move to `platform/deviceInfo.ts` etc. and their ~15 import sites
update to `$lib/platform/<name>`. Colocated tests move along. Deliberately *not* an
everything-barrel: re-exporting `orientation.ts` from the index would route `state/settings` →
`storage` → `$lib/platform` → `orientation` → `state/settings` into an import cycle
(`orientation.ts` imports `$lib/state/settings.svelte`). Detection-only index avoids that class of
cycle entirely. 2. **Same move, folder named `device/`.** Rejected: `$lib/platform` is the
established specifier (21 importers, ADR-0013, the CLAUDE.md src map, and the `Platform` type all
say "platform"); `device/` would force edits at every one of those sites for a name that is no more
accurate. 3. **Status quo + complete the `architecture` skill file map instead.** Cheaper, and the
map *should* list all seven files regardless — but rejected as the resolution: it fixes the skill,
not the grep (`ls web/src/lib` and editor fuzzy-find still interleave the cluster with
`idle.ts`/`storage.ts`/`imagePrefetch.ts`), and the finding's brief explicitly accepts the one-time
churn.

Membership judgment calls, decided: include `deviceReport.ts` — it is the client/server-shared shape
of device info (imported by `/api/report`), and server code importing `$lib/platform/deviceReport`
is fine since the module is deliberately dependency-free; keeping it beside `deviceInfo.ts` (which
imports its type) beats stranding it. Include `haptics.ts` — it is "adapt output to the platform"
and imports `platform.ts`.

**Landing note:** Re-stage in `docs/AUDIT.md` as the move described above, with an explicit
acceptance criterion of `npm run ruler:check` passing (the recorded failure mode), and ordered after
the Orientation-type patch lands.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P2][duplication] `Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places

**File(s):** `web/src/lib/notchBand.ts:38`, `web/src/lib/state/layout.svelte.ts:4`,
`web/src/lib/orientation.ts:5`, `web/src/lib/state/books.ts:49`, `state/canvas.svelte.ts:18`,
`drawing/engine.ts:258`, `components/ParentCenter.svelte:60`, `tests/global.d.ts:48` — pinned at SHA
f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p2-duplication-orientation-portrait-landscape-is-redeclared-in-8-places.patch

#### Problem

The literal union `'portrait' | 'landscape'` is declared independently eight times — as
`Orientation` twice (`notchBand.ts`, `layout.svelte.ts`), as `OrientationLockType`
(`orientation.ts`), as `BookOrientation` (`books.ts`), and inlined anonymously in four more spots.
Any widening (e.g. `'square'`) touches every copy and there is no single grep target. Proposal: one
canonical `export type Orientation` in `platform.ts`, imported everywhere; keep
semantically-distinct aliases as `type X = Orientation` where the name adds meaning.

**State at triage (2026-07-27):** All eight duplication sites hold at HEAD (verified by grep):
`notchBand.ts:38`, `layout.svelte.ts:4`, `orientation.ts:5`, `books.ts:50`, `canvas.svelte.ts:26`,
`engine.ts:262`, `tests/global.d.ts:49`, and — the one drift — the `ParentCenter.svelte` copy now
lives in the extracted `components/parent/CompactShell.svelte:29` (`LockedOrientation`). The draft
was cut after that extraction: it targets `CompactShell.svelte`, and `git apply --check` passes at
HEAD. It adds `export type Orientation` to `platform.ts:52` beside `Platform`, converts all eight
consumers to type-only imports, keeps the meaningful aliases (`BookOrientation`,
`OrientationLockType`, `LockedOrientation`) as `= Orientation`, and preserves `notchBand.ts`'s
type-only-import purity (no runtime `platform.ts` import reaches the pure layer).

**Prior attempt / why it was deferred:** The implementer delivered the full consolidation but no fix
round for the one unresolved objection, which is cross-patch, not in-patch: the separately deferred
draft
`docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`
(a) adds `import { layout, type Orientation } from '$lib/state/layout.svelte'` in
`ClearButton.svelte` — an export this patch deletes — and (b) still carries
`type OrientationLockType = 'portrait' | 'landscape'` in its rewritten `orientation.ts` hunks. The
reviewer required that reapplicable draft be updated to use the canonical type from `platform.ts`.

#### Proposed solution

**FIX — clear winner.** Apply the draft patch as-is — it applies cleanly at HEAD and is complete for
this finding. The reviewer's sole objection was about collateral damage to a *different* deferred
draft; satisfying it means rebasing that sibling patch, not changing this one.

Apply the patch with `git apply` — no edits. Record the objection's remedy against the
*effect-bodies* deferred finding, where the work actually lands: rebase that patch so it reads

```ts
// ClearButton.svelte
import type { Orientation } from '$lib/platform';
import { layout } from '$lib/state/layout.svelte';

// orientation.ts (its rewritten header)
import type { Orientation } from '$lib/platform';
type OrientationLockType = Orientation;
```

Sequencing within C12: land this **before** the platform-folder move (the sibling entry "Scatter of
platform/device utilities across `lib/` root") — the draft patches `web/src/lib/platform.ts` by path
and stops applying once that file becomes `platform/index.ts`. The move then carries the canonical
type along, and every `from '$lib/platform'` import this patch adds survives the move unchanged, so
the two land coherently in this order with no rework.

**Alternatives weighed:** 1. **Apply the draft, then rebase the effect-bodies sibling draft
(winner).** This patch passed type-check, unit-test, and lint gates and needs zero content changes.
The objection is mechanical: in the effect-bodies patch, change `ClearButton.svelte`'s type import
source from `$lib/state/layout.svelte` to `$lib/platform`, and keep
`type OrientationLockType =
   Orientation` (importing it) in its `orientation.ts` hunks — its
current hunks also carry the old literal as context, so they conflict outright once this lands; a
3-way rebase of that patch is needed regardless. 2. **Re-export `Orientation` from
`layout.svelte.ts` as a compatibility shim** so the sibling draft applies untouched. Rejected: it
preserves the second grep target the finding exists to remove, and the sibling draft still conflicts
on its `orientation.ts` context lines anyway — the shim buys nothing. 3. **DROP.** Rejected: all
eight copies are live at HEAD, the fix is done and green, and the canonical home (`platform.ts`) is
exactly where the C12 folder finding wants the platform vocabulary to live.

**Landing note:** Re-stage in `docs/AUDIT.md` as "apply the draft patch as-is, before the
platform-folder move; then rebase the effect-bodies draft per the recorded objection (import
`Orientation` from `$lib/platform`, drop its literal redeclarations)".

#### Verification

per the original brief: `git grep "'portrait' | 'landscape'"` returns only `platform.ts`'s single
definition, and `npm run check` passes (the patch already met this at the driver's gates).

### [P1][duplication] Extract the six near-identical Gemini `generateContent` wrappers into `lib/gemini.mjs`

**File(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs:75-97`,
`gen-coloring-fills-dark.mjs:119-141`, `gen-coloring-chalk.mjs:253-278`,
`normalize-outline-strokes.mjs:111-136`, `gen-coloring-outlines-fresh.mjs:84-97`,
`gen-style-covers.mjs:29-52` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p1-duplication-extract-the-six-near-identical-gemini-generatecontent-wra.patch

#### Problem

All six generators hand-roll the same `ai.models.generateContent` call: base64 the input image into
`inlineData`, append the prompt part, set `abortSignal: AbortSignal.timeout(120_000)` and optional
`temperature`, then `classifyGeminiResponse` and throw on a non-image kind. They differ only in
prompt, webp quality, and (fresh) text-only contents plus `imageConfig.aspectRatio`. Proposed a
`lib/gemini.mjs` exporting `IMAGE_MODEL`, the timeout, `makeClient()` (env-key-checked), and
`generateImage(ai, { imageBytes, mimeType, prompt, temperature, aspectRatio })`.

**State at triage (2026-07-27):** Partially resolved at HEAD, in a way that moots both objections:

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

**Prior attempt / why it was deferred:** Implementer failed to deliver a fix round. The reviewer's
two unresolved objections both targeted the client-factory half: the first draft commit omitted
`makeClient()` entirely, and the second shipped `makeClient(apiKey)` as an unchecked constructor
pass-through instead of the required factory that reads `GEMINI_API_KEY`, rejects a missing key, and
preserves the null-client dry-run/rescore paths.

#### Proposed solution

**FIX — clear winner.** Both reviewer objections were about `makeClient()`, and a `makeClient()`
that does exactly what the reviewer demanded has since landed at HEAD by other means. What remains
is the original core of the finding — the duplicated transport — and the draft's `generateImage`
half is the right shape for it; it just has to be rebased onto today's `lib/gemini.mjs` instead of
recreating it.

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

**Alternatives weighed:** Only one real shape: the draft's `generateImage` (image-or-text-only
parts, timeout, optional temperature/`imageConfig`, classify-and-throw, returns
`{ bytes, mimeType }`) already matches all six call sites and came with a mocked contract test. The
alternative — leave transport duplicated now that `makeClient` landed — forfeits the single largest
duplicated block in the directory for no saving, since the port is mechanical.

**Landing note:** Re-stage in docs/AUDIT.md with the note "makeClient already landed — extract
`generateImage` only, rebase the draft's bin hunks, keep HEAD's `makeClient({ optional })`
untouched".

#### Verification

per the finding: `AbortSignal.timeout` count in `bin/` drops 6 → 0, `classifyGeminiResponse`
disappears from `bin/` imports, `npm run test:asset-gen` green. Request payloads are byte-identical,
so no golden/asset impact. Note this also centralizes the model id and timeout, which subsumes the
substantive half of the sibling constants finding
([issue \#566](https://github.com/KyleMit/Splotch/issues/566)).

### [P2][duplication] Background flood-fill is written twice in lib (and a third time in bin)

**File(s):** `tools/asset-gen/lib/night-scores.mjs:57-83` (`scoreNightness`),
`tools/asset-gen/lib/invented-shapes.mjs:55-82` (`detectInventedShapes`),
`tools/asset-gen/bin/gen-coloring-chalk.mjs:113` (`openBackground`) — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p2-duplication-background-flood-fill-is-written-twice-in-lib-and-a-third.patch

#### Problem

`scoreNightness` and `detectInventedShapes` flood the open background from the image border through
source-light pixels with the same `push(x,y)` closure, four border-seeding loops, and pop-and-spread
stack loop; `invented-shapes` even documents the copy ("the same machinery as scoreNightness").
`gen-coloring-chalk.mjs` reimplements it a third time. Two separate `170` light-threshold constants
(`NIGHT_SRC_LIGHT`, `SRC_LIGHT`). Proposed `floodBackground(gray, w, h,
lightThreshold)` in a shared
module plus one `BG_LIGHT_THRESHOLD`.

**State at triage (2026-07-27):** Still three copies, slightly reshuffled:

* `lib/night-scores.mjs:65-91` — inline in `scoreNightness`, gated on `s.data[i] > NIGHT_SRC_LIGHT`
  (170).
* `lib/invented-shapes.mjs:41-70` — since the pin this copy was hoisted into a module-private
  `floodBackground(source, w, h, lightThreshold)` (called with exported `SRC_LIGHT` = 170). Better
  factored, but still a duplicate of the night-scores loop.
* `bin/gen-coloring-chalk.mjs:124-153` — `openBackground(penMask)` floods through `!penMask[i]` on a
  0/1 ink mask at `OUTLINE_MASK_SIZE`. Same algorithm, different open-pixel predicate — this is why
  the grayscale-signature helper couldn't absorb it.

The draft patch no longer applies (both lib files drifted), but its `lib/regions.mjs` content is
still the right starting point.

**Prior attempt / why it was deferred:** Implementer failed to deliver a fix round. Unresolved
objection: `gen-coloring-chalk.mjs` (now `openBackground` at 124-153) still contained the third
copy; the reviewer required refactoring it onto the shared implementation "while preserving its
binary-mask semantics".

#### Proposed solution

**FIX — clear winner.** The finding still holds (three border flood-fills at HEAD), and the one
unresolved objection — the chalk copy was left behind — has a mechanical cause with a clean cure:
the draft's helper took a grayscale buffer + threshold, but chalk floods a binary pen mask. A
predicate-based core covers all three call sites without bending any semantics.

Re-cut the draft on HEAD with a predicate core:

```js
// lib/regions.mjs
export const BG_LIGHT_THRESHOLD = 170;

export function floodFromBorder(w, h, isOpen) {
  const region = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {/* bounds check; if (!region[i] && isOpen(i)) mark + push */};
  // seed four borders, then pop-and-spread 4-connected — verbatim from the draft
  return region;
}

export const floodBackground = (gray, w, h, lightThreshold = BG_LIGHT_THRESHOLD) =>
  floodFromBorder(w, h, (i) => gray[i] > lightThreshold);
```

Exactly what must change vs the rejected draft:

* **Migrate the chalk copy** — `openBackground(penMask)` becomes
  `floodFromBorder(OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, (i) => !penMask[i])`. Binary-mask semantics
  are preserved because the predicate is the caller's own.
* Rebase the two lib hunks: `night-scores.mjs` drops its inline loop + `NIGHT_SRC_LIGHT`;
  `invented-shapes.mjs` deletes its now-private `floodBackground` and keeps `SRC_LIGHT` exported as
  a re-export/alias of `BG_LIGHT_THRESHOLD` (it is part of the module's documented constants).

The per-pixel closure call is irrelevant at 384/512 px working widths in a manual tool.
Verification: `tests/night-scores.test.mjs` and `tests/invented-shapes.test.mjs` pass with unchanged
`bgFrac`/`bgLuma`; chalk's gates are exercised via
`npm run gen:coloring-chalk -- --dry-run
--rescore`-style offline runs plus
`npm run gen:coloring-golden:diff` staying clean.

**Alternatives weighed:** 1. **Predicate-core `lib/regions.mjs`** (winner): a generic border flood
over "open" pixels, with the grayscale form as a thin wrapper. Covers all three sites exactly,
including chalk's binary-mask semantics, answering the objection head-on. 2. **The draft as-is
(grayscale-only helper), chalk left alone.** Already rejected by review, and rightly: the chalk copy
is the one in `bin/`, the least discoverable of the three. 3. **Fold into `lib/morphology.mjs`.**
Avoids a new module, but that file is documented as mask morphology/distance transforms; a region
flood is a different family and `regions.mjs` leaves room for future region ops. Cosmetic either way
— do not block on the file name.

**Landing note:** Re-stage in docs/AUDIT.md with the predicate-core design above ("apply the patch's
regions.mjs, generalize to `floodFromBorder(w, h, isOpen)`, migrate all three call sites including
chalk").

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P3][complexity] `scoreCompositeEyes` is a 100-line function with an inline pupil-shape validator

**File(s):** `tools/asset-gen/lib/composite-eye.mjs:158-259` — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p3-complexity-scorecompositeeyes-is-a-100-line-function-with-an-inline-p.patch

#### Problem

Inside `scoreCompositeEyes`'s per-eye loop, three rejection stages are inlined: bounding-box fill +
aspect ratio, a Set-based erosion survival test, and centroid + disc-stats measurement. The
pupil-shape decision spans ~50 lines mixed with measurement, and the erosion is a fourth ad-hoc
morphology implementation. Proposed extracting `isPupilDisc(blob, w, h)` (reusing `erodeMask`) and
`blobCentroid(blob, w)` so the loop reads grow → validate → measure → push.

**State at triage (2026-07-27):** Unchanged at HEAD: `scoreCompositeEyes` is
`lib/composite-eye.mjs:174-275` with the bbox/aspect check (207-222), Set-based erosion (224-248),
and centroid reduce (251-252) all inline. `git apply --check` passes — this is the only C15 patch
that still applies verbatim.

The technical crux the review deadlocked on: `erodeMask` (`lib/morphology.mjs:46`) is a **separable
box erosion** — radius r erodes by a (2r+1)×(2r+1) *square*. The inline loop is `PUPIL_ERODE_PX`
iterations of a **4-neighbor cross** erosion (a diamond). A 5×5-square erosion removes strictly more
pixels than two cross iterations, so `erodeMask(mask, w, h, PUPIL_ERODE_PX)` erodes harder and can
flip the `eroded.size >= max(12, blob.length * 0.3)` survival test on borderline blobs — with only
the five committed fixtures as coverage of the detection path. The reviewer's instruction, taken
literally, cannot preserve the calibrated verdicts by construction; that is why the fix round
failed, not implementer sloppiness.

**Prior attempt / why it was deferred:** Implementer failed to deliver a fix round. The extraction
shipped, but `isPupilDisc` kept the exact Set-based erosion loop; the reviewer's unresolved
objection demanded building a blob mask and reusing `erodeMask` from `morphology.mjs` "while
preserving the calibrated fixture verdicts". The implementer's note says the Set loop was kept
deliberately, "preserving the exact cross-kernel erosion" — the two demands are in tension, and no
round resolved it.

#### Proposed solution

**FIX — clear winner.** The draft's extraction is correct and the patch still applies cleanly at
HEAD. The reviewer's objection — "reuse `erodeMask` from `morphology.mjs`" — is, as literally
stated, unsatisfiable without changing behavior, because `erodeMask` uses a different structuring
element than the inline loop. The fix is to add a cross-kernel erode to `morphology.mjs` and route
the extracted helper through that: shared morphology home, exact same pixels.

Apply the draft patch, then replace `isPupilDisc`'s Set loop with shared morphology:

* Add to `lib/morphology.mjs` a one-step 4-neighbor erode, e.g.
  `export function erodeCross(mask, w, h)` — pixel survives iff itself and all four neighbors are
  set, with out-of-bounds treated as unset. That matches the Set version exactly (its
  `x > 0 && x < w - 1 && …` guards mean border pixels never survive, same as out-of-bounds = 0). A
  short comment should state why `erodeMask` (box kernel) is deliberately not used here.
* In `isPupilDisc`, build a dense `Uint8Array` mask over the blob's bounding box (already computed
  for the fill/aspect checks), run `erodeCross` `PUPIL_ERODE_PX` times, and count survivors in place
  of `eroded.size`.
* Verification: `tests/composite-eye.test.mjs` passes with identical verdicts and identical
  `coreDarkFrac` values; assert (in the PR notes) that per-fixture `pupils.length` is unchanged,
  since the erosion gates detection, not just measurement.

**Alternatives weighed:** 1. **Apply the patch + add a cross-kernel erode to `morphology.mjs`**
(winner). Exact behavior, and the "fourth ad-hoc morphology implementation" the finding named is
genuinely removed. 2. **Apply the patch as-is and document why the Set loop is not `erodeMask`.**
Cheapest; overrules the reviewer with a true reason (kernel mismatch). Acceptable fallback, but
leaves the ad-hoc erosion the finding explicitly called out. 3. **Switch to `erodeMask` and
re-calibrate.** Changes detection behavior for a pure-readability finding; re-pinning thresholds off
five fixtures for zero functional gain is the wrong trade.

**Landing note:** Apply the patch
(`git apply docs/audit-deferred/p3-complexity-scorecompositeeyes-is-a-100-line-function-with-an-inline-p.patch`),
then make the `erodeCross` change above in the same commit.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).

### [P3][architecture] `fail()` (console.error + process.exit) lives in `paths.mjs`, unrelated to path resolution

**File(s):** `tools/asset-gen/lib/paths.mjs:29-32` (now 40-43) — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p3-architecture-fail-console-error-process-exit-lives-in-paths-mjs-unrel.patch

#### Problem

`paths.mjs` is documented as path/tree resolution but exports the process-terminating `fail()`,
which bin scripts import *from paths*, coupling an exit side-effect to the pure constants module.
Proposed moving `fail` to `lib/cli.mjs` (or `log.mjs`) and updating the imports.

**State at triage (2026-07-27):** Unresolved and slightly worse than at the pin. `fail` is still in
`lib/paths.mjs:40-43`, imported by 16 `bin/` scripts, `legacy/retouch-line-art.mjs:37`, **and now
also** `lib/cli.mjs:2` and `lib/gemini.mjs:2` (both created since f934d43, both of which had to
reach into paths for it). `lib/cli.mjs` exists as the shared CLI-helper module (arg parsers,
`MAX_ATTEMPTS`), so the finding's proposed destination is no longer hypothetical — `fail` is the one
CLI concern still living in the wrong file.

The patch was staged against a near-HEAD tree; `git apply --check` fails only on
`bin/audit-golden.mjs` and `bin/audit-invented-shapes.mjs` (import-list formatting drifted since).
Everything else — all bins, legacy, `cli.mjs` gaining the definition, `gemini.mjs` re-pointing —
applies.

**Prior attempt / why it was deferred:** Failed adversarial review. Two objections were recorded:
(1) `legacy/retouch-line-art.mjs` still imported `fail` from `paths.mjs` and would crash at module
load — the draft's third commit fixed exactly this, so it is resolved *within the patch*; (2) still
unresolved: `tests/light-fill-cli.test.mjs` and `tests/audit-cli.test.mjs` mock `paths.mjs` with a
throwing `fail` stub — after callers move to `cli.mjs`, that stub is dead and the failure-path tests
would invoke the real `process.exit(1)`.

#### Proposed solution

**FIX — clear winner.** The finding has only gotten more true since it was filed (two lib modules
now also import `fail` from paths), the natural destination `lib/cli.mjs` now exists, the draft
already handles the reviewer's first objection (the legacy tool), and the second objection (dead
test stubs) is a small, well-understood two-file test change.

Apply the draft patch (hand-merging the two drifted audit-bin import lists), then make the one
change the review still demands — fix the test mocks:

* In `tests/light-fill-cli.test.mjs` and `tests/audit-cli.test.mjs`, delete `fail` from the
  `vi.mock('../lib/paths.mjs', …)` factories and add:

  ```js
  vi.mock('../lib/cli.mjs', async (importOriginal) => ({
    ...(await importOriginal()),
    fail(message) {
      throw new Error(message);
    },
  }));
  ```

  The `importOriginal` spread matters: `light-fill-cli.test.mjs:6` imports `MAX_ATTEMPTS` (and the
  bins import the `parse*` helpers) from the real `cli.mjs`, so only `fail` may be replaced.

**Alternatives weighed:** FIX, so short: the only alternative destination is a new `lib/log.mjs`,
which loses to `cli.mjs` now that `cli.mjs` exists and is already imported by most of the same bins
(`fail` rides existing import lines). Leaving `fail` in paths keeps two lib modules dependent on a
`process.exit` helper from a "pure constants" file.

**Landing note:** Apply the patch, resolve the two import-list conflicts, add the two test-mock
edits above in the same commit.

#### Verification

`grep -rn "fail" tools/asset-gen/lib/paths.mjs` returns nothing; `npm run
test:asset-gen` green,
with the failure-path cases in both suites still observing thrown errors (proving the new stub is
live, not `process.exit`); `node tools/asset-gen/legacy/retouch-line-art.mjs` still loads (the
legacy README's "kept runnable" contract).

### [P1][discoverability] README scoreboard and "do first" list are stale — most ideas already graduated into the live pipeline, but nothing here says so

**File(s):** `tools/asset-gen/ideas-exploration/README.md` lines 28–75 — pinned at SHA f934d43

**Rolled-back draft patch:**
docs/audit-deferred/p1-discoverability-readme-scoreboard-and-do-first-list-are-stale-most-id.patch

#### Problem

The ideas-exploration README presents all 25 ideas as an open backlog "intended for a follow-up
session to review and decide what to promote," with a prioritized "do first" list of patches to
land. That follow-up already happened — most ideas shipped into `bin/`/`lib/` or were closed by the
gemini-3.1 regeneration wave — so a newcomer reading the README would re-do finished work.

**State at triage (2026-07-27):** The finding still holds at HEAD, but the ground shifted materially
since f934d43:

* Commits e44fafb and b49ff0d (2026-07-27) added a curated `Status:` disposition line to the top of
  **every** `idea-N/report.md` — a three-value vocabulary of **LANDED** (13: ideas 2, 7, 10, 11, 12,
  13, 17, 19, 21, 22, 23, 24, 25), **NOT PROMOTED** (7: ideas 1, 4, 5, 6, 15, 16, 20), and **OPEN**
  (5: ideas 3, 8, 9, 14, 18), each with README-relative pointers to the live file, run record, or
  still-open gap. These lines already encode the corrected facts the reviewer demanded (idea-4 and
  idea-6 NOT PROMOTED; idea-22 reframed accurately: the composite view is the Combined layer of
  `bin/gen-coloring-book-proof-sheet.mjs`, the standalone CLI was not promoted).
* `tools/asset-gen/ideas-exploration/README.md` itself is essentially unchanged: lines 7–12 still
  say "nothing from these experiments is live in the pipeline … intended for a follow-up session to
  review and decide what to promote"; the scoreboard (lines 30–58) has no Status column; the "What a
  follow-up session should probably do first" list (lines 60–77) is intact.
* `tools/asset-gen/.ruler/AGENTS.md` (and its generated `CLAUDE.md`/`AGENTS.md`, line ~127) still
  says "24 of 25 ideas were validated there, and several carry finished patches/assets waiting to be
  promoted" — the stale claim the reviewer flagged.

So the finding is now *narrower*: the per-idea dispositions exist and are correct; only the README
(the entry point the CLAUDE.md orientation sends readers to) and the `.ruler/` pointer still tell
the pre-promotion story.

**Prior attempt / why it was deferred:** Failed adversarial review, three rounds. The reviewer's
objections were about disposition *facts*, not the approach: the intro sentence "nothing from these
experiments is live" was left untouched; rows 4, 6, and 22 were classified LANDED when their
deliverables never shipped; rows 1 and 5 needed a SUPERSEDED status; derived counts were wrong after
reclassification; the stale pointer in `tools/asset-gen/.ruler/AGENTS.md` ("several carry finished
patches/assets waiting to be promoted") was never fixed; and idea-24's Status path was
repo-root-relative while every other path was README-relative.

#### Proposed solution

**FIX — clear winner.** The README is still stale at HEAD, but the disposition facts it needs now
live in the per-report Status lines added since the pinned SHA. Rewrite the README to derive from
those lines instead of re-applying the draft, whose disposition table now contradicts them.

Write a fresh, smaller fix that treats the report Status lines as the source of truth:

1. **Intro (lines 7–12):** keep the historical fact (every subagent reverted to pristine before
   exiting), then state that the promotion pass has since happened — 13 ideas LANDED, 7 NOT
   PROMOTED, 5 still OPEN — that each report opens with a `Status:` line giving its disposition and
   live-file pointer, and link `../docs/gemini-3.1-migration.md` as the run record.
2. **Scoreboard:** add a slim Status column carrying only the status word (`LANDED` / `NOT PROMOTED`
   / `OPEN`), no paths. Paths stay in the report Status lines — one bookkeeping surface, and it
   moots the reviewer's idea-24 path-relativity objection outright.
3. **"What a follow-up session should probably do first" (lines 60–77):** replace with a short
   retrospective — the list was executed in the 2026-07 wave (`../docs/gemini-3.1-migration.md`);
   remaining open work lives in `area:asset-gen` GitHub issues, and the five OPEN Status lines name
   the scorers that were validated but never built at HEAD.
4. **`tools/asset-gen/.ruler/AGENTS.md`:** replace "24 of 25 ideas were validated there, and several
   carry finished patches/assets waiting to be promoted" with a sentence saying dispositions live in
   each report's Status line and the README scoreboard; run `npm run ruler:apply` and commit the
   regenerated `CLAUDE.md`/`AGENTS.md` (this was reviewer objection 6, and the draft's round-3
   version of this edit is a usable reference).

What must change vs the rejected draft to survive the recorded objections: adopt HEAD's three-status
vocabulary (drop the draft's SUPERSEDED — HEAD's Status lines state the superseding fact in prose
under NOT PROMOTED); take counts from the Status lines (13/7/5), not the draft (11/3/11); keep all
paths out of the scoreboard; and keep the intro rewrite plus the `.ruler/` fix, the two objections
the Status-line commits did *not* already absorb.

Sketch of the intro replacement:

```markdown
… and **reverted the repo to pristine before exiting** — so nothing landed *during* the exploration.
The promotion pass has since happened: 13 ideas LANDED, 7 were NOT PROMOTED, and 5 remain OPEN. Each
report opens with a `Status:` line naming its disposition and, where landed, the live `bin/`/`lib/`
file; `../docs/gemini-3.1-migration.md` is the run record of the wave that closed most of the rest.
```

**Alternatives weighed:** 1. **Rewrite the README against the HEAD Status lines (winner).** Small,
factually anchored, keeps one source of truth for per-idea pointers. Cons: none significant. 2.
**Apply the draft patch and reconcile.** Rejected: the draft's disposition table (11 LANDED + 3
SUPERSEDED + 11 NOT PROMOTED) disagrees with HEAD's curated 13/7/5 split — the draft demotes idea-22
to NOT PROMOTED where HEAD's later, more accurate Status line calls it LANDED via the proof sheet's
Combined layer, and the draft lacks HEAD's OPEN class entirely. Reconciling the patch costs more
than rewriting and would reintroduce a second disposition vocabulary.

**Landing note:** Re-stage in docs/AUDIT.md with the solution text above (explicitly: derive from
the report Status lines; do not apply the draft patch). Alternatively fix directly — it is a
two-file Markdown/ruler change with `npm run ruler:apply` + `npm run format:check` as the only
gates.

#### Verification

`npm run check` plus the unit/E2E suites covering the touched files (see the solution for any
targeted commands).
