# Audit comments — Dead code & config

33 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `fd4cfa9a9814` — [dead-code] `PointerState.isDrawing` is never set false — a vestigial field guarding dead branches

**Issue**

`isDrawing` is initialized `true` at pointer creation (742) and **never assigned `false` anywhere**.
Yet three sites branch on it as if it can be false:

```ts
if (!pointerState || !pointerState.isDrawing) return;          // 876 — the guard can never fire on isDrawing
if (pointerState?.isDrawing && pointerState.passTracker && ...) // 927 — isDrawing always true
if (ps.isDrawing && ps.passTracker && !ps.edgeSwipeGuard) {     // 959 — isDrawing always true
```

A pointer is removed from `activePointers` when it stops, so "is this pointer still drawing" is
already answered by map membership. The field and its guards are misleading: a newcomer reads
`!isDrawing` and assumes there is a paused-but-tracked state that does not exist.

**Fix**

refactor(engine): remove dead PointerState.isDrawing field and guards

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071306642) · 2026-07-24
15:04:15 UTC</sub>

### `ab3f1d49456a` — [drawing] stopDrawing(e?) — unreachable optional param and guard

**Issue**

```ts
function stopDrawing(e?: PointerEvent) {
  if (!e) return;
```

`stopDrawing` is only ever registered as an event listener (pointerup/out/cancel), which always
supplies an event. Nothing calls it with no argument. The optional `?` and guard imply a call path
that does not exist.

**Fix**

refactor(drawing): drop unreachable e? param and guard from stopDrawing

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071308546) · 2026-07-24
15:04:23 UTC</sub>

### `3d4c6cee0a13` — [P3][dead-code] `buildPromptForStyle`'s `defaultPrompt` parameter is never overridden, and its `style` is typed `unknown`

**Issue**

```ts
export function buildPromptForStyle(
  style: unknown,
  suffixes: Record<string, string>,
  defaultPrompt: string = DEFAULT_PROMPT,
): string;
```

Both call sites (`web/src/routes/api/generate-image/+server.ts:117` and
`tools/asset-gen/bin/gen-style-covers.mjs:30`) call `buildPromptForStyle(style, STYLE_SUFFIXES)`
with two args — the third `defaultPrompt` parameter is dead. It adds an untested branch and misleads
readers into thinking the base prompt is configurable. Separately, `style: unknown` forces the
`typeof style === 'string'` guard on line 12 even though every real caller passes a string.

**Fix**

Implemented the brief in web/src/lib/ai/prompt.ts: dropped the dead `defaultPrompt` parameter from
`buildPromptForStyle` (no call site passed a third arg) and narrowed `style` from `unknown` to
`string | null`, simplifying the guard to `Object.hasOwn(suffixes, style ?? '')` and using
`DEFAULT_PROMPT` directly in the body. Behavior is byte-identical — real style keys return
`DEFAULT_PROMPT + ' ' + suffix`; null/unknown keys return `DEFAULT_PROMPT` (ADR-0064
allowlist-ignore preserved). Both call sites already passed two args; no other files changed. The
formatter wrapped the signature across lines (no functional effect).

Verification: `npm run check` (0 errors), `npm run test:unit` (576 passed), `npm run test:asset-gen`
(62 passed), `npx eslint web/src/lib/ai/prompt.ts` (clean). `npm run test:api:smoke` returned 26
passed / 1 failed — the failure is the unrelated `report valid but no GITHUB_ISSUE_TOKEN → 503`
assertion in the report/GitHub-issue endpoint (not touched by this change); it's environmental (dev
server picks up GITHUB_ISSUE_TOKEN from a local .env, returning 200 and creating issue \#536 instead
of 503). All generate-image smoke tests passed. No E2E gate applies per the brief, and the failing
smoke test is not in the driver's re-run set (type-check, unit tests, eslint on changed files, named
E2E specs — none named).

Note: running test:api:smoke created junk GitHub issue \#536 as a side effect; closing it needs gh,
which is gated behind approval here.

Committed as 4f170a64abb3652cdd16bbaf202d1b980c96e8bd on branch audit/burndown.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071958762) · 2026-07-24
16:19:48 UTC</sub>

### `b27ab50d0d71` — [P5][dead-code] `aiPreview` clamp/scale exports exist only for tests

**Issue**

`clampScale`, `clampTransform`, `MIN_SCALE`, `MAX_SCALE`, and the `Bounds`/`Transform` types are
exported but have no non-test consumer (confirmed by grep across `web/src` excluding tests and the
module itself) — only `createPinchZoom` (same file) and `aiPreview.test.ts` use them. That's a
legitimate test seam, but the broad public surface makes it look like shared API and clutters the
module's exports.

