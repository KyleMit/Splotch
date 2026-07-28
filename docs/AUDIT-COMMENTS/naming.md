# Audit comments — Naming

32 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `a30f1061c73b` — [P3][naming] Hard-coded default color `'#AB71E1'` is an ungreppable magic string

**Issue**

```ts
currentColor = options.initialColor || '#AB71E1';
```

The engine's fallback color is a bare hex literal with no name. It encodes palette knowledge (a
specific swatch) that lives elsewhere in `state/colors`. A designer changing the default swatch
would never find this, and there is no link between the literal and the palette it came from.

**Fix**

refactor(drawing): name the default stroke color via DEFAULT_STROKE_COLOR

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071308060) · 2026-07-24
15:04:21 UTC</sub>

### `3c9b23b117f6` — [engine-distance-naming] name currentLineWidth's default and unify manual distance math with Math.hypot

**Issue**

Two small self-documentation gaps: (a) `let currentLineWidth = 8;` — the interim default before a
component pushes a real width — is a bare literal with no name; (b) distance is computed as
`Math.sqrt(deltaX * deltaX + deltaY * deltaY)` in `restartStrokeIfResumed` (838) and `strokeSpeed`
(861), while the rest of the drawing code (e.g. `crayonBrush`, `advanceEdgeSwipeCandidate` at 816)
uses `Math.hypot`. The inconsistency makes the two forms look intentionally different when they are
not.

**Fix**

refactor(drawing): name currentLineWidth default and use Math.hypot for distance

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071308936) · 2026-07-24
15:04:25 UTC</sub>

### `945ac9994c20` — [P4][naming] Name the Gemini key prefix in `looksLikeApiKey`

**Issue**

```ts
export function looksLikeApiKey(value: string): boolean {
  return /^AIza/.test(value);
}
```

The `AIza` prefix is a meaningful, provider-specific magic string embedded in a regex. The comment
above explains it, but the literal itself is un-named and not greppable alongside other Gemini
constants.

**Fix**

Extracted the magic 'AIza' Gemini-key prefix in web/src/lib/aiCredential.ts into a named
GEMINI_KEY_PREFIX constant and changed looksLikeApiKey from /^AIza/.test(value) to
value.startsWith(GEMINI_KEY_PREFIX) — semantically identical, no behavior change, explanatory
comment retained. Verified green: aiCredential.test.ts 8/8, npm run check (0 errors), npm run
test:unit 576/576, eslint on the changed file exit 0. Brief names no E2E specs (pure internal
refactor, single call site). Committed as 9febe719a2cb6e90f06b096ca7c79c1a9c79340b.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959573) · 2026-07-24
16:19:54 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### 31a54b17df0f — [P5][naming] `isWhite` reimplements a white check instead of reusing `WHITE_INK`, and diverges from `isDarkInk`'s approach

**Issue**

```ts
export const WHITE_INK = '#ffffff'; // line 18
export function isWhite(hex: string): boolean { // 91-94
  const v = hex.trim().toLowerCase();
  return v === '#ffffff' || v === '#fff' || v === 'white';
}
```

`isWhite` hardcodes `'#ffffff'` rather than referencing `WHITE_INK`, and its "vanishes against the
background" purpose is the light-mode mirror of `isDarkInk` — yet one is a hand-rolled string set
and the other a luminance test. The two conceptually-paired predicates share no implementation
strategy, so a reader can't infer one from the other.

**Fix**

Replaced the hardcoded `'#ffffff'` literal in `isWhite` with a reference to the neighboring
`WHITE_INK` constant, and added a one-line doc comment clarifying why it stays an exact/shorthand
string match rather than a luminance threshold (mirroring the note on `DARK_INK_LUMINANCE_MAX`).
Pure identity-preserving refactor — no behavior change.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074733950) · 2026-07-24
21:47:36 UTC</sub>

### c3a35d49fc14 — [P3][naming] `customColor` default duplicates the Purple swatch hex as a magic literal

**Issue**

```ts
export const PALETTE_COLORS = [{ hex: '#AB71E1', label: 'Purple' }, …];  // line 21
export const colors = $state({ …, customColor: '#AB71E1', … });          // line 62
```

`'#AB71E1'` is hand-copied as the custom-color seed. It also appears a third time in `TRIM_ORDER`
(line 53). Nothing links them, so the "custom color starts at the default swatch" intent is implicit
and drifts if Purple is re-tuned.

**Fix**

Changed `colors.customColor`'s default in `web/src/lib/state/colors.svelte.ts` from the hand-copied
literal `'#AB71E1'` to `PALETTE_COLORS[0].hex`, matching the pattern already used by
`activeSwatch`/`activeColor` two lines above so it can't silently drift if Purple's hex is re-tuned.
Type-check, unit tests (including `colors.svelte.test.ts`), and eslint on the changed file all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075037114) · 2026-07-24
22:23:57 UTC</sub>

