# Audit comments — Duplication

101 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `8db62869d4ef` — [P3][duplication] `try { canvas.releasePointerCapture(id) } catch {}` repeated in four handlers

**Issue**

The identical guarded release appears in `startDrawing`, `discardPointer`, `stopDrawing`, and (a
`hasPointerCapture`-checked variant) `releaseAllPointers`. The empty `catch {}` and its rationale
live in four spots.

**Fix**

refactor(drawing): extract releaseCaptureSafe helper in engine.ts

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071307539) · 2026-07-24
15:04:19 UTC</sub>

### `af515ea82f2f` — [dedupe] dedupe the dot/path geometric-bounds scan across strokeOps.ts and undoHistory.ts

**Issue**

Both compute an op's bounds by `min/max`-scanning `startX/startY` and each seg's `cx,cy,x,y`, then
padding by half line width (+ AA pad). `strokeOps` uses `pad = op.lineWidth/2 + 2`; `undoHistory`
uses `PATCH_AA_PAD = 2` with a crayon scale. The `2` in strokeOps is the same AA pad, un-named. Two
implementations of one geometric fact will diverge (they nearly have: the crayon width-scale
handling only exists in one).

**Fix**

refactor(drawing): single-source op geometric-bounds scan and AA pad

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071307841) · 2026-07-24
15:04:20 UTC</sub>

### `817ec956387d` — [op-modifier-duplication] Op-modifier fields are hand-copied when building dot and path ops

**Issue**

Both op constructors copy the same five style modifiers off `PointerState`:

```ts
color: ps.color, erase: ps.erase, magic: ps.magic, crayon: ps.crayon, seed: ps.seed,
```

Adding a future modifier (or renaming one) requires touching both, and it is easy to miss one (they
would then disagree between the start dot and the stroke body).

**Fix**

refactor(drawing): extract strokeStyleOf for dot/path op modifiers

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071308223) · 2026-07-24
15:04:21 UTC</sub>

### `2253cffba753` — [P4][duplication] Speed-sampling reset is copy-pasted in three places

**Issue**

The "start a fresh sliding speed window" reset — `ps.speedSamples = [{ t: now, distance: 0 }]` (plus
`ps.lastTime = now` in two of them) — appears at pointer creation, on edge-swipe commit, and on
stroke resume. The zero-distance-anchor invariant (documented at 754) is re-encoded each time.

**Fix**

refactor(drawing): extract resetSpeedWindow helper for the speed-window reset

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309106) · 2026-07-24
15:04:26 UTC</sub>

### `aa9678cd5b86` — [P3][duplication] The `isAiGenerationActive(runId)` ownership guard is threaded ad hoc through both functions

**Issue**

The "am I still the current run?" check appears ~7 times: as `ownsRun()` guards in `autoSaveImages`
(lines 67, 81, 83) plus the signature-write guard reasoning (84-91), and as
`isAiGenerationActive(runId)` at lines 113, 146, 173, 176 in `generateAiImage`. Every state-mutating
helper (`setAiPreview`, `finishAiGeneration`, `failAiGeneration`) *also* re-checks ownership
internally in `ui.svelte.ts`. The concept is load-bearing (it's what makes the latest-request race
correct) but expressed inconsistently — a `boolean` predicate passed one place, an `id` re-checked
another — so a reader can't quickly confirm every early-return path is covered.

**Fix**

Standardized the AI-run ownership check in `web/src/lib/drawing/aiImage.ts`. Changed
`autoSaveImages`'s third parameter from `ownsRun: () => boolean` to `runId: number`, replaced all
three `if (!ownsRun()) return;` guards with `if (!isAiGenerationActive(runId)) return;` (guards stay
at the same three await points — before the AI-blob save, before hashing the drawing, before the
drawing-blob save), and updated the single call site in `generateAiImage` from
`() => isAiGenerationActive(runId)` to `runId`. Pure mechanical signature change, no behavior
change, no public API change (`autoSaveImages` is unexported). Now every ownership check in the file
goes through `isAiGenerationActive(runId)`.

Verification (all green):

* `npx vitest run src/lib/drawing/aiImage.test.ts` — 13 passed, including the two named
  ownership-race tests.
* `npm run check` — 0 errors, 0 warnings.
* `npm run test:unit` — 576 passed (56 files).
* `npx eslint src/lib/drawing/aiImage.ts` — clean.

Committed as c686aba0125b22590adc2631a49ab171569d5ab0.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959154) · 2026-07-24
16:19:51 UTC</sub>

### `edb7ab882ff0` — [P4][duplication] The gallery tag strings `'splotch-ai'` / `'splotch'` are duplicated across modules

**Issue**

`autoSaveImages` saves with the literal tags `'splotch-ai'` (line 80) and `'splotch'` (line 85), and
`AiImageResult.handleDownload` builds `splotch-ai-${timestamp()}.png` (line 56) with the same
`splotch-ai` prefix as a separate literal. `web/src/lib/drawing/screenshot.ts` also defaults
`baseName = 'splotch'`. The download filename and the auto-save tag are meant to match but are
independent strings; changing the brand prefix means hunting every literal.

**Fix**

Deduped the 'splotch'/'splotch-ai' basename literals into DRAWING_BASENAME/AI_IMAGE_BASENAME
constants in screenshot.ts, consumed via the existing dynamic import in aiImage.ts (preserving the
issue \#461 lazy edge) and the existing static import in AiImageResult.svelte. Pure
literal-to-constant refactor; gallery tags and download filename are byte-identical.

Deviation flagged: the brief's criterion "aiImage.test.ts passes unmodified" is not literally
achievable — that test replaces ./screenshot with a vi.mock factory exporting only saveImageBlob,
and Vitest factories throw on undefined-export access, so destructuring the new constants threw into
the catch and turned 4 tests red (verified empirically). Minimal fix: added
AI_IMAGE_BASENAME/DRAWING_BASENAME to that existing mock factory with their real values. No
assertion was changed; the tag assertions still require the genuine 'splotch-ai'(x2)/'splotch'(x1)
values.

All acceptance green: npm run check 0 errors; test:unit 576/576 (aiImage.test.ts 13/13); npx eslint
on all 4 changed files exit 0; E2E flows.spec.ts 'the AI button posts the drawing and reveals the
generated result' 1 passed; both grep criteria satisfied. Committed.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959267) · 2026-07-24
16:19:52 UTC</sub>

### `fcce53cec20b` — [P2][duplication] The `BOOL_SETTINGS` table pattern doesn't cover the non-boolean settings, defeating its own guarantee

**Issue**

The `BOOL_SETTINGS` table exists explicitly to make "forgetting the reloadSettings entry …
impossible" (comment, lines 57-59) by generating the `$state` init, setters, and `reloadSettings()`
from one source. But that guarantee only holds for booleans. The four non-boolean settings —
`soundVolume`, `actionButtonScale`, `aiAccessToken`, `theme` — are each hand-wired in **three**
separate places:

```ts
// init (150-162):
soundVolume: clampVolume(readInt(SOUND_VOLUME_KEY, SOUND_VOLUME_DEFAULT)),
actionButtonScale: clampButtonScale(readInt(ACTION_BUTTON_SCALE_KEY, …)),
// setters (197-207): setSoundVolume, setActionButtonScale …
// reload (256-261):
settings.soundVolume = clampVolume(readInt(SOUND_VOLUME_KEY, settings.soundVolume));
…
```

**Fix**

Added an `INT_SETTINGS` table (key/default/clamp per property) alongside `BOOL_SETTINGS` and
generated `soundVolume`/`actionButtonScale`'s init, setters (`makeIntSetter`), and reload loop from
it, so each is defined once rather than hand-wired in three places. The `Settings` interface now
derives those two keys via `Record<IntSettingKey, number>` with the doc comments moved onto the
table entries.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073001881) · 2026-07-24
18:08:47 UTC</sub>

### `fc75aea13ab8` — [P2][duplication] `ui.svelte.ts` repeats four identical modal open/close pairs and mixes in the whole AI state machine

**Issue**

Two smells in one module. First, four structurally identical modal pairs:

```ts
export function openColorPicker(origin) {
  ui.colorPickerOrigin = origin;
  ui.colorPickerOpen = true;
}
export function closeColorPicker() {
  ui.colorPickerOpen = false;
}
// …repeated verbatim for coloringBook, parentCenter, aiPrompt (lines 76-105)
```

Each modal contributes an `xOpen: boolean` + `xOrigin: Origin | null` field and an open/close pair —
pure boilerplate that grows linearly with every new modal.

Second, the module also embeds the entire **AI generation state machine** (lines 34-40 private
`activeAiGeneration`/`nextAiGenerationId`, plus `startAiGeneration`, `setAiPreview`,
`finishAiGeneration`, `failAiGeneration`, `endAiGeneration`, `closeAiResult`, …

**Fix**

Extracted a reusable `createModal()` primitive into a new `modal.svelte.ts` (owning the `Origin`
type) and replaced the four duplicated `openX`/`closeX` field-pairs in `ui.svelte.ts` with
`colorPicker`/`coloringBook`/`parentCenter`/`aiPrompt` modal objects, repointing every consumer to
the flat `.open`/`.origin`/`.show`/`.hide` API. Following the `aiKey`/`saveFolder` precedent, moved
the AI-generation state machine (functions + private run bookkeeping + `swapObjectUrl`) into a new
`aiGeneration.svelte.ts` while leaving the `ui.aiXxx` `$state` fields in place, so the many direct
field readers stay untouched and only import paths shifted.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073002142) · 2026-07-24
18:08:49 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### f1f4df8edbee — [P4][duplication] Three near-identical `reloadX` functions each re-derive their init lines

**Issue**

Each persisted store hand-writes a `reloadX()` that re-reads the same keys the `$state` initializer
already read, then registers it via `onDurableRestore`. For `strokeWidth`:

```ts
// init:   penSize: readInt(PEN_SIZE_KEY, DEFAULT_SIZE, STROKE_SIZES)
// reload: strokeState.penSize = readInt(PEN_SIZE_KEY, strokeState.penSize, STROKE_SIZES)
```

The init expression and the reload expression are the same read with a different fallback —
duplicated per field, per store. The `onDurableRestore(reloadX)` registration is likewise
copy-pasted in each module.

**Fix**

Extracted a `readStrokeLevel(key, fallback)` helper closing over `readInt`/`STROKE_SIZES` in
strokeWidth.svelte.ts, and used it for both the `$state` initializer and `reloadStrokeWidth()`,
removing the repeated key/allow-list/cast between init and reload — matching the pattern already
used in tool.svelte.ts.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074733462) · 2026-07-24
21:47:33 UTC</sub>

### 002e2f0abc24 — [P2][duplication] Extract a shared status-message component (`report-message` / `byok-message` are the same block)

**Issue**

Both files render an identical inline status/alert region:

```svelte
<p class="X-message" class:error={status==='error'} class:success={status==='success'}
   role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
```

and duplicate the same CSS (`.X-message` + `.X-message.success` → `--success-wash`/`--success-text`,
`.X-message.error` → `--danger-wash`/`--danger-text`). The a11y wiring (role swap by status,
`aria-live="polite"`) is subtle and easy to get subtly wrong on the next copy.

**Fix**

Added `lib/components/design/StatusMessage.svelte` — a token-styled `<p>` that owns the
success/danger wash plus the `role="alert"`/`role="status"` swap and `aria-live="polite"` — and
pointed ReportForm and AiKeyManager at it, deleting their `.report-message*` / `.byok-message*`
rules (ReportForm keeps only the trailing-link rule, now `.report-message-link`). It lands in
`design/` rather than `parent/` because AdminConsole's `flash` block is a third instance of the same
shape, which is what ADR-0071's "extract at the third duplicate" rule asks for; per that ADR's house
rule the new primitive is also registered on `/dev/design` and in the `design` skill's primitives
table. AdminConsole itself is deliberately not migrated — it lacks `aria-live`, has an extra
unconditional warning variant, and sits on the light-only admin surface.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/a11y.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074734401) · 2026-07-24
21:47:38 UTC</sub>

### 3fa707e7549b — [P2][duplication] Extract a disclosure/`<details>` primitive — the chevron idiom is copied three times

**Issue**

Three components each hand-roll the same collapsible-`<details>` styling:
`summary { list-style: none }`, `summary::-webkit-details-marker { display: none }`, a
`::after { content: '›' }` chevron, and `[open] summary::after { transform: rotate(90deg) }`.
ReportForm's comment even points at the shared idiom: *"same chevron idiom as the BYOK how-to"*
(`ReportForm.svelte:339`). Any change to the disclosure affordance must be made in three places.

**Fix**

Added `web/src/lib/components/design/Disclosure.svelte` — a `<details>` primitive owning the
bordered shell, the hidden `-webkit-details-marker`, and the rotating `›` chevron (plus the
`cursor: pointer; user-select: none;` affordance, which was also byte-identical at all three sites)
— and switched `SetupInstructions`, `AiKeyManager`, and `ReportForm` over to it, each passing its
`summary` as a snippet and keeping its own padding/type/color/background under the forwarded
`class`. One mechanical deviation from the brief: Svelte prunes a parent selector for a class handed
to a component (verified by compiling — it emits `css_unused_selector` and drops the rule), so each
call site's chrome now reaches the primitive's markup through an ancestor-scoped `:global(...)` —
same pattern the repo already uses for `:global(.step-icon)` and friends — rather than a plain
scoped selector. `ReportForm`'s `transition:slide` moved to a wrapping `<div>` since transition
directives can't attach to a component instance.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074734541) · 2026-07-24
21:47:40 UTC</sub>

### 620adac5a623 — [P3][duplication] Single source of truth for `APP_VERSION` — it's redefined four times

**Issue**

The exact expression `typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'` is
copy-pasted in four modules. It's low-risk but pure duplication of a compile-time constant guard,
and it's not grep-discoverable as "the app version" — each site reinvents it.

**Fix**

Added `web/src/lib/appVersion.ts` exporting a single `APP_VERSION` constant and replaced the four
copy-pasted local definitions (`lib/deviceInfo.ts`, `lib/components/parent/sections.ts`,
`CompactShell.svelte`, `AboutSection.svelte`) with an import of it. A dedicated top-level `lib/`
module keeps general lib code from having to import a component-scoped parent-settings file; the
computed value and every call site's usage are unchanged, so there is no behavioral difference.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075023179) · 2026-07-24
22:22:02 UTC</sub>

### 4d3956378a3d — [P3][duplication] `.slider-label` block duplicated between SoundSection and ControlsSection

**Issue**

The `.slider-label` rule (flex, space-between, `gap:12px`, `margin-bottom:8px`, `--font-size-sm`,
`weight 600`, `--text-mid`) is byte-identical in both slider-bearing sections, and both also
duplicate the `.slider-setting` wrapper concept. A slider label + value + `<Slider>` is a recurring
unit.

**Fix**

Added `parent/SliderRow.svelte` — a prop-driven label-row + `<Slider>` pair that owns the previously
duplicated `.slider-label` CSS and derives the slider's `labelId` and `aria-valuetext` from the same
`id`/`valueText` inputs as the visible label, so the two can no longer drift. The optional `icon`
prop branches the name span into the `.slider-label-name` typography, preserving Button Size's
larger/lighter name next to its plain-styled percentage. Each call site keeps its own wrapper div,
margins, `transition:slide`, and visibility gating.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075023262) · 2026-07-24
22:22:03 UTC</sub>

### 2b67b3a766bb — [P4][duplication] `install.svelte.ts` repeats the oneTap→manual fallback three times

**Issue**

The same demotion appears three times across `promptInstall`:

```ts
if (install.mode === 'oneTap') install.mode = manualMode();  // 129 and 141
…
install.mode = manualMode();                                  // 149 (declined branch)
```

Lines 129 and 141 are byte-identical; 149 is the unconditional variant. The "a spent/stale one-tap
prompt drops to the manual hint" rule is scattered.

**Fix**

Extracted the three identical `if (install.mode === 'oneTap') install.mode = manualMode();` demotion
checks in `promptInstall` into a single `fallBackToManualHint()` helper, since all three call sites
needed the same guard (confirmed `deferredPrompt` being truthy always implies
`install.mode === 'oneTap'` at the declined-branch call site). Verified with the file's unit tests
(18/18 passing), `npm run check` (0 errors), and eslint (clean) — no test or behavior changes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075037207) · 2026-07-24
22:23:58 UTC</sub>

### 06dc99a03a4b — [P4][duplication] The iOS-zoom input comment + `max(16px, var(--font-size-md))` is copy-pasted

**Issue**

