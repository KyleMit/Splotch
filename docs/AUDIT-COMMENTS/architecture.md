# Audit comments — Architecture & organization

25 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `a7797188ce9e` — [P3][architecture] `actionButtonLayout.svelte.ts` holds no state — it's geometry + a DOM-mutating writer misfiled under `state/`

**Issue**

Every other file in `state/` owns a `$state` object. This one owns none: it's a bundle of (a)
CSS-mirroring layout constants (lines 16-56), (b) pure geometry functions reading *other* stores —
`visibleActionButtonCount`, `availablePerButton`, `maxActionButtonScale` (58-104), and (c)
`publishActionPanelState` (126-145), which **imperatively mutates the DOM** (`el.style.setProperty`,
`el.toggleAttribute`, `el.setAttribute`). A DOM side-effect writer and screen-geometry math sitting
in the shared-state directory is a category error: the file `.svelte.ts` extension implies runes
state, and a reader looking for "app state" finds neither. It reads from `settings`, `network`,
`layout`, `toolState` but is read-only against them.

**Fix**

Moved the stateless `actionButtonLayout` module (pure geometry + the `publishActionPanelState` DOM
writer, zero `$state`) from `web/src/lib/state/` to a flat `web/src/lib/actionButtonLayout.ts`,
matching the existing `hexPickerLayout.ts`/`theme.ts` convention, so `state/` no longer surfaces a
DOM writer to a reader hunting for app state. Pure relocation: the two co-located tests and two
consumers (`ActionsPanel.svelte`, `ControlsSection.svelte`) had their import paths updated, and the
architecture skill's file map gained a row for the module's new home; no logic, exported names, or
DOM-write behavior changed.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073002249) · 2026-07-24
18:08:50 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 1005c1e12f09 — [P3][architecture] Shared component chrome in `app.css` (`.corner-button`, `.modal-close-btn`) duplicates the primitive layer with raw values

**Issue**

`app.css` hosts several reusable UI patterns — `.modal-shell`, `.modal-close-btn`, `.corner-button`
— that are conceptually "primitives" but live as global classes with a mix of tokens and raw values
(see the token finding above). The `design` skill explicitly says global patterns "remain classes in
`app.css` because dialogs and imperative DOM need them," so their existence is intentional — but
they sit outside every guardrail the design system applies to `.svelte` primitives (no ratchet, no
styleguide entry, no token enforcement), so they drift most easily. There's no cross-reference from
the `design` skill's Primitives table to these global classes, so a newcomer doesn't know they're
the sanctioned path for close/corner buttons.

**Fix**

Added a "Global class (`app.css`)" table to the design skill's `## Primitives` section — one
scannable row per shared global class (`.modal-dialog`/`.modal-fly-in`, `.modal-shell`,
`.modal-close-btn`, `.corner-button`, `.flyout-menu`/`.flyout-option`) naming its job and its
consumers — and trimmed the following paragraph down to the rationale it alone carries (why these
stay classes, hoist-the-rules de-duplication, extract at the third duplicate), regenerating the
`.claude`/`.agents` copies via `ruler:apply`. The brief enumerated four class rows; I gave
`.modal-dialog`/`.modal-fly-in` a row too, because the trimmed paragraph was the only place the
dialog fly-in was named and it would otherwise have been dropped.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080095521) · 2026-07-25
18:45:43 UTC</sub>

## PR [\#546](https://github.com/KyleMit/Splotch/pull/546) — Audit burndown: clear the staged docs/AUDIT.md backlog (2026-07-25)

### fb2f4c20286a — [P4][architecture] `persistent` defaults to `true` as a magic initial value in three unrelated spots

**Issue**

The unauthenticated web loader returns `persistent: true` (`+page.server.ts:67`), native page state
initializes `persistent = $state(true)` (`:18`) and resets it to `true` in `signOutLocally` (`:28`).
Three independent "assume durable until proven otherwise" defaults with a one-line comment only at
the loader. The choice (default *true* so the scary "Blobs unavailable" banner doesn't flash before
the first real read) is a genuine decision, but it's re-encoded as a bare literal in each place;
flip the intent in one and the surfaces disagree.

**Fix**

Added ASSUME_PERSISTENT to adminFormat.ts (shared, non-server module) and pointed the three seed
sites at it — the unauthenticated loader's return value, and the native page's $state initializer
and signOutLocally reset — replacing the duplicated true literal with one named, commented source of
truth. No behavioral change; check, unit tests, eslint, and tests/admin.spec.ts all pass.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081113360) · 2026-07-25
23:58:06 UTC</sub>

### 4e4afa0625b6 — [P1][architecture] The drawing-page shell buries ~140 lines of imperative boot logic inline across three `onMount` and four `$effect` blocks

**Issue**

`+page.svelte` is the composition root, but its `<script>` mixes composition with a large, unnamed
boot sequence: orientation reactivity (37-41), the app-surface flag (48-51), deferred SW
registration (57-60), Parent Center latching (74-78), the overlay idle-mount pump (80-104), and a
second `onMount` (106-175) that alone does token capture, theme re-stamp, key/folder hydration,
durable-storage recovery, context-menu blocking, wake lock, fullscreen seeding, and PWA/install
init. The boot order is expressed only by block position and long prose comments; there is no named
`boot()` entry point to grep for, and the meaning lives in comments rather than function names. This
is the single biggest maintainability liability in scope.

**Fix**

Moved the drawing shell's second `onMount` body into four named helpers under `web/src/lib/boot/` —
`installContextMenuGuard()`, `installWakeLock()`, `hydratePersistedState()`, and
`initWebOnlyServices()` — so the boot sequence reads as an explicitly ordered list of greppable
calls whose return values are its teardowns, instead of prose-commented inline blocks. Listener
wiring, the `isNative()` gate, and setup/teardown ordering are byte-for-byte preserved;
`captureAiAccessTokenFromUrl()`/`applyTheme()` stay inline as the brief allows, and I left the idle
overlay pump in place (the brief marked it optional and it reads and writes the component's own
`overlays`/`ParentCenter` `$state`, so extracting it would have meant inventing a callback seam
rather than moving code).