### 0cdc01e6952b — [P4][naming] Comments point to `storage.js`, but the file is `storage.ts`

**Issue**

```ts
// storage layer recovers values evicted by the native WebView (see storage.js).   // strokeWidth:32
// hydrateDurableStorage in storage.js). A no-op visually when nothing changed.     // settings:248
```

There is no `storage.js` — the module is `web/src/lib/storage.ts` (and `tool.svelte.ts:97` correctly
says `storage.ts`). A reader following the reference greps for a file that doesn't exist. The repo
convention is TypeScript-only (`No plain .js source files in src/`), so `.js` here is stale.

**Fix**

Updated two stale comments in `strokeWidth.svelte.ts` and `settings.svelte.ts` that referenced a
nonexistent `storage.js` file, pointing them to the real `storage.ts` module — bringing them in line
with the existing correct reference in `tool.svelte.ts`.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075037337) · 2026-07-24
22:23:59 UTC</sub>

### 9783998e75af — [P4][naming] `section.icon === 'splotchy'` magic-string special-case repeated

**Issue**

The nav and hub renderers each branch on the literal `section.icon === 'splotchy'` to swap in
`<SplotchyIcon>` because the brand mark isn't in the `Icon` name union. The magic string
`'splotchy'` is repeated, and `sections.ts:37` uses it as an `icon` value that isn't actually a real
`IconName` for `<Icon>` — a latent inconsistency (the type says `IconName`, but this value is only
valid for the special-case path).

**Fix**

Extracted a `SectionIcon.svelte` wrapper that centralizes the `icon === 'splotchy'` branch (needed
because `Icon.svelte`'s glob and `CommonIconName` type both exclude splotchy), and replaced the two
duplicated if/else blocks in `ParentCenter.svelte` (tablet nav, phone hub) with
`<SectionIcon icon={section.icon} class="..." />`.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748519) · 2026-07-25
00:10:55 UTC</sub>

### 81c83b8c418e — [P5][naming] Magic `5` for the hidden admin unlock tap count

**Issue**

`handleVersionClick` compares `versionClicks < 5` with the threshold inlined. The number of taps
that reveals the admin link is a meaningful, testable constant buried as a literal; a test or a
future tweak has to hunt for it.

**Fix**

Extracted the hidden admin-unlock tap threshold in AboutSection.svelte into a module-level
`ADMIN_UNLOCK_TAPS = 5` constant and used it in the guard condition, replacing the bare literal so
the meaningful threshold is self-documenting. Behavior is unchanged; type-check, unit tests, and
eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076313364) · 2026-07-25
02:13:47 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### 86b98e560438 — [P4][naming] InstallBanner scatters unexplained magic numbers (auto-clear count, fly distance)

**Issue**

`STROKES_BEFORE_AUTO_CLEAR = 5` (16) is named, but the fly-out distance `120` is a bare literal
repeated three times (`fly({ y: 120 })` at 85, and `dy = … : 120` fallback at 57), and
`PARTING_MESSAGE_MS = 4000` sits beside a separate inline `duration: 550`/`300`/`420` set with no
shared motion vocabulary. The `120` in particular carries meaning ("slide fully below the fold") but
is duplicated as a raw number.

**Fix**

Added a named EXIT_FLY_Y = 120 constant grouped with InstallBanner's other motion constants and
replaced all three bare 120 literals (manual-dismiss exit, fallback dy, entrance fly) with it — pure
constant extraction, no behavioral change. Left the scattered single-use durations
(300/420/550/200/160) unnamed per the brief's scope note, since naming them wouldn't remove
duplication.

*Revised before approval:* Addressed all three review points on commit 1ef1774 in a new commit
777399785bab77a6439117c581cba496e3a11ca4: renamed EXIT_FLY_Y to BANNER_FLY_Y (it names both enter
and exit transitions, not only exit), named the remaining bare motion literals (BANNER_ENTER_MS=420,
BANNER_EXIT_MS=300, BANNER_SHRINK_EXIT_MS=550, PARTING_FADE_MS=200, HINT_FADE_MS=160) grouped under
their own comment beside PARTING_MESSAGE_MS, and deleted the finding's entry from docs/AUDIT.md via
pop.mjs --delete in the same commit. Verified: npm run check, npm run test:unit, npm run
test:scripts, eslint, and dprint check docs/AUDIT.md all pass.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The finding's entry was not deleted from `docs/AUDIT.md` — the commit touches only
  `web/src/lib/components/InstallBanner.svelte`, while the entry is still live at
  `docs/AUDIT.md:9-30` at HEAD (the two preceding fix commits, 6ee1fd4 and e195214, each removed
  their entry in the same commit). Delete the entry in this fix's commit so the finding isn't
  re-processed.