**Fix**

Removed the `export` keyword from `Transform`, `Bounds`, and `IDENTITY_TRANSFORM` in
`pinchZoom.svelte.ts` since nothing outside the module (not even the test file) referenced them, and
added a comment explaining that `MIN_SCALE`/`MAX_SCALE`/`clampScale`/`clampTransform` stay exported
deliberately for direct unit testing of the pure gesture math. Type-visibility and comment change
only; no runtime behavior affected.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073001513) · 2026-07-24
18:08:45 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### 8f5c8e337daf — [P3][dead-code] `ToggleRow` exposes a `disabled` prop that no caller uses

**Issue**

`ToggleRow`'s `Props` declares `disabled?: boolean` (`:16`), it's destructured (`:19`), wired into
the button, and carries ~10 lines of `:disabled` CSS (`:123-132`). No consumer ever passes it — a
`grep` for `disabled=` in `parent/` finds only ReportForm's submit button, SetupInstructions'
one-tap button, and AiKeyManager's save button, none of which are ToggleRow. It's untested dead
surface area.

**Fix**

Dropped the `disabled` prop from `ToggleRow` — the `Props` field, the defaulted destructure, the
`{disabled}` binding on the switch button, and the two `.toggle-switch:disabled` CSS rules it gated.
Every call site already relied on the default `false`, so the switch renders and toggles exactly as
before; this just stops the component from advertising a capability nothing used.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748150) · 2026-07-25
00:10:51 UTC</sub>

## PR [\#542](https://github.com/KyleMit/Splotch/pull/542) — Cut the audit burndown over to run cloud-native (+ 7 findings) (2026-07-25)

### 66c0dccd05f5 — [P3][dead-code] ActionsPanel portrait rule re-declares identical left/bottom values

**Issue**

The base `.actions-panel` sets `left: calc(8px + env(safe-area-inset-left))` (396) and
`bottom: calc(8px + env(safe-area-inset-bottom))` (395). The portrait override (403-409) sets
`flex-direction: column-reverse` (the only real change) but then re-declares `left` and `bottom`
with the exact same `calc(...)` values (406-407). Those two lines are inert — noise that suggests a
portrait-specific offset exists when it doesn't.

**Fix**

Removed the `left`/`bottom` declarations from the portrait media-query block in
`ActionsPanel.svelte`, leaving only `flex-direction: column-reverse`; the base `.actions-panel` rule
already sets byte-identical values, so computed style is unchanged and the block no longer implies a
portrait-specific offset.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078588714) · 2026-07-25
13:05:42 UTC</sub>

### 6e7dab3373cc — [P3][dead-code] Flyout portrait media query re-sets flex-direction to its base value

**Issue**

The base `.flyout-menu` is `flex-direction: row` (58/66). The `@media (orientation: portrait)` block
changes `left`/`bottom` but also writes `flex-direction: row` again (75/86) — a no-op that's
immediately overridden anyway by the `max-width: 540px` block's `column`. It reads as though
portrait deliberately re-affirms row, obscuring that the meaningful axis switch is the 540px
breakpoint.

**Fix**

Removed the fully shadowed `flex-direction: row` from the plain `@media (orientation: portrait)`
block for `.flyout-menu` in `web/src/app.css`, so the only axis switch in the cascade is the 540px
portrait breakpoint's `column`. Confirmed no visual change by rendering the stylesheet with and
without that declaration in headless Chromium at 900×600 landscape and 768/541/540/360-wide portrait
— computed `flex-direction`, `left`, and `bottom` are identical at every one.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078730898) · 2026-07-25
13:51:08 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### f5bcc395b019 — [P2][dead-code] `Button` design primitive has no production consumers

**Issue**

