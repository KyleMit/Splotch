# Audit comments — Readability

41 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `425bd2e81d9f` — [P1][readability] Replace the ~9 inline `{ x: number; y: number }` annotations with a named `Point` type

**Issue**

The engine's central data shape — a point — is spelled out as an anonymous
`{ x: number; y: number }` at least nine times across signatures and fields:

```ts
function screenToPaper(pt: { x: number; y: number }): { x: number; y: number } { ... }
function strokeSmoothSegments(ps: PointerState, points: { x: number; y: number }[]) { ... }
pendingPoints: { x: number; y: number }[];
```

`crayonBrush.ts` already defines `CrayonPoint { x; y }` for the same concept, so the vocabulary is
fragmented. Inline object types add noise to every signature and make "find all the places that pass
points" ungreppable.

**Fix**

refactor(drawing): name the point shape as a shared Point type

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071306809) · 2026-07-24
15:04:16 UTC</sub>

### `98e98dc176f5` — [readability] dedupe the command-replay loop in `repaintAll`

**Issue**

```ts
for (const cmd of pendingCommands) for (const op of cmd.ops) renderOp(target, op);
for (const cmd of deferredCommands) for (const op of cmd.ops) renderOp(target, op);
if (activeCommand) { for (const op of activeCommand.ops) renderOp(target, op); }
```

The same "replay these commands' ops through `renderOp`" appears three times, and the identical
double-loop is also implicit elsewhere. Order matters (pending → deferred → active), so the intent
is worth naming.

**Fix**

refactor(drawing): dedupe the command-replay loop in repaintAll

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071308739) · 2026-07-24
15:04:24 UTC</sub>

### `e104cc0cabc9` — [refactor] unify paper-rect vocabulary in undoHistory.ts / engine.ts

**Issue**

`PatchRect { x; y; w; h }` is the named paper-rect type, yet `activeCrayonRasterRects` returns an
inline `{ x: number; y: number; w: number; h: number }[]` for the same idea, and the engine iterates
it as `r.x, r.y, r.w, r.h`. The engine also passes rects to `blitPaperRect(target, x, y, w, h)`
positionally, so three representations of "a paper rectangle" coexist.

**Fix**

refactor(drawing): pass PatchRect to blitPaperRect and type activeCrayonRasterRects

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309265) · 2026-07-24
15:04:27 UTC</sub>

### `755cedfd7e8d` — [P5] extract `paperIsSized()` helper in engine.ts

**Issue**

```ts
paperSize: () => paper.pxW > 0 && paper.pxH > 0 ? { width: paper.pxW, height: paper.pxH } : null,
sheetBounds: () => (paper.pxW > 0 && paper.pxH > 0 ? sheetBoundsPaper() : null),
```

The "paper has been sized yet" predicate is inlined twice with the raw comparison, obscuring intent.

**Fix**

refactor(drawing): extract paperIsSized helper for the magic-brush host wiring

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309407) · 2026-07-24
15:04:28 UTC</sub>

### `c2df8adb4c79` — [readability] Split `aiPreview.ts` — pinch-zoom engine doesn't belong in a "preview loader" file

**Issue**

`aiPreview.ts` holds two unrelated concerns: `createAiPreviewLoader` (a load-race deduper, lines
1-23) and a full DOM-free pinch-zoom gesture accumulator with its geometry helpers and clamp math
(lines 25-163). They share nothing. Worse for discoverability, the Svelte **action**
`pinchZoom.svelte.ts` reaches into `$lib/components/aiPreview` for `createPinchZoom`/`Point` —
gesture math imported from a file named after image previews. Someone looking for the zoom engine
won't find it; someone reading the loader wades through 140 lines of unrelated geometry.

**Fix**

refactor(drawing): move the pinch-zoom engine into pinchZoom.svelte.ts

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071310144) · 2026-07-24
15:04:33 UTC</sub>

### `a26e102c1c40` — [P3][readability] Name the opaque progress-curve constants in AiDial's `loop`

**Issue**

`loop()` is dense with unexplained literals: `0.92 * fillCurve(...)`,
`0.92 + 0.06 * (1 - Math.exp(-over / 5000))`, `progress += (1 - progress) * 0.16`,
`progress >= 0.999`, and `fillCurve = t => 0.55 * t + 0.45 * (…)`. The reader can't tell that `0.92`
is "the ceiling the estimate phase creeps toward," `0.06` is "the extra headroom the overrun phase
adds (→0.98)," `5000` is the overrun time-constant in ms, and `0.16` is the reveal-ramp rate. This
is the mechanism most likely to be tuned and most likely to be broken by a stray edit.

**Fix**

Extracted the six opaque progress-curve literals in web/src/lib/components/aiDialProgress.ts into
named module-level constants (ESTIMATE_CEILING=0.92, OVERRUN_HEADROOM=0.06, OVERRUN_TAU_MS=5000,
REVEAL_RATE=0.16, REVEAL_EPSILON=0.999, LINEAR_MIX=0.55) and referenced them at their original call
sites; the paired ease weight became 1 - LINEAR_MIX. Pure rename — numeric output of tick() is
unchanged and the exported API is untouched. AiDial.svelte left as-is per the brief. All acceptance
commands pass: npm run check (0 errors), vitest aiDialProgress.test.ts (4/4 unmodified), full
test:unit (576/576), eslint clean on the changed file, and playwright ai-timer.spec.ts (3/3).

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959027) · 2026-07-24
16:19:50 UTC</sub>

### `02b3daecf96c` — [P4][readability] AiConfetti's deterministic-hash constants are wholly opaque

**Issue**

The confetti field is generated from a pile of unexplained literals: `length: 38`, the per-property
seeds `12.9, 57.3, 31.7, 45.1, 8.3, 77.7, 51.3, 27.1`, and the shaping constants (`2 + r*96`,
`-r*9`, `5.5 + r*4.5`, `(16 + r*24)`, `6 + r*6`, `r < 0.4`). The `Math.sin((i+1)*seed) * 10000`
fract-hash is a non-obvious idiom. The WHY comment (deterministic for SSR) is good, but the
constants themselves — count, ranges — are magic. This is decorative, hence low priority, but the
block is unreadable at a glance.