* `EXIT_FLY_Y` is used for the *entrance* transition at
  `web/src/lib/components/InstallBanner.svelte:87` (`in:fly={{ y: EXIT_FLY_Y, ... }}`), so the name
  misdescribes that site and welds the enter distance to the exit distance, which match only by
  coincidence. Rename to a neutral `BANNER_FLY_Y`, or keep separate constants for enter and exit.
* The finding's second clause — "group the banner's motion constants together" — is unimplemented:
  `duration: 550`, `300`, `420`, and the parting fade's `200` are still bare literals, and
  `EXIT_FLY_Y` was placed under the comment block that explains only the auto-clear/parting handoff.
  Name the durations and group them with `PARTING_MESSAGE_MS` under their own motion comment.

> [!NOTE]
> The first review point is the f389dd39 bug again; complying with it destroyed the
> `[P5][discoverability] SplotchyIcon` finding in this commit. The other two are real catches — the
> `EXIT_FLY_Y` naming one in particular is the reviewer noticing a constant welded to two call sites
> that match only by coincidence.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079052827) · 2026-07-25
15:27:06 UTC</sub>

## PR [\#545](https://github.com/KyleMit/Splotch/pull/545) — Audit burndown: 7 findings fixed, plus a driver data-loss fix (2026-07-25)

### c0cbff294c32 — [P3][naming] `ai_access_token` invite param is hardcoded despite an existing named constant

**Issue**

`buildInvites` embeds the query-parameter name as a literal:

```ts
url: `${origin}/?ai_access_token=${encodeURIComponent(token)}`,
```

but the very name the app *reads* that param under is already a named constant elsewhere
(`settings.svelte.ts:27`, `AI_ACCESS_TOKEN_PARAM = 'ai_access_token'`). The producer and consumer of
the same URL contract use different representations of the same string, so a rename on the consumer
side wouldn't be caught by the compiler and every issued invite link would silently stop working.
Grepping `ai_access_token` returns a scatter of literals across server, client, tests, and docs with
no single owner.

**Fix**

Extracted the invite query-param name into a new shared, side-effect-free
`web/src/lib/inviteLink.ts` so the server-side `buildInvites` producer and the client-side
`captureAiAccessTokenFromUrl` consumer now import the same `AI_ACCESS_TOKEN_PARAM` constant instead
of holding two independent representations of the URL contract. The emitted URL string and the param
read are unchanged; the test literals stay hardcoded so a value change fails a test rather than
being absorbed silently.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080834079) · 2026-07-25
22:26:20 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### d925f1acd356 — [P3][naming] `parentCenterWanted` is a one-way latch driven by an `$effect` that writes state — an obscure idiom for "mount on first open"

**Issue**

```js
let parentCenterWanted = $state(false);
$effect(() => {
  if (ui.parentCenterOpen) parentCenterWanted = true;
});
```

An `$effect` whose sole job is to latch another piece of `$state` to `true` and never reset it is a
subtle pattern (state-writing effects are usually a smell), and the name `parentCenterWanted`
doesn't convey "has ever been opened, so keep it mounted." The intent — "mount ParentCenter
permanently after its first open" — is only clear from the surrounding comment.

**Fix**

Renamed the local latch boolean in `web/src/routes/+page.svelte` from `parentCenterWanted` to
`parentCenterEverOpened` across its three references (declaration, `$effect` write, `{#if}` guard),
so the name states the "has ever been opened, keep it mounted" semantics that previously only the
comment above it conveyed. Pure identifier rename, no behavioral change. One out-of-scope note:
`docs/adrs/0049-idle-mount-boot-hidden-overlays.md:37` still names the old identifier — left alone
since the brief scoped the change to the three code references and ADRs are point-in-time records.

*Revised before approval:* Addressed the review point: ADR-0049's Parent Center paragraph now reads
"`parentCenter.open` latches `parentCenterEverOpened`", so both symbols match what exists in
`web/src/routes/+page.svelte` (the old text named `ui.parentCenterOpen`, which the modal-state
refactor had already retired, alongside the now-renamed latch). Amended into the finding's commit
rather than adding a follow-up, keeping one commit per finding; the reflow is dprint-clean
(`dprint check` passes) and `npm run check` is still 0 errors.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `docs/adrs/0049-idle-mount-boot-hidden-overlays.md:37` still names the old identifier
  ("`ui.parentCenterOpen` latches `parentCenterWanted`") — update it to `parentCenter.open` latches
  `parentCenterEverOpened` so the ADR's Parent Center paragraph points at symbols that exist in
  `web/src/routes/+page.svelte`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081731109) · 2026-07-26