`Button.svelte` is the only shared design primitive (per the `design` skill it is "the shared chrome
for text-labeled buttons on modal/parent surfaces"), but a repo-wide search shows the *only* file
that imports or renders it is the styleguide harness:

```
=== all <Button usages ===
./routes/dev/design/+page.svelte:58 / :184 / :186
=== import Button (any) ===
./routes/dev/design/+page.svelte:3
```

No modal, parent, or admin surface actually uses it. The real parent/modal buttons (`ParentCenter`,
`AppearanceSection`, etc.) still hand-roll `<button class="...">`. So the primitive is aspirational:
it is maintained, screenshotted, and documented, yet ink on modal surfaces bypasses it.

**Fix**

*First pass (rejected):* Pulled Slider's bare `0.045` snap-band literal out of the `$derived` into a
module-scope `SNAP_BAND_FRACTION` constant. Note: this change was already present and committed at
HEAD when this round started (recorded in completed.log against the same SHA) with no history of
that pass carried over, so I re-verified it against the brief and re-ran every gate rather than
creating a duplicate or empty commit.

*Revised before approval:* Adopted the previously consumer-less `Button` design primitive (option
(a)) across the text-labeled actions on the parent surfaces: Send report (ReportForm), Save and both
Forget buttons (AiKeyManager), Install Splotch (SetupInstructions), and Choose folder
(SavingSection), retiring four bespoke `.btn`-style blocks. Each call site keeps only its placement
via a forwarded `class` styled with `:global()` — the seam `Disclosure` already uses — while the
primitive owns fill, hover, disabled, radius, padding and press scale. The three surfaces the
finding named are deliberately not migrated and the reasoning is recorded as an ADR-0071 amendment:
`/admin` is light-only and `Button` is built from themed washes that would flip on it; the theme
picker and report-kind row are `role="radio"` segments (pickers, not actions); ParentCenter's
close/nav/hub/back controls are icon-led navigation chrome. The `design` skill's Primitives section
was narrowed to match (edited in `.ruler/`, regenerated with `ruler:apply`). Note the intended
visual delta: migrated buttons pick up the primitive's radius and opacity-based disabled treatment.
Verified with check, unit tests, eslint, lint:tokens, format:check, and flows/parent-zoom/a11y E2E —
all green.

*Revised again before approval:* Addressed all three remaining review points on f747692b4467.
Migrated SavingSection's `.folder-pill` to `<Button variant="wash" size="sm">` with its
max-width/ellipsis/pill-radius through the forwarded class — that rule also overrides
`display: block`, because the primitive is `inline-flex` and would wrap the label in an anonymous
flex item that `text-overflow` cannot clip (the original plain button was blockified as a flex item,
so this reproduces prior behavior). Widened the ADR-0071 amendment's "Selection controls" carve-out
to key on the presence of a selected state rather than the ARIA pattern, explicitly covering the
`aria-pressed` segments (ControlsSection's `.chip` grid, CompactShell's orientation segment)
alongside the `role="radiogroup"` ones, and mirrored that in the `design` skill's Button row.
Dropped the dead `class="one-tap-btn"` attribute from SetupInstructions and recorded in the
amendment that a forwarded class styling nothing is a bug, not a convention. Verified with check,
unit tests, eslint, lint:tokens, format:check, and the flows/parent-zoom/a11y E2E specs — all green.
The folder row is desktop-Chromium-only and has no E2E coverage, so the ellipsis behavior is
reasoned rather than observed.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The commit implements an unrelated finding: it extracts `SNAP_BAND_FRACTION` in
  `web/src/lib/components/Slider.svelte` and does not touch
  `web/src/lib/components/design/Button.svelte` or any consumer of it. The finding under review is
  the `Button` primitive having no production consumers, which remains entirely unaddressed.
* `Button.svelte`'s consumer situation is unchanged from the state the finding describes:
  `grep -rIn "<Button|import Button" web/src --include=*.svelte` still matches only
  `web/src/routes/dev/design/+page.svelte` (lines 3, 64, 231, 233). Resolve it by either adopting
  `<Button>` in the parent/modal surfaces per the finding's preferred option (a), or by deleting the
  component plus its `/dev/design` section and the `design` skill's "Primitives" claim per option
  (b).
* `SavingSection.svelte`'s `.folder-pill` (the selected-folder button, lines 33-40 / the
  `.folder-pill` rule) is a text-labeled action whose bespoke chrome is byte-for-byte the
  primitive's `wash` variant at `size="sm"`, it sits in the same `.folder-location` row as the
  `Choose folder` button this commit migrated, and it matches none of the three carve-outs the new
  ADR-0071 amendment declares exhaustive. Either migrate it or add it to the carve-out list with a
  reason.
* The `aria-pressed` segmented controls — `ControlsSection.svelte`'s `.chip` grid and
  `CompactShell.svelte`'s `.orient-seg` options — are text-labeled parent-surface buttons that also
  fall outside the amendment's carve-outs, which name only `role="radio"` segments. Widen the
  "Selection controls" bullet so the next pass doesn't read them as an unfinished migration.
* `SetupInstructions.svelte:161` still forwards `class="one-tap-btn"` to `<Button>`, but the commit
  deleted the only `.one-tap-btn` rule and added no `:global(.one-tap-btn)` replacement — the class
  now styles nothing. Drop the attribute.

