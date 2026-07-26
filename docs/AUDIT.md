# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

## Source: Code audit — Gestures / Svelte actions / native plugins

## Summary

22 findings across the gesture actions and native plugins. The concentration is in
**`dragToClear.ts`** (10 findings) — an 285-line action carrying a JS-choreographed exit animation,
two magic-number sets, a too-long `onPointerDown`, duplicated distance/cleanup logic, and redundant
drag-state — and in **cross-action duplication**: `pinchTextZoom` re-rolls the `createPinchZoom`
accumulator, three actions each hand-roll the same ghost-click guard, and six copies of the
empty-catch `setPointerCapture` idiom. `launchGuard` has doubled pruning logic and unused option
surface; `pencilEraser` floats an uncaught promise. `deviceLock.ts`, `pinchZoom.svelte.ts`, and
`modalDialog.svelte.ts` are largely clean (only minor notes). No code was changed — report only.

## Source: Code audit — Storage / persistence

## Source: Code audit — Server / API backend

### [P4][maintainability] csp-report's caps and formats are undiscoverable from the CSP header source

**File(s):** `web/src/routes/api/csp-report/+server.ts:7-17`; cross-ref
`web/src/lib/server/securityHeaders.ts:28-29,39` — pinned at SHA f934d43

#### Problem

The receiver's accepted Content-Types (`application/csp-report`, `application/reports+json`,
`application/json`) and the `report-uri /api/csp-report` +
`Reporting-Endpoints: csp="/api/csp-report"` directives that *drive* it live in two files with no
link between them. The path `/api/csp-report` is a literal string in `securityHeaders.ts` (28, 39)
and the route folder name; nothing ties the producer (CSP header) to the consumer (route). A rename
of the route silently drops all CSP telemetry with no failing test.

#### Proposed solution

Export the endpoint path as a shared constant (e.g. `CSP_REPORT_PATH = '/api/csp-report'` in a
shared module) and reference it from `securityHeaders.ts` (interpolating into the CSP directive +
`Reporting-Endpoints`). The route folder can't be a variable, but a `securityHeaders.test.ts`
assertion that the CSP `report-uri` equals `CSP_REPORT_PATH` closes the drift gap.

#### Verification

`securityHeaders.test.ts` gains an assertion linking the CSP directive to the constant;
`grep -n "/api/csp-report"` shows the constant plus the route folder only.

---

### [P4][consistency] `report` builds Retry-After manually-shaped via `throttled` but other size/format caps use raw responses

**File(s):** `web/src/routes/api/report/+server.ts:56-60,73,89,104` — pinned at SHA f934d43

#### Problem

Within `report`, the 429 uses the shared `throttled()` (good), but the 400/502/503 hand-build
`json({ ok:false, error }, { status })` inline three times with slightly different messages. It's
the same `{ ok:false, error }`-with-status pattern repeated; combined with the shape-inconsistency
finding, `report` would be the cleanest place to demonstrate a single `fail(status, error)` helper
(three call sites collapse).

#### Proposed solution

After introducing `fail()` (see the P1 shape finding), rewrite report's three inline
`json({ ok:false, error }, { status })` calls as `fail(400, '…')`, `fail(503, '…')`,
`fail(502, '…')`. Pure readability/consistency once the helper exists.

#### Verification

`npm run test:api:smoke` covers report's validation + unconfigured path.

---

### [P5][readability] `requireEffectiveGenerationKey` reads as a getter but throws

**File(s):** `web/src/lib/server/generationAuthorization.ts:58-63` — pinned at SHA f934d43

#### Problem

`requireEffectiveGenerationKey(authorization): string` throws
`error(500, 'Server is missing GEMINI_API_KEY')` when the managed key is absent. The two-step API —
`authorizeGenerationRequest` then a separate `requireEffectiveGenerationKey` at the call site
(generate-image:115) — splits "am I authorized" from "is the server actually configured to serve
me," which is easy to forget to call. The name is fine (`require…` implies it may throw), but the
split responsibility is the smell: authorization succeeds returning a managed result whose
`effectiveKey` may be `undefined`, deferring the real failure to a second call.

#### Proposed solution

Either fold the managed-key presence check into `authorizeGenerationRequest` (return a
`Response`/error there so an authorized result always carries a usable `effectiveKey: string`),
narrowing the union so `requireEffectiveGenerationKey` disappears; or keep the split but document
why (BYOK must not require the server key) at the function. Given BYOK always has a key and managed
always needs `GEMINI_API_KEY`, checking it inside authorize for the managed branch is clean and
removes a call the handler must remember.

#### Verification

`generationAuthorization.test.ts` updated: a managed request with no `GEMINI_API_KEY` yields the 500
(or a `Response`) directly from `authorizeGenerationRequest`. `npm run check`.

---

### [P5][consistency] Provider result `kind` vocab (`refusal`/`error`) differs from classifier `kind` vocab (`safety`/`empty`)

**File(s):** `web/src/lib/server/ai/provider.ts:14-20`;
`web/src/lib/server/ai/geminiSafety.ts:10-13`; `web/src/lib/drawing/aiImageResponse.ts:1-5` — pinned
at SHA f934d43

#### Problem

Three adjacent layers name the same outcomes with three vocabularies:

* classifier: `'image' | 'safety' | 'empty'`
* provider: `'image' | 'refusal' | 'error'`
* client: `'image' | 'safety' | 'throttled' | 'error'`

`safety` (classifier) maps to `refusal` (provider) maps back to `safety` (client); `empty`
(classifier) maps to `error` (provider). The gemini adapter (`gemini.ts:78-82`) exists mostly to
translate one vocab into the other. The renaming across a two-hop path is cognitive overhead and
invites mismapping.

#### Proposed solution

Align the discriminants. Either the classifier adopts `refusal`/`error` to match the provider seam
(then `gemini.ts` just forwards `classified` when `kind !== 'empty'` without renaming), or the
provider adopts `safety` to match classifier and client. Pick the client-facing vocab (`safety`) as
canonical since it's the contract users of the API care about.

#### Verification

`geminiSafety.test.ts` / `gemini.test.ts` updated to the unified `kind` names; `npm run check`;
generate-image still maps to 422/502 correctly.

---

That's 25 findings, ordered P1→P5. All line numbers verified against SHA `f934d43`. The strongest
structural themes: shared helpers that already exist (`http.ts`) should absorb the duplicated
content-type/body-cap/error-shape logic; the rate-limit **key strings** and **budgets** plus
**header names**, **status codes**, and **env-var names** should each become one referenced symbol
instead of scattered literals; and the client/server response contracts should share types so drift
is a compile error.

## Source: Code audit — PWA / service worker

### [P2][platform-branching] Install-prompt module branches on `isNative()` at runtime where it could be a build-time exclusion

**File(s):** `web/src/lib/state/install.svelte.ts:82-120` (module-load listeners +
`initInstallPrompt`); `web/src/routes/+page.svelte:164-167` — pinned at SHA f934d43

#### Problem

The entire install feature is dead in the native build (the Capacitor shell is "already installed"),
yet it ships in the native bundle and is gated purely at runtime:

```ts
if (browser && !isNative()) {
  window.addEventListener('beforeinstallprompt', (e) => { ... });
  window.addEventListener('appinstalled', markInstalled);
}
```

plus `initInstallPrompt()` re-checks `isNative()` (line 104) and the caller *also* guards
`if (!isNative())` (`+page.svelte:164`). CLAUDE.md states: "The `CAPACITOR=true` env var … is the
single signal for all web-vs-native branching. Do not add runtime platform branches that could be
build-time branches instead." `isNative()` cannot tree-shake; `__IS_CAPACITOR__` (the literal
declared in `app.d.ts:24`) can, letting Rollup drop the whole module from the native bundle.

#### Proposed solution

Guard the module-load side effects and `initInstallPrompt`'s early return on the compile-time
literal instead of `isNative()`: `if (browser && !__IS_CAPACITOR__)`. Then the triple-guarding
(`+page.svelte` caller, `initInstallPrompt`, listener block) collapses to one build-time branch and
the native bundle drops the code. Same treatment for the `updates.ts` PWA module (see next finding).

#### Verification

`CAPACITOR=true npm run build:cap` then grep the native bundle for `beforeinstallprompt` /
`splotch-install-dismissed` — should be absent. Web build + `install.svelte.test.ts` still pass
(tests already stub `isNative`; swap to a `__IS_CAPACITOR__` define in vitest.config or keep the
runtime `isNative` fallback inside the build-time branch).

---

### [P2][platform-branching] `updates.ts` ships in the native bundle instead of being build-excluded

**File(s):** `web/src/lib/pwa/updates.ts:58-99` (`serviceWorkerSupported`, `initPWAUpdates`,
`registerDeferredServiceWorker`); `web/src/routes/+page.svelte:57-60,164-165` — pinned at SHA
f934d43

#### Problem

`VitePWA` is excluded from the native build (`vite.config.ts:97-99`), so `/sw.js` never exists there
— yet all of `updates.ts` is still compiled into the native bundle and is only kept dormant at
runtime via `import.meta.env.DEV` / `serviceWorkerSupported()` checks and the caller's
`if (!isNative())` (`+page.svelte:59,164`). This is registration/version-check machinery that is
provably dead on native. Like the install module, it should be dropped at build time via
`__IS_CAPACITOR__`, not merely skipped at runtime.

#### Proposed solution

Early-return `initPWAUpdates`/`registerDeferredServiceWorker` on `if (__IS_CAPACITOR__) return;`,
and drop the redundant `!isNative()` caller guards in `+page.svelte`. Because `__IS_CAPACITOR__` is
a compile-time literal, Rollup eliminates the bodies (and their transitive imports) from the native
build.

#### Verification

`CAPACITOR=true npm run build:cap`; grep native bundle for `SKIP_WAITING` / `version.json` — absent.
Web build unchanged; `updates.test.ts` unaffected (it drives the exported functions directly with
DEV toggled).

---

### [P2][duplication] `'SKIP_WAITING'` service-worker message type is an ungreppable magic string split across producer, config, and (implicit) SW

**File(s):** `web/src/lib/pwa/updates.ts:193`; comments at `updates.ts:44-47,199-204`;
`web/vite.config.ts:101-125` — pinned at SHA f934d43

#### Problem

The SW control protocol hinges on one string:

```ts
sw.postMessage({ type: 'SKIP_WAITING' });
```

The workbox-generated SW listens for this exact value, the vite.config comment
(`registerType: 'prompt'` … "activates it via SKIP_WAITING message") describes it, and the recovery
comment references it — but nothing binds them. A typo or a rename on either side silently breaks
all updates with no type error and no test failure (the test asserts the literal
`{ type: 'SKIP_WAITING' }`, so it would pass against a matching typo). This is the single most
load-bearing string in the update lifecycle and it is un-discoverable.

#### Proposed solution

Export a named constant `export const SW_SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;`
(or a `SW_MESSAGE.SKIP_WAITING` enum) from a small `web/src/lib/pwa/messages.ts`, and post it by
reference. Reference the constant name in the vite.config comment so the SW-side coupling is
greppable.

#### Verification

`grep -rn SKIP_WAITING web/src` should find one definition + one use. Update the test to import the
constant instead of re-typing the literal, so a rename can't drift.

---

### [P2][complexity] `checkForUpdates` is a 70-line function wrapping a nested `activateWaitingSW` state machine

**File(s):** `web/src/lib/pwa/updates.ts:160-229` (whole function); nested closure `176-210` —
pinned at SHA f934d43

#### Problem

`checkForUpdates` mixes four concerns in one function: the `'deferred'`/`'activating'` guard
(162-169), the registration lookup + `update()` (171-174), a 35-line nested `activateWaitingSW`
closure that owns its own recovery-timer/`controllerchange` state machine (176-210), and the
waiting-vs-installing dispatch (212-225). The nested closure captures `registration`-adjacent state
and is re-created on every call. This is hard to read and impossible to unit-test in isolation (it's
reachable only through `checkForUpdates`).

#### Proposed solution

Extract to module scope: `function activateWaitingSW(sw: ServiceWorker): void` (it already depends
only on `canvasState`, `refreshState`, `ACTIVATION_RECOVERY_MS`). Then `checkForUpdates` reads as a
flat sequence: guard → lookup → `if (registration.waiting) activateWaitingSW(...)` → installing
branch. Consider a second helper `function onInstalledActivate(registration)` for the installing
branch.

#### Verification

`updates.test.ts` exercises this via `checkForUpdates`; behavior is unchanged so the suite is the
regression net. `npm run check` confirms the extracted signature.

---

### [P2][duplication] `manualMode()` and `installDeviceOs()` duplicate device-family sniffing with subtly different results

**File(s):** `web/src/lib/state/install.svelte.ts:48-69` (`isIosSafari`, `installDeviceOs`,
`manualMode`) — pinned at SHA f934d43

#### Problem

Two functions branch over the same iOS/Android device families to slightly different vocabularies:

```ts
export function installDeviceOs(): InstallDeviceOs { // ios | android | desktop
  if (isIosDevice()) return 'ios';
  if (isAndroidBrowser()) return 'android';
  return 'desktop';
}
function manualMode(): InstallMode { // ios | android | none
  if (isIosSafari()) return 'ios';
  if (isAndroidBrowser()) return 'android';
  return 'none';
}
```

They disagree on iOS: `installDeviceOs` uses `isIosDevice()` (any iOS), `manualMode` uses
`isIosSafari()` (real Safari only). A reader can't tell whether that divergence is intentional or a
bug. The near-identical shape invites "fixing" one to match the other and silently breaking the
in-app-browser guard.

#### Proposed solution

Compute the device family once (`installDeviceOs()`), and derive `manualMode` from it plus the
Safari refinement — e.g. `manualMode` returns `'ios'` only when
`installDeviceOs() === 'ios' && isIosSafari()`, `'android'` when `=== 'android'`, else `'none'`. Add
a one-line WHY comment on the iOS divergence so the difference is documented rather than accidental.

#### Verification

`install.svelte.test.ts` covers iOS-Safari→`ios`, iOS-Chrome→`none`, Android→`android`,
desktop→`none`; all must still pass.

---

### [P2][architecture] InstallBanner reaches into another component's DOM by a hard-coded element id for its exit animation

**File(s):** `web/src/lib/components/InstallBanner.svelte:52-66` (`bannerExit`), specifically line
54 — pinned at SHA f934d43

#### Problem

```ts
const target = document.getElementById('parentHelpButton')?.getBoundingClientRect();
```

The banner's "shrink into the Parent Help button" animation depends on a magic string id owned by a
*different* component (`ParentHelpButton`). If that component renames or removes the id, the
transition silently degrades to the `dy = 120` fallback with no error and no test coverage of the
coupling. This cross-component DOM reach-through is exactly the kind of implicit coupling that rots.

#### Proposed solution

Expose the id as a shared constant (e.g. `export const PARENT_HELP_BUTTON_ID = 'parentHelpButton'`
in a UI-ids module or on the ui state), consumed by both `ParentHelpButton.svelte` and here, so a
rename is a compile-time break. Longer term, prefer passing the target rect/ref through shared state
rather than a global `getElementById`.

#### Verification

`grep -rn parentHelpButton web/src` should resolve to one definition + two references. Manually:
draw past the auto-clear threshold and confirm the pill still flies into the Parent Help button.

---

### [P3][naming] `refreshState` machine (`idle`/`activating`/`deferred`) is under-documented and the states aren't self-describing

**File(s):** `web/src/lib/pwa/updates.ts:35,162-169,176-210` — pinned at SHA f934d43

#### Problem

The core update lifecycle is a 3-state variable named `refreshState` with values
`'idle' | 'activating' | 'deferred'`. The actual SW lifecycle (waiting → SKIP_WAITING posted →
`controllerchange` → reload, with a "reload owed but ink present" branch) maps onto these names
non-obviously: `'deferred'` means "controllerchange already happened but a reload is owed until the
canvas next goes empty," which no reader would infer from the name. The transitions are scattered
across the top-of-function guard and the nested closure.

#### Proposed solution

Rename to something intent-revealing (`updateReload: 'none' | 'activating' | 'owed'`) and add a
short state-transition comment block at the declaration enumerating the four transitions.
Alternatively model it as a tiny typed transition table. No behavior change — this is legibility of
the central state machine.

#### Verification

`updates.test.ts` (which references states only through behavior) still passes;
`resetUpdatesForTests` updated to the new name.

---

### [P3][maintainability] Unexplained `100` ms magic delay and un-removed `statechange` listener in the installing branch

**File(s):** `web/src/lib/pwa/updates.ts:217-225` — pinned at SHA f934d43

#### Problem

```ts
registration.installing.addEventListener('statechange', function(this: ServiceWorker) {
  if (this.state === 'installed' && registration.waiting) {
    setTimeout(() => {
      if (registration.waiting) activateWaitingSW(registration.waiting);
    }, 100);
  }
});
```

Three smells: (a) the `100` ms is a bare magic number with no WHY — unlike the sibling
`ACTIVATION_RECOVERY_MS` which is a named, commented constant; (b) the `statechange` listener is
never removed, so repeated `checkForUpdates` calls while a worker installs stack duplicate listeners
on the same worker; (c) the `function (this: ServiceWorker)` style clashes with the arrow-function
style used everywhere else in the file and only exists to read `this.state` when
`registration.installing.state` was available.

#### Proposed solution

Name the delay (`const WAITING_SETTLE_MS = 100` with a comment on why a tick is needed after
`installed`), add `{ once: true }` to the listener (a worker transitions to `installed` once), and
switch to an arrow reading `registration.installing?.state`.

#### Verification

Existing test "rechecks canvas state after an installing worker takes control"
(`updates.test.ts:298-335`) uses `advanceTimersByTimeAsync(100)`; keep it in sync with the named
constant.

---

### [P3][type-safety] `BeforeInstallPromptEvent` requires a cast because `WindowEventMap` isn't augmented

**File(s):** `web/src/lib/state/install.svelte.ts:21-24,83-86` — pinned at SHA f934d43

#### Problem

The event type is declared locally, then the listener callback receives a plain `Event` and casts:

```ts
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;   // cast
```

The `as` cast defeats type-checking at the exact boundary where the shape matters, and
`'appinstalled'` is likewise untyped. `app.d.ts` already augments global types (File System Access
API), so this is the established pattern for exactly this situation.

#### Proposed solution

Move the interface to `app.d.ts` and augment
`interface WindowEventMap { beforeinstallprompt: BeforeInstallPromptEvent }`. The listener parameter
then types automatically and the cast disappears; `deferredPrompt` keeps its precise type.

#### Verification

`npm run check` passes with the cast removed; the listener body still type-checks
`e.prompt`/`e.userChoice`.

---

### [P3][architecture] Auto-clear/dismiss lifecycle policy lives in the banner component, not the install state module

**File(s):** `web/src/lib/components/InstallBanner.svelte:34-47` (auto-clear `$effect`) — pinned at
SHA f934d43

#### Problem

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

#### Proposed solution

Move the "should auto-clear" decision into `install.svelte.ts` (e.g. a derived/`autoClearDue`
computed from stroke count, or an `armAutoClear(shownAtStroke)` helper), leaving the component to
render `parting` and run the exit animation. Keep the animation (`PARTING_MESSAGE_MS`, `bannerExit`)
in the component — only the persistence-affecting policy moves.

#### Verification

Add/keep a unit test in `install.svelte.test.ts` for the auto-clear threshold (currently untested —
it's only reachable through the component). Playwright banner flow still auto-clears after the
threshold.

---

### [P3][duplication] localStorage key strings are re-hard-coded in the test instead of imported

**File(s):** `web/src/lib/state/install.svelte.ts:17-18`;
`web/src/lib/state/install.svelte.test.ts:12-13` — pinned at SHA f934d43

#### Problem

```ts
// install.svelte.ts
const DISMISSED_KEY = 'splotch-install-dismissed';
const INSTALLED_KEY = 'splotch-install-completed';
// install.svelte.test.ts (copy)
const DISMISSED_KEY = 'splotch-install-dismissed';
const INSTALLED_KEY = 'splotch-install-completed';
```

The keys are `const` (unexported) in source and re-typed verbatim in the test. Renaming the source
key would leave the test asserting the old key — the test would keep passing against
`localStorage.getItem(INSTALLED_KEY)` with its stale copy while production writes a different key.
Silent source/test drift on persisted state.

#### Proposed solution

Export the keys from `install.svelte.ts` (they're already a natural public contract for persistence)
and import them in the test. Or centralize install keys with the other storage keys if such a
registry exists.

#### Verification

`grep -rn "splotch-install-" web/src` should show one definition site. Test imports it; a rename now
breaks compilation, not silently.

---

### [P3][maintainability] Hourly update interval is an inline magic number while its siblings are named constants

**File(s):** `web/src/lib/pwa/updates.ts:120-125` — pinned at SHA f934d43

#### Problem

```ts
const updateCheckInterval = setInterval(() => {
  checkForUpdates();
}, 60 * 60 * 1000);
```

This file already names `ACTIVATION_RECOVERY_MS = 10_000` and `STROKES_BEFORE_SW_REGISTER` with
explanatory comments, but the update cadence — arguably the most policy-relevant number in the file,
and referenced in the module header comment ("Update checks run on init, hourly, …") — is an inline
`60 * 60 * 1000`. Inconsistent and un-tunable-by-name.

#### Proposed solution

`export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;` next to the other constants; the header
comment's "hourly" then has a named anchor.

#### Verification

`npm run check`; behavior identical.

---

### [P3][maintainability] Module-global mutable singletons force a test-only `resetUpdatesForTests` export in production code

**File(s):** `web/src/lib/pwa/updates.ts:34-56` — pinned at SHA f934d43

#### Problem

The module keeps three mutable module-scope singletons (`initialized`, `refreshState`,
`registrationScheduled`) and ships a production export whose sole purpose is un-leaking them between
tests:

```ts
export function resetUpdatesForTests() {
  refreshState = 'idle';
  initialized = false;
  registrationScheduled = false;
}
```

A `*ForTests` symbol in the shipped API surface is a code smell — it signals the module's state is
only testable because it exposes its guts. Every new singleton must be remembered here or tests
couple by execution order (the comment admits this).

#### Proposed solution

Two options: (a) accept it as pragmatic but move the reset behind an `import.meta.vitest`/dev-only
guard so it can't be called in prod; or (b) encapsulate the lifecycle in a factory
(`createPWAUpdates()`) that returns the public functions closing over private state — each test
constructs a fresh instance, no reset export needed, and `+page.svelte` holds the single app
instance. Option (b) also removes the `initialized` idempotency singleton (each instance is
naturally single-use).

#### Verification

`updates.test.ts` drops `resetUpdatesForTests` in favor of a fresh factory per `beforeEach`; all
cases pass without the shared-instance caveats.

---

### [P3][readability] InstallBanner mixes `$state` flags with a plain `let` mutated inside an `$effect`

**File(s):** `web/src/lib/components/InstallBanner.svelte:21-25,45-46,52-53` — pinned at SHA f934d43

#### Problem

```ts
let showHint = $state(false);
let busy = $state(false);
let parting = $state(false);
let shownAtStroke: number | null = null;
let exitIntoParentButton = false; // plain let, no $state
```

`exitIntoParentButton` is a plain `let` written inside the auto-clear `$effect` (line 45) and read
in `bannerExit` (line 53); `shownAtStroke` is similarly a non-reactive `let` written in the effect.
It happens to work because `bannerExit` reads at transition time and the effect doesn't depend on
them — but a reader can't tell at a glance which flags are reactive and which aren't, and a future
edit that *renders* off `exitIntoParentButton` would break with no warning. The inconsistency is a
latent trap.

#### Proposed solution

Either make them `$state` (harmless, uniform) or add a one-line comment on each non-`$state` `let`
explaining it's an imperative transition-time latch deliberately kept out of reactivity. Uniformity
is the cheaper fix.

#### Verification

`npm run check`; banner auto-clear + fly-into-button animation still behave.

---

### [P4][duplication] Reload-side-effect pair (`refreshState = 'idle'; window.location.reload()`) is repeated across three lifecycle paths

**File(s):** `web/src/lib/pwa/updates.ts:164-166,184-186` — pinned at SHA f934d43

#### Problem

The "commit the reload" step appears in the `'deferred'` guard (164-166) and in `onControllerChange`
(184-186):

```ts
refreshState = 'idle';
window.location.reload();
```

plus the inverse "defer instead" pair (`refreshState = 'deferred'; return;`) at 181-183. The reload
discipline (always reset state before reloading) is a rule enforced by copy-paste; a future path
that reloads without resetting would strand the state machine.

#### Proposed solution

Extract `function reloadForUpdate() { refreshState = 'idle'; window.location.reload(); }` and
`function deferReload() { refreshState = 'deferred'; }`, and call them from all paths. The invariant
becomes a single definition.

#### Verification

`updates.test.ts` reload-count assertions (e.g. `toHaveBeenCalledTimes(1)`) still hold.

---

### [P4][type-safety] Save-Data `connection` type is cast inline instead of shared

**File(s):** `web/src/lib/pwa/updates.ts:62-65`; duplicated shape in `updates.test.ts:344-352` —
pinned at SHA f934d43

#### Problem

```ts
const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
```

The `NetworkInformation` shape is declared ad-hoc at the use site, and the test re-declares the same
shape when stubbing `navigator.connection`. The non-standard API has no shared type, so the two
definitions can drift and neither is discoverable.

#### Proposed solution

Add a minimal `interface NetworkInformation { saveData?: boolean }` and
`interface Navigator { connection?: NetworkInformation }` augmentation in `app.d.ts` (same pattern
as the File System Access API already there). The cast becomes
`navigator.connection?.saveData === true`.

#### Verification

`npm run check`; `updates.test.ts` Save-Data cases (`skips registration when Save-Data is on`, etc.)
pass unchanged.

---

### [P4][maintainability] `'/sw.js'` and `'/version.json'` paths are magic strings scattered across module and tests

**File(s):** `web/src/lib/pwa/updates.ts:75,147` — pinned at SHA f934d43

#### Problem

`navigator.serviceWorker.register('/sw.js')` (line 75) and `fetch('/version.json', …)` (line 147)
hard-code paths that the build pipeline also owns — `version.json` is emitted by the
`emit-version-json` vite plugin (`vite.config.ts:87-96`) and `sw.js` by VitePWA. These
cross-boundary contracts (build emits ⇄ runtime fetches) live as bare strings on both sides with
nothing binding them, and the test re-types `'/sw.js'` / `'/version.json'` again.

#### Proposed solution

Name them (`const SW_URL = '/sw.js'`, `const VERSION_MANIFEST_URL = '/version.json'`) and, for
`version.json`, reference the constant name in the vite plugin comment so the emit/fetch pair is
greppable. Lower priority than SKIP_WAITING because these paths are more conventional, but the same
discoverability argument applies.

#### Verification

`grep -rn "version.json" web` shows the emit site and the single fetch constant.

---

### [P4][maintainability] Manifest icons are a second source of truth, already drifted from the PWA plugin's asset list

**File(s):** `web/static/site.webmanifest:7-32`; `web/vite.config.ts:112-118` (`includeAssets`,
`manifest: false`) — pinned at SHA f934d43

#### Problem

`VitePWA` is configured `manifest: false` (line 118), so the manifest is authored by hand in
`static/site.webmanifest` and linked from `app.html:47`, while the plugin's `includeAssets`
separately lists icons (`favicon-96x96.png`, `apple-touch-icon.png`) and the manifest references a
different set (`web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`). Two disjoint icon
inventories with no cross-check means a renamed/removed icon breaks install visuals silently
(nothing fails the build). The PWA surface (manifest ⇄ precache ⇄ app.html links) is spread across
three files with no single map.

#### Proposed solution

At minimum, add a comment in `vite.config.ts` (or `static/ICONS-README.md`) pointing at
`site.webmanifest` as the manifest source of truth and enumerating why `manifest: false`. Better: a
small build/test assertion that every manifest icon `src` and every `includeAssets` entry resolves
to a real file in `static/`.

#### Verification

`npm run build`, then confirm each referenced icon exists in the build output; a deleted icon should
fail the added check rather than 404 at install time.

---

### [P4][complexity] `initPWAUpdates` bundles cache-bust URL cleanup, version check, re-registration, and listener wiring in one function (with a redundant `getRegistration`)

**File(s):** `web/src/lib/pwa/updates.ts:95-143` — pinned at SHA f934d43

#### Problem

`initPWAUpdates` does five loosely related things: strips the `?v=` cache-bust param (101-106),
kicks a version-mismatch check (109), calls `checkForUpdates()` (108) *and then* independently calls
`getRegistration()` again to decide whether to re-register (113-118) — two `getRegistration`
round-trips per init — then wires the interval + two listeners (120-135). The `?v=` cache-bust
cleanup is a distinct concern from the SW update lifecycle but shares the function.

#### Proposed solution

Extract `consumeCacheBustParam(): string | null` (the `?v=` strip + `replaceState`) and
`scheduleRepeatVisitReregister()` (the `getRegistration().then` block). `initPWAUpdates` then reads
as a short orchestration list. Optionally have `checkForUpdates` return the registration it looked
up so the second `getRegistration` is avoided.

#### Verification

`updates.test.ts` `initPWAUpdates` describe block (URL strip, cache-bust loop guard, idempotency,
teardown) covers all paths — must stay green.

---

### [P4][readability] `bannerExit` inline transition is ~14 lines of geometry with a duplicated fallback distance

**File(s):** `web/src/lib/components/InstallBanner.svelte:52-66` — pinned at SHA f934d43

#### Problem

`bannerExit` computes a FLIP-style translate from the banner's rect to the Parent Help button's rect
inline in the component script, including a `translateX(-50%)`-restating `css` callback. The
fallback vertical distance `120` is repeated here (57) and in the plain-exit branch
(`fly(node, { y: 120 … })` line 53 and the entrance `y: 120` at line 85) as an unnamed magic number
appearing four times across the file.

#### Proposed solution

Name the travel distance (`const BANNER_FLY_Y = 120`) and reuse it for entrance, plain exit, and the
fallback. Optionally extract the geometry math to a small helper
`flyToElement(node, targetId, fallbackY)` in `lib/actions/` or a local function, keeping the
transition declaration a one-liner. Per `.claude/rules/svelte.md`, non-trivial transition wiring is
a reasonable extraction target.

#### Verification

`npm run check`; visually confirm both exit paths (manual dismiss → plain fly-down; auto-clear →
shrink into button) still animate.

---

### [P5][readability] Deferred-prompt bookkeeping is spread across the listener, `markInstalled`, and `promptInstall`

**File(s):** `web/src/lib/state/install.svelte.ts:45,71-76,86,132-133,144-149` — pinned at SHA
f934d43

#### Problem

`deferredPrompt` is set in the `beforeinstallprompt` listener (86), nulled in `markInstalled` (72),
nulled again in `promptInstall` (133), and its absence re-derives `manualMode()` in three places
(129,141,149). The one-shot lifecycle of the stashed event ("captured → consumed once → gone → fall
back to manual") is real but reconstructing it requires reading all five sites; the "on spent
prompt, drop `oneTap` → manual" fixup is copy-pasted three times.

#### Proposed solution

Add a single private helper `function consumeDeferredPrompt() { deferredPrompt = null; }` and
`function fallBackToManualHint() { if (install.mode === 'oneTap') install.mode = manualMode(); }`,
replacing the three inline `if (install.mode === 'oneTap') install.mode = manualMode()` repetitions.
Centralizes the one-shot semantics.

#### Verification

`install.svelte.test.ts` `promptInstall` cases (accepted / declined / unavailable /
cannot-replay-twice / throws / stale-oneTap) all pass unchanged.

## Source: Code audit — Coloring books

### [P1][duplication] Book id is re-typed as a string argument on every `page()` call, silently generating asset paths on mismatch

**File(s):** `web/src/lib/state/books.ts:92-122` (`page()` factory) and `124-237` (`BOOKS`) — pinned
at SHA f934d43

#### Problem

`page()` takes the book id as its first positional arg, so every entry repeats the enclosing book's
`id` as a bare string:

```ts
{ id: 'farm', name: 'Farm', ... pages: [
    page('farm', 'cat', 'Cat'),
    page('farm', 'cow', 'Cow'),   // 'farm' repeated 6× per book, 48× total
```

The book id lives in two independent places (`Book.id` and each `page(book, …)` call) that must
agree by hand. `page('farm', …)`, `id`, `name`, and the exceptions object are all
strings/loosely-typed positionals, so a copy-paste slip (`page('farm', …)` pasted into the
`dinosaur` block) compiles cleanly and silently emits `/coloring/farm/...` paths under the Dinosaurs
book. Nothing in the type system ties a page to its book.

#### Proposed solution

Bind the book id once. Give `page()` a curried/closure form per book, e.g. a
`defineBook(id, name, platforms, pages: (p) => …)` builder where the inner `page(id, name, opts)`
closes over the book id, or a `book('farm','Farm', ['cat','cow',…])` helper that maps ids→pages.
Then `Book.id` is the single source and `page` can't reference a foreign book. Signature sketch:

```ts
function defineBook(
  id: string,
  name: string,
  platforms: BookPlatform[],
  pages: Array<[id: string, name: string, opts?: PageExceptions]>,
): Book;
```

#### Verification

`npm run test:unit -- books` still green; add a test asserting every `page.images.portrait` in a
book starts with `/coloring/${book.id}/`. Grep confirms the book id literal now appears once per
book, not per page.

---

### [P1][architecture] `coloringBookState` stores four URLs that are pure functions of `(page, orientation)`, kept in sync by a manual re-invocation effect

**File(s):** `web/src/lib/state/coloringBook.svelte.ts:15-47` and
`web/src/lib/components/ColoringBook.svelte:50-54` — pinned at SHA f934d43

#### Problem

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

This is denormalized state maintained by a hand-written sync effect — exactly what `$derived` exists
to eliminate. The URLs can drift from `overlayPage` for one frame, and every new derived asset
variant (a 5th URL) means touching the interface, the `$state` initializer, `setOverlayPage`,
`clearOverlay`, and this effect.

#### Proposed solution

Store only the source-of-truth pair `{ overlayPage, orientation }` in the rune state (add an
`orientation` field set by the same effect, or pass orientation in). Expose the four URLs as
`$derived` (or plain accessor functions the component reads) computed from
`overlayPage`+`orientation`. Delete the sync effect at `ColoringBook.svelte:50-54` — the derivations
react automatically. `DrawingCanvas` already re-derives theme on top, so it keeps working.

#### Verification

`coloringBook.svelte.test.ts` should still pass after adapting to the new shape; assert that
changing orientation updates all four URLs without an intervening `setOverlayPage` call. Manual:
rotate with an applied page and confirm the overlay swaps.

---

### [P1][maintainability] Asset filename grammar (suffixes + portrait→tall / landscape→wide) is scattered as string literals with no single mapping

**File(s):** `web/src/lib/state/books.ts:100-118` (`page()`), `264-271`
(`thumbPath`/`chalkThumbPath`) — pinned at SHA f934d43

#### Problem

The whole asset naming convention documented in the 44-line header exists only as inline literals
repeated across the module:

```ts
portrait: `/coloring/${book}/${id}-tall.outline.webp`,
landscape: `/coloring/${book}/${id}-wide.outline.webp`,
...
if (night.includes('portrait')) nightImages.portrait = `/coloring/${book}/${id}-tall.night.webp`;
```

The `portrait ⇒ "tall"`, `landscape ⇒ "wide"` mapping is hardcoded eight times inside `page()`; the
suffixes `.outline.webp`/`.light.webp`/`.night.webp`/`.chalk.webp`/`.thumb.webp`/`.chalk.thumb.webp`
are spread across `page()`, `thumbPath`, and `chalkThumbPath`. Renaming any asset variant (or the
`/coloring/` root) means hunting down every literal, and there is nothing greppable that says
"orientation slug." `thumbPath` and `chalkThumbPath` encode the same suffix knowledge as regexes
independently of `page()`.

#### Proposed solution

Introduce named constants/maps at the top of the module and build every path through one helper:

```ts
const COLORING_ROOT = '/coloring';
const ORIENTATION_SLUG: Record<BookOrientation, 'tall' | 'wide'> = {
  portrait: 'tall',
  landscape: 'wide',
};
const VARIANT_SUFFIX = {
  outline: 'outline.webp',
  light: 'light.webp',
  night: 'night.webp',
  chalk: 'chalk.webp',
  thumb: 'thumb.webp',
  chalkThumb: 'chalk.thumb.webp',
} as const;
function assetPath(
  book: string,
  id: string,
  o: BookOrientation,
  v: keyof typeof VARIANT_SUFFIX,
): string;
```

`thumbPath`/`chalkThumbPath` then derive from the same `VARIANT_SUFFIX` table instead of standalone
regexes.

#### Verification

`books.test.ts`/`coloringBook.svelte.test.ts` (which assert exact literal paths) still pass — proves
the generated strings are byte-identical. Grep for `-tall.` / `-wide.` returns only the constant
definitions.

---

### [P2][duplication] `page()` builds `nightImages` and `chalkImages` with two copy-pasted filter+branch blocks

**File(s):** `web/src/lib/state/books.ts:92-122` (`page()`) — pinned at SHA f934d43

#### Problem

The night and chalk stanzas are structurally identical, differing only in the suffix and the
exception list:

```ts
const night = ALL_ORIENTATIONS.filter((o) => !nightExcept.includes(o));
const chalk = ALL_ORIENTATIONS.filter((o) => !chalkExcept.includes(o));
const nightImages: Partial<Record<BookOrientation, string>> = {};
if (night.includes('portrait')) nightImages.portrait = `/coloring/${book}/${id}-tall.night.webp`;
if (night.includes('landscape')) nightImages.landscape = `/coloring/${book}/${id}-wide.night.webp`;
const chalkImages: Partial<Record<BookOrientation, string>> = {};
if (chalk.includes('portrait')) chalkImages.portrait = `/coloring/${book}/${id}-tall.chalk.webp`;
if (chalk.includes('landscape')) chalkImages.landscape = `/coloring/${book}/${id}-wide.chalk.webp`;
```

Two orientations × two variants = four near-identical `if` lines plus two parallel scaffolds; adding
a third optional variant would triple the block.

#### Proposed solution

Extract a helper that turns an "except" list + variant into a
`Partial<Record<BookOrientation,string>>` (using the `ORIENTATION_SLUG`/`VARIANT_SUFFIX` tables from
the P1 grepability finding):

```ts
function optionalVariant(
  book: string,
  id: string,
  except: BookOrientation[],
  v: 'night' | 'chalk',
): Partial<Record<BookOrientation, string>>;
```

Then `page()` is `nightImages: optionalVariant(book, id, nightExcept, 'night')`,
`chalkImages: optionalVariant(book, id, chalkExcept, 'chalk')`.

#### Verification

Existing exact-path unit tests stay green; the "every page ships night+chalk for both orientations"
test in `books.test.ts:14-21` still passes.

---

### [P2][maintainability] The state field set is hand-enumerated in four places that must stay in lockstep

**File(s):** `web/src/lib/state/coloringBook.svelte.ts:15-55` — pinned at SHA f934d43

#### Problem

The same five fields are written out four times: the `ColoringBookState` interface (15-31), the
`$state({...})` initializer (33-39), every-field assignment in `setOverlayPage` (41-47), and
every-field null-out in `clearOverlay` (49-55):

```ts
export function clearOverlay() {
  coloringBookState.overlayUrl = null;
  coloringBookState.chalkUrl = null;
  coloringBookState.colorSheetUrl = null;
  coloringBookState.nightSheetUrl = null;
  coloringBookState.overlayPage = null;
}
```

Adding or removing a tracked URL means editing all four; forgetting `clearOverlay` leaves a stale
URL after a clear. This is the same denormalization pressure as the P1 architecture finding, and
mostly disappears if the URLs become derived. Absent that, the reset is duplicated boilerplate.

#### Proposed solution

Define a single `EMPTY_STATE` constant and reset with
`Object.assign(coloringBookState, EMPTY_STATE)` in `clearOverlay`, initialize the `$state` from the
same constant, so the field list has one authoritative definition. (Preferred: fold the four URLs
into `$derived` per the architecture finding, leaving only `{ overlayPage, orientation }` to reset.)

#### Verification

`coloringBook.svelte.test.ts:30-38` (clearOverlay nulls all five) still passes.

---

### [P2][complexity] `bookAssetPaths` inlines four labeled `flatMap` blocks that read as named sub-lists

**File(s):** `web/src/lib/state/books.ts:288-323` (`bookAssetPaths`) — pinned at SHA f934d43

#### Problem

The function is one ~35-line expression whose four segments (`lineArt`, `lightFills`, `nightFills`,
`chalkOutlines`) each need a comment to explain what they are, and two of them repeat the same
inline orientation loop with a cast:

```ts
const nightFills = book.pages.flatMap((page) =>
  (['portrait', 'landscape'] as BookOrientation[])
    .map((o) => page.nightImages[o])
    .filter((p): p is string => !!p));
const chalkOutlines = book.pages.flatMap((page) =>
  (['portrait', 'landscape'] as BookOrientation[])   // same block, chalkImages
    ...
```

The comments are doing the naming that extracted functions would do for free.

#### Proposed solution

Extract each segment to a small named function — `lineArtPaths(book)`, `lightFillPaths(book)`,
`nightFillPaths(book)`, `chalkOutlinePaths(book)` (the last two share
`presentVariantPaths(book, 'night'|'chalk')`) — and have `bookAssetPaths` compose them plus the
thumbnails. `bookAssetPaths` becomes a short assembly of self-describing calls.

#### Verification

`bookAssetPaths` tests in both test files (exact set membership + thumb counts,
`books.test.ts:59-108`) stay green.

---

### [P2][architecture] The `armHoverOnMouseMove` gesture action is defined inline instead of in `lib/actions/`

**File(s):** `web/src/lib/components/ColoringBook.svelte:75-88` — pinned at SHA f934d43

#### Problem

A Svelte action wiring pointer listeners lives inline in the component:

```ts
function armHoverOnMouseMove(node: HTMLElement) {
  function onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') hoverArmed = true;
  }
  node.addEventListener('pointermove', onMove);
  return { destroy: () => node.removeEventListener('pointermove', onMove) };
}
```

`.claude/rules/svelte.md` states: "Complex gestures and dialog wiring are Svelte actions in
`src/lib/actions/` … not inline component logic." This "arm hover only after a real mouse move"
pattern is exactly the pointer-activation gotcha the rules call out, and it's a reusable primitive
(any tile grid that opens under the pointer wants it), not ColoringBook-specific.

#### Proposed solution

Move it to `src/lib/actions/armHoverOnMouseMove.ts` as a reusable action that takes a callback or
toggles a returned rune. Keep the closure over `hoverArmed` by having the action accept a setter
param: `use:armHoverOnMouseMove={() => (hoverArmed = true)}`.

#### Verification

`npm run check`; visually confirm a tap on a hover-capable touchscreen doesn't leave a tile stuck in
hover chrome (the behavior this guards).

---

### [P2][design-tokens] Spacing and font sizes are raw px while colors/radii/durations use tokens

**File(s):** `web/src/lib/components/ColoringBook.svelte:190,194-198,206-228,254-269,341-372` —
pinned at SHA f934d43

#### Problem

The stylesheet correctly tokenizes color (`var(--surface-2)`, `var(--brand)`), radius
(`var(--radius-md)`), and motion (`var(--duration-*)`), but hardcodes every spacing and type value
even though `--space-1…8` and `--font-size-xs…3xl` exist:

```ts
.coloring-book-content { padding: 32px; }
.coloring-book-content h2 { margin: 0 0 20px 0; font-size: 24px; }
.coloring-book-header { gap: 12px; margin-bottom: 20px; }
.coloring-back-button { width: 36px; height: 36px; padding: 8px; }
.coloring-grid { gap: 12px; }
```

`--font-size-md` is used for the tile label (line 369), proving the tokens are in scope — so the raw
`font-size: 24px` on the h2 and the 8/12/20/32px spacing are inconsistent with the design system the
same file otherwise follows.

#### Proposed solution

Map each raw value to the nearest `--space-*` / `--font-size-*` token (e.g.
`padding: var(--space-8)` for 32px, `font-size: var(--font-size-2xl)` for the h2,
`gap: var(--space-3)` for 12px). Where an exact token doesn't exist, that's a signal to reconcile
with the design skill's scale rather than invent a px value.

#### Verification

`/dev/design` styleguide + visual diff of the picker before/after; values should be visually
unchanged if tokens are chosen to match.

---

### [P3][dead-code] `PLATFORMS` is exported and re-exported but never consumed; the catalog uses raw string literals instead

**File(s):** `web/src/lib/state/books.ts:76`, `124-237`;
`web/src/lib/state/coloringBook.svelte.ts:13` — pinned at SHA f934d43

#### Problem

`export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;` is defined and re-exported
through `coloringBook.svelte.ts`, but a repo-wide grep shows zero consumers — the `BOOKS` entries
all write `platforms: ['web', 'mobile']` as raw strings, and `booksForPlatform`/callers pass the
literals `'web'`/`'mobile'` (`ColoringBook.svelte:22`). The constant that exists to prevent
stringly-typed platform values is bypassed by the very data it was meant to guard.

#### Proposed solution

Either delete `PLATFORMS` (and its re-export) as dead code, or actually use it:
`platforms: [PLATFORMS.WEB, PLATFORMS.MOBILE]` and
`booksForPlatform(isNative() ? PLATFORMS.MOBILE : PLATFORMS.WEB)`. Given `BookPlatform` already
type-checks the literals, deletion is the simpler win.

#### Verification

Remove it, run `npm run check` + `npm run build:cap` — no reference breaks. Grep for `PLATFORMS`
returns nothing.

---

### [P3][type-safety] `Book.id`, `ColoringPage.id`, and `page()`'s `book`/`id`/`name` are bare `string`

**File(s):** `web/src/lib/state/books.ts:51-74,92-97` — pinned at SHA f934d43

#### Problem

`id: string` on both `Book` and `ColoringPage`, and the three positional strings on
`page(book, id, name, …)`, are an open type over a closed, hand-maintained set.
`BOOKS.find((b) => b.id === 'space')` (used in tests and `ColoringBook`) has no compile-time
guarantee `'space'` exists, and `setOverlayPage`/lookup code can't be narrowed. Combined with the P1
duplication of book id, nothing prevents a typo'd id from type-checking.

#### Proposed solution

At minimum brand the ids (`type BookId = string & { readonly __book: unique symbol }`) or, better,
derive a `BookId` union from the catalog (`type BookId = typeof BOOKS[number]['id']`) and type
lookups against it. If a full union is impractical because the catalog is data-first, a runtime
`bookById(id): Book | undefined` accessor at least funnels lookups through one greppable function.

#### Verification

`npm run check`; a deliberately misspelled `BOOKS.find(b => b.id === 'spce')` should fail to
type-check (or the accessor returns `undefined` at a single guarded call site).

---

### [P3][duplication] Four near-identical page accessors differ only by field and null-handling

**File(s):** `web/src/lib/state/books.ts:244-261` — pinned at SHA f934d43

#### Problem

```ts
export function pageImage(page, orientation) {
  return page.images[orientation];
}
export function pageColorImage(page, orientation) {
  return page.colorImages[orientation];
}
export function pageNightImage(page, orientation) {
  return page.nightImages[orientation] ?? null;
}
export function pageChalkImage(page, orientation) {
  return page.chalkImages[orientation] ?? null;
}
```

Four one-line functions, two guaranteed (`Record`) and two optional (`Partial<Record>`), each just
indexing a field. The asymmetry (string vs string|null) is meaningful but the repetition is
boilerplate that grows with each new asset variant.

#### Proposed solution

Keep the four public names (they read well at call sites and encode the return-type contract), but
note this is a symptom of the data model: a single
`variants: Record<VariantKind, Partial<Record<BookOrientation,string>>>` per page with one accessor
`pageAsset(page, kind, orientation): string | null` would collapse them. If the
guaranteed-vs-optional distinction is worth keeping, leave as-is but document why four exist. Low
urgency — flag rather than force.

#### Verification

If consolidated, existing accessor-based tests (`coloringBook.svelte.test.ts:49-81`) confirm
behavior parity.

---

### [P3][dead-code] `booksForPlatform`'s `?? ['web', 'mobile']` default is unreachable — every book sets `platforms`

**File(s):** `web/src/lib/state/books.ts:239-242`; every `BOOKS` entry sets `platforms`
(128,142,156,170,184,198,213,227) — pinned at SHA f934d43

#### Problem

```ts
return BOOKS.filter((book) => (book.platforms ?? ['web', 'mobile']).includes(platform));
```

The "omitting the field ⇒ ships everywhere" fallback (also documented in the header, lines 43-44) is
never exercised because all eight books declare `platforms: ['web', 'mobile']` explicitly. The
default is documented behavior with no test and no data path, so it can silently rot (e.g. the
`strip-native-assets` side that must agree may not honor the same default).

#### Proposed solution

Either make `platforms` required on `Book` and drop the `??` (removes a "both" magic literal
duplicated from the header), or keep the optional field and add one catalog entry / unit test that
omits `platforms` to lock the default. Prefer required unless the default is genuinely used.

#### Verification

Make `platforms` required → `npm run check` still passes (all books already set it), confirming the
branch was dead.

---

### [P3][readability] `ALL_ORIENTATIONS` exists but `bookAssetPaths` re-inlines `['portrait','landscape'] as BookOrientation[]` twice

**File(s):** `web/src/lib/state/books.ts:78,304,311` — pinned at SHA f934d43

#### Problem

`const ALL_ORIENTATIONS: BookOrientation[] = ['portrait', 'landscape'];` is defined and used in
`page()`, yet `bookAssetPaths` writes the array literal with an inline cast twice more:

```ts
(['portrait', 'landscape'] as BookOrientation[]).map((o) => page.nightImages[o]);
```

The cast is only needed because the literal isn't the typed constant. Two representations of "all
orientations" can diverge (add a `'square'` orientation and one gets missed).

#### Proposed solution

Reuse `ALL_ORIENTATIONS` in both `flatMap` blocks, dropping the casts. If a third orientation is
ever added, one edit covers `page()` and `bookAssetPaths`.

#### Verification

`npm run check`; `bookAssetPaths` tests unchanged.

---

### [P3][type-safety] The `'light' | 'dark'` theme union is re-typed in `pageThumb` instead of a shared `ResolvedTheme`

**File(s):** `web/src/lib/state/books.ts:279-283`; `web/src/lib/state/appearance.svelte.ts:26` —
pinned at SHA f934d43

#### Problem

`resolvedTheme(): 'light' | 'dark'` and `pageThumb(page, orientation, theme: 'light' | 'dark')` each
spell the union inline; `DrawingCanvas` compares `resolvedTheme() === 'dark'` in several places.
There's no `type ResolvedTheme`, so the two-value theme vocabulary isn't greppable and can't be
extended in one place.

#### Proposed solution

Export `type ResolvedTheme = 'light' | 'dark'` from `appearance.svelte.ts`, have `resolvedTheme`
return it and `pageThumb`'s `theme` param use it.

#### Verification

`npm run check`; grep for `'light' | 'dark'` collapses to the single type definition.

---

### [P3][readability] Header comment claims the module is "plain JS" when it is TypeScript

**File(s):** `web/src/lib/state/books.ts:2-4` — pinned at SHA f934d43

#### Problem

```ts
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
```

The file is `.ts` with interfaces and typed exports throughout — not "plain JS." The intended point
is "no Svelte runes, so Node build scripts can import it," but "plain JS" is factually wrong and
could mislead someone into thinking they can't add types here.

#### Proposed solution

Reword to "intentionally rune-free (no `.svelte.ts`) so Node build scripts … can import it."

#### Verification

Doc-only; read-through confirms accuracy.

---

### [P3][duplication] `hoverArmed = false` reset duplicated across both navigation handlers

**File(s):** `web/src/lib/components/ColoringBook.svelte:89-96` — pinned at SHA f934d43

#### Problem

```ts
function selectBook(book: Book) {
  activeBook = book;
  hoverArmed = false;
}
function goToBooks() {
  activeBook = null;
  hoverArmed = false;
}
```

Every view transition must remember to disarm hover; the coupling ("changing the visible grid resets
hover") is implicit and repeated, so a future third navigation path can forget it and reintroduce
the stuck-hover bug the arming logic exists to prevent.

#### Proposed solution

Route both through a single `showView(book: Book | null)` that sets `activeBook` and always resets
`hoverArmed`, or make `hoverArmed` reset a `$derived`/effect keyed on `activeBook` so it can't be
forgotten. `selectBook`/`goToBooks` become one-liners calling `showView`.

#### Verification

`npm run check`; tap a book tile then back out on a touchscreen and confirm no tile is stuck armed.

---

### [P4][design-tokens] Hardcoded brand RGB `171,113,225` fallback will silently drift from `--brand`

**File(s):** `web/src/lib/components/ColoringBook.svelte:296-298` — pinned at SHA f934d43

#### Problem

```ts
box-shadow: 0 4px 12px rgba(171, 113, 225, 0.25);
box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
```

The rgba line is the documented pre-`color-mix` fallback (same pattern as the label at 365-368), so
it's intentional — but it bakes `--brand`'s literal RGB into the component. If the brand token is
retuned, this fallback keeps the old color on browsers that hit it, and nothing links the two. The
`4px`/`12px` offsets are also raw.

#### Proposed solution

If the compat floor still needs a color-mix fallback (per `docs/COMPATIBILITY.md`), centralize a
`--brand-shadow` token (or a `--brand-rgb` triple) so the literal lives once beside `--brand`;
otherwise drop the fallback if the floor now supports `color-mix` unconditionally. Tokenize the
offsets against the elevation scale.

#### Verification

Check `docs/COMPATIBILITY.md` for whether the color-mix fallback is still required at the current
floor; visual diff of tile hover shadow.

---

### [P4][maintainability] Comment hardcodes "eight full covers" — drifts as the catalog grows

**File(s):** `web/src/lib/components/ColoringBook.svelte:32-34` — pinned at SHA f934d43

#### Problem

```ts
// paints instantly instead of fetching eight full covers on demand.
$effect(() => scheduleIdle(() => prefetchImages(books.map((book) => thumbPath(book.cover)))));
```

There are currently eight books, but the count is derived from `BOOKS`. The comment will silently
lie the moment a ninth book ships, and it also says "full covers" when the code prefetches
`thumbPath(book.cover)` (the thumbnail, not the full cover).

#### Proposed solution

Drop the count and correct "covers" → "cover thumbnails": "…instead of fetching every book's cover
thumbnail on demand."

#### Verification

Doc-only read-through.

---

### [P4][readability] Stale migration comment references a `.js` module that no longer exists

**File(s):** `web/src/lib/state/coloringBook.svelte.ts:1-3` — pinned at SHA f934d43

#### Problem

```ts
// Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
```

The comment justifies the re-export by a `.js` import path from a prior migration. If no source
still imports the `.js` path (the codebase is TS-only per CLAUDE.md), the rationale is historical
noise that misleads a reader into thinking a JS consumer exists.

#### Proposed solution

Verify no `.svelte.js` import remains; if none, reword to state the real reason (this rune module is
the app-facing surface that re-exports the rune-free catalog), or drop the sentence.

#### Verification

Grep `coloringBook.svelte.js` across the repo → if zero hits, the comment is stale.

---

### [P4][design-tokens] Magic breakpoints and modal max-width are unshared literals

**File(s):** `web/src/lib/components/ColoringBook.svelte:183,341` — pinned at SHA f934d43

#### Problem

`max-width: min(920px, calc(100vw - 32px))` and `@media (max-width: 520px)` embed layout constants
with no shared source. Other components almost certainly define their own `520px`/`920px`-ish
breakpoints, so the app's responsive thresholds aren't coordinated and can't be adjusted centrally.

#### Proposed solution

Pull the breakpoint into a shared value (CSS custom media / a documented breakpoint token in the
design system) and the modal max-width into a modal sizing token, per the design skill. At minimum,
name the `520px` threshold consistently with other components.

#### Verification

Grep other components for the same px thresholds to confirm the duplication before consolidating;
visual check at the boundary widths.

---

### [P5][readability] Page-grid column counts are restated across three breakpoints

**File(s):** `web/src/lib/components/ColoringBook.svelte:263-269,341-357` — pinned at SHA f934d43

#### Problem

`.coloring-pages-grid` (2 cols), `.portrait-pages` (3 cols), then the `max-width: 520px` block
resets both back to 2:

```ts
.coloring-pages-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.coloring-pages-grid.portrait-pages { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 520px) {
  .coloring-pages-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }        /* same as base */
  .coloring-pages-grid.portrait-pages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

The non-portrait override inside the media query is a no-op (identical to the base rule), and the
column counts (2/3/2) are scattered magic numbers describing one responsive intent.

#### Proposed solution

Drop the redundant `.coloring-pages-grid` rule inside the media query (base already sets 2), and
express the intent via a single `--page-cols` custom property flipped by orientation/breakpoint, so
`grid-template-columns: repeat(var(--page-cols), minmax(0,1fr))` appears once.

#### Verification

Visual check of the pages grid at desktop portrait/landscape and at ≤520px; column counts unchanged.

## Source: Code audit — Misc lib utilities + Audio

### [P2][architecture] Scatter of platform/device utilities across `lib/` root hurts grepability — group under one folder

**File(s):** `web/src/lib/platform.ts`, `deviceInfo.ts`, `deviceReport.ts`, `orientation.ts`,
`safeArea.ts`, `haptics.ts`, `notchBand.ts` (whole files) — pinned at SHA f934d43

#### Problem

Seven closely-related "what device / platform am I on and how do I adapt to it" modules sit loose in
the `lib/` root, interleaved with unrelated utilities (`idle.ts`, `latestRequest.ts`, `storage.ts`,
`imagePrefetch.ts`, …). They form a natural cluster — `deviceInfo.ts` imports `platform.ts`;
`orientation.ts` imports `platform.ts`; `notchBand.ts` imports `platform`'s `Platform` type;
`safeArea.ts` feeds `notchBand`/`layout`; `haptics.ts` imports `platform.ts`. Someone trying to
answer "where does the app detect iOS / read insets / lock rotation?" has to already know each
filename. The task brief flags grepability/discoverability as a primary theme and this is its
clearest instance.

#### Proposed solution

Move the platform/device cluster into a `web/src/lib/platform/` (or `device/`) barrel:
`platform/detect.ts` (current `platform.ts`), `platform/deviceInfo.ts`, `platform/deviceReport.ts`,
`platform/orientation.ts`, `platform/safeArea.ts`, `platform/haptics.ts`, `platform/notchBand.ts`,
plus an `index.ts` re-export. Update the `architecture` skill's file map and the `$lib/...` import
paths. Colocated tests move with their modules. This is a pure move (no behavior change); ignore the
one-time churn per the brief.

#### Verification

`npm run check` + `npm test` green after the move; `git grep "from '\$lib/platform'"` and friends
resolve; the `architecture` skill map lists the new folder.

---

### [P2][duplication] `Orientation = 'portrait' | 'landscape'` is redeclared in ~8 places

**File(s):** `web/src/lib/notchBand.ts:38`, `web/src/lib/state/layout.svelte.ts:4`,
`web/src/lib/orientation.ts:5` (`OrientationLockType`), plus inline copies in
`web/src/lib/state/books.ts:49`, `state/canvas.svelte.ts:18`, `drawing/engine.ts:258`,
`components/ParentCenter.svelte:60`, `tests/global.d.ts:48` — pinned at SHA f934d43

#### Problem

The literal union `'portrait' | 'landscape'` is defined independently as `Orientation` in
`notchBand.ts` and `layout.svelte.ts`, as `OrientationLockType` in `orientation.ts`, as
`BookOrientation` in `books.ts`, and inlined anonymously in at least four more spots. `notchBand.ts`
even imports `Platform` from `platform.ts` but redefines `Orientation` locally instead of sharing
one. Any change (e.g. adding a `'square'`/`'auto'` case) touches every copy, and there's no single
grep target for "the orientation type."

#### Proposed solution

Export one canonical `export type Orientation = 'portrait' | 'landscape'` from the platform module
(naturally alongside `Platform` in `platform.ts` / the proposed `platform/detect.ts`), and have
`layout.svelte.ts`, `notchBand.ts`, `orientation.ts` (`OrientationLockType = Orientation`),
`books.ts`, `engine.ts`, `canvas.svelte.ts`, and `ParentCenter.svelte` import it. Keep
semantically-distinct aliases (e.g. `BookOrientation`) as `type BookOrientation = Orientation` if
the name adds meaning.

#### Verification

`git grep "'portrait' | 'landscape'"` returns only the single definition (plus deliberate value
literals); `npm run check` passes.

---

### [P2][duplication] Three uncoordinated writers to `<meta name="theme-color">`; NotchBand re-inlines the setter

**File(s):** `web/src/lib/theme.ts:50-54` (`updateThemeColorMeta`),
`web/src/lib/components/NotchBand.svelte:31-34`, `web/src/app.html:24` — pinned at SHA f934d43

#### Problem

`theme.ts` owns a pure setter `updateThemeColorMeta()` that does
`document.querySelector('meta[name="theme-color"]')?.setAttribute('content', …)`, driven by
`appearance.svelte.ts` to reflect the resolved light/dark theme. But `NotchBand.svelte:33` writes
the *same* meta element directly with the active drawing color, re-inlining the exact
`querySelector('meta[name="theme-color"]')?.setAttribute(...)` string rather than reusing a shared
setter:

```js
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', band.themeColor);
```

Two reactive sources fight over one DOM element with no defined precedence (last effect to run
wins), and the selector/attribute logic is duplicated. A future change to the meta mechanism (e.g. a
second meta for `media`) must be made in two places that don't know about each other.

#### Proposed solution

Extract a single low-level `setThemeColorMeta(color: string)` in `theme.ts` and have both
`updateThemeColorMeta` and NotchBand call it, so the DOM write lives in one place. Document the
ownership rule (NotchBand's active-color write is the intended override while drawing; appearance's
resolved-theme write is the baseline) in a comment or ADR reference, since ADR-0052 already notes
"the only JS followers are the theme-color meta and the Notch Band."

#### Verification

`git grep "meta\[name=\"theme-color\"\]"` in `src/` (excluding tests) resolves to one setter;
`appearance.svelte.test.ts` still passes; manual check that drawing color still reaches the
Android-web status bar.

---

### [P2][maintainability] `drawingSound.ts` audio graph is five module-level mutable globals — untestable singleton

**File(s):** `web/src/lib/audio/drawingSound.ts:13-17` (module state), `19-104` (all functions) —
pinned at SHA f934d43

#### Problem

The entire Web Audio lifecycle hangs off module-scope `let`s: `audioContext`, `buffers`,
`loadStarted`, `currentSource`, `currentGain`. Every function mutates them by side effect. There is
no unit test for this file (unlike its neighbors), and there can't easily be one — you can't
construct an isolated instance, reset state between cases, or inject a fake `AudioContext`. It also
means two consumers (the canvas and `SoundSection.svelte`'s preview) share one graph, so a preview
during an active stroke would stomp `currentSource`.

#### Proposed solution

Wrap the state in a factory returning a small object, mirroring `createLatestRequest()`'s pattern:

```ts
export function createDrawingSound(deps?: { audioContext?: () => AudioContext | null }): {
  preload(): void;
  play(speed: number): void;
  stop(): void;
};
```

Export a default singleton (`export const drawingSound = createDrawingSound()`) plus the named
functions for back-compat, or migrate the two callers. This makes the node lifecycle testable
(assert one buffer source per stroke, gain disconnect on stop) and lets the preview own its own
graph.

#### Verification

Add a Vitest suite with a stubbed `AudioContext` asserting: `play` creates exactly one source per
start, `stop` ramps to 0 and disconnects, volume scales with `speed`. Existing `dragToClear.test.ts`
mock of `stopDrawSound` still works.

---

### [P3][duplication] `volumeMultiplier()` re-clamps a value `settings` already clamped, with magic `/ 50`

**File(s):** `web/src/lib/audio/drawingSound.ts:19-21` and `81`;
`web/src/lib/state/settings.svelte.ts:108-111` — pinned at SHA f934d43

#### Problem

```ts
function volumeMultiplier() {
  return Math.max(0, Math.min(settings.soundVolume, 100)) / 50;
}
```

`settings.soundVolume` is already clamped to `0..100` by `clampVolume()` on every read/write, so the
`Math.max(0, Math.min(…, 100))` is dead defensiveness. The `/ 50` is an unexplained magic number —
it means "50 is the authored/normal volume, so 50→1.0×, 100→2.0×", but nothing says so (the
equivalent constant `SOUND_VOLUME_DEFAULT = 50` lives in `settings`). Combined with
`SOUND_VOLUME = 0.2` at line 5, the final gain math `SOUND_VOLUME * volumeMultiplier() * …` is three
magic numbers deep.

#### Proposed solution

Drop the redundant clamp (`return settings.soundVolume / NORMAL_VOLUME`), and name the divisor:
`const NORMAL_VOLUME = SOUND_VOLUME_DEFAULT;` (import from settings) or a local
`const NORMAL_SOUND_VOLUME = 50` with a one-line WHY. Rename `SOUND_VOLUME` (line 5) to something
like `BASE_SCRATCH_GAIN` since it's a base gain, not a "volume" in the settings sense.

#### Verification

`npm run check`; the new drawingSound unit test (above) asserts gain at `soundVolume=50` equals
`BASE_SCRATCH_GAIN` at full speed.

---

### [P3][duplication] User-agent OS/device parsing duplicated between `deviceInfo.ts` and `platform.ts`

**File(s):** `web/src/lib/deviceInfo.ts:64-78` (`osFromUserAgent`), `web/src/lib/platform.ts:38-49`
(`isIosDevice`, `isAndroidBrowser`) — pinned at SHA f934d43

#### Problem

`platform.ts` sniffs the UA for iOS (`/iPad|iPhone|iPod/`) and Android (`/android/i`);
`deviceInfo.ts` independently re-parses the same UA for `Android ([0-9.]+)`,
`(?:iPhone|iPad|iPod).*?OS ([0-9_]+)`, etc. Two modules own UA-regex knowledge, so a UA quirk (e.g.
the iPadOS-masquerades-as-Mac case that `platform.ts` handles at line 42 but `osFromUserAgent` does
not) is fixed in one and missed in the other.

#### Proposed solution

Centralize UA parsing in the platform module: expose the raw sniff helpers plus a
`osLabelFromUserAgent(ua)` and let `deviceInfo.ts` import it, so there's one place that knows how to
read a UA. At minimum, move `osFromUserAgent` next to `isIosDevice`/`isAndroidBrowser` in
`platform.ts`.

#### Verification

`git grep -n "iPhone|iPad|iPod"` in `src/lib` shows UA regexes in one module; `npm run check`.

---

### [P3][performance] `measureSafeAreaInsets()` creates + appends + reflows a probe on every resize/orientation event

**File(s):** `web/src/lib/safeArea.ts:16-37`; caller
`web/src/lib/state/layout.svelte.ts:55-64,68-78` — pinned at SHA f934d43

#### Problem

Each call does `createElement` → `appendChild` → `getBoundingClientRect` (a forced synchronous
layout) → `remove`. `layout.svelte.ts` calls it from `syncViewport`, which is wired to `resize`,
`orientationchange`, and `visibilitychange`. `resize` can fire many times per second during a
drag/rotate animation, so every burst churns DOM nodes and forces a reflow mid-frame — exactly the
kind of jank the `profiling` skill warns about.

#### Proposed solution

Reuse one persistent hidden probe element (create lazily, keep it in the body, never remove it) so
each measurement is just a `getBoundingClientRect` read; or debounce/rAF-coalesce `syncViewport`'s
`resize` handling. The probe can stay `visibility:hidden;pointer-events:none` permanently at zero
cost.

#### Verification

Profile a rotate/resize with the `profiling` harness before/after; assert no forced-reflow spike
from `safeArea`. Insets still resolve correctly on a notched device.

---

### [P3][type-safety] `playDrawSound`'s param is a loose inline type named `movementData` — should share the engine's `DrawSoundData`

**File(s):** `web/src/lib/audio/drawingSound.ts:57`, `80`; `web/src/lib/drawing/engine.ts:96-98`
(`DrawSoundData`), `905` (call site) — pinned at SHA f934d43

#### Problem

```ts
export function playDrawSound(movementData: { speed?: number } = {}) { … const { speed = 0 } = movementData; … }
```

The engine defines `interface DrawSoundData { speed: number }` and always calls
`onDrawSoundCallback({ speed })`, but `playDrawSound` accepts a *different*, looser inline shape
(`speed?` optional, whole arg optional) and re-defaults `speed`. The two definitions can drift
silently, and the name `movementData` overpromises — the object carries only a speed. It reads as a
leftover from a richer former signature.

#### Proposed solution

Export `DrawSoundData` from the engine (or a shared type module) and type the param
`playDrawSound(data: DrawSoundData)`. Rename the param to `data` or destructure directly:
`playDrawSound({ speed }: DrawSoundData)`. Keep the `= { speed: 0 }` default only if
`SoundSection.svelte`'s preview needs a no-arg call — it currently passes
`{ speed: PREVIEW_SPEED }`, so the default is unused and can go.

#### Verification

`npm run check`; grep call sites (`DrawingCanvas.svelte:155`, `SoundSection.svelte:20`) still
typecheck.

---

### [P3][type-safety] `getPlatform()` casts an arbitrary string to `Platform` without validating

**File(s):** `web/src/lib/platform.ts:53-56` — pinned at SHA f934d43

#### Problem

```ts
export function getPlatform(): Platform {
  if (!browser) return 'web';
  return (globalThis.Capacitor?.getPlatform?.() ?? 'web') as Platform;
}
```

`Capacitor.getPlatform()` is typed `string`; the `as Platform` promises it's one of
`'android' | 'ios' | 'web'` with no runtime check. A future Capacitor platform (or a shimmed
environment) would be silently mistyped, and downstream `PLATFORM_LABEL[platform]` / branch logic
would be reasoning about a lie.

#### Proposed solution

Validate:
`const p = globalThis.Capacitor?.getPlatform?.() ?? 'web'; return p === 'android' || p === 'ios' ? p : 'web';`.
This also removes the cast.

#### Verification

`npm run check`; unit test asserts an unexpected platform string collapses to `'web'`.

---

### [P3][type-safety] `PLATFORM_LABEL` typed `Record<string, string>` defeats exhaustiveness against `Platform`

**File(s):** `web/src/lib/deviceInfo.ts:7`, used `24` — pinned at SHA f934d43

#### Problem

```ts
const PLATFORM_LABEL: Record<string, string> = { web: 'Web', ios: 'iOS', android: 'Android' };
```

Keyed by `string`, so TypeScript won't flag a missing platform or a typo'd key, and the
`?? platform` fallback at line 24 silently papers over a gap. The union `Platform` already exists
two imports away.

#### Proposed solution

`const PLATFORM_LABEL: Record<Platform, string> = { web: 'Web', ios: 'iOS', android: 'Android' };`.
Now adding a `Platform` member without a label is a compile error, and the `?? platform` fallback
becomes dead (can drop or keep as belt-and-suspenders).

#### Verification

`npm run check` errors if a `Platform` member is unlabeled.

---

### [P3][naming] `supportsOrientationLock` hides its tablet cutoff behind a bare `600`

**File(s):** `web/src/lib/platform.ts:90-94` — pinned at SHA f934d43

#### Problem

```ts
return Math.min(window.screen.width, window.screen.height) < 600;
```

The `600` is the phone/tablet split (a device with a short side ≥ 600 CSS px is treated as a tablet
that owns its own orientation). It's a load-bearing heuristic explained at length in the doc comment
above, but the actual threshold is an unnamed literal buried in the return, so a reader scanning the
code (not the essay) sees a magic number and grepping for the tablet cutoff finds nothing.

#### Proposed solution

`const TABLET_MIN_SIDE_PX = 600;` (with a one-line WHY pointing at the doc comment) and use it in
the comparison.

#### Verification

`npm run check`; the constant is greppable.

---

### [P3][complexity] `collectDeviceInfo` is a ~40-line function mixing web + native collection

**File(s):** `web/src/lib/deviceInfo.ts:20-60` — pinned at SHA f934d43

#### Problem

The function seeds base fields, then branches into a native path (dynamic-import
`@capacitor/device`, merge OS/model/language, UA fallback) and a web path (display mode, UA OS, full
UA), all inline. The two collection strategies are logically separable but interleaved, and the
`try/catch` + fallback nesting makes the native arm the densest part of the file.

#### Proposed solution

Extract `async function collectNativeDeviceInfo(info: DeviceInfo): Promise<void>` and
`function collectWebDeviceInfo(info: DeviceInfo): void`, leaving `collectDeviceInfo` as the ~10-line
orchestrator (seed → `browser` guard → common screen/viewport fields → branch). Keep the
`__IS_CAPACITOR__` gate at the call site so tree-shaking is unaffected.

#### Verification

`npm run check`; `ReportForm.svelte` still gets the same payload; add a node-env unit test for the
web arm (UA→OS mapping) which currently has none.

---

### [P3][naming] `haptics.ts` web-fallback vibrates for a magic `15` ms

**File(s):** `web/src/lib/haptics.ts:31` — pinned at SHA f934d43

#### Problem

```ts
navigator.vibrate?.(15);
```

`15` is the fallback vibration duration (ms) that's meant to approximate the native
`ImpactStyle.Medium` "click." It's undocumented and un-named; anyone tuning the feel has to know
this line exists.

#### Proposed solution

`const WEB_IMPACT_MS = 15;` at module top with a comment tying it to the native Medium impact it
mimics.

#### Verification

`npm run check`; greppable constant.

---

### [P4][performance] `playDrawSound` calls `preloadDrawSounds()` on every pointermove

**File(s):** `web/src/lib/audio/drawingSound.ts:57-59`; engine call site `drawing/engine.ts:905` —
pinned at SHA f934d43

#### Problem

`onDrawSoundCallback({ speed })` fires on every `pointermove` (engine line 905), and `playDrawSound`
starts with `preloadDrawSounds()`. Preload early-returns on `loadStarted`, but it's still a function
call + branch on the hottest path in the app (every move of every stroke). It reads as defensive
coupling — preload is already triggered from `DrawingCanvas.svelte:215` via `scheduleIdle` and on
the first `pointerdown`.

#### Proposed solution

Move the `preloadDrawSounds()` call into the stroke-start branch (inside `if (!currentSource)`),
where it's needed at most once per stroke, rather than per move. The `if (!ctx || !buffers) return`
guard already handles the not-yet-loaded case.

#### Verification

`profiling` harness shows the per-move path unchanged in behavior; sound still starts on first
stroke of a fresh load.

---

### [P4][maintainability] `orientation.ts` memoizes through a module-level `lastRequested` — hidden global, hard to reset

**File(s):** `web/src/lib/orientation.ts:12`, `27-29` — pinned at SHA f934d43

#### Problem

`let lastRequested` at module scope caches the last requested lock target to skip redundant plugin
calls. Like `drawingSound`'s globals, this is invisible mutable state: it can't be reset for tests,
and a hot-reload / re-entrant scenario carries stale state. There's no unit test for this module
(the notchBand pure layer exists precisely to avoid this pattern, but
`applyDeviceOrientationPreference` keeps the impure state inline).

#### Proposed solution

Either accept it as pragmatic (document why) or lift the pure decision — `settings → target` mapping
and the "changed since last?" check — into a testable helper, leaving only the plugin call impure.
Given `notchBand.ts` set the precedent of a pure decision layer for exactly this file family, a
`resolveOrientationTarget(settings): 'portrait'|'landscape'|'unlocked'` pure function would be
consistent and testable.

#### Verification

`npm run check`; if extracted, a node-env unit test covers the
`lockRotationEnabled × forceLandscape` matrix.

---

### [P4][type-safety] Loose feature-detection casts for `navigator.standalone` and screen-orientation lock

**File(s):** `web/src/lib/platform.ts:29` (`window.navigator as { standalone?: boolean }`),
`web/src/lib/orientation.ts:7-10`, `50` (`LockableScreenOrientation`) — pinned at SHA f934d43

#### Problem

Both files hand-roll ad-hoc structural casts to reach non-standard/optional web APIs:
`(window.navigator as { standalone?: boolean }).standalone`, and
`window.screen.orientation as LockableScreenOrientation | undefined`. These are the classic "the
lib.dom types don't know about this API" casts, scattered and repeated (the `standalone` cast in
particular is the same shape `deviceInfo.ts` and `platform.ts` both need for iOS PWA detection).

#### Proposed solution

Declare the augmentations once in `web/src/app.d.ts` (a `Navigator.standalone?: boolean` and
`ScreenOrientation.lock?/unlock?` global interface merge), so call sites read `navigator.standalone`
and `screen.orientation.lock` without inline casts. This is the idiomatic home given `app.d.ts`
already augments `globalThis.Capacitor`.

#### Verification

`npm run check` with the inline casts removed; behavior unchanged.

---

### [P4][naming] `THEME_COLOR_LIGHT` hardcodes `'#ffffff'` while its dark twin reads from a token

**File(s):** `web/src/lib/theme.ts:30-31` — pinned at SHA f934d43

#### Problem

```ts
const THEME_COLOR_LIGHT = '#ffffff';
const THEME_COLOR_DARK = themes.dark.appBg;
```

ADR-0071 made design tokens the single source of truth and the dark value dutifully reads
`themes.dark.appBg`, but the light value is a hand-typed `'#ffffff'` with a comment saying it
matches "app.html's original white." If `themes.light.appBg` (or app.html's meta) ever changes, this
silently drifts — the exact failure mode ADR-0071 set out to kill.

#### Proposed solution

Source it from the token: `const THEME_COLOR_LIGHT = themes.light.appBg;` (verify that token is
`#ffffff` today). If light theme-color is deliberately app-bg-white rather than paper, name that
intent; otherwise unify with the dark path.

#### Verification

`appearance.svelte.test.ts` still asserts the light meta value; `npm run check`.

---

### [P4][maintainability] `stopDrawSound` disconnects the gain node but never the source node

**File(s):** `web/src/lib/audio/drawingSound.ts:85-95` — pinned at SHA f934d43

#### Problem

```ts
currentSource.stop(now + STOP_RAMP_S);
const gain = currentGain;
currentSource.onended = () => gain.disconnect();
```

On stop, only the `GainNode` is disconnected (via `onended`); the `AudioBufferSourceNode` is stopped
but never explicitly `disconnect()`-ed. A stopped source is GC-eligible once `onended` fires, so
this isn't a hard leak, but the asymmetric cleanup (gain handled, source not) is a lifecycle smell —
and if `onended` never fires (e.g. context already closed), the gain stays connected. One stroke
starts exactly one source + gain, so over a long session this is the only teardown path.

#### Proposed solution

In the `onended` handler disconnect both:
`currentSource.onended = () => { source.disconnect(); gain.disconnect(); }` (capture `source` like
`gain` is captured). Fold this into the `createDrawingSound` factory refactor above and assert it in
the new test.

#### Verification

New drawingSound unit test asserts both nodes disconnected after `stop` + `onended`.

---

### [P4][naming] `deviceInfo.ts` vs `deviceReport.ts` split isn't self-evident from the names

**File(s):** `web/src/lib/deviceInfo.ts`, `web/src/lib/deviceReport.ts` — pinned at SHA f934d43

#### Problem

Two files whose names both say "device + noun" own different halves: `deviceInfo.ts` *collects* a
snapshot (browser/native, client-only), `deviceReport.ts` holds the *shared shape + label ordering +
server-side sanitizer* (dependency-free, used by both client and `/api/report`). Nothing in the
names conveys "collector" vs "shared schema," so a reader looking for where the `DeviceInfo` type
lives, or where sanitization happens, has to open both. The `DeviceInfo` interface actually living
in `deviceReport.ts` (not `deviceInfo.ts`) is a mild surprise.

#### Proposed solution

Rename for role clarity, e.g. `collectDeviceInfo.ts` (or `deviceInfo.client.ts`) for the collector
and `deviceReport.ts` / `deviceInfo.shared.ts` for the schema — or merge the schema into a
`deviceReport` that the collector imports, and note the split in a one-line header on each. Low
urgency; do it if the platform-folder move (P2) is done anyway.

#### Verification

`npm run check`; imports in `ReportForm.svelte` and `api/report/+server.ts` updated.

---

### [P4][type-safety] `currentGain!` non-null assertion in `playDrawSound`

**File(s):** `web/src/lib/audio/drawingSound.ts:82` — pinned at SHA f934d43

#### Problem

```ts
rampGainTo(currentGain!.gain, target, ctx.currentTime, GAIN_RAMP_S);
```

The `!` asserts `currentGain` is set. It's true today (the `if (!currentSource)` block always
assigns `currentGain` alongside `currentSource`, and the early `if (!ctx || !buffers) return` guards
the rest), but the invariant "`currentSource` set ⟺ `currentGain` set" is implicit across two
branches — a refactor that sets one without the other would crash at runtime past the compiler. It's
the kind of coupled-nullable pair the factory refactor (P2 above) would let you model as a single
non-null object.

#### Proposed solution

In the `createDrawingSound` refactor, hold `{ source, gain }` as one nullable object so the pair is
atomically set/cleared and the `!` disappears. Short term, pull `currentGain` into a local after the
start block: `const gain = currentGain; if (!gain) return;`.

#### Verification

`npm run check` with no non-null assertion; new unit test exercises the start-then-ramp path.

---

### [P5][dead-code] `osFromUserAgent` carries a Windows-only branch the app can't reach meaningfully

**File(s):** `web/src/lib/deviceInfo.ts:72-74` — pinned at SHA f934d43

#### Problem

`osFromUserAgent` maps `Windows NT 10` → `'Windows 10/11'` and other `Windows NT` versions, but this
is a toddler drawing app whose web target is overwhelmingly mobile/tablet, and the function's own
comment notes the raw UA is *always* sent alongside on web, so a Windows miss "loses nothing." The
Windows branches add parsing surface for a value that is redundant (raw UA present) on the only
platform (web) where a Windows UA can appear — native builds are Android/iOS only.

#### Proposed solution

This is minor; either keep it (harmless) or trim the OS map to the platforms the app actually
targets (Android/iOS/macOS/ChromeOS/Linux), relying on the always-attached raw UA for the desktop
long tail. Not worth churn on its own — fold into the P3 `collectDeviceInfo` extraction if touched.

#### Verification

`deviceReport`/web-arm unit test still maps mobile UAs correctly; raw UA still attached on web.

## Source: Code audit — tools/asset-gen · bin (pipeline CLIs)

### [P1][duplication] Extract the six near-identical Gemini `generateContent` wrappers into `lib/gemini.mjs`

**File(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs:75-97` (`generateColoredPage`);
`gen-coloring-fills-dark.mjs:119-141` (`generateDarkPage`); `gen-coloring-chalk.mjs:253-278`
(`drawChalk`); `normalize-outline-strokes.mjs:111-136` (`editLineArt`);
`gen-coloring-outlines-fresh.mjs:84-97` (`generateOutline`); `gen-style-covers.mjs:29-52`
(`generateStyledImage`) — pinned at SHA f934d43

#### Problem

Every generator hand-rolls the same call: build
`contents: [{ role:'user', parts:[{inlineData:{mimeType, data: Buffer.from(...).toString('base64')}}, {text: prompt}] }]`,
set
`config: { abortSignal: AbortSignal.timeout(120_000), ...(temperature === undefined ? {} : { temperature }) }`,
then `classifyGeminiResponse(response)` and
`if (classified.kind !== 'image') throw new Error(\`${classified.kind}:
${classified.reason}\`)`. Six copies differ only in the prompt, the webp quality, and (fresh) an`imageConfig.aspectRatio`/ text-only contents. This is the single largest duplicated block in the directory, and the`120_000`
timeout plus the base64 dance is repeated verbatim each time.

#### Proposed solution

Add `lib/gemini.mjs`:

```
export const IMAGE_MODEL = 'gemini-3.1-flash-image';
export const GENERATE_TIMEOUT_MS = 120_000;
export function makeClient() // reads GEMINI_API_KEY, throws via fail if absent
export async function generateImage(ai, { imageBytes, mimeType, prompt, temperature, aspectRatio })
  // builds contents (text-only when imageBytes omitted), applies timeout + optional temperature/imageConfig,
  // classifies, returns { bytes, mimeType } or throws the refusal reason
```

Each bin then calls `generateImage(ai, { imageBytes, mimeType, prompt: FILL_PROMPT, temperature })`.
Keep the per-script prompt constants; only the transport moves.

#### Verification

`grep -c 'AbortSignal.timeout' bin/*.mjs` drops from 6 to 0; `grep -rl classifyGeminiResponse bin/`
shows only imports of the new helper. Re-run `npm run gen:style-covers -- --style Crayon` (or any
generator with a key) and confirm identical output bytes.

---

### [P1][duplication] Extract the keep-best-of-N retry ladder shared by all five generators

**File(s):** `gen-coloring-fills.mjs:170-219` (`passes`/`rank`/`renderClean`);
`gen-coloring-fills-dark.mjs:253-325` (`generateCleanTake`); `gen-coloring-chalk.mjs:296-411`
(`passes`/`rank` + attempt loop); `gen-coloring-outlines-fresh.mjs:152-219`;
`normalize-outline-strokes.mjs:151-297` — pinned at SHA f934d43

#### Problem

Every generator implements the same control structure: a `passes(cand)` predicate, a `rank(cand)`
tie-breaker, then a loop `for (attempt = 0..maxAttempts)` computing
`const temperature = Math.min(2, base + attempt * 0.15)` (0.1 in fresh, `(attempt-1)*0.15` in dark),
generating, scoring, `if (!best || rank(cand) > rank(best)) best = cand;` and
`if (passes(cand)) break;`. The `Math.min(2, base + attempt*0.15)` clamp alone is copy-pasted in
five files (confirmed at fills:186, dark:271, chalk:400, fresh:164, normalize:270). This is the #1
structural pattern in the directory and is reimplemented each time with subtle drift (dark tracks
`bestAccept` vs `best`; the increment differs).

#### Proposed solution

Add `lib/attempt-ladder.mjs`:

```
export function ladderTemperature(base, attempt, step = 0.15) { return Math.min(2, base + attempt * step); }
export async function keepBestOfN({ maxAttempts, baseTemp, step, render, score, passes, rank })
  // loops, tracks best by rank, breaks on passes, returns { best, attemptsRun }
```

The generators supply their own `render`/`score`/`passes`/`rank` closures. dark's two-tier
accept/fallback can be modeled by having `rank` fold acceptability in (as chalk/fills already do),
or by an optional `accept` predicate.

#### Verification

Unit-test `ladderTemperature`. Re-run `gen:coloring-fills -- <page>` and confirm the same attempt
count and scores print; diff a golden freeze (`npm run gen:coloring-golden:diff`) shows no
regression.

---

### [P2][duplication] Centralize the `MODEL`, `WEBP_QUALITY`, and timeout constants

**File(s):** `MODEL = 'gemini-3.1-flash-image'` at gen-coloring-fills.mjs:47,
gen-coloring-fills-dark.mjs:76, gen-coloring-chalk.mjs:69, normalize-outline-strokes.mjs:52,
gen-coloring-outlines-fresh.mjs:32, gen-style-covers.mjs:21; `WEBP_QUALITY` at fills:48 (90),
dark:78 (90), chalk:70 (92), normalize:53 (92), fresh:33 (90), covers:24 (75) — pinned at SHA
f934d43

#### Problem

The model id is duplicated in six files. When the catalog migrates models again (there is already a
`docs/gemini-3.1-migration.md` run record for exactly this), all six must change in lockstep — a
grep-and-replace hazard, and nothing enforces they stay equal. `WEBP_QUALITY` is likewise scattered
with two different values (90 vs 92) and no named rationale for the split.

#### Proposed solution

Export `IMAGE_MODEL` and encode settings from `lib/gemini.mjs` (or a small `lib/encode.mjs`): e.g.
`export const LINE_ART_WEBP_QUALITY = 92; export const FILL_WEBP_QUALITY = 90;` with a one-line WHY
for why line art wants the higher quality. Import everywhere.

#### Verification

`grep -rn "gemini-3.1-flash-image" bin/` returns zero after refactor (only the lib defines it).
Golden diff stays clean (quality values unchanged, just named).

---

### [P2][duplication] Three hand-rolled arg→target resolvers duplicate `resolveOutlineTargets`

**File(s):** `audit-invented-shapes.mjs:84-105` (`targetsUnder`/`resolveArg`);
`audit-night-halo.mjs:70-86` (`pagesUnder`/`resolveArg`); `punch-fill-outlines.mjs:28-46`
(`rawsUnder`/`resolveArg`) — pinned at SHA f934d43

#### Problem

`lib/outline-targets.mjs` exists precisely to turn `["nature", "nature/ant-wide"]` into resolved
paths, and the five generators plus two audits use it. But three scripts that walk `fill-src/**` or
`**/*.night.webp` instead each re-implement the identical "arg is a category dir, or a page, else
fail" logic with their own glob + `existsSync`/`statSync().isDirectory()` branch. They diverge in
error wording and in how a themed page (`space/ship-tall.night`) is handled. A newcomer cannot tell
these three resolvers are meant to behave like the shared one.

#### Proposed solution

Generalize `resolveOutlineTargets` to accept a `root`, a `suffixPattern` (e.g.
`**/*.{light,night}.raw.webp`, `**/*.night.webp`, `**/*.raw.webp`), and a `stripSuffix`, or add a
sibling `resolveAssetTargets({ root, pattern, toKey })` in `lib/outline-targets.mjs`. Route all
three scripts through it.

#### Verification

`npm run gen:coloring-punch -- nature/ant-wide`, `gen:coloring-fills:audit:halo -- vehicles`, and
`gen:coloring-fills:audit:shapes -- space/ship-tall.night` produce the same target lists as today;
delete the three local resolvers.

---

### [P2][duplication] Extract the `pageRel(path)` derivation repeated in seven files

**File(s):** `relative(COLORING_DIR, page).replace(/\.outline\.webp$/, '').replace(/\\/g, '/')` (or
the two-step variant) at gen-coloring-fills.mjs:224-226, gen-coloring-fills-dark.mjs:347-349,
gen-coloring-chalk.mjs:320-322, audit-golden.mjs:58-60, review-orb-eyes.mjs:39-41, plus the
`\\`-less variants audit-fill-eyes.mjs:38, audit-outline-solidity.mjs:27,
check-coloring-drift.mjs:51 — pinned at SHA f934d43

#### Problem

Turning a resolved outline path back into a category/page key (`nature/ant-wide`) is done ad hoc in
nine places, and inconsistently: some strip the Windows backslash (`.replace(/\\/g,'/')`), some
don't — a latent cross-platform bug given ADR-0017 requires macOS+Linux parity and forward-slash
keys.

#### Proposed solution

Export `pageRelFromOutline(path)` from `lib/paths.mjs` (it already owns `COLORING_DIR`):
`relative(COLORING_DIR, path).replace(/\.outline\.webp$/, '').replaceAll('\\', '/')`. Replace all
nine call sites.

#### Verification

`grep -rn "replace(/\\\\.outline" bin/` returns only the lib. Audits print identical page keys.

---

### [P2][duplication] Extract the "score against chalk when forked, else pen" source-selection

**File(s):** `audit-golden.mjs:101-103`; `audit-invented-shapes.mjs:121-123`;
`audit-night-halo.mjs:40-43`; `audit-fill-eyes.mjs:49-55`; `gen-coloring-fills-dark.mjs:378-380` —
pinned at SHA f934d43

#### Problem

The load-bearing rule "a night fill scores/composites against the chalk outline when the page has
forked, otherwise the pen" is re-derived in five places with slightly different shapes:
`chalk ?? pen` (golden, dark), `theme === 'night' && existsSync(chalk) ? chalk : pen` (invented),
`existsSync(chalk) ? chalk : pen` (halo), `const chalked = existsSync(chalkPath)` then branch
(fill-eyes). Because it is copy-pasted, a future change to the fork convention (or the composite
step) must be found and fixed in five spots — exactly the kind of pipeline rule the docs stress is
easy to get subtly wrong.

#### Proposed solution

Add to `lib/paths.mjs` or a new `lib/line-art.mjs`:

```
export function chalkPathFor(outlinePath)      // path swap
export async function nightSource(outlinePath) // returns { source, chalk|null } reading chalk when present, else pen
```

Callers use `const { source, chalk } = await nightSource(page)`; the `compositeNight(raw, chalk)` vs
`raw` branch can also live behind a helper.

#### Verification

Golden freeze/diff unchanged. `grep -rn 'chalk ?? pen\|existsSync(chalkPath)' bin/` collapses to the
lib.

---

### [P2][complexity] Wrap the top-level procedural page loops in a `main()`

**File(s):** `gen-coloring-fills-dark.mjs:327-440`; `gen-coloring-chalk.mjs:318-455`;
`normalize-outline-strokes.mjs:196-336`; `gen-coloring-fills.mjs:221-283` — pinned at SHA f934d43

#### Problem

These scripts run 100–140 lines of imperative work (target resolution, the per-page loop, gating,
writing, the summary) at module top level with `let failures = 0` module globals and top-level
`await`. There is no `main()` and no single place a reader can see the shape of the program; the
per-page body (e.g. dark:346-437) is a ~90-line block mixing lever resolution, file reads, the
attempt ladder, encode, and a multi-branch status-string assembly. This is the "procedural `main`
blob" pattern flagged as the top CLI smell.

#### Proposed solution

Introduce `async function main()` and, within it, factor the loop body into named steps:
`resolvePageInputs(page, cfg)`, `writeCandidate(...)`, `formatStatusLine(take, cfg)`. Call
`main().catch(err => fail(err.message))` at the bottom. This also gives one place to own the exit
code.

#### Verification

Behavior identical (same stdout, same exit code on `--dry-run`); the diff is pure extraction.
`node --check` passes and a dry-run prints the same lever report.

---

### [P2][consistency] Unify CLI argument parsing — three different mechanisms in one directory

**File(s):** `parseArgs` in most files; `process.argv.slice(2)` in audit-fill-eyes.mjs:23 and
audit-outline-solidity.mjs:16; `process.argv[2]` in audit-golden.mjs:175; env vars
`QUALITY`/`LOSSLESS` in png-to-webp.mjs:11-12; bare `process.argv.slice(2)` as dir list in
gen-coloring-thumbs.mjs:47 — pinned at SHA f934d43

#### Problem

Five scripts opt out of `node:util` `parseArgs` that the rest of the directory standardizes on.
`png-to-webp` uniquely takes options through environment variables (`QUALITY=90 LOSSLESS=1`),
`gen-coloring-thumbs` treats every positional as a category with no flag support, and `audit-golden`
reads a single positional `process.argv[2]` for its `--freeze`/`--diff` mode. A newcomer cannot
predict how any given script takes options, and `--help`-style discoverability is nonexistent.

#### Proposed solution

Standardize on `parseArgs` everywhere. Convert `png-to-webp` to `--quality`/`--lossless` flags (env
can stay as a fallback if desired), give `gen-coloring-thumbs` an `allowPositionals` parse, and
parse `audit-golden`'s mode via `options` or at least document it. A tiny `lib/cli.mjs`
`parse(spec)` wrapper could carry the shared `allowPositionals: true` default.

#### Verification

Each script's usage comment matches its parser. `npm run info` descriptions still hold; smoke-run
each audit with no args.

---

### [P3][consistency] Duplicated, divergent numeric-flag validators

**File(s):** temperature/samples/max-attempts/non-negative checks at gen-coloring-fills.mjs:126-133,
gen-coloring-fills-dark.mjs:211-235, gen-coloring-chalk.mjs:229-247,
normalize-outline-strokes.mjs:92-104, gen-coloring-outlines-fresh.mjs:70-74,
gen-style-covers.mjs:68-70 — pinned at SHA f934d43

#### Problem

The same validations are re-written with inconsistent wording:
`--temperature must be between 0 and 2` (chalk, fresh, normalize) vs
`--temperature must be a number between 0 and 2, got "…"` (fills, covers);
`--samples must be a positive integer` with vs without the offending value. dark alone repeats four
`>= 0` guards inline. Each is a hand-rolled `if (!(Number.isInteger(x) && x >= 1)) fail(...)`.

#### Proposed solution

Add `lib/cli.mjs` validators: `parsePositiveInt(raw, name, fallback)`,
`parseTemperature(raw, name, fallback)` (0–2), `parseNonNegative(raw, name, fallback)`. Each returns
the parsed number or calls `fail` with one canonical message. The
`nightSettings`/`chalkSettings`/`normalizeSettings` builders shrink to a table of these.

#### Verification

Feed each script `--temperature 9` / `--samples 0` and confirm one consistent error string.
Unit-test the validators.

---

### [P3][duplication] The `GEMINI_API_KEY` guard is copy-pasted six ways

**File(s):** gen-coloring-fills.mjs:135, gen-coloring-fills-dark.mjs:239,
gen-coloring-chalk.mjs:224, normalize-outline-strokes.mjs:88, gen-coloring-outlines-fresh.mjs:61,
gen-style-covers.mjs:72 — pinned at SHA f934d43

#### Problem

`if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.')` appears six times, and three
scripts additionally repeat the guarded-construct idiom
`const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: … }) : null` (dark:341-343,
chalk:249-251, normalize:107-109) with an extra `--dry-run`/`--rescore` escape hatch bolted on
inconsistently.

#### Proposed solution

`lib/gemini.mjs` `makeClient({ optional = false })`: returns a client, calls `fail` when the key is
missing and `optional` is false, returns `null` when optional (for `--dry-run`/`--rescore`).
Replaces both idioms.

#### Verification

Unset the key and run each generator; confirm the same failure message. Run
`gen:coloring-chalk -- nature --dry-run` with no key and confirm it still previews.

---

### [P3][maintainability] Prompt strings and the transport live tangled in the bin scripts

**File(s):** `FILL_PROMPT` gen-coloring-fills.mjs:52-70; `darkFillPrompt`/`EYES_*`
gen-coloring-fills-dark.mjs:84-117; `INSTRUCTION` gen-coloring-chalk.mjs:190-204; `INSTRUCTION`
normalize-outline-strokes.mjs:61-74; `STYLE_PROMPT` gen-coloring-outlines-fresh.mjs:35-41 — pinned
at SHA f934d43

#### Problem

The multi-paragraph model prompts are the actual product of this pipeline and the thing most often
tuned, yet each is embedded mid-file between imports and control flow. Finding "the dark-fill
prompt" means opening a 441-line CLI and scrolling past scoring code. There is no single surface
where a prompt-tuner can see and diff all of them (contrast the app side, which has
`web/src/lib/ai/prompt.ts`).

#### Proposed solution

Move the prompt constants to `lib/prompts.mjs` (or one file per prompt under `lib/prompts/`),
exporting `FILL_PROMPT`, `darkFillPrompt(chalked)`, `CHALK_INSTRUCTION`, `NORMALIZE_INSTRUCTION`,
`FRESH_STYLE_PROMPT`. The bins import them; the transport and scoring stay in bin. This also makes
the prompts unit-referenceable.

#### Verification

Golden diff clean (byte-identical prompts, just relocated). `grep -n 'You are given' bin/` returns
nothing.

---

### [P3][duplication] Repeated status-line assembly at the end of each generator loop

**File(s):** gen-coloring-fills.mjs:242-263; gen-coloring-fills-dark.mjs:414-432;
gen-coloring-chalk.mjs:429-441; normalize-outline-strokes.mjs:310-322 — pinned at SHA f934d43

#### Problem

Each generator ends its per-page block with the same shape: build a `warn`/`flags` array from failed
gates, compute `tries = attempt > 0 ? \` (${attempt+1} tries)\` : ''`,`nudge = shift.dx||shift.dy ?
\` shift ${dx},${dy}\` : ''`, a`stats`string of`keep/local/…`, and`${warn.length ? \` ⚠
${warn.join(' + ')}\` : ''} -> ${relative(REPO_ROOT, out)}`. The scaffolding (tries/nudge/⚠
join/arrow) is identical; only the gate names differ.

#### Proposed solution

Add `lib/report.mjs` `formatCandidateLine({ stats, warnings, attempt, shift, outPath })` returning
the assembled string (owning the tries/nudge/⚠/arrow formatting and `relative(REPO_ROOT, …)`). Each
generator passes its gate-specific `stats` and `warnings[]`.

#### Verification

Console output for a re-run is byte-identical; the four inline assemblies collapse to one call each.

---

### [P3][duplication] Number/percent formatting reinvented per script

**File(s):** `round(v, digits)` audit-golden.mjs:51-54; `pct` check-coloring-drift.mjs:68;
`Math.round(keep*1000)/10` gen-coloring-book-proof-sheet.mjs:161; ad-hoc `(v*100).toFixed(1)` across
fills, dark, chalk, normalize, audit-fill-eyes — pinned at SHA f934d43

#### Problem

"Format a 0–1 ratio as a percentage" and "round to N digits" are each implemented several times with
different precision and padding. The proof sheet's `Math.round(keep*1000)/10` and
check-coloring-drift's `pct` compute the same keep percentage two different ways, risking display
drift between the audit and the review sheet that are supposed to agree.

#### Proposed solution

`lib/format.mjs`: `pct(ratio, digits = 1)`, `round(v, digits)`. Replace the scattered inline
formatting; the proof sheet and drift audit then render keep identically by construction.

#### Verification

Audit tables and the proof-sheet badge show the same keep % for a given page.

---

### [P3][error-handling] Audits abort the whole run on one unreadable/missing asset

**File(s):** `check-coloring-drift.mjs:50-62`; `audit-fill-eyes.mjs:37-72`;
`audit-outline-solidity.mjs:26-42`; `audit-golden.mjs:57-134` (`scorePage`) — pinned at SHA f934d43

#### Problem

The generators wrap each page in `try/catch` and tally `failures` so one bad page doesn't kill a
category run (e.g. chalk:413-417, dark:433-436). The audits do not: a single corrupt webp or a race
with a half-written file throws out of the loop and aborts the entire catalog pass with a raw stack
trace, losing all results computed so far. For tools meant to double as CI checks over ~94 pages,
that's a fragile failure mode and gives no indication which page broke.

#### Proposed solution

Wrap each audit's per-page body in `try/catch`, print `<page>  ERROR (<msg>)`, increment a failure
counter, and set `process.exitCode = 1` at the end if any page errored — mirroring the generators'
convention.

#### Verification

Point one audit at a directory containing a truncated `.webp`; confirm it reports that page and
still scores the rest, exiting non-zero.

---

### [P3][consistency] `png-to-webp` configured by env vars instead of flags

**File(s):** `png-to-webp.mjs:11-12` — pinned at SHA f934d43

#### Problem

`const quality = Number(process.env.QUALITY ?? 80); const lossless = process.env.LOSSLESS === '1';`
is the only script in the directory that takes its options through environment variables. It's
undiscoverable (no `parseArgs`, no validation — `QUALITY=abc` silently yields `NaN`), and
inconsistent with the `namespace:variant` + flag conventions everywhere else.

#### Proposed solution

Switch to `parseArgs` with `--quality <n>` (validated via the shared `parseNonNegative`) and
`--lossless`. Keep reading the env var only as a documented fallback if existing muscle-memory
matters.

#### Verification

`node bin/png-to-webp.mjs --quality 90 --lossless` works; `--quality abc` fails loudly instead of
writing `NaN`-quality webps.

---

### [P3][duplication] Two base64 data-URI helpers with different names

**File(s):** `review-orb-eyes.mjs:36` (`b64`); `gen-coloring-book-proof-sheet.mjs:82-85` (`dataUri`)
and `:94-105` (`gitDataUri`) — pinned at SHA f934d43

#### Problem

`review-orb-eyes` defines
`const b64 = (buf) => \`data:image/png;base64,${buf.toString('base64')}\``; the proof sheet defines`dataUri(p)`(reads a file, webp mime) and`gitDataUri`.
Both are "bytes → embeddable data URI" for the two HTML-review generators, named and shaped
differently, so the shared concept isn't grepable.

#### Proposed solution

Add `lib/data-uri.mjs` `bytesToDataUri(buf, mime = 'image/webp')` and `fileToDataUri(path, mime)`
(null on missing). Both HTML generators import them; `gitDataUri` keeps its git-specific read but
returns via the shared formatter.

#### Verification

Both `review-orb-eyes` and the proof sheet still render inline images; the HTML output is unchanged.

---

### [P3][consistency] Inconsistent exit-code conventions across the CLIs

**File(s):** `process.exitCode = 1` at audit-golden.mjs:226, check-coloring-drift.mjs:90,
audit-invented-shapes.mjs:160, audit-fill-eyes.mjs:81; `process.exit(0)` at png-to-webp.mjs:20 and
gen-asset-manifest.mjs:61; `fail()`→`process.exit(1)` throughout; `audit-night-halo.mjs` sets no
exit code at all — pinned at SHA f934d43

#### Problem

Some tools signal "found problems" via `process.exitCode = 1` (lets the event loop drain), some
hard-`process.exit(0)` mid-file, and `audit-night-halo` — explicitly described in its header as a
ranking, but still a catalog audit — never sets a non-zero code even conceptually. A caller/CI
cannot rely on a uniform "non-zero = something to look at" contract, and the mixed `process.exit()`
vs `process.exitCode` styles risk truncating buffered stdout.

#### Proposed solution

Adopt one rule: audits set `process.exitCode = 1` on findings and never call `process.exit()`;
generators keep `fail()` for hard errors. Document the "which audits gate CI" contract (halo is
advisory by design — say so in code, not just prose).

#### Verification

Run each audit against a known-flagged page and check `echo $?`; confirm buffered output isn't cut
off.

---

### [P3][maintainability] `describeLevers` settings object rebuilt by hand in three generators

**File(s):** `gen-coloring-fills-dark.mjs:354-371`; `gen-coloring-chalk.mjs:327-342`;
`normalize-outline-strokes.mjs:202-215` — pinned at SHA f934d43

#### Problem

Each generator manually maps its `cfg` back into the flag-keyed object `describeLevers` expects
(`{ temperature: cfg.baseTemp, 'max-attempts': cfg.maxAttempts, … }`). The `cfg` was itself built
from those same flag keys moments earlier (in `nightSettings`/`chalkSettings`/`normalizeSettings`),
so the code round-trips key→field→key by hand, and a new lever must be added in three synchronized
spots (the settings builder, the `describeLevers` mapping, the validation).

#### Proposed solution

Have the settings builders keep (or expose) the flag-keyed shape, e.g. return `{ settings, flags }`
where `flags` is already keyed for `describeLevers`, so the call site passes `settings: cfg.flags`
with no manual remap.

#### Verification

`--dry-run` lever reports are identical for a page with registry entries; adding a hypothetical
lever touches one object.

---

### [P4][dead-code] `export` on generator functions that are never imported

**File(s):** `gen-coloring-fills.mjs:75` (`export async function generateColoredPage`);
`gen-style-covers.mjs:29` (`export async function generateStyledImage`) — pinned at SHA f934d43

#### Problem

Both are `export`ed with a comment ("Kept free of file/CLI concerns so it can be reused (batch,
samples, or eventually in-app)"), but a repo-wide grep shows each is only ever called within its own
file (fills:187, covers:86) — no importer exists. The export is aspirational dead surface that
implies a shared API that isn't there, and `generateDarkPage`/`drawChalk`/`editLineArt` in sibling
files are (correctly) not exported, so the pattern is inconsistent anyway.

#### Proposed solution

Drop the `export` keyword (make them file-local) — or, better, subsume them into the
`lib/gemini.mjs` `generateImage` from finding 1, which is the actual reuse point the comments
anticipate.

#### Verification

`grep -rn "import.*generateColoredPage\|import.*generateStyledImage" .` (excluding
`ideas-exploration/`) returns nothing; removing the export doesn't break `node --check` or the
scripts.

---

### [P4][duplication] Working-resolution and threshold magic numbers scattered across pixel scans

**File(s):** `gen-coloring-fills.mjs:102` (`WHITE_LEVEL = 248`) & `:104` (`resize(360, 360)`);
`gen-coloring-outlines-fresh.mjs:124` (`>= 235` border white), `:136` (`resize(360,360)`), `:140`
(`< 150` ink); `gen-coloring-chalk.mjs:82-83` (`INK_W = 512`, `INK_DARK = 110`) — pinned at SHA
f934d43

#### Problem

Down-sampling to a working resolution before a pixel loop is done at `360×360` in two files and
`512×512` in a third, and the "is this pixel white/ink" luma thresholds (248, 235, 150, 110) are
bare literals inside each scan function. Some are named (`WHITE_LEVEL`, `INK_DARK`), some are inline
(`>= 235`, `< 150`). A reader can't tell whether the differing working sizes are deliberate
(accuracy vs speed) or accidental, and the luma cutoffs that must roughly agree with
`lib/outline-match.mjs`'s ink bar (chalk:81 says "same ink bar") aren't traceably linked.

#### Proposed solution

Name every threshold at the top of its file (or share `INK_LUMA_MAX`/`WHITE_LUMA_MIN`/`SCAN_EDGE`
from a `lib/pixels.mjs` where the value genuinely must match `outline-match`). Add a one-line WHY
where 360 vs 512 is a real speed/accuracy choice.

#### Verification

Golden diff clean (values unchanged, only named). The chalk↔outline-match agreement is now a shared
import, not a comment.

---

### [P4][consistency] Progress written to `stderr` in one audit, `stdout` in the rest

**File(s):** `audit-night-halo.mjs:98-100` and `:111` (`console.error` for progress and timing) vs
the `console.log`/`process.stdout.write` progress in every other audit and generator — pinned at SHA
f934d43

#### Problem

`audit-night-halo` prints its per-page progress counter and final timing via `console.error`, while
its ranked table goes to `console.log`. The intent (keep the pipeable table on stdout, chatter on
stderr) is defensible but undocumented and unique — no other tool in the directory splits streams,
so it reads as an inconsistency rather than a deliberate choice, and `--out` already exists for
machine consumption.

#### Proposed solution

Either document the stdout/stderr split with a one-line comment and adopt it as the convention for
audits that emit a pipeable table, or move progress to `console.log` for consistency with the
sibling audits. Pick one and note it.

#### Verification

`node bin/audit-night-halo.mjs vehicles 1>table.txt` yields only the table in `table.txt`; the
chosen convention is stated in the header.

---

### [P4][complexity] Settings builders called once purely for their validation side-effect, then discarded

**File(s):** `gen-coloring-fills-dark.mjs:238` (`nightSettings(values, 'cli')`);
`gen-coloring-chalk.mjs:247` (`chalkSettings(values, 'cli')`); `normalize-outline-strokes.mjs:105`
(`normalizeSettings(values, 'cli')`) — pinned at SHA f934d43

#### Problem

Each script calls its settings builder at top level and throws the result away, relying on the
function's `fail()` side effects to validate the raw CLI flags early; the real per-page settings are
rebuilt later inside the loop (dark:353, chalk:326, normalize:201). This "call for side effects,
ignore return" is a smell — the function name implies it produces settings, but here it's used as a
validator, and the double invocation means validation logic and construction logic are entangled in
one function.

#### Proposed solution

Split validation from construction: a `validateFlags(values)` that only checks the raw CLI, called
once up front, and a pure `buildSettings(merged)` used per page. (Composes naturally with the shared
validators in finding 9.)

#### Verification

Invalid CLI flags still fail before any API call; the per-page path no longer re-runs top-level
validation. Dry-run output unchanged.

---

### [P4][naming] Amber overlay color and dim factor are unexplained literals

**File(s):** `audit-invented-shapes.mjs:44-56` (`* 0.55` base dim; `r=255,g=210,b=0` "amber";
red-rect `stroke-width="3"`, `x0-3`/`+6` insets) — pinned at SHA f934d43

#### Problem

`overlayImage` hard-codes the 0.55 dim multiplier for the background and the `(255,210,0)`
deviant-pixel color inline (the trailing `// deviant bg pixel = amber` helps, but the numbers aren't
named), plus the SVG rect padding (`-3`/`+6`). These are presentation constants a reviewer may want
to tune, buried in a triple pixel loop.

#### Proposed solution

Hoist named constants at the top of the file:
`const OVERLAY_DIM = 0.55; const DEVIANT_RGB = [255, 210, 0]; const RECT_PAD = 3;`. Minor, but it
makes the one visual-tuning surface in the audit legible.

#### Verification

Regenerate an overlay with `--overlay`; the image is pixel-identical, the constants are now
discoverable.

---

I reviewed all 18 scripts in `tools/asset-gen/bin/` against the shared `lib/`. The dominant themes
are cross-script duplication of the Gemini transport, the keep-best-of-N retry ladder, arg/target
resolution, and the chalk-fork source selection — each reimplemented 5–6 times — plus inconsistent
CLI parsing, validation, and exit-code conventions. The audit scripts also lack the per-page error
isolation the generators already have. All findings are report-only; no code was changed.

## Source: Code audit — tools/asset-gen · lib (pipeline core)

### [P2][duplication] Every module reimplements RGB decode + luma; the luma coefficients live in six files

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:41-50,217-218` (`inkMask`),
`night-scores.mjs:90,133`, `punch-fill.mjs:124`, `solid-regions.mjs:171-172`, `night-halo.mjs:31-36`
(`loadRgb`/`lumaOf`), `composite-eye.mjs:80-88` (`grayResized`) — pinned at SHA f934d43

#### Problem

The Rec.601 weighting `0.299*R + 0.587*G + 0.114*B` is hand-written in at least six modules, and the
`sharp(buf).removeAlpha().raw().toBuffer({resolveWithObject:true})` decode preamble is copy-pasted
into nearly all of them. `eye-fill.inkMask`, `night-halo.loadRgb`, and `solid-regions.scoreSolidity`
each open with a byte-identical decode-and-luma loop:

```js
const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
```

Any future change to the luma definition (or a bug in one copy) silently forks the pipeline's notion
of "brightness" — the exact class of drift the CLAUDE.md warns about with "the mask math can never
fork between them."

#### Proposed solution

Add `lib/pixels.mjs` exporting `async function loadRgb(buf)` → `{ rgb, width, height }`,
`luma(rgb, p)` (index into an interleaved RGB buffer), and `lumaAt(r,g,b)`. Replace each module's
private decode+luma with imports. `night-halo.mjs`'s `loadRgb`/`lumaOf` are already the right shape
— promote them.

#### Verification

`grep -c "0\.299" lib/**` drops to 1. Re-run `npm test` (the per-module unit tests under `tests/`)
and `npm run gen:coloring-golden:diff` — scores must be byte-identical since the arithmetic is
unchanged.

---

### [P2][duplication] Background flood-fill is written twice in lib (and a third time in bin)

**File(s):** `tools/asset-gen/lib/night-scores.mjs:57-83` (`scoreNightness`) and
`tools/asset-gen/lib/invented-shapes.mjs:55-82` (`detectInventedShapes`) — pinned at SHA f934d43

#### Problem

Both modules flood the open background from the border through source-light pixels with the same
`push(x,y)` closure, the same four border-seeding loops, and the same `while(stack.length)`
pop-and-spread. `invented-shapes.mjs:14` even documents the copy: "the same machinery as
scoreNightness." `bin/gen-coloring-chalk.mjs:113` reimplements it a third time. Three copies of a
border flood-fill, each with its own `SRC_LIGHT`/`NIGHT_SRC_LIGHT` constant (both 170).

#### Proposed solution

Extract `export function floodBackground(gray, w, h, lightThreshold)` → `Uint8Array` into
`lib/pixels.mjs` (or a new `lib/regions.mjs`). Both scorers call it; `invented-shapes` keeps its own
`cand` post-filter. Fold the two `170` constants into one exported `BG_LIGHT_THRESHOLD`.

#### Verification

`tests/night-scores.test.mjs` and `tests/invented-shapes.test.mjs` still pass; the `bgFrac`/`bgLuma`
outputs are unchanged on fixtures.

---

### [P2][duplication] `solid-regions.mjs` reimplements the erode/dilate that `morphology.mjs` already exports

**File(s):** `tools/asset-gen/lib/solid-regions.mjs:46-85` (`erode`, `dilate`) vs
`tools/asset-gen/lib/morphology.mjs:7-42` (`morph`/`erodeMask`/`dilateMask`) — pinned at SHA f934d43

#### Problem

`morphology.mjs` exists precisely to be "shared" (its header names two callers) and provides
separable `erodeMask`/`dilateMask`. Yet `solid-regions.mjs` defines its own `erode` (separable,
breaks on first unset) and `dilate` (invert→erode→invert) that compute the identical opening. A
*third* erosion — Set-based — appears in `composite-eye.mjs:211-231`. Three morphology
implementations for one concept; `solid-regions`'s copy is a near-verbatim duplicate of the exported
one.

#### Proposed solution

Delete `solid-regions.mjs`'s local `erode`/`dilate`; import `erodeMask`/`dilateMask` from
`morphology.mjs` and call them in `scoreSolidity` (lines 181-182) and `whitenSolidRegions` (line
224). Verify the border-handling matches (both treat out-of-bounds as unset for erode); if
`whitenSolidRegions`'s rim relies on the invert-based dilate's border behavior, add a `border`
option to `morph` rather than keeping a fork.

#### Verification

`tests/solid-regions.test.mjs` and `tests/morphology.test.mjs` pass; `scoreSolidity` on the golden
fixtures returns the same `interiorPx`/`biggestBlob`.

---

### [P2][maintainability] The ink-luma threshold `150` is redeclared in four modules with "keep in sync" comments

**File(s):** `tools/asset-gen/lib/punch-fill.mjs:35` (`OUTLINE_LUMA_THRESHOLD`),
`solid-regions.mjs:23` (`SOLID_LUMA_THRESHOLD`), `eye-fill.mjs:24` (`INK_LUMA`),
`composite-eye.mjs:10` (`PUNCH_LUMA`) — pinned at SHA f934d43

#### Problem

Four constants all equal `150` and all mean "line-art pixel this dark = outline ink." Each carries a
comment tying it back to `punch-fill.mjs`:

```js
export const SOLID_LUMA_THRESHOLD = 150; // Same ink bar as the punch mask (lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD)
const PUNCH_LUMA = 150; // lib/punch-fill.mjs OUTLINE_LUMA_THRESHOLD
```

`night-halo.mjs` and the punch itself already import `OUTLINE_LUMA_THRESHOLD` — proving the
canonical source exists — but three other modules copy the literal instead. If the punch bar moves,
three gates silently keep the old value and the "solid = the pixels the punch would cut" invariant
breaks.

#### Proposed solution

Import `OUTLINE_LUMA_THRESHOLD` in `composite-eye.mjs` (replace `PUNCH_LUMA`) and `eye-fill.mjs`
(replace `INK_LUMA`). `solid-regions.mjs` may keep a re-export alias for its public API but should
define it as `export const SOLID_LUMA_THRESHOLD = OUTLINE_LUMA_THRESHOLD;`.

#### Verification

`grep -rn "= 150" lib/` returns only the single definition (plus unrelated `EYE_LIGHT_MIN`). Golden
diff unchanged.

---

### [P2][complexity] `scoreEyeFill` is a 100-line function mixing resize, per-core sampling, annulus geometry, and the liveliness verdict

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:208-307` — pinned at SHA f934d43

#### Problem

One function decodes+resizes the fill and builds a luma plane (211-218), then per core: collects
core pixels (226-229), builds a geometric annulus while running an inner 3×3 near-ink exclusion
(231-279), computes p15/p85 band stats (282-288), and evaluates the tri-branch liveliness ladder
(289-294). The annulus loop alone is a 30-line quadruple-nested block with a `nearInk` inner scan.
The reader must hold all of it to follow one core's verdict.

#### Proposed solution

Extract named steps:

* `function coreLuma(luma, w, core, label)` → median core value,
* `function sampleAnnulus(luma, ink, label, w, h, core, cx, cy, r)` →
  `{ bandVals, annulusInkFrac }`,
* `function judgeLively(coreLuma, bandDark, bandLight)` → boolean (the 289-294 ladder).
  `scoreEyeFill` then loops cores calling the three. Keep the dense per-page-tuning comments on
  `sampleAnnulus`.

#### Verification

`tests/eye-fill.test.mjs` passes unchanged (pure refactor); the returned `cores[]` shape is
identical.

---

### [P2][complexity] `detectInventedShapes` is a 155-line function whose five numbered comments are begging to be functions

**File(s):** `tools/asset-gen/lib/invented-shapes.mjs:40-195` — pinned at SHA f934d43

#### Problem

The body is literally sectioned `// 1. flood…`, `// 2. dilated source-ink mask`,
`// 3. median background color`, `// 4. foreign pixels`, `// 5. connected components + anchoring`.
Step 5 alone (129-179) is a 50-line inline connected-components scan with per-blob bbox, color sums,
and border/anchor accounting. Numbered-comment steps in a long function are the canonical
extract-into-named-function signal.

#### Proposed solution

Extract `floodBackground` (shared, see the flood-fill finding), `foreignPixels(t, cand, med, DEV_T)`
→ `Uint8Array`, and `labelBlobs(dev, nearLine, t, w, h)` → `blobs[]`. The top-level function becomes
the five one-line calls plus the `flagged`/`washes` partition (180-183).

#### Verification

`tests/invented-shapes.test.mjs` passes; `flagged`/`washes`/`blobs` arrays match on fixtures.

---

### [P2][duplication] `STRONG_LIGHT_SIDE = 180` is declared in two eye modules instead of imported

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:326` and `tools/asset-gen/lib/composite-eye.mjs:47` —
pinned at SHA f934d43

#### Problem

`composite-eye.mjs:36` already imports `BAND_BLIND_INK_FRAC` and `scoreEyeFill` from `eye-fill.mjs`,
and its own comments (46) reference "judgeNightEyes's own reference test." Yet it redeclares
`const STRONG_LIGHT_SIDE = 180;` — the same "strong light side" bar `judgeNightEyes` uses at
`eye-fill.mjs:351`. The two checks are documented as complementary halves of the same eye-reference
oracle; a change to one 180 silently desynchronizes them.

#### Proposed solution

`export const STRONG_LIGHT_SIDE = 180;` from `eye-fill.mjs` and import it in `composite-eye.mjs` (it
already imports two symbols from that file).

#### Verification

`grep -n "STRONG_LIGHT_SIDE = 180" lib/` returns one line. `tests/composite-eye.test.mjs` and
`tests/eye-fill.test.mjs` pass.

---

### [P2][performance] `scoreEyeRings` and `findEyeCores` each re-run the ink mask + full region labeling on the same buffer

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:117-136` (`findEyeCores`) and `153-184`
(`scoreEyeRings`) — pinned at SHA f934d43

#### Problem

Both functions open with `await inkMask(sourceBuf)` then `labelRegions(ink, w, h)` — a full
4-connected labeling of every non-ink pixel at native resolution.
`bin/normalize-outline-strokes.mjs` (lines 225 + 277) and `bin/gen-coloring-outlines-fresh.mjs`
(lines 178-180) call *both* on the same page, so the most expensive step in the module — decode +
connected-component labeling of a multi-megapixel page — runs twice per candidate. `scoreEyeRings`
also re-walks the parent chain that `findEyeCores` already established.

#### Proposed solution

Factor a `labelPage(sourceBuf)` → `{ ink, label, regions, w, h }` and have both `findEyeCores` and
`scoreEyeRings` accept either a buffer or a pre-labeled page. Add a combined
`export async function scoreEyes(sourceBuf)` returning `{ cores, rings }` from one labeling, and
switch the two bin callers to it.

#### Verification

Add a labeling call-counter in a test; assert one labeling per `scoreEyes`. Golden
ring-depth/eye-core numbers unchanged; wall-clock of `normalize`/`fresh` measurably drops.

---

### [P3][performance] `outlineMatch` always encodes a 512×512 overlay PNG even when the caller discards it

**File(s):** `tools/asset-gen/lib/outline-match.mjs:87,129-132` — pinned at SHA f934d43

#### Problem

`outlineMatch` allocates `rgb = Buffer.alloc(MASK_W*MASK_W*3, 255)`, paints it throughout the scan,
and always `await sharp(rgb…).png().toBuffer()` before returning. But
`bin/check-coloring-drift.mjs:55-60` uses `overlay` only under `if (values.overlay && failed)`, and
the generator gate at `bin/gen-coloring-fills.mjs:199` uses `keep`/`localKeep` for the pass/fail
decision. Every gate evaluation pays a full PNG encode purely for a diagnostic image most calls
throw away — on the hot batch path.

#### Proposed solution

Add an options arg: `outlineMatch(sourceBuf, filledBuf, { overlay = false } = {})`. Only paint `rgb`
and encode when `overlay` is true; return `overlay: null` otherwise. Callers that want it pass
`{ overlay: true }`.

#### Verification

`tests/outline-match.test.mjs` passes with `{overlay:true}`; time a batch drift check without
`--overlay` before/after — the PNG encodes disappear from the profile.

---

### [P3][architecture] `golden-catalog.mjs` bundles a composite eye scorer with the golden-diff registry and has no header

**File(s):** `tools/asset-gen/lib/golden-catalog.mjs:1-16` (`scoreGoldenNightEyes`) vs `18-80`
(`GOLDEN_METRICS`/`GOLDEN_VERDICTS`/`diffGoldenPage`) — pinned at SHA f934d43

#### Problem

This file holds two unrelated responsibilities: (a) `scoreGoldenNightEyes`, which composes
`judgeNightEyes` + `scoreCompositeEyes` into a night-eye verdict, and (b) the golden regression
comparison engine (metric noise/direction table, verdict list, `diffGoldenPage`). It is also the
only lib module with no top-of-file header comment explaining what it is — every sibling opens with
a paragraph. A reader grepping for "how the golden diff decides regression vs info" has no signpost.

#### Proposed solution

Split into `lib/golden-diff.mjs` (metrics/verdicts/`diffGoldenPage`) and `lib/golden-eyes.mjs`
(`scoreGoldenNightEyes`), or at minimum add a header comment. `audit-golden.mjs` imports both
symbols already, so the split is a two-line import change.

#### Verification

`tests/golden-catalog.test.mjs` re-pointed at the new module(s); `npm run gen:coloring-golden:diff`
output unchanged.

---

### [P3][maintainability] "Source dark = a line" (`110`) is a magic number copied across four scorers

**File(s):** `tools/asset-gen/lib/outline-match.mjs:23` (`THRESHOLD`), `night-scores.mjs:21`
(`DRIFT_SRC_DARK`) & `:160` (`LINE_SRC_DARK`), `invented-shapes.mjs:28` (`SRC_DARK`) — pinned at SHA
f934d43

#### Problem

Four constants equal `110`, all meaning "a source line-art pixel darker than this is an outline
stroke." `invented-shapes.mjs:28` even comments `// … (as scoreDrift)` to flag the coupling. Unlike
the ink-150 case there is no canonical export — the value floats independently in each file, so the
modules that must "see the same picture the gates do" (invented-shapes' stated goal) can drift apart
on a tuning change.

#### Proposed solution

Export a single `SOURCE_LINE_DARK = 110` (from `lib/pixels.mjs` or `night-scores.mjs`) and import it
in the four sites. Keep `LINE_SRC_DARK`/`DRIFT_SRC_DARK` as local aliases only if a comment
justifies why they might diverge (none currently do).

#### Verification

`grep -rn "= 110" lib/` collapses to one definition. `tests/night-scores.test.mjs`,
`tests/outline-match.test.mjs`, `tests/invented-shapes.test.mjs` pass.

---

### [P3][complexity] `scoreCompositeEyes` is a 100-line function with an inline pupil-shape validator

**File(s):** `tools/asset-gen/lib/composite-eye.mjs:158-259` — pinned at SHA f934d43

#### Problem

Inside the `for (const ref of refs)` loop, three distinct rejection stages are inlined: bounding-box
fill + aspect ratio (194-206), a Set-based erosion survival test (211-232), and centroid +
disc-stats measurement (235-243). The blob-is-a-pupil decision spans ~50 lines mixed with the
measurement, and the erosion here is a fourth ad-hoc morphology implementation.

#### Proposed solution

Extract `function isPupilDisc(blob, w, h)` → boolean (the bbox-fill, aspect, and erosion checks,
194-232, reusing `erodeMask` from `morphology.mjs`) and `function blobCentroid(blob, w)`. The loop
body reduces to: grow blob → `if (!isPupilDisc) continue` → measure disc → push.

#### Verification

`tests/composite-eye.test.mjs` (calibrated on stego/horse/17-overflag fixtures) passes;
`coreDarkFrac`/`blankOrb` verdicts identical.

---

### [P3][performance] Every night scorer independently decodes and resizes the same source buffer

**File(s):** `tools/asset-gen/lib/night-scores.mjs:44-53,99-108,164-173` (three scorers) plus
`outline-match.mjs:42-47`, `eye-fill.mjs` — pinned at SHA f934d43

#### Problem

`scoreNightness` resizes source to width 384, `scoreDrift` to 512, `scoreLineColor` to 512,
`outlineMatch` to 512×512, `scoreEyeFill` decodes at native. When the dark-fill gate runs all of
them on one candidate (`bin/gen-coloring-fills-dark.mjs`), the same source webp is decoded from
scratch 4-5 times, and `scoreDrift`+`scoreLineColor` both resize source to 512 independently.
`sharp` decode+resize is the dominant cost per gate.

#### Proposed solution

Since two scorers already share the 512 working width, have the gate decode the source once to a raw
512 grayscale plane and pass it in (an optional `preDecoded` arg keeps the "buffers-in for offline
re-scoring" contract). Unify `DRIFT_W`/`LINE_W`/`MASK_W` (all 512) into one `WORK_W`.

#### Verification

Instrument `sharp()` call count per candidate in `gen-coloring-fills-dark`; assert the source is
decoded at 512 once. Golden scores unchanged.

---

### [P3][architecture] `fail()` (console.error + process.exit) lives in `paths.mjs`, unrelated to path resolution

**File(s):** `tools/asset-gen/lib/paths.mjs:29-32` — pinned at SHA f934d43

#### Problem

`paths.mjs` is documented as "path + tree resolution," but it also exports a CLI-exit helper
`fail(message)`. Nine bin scripts import it *from paths*
(`import { …, fail } from '../lib/paths.mjs'`), coupling a process-terminating side-effect to the
pure path-constants module and making `paths.mjs` un-importable in a context that shouldn't be
allowed to `process.exit`.

#### Proposed solution

Move `fail` to a `lib/cli.mjs` (or `lib/log.mjs`). Update the nine bin imports. Keep `paths.mjs`
side-effect-free (pure constants).

#### Verification

`grep -rn "fail" lib/paths.mjs` returns nothing; bin scripts still exit(1) on bad input (existing
CLI tests like `tests/light-fill-cli.test.mjs`, `tests/outline-targets.test.mjs` pass).

---

### [P4][type-safety] Scorer return shapes are undocumented ad-hoc objects with no JSDoc typedefs

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:295-304`, `composite-eye.mjs:245-253`,
`night-halo.mjs:127-136`, `outline-match.mjs:132` — pinned at SHA f934d43

#### Problem

These `.mjs` modules return richly-structured objects (`scoreEyeFill` →
`{ eyes, cores: [{ x, y, coreLuma, bandDark, bandLight, contrast, lively, annulusInkFrac }] }`) that
downstream code and `golden-catalog.mjs` index by convention (`pupil.coreDarkFrac`,
`lightCore.annulusInkFrac`). Nothing declares these shapes, so a renamed field or a `null` vs `0`
mismatch (e.g. `judgeNightEyes` reading `nightCore.contrast`) is caught only at runtime, and callers
can't discover the contract without reading the whole function.

#### Proposed solution

Add JSDoc `@typedef` blocks for the core result shapes (`EyeCoreScore`, `PupilScore`, `HaloScore`)
at the top of each module and annotate the exported functions with `@returns`. `svelte-check`/`tsc`
in the repo's checkJs mode would then validate the golden-catalog indexing.

#### Verification

`npm run check` (if it covers `tools/asset-gen`) surfaces any mismatched field access; editors
autocomplete the fields.

---

### [P4][performance] `ringBands` recomputes the dilation from the base mask at r=1,2,3 instead of growing incrementally

**File(s):** `tools/asset-gen/lib/night-halo.mjs:53-64` — pinned at SHA f934d43

#### Problem

```js
for (let d = 1; d <= maxD; d++) {
  const grown = dilateMask(mask, w, h, d);   // full radius-d dilation from scratch
  …
  prev = grown;
}
```

Each iteration runs a fresh separable dilation of radius `d` over the whole page; the r=3 pass
redoes the work of r=1 and r=2. Three full-page morphological passes where one incremental
single-pixel dilation per ring (reusing `prev`) would do.

#### Proposed solution

Grow one ring at a time: `grown = dilateMask(prev, w, h, 1)` inside the loop (radius-1 each step),
so total work is 3 radius-1 passes instead of radius-1+2+3.

#### Verification

`tests/night-halo.test.mjs` band pixel counts unchanged (radius-d from base == d successive radius-1
dilations for box morphology).

---

### [P4][naming] Hotspot tile geometry uses bare `64` and a `*1000` key-packing with no named constants

**File(s):** `tools/asset-gen/lib/night-halo.mjs:111-125` — pinned at SHA f934d43

#### Problem

```js
const k = Math.floor(Math.floor(p / w) / 64) * 1000 + Math.floor((p % w) / 64);
…
left: (k % 1000) * 64,
top: Math.floor(k / 1000) * 64,
```

`64` (tile size) and `1000` (row-stride packing multiplier) are magic literals repeated across pack
and unpack. The `*1000` scheme also silently breaks if a page ever exceeds 1000 tile-columns
(64000px). Nothing names or bounds this.

#### Proposed solution

`const HOTSPOT_TILE_PX = 64;` and use a `Map` keyed on `` `${col},${row}` `` (or a documented
`col * COLS_STRIDE + row` with an assertion), eliminating the fragile decimal packing.

#### Verification

`tests/night-halo.test.mjs` hotspot coordinates unchanged on fixtures.

---

### [P4][naming] `alignToSource`'s edge-strength cutoff `60` is an unnamed inline literal

**File(s):** `tools/asset-gen/lib/align-to-source.mjs:47` — pinned at SHA f934d43

#### Problem

```js
if (srcE[i] > 60) {
  idx.push(i);
  wt.push(srcE[i]);
}
```

The gradient-magnitude threshold that decides which source pixels are "edges worth correlating" is a
bare `60`, sitting in a module whose other tuning values (`ALIGN_MAX`, `ALIGN_W`) *are* named
constants. It reads as noise next to them.

#### Proposed solution

`const EDGE_MIN = 60; // min |gradient| to treat a source pixel as a registration edge` alongside
the existing constants at the top.

#### Verification

No behavior change; `grep "EDGE_MIN" lib/align-to-source.mjs` confirms extraction. Any align unit
test still passes.

---

### [P4][maintainability] Windows backslash-normalization is sprinkled across three modules despite Windows support being dropped

**File(s):** `tools/asset-gen/lib/punch-fill.mjs:99` (`.replace(/\\/g,'/')`), `page-notes.mjs:39`
(`.replaceAll('\\','/')`), `outline-targets.mjs:18-20` (`normalizeTarget`) — pinned at SHA f934d43

#### Problem

Three modules defensively convert `\` → `/` in relative paths. Per the repo CLAUDE.md, ADR-0062
dropped Windows dev support (macOS/Linux only), so `path.relative`/CLI args never contain backslash
separators. The conversions are dead defensiveness that adds noise and implies a portability
contract the project no longer honors.

#### Proposed solution

Either remove the backslash handling (cleanest, matches ADR-0062) or, if kept for pasted-path
robustness, centralize it as one `toPosix(rel)` helper in `lib/paths.mjs` rather than three private
variants.

#### Verification

`tests/outline-targets.test.mjs` still passes on POSIX inputs; `grep -rn "\\\\\\\\" lib/` shows at
most one shared helper.

---

### [P4][dead-code] `GOLDEN_METRICS` is exported but consumed only inside its own module

**File(s):** `tools/asset-gen/lib/golden-catalog.mjs:18-41` — pinned at SHA f934d43

#### Problem

`GOLDEN_METRICS` is `export const`, but the only reader is `diffGoldenPage` in the same file (line
70). A repo-wide grep shows no external import (`audit-golden.mjs` imports `GOLDEN_VERDICTS` and
`diffGoldenPage`, not `GOLDEN_METRICS`). The `export` overstates the module's public surface and
invites a future caller to depend on an internal table.

#### Proposed solution

Drop `export` from `GOLDEN_METRICS` (keep it module-private) unless a test needs it — in which case
leave a one-line comment noting the test as the only external consumer.

#### Verification

`grep -rn "GOLDEN_METRICS" bin/ tests/` — if empty, remove the export;
`tests/golden-catalog.test.mjs` still passes.

---

### [P4][duplication] Percentile/median selection is reimplemented inline in every scorer

**File(s):** `tools/asset-gen/lib/eye-fill.mjs:186-190,287-288`, `night-scores.mjs:95`,
`night-halo.mjs:88`, `solid-regions.mjs:121`, `invented-shapes.mjs:111` — pinned at SHA f934d43

#### Problem

The pattern "sort then index a fraction" recurs everywhere with slightly different spellings:
`vals[vals.length >> 1]` (median), `vals[Math.floor(vals.length * 0.9)]` (p90),
`vals[Math.floor(vals.length * 0.15)]` (p15), `deltas[Math.floor(f*(deltas.length-1))]`
(night-halo's variant subtracts 1). The inconsistency (`>>1` vs `*0.5`, `len` vs `len-1`) is itself
a bug surface, and `invented-shapes.mjs:111` hides it in a comma-operator one-liner:
`const med = (a) => (a.sort((x,y)=>x-y), a[a.length>>1]);`.

#### Proposed solution

Add `export function quantile(vals, f)` and `median(vals)` to a shared `lib/stats.mjs` (sort a copy,
index consistently). Replace the inline selectors. Decide one convention for the index
(`Math.floor(f*(n-1))`) and apply uniformly.

#### Verification

Unit-test `quantile` directly; re-run all scorer tests — any that shift reveal a pre-existing
off-by-one the consolidation now makes visible/consistent.

---

### [P5][maintainability] "Median" via `>>1` is the upper-middle element, and luma definitions differ between modules that compare against shared thresholds

**File(s):** `tools/asset-gen/lib/composite-eye.mjs:80-88` (`grayResized`, sharp `.grayscale()`) vs
`eye-fill.mjs:216-218` (manual Rec.601) — pinned at SHA f934d43

#### Problem

Two subtle inconsistencies compound. (1) Nearly every "median" is `vals[vals.length >> 1]` — the
upper of the two middles for even-length arrays, not a true median; harmless in isolation but
undocumented. (2) `composite-eye.scoreCompositeEyes` derives luma via `sharp(...).grayscale()`
(libvips' weighting) while `eye-fill.scoreEyeFill` — which produces the very cores `composite-eye`
re-measures — uses manual `0.299/0.587/0.114`. The two modules threshold the same conceptual "luma"
(`DARK=90`, `WHITE=200` vs `EYE_DARK_MAX`, `EYE_LIGHT_MIN`) against values computed two different
ways, so calibration constants tuned under one luma are applied to the other.

#### Proposed solution

Standardize on the shared `luma()` helper (see the first finding) everywhere thresholds are
compared, replacing `.grayscale()` in `composite-eye`'s `grayResized`. Add a one-line note that
`>>1` is a deliberate cheap upper-median.

#### Verification

Re-run `tests/composite-eye.test.mjs` against its calibrated fixtures; if verdicts shift, the
calibration was silently luma-dependent and the constants should be re-pinned under the unified
luma.

---

### [P5][readability] `strokeWidthP90`'s two-pass chamfer distance transform is dense and unnamed

**File(s):** `tools/asset-gen/lib/solid-regions.mjs:90-122` — pinned at SHA f934d43

#### Problem

`strokeWidthP90` inlines a full forward+backward chamfer distance transform (the `1`/`1.414`
neighbor weights, two 20-line directional sweeps) then a p90 selection, all in one function whose
name advertises only the percentile. The distance-transform machinery is reusable image math buried
as a private implementation detail with no separation between "compute distance-to-light" and "take
2×p90."

#### Proposed solution

Extract `function chamferDistance(mask, w, h)` → `Float32Array` (the two sweeps) and let
`strokeWidthP90` call it and apply `2 * quantile(dists, 0.9)` (reusing the shared `quantile`). Names
the two concepts separately and makes the distance transform available to other morphology-adjacent
code.

#### Verification

`tests/solid-regions.test.mjs` `strokeWidth` values unchanged; the extracted `chamferDistance` can
get a direct unit test.

## Source: Code audit — tools/asset-gen · tests / samples / legacy

### [P2][duplication] `capture-current.mjs` reimplements the shared `chromiumExecutablePath` helper instead of importing it

**File(s):** `tools/asset-gen/crayon-brush-samples/capture-current.mjs:26-46` (Chromium resolver) —
pinned at SHA f934d43

#### Problem

The file already imports from `scripts/lib/` (line 16, `scrapbook-chrome.mjs`), yet it hand-rolls a
20-line copy of the exact Playwright-Chromium fallback that already exists as an exported helper in
`scripts/lib/utils.mjs:82` (`chromiumExecutablePath(chromium)`), whose body is a near-identical
`readdirSync(base).filter(/^chromium-\d+$/)…` walk over `/opt/pw-browsers`. The local copy even
carries the same explanatory comment ("Cloud sessions cache a Chromium whose revision can drift…").
Two copies of cloud-environment plumbing drift independently — when the pinned-browser logic changes
(as it has before per the comment referencing `web/playwright.config.ts`), this copy is silently
left behind.

```js
function chromiumExecutablePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try { if (existsSync(chromium.executablePath())) return undefined; } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  ...
```

Note the two variants have already diverged: `utils.mjs` takes `chromium` as a parameter (it lives
in a browser-agnostic lib); the local copy closes over the module-level `chromium` import and also
honors `PLAYWRIGHT_CHROMIUM` — the drift this finding warns about is already visible.

#### Proposed solution

Import `chromiumExecutablePath` from `scripts/lib/utils.mjs` and pass the `chromium` browser type:
`executablePath: chromiumExecutablePath(chromium)`. If the `PLAYWRIGHT_CHROMIUM` env override is
worth keeping, add it to the shared helper so every caller benefits. Delete lines 26-46.

#### Verification

`grep -n "PLAYWRIGHT_BROWSERS_PATH" tools/asset-gen/crayon-brush-samples/capture-current.mjs`
returns nothing after the fix. Run `node capture-current.mjs` against a running `/dev/engine`
harness and confirm it still launches and screenshots.

---

### [P2][test-quality] `light-fill-cli` gate-result arrays are magic sequences silently coupled to `MAX_ATTEMPTS = 5`

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs:122,150,164,189` (per-test
`state.gateResults`) — pinned at SHA f934d43

#### Problem

The mock outline-match gate (lines 30-43) `shift()`s from a shared queue `state.gateResults`; each
test seeds that queue with a bare boolean array whose length silently encodes the CLI's retry count:

```js
state.gateResults = [false, false, false, false, false, true]; // line 122
```

That is exactly `MAX_ATTEMPTS` (5, defined at `bin/gen-coloring-fills.mjs:157`) failures for
`first-tall` followed by one pass for `second-tall`. Nothing in the test names or explains the count
of five — a reader must cross-reference the CLI's retry constant to understand why six entries
produce "1 failed". Other tests use `state.gateResults = []` (lines 164, 189) with a
`// every attempt misses a gate` comment, relying on `shift()` on an empty array returning
`undefined` (falsy). If `MAX_ATTEMPTS` changes to 4 or 6, line 122's array is wrong and the test
breaks or, worse, passes for the wrong reason (page 2 consuming a `false` meant for page 1's
attempts).

#### Proposed solution

Import `MAX_ATTEMPTS` from the CLI (or have the CLI export it) and build the sequences
programmatically: `Array(MAX_ATTEMPTS).fill(false)` for an exhausted page, `.concat([true])` for a
following pass. Add a helper `const allFail = () => Array(MAX_ATTEMPTS).fill(false)` so intent is
named. The empty-array "misses every gate" cases should use the same named helper rather than
relying on `undefined`.

#### Verification

Temporarily change `MAX_ATTEMPTS` in the CLI and confirm the tests still pass (they should, once the
arrays are derived from it) rather than breaking on a hardcoded length.

---

### [P2][architecture] `light-fill-cli` tests exercise the CLI through import side effects and match error strings, making them brittle

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs:86-90,124,193` (`runCli` + error
assertions) — pinned at SHA f934d43

#### Problem

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
re-run it — and (b) the exact prose of a log/throw string that is not a stable contract. A reworded
error message ("1 page failed to render.") silently fails the suite even when behavior is correct.

#### Proposed solution

Have `bin/gen-coloring-fills.mjs` export an `async function run(argv)` that returns a structured
result (`{ failed: number, shipped: [...] }`) and throws a typed error, with the
`if (isMainModule) run(process.argv)` guard calling it. Tests then call `run([...])` directly and
assert on `result.failed === 1` rather than a message string, dropping the `resetModules`/`argv`
dance.

#### Verification

The tests no longer reference `process.argv` or `import('../bin/...')`;
`grep -n "toThrow('1 render" tools/asset-gen/tests/light-fill-cli.test.mjs` returns nothing. Suite
still passes.

---

### [P2][duplication] Proof-sheet client hardcodes `OUTLINE_LUMA = 150`, duplicating the punch threshold that can drift out from under it

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:8` (constant)
— pinned at SHA f934d43

#### Problem

```js
const OUTLINE_LUMA = 150; // asset-gen's punch threshold (lib/punch-fill.mjs)
```

This is a copy of `OUTLINE_LUMA_THRESHOLD = 150` exported from
`tools/asset-gen/lib/punch-fill.mjs:35` and used at line 125 there. The proof sheet's whole purpose
is to faithfully approximate the shipped punch (see the `buildFills` comment at lines 36-43); if the
pipeline's punch threshold is retuned, this client keeps masking at 150 and the proof sheet lies
about what ships. The comment binding the two is not enforcement. The client is a browser script
with no build step so it cannot `import` the constant directly — but the generator already injects
`window.__COLORING_BOOK_PROOF_SHEET__` (line 6), so the value can travel in that blob.

#### Proposed solution

Have `bin/gen-coloring-book-proof-sheet.mjs` import `OUTLINE_LUMA_THRESHOLD` from
`lib/punch-fill.mjs` and include it in the injected JSON (`{ cells, source, outlineLuma }`); read
`SOURCE`-side `outlineLuma` in the client instead of the literal `150`. Same treatment removes the
drift for any other pipeline constant the client mirrors.

#### Verification

Change `OUTLINE_LUMA_THRESHOLD` in `punch-fill.mjs`, regenerate a proof sheet, and confirm the
client's masking follows without editing the client.

---

### [P3][duplication] The `--flag=value` `arg()` parser is copy-pasted across the crayon-sample scripts, and `build-sheet` re-inlines it

**File(s):** `tools/asset-gen/crayon-brush-samples/build-compare-sheet.mjs:20-21`,
`capture-current.mjs:21-22`, `build-sheet.mjs:133-135` — pinned at SHA f934d43

#### Problem

Two files carry a byte-identical helper:

```js
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
```

`build-sheet.mjs` then parses `--artifact=` a *third* way inline
(`process.argv.find(a => a.startsWith('--artifact='))?.slice('--artifact='.length)`), so the same
folder resolves the same flag three different ways. The `name.length + 3` in the shared copy is
itself an unexplained magic offset (`--` + `=` = 3 chars).

#### Proposed solution

Add a small `argFlag(name, fallback)` to `scripts/lib/scrapbook-chrome.mjs` (already imported by all
three) or a sibling `scripts/lib/args.mjs`, computing the prefix once (`const p = \`--${name}=\`;
…slice(p.length)`) so the offset is derived, not magic. Route all three call sites through it.

#### Verification

`grep -rn "startsWith(\`--\${name}"
tools/asset-gen/crayon-brush-samples/`returns no local definitions; each script still honors`--renders=`,`--out=`,`--artifact=`.

---

### [P3][duplication] `buildHalf` repeats the same "create span, set class + text, append" block five times

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:136-204`
(function), esp. 152-179 (note spans) — pinned at SHA f934d43

#### Problem

`buildHalf` is a 68-line DOM builder in which the caption chips are hand-assembled by near-identical
five-line blocks:

```js
const note = document.createElement('span');
note.className = 'note';
note.textContent = 'no night fill';
cap.appendChild(note);
```

repeated verbatim for "no night fill" (159-163), "no chalk (inverted pen)" (164-169), "raw fill
(pre-fork fallback)" (170-175), plus structurally-identical variants for the keep chip (152-157) and
the NIGHT/LIGHT pill (176-179). The boilerplate buries the actual branching logic (which notes apply
to which theme).

#### Proposed solution

Extract
`const chip = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; cap.appendChild(s); };`
and collapse the body to guarded one-liners:
`if (theme === 'dark' && !cell.night) chip('note', 'no night fill');`. Cuts the function roughly in
half and makes the note conditions scannable.

#### Verification

Regenerate a proof sheet and confirm the caption chips (keep %, notes, NIGHT/LIGHT pill) still
render identically in both halves.

---

### [P3][maintainability] `legacy/retouch-line-art.mjs` documents a wrong invocation path and pins a superseded model

**File(s):** `tools/asset-gen/legacy/retouch-line-art.mjs:25-28` (usage), `:40` (model) — pinned at
SHA f934d43

#### Problem

The header's own usage line omits the `legacy/` segment the file was moved into:

```js
//   node --experimental-strip-types --disable-warning=ExperimentalWarning \
//     tools/asset-gen/retouch-line-art.mjs <cat/page-orient...> ...
```

The real path is `tools/asset-gen/legacy/retouch-line-art.mjs` (the sibling `legacy/README.md:15`
gets it right, so the two disagree). The `legacy/night-fills.md` runbook repeats the same wrong
path. Separately, this "kept runnable as a template" tool pins `MODEL = 'gemini-2.5-flash-image'`
(line 40) while the live pipeline and even the neighboring scratch generator
(`crayon-brush-samples/gen.mjs:19`) moved to `gemini-3.1-flash-image` — anyone who takes the file up
on its "still a handy template" offer runs it against a stale model.

#### Problem matters because

The whole reason the file was kept (not deleted) is to be an accurate one-off template; a template
with a copy-paste path that doesn't resolve and an obsolete model constant fails at its only
remaining job.

#### Proposed solution

Fix the header path to `tools/asset-gen/legacy/retouch-line-art.mjs`, and either bump `MODEL` to the
current `gemini-3.1-flash-image` or add one explicit line stating the model is intentionally frozen
at 2.5 for era fidelity. Whichever the maintainer intends, make it deliberate rather than stale.

#### Verification

Copy the header's invocation verbatim and confirm Node resolves the file.
`grep -rn "gemini-2.5" tools/asset-gen/` to see whether any live path still pins it.

---

### [P3][complexity] `render()` and `buildHalf()` are long, multi-branch functions carrying the proof sheet's whole draw model

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:84-125`
(`render`), `136-204` (`buildHalf`) — pinned at SHA f934d43

#### Problem

`render` (42 lines) interleaves reference-image selection, canvas sizing, a `color`-view early
return, the paper fill, and a nested `combined`-view punch-vs-draw-as-is decision (lines 112-122)
whose condition (`SOURCE === 'samples' || tile.rawFill`) re-encodes the same rawFill logic that
`buildHalf` computes separately at line 187. `buildHalf` mixes synchronous DOM scaffolding with an
async `imgsP.then` that pushes tiles and wires a click handler. Both are the kind of function where
a reader must hold the entire layer/theme/view matrix in their head at once.

#### Proposed solution

Extract the view branches of `render` into `drawColorView(ctx, tile, w, h)` and
`drawCombinedView(ctx, tile, w, h)`; hoist the "does this fill need punching" test into one named
predicate `needsPunch(tile)` used by both `render` and `buildHalf` so the rule lives once. Split
`buildHalf` into `buildCaption(cell, theme)` (sync) and `attachTile(...)` (the async wiring).

#### Verification

Regenerate a proof sheet, click through outline/color/combined on both a shipped-fill and a
samples-mode cell, and confirm the punch-vs-as-is behavior is unchanged.

---

### [P4][duplication] Two base64 image-inliners (`uri` / `dataUri`) do the same job under different names

**File(s):** `tools/asset-gen/crayon-brush-samples/build-compare-sheet.mjs:27-33` (`uri`),
`build-sheet.mjs:65-68` (`dataUri`) — pinned at SHA f934d43

#### Problem

Both scripts inline images as `data:` URIs for a self-contained scrapbook page;
`build-compare-sheet` calls it `uri` (and resizes via sharp), `build-sheet` calls it `dataUri` (and
passes through, MIME-mapped). Same concept, two names, two implementations — a reader comparing the
two sheets can't tell whether the difference is intentional. The shared scrapbook chrome lib
(`scripts/lib/scrapbook-chrome.mjs`) is the natural home and already the common import.

#### Proposed solution

Add one `inlineImage(path, { width } = {})` to `scrapbook-chrome.mjs` that resizes when `width` is
given and passes through otherwise, returning a data URI. Both scripts call it; drop the local
copies. Pick one name.

#### Verification

Rebuild both sheets and diff the emitted HTML — image `src` data URIs should be equivalent (modulo
the intended resize).

---

### [P4][test-quality] `composite-eye` hardcodes fixture-name arrays and a `length === 5` that duplicate `manifest.json`

**File(s):** `tools/asset-gen/tests/composite-eye.test.mjs:42,56,89` — pinned at SHA f934d43

#### Problem

The suite loads `manifest.json` (which already lists all five fixtures with `expectBlankOrb` flags
and `worstCoreDarkFrac` values), yet the true-positive and over-flag cases are driven by literal
arrays hardcoded in the test:

```js
for (const name of ['stegosaurus-tall', 'horse-tall']) { ... }        // line 42
for (const name of ['unicorn-tall', 'owl-tall', 'square-tall']) {...} // line 56
```

and the manifest check asserts a magic `expect(manifest.length).toBe(5)` (line 89). Add a sixth
fixture and you must update the manifest, the two arrays, and the count — three places that silently
disagree until someone notices. The manifest is the source of truth but isn't used to drive the
parametrized cases.

#### Proposed solution

Derive the two loops from the manifest: `manifest.filter(e => e.expectBlankOrb)` and
`manifest.filter(e => !e.expectBlankOrb)`. Drop the magic `5` (or assert against `manifest.length`
dynamically elsewhere). The manifest's `worstCoreDarkFrac` values can also feed the margin
assertions instead of recomputing.

#### Verification

Add a dummy manifest entry (with fixtures) and confirm the parametrized tests pick it up without
editing the test body.

---

### [P4][duplication] The comp/light/pen fixture-loading trio is duplicated between two eye test suites

**File(s):** `tools/asset-gen/tests/composite-eye.test.mjs:24-33` (`FIXTURES` + `score`),
`tools/asset-gen/tests/golden-catalog.test.mjs:8-20` (`FIXTURES` + `scoreFixture`) — pinned at SHA
f934d43

#### Problem

Both suites compute the same
`FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/composite-eye')` and both open
the identical `${name}.comp/.light/.pen.webp` trio with a `Promise.all([readFile…])` before scoring.
The read boilerplate (the load, not the scoring) is copy-pasted; a change to the fixture layout
(e.g. adding a `.chalk` sidecar) touches two files.

#### Proposed solution

Add `tests/fixtures/composite-eye/load.mjs` exporting
`loadTrio(name) => Promise<{comp, light, pen}>` (and the `FIXTURES` dir constant). Both suites
import it and layer their own scoring on top.

#### Verification

Both suites still pass; `grep -rn "fixtures/composite-eye')" tools/asset-gen/tests/*.test.mjs` shows
the path defined once.

---

### [P4][naming] `build-sheet.mjs` documents a spurious `--experimental-strip-types` invocation it doesn't need

**File(s):** `tools/asset-gen/crayon-brush-samples/build-sheet.mjs:6` (header usage) — pinned at SHA
f934d43

#### Problem

```js
//   node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs
```

Those flags exist only to let Node import TypeScript. `build-sheet.mjs` imports
`scrapbook-chrome.mjs` and `./samples.mjs` — both plain ESM, no `.ts` anywhere. The flags are
cargo-culted from the sibling `gen.mjs:5`, which genuinely needs them (it imports
`geminiSafety.ts`). A reader copying the documented command runs `build-sheet.mjs` with meaningless
flags and may assume it depends on TS tooling it doesn't.

#### Proposed solution

Change the header to `node build-sheet.mjs [--artifact=<path>]`. Audit the other crayon scripts:
`capture-current.mjs` and `build-compare-sheet.mjs` likewise import no TS and should document a
plain `node …` invocation; only `gen.mjs` keeps the strip-types flags.

#### Verification

`node tools/asset-gen/crayon-brush-samples/build-sheet.mjs` (with an `out/` dir present) runs
without the flags. `grep -l "geminiSafety.ts\|\.ts'" tools/asset-gen/crayon-brush-samples/*.mjs`
shows only `gen.mjs` importing TS.

---

### [P4][naming] `keepClass` uses unexplained 99/96 buckets that disagree with the actual keep gate

**File(s):**
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:132-134` —
pinned at SHA f934d43

#### Problem

```js
function keepClass(keep) {
  return keep >= 99 ? 'good' : keep >= 96 ? 'ok' : 'warn';
}
```

The two magic thresholds have no named constant or comment, and they silently disagree with the
pipeline's real bar: `KEEP_THRESHOLD = 0.92` (92%) in `lib/outline-match.mjs:38`. A page that
*passed* the gate at 93% renders as a red `warn` chip in the proof sheet, which reads as a failure
to a reviewer. Whether that stricter review bar is intentional is undocumented.

#### Proposed solution

Name the thresholds (`const KEEP_GOOD = 99, KEEP_OK = 96;`) with a one-line comment explaining they
are *review* buckets deliberately stricter than the 92% ship gate — or align/inject them from the
pipeline constant if they were meant to match. Either way, make the relationship explicit.

#### Verification

Regenerate a proof sheet for a category with a low-90s keep score and confirm the chip color matches
the documented intent.

---

### [P4][naming] `outline-targets` test still frames backslash handling as "Windows-style" after Windows support was dropped

**File(s):** `tools/asset-gen/tests/outline-targets.test.mjs:115-122` — pinned at SHA f934d43

#### Problem

```js
test('normalizes Windows-style target separators', async () => {
  await expect(resolveOutlineTargets(['nature\\ant-tall'], options())).resolves.toEqual([...]);
```

Per the root `CLAUDE.md`, Windows dev support was dropped (ADR-0062). The behavior under test —
normalizing a backslash a user typed into a target argument — may still be desirable, but naming it
"Windows-style separators" now points at a platform the project no longer supports, misleading a
reader into thinking this guards a live cross-platform concern.

#### Proposed solution

If backslash normalization is still wanted, rename the test to describe the actual contract
("normalizes backslash separators in target args") and drop the Windows framing. If it was only
there for Windows, consider whether the case (and the normalization code it guards in
`lib/outline-targets.mjs`) is now dead.

#### Verification

Confirm with the maintainer whether backslash targets are still a supported input; rename or delete
accordingly. The assertion behavior is unaffected by a rename.

---

### [P5][readability] Inconsistent `test(` vs `it(` across the pipeline test suite

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs`,
`tools/asset-gen/tests/outline-targets.test.mjs` (use `test`) vs the other 11 suites (use `it`) —
pinned at SHA f934d43

#### Problem

Eleven of the thirteen `.test.mjs` files use `it(...)`; only `light-fill-cli.test.mjs` and
`outline-targets.test.mjs` use `test(...)`. Both are valid Vitest aliases, but the split is
arbitrary — it tracks nothing meaningful (both styles cover CLI and gate tests) and adds a small
grep/consistency tax when scanning the suite.

#### Proposed solution

Pick one (the `it(...)` majority) and convert the two outliers, or codify the choice in the testing
rule so it's a decision rather than an accident.

#### Verification

`grep -c "\btest(" tools/asset-gen/tests/*.test.mjs` shows zero after conversion (or a documented,
uniform choice).

---

### [P5][readability] Typo "PIXEL GEOMTRY" in the synthetic-fixtures rationale comment

**File(s):** `tools/asset-gen/tests/fixtures/synthetic.mjs:4` — pinned at SHA f934d43

#### Problem

```js
// gates score PIXEL GEOMTRY (solid-region area, ring-nesting depth, ...
```

"GEOMTRY" → "GEOMETRY". This comment is the load-bearing explanation for *why* the whole fixture
file is synthetic rather than recovered assets, so it's read often; the typo in an emphasized
all-caps phrase is more visible than most.

#### Proposed solution

Fix to `PIXEL GEOMETRY`.

#### Verification

`grep -n GEOMTRY tools/asset-gen/tests/fixtures/synthetic.mjs` returns nothing.

---

**Note on `legacy/` scope:** the subtree is *not* orphaned dead code — `legacy/README.md`
deliberately archives it as retired-technique history, and the root/asset-gen `CLAUDE.md` documents
it as a kept reference ("borrow from legacy, don't follow it"). `retouch-line-art.mjs` is
unreferenced by any live code path or npm alias (confirmed via grep), which is consistent with that
intent. So the only actionable legacy finding is the stale header path + model constant above, not
deletion.

## Source: Code audit — tools/asset-gen · ideas-exploration (R&D scratch)

### [P1][discoverability] README scoreboard and "do first" list are stale — most ideas already graduated into the live pipeline, but nothing here says so

**File(s):** `tools/asset-gen/ideas-exploration/README.md` (lines 28–75, the scoreboard + "What a
follow-up session should probably do first") — pinned at SHA f934d43

#### Problem

The README presents all 25 ideas as an open backlog "intended for a follow-up session to review and
decide what to promote," with a prioritized list of patches to "land." But that follow-up already
happened: at least ~20 of the 25 have shipped into `tools/asset-gen/bin/` and `lib/`. Concrete
evidence at this SHA:

* idea-7 → `bin/audit-night-halo.mjs` + `lib/night-halo.mjs`
* idea-13 → `bin/audit-invented-shapes.mjs` + `lib/invented-shapes.mjs`
* idea-23 → `bin/audit-golden.mjs` + `lib/golden-catalog.mjs` + `lib/night-scores.mjs`
* idea-25 → `bin/gen-asset-manifest.mjs`
* idea-10 → `lib/page-notes.mjs`
* idea-12 → `bin/audit-fill-eyes.mjs`
* idea-6 → `bin/audit-outline-solidity.mjs`, `bin/normalize-outline-strokes.mjs`
* idea-22 → `lib/night-composite.mjs`
* idea-17 → became the default model, documented in `tools/asset-gen/docs/gemini-3.1-migration.md`
* idea-11, idea-4, idea-19, idea-21, idea-24 → all recorded as landed in
  `docs/gemini-3.1-migration.md`

A newcomer reading this README today would re-do work that is already done. The document reads as a
live TODO but is actually a historical record whose recommendations were all executed.

#### Proposed solution

Add a **Status** column to the scoreboard table (lines 30–56): one of `LANDED → <path>` /
`SUPERSEDED` / `NOT PROMOTED`, with the graduated ideas pointing at their live `bin/`/`lib/` file or
the `gemini-3.1-migration.md` run record. Replace the "What a follow-up session should probably do
first" section (lines 58–75) with a short "What landed" retrospective, or delete it and defer to
`area:asset-gen` GitHub issues for anything still open. `docs/gemini-3.1-migration.md` already has
the landing facts — cross-link it from this README.

#### Verification

For each idea claimed LANDED, confirm the named `bin/`/`lib/` file exists at this SHA (it does — see
the `ls bin/ lib/` output) and that `docs/gemini-3.1-migration.md` names the idea number. Confirm no
scoreboard row still implies pending work that has in fact shipped.

---

### [P1][duplication] Graduated `idea-N/code/*.mjs` files are now drifted ancestors of live `bin/`/`lib/` files, with no pointer marking them frozen

**File(s):** `tools/asset-gen/ideas-exploration/idea-25/code/gen-asset-manifest.mjs`,
`idea-10/code/page-notes.mjs`, `idea-7/code/audit-night-halo.mjs` (and the other graduated code
dirs) — pinned at SHA f934d43

#### Problem

Several exploration scripts share a filename with the live version but have already drifted from it:

* `idea-25/code/gen-asset-manifest.mjs` (88 lines) vs `bin/gen-asset-manifest.mjs` (92 lines) —
  differs
* `idea-10/code/page-notes.mjs` (82 lines) vs `lib/page-notes.mjs` (90 lines) — differs
* `idea-7/code/audit-night-halo.mjs` vs `bin/audit-night-halo.mjs` — differs

These are legitimately-frozen snapshots, but nothing in the file or its directory says "this is a
frozen ancestor; the maintained copy is `lib/page-notes.mjs`." A `grep`/search for a function will
surface both, and someone could edit or copy the stale exploration version thinking it's current. No
`report.md` records where its code graduated (`grep -li 'graduated|now live|promoted'` across all
reports returns nothing).

#### Proposed solution

Add a one-line "Landed as: `../../bin/gen-asset-manifest.mjs`" (or "Superseded by …") banner to the
top of each graduated `report.md`, and/or a `LANDED.md` stub in each graduated `code/` dir. The
README status column (previous finding) is the systemic fix; this is the per-idea backstop so the
pointer survives even when someone lands directly in a `code/` dir.

#### Verification

`diff ideas-exploration/idea-10/code/page-notes.mjs lib/page-notes.mjs` shows drift today; after the
fix, each graduated report/dir names its live counterpart. Spot-check that every idea in the
scoreboard marked LANDED has a matching back-pointer.

---

### [P2][dead-code] `build-review.mjs` output claims "nothing here is committed" and references the deleted `IDEAS.md` — both false now

**File(s):** `tools/asset-gen/ideas-exploration/build-review.mjs` (lines 213, 224) — pinned at SHA
f934d43

#### Problem

The generated dashboard (the primary review surface per the README and parent `CLAUDE.md`) prints
two stale claims baked into `build-review.mjs`:

* Line 213 subtitle: "One subagent per idea from `tools/asset-gen/IDEAS.md`…" and "${done} of 25
  ideas explored **so far**" — `IDEAS.md` no longer exists (moved to `area:asset-gen` GitHub issues,
  per the README's own header note), and "so far" implies in-progress when all 25 are done.
* Line 224 footer: "Repo state was reverted to baseline (8e471b8) after every attempt — **nothing
  here is committed**." The entire folder is committed; this line is now self-contradicting.

The committed `ideas-review.html` embeds these strings verbatim (`grep` confirms "nothing here is
committed" and one `tools/asset-gen/IDEAS.md` reference in the HTML), so anyone opening the
dashboard sees the false claims.

#### Proposed solution

Update the subtitle to describe the burn-down as complete and historical (drop "so far", point at
`area:asset-gen` issues instead of `IDEAS.md`), and rewrite the footer to say the folder is a
committed frozen record whose per-attempt repo state was reverted. Then regenerate
`ideas-review.html` with `node build-review.mjs`.

#### Verification

After editing and regenerating, `grep -a 'nothing here is committed' ideas-review.html` returns
nothing and `grep -a 'IDEAS.md' ideas-review.html` returns nothing (or only a deliberate historical
mention).

---

### [P2][organization] 2.4 MB `idea-14/warp-both.json` is a raw per-tile coordinate dump that dwarfs its report — prune or summarize

**File(s):** `tools/asset-gen/ideas-exploration/idea-14/warp-both.json` (2.4 MB) — pinned at SHA
f934d43

#### Problem

`warp-both.json` is a 2.4 MB intermediate scan dump — per-page, per-theme, per-tile grid data with
absolute machine paths (`/home/user/Splotch/…`). It is the single largest non-image file in the
folder and accounts for most of the ~198k lines of JSON here. It is a regenerable intermediate of
`warp-scan.mjs`, not evidence a reviewer reads; the report's conclusion ("4 genuinely warped pages")
is a handful of page names. Committing it bloats the repo and embeds absolute paths that are
meaningless on any other machine.

#### Proposed solution

Delete `warp-both.json` (it regenerates from `idea-14/code/warp-scan.mjs`), or replace it with a
small `warp-summary.json` holding only the 4 flagged pages + scores. Same treatment merits a look
for the other large raw dumps: `idea-7/scores-baseline.json` + `scores-rimerase.json` (~92 KB each),
`idea-3/disagreement*.json` (~85 KB), `idea-2/whitened-inventory.json` (69 KB) — keep the ones a
reviewer actually consults, drop pure intermediates.

#### Verification

`find ideas-exploration -name '*.json' ! -name meta.json -printf '%s %p\n' | sort -rn | head` no
longer shows a multi-MB file; `du -sh ideas-exploration` drops meaningfully from 66 MB. Confirm
`warp-both.json` is not referenced by any `report.md` or `meta.json` before deleting.

---

### [P2][organization] Committed 5.2 MB `ideas-review.html` is fully regenerable from `build-review.mjs` + the `meta.json` files

**File(s):** `tools/asset-gen/ideas-exploration/ideas-review.html` (5.2 MB) — pinned at SHA f934d43

#### Problem

`ideas-review.html` is a build product: `build-review.mjs` re-derives it from every
`idea-N/meta.json` plus the evidence webp/png (which are themselves already committed). The 5.2 MB
HTML re-encodes all those images as inline base64 — a second copy of already-committed assets — and,
as the previous finding shows, it goes stale the moment `build-review.mjs`'s hardcoded strings
change. It is the biggest single file in the section.

#### Proposed solution

Decide explicitly, and record the decision in the README: either (a) gitignore `ideas-review.html`
and document `node build-review.mjs` as the one-step regen (the README already documents the command
at line 20–21), accepting a build step before viewing; or (b) keep it committed for zero-friction
browser viewing but add a note that it is generated — do not hand-edit — and treat it as needing a
regen whenever `build-review.mjs` or any `meta.json` changes. Given the folder is frozen, (b) with a
stale-output guard, or (a), are both defensible; the current state (committed, silently stale) is
the worst of both.

#### Verification

Either `.gitignore` lists `ideas-exploration/ideas-review.html` and it's untracked, or the
README/file header states it is generated and it matches a fresh `node build-review.mjs` run
(byte-diff modulo the image re-encode).

---

### [P3][organization] Full-resolution `.webp` outputs committed *inside* `code/` directories (idea-8, idea-9)

**File(s):**
`tools/asset-gen/ideas-exploration/idea-8/code/ant-wide.night.conditioned.fullres.webp`,
`idea-9/code/dragon-wide.light.conditioned.fullres.webp` — pinned at SHA f934d43

#### Problem

Every other idea keeps evidence images at the idea root and downsized (≤560 px per the README layout
contract at line 135), and reserves `code/` for scripts, patches, and small JSON. These two
full-resolution generated images live inside `code/`, breaking the "code/ holds code" convention and
smuggling large binaries past the ≤560 px evidence norm. They read as leftover generation output
that was never moved or downsized.

#### Proposed solution

Move them up to their idea root alongside the other evidence and downsize to the ≤560 px convention
(or drop them if the report's other evidence already makes the point), so `code/` contains only
scripts/patches/registries.

#### Verification

`find ideas-exploration -path '*/code/*' \( -name '*.webp' -o -name '*.png' \)` returns nothing.

---

### [P3][duplication] idea-2 ships three near-identical `motif-registry*.json` with no note on which is canonical

**File(s):** `tools/asset-gen/ideas-exploration/idea-2/code/motif-registry.json`,
`motif-registry-after.json`, `motif-registry-final.json` (also `idea-2/motif-registry-after.json`,
`motif-registry-final.json` at idea root) — pinned at SHA f934d43

#### Problem

idea-2 carries three registry snapshots under `code/` (md5-distinct: `…dc9`, `…327`, `…4cf`) plus
two more at the idea root, with names — `registry` / `-after` / `-final` — that imply an edit
sequence but don't say which one a reader should trust or which fed the final result. It's the kind
of "keep every intermediate" scratch accretion that makes the experiment hard to re-follow.

#### Proposed solution

Keep the one that represents the validated end state (presumably `-final`), delete or clearly label
the intermediates, and have `report.md` name the canonical file in one sentence.

#### Verification

`ls idea-2/code/motif-registry*.json` shows a single canonical file (or clearly-suffixed
before/after pair explicitly referenced by the report).

---

### [P3][naming] Inconsistent script naming across idea dirs — `idea{N}-` prefix vs descriptive vs `tmp-`

**File(s):** e.g. `idea-11/code/idea11-*.mjs`, `idea-12/code/idea12-*.mjs`,
`idea-15/code/idea15-*.mjs`, `idea-5/code/idea5-*.mjs`, `idea-17/code/*-idea17.mjs` vs
`idea-1/code/analyze-rim.mjs`, `idea-4/code/normalize-night-sky.mjs`, `idea-21/code/tmp-rects.mjs`,
`idea-21/code/tmp-shoot-sheet.mjs` — pinned at SHA f934d43

#### Problem

21 of the 60 exploration `.mjs` files embed a redundant `idea{N}` in the filename (already implied
by the directory), while 39 use plain descriptive names, and idea-17 uses a `-idea17` suffix instead
of a prefix. idea-21 additionally has two `tmp-`prefixed scripts (`tmp-rects.mjs`,
`tmp-shoot-sheet.mjs`) — the classic "throwaway I never renamed" marker — committed as if permanent.
The inconsistency is low-stakes for frozen scratch but adds friction for the "several carry finished
patches waiting to be promoted" ideas a maintainer may revisit.

#### Proposed solution

Don't churn all 60 files. As a light touch, note in the README that the `idea{N}` prefix is
incidental, and at minimum rename the two `idea-21/code/tmp-*.mjs` to describe what they do (they
generated the comparison sheets) or delete them if superseded by the landed
`contact-sheet-git-source-and-compare.patch` in the same dir.

#### Verification

`find ideas-exploration -name 'tmp-*'` returns nothing; the README notes the naming convention.

---

### [P3][discoverability] `report.md` files carry no back-reference to their outcome (landed / open issue) or to the live code

**File(s):** all `tools/asset-gen/ideas-exploration/idea-*/report.md` — pinned at SHA f934d43

#### Problem

`grep -li 'graduated|now live|landed in|promoted to'` across all 25 reports returns nothing. Each
report is a self-contained narrative of what was tried, but has no header line stating the final
disposition — whether it shipped (and where), was superseded, or remains an open `area:asset-gen`
issue. Combined with the stale README (P1), a reader has to reverse-engineer each idea's real-world
status by cross-referencing `bin/`/`lib/` and `docs/gemini-3.1-migration.md` themselves.

#### Proposed solution

Add a one-line status banner to the top of each `report.md`:
`Status: LANDED as bin/audit-golden.mjs (see docs/gemini-3.1-migration.md)` /
`Status: OPEN — area:asset-gen #NNN` / `Status: NOT PROMOTED`. This is the per-file complement to
the README status column and survives README churn.

#### Verification

Every `report.md` opens with a `Status:` line; the LANDED ones name a file that exists at this SHA.

---

### [P3][architecture] Ad-hoc scoring/audit logic in exploration scripts was only partially extracted into `lib/` — some remains duplicated per-idea

**File(s):** `tools/asset-gen/ideas-exploration/idea-8/code/score-hue-coherence.mjs`,
`idea-9/code/score-orient-coherence.mjs`, `idea-3/code/chalk-fill-disagreement.mjs`,
`idea-14/code/analyze-warp.mjs` + `warp-scan.mjs` — pinned at SHA f934d43

#### Problem

The burn-down's biggest architectural win was extracting scoring gates into reusable libs (idea-23 →
`lib/night-scores.mjs`, idea-7 → `lib/night-halo.mjs`, idea-13 → `lib/invented-shapes.mjs`). But
several scorers that the README's cross-cutting learnings call out as real signal never graduated:
the hue-coherence scorer (idea-8, "ranks catalog"), the tall↔wide orientation-coherence scorer
(idea-9), the chalk/fill disagreement scorer (idea-3, "a dozen new flags"), and the
warp-registration scorer (idea-14, "4 genuinely warped pages"). Their logic — bgLuma, region-mean,
hue-angle math — is reimplemented inline in each script rather than sharing `lib/` primitives, and
there's no live `bin/audit-*` for these four failure classes despite each surfacing confirmed
shipped defects.

#### Proposed solution

This is a promotion decision, not a rename: for each of the four, either file/confirm an
`area:asset-gen` issue to extract it into `lib/` + a `bin/audit-*.mjs` (mirroring how idea-7/13/23
landed), or record in the report why it was deliberately not promoted. At minimum, note in the
README status column that these four are the un-promoted scorers so they don't get silently
forgotten.

#### Verification

Each of idea-3/8/9/14 has an explicit disposition (open issue link or "not promoted, because…") in
its report; any promoted scorer appears under `bin/audit-*` + `lib/`.

---

### [P4][maintainability] `build-review.mjs` silently drops any idea whose `meta.json` fails to parse

**File(s):** `tools/asset-gen/ideas-exploration/build-review.mjs` (lines 52–60, 117–119) — pinned at
SHA f934d43

#### Problem

The one maintained tool in this folder logs a bad `meta.json` to stderr and continues (`ideas.push`
skipped), so a parse error silently produces a dashboard missing that idea while `console.log` still
reports "wrote … (N ideas)". `done` (line 117) is derived from whatever survived, and the header
hardcodes "of 25" — so a dropped idea shows as "24 of 25" with no error surfaced to the viewer. All
25 `meta.json` files parse and share an identical key set today, so this is latent, not active.

#### Proposed solution

Since 25 is the known fixed count of a frozen set, have `build()` assert `ideas.length === 25` (or
compare against the `idea-*` directory count) and exit non-zero on mismatch, so a future edit that
breaks a `meta.json` fails loudly rather than quietly shrinking the dashboard.

#### Verification

Temporarily corrupt one `meta.json`, run `node build-review.mjs`, and confirm it now errors instead
of writing a 24-idea page.

---

### [P4][organization] Absolute machine paths (`/home/user/Splotch/…`) baked into committed JSON evidence

**File(s):** `tools/asset-gen/ideas-exploration/idea-14/warp-both.json`, and any other committed
intermediate JSON capturing `source`/`fill` paths — pinned at SHA f934d43

#### Problem

`warp-both.json` (and likely other scan dumps) records absolute paths like
`/home/user/Splotch/web/static/coloring/creatures/dragon-tall.outline.webp`. These are
environment-specific, meaningless on another contributor's machine, and a minor privacy/portability
smell in committed evidence.

#### Proposed solution

Largely subsumed by the P2 prune of `warp-both.json`. For any intermediate JSON that is kept, store
repo-relative paths (strip `REPO_ROOT`) — and prefer keeping only summarized evidence over full
path-laden dumps.

#### Verification

`grep -rl '/home/user/' ideas-exploration --include=*.json` returns nothing (or only files
explicitly retained with a documented reason).

---

## Summary

`tools/asset-gen/ideas-exploration/` is unusually well-documented for scratch — a consistent
`meta.json` schema across all 25 ideas, per-idea `report.md`, and a self-contained dashboard. It
earns its place in the repo as a frozen R&D record. The dominant problem is **staleness of
disposition**: the burn-down succeeded and ~20 of 25 ideas shipped into `bin/`/`lib/`, but the
README, the reports, and the generated dashboard all still read as an open backlog awaiting
promotion (P1×2, P2, P3 discoverability). The second theme is **weight**: a committed 5.2 MB
regenerable HTML, a 2.4 MB raw JSON dump, and full-res images misfiled in `code/` dirs push the
folder to 66 MB (P2×2, P3). Highest-value fixes: add a graduation/status column to the README
scoreboard and a `Status:` banner to each report, and prune the regenerable/intermediate large
files. No code was changed — report only.

## Source: Code audit — scripts · root build/dev drivers

### [P1][maintainability] Two competing Chromium-path mechanisms — one brittle and hardcoded

**File(s):** `scripts/lib/model-eval.mjs:50-51` (CHROMIUM_PATH) vs `scripts/lib/utils.mjs:82-100`
(chromiumExecutablePath); consumed by `scripts/model-eval-run.mjs:117,252`,
`scripts/model-eval-gen-inputs.mjs:63`, `scripts/model-eval-fixtures.mjs:423` vs
`scripts/driver-smoke.mjs:68`, `scripts/gen-large-image.mjs:108`, `scripts/store-shots.mjs:122` —
pinned at SHA f934d43

#### Problem

The repo has two ways to point Playwright at Chromium. The robust one,
`chromiumExecutablePath(chromium)`, self-heals when the pinned browser revision drifts (its own
comment documents exactly this failure: "the env installed 1223 while this Playwright wants 1228").
The model-eval scripts instead import a hardcoded constant:

```js
export const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
```

That pins a single revision (`chromium-1194`) and a single sub-dir (`chrome-linux`, never
`chrome-linux64`) — the precise brittleness `chromiumExecutablePath` was written to fix. When the
browser bumps, every `model-eval*` script breaks with "Executable doesn't exist" while the smoke/gen
scripts keep working, and a reader can't tell why two scripts resolve Chromium differently.

#### Proposed solution

Delete `CHROMIUM_PATH` from `lib/model-eval.mjs` and have all five model-eval call sites use
`chromiumExecutablePath(chromium)` from `lib/utils.mjs`, matching the other browser-driving scripts.
Keep `PLAYWRIGHT_CHROMIUM_PATH` support by folding it into the existing `PLAYWRIGHT_CHROMIUM`
override in `chromiumExecutablePath` (or aliasing it).

#### Verification

`grep -rn CHROMIUM_PATH scripts/` returns nothing after the change; run
`npm run model-eval:fixtures` (no network needed for fixtures) and confirm the browser launches.
Simulate drift by pointing `PLAYWRIGHT_BROWSERS_PATH` at a dir with a different `chromium-<n>` and
confirm both model-eval and driver-smoke still resolve a binary.

---

### [P1][duplication] Release-bundle `.aab` path hardcoded three times

**File(s):** `scripts/release.mjs:155-164` (aab), `scripts/android-verify.mjs:17-26` (AAB),
`package.json` `android:open` script (`android/app/build/outputs/bundle/release`) — pinned at SHA
f934d43

#### Problem

The path to the signed Android bundle is spelled out independently in at least three places:

```js
// release.mjs
const aab = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab',
);
// android-verify.mjs
const AAB = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab',
);
```

plus the directory literal in the `android:open` npm script. A Gradle output-path change (or a
variant flavor) means editing three disconnected spots; miss one and `android:verify` checks a stale
path while `release` attaches a different file. `lib/android.mjs` already exists as the home for
Android path constants but doesn't hold this one.

#### Proposed solution

Add to `scripts/lib/android.mjs`:

```js
export const RELEASE_BUNDLE_DIR = join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
);
export const RELEASE_AAB = join(RELEASE_BUNDLE_DIR, 'app-release.aab');
```

(import `ROOT` from `lib/utils.mjs`). Use `RELEASE_AAB` in `release.mjs` and `android-verify.mjs`;
point `android:open` at a tiny wrapper or have `open-path.mjs` accept a named target so the
directory isn't re-typed in `package.json`.

#### Verification

`grep -rn "outputs.*bundle.*release" scripts package.json` shows only the constant's definition. Run
`npm run android:verify` against a built bundle to confirm the resolved path still finds
`app-release.aab`.

---

### [P1][complexity] `model-eval-fixtures.mjs` embeds an 80-line browser program as a template string

**File(s):** `scripts/model-eval-fixtures.mjs:333-415` (`PAGE_JS`) — pinned at SHA f934d43

#### Problem

The entire in-page canvas renderer — `paper`, `crayon`, `strokePaths`, `drawOutline`, `revealFill`,
`revealGradient`, the `SCENES` map, `renderFixture` — lives inside one giant backtick string
assigned to `PAGE_JS` and injected via `page.evaluate(PAGE_JS)`. It's ~80 lines of dense JavaScript
with no syntax highlighting, no linting, no type checking, and no editor help; a typo surfaces only
as a runtime `pageerror`. It also silently duplicates the node-side RNG (`makeRng`/`jit`, lines
31-38) as page-side `rnd`/`jit` (lines 337-338) with the same LCG constants.

#### Proposed solution

Move the renderer to a real committed asset, e.g. `scripts/lib/model-eval-fixture-renderer.js`
(plain browser JS), and load it with `await page.addScriptTag({ path: rendererPath })` instead of
`page.evaluate(PAGE_JS)`. Now it lints/highlights like normal code. Optionally share one seeded-RNG
definition by injecting it the same way rather than maintaining two copies.

#### Verification

`npm run model-eval:fixtures` regenerates the corpus; diff a couple of output PNGs against the
pre-change versions to confirm byte-identical rendering. Confirm the file is picked up by
Prettier/eslint (no longer a string).

---

### [P1][complexity] `api-smoke.mjs` is one 320-line `run()` with ~24 inline fetch/check blocks

**File(s):** `scripts/api-smoke.mjs:25-346` (`run`) — pinned at SHA f934d43

#### Problem

`run()` is a single function that sequentially exercises admin login, the tokens auth gate, tokens
CRUD, verify-access-code, report (validation/honeypot/unconfigured/throttle), csp-report (five
formats + throttle), generate-image (raw + legacy multipart), and the shared 429 contract — all as
flat inline `await fetch(...)` + `check(...)` pairs. There are no section functions, so a reader
can't run/skim one contract in isolation, and shared request shapes (the JSON POST, the bearer
header) are re-typed at every call.

#### Proposed solution

Split into named async suites called from `run()`: `checkAdminAuth(base)`,
`checkTokensCrud(base, auth)`, `checkVerifyAccessCode`, `checkReport`, `checkCspReport`,
`checkGenerateImage`, `checkThrottling`. Hoist the repeated request helpers
(`postJson(path, {headers, body})`, `authHeader(session)`) to the top or to `lib/`. Each suite still
calls the shared `check()`/`fatal()` reporter, so totals are unaffected.

#### Verification

`npm run test:api:smoke` prints the same pass/fail tally and exit code as before. The section
functions make it possible to comment one out and see only that block skipped.

---

### [P2][duplication] Run-id timestamp format duplicated across report scripts

**File(s):** `scripts/redteam-run.mjs:33`, `scripts/model-eval-run.mjs:47-49` — pinned at SHA
f934d43

#### Problem

Both scripts mint a filesystem-safe run id the same way:

```js
new Date().toISOString().replace(/[:.]/g, '-'); // redteam-run
new Date().toISOString().replace(/[:.]/g, '-') + (OUT_TAG ? `-${OUT_TAG}` : ''); // model-eval-run
```

Same regex, same intent, independently maintained.

#### Proposed solution

Add
`export const runId = (tag) => new Date().toISOString().replace(/[:.]/g, '-') + (tag ?`-${tag}`: '');`
to `scripts/lib/utils.mjs` and use it in both scripts.

#### Verification

`grep -rn "replace(/\[:.\]/g" scripts/` shows only the helper. Run both scripts (or the
fixture/report-only paths) and confirm output dirs are still named `2026-...`.

---

### [P2][duplication] OS "open a file" logic implemented twice, differently

**File(s):** `scripts/open-path.mjs:16` and `scripts/redteam-run.mjs:266-275` (`openInBrowser`) —
pinned at SHA f934d43

#### Problem

The `darwin ? open : xdg-open` branch — which `scripts/CLAUDE.md` explicitly says belongs "behind a
branch in `scripts/lib/`" — appears in two places with divergent behavior: `open-path.mjs` runs it
through `run()` (blocking, exits on failure), while `redteam-run.mjs` re-derives the same branch and
spawns detached+unref best-effort:

```js
const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
```

The platform knowledge is duplicated and will drift.

#### Proposed solution

Add one helper to `lib/utils.mjs`, e.g. `openInОS(target, { detached = false } = {})` that owns the
`open`/`xdg-open` selection and both spawn modes. `open-path.mjs` calls it blocking;
`redteam-run.mjs` calls it detached. Single source for the opener.

#### Verification

`grep -rn "xdg-open" scripts/` shows only the helper. Run `npm run android:open` (reveals a folder)
and `npm run redteam` end (opens the report) on Linux and macOS.

---

### [P2][consistency] Playwright imported from two different packages

**File(s):** `scripts/model-eval-run.mjs:17`, `scripts/model-eval-gen-inputs.mjs:13`,
`scripts/model-eval-fixtures.mjs:22` (`from 'playwright'`) vs `scripts/driver-smoke.mjs:10`,
`scripts/gen-large-image.mjs:14`, `scripts/store-shots.mjs:12` (`from '@playwright/test'`) — pinned
at SHA f934d43

#### Problem

Half the browser-driving scripts import `chromium` from `playwright`, the other half from
`@playwright/test`. They resolve to the same runtime, but the split is arbitrary, invites confusion
about which package is the dependency, and pairs with the CHROMIUM_PATH inconsistency above (the
`playwright` importers are exactly the ones using the brittle path). It also matters for the
inverted deps rule (ADR-0070): whichever package the web build doesn't need should be consistent.

#### Proposed solution

Pick one import specifier for all script-side Chromium launches (align with whatever
`web/playwright.config.ts` and the deps split intend) and apply it across all six scripts.

#### Verification

`grep -rn "import { chromium }" scripts/` shows a single specifier. Run `npm run test:driver:smoke`
and `npm run model-eval:fixtures`.

---

### [P2][architecture] Red-team HTML report built inline; model-eval's equivalent was extracted to lib

**File(s):** `scripts/redteam-run.mjs:113-263`
(`esc`/`dataUri`/`outputCell`/`rowHtml`/`sectionHtml`/`writeReport`) vs
`scripts/lib/model-eval-report.mjs` — pinned at SHA f934d43

#### Problem

`model-eval-run.mjs` cleanly delegates report generation to `lib/model-eval-report.mjs`
(`buildReport(...)`), keeping the runner about running. The sibling `redteam-run.mjs` instead
carries ~150 lines of report machinery — inline HTML, a full `<style>` block, escaping, data-URI
embedding — mixed into the runner. Two near-identical tools diverge in structure, and the redteam
runner is much harder to read as a result.

#### Proposed solution

Extract the report code into `scripts/lib/redteam-report.mjs` exporting
`buildReport({ runId, outDir, results })`, mirroring `model-eval-report.mjs`. `redteam-run.mjs`
shrinks to orchestration + calling it.

#### Verification

`npm run redteam` (or a stubbed run) still writes `report.html`/`report.json`; diff the HTML against
a pre-change run to confirm identical output.

---

### [P2][duplication] Maestro smoke flow duplicated across Android and iOS runners

**File(s):** `scripts/android-emulator-smoke.mjs:77-80` and `scripts/ios-simulator-smoke.mjs:57-63`
— pinned at SHA f934d43

#### Problem

Both device runners hardcode the same three-step flow with the same literal flow path:

```js
await sh('npm run cap:sync');
// …platform-specific build/install…
await sh(`"${maestroPath()}" [--device …] test .maestro/smoke.yaml`);
```

The `cap:sync` step, the `.maestro/smoke.yaml` path, and the maestro invocation shape are
copy-pasted; a change to the flow file name or a `cap:sync` prerequisite must be edited in two
files.

#### Proposed solution

Add `export const SMOKE_FLOW = '.maestro/smoke.yaml';` and a helper like
`runMaestroSmoke({ device } = {})` (does `sh('npm run cap:sync')` is arguably per-platform, but at
minimum share the flow constant + the maestro command builder) to `lib/smoke.mjs` or a new
`lib/native-smoke.mjs`. Both runners call it after their platform-specific install step.

#### Verification

`grep -rn "smoke.yaml" scripts/*.mjs` shows the constant only. Run `npm run test:android` (and
`test:ios` on a Mac) to confirm the flow still executes.

---

### [P2][dead-code] Windows backslash path conversions are vestigial after ADR-0062

**File(s):** `scripts/generate-icon-names.mjs:14`, `scripts/image-audit.mjs:39`,
`scripts/publish-scrapbook.mjs:100-101`, `scripts/android-setup.mjs:79` — pinned at SHA f934d43

#### Problem

Several scripts still normalize Windows separators although Windows dev support was dropped
(ADR-0062) and `scripts/CLAUDE.md` states scripts run only on macOS/Linux, where
`globSync`/`relative` never emit backslashes:

```js
.replace(/\\/g, '/')                       // generate-icon-names
const posix = (p) => relative(ROOT, p).split('\\').join('/');   // image-audit
rel.split('\\').join('/')                  // publish-scrapbook (×2)
ANDROID_HOME.replaceAll('\\', '/')         // android-setup local.properties
```

These are unreachable no-ops that imply a platform matrix the project no longer supports, and they
mildly obscure the real logic.

#### Proposed solution

Remove the backslash handling. In `image-audit.mjs` reduce `posix` to `relative(ROOT, p)`. In
`publish-scrapbook.mjs` drop the `.split('\\').join('/')`. Keep a one-line note only where a path is
written into a file that a human might open on any OS if genuinely warranted (`android-setup`
local.properties) — but per ADR-0062 it can go too.

#### Verification

`grep -rn "\\\\\\\\" scripts/*.mjs` (excluding legitimate regex escapes) is clean. Run
`npm run gen:icons`, `npm run img:audit`, `npm run scrapbook:index`, `npm run android:setup` and
confirm identical output.

---

### [P2][consistency] Missing-API-key guard written three different ways

**File(s):** `scripts/redteam-run.mjs:278` (`fail(...)`), `scripts/model-eval-run.mjs:138-141`
(`console.error`+`process.exit(1)`), `scripts/model-eval-gen-inputs.mjs:57-60`
(`console.error`+`process.exit(1)`) — pinned at SHA f934d43

#### Problem

Three scripts guard `GEMINI_API_KEY`, each with a different idiom and message shape — one uses the
shared `fail()` helper, two hand-roll `console.error` + `process.exit(1)`. The same inconsistency
appears for other required env (`REDTEAM_FIXTURE_KEY`, `ADMIN_ACCESS_TOKEN`, `TUNNEL_AUTH` in
`cloud-tunnel.mjs:22-32` with its own `die()`). Readers get inconsistent exit codes and message
formats for the identical "required env missing" case.

#### Proposed solution

Add `export const requireEnv = (name, hint) => { if (!process.env[name]) fail(`Missing ${name}${hint
? `— ${hint}` : ''}`); return process.env[name]; };` to `lib/utils.mjs`. Replace the ad-hoc guards
(including `cloud-tunnel`'s `die`) with it.

#### Verification

Unset `GEMINI_API_KEY` and run `npm run model-eval` / `npm run redteam`: both exit non-zero with the
same message shape. `grep -rn "Missing GEMINI" scripts/` shows uniform wording.

---

### [P3][duplication] Gradle-wrapper path resolved in two places

**File(s):** `scripts/gradle.mjs:15-17` and `scripts/android-emulator-smoke.mjs:78-79` — pinned at
SHA f934d43

#### Problem

`gradle.mjs` is the canonical Gradle-wrapper runner, yet `android-emulator-smoke.mjs` re-derives the
wrapper path and shell-quotes it by hand:

```js
const gradlew = join(ROOT, 'android', 'gradlew');
await sh(`"${gradlew}" :app:installDebug`, join(ROOT, 'android'));
```

The `android/gradlew` location and the `android/` cwd are now knowledge in two files.

#### Proposed solution

Export `GRADLEW` and `ANDROID_DIR` from `lib/android.mjs` and reuse them in both `gradle.mjs` and
the smoke runner. (The smoke runner needs the rejecting `sh()` rather than exiting `run()`, so it
can't call `gradle.mjs` directly, but it can share the path constants.)

#### Verification

`grep -rn "'gradlew'" scripts/` shows only the constant. Run `npm run android:apk` and
`npm run test:android`.

---

### [P3][consistency] Two different "am I the main module?" idioms

**File(s):** `scripts/gha-versions.mjs:192` (`fileURLToPath(import.meta.url) === process.argv[1]`)
vs `scripts/lint-token-styles.mjs:121` (`import.meta.url === pathToFileURL(process.argv[1]).href`) —
pinned at SHA f934d43

#### Problem

Both scripts export helpers for unit tests and guard their CLI entry, but each converts URL↔path in
the opposite direction to compare. Two idioms for one check makes the pattern harder to copy
correctly into the next testable script (and the guards are subtly different if `process.argv[1]` is
undefined).

#### Proposed solution

Add
`export const isMain = (url) => Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url;`
to `lib/utils.mjs`; call `if (isMain(import.meta.url)) main();` in both scripts (and any future
testable one).

#### Verification

`npm run deps:gha` and `npm run lint:tokens` still run; the corresponding unit tests
(`lint-token-styles.test.ts`) still import the helpers without triggering the CLI.

---

### [P3][duplication] Admin-API client duplicated between the two smoke tests

**File(s):** `scripts/api-smoke.mjs:26-106` and `scripts/blobs-smoke.mjs:44-135` — pinned at SHA
f934d43

#### Problem

Both smoke tests hit the identical admin surface — `POST /api/admin/login` → `{session}`, then
`GET/POST/DELETE /api/admin/tokens` with a `Bearer` header — and each reimplements the request
plumbing (`blobs-smoke` has `post()`/`del()`/`login()`; `api-smoke` inlines the same calls). The
login-and-get-session dance and the tokens JSON shapes are maintained twice.

#### Proposed solution

Extract a tiny client to `lib/`, e.g. `adminClient(base)` returning
`{ login(secret), listTokens(auth), addToken(auth, t), delToken(auth, t) }`. Both smoke scripts
build their assertions on top of it; the retry-through-429 login in `blobs-smoke` can be a flag.

#### Verification

`npm run test:api:smoke` and (against a deploy) `npm run test:blobs:smoke` produce the same
assertions; the shared client is exercised by both.

---

### [P3][maintainability] `store-shots.mjs` uses raw app selectors that bypass the rot-guarded driver

**File(s):** `scripts/store-shots.mjs:148,150,164,166,179,189` — pinned at SHA f934d43

#### Problem

`scripts/CLAUDE.md` explains that `app-driver.mjs` is the selector-facing layer, guarded against
markup rot by `test:driver:smoke`. But `store-shots.mjs` reaches into the DOM with its own raw
locators — `#coloringBookButton`, `button[aria-label="Farm coloring book"]`,
`button[aria-label="Farm coloring page"]`, `.color-swatch[data-color="custom"]`, `#parentHelpButton`
— that the driver doesn't own and the smoke test never touches. When that markup changes,
`gen:shots` silently breaks exactly the way the driver rot-guard was built to prevent, but for
selectors it can't see.

#### Proposed solution

Add driver functions for these interactions (`openColoringBook(page)`, `pickBook(page, name)`,
`pickPage(page, name)`, `openColorPicker(page)`, `openParentCenter(page)`) to `lib/app-driver.mjs`,
and have `store-shots.mjs` call them. Then extend `driver-smoke.mjs` to exercise at least the
coloring-book entry so CI catches the rot.

#### Verification

`grep -n "aria-label\|color-swatch\|Button'" scripts/store-shots.mjs` shows no raw locators.
`npm run test:driver:smoke` passes and now covers the coloring-book path; `npm run gen:shots` still
produces all five scenes.

---

### [P3][complexity] `store-shots.mjs` five scenes inline in a loop with magic waits

**File(s):** `scripts/store-shots.mjs:130-195` (scene loop), sleeps at `150,152,164,167,182,190` —
pinned at SHA f934d43

#### Problem

The per-target loop body is five anonymous `{ … }` blocks (draw / coloring-book / color-page /
color-picker / parent-center), each opening a page, doing UI steps, screenshotting, and closing —
interleaved with bare `sleep(450)`, `sleep(500)`, `sleep(400)`, `sleep(700)` whose values are
unexplained "wait for animation/overlay" guesses. It's hard to run or reason about one scene, and
the magic delays are the kind of thing that flakes.

#### Proposed solution

Extract each scene to a named async function `sceneFreeDraw(browser, base, device, dir)`, …, and
drive them from a small array so the loop reads as `for (const scene of SCENES) await scene(...)`.
Replace magic sleeps with explicit waits (`page.waitForSelector`, `waitForFunction` on the overlay
image) or named constants (`OVERLAY_LOAD_MS`) with a comment.

#### Verification

`npm run gen:shots` regenerates all `store-assets/screenshots/**` files; visually compare a couple.
Each scene function is independently callable for debugging.

---

### [P3][naming] Brand palette hex values hardcoded in generators, duplicating the source of truth

**File(s):** `scripts/store-shots.mjs:41-49` (`C`), `scripts/gen-large-image.mjs:42-49`
(`COLOR_MAP`) vs `web/src/lib/state/colors.svelte.ts:21-53` — pinned at SHA f934d43

#### Problem

`store-shots.mjs` hardcodes `{ purple:'#AB71E1', blue:'#62A2E9', … }` and `gen-large-image.mjs`
hardcodes a `COLOR_MAP` of the same brand hexes, both re-stating the palette that already lives
authoritatively in `web/src/lib/state/colors.svelte.ts`. `model-eval` does this right — it imports
`PALETTE` from `lib/model-eval.mjs`. If a brand color is retuned, these generators silently paint
the old hue (and `pickColor` may fail to find a matching swatch).

#### Proposed solution

Import the palette from the app source (these scripts already import `.ts` via
`--experimental-strip-types` elsewhere in the repo, e.g. `check-assets.mjs`), or centralize it once
in `lib/` and have both generators plus `model-eval` consume it. At minimum add a comment
cross-linking `colors.svelte.ts` (like `gen-large-image` partially does).

#### Verification

Change a palette hex in `colors.svelte.ts`, run `npm run gen:shots` / `npm run gen:large-image`, and
confirm the output uses the new color (or that a build-time check flags the mismatch).

---

### [P3][duplication] HTML-escaping helper reimplemented per script

**File(s):** `scripts/redteam-run.mjs:113-117` (`esc`) vs `scripts/lib/scrapbook-chrome.mjs` (`esc`,
imported by `gen-icons-sheet.mjs:18`) and `lib/model-eval-report.mjs` — pinned at SHA f934d43

#### Problem

Every script that emits HTML needs the same `& < > "` escape. `gen-icons-sheet` imports `esc` from
`lib/scrapbook-chrome.mjs`; `redteam-run` hand-rolls its own `esc`; the model-eval report presumably
has a third. Three copies of one trivial-but-security-relevant function.

#### Proposed solution

Promote a single `esc()` to `lib/utils.mjs` (or a `lib/html.mjs`) and import it everywhere HTML is
generated, retiring the per-file copies.

#### Verification

`grep -rn "replace(/\[&<>" scripts/` shows one definition. Regenerate the redteam and icon-sheet
HTML and confirm identical escaping.

---

### [P4][complexity] `release.mjs` is a 150-line top-level procedure

**File(s):** `scripts/release.mjs:25-176` — pinned at SHA f934d43

#### Problem

The whole release flow runs at module top level in numbered comment sections (resolve versionCode,
bump versions, regenerate, cleanliness guard, commit+tag, publish). It's readable thanks to the
comments, but it's untestable and can't be reasoned about in pieces; the stray-file guard (96-123)
in particular is meaty logic embedded mid-script.

#### Proposed solution

Decompose into named functions — `resolveVersionCode(releaseFile)`, `bumpVersions(version, code)`,
`assertOnlyReleasePaths()`, `commitAndTag(version)`, `publish(version, body)` — invoked from a small
`main()`. The stray-path filter becomes an independently testable pure function.

#### Verification

`node scripts/release.mjs <ver> --dry-run` produces the same file changes as before; `--no-publish`
still commits+tags locally. Behavior-preserving refactor.

---

### [P4][consistency] `--check`/flag parsing done ad hoc in every gate script

**File(s):** `scripts/gen-tokens.mjs:69`, `scripts/image-audit.mjs:37`,
`scripts/publish-scrapbook.mjs:37,47`, `scripts/gha-versions.mjs:108-110` — pinned at SHA f934d43

#### Problem

Each script re-implements flag detection inline: `process.argv.includes('--check')`,
`args[0] === '--index-only'`, `args.includes('--check-latest')`, `--json`, etc. It's fine at one
flag each, but there's no shared convention, so `--check` means "CI drift gate" in three scripts
with three separate parses, and a reader can't predict how a given script reads its args.

#### Proposed solution

A minimal shared `parseFlags(argv, names)` (or adopt `node:util` `parseArgs`) in `lib/utils.mjs`,
returning `{ flags, positionals }`. Not worth a heavy CLI framework, but one helper standardizes the
`--check` gate idiom the repo uses repeatedly.

#### Verification

Each gate (`gen:tokens:check`, `img:audit:check`, `scrapbook:check`, `deps:gha --check-latest`)
still behaves identically. Consistent parsing visible in a grep.

---

### [P4][consistency] Smoke/dev port numbers scattered as bare literals

**File(s):** `scripts/api-smoke.mjs:14` (5199), `scripts/redteam-run.mjs:26` (5198),
`scripts/driver-smoke.mjs:23` (4173), `scripts/gen-large-image.mjs:32` /
`scripts/store-shots.mjs:31` (4173), `scripts/cloud-tunnel.mjs:18` (5173), `scripts/blobs-smoke.mjs`
(n/a) — pinned at SHA f934d43

#### Problem

Throwaway-server ports are hardcoded per script (`5199`, `5198`, `4173`, `5173`) with
`Number(process.env.SMOKE_PORT ?? …)` wrappers duplicated. The distinct values are deliberate
(collision avoidance) but undocumented, so nothing stops a future script from reusing `4173` while
`store-shots` is running, and the `Number(env ?? default)` boilerplate repeats.

#### Proposed solution

Centralize the port registry (and a `port(name, fallback)` env helper) in `lib/`, or at least add a
one-line comment table of which script owns which port. Low urgency but improves grepability and
prevents accidental collisions.

#### Verification

`grep -rn "SMOKE_PORT\|4173\|519" scripts/` maps every port to a named owner. Smoke scripts still
boot on their ports.

---

### [P5][readability] `featureGraphicHtml` used before its declaration

**File(s):** `scripts/store-shots.mjs:205` (call) and `:218-255` (declaration) — pinned at SHA
f934d43

#### Problem

The feature-graphic block calls `featureGraphicHtml(iconB64)` at line 205, but the function is
declared at line 218 — after the top-level `await browser.close()` and the `ALL DONE` log. It works
only because `function` declarations hoist; reading top-to-bottom, the helper appears to be defined
after the script has finished.

#### Proposed solution

Move `featureGraphicHtml` (and the `shot`/`drawScene`/`colorInLines` helpers if reorganizing) above
the top-level orchestration, so definitions precede use.

#### Verification

`npm run gen:shots` still writes `feature-graphic.png`; purely a source-ordering change.

---

### [P5][duplication] Generic regex-escape helper defined locally

**File(s):** `scripts/gen-icons-sheet.mjs:35` (`escapeRe`) — pinned at SHA f934d43

#### Problem

`const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');` is a standard "escape a string
for use in a RegExp" utility defined ad hoc in one script. It's the kind of helper that gets
re-pasted; if a second script needs it, it'll be copied.

#### Proposed solution

If/when a second consumer appears, promote it to `lib/utils.mjs` as `escapeRegExp`. Low priority
while it has a single user — flagged so it's centralized rather than copied next time.

#### Verification

`npm run gen:icons-sheet` still produces the gallery with correct color remapping.

---

**Summary of highest-value themes:** the strongest wins are the cross-script duplication findings
that map onto the repo's own stated conventions — the brittle `CHROMIUM_PATH` vs
`chromiumExecutablePath` split (P1), the `.aab`/gradlew/palette/opener path constants that
`lib/android.mjs` and `scripts/CLAUDE.md` already say should be centralized (P1-P3), and the two
long procedural scripts (`api-smoke.mjs`, `model-eval-fixtures.mjs`'s embedded browser program) that
resist reading and testing. No dead *scripts* were found — every `.mjs` maps to a `package.json`
entry — but there is dead Windows-path *code* (P2) left over from ADR-0062.

## Source: Code audit — scripts · perf profiling harness

### [P1][duplication] Extract the copy-pasted CLI `flag()`/`args` parser shared by every perf entry script

**File(s):** `scripts/perf/scenario.mjs:23-32`, `scripts/perf/mount.mjs:38-47`,
`scripts/perf/ios.mjs:25-33`, `scripts/perf/undo-scenarios.mjs:39-46`,
`scripts/perf/replay-scenario.mjs:27-36` (module-scope arg parsing) — pinned at SHA f934d43

#### Problem

The exact same argument-parsing helper is defined five times:

```js
const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
```

Each site then re-derives the same flags by hand — `--no-throttle`, `--throttle`, `--no-build`,
`--device`, `--port` — with subtle divergence (e.g. `throttle` defaults to `'4'` in
scenario/mount/undo but `'0'` in replay; ios omits throttle entirely). Any fix to arg handling (e.g.
`--throttle` with no `=`, or a typo'd flag warning) has to be made in five places, and the drift is
already visible.

#### Proposed solution

Add `scripts/perf/args.mjs` exporting a parser, e.g.
`export function parsePerfArgs(argv = process.argv.slice(2))` returning
`{ flag, has, device, throttle, port, build }` with the shared defaults, and
`export const flag = (name, def, argv) => …` for the raw case. Have each entry import it instead of
re-declaring. Keep `HZ`/`long-seconds`/`scenarios`/`recording` (script-specific flags) reading
through the returned `flag`.

#### Verification

`grep -rn "const flag = (name, def)" scripts/perf` returns zero after the change; run
`npm run perf:web -- --no-build --device=tablet` and
`npm run perf:undo -- --scenarios=mixed --no-throttle` and confirm identical flag behavior.

---

### [P1][duplication] De-duplicate the `DEVICES` viewport map (triplicated verbatim)

**File(s):** `scripts/perf/scenario.mjs:17-21`, `scripts/perf/mount.mjs:20-24`,
`scripts/perf/ios.mjs:19-23` — pinned at SHA f934d43

#### Problem

The identical device table is copied into three entry files:

```js
const DEVICES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.6 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};
```

`undo-scenarios.mjs:37` and `replay-scenario.mjs:55` hardcode their own `1024×1366 @ dsf 2` variants
of the same "iPad Pro" device separately again. If the phone viewport (the primary throttled-phone
approximation) is ever retuned, three-to-five files must change in lockstep or the targets silently
diverge.

#### Proposed solution

Move the map to `scripts/perf/devices.mjs`: `export const DEVICES = { phone, tablet, desktop }` plus
`export const IPAD_PRO = { width: 1024, height: 1366, deviceScaleFactor: 2, label: 'ipad-pro-12.9' }`.
Import in all five. Optionally
`export const resolveDevice = (name) => DEVICES[name] || DEVICES.phone` to also fold in the
`DEVICES[deviceName] || DEVICES.phone` fallback repeated in scenario/mount/ios.

#### Verification

`grep -rn "width: 412" scripts/perf` returns one hit after the change; `npm run perf:web`,
`perf:mount`, `perf:ios` still produce the same `viewport` in their `metrics.json`/`settings`.

---

### [P1][complexity] Split the 90-line `driveSession` orchestrator into named stages

**File(s):** `scripts/perf/session.mjs:122-212` (`driveSession`) — pinned at SHA f934d43

#### Problem

`driveSession` does everything in one function: `mkdirSync`, observer injection, heap sampling,
trace start, the entire nine-`beat` interaction script with inline drawing-coordinate math (lines
138-181), observer/heap read, screenshot, then assembling and writing four artifact files
(`trace.json`, `metrics.json`, `summary.json`, `report.md`) and logging. The interaction
choreography (what a "toddler session" *is*) is tangled with capture plumbing and artifact I/O, so
you cannot read the scenario without wading through trace mechanics, and the drawing constants
(`box.width * 0.15`, `arcPts(... 0, Math.PI)`, etc.) are buried mid-function.

#### Proposed solution

Extract three named stages that `driveSession` calls in sequence:

* `async function runToddlerSession(page, box)` — the nine `beat(...)` calls (138-181), owning the
  scenario shape only.
* `function buildMetrics({ settings, useTrace, t0, obs, heapBefore, heapAfter })` → the `metrics`
  object (191-201).
* `function writeProfileArtifacts(outDir, { traceEvents, metrics, summary, report })` → the four
  `writeFileSync` calls + screenshot (188-207).

`driveSession` then reads as: setup → `runToddlerSession` → read observers →
`writeProfileArtifacts`. See the shared-artifact-writer finding (P2) for reusing the writer across
undo/replay.

#### Verification

`npm run perf:web -- --no-build` produces the same four files with identical structure; the
extracted `runToddlerSession` has no reference to `cdp`/`writeFileSync`.

---

### [P1][complexity] Break up `undo-scenarios.mjs main()` (170 lines) into per-scenario + artifact stages

**File(s):** `scripts/perf/undo-scenarios.mjs:306-478` (`main`) — pinned at SHA f934d43

#### Problem

`main()` runs env setup, browser launch, trace start, the full scenario loop (352-432) with dense
inline metric extraction, then ~40 lines of settings/metrics/artifact assembly (440-473). Inside the
loop, one block (374-424) pulls `engine.draw/commit/snapshot/undo` measures, computes
`historyRasterMB`, and pushes a 25-field result object — that's a distinct unit ("measure one
scenario") wedged inside the driver. The reader cannot see the scenario lifecycle without also
parsing trace-artifact bookkeeping.

#### Proposed solution

Extract:

* `async function runUndoScenario(page, base, sc, geom)` → resets engine, marks draw/undo phases,
  settles cold tier, returns the `results.push(...)` object (354-424).
* `function buildUndoSettings({ throttle, build, geom, t0 })` → the `settings` object (440-453).
* reuse the shared `writeProfileArtifacts` helper for
  `trace.json`/`metrics.json`/`summary.json`/`report.md`, leaving only the bespoke
  `undo-scenarios.{json,md}` writes here.

`main` becomes: launch → `for (sc of scenarios) results.push(await runUndoScenario(...))` → write
artifacts.

#### Verification

`npm run perf:undo -- --no-build --scenarios=short-marks` emits the same `undo-scenarios.json`
fields; `runUndoScenario` is independently callable and contains no `writeFileSync`.

---

### [P2][duplication] Collapse the repeated output-dir / timestamp / throttle-tag construction

**File(s):** `scripts/perf/scenario.mjs:41-43`, `scripts/perf/mount.mjs:50-52`,
`scripts/perf/ios.mjs:42-43`, `scripts/perf/android.mjs:114-115`,
`scripts/perf/undo-scenarios.mjs:316-318`, `scripts/perf/replay-scenario.mjs:59-61` — pinned at SHA
f934d43

#### Problem

Every entry rebuilds the profile directory the same way:

```js
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
const outDir = join(ROOT, 'perf-profiles', `${stamp}-web-${deviceName}-${throttleTag}`);
```

The `stamp` regex appears in all six files, and the `throttleTag` triplet in three. The
`perf-profiles/` path root is likewise hardcoded six times, so relocating the output root (or
changing the timestamp format the analyzer parses out of the suffix) is a six-file edit.

#### Proposed solution

Add to `scripts/perf/args.mjs` (or a `paths.mjs`):
`export const profileStamp = () => new Date().toISOString().replace(/[:.]/g, '-')`,
`export const throttleTag = (t) => (t > 1 ?`${t}x`: 'raw')`, and
`export const profileDir = (...suffixParts) => join(ROOT, 'perf-profiles', [profileStamp(), ...suffixParts].join('-'))`.
Replace the six sites.

#### Verification

`grep -rn "toISOString().replace" scripts/perf` returns one hit; each command still writes to
`perf-profiles/<timestamp>-<target>-…`.

---

### [P2][duplication] Replace the copy-pasted `main().catch` bootstrap with a shared runner

**File(s):** `scripts/perf/scenario.mjs:81-84`, `scripts/perf/mount.mjs:128-131`,
`scripts/perf/ios.mjs:75-78`, `scripts/perf/android.mjs:132-135`,
`scripts/perf/undo-scenarios.mjs:566-569`, `scripts/perf/replay-scenario.mjs:318-321` — pinned at
SHA f934d43

#### Problem

Six identical epilogues:

```js
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

`scripts/lib/utils.mjs` already centralizes `fail()`/`run()`; there is no reason each perf entry
hand-rolls its top-level rejection handling. A future improvement (stack trimming, exit-code
conventions, always calling `stop()`) would have to touch six files.

#### Proposed solution

Add
`export function runMain(main) { main().catch((err) => { console.error(err); process.exit(1); }); }`
to `scripts/lib/utils.mjs`, and end each entry with `runMain(main);`.

#### Verification

`grep -rn "main().catch" scripts/perf` returns zero; a forced throw inside any `main` still exits
non-zero.

---

### [P2][duplication] Factor out the PERF_MARKS-missing warning (five near-identical copies)

**File(s):** `scripts/perf/scenario.mjs:35-39`, `scripts/perf/ios.mjs:36-40`,
`scripts/perf/android.mjs:83-87`, `scripts/perf/undo-scenarios.mjs:310-314`,
`scripts/perf/replay-scenario.mjs:47-51` — pinned at SHA f934d43

#### Problem

The same guard is pasted five times, differing only in the suggested command:

```js
if (process.env.PERF_MARKS !== 'true') {
  console.warn(
    '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:web`.',
  );
}
```

The wording drifts between "will be absent" and "rebuild may omit engine.* marks" (android), so the
messages are inconsistent for the same condition.

#### Proposed solution

Add
`export function warnIfNoPerfMarks(command) { if (process.env.PERF_MARKS !== 'true') console.warn(`!
PERF_MARKS is not "true" — engine.* marks will be absent. Use \`${command}\`.`); }` to
`scripts/perf/args.mjs` and call `warnIfNoPerfMarks('npm run perf:web')` etc.

#### Verification

`grep -rn "PERF_MARKS is not" scripts/perf` returns one hit (the helper); running any command
without `PERF_MARKS=true` still prints one warning.

---

### [P2][duplication] Unify the three copies of the async `undoAll` drain loop

**File(s):** `scripts/perf/undo-scenarios.mjs:241-260` (`undoAll`),
`scripts/perf/replay-scenario.mjs:260-272` (undo-drain block in `replayInPage`),
`scripts/perf/ipad-console-driver.js:112-127` (`undoAll`) — pinned at SHA f934d43

#### Problem

All three implement the same "click undo, wait for the `engine.undo` measure to land, cap the stall"
pattern with the same magic `5000` ms stall cap and `60`-iteration ceiling:

```js
for (let i = 0; i < 60; i++) {
  if (!window.__engineState.canUndo) break;
  const before = completed();
  window.__engine.undo();
  const t0 = performance.now();
  while (completed() === before && performance.now() - t0 < 5000) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  ...
}
```

The comments explaining *why* the wait exists (async blob-decode restores outrunning the loop) are
duplicated too. A bug in the drain logic must be fixed in three engines (two Node in-page evaluates,
one console snippet).

#### Proposed solution

The console snippet is a standalone paste (can't import), but the two `page.evaluate` sites in
`undo-scenarios.mjs`/`replay-scenario.mjs` can share a single in-page function string. Extract
`export const UNDO_DRAIN_FN = function () { … }` (or a `pageFns.mjs` exporting the source) with
named constants `UNDO_STEP_STALL_MS = 5000` / `MAX_UNDO_STEPS = 60`, injected via `page.evaluate`.
Keep the console-driver copy but add a `// keep in sync with undo-scenarios.mjs UNDO_DRAIN_FN`
marker.

#### Verification

Both `perf:undo` and `perf:replay` drain history identically (compare `undoSteps`/`undos` counts
before and after); the two Node sites reference one source.

---

### [P2][duplication] Extract a shared `writeProfileArtifacts` for the trace/metrics/summary/report quartet

**File(s):** `scripts/perf/session.mjs:190-207`, `scripts/perf/undo-scenarios.mjs:460-465`,
`scripts/perf/replay-scenario.mjs:131-136` — pinned at SHA f934d43

#### Problem

Three drivers assemble and write the same four files with the same shapes:

```js
writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents }));
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
const summary = analyze(traceEvents, metrics);
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(join(outDir, 'report.md'), renderReport(summary));
```

Plus each builds the
`metrics = { settings, longTasks: obs.longTasks, frames: obs.frames, heap: {...} }` object
identically (session 191-201, undo 454-459, replay 125-130). The `analyze`+`renderReport`+write
sequence is exactly what `analyze.mjs`'s own `main()` (lines 509-515) also does, a fourth copy.

#### Proposed solution

Add to `analyze.mjs` (or a `report-io.mjs`):
`export function writeAnalysisArtifacts(outDir, traceEvents, metrics) { const summary = analyze(traceEvents, metrics); writeFileSync(join(outDir,'trace.json'), …); …; return { summary, report }; }`
and `export function buildMetrics({ settings, obs, heapBefore, heapAfter })`. Call from all four
sites.

#### Verification

`grep -rn "renderReport(summary)" scripts/perf` collapses to the helper; each command's four files
are byte-compatible in structure.

---

### [P2][maintainability] Name the bytes→MiB conversion (`1048576` literal appears 10×)

**File(s):** `scripts/perf/analyze.mjs:485,489,490,493`,
`scripts/perf/undo-scenarios.mjs:396,420,421,450,458`,
`scripts/perf/ipad-console-driver.js:41,204,205` — pinned at SHA f934d43

#### Problem

The magic constant `1048576` is scattered across the harness for byte→MB math, e.g.
`debug.blobBytes / 1048576`, `(s.heap.afterBytes - s.heap.beforeBytes) / 1048576`,
`geom.bytesPerRaster / 1048576`. Nothing names it "bytes per MiB"; a reader has to recognize 2^20,
and the unit label ("MB" vs "MiB") is applied inconsistently in the reports while the divisor is
binary.

#### Proposed solution

Add `export const BYTES_PER_MIB = 1024 * 1024;` and
`export const toMiB = (bytes) => bytes / BYTES_PER_MIB;` to `scripts/perf/args.mjs` (importable by
the `.mjs` files). Replace the Node-side occurrences; the browser snippet (`ipad-console-driver.js`)
can define a local `const MIB = 1024*1024` at the top since it can't import.

#### Verification

`grep -rn "1048576" scripts/perf` returns only the console-snippet local (or zero); `perf:undo`
history-MB figures are unchanged.

---

### [P2][duplication] The undo-scenario stroke generators + `agg` are re-implemented in the console driver

**File(s):** `scripts/perf/undo-scenarios.mjs:69-134,194-210` vs
`scripts/perf/ipad-console-driver.js:43-107` — pinned at SHA f934d43

#### Problem

`longSquiggle`, `scribble`, `multiFingerGesture`/`multiGesture`, and the engine-measure aggregator
(`engineMeasuresIn` / `agg`) are near-identical between the Node harness and the pasteable console
driver, down to the `sweeps = 8`, `Math.PI * 12`, `amp = (H - 2*M)/14`, and `MARGIN/M = 160`
constants. The two are meant to run "the same scenarios" (the console driver's comment even says
so), but nothing enforces it — the shapes have already diverged slightly (`undo-scenarios`
parameterizes `points`; the console driver hardcodes `HZ * 10`). A change to the canonical scenario
shape silently desyncs on-device numbers from CI numbers.

#### Proposed solution

Author the scenario-shape functions once as a plain string module
(`scripts/perf/scenario-shapes.js`) with a header saying it's dual-use (imported by
`undo-scenarios.mjs`, and its body pasted into the console driver's build step or documented as the
source of truth). At minimum add cross-reference
`// canonical source: scripts/perf/undo-scenarios.mjs longSquiggle` comments and the shared
constants (`SWEEPS`, `MARGIN`) so drift is auditable.

#### Verification

Diff the generated point arrays for `longSquiggle(0)` between the two files at the same `pts`; they
must match. A shape edit updates both.

---

### [P3][maintainability] Promote scattered magic thresholds to named constants

**File(s):** `scripts/perf/capture.mjs:73` (`> 32`), `scripts/perf/mount.mjs:113,114` (`- 50`,
`> 50 ms`), `scripts/perf/session.mjs:91` (`i < 12`), `scripts/perf/undo-scenarios.mjs:138,245`
(`'22'`, `i < 60`), `scripts/perf/replay-scenario.mjs:208` (`250`) — pinned at SHA f934d43

#### Problem

Key thresholds are inline literals with the meaning only in prose comments or nowhere:

* `capture.mjs:73` `intervals.filter((d) => d > 32)` — the long-frame budget (33 ms ≈ 30 fps) as a
  bare `32`, while `analyze.mjs` names its sibling `LONG_TASK_US`.
* `mount.mjs:113` `Math.max(0, t.duration - 50)` and the `>50 ms` label reimplement the 50 ms
  long-task floor that `analyze.mjs:57` already names `LONG_TASK_US`.
* `session.mjs:91` `for (let i = 0; i < 12; i++)` — an undo-click cap with no name.
* `undo-scenarios.mjs:138` `STROKES = 22` is explained ("two past the depth-20 cap") but the `20`
  (`MAX_UNDO_DEPTH`) it depends on is never a constant, so the `22` and the `+2` intent are
  unchecked against the engine.

#### Proposed solution

Introduce `LONG_FRAME_MS = 32` (capture.mjs), reuse a shared `LONG_TASK_MS = 50` in mount.mjs,
`MAX_UNDO_CLICKS = 12` (session.mjs), and in undo-scenarios make the depth relationship explicit:
`const MAX_UNDO_DEPTH = 20; const STROKES = Number(flag('strokes', String(MAX_UNDO_DEPTH + 2)));`.

#### Verification

`grep -n "> 32" scripts/perf/capture.mjs` and `grep -n "duration - 50" scripts/perf/mount.mjs`
return nothing; frame/long-task counts are unchanged on a re-run.

---

### [P3][error-handling] Give `loadInputs` and the replay/webinspector loaders friendly failures on missing/malformed input

**File(s):** `scripts/perf/analyze.mjs:79-92,503-518`, `scripts/perf/replay-scenario.mjs:53,91`,
`scripts/perf/analyze-webinspector.mjs:37` — pinned at SHA f934d43

#### Problem

`analyze.mjs:80` calls `statSync(target)` on the raw CLI arg — a nonexistent path throws a raw
`ENOENT` stack, not the usage message the function otherwise prints for a missing arg.
`JSON.parse(readFileSync(tracePath …))` (line 83) throws an unhelpful `SyntaxError` on a truncated
trace. `analyze-webinspector.mjs:37` does `JSON.parse(readFileSync(path)).recording` — a
valid-JSON-but-wrong-shape file yields `Cannot read properties of undefined (reading 'markers')`
downstream. `replay-scenario.mjs:53` parses the recording and immediately dereferences
`recording.events.length` (line 91) with no check that `events` is an array.

#### Proposed solution

In `loadInputs`, wrap `statSync`/`JSON.parse` and rethrow with context:
`Trace not found / not valid JSON: ${tracePath}`. In `analyze-webinspector.mjs`, assert `rec` exists
(`if (!rec) fail('Not a Web Inspector export: no .recording')`). In `replay-scenario.mjs`, validate
`Array.isArray(recording.events)` after parse and `fail()` with the file path otherwise. Use
`fail()` from `scripts/lib/utils.mjs`.

#### Verification

`node scripts/perf/analyze.mjs /nope` prints a one-line "not found" instead of a stack; a `{}`
recording file yields a clear "no events array" message.

---

### [P3][type-safety] `jsSelfTime` keys functions by tab-joined string, then splits on tab

**File(s):** `scripts/perf/analyze.mjs:161-197` (`jsSelfTime`) — pinned at SHA f934d43

#### Problem

Self-time is aggregated by building `const key =` ${name}\t${loc}`` (line 185) and later recovered
with `const [name, loc] = key.split('\t')` (line 190). If a `functionName` from the CPU profile ever
contains a tab (or the split yields more than two parts), the name/location are silently mis-split.
The contract on the parsed V8 profile is also loose: `profile.nodes`, `profile.samples`,
`e.args?.data?.timeDeltas` are read positionally (`samples[i]` ↔ `deltas[i]`) with only
`Math.max(0, deltas[i] || 0)` guarding a length mismatch, so a short `timeDeltas` array under-counts
without warning.

#### Proposed solution

Key by a composite object instead of a delimited string: accumulate into `Map<id, {name, loc, us}>`
keyed by the callFrame identity, or use a `Map` of `Map`. Avoids the round-trip entirely. Add a
guard that `samples.length === deltas.length` (or note the divergence in the summary) so a malformed
chunk is visible rather than silently truncated.

#### Verification

Re-run `perf:analyze` on the committed baseline trace in `scrapbook/perf/2026-07-22-draw-profile/`
and confirm the top-self-time table is unchanged; a synthetic node name containing `\t` no longer
corrupts the row.

---

### [P3][maintainability] `HARNESS_SYMBOLS` name-matching can silently drop real app functions

**File(s):** `scripts/perf/analyze.mjs:63-77,194` — pinned at SHA f934d43

#### Problem

The self-time table excludes any function whose lowercased name is in `HARNESS_SYMBOLS`, which
includes generic tokens like `mark`, `measure`, `query`, `evaluate`, `serialize`, `computebox`. In a
minified production build (the profiled target), an app function minified to — or legitimately named
— `query`/`mark`/`measure` would be dropped from the report as "harness overhead," hiding a real
hotspot. The exclusion is name-only with no url/source discrimination, and the skill doc even warns
readers that driver plumbing "that isn't in HARNESS_SYMBOLS yet … can still appear," acknowledging
the list is a fragile denylist.

#### Proposed solution

Where possible, discriminate by `callFrame.url` (harness symbols come from Playwright's injected
context / no app URL) rather than by bare name, or narrow the denylist to the fully-qualified
injected names (`__perfframetick` is already unambiguous; `mark`/`measure` are not). At minimum,
keep the excluded rows in `summary.json` under a separate `excludedSelfTime` array so a suspicious
drop is auditable.

#### Verification

Confirm an app function named `query` in `web/src/` (if any) still appears; excluded entries are
recoverable from `summary.json`.

---

### [P3][naming] Rename obscure `beat` and consolidate the terse formatter helpers

**File(s):** `scripts/perf/session.mjs:35-43` (`beat`), `scripts/perf/analyze.mjs:326` (`ms`),
`scripts/perf/undo-scenarios.mjs:480` (`f1`), `scripts/perf/replay-scenario.mjs:278` (`f1`),
`scripts/perf/analyze-webinspector.mjs:59-68` (`stat`,`q`,`fmt`),
`scripts/perf/ipad-console-driver.js:93` (`agg`) — pinned at SHA f934d43

#### Problem

`beat(page, label, fn)` is the scenario-step runner but the name carries no meaning ("beat" of
what?) — `runPhase`/`step` would be self-documenting, especially since it wraps `markPhase`.
Meanwhile the number formatter is re-invented per file:
`ms = (n) => n == null ? 'n/a' :`${n.toFixed(1)} ms`` in analyze,
`f1 = (n) => n == null ? 'n/a' : n.toFixed(1)` twice (undo + replay), and `fmt`/`stat`/`q` in the
webinspector analyzer. Three files ship the same "null → n/a, else fixed(1)" logic under three
names.

#### Proposed solution

Rename `beat` → `runPhase` (or `step`). Export `f1`/`ms` from a shared `report-fmt.mjs`
(`export const f1 = …; export const ms = (n) => n == null ? 'n/a' :`${f1(n)} ms`;`) and import in
analyze/undo/replay. The console snippet keeps its own copy (can't import).

#### Verification

`grep -rn "const f1 =" scripts/perf` collapses to one non-snippet definition; reports render
identical numbers.

---

### [P3][maintainability] Encapsulate the scattered "effective throttle" idiom

**File(s):** `scripts/perf/scenario.mjs:30,42,71`, `scripts/perf/mount.mjs:45,51,85`,
`scripts/perf/undo-scenarios.mjs:44,317,337,444`, `scripts/perf/replay-scenario.mjs:33,84,113` —
pinned at SHA f934d43

#### Problem

The concept "a throttle > 1 is real; 1 or 0 means none" is expressed three different ways at every
site: the tag `throttle > 1 ?`${throttle}x`: 'raw'`, the settings value
`throttle > 1 ? throttle : 0`, and the CDP guard
`if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', …)`. Because the raw default
differs (`'4'` vs replay's `'0'`) and `args.includes('--no-throttle') ? 1 : …` normalizes to 1, the
"is it throttled" test `> 1` is duplicated four+ times per file and easy to get subtly wrong (e.g.
someone writing `>= 1`).

#### Proposed solution

Parse throttle once into a small value object:
`const throttle = resolveThrottle(args); // { rate, active, tag, forSettings }` where
`active = rate > 1`. Replace the three idioms with `throttle.active`, `throttle.tag`,
`throttle.forSettings`. Put `resolveThrottle` in `args.mjs`.

#### Verification

`grep -rn "throttle > 1" scripts/perf` returns zero; `perf:web` (4×) and `perf:web:raw` still tag
output dirs `4x`/`raw` and set the CPU rate correctly.

---

### [P4][dead-code] `breakdown.longTasksFromTrace` is computed but never surfaced

**File(s):** `scripts/perf/analyze.mjs:130-155,304-324,335-501` — pinned at SHA f934d43

#### Problem

`categoryBreakdown` computes `longTasksFromTrace: { count, longestMs }` (line 153) and `analyze()`
includes it in the returned `breakdown` object. But `renderReport` reads only
`b.mainThreadBusyMs/scriptingMs/renderingMs/paintingMs` (lines 393-398) and the long-task section
uses `s.longTasks` from `metrics.json` instead (line 368). So `longTasksFromTrace` lands only in
`summary.json`, redundant with `metrics.longTasks`, and no consumer reads it (`grep` confirms one
definition, zero reads). It's dead weight that also invites confusion about which long-task count is
authoritative.

#### Proposed solution

Either surface it (use `longTasksFromTrace` as the fallback in the Frame-health section when
`metrics.longTasks` is absent — useful for bare exported traces) or drop it from
`categoryBreakdown`'s return. Given the mount/webinspector paths lack `metrics.longTasks`, surfacing
it as a documented fallback is the higher-value fix.

#### Verification

`grep -rn "longTasksFromTrace" scripts/perf` shows it either consumed in `renderReport` or removed;
`summary.json` no longer carries an unread field.

---

### [P4][error-handling] A single scenario's `settleColdTier` timeout aborts the whole undo run

**File(s):** `scripts/perf/undo-scenarios.mjs:275-291,352-432` — pinned at SHA f934d43

#### Problem

`settleColdTier` throws when the cold tier never settles (line 282). It's called inside the scenario
loop (line 363) with no per-scenario try/catch, so one flaky scenario (a slow blob encode on a
loaded CI box) throws straight out of the `for (const sc of scenarios)` loop and skips artifact
writing for every scenario — including the ones that already completed. A multi-minute run is lost
to one late tier settle.

#### Proposed solution

Wrap each scenario body in try/catch: on failure, log `console.warn(`[${sc.key}] skipped:
${err.message}`)` and push a partial/`null`-flagged result (mirroring how `beat` in session.mjs
already downgrades a failed step to "skipped"), so surviving scenarios still write artifacts. Keep
the throw's diagnostic message.

#### Verification

Force a short `settleColdTier` timeout (small `timeoutMs`) and confirm the run still writes
`undo-scenarios.json` with the other scenarios present and the failed one marked skipped.

---

### [P4][type-safety] Inconsistent null-guarding of `getUndoDebug()` fields

**File(s):** `scripts/perf/undo-scenarios.mjs:393,396,511,553`,
`scripts/perf/replay-scenario.mjs:299-301`, `scripts/perf/ipad-console-driver.js:204,209` — pinned
at SHA f934d43

#### Problem

The `getUndoDebug()` shape is dereferenced with mixed guarding within the same file.
`undo-scenarios.mjs:393` reads `debug.rasterBytes ?? debug.liveRasters * geom.bytesPerRaster` and
`+ debug.blobBytes` (no `?? 0`), while the render pass at line 511/553 uses
`s.debug?.blobBytes ?? 0` and `Math.round((s.debug.blobBytes ?? 0) / 1024)`. So the compute path
assumes `blobBytes` is always present but the render path defends against it being absent —
contradictory contracts on one object. A build that predates `blobBytes` (the very case the `??`
guards imply exists) would produce `NaN` history-MB from line 396 while the table cell reads `0`.

#### Proposed solution

Normalize `getUndoDebug()` once at the boundary:
`const debug = normalizeUndoDebug(await undoDebug(page))` returning a fully-defaulted shape
(`{ snapshots: 0, liveRasters: 0, blobBytes: 0, rasterBytes: null, pendingCommands: 0 }`), then drop
the ad-hoc `?? 0`/`?.` downstream. Define the shape once so both the compute and render paths agree.

#### Verification

Run `perf:undo` against a build whose `getUndoDebug` omits `blobBytes` (stub it) and confirm
`historyRasterMB` is a number, not `NaN`, and matches the table.

---

### [P4][maintainability] Undocumented magic in the recorder: `ALPHA_STRIDE = 4 * 61` and the `SIZE_PX` map

**File(s):** `scripts/perf/ipad-recorder.js:128`, `scripts/perf/replay-scenario.mjs:25` — pinned at
SHA f934d43

#### Problem

`ipad-recorder.js:128` declares `const ALPHA_STRIDE = 4 * 61;` used to stride the canvas
`getImageData` alpha scan. The `4` (RGBA) is clear but the `61` (a prime, presumably to avoid
aliasing with pixel-row periodicity) is unexplained — a reader can't tell whether the stride is
load-bearing or arbitrary, and changing it silently changes every recorded `probe.alpha` magnitude
(breaking comparisons against older recordings). Separately, `replay-scenario.mjs:25`
`const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 }` duplicates the app's stroke-size mapping with
only a comment ("Approximate … override here if the real mapping is ever needed") and no pointer to
the app source of truth, so it rots when the app's size ramp changes.

#### Proposed solution

Add a one-line WHY comment to `ALPHA_STRIDE` (prime stride to decorrelate from pixel-row stride;
magnitude is relative-only) and name the `4`. For `SIZE_PX`, cite the app constant it approximates
(e.g. `web/src/lib/state/…`) in the comment so a future editor knows where the real mapping lives.

#### Verification

The constants carry a rationale a reviewer can check; `SIZE_PX` comment names a real file that still
defines the size ramp.

Note: the `4 * 61` decorrelation stride is a plausible intent but unverified against the pixel-row
width; treat the WHY comment as the deliverable, not a stride change.

---

### [P4][complexity] `analyze.mjs` makes five separate full passes over the event array

**File(s):** `scripts/perf/analyze.mjs:97-155,161-217,225-302` — pinned at SHA f934d43

#### Problem

`userTimingMeasures`, `categoryBreakdown`, `jsSelfTime`, `phaseWindows`, `perPhase`, and
`attributeLongTasks` each iterate the entire `events` array independently, and
`perPhase`/`attributeLongTasks` additionally re-`filter` events into `tasks`/`commits`/`nested`
sub-arrays (lines 226-231, 272-286) then loop again per window (O(events × windows)). For a large
Android trace this is several redundant O(n) scans plus an O(n×w) attribution. Beyond cost, it hurts
readability: the "what is a RunTask, a Commit, a phase" classification is re-expressed in each
function rather than derived once.

#### Proposed solution

Do one classifying pass that partitions events into
`{ userTimings, runTasks, commits, profileChunks, buckets }`, then have the summarizers consume
those pre-filtered arrays. This also removes the repeated
`e.ph === 'X' && typeof e.dur === 'number'` predicate copied into five functions.

#### Verification

`analyze` output on the committed baseline trace is byte-identical; a `console.time` around
`analyze()` shows fewer full scans (single classify pass).

---

### [P4][naming] Entry-point `main` functions aren't exported, hurting grepability/testability

**File(s):** `scripts/perf/scenario.mjs:34`, `scripts/perf/mount.mjs:49`, `scripts/perf/ios.mjs:35`,
`scripts/perf/android.mjs:79`, `scripts/perf/undo-scenarios.mjs:306`,
`scripts/perf/replay-scenario.mjs:45` — pinned at SHA f934d43

#### Problem

Every driver defines a bare, unexported `async function main()` invoked by the `main().catch(...)`
epilogue. `analyze.mjs` alone gates its `main()` behind the
`import.meta.url === pathToFileURL(process.argv[1]).href` guard (line 518) and exports
`analyze`/`renderReport` for reuse; the drivers do neither, so importing one for a test (or reusing
`getWebviewPage`/`findWebviewSocket` from android.mjs) forces a full run. The identical local name
`main` across six files also means a symbol search can't distinguish them.

#### Proposed solution

Apply the `analyze.mjs` pattern uniformly: adopt the shared `runMain(main)` (see P2) which can
incorporate the `import.meta` "run only if invoked directly" guard, and export the reusable pieces
(e.g. `export { findWebviewSocket, readWebviewSocket }` from android.mjs) so a smoke test or another
script can import them without launching a browser.

#### Verification

Importing `android.mjs` in a test does not start adb/Playwright; each entry still runs standalone
via `npm run perf:*`.

---

### [P4][error-handling] `getWebviewPage`/`findWebviewSocket` use unlabeled retry magic and a fragile URL heuristic

**File(s):** `scripts/perf/android.mjs:42-77` — pinned at SHA f934d43

#### Problem

`getWebviewPage` loops `for (let i = 0; i < 20; i++)` with a hardcoded `sleep(500)` and picks the
page via `pages.find((p) => !p.url().startsWith('about:')) || pages[0]` — the `20`/`500` (a 10 s
budget) are unnamed, and the `about:` filter silently falls back to `pages[0]` when every page is
`about:` (e.g. the WebView still booting), so it can hand `driveSession` a not-yet-navigated page
that then fails later at `waitForSelector('#drawingCanvas')` with a less clear error.
`findWebviewSocket` (25 s) and `getWebviewPage` (10 s) also express the same "poll with deadline"
pattern two different ways (deadline timestamp vs iteration count).

#### Proposed solution

Name the constants (`WEBVIEW_PAGE_TIMEOUT_MS`, `WEBVIEW_POLL_MS`) and reuse a single
`pollUntil(fn, { timeoutMs, intervalMs })` helper (a sibling of `waitForUrl` in
`scripts/lib/utils.mjs`) for both the socket and page waits. Have `getWebviewPage` reject with a
clear message when only `about:` pages exist at deadline rather than returning a blank page.

#### Verification

With no app foregrounded, `perf:android` fails with "No navigated WebView page" at the page-wait
step, not a downstream selector timeout; the poll budgets are named.

## Source: Code audit — scripts · lib shared helpers

### [P1][architecture] Two competing Chromium-resolution mechanisms; the model-eval one is a brittle hardcoded path

**File(s):** `scripts/lib/model-eval.mjs:50-51` (`CHROMIUM_PATH`) vs `scripts/lib/utils.mjs:82-100`
(`chromiumExecutablePath`) — pinned at SHA f934d43

#### Problem

Two helpers resolve the Playwright Chromium binary, and they disagree. `utils.mjs` has a
self-healing resolver whose whole reason to exist (per its own comment) is that "the pinned revision
can drift from what playwright-core resolves … `chromium.launch()` fails with 'Executable doesn't
exist'":

```js
export const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
```

The model-eval scripts (`model-eval-run.mjs`, `model-eval-fixtures.mjs`,
`model-eval-gen-inputs.mjs`) launch with this hardcoded `chromium-1194` path, while
`store-shots.mjs` and `driver-smoke.mjs` use the resilient `chromiumExecutablePath(chromium)`. The
hardcoded revision (`1194`) is exactly the drift the other helper was written to survive — so the
model-eval harness breaks the moment the cloud env installs a different Chromium build, which the
comment in `utils.mjs` says already happens.

#### Proposed solution

Delete `CHROMIUM_PATH` from `model-eval.mjs`. Have the three model-eval consumers import
`chromiumExecutablePath` from `utils.mjs` and launch with
`chromium.launch({ executablePath: chromiumExecutablePath(chromium) })` like the other browser
scripts. If a hard override is still wanted, `chromiumExecutablePath` already honours
`PLAYWRIGHT_CHROMIUM`.

#### Verification

`grep -rn CHROMIUM_PATH scripts/` returns nothing after the change; run `npm run model-eval:*` in an
env whose installed Chromium revision ≠ 1194 and confirm launch succeeds (it fails today).

---

### [P2][cross-platform] `bumpAndroidGradle` / `bumpIosPbxproj` regexes are unanchored and global — they corrupt sibling lines

**File(s):** `scripts/lib/native-version.mjs:28-53` (`bumpAndroidGradle`, `bumpIosPbxproj`) — pinned
at SHA f934d43

#### Problem

The version bumpers match with bare, greedy, global regexes:

```js
.replace(/versionName.*/g, `versionName "${version}"`)
.replace(/versionCode.*/g, `versionCode ${versionCode}`);
```

`versionName.*` also matches a `versionNameSuffix ".debug"` line (it starts with `versionName`) and
any comment mentioning `versionName`, and `/g` rewrites *every* match — silently clobbering those
lines with `versionName "x.y.z"`. Same hazard for `versionCode` vs `versionCodeOverride`, and for
the iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` variants. The header comment claims
byte-identical output "matching the upstream behaviour on files that carry the pair once," but
nothing guarantees the project files stay single-occurrence, and a future Gradle edit that adds a
suffix would produce a corrupt build file with no error.

#### Proposed solution

Anchor to the assignment and preserve indentation, e.g. `/^(\s*)versionName\s+".*"/m` →
`` `$1versionName "${version}"` `` and `/^(\s*)versionCode\s+\d+/m`. Drop `/g` in favour of
asserting exactly one match (the guard checks already require presence; extend them to reject >1).
For pbxproj keep `MARKETING_VERSION =` but require the trailing `;`:
`/MARKETING_VERSION = [^;]*;/g`.

#### Verification

Add a fixture `build.gradle` containing both `versionName "0.0.1"` and `versionNameSuffix ".debug"`;
assert only the `versionName` line changes. Existing release flow (`npm run release` dry path) still
produces the same diff on the real files.

---

### [P2][cross-platform] `quoteArg` wraps args in double quotes without escaping `$`, backtick, `\`, or embedded `"`

**File(s):** `scripts/lib/utils.mjs:20-37` (`quoteArg`, `shellJoin`, `run`) — pinned at SHA f934d43

#### Problem

Every `run()`/`capture()` command is joined into a shell string and executed with `shell: true`.
Non-word args are "quoted" by wrapping in double quotes only:

```js
const quoteArg = (arg) => (/^[\w./:=-]+$/.test(arg) ? arg : `"${arg}"`);
```

Inside double quotes the shell still expands `$VAR`, `$(...)`, backticks, and processes `\`; an arg
containing any of those is mis-executed, and an arg containing a literal `"` breaks the quoting
entirely (splitting the command). Args flowing in from filenames, AVD names, or `input` prompts can
carry these. It is both a correctness bug and a shell-injection surface.

#### Proposed solution

Prefer avoiding the shell: pass `cmd` + `args` array to `spawnSync` with `shell: false` where PATH
resolution isn't needed. Where the shell is genuinely required for PATH shims, single-quote and
escape: `` `'${arg.replace(/'/g, `'\\''`)}'` ``. Single quotes suppress all expansion; the replace
handles embedded single quotes.

#### Verification

`run('node', ['-e', 'console.log(process.argv[1])', 'a$(echo hi)b'])` should print the literal
string, not `ahib`. Add a unit test around `shellJoin` for `$`, backtick, `"`, and space.

---

### [P2][duplication] Dark-theme token blocks in `CHROME_CSS` are duplicated and have already drifted

**File(s):** `scripts/lib/scrapbook-chrome.mjs:51-85` (`@media (prefers-color-scheme:dark)` vs
`:root[data-theme=dark]`) — pinned at SHA f934d43

#### Problem

The dark palette is written twice — once in the media query, once in `:root[data-theme=dark]` — and
the two copies disagree:

| token           | `@media dark` (L53-55) | `[data-theme=dark]` (L77-79) |
| --------------- | ---------------------- | ---------------------------- |
| `--card`        | `#1d1f27`              | `#1c1e24`                    |
| `--card-2`      | `#181a20`              | `#191b20`                    |
| `--muted`       | `#a8a4af`              | `#a19da8`                    |
| `--hair`        | `#34373f`              | `#2b2e36`                    |
| `--hair-strong` | `#464a55`              | `#3a3e48`                    |
| `--faint`       | `#807d89`              | `#797682`                    |

So a viewer in OS-dark sees different chrome than one who hit the explicit dark toggle. The light
palette is likewise triplicated (`:root` L34-49, `:root[data-theme=light]` L64-73) but there
identical — pure copy risk. This is a single-source-of-truth failure the drift already proves.

#### Proposed solution

Define each palette once as a JS object (`const LIGHT = {...}; const DARK = {...}`) and generate the
three selector blocks from a `vars(obj)` serialiser, so `:root`, the media query, and both
`[data-theme]` selectors emit byte-identical declarations. Decide the intended dark values once.

#### Verification

After refactor, `grep -c '#1d1f27\|#1c1e24' scripts/lib/scrapbook-chrome.mjs` shows a single
canonical value; render `/scrapbook` in OS-dark and via the toggle and confirm the chrome matches.

---

### [P2][maintainability] `PALETTE` / `PAPER` are copied from app source with no drift assertion, unlike the prompts

**File(s):** `scripts/lib/model-eval.mjs:29-46` (`PALETTE`, `PAPER`) and `77-85`
(`assertProductionConfig`) — pinned at SHA f934d43

#### Problem

The harness copies four things from the app to "measure what production actually sends":
`DEFAULT_PROMPT`, `SAFETY_SYSTEM_INSTRUCTION`, `PALETTE`, and `PAPER`. Only the first two are
guarded — `assertProductionConfig()` reads the app source and throws on drift. `PALETTE` (a
comment-claimed mirror of `web/src/lib/state/colors.svelte.ts`) and `PAPER` (`web/src/app.css`) are
unverified, so a palette or paper-color change in the app silently makes the eval inputs unfaithful
while every guard stays green. The comment even names the exact source files, implying the same
drift risk was recognised but only half-covered.

#### Proposed solution

Extend `assertProductionConfig()` (or add `assertPaletteConfig()`) to parse the hexes out of
`colors.svelte.ts` / `app.css` and assert set-equality with `PALETTE`/`PAPER`, throwing with the
offending file name like the prompt checks do.

#### Verification

Change one palette hex in `colors.svelte.ts`, run any `model-eval:*` script, confirm it now throws;
revert and it passes.

---

### [P2][architecture] `utils.mjs` is a grab-bag mixing generic, Playwright, release, and app-domain concerns

**File(s):** `scripts/lib/utils.mjs:1-148` (whole file) — pinned at SHA f934d43

#### Problem

The header says "Generic helpers … App-specific logic stays in the script that owns it," but the
file holds at least five unrelated responsibilities: process runners (`run`/`sh`/`capture`/`fail`),
network polling (`waitForUrl`), Playwright binary resolution (`chromiumExecutablePath`),
command/tool discovery (`hasCommand`, `maestroPath`, `maestroInstalled`), release/markdown parsing
(`parseFrontmatter`, `compareSemverDesc`, `writeFileDeep`), and outright app-domain logic
(`webOnlyBooks`). A change to any one drags an unrelated import graph; `perf/` scripts importing
`sleep` pull in `scrypt`-free but still Playwright- and Maestro-flavoured code. This is the
"grab-bag `utils`" the audit brief calls out.

#### Proposed solution

Split by concern: `lib/proc.mjs` (`run`/`sh`/`capture`/`fail`/`sleep`/`hasCommand`), `lib/net.mjs`
(`waitForUrl`), `lib/playwright.mjs` (`chromiumExecutablePath`), `lib/maestro.mjs` (Maestro paths —
or fold into `android.mjs`'s sibling), `lib/frontmatter.mjs` (`parseFrontmatter`,
`compareSemverDesc`). Re-export from a thin `utils.mjs` barrel for one migration cycle, then update
imports.

#### Verification

`npm test` (unit + driver:smoke) green; each new module has a single-sentence header describing one
responsibility.

---

### [P3][architecture] `webOnlyBooks` is app-domain logic sitting in the "generic helpers" file

**File(s):** `scripts/lib/utils.mjs:143-147` (`webOnlyBooks`) — pinned at SHA f934d43

#### Problem

```js
export const webOnlyBooks = (books) =>
  books.filter((book) => !(book.platforms ?? ['web', 'mobile']).includes('mobile'));
```

This encodes the app's book-platform filtering rule (mirroring `booksForPlatform()` in
`src/lib/state/books.ts`) and directly contradicts the file's own header ("App-specific logic stays
in the script that owns it"). Only two scripts use it (`check-assets.mjs`,
`strip-native-assets.mjs`), both native-asset concerns.

#### Proposed solution

Move it to a purpose-named module, e.g. `scripts/lib/native-assets.mjs` alongside where the strip
logic conceptually lives, or export it from a shared books helper. Keep the cross-check comment
pointing at `books.ts`.

#### Verification

`grep -rn webOnlyBooks scripts/` shows both consumers importing from the new location;
`npm run check:assets` still passes.

---

### [P3][architecture] Three command runners with inconsistent contracts and error behaviour

**File(s):** `scripts/lib/utils.mjs:27-72` (`run`, `sh`, `capture`) — pinned at SHA f934d43

#### Problem

`run(cmd, args[], opts)` takes an argv array and `process.exit()`s on failure;
`capture(cmd, args[], opts)` also takes an array and `process.exit()`s; but `sh(command, cwd)` takes
a *pre-joined string* and *rejects* instead of exiting. So callers must remember which runner takes
an array vs a string, and which aborts the process vs throws — a foot-gun the brief flags as
"loose/inconsistent helper signatures." The array-vs-string split also means `sh` bypasses
`quoteArg` entirely, so the two families quote differently.

#### Proposed solution

Unify on one signature `exec(cmd, args[], { cwd, input, echo, mode })` where `mode` is
`'exit' | 'throw' | 'capture'`, or at minimum make all three take `(cmd, args[])` and document the
exit-vs-throw axis in one place. Have `sh` accept an argv array and share `shellJoin`.

#### Verification

Signatures line up across the three; consumers compile; `test:driver:smoke` and the smoke suite
pass.

---

### [P3][duplication] Missing `openInFileManager` helper — the open/xdg-open branch is duplicated

**File(s):** `scripts/lib/*` (absent) vs `scripts/open-path.mjs:16` and
`scripts/redteam-run.mjs:268` — pinned at SHA f934d43

#### Problem

The macOS-vs-Linux opener branch that `scripts/CLAUDE.md` explicitly says should live "behind a
branch in `scripts/lib/`" is instead written twice in consumers:

```js
// open-path.mjs
run(process.platform === 'darwin' ? 'open' : 'xdg-open', [path]);
// redteam-run.mjs:268
const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
```

This is exactly the kind of platform difference the lib exists to centralise, and it is duplicated.

#### Proposed solution

Add to `utils.mjs` (or a `lib/opener.mjs`):
`export const openInOs = (target) => run(process.platform === 'darwin' ? 'open' : 'xdg-open', [target]);`.
Both consumers call it.

#### Verification

`grep -rn "xdg-open" scripts/` matches only the new helper.

---

### [P3][duplication] `ROOT` is defined identically in two lib modules

**File(s):** `scripts/lib/utils.mjs:11` and `scripts/lib/model-eval.mjs:12` — pinned at SHA f934d43

#### Problem

Both files compute the repo root the same way:

```js
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
```

`model-eval.mjs` re-exports its own `ROOT`, and consumers import `ROOT` from *either* module
(`store-shots.mjs` from utils, `model-eval-*` from model-eval), so there are two "canonical" roots
that only coincidentally agree. If either file moves depth, they diverge.

#### Proposed solution

`model-eval.mjs` should `import { ROOT } from './utils.mjs'` and re-export if needed, rather than
recomputing. One definition.

#### Verification

`grep -rn "fileURLToPath(import.meta.url)" scripts/lib` returns a single site.

---

### [P3][architecture] `spawnViteServer` doesn't cover the dev-with-visible-output case, so `cloud-tunnel.mjs` re-implements it and can orphan vite

**File(s):** `scripts/lib/vite-server.mjs:29-56` (`spawnViteServer`) — pinned at SHA f934d43

#### Problem

`spawnViteServer` exists specifically to run vite in a detached group so `stop()` can't orphan the
esbuild grandchild — but it hardcodes `stdio: ['ignore','ignore','inherit']` and only merges `env`.
`cloud-tunnel.mjs:63` needs stdout inherited and a `TUNNEL_HOST` env, so it hand-rolls
`spawn('npx', ['vite','dev',...])` — reintroducing the exact npx-wrapper + non-detached shape the
helper warns against ("wrapper spawns (`npx vite`) would add another layer … a plain child.kill()
can orphan the process that holds the port"). The one consumer that most needs the anti-orphan
guarantee bypasses it.

#### Proposed solution

Widen `spawnViteServer(port, { env, command, stdout })` to accept a stdout mode
(`'ignore' | 'inherit'`), then have `cloud-tunnel.mjs` use it. Its `stop()`/detached-group logic
then covers the tunnel path too.

#### Verification

`cloud-tunnel.mjs` no longer imports `spawn` directly; Ctrl-C during a tunnel leaves no vite/esbuild
process (`pgrep -f vite` empty after exit).

---

### [P3][cross-platform] `freePort` depends on `lsof`, which is not present on many Linux/CI hosts

**File(s):** `scripts/lib/vite-server.mjs:15-27` (`freePort`) — pinned at SHA f934d43

#### Problem

```js
const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
```

`lsof` ships by default on macOS but is frequently absent on minimal Linux containers (Debian/Alpine
CI images). When missing, `spawnSync` returns an error result, `out.stdout` is undefined → the
function silently no-ops, and any stale server then trips vite's `--strictPort`. The "best-effort"
comment hides a platform gap the repo's macOS+Linux contract cares about.

#### Proposed solution

Fall back to a portable probe when `lsof` is unavailable — e.g. try `fuser -k ${port}/tcp` or
`ss -ltnp` on Linux, or detect the missing binary via `hasCommand('lsof')` and warn. Simplest robust
option: attempt a connect to the port in Node and, if listening, log that a manual kill is needed
rather than silently continuing.

#### Verification

On a container without `lsof`, `freePort(5173)` with a stale server should either free it or emit a
clear message, not silently no-op.

---

### [P3][maintainability] App-driver selectors and timing constants are scattered string/number literals

**File(s):** `scripts/lib/app-driver.mjs:49-106` (selectors + `sleep(...)` calls) — pinned at SHA
f934d43

#### Problem

The module `scripts/CLAUDE.md` warns "rots silently when app markup, element IDs, or show/hide
mechanics change" — yet the element IDs are inline literals spread across functions
(`'#drawingCanvas'`, `'.drawer-toggle'`, `'#coloringBookButton'`, `'#strokeWidthButton'`,
`.color-swatch[data-color=...]`) and every gesture ends in a bare `await sleep(400)` / `350` / `220`
/ `150` / `40` / `200`. There is no single place to update an ID after a markup change, and the
sleep durations (several tied to real app guards, e.g. the "100ms post-color-change guard") are
undocumented magic numbers. This directly worsens the rot the CLAUDE.md flags.

#### Proposed solution

Hoist a
`const SEL = { canvas: '#drawingCanvas', drawerToggle: '.drawer-toggle', coloringBook: '#coloringBookButton', strokeButton: '#strokeWidthButton' }`
and named timing constants (`COLOR_CHANGE_GUARD_MS = 220`, `DRAWER_ANIM_MS = 350`, …) at the top,
referenced everywhere. One edit site per selector.

#### Verification

`grep -c "#drawingCanvas" scripts/lib/app-driver.mjs` → 1; `npm run test:driver:smoke` passes.

---

### [P3][naming] `hasCommand` uses `which`, whose absence is silently treated as "command missing"

**File(s):** `scripts/lib/utils.mjs:102` (`hasCommand`) — pinned at SHA f934d43

#### Problem

```js
export const hasCommand = (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
```

If `which` itself isn't installed (some minimal Linux images ship without it), `spawnSync` errors
and `.status` is `null !== 0`, so *every* command probe reports "missing" — cascading into
misleading "install X" failures in `android-setup.mjs`/`check-netlify-cli.mjs`. The POSIX-guaranteed
builtin is `command -v`.

#### Proposed solution

`spawnSync('sh', ['-c',`command -v ${cmd}`], { stdio: 'ignore' }).status === 0` (guard `cmd` against
spaces), or check both. `command -v` is a shell builtin, always present.

#### Verification

On an image without `which`, `hasCommand('node')` returns true.

---

### [P4][complexity] `imageDims` JPEG scanner is a dense loop of unnamed byte offsets

**File(s):** `scripts/lib/model-eval.mjs:143-160` (`imageDims`) — pinned at SHA f934d43

#### Problem

The JPEG branch walks segment markers with bare literals (`buf.readUInt16BE(i + 7)`, `i + 5`, the
`0xc0..0xcf` SOF range minus `0xc4/0xc8/0xcc`) and no explanation of what offsets 5/7 are
(height/width within an SOFn segment). It reads as magic; a reviewer can't tell correct from
off-by-one.

#### Proposed solution

Name the constants (`const SOF_HEIGHT_OFFSET = 5, SOF_WIDTH_OFFSET = 7`) or add a one-line WHY
comment ("SOFn payload: [precision][height u16][width u16]"). Optionally extract `readJpegSize(buf)`
/ `readPngSize(buf)` so `imageDims` reads as a dispatch.

#### Verification

Add a unit test feeding a known 640×480 JPEG and PNG header; assert `"640x480"`.

---

### [P4][duplication] PNG/JPEG magic-byte sniff is repeated in `imageDims` and `imageFormat`

**File(s):** `scripts/lib/model-eval.mjs:143-167` (`imageDims`, `imageFormat`) — pinned at SHA
f934d43

#### Problem

Both functions open with the same signature checks:

```js
if (buf[0] === 0x89 && buf[1] === 0x50) // png
if (buf[0] === 0xff && buf[1] === 0xd8) // jpeg
```

The magic pairs are duplicated with no shared `isPng`/`isJpeg`, so a format added in one place can
be forgotten in the other.

#### Proposed solution

`const isPng = (b) => b?.[0] === 0x89 && b?.[1] === 0x50;` and
`const isJpeg = (b) => b?.[0] === 0xff && b?.[1] === 0xd8;`, used by both.

#### Verification

Both functions reference the shared predicates; existing report format table unchanged.

---

### [P4][naming] `chromiumExecutablePath` uses `slice(9)` and a duplicated `/opt/pw-browsers` literal

**File(s):** `scripts/lib/utils.mjs:87-98` (`chromiumExecutablePath`) and
`scripts/lib/model-eval.mjs:51` — pinned at SHA f934d43

#### Problem

`Number(b.slice(9))` strips the literal `"chromium-"` (9 chars) — a magic length tied to a string
that appears nowhere near it, so a rename of the prefix breaks the sort silently. The browsers-path
default `'/opt/pw-browsers'` is also hardcoded here and again as the `chromium-1194` prefix in
`model-eval.mjs`, two independent copies of the same cloud path.

#### Proposed solution

`const PREFIX = 'chromium-'; Number(b.slice(PREFIX.length))`, and
`const DEFAULT_BROWSERS_PATH = '/opt/pw-browsers'` exported once and reused (also removes the
`model-eval` copy once that file adopts `chromiumExecutablePath` per the P1 finding).

#### Verification

`grep -rn "/opt/pw-browsers" scripts/lib` → one definition; sort still orders revisions descending.

---

### [P4][maintainability] iconChroma hue thresholds are unnamed magic numbers

**File(s):** `scripts/lib/iconChroma.mjs:30-33` (`isHue`) — pinned at SHA f934d43

#### Problem

```js
return c.s >= 0.35 && c.l >= 0.14 && c.l <= 0.93;
```

`0.35`, `0.14`, `0.93` are the classification boundary between a "spot" (colorful) icon and a
monochrome glyph — the single most important tuning knob in the file, shared with the `COLOR_ICONS`
guard test — yet they're bare literals. Because this classifier must not drift from the Svelte test,
the thresholds deserve to be named and, ideally, exported so the test asserts against the same
constants.

#### Proposed solution

`const MIN_SATURATION = 0.35, MIN_LIGHTNESS = 0.14, MAX_LIGHTNESS = 0.93;` (export them; have
`iconChroma.d.mts` type them). The `.svelte.test.ts` can then import rather than re-encode.

#### Verification

`npm run check` + the Icon guard test pass with identical classification.

---

### [P4][architecture] Point generators live inside the Playwright app-driver module

**File(s):** `scripts/lib/app-driver.mjs:108-136` (`circlePts`, `arcPts`, `zigzag`) — pinned at SHA
f934d43

#### Problem

The file header scopes the module to "dev-server lifecycle, page setup, and the UI gestures … the
app needs," but the bottom third is pure geometry (parametric circle/arc/zigzag point lists) with no
Playwright dependency. Mixing a stateless math concern into a browser-driving module means a script
wanting only the geometry pulls in the whole Playwright surface.

#### Proposed solution

Move the three generators to `scripts/lib/stroke-geometry.mjs` (or `points.mjs`); `app-driver.mjs`
and `store-shots.mjs` import from there.

#### Verification

`app-driver.mjs` no longer exports geometry; `gen:shots` / `gen:large-image` still render.

---

### [P4][maintainability] `median`/`mean` are generic stats buried in the report module

**File(s):** `scripts/lib/model-eval-report.mjs:55-62` (`median`, `mean`) — pinned at SHA f934d43

#### Problem

Two reusable numeric reducers are private to the report file. `mean` silently `Math.round`s (a
reporting choice, not a general mean) while `median` doesn't — a subtle inconsistency for anyone
reusing them. The perf scripts under `scripts/perf/` compute similar aggregates independently.

#### Proposed solution

Move raw `median`/`mean` to a `lib/stats.mjs`; keep the rounding at the call site in the report
(`Math.round(mean(...))`) so the helper stays honest and reusable.

#### Verification

Report numbers unchanged; `grep -rn "function mean" scripts` shows one definition.

---

### [P4][readability] `card()` entry-existence check reaches up-and-back-down through the type dir

**File(s):** `scripts/lib/scrapbook-index.mjs:143-148` (`card`) — pinned at SHA f934d43

#### Problem

```js
const entryExists = existsSync(join(dir, '..', meta.entry));
const href = entryExists ? meta.entry : `${type}/${files.find((f) => f.endsWith('.html')) ?? ''}`;
```

`dir` is `<scrapbook>/<type>`, and `meta.entry` already starts with `<type>/…`, so the check climbs
to `<scrapbook>` then descends again — correct but confusing, and the fallback silently yields
`type/` (trailing slash, no file) when no HTML exists, producing a dead card link.

#### Proposed solution

Compute against the scrapbook root directly: pass `scrapbookDir` into `card()` and use
`existsSync(join(scrapbookDir, meta.entry))`. Guard the fallback so a card with no resolvable page
is dropped (or routed through `fallbackCard`) rather than linking to `type/`.

#### Verification

Point `meta.entry` at a missing file in a fixture scrapbook; the generated card either links to a
real page or is omitted, never to `type/`.

---

### [P4][naming] `REGISTRY.icons.count` is `null` while siblings use `() => null` — inconsistent contract

**File(s):** `scripts/lib/scrapbook-index.mjs:91` (and `55`, `68`, `77`) — pinned at SHA f934d43

#### Problem

Every registry entry's `count` is a function except `icons`, where it's the bare value `null`.
`card()` only survives this via a `typeof meta.count === 'function'` guard — but the type of a
registry field silently varying (function vs null) is a loose contract that invites a future
`meta.count(files)` call to crash.

#### Proposed solution

Make `count` always a function: `count: () => null` for `icons`, matching `model-eval`. Then
`card()` can call it unconditionally.

#### Verification

All four entries have `count: (files?) => …`; index renders identically.

---

### [P4][maintainability] Smoke reporter keeps pass/fail tally in module-global mutable state

**File(s):** `scripts/lib/smoke.mjs:5-26` (`passed`, `failed`, `summarize`) — pinned at SHA f934d43

#### Problem

```js
let passed = 0;
let failed = 0;
```

The tally is module-level singleton state, so two smoke suites imported into one process share a
counter, and `summarize()` calls `process.exit()` — a library function that terminates the process,
preventing composition. Fine for today's one-suite-per-process usage, but a hidden constraint no
signature communicates.

#### Proposed solution

Expose a `createReporter()` factory returning `{ check, fatal, summarize }` over closed-over
counters, and have `summarize()` return the exit code (let the caller `process.exit`). Keep the
current module-level exports as a default reporter for back-compat.

#### Verification

Two reporters in one script keep independent counts; `api-smoke`/`blobs-smoke` still exit non-zero
on failure.

---

### [P4][readability] `parseFrontmatter` silently drops non-`[A-Za-z]`-leading keys and never signals malformed lines

**File(s):** `scripts/lib/utils.mjs:118-127` (`parseFrontmatter`) — pinned at SHA f934d43

#### Problem

The key regex `^([A-Za-z]\w*):\s*(.*)$` silently ignores any frontmatter line it can't parse (e.g. a
key with a leading digit or a `-`, or a genuinely malformed line). A release author who mistypes a
key gets no error — the value just vanishes and downstream `meta.foo` is `undefined`. The comment
says "flat — we never need nested YAML," which is fine, but the silent-skip behaviour is
undocumented and bug-prone for the release pipeline that depends on it.

#### Proposed solution

Either broaden the key charset to match real frontmatter keys, or collect unparsed non-blank lines
and expose them (or throw) so a typo surfaces. At minimum document the flat-key constraint in the
comment.

#### Verification

Feed frontmatter with a mistyped key; the parser reports it rather than silently omitting.

---

### [P4][maintainability] `esc` is re-implemented in the asset-gen proof sheet with no shared source

**File(s):** `scripts/lib/scrapbook-chrome.mjs:15-19` (`esc`) — pinned at SHA f934d43

#### Problem

`scrapbook-chrome.mjs` is documented as "the single source of truth for the scrapbook look," and
`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs` re-implements HTML escaping independently
(the header even notes it "may not import across that boundary" and mirrors tokens "by eye"). The
escaper is small, but a security-relevant helper mirrored by eye across a module boundary is a
latent XSS-consistency risk in the committed Pages output.

#### Proposed solution

Not fixable inside `scripts/lib` alone given the boundary, but worth surfacing: extract `esc` (and
the crayon token set) into a tiny dependency-free module both trees may import, or add a test
asserting the two escapers agree on a shared vector list. Track as a cross-boundary follow-up.

#### Verification

A shared escaping test over `&<>"'` passes for both generators.

---

## Source: Code audit — web/tests · E2E + integration specs

### [P1][duplication] Extract the retry-to-open dialog pattern into a shared helper — it is reimplemented four times

**File(s):** `web/tests/flows.spec.ts:27-60` (retryOpen/openParentCenter),
`web/tests/parent-zoom.spec.ts:12-20` (openParentCenter), `web/tests/a11y.spec.ts:68-76` (inline),
`web/tests/webkit-smoke.spec.ts:35-42` (inline) — pinned at SHA f934d43

#### Problem

The "click a lazily-wired control, retry until its sentinel is visible, skip the click when already
open" primitive exists as `retryOpen` in `flows.spec.ts:27-36` but is **not shared**.
`openParentCenter` alone is re-written independently in four files. The three copies outside
`flows.spec.ts` are structurally identical:

```ts
// parent-zoom.spec.ts, a11y.spec.ts, webkit-smoke.spec.ts all repeat:
await expect(async () => {
  if (!(await modal.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 });
  }
  await expect(modal).toBeVisible({ timeout: 1500 });
}).toPass({ timeout: 10_000 });
```

Grep confirms `isVisible().catch(() => false)` appears in four spec files. The flake-resistance
contract (ADR-0049 idle-mount handling) is thus maintained in four places; a fix to the retry shape
must be made four times, and a newcomer adding a fifth dialog copy-pastes the incantation rather
than calling a named helper.

#### Proposed solution

Move `retryOpen(ready, open, opts?)` and `openParentCenter(page)` into `web/tests/helpers.ts`
(already the WebKit-portable shared module — it contains no CDP, so `webkit-smoke.spec.ts` can
import it). Have all four specs import `openParentCenter`; delete the three inline copies and the
`flows.spec.ts` local definition. Keep
`openDrawer`/`openStrokeMenu`/`openBrushMenu`/`openColoringDialog` as one-liners over the shared
`retryOpen`, also moved to `helpers.ts`.

#### Verification

`grep -rn "isVisible().catch" web/tests` returns only `helpers.ts` after the change. Run
`npm run test:e2e -- parent-zoom.spec.ts a11y.spec.ts webkit-smoke.spec.ts flows.spec.ts --repeat-each=10`
to confirm the shared helper holds under contention.

---

### [P1][complexity] Split the two mega-spec files (engine 1980 LOC, flows 1636 LOC) by feature area

**File(s):** `web/tests/engine.spec.ts:1-1980`, `web/tests/flows.spec.ts:1-1636` — pinned at SHA
f934d43

#### Problem

`engine.spec.ts` is 1980 lines and `flows.spec.ts` is 1636 lines. Each bundles many unrelated
feature areas into one file. `engine.spec.ts` covers: basic strokes/undo, undo-cap, clear, eraser,
pen-merge recovery, edge-swipe guards, rotation/paper-view (its own section banner at line 858),
backgrounded re-entry (line 1113), teardown/re-init (line 1191), the crayon brush (line 1299), and
the snapshot memory tier (line 1715). `flows.spec.ts` covers palette, brushes, scribble-guard, undo
gating, persistence, Parent Center layouts, AI key flow, AI generation, coloring book, magic brush,
and brush ring. A reader looking for "the rotation tests" or "the coloring-book tests" must scroll a
2000-line file, and helper functions are interleaved between tests throughout (see the pixel-reader
finding below).

#### Proposed solution

Split along the section banners the files already contain. For engine: `engine-undo.spec.ts`,
`engine-eraser.spec.ts`, `engine-pointer-recovery.spec.ts`, `engine-rotation.spec.ts`,
`engine-crayon.spec.ts`, `engine-snapshot-tier.spec.ts`, sharing a new `engine-harness.ts` (see next
finding). For flows: `flows-palette.spec.ts`, `flows-parent-center.spec.ts`, `flows-ai.spec.ts`,
`flows-coloring.spec.ts`, `flows-magic-brush.spec.ts`. This also lets Playwright's 4 workers
parallelize across files rather than serializing the big two.

#### Verification

`npm test` green; `wc -l web/tests/*.spec.ts` shows no file over ~500 LOC. Grepping a feature name
(e.g. `rotation`) points to one file.

---

### [P2][duplication] The `/dev/engine` readiness `beforeEach` and state readers are duplicated verbatim across engine and multitouch specs

**File(s):** `web/tests/engine.spec.ts:24-40`, `web/tests/multitouch.spec.ts:15-55` — pinned at SHA
f934d43

#### Problem

`multitouch.spec.ts:46-55` copies the `engine.spec.ts:27-40` `beforeEach` navigate-and-poll block
character-for-character (both even carry the same explanatory comment). The `count` reader is
defined identically in both (`engine.spec.ts:25`, `multitouch.spec.ts:15`), and `state`/`alphaAt`
overlap. `grep "__engineReady === true"` shows the poll logic living in three files (`engine`,
`multitouch`, `global-setup`). Any change to how the harness signals readiness (e.g. a new
`__engineReady` gate) must be edited in lockstep in multiple places.

#### Proposed solution

Create `web/tests/engine-harness.ts` exporting `gotoEngine(page)` (the navigate + poll `beforeEach`
body), plus `count(page)`, `state(page)`, `alphaAt(page, x, y)`, `pixelAlpha(page, x, y)`. Both
specs import them; `beforeEach(({ page }) => gotoEngine(page))` replaces both inline blocks. Keep it
out of `helpers.ts` since it depends on the dev-harness `window.__engine` globals (which
`helpers.ts` must stay free of per its WebKit-portability note).

#### Verification

`grep -c "__engineReady" web/tests/*.spec.ts` returns 0 (only in `engine-harness.ts` and
`global-setup.ts`). `npm run test:e2e -- engine.spec.ts multitouch.spec.ts` green.

---

### [P2][duplication] `helpers.ts:draw` and `engine.spec.ts:drawStroke` are two near-identical mouse-stroke drivers

**File(s):** `web/tests/helpers.ts:15-22` (draw), `web/tests/engine.spec.ts:10-22` (drawStroke) —
pinned at SHA f934d43

#### Problem

`draw(page, points)` in `helpers.ts` and `drawStroke(page, box, points)` in `engine.spec.ts` do the
same thing — move to `points[0]`, `mouse.down()`, iterate `mouse.move`, `mouse.up()`. The only
difference is that `draw` resolves the canvas box itself from `#drawingCanvas` while `drawStroke`
takes a pre-fetched box (and targets `#engineCanvas`). Two copies of the pointer-drag loop drift
independently (`draw` uses `points.slice(1)` in a `for…of`; `drawStroke` uses the same but they are
maintained separately).

#### Proposed solution

Parameterize a single `dragStroke(page, points, { canvas = '#drawingCanvas' } = {})` in `helpers.ts`
that resolves the box internally, and have the engine harness pass `{ canvas: '#engineCanvas' }`.
Delete `engine.spec.ts:drawStroke`; callers that pre-fetched `box` only did so to reuse it across
the same test, which `dragStroke` can do internally per call.

#### Verification

`grep -rn "mouse.down()" web/tests` shows the loop in one helper only (plus intentional low-level
synthetic-event tests). `npm run test:e2e -- engine.spec.ts` green.

---

### [P2][duplication] The inline `fire()` PointerEvent dispatcher is re-declared ~7 times with divergent signatures

**File(s):** `web/tests/engine.spec.ts:335, 400, 434, 1232`, `web/tests/flows.spec.ts:411`,
`web/tests/ai-timer.spec.ts:59`, `web/tests/parent-zoom.spec.ts:48` — pinned at SHA f934d43

#### Problem

A local `const fire = (…) => target.dispatchEvent(new PointerEvent(…))` closure is written inside
`page.evaluate` seven times. The signatures are gratuitously inconsistent: `engine.spec.ts:335` is
`(type, x, y, buttons)`, `engine.spec.ts:400` is `(target, type, x, y, buttons)`,
`ai-timer.spec.ts:59` is `(name, id, x, y)`, `parent-zoom.spec.ts:48` is `(name, id, x, y)` with
`pointerType` closed over. Each hand-rolls the same `PointerEvent` option bag
(`bubbles: true, cancelable: true`, etc.). A reader must re-parse the argument order every time, and
a fix to (say) add `pressure` handling touches seven blocks.

#### Proposed solution

Because these run inside `page.evaluate`, they can't import a Node-side helper directly, but the
option-bag construction can be centralized as a stringifiable factory injected via
`page.addInitScript`, or — simpler — standardize on one signature
`fire(target, type, {id, x, y, buttons, pointerType})` and paste that one canonical form (a single
documented shape) so at least the divergence stops. Given the `evaluate` boundary, the pragmatic win
is: define the synthetic-pointer sequences (merged-pen-stream, hover-only, pinch-spread) as named
exported string-builders used across engine/flows, since those anatomies (finding: the pen-merge
tests) are themselves duplicated.

#### Verification

`grep -c "const fire = " web/tests/*.spec.ts` drops materially; the remaining declarations share one
signature. Synthetic-pointer tests still pass under `--repeat-each=10`.

---

### [P2][duplication] Canvas pixel-scanning readers duplicate getImageData boilerplate across ~10 functions with no shared module

**File(s):** `web/tests/helpers.ts:25-34` (firstOpaquePixel), `web/tests/flows.spec.ts:158-195`
(canvasInkStats), `1166-1180` (distinctOpaqueColors), `1331-1344` (revealedNearBlackFraction),
`1371-1380` (opaquePixelsInLeftBand), `1408-1417` (opaquePixelsInTopBand), `1498-1506`
(opaqueCount), plus inline blocks at `flows.spec.ts:300-317, 542-549, 1542-1549` and
`engine.spec.ts:1586-1600, 1792-1801` — pinned at SHA f934d43

#### Problem

At least ten functions plus several inline `page.evaluate` blocks each re-open the canvas,
`getContext('2d')`, call `getImageData`, and loop `for (let i = …; i < data.length; i += 4)`
counting alpha/opaque pixels. `opaqueCount` (1498), `opaquePixelsInLeftBand` (1371), and
`opaquePixelsInTopBand` (1408) differ only in the region rectangle and the `> 200` threshold.
`distinctOpaqueColors` and `revealedNearBlackFraction` share the same `data[i+3] < 200 continue`
scaffold. The alpha-threshold constant (`200`, `128`, `8`, `220`) is a magic number re-chosen per
function. This is the single largest source of near-duplicate code in the suite.

#### Proposed solution

Add `web/tests/canvas-pixels.ts` exporting `scanCanvas(page, {canvasId, region?, alphaMin?})`
returning `{ opaqueCount, distinctColors, nearBlackFraction, meanRgb }`, plus thin wrappers
`opaqueCount`, `opaquePixelsInBand(page, edge, frac)`. Name the thresholds (`STRONG_ALPHA = 200`,
`FAINT_ALPHA = 8`). Replace the per-test pixel readers and the inline blocks. Because the reader
runs in-page, pass the canvasId and region as `evaluate` args (the existing pattern).

#### Verification

`grep -c "getImageData" web/tests/*.spec.ts` collapses to the shared module plus a handful of
genuinely bespoke crayon samplers. Pixel-count assertions unchanged; `npm run test:e2e` green.

---

### [P2][duplication] Crayon-brush tests re-derive point generators and region samplers inline in every test

**File(s):** `web/tests/engine.spec.ts:1309-1354` (crayonScene line/region), `1393-1428`,
`1445-1488` (seg), `1493-1512`, `1521-1560` (pts+coverage), `1569-1607`, `1610-1621`, `1644-1701`,
`1763-1802` — pinned at SHA f934d43

#### Problem

The crayon section (roughly `engine.spec.ts:1299-1802`, ~500 lines) has, in nearly every test's
`page.evaluate`, a locally-defined horizontal-line generator (`line`/`pts`/`seg`:
`for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1-x0)*i)/40, y })`) and a region coverage
sampler. The `E.clearCanvas(); E.setCrayonMode(true); E.setColor('#…'); E.setStrokeWidth(…)`
preamble repeats verbatim in eight tests. The 40-segment interpolation formula alone appears ~9
times.

#### Proposed solution

In the new `engine-harness.ts` (or a `crayon-harness.ts`), export in-page string builders / a single
injected helper providing `interpolateLine(x0,x1,y,segments=40)`,
`regionCoverage(g, x0, x1, yMid, h)`, and a `setupCrayon(color, width)` preamble. Since these run in
`evaluate`, expose them by injecting a small helper object onto `window.__testkit` via
`addInitScript` on the `/dev/engine` route, then call `window.__testkit.line(...)` inside each
`evaluate`. Reduces the crayon section by a few hundred lines and pins the interpolation math in one
place.

#### Verification

The interpolation formula `((x1 - x0) * i) / 40` appears once.
`npm run test:e2e -- engine.spec.ts -g crayon --repeat-each=5` green.

---

### [P2][maintainability] Color hex literals are magic strings in flows.spec.ts while palette-trim.spec.ts already has a named palette map

**File(s):** `web/tests/flows.spec.ts:200, 221, 250, 267(purple), 507, 557, 1267, 1534`, vs the
canonical map in `web/tests/palette-trim.spec.ts:9-22` — pinned at SHA f934d43

#### Problem

`palette-trim.spec.ts:9-22` defines a clean
`C = { purple: '#AB71E1', blue: '#62A2E9', red: '#EC534E', … }`. But `flows.spec.ts` hardcodes the
same hexes as bare strings scattered through selectors and comments: `data-color="#62A2E9"` (blue,
appears 5×), `data-color="#AB71E1"` (purple), `data-color="#EC534E"` (red), and the comment-decoded
intent "`#62A2E9` is blue-dominant" is repeated at lines 217, 453. `webkit-smoke.spec.ts:50`
hardcodes `#2ECC71`. If a palette color changes, these silently rot (the selector just stops
matching, and the test fails opaquely).

#### Proposed solution

Promote the `C` map (and the `data-color="custom"` sentinel) into `web/tests/helpers.ts` as
`PALETTE`, and export a `swatch(page, color)` locator factory
(`page.locator(\`button.color-swatch[data-color="${color}"]\`)`). Replace the literals in`flows.spec.ts`,`webkit-smoke.spec.ts`, and`palette-trim.spec.ts`(which imports the same map). Add a named`isBlueDominant(px)`/`isRedDominant(px)`to replace the`px![2]

> px![0]` idiom (see separate finding).

#### Verification

`grep -rn "#62A2E9\|#EC534E\|#AB71E1" web/tests/*.spec.ts` returns only `helpers.ts`. Selectors
still resolve; `npm run test:e2e -- flows.spec.ts webkit-smoke.spec.ts palette-trim.spec.ts` green.

---

### [P2][test-quality] A single Parent-Center test asserts ~six distinct behaviors across 60 lines

**File(s):** `web/tests/flows.spec.ts:853-914` ('parent center shows quick toggles on a landscape
phone') — pinned at SHA f934d43

#### Problem

This one test verifies: (1) compact class renders, (2) quick toggles present / hub+sidebar absent,
(3) the orientation-lock cell occupies the last slot, (4) the advanced-controls quick toggle drives
its setting, (5) the portrait/landscape lock selector cycles through select→move→release→re-select
(four sub-assertions), and (6) rotating to portrait carries the setting into the full hub. A failure
in the lock-cycle sub-flow reports as a failure of "shows quick toggles," obscuring which behavior
broke, and the test cannot be run in isolation for the rotation-carry concern.

#### Proposed solution

Split into: `'landscape phone renders compact quick toggles'` (assertions 1-3),
`'a quick toggle drives the persisted setting'` (4+6 rotation-carry), and
`'the orientation lock selector cycles portrait/landscape/off'` (5). Share a
`openParentCenterCompact(page)` fixture that sets the 852×390 viewport and opens the modal.

#### Verification

Three focused tests each fail with a title that names the broken behavior.
`npm run test:e2e -- flows.spec.ts -g "quick toggle"` green.

---

### [P2][flakiness] generate-image.spec.ts relies on implicit declaration-order execution and shared limiter buckets

**File(s):** `web/tests/generate-image.spec.ts:11-14, 105-154` — pinned at SHA f934d43

#### Problem

The file opts out of parallel mode (`test.describe.configure({ mode: 'default' })`) because every
BYOK request shares one per-IP limiter bucket and the burst test (line 139) must run last. This
ordering coupling is enforced only by source position and a comment (line 12-13). The BYOK burst
test (`139-154`) even acknowledges "Earlier tests in this file used a few BYOK hits from this IP, so
the 429 can arrive slightly before the full BYOK_LIMIT" — i.e. its assertion window is loosened to
absorb cross-test state bleed. A reordering or an added BYOK test silently shifts the bucket count
and can flip the burst test red.

#### Proposed solution

Isolate the rate-limiter state per test by giving each test its own credential where possible (the
throttle tests already do this for managed tokens via `daycare-club*`), or move the two burst tests
into their own describe block with an explicit comment contract and a
`test.describe.configure({ mode: 'serial' })` so a mid-file failure skips the dependent rather than
cascading. At minimum, replace the "runs in declaration order" comment with a `serial` mode
declaration that the runner actually enforces.

#### Verification

Reorder the non-burst tests locally and confirm the burst tests still pass;
`npm run test:e2e -- generate-image.spec.ts --repeat-each=5`.

---

### [P3][maintainability] The color-change debounce sleep `waitForTimeout(150)` is an unnamed, duplicated magic number

**File(s):** `web/tests/flows.spec.ts:208, 1536` — pinned at SHA f934d43

#### Problem

```ts
await page.waitForTimeout(150); // clear the post-color-change draw debounce
```

appears twice with the same literal `150`. The engine's actual debounce is `< 100ms` (documented in
`engine.spec.ts:277` "same synchronous tick … < 100ms"). The `150` is a hand-picked margin over that
threshold; if the engine's `requiredDelay` changes, these two sleeps must be found and updated by
hand, and there is no single source tying the test constant to the engine constant.

#### Proposed solution

Define `const COLOR_CHANGE_DEBOUNCE_MS = 150;` at the top of `flows.spec.ts` (or in `helpers.ts`)
with a comment linking it to the engine's `requiredDelay`, and use it in both places. This is a
legitimate "idle past a known threshold" sleep per the testing rules, so keeping it as a sleep is
fine — only the magic number and duplication are the issue.

#### Verification

`grep -n "waitForTimeout(150)" web/tests` returns nothing; both call sites reference the named
constant.

---

### [P3][maintainability] The 1×1 PNG base64 buffer is duplicated across three test surfaces

**File(s):** `web/tests/flows.spec.ts:1033-1036`, `web/tests/generate-image.spec.ts:17-20` — pinned
at SHA f934d43

#### Problem

The identical base64 string
`'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='`
is decoded into a `Buffer` in both `flows.spec.ts` (as the mocked generate-image response) and
`generate-image.spec.ts` (as `TINY_PNG`). A test-fixtures module should own this once.

#### Proposed solution

Add `web/tests/fixtures.ts` exporting `TINY_PNG_BASE64` and `tinyPngBuffer()`. Import in both specs.
This also gives a home for the `web/tests/artifacts/*.jpeg` fixtures referenced by the ai-timer
harness.

#### Verification

`grep -rn "iVBORw0KGgo" web/tests/*.spec.ts` returns nothing; both specs import the fixture.
`npm run test:e2e -- generate-image.spec.ts flows.spec.ts -g "AI"` green.

---

### [P3][duplication] `ADMIN_KEY = 'test-admin-secret'` is redeclared in two specs instead of shared

**File(s):** `web/tests/admin.spec.ts:12`, `web/tests/a11y.spec.ts:13` — pinned at SHA f934d43

#### Problem

Both specs hardcode `const ADMIN_KEY = 'test-admin-secret'` with the same "set in
playwright.config.ts webServer.env" comment. The value is actually authored in
`playwright.config.ts` (`ADMIN_ACCESS_TOKEN=test-admin-secret`). Three copies of the same secret
literal must be kept in sync; a change to the config value silently breaks whichever spec wasn't
updated.

#### Proposed solution

Export `ADMIN_KEY` from a shared `web/tests/admin-helpers.ts` (which could also host the duplicated
`signIn`-style login used by both `admin.spec.ts:14-19` and `a11y.spec.ts:47-52`), or read it from
`process.env.ADMIN_ACCESS_TOKEN` with the literal as a fallback so the config remains the single
source.

#### Verification

`grep -rn "test-admin-secret" web/tests` returns one definition.
`npm run test:e2e -- admin.spec.ts a11y.spec.ts` green.

---

### [P3][readability] Blue/red-dominance pixel assertions hide their intent behind index math repeated across tests

**File(s):** `web/tests/flows.spec.ts:217, 453-454, 1542-1549`, `web/tests/helpers.ts:25-34` —
pinned at SHA f934d43

#### Problem

The idiom `expect(px![2]).toBeGreaterThan(px![0])` (blue channel > red channel ⇒ "painted blue")
recurs with an explanatory comment each time (`flows.spec.ts:217` "`#62A2E9` is blue-dominant — the
painted pixel should be more blue than red"). The red-detection at `flows.spec.ts:1542-1549` inlines
`data[i]>200 && data[i+1]<120 && data[i+2]<120`. The reader must decode raw `[r,g,b,a]` index
arithmetic to understand what color is being asserted, and `firstOpaquePixel` returns an untyped
`number[]` (not a named `Rgba` tuple), so nothing prevents an off-by-one channel index.

#### Proposed solution

In `helpers.ts`, type the return as `type Rgba = [number, number, number, number]` and add
predicates `isBlueDominant(px: Rgba)`, `isRedDominant(px: Rgba)`. Replace the index comparisons and
inline red-scans with named predicates. Assertions read `expect(isBlueDominant(px!)).toBe(true)`.

#### Verification

`grep -rn "px!\[2\]" web/tests` returns nothing.
`npm run test:e2e -- flows.spec.ts webkit-smoke.spec.ts` green.

---

### [P3][maintainability] CDP viewport-rotation setup is duplicated in flows.spec.ts and diverges from the engine harness's rotation approach

**File(s):** `web/tests/flows.spec.ts:1142-1149, 1435-1442` — pinned at SHA f934d43

#### Problem

The exact
`cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 90 } })`
block is pasted in two coloring-book rotation tests. Separately, `engine.spec.ts:870-878` rotates
via a harness override (`setScreenAngleOverride` + `resizeTo`) — so the codebase has two unrelated
"rotate the viewport" mechanisms with no shared naming, making it non-obvious which to reach for.

#### Proposed solution

Extract `rotateViewportViaCdp(page, { width, height, angle })` into `helpers.ts` (CDP is
Chromium-only, but `helpers.ts` is imported by webkit-smoke only for CDP-free functions — keep the
CDP helper in a separate `web/tests/cdp.ts` to preserve the WebKit-portability boundary noted in
`web/tests/CLAUDE.md`). Use it in both flows tests. Add a one-line comment cross-referencing the
engine harness's `setScreenAngleOverride` so the two rotation paths are discoverable from each
other.

#### Verification

`grep -c "setDeviceMetricsOverride" web/tests/*.spec.ts` shows one definition.
`npm run test:e2e -- flows.spec.ts -g rotat` green.

---

### [P3][readability] Helper functions are scattered between tests throughout flows.spec.ts instead of grouped

**File(s):** `web/tests/flows.spec.ts:328-333` (activateWithKey), `492-500`
(stylusTouchStartPrevented), `1075-1081` (openColoringDialog), `1105-1117` (applyFarmPage),
`1166-1180` (distinctOpaqueColors), `1331-1344, 1371-1380, 1408-1417, 1498-1506` (pixel readers) —
pinned at SHA f934d43

#### Problem

Unlike the disciplined "── helpers ──" banner at the top (`flows.spec.ts:10-195`), many helpers are
defined lower down, immediately before the first test that uses them, interleaved with tests.
`openColoringDialog` sits at line 1075 (between the AI test and the coloring tests);
`distinctOpaqueColors` at 1166 (after the magic-brush test that references it via `drawMagicReveal`
at line 130, ~1000 lines earlier). Grepping for a helper definition is unpredictable, and a reader
scrolling sees `function` declarations breaking up the test narrative. `drawMagicReveal` (line 126)
forward-references `distinctOpaqueColors` (line 1166), so the file cannot be read top-to-bottom.

#### Proposed solution

When splitting the file (P1 finding above), move each area's helpers to the top of its new spec, or
into the shared `canvas-pixels.ts`/`helpers.ts` modules. If the file stays monolithic short-term,
hoist all `function`/`const … =>` helpers into the existing top-of-file helpers section so tests
read as an uninterrupted sequence.

#### Verification

All `function`/helper `const` declarations precede the first `test(` in each spec.
`npm run test:e2e` green.

---

### [P3][maintainability] Viewport dimensions and interaction timeouts are unnamed magic numbers repeated across specs

**File(s):** `web/tests/flows.spec.ts:743, 771-776, 827, 854, 903, 930, 1615, 1630`; timeouts
`10_000`/`1500`/`1000`/`3000` throughout `flows.spec.ts`, `ai-timer.spec.ts:15,30`,
`parent-zoom.spec.ts`, `webkit-smoke.spec.ts` — pinned at SHA f934d43

#### Problem

Breakpoint-sensitive viewport sizes appear as bare literals with the meaning only in prose:
`460×852` (phone portrait, lines 743, 827), `852×390` (landscape phone, 854), `390×852` (portrait
rotate-target, 903), `740×360` (short landscape, 776), `900×600`/`600×900` (rotation pair,
1615/1630). The retry timeout `10_000` and settle `1500`/`1000` are re-typed at nearly every
`retryOpen`/`toPass` call. A newcomer can't tell which `460` is "just below the tablet breakpoint"
(load-bearing) versus arbitrary, and moving a CSS breakpoint requires hunting bare numbers.

#### Proposed solution

Add a `web/tests/viewports.ts` with named presets (`PHONE_PORTRAIT = { width: 460, height: 852 }`,
`LANDSCAPE_PHONE`, `SHORT_LANDSCAPE`, …) tied by comment to the CSS breakpoints they probe, and an
`OPEN_TIMEOUT`/`SETTLE_TIMEOUT` constants pair. `palette-trim.spec.ts` and `picker-trim.spec.ts`
already parameterize viewport tables (`PORTRAIT`/`LANDSCAPE`/`CASES`) — extend that discipline to
`flows.spec.ts`.

#### Verification

`page.setViewportSize({ width: 460` no longer appears as a bare literal in flows.
`npm run test:e2e -- flows.spec.ts` green.

---

### [P3][test-quality] page.spec.ts hand-parses PNG IHDR bytes — fragile and unexplained magic offsets

**File(s):** `web/tests/page.spec.ts:111-119` — pinned at SHA f934d43

#### Problem

```ts
expect(png.readUInt32BE(16)).toBe(declaredWidth);
expect(png.readUInt32BE(20)).toBe(declaredHeight);
```

The offsets `16`/`20` are the PNG IHDR width/height fields; the comment explains, but any
non-standard chunk ordering or a future WebP OG image would read garbage and assert a confusing
mismatch rather than "not a PNG." The test also silently assumes `/large-image.png` is a PNG.

#### Proposed solution

Guard the magic bytes first: assert `png.subarray(0,8)` equals the PNG signature
(`\x89PNG\r\n\x1a\n`) before reading IHDR, and extract a small
`pngDimensions(buffer): {width, height}` helper into `web/tests/fixtures.ts` so the offset
arithmetic is named and reusable. Fail loudly ("not a PNG") if the signature check fails.

#### Verification

Corrupt the signature locally and confirm a clear failure message;
`npm run test:e2e -- page.spec.ts` green.

---

### [P4][readability] multitouch STROKES/SAMPLES rely on positional index coupling between two separate arrays

**File(s):** `web/tests/multitouch.spec.ts:31-44` — pinned at SHA f934d43

#### Problem

`STROKES[3]` (pointer 4, leftward) is verified by `SAMPLES[3]` (`{ x: 90, y: 190 }` "on pointer 4's
leftward path"). The correspondence is maintained only by array position and comments; inserting a
stroke without inserting its sample at the same index silently mis-pairs the assertion (a sample
could land on the wrong line and still be opaque, passing vacuously).

#### Proposed solution

Merge into one array of `{ stroke, sample }` objects so each line and its verification point are
lexically adjacent and cannot drift:
`const LINES = [{ stroke: horizontalStroke(1,50,40,260), sample: {x:150,y:50} }, …]`, then
`multiStrokeSync(LINES.map(l => l.stroke))` and loop `LINES.map(l => l.sample)`.

#### Verification

`npm run test:e2e -- multitouch.spec.ts` green; the pairing is now structurally enforced.

---

### [P4][test-quality] Scribble-guard `evaluate` probes are duplicated between engine and flows and could share one fixture

**File(s):** `web/tests/flows.spec.ts:463-500` (fingerPrevented / stylusTouchStartPrevented),
`web/tests/engine.spec.ts:461-479` (Scribble touch-cancel probe) — pinned at SHA f934d43

#### Problem

Both files build synthetic `TouchEvent`/stubbed-`changedTouches` probes to assert the Scribble
guard's `preventDefault` behavior. `flows.spec.ts:492-500` and `engine.spec.ts:464-476` construct
the same touch-event scaffolding independently. The pattern (dispatch a cancelable touch and read
`defaultPrevented`) is a reusable primitive.

#### Proposed solution

Extract `touchStartPrevented(page, selector, { touchType })` into `helpers.ts` (no CDP, WebKit-safe)
covering both the real-`Touch` finger case and the stubbed-`changedTouches` stylus case. Both specs
import it.

#### Verification

`grep -rn "changedTouches" web/tests/*.spec.ts` shows one helper.
`npm run test:e2e -- flows.spec.ts engine.spec.ts -g Scribble` green.

---

### [P4][test-quality] Tests reach deep into engine internals via the harness, coupling specs to implementation details

**File(s):** `web/tests/global.d.ts:6-66` (the `window.__engine` surface), consumed throughout
`web/tests/engine.spec.ts` (e.g. `getUndoDebug` at 673, 699, 1739; `inkBounds` at 751, 910;
`pixelAt` pervasively) — pinned at SHA f934d43

#### Problem

The `window.__engine` harness exposes 25+ methods including internals like `getUndoDebug()`
(`{ snapshots, liveRasters, blobBytes, pendingCommands }`) and `getCrayonParams()`. Tests like
`engine.spec.ts:1918-1978` assert on `liveRasters`/`blobBytes` tier counts — implementation details
of the snapshot memory tier (ADR-0066). If the tiering strategy is refactored (e.g. a third tier),
these tests fail even when user-visible undo behavior is unchanged. Some coupling is inherent to an
engine harness, but the memory-tier assertions test the mechanism, not the behavior.

#### Proposed solution

Keep behavior-level tests (undo restores the right pixels) and clearly segregate the tier-internals
tests into a `engine-snapshot-tier.spec.ts` (per the split finding) with a header comment stating
they intentionally assert internal invariants and are expected to change with ADR-0066 refactors —
so a future maintainer knows these are white-box by design and doesn't mistake a churn failure for a
regression. Consider trimming `pendingCommands`/`getCrayonParams` from `global.d.ts` if no spec
reads them (grep to confirm).

#### Verification

`grep -rn "pendingCommands\|getCrayonParams" web/tests/*.spec.ts` — if zero, remove from the harness
type. Tier tests carry the white-box header.

---

### [P4][naming] `engine.spec.js` referenced in a comment but the file is `.ts`

**File(s):** `web/tests/flows.spec.ts:6` — pinned at SHA f934d43

#### Problem

The header comment reads "the engine-level spec (engine.spec.js) deliberately bypasses" — but the
file is `engine.spec.ts` (TypeScript everywhere, per CLAUDE.md). A reader grepping for
`engine.spec.js` finds nothing; the stale `.js` reference predates the TS migration.

#### Proposed solution

Change `engine.spec.js` to `engine.spec.ts` in the comment.

#### Verification

`grep -rn "\.spec\.js" web/tests` returns nothing.

---

### [P4][maintainability] Duplicated undo-cap-of-20 test exists in two forms without cross-reference

**File(s):** `web/tests/engine.spec.ts:110-134` ('the undo stack caps at 20') and
`web/tests/engine.spec.ts:1722-1755` ('depth caps at 20 and deep entries restore from encoded
blobs') — pinned at SHA f934d43

#### Problem

Two tests both draw 22 strokes and assert the stack caps at 20 (`engine.spec.ts:116` and `1723` use
the identical `for (let i = 0; i < 22; i++) … y = 14 + i * 12` loop and the same 30/270
x-coordinates). The first checks the cap via `canUndo` iteration; the second checks the memory-tier
demotion. The shared 22-stroke setup is copy-pasted, and neither references the other, so a reader
can't tell they're deliberately complementary vs. accidentally redundant.

#### Proposed solution

Extract the `draw22Strokes(page)` (or `drawNStrokes(page, n)`) setup into the engine harness, use it
in both, and add a one-line comment in each pointing to the other ("cap behavior; see also the tier
test at …"). Confirms the redundancy is intentional and DRYs the fixture.

#### Verification

`grep -c "i < 22" web/tests/engine.spec.ts` drops to reference the shared helper.
`npm run test:e2e -- engine.spec.ts -g "caps at 20"` green.

---

### [P4][readability] `firstOpaquePixel` and `draw` in helpers.ts lack input guards and precise types

**File(s):** `web/tests/helpers.ts:15-34` — pinned at SHA f934d43

#### Problem

`draw(page, points)` indexes `points[0]` (line 18) with no guard for an empty array — an empty
`points` throws an unhelpful `undefined` deref rather than a clear "draw called with no points."
`firstOpaquePixel` returns `Promise<number[] | null>` — an untyped array where callers rely on
positional channels (`px![2]`), so a caller reading the wrong index gets no type help.

#### Proposed solution

Add `if (points.length === 0) throw new Error('draw requires at least one point');` and type the
pixel reader as `Promise<Rgba | null>` with `type Rgba = readonly [number, number, number, number]`.
Pairs with the `isBlueDominant` predicate finding.

#### Verification

`npm run check` passes with the tighter type; `npm run test:e2e` green.

---

That is 26 findings. The two structural themes worth prioritizing: (1) there is no shared test-utils
layer beyond the thin `helpers.ts` — the engine harness readers, dialog-open retries, pixel
scanners, palette constants, and synthetic-pointer builders all want extraction into
`engine-harness.ts` / `canvas-pixels.ts` / `fixtures.ts` modules; and (2) `engine.spec.ts` (1980
LOC) and `flows.spec.ts` (1636 LOC) should be split by the feature banners they already contain,
which also unlocks better parallelism and grepability.

## Source: Code audit — web · build/test configuration

### [P1][duplication] Browser-support floor is duplicated across `vite.config.ts` and root `browserslist` with only a comment enforcing sync

**File(s):** `web/vite.config.ts:72-78` (build target) — pinned at SHA f934d43; cross-references
`package.json:304-310` (browserslist)

#### Problem

The supported-browser floor is hand-maintained in two places that must stay identical:

```ts
// web/vite.config.ts:78
build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] },
```

```json
// package.json:305-309
"chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4"
```

The only thing keeping them in sync is the prose comment ("Keep in sync with `browserslist`… both
are documented in docs/COMPATIBILITY.md"). Drift here is not cosmetic: esbuild's `target` governs
which JS/CSS syntax is down-leveled, so if someone bumps `browserslist` (e.g. via
`npm run update:browserslist`) but not this array, the bundle can ship syntax the declared floor
can't run. The comment also encodes a hard INVARIANT (ios/safari ≥ native
`IPHONEOS_DEPLOYMENT_TARGET`) that nothing checks. Three separate sources of truth (this array,
browserslist, the Xcode target) are coupled only by comments.

#### Proposed solution

Derive the esbuild `target` array from `browserslist` programmatically rather than restating it.
Either (a) read the root `package.json` `browserslist` field in `vite.config.ts` and map
`"chrome >= 111"` → `"chrome111"`, or (b) use a small helper (e.g. `browserslist-to-esbuild`) so the
single source is the `browserslist` field. If a runtime dependency is undesirable, add a cheap
assertion test (or a `scripts/` check wired into `npm run check`) that parses both and fails on
mismatch, plus a check that the safari/ios floor ≥ the Xcode `IPHONEOS_DEPLOYMENT_TARGET`.

#### Verification

Bump one entry in `browserslist` only and confirm the build (or a new sync test) fails. After the
fix, `npm run build` should produce identical `target` behavior; grep `git grep -n "16.4"` should
show one authoritative definition, not three uncoordinated ones.

---

### [P2][duplication] The `define` compile-time constants are restated in `vite.config.ts` and `vitest.config.ts` and have already drifted

**File(s):** `web/vite.config.ts:65-71` and `web/vitest.config.ts:11-19` (define blocks) — pinned at
SHA f934d43

#### Problem

Both configs declare the `__APP_VERSION__` / `__BUILD_TIME__` / `__NATIVE_API_BASE__` /
`__IS_CAPACITOR__` / `__PERF_MARKS__` compile-time globals, independently:

```ts
// vite.config.ts:65-71 — five keys
__APP_VERSION__, __BUILD_TIME__, __NATIVE_API_BASE__, __IS_CAPACITOR__, __PERF_MARKS__;
```

```ts
// vitest.config.ts:11-19 — only four keys, __PERF_MARKS__ omitted
```

The set has already diverged: `vitest.config.ts` is missing `__PERF_MARKS__`. It happens to work
only because `web/src/lib/drawing/perf.ts:5` guards it with `typeof __PERF_MARKS__ !== 'undefined'`
— a coincidental safety net, not a designed one. The two lists of magic global names (declared a
third time in `web/src/app.d.ts`) have no shared source, so a newly added define can compile in prod
but be `undefined`/differently-valued under test with no error.

#### Proposed solution

Extract the define keys into one shared module (e.g. `web/build/defines.ts` exporting a factory
`buildDefines({ isCapacitor, appVersion, ... })`) imported by both configs, so the key set is
defined once and each config only supplies environment-specific values. At minimum, add
`__PERF_MARKS__` to `vitest.config.ts` for parity so the guard in `perf.ts` isn't load-bearing.

#### Verification

`git grep -n "__PERF_MARKS__\|__APP_VERSION__"` should show the key names in exactly one config
source after refactor. Add a test importing every `__*__` name under Vitest and asserting it is
defined.

---

### [P2][consistency] Production origin `https://splotch.art` and the Capacitor origins are hardcoded string literals scattered across configs

**File(s):** `web/vite.config.ts:55` (`NATIVE_API_BASE`) and `web/svelte.config.js:40`
(`csrf.trustedOrigins`) — pinned at SHA f934d43

#### Problem

The app's own origin and the two native WebView origins appear as bare literals in separate files:

```ts
// vite.config.ts:55
const NATIVE_API_BASE = isCapacitor ? 'https://splotch.art' : '';
```

```js
// svelte.config.js:40
csrf: { trustedOrigins: ['https://localhost', 'capacitor://localhost'] },
```

`https://splotch.art` also recurs in the root `netlify.toml` HSTS/CSP commentary and (per the `api`
skill) in the server CORS allow-list. There is no named constant, so a domain change or an added
native origin requires finding every literal by memory. A newcomer searching "where is the API
origin configured" finds several disconnected spots.

#### Proposed solution

Define these as named constants in one shared module (e.g. `web/build/origins.ts`: `PROD_ORIGIN`,
`CAPACITOR_ORIGINS`) and import them into both configs. Reference the same constants from the server
CORS code so the allow-list and the native base URL cannot disagree.

#### Verification

`git grep -n "splotch.art\|capacitor://localhost"` under `web/` should collapse to a single
definition site plus imports. Build both web and `CAPACITOR=true` targets and confirm
`__NATIVE_API_BASE__` and CSRF origins are unchanged.

---

### [P3][duplication] `playwright.config.ts` and `playwright.webkit-scratch.config.ts` duplicate the whole webServer/PORT/env setup

**File(s):** `web/playwright.webkit-scratch.config.ts:6-27` vs `web/playwright.config.ts:5-6,93-109`
(shared config) — pinned at SHA f934d43

#### Problem

The scratch config copy-pastes `PORT = 4173`, `baseURL`, `testDir`, `globalSetup`, the
`vite build && vite preview` command, `timeout: 180_000`, and the
`{ PUBLIC_ENABLE_DEV_HARNESS, ADMIN_ACCESS_TOKEN: 'test-admin-secret' }` env verbatim from the main
config:

```ts
// webkit-scratch:22-26
command: `npx vite build && npx vite preview --port ${PORT}`,
...
env: { PUBLIC_ENABLE_DEV_HARNESS: 'true', ADMIN_ACCESS_TOKEN: 'test-admin-secret' },
```

If the port, the secret, the harness flag, or the webServer command changes in the main config, the
scratch config silently rots. The magic secret `'test-admin-secret'` is duplicated in two files (and
is coupled to `.claude/rules/testing.md`).

#### Proposed solution

Extract the shared pieces (PORT, baseURL, globalSetup, webServer command/env/timeout) into a small
`web/playwright.shared.ts` and have both configs import and spread them, overriding only what
differs (the scratch config's `projects` and `reuseExistingServer`). Define `ADMIN_ACCESS_TOKEN`
test value and the harness env as named exports there.

#### Verification

Change PORT in the shared module and confirm both configs pick it up. Run
`node scripts/web.mjs playwright test -c playwright.webkit-scratch.config.ts` and the normal
`npm run test:e2e` and confirm both still boot the server.

---

### [P3][consistency] `vite.config.ts` exports an untyped plain object instead of using `defineConfig`

**File(s):** `web/vite.config.ts:57` (`export default { ... }`) — pinned at SHA f934d43

#### Problem

`vitest.config.ts:9` and both Playwright configs use `defineConfig(...)`, but `vite.config.ts`
exports a bare object literal:

```ts
export default {
  server: { ... },
  build: { ... },
  ...
};
```

Only one nested plugin is typed (`satisfies import('vite').Plugin`, line 96); the top-level object
has no `UserConfig` type, so typos in keys (`buld`, `plugin`), invalid option values, or a mistyped
`build.target` entry are not caught by `svelte-check`. This is an inconsistency across sibling
configs and loses the editor autocomplete every other config file here enjoys.

#### Proposed solution

Import `defineConfig` from `vite` and wrap the export: `export default defineConfig({ ... })`. This
types the whole object and lets the inline `satisfies` on the plugin be dropped.

#### Verification

Introduce a deliberately invalid option (e.g. `build: { targett: [...] }`) and confirm
`npm run check` now flags it. Confirm `npm run build` output is byte-identical.

---

### [P3][maintainability] Git-based version derivation is ~35 lines of imperative logic embedded in `vite.config.ts` and is untestable there

**File(s):** `web/vite.config.ts:16-49` (`git`, `webVersion`, `PKG_VERSION`) — pinned at SHA f934d43

#### Problem

The config file carries non-trivial branching logic — `git describe` parsing with a regex, a
two-level try/catch fallback chain, and version-string assembly:

```ts
function webVersion(pkg: string): string {
  const [major, minor] = pkg.split('.');
  try {
    const match = git('describe --tags --long --match "v*"').match(/-(\d+)-g[0-9a-f]+$/);
    if (match) return `${major}.${minor}.${match[1]}`;
  } catch { ... }
  try { return `${major}.${minor}.0+${git('rev-parse --short HEAD')}`; }
  catch { return pkg; }
}
```

This encodes the ADR-0030 versioning contract but lives inside a config module, so it cannot be
unit-tested and mixes "what the build is" with "how versions are computed." The regex and fallback
semantics are exactly the kind of logic that should have tests.

#### Proposed solution

Move `git`, `webVersion`, and the `PKG_VERSION`/`BUILD_TIME` derivation to a `scripts/` helper (e.g.
`scripts/web-version.mjs` or `web/build/version.ts`) exporting pure functions (take the
`git describe` output as an argument so it's mockable). `vite.config.ts` imports and calls it. Add a
Vitest spec covering the tag-present, no-tag, and no-git branches.

#### Verification

New unit test passes for all three branches. `npm run build` on a checkout with tags still yields
`major.minor.<n>`; on a shallow/tagless checkout yields `major.minor.0+<sha>`.

---

### [P3][consistency] The `CAPACITOR` "single signal" is re-derived independently in every config with a repeated literal comparison

**File(s):** `web/vite.config.ts:8`, `web/svelte.config.js:10`, `web/vitest.config.ts:18`
(isCapacitor) — pinned at SHA f934d43

#### Problem

`CLAUDE.md` calls `CAPACITOR=true` "the single signal," yet each config recomputes it:

```ts
const isCapacitor = process.env.CAPACITOR === 'true'; // vite.config.ts:8
const isCapacitor = process.env.CAPACITOR === 'true'; // svelte.config.js:10
```

and `vitest.config.ts:18` hardcodes the opposite (`__IS_CAPACITOR__: JSON.stringify(true)`) with its
own inline rationale. The `=== 'true'` comparison (easy to get wrong, e.g.
`Boolean(process.env.CAPACITOR)` which is truthy for `"false"`) is duplicated. There's no single
named export representing the platform signal, so "the single signal" is really three call sites.

#### Proposed solution

Add a tiny shared module (`web/build/platform.ts` / `.mjs`) exporting
`export const isCapacitor = process.env.CAPACITOR === 'true'` and import it into `vite.config.ts`
and `svelte.config.js`. This makes the "single signal" literally single and removes the risk of one
file using a laxer comparison.

#### Verification

`git grep -n "CAPACITOR === 'true'"` should return one hit. Build both targets and confirm adapter
selection and PWA inclusion are unchanged.

---

### [P3][documentation] Stale/incorrect comment: `vitest-setup.ts` says "jsdom" but the environment is happy-dom

**File(s):** `web/vitest-setup.ts:3-5` (comment) — pinned at SHA f934d43

#### Problem

```ts
// The storage + state layers gate browser-only work behind `browser` from
// `$app/environment`. Under vitest (jsdom) we always want the browser code
```

The Vitest environment is `happy-dom` (`vitest.config.ts:21`), and both `.claude/rules/testing.md`
and ADR-0009 explicitly state the suite uses happy-dom, "not jsdom." A newcomer reading this setup
file is told the wrong DOM implementation — exactly the sort of detail (happy-dom vs jsdom API gaps)
that matters when debugging a test-only DOM failure.

#### Proposed solution

Replace "(jsdom)" with "(happy-dom)". Optionally cite ADR-0009 for why.

#### Verification

`git grep -in jsdom web/` returns nothing after the fix (confirm no other stale references).

---

### [P4][documentation] Undocumented magic values in the PWA/webServer config (networkTimeoutSeconds, timeout, BUILD_TIME slice)

**File(s):** `web/vite.config.ts:27,137` and `web/playwright.config.ts:104` — pinned at SHA f934d43

#### Problem

Several load-bearing numbers have no WHY comment, which is exactly the case the project convention
says warrants one:

* `web/vite.config.ts:137` `networkTimeoutSeconds: 5` — the NetworkFirst fallback window for
  navigation requests; nothing explains why 5s (vs the child waiting on a stalled network).
* `web/vite.config.ts:27` `new Date().toISOString().slice(0, 16)` — `16` is the magic length that
  trims to `YYYY-MM-DDTHH:MM`; the comment above explains BUILD_TIME's purpose but not the slice.
* `web/playwright.config.ts:104` `timeout: 180_000` — the webServer boot budget (build + preview);
  no rationale for 3 minutes, and it's duplicated in the scratch config.

#### Proposed solution

Add one-line rationale comments (or named constants like `NAV_NETWORK_TIMEOUT_SECONDS`,
`WEBSERVER_BOOT_TIMEOUT_MS`). For the BUILD_TIME slice, a named helper or a comment
`// slice(0,16) → "YYYY-MM-DD HH:MM"` suffices.

#### Verification

Review confirms each magic number now carries either a name or a WHY. No behavior change.

---

### [P4][consistency] `.env.example` mixes placeholder conventions and has a redundant/misleading entry

**File(s):** `web/.env.example:11-13,41` — pinned at SHA f934d43

#### Problem

The file uses three different conventions for "fill this in":

```
# GEMINI_API_KEY=        (commented, empty)
GEMINI_API_KEY=replace   (uncommented, "replace")
ADMIN_ACCESS_TOKEN=replace
...
REDTEAM_FIXTURE_KEY=replace
```

`ALLOWED_TOKENS_LIST` gets a real working value (`"abc,daycare-club"`), others get `replace`, and
`GEMINI_API_KEY` is both commented-out (line 12 as documented-optional) *and* set to `replace` on
the next line — contradictory. Worse, `ADMIN_ACCESS_TOKEN=replace` implies it's consumed, but the
E2E web server hardcodes `ADMIN_ACCESS_TOKEN: 'test-admin-secret'` (`playwright.config.ts:108`),
overriding anything in `.env` — so copying this file with `replace` is silently ineffective for the
admin specs, which is confusing.

#### Proposed solution

Pick one placeholder convention (e.g. `KEY=` empty, or `KEY=<your-token>`), remove the duplicate
commented `# GEMINI_API_KEY=` above the active line, and add a note that `ADMIN_ACCESS_TOKEN` is
only used by `npm run dev:netlify` (the E2E suite injects its own).

#### Verification

`cp web/.env.example web/.env` then run `npm run dev:netlify` and `npm run test:e2e`; confirm the
doc comments now match which var each command actually reads.

---

### [P4][maintainability] Port `5173` is coupled across `vite.config.ts` and `web/netlify.toml` as bare literals

**File(s):** `web/vite.config.ts:59` (`port: 5173`) and `web/netlify.toml:25` (`targetPort = 5173`)
— pinned at SHA f934d43

#### Problem

The dev proxy target and the Vite dev port must match, but both are unnamed literals in different
files/formats:

```ts
server: { port: 5173, strictPort: true, ... }   // vite.config.ts:59
```

```toml
targetPort = 5173                                 // web/netlify.toml:25
```

`5173` is also hardcoded in several root `package.json` scripts (`dev:kill`, `adb:reverse`,
`android:live`). With `strictPort: true`, a change to one side without the other makes
`npm run dev:netlify` fail to proxy. Nothing links them; grepping `5173` returns many disconnected
hits.

#### Proposed solution

This is inherently cross-format (TOML can't import a TS constant), so the pragmatic fix is a
cross-reference comment on each (`# must match vite server.port (web/vite.config.ts)` /
`// dev port; mirrored in web/netlify.toml targetPort and dev:* scripts`). If stronger coupling is
wanted, drive the Vite port from an env var that `scripts/web.mjs` and netlify.toml share.

#### Verification

Change the Vite port and confirm the added comments point a maintainer to every mirror.
`npm run dev:netlify` proxies correctly when both match.

---

### [P4][readability] `playwright.config.ts` browser-fallback logic uses a bare magic index and three silent empty catches

**File(s):** `web/playwright.config.ts:15-49` (`chromiumExecutablePath`, `webkitAvailable`) — pinned
at SHA f934d43

#### Problem

```ts
.filter((d) => /^chromium-\d+$/.test(d))
.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // line 23
```

`9` is the unexplained length of the `"chromium-"` prefix (a classic off-by-one hazard if the prefix
ever changes). The function also has three bare `} catch {}` blocks (lines 19, 31, 44) that swallow
all errors with no comment on why silence is correct — a reader can't tell intentional-fallback from
accidental error-hiding. This is dense environment-probing logic sitting in a config file.

#### Proposed solution

Replace `slice(9)` with a captured regex group (`d.match(/^chromium-(\d+)$/)?.[1]`) or a named
`const PREFIX = 'chromium-'` so intent is explicit. Add a short comment on each empty catch
("missing/unreadable path → fall through to next candidate"). Consider extracting both helpers to a
`scripts/` module so they can be unit-tested independently of Playwright.

#### Verification

Run E2E on a checkout where `chromium.executablePath()` is missing but a `chromium-<rev>` dir
exists; confirm the resolved path still selects the highest revision.

---

### [P4][documentation] Temporal wording in config comments will age ("now", "is now TypeScript")

**File(s):** `web/tsconfig.json:5-6` and `web/vite.config.ts:16` — pinned at SHA f934d43

#### Problem

```jsonc
// All of src/ is now TypeScript. Config files ... are unaffected by this.  (tsconfig.json:5)
```

Comments phrased as "now" / "is now" describe a transition rather than a stable state; a year on,
"now" is meaningless and the reader can't tell whether it still holds. The tsconfig comment's real
intent is "`allowJs: false` — src is TS-only." Similar transitional phrasing appears in the version
comment block.

#### Proposed solution

Reword to timeless statements of the invariant:
`// src/ is TypeScript-only; allowJs:false enforces it. Root config/build scripts live outside src/ and are exempt.`
Prefer describing the rule, not the migration.

#### Verification

Review; no behavior change. `npm run check` still passes.

---

### [P5][documentation] Misleading "matching PORT above" comment on the Playwright webServer

**File(s):** `web/playwright.config.ts:93-101` (webServer command) — pinned at SHA f934d43

#### Problem

```ts
// ... `vite preview` defaults to 4173, matching PORT above.
...
: `npx vite build && npx vite preview --port ${PORT}`,
```

The comment leans on `vite preview`'s *default* being 4173 "matching PORT above," but the command
actually passes `--port ${PORT}` explicitly — so the default is irrelevant and the note misleads a
reader into thinking the port coincidence is load-bearing (it isn't; the explicit flag governs). It
plants a false coupling to Vite's default that a Vite upgrade changing the default would appear to
threaten but wouldn't.

#### Proposed solution

Drop the "defaults to 4173, matching PORT above" clause; the `--port ${PORT}` flag is
self-documenting. If keeping context, say "served on PORT via the explicit `--port` flag."

#### Verification

Read-through; run `npm run test:e2e` to confirm the server still binds 4173.

---

### [P5][consistency] `PORT`/`baseURL` naming and `defineConfig` usage differ between the two Playwright configs and the reporter shape is inconsistent

**File(s):** `web/playwright.config.ts:64` vs `web/playwright.webkit-scratch.config.ts:13`
(reporter) — pinned at SHA f934d43

#### Problem

The two Playwright configs, which are otherwise near-identical, differ in small unexplained ways
beyond their intended purpose: the main config's `reporter: [['list'], ['html', { open: 'never' }]]`
vs the scratch config's `reporter: [['list']]` (reasonable, but undocumented), and
`reuseExistingServer: !process.env.CI` vs a flat `true`. Combined with the duplication flagged
above, a maintainer can't quickly tell which differences are intentional (scratch = local-only, no
HTML report) versus accidental drift.

#### Proposed solution

Once the shared base is extracted (see the P3 duplication finding), the scratch config should
express only its *intentional* deltas (webkit-only project, list-only reporter, always reuse server)
as explicit overrides on top of the shared config, making every difference a deliberate, visible
line.

#### Verification

Diff the two effective resolved configs after refactor; every difference should map to a documented
scratch-mode override.

---

### [P5][dead-config] `vitest.config.ts` omits `__PERF_MARKS__`, silently relying on a `typeof` guard in source

**File(s):** `web/vitest.config.ts:11-19` (define) — pinned at SHA f934d43; consumer
`web/src/lib/drawing/perf.ts:5`

#### Problem

Unlike the four other `__*__` defines, `__PERF_MARKS__` is absent from the Vitest `define`. It only
avoids a `ReferenceError` under test because `perf.ts:5` reads it as
`typeof __PERF_MARKS__ !== 'undefined' && __PERF_MARKS__`. So the config relies on a defensive guard
in application source rather than declaring the constant — an implicit coupling that will bite the
moment any test imports a module referencing `__PERF_MARKS__` bare. (Overlaps the P2 define-drift
finding; called out separately because the fix is a one-liner even if the broader refactor is
deferred.)

#### Proposed solution

Add `__PERF_MARKS__: JSON.stringify(false)` to the Vitest `define` block so all five compile-time
globals are declared in every config, and the `typeof` guard in `perf.ts` becomes
belt-and-suspenders rather than required.

#### Verification

Add a test importing a module that references `__PERF_MARKS__` directly; it should pass without the
guard. `npm run test:unit` stays green.

## Source: Code audit — Native shells (android + ios + fastlane)

### [P2][dead-config] Stray `</content></invoke>` tokens leaked into a shipped Play Store changelog

**File(s):** `fastlane/metadata/android/en-US/changelogs/4.txt:15-18` (fastlane metadata) — pinned
at SHA f934d43

#### Problem

The end of the v4 Android changelog contains leftover tool/markup tokens that were never meant to
ship:

```
• App updates no longer leave stale content.
  </content>
  </invoke>
```

`fastlane supply` uploads these `.txt` files verbatim as the Google Play "What's new" text, so this
release's store listing literally shows `</content>` and `</invoke>` to parents. It is a copy-paste
artifact from an AI/editor session that escaped review. Every other changelog ends cleanly; only
`4.txt` is polluted.

#### Proposed solution

Delete the two trailing lines (`</content>` and `</invoke>`) so the file ends at "…no longer leave
stale content." Add a lightweight guard so this can't recur — e.g. a test or lint step that fails if
any `fastlane/metadata/**/*.txt` contains `<` / `>` markup tokens.

#### Verification

`grep -RnE '</?(content|invoke|parameter)' fastlane/metadata` returns nothing after the fix. Confirm
the changelog reads as clean prose end-to-end.

---

### [P2][single-source-of-truth] The app id `art.splotch.app` is hardcoded in six+ native files

**File(s):** `capacitor.config.json:2`, `android/app/build.gradle:12,25`,
`android/app/src/main/res/values/strings.xml:5-6`, `ios/App/App.xcodeproj/project.pbxproj:320,341`
(native identity) — pinned at SHA f934d43

#### Problem

The bundle identifier is repeated as a literal string in at least six places with no single source:

* `capacitor.config.json` → `"appId": "art.splotch.app"`
* `android/app/build.gradle` → `namespace = "art.splotch.app"` **and**
  `applicationId
  "art.splotch.app"`
* `android/app/src/main/res/values/strings.xml` → `package_name` **and** `custom_url_scheme`, both
  `art.splotch.app`
* `ios/.../project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER = art.splotch.app` (Debug **and** Release)

`capacitor.config.json` already declares `appId`, which is conceptually the source of truth, yet the
native files each repeat the literal rather than deriving it. A rename (or a build-variant suffix
like `.dev`) requires a coordinated edit across three languages, and there is no test asserting the
copies agree. Note `strings.xml` even repeats it twice for two different keys.

#### Proposed solution

At minimum, document the canonical location (`capacitor.config.json.appId`) and add a check (a
Vitest/asset-pipeline assertion or a `scripts/` guard) that all native copies equal it. Where the
build system allows, derive instead of duplicate — e.g. Android `namespace`/`applicationId` can
share a single `ext` value, and `strings.xml`'s `package_name`/`custom_url_scheme` can be generated.

#### Verification

Grep the tree for `art.splotch.app`; every occurrence should trace back to one declared value or be
covered by an equality assertion. Change the id in one place in a scratch branch and confirm the
guard flags the drift.

---

### [P2][dead-config] Capacitor template smoke-tests assert the wrong package and would fail if run

**File(s):**
`android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:24`,
`android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:12-18` (Android tests) —
pinned at SHA f934d43

#### Problem

Both files are unmodified Capacitor scaffolding left in the app package `com.getcapacitor.myapp`
(not `art.splotch.app`). `ExampleUnitTest` only asserts `2 + 2 == 4`. `ExampleInstrumentedTest`
asserts:

```java
assertEquals("com.getcapacitor.app", appContext.getPackageName());
```

The real package is `art.splotch.app`, so this instrumented test is guaranteed to **fail** if it is
ever executed — it is stale boilerplate that only survives because the native test tasks aren't run
in CI (the repo's testing strategy uses Maestro smoke tests instead — see the `testing` skill).
Their presence is misleading: a newcomer running `./gradlew test`/`connectedCheck` gets a red build
from dead sample code, and the wrong `com.getcapacitor.myapp` package clutters `git grep`.

#### Proposed solution

Delete both `ExampleUnitTest.java` and `ExampleInstrumentedTest.java` (and the empty
`com/getcapacitor/myapp` dirs). If any native JVM test is genuinely wanted, add a real one under
`art/splotch/app` asserting the correct package id.

#### Verification

`git rm` the files; `./gradlew :app:testDebugUnitTest` still succeeds (nothing to run) and no source
references `com.getcapacitor.myapp`.

---

### [P3][dead-config] google-services / Firebase scaffolding is wired up but the app has no push

**File(s):** `android/build.gradle:11`, `android/app/build.gradle:70-77` (Android Gradle) — pinned
at SHA f934d43

#### Problem

The root build script adds the Google Services classpath:

```groovy
classpath 'com.google.gms:google-services:4.4.4'
```

and the app script conditionally applies the plugin, logging about push notifications:

```groovy
try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, ... Push Notifications won't work")
}
```

Splotch is an offline-first, privacy-first kids' app: there is **no** push plugin in the Capacitor
plugin set (secure-storage, media, device, filesystem, haptics, network, preferences,
screen-orientation, status-bar), no `google-services.json` (not tracked, not in `.gitignore`'s
active list), and no messaging permission in the manifest. This is dead Capacitor template
scaffolding that pulls in a Google dependency and implies a push capability the app deliberately
doesn't have — a real concern for a Families-policy app whose data posture is scrutinized.

#### Proposed solution

Remove the `com.google.gms:google-services` classpath from `android/build.gradle` and the
`google-services.json` try/apply block from `android/app/build.gradle`. If push is ever added, wire
it back deliberately (and document it in the `mobile` skill's compliance checklist).

#### Verification

`grep -rin 'google.services\|google-services\|firebase' android` returns nothing; a release build
(`bundleRelease`) still succeeds.

---

### [P3][dead-config] iOS requires the obsolete `armv7` capability on a 64-bit-only (iOS 16.4) app

**File(s):** `ios/App/App/Info.plist:35-38` (iOS Info.plist) — pinned at SHA f934d43

#### Problem

```xml
<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>armv7</string>
</array>
```

`armv7` is the 32-bit ARM instruction set. The project's `IPHONEOS_DEPLOYMENT_TARGET` is `16.4`
(pbxproj) and SPM `platforms: [.iOS(.v16)]`; iOS 11+ dropped all 32-bit devices, so every device
that can install this app is `arm64`. Requiring `armv7` is stale template cruft — at best a no-op,
at worst it advertises a false capability. It should read `arm64` (or the key should be omitted).

#### Proposed solution

Change the required capability from `armv7` to `arm64`, or remove the `UIRequiredDeviceCapabilities`
key entirely (the deployment target already constrains eligible devices).

#### Verification

Archive/validate the app; App Store Connect accepts the build and device eligibility is unchanged
(arm64-only).

---

### [P3][dead-config] pbxproj injects a `COCOAPODS` compile flag, but the project uses SPM not CocoaPods

**File(s):** `ios/App/App.xcodeproj/project.pbxproj:319` (Xcode build settings) — pinned at SHA
f934d43

#### Problem

The Debug config sets:

```
OTHER_SWIFT_FLAGS = "$(inherited) \"-D\" \"COCOAPODS\" \"-DDEBUG\"";
```

The `-DCOCOAPODS` conditional-compilation flag is a CocoaPods artifact, but this project migrated to
Swift Package Manager (the `mobile`/`ios` guidance explicitly says "SPM not CocoaPods", `.gitignore`
ignores `App/Pods`, and dependencies come from `CapApp-SPM/Package.swift`). Any `#if COCOAPODS`
branch in a dependency would now compile down the wrong (Pods) path in Debug, and the flag misleads
anyone reading the build settings into thinking Pods are in play.

#### Proposed solution

Drop the `\"-D\" \"COCOAPODS\"` tokens from `OTHER_SWIFT_FLAGS` (leaving
`"$(inherited) \"-DDEBUG\""`, or just `$(inherited)` since
`SWIFT_ACTIVE_COMPILATION_CONDITIONS =
DEBUG` already defines DEBUG).

#### Verification

Clean-build the Debug scheme; it compiles with no CocoaPods define.
`grep COCOAPODS
ios/App/App.xcodeproj/project.pbxproj` returns nothing.

---

### [P3][consistency] PencilEraserPlugin comment claims iOS 15 deployment target; it is actually 16.4

**File(s):** `ios/App/App/PencilEraserPlugin.swift:27-28` (iOS plugin) — pinned at SHA f934d43

#### Problem

```swift
// The classic delegate callback is the only one available down to iOS 15 (the project's
// deployment target); it still fires on newer iPadOS, so we always interpret a tap as
```

The project's deployment target is **16.4** (`IPHONEOS_DEPLOYMENT_TARGET = 16.4` in all four pbxproj
configs; `Package.swift` pins `.iOS(.v16)`). The comment's "(the project's deployment target)" is
factually wrong and, since the newer `preferredTapAction` API is available from iOS 16, the stated
rationale for using only the classic callback no longer holds as written. A future contributor
trusting this comment could make the wrong availability decision.

#### Proposed solution

Correct the parenthetical to iOS 16.4 (or remove the "project's deployment target" clause) and, if
the classic callback is still deliberately preferred over `preferredTapAction`, restate the actual
reason (it fires reliably regardless of the user's system tap-action preference — which the next
sentence already says).

#### Verification

Confirm against the pbxproj/Package.swift target; the comment's version matches the real deployment
target.

---

### [P3][dead-config] Unused `AppTheme.NoActionBar` style

**File(s):** `android/app/src/main/res/values/styles.xml:12-16` (Android theme) — pinned at SHA
f934d43

#### Problem

`styles.xml` defines three themes: `AppTheme`, `AppTheme.NoActionBar`, and
`AppTheme.NoActionBarLaunch`. The manifest only references `@style/AppTheme` (application) and
`@style/AppTheme.NoActionBarLaunch` (activity). `AppTheme.NoActionBar` is never referenced anywhere
in the tree — leftover Capacitor template boilerplate.

```xml
<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
    ...
</style>
```

Dead resource that invites confusion about which theme is "the" app theme.

#### Proposed solution

Remove the `AppTheme.NoActionBar` style block (verify no `res/` or manifest reference first).

#### Verification

`grep -rn 'NoActionBar\b' android/app/src` shows only `NoActionBarLaunch` remains; the app builds
and looks identical.

---

### [P3][dead-config] Unused `activity_main.xml` layout — BridgeActivity never inflates it

**File(s):** `android/app/src/main/res/layout/activity_main.xml:1-12` (Android layout) — pinned at
SHA f934d43

#### Problem

This layout defines a `CoordinatorLayout` wrapping a bare `<WebView/>`:

```xml
<androidx.coordinatorlayout.widget.CoordinatorLayout ...>
    <WebView android:layout_width="match_parent" android:layout_height="match_parent" />
</androidx.coordinatorlayout.widget.CoordinatorLayout>
```

`MainActivity extends BridgeActivity`, which builds and manages its own Capacitor `WebView` in code
and never calls `setContentView(R.layout.activity_main)`. The layout is unused Capacitor template
scaffolding. Its presence is the only reason the `androidx.coordinatorlayout` dependency in
`app/build.gradle:59` appears "used", so it also masks a possibly-removable dependency.

#### Proposed solution

Delete `activity_main.xml`. Check whether `androidx.coordinatorlayout:coordinatorlayout` is then
still needed (Capacitor's bridge layout may pull it transitively); if not, drop that
`implementation` line and its `variables.gradle` version entry.

#### Verification

Build and launch on device — the canvas renders unchanged.
`grep -rn 'activity_main\|R.layout'
android/app/src` returns nothing.

---

### [P3][duplication] Android changelog 5 and the iOS release notes are byte-identical, maintained by hand in two files

**File(s):** `fastlane/metadata/android/en-US/changelogs/5.txt`,
`fastlane/metadata/en-US/release_notes.txt` (fastlane metadata) — pinned at SHA f934d43

#### Problem

`changelogs/5.txt` (Android) and `en-US/release_notes.txt` (iOS) contain the exact same "What's new"
copy for the current release, but live in two separate files with no shared source. The next release
requires editing both by hand and keeping them in sync; the `4.txt` markup-leak bug above shows how
easily one copy drifts or gets corrupted without the other noticing. There is no note explaining the
relationship or which file is authoritative.

#### Proposed solution

Either generate the per-platform files from one source (e.g. the `release` skill/script writes both
from a single release-notes input), or document in the fastlane metadata dir that the current
release's Android `N.txt` and iOS `release_notes.txt` must match, backed by an equality check.

#### Verification

`diff fastlane/metadata/android/en-US/changelogs/5.txt fastlane/metadata/en-US/release_notes.txt` is
empty and stays empty via generation or a guard.

---

### [P3][single-source-of-truth] Version (`5` / `1.3.0`) duplicated across gradle and four pbxproj settings with no in-file pointer

**File(s):** `android/app/build.gradle:28-29`,
`ios/App/App.xcodeproj/project.pbxproj:311,318,333,340` (native version) — pinned at SHA f934d43

#### Problem

`versionCode 5` / `versionName "1.3.0"` (Android) are mirrored by `CURRENT_PROJECT_VERSION = 5` and
`MARKETING_VERSION = 1.3.0` in **both** the Debug and Release pbxproj configs (four literals). The
`android/CLAUDE.md` notes these are set by `capacitor-set-version` during `npm run release`, so the
source of truth is really `package.json`, but none of the native files say so — a contributor
opening `build.gradle` or the pbxproj sees a hand-editable literal with no breadcrumb, and the
`android/CLAUDE.md` warning ("Don't hand-edit versionCode/versionName") has no iOS counterpart in
the `mobile`/`ios` guidance.

#### Proposed solution

Add a short comment at each native version literal pointing to the canonical source and the
`capacitor-set-version` flow (or reference it from the `ios` skill as the `android` one does). The
two duplicated pbxproj configs could also be hoisted into an `.xcconfig` so `MARKETING_VERSION`/
`CURRENT_PROJECT_VERSION` are declared once instead of per-config.

#### Verification

Run `npm run release` in a scratch branch; confirm all four pbxproj values and the two gradle values
move together, and that the new comments/pointers match reality.

---

### [P4][documentation] `android:allowBackup="true"` is unexplained for a privacy-first kids app

**File(s):** `android/app/src/main/AndroidManifest.xml:4` (Android manifest) — pinned at SHA f934d43

#### Problem

```xml
android:allowBackup="true"
```

This is the template default and is the one manifest attribute with a real privacy dimension:
`allowBackup=true` lets Android Auto Backup copy the app's data (including anything the
secure-storage / preferences plugins persist) to the user's Google account. Every other manifest
entry here carries a rationale comment (INTERNET, ACCESS_NETWORK_STATE, WRITE_EXTERNAL_STORAGE), but
this security-relevant flag has none. For a Families-policy app, whether child-created content and
any stored state should leave the device is a deliberate decision, not a default to inherit
silently.

#### Proposed solution

Decide intentionally and document it: either keep `allowBackup="true"` with a comment stating that
only non-sensitive local drawing state is backed up, or set it to `false` (and/or add
`fullBackupContent`/`dataExtractionRules`) if child content should never leave the device. Note the
choice in the `mobile` skill's kids-compliance checklist.

#### Verification

Manifest reflects an explicit, commented decision; if changed to `false`, `adb backup` produces no
app data.

---

### [P4][maintainability] FileProvider paths expose entire external + cache roots with template names

**File(s):** `android/app/src/main/res/xml/file_paths.xml:2-5` (Android FileProvider) — pinned at
SHA f934d43

#### Problem

```xml
<external-path name="my_images" path="." />
<cache-path name="my_cache_images" path="." />
```

`path="."` grants the FileProvider access to the **whole** external-files root and the **whole**
cache dir, and the entry names (`my_images`, `my_cache_images`) are unmodified Capacitor sample
names. Scoping a content provider to the entire root is broader than a "save one screenshot to the
gallery" flow needs, and the generic names give no hint of what actually shares files. This is the
provider referenced by `AndroidManifest.xml:23-29`.

#### Proposed solution

Narrow the shared paths to the specific subdirectory the media/filesystem export uses (e.g. a
`shared_images/` subpath) and rename the entries to something descriptive (`shared_drawings`). If
the wide scope is genuinely required by `@capacitor-community/media`, add a comment saying so.

#### Verification

Save-to-gallery / share still works on device; the provider no longer exposes unrelated files.

---

### [P4][duplication] The DeviceLock "Parent Center" rationale comment is duplicated verbatim across Java and Swift

**File(s):** `android/app/src/main/java/art/splotch/app/DeviceLockPlugin.java:12-15`,
`ios/App/App/DeviceLockPlugin.swift:5-6` (native plugins) — pinned at SHA f934d43

#### Problem

Both plugins carry the same hand-maintained sentence explaining the feature ("Surfaces whether …
lock is … engaged so the Parent Center can confirm the lock is on (green check) and swap its
'enable' steps for 'unpin'/'exit' steps."). The shared user-facing behavior lives in two
implementation comments that must be edited in lockstep to stay accurate; there is no single place
that documents the DeviceLock contract (JS name `DeviceLock`, method `isLocked` → `{locked}`).

#### Proposed solution

Document the cross-platform DeviceLock contract once — in the web-side plugin interface/TypeScript
definition that calls `DeviceLock.isLocked()`, or in the `mobile`/`architecture` skill — and reduce
the two native comments to a pointer plus platform-specific notes (Android lock-task state vs. iOS
Guided Access).

#### Verification

The behavioral description exists in exactly one canonical location; the native files reference it.

---

### [P4][dead-config] `AppDelegate.swift` is wall-to-wall empty template lifecycle stubs

**File(s):** `ios/App/App/AppDelegate.swift:14-34` (iOS app delegate) — pinned at SHA f934d43

#### Problem

Five lifecycle methods (`applicationWillResignActive`, `applicationDidEnterBackground`,
`applicationWillEnterForeground`, `applicationDidBecomeActive`, `applicationWillTerminate`) have
empty bodies containing only the stock Apple template prose ("Sent when the application is about to
move from active to inactive state… Games should use this method to pause the game."). None of it
applies to Splotch, and the noise buries the two methods that *do* carry real logic (`open url` and
the `supportedInterfaceOrientationsFor` override at lines 42-60). A reader has to wade through
boiler comments to find the one intentional customization.

#### Proposed solution

Delete the empty stub methods and their template comments (they are optional protocol methods; the
default behavior is identical). Keep `didFinishLaunchingWithOptions`, the
`open url`/`continue
userActivity` proxies, and the orientation override with its existing
explanatory comment.

#### Verification

Build and run on device — background/foreground/rotation behavior is unchanged; the file now shows
only methods that do something.

---

### [P4][maintainability] App-local iOS plugins were added via hand-crafted sequential pbxproj UUIDs

**File(s):** `ios/App/App.xcodeproj/project.pbxproj:14-16,28-30,168-170` (Xcode project) — pinned at
SHA f934d43

#### Problem

The three app-local Swift sources (`DeviceLockPlugin`, `MainViewController`, `PencilEraserPlugin`)
were registered by hand-editing the pbxproj with obviously synthetic, sequential object IDs:

```
DE1CE10C0000000000000001 /* DeviceLockPlugin.swift in Sources */ ...
DE1CE10C0000000000000005 /* MainViewController.swift in Sources */ ...
DE1CE10C0000000000000007 /* PencilEraserPlugin.swift in Sources */ ...
```

Xcode normally emits random 24-hex UUIDs; these zero-padded counters signal a manual/scripted edit.
That's workable but fragile: it isn't obvious to a newcomer that these files are wired in by hand
(not by Xcode's UI or `cap sync`), and a future `cap` project regeneration could clobber them
silently. There's no comment or doc noting that these three files must be re-added if the project is
regenerated.

#### Proposed solution

Add a short note (in the `ios` skill or a comment where the plugins are registered in
`MainViewController.swift`) stating that these app-local sources are wired into the pbxproj by hand
and must be re-added after any Capacitor project regeneration. Optionally regenerate the refs
through Xcode so they carry normal UUIDs.

#### Verification

The manual-wiring caveat is documented where a contributor regenerating the iOS project would see
it; a fresh checkout still builds all three sources into the App target.

---

### [P4][consistency] `Info.plist` `CAPACITOR_DEBUG` resolves to empty in Release with no explanation

**File(s):** `ios/App/App/Info.plist:5-6`, `ios/debug.xcconfig:1`,
`ios/App/App.xcodeproj/project.pbxproj:307,199` (iOS config) — pinned at SHA f934d43

#### Problem

`Info.plist` embeds `<key>CAPACITOR_DEBUG</key><string>$(CAPACITOR_DEBUG)</string>`. The
`CAPACITOR_DEBUG = true` value comes from `debug.xcconfig`, which is set as the
`baseConfigurationReference` **only** on the two Debug configs (pbxproj lines 199 and 307). The
Release configs have no base xcconfig, so `$(CAPACITOR_DEBUG)` expands to an empty string in shipped
builds. That is almost certainly intended (debug flag off in Release), but nothing states it, and
the asymmetry (xcconfig wired to Debug only) is easy to misread as a mistake or to break by
"helpfully" adding the base config to Release.

#### Proposed solution

Add a one-line comment in `debug.xcconfig` (or the `ios` skill) explaining that `CAPACITOR_DEBUG` is
deliberately Debug-only and expands empty in Release, so the intent is discoverable.

#### Verification

Archive a Release build and confirm `CAPACITOR_DEBUG` is empty; the documented intent matches
behavior.

---

### [P5][documentation] `ExportOptions.plist` lacks a pointer to who consumes it and when teamID matters

**File(s):** `ios/App/ExportOptions.plist:11-15` (iOS export config) — pinned at SHA f934d43

#### Problem

The file carries a commented-out `teamID` block with decent inline guidance, but nothing says which
command consumes `ExportOptions.plist` (`xcodebuild -exportArchive` / the `build` skill's IPA lane)
or that `method = app-store-connect` requires an authenticated App Store Connect session. A newcomer
finds a bare plist with no breadcrumb to the release flow it belongs to. The commented `teamID` also
duplicates a value that, if ever needed, would then live here *and* in signing config.

#### Proposed solution

Add a leading comment naming the consumer (the export/archive step in the `build`/`release` tooling)
and linking to the `mobile`/`ios` release checklist, so the plist is self-locating.

#### Verification

The plist header points a reader to the release lane; no behavior change.

---

### [P5][naming] Example-test package `com.getcapacitor.myapp` misrepresents ownership

**File(s):** `android/app/src/androidTest/java/com/getcapacitor/myapp/`,
`android/app/src/test/java/com/getcapacitor/myapp/` (Android test packages) — pinned at SHA f934d43

#### Problem

Even setting aside that these tests are dead (see the P2 finding), the directory/package name
`com.getcapacitor.myapp` places project files under the Capacitor framework's namespace rather than
`art.splotch.app`. It's inconsistent with every other source file in the app and pollutes package
search. This is subsumed by the delete recommended above, but flagged separately in case any native
test is retained rather than removed.

#### Proposed solution

If any native test survives cleanup, move it to `art/splotch/app` so test code shares the app's
package namespace.

#### Verification

No tracked source or test lives under `com/getcapacitor/` after cleanup.

## Source: Code audit — .claude / .codex config (hooks, rules, settings)

### [P2][dead-config] Overly broad allow rules grant destructive commands without a prompt

**File(s):** `.claude/settings.json:48,59,54,62-64` (permissions.allow) — pinned at SHA f934d43

#### Problem

Several allow-list entries are read-only in intent but permit destructive or file-writing operations
with no confirmation:

```json
"Bash(git rm *)",     // line 48 — deletes tracked files, no prompt
"Bash(sed *)",        // line 59 — `sed -i` rewrites files in place
"Bash(find *)",       // line 54 — `find . -delete` / `-exec rm` deletes
"Bash(curl -s * http://localhost:*)",  // line 62 — the middle `*` matches `-o /path`, letting curl write arbitrary files
```

The surrounding block (lines 50-60) is clearly meant to be the "safe read-only tools" group (`grep`,
`ls`, `cat`, `head`, `tail`, `wc`, `echo`, `jq`), but `sed *`, `find *`, and `git rm *` are filed
alongside them despite each having a well-known destructive mode. `Bash(git rm *)` in particular is
a standalone destructive git command sitting in the git group; the rest of that group (`git status`,
`git log`, `git diff`, `git show`, `git branch`, `git stash list`) is all read-only.

#### Proposed solution

Tighten each to its read-only shape, or drop it from the auto-allow list so the operator confirms:

* Remove `Bash(git rm *)` — deletions should prompt.
* Replace `Bash(sed *)` with the actual usage pattern if any (Claude rarely needs `sed` given
  Edit/Grep tools; consider removing it entirely — the repo convention discourages
  `sed`/`cat`/`echo` in favor of dedicated tools).
* Replace `Bash(find *)` with a narrower form, or remove; `Glob`/`Grep` tools cover discovery.
* Narrow the curl entries to a fixed flag prefix, e.g. `Bash(curl -s http://localhost:*)` and
  `Bash(curl -s -i http://localhost:*)`, so the wildcard can't inject `-o`.

#### Verification

For each entry, in a scratch clone run the destructive form (`git rm README.md`, `sed -i s/a/b/ f`,
`find . -name x -delete`) and confirm Claude currently executes it without a permission prompt;
after tightening, confirm the destructive form now prompts while the intended read-only use still
passes.

---

### [P2][error-handling] `session-start.sh` final `svelte-kit sync` is unguarded under `set -e`, contradicting the hook's best-effort intent

**File(s):** `.claude/hooks/session-start.sh:2,30-33,42` — pinned at SHA f934d43

#### Problem

The hook opens with `set -euo pipefail` (line 2) and deliberately wraps the fragile `npm install`
step in a fallback so a failed lifecycle script "doesn't kill this hook silently, leaving the
session with no deps at all" (lines 25-33). But the final step is bare:

```bash
node scripts/web.mjs svelte-kit sync   # line 42 — no || guard
```

Under `set -e`, if `svelte-kit sync` exits non-zero (e.g. a transient generate failure, or a partial
`node_modules` from the `--ignore-scripts` fallback path just above), the whole SessionStart hook
exits non-zero. That is inconsistent with the philosophy the file itself states two steps earlier,
and with the sibling `.codex/cloud/*.sh` scripts, which `|| warn` every step. A missing
`.svelte-kit` types dir degrades `npm run check`/`dev` but shouldn't abort session startup.

#### Proposed solution

Guard the final command so a failure is surfaced but non-fatal, matching the npm-install treatment:

```bash
node scripts/web.mjs svelte-kit sync \
  || echo "session-start.sh: svelte-kit sync failed — run 'node scripts/web.mjs svelte-kit sync' before 'npm run check'"
```

#### Verification

Temporarily make `scripts/web.mjs` exit non-zero (or point it at a bad subcommand), run
`CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start.sh; echo "exit=$?"`,
and confirm the hook currently exits non-zero; after the fix it prints the warning and exits 0.

---

### [P2][duplication] The npm@11 pin (logic + multi-line rationale) is copy-pasted across four shell files and has already drifted

**File(s):** `.claude/hooks/session-start.sh:12-19`, `.claude/cloud/setup.sh:14-23`,
`.codex/cloud/setup.sh:37-44`, `.codex/cloud/maintenance.sh:29-33` — pinned at SHA f934d43

#### Problem

The same decision — pin npm to 11 because `package-lock.json` is authored by npm 11 and other majors
dirty the tree on optional-peer entries — is re-explained at length in four places, with the command
`npx -y npm@11 install -g npm@11` repeated in three of them. The prose has already drifted:

* `.claude/cloud/setup.sh:15` says "the container image ships npm 10"
* `.codex/cloud/setup.sh:38` says "the Codex image ships npm 11.4.2"
* `session-start.sh:15-19` gives yet a third framing ("npm 10 and 11 disagree on optional-peer
  entries")

Four copies of a rationale means four places to update when the npm story changes, and they are
already telling slightly different stories.

#### Proposed solution

Collapse the rationale to one canonical home (it partly lives in `docs/CLOUD/Claude.md` /
`docs/CLOUD/Codex.md` already) and have each script carry a one-line comment plus a doc pointer
instead of the full paragraph, e.g.
`# Pin npm@11 to match package-lock.json's authoring major — see docs/CLOUD/Codex.md.` The command
itself can't be factored into a shared sourced file (the cloud scripts are pasted into web dialogs
and must be standalone), so keep the command inline but stop duplicating the multi-line explanation.

#### Verification

`grep -rn "optional-peer\|npm@11 install -g npm@11" .claude .codex` currently returns the rationale
in four files; after the change each file has a single-line comment and the long explanation exists
in exactly one doc.

---

### [P2][consistency] Codex `setup.sh` and `maintenance.sh` are ~90% identical and have already diverged in ways that look accidental

**File(s):** `.codex/cloud/setup.sh:46-51`, `.codex/cloud/maintenance.sh:35-40` — pinned at SHA
f934d43

#### Problem

The two Codex scripts share the same header, `warn()` helper, npm pin, `npm ci`, Playwright install,
and `svelte-kit sync` — but the shared steps differ in ways that read as drift, not intent:

* `setup.sh:48` runs `playwright install --with-deps chromium`; `maintenance.sh:37` runs
  `playwright install chromium` (no `--with-deps`). If the OS deps are needed at setup they're
  presumably still needed after a maintenance refresh on a rebuilt container.
* `setup.sh:27-33` runs a Node-version check (`major !== 22 || minor < 12`); `maintenance.sh` has no
  equivalent, so a maintenance run on a bumped image silently skips the guard.

Nothing in the comments explains why maintenance intentionally omits `--with-deps` or the Node
check, so a reader can't tell whether the difference is deliberate.

#### Proposed solution

Either (a) make the shared steps identical unless a divergence is intentional and commented, or (b)
if they must stay separate UI-pasted scripts, add a one-line comment at each divergence stating why
(e.g. "`--with-deps` omitted — maintenance runs on an image that already has the apt deps"). Align
the Playwright flag and decide whether the Node check belongs in both.

#### Verification

`diff <(sed -n '26,60p' .codex/cloud/setup.sh) <(sed -n '26,49p' .codex/cloud/maintenance.sh)` shows
the current divergences; after the fix each remaining difference is either removed or has an
adjacent comment justifying it.

---

### [P3][dead-config] `Bash(node scripts/*)` is fully redundant with `Bash(node scripts/**)`

**File(s):** `.claude/settings.json:37-38` — pinned at SHA f934d43

#### Problem

```json
"Bash(node scripts/*)",
"Bash(node scripts/**)",
```

In gitignore-style matching `**` matches across path separators, so `scripts/**` already matches
everything `scripts/*` does (and more, e.g. `scripts/sub/x.mjs`). The `scripts/*` entry adds
nothing.

#### Proposed solution

Delete line 37; keep only `Bash(node scripts/**)`.

#### Verification

Confirm `node scripts/sub/anything.mjs` is still auto-allowed with only the `**` entry present, and
that removing line 37 changes no observable permission behavior.

---

### [P3][dead-config] `Bash(afplay *)` is a dead (and macOS-only) permission with no consumer in the repo

**File(s):** `.claude/settings.json:72` — pinned at SHA f934d43

#### Problem

`afplay` is macOS's audio player. A repo-wide grep finds it only in `settings.json` — no hook,
skill, script, or `.ruler` source invokes it:

```
$ grep -rn "afplay" .claude .ruler scripts
.claude/settings.json:72:      "Bash(afplay *)",
```

It looks like a leftover from a since-removed notification/Stop-hook sound. It also can't work on
the Linux dev/cloud environments the project supports (ADR-0017). Dead config in the allow list
makes the real, load-bearing entries harder to audit.

#### Proposed solution

Remove line 72. If a completion sound is still wanted, wire it through a Stop hook and a
cross-platform helper (per ADR-0017's "platform tools via Node helpers" rule), then re-add a scoped
permission for that helper.

#### Verification

`grep -rn afplay` returns only `settings.json` today; after removal it returns nothing and no
workflow regresses (nothing invoked it).

---

### [P3][maintenance] `cloud-branch-preview.sh` embeds a dated, mutable "CURRENT MODE" fact that is injected into every cloud session

**File(s):** `.claude/hooks/cloud-branch-preview.sh:24-31` — pinned at SHA f934d43

#### Problem

The heredoc hard-codes a Netlify preview-mode fact with a date:

```
CURRENT MODE: restricted (as of 2026-07-09). Assume a plain `feat/*` push
produces NO live preview.
```

This is exactly the kind of fast-moving operational state that goes stale silently: if the site
flips back to "Full" mode, every cloud session is told the wrong thing until someone remembers this
string lives inside a shell hook (not in a doc, not in config). Embedding a `(as of DATE)` marker in
a script is a smell that the value doesn't belong in the script.

#### Proposed solution

Move the current-mode fact to a single source of truth (a line in `docs/CLOUD/Claude.md`, which the
heredoc already cites) and have the hook reference it rather than restating it, or read it from an
env var set on the cloud environment. At minimum, add a comment reminding editors that the mode
string must be updated here when Netlify config changes.

#### Verification

Confirm the mode currently appears verbatim only in this hook; after the change the authoritative
value lives in one place and the hook points at it.

---

### [P3][duplication] `cloud-branch-preview.sh` restates ~37 lines of the branching/preview convention already in `docs/CLOUD/Claude.md`

**File(s):** `.claude/hooks/cloud-branch-preview.sh:12-49` — pinned at SHA f934d43

#### Problem

The heredoc (lines 13-49) is a full prose walkthrough of the cloud branching workflow, preview
modes, and slug-URL derivation — content that the file itself says lives in `docs/CLOUD/Claude.md`
("See docs/CLOUD/Claude.md", lines 7, 24). Two hand-maintained copies of the same multi-step
procedure will drift; the hook is the copy most likely to go unnoticed when the doc is updated.

#### Proposed solution

Trim the injected text to the actionable essentials the model needs at session start (branch off
`origin/main` as `feat/<feature>`; restricted mode → no preview for plain `feat/*`; how to get a
`feature/*` preview on demand) and defer the full explanation to the doc via a single pointer. Keep
injected context lean — it costs tokens every cloud session.

#### Verification

Compare the heredoc against `docs/CLOUD/Claude.md`'s "Two preview modes" section for overlap; after
trimming, the operational steps exist in one authoritative place with the hook citing it.

---

### [P3][consistency] Claude cloud `setup.sh` uses `#!/bin/bash` while the Codex scripts use `#!/usr/bin/env bash`

**File(s):** `.claude/cloud/setup.sh:1`, `.claude/hooks/*.sh:1`, `.codex/cloud/setup.sh:1`,
`.codex/cloud/maintenance.sh:1` — pinned at SHA f934d43

#### Problem

The `.claude` shell files use `#!/bin/bash`; the `.codex` files use `#!/usr/bin/env bash`. Both are
reasonable, but the split is arbitrary and undocumented. `#!/usr/bin/env bash` is the more portable
choice (macOS ships an ancient `/bin/bash` 3.2; a Homebrew bash lands on PATH), and ADR-0017
requires scripts to run on both macOS and Linux, so the env form is the better house style to
standardize on.

#### Proposed solution

Pick one shebang convention repo-wide for these hand-authored shell scripts (prefer
`#!/usr/bin/env bash`) and apply it to all six files.

#### Verification

`head -1 .claude/hooks/*.sh .claude/cloud/setup.sh .codex/cloud/*.sh` shows a mix today; after the
change all lines match.

---

### [P3][consistency] Claude `setup.sh` swallows every step with `|| echo` but, unlike the Codex scripts, never summarizes what was skipped

**File(s):** `.claude/cloud/setup.sh:22-45` vs `.codex/cloud/setup.sh:14-59` — pinned at SHA f934d43

#### Problem

Both cloud setups are best-effort (`set -uo pipefail`, no `-e`). The Codex scripts accumulate a
`warnings=()` array and print a "finished with N warning(s)" summary at the end (`setup.sh:53-60`),
so a partially-provisioned environment is obvious in the log. The Claude `setup.sh` instead prints a
one-off `echo` at each failing step (lines 23, 35, 44) with no roll-up, so a session that had npm,
Playwright, and chisel all fail scatters three lines through a long log with nothing tying them
together. Two setup scripts solving the same "best-effort with visible failures" problem in two
different shapes is avoidable inconsistency.

#### Proposed solution

Adopt the Codex `warn()`/summary pattern in `.claude/cloud/setup.sh` (or, conversely, agree the
inline-echo style is sufficient and simplify the Codex scripts) so both cloud setups report failures
the same way.

#### Verification

Force all three optional installs to fail and run each setup script; confirm today only Codex emits
a consolidated summary, and after the change both do.

---

### [P3][maintenance] Claude `setup.sh` hard-codes a Playwright fallback version that duplicates `package.json` and diverges from the Codex approach

**File(s):** `.claude/cloud/setup.sh:33-34` — pinned at SHA f934d43

#### Problem

```bash
PW_VERSION="$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/, '')" 2>/dev/null || true)"
npx --yes "playwright@${PW_VERSION:-1.61.1}" install --with-deps chromium
```

The literal fallback `1.61.1` duplicates the version already pinned in `package.json`
(`"@playwright/test": "^1.61.1"`). When the dependency is bumped, this fallback silently goes stale
— exactly the "hard-coded version drifts silently" failure the comment two lines up warns about. The
Codex scripts avoid the literal entirely by delegating to `node scripts/web.mjs playwright install`,
which resolves the installed version. Two cloud setups derive the Playwright version two different
ways, one of which reintroduces the drift the other eliminates.

#### Proposed solution

Prefer the Codex approach (`node scripts/web.mjs playwright install --with-deps chromium`) so the
version is always the resolved one and no literal exists to drift; or if the explicit
`npx
playwright@<version>` is needed for the CDN allowlist reason, drop the literal fallback and
fail loudly when the version can't be derived rather than pinning a number that will rot.

#### Verification

Bump `@playwright/test` in `package.json` and re-read the script: the derived path stays correct
while the `1.61.1` fallback does not; confirm the chosen fix leaves no literal version to maintain.

---

### [P3][maintenance] The audit-routine cron schedule table can silently drift from the actual Claude Routines with no automated check

**File(s):** `.claude/audit-conventions.md:150-172` — pinned at SHA f934d43

#### Problem

The "Scheduled runs (Claude Routines)" section declares itself "the source of truth for that
automation" and holds a six-row cron table (lines 161-168) plus the instruction "if a routine is
added, retired, or rescheduled, update this table in the same change." But the actual triggers live
in the Routines backend, not in the repo, so nothing enforces that the table matches reality —
unlike the `ruler:check` / `dprint check` gates that guard other generated/formatted content. A
rescheduled or deleted routine leaves this table wrong with no CI signal.

#### Proposed solution

Acknowledge the limitation explicitly (a note that this table is manually mirrored and can drift),
or add a lightweight reconciliation step — e.g. a documented periodic `list_triggers` cross-check,
or folding the cadence into the routines' own definitions so the doc points at them rather than
restating cron strings.

#### Verification

Confirm no script or CI job references this table's cron values; decide on a mirroring note or a
check and confirm the doc no longer claims unenforced "source of truth" status without a caveat.

---

### [P4][documentation] `settings.json` permission groups are unlabeled and unreferenced from any doc

**File(s):** `.claude/settings.json:29-78` — pinned at SHA f934d43

#### Problem

The allow list is visually grouped by blank lines (npm/node, git, read-only tools, curl-localhost,
mobile toolchain, skills, reads) but JSON can't carry comments, so the grouping intent is implicit,
and no doc explains what is auto-allowed or why. CLAUDE.md documents the hooks and rules but says
nothing about the permission policy, so a newcomer wondering "why did that command not prompt?" has
no pointer. The mobile-toolchain group in particular (`adb`, `xcrun simctl`, `xcode-select`,
`xcodebuild`, `pod`, `ruby`, lines 66-72) is non-obvious without the `mobile` skill context.

#### Proposed solution

Add a short "Auto-allowed commands" note to the appropriate doc (e.g. `docs/CONTRIBUTING.md` or a
line in CLAUDE.md's config section) pointing at `.claude/settings.json` and summarizing the intent
of each group, so the policy is discoverable and reviewable. Optionally split truly
environment-specific entries (the Apple-only mobile tools) into `settings.local.json` if they aren't
needed by all contributors.

#### Verification

A newcomer can locate the permission policy from the docs without opening `settings.json` blind;
confirm each group's purpose is stated somewhere in prose.

---

### [P4][dead-config] `node --check` / `node --input-type=module -e` allows have no repo consumer and are undocumented

**File(s):** `.claude/settings.json:39-40` — pinned at SHA f934d43

#### Problem

```json
"Bash(node --check *)",
"Bash(node --input-type=module -e *)",
```

Neither pattern appears in any script, hook, or skill
(`grep -rn "node --check\|input-type=module"
.claude .ruler scripts` returns only `settings.json`).
They're presumably for ad-hoc syntax checks / one-liners Claude runs, which is legitimate, but as
unexplained standalone allows they read like possibly-stale entries. `node --input-type=module -e *`
in particular grants arbitrary module evaluation, which is broad.

#### Proposed solution

If these support a real ad-hoc workflow, keep them but add them to the permission-policy note
proposed above so their purpose is on record; if they're leftovers, remove them. Consider whether
arbitrary `-e` evaluation should be auto-allowed at all.

#### Verification

Confirm no committed tooling depends on these; decide keep-and-document vs. remove and confirm no
workflow regresses.

---

### [P4][documentation] `Read(//tmp/**)` uses non-obvious double-slash absolute-path syntax with no explanation

**File(s):** `.claude/settings.json:77` — pinned at SHA f934d43

#### Problem

```json
"Read(//tmp/**)"
```

The leading `//` is Claude Code's syntax for a filesystem-absolute path (so this grants reads under
`/tmp`, where the session scratchpad lives), but it reads like a typo (`/tmp` double-slashed) to
anyone not steeped in the permission grammar. A reviewer could "fix" it to `/tmp/**` and change its
meaning. It's the only absolute-path entry in the file and carries no context.

#### Proposed solution

Leave the syntax as-is (it's correct) but cover it in the permission-policy doc note, or if the
project prefers, verify whether the intended path is the session scratchpad specifically and scope
it tighter than all of `/tmp`.

#### Verification

Confirm `Read(//tmp/**)` currently permits reading `/tmp/...` files and that `Read(/tmp/**)` would
not (validating the `//` is load-bearing), then ensure the distinction is documented.

---

### [P4][dead-config] `npm install *` auto-allows installing arbitrary packages without a prompt

**File(s):** `.claude/settings.json:31,33-35` — pinned at SHA f934d43

#### Problem

```json
"Bash(npm run *)",
"Bash(npm test*)",
"Bash(npm ci)",
"Bash(npm install)",
"Bash(npm install *)",
```

`Bash(npm install *)` lets any `npm install <pkg>` run with no confirmation — arbitrary package
addition (a supply-chain surface) is auto-approved. Given the repo's careful `dependencies` vs
`devDependencies` policy (ADR-0070) where getting a package's placement wrong breaks the Netlify
deploy, silently auto-installing arbitrary packages is a poor default; a human should at least see
the package name.

#### Proposed solution

Consider dropping `Bash(npm install *)` (keep bare `Bash(npm install)` for lockfile-driven installs
and `Bash(npm ci)`), so adding a new dependency prompts. If unattended installs are needed for the
cloud audit routines, scope them there rather than in the shared allow list.

#### Verification

Confirm `npm install some-package` currently runs without a prompt; after removal confirm it prompts
while `npm install` / `npm ci` still pass.

---

### [P4][documentation] `session-start.sh` and `cloud-branch-preview.sh` aren't discoverable from the primary config/instruction files

**File(s):** `.claude/settings.json:14-27`, `CLAUDE.md` (config section) — pinned at SHA f934d43

#### Problem

CLAUDE.md documents the PostToolUse `format-edited-file.sh` hook by name but never mentions the two
SessionStart hooks. They are described in `docs/CLOUD/Claude.md`, but a contributor reading the main
instructions or `settings.json` has no in-place signal that two scripts run at every session start
(one of which injects a whole workflow prompt into context). The `settings.json` registration is
just two bare command paths (lines 19, 23) with no comment (JSON limitation).

#### Proposed solution

Add a one-line mention of the SessionStart hooks (and their `CLAUDE_CODE_REMOTE` guard) to the
config-overview area that already names `format-edited-file.sh`, pointing at `docs/CLOUD/Claude.md`
for detail, so all three hooks are discoverable from one place.

#### Verification

From CLAUDE.md alone a reader can enumerate all registered hooks and find where each is documented;
confirm the SessionStart pair is now referenced.

---

## Source: Code audit — .github CI workflows

### [P1][consistency] Issue templates apply labels (`bug`, `enhancement`) that don't exist in the declarative taxonomy

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md:5`, `.github/ISSUE_TEMPLATE/feature_request.md:5`
— pinned at SHA f934d43

#### Problem

`bug_report.md` sets `labels: bug` and `feature_request.md` sets `labels: enhancement`:

```yaml
# bug_report.md
labels: bug
# feature_request.md
labels: enhancement
```

But the single source of truth for labels, `.github/labels.yml`, defines **`type:bug`** and
**`type:feature`** — there is no `bug` or `enhancement` label in the taxonomy (lines 7-30). Since
`label-sync.yml` runs with `skip-delete: true`, GitHub's default `bug`/`enhancement` labels are
never pruned, so every issue opened through these templates lands with an off-taxonomy label. This
directly undermines the automation and skills keyed on `type:*` (`docs/ISSUE-WORKFLOW.md`,
`burn-down-backlog`, `vet-audits`, the `reviewed`→ToDo move) — a bug filed via the template is not
`type:bug`, so `area:*`/`type:*` filtering silently misses it. The `task.md` template (`labels: ''`)
is at least honest about carrying no label, but leaves the same gap.

#### Proposed solution

Change the template front-matter to the real taxonomy labels: `labels: type:bug` and
`labels: type:feature` (multiple allowed, e.g. `type:bug, needs-triage`). Preset `task.md` to
`labels: type:chore`. Optionally add the two GitHub defaults as explicit entries in `labels.yml` and
flip `skip-delete` for a one-time prune — but aligning the templates to `type:*` is the correct fix.

#### Verification

`grep -R "^labels:" .github/ISSUE_TEMPLATE` and confirm every value appears as a `name:` in
`.github/labels.yml`. Open a test issue from each template and confirm the applied label matches the
taxonomy.

---

### [P1][security] Test/deploy/smoke workflows declare no `permissions:` block — they run with the default (write-capable) token

**File(s):** `.github/workflows/test.yml:1-11`, `.github/workflows/android-deploy.yml:10-17`,
`.github/workflows/ios-deploy.yml:11-18`, `.github/workflows/blobs-smoke.yml:14-24` — pinned at SHA
f934d43

#### Problem

`pages.yml` (18-22), `label-sync.yml` (17-18), and `label-to-todo.yml` (9-10) each scope their
`GITHUB_TOKEN` with an explicit `permissions:` block. The four remaining workflows — `test.yml`,
`android-deploy.yml`, `ios-deploy.yml`, `blobs-smoke.yml` — declare **none**, so they inherit the
repository/org default, which for many repos is the legacy read-write token. These workflows run
untrusted PR code (`test.yml` triggers on `pull_request`), download and execute a piped installer
(`curl … | bash` for Maestro), and handle `secrets.ADMIN_ACCESS_TOKEN` (`blobs-smoke.yml`). A
compromised dependency or action step would have write access to contents, issues, and more.

#### Proposed solution

Add a least-privilege top-level `permissions:` block to each. `test.yml`, `android-deploy.yml`, and
`ios-deploy.yml` only need `contents: read`. `blobs-smoke.yml` needs `contents: read`. Set the
default org-wide to read-only as defense in depth. This also makes "what can this workflow touch"
grepable and consistent with the other three workflows.

#### Verification

Every workflow file contains a `permissions:` block;
`grep -L "permissions:" .github/workflows/*.yml` returns nothing. Re-run a PR build to confirm no
step needs a write scope that was removed.

---

### [P2][duplication] The checkout + setup-node@24 + `npm ci` preamble is copy-pasted across five jobs

**File(s):** `.github/workflows/test.yml:18-26` and `:89-97`,
`.github/workflows/android-deploy.yml:27-49`, `.github/workflows/ios-deploy.yml:25-33`,
`.github/workflows/blobs-smoke.yml:34-38` — pinned at SHA f934d43

#### Problem

Six jobs repeat some subset of this identical block:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v6
  with:
    node-version: 24
    cache: npm
- name: Install dependencies
  run: npm ci
```

Any change (node version, cache strategy, adding `always-auth`, pinning to a SHA) must be edited in
five places and is already drifting (see the node-version and checkout-version findings below).

#### Proposed solution

Extract a composite action, e.g. `.github/actions/setup/action.yml`, that runs checkout +
setup-node + `npm ci`, with an input like `install: true|false` (so `blobs-smoke.yml`, which
deliberately skips `npm ci`, can pass `install: false`). Each job becomes
`- uses: ./.github/actions/setup`. Centralizes the node version and cache config in one file.

#### Verification

`grep -rc "actions/setup-node" .github/workflows` drops to the composite action only; all workflows
still install deps and pass CI.

---

### [P2][versioning] Node version `24` is hard-coded in five places with no single source of truth (and disagrees with the docs)

**File(s):** `.github/workflows/test.yml:22` and `:93`, `.github/workflows/android-deploy.yml:31`,
`.github/workflows/ios-deploy.yml:29`, `.github/workflows/blobs-smoke.yml:38` — pinned at SHA
f934d43

#### Problem

`node-version: 24` is a magic constant repeated five times. There is no `.nvmrc`, and `package.json`
`engines` isn't consulted (`node-version-file:` is unused). Bumping Node means editing five lines
and hoping none is missed. It also **conflicts with the documented floor**: the `testing` skill and
`mobile` skill state "Node ≥ 22" / "Node ≥ 22 … JDK 21", so CI silently runs a version different
from what the docs promise contributors.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) at the repo root as the single source, and switch every
`setup-node` to `node-version-file: .nvmrc` (folded into the composite action above). Reconcile the
docs to name the exact CI version. Local dev, CI, and docs then read one number.

#### Verification

`grep -rn "node-version" .github/workflows` shows only `node-version-file`; `cat .nvmrc` is the one
place the version lives. `nvm use` in a fresh checkout selects it.

---

### [P2][maintainability] CI rebuilds the debug APK inline instead of calling the committed `android:apk` script

**File(s):** `.github/workflows/android-deploy.yml:55-61` (Build debug APK) — pinned at SHA f934d43

#### Problem

The step reimplements, in inline shell, exactly what an npm script already does:

```yaml
- name: Build debug APK
  run: |
    npm run cap:sync
    cd android
    chmod +x gradlew
    ./gradlew :app:assembleDebug
```

`package.json` defines
`"android:apk": "npm run cap:sync && node scripts/gradle.mjs :app:assembleDebug"`, and
`scripts/gradle.mjs`'s header explicitly exists "to keep the npm scripts free of an inline
`cd android && ./gradlew` shell dance" (ADR-0017). CI bypasses both the script and the helper,
duplicating logic and directly violating the repo convention that the Gradle wrapper is invoked via
a Node helper, never inline `cd android && ./gradlew`. If the build command changes (task name,
extra flags), the script and this workflow drift.

#### Proposed solution

Replace the whole step with `run: npm run android:apk`. If the debug artifact path is needed later,
it is deterministic (`android/app/build/outputs/apk/debug/app-debug.apk`, already referenced at line
77). Drop the manual `chmod +x gradlew` — `gradle.mjs` spawns the wrapper by absolute path.

#### Verification

`npm run android:apk` locally produces the same APK; the tag workflow still installs and smokes it.
`grep -rn "gradlew" .github/workflows` returns nothing.

---

### [P2][consistency] `actions/checkout` pinned to `@v4` in one workflow and `@v7` in every other

**File(s):** `.github/workflows/label-sync.yml:25` (`actions/checkout@v4`) vs
`.github/workflows/test.yml:18`, `android-deploy.yml:27`, `ios-deploy.yml:25`, `blobs-smoke.yml:34`,
`pages.yml:37`, `label-to-todo.yml:34` (all `@v7`) — pinned at SHA f934d43

#### Problem

Six workflows are on `actions/checkout@v7`; `label-sync.yml` alone is stuck on `@v4`. This is stale
drift — nothing about label sync needs the older major. Inconsistent pins make "what version do we
run" un-grepable and mean a security advisory or Node-runtime bump has to be tracked per-file.

#### Proposed solution

Bump `label-sync.yml` to `actions/checkout@v7` (or, better, pin all of them to a single SHA and let
the composite action own it — see the duplication finding). Sweep for any other lagging pins at the
same time.

#### Verification

`grep -rn "actions/checkout@" .github` shows a single version everywhere. Re-run `label-sync` via
`workflow_dispatch` and confirm it still reconciles labels.

---

### [P2][duplication] The Maestro CLI install step is duplicated verbatim between the Android and iOS workflows

**File(s):** `.github/workflows/android-deploy.yml:62-65`, `.github/workflows/ios-deploy.yml:35-38`
— pinned at SHA f934d43

#### Problem

Both workflows contain the identical block:

```yaml
- name: Install Maestro CLI
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

The `testing` skill even documents a footgun here (`get.maestro.mobile.dev`, not `get.maestro.dev`).
Duplicating a curl-pipe-bash installer across two files means a URL fix or a version pin lands in
one and is forgotten in the other. It's also unpinned — every run installs whatever Maestro is
latest.

#### Proposed solution

Extract to a composite action `.github/actions/install-maestro/action.yml` used by both jobs.
Consider pinning a Maestro version there for reproducibility. This also gives the URL-footgun
comment a single home.

#### Verification

Both tag workflows still run the Maestro smoke; `grep -rn "get.maestro" .github/workflows` returns
nothing (moved into the composite action).

---

### [P2][duplication] The "Upload Maestro report" artifact step is near-identical across the two native workflows

**File(s):** `.github/workflows/android-deploy.yml:82-89`, `.github/workflows/ios-deploy.yml:47-54`
— pinned at SHA f934d43

#### Problem

Both jobs end with the same upload-artifact step; only the artifact `name` (`maestro-report` vs
`maestro-ios-report`) differs. Path (`~/.maestro/tests/`), `retention-days: 7`,
`if-no-files-found: ignore`, and the `if: ${{ !cancelled() }}` guard are duplicated. Drift risk on
retention/path changes.

#### Proposed solution

Fold into the same composite action as the Maestro install (or a dedicated `upload-maestro-report`
composite) taking the artifact name as an input. Retention and path then live once.

#### Verification

Both workflows still upload their report artifact with distinct names; the retention/path values
exist in a single file.

---

### [P2][maintainability] Missing `timeout-minutes` on the two label-automation jobs — a hung `gh api` call runs for the 6-hour default

**File(s):** `.github/workflows/label-sync.yml:22-26` (sync job),
`.github/workflows/label-to-todo.yml:17-31` (move-to-todo job) — pinned at SHA f934d43

#### Problem

Every other job in the repo sets a `timeout-minutes` (test 10/15, android/ios 40, blobs 5, pages 5).
The `sync` job in `label-sync.yml` and the `move-to-todo` job in `label-to-todo.yml` set none, so a
stuck GraphQL call (rate-limit, network hang) in `label-to-todo.sh` or the labeler action can burn
up to the 360-minute default per run, and `label-to-todo` fires on every `issues: labeled` event.

#### Proposed solution

Add `timeout-minutes: 5` (generous for a couple of `gh api` calls) to both jobs. Makes the timeout
convention uniform across all workflows.

#### Verification

`grep -L "timeout-minutes" .github/workflows/*.yml` returns nothing meaningful; force a
`workflow_dispatch` of label-sync and confirm it completes well under the limit.

---

### [P3][security] Third-party actions are pinned to mutable major tags, not commit SHAs

**File(s):** `.github/workflows/android-deploy.yml:68`
(`reactivecircus/android-emulator-runner@v2`), `.github/workflows/label-sync.yml:26`
(`crazy-max/ghaction-github-labeler@v5`), plus every `actions/*@vN` — pinned at SHA f934d43

#### Problem

All actions — first-party (`actions/checkout@v7`, `actions/setup-node@v6`, `actions/cache@v6`,
`actions/upload-artifact@v7`) and third-party (`reactivecircus/android-emulator-runner@v2`,
`crazy-max/ghaction-github-labeler@v5`) — are pinned to floating major-version tags. A tag is
mutable: a compromised or repointed tag executes new code in CI with the workflow's token (see the
missing-`permissions` finding for how much that token can do). Third-party actions like the
emulator-runner and the labeler are the higher-risk cases.

#### Proposed solution

Pin actions to full commit SHAs with a trailing `# vX.Y.Z` comment, and let Dependabot (next
finding) propose bumps. At minimum, SHA-pin the two third-party actions.

#### Verification

`grep -rnE "uses: .+@v[0-9]+$" .github/workflows` returns only first-party actions you consciously
choose to leave on tags; third-party uses show a 40-char SHA.

---

### [P3][dead-config] No `dependabot.yml` — nothing keeps the pinned actions or npm deps updated

**File(s):** `.github/` (absent `dependabot.yml`) — pinned at SHA f934d43

#### Problem

There is no `.github/dependabot.yml`. Combined with the tag-pinned (or, if SHA-pinned, frozen)
actions above and the hand-maintained npm tree, action and dependency updates are entirely manual.
Security patches to `android-emulator-runner`, `checkout`, etc. land only if someone notices.

#### Proposed solution

Add `.github/dependabot.yml` with a `github-actions` ecosystem (weekly) and, if desired, an `npm`
ecosystem scoped to the root `package.json`. Group patch/minor action bumps to keep PR noise down.

#### Verification

File exists and validates; Dependabot opens its first "bump actions" PR on the next scheduled run.

---

### [P3][maintainability] Playwright version is resolved by a brittle inline `node -p` reaching into `package-lock.json` internals

**File(s):** `.github/workflows/test.yml:105-107` (Resolve Playwright version) — pinned at SHA
f934d43

#### Problem

```yaml
run: echo "version=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")" >> "$GITHUB_OUTPUT"
```

This nests double-quotes inside a `run:` string, hard-codes the lockfile's internal
`packages['node_modules/…']` key shape (a lockfile-v3 detail that changed across npm majors), and is
the sole consumer of a value used only to build the cache key. Any lockfile-format change or an
added quoting layer breaks it silently (cache key becomes `playwright-…-` with an empty version,
quietly disabling the WebKit-aware cache).

#### Proposed solution

Move the resolution into a committed helper (e.g. `scripts/playwright-version.mjs`) that reads the
installed `@playwright/test/package.json` version and prints it, called as
`node scripts/playwright-version.mjs >> "$GITHUB_OUTPUT"`. Testable and robust to lockfile-format
churn.

#### Verification

`node scripts/playwright-version.mjs` prints the same version the inline expression does; the cache
key in a CI run contains a non-empty version.

---

### [P3][consistency] Android emulator API level is a second source of truth for the `Pixel_7_Pro_API_33` AVD

**File(s):** `.github/workflows/android-deploy.yml:70-74` (`api-level: 33`, `target: google_apis`,
`arch: x86_64`, long `emulator-options` string) — pinned at SHA f934d43

#### Problem

CI hard-codes `api-level: 33` (and `target`/`arch`) in the emulator-runner inputs, while the local
smoke path (`scripts/android-emulator-smoke.mjs`, `scripts/lib/android.mjs`) targets an AVD named
`Pixel_7_Pro_API_33`. The API level "33" now lives in two unrelated places; a bump to API 34 must be
made in both or CI and local diverge. The `emulator-options` value is also a long undocumented magic
string (`-no-snapshot-save -no-window -noaudio -no-boot-anim -camera-back none`) with no named
constant or comment explaining each flag.

#### Proposed solution

Derive the API level from a single source (an env/constant shared with `scripts/lib/android.mjs`, or
at least a workflow `env:` used to interpolate both the runner input and any reference). Add a brief
comment naming why each `emulator-options` flag is present (headless/perf).

#### Verification

Changing the API level in one place updates both CI and local smoke; a comment documents the
emulator flags.

---

### [P3][maintainability] `label-to-todo.sh` caps project items and fields at `first: 100` with no pagination

**File(s):** `.github/scripts/label-to-todo.sh:23` (`projectItems(first: 100)`), `:37`
(`fields(first: 100)`), `:47`? — pinned at SHA f934d43

#### Problem

The GraphQL query fetches the issue's `projectItems(first: 100)` and the project's
`fields(first:
100)` with no pagination. If the issue is already in more than 100 projects
(unlikely) or, more plausibly, the project grows many single-select fields, the `Status` field or
the existing item can fall outside the first page and the script will silently "add it now"
(line 118) as a duplicate or fail to find the field. It's a latent correctness edge on an otherwise
careful script.

#### Proposed solution

For a single-owner project this is low-risk, so at minimum add a comment documenting the 100-item
assumption. If robustness matters, page the `fields` connection or query the field by name directly.

#### Verification

Confirm the target project has <100 fields; add a comment or paginate. Trigger the `reviewed` label
on a test issue and confirm it moves to ToDo.

---

### [P3][consistency] Concurrency control is applied unevenly — only two of seven workflows declare a group

**File(s):** `.github/workflows/test.yml:8-10` (cancel), `pages.yml:24-26` (no-cancel),
`label-to-todo.yml:12-14` (cancel); absent in `android-deploy.yml`, `ios-deploy.yml`,
`blobs-smoke.yml`, `label-sync.yml` — pinned at SHA f934d43

#### Problem

`test`, `pages`, and `label-to-todo` set `concurrency`; the other four don't. `label-sync.yml` can
double-run if two `labels.yml` pushes land close together (two labelers racing the same label set),
and `blobs-smoke` can run overlapping instances across rapid `deployment_status` events. There's no
documented rationale for which workflows opt in.

#### Proposed solution

Add a `concurrency` group to `label-sync` (`group: label-sync`, `cancel-in-progress: false` — don't
cancel a partial reconcile) and to `blobs-smoke` keyed on the deploy URL. Leave the tag-triggered
native smokes without cancel (each tag is a distinct release). Add a one-line comment on each
explaining the cancel/no-cancel choice, mirroring `pages.yml`'s existing comment.

#### Verification

Each workflow either has a `concurrency` block with a rationale comment or is intentionally exempt;
two quick label pushes no longer run two overlapping `label-sync` jobs.

---

### [P4][duplication] The `chromium webkit` browser list is repeated across the two Playwright install steps

**File(s):** `.github/workflows/test.yml:122` (install `chromium webkit`), `:128` (install-deps
`chromium webkit`) — pinned at SHA f934d43

#### Problem

```yaml
- run: npx playwright install --with-deps chromium webkit   # cache miss
- run: npx playwright install-deps chromium webkit           # cache hit
```

The browser set `chromium webkit` is hard-coded in two mutually-exclusive steps. Adding a browser
(e.g. firefox) or dropping WebKit means editing both, and the cache-key comment on line 118 is a
third place that encodes the same WebKit assumption. Easy to update one and desync coverage.

#### Proposed solution

Hoist the browser list into a job-level `env: PW_BROWSERS: "chromium webkit"` and reference
`${{ env.PW_BROWSERS }}` in both steps, so the set is defined once. (Or collapse the two steps —
`install-deps` on a cache hit and `install --with-deps` on a miss — behind a small script.)

#### Verification

`grep -c "chromium webkit" .github/workflows/test.yml` drops to one definition; CI still installs
and runs both browser projects with `REQUIRE_WEBKIT: 1`.

---

### [P4][maintainability] `ALLOWED_TOKENS_LIST` hard-codes retry-indexed values tightly coupled to `retries: 2` in a different file

**File(s):** `.github/workflows/test.yml:143` — pinned at SHA f934d43

#### Problem

```yaml
ALLOWED_TOKENS_LIST: daycare-club,daycare-club-retry1,daycare-club-retry2
```

The `-retry1`/`-retry2` suffixes exist solely because `web/playwright.config.ts` sets `retries: 2`
in CI (one token per attempt, per the comment). This is an invisible cross-file coupling: bump
retries to 3 and the burst spec's third attempt has no allowlisted token, producing a confusing
rate-limit failure with no signal pointing back here. The magic list lives in a workflow env, far
from the config that dictates its length.

#### Proposed solution

Derive the token list from the retry count in one place — e.g. generate it in `playwright.config.ts`
(or a shared constant the spec and config both read) so the list length tracks `retries`
automatically, or add a comment at the `retries` definition pointing at this env. At minimum,
cross-reference both sides so a future retry bump updates the token list.

#### Verification

Changing `retries` in `playwright.config.ts` no longer requires a manual edit here (or a
lint/comment flags the coupling); the rate-limit burst spec passes on every retry attempt.

---

### [P4][consistency] `upload-artifact` steps disagree on `if-no-files-found` handling

**File(s):** `.github/workflows/test.yml:151-157` (no `if-no-files-found`) vs
`android-deploy.yml:82-89` and `ios-deploy.yml:47-54` (`if-no-files-found: ignore`) — pinned at SHA
f934d43

#### Problem

The Playwright report upload omits `if-no-files-found`, so it defaults to `warn` and emits an
annotation when `web/playwright-report/` is empty (e.g. a build that failed before Playwright ran).
The two Maestro uploads set `if-no-files-found: ignore`. No stated reason for the difference — it's
just inconsistency that produces noisy warnings on some failed runs.

#### Proposed solution

Decide one policy. A missing Playwright report on a passing-up-to-that-point run is worth a warning,
so `warn` may be intentional — if so, add a comment. Otherwise set all three to the same value.

#### Verification

All three `upload-artifact` steps set `if-no-files-found` explicitly (or a comment explains the
default); a run that produces no report doesn't emit an unexplained warning.

---

### [P4][naming] Redundant workflow/job naming: workflow "Tests" contains a job named "Tests"

**File(s):** `.github/workflows/test.yml:1` (`name: Tests`), `:84-85` (job `test`, `name: Tests`) —
pinned at SHA f934d43

#### Problem

The workflow is named `Tests` and its second job is also displayed as `Tests`, so the GitHub checks
list shows `Tests / Tests` alongside `Tests / Quality`. The `test.yml` file actually runs a
`quality` gate (type-check, lint, format, SVG/ruler/token/asset/scrapbook drift, `npm audit`) plus
the test suites — the filename and workflow name undersell that it's the whole push/PR gate.
`Tests / Tests` is a poor, un-scannable check name.

#### Problem grepability

Someone searching required-status-check config for "the CI gate" sees `Tests / Quality` and
`Tests / Tests` and can't tell what the second covers (unit + asset + E2E + driver smoke).

#### Proposed solution

Rename the second job's display name to something distinct (`Unit & E2E`, `Test suites`), or rename
the workflow to `CI` so the checks read `CI / Quality` and `CI / Tests`. Keep the filename or rename
to `ci.yml` for grepability.

#### Verification

The GitHub checks list shows two distinctly-named jobs; branch-protection required checks still
resolve.

---

### [P5][dead-config] `label-sync` comment references toggling `dry-run` that is already off

**File(s):** `.github/workflows/label-sync.yml:7-8` and `:28-30` — pinned at SHA f934d43

#### Problem

The header comment says "flip dry-run off / skip-delete as needed for a full sync," but the workflow
already sets `dry-run: false` (line 29). The comment describes a state that doesn't match the
config, so a reader has to reconcile "flip it off" against "it's already off." Minor staleness on an
otherwise well-documented file.

#### Proposed solution

Reword to reflect reality: dry-run is off (it does apply changes); the knob left conservative is
`skip-delete: true` (won't prune hand-made labels) — flip that to `false` for a full reconcile.

#### Verification

The comment matches the actual `dry-run`/`skip-delete` values.

---

### [P5][consistency] Repo owner casing is inconsistent across `.github` URLs (`kylemit` vs `KyleMit`)

**File(s):** `.github/ISSUE_TEMPLATE/config.yml:7` (`github.com/kylemit/splotch/...`),
`.github/workflows/pages.yml:3` (`kylemit.github.io/Splotch/`),
`.github/workflows/label-to-todo.yml:24` and `:26` (`KyleMit`) — pinned at SHA f934d43

#### Problem

The owner is written `kylemit` in the issue-template contact link and the Pages comment, but
`KyleMit` in `label-to-todo.yml` (both the comment URL and `PROJECT_OWNER: KyleMit`). GitHub
redirects are case-insensitive so nothing breaks, but the inconsistency is a papercut and, for
`PROJECT_OWNER`, the GraphQL `repositoryOwner(login:)` lookup is a value that should match the
canonical casing exactly to avoid a surprise if lookups ever tighten.

#### Proposed solution

Pick the canonical casing (the account displays as `KyleMit`) and normalize all `.github` references
to it, including the `config.yml` contact link and the `pages.yml` comment.

#### Verification

`grep -rin "kylemit" .github` shows one consistent casing; the `label-to-todo` GraphQL owner lookup
still resolves.

---

### [P5][maintainability] Issue templates use legacy Markdown format instead of validated Issue Forms

**File(s):** `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, `task.md` — pinned at SHA
f934d43

#### Problem

All three templates are the old Markdown-with-front-matter format. Their prompts (Steps to
Reproduce, Device Information, checkboxes) are free text a reporter can delete wholesale, so nothing
is enforced — combined with the P1 label mismatch, an issue can arrive with no structure and a wrong
label. GitHub Issue Forms (`.yml`) enforce required fields, dropdowns (e.g. device OS, target-user),
and reliably-applied labels.

#### Proposed solution

Convert to Issue Forms (`bug_report.yml`, `feature_request.yml`) with `required:` fields and
`labels:` set to the correct `type:*` taxonomy values. This solves the P1 label bug and the
structure gap together. Keep `task.md`/`blank` for free-form chores if desired.

#### Verification

Opening a bug via the form requires the key fields and applies `type:bug`; `config.yml`
`blank_issues_enabled` still allows an escape hatch.

---

## Summary

23 findings. The two P1s are correctness/security: issue templates apply labels outside the
declarative taxonomy (mislabeling every templated bug/feature and defeating `type:*` automation),
and four workflows run with an unscoped default token. The P2 cluster is the classic CI-hygiene set
— one duplicated checkout/setup/`npm ci` preamble to extract into a composite action, a hard-coded
Node `24` in five places (that disagrees with the docs), CI rebuilding the APK inline instead of
calling `npm run android:apk` (violating the ADR-0017 gradle-helper convention), a stray
`checkout@v4`, duplicated Maestro install/upload steps, and missing timeouts on the label jobs. The
tail covers supply-chain pinning (SHA pins + a missing `dependabot.yml`), brittle inline `node -p`
lockfile parsing, and assorted consistency papercuts.

## Source: Code audit — scrapbook · run-artifact code

### [P2][duplication] Hub `CATEGORIES` registry + per-category page counts duplicate the generator's source of truth with no drift guard

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:182-191`, `:220` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

The hub hardcodes the full category list and page counts:

```js
var CATEGORIES = [
  { id: 'farm', name: 'Farm', pages: 6 },
  { id: 'dinosaur', name: 'Dinosaurs', pages: 6 },
  ...{ id: 'vehicles', name: 'Vehicles', pages: 6 },
];
```

and renders `'Category ' + (i + 1) + ' of ' + CATEGORIES.length + ' · ' + cat.pages + ' pages'`
(line 220). Every value here is a copy of state that actually lives in the proof-sheet generator
(`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs`) and in the sibling `*.html` sheets.
Nothing keeps them in lockstep:

* `npm run scrapbook:check` only verifies each *collection dir* resolves to one entry page
  (`collectionsMissingEntry`) and that the top-level `index.html` is fresh — it never looks inside
  the hub. Adding a new category sheet (e.g. a future `bugs.html`) leaves the hub silently omitting
  it; the sheet is reachable by URL but invisible in the tab strip.
* A page-count change (say `farm` drops from 6 to 5 pages) makes the "· 6 pages" label lie, with no
  test to catch it.

This is the single highest-drift spot in the whole section: it is the only committed page with a
hardcoded mirror of generator data and no automated reconciliation.

#### Proposed solution

Prefer eliminating the copy: have the proof-sheet generator (or a small `scrapbook:index`-adjacent
step) emit the `CATEGORIES` array — or the whole hub — from the same manifest it uses to build the
sheets, so id/name/pages have one source. If the hub must stay hand-authored, add a check (extend
`scrapbook:check`) that (a) every `coloring-book-proof-sheets/*.html` sheet except `index.html`
appears as a `CATEGORIES` entry and vice-versa, and (b) each `pages` value matches the sheet's
actual page count. At minimum, drop the `pages` field if it can't be verified — a wrong count is
worse than no count.

#### Verification

Add a ninth category sheet without editing the hub and confirm today it does not appear in the tabs
and no check fails; after the fix, either the tab appears automatically or `scrapbook:check` fails
with a clear message. For the count: edit a sheet's page count and confirm the guard flags the stale
`pages` value.

---

### [P3][correctness] Deep-linking via `hashchange` (or back/forward) leaves `document.title` stale

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229`, `:240` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

`show(i, skipHash)` updates the tab title only inside the non-skip branch:

```js
if (!skipHash) {
  if (location.hash.replace(/^#/, '') !== cat.id) location.hash = cat.id;
  document.title = 'Splotch proof sheets — ' + cat.name; // only here
}
```

The `hashchange` listener calls `show(indexFromHash(), true)` (line 240) with `skipHash = true`, so
navigating by editing the URL hash, or using browser back/forward between categories, swaps the
iframe but never updates `document.title`. The visible page changes while the tab caption stays on
whatever category was last selected by click. The bug exists because the flag conflates two
unrelated concerns (see next finding).

#### Proposed solution

Move `document.title = …` out of the `if (!skipHash)` block so it runs on every category switch
regardless of how it was triggered. Keep only the `location.hash` write gated by the flag.

#### Verification

Load the hub, click "Farm", then edit the URL to `#space` (or press Back). Observe the tab title
stays "…Farm" before the fix; after moving the assignment out, the title tracks the shown category
on every path.

---

### [P4][readability] `skipHash` boolean is a control-flag that silently gates two behaviours

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:214-229` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The parameter is named for one job (skip writing the hash) but the `if (!skipHash)` block also owns
the `document.title` update. A reader reasonably assumes `skipHash` only suppresses the URL write,
which is exactly how the stale-title bug (previous finding) slipped in. Bundling "should I write the
hash?" and "should I update the title?" under one negated flag is a classic control-coupling smell.

#### Proposed solution

Split the concerns: always update the iframe, tab state, and title; take a separate,
positively-named argument (e.g. `writeHash = true`) that governs only the `location.hash`
assignment. The two callers that pass `true` today (`hashchange`) become `writeHash = false`.

#### Verification

Re-read `show()`: each side effect should be unconditional except the hash write. Confirm both
callers still behave (click writes hash; hashchange does not re-write it and loop).

---

### [P4][correctness] Initial load rewrites the URL to `#farm` and pushes a history entry

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:226`, `:242` (hand-authored hub) —
pinned at SHA f934d43

#### Problem

On first load with no hash, `show(indexFromHash())` runs with `indexFromHash()` returning `0`, and
because `skipHash` is falsy it executes `location.hash = cat.id` (line 226) since `'' !== 'farm'`.
So opening the bare hub URL immediately mutates the address bar to `…/index.html#farm` and, because
assigning `location.hash` creates a new history entry, adds a spurious Back-button stop before the
page the user actually arrived from. The shareable/canonical URL a visitor copies also silently
gains a `#farm` they didn't choose.

#### Proposed solution

For the canonicalisation-on-load case use `history.replaceState(null, '', '#' + cat.id)` instead of
assigning `location.hash`, so the hash is normalised without a new history entry. (User-initiated
tab clicks can keep pushing entries if per-category back/forward is desired — that's a deliberate
choice to make explicitly.)

#### Verification

Open the hub from another page, then press Back: today it returns to `#farm`-less state (an extra
stop) rather than the previous page. After the fix, Back leaves the hub directly.

---

### [P3][maintainability] Hub palette renames the shared chrome tokens, defeating the "keep in sync by eye" note

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:8-43` (hand-authored hub) — pinned at
SHA f934d43

#### Problem

The hub opens with a comment promising the palette is "Kept in sync by eye with the shared scrapbook
chrome (scripts/lib/scrapbook-chrome.mjs)". But it then declares the tokens under *different names*
than the chrome uses — `--fg`/`--bg`/`--bar`/`--line`/`--tab-bg`/`--tab-fg` here vs
`--ink`/`--paper`/`--card-2`/`--hair` in the generated pages (e.g. `scrapbook/index.html:12-13`,
`crayon-brush-samples/index.html:11-13`). A maintainer trying to reconcile the two blocks after a
chrome change can't diff them line-for-line; they must first mentally map `--fg` ↔ `--ink`, `--bar`
↔ `--card-2`, etc. The renamed vocabulary makes the one sync mechanism the file relies on (human
eyeballing) maximally error-prone.

#### Proposed solution

Adopt the chrome's exact token names in the hub so the two `:root` blocks are copy-comparable (or a
future extraction can literally share them). Where the hub genuinely needs extra tokens (`--tab-bg`,
`--tab-fg`), keep those but layer them on top of the shared names rather than substituting the core
ones.

#### Verification

Diff the hub's `:root` light block against the shared chrome's after the rename — the shared subset
should match token-name-for-token-name, so a drift is a visible diff.

---

### [P4][duplication] Hub re-implements the masthead/crayon-strip/breadcrumb chrome by hand

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:150-173` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The `<header>` block hand-copies the crayon-strip brand, the `Splotch / Scrapbook` wordmark, and the
breadcrumb that `scripts/lib/scrapbook-chrome.mjs` generates for every other page. The README even
concedes it "carries the shared crayon masthead + breadcrumb by hand; keep it in sync". This is real
structural duplication (distinct from the token duplication above): a change to the generated chrome
(a new brand element, a different crumb separator) leaves this page visually diverged with no guard.

#### Proposed solution

Since the hub is intentionally hand-authored (an iframe switcher the generator doesn't produce), the
cleanest fix is to have `scrapbook-chrome.mjs` expose its masthead/breadcrumb fragment as a reusable
export and generate the hub's shell (injecting the hand-authored tab strip + iframe + script) rather
than hand-writing the chrome. If full generation is too much, at least factor the chrome HTML into a
shared string both the generator and a tiny hub-build step consume.

#### Verification

Change the generated masthead (e.g. crumb separator) and confirm the hub does not follow today;
after the fix the hub inherits the change (or a check flags the divergence).

---

### [P3][discoverability] README omits the `crayon-brush-samples` collection and how it's regenerated

**File(s):** `scrapbook/README.md` (whole file; cf. the icons paragraph at `:66-71`) — pinned at SHA
f934d43

#### Problem

The README's "Live URLs" section calls out how to regenerate the coloring-book proof sheets, the
icon gallery, and the model-eval report, but never mentions the `crayon-brush-samples/` collection —
even though it is a committed top-level collection with its own generators
(`tools/asset-gen/crayon-brush-samples/build-sheet.mjs` → `index.html`, `build-compare-sheet.mjs` →
`vs-current.html`). A newcomer who opens `scrapbook/crayon-brush-samples/` in the tree has, unlike
every other collection, no in-`scrapbook` pointer to what produced it or how to refresh it.

#### Proposed solution

Add a short paragraph alongside the icons/coloring entries: what `crayon-brush-samples/` is, its
live URL (`…/crayon-brush-samples/`), and that `index.html`/`vs-current.html` are built by the
`tools/asset-gen/crayon-brush-samples/` scripts (link to that dir's README). Keep it symmetric with
the existing collection blurbs.

#### Verification

Grep `scrapbook/README.md` for `crayon-brush-samples` — currently zero hits; after the fix the
collection is documented like the others.

---

### [P3][discoverability] README warns about masthead sync but not the hub's category-registry maintenance step

**File(s):** `scrapbook/README.md:61-65` — pinned at SHA f934d43

#### Problem

The README tells maintainers the coloring hub `index.html` is a keeper that must be kept "in sync"
with the chrome masthead/breadcrumb by hand. It does *not* mention the more consequential manual
step: adding or removing a proof-sheet category requires editing the hub's `CATEGORIES` array (and
its `pages` count) or the new sheet is invisible in the hub (see the P2 finding). The one piece of
the hub most likely to need editing is the one the docs are silent on.

#### Proposed solution

Extend the existing hub note to state that adding/renaming/removing a category means editing the
`CATEGORIES` array in `coloring-book-proof-sheets/index.html` (and its `pages` count), until/unless
that array is generated. Pair this with whatever guard the P2 finding lands on.

#### Verification

The README's coloring-hub paragraph should name `CATEGORIES` as a hand-maintained list; confirm a
reader adding a category is told to edit it.

---

### [P4][accessibility] Tab UI is built from bare `<button>`s with no tab ARIA semantics

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:168-177`, `:199-206` (hand-authored
hub) — pinned at SHA f934d43

#### Problem

The hub implements a genuine tablist — mutually-exclusive `.on` state, ←/→ arrow navigation, a
switched iframe — but with no assistive semantics: `<div class="tabs">` is not `role="tablist"`, the
generated buttons are not `role="tab"` and never set `aria-selected`, and the `<iframe id="sheet">`
is not `role="tabpanel"` associated to the active tab. Screen-reader users get eight unlabelled
toggle buttons and an untied frame instead of a coherent tab widget.

#### Proposed solution

Add `role="tablist"` to the `.tabs` container, `role="tab"` + `aria-selected` (toggled alongside the
`.on` class in `show()`) to each button, and wire the iframe as the panel (`role="tabpanel"` +
`aria-labelledby`). This is a reference/keeper page so the bar is low, but the tab pattern is
already there — the semantics are cheap to finish.

#### Verification

Run an a11y checker (axe) against the hub, or tab through with a screen reader: the tab strip should
announce as a tablist with a selected tab.

---

### [P4][naming] Inconsistent element-variable suffixing (`frame` vs `tabsEl`/`countEl`)

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:193-196` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

```js
var tabsEl = document.getElementById('tabs');
var frame = document.getElementById('sheet');
var countEl = document.getElementById('count');
```

Two of the three cached elements use the `…El` suffix convention; the middle one (`frame`, for the
element with `id="sheet"`) does not, and its variable name (`frame`) doesn't match its id (`sheet`)
either. Small, but it's the kind of inconsistency that makes a reader hunt.

#### Proposed solution

Pick one convention. Either `sheetEl`/`tabsEl`/`countEl` (matching ids + suffix) or drop the suffix
uniformly. Align the variable name with the element id.

#### Verification

Read lines 193-196: the three cached-element names should follow one visible rule.

---

### [P5][readability] Hub script uses ES5 `var` + function expressions despite a modern-only target

**File(s):** `scrapbook/coloring-book-proof-sheets/index.html:178-243` (hand-authored hub) — pinned
at SHA f934d43

#### Problem

The entire `<script>` is written in ES5 style — `var` bindings, `function () {}` callbacks
throughout. The scrapbook is self-contained modern HTML served to current browsers (the repo's
`docs/COMPATIBILITY.md` floor is well past ES5), and the rest of the codebase is `const`/`let` +
arrow functions. There is no build/transpile step here, so the dated style is a pure readability
drag with no compatibility upside, and it's inconsistent with how a contributor would expect Splotch
JS to read.

#### Proposed solution

Modernise in place: `const`/`let`, arrow callbacks, template literals for the count string.
Behaviour is unchanged; the diff is mechanical. Low priority — it works as-is.

#### Verification

Load the hub after the rewrite and exercise tabs, arrows, and hash deep-links; behaviour identical,
source reads in the house style.

## Source: Code audit — Root config (package.json, dprint, tsconfig, …)

### [P2][dead-config] dprint loads the TypeScript and JSON plugins but never runs them

**File(s):** `dprint.json:10-13,23-27` (formatting) — pinned at SHA f934d43

#### Problem

`dprint.json` loads three plugins and configures a TypeScript block:

```json
"typescript": { "quoteStyle": "preferSingle" },
"includes": ["**/*.md"],
...
"plugins": [
  "node_modules/@dprint/markdown/plugin.wasm",
  "node_modules/@dprint/typescript/plugin.wasm",
  "node_modules/@dprint/json/plugin.wasm"
],
```

`includes` matches only `**/*.md`. dprint only formats a file when it is in `includes` *and* a
plugin claims its extension — so with markdown the sole included glob, the `@dprint/typescript` and
`@dprint/json` plugins (and the `typescript.quoteStyle` config block) never execute. `format:md`
(`dprint fmt`) and `format:md:check` (`dprint check`) touch only markdown. The two extra WASM
plugins are dead weight: they are downloaded/cached, listed as `devDependencies` (`@dprint/json`,
`@dprint/typescript` at `package.json:252-254`), and mislead a reader into thinking dprint owns
`.ts`/`.json` formatting when Prettier owns `.ts` and *nothing* owns `.json`.

#### Proposed solution

Either (a) delete the `@dprint/typescript` + `@dprint/json` plugin lines, the `typescript` config
block, and their two `devDependencies`, to make dprint honestly markdown-only (matches ADR-0057); or
(b) if JSON formatting is actually wanted, add `**/*.json` to `includes` and wire `format:md` into
`format` accordingly — but that overlaps Prettier/`.prettierignore` and should be an explicit
decision, not latent config. Option (a) is the low-risk default.

#### Verification

`grep -c '\.ts' <(git ls-files '*.md')` — no TS files are markdown, confirming the plugin is
unreachable. After removing, run `npm run format:md:check` and confirm identical output. Confirm no
other tool references `@dprint/json`/`@dprint/typescript`: `git grep dprint/json dprint/typescript`.

---

### [P2][dead-config] No formatter owns JSON/YAML — config files drift unchecked

**File(s):** `.prettierignore:26-29`, `dprint.json:13` (formatting) — pinned at SHA f934d43

#### Problem

`.prettierignore` deliberately excludes the config formats:

```
# Deliberately out of Prettier scope for now — remove these to bring configs into the check
*.json
*.yml
*.yaml
*.webmanifest
```

and dprint's `includes` is `["**/*.md"]` only (see the previous finding), so *no* formatter and *no*
CI check owns `package.json`, `tsconfig`s, `.vscode/*.json`, `netlify.toml`-adjacent YAML, GitHub
workflow YAML, or the webmanifest. These files — including this very `package.json` with its 117
hand-maintained script rows — can drift in indentation/key style with zero enforcement, and the
loaded-but-unused `@dprint/json` plugin makes it look like coverage exists when it doesn't.

#### Proposed solution

Decide and wire one owner for JSON/YAML: simplest is to drop `*.json`/`*.yml`/`*.yaml`/
`*.webmanifest` from `.prettierignore` (Prettier already handles all four) and let `format:check`
cover them; or add `**/*.json` etc. to `dprint.json` `includes` and use the already-loaded JSON
plugin. Whichever is chosen, delete the other's dead config so there is a single, discoverable
owner.

#### Verification

`npx prettier --check '**/*.json'` (or `dprint check` after adding the glob) currently either errors
on the ignore or reports "0 files"; after the fix it should lint the real config tree. Add a
deliberately mis-indented key to a JSON file and confirm the chosen check now fails.

---

### [P2][dead-config] `.markdownlint.json` is orphaned and duplicates dprint's markdown style

**File(s):** `.markdownlint.json:1-11`, `dprint.json:4-9` (formatting) — pinned at SHA f934d43

#### Problem

`.markdownlint.json` configures a markdownlint ruleset (asterisk bullets, asterisk emphasis, fenced
code, `---` HR, etc.). But ADR-0057 made **dprint the sole markdown owner**, and nothing consumes
this file: `markdownlint` is not a dependency, not in any `scripts`/`scripts-info` entry, and not in
`.vscode/extensions.json` recommendations (`dprint.dprint`, `esbenp.prettier-vscode`,
`svelte.svelte-vscode`). The only repo reference to markdownlint is inside ADR-0057 itself. Worse,
its rules **restate** dprint's config with no cross-reference — `MD004 asterisk` ↔
`unorderedListKind: "asterisks"`, `MD049 asterisk` ↔ `emphasisKind: "asterisks"` — a second source
of truth for the same markdown style that a future edit to `dprint.json` will silently desync from.

#### Proposed solution

Delete `.markdownlint.json`. dprint already enforces the identical style via `format:md:check` in
CI. If interactive lint-in-editor is still wanted, add the markdownlint extension to
`.vscode/extensions.json` and keep the file — but then document the dprint/markdownlint style
coupling in one place. Deletion is the ADR-0057-consistent default.

#### Verification

`git grep -l markdownlint -- ':!package-lock.json' ':!.markdownlint.json'` returns only
`docs/adrs/0057-*.md` — proving no tool reads it. After deletion, `npm run format:md:check` still
passes.

---

### [P2][duplication] `--experimental-strip-types --disable-warning=ExperimentalWarning` repeated 10× and likely stale

**File(s):** `package.json:20,25,72,73,76,77,78,85,86,91` (scripts) — pinned at SHA f934d43

#### Problem

Ten scripts invoke Node with the identical verbose flag pair, e.g.:

```json
"build:cap": "CAPACITOR=true node scripts/web.mjs vite build && node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/strip-native-assets.mjs",
"gen:tokens": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/gen-tokens.mjs",
```

Two problems: (1) the 60-character flag string is copy-pasted verbatim ten times — any change (or a
typo in one) must be reconciled by hand; (2) it is likely **stale**. `engines.node` is `">=22.13"`
(`package.json:6`); Node stabilized type-stripping so that `--experimental-strip-types` became the
default (and the flag a deprecated no-op emitting its own warning) from 22.18 / 23.6 onward. On a
modern Node in the supported range the whole pair is redundant, and `--disable-warning` exists only
to silence a warning the flag itself triggers.

#### Proposed solution

Either drop both flags (verify on the project's Node floor that `node scripts/gen-tokens.mjs` strips
types without them), or, if the floor must keep them, factor a single helper — e.g.
`scripts/run-ts.mjs` that re-execs Node with the flags, or a package-level shell alias — so the flag
string lives in exactly one place. Update `engines.node` to the version where the decision holds.

#### Verification

On the CI Node version: `node scripts/gen-tokens.mjs --check` (no flags) — if it runs, the flags are
dead. `grep -c 'experimental-strip-types' package.json` should drop from 10 to 0 (or to 1 in a
shared helper).

---

### [P3][duplication] Browser-support floor is duplicated between `browserslist` and vite `build.target`

**File(s):** `package.json:304-310`, `web/vite.config.ts:77` (build config) — pinned at SHA f934d43

#### Problem

The root `package.json` declares:

```json
"browserslist": [ "chrome >= 111", "edge >= 111", "firefox >= 114", "safari >= 16.4", "ios_saf >= 16.4" ]
```

and `web/vite.config.ts:77` hard-codes the same floor as
`build: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] }`, with a comment
"Keep in sync with `browserslist` in the root package.json". Two hand-synced sources of truth for
the same five-browser floor. It is also unclear what actually *consumes* the `browserslist` field:
vite compiles against `build.target`, not browserslist, so the array may be feeding only
`update:browserslist`/caniuse-lite and otherwise be inert — a reader can't tell whether editing it
changes any output.

#### Proposed solution

Make one the source of truth. Simplest: keep `browserslist` as the single declaration and have
`vite.config.ts` derive `build.target` from it (e.g. via `browserslist-to-esbuild`), or, if vite's
`build.target` is the real control, delete the `browserslist` field and the `update:browserslist`
script and document the floor once in `docs/COMPATIBILITY.md` + `vite.config.ts`. Either way, remove
the "keep in sync by hand" coupling.

#### Verification

Change one browser version in the chosen source and rebuild; confirm the emitted bundle's
syntax-lowering target moved (e.g. inspect for `??`/optional-chaining lowering). Confirm the other
file no longer needs a manual edit.

---

### [P3][duplication] Four ignore lists re-encode the same excluded paths with no shared source

**File(s):** `eslint.config.js:13-23`, `.prettierignore:1-14`, `dprint.json:14-22`, `.gitignore`
(config) — pinned at SHA f934d43

#### Problem

The generated/vendored dirs are enumerated independently in every config:

* `eslint.config.js:13-23`: `.svelte-kit`, `build`, `.netlify`, `node_modules`, `android/`, `ios/`,
  `scrapbook/`, `web/src/lib/components/icon-names.d.ts`, `web/src/lib/releases.json`
* `.prettierignore:1-14`: the same set plus `package-lock.json`, `tokens.css`, `*-snapshots/`, …
* `dprint.json:14-22`: `node_modules`, `.svelte-kit`, `.netlify`, `.gradle`, `web/build`,
  `android/**/build`, `ios/**/build`

Adding a new generated artifact (or renaming `icon-names.d.ts`/`releases.json`) requires editing
three or four files, and they already disagree in ways a newcomer can't distinguish from bugs
(`eslint` ignores all of `android/`, dprint ignores only `android/**/build` because it must still
format generated `android/**/*.md` — but nothing says so).

#### Proposed solution

Can't fully share across tools with different config languages, but reduce the surface: add a short
comment in each list pointing to the others ("generated-path ignores also live in `.prettierignore`
/ `dprint.json`"), and align the glob *style* (see the consistency finding). For the two
project-specific generated files (`icon-names.d.ts`, `releases.json`), consider co-locating them
under a single ignored dir so one glob covers both everywhere.

#### Verification

`git grep -n 'icon-names.d.ts'` shows it hard-coded in both `eslint.config.js` and `.prettierignore`
— renaming it today silently breaks one. After co-location, a single glob per tool should cover it.

---

### [P3][dead-config] `.gitignore` is padded with generic-template entries for tools this repo never uses

**File(s):** `.gitignore:42-137` (config) — pinned at SHA f934d43

#### Problem

Roughly 60 lines are boilerplate from the standard Node `.gitignore` for frameworks/tools absent
from this SvelteKit + Capacitor project: `.grunt` (42), `bower_components` (46), `.lock-wscript`
(49), `jspm_packages/` (56), `web_modules/` (59), `.next`/`out` (92-93), `.nuxt`/`dist` (95-97),
Gatsby `.cache/` (100), `.vuepress/dist` (106), `**/.vitepress/*` (116-119), `.docusaurus` (122),
`.serverless/` (125), `.fusebox/` (128), `.dynamodb/` (131), `.firebase/` (133), `.tern-port` (137),
`.vscode-test` (140), the entire `.yarn/*` block (143-149). None correspond to a tool in
`package.json`. The noise buries the ~30 lines that are actually project-specific and load-bearing
(the Playwright/perf/redteam/coloring-samples/maestro anchored ignores), hurting grepability.

#### Proposed solution

Prune the unused framework blocks, keeping only entries that match tools actually in use (Vite,
SvelteKit, Playwright, Netlify, Capacitor, dprint, the project's own scratch dirs). Keep the
generic-but-cheap safety nets (`*.log`, `.env*`, `.DS_Store`, `node_modules/`, `coverage`).

#### Verification

For each removed entry, `git grep` the tool name in `package.json` returns nothing (e.g. `grunt`,
`bower`, `nuxt`, `docusaurus`, `fusebox`). `git status` is unchanged after pruning (nothing that was
being ignored is now surfaced).

---

### [P3][duplication] `.cache` is ignored three times in `.gitignore`

**File(s):** `.gitignore:88,100,110` (config) — pinned at SHA f934d43

#### Problem

`.cache` / `.cache/` appears three times — line 88 (parcel-bundler block), line 100 (Gatsby block),
line 110 (vuepress-v2 block) — all ignoring the same path with different trailing-slash forms. Pure
redundancy that compounds the template-bloat problem above.

#### Proposed solution

Collapse to a single `.cache/` entry (folded into the prune of the previous finding).

#### Verification

`grep -n '^\.cache' .gitignore` currently prints three lines; after the fix, one.

---

### [P3][maintainability] Personal device identifiers are hard-coded into committed scripts

**File(s):** `package.json:106,113,114` (scripts) — pinned at SHA f934d43

#### Problem

Three scripts embed one developer's specific hardware:

```json
"android:run:device": "... ANDROID_SERIAL=R5CY128YMGF node scripts/gradle.mjs :app:installDebug",
"ios:run:emulator":   "... cap run ios --target C6012C49-AA93-4869-B3A6-E47C9EAAC567",
"ios:run:device":     "... cap run ios --target 00008103-0006202E3CF1001E",
```

and the `scripts-info` describes them as the physical "SM-S938U1" phone and "Kyle's iPad". These
serials/UDIDs are meaningless (and non-functional) for any other contributor or CI, yet they sit in
the shared `package.json`. They are effectively personal config committed to the repo.

#### Proposed solution

Read the target from an env var with the current value as a documented fallback, e.g.
`ANDROID_SERIAL=${ANDROID_SERIAL:-R5CY128YMGF}` is not portable inline — instead have the Node
helper (`scripts/gradle.mjs` / a wrapper) accept `--target`/`ANDROID_SERIAL` from the environment
and drop the literals from `package.json`, or move the device-specific variants into a gitignored
local overrides file. At minimum, document in `scripts-info` that these are placeholders to replace
with `adb:devices` / `xcrun simctl list` output (already partially noted for Android).

#### Verification

On a machine without those devices, `npm run ios:run:device` fails with "device not found" — proving
the literal is dead for everyone but one person. After the fix it should resolve from env or error
with a clear "set TARGET_DEVICE" message.

---

### [P3][duplication] AVD name `Pixel_7_Pro_API_33` is hard-coded across four scripts

**File(s):** `package.json:101,102,103,219` (scripts) — pinned at SHA f934d43

#### Problem

The emulator/AVD name is repeated verbatim in `android:boot` (`emulator -avd Pixel_7_Pro_API_33`),
`android:emulator` (`cap run android --target Pixel_7_Pro_API_33`), `android:live`
(`--target Pixel_7_Pro_API_33`), and described in `android:setup`'s `scripts-info` (line 219). The
matching "API 33" system image lives in `scripts/android-setup.mjs`. Renaming the AVD or bumping the
API level touches four+ places with no single constant.

#### Proposed solution

Define the AVD name once — an env default resolved in a Node helper
(`scripts/android-emulator-*.mjs` already exist) or a single constant those scripts read — and
reference it from the `android:*` scripts. Keep the human-readable form in `scripts-info` only.

#### Verification

`grep -c Pixel_7_Pro_API_33 package.json` returns 3 (plus prose); after centralizing it should be 0
in the executable commands.

---

### [P3][documentation] `overrides.tar` pin has no rationale, unlike every other config in the repo

**File(s):** `package.json:298-303` (dependencies) — pinned at SHA f934d43

#### Problem

```json
"overrides": {
  "@capacitor/assets": { "sharp": "$sharp" },
  "tar": "^7.5.19"
},
```

The `sharp: "$sharp"` override is self-explaining (dedupe @capacitor/assets onto the project's
sharp). The `"tar": "^7.5.19"` override has no comment — a reader can't tell whether it is a
security advisory pin, a compatibility workaround, or stale cruft, nor when it can be removed. This
is conspicuous next to `netlify.toml`, which comments nearly every directive. Un-annotated
transitive pins are exactly the config that rots (the advisory gets fixed upstream, the pin lingers
forever).

#### Proposed solution

Add a one-line comment (JSON5 not available in `package.json`, so use a sibling `overrides` note in
the CONTRIBUTING/ADR or a `// tar:` convention isn't possible in strict JSON — instead record the
reason in a short comment in `docs/` or the commit and reference the advisory ID / issue number in
`scripts-info`-adjacent docs). Practically: document the CVE/reason and a removal condition wherever
dependency decisions are tracked, and periodically re-check whether the transitive floor already
satisfies it so the override can be dropped.

#### Verification

`npm ls tar` shows what depends on it and at what version; if the depended-on range already resolves
to `>=7.5.19` without the override, the pin is removable — prove by deleting it and re-running
`npm ci && npm ls tar`.

---

### [P3][dependency-split] `@capacitor/filesystem` appears unused — no JS import anywhere

**File(s):** `package.json:279` (dependencies) — pinned at SHA f934d43

#### Problem

Every Capacitor plugin in `dependencies` is imported from `web/src` (verified) — except
`@capacitor/filesystem`, which has **zero** JS references. Its only repo mentions are the generated
native registrations (`android/capacitor.settings.gradle`, `ios/App/CapApp-SPM/Package.swift`) and
`package.json` itself. A Capacitor plugin that is installed but never called from JS ships in the
native binaries yet does nothing, and — under the inverted-split rule (ADR-0070: `dependencies` =
what the Netlify web build imports) — it doesn't belong in `dependencies` either, since the web
build never bundles it.

#### Proposed solution

Confirm no dynamic import or peer requirement (e.g. `@capacitor-community/media` needing it) then
remove `@capacitor/filesystem`, `cap sync`, and re-run the native smoke test. If a peer/native need
surfaces, document why it is present-but-unimported.

#### Verification

`git grep "@capacitor/filesystem" -- ':!package-lock.json' ':!*.md'` returns only native config +
`package.json` (confirmed). `npm ls @capacitor/filesystem` shows whether anything depends on it
transitively; if it's a leaf with no JS import, it is dead. Remove it and confirm
`npm run test:android:device` still passes.

---

### [P3][maintainability] Dev/preview port numbers are magic values scattered across scripts and configs

**File(s):** `package.json:16,47,103,115,121` (scripts) — pinned at SHA f934d43

#### Problem

The dev port `5173` is hard-coded in `dev:kill` (`kill-port 5173 8888`), `android:live`
(`--port 5173`), `ios:live` (`--port 5173`), `adb:reverse` (`tcp:5173 tcp:5173`); the netlify-dev
port `8888` in `dev:kill`; and the perf-preview port `4173` in `perf:serve`. There is no single
declaration — a contributor changing the vite dev port (set in `web/vite.config.ts`) must hunt down
and update several unrelated scripts, and `dev:kill` will silently kill the wrong port.

#### Proposed solution

Where the port is a vite concern, it already lives in `web/vite.config.ts`; have the port-dependent
Node helpers (`cloud-tunnel.mjs`, the smoke scripts) read it rather than restating literals in
`package.json`. For `dev:kill`, derive the port list from the same source. At minimum, add a comment
in `scripts-info` noting `5173`/`8888`/`4173` are the vite / netlify-dev / perf-preview ports so the
mapping is discoverable.

#### Verification

Change the vite dev port and run `npm run dev` + `npm run dev:kill`; today the kill misses the new
port. After centralizing, both track the config.

---

### [P4][consistency] No `.editorconfig`; indent width `2` and print width `100` are restated in three files

**File(s):** `.prettierrc.json:3,6`, `dprint.json:1-2`, `.vscode/settings.json:4` (config) — pinned
at SHA f934d43

#### Problem

The same two formatting constants live in three places with three vocabularies: `.prettierrc.json`
(`tabWidth: 2`, `printWidth: 100`), `dprint.json` (`indentWidth: 2`, `lineWidth: 100`),
`.vscode/settings.json` (`editor.tabSize: 2` for markdown). There is no `.editorconfig`, so any
editor without the Prettier/dprint extensions gets no indentation guidance, and the `100`/`2` magic
numbers must be kept in lockstep by hand across formatter configs.

#### Proposed solution

Add a root `.editorconfig` (`indent_size = 2`, `max_line_length = 100`, `charset = utf-8`,
`insert_final_newline = true`) as the editor-agnostic source, and reference it in a comment from the
formatter configs. This doesn't remove the per-tool settings (each formatter needs its own) but
gives one canonical statement and covers editors without extensions.

#### Verification

Open a source file in a bare editor (no plugins) and confirm 2-space indent is applied from
`.editorconfig`. Confirm `100`/`2` still agree across `.prettierrc.json` and `dprint.json`.

---

### [P4][consistency] No `.nvmrc` / `.node-version` despite an `engines.node` floor

**File(s):** `package.json:5-7` (config) — pinned at SHA f934d43

#### Problem

`engines.node` is `">=22.13"`, and several scripts depend on version-specific behavior (the
`--experimental-strip-types` flags). But there is no `.nvmrc` or `.node-version` at the root, so
`nvm use` / `fnm`/`asdf`/Volta pick nothing up and contributors + tooling can silently run a
different major than CI. Given the strip-types staleness risk (separate finding), pinning the Node
version a contributor should use is load-bearing here, not cosmetic.

#### Proposed solution

Add a `.nvmrc` (or `.node-version`) pinning the exact supported Node line (e.g. the CI version).
Keep `engines.node` as the enforced floor and the version file as the "use this" hint.

#### Verification

`nvm use` in a fresh clone currently errors ("No .nvmrc file found"); after adding the file it
selects the pinned version. Confirm it matches whatever Node the CI/GitHub-Actions setup uses.

---

### [P4][consistency] `info` uses `npx scripts-info` though `scripts-info` is a declared dependency

**File(s):** `package.json:9,16,122` (scripts) — pinned at SHA f934d43

#### Problem

`"info": "npx scripts-info"` calls the binary through `npx` even though `scripts-info` is a
`devDependency` (`package.json:266`) already installed in `node_modules/.bin`. The bare
`scripts-info` would resolve the local binary directly; the `npx` wrapper adds a lookup/prompt path
for no reason. Meanwhile `dev:kill` (`npx kill-port …`) and `update:browserslist`
(`npx update-browserslist-db@latest`) *correctly* use `npx` for packages that are **not**
dependencies. So the same `npx` prefix means two different things across the script block, and the
one case that doesn't need it is the one that has it.

#### Proposed solution

Change `info` to `"scripts-info"` (local binary). Leave the genuine on-demand `npx` calls
(`kill-port`, `update-browserslist-db@latest`) as-is, and consider a brief note that `npx` in this
file signals "not a declared dependency".

#### Verification

`npm run info` still prints the script table. `ls node_modules/.bin/scripts-info` confirms the local
binary exists, so `npx` is redundant.

---

### [P4][consistency] Ignore-glob style differs across eslint / dprint / prettier for the same paths

**File(s):** `eslint.config.js:14-20`, `dprint.json:18-21`, `.prettierignore:1-9` (config) — pinned
at SHA f934d43

#### Problem

The three tools spell equivalent excludes differently: eslint uses `**/build/` and blanket
`android/` + `ios/`; dprint uses `web/build`, `android/**/build`, `ios/**/build`; `.prettierignore`
uses `**/build/` and blanket `android/` + `ios/`. The dprint narrowing is *intentional* (it must
still format generated `android/**/*.md`), but nothing in the files says so, so the divergence reads
as an accident and invites a "fix" that would either over- or under-format. Style also varies
(`**/build/` vs `web/build`) for what is meant to be the same directory.

#### Proposed solution

Normalize the glob form where the intent is identical, and add a one-line comment in `dprint.json`
explaining why its `android`/`ios` excludes are build-only (to keep formatting generated markdown
under those trees). This turns an apparent inconsistency into documented intent.

#### Verification

`npm run lint`, `npm run format:check`, `npm run format:md:check` all pass unchanged after
normalization — proving the globs were equivalent where merged and deliberately different where
commented.

---

### [P4][consistency] `.vscode/settings.json` wires a formatter only for markdown, not for code

**File(s):** `.vscode/settings.json:1-7`, `.vscode/extensions.json:1-3` (editor config) — pinned at
SHA f934d43

#### Problem

`extensions.json` recommends `dprint.dprint`, `esbenp.prettier-vscode`, and `svelte.svelte-vscode`,
but `settings.json` sets `editor.defaultFormatter` only for `[markdown]` (→ dprint). It never sets
Prettier as the default formatter for `.ts`/`.js`/`.json`/`.svelte`, nor `editor.formatOnSave`. A
contributor who installs the recommended extensions still gets no Prettier-on-save for code and may
default to VS Code's built-in formatter, producing diffs `format:check` then rejects.

#### Proposed solution

Add `editor.defaultFormatter: "esbenp.prettier-vscode"` for `[typescript]`/`[javascript]`/`[json]`
and `svelte.svelte-vscode` for `[svelte]`, plus `editor.formatOnSave: true`, so the committed
workspace settings match the CI formatters end-to-end.

#### Verification

Open a `.ts` file in VS Code with the recommended extensions and save an intentionally mis-formatted
line; today nothing reformats it. After the change, save reformats to match `npm run format:check`.

---