**Fix**

Applied the naming-only refactor to web/src/lib/components/AiConfetti.svelte per the brief:
extracted magic numbers into named constants (CONFETTI_COUNT, HASH_SEED map,
LEFT_MIN/LEFT_SPAN-style min/span pairs, ROUND_FRACTION) and hoisted the Math.sin fract-hash into a
named hashUnit(i, seed) helper. Every numeric literal and each property's seed is unchanged, so the
confetti field is byte-for-byte identical — a pure rename. Preserved the SSR/hydration WHY comment
and left the <style> block untouched.

Acceptance commands all green: npm run check (0 errors/0 warnings), npm run format:check (Prettier +
dprint clean), npx eslint on the changed file (exit 0), npm run test:unit (577 passed). No E2E gate
— the brief confirmed no spec references AiConfetti and the refactor is value-preserving by
construction.

Commit: refactor(ai): name AiConfetti's deterministic-hash constants and hoist hashUnit SHA:
90263899ac8552692a496ff0dd974b1b543f2208

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959797) · 2026-07-24
16:19:56 UTC</sub>

### `5aa8b3df2387` — [P4][readability] `AiImageResult` magic aspect/blur constants

**Issue**

`let imgAspect = $state(4 / 3);` (line 20) and `const previewBlur = $derived(`${2 + 16 * (1 -
progress)}px`);` (line 47) carry unexplained literals: `4/3` is the seed aspect, `2` is the min blur
(fully revealed), `16` is the extra blur at zero progress. The blur math in particular reads as
noise without knowing it maps `progress 0→1` to `18px→2px`.

**Fix**

Named the three magic literals in web/src/lib/components/AiImageResult.svelte (DEFAULT_ASPECT = 4/3,
MIN_BLUR_PX = 2, MAX_EXTRA_BLUR_PX = 16) and swapped them into imgAspect's seed and the previewBlur
formula. Pure find-and-name refactor — computed values are bit-for-bit identical. All acceptance
commands pass: npm run check (0 errors), npm run test:unit (577 passed), npx eslint on the changed
file (clean), and npm run test:e2e -- ai-timer (3 passed, including the reveal test). Committed as
997ea9575434c5070791a50752e45cbb8d17d161.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959904) · 2026-07-24
16:19:57 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### b96b28d85e2f — [P4][readability] `navigator.onLine !== false` is a confusing double-negative

**Issue**

```ts
network.online = navigator.onLine !== false;
```

`navigator.onLine` is already a boolean; `!== false` treats a hypothetical `undefined` as online.
The intent ("assume online unless the browser says otherwise") is defensible but the expression
reads as an accidental double negative and invites a "why not just `navigator.onLine`?" review
comment every time.

**Fix**

Replaced the `navigator.onLine !== false` double-negative in web/src/lib/state/network.svelte.ts
with `navigator.onLine ?? true`, adding a one-line comment explaining the nullish fallback for old
WebViews. Behavior is identical for all real (`true`/`false`) and hypothetical (`undefined`) values,
but the intent now reads directly instead of via double-negation.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074733581) · 2026-07-24
21:47:34 UTC</sub>

### 1eb6514a65ac — [P5][readability] `SETTLED_IN_STROKES` is re-aliased by every consumer instead of used directly

**Issue**

`canvas.svelte.ts` exports `SETTLED_IN_STROKES = 3` as a deliberately shared threshold, but both
consumers immediately re-alias it to a local constant (`STROKES_BEFORE_PROMPT`,
`STROKES_BEFORE_SW_REGISTER`). The aliasing obscures that the two features intentionally share one
signal (the whole point of the exported constant, per its comment) — a reader sees two
differently-named thresholds and has to trace both back to confirm they're the same number.

**Fix**