03:04:33 UTC</sub>

### bd43e9a1f0bf — [P4][naming] `EFFECTIVE_DATE` is displayed under the label "Last updated" — the constant name and the UI text describe different concepts

**Issue**

```js
const EFFECTIVE_DATE = 'July 16, 2026';
...
<p class="updated">Last updated: {EFFECTIVE_DATE}</p>
```

"Effective date" and "last updated" are distinct legal concepts; naming the constant one thing and
labeling it the other invites confusion about which date this is meant to be, and the bump
instruction in the header comment says "Bump EFFECTIVE_DATE whenever the wording changes" — i.e.
it's really a last-updated date.

**Fix**

Renamed the `EFFECTIVE_DATE` constant to `LAST_UPDATED` in web/src/routes/privacy/+page.svelte
(comment, declaration, and template interpolation) so the identifier matches the rendered "Last
updated" label and its bump semantics; no other file referenced it, and the rendered output is
byte-identical. check, eslint, and unit tests all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081792066) · 2026-07-26
03:27:03 UTC</sub>

### f70b84f25d73 — [P1][naming] Name the drag-to-clear timing/animation magic numbers as constants

**Issue**

The file opens with a clean named-constants block (`HOLD_DURATION`, `MOVEMENT_THRESHOLD`, etc.), but
the teardown/animation code then hard-codes a second set of unnamed timings and transforms:

```ts
scheduleReset(() => { if (!isDragging) o.acceptZoneEl.style.display = 'none'; }, 250);
...
scheduleReset(() => { stopDrawSound(); }, 300);
scheduleReset(() => { ... }, 600);
scheduleReset(() => { ... }, 50);
node.style.transform = 'scale(0.8)';
```

`250`, `300`, `600`, `50`, and `0.8` are load-bearing (they must stay coordinated with the CSS
fly-out and page-turn durations) yet carry no name explaining what each governs, and the same
literal `scale(0.8)` appears twice. A future editor changing the page-turn CSS has no signal these
must move together.

**Fix**

Added four named constants (`ACCEPT_ZONE_HIDE_DELAY`, `DRAW_SOUND_STOP_DELAY`, `PAGE_TURN_DURATION`,
`EXIT_RETURN_DELAY`) to the existing constants block in `dragToClear.ts` and referenced them from
the `scheduleReset` calls in `finishDrag` and `playClearExit`, so the delays that must stay in sync
with ClearButton.svelte's CSS animations say what they are. Values are unchanged (250/300/600/650) —
naming only, no behaviour or markup touched.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082173609) · 2026-07-26
05:18:47 UTC</sub>

### 786627a9eb44 — [P4][naming] `dragToClear` computes the button center by hand instead of using rect width/height

**Issue**

```ts
const rect = node.getBoundingClientRect();
homeButtonCenter = {
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
};
```

The `(left+right)/2` / `(top+bottom)/2` form obscures that this is simply the rect center;
`rect.x + rect.width/2` reads as "center" at a glance and matches how `getAcceptRadius` reasons
about width/height.

**Fix**

Replaced the hand-rolled `(rect.left + rect.right) / 2` / `(rect.top + rect.bottom) / 2` center
computation in `dragToClear.ts`'s `onPointerDown` with the equivalent `rect.x + rect.width / 2` /
`rect.y + rect.height / 2` form for readability. Numerically identical; type-check, unit tests, and
eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082364713) · 2026-07-26
06:28:47 UTC</sub>

### c373fc5e0f9c — [P2][naming] `relativeLuminance` computes perceived brightness (BT.601 luma), not relative luminance

**Issue**

The function is named `relativeLuminance` but its own comment says "Perceived brightness … ITU-R
BT.601 weights," and it applies `0.299/0.587/0.114` directly to raw 8-bit channels with no sRGB
linearization. WCAG *relative luminance* is a different quantity (BT.709 weights
`0.2126/0.7152/0.0722` over gamma-expanded channels). The name promises a standard metric the code
doesn't implement; a future contributor reaching for "relative luminance" for a contrast-ratio calc
will get wrong numbers. It's imported by `colors.svelte.ts` (`isDarkInk`) too, so the misnomer
propagates.

**Fix**

Renamed the exported `relativeLuminance` helper in `web/src/lib/colorRing.ts` to
`perceivedBrightness` and updated its three call sites (`isLightColor`, `getRingColor`, and
`isDarkInk` in `colors.svelte.ts`), so the identifier matches the BT.601 luma the function actually
computes rather than claiming the WCAG metric. Pure rename — the math, the existing explanatory
comment, and the `*_LUMINANCE*` constant names are untouched.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082522874) · 2026-07-26
07:22:15 UTC</sub>

