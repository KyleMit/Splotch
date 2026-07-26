# Audit — deferred findings

> Findings the scripted audit burndown (the `burn-down-audits` skill) moved aside instead of fixing
> — the verifier was unavailable, the implementation failed, or the change never passed adversarial
> review. Each needs human triage: re-stage it in `docs/AUDIT.md`, file it as an issue, or drop it.

### [P2][duplication] Extract the two-blit subtractive glaze stamp shared by `flushCrayonBuffer` and `renderOp`

**File(s):** `web/src/lib/drawing/strokeOps.ts:395-413` and `473-489` — pinned at SHA f934d43

#### Problem

The exact "darken at alpha 1, then source-over at alpha `1-mix`" stamp is written twice:

```ts
// flushCrayonBuffer (399-410)
target.globalCompositeOperation = 'darken';
target.globalAlpha = 1;
target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);
target.globalCompositeOperation = 'source-over';
target.globalAlpha = 1 - getCrayonMix();
target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);

// renderOp crayonPassRaster (482-488)
target.globalCompositeOperation = 'darken';
target.globalAlpha = 1;
target.drawImage(op.canvas, op.x, op.y);
target.globalCompositeOperation = 'source-over';
target.globalAlpha = 1 - op.mix;
target.drawImage(op.canvas, op.x, op.y);
```

This subtractive-mix formula is the crux of the crayon look (per the long pass-buffer note). Having
it in two places means a fix or tuning must be mirrored, and the two already differ subtly
(device-rect blit vs paper-space draw) — a source of the ±1 rounding reconcile documented in
`undoHistory.ts`.

#### Proposed solution

```ts
function stampGlaze(
  target: CanvasRenderingContext2D,
  source: CanvasImageSource,
  mix: number,
  draw: () => void,
);
```

or simpler, two thin variants sharing a core that sets the two composite/alpha states around a
caller-supplied `drawImage`. Both call sites reduce to one line each and `globalAlpha` is guaranteed
reset.

#### Verification

`npm run test -- crayonBrush` plus the crayon commit/undo E2E; visual parity on `/dev/engine`. A
unit test can assert the composite-op/alpha sequence via a mock 2D context.

---

### [P2][complexity] `generateAiImage` bundles six concerns in one 95-line try/catch

**File(s):** `web/src/lib/drawing/aiImage.ts:94-188` — pinned at SHA f934d43

#### Problem

`generateAiImage` opens the modal, exports the canvas, sets the preview, encodes WebP, builds auth
headers, fetches, `switch`es over four response kinds, and drives auto-save — all inside one
function with a trailing `catch`/`finally`. The auth-header construction (135-140) and the response
`switch` (150-169) are each self-contained units that obscure the top-level flow.

#### Proposed solution

Extract:

* `function buildGenerateHeaders(uploadBlob: Blob): Record<string,string>` (135-140),
* `function handleAiResponse(response: AiImageResponse, runId, imageBlob): 'done' | void` — the
  150-174 switch + finish/auto-save.

`generateAiImage` then reads as: launch → export → upload → dispatch. Keeps the same `runId`
ownership checks.

#### Verification

`npm run test -- aiImage` (the existing 387-line suite) must stay green — it already exercises
safety/throttle/error/timeout branches, so an extraction that changes behaviour will fail it.

---

### [P3][duplication] Crayon-buffer allocate-or-resize logic is written three times

**File(s):**
`web/src/lib/drawing/strokeOps.ts:229-252 (`livePaperBufferFor`), 299-322 (`crayonBufferFor`)`; also
engine `resizeCanvas` overlay loop `web/src/lib/drawing/engine.ts:428-437` — pinned at SHA f934d43

#### Problem

The pattern "create a canvas at WxH, set `lineCap/lineJoin='round'`; on later calls, if the size
grew, reassign width/height and re-arm caps and reset `dirty`/`bounds`" appears in both
`livePaperBufferFor` and `crayonBufferFor` almost verbatim, and the cap-arming half repeats again in
the engine's overlay resize loop.

```ts
// crayonBufferFor 313-320 and livePaperBufferFor 240-250 — near-identical bodies
buf.ctx.canvas.width = w;
buf.ctx.canvas.height = h;
buf.ctx.lineCap = 'round';
buf.ctx.lineJoin = 'round';
buf.dirty = false;
buf.bounds = null;
```

#### Proposed solution

`function ensureBufferSize(buf: CrayonPassBuffer, w: number, h: number): void` that grows the
backing canvas, re-arms round caps, and resets `dirty`/`bounds`. A
`function newRoundCanvasCtx(w, h): CanvasRenderingContext2D | null` covers first allocation and the
engine's overlay/snapshot canvases (also duplicated in `undoHistory.ensurePaperCovers`,
`adoptPaperAsSnapshot`, and `engine.snapshotStrokes`).

#### Verification

`npm run test -- crayonBrush` and the resize/rotation E2E. Unit-test `ensureBufferSize` for the grow
and no-op paths.

---

### [P3][maintainability] Engine-created overlay CSS duplicates DrawingCanvas's `.crayon-overlay` styles

**File(s):** `web/src/lib/drawing/engine.ts:1261-1268` and
`web/src/lib/components/DrawingCanvas.svelte:477-489` — pinned at SHA f934d43

#### Problem

The engine builds overlay elements with an inline CSS string:

```ts
const overlayCss = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2;';
... crayonOverlay.style.cssText = overlayCss + 'mix-blend-mode:darken;';
```

and the Svelte component re-declares the same geometry + `mix-blend-mode:darken` in
`.crayon-overlay`. The component comment even says "keep the two in sync." Two sources of truth for
the same visual contract; a z-index or blend change must be made twice or the `/dev/engine` harness
silently diverges from production.

#### Proposed solution

Since the harness path constructs elements in JS, keep one source: give the JS-created overlays the
same class names (`crayon-overlay`, `crayon-overlay-top`) and move the styling entirely into a
shared (non-scoped) stylesheet or a `:global` rule the harness also loads, so the `cssText` string
disappears. At minimum, hoist the shared declarations into a single exported constant.

#### Verification

Load `/dev/engine` (harness-created overlays) and `/` (template overlays); crayon preview
compositing is identical. `grep` for the duplicated properties returns one location.

---

### [P4][maintainability] Group the four crayon-overlay module variables into one nullable struct

**File(s):** `web/src/lib/drawing/engine.ts:141-145, 1194-1201, 428-437` — pinned at SHA f934d43

#### Problem

Five module-level variables — `crayonOverlay`, `crayonOverlayCtx`, `crayonOverlayTop`,
`crayonOverlayTopCtx`, `crayonOverlaysCreated` — represent one thing (the overlay pair) and are
always created together, resized together (428-437), and nulled together in teardown (1194-1201).
Spread across the module they are easy to update partially.

```ts
let crayonOverlay: HTMLCanvasElement | null = null;
let crayonOverlayCtx: CanvasRenderingContext2D | null = null;
let crayonOverlayTop: HTMLCanvasElement | null = null;
let crayonOverlayTopCtx: CanvasRenderingContext2D | null = null;
let crayonOverlaysCreated = false;
```

#### Proposed solution

`let crayonOverlays: { bottom: HTMLCanvasElement; bottomCtx: ...; top: ...; topCtx: ...; created: boolean } | null = null;`
— one atomic value that is set, resized, and cleared as a unit; `syncCrayonOverlayMix`,
`resizeCanvas`, and `teardownEngine` each touch one variable.

#### Verification

`npm run check`; `/dev/engine` and `/` crayon overlays behave identically across
mount/resize/teardown.

---

### [P3][duplication] Extract credential-header assembly; stop hard-coding the auth header names client-side

**File(s):** `web/src/lib/drawing/aiImage.ts:135-142` — pinned at SHA f934d43

#### Problem

The upload's auth headers are built inline with bare string literals:

```ts
const headers: Record<string, string> = { 'Content-Type': uploadBlob.type || 'image/png' };
if (settings.aiUserApiKey) headers['X-Api-Key'] = settings.aiUserApiKey;
else headers['X-Access-Token'] = settings.aiAccessToken;
```

The header names `X-Api-Key` / `X-Access-Token` also appear as literals in the server CORS list
(`web/src/hooks.server.ts:63`) with no shared source of truth — rename one and the two drift
silently. The BYOK-vs-managed selection is also request-shaping logic that reads cleaner as its own
function.

#### Proposed solution

Add named constants (e.g. in `web/src/lib/ai/limits.ts` or a small `web/src/lib/ai/headers.ts` that
both client and server import):
`export const API_KEY_HEADER = 'X-Api-Key'; export const ACCESS_TOKEN_HEADER = 'X-Access-Token';`.
Extract `function buildAuthHeaders(uploadType: string): Record<string,string>` in aiImage.ts using
those constants, and reference them from the server CORS list too.

#### Verification

`npm run check`; `aiImage.test.ts`'s `uploadedImage()` helper still reads the `Content-Type`; grep
shows the header strings defined once.

---

### [P4][readability] Manual query-string concatenation for the generate-image endpoint

**File(s):** `web/src/lib/drawing/aiImage.ts:141-142` — pinned at SHA f934d43

#### Problem

```ts
const endpoint = apiUrl('/api/generate-image')
  + (style ? `?style=${encodeURIComponent(style)}` : '');
```

Hand-rolled `?key=` concatenation with a conditional and a manual `encodeURIComponent`. It works,
but it's the kind of string surgery that breaks the moment a second query param is added, and it
mixes "is there a style" branching into the URL literal.

#### Proposed solution