*Revised before approval:* Extracted the idle overlay-mount pump into
`mountBootHiddenOverlays(onParentCenter, onOverlay): () => void` in
`web/src/lib/boot/bootHiddenOverlays.ts` — it owns the dynamic import, mount queue, recursive
`scheduleIdle`, and `stopped` guard, tracking its own index instead of reading `overlays.length`
back out of the component's `$state` — which collapses the shell's two `onMount` blocks into one
whose teardown array is the ordered boot list; the four `$effect` blocks are untouched. Repointed
`docs/COMPATIBILITY.md`'s Wake Lock row at `lib/boot/wakeLock.ts`, and named
`lib/boot/webOnlyServices.ts` as the call site in `web/src/.ruler/AGENTS.md` and ADR-0022,
re-running `npm run ruler:apply` so the generated `web/src/CLAUDE.md`/`AGENTS.md` are in the same
commit. The pump now registers after the three synchronous boot calls rather than before them so the
list reads as one sequence — its work is deferred to idle either way, so nothing observable moves.
Gates green: `npm run check` (939 files, 0 errors), `test:unit` (660 passed), eslint on
`+page.svelte` and all of `lib/boot/`, `format:check`, `ruler:check`, and E2E `early-boot` +
`pwa-registration` plus `page`/`flows`/`startup-bundle`/`parent-zoom` (59 passed) to exercise the
overlays the pump mounts.