## PR [\#549](https://github.com/KyleMit/Splotch/pull/549) — Continue audit burndown with Codex (2026-07-26)

### 68b2724b313f — [P3][naming] `9×9` grid dimensions are unnamed magic across the module

**Issue**

The "9 families × 9 shades" invariant is asserted in the header comment and enforced only by the
literal shape of `COLOR_FAMILIES` and by the test. There is no `FAMILY_COUNT`/`SHADE_COUNT`
constant, so the r/c CSS trim classes in `ColorPicker.svelte` (`.r1..r9`, `.c1..c9`) are coupled to
a count that lives nowhere as a value.

**Fix**

Exported `SHADE_COUNT` and `FAMILY_COUNT`, used the shade invariant to build landscape rows, and
updated the tests to derive all dimension-dependent expectations from those constants. This makes
the nine-by-nine contract explicit without changing palette ordering or geometry.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/picker-trim.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/549#issuecomment-5083440676) · 2026-07-26
12:21:18 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### ef761143cfe9 — [P4][naming] `safeLocalStorage` / `safeRead` are an asymmetric name pair for a symmetric read/write guard

**Issue**

The write guard is named after the API (`safeLocalStorage`) and returns void; the read guard is
named after the action (`safeRead`) and returns a value. They're a matched pair (both wrap a
throwing localStorage op) but their names don't signal that, so a reader scanning the module doesn't
see them as counterparts.

**Fix**

Renamed the private storage guards to distinguish read and mutation operations, updating all
internal call sites while preserving behavior.

*Revised before approval:* Updated the ADR to reference `safeStorageMutation`, keeping its
storage-guard description aligned with the implementation.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Update `docs/adrs/0005-dual-layer-storage.md:38`, which still names the removed `safeLocalStorage`
  helper; it now leaves the ADR’s description of the current storage guard stale.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084376433) · 2026-07-26
16:32:51 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 1843044262ac — [P4][naming] `readImage` thunk field obscures that it also validates size/emptiness

**Issue**

`readImage: () => Promise<{ bytes; mimeType }>` reads as a pure getter, but each implementation also
enforces the 413 cap and the 400-empty/missing checks (lines 71-72, 85-92) and can throw
`error(...)`. The name hides that calling it is where request validation and rejection happen — a
maintainer moving the call (currently line 108, after authorization) could unknowingly change when a
413/400 is emitted relative to auth.

**Fix**

Renamed the deferred image thunk to `readValidatedImage` across both request shapes and its POST
call site. Its interface comment now makes the post-authorization 400/413 validation boundary
explicit while preserving the existing execution order.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084959003) · 2026-07-26
19:07:17 UTC</sub>

### 194457e8942b — [P3][naming] `refreshState` machine (`idle`/`activating`/`deferred`) is under-documented and the states aren't self-describing

**Issue**

The core update lifecycle is a 3-state variable named `refreshState` with values
`'idle' | 'activating' | 'deferred'`. The actual SW lifecycle (waiting → SKIP_WAITING posted →
`controllerchange` → reload, with a "reload owed but ink present" branch) maps onto these names
non-obviously: `'deferred'` means "controllerchange already happened but a reload is owed until the
canvas next goes empty," which no reader would infer from the name. The transitions are scattered
across the top-of-function guard and the nested closure.

**Fix**

Renamed the private lifecycle state to `updateReload` with `none`/`activating`/`owed` states and
documented every transition, making the deferred reload obligation explicit without changing
service-worker behavior or timing.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086068869) · 2026-07-27
00:10:58 UTC</sub>

### 190f2cf7204d — [P3][naming] `supportsOrientationLock` hides its tablet cutoff behind a bare `600`

**Issue**

```ts
return Math.min(window.screen.width, window.screen.height) < 600;
```

The `600` is the phone/tablet split (a device with a short side ≥ 600 CSS px is treated as a tablet
that owns its own orientation). It's a load-bearing heuristic explained at length in the doc comment
above, but the actual threshold is an unnamed literal buried in the return, so a reader scanning the
code (not the essay) sees a magic number and grepping for the tablet cutoff finds nothing.

**Fix**

Named the native phone/tablet boundary `TABLET_MIN_SIDE_PX` and used it in the short-side comparison
so the orientation-lock heuristic is easier to identify and change safely without altering behavior.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086079799) · 2026-07-27
00:13:07 UTC</sub>

### 3eb42c7a43a1 — [P3][naming] `haptics.ts` web-fallback vibrates for a magic `15` ms

**Issue**

```ts
navigator.vibrate?.(15);
```