Build with `URLSearchParams`: `const params = style ?`?${new URLSearchParams({ style })}`: '';`.
Minor, but it removes the manual encoding and reads as intent.

#### Verification

`npm run check`; `aiImage.test.ts` upload tests still hit `/api/generate-image`.

---

### [P4][readability] Extract the WebP-upload guard predicate in `encodeWebpUpload`

**File(s):** `web/src/lib/drawing/aiImage.ts:37-43` — pinned at SHA f934d43

#### Problem

The decisive line

```ts
return webp && webp.type === 'image/webp' && webp.size < png.size ? webp : null;
```

packs three distinct conditions (encoder produced something, it's actually WebP not a PNG fallback,
and it's genuinely smaller) into one ternary whose meaning is carried entirely by the preceding
comment. The `'image/webp'` MIME literal is also a magic string that recurs in the test.

#### Proposed solution

Name a local predicate:
`const isSmallerWebp = !!webp && webp.type === 'image/webp' && webp.size < png.size;` (with a
`const WEBP_MIME = 'image/webp'`), then `return isSmallerWebp ? webp : null;`. Self-documents the
three-part contract.

#### Verification

`aiImage.test.ts`'s upload-format suite ("uploads a WebP copy…", "falls back to the PNG…") stays
green.

---

### [P5][readability] Duplicated 6-line mask gradient in AiConfetti

**File(s):** `web/src/lib/components/AiConfetti.svelte:44-55` — pinned at SHA f934d43

#### Problem

`-webkit-mask-image` (lines 44-49) and `mask-image` (lines 50-55) are byte-identical six-line
`radial-gradient(...)` blocks. It's the standard vendor-prefix pattern, but the full gradient is
copy-pasted, so a tweak to the mask shape must be made twice and kept in sync by hand.

#### Proposed solution

Hoist the gradient into a CSS custom property on the element
(`--confetti-mask: radial-gradient(...)`) and set both
`-webkit-mask-image: var(--confetti-mask); mask-image: var(--confetti-mask);`. One source, both
prefixes.

#### Verification

Visual: confetti mask hole unchanged in WebKit and non-WebKit; `webkit-smoke` E2E path unaffected.

---

### [P5][type-safety] `AiImageResult` casts in event handlers

**File(s):** `web/src/lib/components/AiImageResult.svelte:42` — pinned at SHA f934d43

#### Problem

`const { naturalWidth: w, naturalHeight: h } = e.target as HTMLImageElement;` casts the event
target. It's safe here (the handler is only on an `<img onload>`), but the `as` bypasses the checker
and would silently mis-type if the handler were ever reused. Minor.

#### Proposed solution

Use `e.currentTarget` with a typed handler (`onload={(e) => handleImgLoad(e.currentTarget)}` where
`handleImgLoad(img: HTMLImageElement)`), removing the cast — `currentTarget` is correctly typed as
the element the listener is bound to.

#### Verification

`npm run check`; the stage still sizes to the loaded image's aspect (run the app, open a result).

---

### [P1][consistency] Unify the exported `$state` object naming across state modules

**File(s):** `web/src/lib/state/canvas.svelte.ts:6`, `web/src/lib/state/strokeWidth.svelte.ts:26`,
`web/src/lib/state/tool.svelte.ts:54`, `web/src/lib/state/colors.svelte.ts:59`,
`web/src/lib/state/settings.svelte.ts:150`, `web/src/lib/state/ui.svelte.ts:42`,
`web/src/lib/state/layout.svelte.ts:29`, `web/src/lib/state/install.svelte.ts:37`,
`web/src/lib/state/network.svelte.ts:8`, `web/src/lib/state/fullscreen.svelte.ts:31` — pinned at SHA
f934d43

#### Problem

The primary `$state` export follows two different naming conventions with no rule a newcomer can
predict. Three modules use a `…State` suffix:

```ts
export const canvasState = $state({ … });   // canvas.svelte.ts:6
export const strokeState = $state({ … });    // strokeWidth.svelte.ts:26
export const toolState = $state({ … });      // tool.svelte.ts:54
```

Seven use the bare noun:

```ts
export const colors   = $state({ … });   // colors.svelte.ts:59
export const settings = $state({ … });    // settings.svelte.ts:150
export const ui       = $state({ … });    // ui.svelte.ts:42
export const layout   = $state({ … });    // layout.svelte.ts:29
export const install  = $state({ … });    // install.svelte.ts:37
export const network  = $state({ … });    // network.svelte.ts:8
export const fullscreen = $state({ … });  // fullscreen.svelte.ts:31
```

To import a store you must first remember (or grep) whether its module happens to append `State`.
This is pure friction and the single most visible inconsistency in the section.

#### Proposed solution

Pick one convention and apply it repo-wide. The bare-noun form is the majority (7 vs 3) and reads
more naturally at call sites (`settings.soundEnabled`, `colors.activeColor`), so rename
`canvasState → canvas`, `strokeState → stroke` (or `strokeWidth`), `toolState → tool`. Because
`tool.svelte.ts` already exports `BrushType`/`BRUSH_TYPES` and the filename is `tool`,
`toolState → tool` is clean. Do it as a mechanical rename across the ~10 consuming components; the
compiler flags every miss.

#### Verification

`npm run check` passes after the rename; `grep -rn "State = \$state" web/src/lib/state` returns
nothing; every consumer still resolves.

---

### [P1][duplication] Extract a shared segmented-control primitive — it now exists three times with drift

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-47,92-138` ·
`web/src/lib/components/ParentCenter.svelte:222-238,443-490` ·
`web/src/lib/components/parent/ReportForm.svelte:112-125,233-267` (theme picker / orientation
selector / report-kind picker) — pinned at SHA f934d43

#### Problem

Three near-identical "iOS-style segmented control" implementations exist. The code comments admit
the copy-paste: ParentCenter's `.orient-seg` says *"matching the Theme picker in AppearanceSection"*
(`ParentCenter.svelte:440`) and ReportForm's `.report-kind` says *"mirrors the Appearance theme
picker"* (`ReportForm.svelte:232`). The design skill's own rule is *"Extract a new primitive at the
third duplicate"* — this is the third.

They have already drifted, which is exactly the failure the shared list is supposed to prevent:

* Container radius: `var(--radius-md)` (theme picker, `AppearanceSection.svelte:98`) vs raw `10px`
  (orient-seg, `ParentCenter.svelte:448`) vs `10px` (report-kind, `ReportForm.svelte:239`).
* Option radius: raw `9px` (`AppearanceSection.svelte:109`) vs `var(--radius-sm)`
  (`ParentCenter.svelte:460`) vs `7px` (`ReportForm.svelte:250`).
* Active treatment: raised card w/ `box-shadow: 0 1px 4px rgba(0,0,0,0.18)` (theme/orient) vs brand
  fill (report-kind).
* Font size: `var(--font-size-sm)` vs raw `12.5px` (`ParentCenter.svelte:464`).

#### Proposed solution

Add `web/src/lib/components/design/Segmented.svelte` (beside `Button.svelte`) taking
`options: {value,label,icon?,id?}[]`, `selected`, `onSelect`, and a `variant` (`raised` for
theme/orientation, `filled` for report-kind), plus an `allowDeselect` flag for the orientation case.
Style once from tokens (`--radius-md` container, `--radius-sm` option, `--shadow-sm` for the active
card). Replace all three call sites. Register it in the `design` skill's primitives table.

#### Verification

`grep -rn "segmented\|theme-option\|orient-opt\|report-kind-option"` shows only the new primitive's
internals. Visually diff `/dev/design` and each of the three sites in light+dark before/after; the
three should now be pixel-identical modulo variant.

---

### [P3][duplication] The `.setting-group .setting + .setting { margin-top: 6px }` rule is copied into three sections

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:75-77` ·
`web/src/lib/components/parent/SavingSection.svelte:65-67` ·
`web/src/lib/components/parent/ControlsSection.svelte:165-167` — pinned at SHA f934d43

#### Problem

The identical adjacent-sibling spacing rule appears verbatim in three section components.
ParentCenter already owns the shared `.setting-group`/`.setting` styling globally
(`ParentCenter.svelte:747-759`, with the comment *"keeps these rules in one place instead of copied
into each section component"*) — this rule contradicts that intent by living copied in the leaves.

#### Proposed solution

Move `.setting-group .setting + .setting { margin-top: var(--space-1) + 2 }` (6px → keep as-is or
promote to a token) into ParentCenter's `.parent-help-content :global(.setting)` block and delete
the three copies.

#### Verification

`grep -rn "setting + .setting" web/src` returns one hit. Sections with stacked `.setting` rows
(Appearance orientation toggles, Saving folder row, Controls) keep their 6px gap.

---

### [P4][accessibility] Two identical segmented controls use inconsistent ARIA semantics (radiogroup vs group/pressed)

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte:32-45` (radiogroup/radio) ·
`web/src/lib/components/ParentCenter.svelte:223-237` (group + aria-pressed) — pinned at SHA f934d43

#### Problem

The theme picker exposes `role="radiogroup"` with `role="radio"` + `aria-checked` children, while
the visually-identical orientation selector uses `role="group"` with `aria-pressed` toggle buttons.
Both are single-select segmented controls (the report-kind picker is a *third* pattern, radiogroup
again). Screen-reader users get inconsistent announcements for the same idiom, and neither
radiogroup implements roving-tabindex/arrow-key navigation the role implies. This intersects
maintainability: whichever pattern the Segmented primitive (P1) standardizes on must be chosen
deliberately.

#### Proposed solution

Decide one semantic for the Segmented primitive: `radiogroup`/`radio` for mandatory single-select
(theme, report-kind) with arrow-key roving, and document that the orientation selector — which
*allows* deselecting to "free rotation" — legitimately differs (toggle buttons). Encode the choice
in the primitive's props (`mode: 'radio' | 'toggle'`).

#### Verification

Navigate each control with a screen reader + keyboard; announcements and arrow-key behavior are
consistent within each mode.

---

### [P1][duplication] White/dark ink keyline CSS is triplicated across ActionsPanel, BrushMenu, and StrokeWidthMenu

**File(s):** `web/src/lib/components/ActionsPanel.svelte:772-787`,
`web/src/lib/components/BrushMenu.svelte:155-170`,
`web/src/lib/components/StrokeWidthMenu.svelte:175-190` — pinned at SHA f934d43

#### Problem

The same "ring the currentColor ink with a keyline so white/near-black reads on the buttons" trick
is written out three times, each with the same four declarations:

```css
stroke: #000;              /* white-stroke */  or  var(--dark-ink-keyline);  /* dark-stroke */
stroke-width: 2px;
paint-order: stroke;
vector-effect: non-scaling-stroke;
```

ActionsPanel targets `svg path[fill='currentColor']`, BrushMenu the same, StrokeWidthMenu widens to
`svg path` (single path). The identical comment paragraph explaining the `#000` one-off is pasted in
all three. Changing the keyline width, adding a token for the `#000`, or adjusting the selector
means editing three files that must not drift.

#### Proposed solution

Promote `.white-stroke`/`.dark-stroke` to shared global utility classes in `app.css` (they already
ride on the container element in each case), keyed off
`:where(.white-stroke) svg path[fill='currentColor']` and a dark mirror. Each component keeps only
the class toggle. Fold StrokeWidthMenu's `svg path` variant in by making the selector match both
(`path[fill='currentColor'], svg:has(path):not(:has(path[fill='currentColor'])) path` is overkill —
simpler: tag the single-path icon so `[fill='currentColor']` applies there too, then one selector
covers all three).

#### Verification

Grep `paint-order: stroke` across the components — should collapse to one definition. Select white
ink and near-black ink (dark theme) with each of brush trigger, brush menu, stroke trigger, stroke
menu open, and confirm the keyline still renders in `run-splotch`.

---

### [P3][accessibility] Clearing the canvas is pointer-only — no keyboard or AT path

**File(s):** `web/src/lib/components/ClearButton.svelte:103-137` — pinned at SHA f934d43

#### Problem

`#clearButton` has `aria-label="Clear drawing"` and is a real `<button>`, so keyboard and
screen-reader users can focus and activate it — but the only behavior is wired through
`use:dragToClear` (a pointer-gesture action). There is no `onclick`/keyboard handler, so pressing
Enter/Space on the focused button does nothing; the clear action is unreachable without a pointer
drag. The `aria-label` advertises an action the control can't actually perform for those users.

#### Proposed solution

Add a keyboard/click affordance that triggers the same `onClear` path (with a confirm or the
existing threshold semantics) when activated without a drag — e.g. `dragToClear` reports a plain
activation, or a fallback `onclick` that runs the clear when `matchMedia('(pointer: coarse)')` isn't
the sole modality. At minimum, don't label a drag-only surface as an actionable button.

#### Verification

Tab to the clear button, press Enter, confirm the canvas clears (or that a documented alternative
exists). Axe/keyboard pass.

---

### [P2][duplication] The icon glob + `splotchy` exclusion is repeated in three places with no shared source

**File(s):** `web/src/lib/components/Icon.svelte:48`,
`web/src/lib/components/Icon.svelte.test.ts:14`, `web/src/lib/components/iconTypes.ts:4` — pinned at
SHA f934d43

#### Problem

The rule "render every icon except `splotchy`" is encoded independently three times:

```ts
// Icon.svelte:48
import.meta.glob(['../icons/*.svg', '!../icons/splotchy.svg'], {...})
// Icon.svelte.test.ts:14
import.meta.glob<string>(['../icons/*.svg', '!../icons/splotchy.svg'], {...})
// iconTypes.ts:4
export type CommonIconName = Exclude<IconName, 'splotchy'>;
```

The test's comment even admits it must "Mirror Icon.svelte's own glob (splotchy is excluded there
too)." Add a second special-cased icon (e.g. another brand asset) and a contributor must remember
all three sites; miss one and the type says an icon is renderable that the glob won't load (or vice
versa), producing an empty `markup` fallback at runtime. The `key`-derivation logic is also
duplicated: `Icon.svelte:56` (`.split('/').pop()...replace('.svg','')`) vs `Icon.svelte.test.ts:20`
(`iconName`).

#### Proposed solution

Centralize the exclusion list in one module, e.g. `iconTypes.ts` exporting
`const NON_RENDERABLE_ICONS = ['splotchy'] as const` and a shared `iconNameFromPath(path)` helper;
derive `CommonIconName` as `Exclude<IconName, typeof NON_RENDERABLE_ICONS[number]>`, and have both
globs reference the same excluded-glob array (import.meta.glob needs literal patterns, so at minimum
share the constant + a comment linking the three, and share the path→name helper).

#### Verification

Grep for `splotchy` in `web/src/lib/components` returns one authoritative definition plus
references, not three parallel string literals. `npm test` still passes.

---

#### Why it was deferred

failed adversarial review after 2 fix rounds

Reviewer's unresolved objections:

* `icon-orphans.test.ts:73` — the new `it.each(Object.keys(globLiteralSources))` guard silently
  becomes a no-op if the glob resolves nothing (a rename of `Icon.svelte.test.ts`, a move of
  `Icon.svelte`, or Vite ceasing to resolve wildcard-free literal paths in `import.meta.glob`): zero
  keys means zero generated cases and a green suite, which is the same "authoritative only by
  comment" failure this commit exists to close. Assert the glob actually resolved both files (e.g.
  `expect(Object.keys(globLiteralSources).sort()).toEqual(['./Icon.svelte', './Icon.svelte.test.ts'])`)
  before the `it.each`.