**E2E gate** — `tests/flows.spec.ts`

> [!IMPORTANT]
> **Worth a human eye.** Two things happened here that the other findings didn't hit.
>
> First, the implementer's opening pass implemented the *previous* finding (Slider's
> `SNAP_BAND_FRACTION`) instead of this one, and said so — it found that work already at HEAD "with
> no history of that pass carried over". The blind reviewer caught it cold. That is the
> writer/verifier split doing exactly the job it exists for, but the confusion itself is worth
> understanding before a long unattended run.
>
> Second, this finding grew well past a component change: it migrated five call sites, amended
> ADR-0071, and edited the `design` skill via `.ruler/` + `ruler:apply`. All of it is defensible and
> gated green, but an ADR amendment authored inside an automated burndown deserves review on its
> merits rather than on its test results.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079286723) · 2026-07-25
16:35:26 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 6831a81a2525 — [P4][dead-code] `generate-icon-names.mjs` carries Windows path-normalization that ADR-0062 made dead

**Issue**

```js
.map((path) =>
  path
    .replace(/\\/g, '/')   // backslash→slash: only matters on Windows
    .split('/')
```

`node:fs` `globSync` returns POSIX-separated paths on macOS/Linux, the only supported dev platforms
(ADR-0017, Windows dropped in ADR-0062). The `\\`→`/` replace can never fire, and its presence
implies Windows is still a target. (The `scripts/` CLAUDE.md explicitly states Windows support was
dropped.)

**Fix**

Removed the dead `.replace(/\\/g, '/')` normalization step from generate-icon-names.mjs, since
node:fs globSync only ever returns POSIX-separated paths on the macOS/Linux platforms this project
supports. Verified the regenerated icon-names.d.ts is byte-identical to before, and check/unit
tests/eslint all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080120993) · 2026-07-25
18:53:24 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### 9a1f82d6513a — [P3][dead-code] `LaunchGuardOptions` (radius/duration) is never exercised in production

**Issue**

`guardLaunchZone` accepts a `LaunchGuardOptions { radius?, durationMs? }`, but the only production
caller is `modalDialog`, which always calls `guardLaunchZone(o.origin ?? null)` with no options — so
`DEFAULT_RADIUS`/`DEFAULT_DURATION_MS` always win. The per-call override exists solely for
`launchGuard.test.ts`. That's speculative API surface: readers assume some modal tunes the zone, but
none does.

**Fix**

Removed the `LaunchGuardOptions` parameter from `guardLaunchZone` and inlined the module defaults,
since the sole production caller (`modalDialog`) never passed overrides and the 72px/600ms defaults
always won. Exported `DEFAULT_RADIUS`/`DEFAULT_DURATION_MS` so the unit tests assert against the
module's real values rather than duplicated literals — the six existing cases now exercise the
default behavior that actually ships.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082333475) · 2026-07-26
06:17:23 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 5ed3f49fdf18 — [P3][dead-code] `PLATFORMS` is exported and re-exported but never consumed; the catalog uses raw string literals instead

**Issue**

`export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;` is defined and re-exported
through `coloringBook.svelte.ts`, but a repo-wide grep shows zero consumers — the `BOOKS` entries
all write `platforms: ['web', 'mobile']` as raw strings, and `booksForPlatform`/callers pass the
literals `'web'`/`'mobile'` (`ColoringBook.svelte:22`). The constant that exists to prevent
stringly-typed platform values is bypassed by the very data it was meant to guard.

**Fix**

Removed the unused `PLATFORMS` declaration and its re-export while leaving the platform type,
catalog, and filtering behavior unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086073120) · 2026-07-27
00:11:49 UTC</sub>

### d3f7d5f43d97 — [P3][dead-code] `booksForPlatform`'s `?? ['web', 'mobile']` default is unreachable — every book sets `platforms`

**Issue**

```ts
return BOOKS.filter((book) => (book.platforms ?? ['web', 'mobile']).includes(platform));
```

The "omitting the field ⇒ ships everywhere" fallback (also documented in the header, lines 43-44) is
never exercised because all eight books declare `platforms: ['web', 'mobile']` explicitly. The
default is documented behavior with no test and no data path, so it can silently rot (e.g. the
`strip-native-assets` side that must agree may not honor the same default).

**Fix**

Made `Book.platforms` required and removed the implicit ships-everywhere fallback. Both picker
filtering and native asset stripping now rely directly on each book’s explicit platform list,
preserving the existing catalog behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086073425) · 2026-07-27
00:11:53 UTC</sub>