Both text inputs carry the identical four-line comment (*"Never below 16px: iOS Safari / WKWebView
zoom … (ADR-0076)"*) followed by `font-size: max(16px, var(--font-size-md));`. This constraint
applies to every parent-center input; duplicating the rationale invites one copy drifting or a new
input forgetting it entirely.

**Fix**

Promoted the duplicated `max(16px, var(--font-size-md))` iOS-zoom floor and its ADR-0076 rationale
comment out of ReportForm.svelte and AiKeyManager.svelte into a new `scale.inputFontSize` design
token (`--input-font-size`), so both inputs now reference the single token instead of carrying
identical inline comments. Regenerated tokens.css via `npm run gen:tokens`; all acceptance checks
(grep, gen:tokens:check, svelte-check, unit tests, eslint, parent-zoom.spec.ts) pass green.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Incomplete: the new `inputFontSize` token is invisible on the /dev/design styleguide.
  web/src/routes/dev/design/+page.svelte:31-36 partitions `scale` by key prefix
  (space*/radius*/fontSize*/shadow*/duration*|ease*); `inputFontSize` matches none, making it —
  verified programmatically against the real object — the only key in `scale` that renders in no
  section, directly contradicting the page's own copy at line 57: "If it's not on this page, it's
  not part of the visual language."

**E2E gate** — `tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748428) · 2026-07-25
00:10:54 UTC</sub>

### 4cc1bbdb7891 — [P1][duplication] BrushMenu and StrokeWidthMenu duplicate ~90% of their markup and style blocks — extract a shared flyout primitive

**Issue**

The two flyout popovers are near-identical presentational components. Both render
`<div class="flyout-menu … " hidden={!open} style:color={…}>` wrapping an `{#each}` of
`.flyout-option` buttons that report a pick via `onpick`. Their `<style>` blocks are copy-paste: the
entire `.flyout-menu` rule
(position/left/bottom/flex/gap/padding/`--float-surface`/`border-radius:16px`/`--float-shadow-flyout`/`z-index:901`),
the two portrait media queries (`orientation: portrait` and
`(orientation: portrait) and (max-width: 540px)`), `.flyout-menu[hidden]`, and the full
`.flyout-option` rule (width/height `calc(60px * var(--action-btn-scale,1))`, `border-radius:14px`,
padding, transition list, `:hover`, `:active { transform: scale(0.92) }`, `.active`, and …

**Fix**

Moved the `.flyout-menu` / `.flyout-option` chrome that BrushMenu and StrokeWidthMenu carried
identically into a single commented block in `app.css`, following the `.corner-button` precedent the
design skill names for shared canvas-floating chrome (rather than extracting a `FlyoutMenu`
component, which the same skill's "extract at the third duplicate" rule rules out at two consumers).
Svelte's `:global(...)` wrapper on the active-icon fill rule was unwrapped since app.css is already
unscoped; each component keeps only its genuinely distinct rules — the eraser-mode sizing and the
two white-stroke/dark-stroke keylines, whose selectors differ in specificity and were deliberately
left unmerged.

**Adversarial review** — reviewer caught the following; addressed before approval:

* [doc-drift] `.ruler/skills/design/SKILL.md:66` is the canonical registry of what lives unscoped in
  app.css — "Shared *global* patterns (modal shell, close button, corner buttons, dialog fly-in)
  remain classes in `app.css` because dialogs and imperative DOM need them unscoped." The commit
  adds a fifth shared global pattern (`.flyout-menu` / `.flyout-option`) without updating it, and
  the stated rationale actively excludes it: flyouts are neither dialogs nor imperative DOM. An
  agent reading that sentence before styling a component would conclude the flyout chrome does not
  belong in app.css and re-duplicate it into the components — the exact regression this commit
  fixes. CLAUDE.md requires stale docs be updated in the same task. Fix: extend the parenthetical
  and the rationale in `.ruler/skills/design/SKILL.md` (the ruler SOURCE, never the generated
  `.claude/skills/` or `.agents/skills/` copies), then run `npm run ruler:apply` and commit the
  regenerated output — `npm run ruler:check` is a CI drift gate.
* VERIFIED CLEAN — CSS relocation is byte-for-byte faithful. I diffed both removed component blocks
  against the added app.css block: declarations identical; only comment prose was merged ("active
  pen color" -> "active pen/eraser color", "The selected brush"/"The selected size" -> "The selected
  entry").
* VERIFIED CLEAN — specificity drop from Svelte-scoped (0,N+1,0) to global (0,N,0) is safe. Checked
  in the built stylesheet:
  `.stroke-width-menu.eraser-mode.svelte-11q0ntb .flyout-option:where(.svelte-11q0ntb)` = (0,4,0)
  still beats `.flyout-option` (0,1,0), so eraser-mode `padding:0` and the 56px icon pin hold;
  ActionsPanel's top-level (therefore hash-less, truly global)
  `:global(.action-icon:not(.icon-color) svg)` = (0,2,1) is still beaten by app.css
  `.flyout-option.active .action-icon:not(.icon-color) svg` = (0,3,1), so the active brand tint
  holds; `#eraserButton{display:none}` still wins on ID over `.flyout-option{display:flex}`.
* VERIFIED CLEAN — no stragglers. Repo-wide grep for `.flyout-menu`/`.flyout-option` finds them used
  only in BrushMenu.svelte and StrokeWidthMenu.svelte (remaining hits are `web/.netlify` build
  output, `docs/AUDIT.md`, and `docs/adrs/0067`). Globalizing the classes cannot leak styles onto
  any other component. ADR-0067:35 already called these "shared" classes, so the commit makes that
  claim true rather than stale.
* VERIFIED CLEAN — built-CSS inspection (the E2E run produced a real production build): the
  `box-shadow` rgba -> `color-mix` fallback pair survived minification (`#ab71e159` then
  `color-mix`), and both portrait media queries are present in the correct order
  (`@media (orientation:portrait)` -> row, then `and (width<=540px)` -> column). The
  `max-width:540px` -> `width<=540px` rewrite is the targets-aware minifier and applied to the
  component-scoped CSS before this commit too — not a regression.
* VERIFIED CLEAN — commands I ran myself: `npm run check` 926 files 0 errors 0 warnings;
  `npm run test:unit` 579 passed / 57 files; `npm run test:e2e -- flows.spec.ts` 43 passed including
  both named tests (`the stroke flyout clears the Parent Center button on a phone`,
  `the stroke flyout stays on-screen after rotating to landscape`); `npx eslint` on the two changed
  .svelte files clean (app.css is not an eslint target); `npm run lint:tokens` passed — the
  `rgba(171,113,225,.35)` one-off moved between files without tripping the per-file raw-hex ratchet;
  `npm run format:check` clean (prettier + dprint).
* SCOPE JUDGMENT — the finding's headline proposed a `FlyoutMenu.svelte` primitive, but explicitly
  offered the app.css route as a sanctioned alternative ("since the CSS is the bulk of the
  duplication, move the rules into app.css (like `.corner-button`)"). The commit takes it, and it is
  the option consistent with the design skill's "extract a new primitive at the third duplicate, not
  before". The finding's actual complaint — sizing, the 540px breakpoint, and the active-state ring
  having to be changed twice and hand-synced — is fully resolved: each now exists exactly once. The
  residual ~8-line markup duplication is genuinely divergent (different props, icons, and keyline
  classes) and is not a defect.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076313745) · 2026-07-25
02:13:50 UTC</sub>

### ff7fe1feaca4 — [P2][duplication] Accept-radius factor 0.4 is duplicated as a magic literal instead of importing the named constant

**Issue**

`getAcceptRadius()` computes `Math.min(window.innerWidth, window.innerHeight) * 0.4` to size the
coachmark ring so it matches the real accept zone. But `dragToClear.ts:6` already defines
`const ACCEPT_RADIUS_FACTOR = 0.4;` and uses it (`dragToClear.ts:51`) for the *actual* threshold.
The magic `0.4` is copied into the component. If the real threshold factor changes, the coachmark
ring silently misrepresents where the user must drag — a correctness bug hidden as a duplicated
literal.

**Fix**

Exported `ACCEPT_RADIUS_FACTOR` from `dragToClear.ts` and had `ClearCoachmark.svelte` import it in
place of its own hardcoded `0.4`, so the coachmark ring is now derived from the same constant as the
real accept zone and can't silently drift if the threshold changes. `getAcceptRadius()` stays
private in both files; the radius value is unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/clear-tutorial.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076314146) · 2026-07-25
02:13:51 UTC</sub>

## PR [\#542](https://github.com/KyleMit/Splotch/pull/542) — Cut the audit burndown over to run cloud-native (+ 7 findings) (2026-07-25)

### 5abebc36b105 — [P3][duplication] Coachmark ghost button re-hardcodes the real button's gradient and shadow

**Issue**

`.coachmark-button` (404-405) repeats `.clear-button`'s `linear-gradient(135deg, #ff6b6b, #ee5a6f)`
and a near-identical `box-shadow`, so the tutorial's ghost stays a faithful mimic of the real
control. But the coupling is by copy: restyle the real button and the ghost silently diverges from
what it's supposed to teach. (Compounds the P1 clear-palette finding.)

**Fix**

Added a `clearGradientRest` entry to the theme-independent `scale` object in
`web/src/lib/design/tokens.ts`, regenerated `web/src/tokens.css`, and pointed both `.clear-button`
and `.coachmark-button` at the resulting `var(--clear-gradient-rest)` so the tutorial ghost tracks
the real control's rest fill from one source. Pure value extraction — the rendered gradient is
byte-identical, and the drifted box-shadows and drag/delete-ready states were left alone per the
brief.

*Revised before approval:* Updated `scripts/lint-token-styles.mjs` BASELINE for the
`--clear-gradient-rest` extraction: `ClearButton.svelte` lowered from 4 to 2 with a rewritten
comment (the remaining hexes are the armed danger red; the at-rest fill now points at the shared
token), and the `ClearCoachmark.svelte` entry plus its stale "copy of that same unthemed danger-red
gradient" comment removed since it now has 0 raw hexes. Verified with `npm run lint:tokens` (passes,
14 allowlisted files); the `countRawHex` unit test does not reference either entry.

*Revised before approval:* Addressed all three remaining review points in 825b003: (1) added an
"Unthemed fills" section to `web/src/routes/dev/design/+page.svelte` rendering
`--clear-gradient-rest` as a live swatch, since the prefix-based scale bucketing left it invisible;
(2) added a `Fill` row for `--clear-gradient-rest` to `.ruler/skills/design/SKILL.md`'s token
vocabulary table and re-ran `npm run ruler:apply` to regenerate the `.claude/` and `.agents/`
copies; (3) widened the `scale` group doc comment in `web/src/lib/design/tokens.ts` to admit
unthemed fills (kept the token in `scale` rather than moving it — `brand` is the accent family and
`ThemeTokens` demands a light/dark pair this value deliberately lacks). Verified: `gen:tokens:check`
up to date, `lint:tokens` passed, `format:check` clean (Prettier + dprint), `npm run check` 0 errors
across 927 files, and `npx playwright test tests/clear-tutorial.spec.ts tests/flows.spec.ts` passed
44/44.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/lint-token-styles.mjs` BASELINE is now stale and `npm run lint:tokens` (CI Quality job)
  fails: `lib/components/ClearButton.svelte` is listed at 4 raw hexes but its style block now has 2
  (only `#ff3838, #d63031` at line 154) — lower the entry to 2 and update its comment.
* Same lint: `lib/components/ClearCoachmark.svelte` is listed at 2 raw hexes but now has 0, and the
  ratchet errors on counts below baseline — remove its BASELINE entry (and the "copy of that same
  unthemed danger-red gradient" comment, which the extraction just made untrue).
* `clearGradientRest` is invisible on `/dev/design`: `web/src/routes/dev/design/+page.svelte:31-37`
  buckets `scale` keys by prefix (`space`/`radius`/`fontSize`/`shadow`/`duration`/`ease`), so the
  new key falls into no section while the page header claims "If it's not on this page, it's not
  part of the visual language."
* The design skill's token vocabulary table (`.ruler/skills/design/SKILL.md:34-50`) has no entry for
  `--clear-gradient-rest`, so the next agent styling clear chrome won't find it and will re-paste
  the literal — the exact coupling-by-copy the finding is about.
* `clearGradientRest` sits in `scale`, whose doc comment scopes the group to "spacing, corners,
  type, and motion" — a color-bearing gradient there contradicts the comment.

**E2E gate** — `tests/clear-tutorial.spec.ts tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078509540) · 2026-07-25
12:38:49 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### e1952146b1c8 — [P3][duplication] NotchBand runs two near-identical status-bar effects that each re-import the plugin

**Issue**

Two separate `$effect`s both guard on `__IS_CAPACITOR__ && isNative()` and both
`import('@capacitor/status-bar').then(...)` — one to set `Style`, one to `hide()/show()`. The import
boilerplate and the platform guard are duplicated, and the two effects fire independently on the
same `band` recompute. It's more code to read and two places to keep the guard correct.

**Fix**

Collapsed the two `$effect` blocks in `NotchBand.svelte` into one that reads `band.statusBarStyle`
and `band.statusBarHidden` up front, returns early off `__IS_CAPACITOR__ && isNative()`, and applies
both the style and the hide/show inside a single `import('@capacitor/status-bar')` — `band` is one
`$derived` object, so rerun timing is unchanged. Both existing rationale comments were preserved
above the merged effect, with the now-false "(here and below)" parenthetical dropped since only one
`__IS_CAPACITOR__` site remains.

*Revised before approval:* Addressed both review points and amended the fix into one commit
(ce0f4e10afa5, replacing the unpushed 7b04724). (1) Restored the positive compile-time guard —
`if (__IS_CAPACITOR__ && isNative()) { import('@capacitor/status-bar').then(...) }` — so the plugin
load sits inside a statically-false branch Rollup folds out, matching
storage.ts/haptics.ts/DrawingCanvas.svelte and the comment above it; the merged style + hide/show
application stays inside the single `.then()`, so `grep -c "@capacitor/status-bar"` is still 1. (2)
Deleted the finding's `[P3][duplication]` entry from docs/AUDIT.md through its trailing `---` using
`scripts/audit-burndown/pop.mjs --delete`, leaving a clean seam into the next entry, so the commit
now has the same shape as b638def. Gates re-run green: `npm run check` (0 errors, 927 files),
`npm run test:unit` (579 passed), eslint on the component clean, `npm run format:check` clean for
Prettier and dprint.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The finding's entry is still present at docs/AUDIT.md:10 — this commit touches only
  web/src/lib/components/NotchBand.svelte, whereas the preceding fix commit (b638def) deleted its
  AUDIT.md entry in the same commit. Delete the '[P3][duplication] NotchBand runs two near-identical
  status-bar effects' entry (through its trailing `---`) as part of this fix.
* web/src/lib/components/NotchBand.svelte:45 inverts the compile-time guard into
  `if (!__IS_CAPACITOR__ || !isNative()) return;`, leaving the `import('@capacitor/status-bar')`
  outside any statically-false `if` block — while the comment two lines above still claims the
  literal keeps the plugin out of the web bundle, and every other native-gated import in the repo
  (storage.ts, haptics.ts, secureStorage.ts, orientation.ts, network.svelte.ts, screenshot.ts,
  DrawingCanvas.svelte) uses the positive `if (__IS_CAPACITOR__ && isNative()) { import(...) }`
  form. Restore the positive-guard shape so the dead-code elimination is a folded-false branch
  rather than a post-return unreachable statement; nothing in the test suite asserts web-bundle
  contents, so a regression here is silent.

> [!NOTE]
> The first of those two review points is the bug fixed in f389dd39 — the reviewer could not see
> that the driver excises the entry itself, after approval. Complying with it is what destroyed the
> `[P4][readability] ActionsPanel` finding in this commit. The second point is a real catch and the
> reason the adversarial reviewer earns its keep.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079050770) · 2026-07-25
15:26:30 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 01de4be7a8c1 — [P1][duplication] Login flow (rate-limit + secret verify) is copy-pasted across the two front doors

**Issue**

Both doors independently re-implement the identical login sequence: build the same bucket key,
throttle, extract the credential, and verify it.

```ts
// login/+server.ts
const { limited, retryAfter } = rateLimit(`admin-login:${getClientAddress()}`);
if (limited) return throttled(retryAfter);
const key = typeof body?.key === 'string' ? body.key : '';
if (!verifyAdminSecret(key)) { ... }
```

```ts
// +page.server.ts login action
const { limited, retryAfter } = rateLimit(`admin-login:${getClientAddress()}`);
if (limited) { return fail(429, ...); }
const key = String(form.get('access-key') ?? '');
if (!verifyAdminSecret(key)) { return fail(403, ...); }
```

The `admin-login:${getClientAddress()}` bucket key is a load-bearing shared string (the API skill …

**Fix**

Added `attemptAdminLogin(ip, key)` to `web/src/lib/server/admin.ts`, which owns the shared
`admin-login:<ip>` bucket key, the throttle, the secret check, and the session mint, and rewired
both the `/api/admin/login` handler and the `/admin` page's `login` action to call it while keeping
their own transport-specific response mapping. One behavioural nuance the brief's shape implies: the
JSON endpoint now parses its body before throttling (the key is needed to call the helper), so a
throttled request carrying a malformed body gets the uniform 400 from `readJsonBody` instead of a
429 — the throttle still precedes the key check, so the oracle is unchanged.

*Revised before approval:* Addressed both review points. (1) Behavioural drift fixed:
`attemptAdminLogin` is replaced by a two-step `beginAdminLogin(ip)` returning either a 429 verdict
or a `verify(key)` continuation, so each transport throttles before parsing its payload — the JSON
endpoint again returns 429 + Retry-After (not 400) to a throttled caller sending malformed JSON, and
the form action throttles before `request.formData()`. One call spends one hit, so nothing
double-counts, and the two-step shape makes the ordering structural rather than conventional. (2)
Coverage added: unit tests for `beginAdminLogin` in `admin.test.ts` (one hit per call, 10 allowed /
11th 429, per-IP isolation), plus a new `web/src/routes/admin/login.integration.test.ts` that drives
both real handlers against the real rateLimit module, alternating doors across the full allowance
and asserting the 11th attempt at either door is throttled even with the correct secret — the layer
that would actually catch a route reintroducing its own bucket key. Verified the ordering tests are
not vacuous by reintroducing the regression in both routes and confirming both fail (400 from
readJsonBody; formData TypeError), then restoring the files and diffing them byte-for-byte against
pre-experiment backups. Gates green: check, test:unit (645), eslint on all five files, admin E2E
(8), api:smoke (27), format:check.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Behavioural drift: the throttle now runs *after* body parsing in both doors.
  `web/src/routes/api/admin/login/+server.ts:17-19` awaits `readJsonBody` before
  `attemptAdminLogin`, so a caller who has exhausted the shared bucket and sends malformed JSON now
  gets `400 Expected a JSON body` instead of the `429` + `Retry-After` it got before;
  `web/src/routes/admin/+page.server.ts:89-92` likewise awaits `request.formData()` before
  throttling. The removed comments stated the limiter's job was to short-circuit unauthenticated
  work up front, and the acceptance criteria require unchanged behaviour. Restore the original
  ordering while keeping the bucket and verify shared — e.g. have `admin.ts` export a two-step form
  (`beginAdminLogin(ip)` returning either `{ ok: false, status: 429, retryAfter }` or a
  `verify(key)` continuation) so each transport can check the throttle before it parses its payload,
  without double-counting a hit.
* The shared-bucket guarantee this extraction exists to protect is untested:
  `scripts/api-smoke.mjs:26-47` covers only login 403/200, `web/tests/admin.spec.ts` exercises no
  throttling, and there is no unit test for `attemptAdminLogin`. Now that the sequence is a pure
  exported function, add a unit test beside it asserting that hits from the form-action path and the
  JSON-endpoint path share one budget for the same IP (10 calls allowed, the 11th returns
  `{ ok: false, status: 429 }` regardless of which door made the earlier calls).

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080231045) · 2026-07-25
19:22:41 UTC</sub>

### 67bb0ac750f1 — [P2][duplication] Add/remove token mutations share an entire retry scaffold

**Issue**

The two exported mutations are the same read-modify-CAS-retry loop with only the transform
differing:

```ts
for (let attempt = 1; attempt <= MUTATION_ATTEMPTS; attempt++) {
  const read = await readStore();
  if (read.source === 'unconfirmed') return { ok: false, error: TOKEN_CONFLICT_ERROR };
  const { store, list, etag } = read;
  // ...compute `next`...
  if (await persist(store, next, etag)) return { ok: true, tokens: next };
}
return { ok: false, error: TOKEN_CONFLICT_ERROR };
```

The retry count, the unconfirmed-source bailout, the conflict sentinel, and the loop structure are
duplicated. A change to the concurrency strategy (attempt count, backoff, how `unconfirmed` is
handled) must be edited in two spots, and the `removeToken` copy has an extra `deleteUsage` side …

**Fix**

Added an internal `mutateList(transform, afterPersist?)` helper in `web/src/lib/server/tokens.ts`
that owns the read-modify-CAS retry loop, and reduced `addToken`/`removeToken` to their transform
closures (dup-check vs. filter + no-op short-circuit, with `deleteUsage(t)` as the remove-side
`afterPersist`), so the retry/conflict semantics live in one place. One deviation from the brief's
sample snippet: the no-op branch returns `[...list]` rather than `list`, preserving the fresh array
`removeToken` previously returned instead of exposing the store's own array to callers.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080486042) · 2026-07-25
20:39:09 UTC</sub>

## PR [\#545](https://github.com/KyleMit/Splotch/pull/545) — Audit burndown: 7 findings fixed, plus a driver data-loss fix (2026-07-25)

### 348d813d976f — [P3][duplication] Request-field extraction `typeof body?.X === 'string' ? body.X : ''` is repeated across every admin endpoint

**Issue**

Every JSON endpoint pulls its one field the same defensive way:

```ts
const key = typeof body?.key === 'string' ? body.key : ''; // login
addToken(typeof body?.token === 'string' ? body.token : ''); // tokens POST
removeToken(typeof body?.token === 'string' ? body.token : ''); // tokens DELETE
```

Three copies of a fiddly type-narrowing expression that's easy to get subtly wrong (e.g. forgetting
the `?.`). It reads as noise around the actual logic.

**Fix**

Added a `stringField(body, name)` helper to `web/src/lib/server/http.ts` beside `readJsonBody` and
routed the three admin endpoint call sites (login `key`, tokens POST/DELETE `token`) through it, so
the defensive type-narrowing lives in one place instead of being re-spelled inline. Also updated
`readJsonBody`'s docstring, which pointed at the now-removed inline ternary, to reference the new
helper.

*Revised before approval:* Reworded the `readJsonBody` docstring in `web/src/lib/server/http.ts` so
it covers both field-probing forms present in the repo: the inline `typeof body?.x === 'string'`
still used by `verify-key`, `verify-access-code`, and `report` (which trim or test the value in
place), and the new `stringField` wrapper used by the admin endpoints. Amended into the original
commit; gates re-run green (check, eslint, 645 unit tests, admin.spec.ts e2e).

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/server/http.ts:5-6` — the reworded `readJsonBody` comment now claims endpoints probe
  fields "via `stringField` below", which is false for the four non-admin callers that still use
  `typeof body?.x` (`api/verify-key/+server.ts:19`, `api/verify-access-code/+server.ts:25`,
  `api/report/+server.ts:66,76,83`). Reword so it covers both forms (e.g. keep the raw
  `typeof body?.x` example and mention `stringField` as the admin-side wrapper) rather than
  asserting a single probe style the repo doesn't have.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080833290) · 2026-07-25
22:26:07 UTC</sub>

### f231e4c5c274 — [P3][duplication] Web form actions `add`/`remove` are near-identical and diverge from the API on status

**Issue**

```ts
add: async ({ request, cookies }) => {
  requireAdmin(cookies);
  const form = await request.formData();
  const token = String(form.get('token') ?? '').trim();
  const result = await addToken(token);
  if (!result.ok) return fail(400, { error: result.error });
  return { success: true, message: `Added “${token}”` };
},
remove: async ({ request, cookies }) => { /* same, removeToken, “Removed …” */ },
```

Two responsibilities differ (which core fn, which verb in the message); everything else — auth, form
parse, `.trim()`, the `fail(400)` shape — is duplicated. Worse, both collapse *every* failure to
`fail(400)`, including the retryable CAS conflict that the JSON endpoint deliberately distinguishes
…

**Fix**

Collapsed the `/admin` console's `add` and `remove` form actions into a shared `tokenMutation`
helper that maps `reason: 'conflict'` to 409 and everything else to 400, mirroring the
`mutationError` mapping the JSON `/api/admin/tokens` endpoint already used, so a transient CAS
conflict is no longer indistinguishable from a validation error on the web console. `MutationResult`
is now exported from `$lib/server/tokens` for the helper's signature, and a new
`tokenActions.integration.test.ts` drives both actions through the conflict path (409), a validation
failure (still 400), and a success.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080836185) · 2026-07-25
22:26:50 UTC</sub>

### 918f2a62162b — [P3][duplication] Copy-key string `` `${invite.token}:code` `` is rebuilt inline 12 times

**Issue**

The per-cell copy-feedback key is assembled ad hoc everywhere it's needed:

```ts
class:copied={copied === `${invite.token}:code`}
onclick={() => copy(`${invite.token}:code`, invite.token)}
...
onclick={() => copy(`${invite.token}:url`, invite.url)}
```

The `${token}:code` / `${token}:url` convention is an implicit contract between the `class:copied`
check and the `copy()` call, restated 12 times across three layouts. A typo in one (`:codes`)
silently breaks only that cell's flash with no error.

**Fix**

Added an exported `copyKey(token, target)` constructor plus a `CopyTarget = 'code' | 'url'` union to
`AdminConsole.svelte` and routed all 11 inline `${token}:code`/`${token}:url` sites through it, so
the key convention is stated once and a typo becomes a type error instead of a silently dead flash.
One deviation from the brief: it asked for the helper "next to `copied`/`copy`" in the instance
script, but `AdminConsole.svelte` exports `Invite` from a `<script module>` block and a runtime
value must live there too to be importable from `InviteMenu.svelte`, so `copyKey` went in the module
block beside the interfaces.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080914060) · 2026-07-25
22:50:56 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### 2ca23af88ac6 — [P3][duplication] Error-log prefix strings (`[client error]`, `[server error]`, `[render error]`) are magic literals scattered across three files with no shared source

**Issue**

The three uncaught-error sinks each invent their own `console.error` prefix as an inline string.
They form a de-facto logging taxonomy (client vs server vs render-boundary) but nothing ties them
together, so the set can drift (e.g. someone adds a fourth path with `[error]`), and there's no
single place to see or change the convention. The user-facing message `'Something went wrong.'` is
likewise duplicated in both hooks.

**Fix**

Added `web/src/lib/errorLog.ts` exporting an `ERROR_LOG_PREFIX` object (client/server/render) plus
`GENERIC_ERROR_MESSAGE`, and pointed the three uncaught-error sinks at it so the console prefixes
and the user-facing fallback have one definition instead of five inline literals. Pure dedup — every
emitted string and argument order is byte-identical to before.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081733869) · 2026-07-26
03:05:30 UTC</sub>

### 23164bc773a0 — [P1][duplication] `pinchTextZoom` reimplements the DOM-free pinch accumulator that `createPinchZoom` already provides

**Issue**

`pinchZoom.svelte.ts` correctly delegates all pointer bookkeeping to the tested, DOM-free
`createPinchZoom` accumulator (a `Map<number,Point>`, `rebase()` snapshotting base
transform/spread/count, and `spread()` via `Math.hypot`). `pinchTextZoom` hand-rolls the *same*
machinery again:

```ts
const points = new Map<number, { x: number; y: number }>();
let baseZoom = MIN_TEXT_ZOOM;
let baseSpread = 0;
function spread(): number {
  const [a, b] = [...points.values()];
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function rebase() {
  baseZoom = zoom;
  baseSpread = spread();
}
```

This is a second, parallel implementation of two-finger spread tracking and base re-snapshotting.

**Fix**

Extracted the pointer bookkeeping and pairwise-spread math both pinch gestures had grown
independently into `createSpreadTracker` (`web/src/lib/actions/spreadTracker.svelte.ts`), and had
`createPinchZoom` and `pinchTextZoom` consume it while keeping their own rebase/transform math. The
tracker keeps its map private (a `SvelteMap`, so `pinchZoom`'s `pointerCount`/`isZoomed` getters
stay reactive) and exposes only `pointerCount`, a `points()` snapshot for `pinchZoom`'s centroid
math, and a no-arg `spread()`; `move`/`up` return a boolean rather than the brief's sketched `void`,
since both call sites need the "was this pointer tracked?" signal they previously got from
`Map.has`/`Map.delete`.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/parent-zoom.spec.ts tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082173146) · 2026-07-26
05:18:36 UTC</sub>

