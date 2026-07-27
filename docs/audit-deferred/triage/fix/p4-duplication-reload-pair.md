# Reload-side-effect pair (`refreshState = 'idle'; window.location.reload()`) is repeated across three lifecycle paths

**Priority/category:** P4[duplication] · **Cluster:** C12 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/pwa/updates.ts:164-166,184-186` — pinned at SHA f934d43 **Draft
patch:**
docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location.patch

## Verdict

**FIX — clear winner.** Apply the draft patch (it applies cleanly at HEAD) and add the one helper
the reviewer demanded — a `deferReload()` for the `updateReload = 'owed'` transition — so both
lifecycle outcomes are named, not just the reload.

## Original finding (condensed)

The "commit the reload" step — reset the update state machine, then `window.location.reload()` — is
written out twice (in `onControllerChange` and in `checkForUpdates`' owed path), and the inverse
"defer instead" transition is a third inline copy. The discipline "always reset state before
reloading" is enforced only by copy-paste; a future path that reloads without resetting would strand
the state machine.

## Why it was deferred

The implementer extracted `reloadForUpdate()` for the two reload sites but never delivered a fix
round for the reviewer's one unresolved objection: the deferral transition (`updateReload = 'owed'`)
stayed inline in `onControllerChange`, so the finding's requested centralization of *both* lifecycle
outcomes was incomplete. The reviewer prescribed the remedy verbatim: extract and call a
`deferReload()` helper alongside `reloadForUpdate()`.

## Current state of the code

The file moved (`web/src/lib/updates.ts` → `web/src/lib/pwa/updates.ts`) and the state machine was
renamed (`refreshState`/`'idle'`/`'deferred'` → `updateReload`/`'none'`/`'owed'`), but the
duplication holds at HEAD: the reset-and-reload pair sits at `updates.ts:162-163`
(`onControllerChange`) and `updates.ts:193-194` (`checkForUpdates`' owed path); the deferral
transition is inline at `updates.ts:158-160`. The draft patch was cut against the post-rename code —
`git apply --check` passes at HEAD, and its `reloadForUpdate()` covers exactly the two reload sites.
Note two *other* `updateReload = 'none'` writes at lines 173 and 185 are rollback-without-reload
paths (postMessage failure, activation-recovery timeout) and must stay out of the helper.

## Options considered

1. **Apply the draft + add `deferReload()` (winner).** The reload extraction is done and passed
   type-check/unit/lint gates; the residual objection is a three-line helper. Honest caveat: at HEAD
   the `'owed'` assignment occurs exactly once, so `deferReload()` centralizes nothing today — its
   value is that the state machine's two legal outcomes become named, greppable moves, which is the
   invariant the finding is about and the condition the recorded review made explicit.
2. **Apply the draft as-is and argue the objection down.** Rejected: re-litigating a recorded
   objection over three lines costs more than writing them, and an unnamed inline transition next to
   a named one reads as an accident.
3. **DROP as P4 noise.** Rejected: the patch exists, applies cleanly, and already passed the
   driver's gates — the marginal cost from here is one tiny helper, and the reload-count assertions
   in `updates.test.ts` (`toHaveBeenCalledTimes(1)` at lines 197, 216, 340) verify it for free.

## Recommendation

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

## Suggested next step

Re-stage in `docs/AUDIT.md` as "apply the draft patch, then extract `deferReload()` for the inline
`'owed'` transition in `onControllerChange`" — cite the reviewer's objection as the acceptance
criterion. Independent of the other C12 findings (different file; no ordering constraint).