Removed the two local re-aliases of SETTLED_IN_STROKES (InstallBanner's STROKES_BEFORE_PROMPT and
updates.ts's exported STROKES_BEFORE_SW_REGISTER) so both consumers reference the shared constant
directly; moved the explanatory "why" comments to their new usage sites (the visible derived in
InstallBanner, the gate effect in +page.svelte) and updated the stale symbol name in
pwa-registration.spec.ts's comment. Behavior is unchanged — both gates still trip at the 3rd stroke.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Straggler comment referencing the deleted symbol:
  docs/adrs/assets/0039-install-banner/generate-screenshots.mjs:128 still reads "// The banner only
  appears after STROKES_BEFORE_PROMPT committed strokes." — that constant no longer exists anywhere
  in the repo after this commit. The file is a live, hand-run generator (its header says to re-run
  it when the banner changes) linked from ADR-0039:114, not a frozen artifact. The author fixed the
  identical stale-comment case in web/tests/pwa-registration.spec.ts, so comment references were in
  scope; the sweep just stopped at web/. Since the original finding is entirely about a reader being
  able to trace a threshold name back to its source, a name that now traces to nothing reintroduces
  the defect elsewhere. Fix: update the comment to name SETTLED_IN_STROKES (or drop the symbol
  name).

**E2E gate** — `tests/pwa-registration.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074734117) · 2026-07-24
21:47:36 UTC</sub>

### 2b3abc1db08b — [P5][readability] `.github-link` overrides shared spacing with `!important`

**Issue**

`.github-link { margin: 12px 0 !important; }` uses `!important` solely to beat the earlier
`.about-links p { margin: 0 0 8px 0 }` (`:94-96`). `!important` in scoped component CSS to override
a sibling rule in the *same* file is a specificity smell — the two rules fight instead of being
ordered/structured to cooperate.

**Fix**

Changed `.github-link`'s selector to `.about-links > p.github-link` (specificity (0,2,1)) and
dropped `!important`, so it now beats the sibling `.about-links p` rule (0,1,1) on specificity alone
rather than forcing the win. Rendered margins are unchanged (12px on the GitHub link row, 8px
elsewhere).

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076313446) · 2026-07-25
02:13:48 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### 8aaed4cf6fdf — [P4][readability] ActionsPanel duplicates the drawer transition list verbatim across two rules

**Issue**

The four-line
`transition: grid-template-columns 0.28s ease, grid-template-rows 0.28s ease, opacity var(--duration-base) ease, margin 0.28s ease;`
is written in the base `.actions-drawer` (426-431) and again in the closed-state rule (462-467,
which only adds a `visibility 0s 0.28s` segment). The `0.28s` literal appears four+ times and is
flagged "keep in sync with ACTION_BUTTON_GAP"-style comments elsewhere. Editing the drawer timing
means touching multiple identical blocks.

**Fix**

Introduced a local `--drawer-collapse: 0.28s` custom property on `.actions-drawer` in
ActionsPanel.svelte and replaced all four repeated `0.28s` literals (including the `visibility`
transition-delay) with `var(--drawer-collapse)`, following the file's existing local-custom-property
convention (`--drawer-axis-rot`/`--drawer-open-rot`) rather than folding it into the unrelated
`--duration-base` token.

*Revised before approval:* Hoisted the shared four-segment transition list into a new
`--drawer-transition` custom property on `.actions-drawer` (composed from the earlier
`--drawer-collapse` and `--duration-base`). The base rule now uses
`transition: var(--drawer-transition);` and the closed rule uses
`transition: var(--drawer-transition), visibility 0s var(--drawer-collapse);`, so the closed rule
only appends its `visibility` segment instead of restating the list. Verified: `npm run check` (0
errors), eslint clean, `npm run test:unit` (579 passed), and
`npx playwright test tests/flows.spec.ts` (43/43 passed) — drawer open/close animation unchanged in
both orientations. Committed as 384c28a3a6a85358f7b8ace901d6e4dbed77abd8 on top of the prior fix
commit 17139c03e18254ef689db1a2d4780c0ddc2a25a0.

**Adversarial review** — reviewer caught the following; addressed before approval:

* web/src/lib/components/ActionsPanel.svelte:425-429 and 460-466 still restate the four-segment
  transition list verbatim — only the `0.28s` literal was deduped, not the list the finding is
  titled after. Hoist the shared segments into a second local custom property (e.g.
  `--drawer-transition: grid-template-columns var(--drawer-collapse) ease, grid-template-rows var(--drawer-collapse) ease, opacity var(--duration-base) ease, margin var(--drawer-collapse) ease;`
  on `.actions-drawer`), then use `transition: var(--drawer-transition);` in the base rule and
  `transition: var(--drawer-transition), visibility 0s var(--drawer-collapse);` in the closed rule,
  so the closed rule only appends the `visibility` segment.

**E2E gate** — `tests/flows.spec.ts`

> [!NOTE]
> This is one of the three findings the first canary destroyed, now reprocessed correctly. The
> review round here is what the reviewer is supposed to do — it caught that the fix deduped the
> literal but not the transition *list* the finding was named after — and it did **not** raise the
> backlog-entry excision, which is the f389dd39 prompt fix holding.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079283415) · 2026-07-25
16:34:28 UTC</sub>

### 13ff95a6915f — [P5][readability] Slider's snap-band width is an unexplained-magnitude magic fraction

**Issue**

`const snapBand = $derived((max - min) * 0.045);` — the `0.045` ("~4.5% of the track") is a bare
literal. It's commented, but as a tuning constant that governs detent feel it would be clearer and
more grep-able as a named constant, especially since Slider is a reusable primitive backing multiple
settings.

**Fix**

Extracted the bare `0.045` snap-band literal in `Slider.svelte` into a module-scope
`SNAP_BAND_FRACTION` constant (placed above `$props()` as the brief specified), moving the existing
explanatory comment along with it. Pure rename/extraction, no behavioral change — check, unit tests,
and eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079284263) · 2026-07-25
16:34:42 UTC</sub>

## PR [\#546](https://github.com/KyleMit/Splotch/pull/546) — Audit burndown: clear the staged docs/AUDIT.md backlog (2026-07-25)

### 22d5609bacb2 — [P4][readability] Bearer-header parsing uses inline magic strings in `requireSession`

**Issue**

```ts
const auth = request.headers.get('authorization') ?? '';
const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
```

`'Bearer '` appears twice (prefix test and slice length) and `'authorization'` is a bare header
name. The `slice('Bearer '.length)` idiom re-derives the prefix length from the literal, so the two
copies must stay identical. This is exactly the kind of auth-transport detail the API skill flags as
shared across doors, yet it lives as loose literals in one route.

**Fix**

Extracted the duplicated `Bearer` prefix-parsing logic out of `requireSession` into a new
`bearerToken(request)` helper in `web/src/lib/server/admin.ts` (the shared core between the cookie
and bearer admin auth doors), and updated `/api/admin/tokens/+server.ts` to use it. `npm run check`,
`npm run test:api:smoke`, `npm run test:unit`, and eslint on the changed files all pass; no
behavioral change.

*Revised before approval:* Added a `describe('bearerToken', ...)` block to
web/src/lib/server/admin.test.ts covering the four required cases: absent Authorization header → '',
wrong scheme or lowercase 'bearer ' → '', 'Bearer' with no trailing space → '', and 'Bearer tok ' →
'tok' (whitespace trimmed). Verified with npm run check, npm run test:unit (660 tests passing, up
from 656), npm run test:api:smoke, and eslint — all green. Committed as 7fda068 on branch
claude/burn-down-audit-skill-cb9nv1, on top of c15601268f98fecb990e3ed7c0f839ca3fd3035e.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `bearerToken` is the only export in `web/src/lib/server/admin.ts` with no `describe` block in the
  colocated `web/src/lib/server/admin.test.ts` (every sibling — `sessionToken`, `secretMatches`,
  `verifyAdminSecret`, `verifySessionToken`, `beginAdminLogin`, `buildInvites` — has one). Add one
  pinning the contract this helper now owns for every future bearer door: absent header → '', wrong
  scheme / lowercase `bearer` → '', `Bearer` with no trailing space → '', and `Bearer  tok` → `tok`.
  The `scripts/api-smoke.mjs` cases only cover a valid session and `Bearer deadbeef`, and that
  script is not part of the fast unit suite.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081114203) · 2026-07-25
23:58:26 UTC</sub>

### fd8ad910e3db — [P5][readability] `secretMatches` name doesn't convey it's a constant-time compare, and its two callers restate the intent

**Issue**

`secretMatches(provided, expected)` reads like an ordinary equality check; the constant-time
property — the entire reason the function exists rather than `a === b` — lives only in a comment
(`:26-28`). A future caller comparing something non-secret might reasonably reuse it (harmless) or,
worse, someone might "simplify" `verifySessionToken`/`verifyAdminSecret` to `===` not realizing the
timing guarantee is load-bearing (the server-api rule mandates `timingSafeEqual`). The two one-line
wrappers `verifyAdminSecret`/`verifySessionToken` (`:38-45`) add little beyond binding an env read.

**Fix**

Renamed `secretMatches` to `constantTimeEqual` in web/src/lib/server/admin.ts (definition + 2 call
sites) and web/src/lib/server/admin.test.ts (import, describe block, and all assertions), so the
constant-time guarantee is visible in the name rather than only in the comment above it. Pure
rename, no logic changes; check, unit tests, and eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081115941) · 2026-07-25
23:59:01 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### ba9b6fbf781e — [P5][readability] Font-warm and wake-lock rely on unnamed magic strings (`'1em "Quicksand Variable"'`, `'screen'`)

**Issue**

The layout warms the font with the literal `document.fonts.load('1em "Quicksand Variable"')` — the
family name is duplicated from the `@fontsource` import and the CSS `font-family` with no shared
constant, so a font swap must find all copies. Similarly `navigator.wakeLock.request('screen')` uses
the bare API string. Minor, but these are the kind of literals that silently rot.

**Fix**

Extracted the `'Quicksand Variable'` magic string in `+layout.svelte`'s font-warm call into a new
`QUICKSAND_FONT_FAMILY` constant in `web/src/lib/fonts.ts`, leaving the three CSS font-family sites
untouched per the brief's scoping. The runtime string passed to `document.fonts.load` is
byte-identical, so no behavior change; check, unit tests, and eslint all pass.

*Revised before approval:* Addressed the review feedback on 9834f1f: added a --font-family design
token (tokens.ts, sourced from the existing QUICKSAND_FONT_FAMILY JS constant) emitted into
tokens.css beside --font-mono, and pointed app.css, ErrorScreen.svelte, and AdminConsole.svelte at
var(--font-family) instead of hand-copied stacks (ErrorScreen keeps its var(--token, fallback) idiom
for the crash-screen case). Also added allowImportingTsExtensions to web/tsconfig.json, needed
because tokens.ts is executed directly by Node (gen:tokens) and requires the explicit .ts specifier
on its new relative import. Verified: npm run check, npm run test:unit, eslint on all touched files,
npm run gen:tokens:check (no drift), and npm run lint:tokens all pass; grep for "Quicksand Variable"
now shows only the generated tokens.css, the intentional ErrorScreen fallback, and fonts.ts as the
single source. Committed as dea32ad698fb25ea5a78755b491b38a3b5f6f174.

*Revised before approval:* Addressed the review feedback on dea32ad: added an explicit fontFamily
row to /dev/design's type scale (web/src/routes/dev/design/+page.svelte, beside
fontMono/fontWeightSemibold, since it's not caught by the fontSizeKeys prefix filter), and added
--font-family to the Type row of the design skill's token vocabulary table
(.ruler/skills/design/SKILL.md), regenerating .claude/skills/design/SKILL.md and
.agents/skills/design/SKILL.md via npm run ruler:apply. Verified: npm run check, npm run test:unit,
eslint on the changed page, and npm run format:check (Prettier + dprint) all pass. Committed as
66c2c26680c3d1a7e7a0852d34658e5affcaefa7.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `QUICKSAND_FONT_FAMILY` in `web/src/lib/fonts.ts` has exactly one consumer, so nothing was
  de-duplicated: `'Quicksand Variable'` is still hand-copied in `web/src/app.css:30`,
  `web/src/lib/components/ErrorScreen.svelte:31`, and
  `web/src/lib/components/admin/AdminConsole.svelte:339`. The finding's verification is "grep for
  the family string shows a single source", and the count is unchanged by this commit.
* Name the family once on the CSS side too, following the existing `--font-mono` idiom: add a
  `--font-family` (sans stack) token to `web/src/tokens.css` beside `--font-mono:44`, point
  `web/src/app.css:29-36` at it, and replace the hand-copied stacks in `ErrorScreen.svelte:31` and
  `AdminConsole.svelte:339` with `var(--font-family)` (ErrorScreen uses `var(--token, fallback)`
  form elsewhere for the crash-screen case — keep that shape there).
* The new `fontFamily` token in `scale` is not rendered anywhere on `/dev/design`
  (`web/src/routes/dev/design/+page.svelte`), which states "If it's not on this page, it's not part
  of the visual language" and gives `fontMono` and `fontWeightSemibold` their own explicit rows —
  add a matching row for `fontFamily` beside them (the prefix-filtered `fontSizeKeys` list does not
  pick it up).
* The design skill's token vocabulary table (`.ruler/skills/design/SKILL.md`, the `Type` row) lists
  `--font-mono` and `--font-weight-semibold` but not the newly added `--font-family` — add it there
  and regenerate with `npm run ruler:apply` so the generated `.claude/`/`.agents/` copies match.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082091567) · 2026-07-26
04:52:47 UTC</sub>

### f2d506543486 — [P4][readability] Repeated `e.preventDefault(); e.stopPropagation();` tail in every `dragToClear` handler

**Issue**

Each of the four pointer handlers ends with the same two-line
`e.preventDefault(); e.stopPropagation();`. It's noise repeated verbatim four times, and because
it's the *last* thing each handler does, an early `return` in a future edit silently skips it (the
multi-click early return at line 63-64 already does, which is intended but non-obvious).

**Fix**

Extracted a `suppress(e)` helper in `dragToClear.ts` and replaced the four repeated
`preventDefault()`/`stopPropagation()` pairs with calls to it, leaving the `onPointerDown` early
return (multi-tap skip) untouched. Type-check, targeted unit tests, and eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082334772) · 2026-07-26
06:17:52 UTC</sub>

### a03c3e276a46 — [P4][readability] `pinchZoom.onPointerUp` runs even when the gesture is disabled

**Issue**

`onPointerDown` and `onPointerMove` both early-return on `!getOptions().enabled`, but `onPointerUp`
unconditionally calls `zoom.up(e.pointerId)`, `releasePointerCapture`, and
`apply(getOptions().target)`. When `enabled` is false the accumulator never received a matching
`down`, so `zoom.up` is a no-op-ish call, but the asymmetry (two guarded handlers, one unguarded)
reads as an oversight and forces the reader to confirm it's harmless. The `enabled` check is missing
where the other two have it.

**Fix**

Added a one-line comment above `onPointerUp` in pinchZoom.svelte.ts explaining that it's
deliberately unguarded by `enabled` so an in-progress pointer still releases its capture if
`enabled` flips false mid-gesture; no behavior changed. type-check, unit tests, and eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082365379) · 2026-07-26
06:29:02 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### d8b86096ee9e — [P3][readability] `readString`'s generic return type `string | T` is needlessly clever for a two-shape API

**Issue**

```ts
export function readString<T extends string | null>(key: string, fallback: T): string | T;
```

The only two real uses are "fallback is a string" (→ `string`) and "fallback is null" (→
`string | null`), yet the signature encodes this with a generic constraint plus a `string | T` union
that reads awkwardly and is easy to get subtly wrong when editing. It's more machinery than the two
cases warrant.

**Fix**

Replaced `readString`’s generic signature with explicit string- and null-fallback overloads while
preserving `StorageKey` and the implementation body. This makes each supported return type clear
without changing runtime behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084375958) · 2026-07-26
16:32:44 UTC</sub>

### d92bb595a78b — [P4][readability] `cachedHandle`'s tri-state `undefined | null | handle` overloads two "nothing" values

**Issue**

`undefined = not read yet`, `null = read, none set`, handle = set. The distinction is load-bearing
(line 45's `cachedHandle !== undefined` is the "have I hit IndexedDB this session" gate) but relies
on the reader remembering which nullish value means which. This is exactly the kind of
non-self-documenting async cache the audit flags.

**Fix**

Separated handle-load state from the nullable cached directory handle so resolved no-folder,
lookup-error, choose, and clear paths all preserve the session cache. Strengthened the two-save test
to assert exactly one handle-store read.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084376854) · 2026-07-26
16:32:58 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 82b87afe4d59 — [P4][readability] Rename the terse `str`/`num` coercers in csp-report

**Issue**

```ts
function str(value: unknown): string { ... }   // also length-caps to MAX_FIELD_LENGTH
function num(value: unknown): number | null { ... }
```

`str` does more than its name says (it also truncates), and both are one-off abbreviations. In the
mappers they read as `str(report['blocked-uri'])` — the truncation side-effect is invisible at the
call site.

**Fix**

Renamed the CSP coercion helpers and all payload-mapping call sites so capped string normalization
and finite-number validation are explicit while preserving behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084901281) · 2026-07-26
18:51:43 UTC</sub>

### b685c38da067 — [P4][readability] Redundant `typeof style === 'string'` on an already-`string | null` value

**Issue**

`source.style` is typed `string | null` (interface `GenerationRequest`, line 42). Line 114 aliases
it `const style = source.style;`, then line 129 re-checks its type:

```ts
style: typeof style === 'string' ? style : null,
```

The guard can never take the `null`-producing branch differently than `style` already is — it's dead
narrowing that implies `style` might be some other type. (`buildPromptForStyle(style, …)` at 117
also accepts `unknown`, further hiding that `style` is already narrow.)

**Fix**

Passed the nullable style directly into managed-token usage recording, preserving its existing
string-or-null behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084909748) · 2026-07-26
18:53:56 UTC</sub>

### 8c8a7a6c4273 — [P5][readability] `requireEffectiveGenerationKey` reads as a getter but throws

**Issue**

`requireEffectiveGenerationKey(authorization): string` throws
`error(500, 'Server is missing GEMINI_API_KEY')` when the managed key is absent. The two-step API —
`authorizeGenerationRequest` then a separate `requireEffectiveGenerationKey` at the call site
(generate-image:115) — splits "am I authorized" from "is the server actually configured to serve
me," which is easy to forget to call. The name is fine (`require…` implies it may throw), but the
split responsibility is the smell: authorization succeeds returning a managed result whose
`effectiveKey` may be `undefined`, deferring the real failure to a second call.

**Fix**

Managed authorization now guarantees a configured provider key only after its existing token and
rate-limit checks. The route consumes that guaranteed key directly, and the missing-key assertion
now verifies authorization itself.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/generate-image.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084961155) · 2026-07-26
19:07:51 UTC</sub>

### 2d9b606e3710 — [P3][readability] InstallBanner mixes `$state` flags with a plain `let` mutated inside an `$effect`

**Issue**

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

**Fix**

Made `exitIntoParentButton` a `$state(false)` latch so the transition reads the timeout-updated
value and targets the Parent Center button after auto-clear.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/install-banner.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086070808) · 2026-07-27
00:11:21 UTC</sub>

### e170675efcd1 — [P3][readability] `ALL_ORIENTATIONS` exists but `bookAssetPaths` re-inlines `['portrait','landscape'] as BookOrientation[]` twice

**Issue**

`const ALL_ORIENTATIONS: BookOrientation[] = ['portrait', 'landscape'];` is defined and used in
`page()`, yet `bookAssetPaths` writes the array literal with an inline cast twice more:

```ts
(['portrait', 'landscape'] as BookOrientation[]).map((o) => page.nightImages[o]);
```

The cast is only needed because the literal isn't the typed constant. Two representations of "all
orientations" can diverge (add a `'square'` orientation and one gets missed).

**Fix**

Reused `ALL_ORIENTATIONS` for optional night-fill and chalk-outline path collection, eliminating
duplicate orientation lists while preserving filtering and manifest order.

*Revised before approval:* Applied Prettier’s required layout to the two `ALL_ORIENTATIONS` chains
so the canonical-orientation fix satisfies the repository formatting gate without altering behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086073733) · 2026-07-27
00:11:57 UTC</sub>

### 10421a517408 — [P3][readability] Header comment claims the module is "plain JS" when it is TypeScript

**Issue**

```ts
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
```

The file is `.ts` with interfaces and typed exports throughout — not "plain JS." The intended point
is "no Svelte runes, so Node build scripts can import it," but "plain JS" is factually wrong and
could mislead someone into thinking they can't add types here.

**Fix**

Corrected the catalog header to describe the TypeScript module as intentionally rune-free and not a
`.svelte.ts` module, preserving why both the app and Node build scripts can import it.

*Revised before approval:* Updated the remaining catalog reference to describe `books.ts` accurately
as a rune-free TypeScript module while preserving its Node build-script rationale.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/state/coloringBook.svelte.ts:1` still describes the TypeScript catalog in `books.ts`
  as a “plain JS module,” preserving the same factual misinformation this finding is meant to
  remove; reword this comment to describe the catalog as rune-free instead.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086074313) · 2026-07-27