### 7e1d66bd476c — [P4][dead-code] `export` on generator functions that are never imported

**Issue**

Both are `export`ed with a comment ("Kept free of file/CLI concerns so it can be reused (batch,
samples, or eventually in-app)"), but a repo-wide grep shows each is only ever called within its own
file (fills:187, covers:86) — no importer exists. The export is aspirational dead surface that
implies a shared API that isn't there, and `generateDarkPage`/`drawChalk`/`editLineArt` in sibling
files are (correctly) not exported, so the pattern is inconsistent anyway.

**Fix**

Removed the two unconsumed ESM exports and revised their comments to describe only their local
generator role. The functions and all existing CLI behavior remain unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086086276) · 2026-07-27
00:14:27 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### fe35e279fb63 — [P4][dead-code] `GOLDEN_METRICS` is exported but consumed only inside its own module

**Issue**

`GOLDEN_METRICS` is `export const`, but the only reader is `diffGoldenPage` in the same file (line
70). A repo-wide grep shows no external import (`audit-golden.mjs` imports `GOLDEN_VERDICTS` and
`diffGoldenPage`, not `GOLDEN_METRICS`). The `export` overstates the module's public surface and
invites a future caller to depend on an internal table.

**Fix**

Dropped the `export` keyword from `GOLDEN_METRICS` in golden-catalog.mjs since it has no consumers
outside the module — `diffGoldenPage` in the same file already references it as a local binding.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086435860) · 2026-07-27
01:34:17 UTC</sub>

### 662c908ea936 — [P2][dead-code] `build-review.mjs` output claims "nothing here is committed" and references the deleted `IDEAS.md` — both false now

**Issue**

The generated dashboard (the primary review surface per the README and parent `CLAUDE.md`) prints
two stale claims baked into `build-review.mjs`:

* Line 213 subtitle: "One subagent per idea from `tools/asset-gen/IDEAS.md`…" and "${done} of 25
  ideas explored **so far**" — `IDEAS.md` no longer exists (moved to `area:asset-gen` GitHub issues,
  per the README's own header note), and "so far" implies in-progress when all 25 are done.
* Line 224 footer: "Repo state was reverted to baseline (8e471b8) after every attempt — **nothing
  here is committed**." The entire folder is committed; this line is now self-contradicting.

**Fix**

Reworded the dashboard's subtitle to point at the `area:asset-gen` GitHub issues and state the
burn-down is complete ("All 25 of 25 ideas explored"), and the footer to keep the true claim (each
attempt reverted to baseline 8e471b8 before the next, so nothing from the experiments is live in the
pipeline) while saying the folder itself is a committed frozen record. Two things to know about the
regenerated `ideas-review.html`: the embedded `idea-N/code/*.mjs` blocks also changed, because the
committed page predates a Prettier pass over those source files and any regeneration picks the
current bytes up (report text, verdict tallies and inlined images are byte-identical); and the
page's `<title>`/`<h1>` still read "IDEAS.md burn-down", which I left alone as outside the brief's
stated scope of the two wrapper strings.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor flag — the finding is only half resolved.** Its headline is that the output "references
the deleted `IDEAS.md`", and the two most prominent references are still there. Confirmed at HEAD:

```
build-review.mjs:121  const html = `<title>Splotch asset-gen — IDEAS.md burn-down</title>
build-review.mjs:212  <h1>Splotch asset-gen — IDEAS.md burn-down</h1>
```

Those are live wrapper chrome — the same category as the subtitle that *was* fixed, and the first
thing a reader sees. The implementer disclosed this and scoped to the brief's literal wording, which
is defensible on its own terms; the reviewer is the role that should have caught it, since it is
handed the original finding precisely so it can reject a fix that satisfies mis-scoped criteria
while missing what the finding asked for. It approved first-pass instead.

To be clear about what should *not* change: the other `IDEAS.md` mentions in that tree (e.g.
"RECOMMENDED FIX for IDEAS.md #1", "as IDEAS.md phrased it") are inside frozen idea reports quoting
the historical document, and are correct as historical record. Only the title and `h1` are stale
chrome.

Small follow-up, and the finding is worth re-staging for just those two lines.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087311550) · 2026-07-27
04:35:09 UTC</sub>

### bab6203939ef — [P2][dead-code] Windows backslash path conversions are vestigial after ADR-0062

**Issue**

Several scripts still normalize Windows separators although Windows dev support was dropped
(ADR-0062) and `scripts/CLAUDE.md` states scripts run only on macOS/Linux, where
`globSync`/`relative` never emit backslashes:

```js
.replace(/\\/g, '/')                                            // generate-icon-names
const posix = (p) => relative(ROOT, p).split('\\').join('/');    // image-audit
rel.split('\\').join('/')                                        // publish-scrapbook (×2)
ANDROID_HOME.replaceAll('\\', '/')                               // android-setup local.properties
```

These are unreachable no-ops that imply a platform matrix the project no longer supports, and they
mildly obscure the real logic.

**Fix**

Removed the backslash-to-forward-slash path conversions from `image-audit.mjs`,
`publish-scrapbook.mjs`, and `android-setup.mjs`, using `relative()` and `ANDROID_HOME` directly —
the scripts only run on macOS/Linux since ADR-0062, where those separators never appear. In
`image-audit.mjs` the `posix` helper became a bare passthrough, so it was inlined at both call sites
and deleted. Note: running the `scrapbook:index` acceptance command rewrites mtime-derived "Updated"
dates in `scrapbook/index.html`; that churn is unrelated and left uncommitted.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — two loose ends checked, both clear:

1. The finding lists **four** files but the fix summary names only three, omitting
   `generate-icon-names`. Grepped for the pattern repo-wide under `scripts/` — no backslash
   normalization survives anywhere, `generate-icon-names.mjs` included. The class is fully cleared;
   the summary just under-reports what it touched.
2. The disclosed uncommitted churn is real — `scrapbook/index.html` is dirty in the working tree —
   but benign: mtime-derived "Updated" dates in a generated index, no content change. I deliberately
   left it rather than reverting it, since editing tracked files while the driver is mid-finding
   races its own commit. Worth a glance at closeout in case it gets swept into an unrelated audit
   commit.

Contrast worth noting with the earlier `afb1601f21f1`, which **centralized** the same dead Windows
normalization in `tools/asset-gen/` rather than deleting it. This finding deletes it outright. Both
were reviewer-approved, so the repo now has the vestigial logic removed under `scripts/` and
preserved-but-consolidated under `tools/asset-gen/`. Not a defect — different findings asked for
different things — but if you want one story, `toPosix()` is now the last of it.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088347610) · 2026-07-27
07:11:06 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### 49582b09fa25 — [P4][dead-code] `breakdown.longTasksFromTrace` is computed but never surfaced

**Issue**

`categoryBreakdown` computes `longTasksFromTrace: { count, longestMs }` (line 153) and `analyze()`
includes it in the returned `breakdown` object. But `renderReport` reads only
`b.mainThreadBusyMs/scriptingMs/renderingMs/paintingMs` (lines 393-398) and the long-task section
uses `s.longTasks` from `metrics.json` instead (line 368). So `longTasksFromTrace` lands only in
`summary.json`, redundant with `metrics.longTasks`, and no consumer reads it (`grep` confirms one
definition, zero reads). It's dead weight that also invites confusion about which long-task count is
authoritative.

**Fix**

Trace-derived long-task totals now supply the normalized summary and report when runtime metrics are
absent, while present runtime metrics—including an empty array—remain authoritative. Focused
coverage verifies both source paths and the rendered count, total, and longest values.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091076491) · 2026-07-27
12:07:26 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### b23d526733bb — [P2][dead-config] Stray `</content></invoke>` tokens leaked into a shipped Play Store changelog

**Issue**

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

**Fix**

Removed the stray tool tags from the v1.2.0 source notes and regenerated the affected release
artifacts. The generator now validates all Fastlane store text against tag-shaped markup while
allowing ordinary angle-bracket prose, with focused test coverage.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095978157) · 2026-07-27
19:43:04 UTC</sub>

### 243f746cdea3 — [P2][dead-config] Capacitor template smoke-tests assert the wrong package and would fail if run

**Issue**

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

**Fix**

Deleted the placeholder JVM and instrumented Android tests, removing the stale
`com.getcapacitor.myapp` scaffolding without altering app identity or shipped behavior. Native
launch coverage remains with the existing Maestro smoke flow.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095979154) · 2026-07-27
19:43:10 UTC</sub>

### d7d2207167b0 — [P3][dead-config] google-services / Firebase scaffolding is wired up but the app has no push

**Issue**

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
screen-orientation, status-bar), no `google-services.json` (not tracked, not in `.gitignore`'s …

**Fix**

Removed the unused Google Services buildscript dependency and conditional plugin application,
eliminating Firebase template scaffolding without changing Android capabilities or behavior.

*Revised before approval:* Removed the stale Google Services/Firebase comment block from
`android/.gitignore`, leaving no Android references to the unused integration.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `android/.gitignore:65-66` still contains the stale Google Services/Firebase and
  `google-services.json` scaffolding, so the original finding’s required Android-wide grep does not
  return empty; remove that commented block.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095979694) · 2026-07-27
19:43:14 UTC</sub>

### d986bde03757 — [P3][dead-config] iOS requires the obsolete `armv7` capability on a 64-bit-only (iOS 16.4) app

**Issue**

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

**Fix**

Replaced the stale `armv7` device capability with the required `arm64` value so the App Store
metadata accurately reflects the app’s 64-bit-only iOS platform floor.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096229115) · 2026-07-27
20:05:27 UTC</sub>

### 376137c74112 — [P3][dead-config] pbxproj injects a `COCOAPODS` compile flag, but the project uses SPM not CocoaPods

**Issue**

The Debug config sets:

```
OTHER_SWIFT_FLAGS = "$(inherited) \"-D\" \"COCOAPODS\" \"-DDEBUG\"";
```

The `-DCOCOAPODS` conditional-compilation flag is a CocoaPods artifact, but this project migrated to
Swift Package Manager (the `mobile`/`ios` guidance explicitly says "SPM not CocoaPods", `.gitignore`
ignores `App/Pods`, and dependencies come from `CapApp-SPM/Package.swift`). Any `#if COCOAPODS`
branch in a dependency would now compile down the wrong (Pods) path in Debug, and the flag misleads
anyone reading the build settings into thinking Pods are in play.