### b7d3a6cf0bbe — [P2][duplication] Extract the repeated distance-vs-threshold computation in `dragToClear`

**Issue**

Both handlers recompute the drag distance and the accept threshold with identical code:

```ts
const dx = clientX - startPointerX;
const dy = clientY - startPointerY;
const distance = Math.sqrt(dx * dx + dy * dy);
const threshold = getAcceptRadius();
```

The "have we crossed the accept radius?" test is the gesture's central predicate and is expressed
twice; a change to how distance is measured (e.g. squared-distance to drop the `sqrt`) must be made
in two places.

**Fix**

Added a `dragDistance(clientX, clientY)` helper nested in `dragToClear` (beside `getAcceptRadius`)
that computes the drag magnitude with `Math.hypot`, and routed both `onPointerMove` and
`onPointerUp` through it so the gesture's accept-radius predicate has a single source of truth.
`onPointerMove` keeps its `dx`/`dy` locals for the drag transform; `onPointerUp`'s now-unused ones
were dropped.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082174536) · 2026-07-26
05:19:10 UTC</sub>

### a8df930d6bf4 — [P2][duplication] Fold the duplicated post-drag cleanup in `onPointerCancel` / `onPointerUp` else-branch into one helper

**Issue**

The non-commit exit is spelled out twice. `onPointerUp`'s else branch:

```ts
o.containerEl.classList.remove('dragging-active');
o.containerEl.style.transform = '';
node.classList.remove('dragging');
```

and `onPointerCancel` repeats those three plus a few more resets. `finishDrag` already exists as the
shared teardown, but these container/node resets live outside it, so the "undo the visible drag"
logic is split between `finishDrag` and each caller.

**Fix**

Extracted a `resetDragVisuals(o)` helper nested inside `dragToClear` and called it from the
non-commit `else` branch of `onPointerUp` and from the head of `onPointerCancel`, replacing the
three duplicated teardown statements in each. It is deliberately not wired into `finishDrag` or the
commit path, so `playClearExit` keeps holding `dragging-active` and the drag transform until its own
delayed resets — the exit choreography is unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082222847) · 2026-07-26
05:37:36 UTC</sub>

### 6ba2c4cf0454 — [P3][duplication] Extract a shared `capturePointer`/`releasePointer` wrapper for the repeated empty-catch capture calls

**Issue**

All three gesture actions guard pointer capture the same way, with a silent empty catch:

```ts
try { node.setPointerCapture(e.pointerId); } catch {}
...
try { node.releasePointerCapture(e.pointerId); } catch {}
```

Six copies of the same swallow-the-throw idiom. Empty `catch {}` blocks are also a code smell (they
hide any unexpected error), and the reason capture can throw (a released/invalid pointer id) is
undocumented at each site.

**Fix**

Added `web/src/lib/actions/pointerCapture.ts` exporting `capturePointer`/`releasePointer`, which
wrap the throw-prone DOM capture calls in a single documented try/catch, and replaced all six inline
empty-catch blocks in `dragToClear.ts`, `pinchZoom.svelte.ts`, and `pinchTextZoom.svelte.ts` with
calls to them. Pure refactor — same call sites, same control flow, same node/pointerId arguments, so
the existing action tests pass unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082223577) · 2026-07-26
05:37:52 UTC</sub>

### 1610a0c36545 — [P3][duplication] Collapse `launchGuard`'s two zone-pruning code paths

**Issue**

Expired-zone pruning is implemented twice. `guardLaunchZone` calls `zones = liveZones()` (a
`filter(zone.expiresAt > now)`), while `isPointInLaunchZone` prunes inline with the opposite
comparison during its scan:

```ts
for (const zone of zones) {
  if (zone.expiresAt <= now) continue;
  surviving.push(zone);
  ...
}
zones = surviving;
```

Two expressions of "drop lapsed zones" (`> now` vs `<= now … continue`) that must stay logically
consistent.

**Fix**

`isPointInLaunchZone` now reassigns `zones = liveZones()` and hit-tests the survivors, instead of
rebuilding a `surviving` array inline with the inverted `expiresAt <= now` check. `liveZones()` is
now the only place the "still alive" rule is expressed, so the two copies can't drift apart; the
boundary condition and the public signatures are unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082281063) · 2026-07-26
05:59:10 UTC</sub>

### 46cbbf378628 — [P2][duplication] Hex-normalize-and-parse logic is duplicated between `relativeLuminance` and `getRingColor`

**Issue**

Both functions open with byte-identical hex handling:

```ts
let hex = color.replace('#', '');
if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
const r = parseInt(hex.substr(0, 2), 16);
const g = parseInt(hex.substr(2, 2), 16);
const b = parseInt(hex.substr(4, 2), 16);
```

The 3→6 expansion and channel parse appear twice. A fix to one (e.g. validating input, supporting
`#rrggbbaa`) will drift from the other.

**Fix**

Pulled the identical five-line hex-normalize-and-parse block out of `relativeLuminance` and
`getRingColor` in `web/src/lib/colorRing.ts` into a module-private `hexToRgb(color)` returning
`{ r, g, b }`, so the shorthand-expansion and parsing rules live in one place. Both callers now
destructure from it; exported signatures and outputs are unchanged, and the existing black-box tests
pass untouched.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082486287) · 2026-07-26
07:09:51 UTC</sub>

### 27a997f13693 — [P2][duplication] `ringShadow` and `gradientRingShadow` differ only in whether the ring color is derived

**Issue**

```ts
function ringShadow(color: string) {
  const ringColor = getRingColor(color);
  return `0 0 0 0.5px var(--surface), 0 0 0 4.5px ${ringColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
}
function gradientRingShadow(color: string) {
  return `0 0 0 0.5px var(--surface), 0 0 0 4.5px ${color}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
}
```

The entire `box-shadow` template (`0.5px` seam, `4.5px` ring, drop shadow) is duplicated; only the
ring color source differs. A change to the ring geometry must be made in two places.

**Fix**

Collapsed the two identical box-shadow templates into a single `selectionRingShadow(ringColor)` that
takes an already-resolved ring color, so the seam/ring/drop-shadow string exists once. The palette
swatch now derives `getRingColor(shown)` once via an `{@const}` in the `{#each}` and reuses it for
both the box-shadow and the `--ring-color` custom property, where it was previously computed twice
per active swatch; rendered output is unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082486954) · 2026-07-26
07:10:05 UTC</sub>

### b606d2aa451a — [P2][duplication] The hexagon `clip-path` polygon is duplicated verbatim

**Issue**

`clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);` appears identically on
`.hexagon` and `.hexagon::after`. The hexagon shape is defined twice; changing the silhouette means
editing both, and the two can silently diverge (element clip vs. fill clip).

**Fix**

Hoisted the hexagon silhouette into a `--hex-clip` custom property on `.picker` (the shared ancestor
of every `.hexagon`) and pointed both `.hexagon` and `.hexagon::after` at it via `var()`, so the
polygon has one definition and the element clip and fill clip can no longer diverge. Pure value
substitution — the resolved `clip-path` is byte-identical to the two literals it replaces, with no
markup or class changes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5083042228) · 2026-07-26
10:14:24 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### 5bcff7b0312e — [P3][duplication] The `getPrefs().then(...).catch()` native-Preferences pattern is hand-copied three times

**Issue**

The `__IS_CAPACITOR__ && isNative()` → `getPrefs().then(({ Preferences }) => …).catch(() => {})`
shape appears in `mirror` (set), `removeKey` (remove), and `hydrateDurableStorage` (get/set). Three
copies of the same guard + lazy-load + swallow. Adding a new durable operation means copying the
boilerplate a fourth time.

**Fix**

Centralized native Preferences access in a generic runner that preserves compile-time gating, lazy
loading, fire-and-forget writes/removals, and failure-to-absent hydration results. Added native
coverage proving removeKey clears both localStorage and the durable Preferences copy.

*Revised before approval:* Preserved completed restore state across a later backfill rejection, so
hydration still returns true and notifies restore callbacks after localStorage was repopulated.
Added a regression test covering the mixed restore-plus-backup-failure path.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `hydrateDurableStorage()` now loses a completed restore if a later backup `Preferences.set()`
  rejects: `runWithDurablePreferences()` converts the operation rejection to `undefined`, so
  hydration returns `false` and skips restore callbacks even though localStorage was already
  repopulated. Preserve the restore result and callback notification after partial success, as the
  prior implementation did, and cover this mixed restore-plus-backup-failure case in
  `storage.test.ts`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084374095) · 2026-07-26
