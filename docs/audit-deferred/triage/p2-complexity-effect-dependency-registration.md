# `$effect` bodies use bare member-access statements purely to register reactive dependencies — a fragile, non-obvious pattern

**Priority/category:** P2[complexity] · **Cluster:** C09 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/routes/+page.svelte:37-41` — pinned at SHA f934d43 **Draft patch:**
docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch

## Verdict

**FIX — clear winner.** Apply the draft's core (parameterize the orientation apply, re-enable
`@typescript-eslint/no-unused-expressions`) but strip both `lastReset*` dedupes it grew — they are
exactly the two objections that killed round 3, one of them a real behavior bug — and fix the pinch
actions by *deleting* the inert `void` reads rather than re-plumbing `reset`. Details below.

## Original finding (condensed)

The drawing shell's orientation `$effect` opens with two expression statements
(`settings.lockRotationEnabled; settings.forceLandscapeOrientation;`) whose only job is to trip
Svelte's dependency tracker, because `applyDeviceOrientationPreference()` reads the settings
internally, outside the tracked scope. A cleanup commit or lint pass can delete the bare reads and
silently kill reactivity. Proposed making the reads load-bearing (pass the values as arguments, or
read them into a `$derived`), "same for any other effect using this pattern".

## Why it was deferred

Failed adversarial review across three rounds. Rounds 1-2 objections (ClearButton and the two pinch
actions also use the pattern; the eslint rule-off would go stale; `lastResetOrientation` assigned
before the early-return guard) were all addressed. Round 3 left two unresolved objections against
the amended draft:

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

## Current state of the code

Nothing from the draft landed. All four sites are unchanged at HEAD:

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

## Options considered

1. **Trimmed draft (winner).** Parameterize `applyDeviceOrientationPreference`; delete the inert
   `void` reads and correct the false comments in the pinch actions; thread the orientation through
   `untrack` in `ClearButton` with no dedupe; re-enable `no-unused-expressions`. Every piece either
   strictly improves the code (the pinch lines are dead code under a wrong comment), survived three
   review rounds unobjected (the orientation parameterization), or is the reviewer's own final
   prescription (the ClearButton shape). The re-enabled rule converts the finding's core hazard — a
   cleanup deleting a bare read — from silent breakage into a lint error.
2. **Status quo + comments.** Keep the bare reads, strengthen comments, keep the rule-off. Zero
   behavior risk, but the pinch comments are *factually false* today and would need fixing anyway —
   at which point half of option 1 has happened — and the lint guard stays off repo-wide, so the
   hazard the finding names remains silent. Loses.
3. **Shared `watch(getter, cb)` helper** used by all sites. A new abstraction for three sites, only
   one of which (`ClearButton`) actually wants untrack semantics; the shell effect and pinch effects
   don't. Indirection without payoff. Loses.

## Recommendation

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

Verification: re-run the burndown's probe check (a throwaway component with a bare
`layout.orientation;` in an `$effect` must fail lint), then `npm run check`, `npm run lint`,
`npm run test:unit`, and the E2E suites the rounds used (`flows`, `clear-tutorial`, `parent-zoom`,
`multitouch`); manually toggle lock-rotation / force-landscape in Parent Center.

## Suggested next step

Re-stage in docs/AUDIT.md with the trimmed prescription above (apply the patch with
`git apply --3way`, resolve the two conflicts by re-deriving `persistedState.ts`, then make deltas
2-3); one commit.
