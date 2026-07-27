# Install-prompt module branches on `isNative()` at runtime where it could be a build-time exclusion

**Priority/category:** P2[platform-branching] · **Cluster:** C12 · **Triaged:** 2026-07-27 at
32394ab **Original file(s):** `web/src/lib/state/install.svelte.ts:82-120`,
`web/src/routes/+page.svelte:164-167` — pinned at SHA f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** Convert the two remaining runtime `isNative()` guards in `install.svelte.ts`
to the composite `__IS_CAPACITOR__ && isNative()` idiom the repo has since codified. That idiom is
precisely the answer to the test-config blocker that killed the original attempt — but the original
brief's goal ("Rollup drops the whole module from the native bundle") must be rewritten: it is
unattainable at HEAD, and the caller-side guard is already build-time.

## Original finding (condensed)

The install feature is dead inside the native shell yet ships in the native bundle, gated three
times at runtime: the module-load `beforeinstallprompt`/`appinstalled` listener block
(`if (browser && !isNative())`), an `isNative()` early return inside `initInstallPrompt()`, and an
`if (!isNative())` guard at the `+page.svelte` call site. CLAUDE.md's rule says `CAPACITOR=true` is
the single signal for web-vs-native branching; guarding on the compile-time literal
`__IS_CAPACITOR__` would let Rollup drop the code from the native bundle, where `isNative()` cannot
tree-shake.

## Why it was deferred

Implementation failed on a verification note the brief got wrong: `web/vitest.config.ts` defines
`__IS_CAPACITOR__` as `true`, so a bare `if (browser && !__IS_CAPACITOR__)` guard compiles the
listener block *out* under Vitest and 15 web install-state tests go inert before their mocked
`isNative()` is ever consulted. Fixing that seemed to require an out-of-scope test-config change, so
the scoped change was abandoned.

## Current state of the code

Substantially drifted since f934d43 — the finding is one-third resolved and the codebase has grown
the exact convention that resolves the deferral blocker:

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

## Options considered

1. **Composite guard (winner).** Change line 83 to
   `if (browser && !(__IS_CAPACITOR__ &&
   isNative()))` and line 105's condition to
   `(__IS_CAPACITOR__ && isNative())`. Web build: `__IS_CAPACITOR__` is `false`, the guard is
   statically true, and the `isNative()` call is dropped — the web-vs-native decision becomes
   build-time, per the CLAUDE.md rule. Vitest: the guard reduces to `!isNative()`, so all 15 tests
   keep steering through their existing `isNative()` mock (`install.svelte.test.ts:8-11`) — zero
   test churn, which is what killed the last attempt. Native build: reduces to `!isNative()`,
   runtime-inert exactly as today.
2. **Bare `!__IS_CAPACITOR__` guard + test-config surgery.** The original brief's letter; achieves
   dead-code elimination of the listener bodies from the native bundle. Rejected: it requires
   flipping or per-file-overriding the Vitest define, contradicting the deliberate, documented
   convention at `vitest.config.ts:15-18` that every other composite-guarded module now relies on —
   and the bundle it slims is the on-device native bundle, where a KB of never-registered listeners
   costs nothing (the module itself is retained via `SetupInstructions` anyway).
3. **DROP as mostly-resolved.** Rejected narrowly: the two remaining guards are still the
   anti-pattern CLAUDE.md names (a runtime branch that has a build-time form), the codified idiom
   makes the fix two lines with no test impact, and leaving them invites the next reader to copy the
   bare-`isNative()` shape into new web-only modules.

## Recommendation

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

Verification that *is* attainable: `npm run test:unit` green with no changes to
`install.svelte.test.ts`; `npm run build` then grep the **web** bundle's install chunk — the
`isNative` call disappears from those guards; `CAPACITOR=true npm run build:cap` still succeeds.
Note the triple-guard collapse the original promised is already two-thirds done by
`webOnlyServices.ts`; keep `initInstallPrompt`'s own guard as defense-in-depth (it is an exported
entry point and its native no-op is test-asserted).

## Suggested next step

Re-stage in `docs/AUDIT.md` with the corrected brief above (composite idiom, corrected verification,
explicit note that `SetupInstructions` keeps the module in the native bundle so module-drop is a
non-goal). Trivial to implement alongside the C12 folder move or independently.