16:32:17 UTC</sub>

### 7dbda3776279 — [P3][duplication] `saveSecret` / `loadSecret` / `clearSecret` triplicate the native-vs-web dispatch

**Issue**

All three functions share the identical skeleton: browser guard, `__IS_CAPACITOR__ && isNative()`
branch, `getPlugin()` + `SecureStorage.<op>` on native, `web<Op>` on web. The only per-function
difference is which method runs. Three copies of the plugin-load + branch means a change to the
native seam (e.g. a plugin API rename) touches three sites.

**Fix**

Centralized secure-storage platform dispatch behind a typed async backend selector while preserving
the compile-time Capacitor guard. Native reads now normalize non-string values to null, and removals
normalize the plugin’s boolean result to Promise<void>.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084374382) · 2026-07-26
16:32:22 UTC</sub>

### e6179d5acca2 — [P3][duplication] `secureStorage` and `folderSave` each hand-roll the same IndexedDB key-value wrapper

**Issue**

Both modules independently declare `DB_NAME`/`DB_VERSION`/`STORE` constants, call
`lazyIdbDatabase(...)`, and then wrap `db.get`/`db.put`/`db.delete` in ad-hoc helpers
(`webSave`/`webLoad`/`webClear` vs `loadHandle`/`storeHandle` + the inline `db.delete` in
`clearSaveFolder`). The two IndexedDB consumers in the codebase share only `lazyIdbDatabase` and
re-implement the same get/put/delete-by-key boilerplate above it.

**Fix**

Added a schema-derived `idbKvStore` and migrated folder-handle and encrypted-payload row access to
it while preserving the secure master-key transaction path. Updated the secure-storage mock and
added focused delegation, typing, and memoized-opening coverage.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084375493) · 2026-07-26
16:32:38 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 00120d62c2a7 — [P1][duplication] Extract the shared per-IP rate-limit bucket key into one helper

**Issue**

The verify-access-code oracle and generate-image's managed-token check deliberately share **one**
per-IP budget, but the key string is hand-built in two places:

```ts
// generationAuthorization.ts:27
const guessKey = `verify-access-code:${input.clientAddress}`;
// verify-access-code/+server.ts:20
const key = `verify-access-code:${getClientAddress()}`;
```

Plus every rate-limit key (`generate-image:`, `generate-image-byok:`, `report:`, `csp-report:`,
`verify-key:`) is an inline template literal at its one call site. The shared bucket is a
load-bearing contract (the whole ADR-0014 oracle story depends on both sites producing the identical
key), yet nothing links them — a rename of one silently splits the bucket, and the tests hard-code …

**Fix**

Centralized all six unchanged rate-limit key formats in a server-only builder module and routed the
five production call sites through it. Shared access-code assertions now use the same builder,
preventing the generation and verification oracle budgets from drifting.

*Revised before approval:* Updated the remaining managed-token and BYOK assertions to build expected
keys through the shared helpers, keeping every rate-limit prefix centralized in `rateLimitKeys.ts`.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/server/generationAuthorization.test.ts:71,86,107` still hard-codes the
  `generate-image:` and `generate-image-byok:` keys; use `generateImageBucket` and
  `generateImageByokBucket` so those prefixes live only in `rateLimitKeys.ts` and future bucket
  renames cannot desynchronize the tests.

**E2E gate** — `tests/generate-image.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084810623) · 2026-07-26
18:26:49 UTC</sub>

### a95f09b2c1c5 — [P2][duplication] `page()` builds `nightImages` and `chalkImages` with two copy-pasted filter+branch blocks

**Issue**

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

…

**Fix**

Centralized optional night and chalk image-map construction in a private helper that iterates all
orientations, omits declared exceptions, and delegates path generation to `pageAssetPath()`. This
removes the duplicated blocks while preserving every generated key and path.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086072793) · 2026-07-27
00:11:45 UTC</sub>

### f9cb1cde86f5 — [P3][duplication] `hoverArmed = false` reset duplicated across both navigation handlers

**Issue**

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

**Fix**

Centralized coloring-book view changes in `showView(Book | null)`, which updates the selected book
and disarms hover together. Opening, closing, selecting a book, and Back navigation now all use that
helper, preserving the existing transition behavior.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086074598) · 2026-07-27
00:12:07 UTC</sub>

### 58ce6a942303 — [P2][duplication] Three uncoordinated writers to `<meta name="theme-color">`; NotchBand re-inlines the setter

**Issue**

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
…

**Fix**

Centralized theme-color meta updates in `setThemeColorMeta`, preserving appearance’s baseline and
NotchBand’s intentional active drawing/paper-color override while removing the duplicate DOM writer.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086076728) · 2026-07-27
00:12:31 UTC</sub>

### 4e129299cacc — [P3][duplication] `volumeMultiplier()` re-clamps a value `settings` already clamped, with magic `/ 50`

**Issue**

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

**Fix**

Replaced the duplicate volume clamp and literal divisor with the settings contract’s
`SOUND_VOLUME_DEFAULT`, while renaming the unchanged base gain constant to clarify its role and
preserve existing gain behavior.

*Revised before approval:* Added focused unit coverage through `playDrawSound` that mocks Web Audio
loading and asserts volume 50 at full speed ramps to the unchanged `0.2` base scratch gain.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Add the specified `drawingSound` unit test asserting that `soundVolume = 50` at full speed ramps
  to the base scratch gain; the implementation currently has no direct coverage for the refactored
  gain calculation.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086077210) · 2026-07-27
00:12:36 UTC</sub>

### 06f3b185b18d — [P3][duplication] User-agent OS/device parsing duplicated between `deviceInfo.ts` and `platform.ts`

**Issue**

`platform.ts` sniffs the UA for iOS (`/iPad|iPhone|iPod/`) and Android (`/android/i`);
`deviceInfo.ts` independently re-parses the same UA for `Android ([0-9.]+)`,
`(?:iPhone|iPad|iPod).*?OS ([0-9_]+)`, etc. Two modules own UA-regex knowledge, so a UA quirk (e.g.
the iPadOS-masquerades-as-Mac case that `platform.ts` handles at line 42 but `osFromUserAgent` does
not) is fixed in one and missed in the other.

**Fix**

Moved the unchanged user-agent OS label parser into `platform.ts` as `osLabelFromUserAgent()` and
updated both report paths to use it, giving the platform module single ownership without altering
reported labels or iPadOS detection.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086077657) · 2026-07-27
00:12:42 UTC</sub>

### 9d983d9bcde3 — [P2][duplication] Extract the "score against chalk when forked, else pen" source-selection

**Issue**

The load-bearing rule "a night fill scores/composites against the chalk outline when the page has
forked, otherwise the pen" is re-derived in five places with slightly different shapes:
`chalk ?? pen` (golden, dark), `theme === 'night' && existsSync(chalk) ? chalk : pen` (invented),
`existsSync(chalk) ? chalk : pen` (halo), `const chalked = existsSync(chalkPath)` then branch
(fill-eyes). Because it is copy-pasted, a future change to the fork convention (or the composite
step) must be found and fixed in five spots — exactly the kind of pipeline rule the docs stress is
easy to get subtly wrong.

**Fix**

Centralized night line-art resolution and routed generation, audit, compositing, and punching
through it, preserving pen fallback and chalk-aware behavior from one selection rule.

*Revised before approval:* Changed the resolver to select and validate the night line-art path
before reading it, so missing sources reach `punchFill`’s deliberate diagnostic while existing
source selection remains unchanged.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `punchFill` calls `resolveNightLineArt()` before its missing-line-art guard, so a night fill with
  neither chalk nor pen now throws a raw `ENOENT` from `paths.mjs:34` instead of the deliberate
  `Missing line art for …` error at `punch-fill.mjs:106`. Preserve that diagnostic by resolving the
  selected path before reading it, or translate the missing-source error.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086082465) · 2026-07-27
00:13:40 UTC</sub>

### adde63efaa98 — [P3][duplication] The `GEMINI_API_KEY` guard is copy-pasted six ways

**Issue**

`if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY is not set.')` appears six times, and three
scripts additionally repeat the guarded-construct idiom
`const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: … }) : null` (dark:341-343,
chalk:249-251, normalize:107-109) with an extra `--dry-run`/`--rescore` escape hatch bolted on
inconsistently.

**Fix**

Added a shared Gemini client factory and migrated all six maintained asset-generator CLIs while
preserving diagnostic ordering and offline modes. Added focused coverage for required and optional
key behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086083045) · 2026-07-27
00:13:48 UTC</sub>

### 8ccb0d9b06b2 — [P3][duplication] Repeated status-line assembly at the end of each generator loop

**Issue**

Each generator ends its per-page block with the same shape: build a `warn`/`flags` array from failed
gates, compute `tries = attempt > 0 ? \` (${attempt+1} tries)\` : ''`,`nudge = shift.dx||shift.dy ?
\` shift ${dx},${dy}\` : ''`, a`stats`string of`keep/local/…`, and`${warn.length ? \` ⚠
${warn.join(' + ')}\` : ''} -> ${relative(REPO_ROOT, out)}`. The scaffolding (tries/nudge/⚠
join/arrow) is identical; only the gate names differ.

**Fix**

Added a pure candidate-line formatter and routed the three matching generators through it while
preserving their exact statistics, shift, retry, warning, and path output. The distinct dark-fill
report remains untouched.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086083871) · 2026-07-27
00:13:58 UTC</sub>

### 8c7f84e8618a — [P3][duplication] Two base64 data-URI helpers with different names

**Issue**

`review-orb-eyes` defines
`const b64 = (buf) => \`data:image/png;base64,${buf.toString('base64')}\``; the proof sheet defines`dataUri(p)`(reads a file, webp mime) and`gitDataUri`.
Both are "bytes → embeddable data URI" for the two HTML-review generators, named and shaped
differently, so the shared concept isn't grepable.

**Fix**

Added shared byte/file data-URI helpers and updated both review generators to use them. PNG and WebP
MIME output remains unchanged, while missing and empty assets still return null.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086085475) · 2026-07-27
00:14:17 UTC</sub>

### 483dfdf66edb — [P4][duplication] Working-resolution and threshold magic numbers scattered across pixel scans

**Issue**

Down-sampling to a working resolution before a pixel loop is done at `360×360` in two files and
`512×512` in a third, and the "is this pixel white/ink" luma thresholds (248, 235, 150, 110) are
bare literals inside each scan function. Some are named (`WHITE_LEVEL`, `INK_DARK`), some are inline
(`>= 235`, `< 150`). A reader can't tell whether the differing working sizes are deliberate
(accuracy vs speed) or accidental, and the luma cutoffs that must roughly agree with
`lib/outline-match.mjs`'s ink bar (chalk:81 says "same ink bar") aren't traceably linked.

**Fix**

Centralized the shared 512px registration/new-ink mask settings in `outline-match` and made chalk
consume them. Named the independent fill and fresh-outline fraction-gate settings locally,
preserving every threshold, scale, and comparison.

*Revised before approval:* Applied Prettier’s required wrapping to the chalk mask loop and outline
tile calculation so the committed implementation satisfies repository formatting.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086086545) · 2026-07-27
00:14:30 UTC</sub>

### 2c94eb355898 — [P2][duplication] `solid-regions.mjs` reimplements the erode/dilate that `morphology.mjs` already exports

**Issue**

`morphology.mjs` exists precisely to be "shared" (its header names two callers) and provides
separable `erodeMask`/`dilateMask`. Yet `solid-regions.mjs` defines its own `erode` (separable,
breaks on first unset) and `dilate` (invert→erode→invert) that compute the identical opening. A
*third* erosion — Set-based — appears in `composite-eye.mjs:211-231`. Three morphology
implementations for one concept; `solid-regions`'s copy is a near-verbatim duplicate of the exported
one.

**Fix**

Replaced the duplicated solid-region erosion/dilation with the shared morphology helpers. Added an
explicit opt-in out-of-bounds dilation value and regression coverage so solidity scoring preserves
its former border behavior while other callers retain clipped borders.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086087403) · 2026-07-27
00:14:41 UTC</sub>

### f48a0129934a — [P2][duplication] `STRONG_LIGHT_SIDE = 180` is declared in two eye modules instead of imported

**Issue**

`composite-eye.mjs:36` already imports `BAND_BLIND_INK_FRAC` and `scoreEyeFill` from `eye-fill.mjs`,
and its own comments (46) reference "judgeNightEyes's own reference test." Yet it redeclares
`const STRONG_LIGHT_SIDE = 180;` — the same "strong light side" bar `judgeNightEyes` uses at
`eye-fill.mjs:351`. The two checks are documented as complementary halves of the same eye-reference
oracle; a change to one 180 silently desynchronizes them.

**Fix**

Exported the existing strong light-side threshold from `eye-fill.mjs` and reused it in
`composite-eye.mjs`, preserving both predicates while preventing their shared eye-reference cutoff
from drifting.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086089799) · 2026-07-27
00:15:09 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### 19a3d16c0c6d — [P4][duplication] Percentile/median selection is reimplemented inline in every scorer

**Issue**

The pattern "sort then index a fraction" recurs everywhere with slightly different spellings:
`vals[vals.length >> 1]` (median), `vals[Math.floor(vals.length * 0.9)]` (p90),
`vals[Math.floor(vals.length * 0.15)]` (p15), `deltas[Math.floor(f*(deltas.length-1))]`
(night-halo's variant subtracts 1). The inconsistency (`>>1` vs `*0.5`, `len` vs `len-1`) is itself
a bug surface, and `invented-shapes.mjs:111` hides it in a comma-operator one-liner:
`const med = (a) => (a.sort((x,y)=>x-y), a[a.length>>1]);`.

**Fix**

Added tools/asset-gen/lib/stats.mjs (quantile/median, sorting a copy) and replaced the six
duplicated inline sort-then-index selectors in eye-fill.mjs, night-scores.mjs, night-halo.mjs,
solid-regions.mjs, and invented-shapes.mjs with calls to it, standardizing on the floor(f*(n-1))
convention night-halo already used. npm run check, npm run test:asset-gen (109 tests, no
expected-value updates needed), and eslint on the six changed files all pass.

*Revised before approval:* Migrated composite-eye.mjs's discStats off the last remaining hand-rolled

>> 1 median onto the shared lib/stats.mjs helper, and added tools/asset-gen/tests/stats.test.mjs
>> with direct coverage of quantile/median — the floor(f*(n-1)) index at f=0/0.15/0.5/0.9/1, the
>> even-length "lower middle" case, no-mutation of the input, and the empty-array case. npm run
>> check, npm run test:asset-gen (114 tests, all pass), and eslint on the touched files all pass.

*Revised before approval:* Ran npm run gen:coloring-golden:diff (the documented post-pipeline-change
regression gate) across the full 94-page catalog after the quantile/median consolidation: 104 pages
diffed, 0 regressions, 0 improvements, 0 other changes — fully clean. No page's
strokeWidthP90-derived interiorPx/biggestBlob or the p15/p85-derived eyeLively shifted under the new
floor(f*(n-1)) convention, so no refreeze of golden/golden-scores.json was needed and no new commit
was made (working tree already clean at this SHA).

**Adversarial review** — reviewer caught the following; addressed before approval:

* No unit test covers `tools/asset-gen/lib/stats.mjs`; add `tools/asset-gen/tests/stats.test.mjs`
  exercising `quantile`/`median` directly — in particular the even-length median (now the lower of
  the two middles) and the `Math.floor(f * (n - 1))` index at f = 0, 0.15, 0.5, 0.9, 1 — since the
  new index convention is the only behavior this change altered and nothing tests it directly.
* `tools/asset-gen/lib/composite-eye.mjs:144-146` (`discStats`) still hand-rolls
  `vals.sort(...); vals[vals.length >> 1]` instead of using `median` from `./stats.mjs`, leaving a
  live scorer on the old `>>1` convention the other five scorers were just migrated off.
* The committed golden baseline `tools/asset-gen/golden/golden-scores.json` was neither re-diffed
  nor refrozen, and this is a scorer-behavior change (`floor(f*n)`/`>>1` → `floor(f*(n-1))`) applied
  across the whole 94-page catalog: `strokeWidthP90` (`solid-regions.mjs:82`) feeds the integer
  adaptive opening radius `clamp(ceil(strokeW/2)+2, 5, 8)` (`solid-regions.mjs:139-140`), so a
  one-index p90 shift can move `outline.interiorPx`/`outline.biggestBlob` well past their noise:15 /
  worse:'up' tolerances, and the p15/p85 shift at `eye-fill.mjs:357-358` can flip `light.eyeLively`
  (noise 0, worse:'down'). Run `npm run gen:coloring-golden:diff` — the repo's own documented "run
  after any pipeline change" gate, deterministic and offline — and either report it clean or
  refreeze with `gen:coloring-golden:freeze`, naming which pages moved and why the movement is
  benign.

**Supervisor note** — worth calling out that this one *did* change behavior under a "duplication"
heading, and the loop is what caught it. The call sites were genuinely inconsistent (`>>1` vs
`*0.5`, `len` vs `len-1`), so unification necessarily had to pick a convention; it picked
night-halo's standard `floor(f*(n-1))`, which is the defensible choice, and the third round proved
it a no-op against the real catalog rather than asserting it.

I separately checked the one hazard the reviewer did not raise: the shared helper sorts a **copy**,
whereas most of the inline code sorted **in place**, so any caller relying on that side effect would
silently get an unsorted array. Traced all seven migrated sites — five return the selected value
immediately, and the two with code following (`deltas` in night-halo, `bandVals` in eye-fill) only
read `.length` and `.filter(…)`, both order-independent. No latent breakage.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086437928) · 2026-07-27
01:34:46 UTC</sub>

### f43879ea9031 — [P2][duplication] `capture-current.mjs` reimplements the shared `chromiumExecutablePath` helper instead of importing it

**Issue**

