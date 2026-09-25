# max-lines-per-function plan (2026-09-24)

Target: ESLint `max-lines-per-function` over app code (`web/src/**/*.{ts,svelte}`, excluding
`*.test.ts`), hard cap 125 in CI and a soft target of 100. Options:
`{ max: 125, skipBlankLines: true, skipComments: true, IIFEs: true }`.

Line limits are smells, not rules: a function is split only where the result is genuinely cleaner (a
named step with a narrow signature, a pure helper testable on its own, a sub-factory with a real
responsibility). Where it does not separate cleanly, its file gets a per-file override at the
longest function + 25.

## Baseline

Measured on origin/main at f80a9372c with:

```bash
npx eslint --no-warn-ignored \
  --rule '{"max-lines-per-function":["warn",{"max":1,"skipBlankLines":true,"skipComments":true,"IIFEs":true}]}' \
  -f json 'web/src/**/*.ts' 'web/src/**/*.svelte'
```

2532 app functions measured; 17 over 100, 9 over 125, 5 over 150, 3 over 200. Each candidate lives
in a different file and no two share a test file, so every function is its own unit.

| Lines | Function                       | Location                                         |
| ----- | ------------------------------ | ------------------------------------------------ |
| 251   | `createParentalGate`           | `web/src/lib/state/parentalGate.svelte.ts:192`   |
| 237   | `dragToClear`                  | `web/src/lib/actions/dragToClear.ts:55`          |
| 203   | `createPWAUpdates`             | `web/src/lib/pwa/updates.ts:86`                  |
| 164   | `createInstall`                | `web/src/lib/state/install.svelte.ts:99`         |
| 160   | `createInkMotion`              | `web/src/lib/drawing/inkMotion.ts:47`            |
| 143   | `scribbleTap`                  | `web/src/lib/actions/scribbleGuard.ts:138`       |
| 139   | `createSettings`               | `web/src/lib/state/settings.svelte.ts:258`       |
| 132   | `buildEngineApi`               | `web/src/routes/dev/engine/+page.svelte:117`     |
| 130   | `toolbarGlassPanes`            | `web/src/lib/glassPanes.ts:134`                  |
| 119   | `createFreeGenerations`        | `web/src/lib/state/freeGenerations.svelte.ts:78` |
| 117   | `createAiGeneration`           | `web/src/lib/state/aiGeneration.svelte.ts:110`   |
| 116   | `edgeMargins`                  | `web/src/lib/drawing/magicSheetEdges.ts:31`      |
| 114   | `installWebBackHandler`        | `web/src/lib/boot/webBackHandler.ts:48`          |
| 112   | `createColoringPackDownloader` | `web/src/lib/coloringPacks/manager.ts:88`        |
| 112   | `createLayout`                 | `web/src/lib/state/layout.svelte.ts:45`          |
| 108   | `createSaveFailure`            | `web/src/lib/state/saveFailure.svelte.ts:63`     |
| 102   | `composeExportPng`             | `web/src/lib/drawing/exportDrawing.ts:201`       |

Just under the soft target, not candidates: the `POST` handler in
`web/src/routes/api/generate-image/+server.ts` (100), `createAiProgress` (98).

## Decisions

Each function had an isolated proposer, then an independent adversarial reviewer that read the code
itself (read-only). The reviewer’s final plan is the plan of record. Every function still over 100
after its change gets a per-file override at longest + 25, per the rule shape. Four reviewers said a
function under 125 needed no override; that conflicts with the decided rule, so the override is
added anyway.

| Function                       | Lines | Proposer | Reviewer | Outcome | Projected | Override |
| ------------------------------ | ----- | -------- | -------- | ------- | --------- | -------- |
| `createParentalGate`           | 251   | raise    | endorse  | raise   | 251       | 276      |
| `dragToClear`                  | 237   | extract  | revise   | extract | 189       | 214      |
| `createPWAUpdates`             | 203   | extract  | revise   | extract | 121       | 146      |
| `createInstall`                | 164   | extract  | revise   | extract | 112       | 137      |
| `createInkMotion`              | 160   | extract  | endorse  | extract | 112       | 137      |
| `scribbleTap`                  | 143   | extract  | endorse  | extract | 94        | none     |
| `createSettings`               | 139   | extract  | endorse  | extract | 117       | 142      |
| `buildEngineApi`               | 132   | extract  | endorse  | extract | 97        | none     |
| `toolbarGlassPanes`            | 130   | extract  | endorse  | extract | 112       | 137      |
| `createFreeGenerations`        | 119   | extract  | endorse  | extract | 102       | 127      |
| `createAiGeneration`           | 117   | raise    | endorse  | raise   | 117       | 142      |
| `edgeMargins`                  | 116   | extract  | endorse  | extract | 22        | none     |
| `installWebBackHandler`        | 114   | raise    | revise   | raise   | 114       | 139      |
| `createColoringPackDownloader` | 112   | extract  | endorse  | extract | 108       | 133      |
| `createLayout`                 | 112   | raise    | endorse  | raise   | 112       | 137      |
| `createSaveFailure`            | 108   | extract  | endorse  | extract | 99        | none     |
| `composeExportPng`             | 102   | extract  | revise   | extract | 71        | none     |

### `createParentalGate` — web/src/lib/state/parentalGate.svelte.ts:192

**raise**, reviewer endorse; projected 251.

Hot path: Not a hot path. Everything in the factory runs on discrete events: keypad taps, gate open,
redirect and close, the success hold timeout, and a lockout countdown that ticks once a second while
the card is open. Nothing runs per pointermove, resize or frame. A raise moves no code, so it adds
no allocations.

Tests and drift guards: None. A raise only adds a per-file max-lines-per-function override (max 276)
in eslint.config.js. parentalGate.svelte.test.ts, parentalGate.lockout.test.ts and
parentalGate.mash.test.ts keep reading the flat readonly view (gate.lockoutUntil, lockoutMessage,
wrongStreak, lockouts, announcement, policies, sessionSolved).
tools/tests/state-export-names.test.mjs is unaffected.
docs/scratchpad/max-lines-per-function-plan.md should record the raise for this candidate.

Review: I checked the proposal against the code in web/src/lib/state/parentalGate.svelte.ts. ESLint
confirms createParentalGate at 251 counted lines. The next longest function is requireParentalGate
at 26, so the proposed file max of 251+25=276 is right.

The code is what the proposal describes. The pure pieces are already at module scope:
readFeatureMode, readPolicies, legacyAiImageMode, isAllowedParentalGateMode and unsolvedSession. The
lockout arithmetic is already in parentalGateLockout.ts. The remaining closures form one challenge
state machine. It uses one $state object that readonlyView exposes flat, plus five timer handles
that clearTimers and dismissGate reset together.

Why the lockout sub-factory fails. Its fields (wrongStreak, lockouts, lockoutUntil,
escalationQuietSince, lockoutMessage) look like separate state. But tests read them flat through the
view, so they must stay on `s`. Moving them into their own object would change the view's shape.
Keeping them on `s` means handing `s` to the sub-factory, and lockOut, endLockout and tickLockout
also depend on the factory's own pieces:

* lockOut touches errorTimer and s.error.
* endLockout reads s.open and calls announce.
* tickLockout sets lockoutTickTimer, which clearTimers resets.
* requireParentalGate writes announceTimer directly, and clearTimers resets that handle too. That is
  the wide-accessor pattern the rules forbid.

Why the announcer split fails. requireParentalGate, the error timeout and dismissGate all write
s.announcement directly, so an announcer sub-factory would need a setter passed back in and would
save about 8 lines.

The policy sub-factory is the one real candidate. It would own policies and sessionSolved, which are
persisted state with a narrow interface: requires, setMode, recordSolve, reload, and the two Parent
Center predicates. It would be arguably cleaner. But its methods are mostly 1-to-3-line accessors,
it saves about 20 lines to roughly 231, and a raise would still be needed. It would also partly undo
the recent deliberate change that folded the policies into this singleton. Skipping it is
defensible.

Hoisting randomOperand to module scope is a legitimate pure-helper tidy, about 3 lines. It is
optional and does not change the outcome. I left it out so the recorded max matches the code as it
stands.

No split brings the function near 125 without threading state back through parameters, so a raise is
the honest answer. Suggested one-line WHY for the override: "createParentalGate is one challenge
state machine whose lockout, announcement and handoff steps share one $state object and the timers
dismissGate resets together; its pure policy and lockout logic already live at module scope and in
parentalGateLockout.ts."

### `dragToClear` — web/src/lib/actions/dragToClear.ts:55

**extract**, reviewer revise; projected 189.

Seams (one commit each):

* **createTapRun** (sub-factory) → web/src/lib/actions/dragToClear.ts, module scope (unexported
  unless a colocated unit test is added; if so, export it with a comment saying it is exported for
  tests). `function createTapRun(): { register(now: number): boolean }`. Moves: clickCount,
  lastClickTime and the counting logic of registerTap (lines 62-63, 90-105). onPointerDown keeps the
  side effect: `if (taps.register(Date.now())) { o.onTutorialShow(); return; }`. Keep today's
  behaviour that a completing tap resets clickCount to 0 and does NOT update lastClickTime. The
  MULTI_CLICK_* constants stay where they are. Why cleaner: This is state the gesture machine never
  reads, with one responsibility (spotting a triple-tap run). It is pure given `now`, so the 1000 ms
  window becomes unit-testable. The options bag no longer threads into tap counting. It runs on
  pointerdown only.
* **createTimerSet** (sub-factory) → web/src/lib/actions/dragToClear.ts, module scope (unexported).
  `function createTimerSet(): { schedule(fn: () => void, delayMs: number): ReturnType<typeof setTimeout>; cancel(id: ReturnType<typeof setTimeout> | null): void; cancelAll(): void }`.
  Moves: The resetTimers Set and scheduleReset (lines 65-74). The two identical hold-timer cancel
  blocks (183-187, 227-231) become `timers.cancel(holdTimer); holdTimer = null;`. cancel() accepts
  null and is a no-op for it. The destroy sweep (362-363) becomes timers.cancelAll(). holdTimer
  stays in the action as drag state. Why cleaner: It owns separate state (the timeouts to flush on
  destroy) and puts the delete and clearTimeout pair in one place instead of two hand-copied blocks.
  cancel() on a hold timer that already fired does the same harmless clearTimeout as today. Hot
  path: cancel() can run per pointermove after the 50px threshold. It only calls Set.delete and
  clearTimeout and allocates nothing. The factory object is created once at init. vi.getTimerCount()
  in the test still holds.