**Fix**

Removed the stale `COCOAPODS` Swift define from the App target’s Debug configuration while
preserving the inherited flags, `-DDEBUG`, and the existing SPM setup.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096231652) · 2026-07-27
20:05:41 UTC</sub>

### fa8ad35a79c1 — [P3][dead-config] Unused `AppTheme.NoActionBar` style

**Issue**

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

**Fix**

Removed the unused `AppTheme.NoActionBar` definition while preserving the active application and
launch themes, eliminating dead Android theme configuration without changing behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096232997) · 2026-07-27
20:05:48 UTC</sub>

### 5804c5482fa5 — [P3][dead-config] Unused `activity_main.xml` layout — BridgeActivity never inflates it

**Issue**

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

**Fix**

Deleted the unused template layout and removed the redundant app-level CoordinatorLayout dependency,
while retaining the root version property Capacitor uses for its bridge layout.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096233500) · 2026-07-27
20:05:51 UTC</sub>

### 62b20c4bb404 — [P4][dead-config] `AppDelegate.swift` is wall-to-wall empty template lifecycle stubs

**Issue**

Five lifecycle methods (`applicationWillResignActive`, `applicationDidEnterBackground`,
`applicationWillEnterForeground`, `applicationDidBecomeActive`, `applicationWillTerminate`) have
empty bodies containing only the stock Apple template prose ("Sent when the application is about to
move from active to inactive state… Games should use this method to pause the game."). None of it
applies to Splotch, and the noise buries the two methods that *do* carry real logic (`open url` and
the `supportedInterfaceOrientationsFor` override at lines 42-60). A reader has to wade through
boiler comments to find the one intentional customization.

**Fix**

Removed the five empty lifecycle callback stubs and their Apple template comments, leaving UIKit’s
default handling in effect while preserving the app-specific delegate forwarding and orientation
logic.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096617514) · 2026-07-27
20:44:19 UTC</sub>

### 263b363ba2a0 — [P2][dead-config] Overly broad allow rules grant destructive commands without a prompt

**Issue**

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
…

**Fix**

Removed broad allow rules for destructive `git rm`, `find`, and `sed` commands, and constrained
localhost curl permissions to fixed read-only shapes so file-writing options require approval.

*Revised before approval:* Removed all three localhost curl allow rules because their trailing
wildcard also matched appended file-writing arguments and redirections. Curl commands now require
operator approval.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `.claude/settings.json:79-81` still auto-allows file-writing curl commands because the trailing
  `*` matches extra arguments or redirections, e.g. `curl -s http://localhost:5173 -o /path/file`;
  remove these rules or constrain them so nothing can follow the localhost URL.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096804079) · 2026-07-27
21:04:30 UTC</sub>

### 8556403f20bc — [P3][dead-config] `Bash(node scripts/*)` is fully redundant with `Bash(node scripts/**)`

**Issue**

```json
"Bash(node scripts/*)",
"Bash(node scripts/**)",
```

In gitignore-style matching `**` matches across path separators, so `scripts/**` already matches
everything `scripts/*` does (and more, e.g. `scripts/sub/x.mjs`). The `scripts/*` entry adds
nothing.

**Fix**