00:12:03 UTC</sub>

### c2f60d922ed8 — [P4][readability] Stale migration comment references a `.js` module that no longer exists

**Issue**

```ts
// Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
```

The comment justifies the re-export by a `.js` import path from a prior migration. If no source
still imports the `.js` path (the codebase is TS-only per CLAUDE.md), the rationale is historical
noise that misleads a reader into thinking a JS consumer exists.

**Fix**

Removed the obsolete `.svelte.js` compatibility claim while retaining the accurate reason the
catalog remains in rune-free TypeScript.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086075508) · 2026-07-27
00:12:17 UTC</sub>

### 6bd5c6e08029 — [P5][readability] Page-grid column counts are restated across three breakpoints

**Issue**

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

**Fix**

Consolidated the page-grid column configuration into a local `--page-cols` variable, preserving the
2/3/2 responsive behavior while removing the redundant landscape mobile rule.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086076422) · 2026-07-27
00:12:28 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### de06ec41a262 — [P5][readability] `strokeWidthP90`'s two-pass chamfer distance transform is dense and unnamed

**Issue**

`strokeWidthP90` inlines a full forward+backward chamfer distance transform (the `1`/`1.414`
neighbor weights, two 20-line directional sweeps) then a p90 selection, all in one function whose
name advertises only the percentile. The distance-transform machinery is reusable image math buried
as a private implementation detail with no separation between "compute distance-to-light" and "take
2×p90."