* **setWashProgress, armWash, setThresholdReached** (pure-helper) →
  web/src/lib/actions/dragToClear.ts, module scope (unexported).
  `function setWashProgress(washEl: HTMLElement, progress: number): void; function armWash(washEl: HTMLElement): void; function setThresholdReached(node: HTMLElement, o: DragToClearOptions, reached: boolean): void`.
  Moves: armWash and setProgress (123-138) use no closure state. Hoist them to module scope and pass
  the wash element: armWash(washEl) and setWashProgress(washEl, progress), keeping the compositor
  WHY comment. The mirrored add/remove branches in onPointerMove (206-220) become
  `setThresholdReached(node, o, reached); if (reached && !clearReady) impactThreshold(); clearReady = reached;`
  using classList.toggle(name, reached) for node 'delete-ready', acceptZoneEl 'threshold-reached'
  and clearPreviewEl 'committed'. In finishDrag, the three matching removes (240, 249, 253) become
  one setThresholdReached(node, o, false) placed before the conditional 'releasing' add. Everything
  stays in the same synchronous task, so the fade still starts from the flood. Unlike the proposal,
  the placeAcceptZone helper is dropped. Why cleaner: The three classes that together mean 'past the
  point of no return' get one source of truth, so move and finish cannot drift apart. The wash
  helpers are closures only because of where they sit. Hot path: setWashProgress and
  setThresholdReached run on every pointermove. They are module-scope functions with element and
  primitive arguments that capture nothing and return nothing. The only per-move allocation is the
  `${progress}` string, which exists today. toggle(name, force) does the same DOM work as today's
  add/remove, so no allocations are added.

Hot path: Yes, onPointerMove runs on every pointermove. setWashProgress and setThresholdReached
become per-move calls, and timers.cancel can run from onPointerMove. All are module-scope functions
or methods of an object allocated once at action init. None captures a closure or returns an object,
so no per-move allocation is added (the `${progress}` template string already exists). createTapRun
runs on pointerdown only.

Tests and drift guards: web/src/lib/actions/dragToClear.test.ts exercises only the public
dragToClear API plus class and timer observations: the threshold-reached and committed checks at
lines 146-156, 240 and 346-395, and vi.getTimerCount(). No edits should be needed. An optional
createTapRun unit test would cover the multi-tap window, which only the timing-sensitive
clear-tutorial.spec.ts E2E covers today. No drift guards read the moved identifiers. The
docs/scratchpad/max-lines-per-function-plan.md entry needs updating.

Review: I checked the code and the measured lengths (dragToClear is 237; registerTap 14,
scheduleReset 8, armWash 6, setProgress 3, armAcceptZone 15, onPointerMove 40, finishDrag 24). Most
of the proposal holds up.

* **createTapRun** holds its own state that the drag machine never reads.
* **createTimerSet** holds its own state and removes two copied five-line cancel blocks.
* **setThresholdReached** replaces two hand-mirrored 14-line branches, plus three scattered removes
  in finishDrag, with one list of the three classes. That is real drift prevention, not
  counter-driven.

Behaviour is preserved:

* `clearReady = reached` plus the guarded impactThreshold() matches the existing if/else exactly.
* Moving the finishDrag removes together before the 'releasing' add stays inside one synchronous
  task, so rendering is unchanged.
* A completing tap must still skip the lastClickTime update, and I've made that explicit.

I dropped one piece: placeAcceptZone. It has a single caller and just moves the five style writes
out of armAcceptZone, which already names that concept and would become a two-statement wrapper.
That is the "one caller, only relocates lines" pattern the governing rule calls a defect, and it
saved only about 4 lines. Hoisting armWash and setWashProgress is fine because they genuinely
capture no closure state and setWashProgress has three callers.

Estimated savings:

| Change                                                           | Lines saved |
| ---------------------------------------------------------------- | ----------- |
| createTapRun (16 lines become about 4)                           | ~12         |
| createTimerSet (9 become 1, 2x5 become 2x2, destroy 2 becomes 1) | ~14         |
| Wash hoist                                                       | ~9          |
| setThresholdReached (move branch plus finish removes)            | ~13         |

That brings 237 down to about 189. The remaining body is the shared-state pointer machine
(activeDrag, start point, clearReady, holdTimer, acceptZoneFrame). The proposer is right that
splitting it further would need accessor bags, so I did not look for more seams. The per-file
override is 189 + 25 = 214, recomputed from the measured length after the extractions land, with the
WHY: "dragToClear's pointer handlers share one gesture state machine (activeDrag, start point,
clearReady, hold timer); splitting them threads that state through accessor bags."

### `createPWAUpdates` — web/src/lib/pwa/updates.ts:86

**extract**, reviewer revise; projected 121.

Seams (one commit each):

* **fetchDeployedVersion, checkVersionMismatch, consumeCacheBustParam** (pure-helper) →
  web/src/lib/pwa/updates.ts, module scope, above createPWAUpdates.
  `async function fetchDeployedVersion(): Promise<string | null>; async function checkVersionMismatch(attemptedVersion: string | null = null): Promise<void>; function consumeCacheBustParam(): string | null`.
  Moves: fetchDeployedVersion (203-213) and checkVersionMismatch (215-224) move out unchanged.
  Neither touches any factory `let`. The ?v= strip-and-replaceState block (158-163) becomes
  consumeCacheBustParam(), which returns the attempted version. The factory's return object still
  exposes checkVersionMismatch, and decideWaitingActivation calls the hoisted fetchDeployedVersion.
  Why cleaner: This is the stateless cache-bust concern from the file header. As closures, these
  functions falsely suggest they share the activation state. Hoisting them needs no parameters and
  threads nothing back.
* **createDeferredRegistration** (sub-factory) → web/src/lib/pwa/updates.ts, module scope.
  `function createDeferredRegistration(onRegistered: () => Promise<unknown>): { schedule(): Promise<boolean>; registerDeferredServiceWorker(): Promise<boolean> }`.
  Moves: `let registrationScheduled`, scheduleRegistration (123-143, comments included) and
  registerDeferredServiceWorker (147-150). The factory creates one instance with
  createDeferredRegistration(() => checkForUpdates()). The repeat-visit branch calls .schedule(),
  and the return object passes through registerDeferredServiceWorker. `.register('/sw.js')` stays
  literally in updates.ts. Why cleaner: It owns its own state: a memoized registration promise that
  resets itself on failure. None of the activation state is involved, and one callback is its only
  link to the update lifecycle.
* **watchUpdateTriggers** (named-step) → web/src/lib/pwa/updates.ts, module scope beside
  UPDATE_CHECK_INTERVAL_MS.
  `function watchUpdateTriggers(checkForUpdates: () => void, applyPendingUpdate: () => void): () => void`.
  Moves: The interval, onVisibilityChange, onFocus, both addEventListener calls and their teardown
  (177-200). initPWAUpdates keeps the guards, the initialized flag, the startup checks and the
  repeat-visit branch. It returns `() => { stopTriggers(); initialized = false; }`, which keeps the
  original teardown order. Why cleaner: It separates when checks run from what a check decides. Two
  callbacks go in and one teardown comes out, with no state threaded back. It can be tested with
  fake timers and dispatched events.
* **createRegistrationRevalidator** (sub-factory) → web/src/lib/pwa/updates.ts, module scope beside
  MIN_UPDATE_CHECK_GAP_MS.
  `function createRegistrationRevalidator(): (registration: ServiceWorkerRegistration) => Promise<void>`.
  Moves: `let lastUpdateCheckAt`, `let updateInFlight` with its join-don't-skip comment (102-108),
  and the throttle/join block inside checkForUpdates (327-335). checkForUpdates keeps the
  owed/activating guard, the getRegistration call and the updateRegistration assignment, then calls
  `await revalidate(registration)`. Why cleaner: The throttle floor and the shared in-flight promise
  are their own piece of state. They are read and written only in those 9 lines and never touch
  updateReload. The concept is 'at most one registration.update() per gap, and later callers join
  it', and it is name-worthy. The proposer called this seam real and skipped it only because the
  result would still be over 125. That is counter-driven reasoning in reverse: a clean seam should
  be taken on its merits.
* **createInstallSettleWatcher** (sub-factory) → web/src/lib/pwa/updates.ts, module scope beside
  WAITING_SETTLE_MS.
  `function createInstallSettleWatcher(onSettled: (waiting: ServiceWorker) => void): (registration: ServiceWorkerRegistration, installing: ServiceWorker) => void`.
  Moves: `const observedInstallingWorkers` (109) and the once-per-worker statechange →
  WAITING_SETTLE_MS → registration.waiting block (345-365, with its long settle-ordering comment).
  checkForUpdates becomes
  `if (installing) { watchInstallSettle(registration, installing); return; }`. The instance is
  created as createInstallSettleWatcher((sw) => void decideWaitingActivation(sw)). Why cleaner: It
  owns separate state: the WeakSet of workers already observed. Its job is also self-contained: wait
  once per installing worker until registration.waiting is populated, then report that worker. A
  single callback is the only link back to the activation state machine.

Hot path: Not on a hot path. The code runs at init, at the stroke-gate trigger, hourly, and on
visibility/focus edges. No extraction adds allocations on any path. Each sub-factory instance and
the trigger teardown closure is created once per createPWAUpdates/initPWAUpdates call. The
statechange listener and setTimeout closures are still created only once per newly seen installing
worker, and the .finally closure once per actual update(), exactly as today.

Tests and drift guards: None need changes. The public surface stays the same (initPWAUpdates,
registerDeferredServiceWorker, checkForUpdates, checkVersionMismatch, applyPendingUpdate), as do the
exports ACTIVATION_RECOVERY_MS and WAITING_SETTLE_MS. updates.test.ts (resume-pair throttle),
updates.activation.test.ts (WAITING_SETTLE_MS advance) and updates.registration.test.ts all exercise
these paths through the factory, so they validate the refactor. tools/mobile/check-static-bundle.mjs
pins `.register('/sw.js')` and `addEventListener('controllerchange'` to web/src/lib/pwa/updates.ts,
so every seam must stay in that file (activateWaitingSW is not moved). Refresh or drop the stale
line range cited in docs/PERFORMANCE.md.

