# Audit comments — Maintainability

78 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `3dc79d7f1725` — [P2][maintainability] `activePointerIds` Set redundantly shadows `activePointers` Map keys

**Issue**

Two collections track the same pointer identities in lockstep:

```ts
const activePointerIds = new Set<number>();
const activePointers = new Map<number, PointerState>();
```

Every `activePointers.set(id, …)` is paired with `activePointerIds.add(id)` and every delete with a
matching delete. The Set exists only so `releaseAllPointers` can iterate ids *after*
`activePointers.clear()` (965 clears the map, 970 iterates the Set). This is duplicated bookkeeping
that can silently drift (add to one, forget the other) and doubles the mental model of "which
pointers are live."

**Fix**

refactor(drawing): drop redundant activePointerIds Set in engine.ts

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071307262) · 2026-07-24
15:04:18 UTC</sub>

### `3301515248af` — [P3][maintainability] The dial-mask radius `31` is duplicated across two files, coupled only by a comment

**Issue**

The confetti's circular mask hole must stay aligned with the round dial. The horizontal radius `31%`
is hard-coded in AiConfetti's CSS (`ellipse 31% var(--confetti-ry, 41%)`, lines 44 and 51), while
AiImageResult computes the vertical radius as `31 * imgAspect` (line 52) to match it — the two `31`s
are the same physical quantity split across a component boundary and kept in sync only by prose
comments (AiImageResult:49-52, AiConfetti:34-37). The fallback `41%` on line 44/51 is yet another
copy of "31 × (4/3)". Change the dial size and three literals in two files must move together.

**Fix**

Fixed [P3][maintainability] "The dial-mask radius `31` is duplicated across two files, coupled only
by a comment". Single-sourced the horizontal dial-mask radius: added `const DIAL_MASK_RX = 31` in
AiImageResult.svelte, drove `confettiMaskRy` from it, and set `--confetti-rx: {DIAL_MASK_RX}%` on
`.ai-stage` alongside the existing `--confetti-ry`. AiConfetti.svelte's two mask gradients now read
`ellipse var(--confetti-rx, 31%) var(--confetti-ry, 41%)` instead of a bare `31%`. Kept the
defensive CSS fallbacks and updated both explanatory comments. Pure internal refactor —
pixel-identical mask at every aspect ratio (31% 41.3% at 4:3).

All acceptance commands + required checks passed green: `npm run check` (914 files, 0 errors),
`npm run test:unit` (576 passed), `npx eslint` on both changed files (clean), and
`npm run test:e2e -- tests/ai-timer.spec.ts tests/flows.spec.ts` (46 passed). Note: package.json is
at the repo root (web toolchain runs via scripts/web.mjs with cwd=web/), so `npm run check`/e2e were
run from root rather than the brief's literal `cd web`.

Committed on branch audit/burndown. Full SHA: 13f51e396466cb16e6e1884e72072f9a99b96046

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/ai-timer.spec.ts tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071958915) · 2026-07-24
16:19:49 UTC</sub>

### `2446303c1823` — [P4][maintainability] Name the HTTP status magic numbers in `readAiImageResponse`

**Issue**

`if (response.status === 422) return { kind: 'safety' };` and `if (response.status === 429)` (lines
19-20) map bare status codes to domain meanings that are non-obvious — 422 meaning "Gemini safety
refusal" is a project convention shared with the server, not standard semantics. Likewise
`response.status >= 500 ? 'retry' : 'generic'` in aiImage.ts:167 encodes the transient-vs-permanent
rule as a magic `500`.

**Fix**

Named the HTTP status magic numbers per the brief. In aiImageResponse.ts added module-scope
constants SAFETY_REFUSAL_STATUS=422 and THROTTLED_STATUS=429 and swapped the two bare comparisons;
in aiImage.ts added FIRST_SERVER_ERROR_STATUS=500 beside UPLOAD_WEBP_QUALITY and replaced
`response.status >= 500` in the retry/generic decision. Pure literal-to-named-constant refactor,
byte-identical behavior. Verified: `npm run check` clean (0 errors/warnings),
aiImageResponse.test.ts 7/7 (unmodified), `npm run test:unit` 576/576, eslint on both changed files
exit 0. No E2E gate required per brief. No out-of-scope files touched. Committed as
b29b498d8b55e0ce116cd82e5ccc0c198350a4d5.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959440) · 2026-07-24
16:19:53 UTC</sub>

### `1bd96408d078` — [P4][maintainability] `lastSavedDrawingSig` is unresettable module-global mutable state

**Issue**

`let lastSavedDrawingSig: string | null = null;` is module-level mutable state that persists for the
life of the tab and across every call to `generateAiImage`. It has no reset path, so its behavior is
only observable through side effects and is impossible to unit-test in isolation (the existing test
"saves the child drawing once across re-rolls" relies on module load order via `vi.resetModules()`).
Hidden cross-call state in a module is a smell that makes the dedupe logic hard to reason about
independently.

**Fix**

Encapsulated the module-global `lastSavedDrawingSig` in `web/src/lib/drawing/aiImage.ts` behind an
exported `createDrawingDeduper()` factory (instances expose `isDuplicate(sig)`/`record(sig)`), and
rewired `autoSaveImages` to use a module-level `drawingSaver` instance. Behavior is identical:
`!isDuplicate(sig)` equals the original `sig === null || sig !== lastSavedDrawingSig` by De Morgan;
both `isAiGenerationActive(runId)` rechecks, the unconditional post-save `record()` (per the
4b9047c9 comment), and the on-demand `saveImageBlob` import are all preserved. Added a focused
`createDrawingDeduper` unit test; left the existing re-roll dedupe test untouched. Verified green:
`npm run check` (0 errors), targeted unit test (14 passed) and full `npm run test:unit` (577
passed), and `npx eslint` on both changed files (clean). No E2E gate needed — internal non-rendering
state refactor. Commit SHA: 459b59a4736f57d63ac1cc8534594b58f38b79ac

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071959692) · 2026-07-24
16:19:55 UTC</sub>

### `747e56c5d56e` — [P4][maintainability] Style-thumbnail path is derived by inline string interpolation

**Issue**

`src="/styles/{s.toLowerCase()}.webp"` couples the on-disk asset path convention (lowercased style
name under `/styles/`, `.webp`) to a template literal in the markup. The same style set drives both
the picker order and these asset paths, but the path rule lives nowhere near `STYLE_SUFFIXES`. If a
style name gains a space or the asset dir moves, this breaks silently (broken thumbnail, no type
error).

**Fix**

Extracted the style-thumbnail path convention into a named helper. Added
`styleThumbPath(style: StyleName): string` to web/src/lib/ai/styles.ts (returns
`/styles/${style.toLowerCase()}.webp`, byte-for-byte identical to the old inline literal), and
updated web/src/lib/components/AiImagePrompt.svelte to import it and use `src={styleThumbPath(s)}`
in place of the inline interpolation. Verified: npm run check (0 errors, 0 warnings), npm run
test:unit (577 passed), npx eslint on both changed files (clean). No E2E gate applies — the brief
confirms no Playwright spec covers this component and the change is a same-value refactor. Committed
as 5d4e01c0d16a8050d58db1a8725a18791027ff4b.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071960028) · 2026-07-24
16:19:58 UTC</sub>

### `9f2916be314e` — [P4][maintainability] AiDial's `ESTIMATE` is an unexplained 10 s with no link to the real deadline ladder

**Issue**

`const ESTIMATE = 10000;` is the dial's assumed generation time, but the module gives no rationale
and no connection to the actual server budget in `limits.ts` (`GENERATE_DEADLINE_MS = 24_000`,
`CLIENT_REQUEST_TIMEOUT_MS = 27_000`). A reader can't tell whether 10 s is a measured median, an
arbitrary feel-good number, or something that should track the deadline. The bare unit-less `10000`
also invites confusion with the ms constants next door.

**Fix**

Renamed the AiDial `ESTIMATE` constant to `ESTIMATE_MS` so the unit lives in the name, and added a
comment explaining it paces the dial's fill curve toward a typical generation time rather than being
derived from any hard server deadline in ai/limits.ts.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5072033308) · 2026-07-24
16:29:22 UTC</sub>

### `424ae49b08d1` — [P5][maintainability] `VerifyResponse` and `VerifyCredentialResult` overlap without a shared shape

**Issue**

`VerifyResponse` (`{ ok?; error?; accessCode? }`, line 18) is the wire shape and
`VerifyCredentialResult` (lines 11-16) is the returned shape; they share `error`/`accessCode` fields
declared independently. Small, but the two can drift (e.g. server adds a field) and the
`.catch(() => ({}))` on line 37 means a parse failure yields an untyped `{}` widened to
`VerifyResponse`.

**Fix**

Extracted the duplicated `{ ok?; error?; accessCode? }` shape into a single `VerifyPayload` alias,
made `VerifyCredentialResult` extend it (narrowing `ok` back to required), and typed the parsed
fetch response as `VerifyPayload` — so the wire and return types can no longer drift independently.
Type-only change with no behavioral effect on routing, body, or return value.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073001647) · 2026-07-24
18:08:46 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### 688ae3da3928 — [P4][maintainability] Unnamed luminance threshold `0.15` in `isDarkInk`

**Issue**

```ts
export function isDarkInk(hex: string): boolean {
  return relativeLuminance(hex) < 0.15;
}
```

`0.15` is a tuned perceptual cutoff (the point below which ink needs the light keyline against dark
cards) with no name — a reader can't tell it's deliberate vs arbitrary, and the sibling `isWhite`
uses a totally different mechanism (string compare), so the two "does this color vanish?" checks
look unrelated.

**Fix**

Extracted `isDarkInk`'s bare `0.15` luminance cutoff into a module-level `DARK_INK_LUMINANCE_MAX`
constant, folding the existing WHY comment onto it so the tuned perceptual threshold reads clearly
and pairs visually with `isWhite`'s check. Pure extraction, no behavioral change.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074733755) · 2026-07-24
21:47:35 UTC</sub>

### 7f3850427751 — [P3][maintainability] Magic `30px` indent hardcodes "icon width + gap" in two places

**Issue**

`.setting-help { margin: 6px 0 0 30px }` and `.slider-setting { margin: 12px 0 2px 30px }` both use
`30px` to align sub-content under a toggle's label — a value that only equals icon width (`20px`,
`.setting-icon`) + gap (`10px`, `.setting-info`). If the icon size or gap changes, these silently
misalign, and the coupling is invisible. ControlsSection's `.slider-label-name` uses `gap:10px` for
the same alignment intent but doesn't indent, so the family is already inconsistent.

**Fix**

Replaced the two hardcoded `30px` indents with `calc(20px + 10px)` derivations of the icon-column
width they were silently tracking, and moved the sub-setting indent decision out of `SoundSection`
into `SliderRow`, where the `icon` prop that determines whether it applies actually lives. The
indent goes on a new root wrapper inside `SliderRow` rather than on `.slider-label` as the brief
sketched — a label-only margin would have left the volume slider's track flush-left and 30px wider,
since the caller's old wrapper margin shifted both the label and the track; a Playwright geometry
probe against the pre-change code confirms all three rows (help text, Volume, Button Size) render at
identical offsets and widths.

**Adversarial review** — reviewer caught the following; addressed before approval:

* BLOCKING — docs/AUDIT.md not drained: the finding this commit fixes is still present verbatim at
  docs/AUDIT.md:12 (pinned at SHA f934d43), including its trailing `---` at line 36. Every other
  commit on audit/burndown removes its own entry in the same commit (git log -- docs/AUDIT.md lists
  7e0fbad4, 8f5c8e33, 34317459, 1a296ddb, 4d395637; cdd668ae is the sole omission — 7e0fbad4 shows
  the pattern with `docs/AUDIT.md | 25 ---------` alongside its source change). The file's own
  header declares it transient staging that the burndown drains. Consequence: the next burndown pass
  re-picks already-completed work and the staging file overstates the remaining backlog. Fix: delete
  lines 12-36.
* Minor — cdd668ae is the only commit on the branch missing the
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer that all five sibling commits
  carry. Worth folding in when amending for the AUDIT.md fix; not blocking on its own.
* Note on the acceptance criteria (not a defect in the diff): the criterion 'No aria attributes,
  ids, or DOM structure change — this is a pure CSS/margin refactor' is mis-scoped. The fix does add
  a wrapping <div class="slider-row"> in SliderRow.svelte. This is layout-neutral and correct —
  .setting, .slider-setting, and .button-size-setting are all plain blocks (no flex/grid/gap),
  .slider-row carries no rule at all in the non-indented case, and no margin-collapse path opens up
  since .setting has padding and .slider-row has no vertical margins — but the criterion as written
  would falsely fail the change.
* VERIFIED CORRECT — the CSS is a true no-op. Read the compiled stylesheet in
  web/build/_app/immutable/assets/bootHiddenOverlays.CI9QrOzp.css (the minifier folds calc()):
  `.setting-help{...margin:6px 0 0 30px...}` is byte-identical to pre-fix;
  `.slider-row.indented{margin-left:30px}` carries the indent inward; SoundSection's
  `.slider-setting{margin:12px 0 2px}` drops only the left margin; ControlsSection's
  `.slider-setting{margin-top:12px}` is untouched. `class:indented={!icon}` is not inverted —
  SoundSection omits icon (indented), ControlsSection passes icon="photo-size-select-small" (flush).
  Those are the only two SliderRow consumers repo-wide. transition:slide writes
  margin-top/margin-bottom longhands only, so relocating the indent off the transitioning element is
  safe.
* Acceptance commands run independently, all green: `npm run check` → 924 files, 0 errors, 0
  warnings (the absence of a css_unused_selector warning also confirms `.slider-row.indented` is
  live); `npm run test:unit` → 57 files, 579 tests passed; `npx eslint` on SliderRow.svelte,
  SoundSection.svelte, ToggleRow.svelte → clean;
  `npm run test:e2e -- flows.spec.ts a11y.spec.ts parent-zoom.spec.ts` → 54 passed. The suite's only
  toHaveScreenshot assertions target `.color-palette`, so no pixel test covers this margin.
* Completeness sweep clean: nothing was removed or renamed (no prop, export, id, or class deleted),
  so there are no straggler call sites. Greps across web/src, web/tests, docs/, .ruler/, and
  .claude/ found no other reference to the old markup or the 30px indent apart from the stale
  docs/AUDIT.md entry above. No /dev/design styleguide route renders SliderRow or ToggleRow.
* Could not perform a live-browser visual check — starting a dev server and creating a scratch
  Playwright harness were both denied by the sandbox in this environment. The compiled-CSS evidence
  above answers the same question more directly (identical computed margin values), so I do not
  treat this as an outstanding verification gap.
* No repository state was mutated during this review.