* `icon-orphans.test.ts:24-26` — the new comment says "`sources` above excludes Icon.svelte and
  every *.test.ts", but `sources` is declared below this block; say "below".

#### What was tried

(mtime 17:31)

**Summary:** Took the stronger of the two offered options: extended the guard instead of narrowing
the comment.

`icon-orphans.test.ts` now raw-imports `Icon.svelte` and `Icon.svelte.test.ts` via their own
`import.meta.glob` — needed because the existing `sources` glob excludes Icon.svelte and every
*.test.ts — and asserts, per file, that the `!../icons/<name>.svg` patterns in its source are
exactly `NON_RENDERABLE_ICONS`. Together with the pre-existing filesystem difference covering this
file's own literal, all three literals are enforced.

Verified by mutation: adding `'!../icons/camera.svg'` to Icon.svelte's glob alone reddens the new
spec (`expected [ 'camera', 'splotchy' ] to deeply equal [ 'splotchy' ]`), then reverted —
`git diff --stat` confirms Icon.svelte is untouched by the commit.

The `iconTypes.ts` parenthetical no longer overclaims: it reads "all three glob literals
(icon-orphans.test.ts checks each of them against this constant and fails on a mismatch)".

Gates: `npm run check` 0 errors; `npm run test:unit` 641 passed (up 2, one case per checked file);
eslint clean on the three changed files; `npm run test:e2e -- flows.spec.ts` 43 passed.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-the-icon-glob-splotchy-exclusion-is-repeated-in-three-pla.patch`
(3 commits). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-the-icon-glob-splotchy-exclusion-is-repeated-in-three-pla.patch`.
*Only the final review round and the last fix round survive: the earlier envelopes for this finding
were overwritten by a later run reusing the same `iter0002` filename.*

### [P3][maintainability] `COLOR_ICONS` is a 24-entry hand-maintained allowlist mixing two unrelated concepts

**File(s):** `web/src/lib/components/Icon.svelte:13-42` — pinned at SHA f934d43

#### Problem

The set conflates two distinct reasons an icon skips the monochrome tint: (1) it's genuinely
full-color (derivable — `iconChroma.mjs`/`isSpot` already computes this), and (2) it's a monochrome
preview that self-tints via `currentColor`/theme vars (`size-*`, `eraser-size-*`). Category 1 is
machine-detectable yet is still hand-listed, so the list carries ~14 entries that a build step could
generate, plus a test (`Icon.svelte.test.ts`) whose sole job is to police the hand-list against the
classifier. That's a lot of machinery to keep a derivable set in sync by hand.

#### Proposed solution

Split the concerns: generate the color-icon portion at build time (extend `gen:icons` to emit a
`COLORFUL_ICONS` const from `isSpot`, the classifier already lives in `scripts/lib/iconChroma.mjs`),
and keep only the *self-tinting monochrome opt-outs* (`size-*`, `eraser-size-*`) as a small,
clearly-named hand list (`SELF_TINTING_ICONS`). `Icon.svelte` unions the two. The guard test then
becomes redundant for category 1.

#### Verification

Adding a new spot SVG + `gen:icons` auto-tags it (no manual `COLOR_ICONS` edit); the tint behavior
on `/dev/design` is unchanged for all current icons.

---

#### Why it was deferred

implementation failed

#### What was tried

No change was made: `.audit-work/current-brief.md` was stale — it still held the *previous*
finding's brief, whose work had already landed, while `current-issue.md` had advanced to this
finding. The verifier marked this finding VALID but never wrote its brief. Committing anything would
have attributed the work to — and deleted by title — a finding nothing had implemented, so the
implementer deferred instead to keep the entry recoverable. This is a driver defect, not a problem
with the finding: re-stage it as-is.