Review: I measured the function at 203 counted lines, which confirms the proposer's figure. The
three proposed seams are sound. Seam 1 is truly stateless: it reads only fetch, location,
**APP_VERSION** and the module-level canvasState. Seam 2 owns its own memoized promise, which resets
on failure. Seam 3 has a narrow two-callbacks-in, teardown-out signature, and ordering and listener
lifetimes are preserved. The removal arithmetic (-10, -10, -5, -21, -16) reproduces the 141
projection.

The flaw is the conclusion. The proposer admitted the revalidator (lastUpdateCheckAt plus
updateInFlight) is a real sub-factory with its own state, then declined it because the result "would
still be over 125". That lets the counter decide which clean seams to take, which the governing rule
forbids in both directions.

The proposer also missed a second seam of the same kind: observedInstallingWorkers and the
settle-into-waiting watcher. The WeakSet is touched nowhere else, and the only link back is a single
onSettled callback that calls decideWaitingActivation. Neither of these two seams threads
updateReload through accessors.

With both added, what remains is the core state machine: updateReload/updateRegistration,
reloadForUpdate, deferReload, decideWaitingActivation, applyPendingUpdate, activateWaitingSW,
checkForUpdates' guard, and initPWAUpdates. That comes to about 141 - 9 - 11 ≈ 121, under the 125
cap, so no per-file override is needed. If the measured result comes out above 125, add the override
at measured + 25 with the proposer's one-line WHY rather than forcing another split. Splitting the
updateReload transitions further would require getter/setter bags and is correctly off the table.

### `createInstall` — web/src/lib/state/install.svelte.ts:99

**extract**, reviewer revise; projected 112.

Seams (one commit each):

* **createInstallRepromptSchedule** (sub-factory) → web/src/lib/state/install.svelte.ts, module
  scope, not exported. It stays in the .svelte.ts file because it holds
  $state.. `function createInstallRepromptSchedule(canvas: CanvasState, sessionCounters: SessionCountersState): { readonly dismissed: boolean; stage(): InstallPromptStage | null; recordSession(): void; dismiss(): void; reset(): void; load(): void; armAutoClear(): void; disarmAutoClear(): void; autoDismissIfDue(): boolean }`. Moves: The ADR-0039 re-prompt state and the logic that owns it. State: `dismissed` (leaves `s` and becomes its own $state), `repromptsUsed` ($state,
  seeded from STORAGE_KEYS.installRepromptsUsed), and the untracked `installAutoClearArmedAt`, which
  keeps its 'deliberately untracked' WHY. Functions: resetInstallRepromptCycle -> reset().
  reloadInstallRepromptState plus line 223's `s.dismissed = readBool(installDismissed)` -> load(),
  keeping the order dismissed-then-repromptsUsed. The installPromptStage body after the
  `s.installed` check -> stage(). The strokeCount/dismissed/max/stage conditions of
  recordInstallRepromptSession -> recordSession(). dismissInstall -> dismiss().
  disarm/arm/autoDismissIfDue with STROKES_BEFORE_AUTO_CLEAR ->
  disarmAutoClear/armAutoClear/autoDismissIfDue. createInstall keeps mode, installed,
  deferredPrompt, initialized and listening, and builds
  `const schedule = createInstallRepromptSchedule(canvas, sessionCounters)`. It also keeps one-line
  wrappers. installPromptStage becomes `s.installed ? null : schedule.stage()`.
  recordInstallRepromptSession becomes
  `if (s.installed \|\| s.mode === 'none') return; schedule.recordSession();`. markInstalled and
  captureInstallPrompt call schedule.reset(). initInstallPrompt calls schedule.load().
  promptInstall's decline path calls schedule.dismiss(). The `dismissed` getter returns
  schedule.dismissed. The returned object maps
  dismissInstall/armInstallAutoClear/disarmInstallAutoClear/autoDismissInstallIfDue directly to the
  schedule's methods, so InstallState, the destructured exports, and the install()/dispose()
  listener block (which check-static-bundle.mjs drift-guards) stay unchanged. Why cleaner: The
  factory runs two state machines whose state never overlaps. Install availability is
  mode/installed/deferredPrompt/listeners. The bounded re-prompt schedule is
  dismissed/repromptsUsed/armedAt plus the stroke countdown. The schedule's functions read and write
  only their own state and the two dependencies they already use (canvas.strokeCount,
  sessionCounters). The two cross-concern guards (installed, mode !== 'none') sit in one-line parent
  wrappers, not in an accessor bag. That is a sub-factory with a real responsibility, the one
  ADR-0039 and docs/ARCHITECTURE.md already name, not a closure relocation.

Hot path: Not a hot path. Nothing runs per pointermove, resize or frame. autoDismissInstallIfDue and
armInstallAutoClear run from an InstallBanner $effect that re-runs on visibility and stroke-count
changes, at most once per stroke end. Those methods are plain direct references, so no wrapper
closure is allocated per call. The schedule and its closures are allocated once per createInstall
call, which is once per module load in production. installPromptStage runs from a $derived and its
wrapper allocates nothing. Net per-call allocation: none.

Tests and drift guards: No test edits expected. web/src/lib/state/install.svelte.test.ts,
settledIn.install.svelte.test.ts, and perRequestRoutes.webSsr.test.ts (it reads installState getters
plus installPromptStage()) all use only the unchanged public surface. Invariants to keep: -
tools/mobile/check-static-bundle.mjs pins the exact text and indentation of the install() block
inside createInstall's returned literal. It must not move. -
docs/scratchpad/max-lines-per-function-plan.md: update the createInstall row (164 at :99) when this
lands. - Run `npm run check` and the install unit suite after the change. Getter-through-getter
reactivity (`dismissed` -> schedule.dismissed) is behavior-preserving, but confirm the $derived in
InstallBanner still recomputes on dismiss.

Review: I read the code and confirmed the counts myself: 164 for createInstall, and no other
function in the file is over 25. Seam 1 holds up.

* **State split:** mode/installed/deferredPrompt and dismissed/repromptsUsed/armedAt really are
  disjoint. The only coupling is the two guard reads, and one-line parent wrappers handle them with
  no parameter bag.
* **Equivalence of dismiss():** I checked it independently. dismiss() can still run while installed,
  for example via autoDismissIfDue if the banner re-arms. In that case the old installPromptStage()
  returned null (no bump), and the new stage() returns 'initial' because reset() cleared dismissed,
  or null because the reset installReprompt count is below the first milestone and recordSession is
  gated off while installed. Neither path bumps repromptsUsed.
* **Guard order in recordInstallRepromptSession:** the split moves the installed/mode checks ahead
  of strokeCount. The only effect-driven caller (settledIn.svelte.ts) calls it inside untrack(), and
  the other caller is the beforeinstallprompt event handler. So the changed short-circuit order
  cannot change reactive dependency tracking.
* **installPromptStage:** it is read inside a $derived, and its wrapper keeps the same dependency
  order (installed first).

Projection: about 52 counted lines leave. That is the 2 `s.dismissed` lines, 2 declarations, the
reset (8) and reload (3) functions, 5 from stage, 9 from record, dismiss (11), the arm/disarm/auto
methods (16 becoming 4 references) and the load line. One line comes back for the schedule constant,
giving about 112. That is under 125 and a little above the soft 100, which is fine.

Revision: drop seam 2 (replayInstallPrompt). It is called once, promptInstall is only 23 lines and
reads clearly as a straight sequence, and seam 1 alone clears the cap. The proposer called it
optional. Landing it would be a mostly cosmetic relocation, drifting toward the counter-driven split
the governing rule forbids. Chasing the 100 soft target further would also be counter-driven: what
remains is cohesive availability logic plus the drift-guarded listener block. No file-level raise is
needed.

### `createInkMotion` — web/src/lib/drawing/inkMotion.ts:47

**extract**, reviewer endorse; projected 112.

Seams (one commit each):

* **settleTileReads, driftTowards, runWhenPainted, paintColoringArt (hoisted, same names,
  module-private)** (pure-helper) → web/src/lib/drawing/inkMotion.ts, module scope beside canvasOf,
  above createInkMotion. runWhenPainted must stay textually before clear's
  `wrapper.classList.add('clear-sheet-layer')`, because inkMotion.test.ts:17 takes the first
  `classList.add('...')` match in the file as the running class. Hoisting it above the factory meets
  this automatically..
  `function settleTileReads(target: CanvasRenderingContext2D): void; function driftTowards(image: HTMLCanvasElement, host: HTMLElement | null, target: HTMLElement | null | undefined, view: EngineViewState, ghostCenter: ClientPoint): void; function runWhenPainted(image: HTMLCanvasElement): void; function paintColoringArt(target: CanvasRenderingContext2D, view: EngineViewState, scale: number): void`.
  Moves: Four inner functions of createInkMotion that read nothing from its closure (overlay,
  pendingSubtract, paint, settlesTileReads): settleTileReads (lines 111-113), driftTowards (123-141;
  only UNDO_INK_DRIFT_FRACTION, paperToView, viewToPaper), runWhenPainted (153-159),
  paintColoringArt (212-230; only COLORING_OVERLAY_ID, containFit, document). Each moves with its
  WHY comment. The first paragraph of driftTowards' comment (lines 115-120, about why crayon/magic
  ghosts read tiles and pen ghosts replay) describes ghost selection, not drift, so it stays in the
  factory on undo/ghostFromTiles; only the drift sentences (121-122) move. The call sites in
  ghostFromTiles, undo and clear stay the same. Why cleaner: The signatures do not change and no
  factory state gets threaded back in: each helper already takes everything it uses as parameters.
  Hoisting makes that independence visible and follows the existing canvasOf precedent. The factory
  is left with only the state owners: the overlay lifecycle (cancel/present), the pending-subtract
  handoff (ghostFromTiles/subtractRemainingInk) and the undo/clear entry points. That matches
  CLAUDE.md's rule that a factory exists to hold mutable state.