`15` is the fallback vibration duration (ms) that's meant to approximate the native
`ImpactStyle.Medium` "click." It's undocumented and un-named; anyone tuning the feel has to know
this line exists.

**Fix**

Named the existing web fallback duration `WEB_IMPACT_MS` and documented that its 15 ms value
approximates native Medium impact, preserving both web and native behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086081195) · 2026-07-27
00:13:24 UTC</sub>

### 7165bddfb7a2 — [P4][naming] Amber overlay color and dim factor are unexplained literals

**Issue**

`overlayImage` hard-codes the 0.55 dim multiplier for the background and the `(255,210,0)`
deviant-pixel color inline (the trailing `// deviant bg pixel = amber` helps, but the numbers aren't
named), plus the SVG rect padding (`-3`/`+6`). These are presentation constants a reviewer may want
to tune, buried in a triple pixel loop.

**Fix**

Centralized overlay rendering values into descriptive constants while preserving the existing
dimming, amber highlighting, and rectangle geometry.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086087149) · 2026-07-27
00:14:37 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### cb3a25dceee3 — [P4][naming] Hotspot tile geometry uses bare `64` and a `*1000` key-packing with no named constants

**Issue**

```js
const k = Math.floor(Math.floor(p / w) / 64) * 1000 + Math.floor((p % w) / 64);
…
left: (k % 1000) * 64,
top: Math.floor(k / 1000) * 64,
```

`64` (tile size) and `1000` (row-stride packing multiplier) are magic literals repeated across pack
and unpack. The `*1000` scheme also silently breaks if a page ever exceeds 1000 tile-columns
(64000px). Nothing names or bounds this.

**Fix**

Added a named `HOTSPOT_TILE_PX = 64` constant and replaced the `*1000` decimal-packed numeric `Map`
key in `scoreNightHalo`'s hotspot tiling with a `${col},${row}` string key, eliminating the silent
overflow risk for wide pages while keeping the `hotspots` output shape and values identical.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — the "values identical" claim rests on tie-breaking, which is the easy
thing to get wrong here: `sort((a, b) => b[1] - a[1])` compares counts only, so tiles with equal
`haloPx` fall back to `Map` insertion order. Changing the key's *type* (number → string) preserves
that only because insertion order is driven by the unchanged pixel-scan loop, and `Array#sort` has
been stability-guaranteed since ES2019. Differential-tested old vs new over 600 randomized cases
(widths 64–2048, deliberate tie pressure from few distinct tiles) plus an explicit all-counts-equal
case — zero mismatches, tie order preserved.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086243345) · 2026-07-27
00:49:49 UTC</sub>

### dcfd789a9cf6 — [P4][naming] `alignToSource`'s edge-strength cutoff `60` is an unnamed inline literal

**Issue**

```js
if (srcE[i] > 60) {
  idx.push(i);
  wt.push(srcE[i]);
}
```

The gradient-magnitude threshold that decides which source pixels are "edges worth correlating" is a
bare `60`, sitting in a module whose other tuning values (`ALIGN_MAX`, `ALIGN_W`) *are* named
constants. It reads as noise next to them.

**Fix**

Extracted the bare `60` edge-strength threshold in `alignToSource` into a named `EDGE_MIN` constant,
matching the file's existing `ALIGN_MAX`/`ALIGN_W` convention — pure naming, no behavior change.
eslint, `npm run check`, and unit tests all pass; no dedicated test exists for this function's real
logic (it's mocked elsewhere), so verification was by inspection/diff as the brief notes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086303554) · 2026-07-27
01:04:05 UTC</sub>

### 461325de6cce — [P4][naming] `build-sheet.mjs` documents a spurious `--experimental-strip-types` invocation it doesn't need

**Issue**

```js
//   node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs
```

Those flags exist only to let Node import TypeScript. `build-sheet.mjs` imports
`scrapbook-chrome.mjs` and `./samples.mjs` — both plain ESM, no `.ts` anywhere. The flags are
cargo-culted from the sibling `gen.mjs:5`, which genuinely needs them (it imports
`geminiSafety.ts`). A reader copying the documented command runs `build-sheet.mjs` with meaningless
flags and may assume it depends on TS tooling it doesn't.

**Fix**

Replaced the stale
`node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs` header
comment in build-sheet.mjs with `node build-sheet.mjs [--artifact=<path>]`, since the script only
imports plain ESM and never needed the TS-stripping flags. Verified the script still runs standalone
and eslint/svelte-check/unit tests all pass.

*Revised before approval:* Fixed the two remaining spurious
--experimental-strip-types/--disable-warning invocations in
tools/asset-gen/crayon-brush-samples/README.md: line 31 (to-webp.mjs) dropped the flags entirely and
line 32 (build-sheet.mjs) now reads `node build-sheet.mjs`, both with the trailing comments
realigned; line 30 (gen.mjs) correctly kept the flags since it imports geminiSafety.ts. Verified
with dprint/prettier format:check — clean.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `tools/asset-gen/crayon-brush-samples/README.md:32` still documents
  `node --experimental-strip-types --disable-warning=ExperimentalWarning build-sheet.mjs` — the
  exact spurious invocation the finding is about, in the copy-paste block a reader is most likely to
  use. Change it to `node build-sheet.mjs` (keep the trailing
  `# rebuild the contact sheet index.html` comment aligned with the neighbouring lines).
* `tools/asset-gen/crayon-brush-samples/README.md:31` carries the same cargo-culted flags for
  `to-webp.mjs`, which imports only `sharp` and node builtins — no TypeScript. Drop the flags there
  too; line 30 (`gen.mjs`) is the only one that legitimately keeps them.

**Supervisor note** — a textbook straggler catch. The original fix corrected the script's own header
but left the README copy-paste block — the place a reader is *most* likely to take the command from
— still carrying the flags, so the finding's actual harm survived the fix that claimed to resolve
it. The reviewer also drew the right boundary rather than sweeping: `gen.mjs` keeps the flags
because it genuinely imports `geminiSafety.ts`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086964629) · 2026-07-27
03:27:01 UTC</sub>