### [P4][consistency] `iconTypes.ts` imports `IconName` and separately re-exports it — redundant

**File(s):** `web/src/lib/components/iconTypes.ts:1-4` — pinned at SHA f934d43

#### Problem

```ts
import type { IconName } from './icon-names';
export type { IconName } from './icon-names'; // re-export
export type CommonIconName = Exclude<IconName, 'splotchy'>;
```

`IconName` is both imported (line 1, to build `CommonIconName`) and independently re-exported from
the same module (line 3). It works, but the doubled reference to `./icon-names` is easy to misread
as two different symbols and drifts if the source path changes.

#### Proposed solution

Collapse to `export type { IconName } from './icon-names';` plus
`import type { IconName } from './icon-names';` is unnecessary — TypeScript allows
`export type CommonIconName = Exclude<import('./icon-names').IconName, 'splotchy'>` or simply keep
the single `import type` and add `export type { IconName }` to it: `export { type IconName }` is
fine, but reference `./icon-names` once. Minor tidy.

#### Verification

`npm run check` passes; consumers of both `IconName` and `CommonIconName` still resolve.

---

#### Why it was deferred

implementation failed

#### What was tried

The brief's proposed fix does not work: replacing the `import type { IconName }` line and keeping
only `export type { IconName } from './icon-names'` fails `npm run check` with "Cannot find name
'IconName'" at the `Exclude<IconName, 'splotchy'>` line — a re-export statement does not create a
local type binding in TypeScript, contrary to the brief's claim. The edit was reverted and the file
left unchanged rather than substituting a different consolidation the brief did not ask for.
Re-staging this finding needs a corrected proposal, not a retry.

### [P2][type-safety] Native page hand-rolls type guards that duplicate the server's response shape

**File(s):** `web/src/routes/admin/native/+page.svelte:45-70`
(`isInvite`/`isSnapshot`/`responseError`), `:113-136` (`login`) — pinned at SHA f934d43

#### Problem

The snapshot contract (`{ ok, tokens, invites, persistent }`) is defined authoritatively where it's
produced (`tokens/+server.ts:44`, `snapshot()`), but the native client re-describes it by hand as
runtime guards plus an inline type annotation:

```ts
function isSnapshot(value: unknown): value is {
  ok: true; tokens: string[]; invites: Invite[]; persistent: boolean
} { ... }
```

and `login` parses the login response with no type at all:

```ts
const data = await response.json().catch(() => null);
if (!response.ok || !data?.ok || typeof data?.session !== 'string') { ... }
```

The shape now lives in three places (server `json(...)`, this guard, the API skill). A field added
server-side won't surface here as a type error — the client just silently ignores it. `data?.ok` /
`data?.session` are untyped property access on `any`.

#### Proposed solution

Define the wire types once next to the endpoint and import them:

```ts
// tokens/+server.ts (or a shared web/src/lib/adminApi.ts)
export interface TokenSnapshot {
  ok: true;
  tokens: string[];
  invites: Invite[];
  persistent: boolean;
}
export interface LoginResponse {
  ok: true;
  session: string;
}
```

Keep the runtime guard, but type it as `value is TokenSnapshot` so a shape change breaks the guard
at compile time; type the login parse against `LoginResponse | { ok: false; error?: string }`.

#### Verification

`npm run check` fails if the server shape and client guard diverge after the change.
`tests/admin.spec.ts` native flow still passes.

---

#### Why it was deferred

failed adversarial review after 2 fix rounds

Reviewer's unresolved objections:

* `web/src/routes/api/admin/wire.integration.test.ts:25,166` — the mocked conflict message 'Could
  not save. Please try again.' appears nowhere else in the repo; the real 409 body carries
  `TOKEN_CONFLICT_ERROR` ('The token list changed while saving — please try again',
  `web/src/lib/server/tokens.ts:162`). Its sibling 'Token already exists' is verbatim real, so the
  pair reads as mirrored while half of it is invented — in a file whose header claims it pins "the
  bytes on the wire". Use the real conflict string in the mock and the expectation (inline, since
  `vi.mock` replaces the module so the constant can't be imported).

#### What was tried

1. Exported `TokenSnapshot` from `api/admin/tokens/+server.ts` and `LoginResponse` from
   `api/admin/login/+server.ts`, and had the native admin page use them for `isSnapshot`'s guard
   annotation and the login-response parse, so the client's view of those payloads is the endpoints'
   own shape rather than a hand-copied literal and an untyped `any`. The login-error read became
   `(data && !data.ok ? data.error : null) ?? 'Sign in failed.'` because the brief's literal
   `data?.error` doesn't compile against the union's `ok: true` arm — runtime behavior is unchanged
   for every shape either endpoint can return, `throttled()`'s 429 included. A stronger version of
   this fix would also annotate `snapshot()`'s `json(...)` payload (e.g. `satisfies TokenSnapshot`)
   so that adding a server field actually surfaces as a client type error; the brief scopes the
   change to the client side, so I left the server payload untyped as specified.
2. Addressed all three review points in 936b6ef85882ef7fce60af03f7ab3717ba8417a4. (1) Bound the
   producers: `snapshot()` builds `const payload: TokenSnapshot` before `json(payload)`, and both
   login bodies use `satisfies LoginResponse` — verified load-bearing by temporarily adding an
   `extra` field, which `npm run check` rejected. (2) Dropped the
   `$lib/components/admin/AdminConsole.svelte` import from the endpoint; `TokenSnapshot.invites` is
   now `ReturnType<typeof buildInvites>`, so it tracks the server-side producer and no longer
   carries the `usage` field the endpoint never emits (still assignable to the console's `Invite[]`
   on the client, since `usage` is optional). (3) Added
   `web/src/routes/api/admin/wire.integration.test.ts`: 5 tests driving the real login/tokens
   handlers, each asserting the parsed payload against a wire-type-annotated expectation, so type
   and bytes are pinned to each other; the same mutation failed 2 of them. Gates green: check 0
   errors, unit 650 passed, eslint clean, tests/admin.spec.ts 8 passed, api:smoke 27 passed,
   format:check clean.
3. Addressed the review point in eb4124986614705691a181da1762841bb8a1c0ad. Exported
   `TokenMutationError` from `api/admin/tokens/+server.ts` and bound `mutationError()`'s body to it
   with `satisfies` — narrower than `MutationFailure` on purpose, since `reason` picks the 400/409
   status and must not reach the wire. Typed `applySnapshot`'s parse as
   `TokenSnapshot | TokenMutationError | null`, so the client no longer reads an `any`;
   `responseError` keeps its `unknown` parameter and runtime probing per the original brief's "keep
   the runtime guards", but the shape it probes is now a named producer-bound type. Extended
   `wire.integration.test.ts` with both rejection paths (duplicate → 400, CAS conflict → 409)
   asserted against a `TokenMutationError`-typed expectation. Verified load-bearing by temporarily
   leaking `reason` into the body: it failed both `npm run check` and the new test. Gates green:
   check 0 errors, unit 651 passed (60 files), eslint clean, tests/admin.spec.ts 8 passed, api:smoke
   27 passed, format:check clean.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-type-safety-native-page-hand-rolls-type-guards-that-duplicate-the-ser.patch`
(3 commits). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-type-safety-native-page-hand-rolls-type-guards-that-duplicate-the-ser.patch`.
*Three review rounds; the first two were fully addressed. Only the last objection above remained,
and it is narrow — a wrong string literal in a new test fixture.*

