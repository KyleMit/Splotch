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