### 8a364faca967 — [P4][naming] `keepClass` uses unexplained 99/96 buckets that disagree with the actual keep gate

**Issue**

```js
function keepClass(keep) {
  return keep >= 99 ? 'good' : keep >= 96 ? 'ok' : 'warn';
}
```

The two magic thresholds have no named constant or comment, and they silently disagree with the
pipeline's real bar: `KEEP_THRESHOLD = 0.92` (92%) in `lib/outline-match.mjs:38`. A page that
*passed* the gate at 93% renders as a red `warn` chip in the proof sheet, which reads as a failure
to a reviewer. Whether that stricter review bar is intentional is undocumented.

**Fix**

Named the two magic thresholds in `keepClass` as `KEEP_GOOD`/`KEEP_OK` and added a comment
clarifying that these review buckets are intentionally stricter than the 92% `KEEP_THRESHOLD` ship
gate in `lib/outline-match.mjs`, so a page can pass the pipeline but still render yellow/red on the
proof sheet. No behavior change; eslint passes on the file.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — worth an owner's glance, though it is comment-only so nothing is at risk
either way. The finding ended on an open *question* — "whether that stricter review bar is
intentional is undocumented" — and the fix resolved it by **asserting** intent rather than
establishing it. If the 99/96 buckets were in fact an oversight that should track
`KEEP_THRESHOLD = 0.92`, this change has now written that oversight down as deliberate design, which
is harder to notice later than the bare magic numbers were.

The naming half is unambiguously an improvement. Only the "intentionally stricter" claim rests on
nothing more than the implementer's reading, and you are the one who knows whether the proof sheet
is meant to be a stricter review lens than the ship gate.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086980603) · 2026-07-27
03:30:40 UTC</sub>

### 8d139c90350f — [P4][naming] `outline-targets` test still frames backslash handling as "Windows-style" after Windows support was dropped

**Issue**

```js
test('normalizes Windows-style target separators', async () => {
  await expect(resolveOutlineTargets(['nature\\ant-tall'], options())).resolves.toEqual([...]);
```

Per the root `CLAUDE.md`, Windows dev support was dropped (ADR-0062). The behavior under test —
normalizing a backslash a user typed into a target argument — may still be desirable, but naming it
"Windows-style separators" now points at a platform the project no longer supports, misleading a
reader into thinking this guards a live cross-platform concern.

**Fix**

Renamed the test `'normalizes Windows-style target separators'` to
`'normalizes backslash separators in target args'` in
tools/asset-gen/tests/outline-targets.test.mjs, since the behavior tolerates a stray backslash in a
hand-typed CLI target on any platform and is unrelated to Windows/OS path separators. No assertions
or implementation changed.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086996616) · 2026-07-27
03:34:21 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### d4a8315985c2 — [P3][naming] Brand palette hex values hardcoded in generators, duplicating the source of truth

**Issue**

`store-shots.mjs` hardcodes `{ purple:'#AB71E1', blue:'\#62A2E9', … }` and `gen-large-image.mjs`
hardcodes a `COLOR_MAP` of the same brand hexes, both re-stating the palette that already lives
authoritatively in `web/src/lib/state/colors.svelte.ts`. `model-eval` does this right — it imports
`PALETTE` from `lib/model-eval.mjs`. If a brand color is retuned, these generators silently paint
the old hue (and `pickColor` may fail to find a matching swatch).