### [P2][duplication] The three per-invite action groups are triplicated markup

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte:278-304` (full), `:306-323`
(compact), `:338-373` (more-menu) — pinned at SHA f934d43

#### Problem

"Copy code / Copy link / Remove" for one invite is written out three times with slightly different
wrappers: the wide-screen labelled row, the narrow-screen "Copy + ⋯" pair, and the modal sheet. Each
restates `copy(\`${invite.token}:code\`,
invite.token)`, the`class:copied`toggle, and the remove`run(() =>
onremove(...))`wiring. Adding a fourth action (or renaming an existing one) is a three-place edit, and the copies have already drifted — the full row's button label is "Copy code" while the compact one is "Copy", and only the full/compact rows show the`copied`
flash, not the menu.

#### Proposed solution

Extract the action buttons into a small child component (`InviteActions.svelte`) taking `invite`,
`copied`, `busy`, and the `copy`/`onremove` callbacks, rendered in all three layout contexts. Or,
minimally, a `{#snippet actionButtons(invite)}` reused by the full row and the menu. The
compact/full/modal split then only differs in the container, not the buttons.

#### Verification

`tests/admin.spec.ts` copy-code/copy-link/remove assertions pass at both wide and narrow viewports.
`npm run check` clean.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* The more-menu's `copied` flash can never render: `copyAction`'s handler calls `copy()` (which
  assigns `copied` only after awaiting the clipboard write) and then `closeMenu()` synchronously,
  and the dialog's `onclose` nulls `menuInvite` so the sheet unmounts. The new
  `.more-menu-item.copied` rule at AdminConsole.svelte:800 is dead CSS and the sheet items never
  show "Copied!" — either keep the sheet open long enough for the flash to be visible, or drop the
  menu-only flash and its CSS rule.
* The menu copy items now render `copied === key ? 'Copied!' : label`, so `copied` set from another
  surface leaks into them: tapping the compact row's "Copy" and then opening the ⋯ sheet within the
  1500 ms window shows the sheet's "Copy code" item labelled "Copied!" despite never being clicked.
  Gate the menu items' label on something scoped to the menu, or leave them showing their static
  label.
* The new comment above `copyAction` in `web/src/lib/components/admin/AdminConsole.svelte:162-168`
  ends with "The row underneath flashes once the sheet closes", which is false for the `url` action:
  at narrow widths `.invite-actions-full` is `display: none` and the compact row only renders the
  `code` copy button, so copying a link from the sheet produces no feedback anywhere. Since this
  comment is the sole justification for deliberately not adding the flash the acceptance criteria
  asked for, correct it to say the code copy flashes on the compact row and the link copy has no
  visible feedback on narrow screens.
* The behaviour this commit changes is entirely untested: `web/tests/admin.spec.ts` only asserts the
  wide-viewport "Copy link" button is visible (line 29) and never opens the more-menu, exercises the
  compact row, or asserts on the "Copied!" flash. Add a narrow-viewport spec covering the "⋯"
  sheet's copy/remove items and asserting the sheet's items do not render "Copied!", so the leak
  this commit closes cannot silently return.
* web/tests/admin.spec.ts:144 and :153 read the clipboard with a non-retrying
  `expect(await page.evaluate(() => navigator.clipboard.readText()))` immediately after the sheet
  item's click. `copy()` awaits `navigator.clipboard.writeText` while `closeMenu()` runs
  synchronously, so `await expect(sheet).toBeHidden()` can resolve before the write lands and the
  read returns the stale value — empty on the first (link) read, the previous URL on the second
  (code) read, which `toBe(token)` fails on. Wrap both in `expect.poll(() => page.evaluate(...))`
  (the idiom already used in flows.spec.ts) so the assertion retries.

#### What was tried

1. Replaced the three copies of the per-invite copy/remove buttons with two component-local snippets
   (`copyAction`, `removeAction`) that close over the existing `copied`/`busy`/`copy`/`run` state,
   parameterised by the copy target, the label (so the compact row keeps its deliberate short
   "Copy"), and an `inMenu` flag that swaps in the sheet's list-item chrome and dismisses it. The
   more-menu's copy items now get the same `class:copied` flash as the other two surfaces, backed by
   a new `.more-menu-item.copied` rule; unifying the markup also gives the menu's Remove the
   `Remove {token}` aria-label the full row already had, which is the one behaviour change beyond
   the two the brief named.
2. Dropped the more-menu's `copied` flash and its dead `.more-menu-item.copied` rule: the sheet
   dismisses synchronously so it unmounts before `copy()` resolves, and `copied` is keyed by
   token+kind rather than by surface, so the only thing the menu items ever rendered was another
   surface's flash leaking in. `flashed = !inMenu && copied === key` now gates both the class and
   the label, making the sheet's markup byte-equivalent to the pre-refactor original while the row
   underneath still flashes after the sheet closes. Verified with a throwaway spec (deleted) that
   reproduces the leak scenario and the sheet's copy/remove paths, plus
   check/eslint/unit/admin-E2E/format all green.
3. Corrected the comment to say the code copy flashes the compact row while the link copy has no
   visible feedback at narrow widths, and added a narrow-viewport spec driving the ⋯ sheet's
   copy/remove items plus a guard on the flash leak. The first guard I wrote was vacuous — web-first
   assertions retry, so it waited out the 1.5s flash and passed against a deliberately reintroduced
   leak; the committed version takes one synchronous snapshot of the sheet items, the flashing row
   and the sheet title, asserts with non-retrying expect, and is wrapped in toPass for the window
   race (verified to fail against the reintroduced leak). The two specs were merged into one because
   /api/admin/login is capped at 10 hits per IP per minute and the suite already spent 8; a note
   above signIn records the budget. 10/10 repeats pass, with failures only from the limiter on the
   11th login.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-duplication-the-three-per-invite-action-groups-are-triplicated-markup.patch`
(3 commits). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-duplication-the-three-per-invite-action-groups-are-triplicated-markup.patch`.

### [P2][complexity] `readStore` bundles store-open, read, seed, confirmation-loop, and fallback into one function

**File(s):** `web/src/lib/server/tokens.ts:67-111` — pinned at SHA f934d43

#### Problem

`readStore` is the module's linchpin and carries five distinct responsibilities in one 45-line body:
open the store, read the key, run the env-seed-on-empty branch, run the multi-attempt seed-race
confirmation loop (`:88-98`), and degrade to the memory fallback on transient error. The
deeply-nested confirmation loop (a `for` with an inner `try/catch` inside the outer `try`) is the
subtle, correctness-critical part (ADR-0025 lost-seed-race handling) but it's buried where it's hard
to read or test in isolation.

#### Proposed solution

Split the seed-race confirmation into a named helper the reader can grasp and unit-test directly:

```ts
async function confirmSeedRaceWinner(store: TokenStore): Promise<StoreRead>; // the :88-100 block
```

`readStore` then reads as: open → get → (present ? blobs : seed-then-`confirmSeedRaceWinner`) →
catch → memory. The existing `freshTokensWithSeedRace` test helper can target
`confirmSeedRaceWinner` more pointedly.

#### Verification

The `stale-empty seed races` describe block in `tokens.test.ts` still passes; the extracted helper
is directly unit-testable.

---

#### Why it was deferred

implementation failed

#### What was tried

I made no changes and committed nothing: `.audit-work/current-brief.md` is stale — it describes the
invite-action-triplication finding that this run deferred and rolled back minutes earlier, not the
current finding (`readStore` bundles store-open/read/seed/confirmation-loop/fallback), whose
verifier returned VALID without ever rewriting the brief. Implementing the stale brief would have
redone rejected work and caused the driver to delete the unfixed `readStore` entry by title, so the
finding needs re-verification to produce a real brief before it can be implemented.

### [P4][maintainability] Session cookie name, scope, and 10-year max-age are scattered inline

**File(s):** `web/src/routes/admin/+page.server.ts:28-38, 107` — pinned at SHA f934d43

#### Problem

`SESSION_COOKIE` and `SESSION_MAX_AGE` are named (good), but the cookie *options* —
`path: '/admin'`, `httpOnly`, `sameSite: 'strict'` — are spelled out at the `set` site (`:32-37`)
and the `path: '/admin'` is independently repeated at the `delete` site (`:107`). If the scope ever
changes, `set` and `delete` must stay in lockstep by hand or logout silently fails to clear the
cookie (a delete with a mismatched path is a no-op). The `60 * 60 * 24 * 365 * 10` arithmetic is
fine but the whole option bundle wants to be one constant.

#### Proposed solution

```ts
const SESSION_COOKIE_OPTS = { path: '/admin', httpOnly: true, sameSite: 'strict' } as const;
// set: cookies.set(SESSION_COOKIE, sessionToken(), { ...SESSION_COOKIE_OPTS, maxAge: SESSION_MAX_AGE });
// delete: cookies.delete(SESSION_COOKIE, { path: SESSION_COOKIE_OPTS.path });
```

#### Verification

`tests/admin.spec.ts` logout clears the session (login form reappears). Grep shows `'/admin'` cookie
path defined once.

---

#### Why it was deferred

verifier gave no usable brief

### [P4][duplication] Native page reimplements session-state bookkeeping the cookie flow gets from the server

**File(s):** `web/src/routes/admin/native/+page.svelte:24-32` (`signOutLocally`) — pinned at SHA
f934d43

#### Problem

`signOutLocally` manually resets five reactive fields plus the admin-link visibility and clears
secure storage:

```ts
session = '';
authed = false;
invites = [];
persistent = true;
loginError = message;
setAdminLinkVisible(false);
void clearAdminSession();
```

This "what does a signed-out console look like" definition is the native mirror of what the web
loader's unauthenticated branch returns (`+page.server.ts:63-70`), but expressed as imperative field
resets that must be kept consistent with the initial `$state` declarations (`:15-22`) by hand. The
two lists have already drifted subtly (initial state sets `ready`/`flash`, sign-out doesn't touch
them — correct here, but nothing enforces it). It's easy to add a sixth session field and forget one
of the reset sites.

#### Proposed solution

Define one `signedOutState` object literal and assign from it in both the initial declarations and
`signOutLocally`, so "the empty session" is described once. Keep the side effects
(`setAdminLinkVisible`, `clearAdminSession`) explicit in `signOutLocally`.

#### Verification

`tests/admin.spec.ts` native sign-out returns to the login card with the link hidden;
expired-session (401) path still resets cleanly.

---

#### Why it was deferred

implementation failed

#### What was tried

Implemented the shared signedOutState() helper in web/src/routes/admin/native/+page.svelte exactly
as the brief specifies, used to seed the initial $state values and inside signOutLocally so the two
five-field lists can no longer drift independently. npm run check, eslint on the changed file, and
npm run test:unit (660 passed) all passed, and the named E2E gate (tests/admin.spec.ts, all 8 tests)
passed. However the full npm test run (asset-pipeline + repo-script + full Playwright suite)
required by the acceptance criteria was still executing in the background when a response was
required, so I could not confirm it green and have not committed — deferring so a partial/unverified
state isn't recorded as done.

### [P2][complexity] `$effect` bodies use bare member-access statements purely to register reactive dependencies — a fragile, non-obvious pattern

**File(s):** `web/src/routes/+page.svelte:37-41` (app shell) — pinned at SHA f934d43

#### Problem

```js
$effect(() => {
  settings.lockRotationEnabled;
  settings.forceLandscapeOrientation;
  applyDeviceOrientationPreference();
});
```

The first two lines are expression statements with no effect other than tripping Svelte's dependency
tracker, because `applyDeviceOrientationPreference()` reads the settings internally and wouldn't
otherwise re-run the effect. This is brittle: a reader (or a `no-unused-expressions` lint pass, or a
"cleanup" commit) can delete the two bare reads and silently break reactivity, with no test catching
it. The dependency is invisible at the call site.

#### Proposed solution

Make the dependency explicit and load-bearing: either have `applyDeviceOrientationPreference(prefs)`
take the two settings as arguments (so reading them is what produces the value passed in), or
compute
`const orientationPrefs = $derived([settings.lockRotationEnabled, settings.forceLandscapeOrientation])`
and reference `orientationPrefs` in the effect. Same for any other effect using this pattern.

#### Verification

Toggling lock-rotation / force-landscape in Parent Center still re-applies orientation. Removing the
argument/derived would now be a type error rather than a silent reactivity loss.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* `web/src/lib/components/ClearButton.svelte:31-34` still uses the exact pattern the finding asks to
  remove — a bare `layout.orientation;` statement whose only job is dependency registration,
  followed by `untrack(resetButtonPosition)`. The finding explicitly covers "any other effect using
  this pattern" and the verifier's claim that `+page.svelte` was the only instance is wrong. Make
  the read load-bearing there too (e.g. pass the orientation into the reset, or read it into a
  `$derived`/local that the untracked call consumes), keeping the untrack semantics so the effect
  still does not subscribe to the coachmark's visibility state.
* If that ClearButton read is the last bare member-access left, the justification comment and
  rule-off at `eslint.config.js:52-55` (`'@typescript-eslint/no-unused-expressions': 'off'`) become
  stale — update or re-enable it in the same change so the lint pass the finding names as a hazard
  actually guards against the pattern returning.
* `web/src/lib/actions/pinchZoom.svelte.ts:238-242` and
  `web/src/lib/actions/pinchTextZoom.svelte.ts:134-139` are the same pattern the finding covers
  under "Same for any other effect using this pattern" — `void o.enabled; void o.resetKey;` are
  expression statements existing only to subscribe the effect, while `reset()` reads neither. Make
  those reads load-bearing (pass `o.enabled`/`o.resetKey` into `reset`, or derive from them) the
  same way `ClearButton` was fixed.
* The commit message's claim that re-enabling `@typescript-eslint/no-unused-expressions` means "the
  pattern cannot return unnoticed" is false: the rule explicitly permits `void`-prefixed expression
  statements, which is why the two pinch actions lint green. Either fix those two sites so the claim
  holds, or correct the commit message to state the lint guard only covers the bare-read form.
* `web/src/lib/components/ClearButton.svelte:23-28`: `lastResetOrientation` is assigned before the
  `if (!containerEl || isDragging) return;` early return, so an orientation change skipped
  mid-gesture is recorded as if the reset had happened. Move the assignment below that guard so it
  records only resets actually performed.
* `ClearButton.svelte`'s new `lastResetOrientation` dedupe silently drops a reset the old code
  performed. `layout.orientation` is binary and is the effect's only dependency, so the guard can
  never fire on a normal rotation — it fires only after a reset was *skipped*
  (`isDragging`/`!containerEl`, which leaves `lastResetOrientation` at the previous value), and then
  suppresses the reset on the flip back to that orientation: drag the button, rotate mid-drag,
  rotate back, and the stale `transform` is no longer cleared and `coachmark?.dismiss()` is no
  longer called. Drop the dedupe (`untrack(() => resetButtonPosition(orientation))` already makes
  the dependency load-bearing, which is all the finding asked for), and delete the accompanying
  comment claiming "a rotation skipped mid-gesture is still pending if the orientation flips back to
  it" — the code does the opposite.
* The `lastReset` dedupe added to `pinchZoom`/`pinchTextZoom` is a behaviour change beyond the
  finding's scope (the finding only asked that the dependency be load-bearing, which passing
  `o.enabled, o.resetKey` into `reset` already achieves) and nothing in the unit or E2E suites
  exercises it. If you keep it, say so; otherwise the smaller change is to pass the two options in
  and keep resetting unconditionally.