The file already imports from `scripts/lib/` (line 16, `scrapbook-chrome.mjs`), yet it hand-rolls a
20-line copy of the exact Playwright-Chromium fallback that already exists as an exported helper in
`scripts/lib/utils.mjs:82` (`chromiumExecutablePath(chromium)`), whose body is a near-identical
`readdirSync(base).filter(/^chromium-\d+$/)…` walk over `/opt/pw-browsers`. The local copy even
carries the same explanatory comment ("Cloud sessions cache a Chromium whose revision can drift…").
Two copies of cloud-environment plumbing drift independently — when the pinned-browser logic changes
(as it has before per the comment referencing `web/playwright.config.ts`), this copy is silently
left behind.

**Fix**

Replaced the script's private Chromium-path fallback with an import of the exported
`chromiumExecutablePath(chromium)` from `scripts/lib/utils.mjs`, dropping the now-unused
`existsSync`/`readdirSync` imports; the shared helper's logic (env override → Playwright's resolved
binary → newest `chromium-\d+` build) is behaviorally identical. One caveat worth noting for a
follow-up: `tools/asset-gen/CLAUDE.md` tells code in this tree not to import from the repo-root
`scripts/lib/`, so this fix trades a duplication for a documented-boundary crossing — I implemented
the brief as written rather than substituting my own call.

**Adversarial review** — approved on the first pass; no changes needed.

---

> [!WARNING]
> **Supervisor flag — this one needs a human keep-or-revert call.** The implementer was right to
> raise the boundary concern, and it is worse than it recorded: **the finding's premise is factually
> wrong.**
>
> The finding asserts "The file already imports from `scripts/lib/` (line 16,
> `scrapbook-chrome.mjs`)". It did not. Before this commit the entire import block was:
>
> ```js
> import { existsSync, mkdirSync, readdirSync } from 'node:fs';
> import { dirname, join } from 'node:path';
> import { fileURLToPath } from 'node:url';
> import { chromium } from 'playwright';
> ```
>
> Line 16 was `node:path`, and there was no `scripts/lib/` import anywhere in the file. So the fix
> did not consolidate onto an already-crossed boundary — it **introduced the first crossing**, via
> `import { chromiumExecutablePath } from '../../../scripts/lib/utils.mjs';`.
>
> That line does both things `tools/asset-gen/CLAUDE.md:50` prohibits for this tree: a `../../..`
> walk *and* an import from repo-root `scripts/lib/`.
>
> Neither the verifier (which should have caught the false premise at HEAD) nor the reviewer (which
> had the original finding and approved first-pass) flagged it. The honest actor was the
> implementer, which raised it and deferred to the brief rather than substituting its own judgment.
>
> The change is small and cleanly revertible. Two defensible resolutions: revert and keep the
> duplication, or keep the dedup and amend the `tools/asset-gen/CLAUDE.md` rule to carve out
> non-path utilities. That is a project-owner decision, so the run left it in place rather than
> guessing.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086565427) · 2026-07-27
02:03:27 UTC</sub>

### a9de61fb5151 — [P2][duplication] Proof-sheet client hardcodes `OUTLINE_LUMA = 150`, duplicating the punch threshold that can drift out from under it

**Issue**

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

**Fix**

The proof-sheet generator now imports `OUTLINE_LUMA_THRESHOLD` from `lib/punch-fill.mjs` and
forwards it as `outlineLuma` in the `window.__COLORING_BOOK_PROOF_SHEET__` blob, and the client
destructures it there instead of redeclaring the literal — so the preview's punch mask tracks a
retune of the real threshold automatically. Rendered output is unchanged at the current value (the
regenerated sheet carries `"outlineLuma":150`).

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086744679) · 2026-07-27
02:41:01 UTC</sub>

### 69340b541c85 — [P3][duplication] The `--flag=value` `arg()` parser is copy-pasted across the crayon-sample scripts, and `build-sheet` re-inlines it

**Issue**

Two files carry a byte-identical helper:

```js
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
```

`build-sheet.mjs` then parses `--artifact=` a *third* way inline
(`process.argv.find(a => a.startsWith('--artifact='))?.slice('--artifact='.length)`), so the same
folder resolves the same flag three different ways. The `name.length + 3` in the shared copy is
itself an unexplained magic offset (`--` + `=` = 3 chars).

**Fix**

Added a generic `argFlag(name, fallback)` to `scripts/lib/utils.mjs` and pointed all three
crayon-sample scripts at it, deleting the two byte-identical local `arg` helpers and
`build-sheet.mjs`'s separate inline `--artifact=` parse. The shared version derives its slice offset
from the `--name=` prefix rather than the old unexplained `name.length + 3`; flags, fallbacks and
`??` semantics are unchanged, verified by running each script with its flags. Per the brief, the
helper lives in `utils.mjs` rather than the finding's suggested `scrapbook-chrome.mjs`, which is
page-chrome rendering and is not imported by `capture-current.mjs`.

**Adversarial review** — approved on the first pass; no changes needed.

---

> [!NOTE]
> **Correction to my earlier flag on f43879ea9031.** I posted a warning there saying that fix
> introduced the first `scripts/lib/` boundary crossing into `tools/asset-gen/` on a false premise.
> That overstated it, and this commit is what surfaced the missing context.
>
> What I got right: `capture-current.mjs` itself genuinely had no `scripts/lib/` import before the
> fix, and the finding's specific citation ("line 16, `scrapbook-chrome.mjs`") was wrong — line 16
> was `import { dirname, join } from 'node:path'`.
>
> What I missed: its two siblings in the same directory **already** did, before this run —
> `build-compare-sheet.mjs:16` and `build-sheet.mjs:13` both carry
> `import { chromeStyle, masthead, page, siteFooter } from '../../../scripts/lib/scrapbook-chrome.mjs'`,
> and `crayon-brush-samples/README.md:42` documents that as deliberate ("using the shared
> `/scrapbook` chrome"). So the finding's *substance* — that this directory reaches into
> `scripts/lib/` — was correct; only its line reference was not.
>
> `crayon-brush-samples/` is scrapbook-publishing tooling rather than the asset-gen pipeline proper,
> and the `tools/asset-gen/CLAUDE.md:50` rule it appears to conflict with is scoped to path
> resolution ("Paths go through `lib/paths.mjs`"). These two commits therefore bring
> `capture-current.mjs` into line with its siblings rather than opening a new breach.
>
> Net: **no keep-or-revert decision is needed** on either commit, contrary to what I wrote earlier.
> The one thing still worth a glance is whether you want `tools/asset-gen/CLAUDE.md` to say
> explicitly that `crayon-brush-samples/` is exempt, since the convention currently lives only in
> that subdirectory's README and this is now the second time it has been read as a conflict.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086781179) · 2026-07-27
02:49:11 UTC</sub>

### ff4a479f6126 — [P3][duplication] `buildHalf` repeats the same "create span, set class + text, append" block five times

**Issue**

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

**Fix**

Added a local `chip(cls, text)` helper in `buildHalf` that creates a span, sets its class and text,
and appends it to the figcaption, then collapsed the six hand-rolled caption-chip blocks to single
calls. Class strings, text, append order, and theme conditions are unchanged, so the rendered
proof-sheet captions are byte-identical.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086793874) · 2026-07-27
02:52:15 UTC</sub>

### 7e1ecf925566 — [P4][duplication] Two base64 image-inliners (`uri` / `dataUri`) do the same job under different names

**Issue**

Both scripts inline images as `data:` URIs for a self-contained scrapbook page;
`build-compare-sheet` calls it `uri` (and resizes via sharp), `build-sheet` calls it `dataUri` (and
passes through, MIME-mapped). Same concept, two names, two implementations — a reader comparing the
two sheets can't tell whether the difference is intentional. The shared scrapbook chrome lib
(`scripts/lib/scrapbook-chrome.mjs`) is the natural home and already the common import.

**Fix**

Added a shared `inlineImage(path, { width })` helper to scripts/lib/scrapbook-chrome.mjs and
switched build-compare-sheet.mjs and build-sheet.mjs to call it, deleting their local
`uri`/`dataUri` duplicates. Verified functional equivalence directly (old vs. new logic produced
byte-identical data: URIs for both the resize and pass-through paths) and confirmed a fresh
build-sheet.mjs run reproduces the committed index.html byte-for-byte; npm run check, eslint, and
unit tests all pass.

*Revised before approval:* Fixed two follow-up review points on commit c27b7c1: updated
scripts/lib/scrapbook-chrome.mjs's header comment to state its actual contract (now does filesystem
reads + sharp re-encoding via inlineImage, and importers pull in sharp transitively, not "pure
string builders"), and restored the dropped WHY comments at both inlineImage call sites in
build-compare-sheet.mjs (the 2x-DSF-vs-webp downsize rationale for the 760px scene width, and why
macros use 1024px instead). eslint and npm run check both pass; committed as 7a6d2c130ccd.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/lib/scrapbook-chrome.mjs:13` still states the module contract as "Pure string builders:
  no DOM, no network" — the module now does filesystem reads and native image re-encoding via a
  top-level `import sharp`. Update that header line (and the surrounding description of what the
  module is) so the stated contract matches, and note that importers now pull in sharp.
* `build-compare-sheet.mjs` dropped the rationale for its inline widths along with the local `uri`
  helper ("Renders are 2x-DSF PNGs; refs are committed webp. Downsize both to a consistent inline
  size so the sheet stays in contact-sheet territory"). The bare `{ width: 760 }` /
  `{ width: 1024 }` literals at lines 79-80 and 91 now carry no explanation; restore that WHY at the
  call sites.

**Supervisor verification** — the reviewer's first catch has a consequence beyond the stale comment
that was worth chasing down: pulling `sharp` into `scripts/lib/scrapbook-chrome.mjs` at top level
makes every importer depend on it transitively, and per this repo's inverted dependency split
(ADR-0070) `sharp` is a **devDependency** while Netlify installs with `--omit=dev` — so a
build-reachable importer would break the deploy while CI stayed green.

Checked, and it is safe: nothing under `web/` or `netlify*` imports `scrapbook-chrome`, and all five
importers (`scripts/gen-icons-sheet.mjs`, `scripts/lib/model-eval-report.mjs`,
`scripts/lib/scrapbook-index.mjs`, and the two crayon-sample builders) are repo tooling that never
runs in the Netlify build. Worth remembering if `scrapbook-chrome` is ever pulled toward the build,
since that is the one edit that would turn this into a deploy failure with no local signal.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086881882) · 2026-07-27
03:10:18 UTC</sub>

### 8e044fd5fec5 — [P4][duplication] The comp/light/pen fixture-loading trio is duplicated between two eye test suites

**Issue**

Both suites compute the same
`FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/composite-eye')` and both open
the identical `${name}.comp/.light/.pen.webp` trio with a `Promise.all([readFile…])` before scoring.
The read boilerplate (the load, not the scoring) is copy-pasted; a change to the fixture layout
(e.g. adding a `.chalk` sidecar) touches two files.

**Fix**

Added tools/asset-gen/tests/fixtures/composite-eye/load.mjs exporting FIXTURES and loadTrio(name),
and updated composite-eye.test.mjs and golden-catalog.test.mjs to import it instead of each
duplicating the FIXTURES path and Promise.all(readFile...) trio-loading block, so the
fixture-loading logic lives in one place while each suite keeps its own scoring logic on top.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086934557) · 2026-07-27
03:20:20 UTC</sub>

### faff32b0aa95 — [P3][duplication] idea-2 ships three near-identical `motif-registry*.json` with no note on which is canonical

**Issue**

idea-2 carries three registry snapshots under `code/` (md5-distinct: `…dc9`, `…327`, `…4cf`) plus
two more at the idea root, with names — `registry` / `-after` / `-final` — that imply an edit
sequence but don't say which one a reader should trust or which fed the final result. It's the kind
of "keep every intermediate" scratch accretion that makes the experiment hard to re-follow.

**Fix**

The three registries turned out to serve different roles rather than being redundant snapshots, so I
took the brief's explicit before/after-pair option: deleted the superseded chalk-only
`motif-registry-after.json` (at the idea root and under `code/`, and the one variant `meta.json`
never referenced) and kept the five-motif survey plus the night-regen end state, which are what the
`before-*`/`after-` strip evidence was actually rendered from. `report.md` now carries one sentence
naming both and what each produced, so the roles no longer have to be reconstructed from md5s.

*Revised before approval:* Removed the two root-level registry duplicates so the canonical pair
lives only under `code/` (where `meta.json` and `build-review.mjs` read it), path-qualified both
filenames in the report.md sentence to match the surrounding `code/…` style, and deleted
`strips/motif-bubbles-after.png`, the orphaned strip rendered from the intermediate registry.
`ls idea-2/motif-registry*.json` is now intentionally empty; the pair lists under `code/`. dprint
check passes.

*Revised before approval:* Restored the bleed-through evidence rather than rewording around it:
strips/motif-bubbles-after.png is back byte-identically (md5 637e55ee…), and its four registry
entries now live as the labelled `bubbles-after` block of code/motif-registry-final.json, verified
as the same JSON as the deleted file so the labels still match those rendered into the strip. Since
motif-strip.mjs writes motif-<key>.png, that block re-renders exactly the restored filename.
report.md's "regen is mandatory" sentence now names the strip and the block that produces it, and
the §2 canonical sentence describes both blocks plus the render command.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The root-level duplicates `idea-2/motif-registry.json` and `motif-registry-final.json` are still
  present and byte-identical to their `code/` counterparts (md5 a5c459b9… and 0a4fe2a6…), while
  `meta.json` and `build-review.mjs` only ever read the `code/` copies — the finding named these
  root files explicitly, so delete both root copies (or, if they must stay, have report.md state
  that the `code/` pair is canonical).
* The new report.md sentence names `motif-registry.json` / `motif-registry-final.json` without a
  path, unlike the surrounding text which writes `code/motif-strip.mjs`; while the root duplicates
  exist it does not disambiguate which of the two locations is meant — prefix both with `code/`.
* `idea-2/strips/motif-bubbles-after.png` is the strip rendered from the now-deleted
  `motif-registry-after.json` and is referenced by nothing (not meta.json, report.md, or
  motif-strip.mjs); it should go with the registry it came from.
* `report.md` line ~95 still argues "**The coupled night-fill regen is mandatory, and the strip
  proves why**: compositing the *existing* night raw under the new chalk shows the fill's own white
  donut bleeding through as a pale grey ring" — that strip was `strips/motif-bubbles-after.png`,
  rendered from `motif-registry-after.json`, and 7dcaf0f deleted both, so the claim now has no
  artifact and no way to regenerate one (the only remaining strip, `after-bubbles-strip.webp`, shows
  the fixed end state, not the bleed-through). Either keep the `bubbles-after` entry as a labelled
  third block inside `code/motif-registry-final.json` plus its strip, or reword that sentence so it
  no longer points at evidence the tree no longer contains.

**Supervisor verification** — the strongest catch of the run, and the one most worth understanding.
The reviewer's own third objection ("that orphan strip should go with the registry it came from")
turned out to be **wrong**, and its fourth objection is it catching its own error a round later: the
strip was not an orphan, it was the sole artifact backing a load-bearing claim in `report.md` — "the
strip proves why" the coupled night-fill regen is mandatory. Deleting it would have left a
documented conclusion in a frozen research archive with no evidence and no way to regenerate any,
since the surviving strip shows the fixed end state rather than the bleed-through being argued
about.

This is the failure mode that no gate can see. Nothing type-checks, lints, or tests a research
archive; the tree would have stayed green with the argument quietly hollowed out.

Confirmed the recovery at HEAD rather than trusting the summary: `strips/motif-bubbles-after.png` is
present at exactly the claimed md5 637e55eefafe5c6f487ea13572b64177 — byte-identical, not
regenerated-and-close — and `code/motif-registry-final.json` carries the `bubbles-after` block, so
the strip is reproducible from the committed registry rather than surviving as an unexplained
binary.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087538239) · 2026-07-27
05:17:41 UTC</sub>

### f5e956c6bcf7 — [P1][duplication] Release-bundle `.aab` path hardcoded three times

**Issue**

The path to the signed Android bundle is spelled out independently in at least three places —
`release.mjs`, `android-verify.mjs`, and the directory literal in the `android:open` npm script:

```js
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
```

A Gradle output-path change (or a variant flavor) means editing three disconnected spots; miss one
and `android:verify` checks a stale path while `release` attaches a different file.
`lib/android.mjs` already exists as the home for Android path constants but doesn't hold this one.

**Fix**

Moved the release-bundle location into `scripts/lib/android.mjs` as
`RELEASE_BUNDLE_DIR`/`RELEASE_AAB` and pointed `release.mjs`, `android-verify.mjs`, and a new
one-line `scripts/android-open.mjs` (now backing `android:open`) at it, so the nine-segment path is
defined once. `open-path.mjs` keeps its generic role for `ios:open`; its header comment and
usage-example string were retargeted there, since the example string carried a fourth copy of the
same literal.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the finding said three copies; the fix found and removed a **fourth**, in
`open-path.mjs`'s usage-example string. That is the right instinct for a dedup: a literal embedded
in documentation drifts exactly like one in code, and it is the copy a reader is most likely to
trust and paste. Worth noting this is release tooling that runs rarely and by hand, so a stale path
here would surface at the worst possible moment — mid-release — rather than in CI.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087959283) · 2026-07-27
06:20:00 UTC</sub>

### b96a77506091 — [P2][duplication] Run-id timestamp format duplicated across report scripts

**Issue**

Both scripts mint a filesystem-safe run id the same way:

```js
new Date().toISOString().replace(/[:.]/g, '-'); // redteam-run
new Date().toISOString().replace(/[:.]/g, '-') + (OUT_TAG ? `-${OUT_TAG}` : ''); // model-eval-run
```

Same regex, same intent, independently maintained.

**Fix**