**E2E gate** — `tests/flows.spec.ts tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748272) · 2026-07-25
00:10:52 UTC</sub>

### d3ff0447ed42 — [P4][maintainability] Hardcoded `'Courier New', monospace` font stack in two places

**Issue**

The version text (`.version-text`) and the masked/readonly key input
(`.access-code-input[readonly]`) both hardcode `font-family: 'Courier New', monospace`. There's no
monospace token, so the app's mono treatment is defined ad hoc in leaf components; a future third
use (or a brand mono choice) has nothing to reference.

**Fix**

Added a `fontMono` entry to the `scale` object in tokens.ts (emitting
`--font-mono: 'Courier New', monospace;`) and swapped the three hardcoded
`font-family: 'Courier New', monospace` declarations in AiKeyManager, AboutSection, and AdminConsole
for `var(--font-mono)`, since all three shared the identical literal for the same "raw code/version
value" semantic. Also registered the new token on the `/dev/design` styleguide's Type scale section
(following the existing `inputFontSize` row pattern) and in the design skill's token-vocabulary
table via `.ruler/`.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748713) · 2026-07-25
00:10:57 UTC</sub>

### 581bc3f51f65 — [P4][maintainability] `sectionSubtitle('ai')` re-derives AiKeyManager's credential-precedence logic

**Issue**

`sections.ts` decides the AI subtitle with
`if (settings.aiUserApiKey) … else if (settings.aiAccessToken) …` (key-over-code precedence), and
`AiKeyManager` independently derives `hasApiKey`/`hasAccessCode`/`aiLocked` from the same fields.
The precedence rule ("a BYOK key wins over an access code") now lives in two places; changing how
credentials resolve requires editing both, and they can silently disagree about what the hub says vs
what the panel shows.

**Fix**

Added `aiCredentialKind()` to settings.svelte.ts as the single source for the "BYOK key wins over
access code" precedence rule, and switched both `sectionSubtitle('ai')` and `AiKeyManager.svelte`'s
`hasApiKey`/`aiLocked` derivations to read it instead of re-deriving the check independently.
Dropped the now-fully-dead `hasAccessCode` var.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076313305) · 2026-07-25
02:13:47 UTC</sub>

### affbf7744540 — [P2][maintainability] z-index values are magic numbers scattered across components with no shared scale

**Issue**

Stacking order is coordinated entirely by hand-written literals and prose: ClearButton uses
1000/999/500/400/1001, NotchBand 1000 (collides with ClearButton's container at the same 1000),
InstallBanner 950 with a comment reciting "actions toggle 901, Parent Help 900",
ActionsPanel/BrushMenu/StrokeWidthMenu 901, FullscreenToggle 4. The relationships live only in
comments ("Below clear-container (1000)", "Above the real button (1000)"). There is no z-index token
scale in `tokens.css`. A new overlay author has to grep every component and read comments to find a
safe layer, and the NotchBand/ClearButton 1000 tie is exactly the kind of accidental collision this
invites.

**Fix**

Added a `zIndex` scale to `web/src/lib/design/tokens.ts`, threaded it through
`scripts/gen-tokens.mjs` into the generated `tokens.css`, and replaced every cross-component chrome
literal with its `var(--z-*)` across ClearButton, ClearCoachmark, NotchBand, ColorPalette,
ActionsPanel, ParentHelpButton, InstallBanner, FullscreenToggle, and `app.css` — so the stacking
order is reviewable in one ordered list instead of reconstructed from per-site prose (one such
comment on `.color-palette` was already wrong and is now fixed). Values are byte-identical to
before: a throwaway Playwright spec confirmed every live chrome element still computes its original
integer. Two deliberate additions beyond the brief's proposed set: `--z-clear-preview` (400) and
`--z-ripple` (500), which the finding names explicitly, and a "Stacking" row in the `design` skill's
token table so the next overlay author finds the scale instead of grepping. The
NotchBand/ClearButton tie at 1000 is preserved and documented as a follow-up — resolving it is a
paint-order change, not a rename.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Correct core: all 13 cross-component z-index literals are replaced by tokens that resolve to the
  exact same integers; gen:tokens:check, npm run check, test:unit, lint:tokens, eslint on all
  changed files, and the clear-tutorial/page/flows E2E specs all pass (the single page.spec.ts:66
  failure is a pre-existing load flake — green on isolated re-run, no z-index involvement).
  tokens.css is imported in the root +layout.svelte so no route can render an unresolved var(). The
  1000 NotchBand/ClearButton tie is preserved and documented, the stale ColorPalette comment is
  fixed, and the zPanel/zFlyout tie is genuinely inert (.actions-panel is position:fixed + z-index,
  so .flyout-menu nests inside its stacking context).
* BLOCKER — false stacking-context claim on --z-canvas-chrome. tokens.ts:101-103 and
  FullscreenToggle.svelte:33-34 both state the toggle is "local to .canvas-container" and "NOT part
  of the 900+ global chrome tier". DrawingCanvas.svelte:423-435 shows .canvas-container is
  position:relative with no z-index/isolation/transform/filter, so it creates no stacking context,
  and FullscreenToggle is a direct child of it (DrawingCanvas.svelte:419). z-index 4 therefore
  participates in the ROOT stacking context alongside 900/901/1000/1002 — it just loses. (The 0-3
  layers it claims to outrank are mostly sealed inside .canvas-stack, which does set isolation:
  isolate.) Rendering is unchanged, but this commit's deliverable is the documented ordering, and it
  documents a containment boundary that does not exist — the exact class of misleading prose the
  finding set out to remove. Fix: state that the toggle sits at the bottom of the same global
  context (and that .canvas-stack, not .canvas-container, is the isolating boundary), or make
  .canvas-container an actual stacking context if isolation is what's intended.
* BLOCKER — the new token group is absent from the living styleguide.
  routes/dev/design/+page.svelte:6 imports only { brand, scale, themes, toCssVarName }, so zIndex
  cannot be rendered. That page's own header asserts "If it's not on this page, it's not part of the
  visual language" (+page.svelte:55-57), and the design skill edited by this very commit says
  /dev/design "renders every token group ... from the real source objects"
  (.ruler/skills/design/SKILL.md:82-84). Adding a group to tokens.ts/tokens.css without adding a
  Stacking section to the styleguide makes both statements false. Fix: import zIndex and render it
  as a low-to-high list (var name + value) in a new section.
* MINOR (fold into the same round) — the newly added design-skill row describes the scale as
  "--z-clear-preview (400) up to --z-screenshot-flash (10000)", but --z-canvas-chrome (4) is the
  actual floor of the --z-* set; a reader looking for the lowest token is told the scale starts
  at 400.
* MINOR (fold into the same round) — .ruler/skills/architecture/SKILL.md:149-151 (and its two
  generated copies) still quotes `z-index: 4`, `z-index: 900`, and `z-index: 901` as source
  declarations for FullscreenToggle / ParentHelpButton / ActionsPanel. Those literals no longer
  exist in the components, leaving a second prose copy of exactly the numbers this finding set out
  to consolidate. Update the .ruler source to point at the token names and re-run npm run
  ruler:apply.
* web/src/lib/design/tokens.ts:100-104 — the new header asserts "Every token below shares ONE
  context — the root", which is false for --z-flyout: .flyout-menu (app.css:257, position: absolute)
  renders inside .actions-panel, which is position: fixed with z-index: var(--z-panel)
  (ActionsPanel.svelte:394-400) and so establishes a stacking context. tokens.ts contradicts itself
  ten lines below ("Nested inside the panel's own stacking context, so the tie with zPanel is
  inert"). The same over-claim is copied into design/SKILL.md (all three ruler copies) and the new
  /dev/design Stacking paragraph. Concrete failure: raising zFlyout from 901 to 960 to lift a flyout
  above --z-banner (950) has no effect, because the panel's 901 caps the whole subtree — exactly the
  misreading the finding asked the single documented ordering to prevent.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076314324) · 2026-07-25
02:13:52 UTC</sub>

## PR [\#542](https://github.com/KyleMit/Splotch/pull/542) — Cut the audit burndown over to run cloud-native (+ 7 findings) (2026-07-25)

### 0d48e5f32466 — [P3][maintainability] Cross-component coupling via the magic string id 'parentHelpButton'

**Issue**

`bannerExit` does `document.getElementById('parentHelpButton')` to fly the banner into a button
owned by a *different* component (`ParentHelpButton.svelte:15`). The linkage is an untyped string
with no compile-time or grep-time guarantee: rename or remove that id and the banner exit silently
falls back to `dy = 120` (57) with no error. This id-string coupling pattern also appears with
`#brushButton`/`#coloringBookButton`/etc. used for CSS in ActionsPanel, but the cross-component
runtime lookup here is the fragile one.

**Fix**

Added `PARENT_HELP_BUTTON_ID` to `web/src/lib/state/ui.svelte.ts` and pointed both the button's `id`
attribute (`ParentHelpButton.svelte`) and the install banner's `getElementById` exit-animation
lookup (`InstallBanner.svelte`) at it, so a rename of the DOM id can no longer break the
cross-component fly-into-button animation silently. The id's string value is unchanged, so behavior
and the existing `#parentHelpButton` E2E selector are unaffected.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

**Supervisor note** — `web/tests/flows.spec.ts:752` still hardcodes the `#parentHelpButton`
selector. Harmless (the value is unchanged, and a spec asserting on the rendered DOM is a reasonable
place for a literal), but the finding's "one source of truth for this id" is not quite complete.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/542#issuecomment-5078510141) · 2026-07-25
12:39:03 UTC</sub>

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### c6746de06d20 — [P2][maintainability] Unreferenced icon assets (`trash`, `sweep-icon`) ship in the union and glob

**Issue**

`Icon.svelte` eager-globs every SVG in `lib/icons/` into the bundle and `generate-icon-names.mjs`
emits every filename into the `IconName` union. Two icons are never referenced anywhere in
`web/src`:

```
trash      -> 0 files
sweep-icon -> 0 files
```

(`trash-closed`/`trash-open` are the live pair; `trash` is an orphan.) They inflate the generated
union, the eager glob, and — for `sweep-icon` — sit in the hand-maintained `COLOR_ICONS` set
(`Icon.svelte:22`) as permanent dead weight. Because the union is generated from the directory,
nothing flags an icon that no component consumes.

**Fix**

Deleted the two unreferenced SVGs, dropped `sweep-icon` from `COLOR_ICONS`, regenerated the
`IconName` union via `npm run gen:icons`, and added `icon-orphans.test.ts` — it globs every
non-`splotchy` icon and every `.svelte`/`.ts` source outside `Icon.svelte`, the generated `.d.ts`,
and test files, then fails any icon with no whole-name reference (whole-name, not substring, so a
re-added `trash.svg` isn't vouched for by `trash-closed`; verified by temporarily restoring it). One
thing the brief didn't anticipate: `chevron-up.svg` is also a genuine orphan (the drawer chevron is
a CSS-rotated `chevron-right`), so rather than widen this finding's deletion set I grandfathered it
in a `KNOWN_ORPHANS` list, itself guarded by a test that fails once it stops being an orphan —
deleting `chevron-up.svg` is worth a separate finding.

*Revised before approval:* Both review points addressed in 3481689e7795d0784c76116b76503de5360fd909.

1. `isReferenced` now requires a quoted string literal — `(['"])${name}\1` — matching `'name'` /
   `"name"` / `name="name"`, the form every real reference in web/src takes (`<Icon name="close">`,
   `icon: 'theme-auto'`, the quoted tables feeding `icon={option.icon}`). Re-running the tightened
   scan surfaced one previously-masked orphan: `settings.svg`, whose only whole-word mentions are
   prose comments about the `settings` state module. That's a true orphan, not a reference form
   worth accommodating, so it joins `chevron-up` in `KNOWN_ORPHANS` rather than being deleted (a
   third deletion would widen the finding past trash/sweep-icon); the existing carve-out-rot test
   asserts it stays unreferenced. The closing quote subsumes the old `(?<[\w-])` boundary — verified
   by restoring both deleted SVGs and confirming the guard fails on each. Residual noted but left
   alone: `addEventListener('close', …)` in modalDialog.svelte.ts still matches the `close` icon; it
   masks nothing today (close has six genuine Icon usages) and narrowing to `name=`/`icon:` prefixes
   would over-fit the current call sites.

2. scripts/gen-icons-sheet.mjs:49 no longer cites the deleted trash.svg. No surviving icon is a
   single-ink white Material export (trash-closed paints white but is a five-color spot icon), so
   the filename is dropped and the category kept — that's what carries the WHY that the remap can't
   assume black.

Gates: npm run check clean (928 files, 0 errors), test:unit 638/638, test:scripts 51/51, eslint
clean on the changed file, format:check clean.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `isReferenced` in web/src/lib/components/icon-orphans.test.ts matches the bare icon name anywhere
  in a source file, so for icons whose name is an ordinary English word the guard is permanently
  satisfied by unrelated code and can never flag them: `close` matches `close(): Promise<void>` and
  prose in engine.ts, `download` matches `a.download = filename` in drawing/screenshot.ts, `home`
  matches the engine.ts home-indicator comments — same for `loading`, `parent`, `lock`, `pin`,
  `plus`, `folder`, `settings`. Tighten the match to a quoted string literal (`'name'` / `"name"` /
  `name="name"`), which is the form every real reference uses (`<Icon name="theme-auto">`,
  `icon: 'theme-auto'`, `ERASER_SIZE_ICON` maps), and re-run — any icon the tightened match reports
  as an orphan is either a true orphan or a reference form worth accommodating explicitly.
* scripts/gen-icons-sheet.mjs:49 still cites `trash.svg` as its worked example of a white Material
  export ("black `\#1f1f1f`, or a white Material export like trash.svg"); that file no longer
  exists. Point the comment at an icon that still ships, or drop the example.

> [!NOTE]
> The best review catch of the run. The implementer added a guard test to stop orphan icons
> recurring, and the reviewer noticed the guard was hollow for exactly the icons most likely to rot
> — `close`, `download`, `home`, `folder` — because a bare substring match is satisfied by unrelated
> code forever. Tightening it to a quoted literal then surfaced a third real orphan (`settings.svg`)
> that the original finding never knew about. A green test suite would have reported this as fine.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079288825) · 2026-07-25
16:36:04 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 1acf2cbad75a — [P4][maintainability] `app.css` comment points to `screenshot.js`, which is now `screenshot.ts`

**Issue**

```css
/* ...are created imperatively in src/lib/drawing/screenshot.js and appended... */
```

The file is `web/src/lib/drawing/screenshot.ts` (verified — no `.js` exists). The project mandates
"no plain `.js` source files in `src/`," so the stale `.js` reference both misdirects a reader
following the pointer and implies a convention violation that isn't real.

**Fix**