Hot path: Not on a per-pointermove, resize or frame path. undo and clear run once per discrete undo
or clear action, subtractRemainingInk once per undo, and cancel at stroke start. The move adds no
allocations because the signatures and call sites stay the same. It slightly reduces the one-time
closure creation when createInkMotion runs. runWhenPainted's two rAF arrows are allocated per undo
today and still will be after the move.

Tests and drift guards: web/src/lib/drawing/inkMotion.test.ts:17 regex-reads inkMotion.ts for the
first classList.add('<cls>'). It stays valid because runWhenPainted, once hoisted, is still above
clear. The createInkMotion(paint, settlesTileReads) factory signature and the returned API {cancel,
undo, subtractRemainingInk, clear} are unchanged, so the behavioural tests are unaffected.
docs/scratchpad/max-lines-per-function-plan.md should have its 160 entry updated when this lands.

Review: I checked the proposal against the code and against an ESLint measurement. The measured
lengths are createInkMotion 160, settleTileReads 3, driftTowards 19, runWhenPainted 7 and
paintColoringArt 19. The rule skips comment lines, so moving the WHY blocks costs nothing, and 160 -
48 = 112 is exact for the factory body. None of the four helpers mentions overlay, pendingSubtract,
paint or settlesTileReads, so hoisting them is a pure scope change. Evaluation order, listener
lifetimes and early returns all stay the same.

This is not counter-driven. The helpers keep their existing names and narrow signatures, and they
sit next to the canvasOf precedent. settleTileReads is a one-liner, but its name carries a
load-bearing WHY (the iPad-vs-Android readback) and the factory doc comment already refers to it by
name, so hoisting it is correct.

The alternatives do not hold up. cancel, present, ghostFromTiles and subtractRemainingInk all touch
factory state or the injected paint, so moving them would mean parameter bags. Splitting out the
overlay state as a sub-factory is not justified at this size. clear's origin arithmetic would be a
counter-driven split. A raise would be dishonest when a clean seam exists and brings the function
under the cap.

One comment fix the proposer already flagged: the first paragraph of driftTowards' current comment
is about ghost selection and must stay with undo/ghostFromTiles instead of moving with the drift
helper. The test's regex-ordering constraint is met automatically by hoisting to module scope.

### `scribbleTap` — web/src/lib/actions/scribbleGuard.ts:138

**extract**, reviewer endorse; projected 94.

Seams (one commit each):

* **ScribbleTapPress (interface) + isMissingPenLift** (pure-helper) →
  web/src/lib/actions/scribbleGuard.ts, module scope above scribbleTap.
  `interface ScribbleTapPress { pointerId: number; pointerType: string; startX: number; startY: number; lastX: number; lastY: number; lastTime: number; dragged: boolean; viewportSide: number } function isMissingPenLift(press: ScribbleTapPress, e: PointerEvent, now: number): boolean`.
  Moves: The inline 9-field press type (lines 140-152) becomes a module-scope
  `interface ScribbleTapPress`, and the scribbleTap local becomes
  `let press: ScribbleTapPress \| undefined`. The missing-pen-lift detection in move() (lines
  202-212: the jump hypot, the mutable `let isMissingPenLift` flag, and the
  pen/pen/buttons/!dragged/viewportSide>0/pointerWasResumed conditional) becomes one module-scope
  pure predicate that computes jump inside the pen branch. move() keeps `const now = Date.now()`,
  which it still needs for press.lastTime, and calls `if (isMissingPenLift(press, e, now)) { ... }`.
  The consume branch and its WHY comment stay in move(). Why cleaner: The code already names this
  concept (the flag is called isMissingPenLift). The predicate is a pure function of press state,
  event and clock, and it replaces a mutable let assigned inside an if-block. It reads the press
  object that already exists, so no parameter bag is created. The hoisted interface names an
  existing concept instead of leaving a 13-line anonymous type inside the factory.
* **eventHitsControl, snappedReleaseHitsControl, minViewportSide** (pure-helper) →
  web/src/lib/actions/scribbleGuard.ts, module scope, not exported.
  `function eventHitsControl(node: HTMLElement, e: PointerEvent): boolean function snappedReleaseHitsControl(node: HTMLElement, e: PointerEvent): boolean function minViewportSide(node: HTMLElement): number`.
  Moves: The three stateless DOM hit-test and geometry closures (lines 186-197 and 248-255) move to
  module scope with an explicit `node` parameter. The issue-1237 WHY comment moves with
  snappedReleaseHitsControl. minViewportSide gets the window from `node.ownerDocument.defaultView`,
  which is the same value as the captured ownerWindow. Call sites in move, up and down pass node and
  are otherwise unchanged. Why cleaner: None of the three reads or writes press, current, or the
  click counter. Each answers a question about one element and one point, and after the move its
  signature is exactly what it depends on. The long snap-geometry rationale sits next to a
  standalone function instead of in the middle of the press state machine. Hoisting also removes
  three closures that were allocated on every mount.
* **createTrailingClickConsumer** (sub-factory) → web/src/lib/actions/scribbleGuard.ts, module
  scope, not exported and not shared with colorFoldGesture or pinchTextZoom (ADR-0002,
  .claude/rules/svelte.md).
  `function createTrailingClickConsumer(): { arm(): void; consume(): boolean }`. Moves:
  consumableClicks, consumeClicksUntil, their WHY comment (lines 161-171), armClickConsumption, and
  the expire-then-decrement logic in click (lines 312-316) become a module-private sub-factory.
  scribbleTap creates one instance at mount. up() calls `trailingClicks.arm()` after finishPress,
  keeping the arm-after-handler ordering. click calls `if (trailingClicks.consume()) return;` after
  the detail===0 branch, keeping the current order. Why cleaner: It owns separate state with its own
  invariant: one consumable click per pointerup-completed press, expiring after
  PRESS_CLICK_CONSUME_WINDOW_MS. Press tracking never reads that state. Today the invariant is split
  between armClickConsumption and the middle of the click handler. The sub-factory gathers it behind
  two verbs, and click reads as a decision ladder. Because it stays module-private, it does not
  break ADR-0002's ban on a shared click-swallowing helper.

Hot path: Yes. move() runs on every pointermove of a claimed pointer through the window-capture
dispatcher, and it shares frames with a live stroke. isMissingPenLift is a module-scope function
over the existing press object, the event and a number, and it returns a boolean. It creates no
closure and no object. pointerWasResumed (strokeMath.ts:108) is a pure numeric comparison. The
Math.hypot for jump now runs only in the pen branch, so non-pen moves do slightly less work.
eventHitsControl at module scope with a node argument allocates nothing new, and it still runs only
after the tolerance check fails. minViewportSide still runs only at pen pointerdown, and
snappedReleaseHitsControl only at pointerup. The consumer object is allocated once per mount, and
arm and consume do not allocate. Net effect: no new allocations on the per-move path, and three
fewer per-mount closures.

Tests and drift guards: No test changes. scribbleTap.test.ts, scribbleTap.penResume.test.ts and
scribbleGuard.test.ts import only the exported scribbleTap and scribbleGuard, and every new helper
stays private to the file, which keeps the existing behavioural coverage intact. Docs that reference
web/src/lib/actions/scribbleGuard.ts by path are unaffected. Update the scribbleTap entry in
docs/scratchpad/max-lines-per-function-plan.md when this lands.

Review: I checked the proposal against the code and against an actual ESLint measurement:
scribbleTap counts 143, and every other function in the file is at 47 or below. Each seam holds up.

1. **Type hoist and predicate.** The type hoist saves about 12 counted lines. The predicate saves
   about 11, and it replaces a mutable flag whose name already states the concept. Behaviour is
   identical because jump is a pure computation, so moving it into the pen branch changes nothing
   observable.
2. **DOM helpers.** Together they save about 19 lines. They are truly stateless (node plus event
   only). Hoisting gives them narrow signatures and adds no wide accessor bag.
   `node.ownerDocument.defaultView` gives the same window as the captured ownerWindow.
3. **Trailing-click sub-factory.** It saves about 9 lines. It owns two lets with an independent
   invariant, and nothing in press tracking touches that state. That is the sub-factory seam
   CLAUDE.md sanctions, not counter-driven relocation. Keeping it module-private respects ADR-0002
   and svelte.md, which forbid only a helper shared across the three guards.

Two ordering details to keep:

* In up(), arm() runs after finishPress, so a slow activation cannot burn the window.
* In click, the consume step comes after the detail===0 branch and before the live-press branch.

Projected total is 143 - 51 ≈ 92-95, which is plausible. Seams 1 and 2 alone would land at
about 101. Seam 3 is justified on its own terms, not merely to clear the 100 target.

No better seam was missed. The remaining closures (finishPress, move, up, cancel, down, click,
activate, cancelPreparation) all read or write press or current, so extracting them would mean
threading state back in. No per-file override is needed.

### `createSettings` — web/src/lib/state/settings.svelte.ts:258

**extract**, reviewer endorse; projected 117.

Seams (one commit each):

* **OPTIONAL_BRUSH_SETTING (hoisted) + makeOptionalBrushSetter** (named-step) → map: module scope in
  web/src/lib/state/settings.svelte.ts; helper: inside createSettings next to
  makeBoolSetter/makeIntSetter.
  `const OPTIONAL_BRUSH_SETTING = {...} as const satisfies Record<OptionalBrushType, BoolSettingKey>; function makeOptionalBrushSetter(brush: OptionalBrushType): (v: boolean) => void`.
  Moves: Hoist the per-instance-invariant OPTIONAL_BRUSH_SETTING map to module scope beside
  TOOL_DRAWER_CONTROLS. Replace setCrayonSetting/setMagicBrushSetting/setEraserSetting and the three
  identical setCrayon/setMagicBrush/setEraser method bodies with one in-factory
  makeOptionalBrushSetter(brush), which builds `makeBoolSetter(OPTIONAL_BRUSH_SETTING[brush])` and
  returns `(v) => { setFlag(v); if (!v) tool.fallBackFromBrush(brush); }`. Mutators become
  `setCrayon: makeOptionalBrushSetter('crayon')` and the same for magic and eraser. Why cleaner:
  Three copy-pasted setters that differ only in two literals are generated from the map that already
  drives isOptionalBrushEnabled. The helper is the brush counterpart of makeBoolSetter. It keeps
  state in the factory scope and threads no accessor bag. The order stays the same: persist first,
  then fall back. No method uses `this`, so switching from method shorthand to a property is safe.