Added a `runId(tag)` helper to `scripts/lib/utils.mjs` that mints the filesystem-safe ISO timestamp
with an optional suffix, and pointed `redteam-run.mjs` and `model-eval-run.mjs` at it via an aliased
import (`makeRunId`) so the local `const runId` bindings and the emitted id formats stay exactly as
they were.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the two call sites were *not* identical (one appends an optional tag), which
is the usual way a dedup goes wrong. Folding the tag into the helper as an optional parameter keeps
both emitted formats byte-identical rather than unifying them onto whichever one the fix happened to
start from. The aliased import (`makeRunId`) also avoids shadowing the existing local `const runId`
bindings, so neither script's own naming changed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088116114) · 2026-07-27
06:41:46 UTC</sub>

### 4ac8f73319a2 — [P2][duplication] OS "open a file" logic implemented twice, differently

**Issue**

The `darwin ? open : xdg-open` branch — which `scripts/CLAUDE.md` explicitly says belongs "behind a
branch in `scripts/lib/`" — appears in two places with divergent behavior: `open-path.mjs` runs it
through `run()` (blocking, exits on failure), while `redteam-run.mjs` re-derives the same branch and
spawns detached+unref best-effort:

```js
const [cmd, args] = process.platform === 'darwin' ? ['open', [file]] : ['xdg-open', [file]];
```

The platform knowledge is duplicated and will drift.

**Fix**

Added an `openInOS(target, { detached })` helper to `scripts/lib/utils.mjs` and pointed
`open-path.mjs`, `android-open.mjs`, and `redteam-run.mjs` at it, so the macOS-vs-Linux opener
branch lives in one place per the `scripts/` convention. Blocking-vs-detached semantics are
preserved per call site: the first two keep `run()`'s exit-on-failure, and `redteam-run.mjs` keeps
its best-effort boolean with the `REDTEAM_NO_OPEN` opt-out as caller-side logic; its now-unused
`spawn` import was dropped, and the two header comments that restated the moved platform branch were
trimmed to satisfy the grep criterion.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — this is the dedup shape the canary instructions single out as the classic
failure: two call sites that look identical but aren't, unified onto whichever one the fix started
from. Here the difference was load-bearing in both directions — `open-path.mjs` must **block and
exit nonzero** on failure, while `redteam-run.mjs` must be **detached, unref'd, and best-effort** so
a missing `xdg-open` on a headless box doesn't fail a completed red-team run.

Parameterising with `{ detached }` and leaving the `REDTEAM_NO_OPEN` opt-out as caller-side logic
keeps both behaviours intact. Collapsing them onto the blocking form — the tidier-looking option —
would have turned a cosmetic "couldn't open the report" into a nonzero exit at the end of a long
run.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088155531) · 2026-07-27
06:47:15 UTC</sub>

### b1f327620958 — [P2][duplication] Maestro smoke flow duplicated across Android and iOS runners

**Issue**

Both device runners hardcode the same three-step flow with the same literal flow path:

```js
await sh('npm run cap:sync');
// …platform-specific build/install…
await sh(`"${maestroPath()}" [--device …] test .maestro/smoke.yaml`);
```

The `cap:sync` step, the `.maestro/smoke.yaml` path, and the maestro invocation shape are
copy-pasted; a change to the flow file name or a `cap:sync` prerequisite must be edited in two
files.

**Fix**

Added `scripts/lib/native-smoke.mjs` exporting `SMOKE_FLOW` and `runMaestroSmoke({ device })`, and
pointed both the Android emulator and iOS simulator runners at it so the flow path and Maestro
invocation shape live in one place; `maestroPath` was otherwise unused in both files, so it came out
of their `utils.mjs` imports. I also reworded the one header-comment mention of the literal path in
each runner, because the acceptance grep requires that string to appear only in the shared module.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — worth flagging as **unverifiable in this environment**, through no fault of
the fix. These are the Android-emulator and iOS-simulator Maestro runners; neither can execute in a
Linux cloud container (the iOS path needs Xcode, and `test:android:device`/`test:ios` are excluded
from CI for the same reason). So the usual "I ran it and the output is byte-identical" evidence that
backed the last several refactors is not available here — the change rests on reading, and the
`{ device }` parameterisation preserving each runner's own invocation shape.

The risk is low (it is a code move with one parameter, and `maestroPath` was genuinely unused in
both files afterwards), but this is one to exercise on a real device before the next store release
rather than assuming green CI covered it. Per the `mobile` skill, native smoke is a tier CI never
runs.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088295912) · 2026-07-27
07:05:39 UTC</sub>

### e0b9e7b221f4 — [P3][duplication] Gradle-wrapper path resolved in two places

**Issue**

`gradle.mjs` is the canonical Gradle-wrapper runner, yet `android-emulator-smoke.mjs` re-derives the
wrapper path and shell-quotes it by hand:

```js
const gradlew = join(ROOT, 'android', 'gradlew');
await sh(`"${gradlew}" :app:installDebug`, join(ROOT, 'android'));
```

The `android/gradlew` location and the `android/` cwd are now knowledge in two files.

**Fix**

Added `ANDROID_DIR` and `GRADLEW` exports to `scripts/lib/android.mjs` and pointed `gradle.mjs` and
`android-emulator-smoke.mjs` at them, so the wrapper path and `android/` cwd have one definition
instead of two ad-hoc `join(ROOT, 'android')` derivations. Dropped the `join`/`ROOT` imports that
became unused in both callers; the smoke runner still installs via `sh()` so its `try/finally`
emulator teardown behaves as before.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the restraint here is the right call: the obvious "full" dedup would have
routed `android-emulator-smoke.mjs` through `gradle.mjs`'s runner as well as its path constants, but
the smoke runner deliberately calls `sh()` so its `try/finally` emulator teardown still fires on a
failed install. Swapping in a runner with different exit semantics would have leaked a booted
emulator on failure. Sharing the constants and leaving the invocation alone extracts the duplicated
*knowledge* without touching the error handling that depends on it.

Same caveat as b1f327620958: this is Android device tooling that cannot execute in a Linux cloud
container and is excluded from CI, so it rests on reading rather than a run. It is a smaller change
than that one — two path constants and dropped imports — but it belongs on the same "exercise before
the next store release" list.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088482478) · 2026-07-27
07:25:32 UTC</sub>

### d685bdca3929 — [P3][duplication] Admin-API client duplicated between the two smoke tests

**Issue**

Both smoke tests hit the identical admin surface — `POST /api/admin/login` → `{session}`, then
`GET/POST/DELETE /api/admin/tokens` with a `Bearer` header — and each reimplements the request
plumbing (`blobs-smoke` has `post()`/`del()`/`login()`; `api-smoke` inlines the same calls). The
login-and-get-session dance and the tokens JSON shapes are maintained twice.

**Fix**

Extracted the login + /api/admin/tokens request plumbing shared by api-smoke.mjs and blobs-smoke.mjs
into scripts/lib/adminClient.mjs, beside the existing smoke.mjs reporter; each method returns the
raw Response plus the parsed body so every assertion stays in the smoke scripts, and the
deploy-facing 429 retry/backoff became an opt-in `{ retryOn429: true }` flag instead of a second
copy of login(). Also listed the new helper in the scripts/lib/ inventory in
scripts/.ruler/AGENTS.md and regenerated the sibling docs. blobs-smoke.mjs could not be executed
here (needs a live deploy + admin secret) — it was verified by reading the diff line-by-line against
its prior behavior, which preserves method/headers/body, request order, and the retry log and error
messages.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — two things checked, plus one caveat to carry forward.

The API-shape decision is the right one: returning the **raw `Response` plus the parsed body** keeps
every assertion in the smoke scripts. A helper that returned only parsed JSON would have quietly
absorbed the status-code checks that are most of what these smoke tests exist to assert. Likewise
the deploy-facing 429 retry/backoff became an opt-in `{ retryOn429: true }` rather than being
applied to both callers — `api-smoke` deliberately asserts the 429 contract, so silently retrying
past it would have hollowed out that suite.

Confirmed the ruler regeneration landed: `adminClient.mjs` appears in `scripts/.ruler/AGENTS.md`
**and** in both generated `scripts/CLAUDE.md` and `scripts/AGENTS.md`, in sync — no drift waiting to
redden CI's `ruler:check`.

**Caveat for the closeout list:** `blobs-smoke.mjs` could not be executed here (it needs a live
deploy plus an admin secret) and is not in CI, so this half rests on reading rather than a run. It
joins b1f327620958 and e0b9e7b221f4 (Android/iOS device tooling) as changes green CI does not cover.
Worth running `blobs:smoke` against a real deploy before relying on it.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088606971) · 2026-07-27
07:39:56 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### 2eadebfcd3c6 — [P3][duplication] HTML-escaping helper reimplemented per script

**Issue**

Every script that emits HTML needs the same `& < > "` escape. `gen-icons-sheet` imports `esc` from
`lib/scrapbook-chrome.mjs`; `redteam-run` hand-rolls its own `esc`; the model-eval report presumably
has a third. Three copies of one trivial-but-security-relevant function.

**Fix**

Extracted the existing scrapbook HTML escaping semantics into `scripts/lib/html.mjs` and routed both
report generators plus all three direct consumers through it. This removes the duplicate encoder
while normalizing red-team apostrophe and nullish-value escaping as required.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090034324) · 2026-07-27
10:10:08 UTC</sub>

### ed44fe4fcd82 — [P1][duplication] De-duplicate the `DEVICES` viewport map (triplicated verbatim)

**Issue**

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

**Fix**

Centralized benchmark device profiles and unknown-device resolution in a shared module, then updated
the web, mount, iOS, and undo profilers to consume it. The recording replay path remains unchanged.

*Revised before approval:* Updated replay defaults to derive viewport dimensions and DPR from the
shared `IPAD_PRO` profile. Recorded viewport and DPR metadata retain precedence.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/perf/replay-scenario.mjs:55-56` still hardcodes the iPad Pro fallback viewport and DPR,
  so the original duplication remains and future tablet retuning can still silently diverge; derive
  these defaults from `IPAD_PRO` while preserving recorded metadata precedence.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090040819) · 2026-07-27
10:10:47 UTC</sub>

### a8cca2c287f0 — [P2][duplication] Collapse the repeated output-dir / timestamp / throttle-tag construction

**Issue**

Every entry rebuilds the profile directory the same way:

```js
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
const outDir = join(ROOT, 'perf-profiles', `${stamp}-web-${deviceName}-${throttleTag}`);
```

The `stamp` regex appears in all six files, and the `throttleTag` triplet in three. The
`perf-profiles/` path root is likewise hardcoded six times, so relocating the output root (or
changing the timestamp format the analyzer parses out of the suffix) is a six-file edit.

**Fix**

Added a shared profile-path helper that centralizes the output root, timestamp sanitization, and
throttle labels, then migrated all six profiling entry scripts while preserving their existing
suffixes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090314362) · 2026-07-27
10:40:26 UTC</sub>

### 2abbc74363dd — [P2][duplication] Replace the copy-pasted `main().catch` bootstrap with a shared runner

**Issue**

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

**Fix**

Added a shared `runMain` helper and routed all six perf CLI entry points through it, preserving the
undo profiler’s direct-execution guard so imports remain inert. This centralizes their identical
rejection logging and exit policy.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090316419) · 2026-07-27
10:40:41 UTC</sub>

### 712ea15b2c15 — [P2][duplication] Factor out the PERF_MARKS-missing warning (five near-identical copies)

**Issue**

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

**Fix**

Centralized the shared PERF_MARKS warning in a perf-local helper and updated all five entry points
with their command-specific guidance, while preserving Android’s no-warning `--no-build` path.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090318448) · 2026-07-27
10:40:56 UTC</sub>

### 850c0cb152c4 — [P2][duplication] Extract a shared `writeProfileArtifacts` for the trace/metrics/summary/report quartet

**Issue**

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

**Fix**

Added a synchronous pure-Node artifact writer for the standard trace, metrics, summary, and report
quartet. Session, undo, and replay now share it while retaining caller-local metrics, screenshots,
and supplemental artifacts.

*Revised before approval:* Shared the common metrics envelope across session, undo, and replay while
keeping each driver’s domain-specific settings local. Centralized summary/report rendering and
writes behind the analyzer’s derived-output writer, preserving four-file capture output and two-file
standalone re-analysis.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/perf/session.mjs`, `replay-scenario.mjs`, and `undo-scenarios.mjs` still construct the
  identical `{ settings, longTasks, frames, heap }` metrics shape independently; extract the
  requested shared `buildMetrics` helper and use it at all three sites.
* `scripts/perf/analyze.mjs:511-513` still duplicates `renderReport(summary)` and the summary/report
  writes, so the original finding’s fourth call site remains unshared. Extract a summary/report
  writer used by both `analyze.mjs` and `profile-artifacts.mjs`, while keeping trace/metrics writes
  exclusive to profile capture so standalone `perf:analyze` retains its two-file behavior.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090542359) · 2026-07-27
11:06:24 UTC</sub>

### 69d5af4100f8 — [P3][duplication] `ROOT` is defined identically in two lib modules

**Issue**

Both files compute the repo root the same way:

```js
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
```

`model-eval.mjs` re-exports its own `ROOT`, and consumers import `ROOT` from *either* module
(`store-shots.mjs` from utils, `model-eval-*` from model-eval), so there are two "canonical" roots
that only coincidentally agree. If either file moves depth, they diverge.

**Fix**

Imported and re-exported `ROOT` from the shared script utilities, removing the duplicate
repository-root calculation while preserving the model-evaluation module’s public API.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092217645) · 2026-07-27
13:53:23 UTC</sub>

### 4483f1f41a0a — [P4][duplication] PNG/JPEG magic-byte sniff is repeated in `imageDims` and `imageFormat`

**Issue**

Both functions open with the same signature checks:

```js
if (buf[0] === 0x89 && buf[1] === 0x50) // png
if (buf[0] === 0xff && buf[1] === 0xd8) // jpeg
```

The magic pairs are duplicated with no shared `isPng`/`isJpeg`, so a format added in one place can
be forgotten in the other.

**Fix**

Centralized PNG and JPEG signature detection in local predicates and reused them for dimension
parsing and format reporting, preserving each function’s existing guard behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092451158) · 2026-07-27
14:14:31 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 134323841122 — [P1][duplication] Extract the retry-to-open dialog pattern into a shared helper — it is reimplemented four times

**Issue**

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

Grep confirms `isVisible().catch(() => false)` appears in four spec files. The flake-resistance …

**Fix**

Centralized the flake-resistant Parent Center opener and generic retry primitive in the
WebKit-portable shared helpers. All four affected specs now use the shared opener while flows-only
wrappers remain local.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** —
`tests/flows.spec.ts tests/parent-zoom.spec.ts tests/a11y.spec.ts tests/webkit-smoke.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5093997482) · 2026-07-27
16:32:18 UTC</sub>

### 4b7411258a17 — [P2][duplication] `helpers.ts:draw` and `engine.spec.ts:drawStroke` are two near-identical mouse-stroke drivers

**Issue**

`draw(page, points)` in `helpers.ts` and `drawStroke(page, box, points)` in `engine.spec.ts` do the
same thing — move to `points[0]`, `mouse.down()`, iterate `mouse.move`, `mouse.up()`. The only
difference is that `draw` resolves the canvas box itself from `#drawingCanvas` while `drawStroke`
takes a pre-fetched box (and targets `#engineCanvas`). Two copies of the pointer-drag loop drift
independently (`draw` uses `points.slice(1)` in a `for…of`; `drawStroke` uses the same but they are
maintained separately).

**Fix**

Extracted the complete mouse-drag sequence into a shared `dragStroke()` helper. Both `draw()` and
the engine harness’s existing `drawStroke()` API now delegate to it while preserving bounding-box
handling and event order.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5093998817) · 2026-07-27
16:32:26 UTC</sub>

### c4cec499206d — [P3][duplication] `ADMIN_KEY = 'test-admin-secret'` is redeclared in two specs instead of shared

**Issue**

Both specs hardcode `const ADMIN_KEY = 'test-admin-secret'` with the same "set in
playwright.config.ts webServer.env" comment. The value is actually authored in
`playwright.config.ts` (`ADMIN_ACCESS_TOKEN=test-admin-secret`). Three copies of the same secret
literal must be kept in sync; a change to the config value silently breaks whichever spec wasn't
updated.

**Fix**

Added a shared `ADMIN_ACCESS_TOKEN` test constant and imported it into the Playwright server
configuration and both admin-related specs, keeping the server secret and authentication inputs
synchronized.