Updated the stale `screenshot.js` reference in the `web/src/app.css` Polaroid comment to
`screenshot.ts`, matching the actual file on disk. `npm run check`, `npm run test:unit`, and eslint
all pass; no E2E gate applies since this is a comment-only CSS change with no runtime surface.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080120380) · 2026-07-25
18:53:12 UTC</sub>

### 4ce6c8215d36 — [P4][maintainability] Adding an icon touches two hand-edited surfaces with no single onboarding note

**Issue**

`svelte.md` documents the happy path ("drop the SVG, run `gen:icons`, use `<Icon>`") but omits that
a **full-color** icon also requires a manual `COLOR_ICONS` edit — otherwise it renders wrongly
tinted on modal surfaces. The test catches the omission in CI, but the contributor learns this only
by failing CI, not from the rule. Grepability of "how do I add a colored icon" is therefore
incomplete.

**Fix**

Extended the "New icons" bullet in .claude/rules/svelte.md to name the manual COLOR_ICONS step in
Icon.svelte and note that Icon.svelte.test.ts enforces it, so contributors adding a full-color icon
discover the step from the rule instead of a CI failure. Docs-only change; format:check, npm run
check, and test:unit all pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080143301) · 2026-07-25
18:59:47 UTC</sub>

### 782cf6e102c0 — [P1][maintainability] HTTP status is chosen by string-comparing the error message

**Issue**

The endpoint decides between `409` (retryable CAS conflict) and `400` (bad input) by comparing the
returned message text to a sentinel:

```ts
function mutationError(message: string) {
  return json(
    { ok: false, error: message },
    { status: message === TOKEN_CONFLICT_ERROR ? 409 : 400 },
  );
}
```

The response *status* — a real part of the API contract, asserted by clients and smoke tests —
hinges on an exact-match of a human-readable string that is also shown to users. Reword
`TOKEN_CONFLICT_ERROR` (line `tokens.ts:162`) for UX and every conflict silently becomes a `400`.
The coupling is invisible: nothing links the wording to the status code.

**Fix**

`MutationResult`'s failure arm in `web/src/lib/server/tokens.ts` is now a discriminated union
carrying `reason: 'invalid' | 'conflict'`, set at every failure return in `addToken`/`removeToken`,
and `/api/admin/tokens`'s `mutationError` takes the failed result and branches on that reason
instead of string-matching `TOKEN_CONFLICT_ERROR` — so rewording the user-facing message can no
longer silently turn a 409 into a 400. The exported `MutationFailure` type gives the endpoint a
precise parameter type without duplicating the literal union; existing tokens.test.ts expectations
were extended with the new field, and the response body is unchanged for API clients.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080250035) · 2026-07-25
19:27:53 UTC</sub>

## PR [\#545](https://github.com/KyleMit/Splotch/pull/545) — Audit burndown: 7 findings fixed, plus a driver data-loss fix (2026-07-25)

### aa621fddcea1 — [P2][maintainability] AdminConsole hardcodes one accent color as a hex literal 8 times

**Issue**

The comment at `:378-384` justifies *not* adopting the theme tokens (this is a deliberately
light-only surface). Fair — but it doesn't justify repeating the raw accent value inline. `\#7c4dcf`
appears 8 times (`.count`, `.btn-primary`, `.btn-ghost`, `.usage strong`, `.more-menu-item`, badge
gradient, …), its hover shade `\#6b3fbe` and `\#7c4dcf`-tinted backgrounds (`#f5f0fc`, `#f0e9fb`,
`#ece0fb`) several more, and neutral `#f0f0f0`/`\#666`/`\#757575` ~10 times. Retuning the console's
accent means a find-replace across the whole `<style>` block with no single source of truth, and
it's easy to miss one (there are already two near-identical purples: `\#7c4dcf` and `var(--brand)`).

**Fix**

Declared five `--admin-*` custom properties on `.admin-page` (accent, hover shade, and the three
purple tints) and replaced every raw occurrence of those hex literals in the `<style>` block with
`var(...)`, so retuning the console's accent is a one-place edit. Values are byte-identical to what
was inlined, so the rendered output is unchanged; the two prose comments documenting the hex value's
WCAG rationale were left alone, and the optional neutral-color consolidation was skipped as the
brief permits. Worth flagging for whoever runs these specs next: two early `a11y.spec.ts` failures
at the admin sign-in step were the in-memory per-IP login rate limiter carrying over between
back-to-back runs against a reused Playwright web server, confirmed unrelated by re-running the
pristine file.