* **readPersistedSettings** (pure-helper) → web/src/lib/state/settings.svelte.ts module scope,
  replacing readBoolSettings/readIntSettings in place; type PersistedSettings = Omit<Settings,
  'aiAccessToken' | 'aiUserApiKey' | 'saveFolderName'>.
  `function readPersistedSettings(current?: PersistedSettings): PersistedSettings`. Moves: Replace
  readBoolSettings/readIntSettings with one module-scope readPersistedSettings(current?). It reads
  every persisted field: the bool and int tables, plus theme and reduceMotion (each falls back to
  current?.x ?? its default) and toolbarStyle (readToolbarStyle() with no fallback, as today). Init
  becomes
  `$state({ ...readPersistedSettings(), aiAccessToken: '', aiUserApiKey: '', saveFolderName: null })`.
  reloadSettings becomes
  `Object.assign(s, readPersistedSettings(s)); applyTheme(s.theme); normalizeDisabledBrushes();`.
  Why cleaner: Init and reload share one list of persisted fields. That extends the no-drift
  guarantee in the BOOL_SETTINGS comment to theme, reduceMotion and toolbarStyle, which today are
  hand-listed twice. The function takes one parameter, captures nothing, and can be tested directly.
  Object.assign on the $state proxy goes through the same set traps as the per-key assignments, so
  reactivity and field order (bool, int, theme, reduceMotion, toolbarStyle, then applyTheme and
  normalize) are unchanged.

Hot path: Neither change touches a hot path. Setters run on parent toggles, and reloadSettings runs
only through onDurableRestore. Nothing runs per pointermove, resize or frame.
makeOptionalBrushSetter allocates its closures once per factory call, as the setters it replaces do.
readPersistedSettings allocates one object at init and one per reload, the same as today's
readBoolSettings/readIntSettings.

Tests and drift guards: No test, tool or doc references the moved identifiers: a grep of web/,
tools/ and docs/ for readBoolSettings, readIntSettings, OPTIONAL_BRUSH_SETTING and setCrayonSetting
finds nothing outside the module. The tests cover the behavior through the public API.
web/src/lib/state/settings.svelte.test.ts covers the reloadSettings describe (keeps current on an
absent key or an invalid theme or reduceMotion value) and the brush fallback.
web/src/lib/state/settings.toolbar.test.ts covers toolbarStyle reload. All must stay green.

Review: I read the code, and it matches the proposal's description. createSettings measures 139
counted lines, and every other function in the file is 13 lines or fewer. Both seams are real
de-duplications, not counter-driven splits. (1) readPersistedSettings closes a real drift hazard:
theme, reduceMotion and toolbarStyle are listed by hand in both the init and reloadSettings. The
function has one parameter, captures no factory state, and keeps the same fallback semantics:
readBool/readInt(key, current?.[prop] ?? default), theme and reduceMotion falling back to current or
their default, and toolbarStyle still with no fallback. Passing `s` (Settings) where
PersistedSettings is expected type-checks, and Object.assign onto the $state proxy is equivalent to
the per-key writes. (2) OPTIONAL_BRUSH_SETTING is per-instance invariant, so hoisting it is correct
on its own merits. makeOptionalBrushSetter replaces three identical bodies and follows the existing
makeBoolSetter pattern without an accessor bag. The projections hold up. The init shrinks from 10 to
about 6 lines (prettier wraps it) and reload from 13 to about 5, saving about 12. The hoist saves 5,
and the setters save 5 net (15 removed, 7 for the helper, 3 mutator lines). That gives about 117,
under the 125 cap, so no per-file override is needed. I agree with stopping above the 100 soft
target. The rest is mostly one-line table-generated mutators, and pushing further would need a
counter-driven STRING_SETTINGS table or closures moved behind accessors. Commit order: the brush
seam, then readPersistedSettings.

### `buildEngineApi` — web/src/routes/dev/engine/+page.svelte:117

**extract**, reviewer endorse; projected 97.

Seams (one commit each):

* **decodeBlobImageData, countStrokeRedPixels, countOpaquePixels, opaqueBounds (+ STROKE_RED_MIN /
  STROKE_OTHER_CHANNEL_MAX constants); in-component renderedImageData()** (pure-helper) → New
  sibling module web/src/routes/dev/engine/pixelReadback.ts (named exports), imported by
  +page.svelte. renderedImageData stays in the component script..
  `export function decodeBlobImageData(blob: Blob): Promise<ImageData>; export function countStrokeRedPixels(pixels: { data: Uint8ClampedArray }): number; export function countOpaquePixels(pixels: { data: Uint8ClampedArray }): number; export function opaqueBounds(pixels: { data: Uint8ClampedArray; width: number; height: number }): { minX: number; minY: number; maxX: number; maxY: number } | null`.
  Moves: The pixel-analysis bodies of blobRedPixelCount (blob decode via createImageBitmap, a
  scratch canvas and getImageData, then the red scan), nonTransparentCount (the alpha-count loop
  from index 3, stride 4) and inkBounds (the bounding-box scan that returns null when empty). The
  members stay on the returned object as thin wrappers. blobRedPixelCount keeps its
  `if (!blob) return -1` guard in the wrapper. A small renderedImageData() next to renderedCanvas()
  reads the full composite's ImageData. The 200/100 thresholds become named module constants
  carrying the existing WHY: the harness draws pure red, and paper never is. Why cleaner: This is
  the only part of buildEngineApi that does not bind the engine or the page's wrapper and canvas
  elements to the spec-facing table. It is pure RGBA buffer math behind one narrow ImageData-shaped
  parameter, with no accessor bag and no factory state threaded back in. It can be unit-tested on a
  hand-built buffer, and it is where the unnamed tuning literals live. Leaving the forwards, the
  wrapper-size seams and the pointer seams in place is correct: moving them would only relocate
  closures that need canvasEl, wrapperEl or firePointerEvent.

Hot path: Not a hot path. This is the dev-only /dev/engine Playwright harness, and the readbacks run
only when a spec calls page.evaluate. They never run per pointermove, resize or frame. The
extraction allocates nothing new: the same ImageData buffer and scratch canvas as today, reached
through a plain call. The pointer seams and the engine are untouched.