**Fix**

Extracted the two-pass chamfer distance-to-light sweeps out of `strokeWidthP90` into a standalone
`chamferDistance(mask, w, h)` helper in solid-regions.mjs, so the reusable distance-transform math
is separated from the p90-over-mask selection; `strokeWidthP90` now just calls it and keeps its
existing tail. Pure code motion, no arithmetic changed, both functions remain module-private.

*Revised before approval:* Moved chamferDistance from solid-regions.mjs into lib/morphology.mjs and
exported it alongside dilateMask/erodeMask so it's reachable by other morphology-adjacent code;
solid-regions.mjs now imports it. Added a direct unit test in tests/morphology.test.mjs with a
hand-built mask asserting the 1/1.414 neighbor distances and zero distance on a fully non-ink mask,
since the prior aggregate scoreSolidity assertions couldn't distinguish a broken sweep from a
compensating p90. All checks pass: npm run check, prettier --check on touched files, and the full
tools/asset-gen/tests suite (116 tests, 16 files).

**Adversarial review** — reviewer caught the following; addressed before approval:

* `chamferDistance` in `tools/asset-gen/lib/solid-regions.mjs:51` is module-private, so the
  finding's stated goal — making the distance transform available to other morphology-adjacent code,
  and giving it a direct unit test — is not met. Export it (it belongs alongside
  `dilateMask`/`erodeMask` in `lib/morphology.mjs`, imported by `solid-regions.mjs`) so it is
  reachable.