**Fix**

Extracted the app palette into a dependency-free TypeScript module and preserved the existing app
and model-evaluation APIs. Store shots, feature graphics, social-image replay, trimming, and
model-evaluation inputs now derive their colors from that single source.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/palette-trim.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090032275) · 2026-07-27
10:09:55 UTC</sub>

### a1cb15ccfc4a — [P4][naming] Entry-point `main` functions aren't exported, hurting grepability/testability

**Issue**

Every driver defines a bare, unexported `async function main()` invoked by the `main().catch(...)`
epilogue. `analyze.mjs` alone gates its `main()` behind the
`import.meta.url === pathToFileURL(process.argv[1]).href` guard (line 518) and exports
`analyze`/`renderReport` for reuse; the drivers do neither, so importing one for a test (or reusing
`getWebviewPage`/`findWebviewSocket` from android.mjs) forces a full run. The identical local name
`main` across six files also means a symbol search can't distinguish them.

**Fix**

Guarded all remaining profiling CLIs so imports stay inert, exported the Android inspection helpers,
and added a regression test that blocks driver startup on import.

*Revised before approval:* Renamed and exported distinct entry functions for all six profiling
drivers. Added direct-entry guard coverage for the four newly guarded drivers while retaining the
Android import-safety regression.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scenario.mjs`, `mount.mjs`, `ios.mjs`, `android.mjs`, and `replay-scenario.mjs` still define
  unexported generic `main` functions, so the change fixes import side effects but leaves the
  finding’s entry-point testability and symbol-search ambiguity unresolved; give all six drivers
  distinct exported entry functions, including renaming `undo-scenarios.mjs`’s exported `main`.
* The new test covers only Android’s import path; no regression test exercises the changed
  direct-entry branch for `scenario.mjs`, `mount.mjs`, `ios.mjs`, or `android.mjs`, so these scripts
  could stop invoking their profiling flow while the suite remains green.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091608915) · 2026-07-27
13:00:42 UTC</sub>

### b4073d53baca — [P3][naming] `hasCommand` uses `which`, whose absence is silently treated as "command missing"

**Issue**

```js
export const hasCommand = (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
```

If `which` itself isn't installed (some minimal Linux images ship without it), `spawnSync` errors
and `.status` is `null !== 0`, so *every* command probe reports "missing" — cascading into
misleading "install X" failures in `android-setup.mjs`/`check-netlify-cli.mjs`. The POSIX-guaranteed
builtin is `command -v`.

**Fix**

Updated `hasCommand` to use POSIX `sh` and its `command -v` builtin, passing the command name as a
positional argument to preserve safe boolean detection without relying on external `which`. Existing
missing-command behavior remains unchanged.

*Revised before approval:* Added focused `hasCommand` regression coverage using a temporary `PATH`
that contains only `sh` and a resolvable `node` executable, with no `which`. The test verifies both
successful discovery and unchanged rejection of a missing command.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Add regression coverage in `scripts/tests/utils.test.mjs` that proves `hasCommand` finds a
  resolvable executable and rejects a missing one when `PATH` contains `sh` and the executable but
  no `which`; the behavior that motivated this fix is currently untested.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092446566) · 2026-07-27
14:14:06 UTC</sub>

### 99d55d10c9a8 — [P4][naming] `chromiumExecutablePath` uses `slice(9)` and a duplicated `/opt/pw-browsers` literal

**Issue**

`Number(b.slice(9))` strips the literal `"chromium-"` (9 chars) — a magic length tied to a string
that appears nowhere near it, so a rename of the prefix breaks the sort silently. The browsers-path
default `'/opt/pw-browsers'` is also hardcoded here and again as the `chromium-1194` prefix in
`model-eval.mjs`, two independent copies of the same cloud path.

**Fix**

Replaced the Chromium revision sort’s hard-coded prefix offset with the named local prefix length,
preserving its existing candidate selection behavior.

*Revised before approval:* Formatted the Chromium fallback sort expression so the committed refactor
satisfies the repository formatting gate.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092453299) · 2026-07-27
14:14:43 UTC</sub>

### bef94bd7550a — [P4][naming] `REGISTRY.icons.count` is `null` while siblings use `() => null` — inconsistent contract

**Issue**

Every registry entry's `count` is a function except `icons`, where it's the bare value `null`.
`card()` only survives this via a `typeof meta.count === 'function'` guard — but the type of a
registry field silently varying (function vs null) is a loose contract that invites a future
`meta.count(files)` call to crash.

**Fix**

Normalized the icons registry count to a callable and simplified card rendering to invoke the shared
count contract directly, preserving generated output.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092630585) · 2026-07-27
14:30:38 UTC</sub>