Tests and drift guards: No spec edits are needed. The member names and types stay pinned by
Window['__engine'] in web/tests/global.d.ts, and buildEngineApi is annotated against it.
routes/dev/page.test.ts globs only ./*/+page.svelte. An optional colocated pixelReadback.test.ts
(node env, hand-built buffers) can cover opaqueBounds edge cases: empty returns null, a single
pixel, and the far edges. It can also cover the two counters. decodeBlobImageData stays covered by
engine-export.spec.ts. Update the docs/scratchpad max-lines-per-function-plan.md candidate row when
this lands.

Review: I checked the proposal against the code and the measurement, and it holds up. ESLint counts
blobRedPixelCount at 15 lines, nonTransparentCount at 9 and inkBounds at 21, which matches. As thin
wrappers they come to about 4, 3 and 3 lines, saving about 35, so 132 - 35 is about 97. The
projection is plausible and lands under both the 125 cap and the 100 target.

The seam is genuine, not driven by the line counter:

* The moved code needs no wrapperEl, canvasEl or engine state.
* Each helper has a nameable concept and one narrow parameter.
* It gains independent testability, which the Playwright-only path lacks today.
* It names the 200/100 red thresholds, which the tuning-literal convention asks for anyway.

Behaviour is preserved:

* Guard ordering is unchanged, because the `!blob` check stays in the wrapper.
* The same getImageData region is read, and the scratch canvas and bitmap are handled identically.
  Neither is closed today, and that should stay as is.
* No $state or reactivity, listener or lifetime concerns are involved.

I found no better seam. The rest of the function is the API table. Sharing the three wrapper-size
lines would save about 4 lines at the cost of distinct WHY comments. The pointer seams need page
state. A raise would be the dishonest answer here, since a clean pure-helper extraction exists.

Two minor points, neither a revision:

* Keep renderedImageData as a one-liner over renderedCanvas() rather than a second composite path.
* The optional unit test is fine, since tests are not speculative surface. No new prop or option is
  added.

### `toolbarGlassPanes` — web/src/lib/glassPanes.ts:134

**extract**, reviewer endorse; projected 116.

Seams (one commit each):

* **gearCornerGlass, fullscreenCornerGlass** (pure-helper) → web/src/lib/glassPanes.ts, module scope
  next to rectangle()/flyoutRectangle(), module-private.
  `function gearCornerGlass(width: number, height: number, safe: Readonly<SafeAreaInsets>): Rect; function fullscreenCornerGlass(safe: Readonly<SafeAreaInsets>): Rect`.
  Moves: The gear-corner rectangle literal (glassPanes.ts:239-245) and the fullscreen-button
  rectangle literal (glassPanes.ts:250-256), including their use of CORNER_DEPTH_PX,
  FULLSCREEN_DEPTH_PX, FULLSCREEN_RADIUS_PX, MENU_RADIUS_PX, and BLEED_PX. The call sites become
  `const gear = gearCornerGlass(width, height, safe);` and
  `if (fullscreenState.supported) strip.push(fullscreenCornerGlass(safe));`. The
  `fullscreenState.supported` read, the compact branching, and the push order (strip rects, then the
  gear, then the fullscreen rect, with the gear in its own pane outside compact) all stay in
  toolbarGlassPanes. Why cleaner: Each helper returns the fixed glass footprint of one named corner
  control, and it depends only on viewport size and safe-area insets. It does not depend on the
  drawer or flyout geometry the rest of the function computes. Today the fullscreen rect is an
  anonymous literal. Both helpers are pure, take narrow scalar inputs, and follow the
  flyoutRectangle precedent. Taken alone, the gear helper would be marginal because the `gear` const
  already names it. It is still worth doing so both corner controls read the same way side by side.
  One commit.

Hot path: This is not a pointermove or frame path. The function runs inside a $derived in
GlassPanes.svelte, so it re-runs on resize, safe-area, orientation, settings, flyout, or drawer
changes. Every call already allocates Rects, the strip array, and the SVG string and data URL. The
helpers capture nothing and return the same single Rect that the inline rectangle() call allocates
today, so the change adds no allocations. fullscreenState.supported is still read synchronously in
toolbarGlassPanes, so $derived dependency tracking does not change.

Tests and drift guards: No test changes. web/src/lib/glassPanes.test.ts imports only
toolbarGlassPanes, and the helpers stay private. The existing compact and corner-only cases already
cover the moved rects through the public function. No other web/src or tools file imports
glassPanes. After the commit, update the toolbarGlassPanes row in
docs/scratchpad/max-lines-per-function-plan.md.

Review: I checked the proposal against glassPanes.ts:134-263 and it holds up. The proposer is right
that the drawer strip (166-218) and the trigger position (219-228) should stay inline. Each reads 10
or more shared locals (x, bottom, pitch, size, depth, colorTop, rowEnd, columnTop, railX,
drawerOpen, hasActions, brush, stroke). Pulling either out needs a parameter bag or a geometry
record that only this function builds, which is exactly the counter-driven split the governing rule
rejects. The two corner controls are the one part that depends only on width, height, and safe, so
they are the honest seam. The gear helper on its own is borderline, because the `gear` const already
names that rect and moving it mostly relocates lines. Doing it together with the fullscreen helper,
which does name a control that has no name today, makes the pair consistent, so it is acceptable.
Behaviour is preserved: gear is still computed unconditionally, the push order is unchanged, the
fullscreenState.supported guard stays at the call site, and no reactivity or error paths change. The
estimate is plausible. The gear drops 6 lines. The fullscreen block (248-257, 10 lines) drops 8 or 9
depending on whether Prettier keeps `if (...) strip.push(fullscreenCornerGlass(safe));` on one line,
which it should at that width. That gives about 115-116, under the 125 cap with no per-file raise.
The function stays above the 100 soft target, which is correct because nothing else in it separates
cleanly. One smaller cleanup, not required: the duplicated
`(drawerOpen ? count * pitch - ACTION_BUTTON_GAP + PANEL_INSET : 0)` in rowEnd and columnTop could
become one named local. That is a readability change in its own right, not a seam, so it is
optional.

### `createFreeGenerations` — web/src/lib/state/freeGenerations.svelte.ts:78

**extract**, reviewer endorse; projected 102.

Seams (one commit each):

* **fetchGrantRemaining** (named-step) → module scope of
  web/src/lib/state/freeGenerations.svelte.ts, next to installationId() and INSTALLATION_ID_PATTERN,
  not exported.
  `async function fetchGrantRemaining(id: string, signal: AbortSignal): Promise<number>`. Moves:
  Lines 127-144 of refreshFreeGenerationGrant, in their current order: the INSTALLATION_ID_PATTERN
  check, the fetch to apiUrl('/api/free-generation-grant') with the INSTALLATION_ID_HEADER header
  and the abort signal, the response.ok check, and the unknown-body validation (ok === true,
  remaining is a finite number). The helper returns status.remaining and throws on every failure.
  refreshFreeGenerationGrant keeps latest.begin(), await installationId(), the first isCurrent
  guard, `const remaining = await fetchGrantRemaining(id, request.signal)`, the isCurrent-gated
  setFreeGenerationsRemaining(remaining), and the catch that calls setFreeGenerationsUnavailable
  when the request is still current. Keep the inline structural validation and return a plain
  number. Do not add a type guard that narrows to FreeGenerationGrantStatus: that wire type also has
  `limit`, which the client never checks, so such a guard would claim more than it proves. Why
  cleaner: It reads no factory state (no `s`, no deps, no LatestRequest). It is the client half of
  the /api/free-generation-grant wire contract, the same kind of code as installationId() and
  cachedBadgeRemaining(), which already sit at module scope. After the move,
  refreshFreeGenerationGrant does one job: deciding which request's result wins. The signature is
  narrow: two values in, a number out, and no state threaded back.

Hot path: Not a hot path. The code runs once per grant refresh, triggered by hydration, reconnect, a
settings change, or a visible-page return. It is never reached per pointermove, resize, or frame,
and the extraction adds no allocations beyond the existing fetch and promise.

Tests and drift guards: No test changes are needed. web/src/lib/state/freeGenerations.svelte.test.ts
drives everything through the factory with a stubbed global fetch, so it keeps covering the moved
validation, including the malformed-body and non-finite cases and stale-request ordering. The
docs/scratchpad/max-lines-per-function-plan.md row for createFreeGenerations (119) should be updated
after the change lands. No tools/** reference is affected.

Review: I checked this against the code at e14d0e99d. The seam is real and not driven by the line
counter. The moved block (lines 127-144) touches none of the closure state; its only inputs are `id`
and `request.signal`. Behaviour stays the same. The order of operations is unchanged:
installationId, then the isCurrent guard, then the pattern check, fetch, ok check, JSON parse and
validation, then the isCurrent-gated setter. Every throw, including an AbortError from a cancelled
signal, still reaches the caller's catch, and that catch still only acts when the request is
current. No $state is read or written in the helper, so reactivity is unaffected. There are two
small corrections. (1) The proposal says the validation 'can narrow toward
FreeGenerationGrantStatus'. It shouldn't: that type includes `limit`, which is never validated, so a
guard typed as FreeGenerationGrantStatus would be a false claim. Returning a plain number is the
honest contract and adds no new surface. (2) The projection is 102, not 101: the 18 counted lines of
127-144 become one call line, so 119 - 17 = 102. The target is still met in substance. There is no
better seam. The setters, followEligibility, requestGrant and the returned object all share `s` and
the one LatestRequest, so moving them out would mean parameter bags, and there is no separate state
to justify a sub-factory. At 119 the function already passes the 125 cap, so no raise is needed.
This one seam pays it down toward the 100 soft target without forcing any split.

### `createAiGeneration` — web/src/lib/state/aiGeneration.svelte.ts:110

**raise**, reviewer endorse; projected 117.

Hot path: Not a hot path. Every method runs once per AI generation lifecycle event (start, preview,
finish, fail, close, minimize), never per pointermove, resize, or frame. No allocation concern
either way.

Tests and drift guards: None, because no code changes. The only follow-up is bookkeeping: in
docs/scratchpad/max-lines-per-function-plan.md, mark the createAiGeneration row (117,
aiGeneration.svelte.ts:110) as resolved with "no action, under the 125 cap, no clean seam".

Review: I checked the proposal against the code in
/Users/kylemit/Code/Splotch/.claude/worktrees/bridge-cse_01MXwVoAd6yEmAnkWyNn4PiJ/web/src/lib/state/aiGeneration.svelte.ts
and it holds up. ESLint counts createAiGeneration at 117 lines. That is under the 125 hard cap, so
the file needs no override and final_file_max is null. The other functions in the file are small,
confirmed at 12 lines or fewer: startAiGeneration 12, failAiGeneration 11, finishAiGeneration and
closeAiResult 10 each.

The body is spread across real surface, with no one block to pull out:

* the typed $state initializer (about 15 lines)
* six getters (18 lines), needed to expose readonly state from the factory
* two untracked ownership variables
* three tiny internal helpers (isAiGenerationActive, open, leavePhase)
* eleven machine methods, each one guarded transition

swapObjectUrl is already hoisted to module scope as a pure helper.

I tried the proposer's rejected seams myself:

1. **Run-ownership sub-factory.** It would own nextAiGenerationId and activeAiGeneration, which is a
   real, separate piece of state. But reading web/src/lib/latestRequest.ts confirms its semantics
   don't match:
   * begin() creates its own controller, while startAiGeneration accepts one from the caller.
   * Every cancel() or detach() bumps the counter, while endAiGeneration clears ownership only if
     the id is still current and never bumps.
   * closeAiResult aborts and clears without bumping, so an old id's isCurrent would behave
     differently.

   Reusing LatestRequest would change behavior. A parallel second ownership factory would save about
   6 to 8 lines at the cost of a near-duplicate concept, which is counter-driven.
2. **Hoisting transitions to module scope.** This would need `s` and the ownership state passed back
   in, the parameter-threading pattern CLAUDE.md calls a bad seam.
3. **Factoring out the repeated `!isAiGenerationActive(id) || !open()` guard.** I looked for this
   myself. The early-return bodies differ (revoke the preview, revoke the url and return false, or
   plain return), so a shared helper would be a one-line wrapper that saves almost nothing.
4. **Collapsing the getters.** This would lose the per-field typed surface and the readonlyValue
   wrapper on phase.

The 17 lines above the 100 soft target are honest state-machine surface, not a smell, so leaving the
function as it is is the right call.

### `edgeMargins` — web/src/lib/drawing/magicSheetEdges.ts:31

**extract**, reviewer endorse; projected 22.

Seams (one commit each):

* **axisBands (plus module-private type EdgeBand = { source: number; sourceSize: number; dest:
  number; destSize: number })** (pure-helper) → web/src/lib/drawing/magicSheetEdges.ts, module
  scope, unexported.
  `function axisBands(sheetExtent: number, boxOrigin: number, boxExtent: number, sourceExtent: number, destinationInset: number): { near: EdgeBand | null; span: EdgeBand; far: EdgeBand | null }`.
  Moves: The per-axis arithmetic in lines 41-55: the rounded near and far edges, far margin =
  sheet - round(origin+extent), scale = boxExtent/sourceExtent, pixel = 1/scale, inset =
  destinationInset/scale, far source = sourceExtent - pixel - inset. It returns the three intervals
  for that axis. near = {source: inset, sourceSize: pixel, dest: 0, destSize: round(origin)}, or
  null when round(origin) <= 0. span = {source: 0, sourceSize: sourceExtent, dest: origin
  (unrounded), destSize: boxExtent (unrounded)}. far = {source: far source, sourceSize: pixel, dest:
  round(origin+extent), destSize: margin}, or null when margin <= 0. edgeMargins keeps
  destinationInset (the one input that uses both axes, min(bw,bh)), builds x and y with axisBands,
  and emits the 8 regions in today's order as (x,y) pairs: (span,near), (span,far), (near,span),
  (far,span), (near,near), (far,near), (near,far), (far,far). Each pair pushes one EdgeFill when
  both bands are non-null. The pair list can be a module-scope readonly tuple of band keys. Eight
  explicit calls to a tiny push helper would read equally well and avoid string-keyed lookups; pick
  whichever reads better. Do not add a positional 8-number blit helper. Why cleaner: The function is
  a 3x3 grid minus its centre, and the two axes are independent apart from the shared
  destinationInset. Today the X and Y math is interleaved across 12 locals, and eight 10-line object
  literals each re-spell the same three per-axis intervals, so a slip such as sourceInsetX in an sy
  slot is easy to make and hard to see. Computing each axis once makes the symmetry part of the
  structure and removes the duplication instead of relocating it. It also gives the helper a narrow,
  pure 5-number signature.

Hot path: Not on a per-pointermove, resize, or frame path. edgeMargins runs once per magic-sheet
build: from rasterizeSheet via extendSheetEdges, and from the off-thread fill path. That build
already allocates a canvas and up to 8 EdgeFill objects. The extraction adds 2 axis objects and up
to 6 band objects per build, and captures no closures. The pair list, if used, is hoisted to module
scope. This is negligible and not a hot-path regression.

Tests and drift guards: None need changes. web/src/lib/drawing/magicSheetEdges.test.ts (66 lines)
tests only the public edgeMargins, using toHaveLength, find/filter, toMatchObject, arrayContaining
and toEqual([]). Output values and order are preserved, and float results are bit-identical as long
as the helper keeps today's operation order: scale = box/source, pixel = 1/scale, inset =
destInset/scale. The public API (EdgeFill, edgeMargins, extendSheetEdges) is unchanged. The docs
that name edgeMargins or extendSheetEdges stay accurate.

Review: I checked the proposal against the code at magicSheetEdges.ts:31-146 and it holds up.

* **Count and cap.** The function is 116 counted lines, under the 125 cap, so a raise or override is
  not needed. The only question is whether a genuinely cleaner shape exists that reaches the 100
  target, and one does.
* **Why it is not counter-driven.** The body is eight near-identical object literals over a
  separable 3x3 band grid. One per-axis pure helper removes that duplication and makes the X/Y
  mirroring part of the structure.
* **Band mapping.** I checked all eight blocks against the band scheme. The (x,y) pairs are
  (span,near), (span,far), (near,span), (far,span), then (near,near), (far,near), (near,far),
  (far,far). Each maps field-for-field onto the literals: top, bottom, left, right, then top-left,
  top-right, bottom-left, bottom-right.
* **Unrounded span.** The proposer correctly flagged that span uses the unrounded ox/bw while near
  and far use rounded edges.
* **Float equality.** Output stays bit-identical only if the helper keeps today's operation order
  (1/(box/source), not source/box). The implementer must preserve this.
* **Minor preference.** Eight explicit push calls may read better than a string-keyed pair table.
  Either is acceptable. A positional blit(sx..dh) helper would be counter-driven and was rightly
  rejected.
* **Length estimate.** About 22 lines is plausible: roughly 10 for the prettier-wrapped signature,
  plus destinationInset, x, y, fills, the 8 emits or a loop, and return.
* **Out of scope.** The ADR-0043 staleness the proposer noted is real but separate from this seam.

### `installWebBackHandler` — web/src/lib/boot/webBackHandler.ts:48

**raise**, reviewer revise; projected 114.

Hot path: This code is not on a hot path. It runs on popstate, when a modal opens or closes (the
observeModalStack callbacks), and on setCanvasEmpty, which only fires when the canvas switches
between empty and non-empty. None of these run per pointermove, resize, or frame. A raise adds no
allocations. The allocations the function already makes (the page-state spread in pushStack, the
stack object in opened()) happen once per history event.

Tests and drift guards: None. The file has no colocated unit test. web/tests/web-back.spec.ts covers
it end to end. web/src/app.html.test.ts drift-guards the literal `WEB_BACK_PAGE_STATE_KEY = '...'`
at its current path. systemBack.ts dynamic-imports './webBackHandler'. A raise with no code change
affects none of these.

Review: I read web/src/lib/boot/webBackHandler.ts:48-171 myself, and the proposer's account is
accurate.

**The shared state is real.** The counters are written in one callback and read in another:

* `controlledBacksPending` goes up in closing() and down in handlePopState, and
  reconcileDrawingGuard reads it.
* `historyDismissalsPending` goes up in handlePopState and is consumed in closing();
  restoreRefusedDialog also decrements it.
* `restoredDialogsRemaining` is set in handlePopState and at install, and consumed in opened().
* `guardRemovalPending` is set in reconcileDrawingGuard and cleared in handlePopState.
* `current` is read and written by every closure.

**No sub-factory owns its own state.** A split into a dialog stack and a drawing guard would need
the guard half to read `current.dialogs` and `controlledBacksPending`. It would also need the
popstate half to set `drawingGuardConsumed` and `guardRemovalPending`. Either direction threads
state back through an accessor object, which the rules forbid.

**The pure-helper options are not name-worthy concepts:**

* The candidates are the six-way guard clause in reconcileDrawingGuard, and the marker-to-target
  line already delegated to stackFromMarker.
* One closure-local step does repeat five times: `current = target; reconcileDrawingGuard()`. A
  `settleOn(target)` helper would save about 4-5 lines, but it is a readability edit, not a seam. It
  still would not reach the soft target of 100, and doing it only to shrink the count would be
  counter-driven.
* The branch-collapse tidy-up the proposer mentions keeps behaviour the same (merging the
  'closed-dialog' and 'no-dialog' tails, with the `historyDismissalsPending -= 1` kept only on
  'no-dialog'). It is optional and not part of this plan.

**One correction, the file max.** The proposal gave 139 as a conditional file max. At 114 the
function is already under the 125 hard cap, so the global rule passes and no per-file override is
needed. The longest+25 formula is for files that exceed the cap. Applying it here would set the
file's limit at 139, which would *loosen* the hard cap for this file and let it grow past 125
without review. So the plan of record is:

* Raise, meaning accept as-is above the soft target.
* No eslint override (final_file_max null).
* If the soft target of 100 is ever enforced as its own lint level, a 139 override with the
  proposer's one-line WHY becomes appropriate. Until then it is speculative surface.

**Projected length:** 114 is plausible. It matches the baseline table in
docs/scratchpad/max-lines-per-function-plan.md.

### `createColoringPackDownloader` — web/src/lib/coloringPacks/manager.ts:88

**extract**, reviewer endorse; projected 108.

Seams (one commit each):

* **createColoringPackManifestLoader** (sub-factory) → web/src/lib/coloringPacks/manager.ts, module
  scope, not exported, placed after fetchManifest.
  `function createColoringPackManifestLoader(downloadAllowed: () => boolean): (signal: AbortSignal) => Promise<ResolvedColoringPackManifest>`.
  Moves: The `let fetchedManifest` cache (manager.ts:91), the `loadManifest` closure (102-105), and
  its WHY comment (98-101). The downloader binds it once at the top:
  `const loadManifest = createColoringPackManifestLoader(downloadAllowed);`. run() still calls
  `loadManifest(controller.signal)` at line 113, unchanged. The comment's wording "reuses this
  downloader's copy" should become "reuses the copy this loader holds" (or similar) so it still
  reads correctly at module scope. The comment in removeDownloadedColoringPacks ("Deliberately not
  loadManifest()") stays accurate because the local binding keeps that name. Why cleaner:
  fetchedManifest is read and written only inside loadManifest. It is a separate piece of state with
  its own policy: refetch when a download may happen, otherwise reuse the memo, which keeps metered
  connections from paying for the manifest twice. The boundary is narrow, one predicate in and one
  function out, and nothing is threaded back through accessors. That makes this a true sub-factory
  in the CLAUDE.md sense, not a relocation. The downloader is left holding only run-lifecycle state.
  The memo lifetime stays per downloader because the downloader calls the sub-factory once.

Hot path: Not a hot path. The downloader runs on boot, online, visibilitychange, network change, and
the policy and remove events, never per pointermove, resize, or frame. The extraction adds one
closure per downloader, allocated once at construction. run() allocates nothing extra.

Tests and drift guards: None need edits. manager.test.ts uses only the public
createColoringPackDownloader and removeDownloadedColoringPacks. Two tests check manifest reuse
through fetch call counts via the downloader: 'rescans the store on later triggers without
refetching the manifest' (line 124, toHaveBeenCalledOnce at 135) and the case asserting
toHaveBeenCalledOnce at 172. Both keep passing because behavior is unchanged. The export names are
unchanged, so boot/coloringPacks.test.ts's module mock is unaffected. The plan doc
docs/scratchpad/max-lines-per-function-plan.md can record 112 -> ~108.

Review: I checked the proposal against the code and it holds. ESLint confirms 112 counted lines, and
loadManifest counts 4. Moving out the `let` (1 line) and loadManifest (4 lines) and adding a 1-line
binding projects to about 108, which is plausible.

The seam is not counter-driven. fetchedManifest is touched nowhere except loadManifest. It carries
its own policy (the metered memo). Its only input is the downloadAllowed predicate the factory
already receives, so no accessor object or parameter bag appears.

Behavior is preserved:

* The loader is created once per downloader, so the memo lifetime and fresh test instances are
  unchanged.
* The downloadAllowed() read still happens at call time, inside the loader.
* Abort and error paths are unchanged, because a fetch rejection still propagates into run() and
  then runWithCleanup's catch.

There is no $state involved. Nothing changes for listener lifetimes, because the cache takes no part
in start/stop.

The rejected alternatives are correctly rejected:

* Hoisting the install loop would thread stopped, paused, installing, and the controller back in.
* The listener wiring is bound to the native keep-until-settlement invariant in stop().
* pause, applyDownloadPolicy, and cancelActiveWork are flag transitions on the downloader's own
  state.

I found no better seam, and the rest of the file is small. The gain is modest (about 4 lines) and
the function stays above the soft target of 100. The extraction is still worth one commit because it
names a real concept and takes a policy comment out of the lifecycle flags. The only refinement is
to reword the moved comment's "this downloader's copy" so it reads correctly at module scope. A
raise is not needed either way: at 112 the function is under the 125 cap, so no override is
required.

### `createLayout` — web/src/lib/state/layout.svelte.ts:45

**raise**, reviewer endorse; projected 112.

Hot path: Partly hot. syncViewportOnResize runs on every resize, and deferViewportSyncForRotation
runs on every orientationchange and screen.orientation change. syncViewport runs on the resize path,
or after the 200 ms rotation hold. Per event it allocates only the insets object that
measureSafeAreaInsets() returns, which it already does today. Nothing moves, so no allocation is
added. Neither seam I considered would add one either: a rotation-settle sub-factory would be built
once, and a module-scope readViewportOrientation(query) would be a plain function.

Tests and drift guards: None, because no code changes. web/src/lib/state/layout.svelte.test.ts tests
only through the public surface. The one bookkeeping change: update the createLayout row in
docs/scratchpad/max-lines-per-function-plan.md (line 41) to say "no action, under the 125 cap
(112)".

Review: I checked the proposal against the code in web/src/lib/state/layout.svelte.ts and it holds
up. I ran the eslint measurement command from the task and it reports createLayout at 112 counted
lines, under the 125 hard cap. So the "raise" outcome here means keep the default cap with no
per-file override, and the final file max is null. The next longest functions are dispose (15),
install (12), syncViewport (9) and deferViewportSyncForRotation (7). They are all nested inside
createLayout, so the file needs no other action.

Why no split is cleaner:

* About 32 of the 112 lines are the $state seed and its type (15) plus the six getters (18). That is
  the fixed shape of a runes-backed createX() with a read-only interface.
* The closures are 1 to 9 lines each and all share one set of private state: s, the two
  MediaQueryLists, the timer handle and installed. Moving them to module scope would mean passing
  that state back in as parameters, which is the wide-parameter pattern the constraints reject.
* A rotation-settle sub-factory would be single-use. Its "don't publish on resize while a rotation
  is pending" rule belongs to this layout code, not to a general debounce, so extracting it would be
  a split made only to satisfy the counter.

One small thing the proposer missed: the 4-line "clear the pending rotation timer" block appears
twice, in syncViewportImmediately and in dispose. A local cancelRotationViewportSync() closure would
remove the duplicate and save about 3 lines, bringing the function to about 109. That is a DRY
cleanup, not a length fix. It does not reach the 100 soft target and is not needed for this
campaign, so I leave it out of the plan. It is fine to do if someone is already editing the file.

The projected length of 112 matches the measured count.

### `createSaveFailure` — web/src/lib/state/saveFailure.svelte.ts:63

**extract**, reviewer endorse; projected 99.

Seams (one commit each):

* **sameContent, withPicture (module-scope, unexported)** (pure-helper) →
  web/src/lib/state/saveFailure.svelte.ts, module scope, after pictureSignature and before
  createSaveFailure.
  `function sameContent(a: HeldPicture, b: HeldPicture): boolean; function withPicture(held: HeldPicture[], picture: HeldPicture): HeldPicture[]`.
  Moves: The inner functions sameContent (lines 105-107) and withPicture (lines 109-116, with its
  WHY comment about identical bytes held once and a denial kept either way), unchanged. Neither
  reads factory state. They use only their arguments and the module constant UNSAVED_PICTURE_LIMIT.
  Call sites keep the same names: reportSaveFailure (line 134), the retryUnsavedPictures filter and
  reduce (lines 163, 165), and the restoreUnsavedPictures reduce (line 187). Why cleaner:
  withPicture is the held-picture merge rule: dedupe by content signature, keep a denial whichever
  order it arrives in, and cap at UNSAVED_PICTURE_LIMIT with the oldest dropped. It is a pure
  reducer over HeldPicture[]. At module scope its lack of dependence on per-instance state is
  visible, and the factory keeps only real state and the methods that change it. No parameter bag,
  no accessor threading. It stays unexported because the public-API tests already cover dedupe,
  denial merge and the limit.

Hot path: No. This is save-failure banner state. It runs only when a save fails, on Retry, on
dismissal, and on boot or durable restore. It never runs per pointermove, resize or frame. Hoisting
removes two closure allocations per factory call and adds none. Passing withPicture as a reduce
callback behaves the same whether it is a closure or a module function.

Tests and drift guards: None by identifier, because neither helper is referenced outside
saveFailure.svelte.ts. The public-API suites (saveFailure.svelte.test.ts,
saveFailure.durableRestore.test.ts, and the callers' tests) import only createSaveFailure,
saveFailureState, the destructured actions and UNSAVED_PICTURE_LIMIT, and all of those are
unchanged. No import is added, so startup-bundle.spec.ts's chunk graph stays the same.
docs/scratchpad/max-lines-per-function-plan.md records the 108 measurement and should be updated to
about 99 once this lands.

Review: I checked the code and re-measured it. createSaveFailure counts 108 lines, sameContent 3 and
withPicture 6 (the WHY comment is skipped by skipComments), so hoisting both gives exactly 99. That
is just under the soft target of 100, and the arithmetic holds.

The seam is real, not counter-driven. Both functions capture nothing from the factory: no s, no
pictures, no generation, no queue. withPicture is a named concept (the held-picture merge and cap
rule) called from three different methods. Behaviour is unchanged: the functions are pure, and
`.reduce(withPicture, [])` gets the same arguments either way, because withPicture takes two
parameters and ignores reduce's index and array.

I agree with the rejected alternatives. The 5-line enqueue queue is too small to justify a
sub-factory, and sharing it with secureCredentialCoordinator would add a startup-path import.
retryUnsavedPictures and the restore IIFE read and write pictures, generation, s and restoration, so
moving them would need the prohibited accessor threading. outcome() reads the $state, so it has to
stay.

One caveat: 99 against 100 leaves almost no margin. That is fine because 100 is a soft target. The
hard cap is 125, and the function is already under it with or without this change. The extraction is
justified by accuracy about dependencies, not by the counter.

### `composeExportPng` — web/src/lib/drawing/exportDrawing.ts:201

**extract**, reviewer revise; projected 71.

Seams (one commit each):

* **settleTiledExportBitmaps** (pure-helper) → web/src/lib/drawing/exportDrawing.ts, module scope,
  not exported, beside deliverTiledPreview/closeTiledPreviewSource above composeExportPng.
  `async function settleTiledExportBitmaps(snapshot: TiledExportSnapshot, texture: HTMLImageElement | null, overlaySource: ExportOverlaySource | null): Promise<Pick<TiledPngInput, 'tiles' | 'texture' | 'overlay'>>  (import type { TiledPngInput } from './pngEncoder', which the module already imports, so this adds no new module edge)`.
  Moves: Lines 218-250 of composeExportPng: building the bitmapRequests array (tile bitmap awaits,
  texture createImageBitmap, overlay load + createImageBitmap), Promise.allSettled, the path that
  closes every fulfilled bitmap and then rethrows on any rejection, and the loop that sorts results
  into tiles/texture/overlay. The ExportBitmapResult union becomes private to this helper.
  loadPaperTexture stays in composeExportPng, called before the helper, so ordering is unchanged.
  The tiled branch becomes: const texture = includePaperTexture ? await loadPaperTexture() : null;
  const bitmaps = await settleTiledExportBitmaps(snapshot, texture, overlaySource); return
  encodeTiledCanvasPng({ sourceWidth, sourceHeight, sourceScale, exportScale: renderScale,
  ...bitmaps, paperColor, previewWidth }, preview?.onReady). Why cleaner: The block has one job with
  its own invariant: decode every bitmap the tiled worker needs, all-or-nothing, and close whatever
  did settle before rethrowing so a failed save does not leak bitmaps. It currently sits in the
  middle of the theme/pipeline dispatch, carrying a tagged union that exists only to sort the
  results back out. Extracted, it takes 3 narrow inputs and returns exactly the slice of the
  encoder's input contract it produces. Typing that return as Pick<TiledPngInput, ...> keeps the
  helper's return type from drifting away from the encoder's input and lets the call site spread the
  result straight in, without renaming during destructuring. composeExportPng then reads as a
  dispatcher.

Hot path: Not on a hot path. composeExportPng runs once per save or share, and the engine loads the
module on demand. It is never reached per pointermove, resize, or frame. The extraction adds one
async frame and one small result object per export. That is negligible next to the allSettled array
and the ImageBitmap decodes, and the svelte.md no-allocation rule does not apply. The helper is
module-local, and the only new import is type-only from './pngEncoder', which is already imported.
The startup-bundle boundary is unchanged.

Tests and drift guards: web/src/lib/drawing/exportDrawing.test.ts covers the moved code only through
composeExportPng. The relevant cases are settled live tiles, the preview forward, closing fulfilled
bitmaps when another tiled bitmap rejects, canonical overlay load on demand, and a rejected overlay
load closing settled bitmaps. No edits are needed. Update the composeExportPng row in
docs/scratchpad/max-lines-per-function-plan.md after the commit.

Review: I read the code myself and the proposal holds up. Counted lengths confirm composeExportPng
is 102, deliverTiledPreview 69, and everything else 23 or less. Lines 218-250 are 33 non-blank lines
with no comments, so 33 lines move out. The call adds back about 1-2 lines and the spread saves one,
which puts the function near 71. That matches the proposal's roughly 72.

The seam is real, not counter-driven. It has a nameable contract (all-or-nothing decode plus leak
cleanup), 3 narrow inputs, a private union that goes with it, and no threaded state.

Behaviour is preserved exactly:

* The texture is still awaited before the bitmap requests are built.
* The rethrow and the close-fulfilled-bitmaps path are identical.
* The result sort order is identical.
* There is no reactive state here. resolvedTheme() stays in the caller, read once up front.

The one revision is the return type. Typing it as Pick<TiledPngInput, 'tiles'|'texture'|'overlay'>,
from the encoder's existing input interface, is better than restating an inline shape. It ties the
helper's output to the contract it feeds, which follows the cross-file agreement rule, and it makes
the call site a plain spread.

The proposer was right to reject the two further splits. Splitting into tiled and canvas pipeline
functions would push theme, preview and overlaySource through two signatures with no gain once the
function is already under 100. Merging the paint+overlay pairs is a separate dedupe decision with
different scale and target. A raise is not warranted, because the function is under the cap and a
clean seam exists.