*Revised before approval:* Both review points addressed in one commit. The `.admin-badge` glow,
which repeated the accent in rgba form and would have desynced the moment anyone retuned
`--admin-accent`, now reads `color-mix(in srgb, var(--admin-accent) 35%, transparent)` with the
original `rgba(124, 77, 207, 0.35)` declaration kept immediately ahead of it as the below-floor
fallback — the two-declaration idiom from `ColoringBook.svelte:297-298` that
docs/COMPATIBILITY.md:72 documents. That row already lists AdminConsole for the existing focus-ring
`color-mix` at `:571`, so the risk register needed no edit. The neutrals the finding counted as part
of the defect are hoisted too: `--admin-hairline` (#f0f0f0), `--admin-ink-muted` (\#666), and
`--admin-ink-subtle` (\#757575), referenced at all nine sites. Three prose comments citing hex
values are deliberately left inline as documentation of why those values were chosen, consistent
with the first commit. Every substitution is value-identical and the one new construct resolves to
the same color, so rendering is unchanged. Gates: `npm run check` 0 errors, eslint clean on the
changed file, 645 unit tests pass, and `tests/a11y.spec.ts` + `tests/admin.spec.ts` 12 passed.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/components/admin/AdminConsole.svelte:431` still hardcodes the accent as
  `box-shadow: 0 6px 16px rgba(124, 77, 207, 0.35)` — the same color in rgba form, in the very
  `.admin-badge` rule whose line above was converted to `var(--admin-accent)`. Retuning
  `--admin-accent` now leaves the badge glow at the old purple, which is exactly the "easy to miss
  one" the finding describes; hoist it too (either an `--admin-accent-shadow` custom property, or
  `color-mix(in srgb, var(--admin-accent) 35%, transparent)` preceded by the existing rgba line as
  the fallback, per the convention in docs/COMPATIBILITY.md:72).
* The neutrals the finding explicitly asked for were not hoisted: its proposed solution names
  `--admin-hairline: #f0f0f0` and `--admin-ink-muted: \#666`, and its problem statement counts
  `#f0f0f0`/`\#666`/`\#757575` (~10 occurrences) as part of the defect. They remain inline at
  AdminConsole.svelte:450, 669, 692, 720, 735, 781, 782, 796, 830. Add those two properties (plus
  one for `\#757575`) to the `.admin-page` block and reference them at each site; the acceptance
  criteria narrowed the finding to `\#7c4dcf` only, but the finding asked for both.

**E2E gate** — `tests/a11y.spec.ts tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080832407) · 2026-07-25
22:25:51 UTC</sub>

### bbd8e5c91346 — [P3][maintainability] HMAC label and algorithm are inline literals, re-hardcoded in the test

**Issue**

```ts
return createHmac('sha256', secret).update('admin-session-v1').digest('hex');
```

The session-derivation label `'admin-session-v1'` is documented (`:12-19`) as a rotation lever —
"bump the label to invalidate every outstanding session at once" — yet it's a bare string the
operator has to know to find. The test re-hardcodes the exact same literal (`admin.test.ts:23`)
rather than importing it, so the "pins the exact algorithm" comment there is aspirational: bump the
label in source and the test keeps passing against its own stale copy only if both are edited.

**Fix**

Extracted the session-derivation label into an exported `SESSION_LABEL` constant (plus a
module-local `HMAC_ALG`) in `web/src/lib/server/admin.ts` and had `admin.test.ts`'s
`expectedSession` mirror import the real label instead of re-typing it, so a rotation bump in source
can no longer leave the test asserting against a stale copy. The derived token is byte-identical —
the constant holds the same `'admin-session-v1'` value and `'sha256'` stays a literal in the test.

*Revised before approval:* Reworded the comment above `expectedSession` in
web/src/lib/server/admin.test.ts: it previously claimed the mirror pins both the algorithm and the
label, which stopped being true once the label became an import. It now says the algorithm is pinned
as a literal while the label comes from the exported `SESSION_LABEL`, so a rotation bump in source
is tracked automatically rather than checked against a stale hand-typed copy. Verified with the
admin unit tests (19 passed), `npm run check` (0 errors), eslint on the changed file, and
`npm run format:check`.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/server/admin.test.ts:22-23` — the comment above `expectedSession` still claims the
  mirror "pins the exact algorithm and label", but the label is now imported from source, so it no
  longer pins the label at all (only the algorithm, still the literal `'sha256'`). Reword it to say
  the mirror pins the algorithm and derives from the exported `SESSION_LABEL`, so a label bump is
  tracked automatically.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080835280) · 2026-07-25
22:26:36 UTC</sub>

## PR [\#546](https://github.com/KyleMit/Splotch/pull/546) — Audit burndown: clear the staged docs/AUDIT.md backlog (2026-07-25)

### 3944ad008047 — [P1][maintainability] The `app.html` pre-paint boot script re-hardcodes every persisted `localStorage` key, the boolean-setting list, and the scale clamp — kept in sync only by a comment

**Issue**

The first-paint script duplicates, as vanilla-JS string literals, the exact keys and bounds that
`settings.svelte.ts` defines as named constants: `splotch-action-button-scale`,
`splotch-advanced-controls`, `splotch-drawer-open`, `splotch-stroke-width-control`,
`splotch-eraser-enabled`, `splotch-coloring-book-enabled`, `splotch-screenshot-enabled`,
`splotch-undo-button-enabled`, `splotch-brush-type`, `splotch-theme`, plus the `70`/`130`/`100`
clamp (settings exports these as `ACTION_BUTTON_SCALE_MIN/MAX/DEFAULT`). The only guard is the
comment "keep them in sync." A rename or added `BOOL_SETTINGS` entry in the TS module silently
breaks first-paint for returning users with no compile-time or test failure — the script just stamps
…

**Fix**

Added `web/src/app.html.test.ts`, a node-environment drift guard for the pre-hydration boot script:
it text-parses the `splotch-*` literals out of the boot IIFE and asserts each is defined by a
`*_KEY` constant in `settings.svelte.ts` or `tool.svelte.ts` (one-directional containment, since not
every persisted key gets a first-paint attribute), and checks the `70`/`130`/`100` clamp literals
against the imported `ACTION_BUTTON_SCALE_MIN`/`MAX`/`DEFAULT`. Keys are parsed rather than imported
because those constants are module-private; the clamp bounds are exported so they are imported
instead of hardcoded a third time.

*Revised before approval:* Extended web/src/app.html.test.ts to cover the BOOL_SETTINGS defaults the
review named. The test now parses the boot script's `on('<key>', <default>)` pairs and asserts each
against the `[<KEY>, <default>]` tuple for the same key in settings.svelte.ts, re-keying the tuples
by string literal via the `*_KEY` constant-name map (BOOL_SETTINGS references keys by constant, the
boot script by literal). All seven boot-script booleans get a test, plus a parse-sanity assertion so
neither side can vacuously match zero. Verified by flipping `eraserEnabled` to false (test failed)
and reverting.

Also removed the `@vitest-environment node` docblock: importing settings.svelte.ts runs its
load-time localStorage reads, and .claude/rules/testing.md requires happy-dom for such files.
Flagged in the reply that a stderr warning I initially attributed to the node environment turned out
to occur under both, so the file's comment claims only what was measured.

Gates: check 0 errors, test:unit 680 passed (20 in this file), eslint clean, format:check clean.

*Revised before approval:* Added the requested fail-closed assertion to web/src/app.html.test.ts:
the parsed `on('<key>', <default>)` pair count must equal the number of `\bon\(` call sites in the
boot script, guarded by a non-zero check so it can't pass vacuously. An `on()` call the pair regex
can't read now fails the suite instead of silently dropping that key's per-key guard.

Also widened the pair regex to tolerate whitespace/newlines between tokens, so a prettier reflow of
a near-100-char call still parses rather than tripping the new count assertion on pure formatting.
Stated this as scope slightly beyond the ask.

Verified the guard bites by making one call unparsable (`!on(undoKey, true)`): failed with
`expected 6 to be 7`, then reverted with git status confirming app.html unmodified. Could not
observe the wrap case directly — the prettier PostToolUse hook collapses the manual line break back
— and said so rather than claiming it was tested.

Gates: check 0 errors, test:unit 680 passed, eslint clean, format:check clean.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/app.html.test.ts` guards the keys and the scale clamp but not the boolean defaults, which
  are the other half of the `BOOL_SETTINGS` duplication the finding names. `app.html`'s
  `on('splotch-advanced-controls', true)`, `on('splotch-drawer-open', false)`,
  `on('splotch-stroke-width-control', true)`, `-eraser-`, `-coloring-book-`, `-screenshot-`,
  `-undo-button-` each hardcode a default that must equal the second element of that key's
  `BOOL_SETTINGS` tuple in `settings.svelte.ts:50-91`; flipping one there today still silently
  stamps the wrong first-paint attribute with a green suite — the exact failure the finding
  describes, and the same drift the test already closes for `ACTION_BUTTON_SCALE_DEFAULT`. Parse the
  `on('<key>', <true|false>)` pairs out of the boot script and assert each matches the
  `\w+_KEY, (true|false)` tuple for that key in `settings.svelte.ts`.
* `web/src/app.html.test.ts`'s `bootBoolDefaults` regex
  (`/on\('(splotch-[\w-]+)', (true|false)\)/g`) is fail-open on the boot script's line shape: the
  guard is a per-key `it()` generated only from what it matched, and the only backstop is
  `length > 0`. Several `on()` calls in `app.html` sit at ~93 chars against prettier's
  `printWidth: 100`, so one slightly longer key literal wraps the call across lines and that key's
  default silently loses its guard with a green suite. Add a fail-closed count assertion in the
  `parses keys and boolean defaults out of both sides` test — e.g.
  `expect(bootBoolDefaults.length).toBe([...bootScript.matchAll(/\bon\(/g)].length)` — so an
  unparsed `on()` call fails rather than disappearing, matching the fail-closed shape
  `bootLiteral()` already uses for the clamp.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081312518) · 2026-07-26
01:03:00 UTC</sub>

### 2397edd9ce88 — [P2][maintainability] `hooks.server.ts` `handle` mixes CORS and security-header concerns and repeats the header-copy loop

**Issue**

The single `handle` does two unrelated jobs — CORS for `/api/*` (preflight + response headers) and
stamping `SECURITY_HEADERS` onto non-API SSR responses — and both use the same open-coded pattern:

```js
for (const [key, value] of Object.entries(corsHeaders())) response.headers.set(key, value);
...
for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value);
```

`corsHeaders()` is also called twice per preflight-adjacent request, re-allocating the object each
time. As more cross-cutting response logic accretes, one monolithic `handle` gets harder to reason
about.

**Fix**

Split the single server `handle` into `handleCors` and `handleSecurityHeaders` composed via
`sequence()`, so each hook owns one concern, and factored the duplicated `Object.entries` copy loop
into a local `applyHeaders()` helper with the static CORS object hoisted to a module-level
`CORS_HEADERS` const. The explanatory comments moved to sit beside the code they now explain rather
than stacking at the top of the file. Note that the brief's claim that `npm run test:api:smoke` is
the live contract check for CORS/preflight is wrong — `scripts/api-smoke.mjs` asserts no CORS or
OPTIONS behavior — so I additionally probed a running server to confirm the preflight short-circuit,
the API-only CORS headers, and the SSR-only security headers all behave identically to before.

*Revised before approval:* Added the missing CORS/preflight gate to scripts/api-smoke.mjs: OPTIONS
/api/* must return 204 with all four Access-Control-* values and none of SECURITY_HEADERS (which is
what asserts the preflight short-circuits the handle sequence), and a non-OPTIONS /api/* response
must carry the CORS set with no security-header leak. The absence assertions import header names
from web/src/lib/server/securityHeaders.ts (via --experimental-strip-types, matching the existing
check:assets precedent) so the list can't drift; package.json gained the flags and an updated
scripts-info description. I proved the checks are real gates by temporarily breaking the hook three
ways (204->200, wrong Max-Age, and dropping the /api guard from handleSecurityHeaders) — both new
checks failed and named all three defects — then restored the hook byte-identical to its committed
state. Gates: check 0 errors, unit 680 passed, scripts 66 passed, eslint clean, api:smoke 29 passed
0 failed, format clean, ruler:check in sync. The api and testing skill docs were updated at their
.ruler/ sources and regenerated. Deliberately not done: the SSR half (/admin carrying
SECURITY_HEADERS) still has no automated gate, since page assertions would widen this script past
its stated /api/* charter and the review scoped the ask to /api/*; that behavior was verified
manually.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Nothing in the repository asserts any `Access-Control-*` header or a preflight response —
  `scripts/api-smoke.mjs` (the gate the acceptance criteria claims is "the actual live contract
  check for CORS/preflight behavior") contains no `OPTIONS` request and no CORS assertion, so the
  entire `handleCors` restructure (the early `return resolve(event)`, the 204 short-circuit, and the
  fact that preflights must skip `handleSecurityHeaders`) shipped with zero verification. Add
  assertions to `scripts/api-smoke.mjs` covering `OPTIONS /api/*` → 204 with the CORS set and no
  security headers, and a non-`OPTIONS` `/api/*` response carrying `Access-Control-Allow-Origin: *`
  and none of `SECURITY_HEADERS` — this is the finding's own "Verification" bullet, currently unmet
  by any gate.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/546#issuecomment-5081540506) · 2026-07-26
02:05:42 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### a6630e9d3206 — [P3][maintainability] `ai-timer` comments reference `.js` filenames for modules that are `.ts`, contradicting the TypeScript-everywhere convention

**Issue**

```js
// We drive AiImageResult.svelte through the exact ui.svelte.js seam the real
// generate flow uses (see src/lib/drawing/aiImage.js): open in the loading
```

The seam is `ui.svelte.ts` and the module is `src/lib/drawing/aiImage.ts` (line 53 of the same file
correctly says `aiImage.ts`). These stale `.js` references are misleading in a repo whose CLAUDE.md
mandates "No plain `.js` source files in `src/`" — a reader may grep for a non-existent file.

**Fix**

Updated the two module references in the `ai-timer` harness's leading comment to their real `.ts`
extensions (`ui.svelte.ts`, `src/lib/drawing/aiImage.ts`), so a reader grepping for those paths
finds files that actually exist. Comment text only — no code touched.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081730445) · 2026-07-26
03:04:18 UTC</sub>

### 2bea62d9432e — [P3][maintainability] The `privacy` page hardcodes a full palette of hex colors instead of design tokens, opting out of the token system

**Issue**

The page hardcodes `#f5f5f5`, `\#2b2b33`, `\#7c4dcf` (×3), `\#6c6c76`, `\#6b3fa0`, `#f7f2fd`,
`#eadcfa`, `white`, while inconsistently using `var(--brand)` for the `h1`. Some hardcodes carry
contrast justifications (the `\#7c4dcf` link comment), but the page as a whole bypasses
`lib/design/tokens` — the `design` skill's stated source of truth — so a palette change to the token
set silently skips this route, and light/dark theming can't reach it (it's pinned light). It's the
one user-facing route in scope that ignores the token vocabulary.

**Fix**

The brief's primary assumption was false — `tokens.css` themes at `:root` (`data-theme` is stamped
on `<html>` by `app.html` for every route, with a `prefers-color-scheme` fallback), so `/privacy`
does resolve `--app-bg`/`--surface`/`--text-strong` to their dark values (verified live:
`\#17171d`/`\#23232b`/`#eceaf2`), and swapping in themed tokens would have half-dark-themed a page
whose links are contrast-pinned to a light background; I therefore took the brief's own documented
fallback (option b) rather than option (a). The nine scattered literals are now a single local
`--legal-*` palette declared on `.legal`, each naming the light-theme token it mirrors, with the
light-only decision stated once at the top of the `<style>` block and the contrast justification and
no-token-match notes attached to the constants they explain.

*Revised before approval:* Addressed all three review points and amended the fix into
0decb4ca60674e88ed44d040088f5fa261cc05a6 (tree clean). (1) Reverted the four recolored values — the
constants now hold the page's original \#2b2b33, \#6c6c76, \#6b3fa0 and #f7f2fd, with each comment
naming the token it only *approximates* (`~ --text-strong (\#333)`); `git diff dc5fea2` over the
color literals shows the change is now a pure hoist, the sole substitution being `white` → `#ffffff`
(same color). (2) With `--legal-card` back to #f7f2fd the 2px #eadcfa border keeps its original
~1.18:1 separation from the fill, and the border constant now records that it is paired with the
fill it outlines. (3) Verified `--brand` occurs exactly once in tokens.css (line 16, the unthemed
brand block) and is never redefined in either dark block, so `h1` keeping `var(--brand)` is safe on
a light-pinned page; the header comment now states that exemption instead of implying every color
lives in the local palette. Gates green: npm run check, npm run lint:tokens (count still 8, baseline
untouched), npx eslint on the file, npm run test:unit (680 passed), npx playwright test
tests/page.spec.ts tests/a11y.spec.ts (10 passed, including "/privacy has no serious accessibility
violations"), and npm run format:check.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/routes/privacy/+page.svelte` — the commit presents itself as hoisting the existing
  literals into a local palette, but four of them changed value: `\#2b2b33`→`\#333` (body text),
  `\#6c6c76`→`\#666` (`.updated`), `\#6b3fa0`→`\#7c50bb` (every `h2`), `#f7f2fd`→`#ede7f6`
  (`.highlights li`). The finding's verification is "visual check of /privacy unchanged" and the h2
  purple in particular is a visible lightening across eight headings. Keep the original values in
  the constants (the comment can still name the token each one approximates), or state the recolor
  explicitly as an intentional part of the change.
* `--legal-card: #ede7f6` with `--legal-card-border: #eadcfa` (`.highlights li`) collapses the card
  outline: the old fill `#f7f2fd` sat about 1.18:1 against that border, the new fill sits about
  1.08:1, so the 2px purple border is now nearly indistinguishable from the fill it outlines. If the
  fill moves, the border has to move with it.
* `h1` still uses `var(--brand)` while the new `<style>` header says the page's colors are "declared
  once below as a local palette" — that is the exact `--brand` inconsistency the finding named, left
  unaddressed and now contradicted by the comment above it. Either fold it into the `--legal-*`
  palette or note in the comment that `--brand` is exempt because it is theme-invariant (it is never
  redefined in `tokens.css`'s dark blocks).

**E2E gate** — `tests/page.spec.ts tests/a11y.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081733256) · 2026-07-26
03:05:17 UTC</sub>

### 34a1d4bfe46c — [P3][maintainability] `ai-timer` re-hardcodes the AI failure-mode copy that lives in `aiImage.ts`, so the two can drift

**Issue**

```js
const triggerSafety = () => fail("Let's try drawing something else!", 'safety');
const triggerTimeout = () => fail("That's taking too long — please try again.", 'retry');
```

The comment promises these "mirror exactly what src/lib/drawing/aiImage.ts passes to
failAiGeneration()," but the strings are copied by hand. If production copy changes, the harness
silently previews stale text — defeating the harness's purpose of reviewing the real error UI.

**Fix**

Exported `AI_SAFETY_REFUSAL_MESSAGE` and `AI_TIMEOUT_MESSAGE` from `web/src/lib/drawing/aiImage.ts`
and used them at both production `failAiGeneration()` call sites, so the `/dev/ai-timer` harness now
imports the same constants instead of re-typing the copy. The strings and error kinds are
byte-identical, so the harness can no longer drift from production wording.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081791770) · 2026-07-26
03:26:55 UTC</sub>

### c6594d428ad6 — [P2][maintainability] Collapse the redundant `isDragging` + `activePointerId` drag-state pair

**Issue**

`isDragging` and `activePointerId` are two variables encoding one fact. They are always set and
cleared together (`isDragging = true; activePointerId = e.pointerId` on down;
`isDragging = false; activePointerId = null` in `finishDrag`), and every guard checks
`!isDragging || e.pointerId !== activePointerId`. Two sources of truth for one state invites them
drifting out of sync in a future edit.

**Fix**

Removed the `isDragging` flag from the `dragToClear` action closure and derived drag state from
`activePointerId !== null` at all six read sites, so the pointer id is the single source of truth
for whether a drag is in progress. Inlined the comparisons rather than adding an accessor, per the
brief; note `ClearButton.svelte` has its own unrelated `isDragging` that this change deliberately
leaves alone.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/clear-tutorial.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082223206) · 2026-07-26
05:37:44 UTC</sub>

### d5c146068da7 — [P3][maintainability] `dragToClear` mixes two timer-tracking mechanisms

**Issue**

The action tracks pending timers two different ways: `holdTimer` and `acceptZoneFrame` as individual
nullable vars, and everything else through a `resetTimers` `Set` fed by `scheduleReset`. `destroy`
must therefore remember to clean up three separate things (`holdTimer`, `acceptZoneFrame`, and the
whole `resetTimers` set). A new timer added by a future editor is easy to forget in `destroy`, and
the split obscures which timers a given path owns.

**Fix**

The hold timer is now created via `scheduleReset`, so its id lives in the same `resetTimers` set as
every other pending timeout and `destroy()` no longer needs a separate `clearTimeout(holdTimer)`
line. Both cancel-before-fire sites (`onPointerMove`, `finishDrag`) delete the id from the set
before clearing it, since `scheduleReset`'s callback only self-deletes when the timer actually
fires; `acceptZoneFrame` stays special-cased as an rAF handle.

*Revised before approval:* Added the missing hold-timer coverage in a new
`dragToClear hold-to-show-tutorial timer` describe block in web/src/lib/actions/dragToClear.test.ts:
onTutorialShow not called at 499ms and called once at 500ms after pointerdown; not called after a
threshold-crossing pointermove (100 -> 160, delta 60 > MOVEMENT_THRESHOLD 50) plus 1000ms; not
called when action.destroy() runs mid-hold plus 1000ms. The review's point was correct — the
verifier's criterion claiming those fake-timer tests already existed was false, so the behaviour
this refactor moved onto the resetTimers sweep was untested. I mutation-checked rather than trusting
a green run: neutering the finishDrag hold-timer cancel and the destroy() sweep fails exactly the
destroy-mid-hold test (1 failed, 9 passed), and the source file was restored byte-identical (no diff
vs the fix commit). Gates: npm run check 0 errors, eslint and prettier --check clean on the test
file, full npm run test:unit 694 passed (up from 691).

**Adversarial review** — reviewer caught the following; addressed before approval:

* `web/src/lib/actions/dragToClear.test.ts` has no test for the hold timer at all — no assertion
  that `onTutorialShow` fires at `HOLD_DURATION`, that it is cancelled when `pointermove` crosses
  `MOVEMENT_THRESHOLD`, or that `destroy()` mid-hold prevents it from firing. The last of those is
  precisely the behaviour this refactor moved (from an explicit `clearTimeout(holdTimer)` in
  `destroy` to the `resetTimers` sweep), so the change is untested despite a green suite; the
  verifier's criterion asserting those fake-timer tests exist is false. Add fake-timer tests
  covering: fires at 500ms after `pointerdown`; not fired after a threshold-crossing `pointermove`
  then advancing past 500ms; not fired when `action.destroy()` runs before 500ms.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082282832) · 2026-07-26
05:59:47 UTC</sub>

### dae9fcbf56e7 — [P1][maintainability] Hand-computed responsive-trim ladders are a brittle wall of magic numbers

**Issue**

Both components encode their responsive behavior as long hand-derived media-query tables whose
thresholds are computed in prose comments from geometry constants, e.g. `.color-palette` "A single
column holds N swatches when height ≥ 72·N + 12 (60px swatch + 12px gap, 24px padding)" then seven
`@media … max-width: 515.98px / 452.98px / …` steps, and ColorPicker's "r rows fit while 90vh ≥
51·r + 50 … stepping at ≈ (51r + 50) / 0.9". Every breakpoint (`515.98`, `452.98`, `674.98`,
`564.98`, …) is a manually evaluated formula. Changing a single input — swatch size `60px`, gap
`12px`, hexagon pitch `51px` — silently invalidates ~15-20 breakpoints that must all be re-derived
by hand, and nothing verifies the arithmetic. This is the single largest maintenance hazard in the
section.

**Fix**

Added `web/src/lib/design/trimGeometry.ts` holding the named geometry constants and six pure
functions behind the trim ladders, plus `trimGeometry.test.ts` asserting each reproduces the exact
breakpoint literals in the two components' `@media` rules, so a geometry change that isn't matched
by a CSS edit now fails a test instead of shipping silently; the components' comment blocks point at
the module and no CSS value changed. One caveat worth recording: the ColorPicker ladders are not
reproducible from geometry alone — 2 of their 13 steps sit off any consistent rounding of
`(pitch·n + base) / 0.9` (the 9-row step is ~0.5px *below* the geometric minimum, and the 4-column
step carries 3px of slack where every neighbour carries 5–8), so those functions take the per-step
hand-tuned buffer as an explicit argument rather than pretending it's derived.

*Revised before approval:* Both review points addressed in 42886720d299.

Point 1: `trimGeometry.test.ts` now reads ColorPalette.svelte and ColorPicker.svelte off disk
(precedent: src/app.html.test.ts) instead of transcribing literals. It brace-matches rule blocks to
extract the geometry declarations the module restates (swatch width/height, `gap`, `padding` for
both palette orientations; hexagon width/height, the `.row:not(:first-child)` margin that sets the
row pitch, `.r8`'s `margin-left`, `.picker`'s padding, the 90vh/90vw cap) and classifies every
`@media` rule structurally — by body content and which features it carries, not by value — then
asserts each ladder's thresholds equal the module's output, with a fail-closed check that every
threshold-bearing rule was claimed. Verified by mutation, not assertion alone: ten edits
(`max-width: 515.98px`, `width: 60px`, `gap: 12px`, `padding: 10px`, `max-height: 299.98px`,
`margin-top: -18px`, `padding: 16px`, `max-height: 90vh`, `max-width: 674.98px`,
`margin-left: 31px`) each turned the suite red and were reverted.

Point 2: the hex-grid buffers left the caller. Each ladder now rounds its geometric minimum by a
stated rule — rows to the whole pixel with no slack, columns to the next 5px plus one more 5px step
— which derives 11 of the 13 steps outright. `HEX_GRID_ROW_LADDER`/`HEX_GRID_COLUMN_LADDER` sit next
to `HEX_GRID_GEOMETRY` and carry only the two real deviations with reasons: 9 rows tightens to 565
rather than 566 (half a pixel of overrun the picker clips), and 4 columns takes the first multiple
of 5 above its minimum rather than the second. `hexGridRowLadderPx()`/`hexGridColumnLadderPx()`
produce the whole ladder, so the test asks the module for it.

Gates: `npm run check` clean; `npm run test:unit` 707 passing (this file 7 → 12); eslint clean on
all four files; `format:check` and `lint:tokens` green. The component diff against the audit base
b31fd57 still contains no px/vh/vw change — comment text only.

*Revised before approval:* Both review points addressed in a231ce4d7ad5.

Point 1: ColorPicker's HEIGHT and WIDTH comments no longer describe the pre-review buffer model.
HEIGHT now reads "steps at (51r + 50) / 0.9 rounded up to the whole pixel, no slack — except the
9-row step, tightened 1px below that minimum (HEX_GRID_ROW_RULE and its one exception in
HEX_GRID_ROW_LADDER)"; WIDTH reads "stepping at (60c + 63) / 0.9 rounded up to the next 5px and then
one 5px step further — except the 4-column step, which stops at that first multiple of 5
(HEX_GRID_COLUMN_RULE and its one exception in HEX_GRID_COLUMN_LADDER)". Both name the module
constants, so the prose points at the derivation instead of being a third, independent statement of
it. The WIDTH block was reflowed to keep the wrapping even.

Point 2: the ColorPicker classification test builds `classified = [...rowTrim, ...columnTrim]` and
asserts `new Set(classified).size === classified.length` before comparing length against
`thresholdRules(rules).length` — the same check the ColorPalette describe block uses. Verified
against exactly the masking pair described: one rule given both max-height and max-width
(double-counted, +1) plus one threshold rule switched to min-width so no ladder claims it (−1). The
old sum stayed 13 == 13 and would have passed; the new check fails, and the run confirmed
"classifies every @media rule" among the failing tests. The mutation was reverted.

Gates: `npm run check` clean (0 errors); `npm run test:unit` 707 passing; eslint clean on both
touched files; `format:check` and `lint:tokens` green. The component diff against the audit base
b31fd57 still contains no px/vh/vw change — comment text only.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `trimGeometry.test.ts` hardcodes the breakpoint literals instead of reading them from the
  components, so it is a transcription, not the "seam between the formulas and the CSS" its header
  comment claims: editing `max-width: 515.98px` in ColorPalette.svelte, or
  `width: 60px`/`gap: 12px`/`margin-top: -18px`/`padding: 16px` in either component, leaves the
  suite green — which is exactly the silent drift the finding is about ("manually bump `swatch` and
  confirm every media query updates"). Have the test read `ColorPalette.svelte` and
  `ColorPicker.svelte` from disk (precedent: `web/src/app.html.test.ts`), extract the `@media`
  threshold values and the geometry declarations the module duplicates, and assert them against the
  module's output and its `PALETTE_*_GEOMETRY`/`HEX_GRID_GEOMETRY` constants.
* `hexGridRowMaxHeightPx`/`hexGridColumnMaxWidthPx` take `bufferPx` as a caller-supplied argument
  that exists only inside the test file (columns: 5, 6, 8, 5, 6, 3, 5), so each column step is
  fitted rather than derived — the function can yield any value and a geometry change gives no way
  to re-derive the ladder, only seven unexplained numbers to re-fit. Move the per-step buffers into
  an exported table in `trimGeometry.ts` next to the geometry they modify, with the reason a step
  deviates (e.g. the 545 step's +8 vs. the +5 neighbours), so the module — not the test — holds the
  full ladder.
* `ColorPicker.svelte`'s HEIGHT and WIDTH comments still describe the old buffer model — "so the
  ladder steps at ≈ (51r + 50) / 0.9 with a few px of buffer" and "stepping at ≈ (60c + 63) / 0.9 +
  buffer" — which now contradicts the rounding rules the module documents (rows round up to the
  whole pixel with zero slack and the 9-row step is tightened *below* the minimum; columns round to
  the next 5px and take one more 5px step). Restate both to match
  `HEX_GRID_ROW_RULE`/`HEX_GRID_COLUMN_RULE` so the prose isn't a third, wrong derivation sitting
  beside the two that agree.
* In `trimGeometry.test.ts`, the ColorPicker "classifies every @media rule" test compares
  `rowTrim.length + columnTrim.length` against `thresholdRules(rules).length`, so a rule carrying
  both `max-height` and `max-width` is counted twice and can mask an entirely unclassified ladder
  rule. Use the same `new Set([...rowTrim, ...columnTrim])` uniqueness-plus-length check the
  ColorPalette describe block already does.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082485879) · 2026-07-26
07:09:43 UTC</sub>

### 475eb9696a4d — [P2][maintainability] Magic thresholds/factors in `getRingColor` (0.2, 38, 0.9) are unnamed

**Issue**

```ts
const shift = relativeLuminance(color) < 0.2
  ? (v: number) => Math.min(255, Math.round(v + 38))
  : (v: number) => Math.max(0, Math.round(v * 0.9));
```

`0.2` (dark cutoff), `38` (lighten step), and `0.9` (darken factor) are the whole behavior of the
ring color and are undocumented magic numbers embedded mid-expression. The "~10% darker" intent
lives only in the file-header comment, far from the `0.9`.

**Fix**

Lifted the three bare numbers in `getRingColor` into module-scope `DARK_SWATCH_LUMINANCE`,
`LIGHTEN_STEP`, and `DARKEN_FACTOR` with identical values, so the branch condition and the "~10%
darker" intent read from the code rather than from the doc comment above. Placed the constants above
that doc comment instead of directly above the function, so the comment stays attached to
`getRingColor`; behaviour is unchanged and the existing hard-coded unit-test outputs still pass.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082522042) · 2026-07-26
07:22:00 UTC</sub>

### f657703bd836 — [P2][maintainability] Deprecated `String.prototype.substr` used for channel slicing

**Issue**

`parseInt(hex.substr(0, 2), 16)` etc. `substr` is a deprecated (Annex B) API. In a "TypeScript
everywhere" codebase this is a latent lint/tooling flag and the wrong idiom to copy.

**Fix**

Swapped `hexToRgb`'s three channel reads in `web/src/lib/colorRing.ts` from the deprecated Annex B
`String.prototype.substr` to `slice`, converting the length arguments to end indices (`substr(2, 2)`
→ `slice(2, 4)`, `substr(4, 2)` → `slice(4, 6)`) so the extracted substrings are unchanged. These
were the only `substr` calls left in `web/src`.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082522392) · 2026-07-26
07:22:06 UTC</sub>

### 9f7fe42d4dc3 — [P2][maintainability] Special-case swatch colors are magic string literals in the picker markup

**Issue**

```svelte
class:border={hex === '#ffffff'}
class:border-dim={hex === '\#1A1F24'}
class:selected={colors.customColor.toLowerCase() === hex.toLowerCase()}
```

`#ffffff` is literally `WHITE_INK` (already exported from `colors.svelte.ts`), and `\#1A1F24` is the
darkest grey shade (defined once in `hexPickerLayout.ts:145`). Both are re-typed as bare literals
with no link back to their definitions, and the white check is case-sensitive (`=== '#ffffff'`)
while the grey ramp's white is coincidentally already lowercase — brittle. `rg '\#1A1F24'` won't
connect the CSS-class trigger to the palette entry.

**Fix**

Exported `PICKER_DIM_BORDER` from `hexPickerLayout.ts` (used in the `greys` shades array so the
darkest-grey hex has one source of truth) and switched ColorPicker's two special-case swatch checks
to `isWhite(hex)` and `hex === PICKER_DIM_BORDER`, removing the inline hex literals and the
case-sensitive white comparison. Rendered classes are unchanged: the picker's white swatch is
already `#ffffff`, which `isWhite` matches.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5083042065) · 2026-07-26
10:14:21 UTC</sub>

## PR [\#549](https://github.com/KyleMit/Splotch/pull/549) — Continue audit burndown with Codex (2026-07-26)

### a368a55e9fca — [P3][maintainability] The `4.5px` selection-ring width is a magic number repeated across JS and CSS

**Issue**

The ring width `4.5px` (and the coupled `-4.5px` inset) appears in `ringShadow`,
`gradientRingShadow`, `.color-swatch::before { inset: -4.5px; border: 4.5px … }`. These must move
together (the expand animation must land exactly on the box-shadow ring) but are four independent
literals. Same for the `0.5px` seam.

**Fix**

Centralized the selection-ring width in a palette-level custom property and reused it for the
resting shadow, animated border, and negative inset. This keeps ordinary swatch animation geometry
synchronized while leaving the custom swatch behavior unchanged.

*Revised before approval:* Refreshed the three stale macOS palette snapshots to match the
driver-captured output, which is byte-identical to the already-approved Linux baselines. This
resolves platform-baseline drift without changing the selection-ring implementation.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/palette-trim.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/549#issuecomment-5083437380) · 2026-07-26
12:20:19 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### 6cf6b23338df — [P3][maintainability] `\#007bff` is an off-palette fallback color repeated in the picker CSS

**Issue**

`background-color: var(--color, \#007bff)` (line 391) and
`color-mix(in srgb, var(--color, \#007bff), black 20%)` (line 447) fall back to a bootstrap-blue
that is in neither the palette nor the token set. `--color` is always set on `.hexagon` (line 159),
so the fallback is dead — but if it ever fired it would paint a foreign blue, and its presence twice
implies it's meaningful.

**Fix**

Removed the unreachable off-palette fallback from both `--color` reads so each hexagon consistently
uses its required inline palette value. Preserved the intentional `rgba` fallback for browsers
without `color-mix`.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/webkit-smoke.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084067666) · 2026-07-26
15:10:07 UTC</sub>

### 3f713db68735 — [P4][maintainability] Inconsistent hex casing in `COLOR_FAMILIES` (greys use lowercase, rest uppercase)

**Issue**

Every shade is uppercase except the greys family's `#ffffff` (and it's the value the picker compares
case-sensitively against at `ColorPicker.svelte:155`). Mixed casing makes `rg '#FFFFFF'` miss it and
invites case-sensitivity bugs like the white-border check.

**Fix**

Normalized the greys-family white swatch to uppercase and added coverage requiring every exported
picker shade to be an uppercase six-digit hex value. The case-insensitive uniqueness check remains
unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084068752) · 2026-07-26
15:10:25 UTC</sub>

### dcb67db199cb — [P4][maintainability] `isLightColor` threshold `0.5` is an unnamed magic number

**Issue**

`return relativeLuminance(color) >= 0.5;` — the light/dark decision boundary is a bare literal with
no name, sitting next to `getRingColor`'s separate `0.2` cutoff (finding P2). Two different
luminance thresholds in one file, both unnamed, invite confusion about which governs what.

**Fix**

Named the status-bar light-color brightness threshold while preserving the inclusive 0.5 comparison.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084070053) · 2026-07-26
15:10:48 UTC</sub>

### 6e63601d8c90 — [P4][maintainability] `getMasterKey` memoizes on a module-global promise that ignores which `db` it was created for

**Issue**

`masterKeyPromise` is module-scoped but `getMasterKey(db)` takes a `db` argument (line 59). The
first caller's `db` wins; every later caller's `db` is ignored because the memoized promise is
returned regardless. Today `getDb` is itself memoized so it's always the same connection — but the
API *looks* like it keys off `db` when it doesn't, which will mislead anyone who later makes `getDb`
return per-call databases (e.g. after a delete/reopen).

**Fix**

Master-key initialization now obtains its own memoized database connection, so callers no longer
pass an ignored dependency. The requested source-only change is ready for the driver to run E2E
coverage and commit.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084377949) · 2026-07-26
16:33:16 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 34c4248d2efc — [P3][maintainability] Centralize the credential header names shared by route, CORS, and client

**Issue**

`X-Access-Token` and `X-Api-Key` are load-bearing in three places that must agree, expressed as
unrelated literals:

* generate-image reads them as consts (lowercased) `x-access-token` / `x-api-key`.
* `hooks.server.ts:63` lists them in
  `Access-Control-Allow-Headers: 'Content-Type, Authorization, X-Access-Token, X-Api-Key'`.
* `aiImage.ts:138-139` sets `headers['X-Api-Key']` / `headers['X-Access-Token']` on the request.

Drop one from the CORS allow-list and cross-origin native requests break, with nothing linking the
three. There's no single symbol for the header contract.

**Fix**

Centralized the canonical access-token and API-key header names in a client-safe shared module, then
wired the generation route, CORS policy, and request builder to those exports so the protocol cannot
drift across consumers.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/generate-image.spec.ts tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084813271) · 2026-07-26
18:27:34 UTC</sub>

### b06087c7f4cc — [P3][maintainability] Route all env-var access through a typed, named accessor

**Issue**

Environment variable names are bare string properties on `env` scattered per-module
(`env.GEMINI_API_KEY`, `env.GITHUB_ISSUE_TOKEN`, `env.GITHUB_ISSUE_REPO`). There's no one place that
enumerates the server's required/optional config, no typo protection (`env.GEMINI_API_KEY` vs a
mistyped `GEMINI_APIKEY` both compile to `string | undefined`), and no discoverability of "what must
be configured for the API to work."

**Fix**

Centralized the managed Gemini key and GitHub reporting settings behind call-time `config`
accessors, preserving mutable environment behavior, repository trimming, and fallback semantics.
Updated generation authorization and issue reporting to use the named configuration seam.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084814628) · 2026-07-26
18:27:55 UTC</sub>

### 4cc5d4af62bb — [P3][maintainability] Collect the per-endpoint rate-limit budgets into one table

**Issue**

Every endpoint's throttle budget is defined next to its own call, so the tuned relationship between
them (oracles 10/min, report 5/min tighter as a write, generate 15/min per token, BYOK 30/min
generous — all reasoning that ADR-0014 and the api skill describe as a system) is invisible in code.
`report` and `csp-report` also redundantly pass `windowMs: 60_000`, duplicating the module default.
There's no single spot to see or adjust the throttle policy.

**Fix**

Centralized every endpoint rate-limit budget in a typed server policy object and wired each
endpoint-facing limiter call to its matching entry. The shared access-code peek and failure charge
now explicitly use the same policy without changing behavior.

*Revised before approval:* Restored literal managed and BYOK limiter expectations so the unit tests
independently guard the 15/min and 30/min budgets. Updated the E2E mirror note to reference the
centralized policy module.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `generationAuthorization.test.ts` now compares limiter arguments to the imported production policy
  objects, so it no longer independently protects the required 15/60,000 and 30/60,000 budgets;
  restore literal expectations or add direct assertions for those policy values.
* `web/tests/generate-image.spec.ts:22` still says its limits mirror removed constants in
  `generationAuthorization.ts`; update this stale reference to the new policy module.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084816110) · 2026-07-26
18:28:18 UTC</sub>

### bae1241eafef — [P4][maintainability] `GITHUB_API` base is hard-coded and the User-Agent is a bare literal

**Issue**

`const GITHUB_API = 'https://api.github.com'` and `'User-Agent': 'splotch-feedback'` are inline in
the seam. The API version `'2022-11-28'` (line 64) and Accept header are also literals. Minor, but
the app-identifying User-Agent and API-version pin are the kind of values that belong to a small
named config block rather than buried in the fetch call — and there's no single place that says
"this is how Splotch identifies itself to GitHub."

**Fix**

Centralized the GitHub Accept media type, API version, and User-Agent alongside the base endpoint,
preserving the outgoing request metadata exactly.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084959971) · 2026-07-26
19:07:32 UTC</sub>

### c80ec17623f3 — [P3][maintainability] Unexplained `100` ms magic delay and un-removed `statechange` listener in the installing branch

**Issue**

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

**Fix**

Deduplicated installing-worker observation by identity and made the state listener self-removing
without relying on callback binding. The shared settle-delay constant and focused tests now verify
one-shot options, repeat-check deduplication, and the existing blank-canvas activation behavior.

*Revised before approval:* Applied the repository’s Prettier formatting to the installing-worker
listener assertion so the fix satisfies the driver’s formatting gate. No behavioral code changed.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/pwa-registration.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086069114) · 2026-07-27
00:11:01 UTC</sub>

### 5bf922645152 — [P3][maintainability] Hourly update interval is an inline magic number while its siblings are named constants

**Issue**

```ts
const updateCheckInterval = setInterval(() => {
  checkForUpdates();
}, 60 * 60 * 1000);
```

This file already names `ACTIVATION_RECOVERY_MS = 10_000` and `STROKES_BEFORE_SW_REGISTER` with
explanatory comments, but the update cadence — arguably the most policy-relevant number in the file,
and referenced in the module header comment ("Update checks run on init, hourly, …") — is an inline
`60 * 60 * 1000`. Inconsistent and un-tunable-by-name.

**Fix**

Extracted the hourly PWA update cadence into the module-private `UPDATE_CHECK_INTERVAL_MS` constant
and used it for interval scheduling. This creates a named source of truth while preserving the exact
one-hour behavior.

*Revised before approval:* Reformatted the interval setup to the repository’s Prettier style,
resolving the driver gate failure without changing behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086069965) · 2026-07-27
00:11:11 UTC</sub>

### 1706b94740af — [P3][maintainability] Module-global mutable singletons force a test-only `resetUpdatesForTests` export in production code

**Issue**

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

**Fix**

Moved all four mutable PWA lifecycle fields behind `createPWAUpdates()` and routed both production
callers through one shared instance. Unit tests now create fresh instances per case, eliminating the
test-only reset export while preserving lifecycle behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086070453) · 2026-07-27
00:11:17 UTC</sub>

### fd85849f93cd — [P1][maintainability] Asset filename grammar (suffixes + portrait→tall / landscape→wide) is scattered as string literals with no single mapping

**Issue**

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
`/coloring/` root) means hunting down every literal, and there is nothing greppable that says …

**Fix**

Centralized the coloring root, orientation slugs, and all asset suffixes, then routed page, cover,
and terminal thumbnail path construction through those definitions. This preserves every public URL
while making the asset naming grammar single-sourced.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086072469) · 2026-07-27
00:11:41 UTC</sub>

### f67e4d9c3f68 — [P4][maintainability] Comment hardcodes "eight full covers" — drifts as the catalog grows

**Issue**

```ts
// paints instantly instead of fetching eight full covers on demand.
$effect(() => scheduleIdle(() => prefetchImages(books.map((book) => thumbPath(book.cover)))));
```

There are currently eight books, but the count is derived from `BOOKS`. The comment will silently
lie the moment a ninth book ships, and it also says "full covers" when the code prefetches
`thumbPath(book.cover)` (the thumbnail, not the full cover).

**Fix**

Corrected the idle-prefetch comment to describe every book’s cover thumbnail, matching the unchanged
thumbnail prefetch.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086074999) · 2026-07-27
00:12:11 UTC</sub>

### ebc99704d1ae — [P4][maintainability] `stopDrawSound` disconnects the gain node but never the source node

**Issue**

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

**Fix**

Stopped drawing sources now disconnect alongside their gain after ending, preventing the old source
connection from lingering. Added an isolated lifecycle test that exercises the delayed cleanup.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086081781) · 2026-07-27
00:13:31 UTC</sub>

### 0b2f0132356e — [P3][maintainability] Prompt strings and the transport live tangled in the bin scripts

**Issue**

The multi-paragraph model prompts are the actual product of this pipeline and the thing most often
tuned, yet each is embedded mid-file between imports and control flow. Finding "the dark-fill
prompt" means opening a 441-line CLI and scrolling past scoring code. There is no single surface
where a prompt-tuner can see and diff all of them (contrast the app side, which has
`web/src/lib/ai/prompt.ts`).

**Fix**

Moved the five base asset-generation prompts into a shared importable module, keeping the dark-fill
eye fragments private. All page-specific prompt construction remains in the bins, with prompt values
and Gemini request shapes unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086083543) · 2026-07-27
00:13:54 UTC</sub>

### af294cc81407 — [P3][maintainability] `describeLevers` settings object rebuilt by hand in three generators

**Issue**

Each generator manually maps its `cfg` back into the flag-keyed object `describeLevers` expects
(`{ temperature: cfg.baseTemp, 'max-attempts': cfg.maxAttempts, … }`). The `cfg` was itself built
from those same flag keys moments earlier (in `nightSettings`/`chalkSettings`/`normalizeSettings`),
so the code round-trips key→field→key by hand, and a new lever must be added in three synchronized
spots (the settings builder, the `describeLevers` mapping, the validation).

**Fix**

Each settings builder now retains its parsed, flag-keyed lever settings, derives the operational
configuration from them, and passes them directly to `describeLevers`. This removes the duplicated
report remaps while preserving validation, defaults, derived instructions, ordering, values, and
provenance.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086085924) · 2026-07-27
00:14:23 UTC</sub>

### a7e6318624f4 — [P2][maintainability] The ink-luma threshold `150` is redeclared in four modules with "keep in sync" comments

**Issue**

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

**Fix**

Centralized all three outline classifiers on `OUTLINE_LUMA_THRESHOLD`, preserving the exported
solidity alias and strict boundary. The separate eye-brightness threshold remains unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086087805) · 2026-07-27
00:14:46 UTC</sub>

### 6625bd4de3bf — [P3][maintainability] "Source dark = a line" (`110`) is a magic number copied across four scorers

**Issue**

Four constants equal `110`, all meaning "a source line-art pixel darker than this is an outline
stroke." `invented-shapes.mjs:28` even comments `// … (as scoreDrift)` to flag the coupling. Unlike
the ink-150 case there is no canonical export — the value floats independently in each file, so the
modules that must "see the same picture the gates do" (invented-shapes' stated goal) can drift apart
on a tuning change.

**Fix**

Updated the night scorers and invented-shape detector to use `OUTLINE_INK_CUTOFF` directly, removing
all three duplicate local cutoffs. Their source-ink masks now share one calibration point while
preserving the existing strict comparisons and behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086090850) · 2026-07-27
00:15:21 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### afb1601f21f1 — [P4][maintainability] Windows backslash-normalization is sprinkled across three modules despite Windows support being dropped

**Issue**

Three modules defensively convert `\` → `/` in relative paths. Per the repo CLAUDE.md, ADR-0062
dropped Windows dev support (macOS/Linux only), so `path.relative`/CLI args never contain backslash
separators. The conversions are dead defensiveness that adds noise and implies a portability
contract the project no longer honors.

**Fix**

Added `toPosix()` to `lib/paths.mjs` and replaced all 13 local backslash-to-slash
regex/normalizeTarget call sites across `tools/asset-gen/lib` and `bin` with it (including deleting
`outline-targets.mjs`'s local `normalizeTarget`), so the dead Windows defensiveness lives in one
shared helper instead of 12 private variants. Also updated the two test files' `paths.mjs` mocks to
export `toPosix`, since they previously stubbed the module without it.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor verification** — a 13-site dedup is the shape where non-identical call sites get
quietly unified, so all 13 were checked individually. Two things could have gone wrong and did not:

* **Operation ordering was preserved in both directions.** Most sites stripped a suffix *before*
  normalizing (`.replace(/\.outline\.webp$/, '').replace(/\\/g, '/')`) and still do; the one site
  that normalized *before* stripping `.night.webp` also kept its original order.
* **The deleted `normalizeTarget` was byte-identical** to the new `toPosix`
  (`target.replaceAll('\\', '/')`), so its removal is a true 1:1 substitution rather than a
  widening.

The two test-file edits are additions to a `vi.mock('../lib/paths.mjs', …)` factory — a stub
required by the new export, not an assertion bent to make the refactor pass.

One scoping note for the record: the finding argues the normalization is *dead* (ADR-0062 dropped
Windows), which reads as an argument for deleting it; the fix centralizes it instead. That is the
lower-risk half-step and leaves the removal trivially doable later, but it does mean the dead code
is still executed — just in one place now.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086304859) · 2026-07-27
01:04:23 UTC</sub>

### 9efee0d724fc — [P3][maintainability] `legacy/retouch-line-art.mjs` documents a wrong invocation path and pins a superseded model

**Issue**

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

**Fix**

Added the missing `legacy/` segment to the script's header usage comment and to all three references
in `night-fills.md`, so a copy-pasted invocation resolves instead of failing with MODULE_NOT_FOUND,
and bumped `MODEL` to `gemini-3.1-flash-image` for parity with every other currently-runnable
generator (nothing in `legacy/` claims an intentional 2.5 freeze). The brief's prose named only the
"Retouching the base line art" section of `night-fills.md`, but its acceptance grep spans all of
`legacy/`, so a third occurrence in the prompt-lessons section was fixed too; dprint reflowed the
neighboring lines.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the model-pin bump is the one judgment call worth a glance. Correcting a wrong
path is unambiguous; changing `MODEL` is a behavior change in a file that is deliberately archived.
The reasoning given is sound (parity with every other runnable generator, and nothing in `legacy/`
documents an intentional freeze at 2.5), and the blast radius is a template nobody runs in the
pipeline — but if `legacy/` is meant to be a frozen historical record rather than a maintained
template, that hunk is the one to revert.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5086819329) · 2026-07-27
02:57:16 UTC</sub>

### 8cde70da03cf — [P4][maintainability] `build-review.mjs` silently drops any idea whose `meta.json` fails to parse

**Issue**

The one maintained tool in this folder logs a bad `meta.json` to stderr and continues (`ideas.push`
skipped), so a parse error silently produces a dashboard missing that idea while `console.log` still
reports "wrote … (N ideas)". `done` (line 117) is derived from whatever survived, and the header
hardcodes "of 25" — so a dropped idea shows as "24 of 25" with no error surfaced to the viewer. All
25 `meta.json` files parse and share an identical key set today, so this is latent, not active.

**Fix**

Added a post-loop assertion in build-review.mjs's build() that compares the parsed idea count
against the idea-* directory count and exits 1 with a clear error if they diverge, so a meta.json
parse failure now fails the script loudly instead of silently shrinking the dashboard. Verified by
truncating idea-1/meta.json (script exited 1 with "only parsed 24 of 25...") then restoring it, and
confirmed a clean run still writes all 25 ideas and exits 0; npm run check, eslint, and unit tests
all pass.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the verification is the right shape for a fix to a *latent* defect. The
finding itself says all 25 files parse today, so the failure path is unreachable in the current tree
and a green run proves nothing about it. Truncating `idea-1/meta.json`, confirming the script exits
1 with the intended message, then restoring and confirming a clean run still exits 0, actually
exercises the branch the fix adds — both directions.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087819058) · 2026-07-27
06:03:17 UTC</sub>

### e374ab0d4299 — [P1][maintainability] Two competing Chromium-path mechanisms — one brittle and hardcoded

**Issue**

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
scripts keep working.

**Fix**

Deleted the hardcoded `CHROMIUM_PATH` constant and pointed all four model-eval `chromium.launch()`
sites at the self-healing `chromiumExecutablePath(chromium)` in `scripts/lib/utils.mjs`, so the
model-eval scripts stop breaking on Playwright browser-revision bumps like the other three
Playwright-driving scripts already don't. `PLAYWRIGHT_CHROMIUM_PATH` is folded into that helper as
an alias for `PLAYWRIGHT_CHROMIUM` so existing env setups keep working. Note the brief is
self-contradictory on one acceptance check: keeping that alias (its step 2) means
`grep -rn CHROMIUM_PATH scripts/` still matches the env var name as a substring — the identifier
itself is gone, and `grep -rnw` returns nothing.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — worth flagging how the implementer handled a brief that could not be satisfied
as literally written. Its acceptance criteria asked both to preserve `PLAYWRIGHT_CHROMIUM_PATH` as
an alias *and* for `grep -rn CHROMIUM_PATH scripts/` to come back empty — mutually exclusive, since
the preserved env var name contains the string. Rather than deleting the alias to make a grep pass
(which would have broken existing env setups for a cosmetic check) or quietly declaring the
criterion met, it satisfied the real intent, said plainly which check it could not satisfy and why,
and gave the `grep -rnw` word-boundary form that does verify the identifier is gone.

Backing out the alias would have been the easy way to a green criterion and the wrong call.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5087906847) · 2026-07-27
06:14:15 UTC</sub>

### 9db06685af2d — [P3][maintainability] `store-shots.mjs` uses raw app selectors that bypass the rot-guarded driver

**Issue**

`scripts/CLAUDE.md` explains that `app-driver.mjs` is the selector-facing layer, guarded against
markup rot by `test:driver:smoke`. But `store-shots.mjs` reaches into the DOM with its own raw
locators — `#coloringBookButton`, `button[aria-label="Farm coloring book"]`,
`button[aria-label="Farm coloring page"]`, `.color-swatch[data-color="custom"]`, `#parentHelpButton`
— that the driver doesn't own and the smoke test never touches. When that markup changes,
`gen:shots` silently breaks exactly the way the driver rot-guard was built to prevent, but for
selectors it can't see.

**Fix**

Added `openColoringBook`, `pickBook`, `pickPage`, `openColorPicker`, and `openParentCenter` to
`scripts/lib/app-driver.mjs` and pointed the five raw-locator call sites in `store-shots.mjs` at
them, so every selector the screenshot generator depends on now lives behind the one module the
smoke test guards; `driver-smoke.mjs` now walks the coloring-book entry path (Farm book → Farm page)
and asserts the `#coloringOverlay` becomes visible, so CI catches rot there. The brief's "consistent
`sleep()` after each action" aside conflicts with its later, explicit instruction to leave the
scene-specific sleeps in `store-shots.mjs`; I followed the latter, so the new driver functions are
bare clicks and timing is byte-identical to before. Note: running `gen:shots` as an acceptance check
rewrote the 21 committed PNGs under `store-assets/`; reverting them was blocked by the permission
prompt, so they are excluded from this commit but still dirty in the working tree.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the substantive win is that `driver-smoke.mjs` was **extended**, not just
pointed at: the smoke test now walks the coloring-book entry path (Farm book → Farm page) and
asserts `#coloringOverlay` becomes visible. Moving selectors behind `app-driver.mjs` without that
would have relocated the rot risk rather than guarding it — the module is only rot-guarded for the
paths the smoke test actually exercises. Per `scripts/CLAUDE.md`, this driver has bitten twice
before, so the added coverage is the part that matters.

Also right: the brief contradicted itself on sleeps (an aside asking for a consistent `sleep()`
inside the new driver functions, a later instruction to leave the scene-specific sleeps in
`store-shots.mjs`). Following the explicit instruction keeps screenshot timing byte-identical; the
aside would have changed capture timing across all 21 shots.

> [!NOTE]
> **Working-tree churn, tracked for closeout — not a defect in this fix.** Running `gen:shots` as an
> acceptance check regenerated **21 committed store screenshots** under `store-assets/`
> (`feature-graphic.png` plus the phone/tablet10/iphone69/ipad13 sets), and the implementer could
> not revert them. They are correctly excluded from this commit but remain dirty in the working
> tree, alongside a `scrapbook/index.html` mtime-date churn from an earlier finding.
>
> These are store *marketing* assets, so they are worth not committing by accident. Nothing in this
> session has touched app UI — every change so far is under `scripts/`, `tools/asset-gen/`, and the
> burndown driver — so the regenerated pixels should be antialiasing/seed noise rather than a real
> visual change. I am leaving them rather than reverting mid-run, since editing tracked files races
> the driver's own commit and its rollback `git reset --hard`. They will be cleaned at closeout; if
> a later finding's implementer sweeps them in with a `git add -A`, they will be visible in that
> commit's diff and are safe to revert.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088723784) · 2026-07-27
07:53:37 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### cce1cc9c752c — [P2][maintainability] Name the bytes→MiB conversion (`1048576` literal appears 10×)

**Issue**

The magic constant `1048576` is scattered across the harness for byte→MB math, e.g.
`debug.blobBytes / 1048576`, `(s.heap.afterBytes - s.heap.beforeBytes) / 1048576`,
`geom.bytesPerRaster / 1048576`. Nothing names it "bytes per MiB"; a reader has to recognize 2^20,
and the unit label ("MB" vs "MiB") is applied inconsistently in the reports while the divisor is
binary.

**Fix**

Added a shared byte-to-MiB conversion helper for Node perf scripts and a local equivalent for the
pasteable iPad snippet, replacing all ten opaque divisors. Human-readable output now says MiB while
persisted `*MB` property names and the console table schema remain unchanged.

*Revised before approval:* Renamed the iPad console table column to `history MiB` so its
binary-memory labels are consistent, while leaving the persisted undo artifact fields unchanged.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/perf/ipad-console-driver.js:217` still labels the binary-divided value as `'history MB'`,
  leaving the console report internally inconsistent with its new `MiB/raster` and `150 MiB` labels;
  rename this human-readable table column to `history MiB` (the persisted `*MB` fields in
  `undo-scenarios.mjs` should remain unchanged).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090544650) · 2026-07-27
11:06:38 UTC</sub>

### 061751d51e0e — [P3][maintainability] Promote scattered magic thresholds to named constants

**Issue**

Key thresholds are inline literals with the meaning only in prose comments or nowhere:

* `capture.mjs:73` `intervals.filter((d) => d > 32)` — the long-frame budget (33 ms ≈ 30 fps) as a
  bare `32`, while `analyze.mjs` names its sibling `LONG_TASK_US`.
* `mount.mjs:113` `Math.max(0, t.duration - 50)` and the `>50 ms` label reimplement the 50 ms
  long-task floor that `analyze.mjs:57` already names `LONG_TASK_US`.
* `session.mjs:91` `for (let i = 0; i < 12; i++)` — an undo-click cap with no name.
* `undo-scenarios.mjs:138` `STROKES = 22` is explained ("two past the depth-20 cap") but the `20`
  (`MAX_UNDO_DEPTH`) it depends on is never a constant, so the `22` and the `+2` intent are
  unchecked against the engine.

**Fix**

Extracted the long-frame, long-task, and undo limits into named constants, passing the frame
threshold into the browser evaluation context and sharing the task threshold with mount profiling.
The default undo scenario now derives its unchanged 22-stroke count from the local 20-entry history
depth.

*Revised before approval:* Named and serialized the undo-loop and replay idle-gap caps into their
browser callbacks, preserving the existing 60-step and 250 ms behavior. Centralized the 50 ms
long-task floor so mount reporting and microsecond trace analysis now derive from one policy value.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/perf/undo-scenarios.mjs:249` still leaves the finding’s undo-loop threshold as the bare
  literal `60`; promote it to a named cap and pass it into `page.evaluate`.
* `scripts/perf/replay-scenario.mjs:201` still leaves the cited idle-gap threshold `250` inline;
  promote it to a named constant and pass it into the browser callback.
* The long-task floor remains duplicated between `scripts/perf/capture.mjs:20` (`LONG_TASK_MS = 50`)
  and `scripts/perf/analyze.mjs:57` (`50 * US_PER_MS`), so changing the threshold can still make
  mount and analysis disagree. Put `LONG_TASK_MS` in a shared module and derive `LONG_TASK_US` from
  it.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090547767) · 2026-07-27
11:06:59 UTC</sub>

### fe998442415c — [P3][maintainability] `HARNESS_SYMBOLS` name-matching can silently drop real app functions

**Issue**

The self-time table excludes any function whose lowercased name is in `HARNESS_SYMBOLS`, which
includes generic tokens like `mark`, `measure`, `query`, `evaluate`, `serialize`, `computebox`. In a
minified production build (the profiled target), an app function minified to — or legitimately named
— `query`/`mark`/`measure` would be dropped from the report as "harness overhead," hiding a real
hotspot. The exclusion is name-only with no url/source discrimination, and the skill doc even warns
readers that driver plumbing "that isn't in HARNESS_SYMBOLS yet … can still appear," acknowledging
the list is a fragile denylist.

**Fix**

Kept each CPU frame’s source URL through internal self-time aggregation so harness-named frames are
excluded only when URL-less, while preserving the public result shape. Added focused coverage for
both application-URL inclusion and URL-less harness exclusion.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090797230) · 2026-07-27
11:35:57 UTC</sub>

### e04a5e909862 — [P3][maintainability] Encapsulate the scattered "effective throttle" idiom

**Issue**

The concept "a throttle > 1 is real; 1 or 0 means none" is expressed three different ways at every
site: the tag `throttle > 1 ?`${throttle}x`: 'raw'`, the settings value
`throttle > 1 ? throttle : 0`, and the CDP guard
`if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', …)`. Because the raw default
differs (`'4'` vs replay's `'0'`) and `args.includes('--no-throttle') ? 1 : …` normalizes to 1, the
"is it throttled" test `> 1` is duplicated four+ times per file and easy to get subtly wrong (e.g.
someone writing `>= 1`).

**Fix**

Centralized effective CPU-throttle resolution in a shared helper and updated all four Chromium
profiling entrypoints to consume its rate, active state, output tag, and settings value. Existing
defaults, `--no-throttle` precedence, and invalid-value behavior remain unchanged.

*Revised before approval:* Restored replay output directories to their established
`profilePath('replay', tag)` naming while retaining the shared throttle object for CDP and settings
behavior.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/perf/replay-scenario.mjs:76` newly appends `throttle.tag` to replay output directories,
  changing their established names even though replay never used the scattered tag idiom. Restore
  `profilePath('replay', tag)`; this refactor should encapsulate existing throttle behavior, not
  introduce new path behavior.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090799236) · 2026-07-27
11:36:11 UTC</sub>

### a6f3716c7802 — [P4][maintainability] Undocumented magic in the recorder: `ALPHA_STRIDE = 4 * 61` and the `SIZE_PX` map

**Issue**

`ipad-recorder.js:128` declares `const ALPHA_STRIDE = 4 * 61;` used to stride the canvas
`getImageData` alpha scan. The `4` (RGBA) is clear but the `61` (a prime, presumably to avoid
aliasing with pixel-row periodicity) is unexplained — a reader can't tell whether the stride is
load-bearing or arbitrary, and changing it silently changes every recorded `probe.alpha` magnitude
(breaking comparisons against older recordings). Separately, `replay-scenario.mjs:25`
`const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 }` duplicates the app's stroke-size mapping with
only a comment ("Approximate … override here if the real mapping is ever needed") and no pointer to
the app source of truth, so it rots when the app's size ramp changes.

**Fix**

Named the recorder’s stride factors and documented that its alpha measurement is recording-relative.
Synchronized replay size levels with the application’s SIZE_TO_PX ramp so recorded size actions
replay accurately.

*Revised before approval:* Documented the prime pixel stride as intentional decorrelation from
pixel-row periodicity, preserving its role as a deliberate sampling choice.

*Revised before approval:* Added focused Node coverage that replays Size 1–5 actions through the
in-page replay path and verifies the engine receives the current pixel widths. The replay helpers
are safely importable by that test without running the CLI.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/perf/ipad-recorder.js:128` still does not explain why the pixel sample stride is
  specifically 61; document that the prime stride is intended to decorrelate sampling from pixel-row
  periodicity so a future editor can distinguish the load-bearing choice from an arbitrary number.
* The corrected size-action behavior in `scripts/perf/replay-scenario.mjs:29` is untested: existing
  replay tests exit during input validation and never assert that each recorded size level reaches
  `E.setStrokeWidth` with the app’s current width. Add focused coverage for the replay size mapping
  so this behavioral fix cannot silently drift.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091082656) · 2026-07-27
12:08:06 UTC</sub>

### 9d509249981f — [P2][maintainability] `PALETTE` / `PAPER` are copied from app source with no drift assertion, unlike the prompts

**Issue**

The harness copies four things from the app to "measure what production actually sends":
`DEFAULT_PROMPT`, `SAFETY_SYSTEM_INSTRUCTION`, `PALETTE`, and `PAPER`. Only the first two are
guarded — `assertProductionConfig()` reads the app source and throws on drift. `PALETTE` (a
comment-claimed mirror of `web/src/lib/state/colors.svelte.ts`) and `PAPER` (`web/src/app.css`) are
unverified, so a palette or paper-color change in the app silently makes the eval inputs unfaithful
while every guard stays green. The comment even names the exact source files, implying the same
drift risk was recognised but only half-covered.

**Fix**

`PAPER` now derives its light and night fill and margin values directly from the app’s theme tokens,
eliminating the copied values while preserving its existing shape and output.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091941467) · 2026-07-27
13:29:09 UTC</sub>

### 52cc71d96ea1 — [P3][maintainability] App-driver selectors and timing constants are scattered string/number literals

**Issue**

The module `scripts/CLAUDE.md` warns "rots silently when app markup, element IDs, or show/hide
mechanics change" — yet the element IDs are inline literals spread across functions
(`'#drawingCanvas'`, `'.drawer-toggle'`, `'#coloringBookButton'`, `'#strokeWidthButton'`,
`.color-swatch[data-color=...]`) and every gesture ends in a bare `await sleep(400)` / `350` / `220`
/ `150` / `40` / `200`. There is no single place to update an ID after a markup change, and the
sleep durations (several tied to real app guards, e.g. the "100ms post-color-change guard") are
undocumented magic numbers. This directly worsens the rot the CLAUDE.md flags.

**Fix**

Centralized every app-driver UI selector and settling delay at module scope, preserving all selector
strings and timing values while giving future markup and timing updates a single source of truth.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092229711) · 2026-07-27
13:54:32 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 2b5b3355b1d5 — [P2][maintainability] Color hex literals are magic strings in flows.spec.ts while palette-trim.spec.ts already has a named palette map

**Issue**

`palette-trim.spec.ts:9-22` defines a clean
`C = { purple: '#AB71E1', blue: '\#62A2E9', red: '#EC534E', … }`. But `flows.spec.ts` hardcodes the
same hexes as bare strings scattered through selectors and comments: `data-color="\#62A2E9"` (blue,
appears 5×), `data-color="#AB71E1"` (purple), `data-color="#EC534E"` (red), and the comment-decoded
intent "`\#62A2E9` is blue-dominant" is repeated at lines 217, 453. `webkit-smoke.spec.ts:50`
hardcodes `\#2ECC71`. If a palette color changes, these silently rot (the selector just stops
matching, and the test fails opaquely).

**Fix**

Added source-derived palette and picker values plus a shared swatch locator, then migrated the
scoped specs so palette changes no longer leave stale selector literals or expected-color maps.

*Revised before approval:* Restored the centralized test palette as independent explicit
expectations so palette regressions remain observable. Removed the remaining blue hex repetitions
and migrated `picker-trim.spec.ts` to the shared custom-swatch constant and locator.

*Revised before approval:* Migrated the remaining engine-crayon palette blue to `TEST_PALETTE.blue`
and passed it explicitly into the browser-side `page.evaluate` callback, leaving no hardcoded blue
hex in spec files.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `TEST_PALETTE` in `web/tests/helpers.ts` is derived from the same production `PALETTE_COLORS` that
  `palette-trim.spec.ts` exercises, so a palette-value regression changes both actual and expected
  values and silently weakens the previously fixed expected color sets; keep the centralized test
  palette independent with the original explicit values.
* The centralization is incomplete: `flows-palette-brush.spec.ts` still repeats `\#62A2E9` in both
  blue-dominance comments, and `picker-trim.spec.ts:20` still hardcodes the `data-color="custom"`
  sentinel instead of using the shared helper constant.
* `web/tests/engine-crayon.spec.ts:168` still hardcodes `\#62A2E9`, so the original repository-wide
  spec grep remains non-empty and this palette blue can still drift independently; use
  `TEST_PALETTE.blue`, passing it into `page.evaluate` as an argument.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5093999374) · 2026-07-27
16:32:29 UTC</sub>

### 3648a752593b — [P3][maintainability] The color-change debounce sleep `waitForTimeout(150)` is an unnamed, duplicated magic number

**Issue**

```ts
await page.waitForTimeout(150); // clear the post-color-change draw debounce
```

appears twice with the same literal `150`. The engine's actual debounce is `< 100ms` (documented in
`engine.spec.ts:277` "same synchronous tick … < 100ms"). The `150` is a hand-picked margin over that
threshold; if the engine's `requiredDelay` changes, these two sleeps must be found and updated by
hand, and there is no single source tying the test constant to the engine constant.

**Fix**

Centralized the three deliberate post-colour-change waits on a documented 150 ms test helper,
keeping the margin above the engine’s private 100 ms debounce without changing production behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094000001) · 2026-07-27
16:32:33 UTC</sub>

### 336e72af545f — [P3][maintainability] The 1×1 PNG base64 buffer is duplicated across three test surfaces

**Issue**

The identical base64 string
`'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='`
is decoded into a `Buffer` in both `flows.spec.ts` (as the mocked generate-image response) and
`generate-image.spec.ts` (as `TINY_PNG`). A test-fixtures module should own this once.

**Fix**

Extracted the duplicated transparent PNG bytes into a shared fixture and updated both specs to
request a fresh Buffer at each use site. This preserves the exact payload while avoiding a shared
mutable Buffer instance.

*Revised before approval:* Updated the API smoke test to import the shared PNG fixture and create a
fresh buffer for each legacy multipart request. The base64 literal now exists only in the shared
fixture module.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The identical PNG literal remains duplicated in `scripts/api-smoke.mjs:26`, so
  `web/tests/fixtures.ts` does not own it once and the finding’s third test surface is unresolved;
  import the shared fixture there as well.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094348176) · 2026-07-27
17:05:23 UTC</sub>

### 27083f3b59a4 — [P3][maintainability] CDP viewport-rotation setup is duplicated in flows.spec.ts and diverges from the engine harness's rotation approach

**Issue**

The exact
`cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 90 } })`
block is pasted in two coloring-book rotation tests. Separately, `engine.spec.ts:870-878` rotates
via a harness override (`setScreenAngleOverride` + `resizeTo`) — so the codebase has two unrelated
"rotate the viewport" mechanisms with no shared naming, making it non-obvious which to reach for.

**Fix**

Extracted the duplicated Chromium viewport rotation into a typed CDP helper and updated both flow
specs to use it with the existing metrics. The helper documents the separate non-CDP engine rotation
harness while keeping shared WebKit helpers CDP-free.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5094350353) · 2026-07-27
17:05:37 UTC</sub>

### 22145e63c811 — [P4][maintainability] Port `5173` is coupled across `vite.config.ts` and `web/netlify.toml` as bare literals

**Issue**

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

**Fix**

Added synchronized dev-port cross-reference notes in Vite and Netlify Dev configuration so all
coupled tunnel and live-reload consumers are updated together.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5095465266) · 2026-07-27
18:52:07 UTC</sub>

### a624016102be — [P4][maintainability] FileProvider paths expose entire external + cache roots with template names

**Issue**

```xml
<external-path name="my_images" path="." />
<cache-path name="my_cache_images" path="." />
```

`path="."` grants the FileProvider access to the **whole** external-files root and the **whole**
cache dir, and the entry names (`my_images`, `my_cache_images`) are unmodified Capacitor sample
names. Scoping a content provider to the entire root is broader than a "save one screenshot to the
gallery" flow needs, and the generic names give no hint of what actually shares files. This is the
provider referenced by `AndroidManifest.xml:23-29`.

**Fix**

Restricted the Android FileProvider to temporary camera captures in the app’s Pictures directory and
removed its unused broad cache mapping.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5096394937) · 2026-07-27
20:22:21 UTC</sub>

### 5c6a6bece8f9 — [P3][maintenance] `cloud-branch-preview.sh` embeds a dated, mutable "CURRENT MODE" fact that is injected into every cloud session

**Issue**

The heredoc hard-codes a Netlify preview-mode fact with a date:

```
CURRENT MODE: restricted (as of 2026-07-09). Assume a plain `feat/*` push
produces NO live preview.
```

This is exactly the kind of fast-moving operational state that goes stale silently: if the site
flips back to "Full" mode, every cloud session is told the wrong thing until someone remembers this
string lives inside a shell hook (not in a doc, not in config). Embedding a `(as of DATE)` marker in
a script is a smell that the value doesn't belong in the script.

**Fix**

Replaced the hook’s dated preview-mode assertion with a pointer to the authoritative “Current mode”
callout in `docs/CLOUD/Claude.md`, while preserving the Full/Restricted explanation and restricted
`feature/*` workflow.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097056940) · 2026-07-27
21:33:05 UTC</sub>

### 3b8ba8c29db4 — [P3][maintenance] Claude `setup.sh` hard-codes a Playwright fallback version that duplicates `package.json` and diverges from the Codex approach

**Issue**

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

**Fix**

Updated cloud setup to invoke Playwright only with an exact numeric version derived from
package.json. Missing or malformed versions now warn and skip browser installation, preventing
browser-revision skew while preserving best-effort startup.

*Revised before approval:* Extended the cloud-setup harness to simulate both failed derivation and
non-numeric output, asserting that setup warns, succeeds, and never invokes Playwright installation.
This directly covers the new safety branch.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Add coverage in `scripts/tests/claude-cloud-setup.test.mjs` for failed or non-numeric Playwright
  version derivation, asserting that no Playwright install runs, the warning is reported, and setup
  remains successful; the existing node stub always returns `1.61.1`, leaving the new safety branch
  untested.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097210611) · 2026-07-27
21:51:56 UTC</sub>

### e622a1ec4db5 — [P3][maintenance] The audit-routine cron schedule table can silently drift from the actual Claude Routines with no automated check

**Issue**

The "Scheduled runs (Claude Routines)" section declares itself "the source of truth for that
automation" and holds a six-row cron table (lines 161-168) plus the instruction "if a routine is
added, retired, or rescheduled, update this table in the same change." But the actual triggers live
in the Routines backend, not in the repo, so nothing enforces that the table matches reality —
unlike the `ruler:check` / `dprint check` gates that guard other generated/formatted content. A
rescheduled or deleted routine leaves this table wrong with no CI signal.

**Fix**

Reframed the schedule table as a manually maintained mirror, clarifying that the Claude Routines
backend is authoritative and cron values are not automatically reconciled. Preserved the update
instruction and all six schedule rows unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097211167) · 2026-07-27
21:52:01 UTC</sub>

### 4832353a2972 — [P2][maintainability] CI rebuilds the debug APK inline instead of calling the committed `android:apk` script

**Issue**

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

**Fix**

Changed the Android deploy workflow to run `npm run android:apk`, routing the unchanged debug APK
build through the canonical Capacitor/Gradle helper while preserving the existing install path and
smoke test.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097554381) · 2026-07-27
22:36:48 UTC</sub>

### e4dfe6fd518a — [P2][maintainability] Missing `timeout-minutes` on the two label-automation jobs — a hung `gh api` call runs for the 6-hour default

**Issue**

Every other job in the repo sets a `timeout-minutes` (test 10/15, android/ios 40, blobs 5, pages 5).
The `sync` job in `label-sync.yml` and the `move-to-todo` job in `label-to-todo.yml` set none, so a
stuck GraphQL call (rate-limit, network hang) in `label-to-todo.sh` or the labeler action can burn
up to the 360-minute default per run, and `label-to-todo` fires on every `issues: labeled` event.

**Fix**

Added five-minute job-level timeouts to both label automation workflows so hung runs terminate
promptly without changing their behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097813504) · 2026-07-27
23:06:08 UTC</sub>

### 07ec58fdd9c8 — [P3][maintainability] Playwright version is resolved by a brittle inline `node -p` reaching into `package-lock.json` internals

**Issue**

```yaml
run: echo "version=$(node -p "require('./package-lock.json').packages['node_modules/@playwright/test'].version")" >> "$GITHUB_OUTPUT"
```

This nests double-quotes inside a `run:` string, hard-codes the lockfile's internal
`packages['node_modules/…']` key shape (a lockfile-v3 detail that changed across npm majors), and is
the sole consumer of a value used only to build the cache key. Any lockfile-format change or an
added quoting layer breaks it silently (cache key becomes `playwright-…-` with an empty version,
quietly disabling the WebKit-aware cache).

**Fix**

Added a helper that emits the installed `@playwright/test` manifest version and updated the workflow
output step to use it. This removes lockfile-format coupling while preserving the existing cache key
and browser setup.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097816327) · 2026-07-27
23:06:18 UTC</sub>

### 2aeec63cc0ef — [P4][maintainability] `ALLOWED_TOKENS_LIST` hard-codes retry-indexed values tightly coupled to `retries: 2` in a different file

**Issue**

```yaml
ALLOWED_TOKENS_LIST: daycare-club,daycare-club-retry1,daycare-club-retry2
```

The `-retry1`/`-retry2` suffixes exist solely because `web/playwright.config.ts` sets `retries: 2`
in CI (one token per attempt, per the comment). This is an invisible cross-file coupling: bump
retries to 3 and the burst spec's third attempt has no allowlisted token, producing a confusing
rate-limit failure with no signal pointing back here. The magic list lives in a workflow env, far
from the config that dictates its length.

**Fix**

Centralized CI retry-token allowlisting in the Playwright configuration and derived each burst-test
token from its retry index. Removed the duplicated workflow allowlist so CI retries and server
tokens stay synchronized.

*Revised before approval:* Formatted the centralized CI token generation in the Playwright
configuration so the driver’s formatting gate passes.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5097961541) · 2026-07-27
23:23:34 UTC</sub>

### 657e01b88c44 — [P5][maintainability] Issue templates use legacy Markdown format instead of validated Issue Forms

**Issue**

All three templates are the old Markdown-with-front-matter format. Their prompts (Steps to
Reproduce, Device Information, checkboxes) are free text a reporter can delete wholesale, so nothing
is enforced — combined with the P1 label mismatch, an issue can arrive with no structure and a wrong
label. GitHub Issue Forms (`.yml`) enforce required fields, dropdowns (e.g. device OS, target-user),
and reliably-applied labels.

**Fix**

Converted the bug and feature reporter templates into GitHub Issue Forms with preserved `type:*`
labels and required diagnostic fields. Kept the free-form task template and blank-issue escape hatch
unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098142747) · 2026-07-27
23:49:58 UTC</sub>

### 1b48f283a9eb — [P3][maintainability] Hub palette renames the shared chrome tokens, defeating the "keep in sync by eye" note

**Issue**

The hub opens with a comment promising the palette is "Kept in sync by eye with the shared scrapbook
chrome (scripts/lib/scrapbook-chrome.mjs)". But it then declares the tokens under *different names*
than the chrome uses — `--fg`/`--bg`/`--bar`/`--line`/`--tab-bg`/`--tab-fg` here vs
`--ink`/`--paper`/`--card-2`/`--hair` in the generated pages (e.g. `scrapbook/index.html:12-13`,
`crayon-brush-samples/index.html:11-13`). A maintainer trying to reconcile the two blocks after a
chrome change can't diff them line-for-line; they must first mentally map `--fg` ↔ `--ink`, `--bar`
↔ `--card-2`, etc. The renamed vocabulary makes the one sync mechanism the file relies on (human
eyeballing) maximally error-prone.

**Fix**

Renamed the proof-sheet hub’s four core palette tokens to match the shared scrapbook chrome
vocabulary, updating every reference while preserving all values and behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5098270859) · 2026-07-28
00:10:05 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### 2de5d619aa6b — [P4][maintainability] Group the four crayon-overlay module variables into one nullable struct

**Issue**

Five module-level variables (`crayonOverlay`, `crayonOverlayCtx`, `crayonOverlayTop`,
`crayonOverlayTopCtx`, `crayonOverlaysCreated`) represent one thing — the overlay pair — and are
always created together, resized together, and nulled together. Spread across the module they are
easy to update partially; a struct makes set/resize/teardown atomic.

**State at triage (2026-07-27):** Still exactly as described, at shifted lines: declarations
`engine.ts:145-149`, mix sync `151-155`, resize loop `432-441`, teardown nulling `1187-1197`,
creation/adoption in `setupCrayonOverlays` `1229-1260`. Post-ADR-0072 the lifecycle got *more* paths
(adopt from markup vs engine-create, remount adoption), which is where partial-update bugs would …

**Fix**

Consolidated crayon overlay elements, contexts, and ownership into one lifecycle value so setup,
resize, opacity updates, and teardown stay coordinated.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** —
`tests/engine-crayon.spec.ts tests/engine-resize.spec.ts tests/engine-lifecycle.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099435036) · 2026-07-28
03:02:25 UTC</sub>

### d7b2db92b467 — [P3][maintainability] Hexagon geometry constants are scattered and coupled to a JS comment

**Issue**

The hexagon is `width: 60px; height: 69px; /* height = width * 1.15 */`, and the snap logic's
comment asserts "a hexagon's farthest edge point is ~35px from its center" to justify
`HEX_SNAP_RADIUS = 40`. The JS numbers depend on the CSS numbers, but the coupling is only prose —
resizing the hexagon in CSS silently makes the snap radius wrong with no failing check. Proposed CSS
custom properties (`--hex-w`/`--hex-h`) plus deriving the snap radius from them.

**State at triage (2026-07-27):** Substantially resolved by drift since f934d43 (commits 7381a6c,
4288672, dae9fcb):

* `web/src/lib/design/trimGeometry.ts:139-146` — `HEX_GRID_GEOMETRY` centralizes the honeycomb
  geometry: `firstRowPx: 69` *is* the hexagon height and `columnPitchPx: 60` *is* its width. …

**Fix**

Derived the picker’s snap radius from the shared hex height plus a named 5.5px gap-slop constant,
preserving the exact 40px behavior while keeping it tied to canonical geometry.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows-palette-brush.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099946529) · 2026-07-28
04:26:26 UTC</sub>