*Revised before approval:* Updated the WebKit scratch configuration to import the shared admin
access token, keeping its server secret synchronized when it runs either admin-related spec.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/playwright.webkit-scratch.config.ts:26` still hardcodes
  `ADMIN_ACCESS_TOKEN: 'test-admin-secret'`; because this config can run selected `admin.spec.ts` or
  `a11y.spec.ts` tests, changing the new shared constant will desynchronize the server secret and
  login key. Import the shared constant into this config too.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094349055) · 2026-07-27
17:05:29 UTC</sub>

### ff0b8a83bc44 — [P2][duplication] The `define` compile-time constants are restated in `vite.config.ts` and `vitest.config.ts` and have already drifted

**Issue**

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
…

**Fix**

Centralized all five compile-time substitutions in a shared config helper used by Vite and Vitest.
Vitest now defines `__PERF_MARKS__` as `false`, with a focused test directly verifying every build
global while preserving the native test seam.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094793015) · 2026-07-27
17:47:20 UTC</sub>

### f72e6cc5f98a — [P3][duplication] `playwright.config.ts` and `playwright.webkit-scratch.config.ts` duplicate the whole webServer/PORT/env setup

**Issue**

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

**Fix**

Centralized the shared Playwright port, base URL, test defaults, production-preview command, and
web-server environment in `playwright.shared.ts`. Both configs now consume that contract while
preserving their distinct server commands, reuse policies, reporters, and browser projects.

*Revised before approval:* Applied the repository’s Prettier formatting to `playwright.shared.ts`,
correcting the driver-gate failure without changing behavior.

*Revised before approval:* Added `web/playwright.shared.ts` to the testing rule’s path scope so
future changes to the canonical Playwright server settings receive the repository’s required testing
guidance.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Add `web/playwright.shared.ts` to `.claude/rules/testing.md`’s `paths`: the canonical Playwright
  server settings moved into a file that no longer triggers the repository’s required testing rules
  for future edits.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095181390) · 2026-07-27
18:26:02 UTC</sub>

### 0ea1950d7d0b — [P2][single-source-of-truth] The app id `art.splotch.app` is hardcoded in six+ native files

**Issue**

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
…

**Fix**

Added a Node guard that derives the canonical ID from `capacitor.config.json` and validates every
committed Android, iOS, profiler, and Maestro occurrence with field-specific diagnostics. Wired it
into `precheck` so app-ID drift stops `npm run check` before Svelte validation.

*Revised before approval:* Expanded the native-ID guard to validate profiling, testing, and mobile
skill literals across Ruler sources and both generated provider mirrors, preventing stale adb,
Maestro, and fastlane targets. Updated `scripts-info.precheck` to identify
`capacitor.config.json.appId` as canonical and describe both guard and Svelte type generation.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The whole-tree requirement remains unmet: `.ruler/skills/profiling/SKILL.md`,
  `.ruler/skills/testing/SKILL.md`, and mobile skill sources retain unchecked `art.splotch.app`
  literals, so a canonical rename can pass `npm run check` while documented adb, Maestro, and
  fastlane instructions become stale; point them to `capacitor.config.json.appId` or cover them with
  the consistency policy and regenerate the mirrors.
* Update `package.json`’s `scripts-info.precheck` entry: it still claims precheck only generates
  SvelteKit types and neither describes the new native-ID guard nor documents
  `capacitor.config.json.appId` as canonical.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095978689) · 2026-07-27
19:43:07 UTC</sub>

### fb212eea1c1c — [P3][duplication] `cloud-branch-preview.sh` restates ~37 lines of the branching/preview convention already in `docs/CLOUD/Claude.md`

**Issue**

The heredoc (lines 13-49) is a full prose walkthrough of the cloud branching workflow, preview
modes, and slug-URL derivation — content that the file itself says lives in `docs/CLOUD/Claude.md`
("See docs/CLOUD/Claude.md", lines 7, 24). Two hand-maintained copies of the same multi-step
procedure will drift; the hook is the copy most likely to go unnoticed when the doc is updated.

**Fix**

Condensed the cloud-session hook to the three immediate branch and preview actions, delegating the
full workflow, current mode, URL derivation, and commands to the authoritative Claude cloud
documentation.

*Revised before approval:* Clarified that fresh session branches default to the latest
`origin/main`, preserving the documented stacked-branch exception. Limited temporary `feature/*`
preview branches to restricted mode so full-mode sessions continue using their working branch.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `.claude/hooks/cloud-branch-preview.sh:15` omits that the fresh `feat/<feature>` branch defaults
  to the latest `origin/main`, so the injected “actionable essentials” no longer tell the model what
  to branch from.
* `.claude/hooks/cloud-branch-preview.sh:18` makes creation of a temporary `feature/*` branch
  unconditional on restricted mode; in full preview mode the working `feat/*` branch already
  deploys, so this guidance would create an unnecessary branch and conflicts with
  `docs/CLOUD/Claude.md`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097057495) · 2026-07-27
21:33:09 UTC</sub>

### 6c74e219ca5c — [P2][duplication] The checkout + setup-node@24 + `npm ci` preamble is copy-pasted across five jobs

**Issue**

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

**Fix**

Added a repository-local composite action that owns Node 24 setup, optional npm caching, and
optional dependency installation, then routed all five jobs through it. Android prepares Java/KVM
before the composite install, while the Blobs smoke job explicitly disables caching and
installation.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097383195) · 2026-07-27
22:13:51 UTC</sub>

### 3f00c2b6ca4e — [P2][duplication] The Maestro CLI install step is duplicated verbatim between the Android and iOS workflows

**Issue**

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

**Fix**

Added a shared composite action that pins Maestro 2.4.0 through its documented installer interface,
routed both native smoke workflows through it, and updated the dependency inventory for reproducible
CI runs.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097555390) · 2026-07-27
22:36:56 UTC</sub>

### 625e781524f1 — [P2][duplication] The "Upload Maestro report" artifact step is near-identical across the two native workflows

**Issue**

Both jobs end with the same upload-artifact step; only the artifact `name` (`maestro-report` vs
`maestro-ios-report`) differs. Path (`~/.maestro/tests/`), `retention-days: 7`,
`if-no-files-found: ignore`, and the `if: ${{ !cancelled() }}` guard are duplicated. Drift risk on
retention/path changes.

**Fix**

Extracted the shared Maestro report upload into a required-name composite action and updated both
native workflows to pass their existing artifact names. The brief’s internal `!cancelled()` guard
cannot preserve uploads after a failed smoke step because the unguarded composite call is itself
skipped, but I implemented the brief as written.

*Revised before approval:* Restored the caller-level `!cancelled()` guard on both composite-action
invocations so Maestro reports are still uploaded after failed smoke tests while cancelled jobs
remain skipped.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The composite action invocation in both workflows lacks `if: ${{ !cancelled() }}`, so GitHub’s
  implicit `success()` condition skips the entire action when the smoke test fails; the inner guard
  is never evaluated and the failure report is not uploaded. Preserve the caller-level non-cancelled
  execution semantics or use a sharing mechanism that can centralize them without making the
  composite unreachable after failure.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097555835) · 2026-07-27
22:36:59 UTC</sub>

### 4ad32ef6405e — [P4][duplication] The `chromium webkit` browser list is repeated across the two Playwright install steps

**Issue**

```yaml
- run: npx playwright install --with-deps chromium webkit   # cache miss
- run: npx playwright install-deps chromium webkit           # cache hit
```

The browser set `chromium webkit` is hard-coded in two mutually-exclusive steps. Adding a browser
(e.g. firefox) or dropping WebKit means editing both, and the cache-key comment on line 118 is a
third place that encodes the same WebKit assumption. Easy to update one and desync coverage.

**Fix**

Centralized the CI browser list in the test job and reused it for both cache branches, preventing
the Playwright install commands from drifting while preserving the WebKit safeguards.

*Revised before approval:* Made the cache key derive from the complete `PW_BROWSERS` list, so cache
contents stay aligned with the browser installation coverage.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `.github/workflows/test.yml:114` still hard-codes WebKit into the cache key, so adding a browser
  only to `PW_BROWSERS` can hit an existing cache without that browser and skip binary installation;
  derive the cache key from the full browser list so `PW_BROWSERS` is the single source of truth.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097959204) · 2026-07-27
23:23:17 UTC</sub>

### e5ee996eb534 — [P2][duplication] Hub `CATEGORIES` registry + per-category page counts duplicate the generator's source of truth with no drift guard

**Issue**

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
  (`collectionsMissingEntry`) and that the top-level `index.html` is fresh — it never looks inside …

**Fix**

Added proof-sheet hub reconciliation to `scrapbook:check`, detecting missing or extra categories and
validating page counts from generated cells. Updated Objects and Shapes to six pages and added
focused drift coverage.

*Revised before approval:* Changed proof-sheet page counting to use distinct cell page IDs,
preventing git-comparison and focused generator outputs from producing false drift. Added regression
coverage for both cell multiplicities.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/lib/scrapbook-index.mjs:170` derives pages as `cells.length / 2`, but
  `--source git:<ref>` emits four cells per page and focused sheets can emit one cell per page, so
  `scrapbook:check` rejects valid generated sheets with false page-count drift. Count distinct cell
  page IDs instead.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098145375) · 2026-07-27
23:50:21 UTC</sub>

### c9a7b7fef9a1 — [P4][duplication] Hub re-implements the masthead/crayon-strip/breadcrumb chrome by hand

**Issue**

The `<header>` block hand-copies the crayon-strip brand, the `Splotch / Scrapbook` wordmark, and the
breadcrumb that `scripts/lib/scrapbook-chrome.mjs` generates for every other page. The README even
concedes it "carries the shared crayon masthead + breadcrumb by hand; keep it in sync". This is real
structural duplication (distinct from the token duplication above): a change to the generated chrome
(a new brand element, a different crumb separator) leaves this page visually diverged with no guard.

**Fix**

Generated the proof-sheet hub from shared scrapbook chrome and a reusable compact brand/breadcrumb
fragment, while preserving its category navigation behavior. Integrated hub regeneration and
stale-output detection into the scrapbook workflow and documented the new generator command.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/proof-sheet-history.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098273206) · 2026-07-28
00:10:26 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### 699d03ab8e3d — [P3][duplication] Browser-support floor is duplicated between `browserslist` and vite `build.target`

**Issue**

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

**Fix**

Removed the inert root Browserslist mirror and its update script, leaving Vite’s unchanged target
array as the sole web build-floor configuration. Updated the compatibility guide and Vite invariant
text so future floor changes remain anchored to that array and compatible with the native iOS
target.

*Revised before approval:* Formatted the newly committed Code Quality Audit prompt block to dprint’s
required wrapping and whitespace, eliminating the repository-wide format-gate failure without
changing its content.

*Revised before approval:* Removed the stale runtime-fetched CLI entry for the deleted Browserslist
update command. Restored `docs/PROMPTS.md` exactly to its pre-finding content so the browser-floor
fix contains no unrelated prompt additions.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `docs/DEPENDENCIES.md:925` still documents the removed `update:browserslist` script as an
  available dependency-maintenance command; remove or update that stale entry.
* Revert the unrelated `docs/PROMPTS.md` additions from this finding range; they add and reformat
  code-audit prompts unrelated to consolidating the browser-support floor.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099279565) · 2026-07-28
02:34:37 UTC</sub>

### 6ba1c8fd6485 — [P3][duplication] `.cache` is ignored three times in `.gitignore`

**Issue**

`.cache` / `.cache/` appears three times — line 88 (parcel-bundler block), line 100 (Gatsby block),
line 110 (vuepress-v2 block) — all ignoring the same path with different trailing-slash forms. Pure
redundancy that compounds the template-bloat problem above.

**Fix**

Removed the redundant Gatsby and VuePress `.cache` entries while retaining Parcel’s slashless root
rule, preserving ignore behavior for both a `.cache` file and directory.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099280002) · 2026-07-28
02:34:40 UTC</sub>

### 5e29ad6160ca — [P3][duplication] AVD name `Pixel_7_Pro_API_33` is hard-coded across four scripts

**Issue**

The emulator/AVD name is repeated verbatim in `android:boot` (`emulator -avd Pixel_7_Pro_API_33`),
`android:emulator` (`cap run android --target Pixel_7_Pro_API_33`), `android:live`
(`--target Pixel_7_Pro_API_33`), and described in `android:setup`'s `scripts-info` (line 219). The
matching "API 33" system image lives in `scripts/android-setup.mjs`. Renaming the AVD or bumping the
API level touches four+ places with no single constant.

**Fix**

Added a Node dispatcher that reads the shared AVD constant and preserves the boot, sync-and-run, and
live-reload command sequences. Rewired the three package scripts to use it while leaving the
human-readable AVD descriptions unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099280339) · 2026-07-28
02:34:43 UTC</sub>

### 0da9c911af58 — [P2][duplication] Extract the two-blit subtractive glaze stamp shared by `flushCrayonBuffer` and `renderOp`

**Issue**

The "darken at alpha 1, then source-over at alpha `1-mix`" two-blit stamp — the formula that *is*
the crayon subtractive-mix look — is written twice in `strokeOps.ts`: once in `flushCrayonBuffer`
(device-rect blit of the pass buffer) and once in `renderOp`'s `crayonPassRaster` branch
(paper-space draw of a closed pass's raster). A tuning change must be mirrored, and a missed
`globalAlpha` reset would leak state into subsequent draws.

**State at triage (2026-07-27):** Still present at HEAD, at shifted lines: `flushCrayonBuffer`
stamps at `strokeOps.ts:410-415` (inside a `save`/`setTransform(identity)`/`restore` bracket, 9-arg
`drawImage` restricted to the pass bounds), and `renderOp`'s `crayonPassRaster` branch stamps at …

**Fix**

Extracted the duplicated canvas composite-state sequence into a private helper while preserving each
caller’s original geometry, transform, and mix source. Both stamp paths continue to leave the
context at `source-over` with alpha `1`.

*Revised before approval:* Applied the repository’s Prettier formatting to the extracted helper
signature, resolving the driver gate failure without changing behavior.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/engine-crayon.spec.ts tests/flows-palette-brush.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099434786) · 2026-07-28
03:02:22 UTC</sub>

### 16b188392cc0 — [P3][duplication] The `.setting-group .setting + .setting { margin-top: 6px }` rule is copied into three sections

**Issue**

The identical adjacent-sibling spacing rule appears verbatim in three section components, while
ParentCenter already owns the shared `.setting-group`/`.setting` styling globally with a comment
saying the point is to keep these rules "in one place instead of copied into each section
component". The copies contradict that intent.

**State at triage (2026-07-27):** Still true, lines shifted slightly: the rule sits verbatim at
`AppearanceSection.svelte:76-78`, `SavingSection.svelte:70-72`, and
`ControlsSection.svelte:162-164`. ParentCenter's shared block survived the compact-shell refactor
and now lives at `ParentCenter.svelte:489-504` (`.parent-help-content :global(.setting-group)`
margins, `:global(.setting)` card padding/surface), comment intact. …

**Fix**

Centralized the 6px direct setting-card gap in ParentCenter and removed the three section-local
duplicates. The direct-child selector preserves the existing nested AI toggles and compact grid
layouts.

*Revised before approval:* Added a focused Parent Center E2E regression asserting 6px margins on
direct section siblings and no added margin on nested AI feature cards or compact quick-toggle
cells, locking in the hoisted selector’s intended scope.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/tests/flows-parent-center.spec.ts` never asserts the spacing behavior changed by this hoist.
  Add regression coverage confirming direct sibling setting cards retain a 6px top margin while
  nested AI feature cards and compact quick-toggle cells retain no added margin.

**E2E gate** — `tests/flows-parent-center.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099607448) · 2026-07-28
03:31:23 UTC</sub>

### ff763407eb5c — [P2][duplication] The icon glob + `splotchy` exclusion is repeated in three places with no shared source

**Issue**

The rule "render every icon except `splotchy`" is encoded independently as a glob literal in
`Icon.svelte` and `Icon.svelte.test.ts` and as a bare `'splotchy'` string in `iconTypes.ts`'s
`Exclude<>`. (A fourth copy the finding missed: the same glob literal in `icon-orphans.test.ts:8`.)
Excluding a second icon means updating all of them; missing one leaves `CommonIconName` admitting a
name the glob won't load — a silently blank icon at runtime. The `path → name` derivation is also
duplicated between `Icon.svelte` and its test.

**State at triage (2026-07-27):** The finding fully holds at HEAD. All four sites are verbatim:
`Icon.svelte:49`, `Icon.svelte.test.ts:15`, `icon-orphans.test.ts:8` (glob literals) and …

**Fix**

Centralized non-renderable icon metadata and path-to-name derivation in `iconTypes.ts`, then added
guards ensuring all three required literal Vite exclusions stay synchronized. This prevents typed
icon names from silently resolving to empty markup.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows-icons.spec.ts tests/flows-parent-center.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099778083) · 2026-07-28
04:00:38 UTC</sub>

### a70d09993835 — [P2][duplication] Move content-type parsing into a shared `http.ts` helper

**Issue**

The exact "strip params, trim, lowercase the Content-Type" expression is written twice —
generate-image's `contentTypeOf` arrow and an inline copy in csp-report. Both endpoints branch on
Content-Type for correctness (multipart vs raw body; the telemetry format allowlist), so silent
divergence is a real behavioral bug risk, and the pattern belongs beside `readJsonBody`.

**State at triage (2026-07-27):** Still holds verbatim at HEAD. generate-image moved to lines 31-32
(`contentTypeOf`, used at line 59 for the multipart branch and line 91 for the raw `mimeType`);
csp-report's inline copy is now at lines 113-116. The working tree is clean — the untracked failing
test files that blocked the burndown run are gone, so the original blocker no longer exists. …

**Fix**

Extracted Content-Type normalization into the shared `contentTypeOf` helper and reused it in both
API handlers without changing behavior. Added focused coverage for parameterized mixed-case and
absent headers.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100072953) · 2026-07-28
04:46:49 UTC</sub>

### 3346bb417b6e — [P2][duplication] Extract the oversized-body guard shared by generate-image and csp-report

**Issue**

Both endpoints implement the same two-stage security cap — reject on declared `Content-Length`
before buffering, then re-check the actual byte length after the read (a code-unit check would
under-count multibyte payloads) — as two independent copies. A fix to one (e.g. chunked-encoding
handling) won't reach the other.

**State at triage (2026-07-27):** Still holds at HEAD. generate-image's raw-branch guard is now at
lines 80-90 (declared-length check, zero-copy `Buffer.from(await request.arrayBuffer())`, empty-body
400, byte re-check); csp-report's is at lines 121-131 (declared-length check, `request.text()`,
`TextEncoder` re-encode to count bytes). The working tree is clean — the untracked failing tests
that blocked the run are gone. …

**Fix**

Added a shared raw-byte body reader that rejects oversized declared bodies before consumption and
validates the actual buffered bytes, including multibyte UTF-8. Migrated the raw-image and CSP paths
while preserving their existing responses, with focused coverage for declared, missing, dishonest,
and multibyte lengths.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/generate-image.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100073316) · 2026-07-28
04:46:52 UTC</sub>

### 6fa2fb912434 — [P1][duplication] Book id is re-typed as a string argument on every `page()` call, silently generating asset paths on mismatch

**Issue**

`page()` takes the enclosing book's id as a bare string first argument, so each book repeats its id
6× (48 calls total) in `BOOKS`. Nothing ties a page to its book in the type system: pasting a
`page('farm', …)` line into the `dinosaur` block compiles cleanly and silently emits
`/coloring/farm/...` asset paths under the Dinosaurs book. Proposed a builder that binds the book id
once so `Book.id` becomes the single source.

**State at triage (2026-07-27):** The finding still fully holds at HEAD, but the file has been
refactored underneath the patch:

* `books.ts` now builds paths through extracted helpers —
  `pageAssetPath(bookId, pageId,
  orientation, variant)`, `optionalPageAssetPaths(…)`, …

**Fix**

Replaced the free page factory with a book-bound builder so page asset paths always use their
enclosing book ID while preserving the catalog byte-for-byte. Added the catalog-path invariant and
updated the active and legacy wiring examples to the bound form.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100074020) · 2026-07-28
04:46:59 UTC</sub>

### 7d8ae12519cc — [P1][duplication] Extract the six near-identical Gemini `generateContent` wrappers into `lib/gemini.mjs`

**Issue**

All six generators hand-roll the same `ai.models.generateContent` call: base64 the input image into
`inlineData`, append the prompt part, set `abortSignal: AbortSignal.timeout(120_000)` and optional
`temperature`, then `classifyGeminiResponse` and throw on a non-image kind. They differ only in
prompt, webp quality, and (fresh) text-only contents plus `imageConfig.aspectRatio`. Proposed a
`lib/gemini.mjs` exporting `IMAGE_MODEL`, the timeout, `makeClient()` (env-key-checked), and
`generateImage(ai, { imageBytes, mimeType, prompt, temperature, aspectRatio })`.

**State at triage (2026-07-27):** Partially resolved at HEAD, in a way that moots both objections:

* `tools/asset-gen/lib/gemini.mjs` now exists and contains exactly the demanded factory: …

**Fix**

Centralized Gemini image request construction, timeout/model selection, response classification, and
decoding in `generateImage` while preserving all six generators’ prompts and return contracts. Added
focused coverage for image input, text-only aspect-ratio requests, and classified errors.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100495020) · 2026-07-28
05:55:10 UTC</sub>

### c914486d1f43 — [P2][duplication] Background flood-fill is written twice in lib (and a third time in bin)

**Issue**

`scoreNightness` and `detectInventedShapes` flood the open background from the image border through
source-light pixels with the same `push(x,y)` closure, four border-seeding loops, and pop-and-spread
stack loop; `invented-shapes` even documents the copy ("the same machinery as scoreNightness").
`gen-coloring-chalk.mjs` reimplements it a third time. Two separate `170` light-threshold constants
(`NIGHT_SRC_LIGHT`, `SRC_LIGHT`). Proposed `floodBackground(gray, w, h,
lightThreshold)` in a shared
module plus one `BG_LIGHT_THRESHOLD`.

**State at triage (2026-07-27):** Still three copies, slightly reshuffled:

* `lib/night-scores.mjs:65-91` — inline in `scoreNightness`, gated on `s.data[i] > NIGHT_SRC_LIGHT`
  (170). …

**Fix**

Centralized border-seeded four-connected flooding in `regions.mjs` and routed night scoring,
invented-shape detection, and chalk analysis through it. The strict grayscale threshold, chalk’s
binary-mask semantics, and the exported `SRC_LIGHT` compatibility alias remain unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100496505) · 2026-07-28
05:55:24 UTC</sub>

## PR [\#589](https://github.com/KyleMit/Splotch/pull/589) — Drain audit-deferred decision docs: implement the triaged fixes (2026-07-28)

### Finding 1 of 15 — `--check`/flag parsing ad hoc in every gate script — ✅ FIXED

**Decision doc:** `check-flag-parsing.md` (verdict FIX, Option A) · **Priority:** P4

#### What changed

Migrated all five gate scripts from ad hoc `process.argv.includes(...)` / `args[0] === '--…'` checks
to inline `node:util` `parseArgs` (strict mode), with no custom helper module anywhere:

* `scripts/gen-tokens.mjs` — `--check` now parsed via `parseArgs`
* `scripts/image-audit.mjs` — same
* `scripts/gha-versions.mjs` — one `parseArgs` call declaring `check-latest` and `json` booleans,
  replacing three ad hoc lines
* `scripts/publish-scrapbook.mjs` — `main()` now parses `check`, `index-only`, and positionals in
  one call; usage text extracted to a shared `USAGE` const; mode selection runs entirely on the
  parsed values
* `tools/asset-gen/bin/gen-asset-manifest.mjs` — `--check` via `parseArgs`; the documented
  no-`scripts/lib/` boundary in `lib/paths.mjs` is untouched since `parseArgs` is stdlib

Deliberate behavior changes (accepted in the decision doc): typo'd flags now exit 1 loudly
(previously `gen-tokens.mjs --chekc` would silently **rewrite** `tokens.css` instead of gating);
`publish-scrapbook` mode flags are recognized in any position, and combining a mode flag with
positionals is a usage error.

#### Adversarial review

A second subagent with no context from the implementer reviewed the diff against the decision doc:
**APPROVE**, confirming all four objections from the original failed burndown attempt are resolved
(scrapbook mode selection owned by the parser, `gen-asset-manifest.mjs` included, zero duplicated
parser code, nothing custom left to unit-test). One nit: `--check --index-only` combined silently
ran index-only (a write). Addressed — combining the two mode flags is now also a hard usage error.

#### Verification

`gen:tokens:check`, `img:audit:check`, `scrapbook:check`, `scrapbook:index`,
`check:assets:manifest`, and `deps:gha -- --json` all pass identically; typo'd-flag runs on all five
scripts exit 1 without writing; the doc's grep for leftover ad hoc parsing returns nothing.

#### Drained

Deleted `docs/audit-deferred/decisions/check-flag-parsing.md` and the stale draft patch
`p4-consistency-check-flag-parsing-done-ad-hoc-in-every-gate-script.patch` it referenced (the draft
no longer applied cleanly and is superseded by this implementation).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5102683503) · 2026-07-28
10:01:12 UTC</sub>

### Finding 2 of 15 — Copy-pasted CLI `flag()` parser in every perf entry script — ✅ FIXED

**Decision doc:** `perf-flag-parser.md` (verdict FIX, Option A) · **Priority:** P1

#### What changed

Added `parsePerfArgs(spec, argv)` to `scripts/perf/args.mjs` — the single owner of the perf CLI flag
vocabulary — and migrated all five perf entry scripts off their duplicated `flag()`/derivation
blocks:

* `scripts/perf/args.mjs` — new `parsePerfArgs` per the doc's sketch: tolerant `flag`/`has` lookups,
  the common flags (`device`, `port`, `no-build`) plus a conditional `throttle`/`no-throttle` pair
  and per-script declared extras, and a warn-only unknown-flag report gated on direct entry (silent
  under vitest library import). `resolveThrottle` stays exported.
* `scripts/perf/scenario.mjs`, `mount.mjs` — migrated with `throttleDefault: 4`
* `scripts/perf/ios.mjs` — migrated with no throttle default, so `--throttle`/`--no-throttle` now
  draw the warning instead of being silently ignored (accepted behavior change from the doc)
* `scripts/perf/undo-scenarios.mjs` — migrated with its seven extra flags (`cold-tier-timeout-ms`,
  `hz`, `long-seconds`, `long-ops`, `multi-seconds`, `strokes`, `scenarios`); its inline main-guard
  consolidated onto the imported `isMain` (byte-equivalent)
* `scripts/perf/replay-scenario.mjs` — migrated with `throttleDefault: 0` and extras
  `recording`/`turbo`
* `scripts/tests/perf-args.test.mjs` (new) — the doc's five seam tests: defaults, overrides,
  `--no-throttle` beats `--throttle=`, no-throttle-spec case, and entry-gated warning

`scripts/perf/android.mjs` deliberately untouched per the doc's out-of-scope list.

#### Adversarial review

An independent reviewer with no context from the implementer: **APPROVE, no blocking findings.** All
three prior burndown objections confirmed structurally resolved (no entry script re-derives common
flags; per-script throttle defaults preserved as explicit spec parameters; warning gated on entry so
test imports stay silent — verified empirically). Two nits, both explicitly no-action: the `isMain`
guard consolidation was an in-spirit cleanup worth documenting (done here), and a multi-typo
invocation repeats the known-flags list per typo (harmless).

#### Verification

`npm run test:scripts`: 156/156 pass, including the new seam test and the exact-stderr perf CLI
suites. An equivalence harness comparing legacy per-script derivations vs `parsePerfArgs` across 8
representative argvs matched on all. Live run of `replay-scenario.mjs --recroding=typo.json` warns
then fails with the unchanged usage error. Full `perf:web`/`perf:undo` profiles need a built
bundle + Chromium the CI sandbox lacks; covered by the equivalence harness instead.

#### Notes for follow-up (pre-existing, out of scope)

`scripts/perf/mount.mjs` calls `join(outDir, …)` but never imports `join` from `node:path` —
`runMountProfile` would throw at its artifact-write step today, before and after this change. Worth
filing as its own issue.

#### Drained

Deleted `docs/audit-deferred/decisions/perf-flag-parser.md` and its stale draft patch
`p1-duplication-extract-the-copy-pasted-cli-flag-args-parser-shared-by-ev.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5102786410) · 2026-07-28
10:11:09 UTC</sub>

### Finding 8 of 15 — Browser floor duplicated: `vite.config.ts` vs `browserslist` — ✅ FIXED

**Decision doc:** `browser-floor-duplication.md` (verdict FIX, per its post-merge addendum) ·
**Priority:** P1

#### What changed

PR \#583 had already deleted the root `browserslist`, so per the doc's addendum the fix is
extraction + invariant correction, not a browserslist mapper:

* `web/browserTargets.ts` (new) — the single declaration of the web browser floor
  (`chrome111, edge111, firefox114, safari16.4, ios16.4`), extracted from `vite.config.ts` so tests
  can import it without executing the Vite config (which runs `sveltekit()`, `VitePWA()`, and a git
  `execSync` at module level — the exact failure mode the doc warned a naive test would hit).
* `web/vite.config.ts` — `build.target` now consumes `BROWSER_TARGETS`; array character-identical to
  the old inline literal.
* **The inverted invariant prose is fixed at all four sites.** The old text claimed the web iOS
  floor must stay **≥** the native deployment target — backwards. A native app on iOS N runs a
  WKWebView at N, so the web floor must stay **≤** `IPHONEOS_DEPLOYMENT_TARGET`. Corrected in
  `browserTargets.ts`, twice in `docs/COMPATIBILITY.md`, and in the mobile skill's `ios.md` (fixed
  at the `.ruler` source, mirrors regenerated — the skill states it from the native side, "native ≥
  web floor", the same inequality).
* `web/src/browserFloor.test.ts` (new) — enforces the invariant against the real `project.pbxproj`:
  every target parses as engine+version, exactly one `safari` + one `ios` entry, at least one
  deployment target parsed (fail-closed on zero matches), and every webkit floor ≤ every deployment
  target.

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE, zero findings.** Since the prior
burndown attempt failed precisely by writing the invariant backwards *and* shipping a test that
green-lit the unsafe state, the reviewer re-ran the doc's regression probe independently: stubbing
the floor to `ios17` fails the test against the real pbxproj's 16.4, and a no-match pbxproj parse
fails loudly. It also grepped repo-wide for any surviving inverted "MUST stay" statement (none
outside git history) and confirmed the three ruler mirrors are byte-identical to their source.

#### Verification

`npm run check` 0 errors · `test:unit` 773/773 (5 new) · `npm run build` and `npm run build:cap`
both green (both targets consume the extracted array) · `format:check` clean · full Playwright E2E
exit 0 (167 passed; three known-flaky specs passed on retry under sandbox load).

#### Drained

Deleted `docs/audit-deferred/decisions/browser-floor-duplication.md` and its stale draft patch
`p1-duplication-browser-support-floor-is-duplicated-across-vite-config-ts.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103574179) · 2026-07-28
11:31:36 UTC</sub>

### Finding 10 of 15 — `CAPACITOR` single signal re-derived in every config — 🗑️ DROPPED (per decision doc)

**Decision doc:** `capacitor-single-signal.md` (verdict DROP) · **Priority:** P3

No implementation — the triage decision was to drop. Summarized for the record: the "duplication" is
two identical, stable, well-commented one-line `CAPACITOR` env parses (in `web/svelte.config.js` and
`web/vite.config.ts`) plus one deliberate test override. CLAUDE.md's "single signal" promise is
about the env var being the *sole branching input* for web-vs-native — and that invariant is intact
at HEAD. Extracting a literal single parse site would cost two new files (`.mjs` + `.d.mts` to cross
the JS/TS config boundary) and permanent indirection to deduplicate two lines that cannot
meaningfully drift.

The doc leaves a complete, reviewed-shape recipe (its Option B) in git history should the literal
single parse site ever be wanted — with explicit guidance not to merge it into the
version-derivation module.

#### Drained

Deleted `docs/audit-deferred/decisions/capacitor-single-signal.md` and its draft patch
`p3-consistency-the-capacitor-single-signal-is-re-derived-independently-i.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103653445) · 2026-07-28
11:40:06 UTC</sub>

### Finding 12 of 15 — npm@11 pin rationale copy-pasted across four shell files — ✅ FIXED

**Decision doc:** `npm11-pin-rationale.md` (verdict FIX) · **Priority:** P2

#### What changed

Comment-only, purely subtractive change across the four cloud-session shell files: the duplicated
multi-line npm@11 pin rationale is replaced with short pointers at the canonical homes.

* `.claude/hooks/session-start.sh` + `.claude/cloud/setup.sh` → point at `docs/CLOUD/Claude.md`'s
  **npm-version note** (keeping the discard-churn framing and the `npx` justification respectively)
* `.codex/cloud/setup.sh` + `.codex/cloud/maintenance.sh` → point at `docs/CLOUD/Codex.md` (each
  environment's scripts point at their own environment's doc — the two sides have genuinely
  different failure modes)

Commands, `warn` messages, and exit codes are byte-identical. One clause added to
`docs/CLOUD/Claude.md`'s npm-version note (from review, below).

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE.** It mechanically verified every
changed diff line is a `#` comment (zero non-comment changes), confirmed the replacement text
matches the doc's specified wording byte-for-byte, and — the substantive part — checked both pointer
targets actually contain complete explanations covering everything the scripts deleted (npm 10
image, cross-major lockfile dialects, optional-peer disagreement, `--no-save` caveat, the picomatch
`Missing … from lock file` failure, both protective layers). The prior burndown attempt's only
failure — a sandbox that couldn't write `.codex/cloud/*.sh`, leaving the change non-atomic — is
resolved; all four files landed together. One nit taken before commit: the deleted comments'
`MODULE_NOT_FOUND`-on-half-overwritten-files breadcrumb (the reason the pin runs through `npx`
rather than self-updating) survived nowhere, so it was added to the Claude.md npm-version note.

#### Verification

`bash -n` clean on all four scripts · `npm run test:scripts` 167/167 (including
`claude-cloud-setup.test.mjs`, which stubs on the unchanged literal pin command) · `format:check`
clean · the doc's `optional-peer` grep returns only the one load-bearing one-liner plus the two
unchanged warn strings.

#### Drained

Deleted `docs/audit-deferred/decisions/npm11-pin-rationale.md` (no draft patch existed for this
finding).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103763285) · 2026-07-28
11:50:43 UTC</sub>

### Finding 13 of 15 — Android emulator API level second source of truth — ✅ FIXED

**Decision doc:** `android-emulator-api-level.md` (verdict FIX, option b per its post-merge
addendum) · **Priority:** P3

#### What changed

* `scripts/lib/android.mjs` — `ANDROID_API_LEVEL = 33` is now the named canonical source; `AVD_NAME`
  and the system-image strings derive from it.
* `scripts/android-setup.mjs` — both `android-33` literals (system-image ID, image-dir path)
  templated from the constant; header comment made version-neutral. Derived strings evaluate
  byte-identical to the prior literals.
* `scripts/android-emulator-smoke.mjs` — header comment now references `AVD_NAME` instead of a
  hardcoded name.
* `.github/workflows/android-deploy.yml` — `api-level: 33` stays a literal (GitHub Actions can't
  import from JS) but gains a keep-in-sync note naming the enforcing test; each `emulator-options`
  flag is now documented (a prior reviewer objection).
* `scripts/tests/android-config.test.mjs` (new, runs in CI via `test:scripts`) — the drift
  invariant: asserts the derivation, the workflow's `api-level`, and scans the enforced file list
  (`package.json`, the workflow, the mobile/testing skill sources, `docs/COMPATIBILITY.md`) for
  stale emulator-API references using context-anchored patterns, with a per-file non-vacuity guard
  so a prose rewording can't silently drop a file out of enforcement.
* `package.json` — `scripts-info` for `test:scripts` mentions the new invariant (ADR-0019).

#### Adversarial review

Independent reviewer with no implementer context: **APPROVE.** It mutation-tested the drift check in
a scratchpad mirror across four divergence classes: a partial bump (constant → 34, literals
untouched) turns 6 of 7 tests red; the workflow alone diverging turns 2 red; a single stale
skill-doc reference turns red; and — the strongest attack — rewording a doc sentence to dodge *all
four* patterns still goes red via the non-vacuity guard. It also judged the implementer's one
deviation from the doc's sketch (context-anchored regexes instead of bare `API \d\d`) **necessary,
not a weakening**: the sketch's pattern false-positives on legitimate `API 24` min-SDK and `API 31+`
feature references in the enforced files, so the sketch as written could never pass; the added
non-vacuity guard makes the replacement strictly stronger. All three prior burndown objections
confirmed resolved. One wording nit in the smoke-script comment fixed before commit.

#### Verification

`npm run test:scripts` 174/174 (7 new) · derived strings verified byte-identical by evaluating the
real module · workflow change is comments-only · Prettier + dprint clean. Android SDK unavailable in
the sandbox — emulator paths verified by inspection (pure string templating, no runtime change).

#### Drained

Deleted `docs/audit-deferred/decisions/android-emulator-api-level.md` and its stale draft patch
`p3-consistency-android-emulator-api-level-is-a-second-source-of-truth-fo.patch`.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/589#issuecomment-5103863394) · 2026-07-28
12:00:47 UTC</sub>