* No test exercises `chamferDistance` directly; the only coverage is `scoreSolidity`'s aggregate
  assertions in `tools/asset-gen/tests/solid-regions.test.mjs`, which cannot distinguish a broken
  sweep from a compensating p90. Add the direct unit test the finding names (e.g. a small
  hand-checked mask asserting the 1 / 1.414 neighbor distances and zero on non-ink pixels).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086535951) · 2026-07-27
01:56:46 UTC</sub>

### f5b2e3431761 — [P5][readability] Inconsistent `test(` vs `it(` across the pipeline test suite

**Issue**

Eleven of the thirteen `.test.mjs` files use `it(...)`; only `light-fill-cli.test.mjs` and
`outline-targets.test.mjs` use `test(...)`. Both are valid Vitest aliases, but the split is
arbitrary — it tracks nothing meaningful (both styles cover CLI and gate tests) and adds a small
grep/consistency tax when scanning the suite.

**Fix**

Renamed all remaining `test(` call sites to `it(` in the four outlier files (audit-cli, cli,
light-fill-cli, outline-targets), including cli.test.mjs's five pre-existing `test.each(...)` sites
which required keeping `test` in that file's vitest import alongside the new `it`. All 116 asset-gen
tests, 748 web unit tests, svelte-check, and eslint pass clean.