Removed the redundant `Bash(node scripts/*)` permission rule while retaining
`Bash(node scripts/**)`, which preserves nested-script coverage. No other permission rules were
changed.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096805857) · 2026-07-27
21:04:42 UTC</sub>

### e4a6341412ec — [P3][dead-config] `Bash(afplay *)` is a dead (and macOS-only) permission with no consumer in the repo

**Issue**

`afplay` is macOS's audio player. A repo-wide grep finds it only in `settings.json` — no hook,
skill, script, or `.ruler` source invokes it:

```
$ grep -rn "afplay" .claude .ruler scripts
.claude/settings.json:72:      "Bash(afplay *)",
```

It looks like a leftover from a since-removed notification/Stop-hook sound. It also can't work on
the Linux dev/cloud environments the project supports (ADR-0017). Dead config in the allow list
makes the real, load-bearing entries harder to audit.

**Fix**

Removed the unused `Bash(afplay *)` allow-list entry so Claude no longer receives an unnecessary
macOS-specific permission.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097056351) · 2026-07-27
21:33:01 UTC</sub>

### 1b2232954c89 — [P4][dead-config] `node --check` / `node --input-type=module -e` allows have no repo consumer and are undocumented

**Issue**

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

**Fix**

Removed the two unused standalone Node auto-approval rules so ad-hoc syntax checks and inline module
evaluation now require confirmation, while repository scripts retain their existing permission.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097212124) · 2026-07-27
21:52:09 UTC</sub>

### e4cb4737f363 — [P4][dead-config] `npm install *` auto-allows installing arbitrary packages without a prompt

**Issue**

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

**Fix**

Removed only the wildcard npm-install permission so package-specific installs require visible
approval while bare install and CI permissions remain allowed.

*Revised before approval:* Added a focused repository-script test that evaluates the configured Bash
permission globs, preserving bare `npm install`/`npm ci` while rejecting package and flag arguments.

**Adversarial review** — reviewer caught the following; addressed before approval:

* No regression check exercises the permission-policy change in `.claude/settings.json`; add a
  focused test asserting bare `npm install`/`npm ci` remain allowed while argument-bearing
  `npm install` commands are not.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097381726) · 2026-07-27
22:13:38 UTC</sub>

### f1e64ec67530 — [P3][dead-config] No `dependabot.yml` — nothing keeps the pinned actions or npm deps updated

**Issue**

There is no `.github/dependabot.yml`. Combined with the tag-pinned (or, if SHA-pinned, frozen)
actions above and the hand-maintained npm tree, action and dependency updates are entirely manual.
Security patches to `android-emulator-runner`, `checkout`, etc. land only if someone notices.

**Fix**

Added a Dependabot v2 configuration for weekly root GitHub Actions and npm updates. Minor and patch
Action updates are grouped into routine maintenance PRs, while major updates remain separate for
review.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097815414) · 2026-07-27
23:06:15 UTC</sub>

### b20e96b473aa — [P5][dead-config] `label-sync` comment references toggling `dry-run` that is already off

**Issue**

The header comment says "flip dry-run off / skip-delete as needed for a full sync," but the workflow
already sets `dry-run: false` (line 29). The comment describes a state that doesn't match the
config, so a reader has to reconcile "flip it off" against "it's already off." Minor staleness on an
otherwise well-documented file.

**Fix**

Updated the workflow header comment to accurately explain normal label application and the
`skip-delete` setting required for full reconciliation.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098135446) · 2026-07-27
23:49:17 UTC</sub>

### 8ae7b8b5ec2b — [P2][dead-config] No formatter owns JSON/YAML — config files drift unchecked

**Issue**

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

**Fix**

Prettier now owns hand-authored JSON, YAML, and web manifests, while frozen exploration JSON remains
narrowly excluded. Removed the unused dprint JSON plugin and dependency, formatted the newly covered
baseline, and aligned the formatter documentation.

*Revised before approval:* Restored `@dprint/json` and its dprint plugin registration so fenced JSON
in Markdown remains formatted. Updated ADR-0057 and the dependency inventory to clarify that the
plugin serves Markdown fences only; real JSON configuration remains Prettier-owned.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `dprint.json` removes `@dprint/json` even though ADR-0057 documents that plugin as the formatter
  for fenced `json` blocks and the repository contains many such blocks (for example in
  `.ruler/skills/api/SKILL.md`); keep the JSON plugin/dependency for Markdown fences while leaving
  real JSON configuration owned by Prettier, and restore the corresponding ADR and
  dependency-inventory entries.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098690315) · 2026-07-28
01:07:32 UTC</sub>