#### What was tried

1. `applyDeviceOrientationPreference` now takes `lockRotationEnabled` and
   `forceLandscapeOrientation` as parameters instead of reading `settings` from module scope, so the
   drawing route's `$effect` registers both dependencies by actually passing them — dropping either
   one is now a TypeScript arity error rather than a silent loss of reactivity. The second call site
   in `lib/boot/persistedState.ts` was updated to thread the same two settings through.
2. Addressed both review points and amended the finding's (unpushed) commit.

ClearButton.svelte: `resetButtonPosition` now takes the orientation as a parameter and dedupes
against the last reset it performed; the effect reads `layout.orientation` into a local and passes
it through `untrack(() => resetButtonPosition(orientation))`. The untrack semantics are unchanged,
so the effect still does not subscribe to the coachmark's visibility state, and the dedupe makes the
argument genuinely consumed rather than an ignored parameter — mirroring
`applyDeviceOrientationPreference`'s `lastRequested` guard, and preventing a same-orientation re-run
from dismissing the tutorial.

eslint.config.js: removed the now-stale justification comment and the
`'@typescript-eslint/no-unused-expressions': 'off'` rule-off for Svelte files. Verified the
re-enabled rule actually catches the pattern with a throwaway probe component containing a bare
`layout.orientation;` inside an `$effect` (errored as expected; probe deleted) — not just that the
repo lints clean.

Gates: `npm run check` 0 errors, `npm run lint` clean repo-wide with the rule live,
`npm run test:unit` 680 passing, `tests/flows.spec.ts` + `tests/clear-tutorial.spec.ts` 45 passing.
Caveat: the first E2E pass had 2 failures (`a palette press mid-stroke removes the live brush ring`,
`the eraser removes magic-brush strokes and later colors override them`) — both magic-brush
canvas-pixel assertions unrelated to this change, both green in the earlier flows-only run and on a
`--retries=1` re-run. Judged flakes based on the retry, not diagnosed. 3. Addressed all three review
points and amended the finding's (unpushed) commit.

1. pinchZoom.svelte.ts / pinchTextZoom.svelte.ts: removed `void o.enabled; void o.resetKey;` and
   pass both into `reset`, which dedupes on them — the same shape as the ClearButton fix. Note
   discovered while doing this: those two statements were already inert. Both call sites pass a
   getter returning a plain object literal, so `getOptions()` is what reads the runes and subscribes
   the effect; reading properties off the returned plain object tracks nothing. The comments
   claiming "reading these runes here is what subscribes the action" were wrong and are corrected.
   The dedupe additionally prevents the `target` bind:this landing after mount from resetting a zoom
   the user is holding.

2. Commit message: verified empirically with a probe containing both spellings in one $effect —
   `o.enabled;` is flagged, `void o.enabled;` is not. The message now states the lint guard covers
   the bare-read form only. Considered a `no-restricted-syntax` selector to close the `void` hole
   and declined: `ClearCoachmark.svelte:50` has a legitimate `void el.offsetWidth;` forced reflow of
   exactly that shape, so the rule would require a permanent inline disable on correct code.
   Tradeoff documented in the commit message; happy to add the rule + disable if preferred.

3. ClearButton.svelte: `lastResetOrientation` now assigns below the `!containerEl || isDragging`
   guard, so a rotation skipped mid-gesture stays unrecorded and still resets if the orientation
   flips back.

Gates: `npm run check` 0 errors, `npm run lint` clean repo-wide, `npm run test:unit` 680 passing,
E2E across flows/clear-tutorial/parent-zoom/multitouch/ai-timer/page — 63 passed, 1 flaky
(`the eraser removes magic-brush strokes and later colors override them`, the same unrelated
canvas-pixel test that flaked last round, green on retry).

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`
(1 commit). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-complexity-effect-bodies-use-bare-member-access-statements-purely-to.patch`.

### [P5][readability] `+error.svelte` and both `handleError` hooks produce a `{ message }` that nothing ever displays

**File(s):** `web/src/routes/+error.svelte:1-7`, `web/src/hooks.client.ts:6-9`,
`web/src/hooks.server.ts:52-55` — pinned at SHA f934d43

#### Problem

Both hooks return `{ message: 'Something went wrong.' }` (the `App.Error` shape), but
`+error.svelte` renders `<ErrorScreen />` with no props and `ErrorScreen` shows its own hardcoded
"Something went wrong. Let's start a fresh drawing." So the returned `message` is dead data —
computed and typed but never surfaced. A reader reasonably assumes the hook message reaches the UI;
it doesn't.

#### Proposed solution

Either drop the message payload to a comment noting the UI copy is intentionally fixed in
`ErrorScreen`, or wire `page.error?.message` into `ErrorScreen` via a prop so the returned value is
actually used. Pick one so the data flow isn't misleading.

#### Verification

Trigger a load/nav error → `/error` renders; confirm whether the message is shown or intentionally
ignored, and that the code reflects that decision.

---

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* The new comments in web/src/hooks.client.ts:9-10 and web/src/hooks.server.ts:76-77 assert
  something false: there is no `src/error.html`, so SvelteKit falls back to its default error
  template, which renders `%sveltekit.error.message%` — the handleError message *is* shown to the
  user whenever an error escapes `+error.svelte` (e.g. thrown inside the `handle` sequence in
  hooks.server.ts, or a root-layout failure), and is also serialized into SvelteKit's JSON error
  responses for data requests. Reword to say the message is not used by
  `+error.svelte`/`ErrorScreen` but is surfaced by SvelteKit's fallback error page and data-request
  error responses; also drop "required by SvelteKit's App.Error contract", since
  `HandleServerError`/`HandleClientError` may return void.