*Revised before approval:* Converted cli.test.mjs's five test.each( sites to it.each( and dropped
the now-unused test import, finishing the it( convergence started in 06fb36b. Verified: 116
asset-gen tests pass, eslint clean, zero remaining test( sites across all 16 test files.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `tools/asset-gen/tests/cli.test.mjs` still calls `test.each(...)` at lines 40, 61, 80, 206 and 239
  and still imports `test` on line 1, so the file now mixes `it(...)` and `test.each(...)` where it
  previously used one alias throughout — convert those five to `it.each(...)` (Vitest supports it
  identically) and drop `test` from the vitest import.

**Supervisor note** — the reviewer's catch is the one that matters on a consistency fix: the first
pass left `cli.test.mjs` *mixing* both aliases, so that file went from internally consistent (all
`test`) to internally inconsistent — locally worse than before the fix, while the suite-wide metric
improved. A green suite says nothing here, since both aliases work identically.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087036087) · 2026-07-27
03:42:51 UTC</sub>

### fa38fcab5da1 — [P5][readability] Typo "PIXEL GEOMTRY" in the synthetic-fixtures rationale comment

**Issue**

```js
// gates score PIXEL GEOMTRY (solid-region area, ring-nesting depth, ...
```

"GEOMTRY" → "GEOMETRY". This comment is the load-bearing explanation for *why* the whole fixture
file is synthetic rather than recovered assets, so it's read often; the typo in an emphasized
all-caps phrase is more visible than most.

**Fix**

Fixed the "GEOMTRY" → "GEOMETRY" typo in the rationale comment at the top of
tools/asset-gen/tests/fixtures/synthetic.mjs, since that comment is the load-bearing explanation for
why the fixture file is synthetic. Pure comment change; check, eslint, and unit tests all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087048605) · 2026-07-27
03:45:29 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### b5c14dbebf47 — [P5][readability] `featureGraphicHtml` used before its declaration

**Issue**

The feature-graphic block calls `featureGraphicHtml(iconB64)` at line 205, but the function is
declared at line 218 — after the top-level `await browser.close()` and the `ALL DONE` log. It works
only because `function` declarations hoist; reading top-to-bottom, the helper appears to be defined
after the script has finished.

**Fix**

Moved the feature-graphic HTML helper into the helper section ahead of the server orchestration,
preserving its generated markup and capture path unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090038371) · 2026-07-27
10:10:32 UTC</sub>

### f5aefbba7c53 — [P4][readability] `card()` entry-existence check reaches up-and-back-down through the type dir

**Issue**

```js
const entryExists = existsSync(join(dir, '..', meta.entry));
const href = entryExists ? meta.entry : `${type}/${files.find((f) => f.endsWith('.html')) ?? ''}`;
```

`dir` is `<scrapbook>/<type>`, and `meta.entry` already starts with `<type>/…`, so the check climbs
to `<scrapbook>` then descends again — correct but confusing, and the fallback silently yields
`type/` (trailing slash, no file) when no HTML exists, producing a dead card link.

**Fix**

The brief’s requested `model-eval/report/index.html` missing-entry fixture conflicts with the
current registry because that exact path is configured. Registered entries now resolve from the
scrapbook root; missing ones use recursive fallback cards, with empty registered collections
flagged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092628045) · 2026-07-27
14:30:24 UTC</sub>

### 975297eeb9c1 — [P4][readability] `parseFrontmatter` silently drops non-`[A-Za-z]`-leading keys and never signals malformed lines

**Issue**

The key regex `^([A-Za-z]\w*):\s*(.*)$` silently ignores any frontmatter line it can't parse (e.g. a
key with a leading digit or a `-`, or a genuinely malformed line). A release author who mistypes a
key gets no error — the value just vanishes and downstream `meta.foo` is `undefined`. The comment
says "flat — we never need nested YAML," which is fine, but the silent-skip behaviour is
undocumented and bug-prone for the release pipeline that depends on it.

**Fix**

Frontmatter parsing now rejects malformed non-blank lines with their line number while preserving
valid and blank entries. Added focused script tests for valid metadata, absent fences, blank lines,
and malformed input.

*Revised before approval:* Formatted the focused parser test so the repository formatting gate is
now clean. All requested non-listener gates and the parser’s script-level test suite pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092716738) · 2026-07-27
14:38:31 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 44eaf54d04f4 — [P3][readability] Blue/red-dominance pixel assertions hide their intent behind index math repeated across tests

**Issue**

The idiom `expect(px![2]).toBeGreaterThan(px![0])` (blue channel > red channel ⇒ "painted blue")
recurs with an explanatory comment each time (`flows.spec.ts:217` "`\#62A2E9` is blue-dominant — the
painted pixel should be more blue than red"). The red-detection at `flows.spec.ts:1542-1549` inlines
`data[i]>200 && data[i+1]<120 && data[i+2]<120`. The reader must decode raw `[r,g,b,a]` index
arithmetic to understand what color is being asserted, and `firstOpaquePixel` returns an untyped
`number[]` (not a named `Rgba` tuple), so nothing prevents an off-by-one channel index.

**Fix**

Introduced a typed RGBA tuple and named blue-dominance/red-pixel helpers, then routed the three
pixel assertions through them. This makes their intent explicit while preserving the existing color
thresholds.

*Revised before approval:* Added `isRedDominant(Rgba)` with the exact existing alpha and RGB
thresholds. `hasRedPaintPixel` now returns typed nontransparent candidates from the page and applies
that named predicate runner-side.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/tests/flows-magic-brush.spec.ts:89` still embeds the opaque-red channel thresholds as raw
  `data[i + n]` arithmetic inside `hasRedPaintPixel`; add the verifier-requested
  `isRedDominant(px: Rgba)` helper in `web/tests/helpers.ts` and use it during the scan while
  preserving the existing alpha/red/green/blue thresholds.

**Supervisor follow-up** — inspection caught that the reviewed version serialized every opaque
canvas pixel to Node. Commit 2eab584c restored the original in-browser early-exit scan while
retaining the named helper, and the focused magic-brush E2E passed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094349761) · 2026-07-27
17:05:33 UTC</sub>

### 49545949fdac — [P4][readability] multitouch STROKES/SAMPLES rely on positional index coupling between two separate arrays

**Issue**

`STROKES[3]` (pointer 4, leftward) is verified by `SAMPLES[3]` (`{ x: 90, y: 190 }` "on pointer 4's
leftward path"). The correspondence is maintained only by array position and comments; inserting a
stroke without inserting its sample at the same index silently mis-pairs the assertion (a sample
could land on the wrong line and still be opaque, passing vacuously).

**Fix**

Paired each multitouch stroke with its unchanged sample in one fixture list, so every drawing
payload and pixel assertion stays coupled.

*Revised before approval:* Applied Prettier’s required formatting to the multitouch fixture
refactor, leaving the scoped correction ready for the driver to commit.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094524345) · 2026-07-27
17:23:05 UTC</sub>

### e16e7b2af688 — [P4][readability] `firstOpaquePixel` and `draw` in helpers.ts lack input guards and precise types

**Issue**

`draw(page, points)` indexes `points[0]` (line 18) with no guard for an empty array — an empty
`points` throws an unhelpful `undefined` deref rather than a clear "draw called with no points."
`firstOpaquePixel` returns `Promise<number[] | null>` — an untyped array where callers rely on
positional channels (`px![2]`), so a caller reading the wrong index gets no type help.

**Fix**

Added a shared empty-point guard in `dragStroke` before any coordinate access, giving both helper
paths a clear contract error while preserving valid stroke behavior.

*Revised before approval:* Made the exported RGBA tuple readonly and added a focused regression spec
proving empty strokes reject before any mouse input is issued.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/tests/helpers.ts:25` still declares `Rgba` as a mutable tuple, so the head does not implement
  the original finding’s `readonly [number, number, number, number]` contract; make the exported
  tuple type readonly.
* No test invokes `dragStroke` or `draw` with an empty point list, leaving the new guard and its
  promise of issuing no mouse input unverified; add a focused regression test asserting the
  descriptive rejection and zero mouse calls.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094792066) · 2026-07-27