*Revised before approval:* Repointed every doc reference the boot extraction left stale: ADR-0049's
three `+page.svelte` mentions (the idle import, the "add the next overlay here" instruction, and the
escape-hatch sketch) now name `lib/boot/bootHiddenOverlays.ts` — and the ambiguous bare filename in
the instruction was split across `lib/components/bootHiddenOverlays.ts` (re-export) and
`lib/boot/bootHiddenOverlays.ts` (idle queue), since two files now share the name;
`lib/components/bootHiddenOverlays.ts`'s header credits the pump as its importer; ADR-0039 names
`lib/boot/webOnlyServices.ts` as `initInstallPrompt()`'s call site; and both `lib/` structure maps
(`web/src/.ruler/AGENTS.md` and the architecture skill's source map) gained a `lib/boot/` entry,
with `npm run ruler:apply` re-run so the four generated copies are in the same commit. My first
draft of those two new entries asserted a call order that didn't match the code and claimed every
step returns a teardown — corrected against the source before committing to the real order
(`hydratePersistedState()` → `mountBootHiddenOverlays()` → `installContextMenuGuard()` →
`installWakeLock()` → `initWebOnlyServices()`, last four returning teardowns). Gates green:
`npm run check` (939 files, 0 errors), `test:unit` (660 passed), eslint on the touched module plus
`lib/boot/` and `+page.svelte`, `format:check`, and `ruler:check` in sync.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The overlay idle-mount pump — explicitly enumerated by the finding as part of the buried boot
  sequence — is still inline at `web/src/routes/+page.svelte:75-99`: a whole `onMount` of imperative
  logic (dynamic import, mount queue, recursive `scheduleIdle`, and the subtle `stopped` guard) with
  no name to grep for. Extract it into a named `$lib/boot/` helper alongside the other four (e.g.
  `mountBootHiddenOverlays(onParentCenter, onOverlay): () => void`) so the shell holds only the
  composition and the ordered boot list; the four short `$effect` blocks can stay as they are.
* `docs/COMPATIBILITY.md:81` still points the Wake Lock risk-register row at
  `routes/+page.svelte:130–134`, which no longer contains that code. Repoint it at
  `web/src/lib/boot/wakeLock.ts`.
* Two docs still name `+page.svelte`'s `onMount` as the call site for services that now live behind
  `initWebOnlyServices()`: `web/src/.ruler/AGENTS.md:18` (`initInstallPrompt()`, "called from
  `+page.svelte`'s `onMount`") and `docs/adrs/0022-pwa-service-worker-strategy.md:76`
  ("`initPWAUpdates()` is called from `+page.svelte` on web"). Update both to name
  `web/src/lib/boot/webOnlyServices.ts`, and re-run `npm run ruler:apply` for the AGENTS.md source
  so the generated copies don't drift.
* `docs/adrs/0049-idle-mount-boot-hidden-overlays.md` still places the idle mount pump in
  `+page.svelte` at lines 30, 57-58 and 78 — line 57-58 is an actionable instruction ("add it to
  `bootHiddenOverlays.ts` and the idle queue in `+page.svelte`") that is now wrong, since the queue
  moved to `lib/boot/bootHiddenOverlays.ts`. Repoint those three spots (line 10 is historical
  context and can stay).
* `web/src/lib/components/bootHiddenOverlays.ts:2-3` says "+page.svelte imports this module at idle"
  — the importer is now `lib/boot/bootHiddenOverlays.ts`. Update the header comment.
* `docs/adrs/0039-pwa-install-prompt-ux.md:33` still says `initInstallPrompt()` is "called once from
  `+page.svelte`, web-only" — the same sentence this commit corrected in `web/src/.ruler/AGENTS.md`.
  Repoint it at `lib/boot/webOnlyServices.ts`.
* The new `lib/boot/` directory is absent from both places that enumerate `lib/` structure: the
  subdirectory list in `web/src/.ruler/AGENTS.md` (which this commit already edits) and the
  `web/src/lib/` source map in `.ruler/skills/architecture/SKILL.md`. Discoverability of the named
  boot sequence is the point of this finding, so add a `lib/boot/` entry to each (and re-run
  `npm run ruler:apply`).

**E2E gate** — `tests/early-boot.spec.ts tests/pwa-registration.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081310045) · 2026-07-26
01:02:10 UTC</sub>

### 0011086a2503 — [P3][architecture] The `/dev/*` harnesses have no index and inconsistent chrome — only `ai-timer` has a Breadcrumb; there is no discoverable landing page

**Issue**

There is no `/dev` route listing the harnesses, so their existence is only discoverable by reading
`+page.ts` files or knowing the URLs. Their navigation is also inconsistent: `ai-timer` renders
`<Breadcrumb current="AI Timer" />`, `design` has a bespoke `<header>` with no link back to the app
or to sibling harnesses, and `engine` is a bare fixed canvas (defensible — it's a Playwright target
— but a maintainer landing there has no way out). A new contributor can't answer "what dev tools
exist" without grepping.

**Fix**

Added a gated `/dev` landing page (`+page.svelte` + a `+page.ts` calling `requireDevHarness()`) that
links each harness with a one-line description, and gave `/dev/design` the same `<Breadcrumb>`
chrome `ai-timer` already had. `/dev/engine` stays bare with a comment recording why — it's a
Playwright target whose canvas is pinned to the viewport origin for the specs' pixel and pointer
assertions. The architecture skill's route table gained `/dev` and `/dev/design` rows, edited in
`.ruler/` and regenerated via `ruler:apply`.

*Revised before approval:* Addressed the review on 574127fe40e2a66d707882095189444327010459. The
`Breadcrumb` `.crumb-current` `#666` is pinned for the light-only `/admin` host, so on the themed
`/dev` pages it sat on the dark `--app-bg` at ~3.0:1. Added a page-scoped
`:global(.crumb-current) { color: var(--text-mid) }` override to `/dev`, `/dev/design`, and
`/dev/ai-timer` (included per the review, since it had the same defect already), leaving the
component's hex alone so `/admin` is unaffected and the `lint:tokens` baseline stays at 1.

Verified with a throwaway Playwright spec reading computed color and body background in both themes,
deleted before commit: light unchanged at 5.27:1 on all three (`--text-mid`'s light value is the
same `#666`), dark now 8.46:1.

Corrected the false "hardcoded-light host pages" claim in both the `Breadcrumb` comment and the
`lint-token-styles.mjs` baseline entry; the comment also cited a `#f0ecf7` harness background that
no longer exists anywhere in `web/src`.

Gates green: `check` (944 files, 0 errors), eslint on the 5 changed files, `lint:tokens`,
`test:unit` (680), `test:scripts` (66), e2e for ai-timer/engine/multitouch (66), `format:check`. Not
done, and called out rather than assumed: the contrast spec was not kept as a permanent regression
guard, since that widens scope past the bounded fix requested.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `Breadcrumb`'s `.crumb-current` is a hardcoded `#666`, pinned that way on the explicit premise —
  stated in the comment at `web/src/lib/components/Breadcrumb.svelte:62-65` and repeated in the
  `lint-token-styles.mjs` baseline entry — that "the host pages' backgrounds are hardcoded light".
  Both pages this commit adds it to are themed (`web/src/routes/dev/design/+page.svelte:285` and
  `web/src/routes/dev/+page.svelte` both set `background: var(--app-bg)`), so in dark theme the
  crumb is `#666` on `--app-bg` `#17171d` — about 3.1:1 for 14px/600 text, under the 4.5:1 floor the
  comment claims to clear, and the design page's own theme toggle is the fastest way to see it. Keep
  the fix bounded to a themed override on these dev pages (e.g.
  `:global(.crumb-current) { color: var(--text-mid); }`, which is only unsafe on the light-pinned
  `/admin` host) rather than retuning `Breadcrumb` itself — changing the component's hex would also
  require lowering its `lint:tokens` baseline in the same commit, and that ratchet is not one of the
  driver's gates. `/dev/ai-timer` has the same problem today for the same reason (its `.debug` has
  no background and inherits body's `var(--app-bg)`), so include it if you want the three harnesses
  actually consistent, and correct the now-false "hardcoded-light host pages" claim in the
  `Breadcrumb` comment and the lint baseline.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081542683) · 2026-07-26
02:06:19 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### 69cc99857746 — [P3][lifecycle] `dragToClear.destroy` leaves in-flight visual state on shared DOM

**Issue**

`destroy` removes listeners and clears timers/rAF, but does **not** undo any visual state the action
wrote to elements *outside* `node`. If the component unmounts mid-drag, these persist:

* `document.documentElement.style` `--clear-progress` (set on every move, line 143) is left non-zero
  on the global root.
* `o.containerEl.style.transform` / `.dragging-active` class remain applied.
* `o.acceptZoneEl` may be left `display:block`/`.visible`.

Because `--clear-progress` is on `documentElement` (explicitly "any element can read it"), a leaked
value can affect the next-mounted UI, not just the torn-down subtree.

**Fix**

`destroy()` now checks for an active pointer and, when one is present, calls the module's existing
`finishDrag`/`resetDragVisuals` pair before tearing down listeners and timers — so an unmount
mid-drag no longer leaves `--clear-progress` non-zero on `:root` or leaves the container transform,
`dragging-active`, `dragging`/`delete-ready`, and accept-zone classes applied. Added a unit case
that drags past the threshold, destroys the action, and asserts each of those is back at rest.

*Revised before approval:* Addressed both review points by amending the finding's commit (now
f749a02fd32f). `destroy()` hides the accept zone synchronously
(`o.acceptZoneEl.style.display = 'none'`) inside the mid-drag branch, after
`finishDrag`/`resetDragVisuals` — needed because the `resetTimers` sweep immediately below cancels
the delayed hide `finishDrag` schedules; `finishDrag` itself was not modified. The destroy-mid-drag
test now also asserts `options.acceptZoneEl.style.display` is `'none'`, mirroring the pointercancel
case. Full unit suite (691 tests), `npm run check` (0 errors), and eslint on both changed files all
pass.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `destroy` leaves `acceptZoneEl.style.display` at `'block'`, so the finding's third leak is
  unresolved: `finishDrag` only hides the zone via `scheduleReset(..., ACCEPT_ZONE_HIDE_DELAY)`
  (dragToClear.ts:199-201), and the `for (const id of resetTimers) clearTimeout(id)` a few lines
  below in `destroy` cancels that timer before it can fire. Hide it synchronously in the mid-drag
  branch of `destroy` (set `o.acceptZoneEl.style.display = 'none'` after `resetDragVisuals(o)`),
  without touching `finishDrag`.
* The new `resets shared visual state when destroyed mid-drag` test asserts the accept zone's
  classes but not its `display`, which is why the leak above passed green — add
  `expect(options.acceptZoneEl.style.display).toBe('none')` alongside the existing assertions,
  matching the pointercancel case at dragToClear.test.ts:226.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082281766) · 2026-07-26
05:59:25 UTC</sub>

### 035a34c873ec — [P4][architecture] `launchGuard` holds all dead zones in module-global mutable state

**Issue**

`zones` is a module-level singleton mutated by
`guardLaunchZone`/`isPointInLaunchZone`/`clearLaunchZones`. It works because there is only ever one
modal-launch context, but module-global mutable state is easy to miss when reasoning about
lifecycle: every test must `clearLaunchZones()` in `beforeEach` (both test files do), and an
SSR/prerender import evaluates and retains this array. It also can't be reset per-action-instance.

**Fix**

Added a comment above launchGuard.ts's module-level `zones` array documenting that the singleton
shape is intentional (one global launch-context, cleared by modalDialog on close), so future readers
don't mistake it for an oversight. Pure comment addition; check, unit tests, and eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082365045) · 2026-07-26
06:28:54 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### 01e5a32343d7 — [P2][architecture] No central storage-key registry — every persisted key is a magic string scattered across modules and re-declared in tests

**Issue**

`storage.ts` owns persistence but owns none of the key names. Every key is a `splotch-*` string
literal declared in a caller (`settings.svelte.ts:14-43`, `tool.svelte.ts:35`,
`strokeWidth.svelte.ts:15-16`, `install.svelte.ts:17-18`, `folderSave.ts:27`,
`secureStorage.ts:23-27`) and then re-declared, verbatim, in each store's test and in
`storage.restore.integration.test.ts:50-52`, `startup-bundle.spec.ts:23`, `flows.spec.ts`. The
task's "grepability" bar — "can a newcomer find every storage key and what's persisted?" — fails:
the only enumeration of persisted keys is the runtime `managedKeys` Set (line 21), which is empty
until code runs. There is no single source of truth listing what Splotch writes to localStorage.

**Fix**

Added a canonical typed registry for all 28 Splotch localStorage keys and constrained every storage
helper to its value union. Production callers and persistence tests now consume the registry, while
app.html’s inline literals remain guarded against it and the startup-bundle marker remains
unchanged.

*Revised before approval:* Replaced the folder-save startup-boundary marker with a literal unique to
`folderSave.ts`. This preserves the lazy-chunk guard while allowing the centralized storage registry
to remain on the eager path.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `STORAGE_KEYS` is bundled into the eagerly modulepreloaded `BKEbAkYh.js`, so
  `splotch-save-folder-chosen` is now present on the startup path and
  `web/tests/startup-bundle.spec.ts` fails its save-pipeline boundary guard. Keep the folder-save
  marker lazy or replace the guard with a marker that remains unique to `folderSave.ts`.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084071316) · 2026-07-26
15:11:09 UTC</sub>

### bc7cc18da494 — [P2][architecture] `managedKeys` is populated as an implicit side effect of the first read/write — durable restore silently depends on import ordering

**Issue**

The set of keys the durable layer restores is built by `track(key)` firing inside every
`read*/write*` call (lines 97, 107, 115, 124, 133, 145, 155). The comment (lines 18-20) concedes the
fragility: *"State stores read their keys at init (before hydrate runs), so this set is complete by
then."* So correctness of native eviction-recovery depends on every persisted key being touched, at
least once, before `hydrateDurableStorage()` runs. A key that is only ever *written conditionally*
(never read at module init) is absent from `managedKeys` and silently will not be restored after a
WebView eviction — with no test able to catch it, because the whole mechanism is data-driven by call
history. `storage.restore.integration.test.ts` exists precisely because this coupling is invisible.

**Fix**

Hydration now enumerates every declared `STORAGE_KEYS` value instead of relying on prior helper
access. Storage tests seed the durable and local layers directly, while the integration comments now
describe only the callback/reloader contract.

*Revised before approval:* Durable hydration now excludes the scrub-only legacy API-key entry,
preventing stale plaintext Preferences data from being restored or backed up, with regression
coverage for the Preferences-only case. ADR-0005 now documents static-registry hydration, its
independence from access history, and the explicit scrub-only exception.

*Revised before approval:* Durable hydration again includes the legacy API-key migration source,
while boot now waits for reconciliation before migrating it into secure storage and scrubbing both
plaintext copies. Added native-style coverage for Preferences-only recovery, strengthened stale-key
cleanup coverage, and aligned ADR-0005 with the ordered migration contract.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `hydrationKeys` includes `legacyAiUserApiKey`, despite that key’s plaintext-scrub invariant.
  Because `hydrateApiKey()` and `hydrateDurableStorage()` run concurrently—and `hydrateApiKey()`
  skips legacy cleanup when a secure key exists—a stale Preferences copy can be restored into
  `localStorage` and left there; exclude scrub-only keys from durable hydration or guarantee ordered
  cleanup, and cover this case.
* Active ADR-0005 still documents `managedKeys` and the boot-time key-touch dependency,
  contradicting the new static-registry architecture and preserving the exact obsolete invariant
  this change removes. Update its Decision and Consequences to match the implementation.
* `web/src/lib/storage.ts:21-23` excludes `legacyAiUserApiKey`, but that key is a migration source,
  not merely scrub-only: after WebView eviction, Preferences may hold the only surviving API key,
  and `hydrateApiKey()` can no longer recover it. Include it in durable reconciliation and ensure
  migration consumes the restored value before scrubbing both plaintext copies.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084073210) · 2026-07-26
15:11:41 UTC</sub>

### 758b0ef8837d — [P3][architecture] `lazyIdbDatabase` exposes a `version` param but its `upgrade` handler can never migrate — the versioning is decorative

**Issue**

```ts
export function lazyIdbDatabase(dbName, storeName, version = 1) { …
  openDB(dbName, version, { upgrade(db) {
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
  }});
```

The signature advertises a `version` knob, but `upgrade` ignores
`oldVersion`/`newVersion`/`transaction` and only ever creates one store idempotently. A caller that
bumps `version` to add a store or migrate data has no hook to do so — the abstraction promises
schema versioning it doesn't deliver. Both current callers pin `version` at 1
(`secureStorage.ts:28`, `folderSave.ts:24`), so the parameter is presently inert but misleading.

**Fix**

Removed the misleading schema-version parameter and pinned the single-store helper to IndexedDB
version 1. Updated both callers and added a unit assertion that preserves the explicit
single-version contract.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084375014) · 2026-07-26
16:32:30 UTC</sub>

### 07ba7d401102 — [P4][architecture] `mirror` wraps an already-`string` value in `String(value)` — dead defensive cast

**Issue**

```ts
function mirror(key: string, value: string) {
  … Preferences.set({ key, value: String(value) })
```

`value` is typed `string`; `String(value)` can never change it. It's a leftover from a looser
signature and reads as if the parameter might not be a string, which is misleading.

**Fix**

Forwarded the already-string `mirror` value directly to Capacitor Preferences, preserving the
helper’s actual input contract and existing fire-and-forget behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084377077) · 2026-07-26
16:33:02 UTC</sub>

### 9a9ea386a2cc — [P4][architecture] `requestPersistentStorage` lives in `secureStorage` but is a generic IndexedDB-persistence concern

**Issue**

`navigator.storage.persist()` asks the browser not to evict *any* of the origin's IndexedDB — it
protects `splotch-fs` (folder handles) just as much as `splotch-secure`. Housing it in
`secureStorage` (and calling it from `settings.hydrateApiKey`, line 273) frames a whole-origin
concern as a secrets-only one, so a future reader looking for "do we request persistent storage?"
won't find it near the folder-save DB it also guards.

**Fix**

Moved the origin-scoped persistence request into the shared IndexedDB module while preserving its
guards and non-blocking API-key boot call. Updated affected mocks and added coverage for best-effort
persistence and non-awaited hydration.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084377367) · 2026-07-26
16:33:07 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 4d56cd02a03d — [P3][architecture] Auto-clear/dismiss lifecycle policy lives in the banner component, not the install state module

**Issue**

Per `.claude/rules/svelte.md`: "Shared state lives in `src/lib/state/*.svelte.ts`. Components read
state and call setters; they never own shared state." The banner owns a genuine policy decision —
*when* an ignored install prompt should auto-dismiss (`shownAtStroke + STROKES_BEFORE_AUTO_CLEAR`,
then call `dismissInstall()`):

```ts
if (canvasState.strokeCount < shownAtStroke + STROKES_BEFORE_AUTO_CLEAR) return;
parting = true;
dismissInstall();
```

The stroke-count-based auto-dismiss is install-lifecycle logic (it mutates persisted dismissal),
sitting in a component alongside the presentation. `shownAtStroke` bookkeeping is duplicated
conceptually with the state module's `SETTLED_IN_STROKES` gating.

**Fix**

Moved the relative five-stroke baseline and persisted auto-dismiss decision into install state,
while keeping interaction guards and parting animation in the banner. Added focused unit coverage
and an Android-like Playwright flow covering reveal, parting, persistence, and exit.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/install-banner.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086069673) · 2026-07-27
00:11:08 UTC</sub>

### 833ec8affccc — [P1][architecture] `coloringBookState` stores four URLs that are pure functions of `(page, orientation)`, kept in sync by a manual re-invocation effect

**Issue**

`overlayUrl`, `chalkUrl`, `colorSheetUrl`, `nightSheetUrl` are all derivable from `overlayPage` +
orientation via the existing `pageImage`/`pageChalkImage`/`pageColorImage`/`pageNightImage`
accessors. `setOverlayPage` snapshots all four:

```ts
coloringBookState.overlayUrl = pageImage(page, orientation);
coloringBookState.chalkUrl = pageChalkImage(page, orientation);
coloringBookState.colorSheetUrl = pageColorImage(page, orientation);
coloringBookState.nightSheetUrl = pageNightImage(page, orientation);
```

Because orientation can change after selection, the component needs a dedicated effect to re-push
the snapshot:

```ts
$effect(() => {
  if (coloringBookState.overlayPage) setOverlayPage(coloringBookState.overlayPage, orientation);
});
```

…

**Fix**

Normalized coloring-book state to retain only the selected page and paper orientation, with all four
asset URLs computed by exported accessors. Orientation changes now update the stored paper
orientation directly, preserving locked-paper behavior while keeping every asset variant
synchronized.

*Revised before approval:* Updated ADR-0052’s catalog section to document that coloring-book state
stores only the selected page and orientation while deriving all four asset URLs through accessors.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `docs/adrs/0052-dark-mode-theme-tokens.md:100` still says `coloringBook.svelte.ts` tracks
  `nightSheetUrl` alongside `colorSheetUrl`; update the ADR to document that all asset URLs are
  derived from the selected page and orientation.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086071429) · 2026-07-27
00:11:28 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### 96ae65091117 — [P2][architecture] `light-fill-cli` tests exercise the CLI through import side effects and match error strings, making them brittle

**Issue**

The suite runs the CLI by mutating `process.argv`, calling `vi.resetModules()`, and dynamically
`import()`-ing `bin/gen-coloring-fills.mjs` purely for its top-level side effects:

```js
async function runCli(...args) {
  process.argv = ['node', 'gen-coloring-fills.mjs', ...args];
  vi.resetModules();
  return import('../bin/gen-coloring-fills.mjs');
}
```

Failure is then asserted by string-matching a thrown message:
`.rejects.toThrow('1 render(s) failed.')` (lines 124, 193). This couples the test to (a) the module
having no idempotent entry point — eleven `vi.mock` calls plus `vi.resetModules` are needed to
re-run it — and (b) the exact prose of a log/throw string that is not a stable contract.

**Fix**

Wrapped the generator's executable body in an exported `run(argv)` that takes its args as a
parameter and returns `{ failed, shipped }`, with an `import.meta.url`/`process.argv[1]` guard
preserving standalone CLI behavior (same output, still exits nonzero on render failures). The test
suite now statically imports `run` and calls it directly, so the `process.argv`/`vi.resetModules()`
re-import dance is gone and the two failure cases assert a rejection plus a structural fact
(untouched shipped bytes, exhausted retries) instead of the CLI's exact error prose.

*Revised before approval:* Addressed all three review points on 5421630441bf. (1) `run()` now throws
an exported `RenderFailuresError` carrying the failure count instead of calling `fail()` (which was
`console.error` + `process.exit(1)`, leaving the main-module guard's `.catch` dead in production);
the guard catches it and exits 1. (2) Both failure tests capture the rejection and assert
`toBeInstanceOf(RenderFailuresError)` plus `err.failed === 1`, restoring the count coverage the old
message-string assertion carried. (3) The main-module guard uses
`pathToFileURL(process.argv[1]).href` (the repo's existing form in scripts/lint-token-styles.mjs)
instead of the percent-encoding-unsafe template literal — verified empirically that the old form
evaluates false and the new one true under a path containing a space. Verification: test:asset-gen
116/116 passed, npm run check 0 errors, eslint clean on both files, and the CLI still self-executes
via `npm run gen:coloring-fills` (prints the arg error, exits nonzero) while a plain import does not
execute `run()`.

*Revised before approval:* Addressed both review points on 7f26fd94d877. (1) Rewrote the
MAX_ATTEMPTS comment in tools/asset-gen/lib/cli.mjs: the old claim that "a bin/ entry point does its
work at import time" became false once gen-coloring-fills.mjs (verified by grep as its only
consumer) gained an exported run(); it now states the actual reason — the retry budget is a
pipeline-level tuning value read from one place by the generator, its tests, and any future gated
loop. (2) The main-module catch now prints `err.message` only for RenderFailuresError (the expected
rejected-renders exit) and the error object itself otherwise, restoring the stack that unexpected
sharp/readFile/Gemini SDK failures used to print via the top-level-await unhandled rejection.
Verified end-to-end: `npm run gen:coloring-fills -- --bogus` throws a TypeError inside run() and now
prints the full ERR_PARSE_ARGS_UNKNOWN_OPTION stack through the guard while exiting nonzero; a
scratch check confirmed the RenderFailuresError branch still prints message-only. Gates:
test:asset-gen 116/116 passed, npm run check 0 errors, eslint clean on all touched files.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `run()` never throws a typed error in production: on render failures it calls `fail()` from
  `lib/paths.mjs`, which is `console.error` + `process.exit(1)`. The rejection the tests await
  exists only because the suite's `vi.mock('../lib/paths.mjs')` replaces `fail` with
  `throw new Error(message)`, so the `.catch(...)` in the `import.meta.url` guard of
  `tools/asset-gen/bin/gen-coloring-fills.mjs:272` is dead for that path and the returned `failed`
  field is always 0. Have `run()` throw an exported typed error carrying the count (e.g.
  `class RenderFailuresError extends Error { failed }`) instead of calling `fail()`, and have the
  main-module guard catch it and exit 1.
* The two failure tests in `tools/asset-gen/tests/light-fill-cli.test.mjs:140` and `:207` now assert
  only `rejects.toBeInstanceOf(Error)`, which drops the failure-count coverage the old
  `'1 render(s) failed.'` string carried — the two-page test at :135 (one page fails, one passes)
  would still pass if a regression made *both* pages fail, and either test would pass on an
  unrelated `TypeError` thrown anywhere in `run()`. Assert the thrown typed error's `failed === 1`
  in both, as the finding's `result.failed === 1` proposal intended.
* The main-module guard
  `import.meta.url === \`file://${process.argv[1]}\``(`tools/asset-gen/bin/gen-coloring-fills.mjs:272`) compares a percent-encoded URL against a raw path, so any repo path containing a space or non-ASCII character makes the guard silently false —`npm
  run
  gen:coloring-fills`would then do nothing and exit 0. Use the repo's existing form,`import.meta.url
  === pathToFileURL(process.argv[1]).href`(as in`scripts/lint-token-styles.mjs`).
* `tools/asset-gen/lib/cli.mjs:19-21` still justifies MAX_ATTEMPTS living in `lib/` with "a bin/
  entry point does its work at import time, so importing a constant out of one runs the whole CLI" —
  that is now false for `gen-coloring-fills.mjs`, the only bin that consumes it, and the test now
  imports that bin directly. Update the comment to state the actual current reason.
* The main-module catch in `tools/asset-gen/bin/gen-coloring-fills.mjs:285-288` prints only
  `err.message`, so any unexpected error (sharp/readFile/Gemini SDK failures) now loses the full
  stack that the previous top-level-await unhandled rejection printed. Print the error object itself
  for anything that is not a `RenderFailuresError`.

**Supervisor note** — the deepest review of the run so far, and two of the five catches are worth
reading on their own merits. The first is a fix that *would have looked correct and tested*: `run()`
reported failures through `fail()` (`console.error` + `process.exit`), so the rejection the new
tests awaited existed **only** because the suite mocked `fail` into a throw — the production
`.catch` was dead and the returned `failed` was always 0. A green suite was the evidence for a path
that could not happen outside the test. The third catch is a genuine latent bug the finding never
asked about: `file://${process.argv[1]}` compares a percent-encoded URL against a raw path, so
`npm run gen:coloring-fills` would silently no-op and exit 0 under any repo path containing a space.
The implementer verified that one empirically under a spaced path rather than reasoning about it.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086723743) · 2026-07-27
02:36:14 UTC</sub>

### ccae3b56f992 — [P2][organization] 2.4 MB `idea-14/warp-both.json` is a raw per-tile coordinate dump that dwarfs its report — prune or summarize

**Issue**

`warp-both.json` is a 2.4 MB intermediate scan dump — per-page, per-theme, per-tile grid data with
absolute machine paths (`/home/user/Splotch/…`). It is the single largest non-image file in the
folder and accounts for most of the ~198k lines of JSON here. It is a regenerable intermediate of
`warp-scan.mjs`, not evidence a reviewer reads; the report's conclusion ("4 genuinely warped pages")
is a handful of page names. Committing it bloats the repo and embeds absolute paths that are
meaningless on any other machine.

**Fix**

Deleted `tools/asset-gen/ideas-exploration/idea-14/warp-both.json`, a 2.4 MB raw per-tile
displacement dump that regenerates from `idea-14/code/warp-scan.mjs`, shrinking the research archive
from 66 MB to 63 MB. One correction to the brief's verification, which does not change the outcome:
`grep -rl "warp-both"` actually matches three files, not one — besides `report.md`'s "Files" bullet,
`code/analyze-warp.mjs` mentions it in a `// Run:` comment and `ideas-review.html` embeds that same
source verbatim, so neither is a live load or link and nothing breaks.

*Revised before approval:* Updated the `idea-14/report.md` "Files" bullet so it no longer advertises
the deleted `warp-both.json` as a present artifact — it now states the scan JSON is an uncommitted
2.4 MB regenerable intermediate and gives the `code/warp-scan.mjs --theme both --out DIR` command to
recreate it. Kept the bullet rather than dropping it so the exploration's output stays documented.
Also confirmed no other stale reference: `idea-14/meta.json` has no artifact list, and
`ideas-review.html` does not embed that bullet (its only `warp-both` hit is the still-accurate usage
comment inside embedded `analyze-warp.mjs` source), so no dashboard regeneration was needed.
`npm run format:check` (Prettier + dprint) passes on the reflowed Markdown.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `tools/asset-gen/ideas-exploration/idea-14/report.md:121` still lists
  ``* `warp-both.json` — full per-tile displacement fields for all 188 raws`` in its "Files"
  section, so the report now advertises an artifact that no longer exists. Update that bullet to
  state the scan JSON is a regenerable intermediate produced by
  `code/warp-scan.mjs --theme both --out DIR` and is not committed (or drop the bullet).

**Supervisor note** — a deletion is the one fix shape where "nothing else references it" has to be
established rather than assumed, and here the implementer corrected the finding's own verification:
`grep -rl "warp-both"` matches three files, not the one the brief claimed. It then classified each
(a docs bullet — the real straggler the reviewer also caught; a `// Run:` usage comment that stays
accurate; and the dashboard's verbatim embed of that comment) rather than treating the extra hits as
either breakage or noise. That is the right handling for a delete.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087350878) · 2026-07-27
04:42:52 UTC</sub>

### 7e32bc49ac3b — [P2][organization] Committed 5.2 MB `ideas-review.html` is fully regenerable from `build-review.mjs` + the `meta.json` files

**Issue**

`ideas-review.html` is a build product: `build-review.mjs` re-derives it from every
`idea-N/meta.json` plus the evidence webp/png (which are themselves already committed). The 5.2 MB
HTML re-encodes all those images as inline base64 — a second copy of already-committed assets — and,
as the previous finding shows, it goes stale the moment `build-review.mjs`'s hardcoded strings
change. It is the biggest single file in the section.

The finding proposed either (a) gitignore it and document `node build-review.mjs` as the one-step
regen, or (b) keep it committed for zero-friction browser viewing but mark it generated and treat it
as needing a regen — noting "the current state (committed, silently stale) is the worst of both."

**Fix**

Added a `<!-- Generated by build-review.mjs — do not hand-edit -->` header to the HTML template in
`build-review.mjs` and regenerated the committed `ideas-review.html` so the marker is visible to
anyone opening the raw file; the README's review step now states the file is generated output that
must be regenerated (not hand-edited) whenever the builder or any `idea-N/meta.json` changes. The
regenerated dashboard differs from the previous commit by exactly that one line, and a repeat run
reproduces it byte-for-byte.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — I initially read this as under-delivering, since the headline is about
5.2 MB of duplicated base64 and the fix leaves all 5.2 MB in place. Checking the finding's own text
settled it: it offered (a) and (b) as equally defensible and set its verification as "**either**
`.gitignore` lists `ideas-exploration/ideas-review.html` and it's untracked, **or** the README/file
header states it is generated and it matches a fresh `node build-review.mjs` run." Route (b) is
taken and that criterion is met exactly, including the byte-for-byte regen check. The file size was
never the defect — "committed *and* silently stale" was, and that is resolved.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087398469) · 2026-07-27
04:52:22 UTC</sub>

### 48d98ab06a19 — [P3][organization] Full-resolution `.webp` outputs committed *inside* `code/` directories (idea-8, idea-9)

**Issue**

Every other idea keeps evidence images at the idea root and downsized (≤560 px per the README layout
contract at line 135), and reserves `code/` for scripts, patches, and small JSON. These two
full-resolution generated images live inside `code/`, breaking the "code/ holds code" convention and
smuggling large binaries past the ≤560 px evidence norm. They read as leftover generation output
that was never moved or downsized.

**Fix**

Deleted both misfiled full-res webps rather than downsizing them into the idea root — each is
byte-for-byte the same take as an existing 560 px evidence image
(idea-8/after-night-conditioned.webp; the right panel of idea-9/dragon-light-pair-after.webp), so
promoting them would have committed exact duplicates. Dropped the now-dangling idea-8/meta.json
"code" entry and the two report.md prose bullets, and regenerated ideas-review.html as the folder
README requires after a meta.json change — which also removes 50 lines of mangled binary the
dashboard was dumping into a `<pre>` block from reading that webp as UTF-8.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — a delete is only safe if the evidence it removes exists elsewhere, so
I checked the two files the fix claims supersede these rather than taking the claim on faith. Both
are present at the idea roots (`idea-8/after-night-conditioned.webp`, 14 KB;
`idea-9/dragon-light-pair-after.webp`, 22 KB), so no unique evidence was lost — the deleted
`ant-wide.night.conditioned.fullres.webp` and its idea-9 counterpart were redundant full-res takes.

Worth noting the incidental win, which nobody asked for and which is arguably better than the fix
itself: because these binaries sat in `code/`, the dashboard builder was treating them as source and
dumping ~50 lines of mangled binary into a `<pre>` block on the review page. Removing them fixes a
visible rendering defect that no finding had caught.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087445807) · 2026-07-27
05:01:39 UTC</sub>

### 7759dd1760c1 — [P4][organization] Absolute machine paths (`/home/user/Splotch/…`) baked into committed JSON evidence

**Issue**

`warp-both.json` (and likely other scan dumps) records absolute paths like
`/home/user/Splotch/web/static/coloring/creatures/dragon-tall.outline.webp`. These are
environment-specific, meaningless on another contributor's machine, and a minor privacy/portability
smell in committed evidence.

**Fix**

Stripped the `/home/user/Splotch/` prefix from the four `chalk`/`night` path values in
`motif-registry-final.json`, making them repo-relative so this archival evidence file no longer
leaks the build machine's absolute path. Structure, keys, and all other fields are untouched; the
grep for `/home/user/` under `tools/asset-gen/ideas-exploration --include=*.json` now returns
nothing.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — this edits `code/motif-registry-final.json`, the same file whose
`bubbles-after` block was restored two findings ago (faff32b0aa95) specifically so the bleed-through
strip stays reproducible, so it was worth checking for a cross-finding interaction that no gate
covers. `motif-strip.mjs:49` uses an entry's `chalk`/`night` value **verbatim** when present
(`e.chalk ? e.chalk : join(COLORING_DIR, …)`) and silently `continue`s on a miss, so a path change
there could have quietly emptied the re-render.

It did not, and the reason is worth recording: those four values point at
`.coloring-samples-dark/chalk/shapes/rectangle-wide.webp` and siblings — a transient generation
scratch directory that is not in the repo. They resolved to nothing before this fix too (the
absolute prefix pointed at the same absent path), so portability is strictly improved and nothing
was lost.

**Correcting my own earlier note.** On faff32b0aa95 I wrote that the restored strip is "reproducible
from the committed registry rather than surviving as an unexplained binary." That was too strong.
The registry block does preserve the strip's provenance and labels — which is the real gain, and it
is genuinely better than an unlabelled PNG — but the *inputs* it names were never committed, so the
strip cannot actually be re-rendered from a clean checkout. The committed
`strips/motif-bubbles-after.png` remains the only copy of that evidence, which makes the reviewer's
insistence on restoring it byte-identically more important than I credited at the time, not less.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087868016) · 2026-07-27
06:09:49 UTC</sub>

### 53341419c780 — [P2][architecture] Red-team HTML report built inline; model-eval's equivalent was extracted to lib

**Issue**

`model-eval-run.mjs` cleanly delegates report generation to `lib/model-eval-report.mjs`
(`buildReport(...)`), keeping the runner about running. The sibling `redteam-run.mjs` instead
carries ~150 lines of report machinery — inline HTML, a full `<style>` block, escaping, data-URI
embedding — mixed into the runner. Two near-identical tools diverge in structure, and the redteam
runner is much harder to read as a result.

**Fix**

Moved the redteam report machinery (`esc`, `dataUri`, `outputCell`, `rowHtml`, `sectionHtml`,
`writeReport`, and the shared `verdict`) out of `scripts/redteam-run.mjs` into a new
`scripts/lib/redteam-report.mjs`, exposed as `buildReport({ runId, outDir, base, results })` with
`outDir` threaded explicitly instead of closed over, so the runner mirrors how `model-eval-run.mjs`
delegates to its lib module. Pure code move — I confirmed the generated `report.json`/`report.html`
are byte-identical to the pre-change output for the same results array (all four outcome shapes plus
an escaped `detail`).

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the detail that makes this a real extraction rather than a file split:
`outDir` was previously *closed over* by the inline functions and is now threaded as an explicit
parameter. That is the actual work in lifting code out of a runner — implicit ambient state becomes
an argument — and it is where such a move usually goes wrong, by capturing a stale value or silently
depending on module-load order.

The byte-identical check is also scoped correctly: **all four outcome shapes plus an escaped
`detail`**, rather than one happy-path render. Escaping is exactly the path that survives a careless
move by looking fine on output containing no special characters.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088245710) · 2026-07-27
06:59:47 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### 185c348b9df5 — [P3][architecture] `webOnlyBooks` is app-domain logic sitting in the "generic helpers" file

**Issue**

```js
export const webOnlyBooks = (books) =>
  books.filter((book) => !(book.platforms ?? ['web', 'mobile']).includes('mobile'));
```

This encodes the app's book-platform filtering rule (mirroring `booksForPlatform()` in
`src/lib/state/books.ts`) and directly contradicts the file's own header ("App-specific logic stays
in the script that owns it"). Only two scripts use it (`check-assets.mjs`,
`strip-native-assets.mjs`), both native-asset concerns.

**Fix**

Moved `webOnlyBooks()` unchanged into the purpose-named `scripts/lib/book-assets.mjs` helper and
updated both asset scripts to use it, keeping the app-side complement contract beside the predicate.

*Revised before approval:* Updated ADR-0017 to describe shared script helpers without a stale fixed
count, removed `webOnlyBooks` from `utils.mjs` ownership, and documented its `book-assets.mjs`
complement contract.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `docs/adrs/0017-cross-platform-node-scripts.md:30-37` still says `scripts/lib/` has three shared
  modules and lists `webOnlyBooks` as a `utils.mjs` export; update the active ADR to describe
  `book-assets.mjs` and remove the stale utils ownership.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091946235) · 2026-07-27
13:29:33 UTC</sub>

### 09ac4ea000c5 — [P3][architecture] `spawnViteServer` doesn't cover the dev-with-visible-output case, so `cloud-tunnel.mjs` re-implements it and can orphan vite

**Issue**

`spawnViteServer` exists specifically to run vite in a detached group so `stop()` can't orphan the
esbuild grandchild — but it hardcodes `stdio: ['ignore','ignore','inherit']` and only merges `env`.
`cloud-tunnel.mjs:63` needs stdout inherited and a `TUNNEL_HOST` env, so it hand-rolls
`spawn('npx', ['vite','dev',...])` — reintroducing the exact npx-wrapper + non-detached shape the
helper warns against ("wrapper spawns (`npx vite`) would add another layer … a plain child.kill()
can orphan the process that holds the port"). The one consumer that most needs the anti-orphan
guarantee bypasses it.

**Fix**

Updated `spawnViteServer` to accept environment, command, and stdout options, then migrated every
non-default caller. The cloud tunnel now preserves visible Vite output while invoking the helper’s
group-aware stop path during shutdown, preventing orphaned Vite/esbuild processes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092220188) · 2026-07-27
13:53:37 UTC</sub>

### 40b7c837434b — [P4][architecture] Point generators live inside the Playwright app-driver module

**Issue**

The file header scopes the module to "dev-server lifecycle, page setup, and the UI gestures … the
app needs," but the bottom third is pure geometry (parametric circle/arc/zigzag point lists) with no
Playwright dependency. Mixing a stateless math concern into a browser-driving module means a script
wanting only the geometry pulls in the whole Playwright surface.

**Fix**

Moved the reusable stroke-point generators into a dedicated geometry module and updated each script
consumer to import them directly, leaving the app driver focused on browser automation.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092625200) · 2026-07-27
14:30:08 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### a6bb7b585d56 — [P3][architecture] `fail()` (console.error + process.exit) lives in `paths.mjs`, unrelated to path resolution

**Issue**

`paths.mjs` is documented as path/tree resolution but exports the process-terminating `fail()`,
which bin scripts import *from paths*, coupling an exit side-effect to the pure constants module.
Proposed moving `fail` to `lib/cli.mjs` (or `log.mjs`) and updating the imports.

**State at triage (2026-07-27):** Unresolved and slightly worse than at the pin. `fail` is still in
`lib/paths.mjs:40-43`, imported by 16 `bin/` scripts, `legacy/retouch-line-art.mjs:37`, **and now
also** `lib/cli.mjs:2` and `lib/gemini.mjs:2` (both created since f934d43, both of which had to
reach into paths for it). `lib/cli.mjs` exists as the shared CLI-helper module (arg parsers,
`MAX_ATTEMPTS`), so the finding's proposed destination is no longer hypothetical — `fail` is the one
…

**Fix**

Moved `fail` from the path utility into the CLI helper and repointed every active caller. Updated
both Vitest mocks to preserve real CLI exports while keeping failure paths throwable in tests.

*Revised before approval:* Applied Prettier’s canonical import formatting to the three CLI files
flagged by the driver, allowing the existing `fail` relocation to satisfy the repository format gate
without changing behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100497213) · 2026-07-28
05:55:30 UTC</sub>

## PR [\#589](https://github.com/KyleMit/Splotch/pull/589) — Drain audit-deferred decision docs: implement the triaged fixes (2026-07-28)

### Finding 4 of 15 — `scripts/lib/utils.mjs` grab-bag of unrelated concerns — ✅ FIXED

**Decision doc:** `utils-grab-bag.md` (verdict FIX) · **Priority:** P2

#### What changed

`scripts/lib/utils.mjs` (21 exports mixing process helpers, Playwright, Maestro, networking, release
parsing) is split into five focused modules, with every function body moved verbatim:

* `scripts/lib/proc.mjs` — the process/exec/repo-root core (`ROOT`, `run`, `capture`, `fail`,
  `isMain`, `hasCommand`, `sleep`, `runId`, …, 14 exports)
* `scripts/lib/net.mjs` — `waitForUrl`
* `scripts/lib/playwright.mjs` — `chromiumExecutablePath`
* `scripts/lib/maestro.mjs` — `maestroPath` / `maestroInstalled`
* `scripts/lib/frontmatter.mjs` — `parseFrontmatter`, `writeFileDeep`, `compareSemverDesc`

All ~55 importers across `scripts/`, `scripts/perf/`, `scripts/audit-burndown/`, `scripts/lib/`, and
`tools/asset-gen/` updated (mechanical import-line changes; the one non-mechanical edit is
`undo-scenarios.test.mjs`, where the single utils mock necessarily splits into playwright + proc
mocks). `utils.test.mjs` split into `proc.test.mjs` + `frontmatter.test.mjs` with no test case lost.
Docs/skills referencing utils.mjs were updated through their `.ruler/` sources with mirrors
regenerated: ADR-0017's module list, the `testing` and `fix-audits` skills, and `scripts/`
orientation. The historical reference in ADR-0062 stays, per the doc.

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE, no blocking findings.** It traced every
one of the 21 former exports to its destination module, verified all importers resolve each symbol
from the correct module, confirmed bodies are verbatim from HEAD (including the post-pin
`hasCommand` and throwing `parseFrontmatter` fixes the stale draft patch lacked), and proved the
ruler drift gate is satisfied by emulating CI's exact staged-index filter (zero drift; `ruler:apply`
was a no-op). One informational nit: `ruler:check` exits non-zero on any dirty working tree by
design — pre-existing behavior, not caused by this change.

#### Verification

`test:scripts` 167/167 · `ruler:check` in sync · `test:unit` 768/768 · `test:asset-gen` 120/120 ·
driver smoke 6/6 · full Playwright E2E suite exit 0 (166 passed outright; a handful of engine specs
were flaky-on-retry under sandbox load — they pass in isolation on both the clean and changed tree,
and an earlier control run on clean HEAD showed the same load sensitivity, so this is environmental,
not diff-caused). Acceptance grep: only ADR-0062's historical line still says `utils.mjs`, exactly
as the doc requires.

#### Drained

Deleted `docs/audit-deferred/decisions/utils-grab-bag.md` and its stale draft patch
`p2-architecture-utils-mjs-is-a-grab-bag-mixing-generic-playwright-releas.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103220925) · 2026-07-28
10:56:11 UTC</sub>