* web/src/lib/errorLog.ts:1-3 still describes `GENERIC_ERROR_MESSAGE` as the "user-facing fallback"
  kept "in step" across three sinks including the layout's render boundary — but the render boundary
  renders `ErrorScreen`'s own copy and never imports the constant. That comment is the same
  misleading data-flow claim the finding targets, and it now directly contradicts the two comments
  this commit added; update it in the same change.
* The comment added to web/src/hooks.client.ts:9-10, web/src/hooks.server.ts:76-77 and
  web/src/lib/errorLog.ts:3-5 claims "data-request error responses do surface it", which is false: a
  load error during client-side navigation serializes App.Error into __data.json, the client sets it
  as page.error, and the root +error.svelte then renders <ErrorScreen /> ignoring it — that path
  transports the message but never displays it. Drop that clause.
* The real second consumer the comment omits is the /api/* +server.ts endpoints: when one throws,
  handleError's returned { message } becomes the JSON error body sent to the caller. Name that
  (alongside SvelteKit's default fallback error page, which is correct since there is no custom
  web/src/error.html) instead of "data-request error responses".
* web/src/routes/+error.svelte is untouched even though the finding names it first and it is where
  the message is actually discarded; add to its existing comment block that page.error.message is
  deliberately ignored because ErrorScreen owns the user-facing copy.
* `web/src/routes/+error.svelte:4` misattributes the source: `page.error.message` is set by
  `handleError` only for *unexpected* errors — for expected throws it is the `error()` body, which
  is the actual path in this repo (`web/src/routes/admin/+page.server.ts:45` throws
  `error(403, 'Forbidden')`, plus SvelteKit's own 404 `'Not Found'`). This contradicts the invariant
  already documented in `web/src/hooks.server.ts` ("expected error(4xx) responses never land here");
  reword so the parenthetical covers both sources rather than naming the hooks as the setter.

#### What was tried

1. Added a short comment above the `return { message: GENERIC_ERROR_MESSAGE }` in both
   hooks.client.ts and hooks.server.ts explaining that `message` is required by SvelteKit's
   `App.Error` contract but is never actually surfaced in the UI (ErrorScreen's copy is fixed
   independently) — a comment-only fix, per the brief, since neither of the finding's two proposed
   code changes was actually a good fit here.
2. Fixed both review points on the amended (still-unpushed) commit: the hook comments in
   hooks.client.ts and hooks.server.ts now correctly state that `message` isn't read by
   +error.svelte/ErrorScreen but is surfaced by SvelteKit's fallback error page and data-request
   error responses, and no longer claim it's "required by App.Error"
   (HandleServerError/HandleClientError may return void). errorLog.ts's header comment was corrected
   to stop claiming GENERIC_ERROR_MESSAGE is a shared "user-facing fallback" across all three error
   sinks — it now states only the two hooks consume it, and that ErrorScreen/+error.svelte/the
   render boundary render their own hardcoded copy instead. Verified with `npm run check`, eslint on
   the three changed files, and `npm run test:unit` (682 tests passing).
3. Fixed all three review points on the amended (still-unpushed) commit: dropped the false
   "data-request error responses" claim from the hooks.client.ts, hooks.server.ts, and errorLog.ts
   comments; named the real second consumer of the message — SvelteKit's default fallback error page
   (no custom error.html) plus, from the server hook only, the JSON error body returned by a thrown
   /api/* +server.ts handler (client hook has no /api/* consumer, so its comment names only the
   fallback page); and added a note to +error.svelte's existing comment block stating
   page.error.message is deliberately ignored because ErrorScreen owns the user-facing copy.
   Verified with npm run check, eslint on the four changed files, and npm run test:unit (682 tests
   passing).

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p5-readability-error-svelte-and-both-handleerror-hooks-produce-a-message.patch`
(1 commit). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p5-readability-error-svelte-and-both-handleerror-hooks-produce-a-message.patch`.

### [P3][maintainability] Hexagon geometry constants are scattered and coupled to a JS comment

**File(s):** `web/src/lib/components/ColorPicker.svelte:372-377` (CSS) and `:53-58` (JS comment) —
pinned at SHA f934d43

#### Problem

The hexagon is `width: 60px; height: 69px; /* height = width * 1.15 */`, and the snap logic's
comment (line 55) asserts "a hexagon's farthest edge point is ~35px from its center" and picks
`HEX_SNAP_RADIUS = 40` accordingly. The `35`/`40` in JS depend on the `60/69` in CSS, but the
coupling is only prose — resizing the hexagon in CSS silently makes the snap radius wrong with no
failing check.

#### Proposed solution

Define hex width/height as CSS custom properties (`--hex-w: 60px; --hex-h: 69px`) and derive
`HEX_SNAP_RADIUS` from a documented relation (e.g. read `--hex-w` or centralize the number next to
the size). At minimum move the geometry note to one place both sides cite.

#### Verification

Snap still resolves gap-hits in the E2E picker drag test; changing `--hex-w` visibly scales hexagons
via the single source.

---

#### Why it was deferred

implementation failed

### [P3][performance] `getRingColor` is recomputed 2-3× per active swatch in the template

**File(s):** `web/src/lib/components/ColorPalette.svelte:130-132` — pinned at SHA f934d43

#### Problem

For the active swatch the style string calls `ringShadow(shown)` (which internally calls
`getRingColor(shown)`) *and* separately `getRingColor(shown)` again for `--ring-color`:

```svelte
? `box-shadow: ${ringShadow(shown)}; --ring-color: ${getRingColor(shown)};`
```

So `getRingColor` (hex parse + luminance + per-channel math, itself re-parsing hex) runs at least
twice for the selected swatch on every reactive tick that touches this `{#each}`. Minor per-swatch,
but it's pure work recomputed needlessly.

#### Proposed solution

Compute the ring color once. Since only one swatch is active at a time, derive it near the
selection:
`const activeRingColor = $derived(getRingColor(themedSwatchColor(colors.activeSwatch, dark)))` and
reuse it for both `box-shadow` and `--ring-color`. Combined with the `selectionRingShadow`
extraction, the active swatch computes its ring color exactly once.

#### Verification

`box-shadow` and `--ring-color` still match; add a spy/count in a unit-ish harness or just confirm
identical rendered output.

---

#### Why it was deferred

verifier unavailable

### [P3][performance] Every swatch element is captured into `$state`, but only the custom swatch's ref is read

**File(s):** `web/src/lib/components/ColorPalette.svelte:23, 137, 85` — pinned at SHA f934d43

#### Problem

`let swatchEls = $state<Record<string, HTMLButtonElement>>({})` and every palette button does
`bind:this={swatchEls[hex]}` (line 137), but the only consumer is `selectCustomColor` reading
`swatchEls[CUSTOM_SWATCH]` (line 85). All ten color-swatch refs are stored into a reactive `$state`
record that nothing reads, causing needless proxy writes on mount/trim.

#### Proposed solution

Bind only the custom swatch: replace the record with a single
`let customSwatchEl: HTMLButtonElement | undefined` bound at line 153, drop the per-swatch
`bind:this` at line 137, and read `customSwatchEl` in `selectCustomColor`.

#### Verification

Opening the picker still anchors to the custom swatch center (`buttonCenter`); no other code
references `swatchEls` (`rg swatchEls`).

---

#### Why it was deferred

verifier unavailable

### [P1][consistency] Unify the two error-response shapes across the API surface

**File(s):** `web/src/lib/server/http.ts:9-15,22-27`;
`web/src/routes/api/generate-image/+server.ts:17-19,71,72,92,111,143`;
`web/src/lib/server/generationAuthorization.ts:32,60`;
`web/src/routes/api/report/+server.ts:73,78,89,104`;
`web/src/routes/api/verify-access-code/+server.ts:26,30`;
`web/src/routes/api/verify-key/+server.ts:20,24` — pinned at SHA f934d43

#### Problem

Endpoints emit two incompatible JSON error shapes with no rule for which:

* **`{ ok: false, error }`** — `throttled()`, `verify-access-code`, `verify-key`, `report`.
* **SvelteKit `{ message }`** — every `throw error(...)` in
  `generate-image`/`generationAuthorization` (403, 413, 415, 422, 502, 500) and `readJsonBody`'s
  `throw error(400, 'Expected a JSON body')`.

The same endpoint can return both: in `report`, a malformed body yields
`{ message: 'Expected a JSON body' }` (400) while a missing `kind` yields
`{ ok: false, error: 'Please choose bug or feature.' }` (400). A client can't parse a 400 from
`report` without sniffing the shape. The API skill (SKILL.md:31) even advertises "clients surface
the `error` field directly," which is false for every `error()`-thrown response.

#### Proposed solution

Add a single error-builder beside `throttled()` in `http.ts`, e.g.:

```ts
export function fail(status: number, error: string, headers?: HeadersInit): Response {
  return json({ ok: false, error }, { status, headers });
}
```

Replace the client-facing `throw error(400|413|415|422|502|500, msg)` calls (and `readJsonBody`'s
throw, returning the parsed value or a `fail(400, ...)` sentinel) with `fail(...)` so every JSON
error is `{ ok, error }`. Note `readAiImageResponse` reads `.text()` so it tolerates the change;
`aiCredential`/`report` clients already expect `{ ok, error }`.

#### Verification

`grep -rn "throw error(" web/src/routes/api web/src/lib/server` returns only genuinely-unexpected
5xx (which should hit `handleError`). Add a test asserting every documented failure body has
`{ ok:false, error:string }`. Run `npm run test:api:smoke`.

---

#### Why it was deferred

implementation failed

#### What was tried

Implemented the normalized API failures and verified the code, but Ruler regeneration could not
update `.agents/skills/api/SKILL.md` because the nested sandbox denies writes under `.agents`. The
source and `.claude` copy are updated; the `.agents` copy remains stale, so the scoped change is
incomplete.

### [P2][duplication] Move content-type parsing into a shared `http.ts` helper

**File(s):** `web/src/routes/api/generate-image/+server.ts:33-34` (`contentTypeOf`) and
`web/src/routes/api/csp-report/+server.ts:104-107` — pinned at SHA f934d43

#### Problem

The exact "strip params, trim, lowercase the Content-Type" logic is written twice:

```ts
// generate-image:33
const contentTypeOf = (request: Request) =>
  (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
// csp-report:104
const contentType = (request.headers.get('content-type') ?? '')
  .split(';')[0].trim().toLowerCase();
```

Both endpoints branch on Content-Type for correctness (multipart vs raw; allowed telemetry formats).
Divergence here is a real behavioral bug risk, and the pattern is a natural shared helper next to
`readJsonBody`.

#### Proposed solution

Add to `http.ts`:

```ts
export function contentType(request: Request): string {
  return (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
}
```

Use it in both routes (generate-image both for the multipart branch and the raw mimeType at line
93).

#### Verification

`grep -rn "split(';')\[0\]" web/src/routes` returns nothing after. `npm run test:api:smoke` covers
csp-report's two formats + 415.

---

#### Why it was deferred

implementation failed

#### What was tried

Implemented the shared content-type normalizer and updated both routes with focused passing tests.
Verification cannot complete because `npm run test:unit` fails in two pre-existing, unrelated
untracked test files; I left them untouched and made no commit.

### [P2][duplication] Extract the oversized-body guard shared by generate-image and csp-report

**File(s):** `web/src/routes/api/generate-image/+server.ts:83-92` and
`web/src/routes/api/csp-report/+server.ts:114-122` — pinned at SHA f934d43

#### Problem

Both endpoints implement the same two-stage cap — reject on declared `Content-Length` first, then
re-check the actual byte length after reading — with the same subtle reasoning (a code-unit length
check would under-count multibyte payloads):

```ts
// generate-image
const declaredLength = Number(request.headers.get('content-length'));
if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) throw error(413, ...);
const bytes = Buffer.from(await request.arrayBuffer());
if (bytes.byteLength > MAX_IMAGE_BYTES) throw error(413, ...);
// csp-report
const declaredLength = Number(request.headers.get('content-length'));
if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return new Response(null,{status:413});
const raw = await request.text();
if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return new Response(null,{status:413});
```

Two copies of a security-relevant limit; a fix to one (e.g. handling chunked encoding) won't reach
the other.

#### Proposed solution

Add helpers to `http.ts`:

```ts
export function declaredLengthExceeds(request: Request, maxBytes: number): boolean;
export async function readCappedBuffer(request: Request, maxBytes: number): Promise<Buffer>; // throws error(413)
export async function readCappedText(request: Request, maxBytes: number): Promise<string>; // throws error(413)
```

Route `generate-image`'s raw branch through `readCappedBuffer` and csp-report through
`readCappedText`.

#### Verification

Unit test each helper with declared-vs-actual mismatch and a multibyte payload.
`npm run test:api:smoke` exercises csp-report's cap.

---

#### Why it was deferred

implementation failed

#### What was tried

Implemented the shared zero-copy raw-body reader, migrated both endpoints, and added focused
byte-limit and UTF-8 coverage. The required unit gate remains red because two pre-existing untracked
test files contain 13 unrelated failing assertions; I left them untouched, so no commit should be
created.

### [P2][type-safety] Share request/response contract types between routes and client callers

**File(s):** `web/src/lib/aiCredential.ts:11-18` (`VerifyResponse`/`VerifyCredentialResult`);
`web/src/routes/api/verify-access-code/+server.ts:32`;
`web/src/routes/api/verify-key/+server.ts:28`; `web/src/routes/api/report/+server.ts:101`;
`web/src/lib/drawing/aiImageResponse.ts:1-5` — pinned at SHA f934d43

#### Problem

Every endpoint's response shape is re-declared, loosely, on the client with no compile-time link to
the server. `aiCredential.ts` hand-writes
`type VerifyResponse = { ok?: boolean; error?: string; accessCode?: string }`, while the server
returns `{ ok: true, accessCode }` / `{ ok: false, error }` — nothing enforces they agree. If the
server drops `accessCode` or renames `error`, the client silently reads `undefined`. Same for
`report` (no client type at all) and generate-image.

#### Proposed solution

Define the wire contracts once in a shared, client-safe module (e.g. `web/src/lib/apiTypes.ts` — no
server imports):

```ts
export type VerifyAccessCodeResponse = { ok: true; accessCode: string } | {
  ok: false;
  error: string;
};
export type VerifyKeyResponse = { ok: true } | { ok: false; error: string };
export type ReportResponse = { ok: true; url: string } | { ok: false; error: string };
export type ApiError = { ok: false; error: string };
```

Have each route annotate its return (`json<VerifyAccessCodeResponse>(...)` or a typed helper) and
the client import the same types.

#### Verification

`tsc`/`npm run check` fails if a route's returned object diverges from the shared type. Add a
type-level test importing both.

---

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `generate-image/+server.ts` and `drawing/aiImageResponse.ts` remain entirely unlinked: the binary
  success and 422/429/error wire semantics are still independently encoded, so server changes can
  compile while silently breaking the client, leaving the original generate-image portion
  unresolved.

#### What was tried

1. Added shared discriminated JSON response contracts and applied them to both client parsers, all
   specified route payloads, and the common throttling response. Defensive parsing, status checks,
   and the report honeypot’s optional URL behavior remain unchanged.
2. Applied repository Prettier formatting to the five flagged shared-contract files so the
   implementation conforms to the required code style without behavioral changes.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-type-safety-share-request-response-contract-types-between-routes-and.patch`
(2 commits). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-type-safety-share-request-response-contract-types-between-routes-and.patch`.

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

#### Why it was deferred

implementation failed

#### What was tried

I added the requested build-literal guards, but the brief’s verification note is mistaken: Vitest
defines `__IS_CAPACITOR__` as true, making 15 web install-state tests inert before mocked
`isNative()` is reached. Fixing the gate requires an out-of-scope test-config change, so the exact
scoped implementation remains uncommitted.

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

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* The `updateReload = 'owed'` deferral transition remains inline in `onControllerChange`, so the
  original finding’s requested centralization of both lifecycle outcomes is incomplete; extract and
  call a `deferReload()` helper alongside `reloadForUpdate()`.

#### What was tried

The duplicated reset-and-reload transition is now one private helper, used by both empty-canvas
update paths.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location.patch`
(1 commit). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p4-duplication-reload-side-effect-pair-refreshstate-idle-window-location.patch`.

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

#### Why it was deferred

failed adversarial review

Reviewer's unresolved objections:

* Update `tools/asset-gen/docs/pipeline.md:334-337`: it still instructs contributors to call the
  obsolete three-argument `page('nature', 'ant', 'Ant', ...)` signature, which no longer compiles
  now that the book ID is bound by `book()` and the inner page helper accepts only the page ID,
  name, and exceptions.
* `tools/asset-gen/legacy/night-fills.md` still describes its ship/wire instructions as accurate but
  tells users to call `page('farm', 'cat', 'Cat')`; update that live catalog-wiring guidance to the
  new book-bound `page('cat', 'Cat')` signature.
* `tools/asset-gen/legacy/night-fills.md:22` still presents the removed three-argument
  `page('nature', 'ant', 'Ant', …)` signature as current ship/wire guidance; update it to the
  book-bound `page('ant', 'Ant', …)` form.

#### What was tried

1. Bound each coloring-page factory to its enclosing book ID and derived the cover from that same
   ID, eliminating cross-book path mismatches while preserving catalog values. Added a table-driven
   invariant covering every generated image variant for every page.
2. Updated the asset-pipeline runbook to describe the book-bound page helper and use its current
   two-argument form, with page exceptions correctly shown as the optional third argument.
3. Updated the legacy night-fill shipping guidance to identify the page helper as book-bound and use
   `page('cat', 'Cat')`, matching the current catalog API.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p1-duplication-book-id-is-re-typed-as-a-string-argument-on-every-page-ca.patch`
(3 commits). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p1-duplication-book-id-is-re-typed-as-a-string-argument-on-every-page-ca.patch`.

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

#### Why it was deferred

implementer failed to deliver a fix round

Reviewer's unresolved objections:

* `ColoringBook.svelte` still retains the original raw `font-size: 24px` at line 196 and raw padding
  values `28px`, `18px`, and `6px` at lines 330, 343, and 364. Reconcile all of these with the
  design-system type and spacing scales; leaving values without exact matches as literals does not
  resolve the original finding.

#### What was tried

Replaced the exact spacing-scale matches in `ColoringBook.svelte` with their existing CSS custom
properties, including compound shorthands. Preserved computed dimensions, the 24px heading size, and
all unresolved raw spacing values so the layout remains pixel-identical.

#### Draft implementation

The rolled-back draft is kept at
`docs/audit-deferred/p2-design-tokens-spacing-and-font-sizes-are-raw-px-while-colors-radii-du.patch`
(1 commit). It passed the driver's type-check, unit-test and lint gates — the review is what it did
not pass — so it is a starting point rather than scrap. Apply with
`git apply docs/audit-deferred/p2-design-tokens-spacing-and-font-sizes-are-raw-px-while-colors-radii-du.patch`.