17:47:17 UTC</sub>

### c60297f1194f — [P4][readability] `playwright.config.ts` browser-fallback logic uses a bare magic index and three silent empty catches

**Issue**

```ts
.filter((d) => /^chromium-\d+$/.test(d))
.sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));   // line 23
```

`9` is the unexplained length of the `"chromium-"` prefix (a classic off-by-one hazard if the prefix
ever changes). The function also has three bare `} catch {}` blocks (lines 19, 31, 44) that swallow
all errors with no comment on why silence is correct — a reader can't tell intentional-fallback from
accidental error-hiding. This is dense environment-probing logic sitting in a config file.

**Fix**

Replaced the implicit Chromium prefix length with a named prefix and documented intentional
browser-path fall-throughs, preserving the existing fallback behavior.

*Revised before approval:* Reformatted the Chromium revision sort expression to satisfy Prettier
while preserving the requested fallback behavior and comments.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095672923) · 2026-07-27
19:12:55 UTC</sub>

### c77cfb2fcc84 — [P5][readability] Hub script uses ES5 `var` + function expressions despite a modern-only target

**Issue**

The entire `<script>` is written in ES5 style — `var` bindings, `function () {}` callbacks
throughout. The scrapbook is self-contained modern HTML served to current browsers (the repo's
`docs/COMPATIBILITY.md` floor is well past ES5), and the rest of the codebase is `const`/`let` +
arrow functions. There is no build/transpile step here, so the dated style is a pure readability
drag with no compatibility upside, and it's inconsistent with how a contributor would expect Splotch
JS to read.

**Fix**

Modernized the generated proof-sheet hub with block-scoped bindings, arrow callbacks, and template
literals while preserving its navigation behavior. Updated the freshness parser and fixture for the
emitted `const CATEGORIES` declaration, then regenerated the committed hub.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/proof-sheet-history.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098415004) · 2026-07-28
00:30:28 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### 2d360c8b70e5 — [P5][readability] Duplicated 6-line mask gradient in AiConfetti

**Issue**

`-webkit-mask-image` and `mask-image` on `.confetti-layer` each carry a byte-identical six-line
`radial-gradient(...)`. The vendor-prefix pair is required, but the full gradient body is
copy-pasted, so any tweak to the mask shape must be made twice and kept in sync by hand.

**State at triage (2026-07-27):** Still present, now at
`web/src/lib/components/AiConfetti.svelte:73-84`. The gradient has since been *edited* — it went
from literal `31%/41%` radii to `ellipse var(--confetti-rx, 31%)
var(--confetti-ry, 41%)` fed by the
parent (`AiImageResult.svelte` sets both vars on `.ai-stage`) — and that edit had to be applied
identically to both copies, which is exactly the sync hazard the finding describes. The two blocks
remain byte-identical. …

**Fix**

Centralized the unchanged confetti radial gradient in `--confetti-mask` and reused it for both
prefixed and unprefixed mask declarations, preserving compatibility and inherited radius behavior.

*Revised before approval:* Lowered AiConfetti’s raw-hex lint baseline from two to one to match the
deduplicated mask gradient, keeping the token ratchet green.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/ai-timer.spec.ts tests/flows-ai.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099607099) · 2026-07-28
03:31:19 UTC</sub>

### 411efdc2f63d — [P5][readability] `+error.svelte` and both `handleError` hooks produce a `{ message }` that nothing ever displays

**Issue**

Both `handleError` hooks return `{ message: GENERIC_ERROR_MESSAGE }` (the `App.Error` shape), but
`+error.svelte` renders `<ErrorScreen />` with no props, and `ErrorScreen` hardcodes its own
"Something went wrong. Let's start a fresh drawing." A reader reasonably assumes the hook message
reaches the UI; it doesn't. Proposed either wiring `page.error?.message` into `ErrorScreen` or
dropping the payload to a comment saying the UI copy is intentionally fixed.

**State at triage (2026-07-27):** Unchanged at HEAD; the finding's surface facts all still hold, and
so do the review's counter-facts:

* `web/src/hooks.client.ts:7-10` and `web/src/hooks.server.ts:75-78` both return
  `{ message: GENERIC_ERROR_MESSAGE }` with no comment about who consumes it. …

**Fix**

Clarified which SvelteKit fallback surfaces consume the generic message while documenting
ErrorScreen’s independent toddler-facing copy and preserving existing error responses.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099945417) · 2026-07-28
04:26:19 UTC</sub>
