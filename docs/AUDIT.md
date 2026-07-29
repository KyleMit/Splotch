# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

All findings below come from the 2026-07-28 comprehensive per-section code audit (one section per
`docs/CODE-MAP.md` area, subcategories used where defined). Every citation is pinned to commit
9ae62ff1c7faeb58437da293dfcad5a52dacbc18 (`9ae62ff1`); line numbers refer to that commit. Findings
are ranked P1 (most important) to P5 (least) within each section.

Two follow-up quality passes have already run over this list. A **dedup sweep** merged six blocks
that were filed twice from different sections (649 raw findings → 643). An **adversarial
verification sample** of 26 findings — every P1 plus a P2 sample — re-checked each claim against the
cited code: 23 confirmed, 2 partial, 1 refuted and removed. Findings carrying a
`> **Verified 2026-07-28**` blockquote have been through that pass; the rest have not, so
`/vet-audits` still owns validating them.

## Source: Code audit — Drawing engine — undo & snapshot history

## Source: Code audit — Drawing engine — export/save, paper view & pointer math

### [Maintainability] Name the export-scale floor instead of an inline `2`

**File(s):** `web/src/lib/drawing/exportDrawing.ts` (`composeExportPng`, lines 116–119) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// Compose in CSS-pixel coordinates at an export scale of at least 2×, so the
// paper texture and overlay keep their on-screen proportions while the
// already-high-res strokes pass through with minimal resampling.
const exportScale = Math.max(window.devicePixelRatio || 1, 2);
```

The `2` is precisely what CLAUDE.md defines as a tuning literal — a tunable quality/size tradeoff
(bigger floor = crisper exports on 1× screens but larger PNGs and more canvas memory) — and the
convention says it "gets a named module-scope constant with the unit in the name; the WHY comment
lives on the constant". Today the WHY comment is attached to the expression inside the function, and
anyone profiling export memory on low-end devices has to find the knob inside `composeExportPng`
rather than at the top of the module where its siblings would live.

#### Proposed solution

```ts
// Floor the export at 2× so 1×-screen exports still get crisp texture/overlay
// resampling; strokes are already high-res and pass through nearly 1:1.
const MIN_EXPORT_SCALE = 2;
...
const exportScale = Math.max(window.devicePixelRatio || 1, MIN_EXPORT_SCALE);
```

(Unit is a scale factor, so no `_PX`/`_MS` suffix applies — the `SNAP_BAND_FRACTION` precedent
covers unitless ratios.)

### [Testing] screenshot.ts has zero unit coverage despite containing pure, unit-testable logic

**File(s):** `web/src/lib/drawing/screenshot.ts` (`timestamp`, lines 7–11; `saveImageBlob`, lines
71–92; `getPolaroidFrameOffset`, lines 105–111) @ 9ae62ff1

**Priority:** P4

#### Problem

The sibling modules in this section all have colocated tests (`folderSave.test.ts`,
`paperView.test.ts`, `strokeMath.test.ts`), but `screenshot.ts` has none, and it contains exactly
the kind of logic the testing rules assign to Vitest:

* `timestamp()` — a pure formatter whose zero-padding and `YYYY-MM-DD_HH-MM-SS` shape downstream
  filenames (and the `folderSave.ts` line 126–127 comment's "second-resolution" collision reasoning)
  depend on. A regression to unpadded fields breaks filename sorting silently.
* `saveImageBlob`'s web dispatch chain (lines 85–91): folder write attempted first, `true`
  short-circuits the download, `false` falls back to `triggerDownload` + `URL.revokeObjectURL`. This
  branching is the seam between two tested modules and is itself untested — `folderSave.test.ts`
  tests below it, `aiImage.test.ts` mocks it away above.
* `getPolaroidFrameOffset` (pure given a `DOMRect` and window size).

#### Proposed solution

Add `screenshot.test.ts` (happy-dom, since the module's imports touch `document` at load): assert
`timestamp()` against a mocked `Date`; mock `./folderSave` and `./engine` to drive `saveImageBlob`
through the folder-hit, folder-miss→download, and native branches (`__IS_CAPACITOR__` is
compile-time `false` under Vitest web config — the native branch may need the test to stay web-only,
which is fine and worth a comment). If the architecture split proposed above happens first, the
naming/download utils test drops to `// @vitest-environment node`.

### [Performance] saveDrawingIfEnabled serializes the screenshot-chunk fetch behind the export

**File(s):** `web/src/lib/drawing/saveOnDelete.ts` (`saveDrawingIfEnabled`, lines 11–19) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const blob = await exportCanvasBlob(getActiveOverlayImage());
if (!blob) return;
const { saveImageBlob } = await import('./screenshot');
await saveImageBlob(blob);
```

The `./screenshot` chunk fetch only starts after the full export (which itself awaits the
`./exportDrawing` chunk plus the ~226ms texture decode noted at `exportDrawing.ts` line 38)
completes. On a slow connection the two network waits are strictly sequential. This is a background
save, so no one is watching a spinner — but the longer the save takes, the wider the window in which
app teardown (tab close after the delete) can abort it and lose the drawing this feature exists to
keep.

#### Proposed solution

Start the module fetch before awaiting the export so network overlaps compositing:

```ts
const screenshotModule = import('./screenshot');
const blob = await exportCanvasBlob(getActiveOverlayImage());
if (!blob) return;
const { saveImageBlob } = await screenshotModule;
```

Gotcha: an early `return` (empty blob) leaves the import promise dangling — harmless (the chunk is
cached for the next save), but if the connection is dead the rejection becomes unhandled; attach a
no-op `.catch` or hoist the try/catch. Verify `web/tests/startup-bundle.spec.ts` still passes (the
import stays dynamic, so it should).

### [Maintainability] calculateStrokeSpeed's 1ms span floor is an unnamed tuning literal

**File(s):** `web/src/lib/drawing/strokeMath.ts` (`calculateStrokeSpeed`, line 115) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const windowSpan = Math.max(newSample.t - samples[0].t, 1);
```

The `1` encodes a decision — floor the elapsed span at 1ms so same-timestamp samples don't divide by
zero (the dedicated test at `strokeMath.test.ts` lines 135–138 even names it: "floors the span at
1ms"). Every other threshold in this file follows the convention (`EDGE_SWIPE_BAND_PX`,
`POINTER_RESUME_GAP_MS`, etc., lines 23–25, 90–91, all with units and WHY comments); this is the one
literal that escaped. It also silently caps reported speed at `distance px/ms`, which a future tuner
of the speed-driven brush should be able to see at the top of the module.

#### Proposed solution

```ts
// Floor for the elapsed span so coincident timestamps can't divide by zero
// (caps reported speed at distance/1ms).
export const MIN_SPEED_SPAN_MS = 1;
```

and use it in the `Math.max`. The test should import it rather than re-deriving `5` (per the
parametrized-test rule), or keep the literal assertion as the deliberate test-side exception.

### [Types] IDENTITY_PAPER_VIEW is frozen at runtime but mutable in the type

**File(s):** `web/src/lib/drawing/paperView.ts` (`IDENTITY_PAPER_VIEW`, lines 31–36) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
export const IDENTITY_PAPER_VIEW: PaperView = Object.freeze({
  scale: 1,
  rotate: 0 as ViewRotation,
  tx: 0,
  ty: 0,
});
```

The runtime contract (frozen) and the declared type (`PaperView`, mutable fields) disagree:
`IDENTITY_PAPER_VIEW.tx = 5` type-checks but throws `TypeError` in strict mode. The
`0 as ViewRotation` cast is also a workaround for the annotation shape — `Object.freeze`'s inference
widens `rotate` to `number` before the annotation can contextualize it.

#### Proposed solution

```ts
export const IDENTITY_PAPER_VIEW: Readonly<PaperView> = Object.freeze<PaperView>({
  scale: 1,
  rotate: 0,
  tx: 0,
  ty: 0,
});
```

`Object.freeze<PaperView>` contextually types the literal (killing the cast), and
`Readonly<PaperView>` makes the immutability compiler-visible. Consumers all read fields, so no
call-site churn; anywhere that needs a mutable copy already must spread it.

### [Maintainability] Contain-fit scale-and-center math is duplicated between drawOverlayContained and computePaperView

**File(s):** `web/src/lib/drawing/exportDrawing.ts` (`drawOverlayContained`, lines 91–93) and
`web/src/lib/drawing/paperView.ts` (`computePaperView`, lines 55–59) @ 9ae62ff1

**Priority:** P5

#### Problem

Both sites implement "uniformly scale a box to fit inside another and center the remainder":

`exportDrawing.ts` 91–93:

```ts
const scale = Math.min(w / overlay.naturalWidth, h / overlay.naturalHeight);
const drawnW = overlay.naturalWidth * scale;
const drawnH = overlay.naturalHeight * scale;
// centered via (w - drawnW) / 2, (h - drawnH) / 2 at line 97
```

`paperView.ts` 55–59:

```ts
const scale = Math.min(viewport.width / rotatedW, viewport.height / rotatedH);
const marginX = (viewport.width - rotatedW * scale) / 2;
const marginY = (viewport.height - rotatedH * scale) / 2;
```

The overlay one is semantically load-bearing beyond dedup: the export must contain-fit the overlay
*exactly* as the on-screen presentation does (the `drawOverlayContained` doc comment at lines 79–82
promises "matching how the overlay `<img>` renders above the canvas"), yet the agreement is
currently maintained by two hand-written copies of the same math rather than one function. The
exported copy is also untested, while `paperView` has thorough tests.

#### Proposed solution

Export a tiny helper from `paperView.ts` (already the pure-geometry home, `Size` type included):

```ts
export function containFit(
  content: Size,
  box: Size,
): { scale: number; offsetX: number; offsetY: number };
```

Use it in `computePaperView` (feeding the rotated dims) and in `drawOverlayContained`. Unit tests
come free with paperView's existing suite. Tradeoff: it's a three-line function — the win is the
single-source guarantee between on-screen and export placement, not the line count.

### [Maintainability] onSaveFolderCleared is a silent last-write-wins single-listener slot

**File(s):** `web/src/lib/drawing/folderSave.ts` (lines 42–49) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
let folderClearedListener: (() => void) | null = null;

export function onSaveFolderCleared(listener: () => void) {
  folderClearedListener = listener;
}
```

The API reads like a subscription (`on...`), but a second registration silently unhooks the first —
no error, no return of an unsubscribe. Today the sole subscriber is the settings mirror (per the
comment at lines 44–46), so it works; the trap is for the next feature that also wants to hear about
stale-folder clears (e.g. the "warn when save is blocked" issue \#199 direction) and quietly
disconnects the settings UI instead.

#### Proposed solution

Cheapest honest fix: rename to `setSaveFolderClearedListener` so the single-slot semantics are in
the name, and add a one-line comment stating single-subscriber-by-design. Alternatively hold a
`Set<() => void>` and return an unsubscribe — but that adds surface with no second production caller
today, which the no-speculative-surface rule counsels against. The rename is the right-sized change.

### [Readability] Dead truthiness check on getActiveCanvas's non-nullable return

**File(s):** `web/src/lib/drawing/screenshot.ts` (`playPolaroidAnimation`, lines 130–133) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const canvas = getActiveCanvas();
if (canvas && canvas.width > 0 && canvas.height > 0) {
```

`getActiveCanvas()` is declared to return `HTMLCanvasElement` (engine.ts line 1484), so the
`canvas &&` clause is statically dead — yet it survives because the engine's
`let canvas!: HTMLCanvasElement` (engine.ts line 113) is a definite-assignment assertion that is
genuinely `undefined` before engine init. The check documents distrust of a type the codebase
asserts. Since `playPolaroidAnimation` only runs after `exportCanvasBlob` returned a blob (which
requires an initialized canvas, engine.ts line 1477), the runtime risk is nil either way; the cost
is a reader stopping to work out which side is lying.

#### Proposed solution

Drop the truthiness clause (`if (canvas.width > 0 && canvas.height > 0)`), trusting the declared
type at this call site. The deeper fix — making `getActiveCanvas` honestly return
`HTMLCanvasElement | null` or documenting the boots-before-hydration guarantee at the `canvas!`
declaration — lives in `engine.ts` (another section) and is worth a cross-reference rather than
action here.

## Source: Code audit — AI image generation (client + state + UI)

### [Correctness] Client request timeout starts before the canvas export, eroding the deadline-ladder invariant

**File(s):** `web/src/lib/drawing/aiImage.ts` (`generateAiImage`, lines 204–215) @ 9ae62ff1;
invariant documented in `web/src/lib/ai/limits.ts` (lines 25–28)

**Priority:** P2

#### Problem

`limits.ts` documents the deadline ladder's invariant (lines 9–11, 25–28): the client aborts *just
past* the platform ceiling "so the server's controlled error always arrives first" —
`CLIENT_REQUEST_TIMEOUT_MS` (27 s) is sized to be 1 s past `NETLIFY_SYNC_TIMEOUT_MS` (26 s), and
`limits.test.ts` guards the ordering of the constants.

But `generateAiImage` starts the abort timer before any of the pre-request work runs:

```ts
const runId = startAiGeneration(blob ? URL.createObjectURL(blob) : null, controller);
const timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);

try {
  const exported = await exportUploadImage(blob, runId);
  ...
  const res = await fetch(endpoint, { ... signal: controller.signal });
```

(lines 211–224). The 27 s budget therefore also covers `exportCanvasBlob` plus the
`createImageBitmap` → canvas → `toBlob` WebP transcode in `encodeWebpUpload` (lines 30–53) — work
that can take a second or more on the low-end tablets this app targets — plus the upload transfer
time. The server's ~24 s (`GENERATE_DEADLINE_MS`) clock only starts once the request arrives. So
whenever export + encode + upload latency exceeds ~1 s of the built-in headroom, the client timer
fires *before* the server's controlled 502 arrives, and the child sees the generic client-side
`AI_TIMEOUT_MESSAGE` instead of the server's classified error — exactly the failure mode the ladder
exists to prevent. The 1 s margin the constants encode is silently consumed by unrelated local work.

#### Proposed solution

Start the timeout immediately before the `fetch` call:

```ts
const exported = await exportUploadImage(blob, runId);
if (!exported) return;
const timeoutId = setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
const res = await fetch(...);
```

(keep `clearTimeout(timeoutId)` in `finally`; initialize `timeoutId` to `undefined` so the `finally`
stays safe when the export bails early). Tradeoff: a canvas export that hangs forever would no
longer be caught by the 27 s timer and would leave the spinner up until the user closes the modal —
but the export is local, synchronous-ish work that has no realistic hang mode, and a rejected export
is already handled by the `catch`. Alternatively keep a separate, generous export bound if that risk
is deemed real. Extend `aiImage.test.ts` with a fake-timers test proving the timer does not run
during the export phase.

### [Performance] AiImagePrompt creates and manages an object URL for a preview that is never rendered

**File(s):** `web/src/lib/components/AiImagePrompt.svelte` (lines 11–32, 72),
`web/src/lib/components/aiPreview.ts` (`createAiPreviewLoader`, lines 1–23),
`web/src/lib/components/aiPreview.test.ts` @ 9ae62ff1

**Priority:** P2

#### Problem

`AiImagePrompt.svelte` holds `previewUrl` in `$state` (line 11), commits it from the loader (lines
14–20), revokes it in `cleanupPreview` (lines 27–32), and has a teardown `$effect` (line 37) whose
stated purpose is "so the preview's object URL doesn't outlive the component". But nothing in the
template ever *displays* `previewUrl` — its only read is as a readiness flag:

```svelte
disabled={!previewUrl}
```

(line 72). Git history confirms the URL was never rendered in this component. Meanwhile, when a
style is picked, `generateAiImage({ blob, style })` creates a *second* object URL for the very same
blob (`aiImage.ts` line 211) — that one is the URL actually shown blurred behind the dial.

So the whole URL half of this machinery is dead weight: `createAiPreviewLoader` exists largely to
race-guard the creation/revocation of a URL nothing uses (`aiPreview.ts` lines 12–16), and
`aiPreview.test.ts`'s single test verifies revocation of that unused URL. Every open of the style
picker allocates an object URL purely to throw it away.

#### Proposed solution

Drop the URL from the loader entirely. Make the loader commit the blob only:

```ts
export function createAiPreviewLoader(
  exportDrawing: () => Promise<Blob | null>,
  commit: (blob: Blob) => void,
);
```

In `AiImagePrompt.svelte`, promote `drawingBlob` to `$state<Blob | null>` (it must become reactive
since `disabled` will now derive from it), delete `previewUrl`, and simplify `cleanupPreview` to
`previewLoader.invalidate(); drawingBlob = null;`. The stale-load race guard (`activeLoadId`) is
still needed so a late export doesn't re-enable buttons after close — keep it and update
`aiPreview.test.ts` to assert `commit` is not called after `invalidate()` (no URL assertions). This
deletes the component's URL-lifecycle comment block (lines 34–37) and its `URL.revokeObjectURL`
bookkeeping.

### [Types] `applyResponse`'s string return forces the caller to re-narrow the response it already classified

**File(s):** `web/src/lib/drawing/aiImage.ts` (`applyResponse`, lines 170–196; caller lines 226–229)
@ 9ae62ff1

**Priority:** P3

#### Problem

`applyResponse` returns `'committed' | 'failed'`, where `'committed'` is only ever returned for
`response.kind === 'image'` (line 195). But the type system doesn't know that, so the caller must
re-check the discriminant to reach the blob:

```ts
const committed = applyResponse(runId, response) === 'committed';
if (committed && response.kind === 'image' && settings.autoSaveAiEnabled) {
  await autoSaveImages(response.blob, exported.preview, runId);
}
```

(lines 226–229). The `response.kind === 'image'` test is semantically redundant — `committed`
already implies it — but it can't be removed because `AiImageResponse` doesn't narrow through the
string result. A first-time reader has to work out whether the double condition encodes a real state
(a committed non-image?) or is just type appeasement.

#### Proposed solution

Make the return carry the proof, e.g.:

```ts
function applyResponse(runId: number, response: AiImageResponse): { committedBlob: Blob } | null;
```

returning `{ committedBlob: response.blob }` on commit and `null` on every failure path. The caller
becomes:

```ts
const committed = applyResponse(runId, response);
if (committed && settings.autoSaveAiEnabled) {
  await autoSaveImages(committed.committedBlob, exported.preview, runId);
}
```

One condition, no re-narrowing, and the invariant "committed ⇒ image" is now structural.

### [Maintainability] `!important` used to beat a sibling rule in AiImageResult, against the Svelte component rules

**File(s):** `web/src/lib/components/AiImageResult.svelte` (lines 328–333) @ 9ae62ff1

**Priority:** P3

#### Problem

`.claude/rules/svelte.md` states: "Never `!important` to beat a sibling rule — fix specificity or
ordering." `AiImageResult.svelte` does exactly that:

```css
.ai-result-error-sub {
  font-size: var(--font-size-md) !important;
  font-weight: 500 !important;
  ...
}
```

(lines 328–333). The `!important`s exist only to out-rank the sibling
`.ai-result-error p { font-size: var(--font-size-lg); font-weight: 600; }` block (lines 323–327),
which matches the same element with higher specificity (class + element vs. lone class).

#### Proposed solution

Raise the sub-line selector's specificity instead: `.ai-result-error p.ai-result-error-sub { ... }`,
or scope the general rule to exclude it (`.ai-result-error p:not(.ai-result-error-sub)`), or —
simplest — give the primary message its own class (`.ai-result-error-main`) so the two paragraphs
don't compete at all. Any of these deletes both `!important`s.

### [Maintainability] Active-run tracking is module-scope mutable state outside a factory; tests must resort to `vi.resetModules()`

**File(s):** `web/src/lib/state/aiGeneration.svelte.ts` (lines 10–11) @ 9ae62ff1; also
`web/src/lib/state/aiKey.svelte.ts` (lines 13–16), `web/src/lib/drawing/aiImage.test.ts` (line 43)

**Priority:** P3

#### Problem

CLAUDE.md: "Module-scope mutable `let` is either a pure memoization cache or lives behind a
`createX()` factory so tests get fresh instances." `aiGeneration.svelte.ts` keeps its run machine as
bare module lets:

```ts
let nextAiGenerationId = 0;
let activeAiGeneration: ActiveAiGeneration | null = null;
```

(lines 10–11). This is neither a memoization cache nor factory-wrapped. The cost shows up in
`aiImage.test.ts`, which must call `vi.resetModules()` in `beforeEach` (line 43) and
re-`await import(...)` every module in every test to get fresh run-tracking state — the exact
ceremony the factory convention exists to avoid. Notably, the same file already models the compliant
shape: `createDrawingDeduper()` in `aiImage.ts` (lines 60–72) was made constructible precisely "so
tests can exercise the dedupe in isolation instead of driving it end-to-end through a shared module
instance." `aiKey.svelte.ts` has the same pattern with `aiKeyWriteVersion`/`aiKeyWriteQueue` (lines
13–16), though its tests happen to survive without resets because each test awaits the queue to
quiescence.

#### Proposed solution

Extract a `createAiGenerationMachine(ui: UiState)` factory returning
`{ start, isActive, end, setPreview, finish, fail, close }`, instantiate the production singleton at
module scope, and re-export the existing named functions bound to it (keeping every call site
unchanged). Tests then construct fresh machines directly instead of `vi.resetModules()`. Tradeoff:
the singleton's `ui` binding still makes full `generateAiImage` integration tests need module resets
for `ui` itself — but the state-machine logic (ownership, URL swapping) becomes directly testable,
which is where the subtle bugs live (see the ownership comments at lines 52–58, 62–70).

### [Testing] No drift guard between `STYLE_SUFFIXES` and the style-thumbnail assets in `static/styles/`

**File(s):** `web/src/lib/ai/styles.ts` (`styleThumbPath`, lines 26–28) @ 9ae62ff1; assets in
`web/static/styles/`

**Priority:** P3

#### Problem

`styleThumbPath` derives a URL by convention:

```ts
export function styleThumbPath(style: StyleName): string {
  return `/styles/${style.toLowerCase()}.webp`;
}
```

The agreement between the `STYLE_SUFFIXES` keys and the files in `web/static/styles/` (currently
`cartoon.webp`, `clay.webp`, `crayon.webp`, `felt.webp`, `magical.webp`, `paper.webp`,
`sticker.webp`, `watercolor.webp`) is maintained by nothing. CLAUDE.md's convention: when agreeing
sites can't share code, "add a drift-guard test that reads both sides and fails on divergence." No
unit test or E2E asserts the thumbs resolve — `flows-ai.spec.ts` deliberately skips the style picker
(line 13), and no test references `styleThumbPath` or `static/styles`. Adding a style (open issue
#300 proposes "Realistic", #169 proposes custom styles) without dropping the matching webp would
ship a silently broken tile: the `<img>` has `alt=""` (`AiImagePrompt.svelte` lines 74–80), so the
404 renders as a blank square with no test or console signal.

#### Proposed solution

Add `web/src/lib/ai/styles.test.ts` (node environment) that iterates `STYLE_NAMES`, maps each
through `styleThumbPath`, and asserts the corresponding file exists under `web/static`
(`fs.existsSync(join(staticDir, 'styles',`${name.toLowerCase()}.webp`))`). Optionally assert the
reverse direction too (every `*.webp` in the directory except `source.svg` corresponds to a style)
to catch orphaned assets.

### [Maintainability] `startAiGeneration` and `closeAiResult` duplicate the six-field UI reset block

**File(s):** `web/src/lib/state/aiGeneration.svelte.ts` (`startAiGeneration`, lines 31–37;
`closeAiResult`, lines 82–89) @ 9ae62ff1

**Priority:** P3

#### Problem

The two lifecycle endpoints reset the same `ui` fields with slightly different orderings and values:

```ts
// startAiGeneration (31–37)
ui.aiPreviewUrl = swapObjectUrl(ui.aiPreviewUrl, previewUrl);
ui.aiResultUrl = swapObjectUrl(ui.aiResultUrl);
ui.aiError = false;
ui.aiErrorMessage = null;
ui.aiErrorKind = 'generic';
ui.aiGenerating = true;
ui.aiResultOpen = true;
```

```ts
// closeAiResult (83–89)
ui.aiResultOpen = false;
ui.aiGenerating = false;
ui.aiError = false;
ui.aiErrorMessage = null;
ui.aiErrorKind = 'generic';
ui.aiResultUrl = swapObjectUrl(ui.aiResultUrl);
ui.aiPreviewUrl = swapObjectUrl(ui.aiPreviewUrl);
```

Five of the seven assignments are shared. Adding a new AI-run UI field (e.g. the retry affordance
from issue #180, or `retryAfter` surfacing) requires remembering to touch both blocks; forgetting
one leaks stale error state into the next open or leaves state behind after close.

#### Proposed solution

Extract a named helper, e.g. `resetAiRunUi(previewUrl: string | null)` covering the error trio + URL
swaps, with `startAiGeneration` then setting `aiGenerating = true; aiResultOpen = true` and
`closeAiResult` setting both false. While in there, `swapObjectUrl`'s `return next ?? null`
(line 18) is redundant — `next` is already `string | null` with a `null` default — and can become
`return next`.

### [Docs] Stale "radio picker" comment in styles.ts — the picker has been buttons for a long time

**File(s):** `web/src/lib/ai/styles.ts` (lines 1–4) @ 9ae62ff1; actual UI in
`web/src/lib/components/AiImagePrompt.svelte` (lines 64–85)

**Priority:** P4

#### Problem

```ts
// Style options for AI image generation. The client renders the radio picker
// in the order these keys are defined, ...
```

The client renders a grid of `<button>` tiles (`AiImagePrompt.svelte` lines 67–83), not radios.
CLAUDE.md's comment rule bans restating mutable facts owned elsewhere — the comment names a UI
widget that no longer exists, which misleads anyone grepping for the "radio picker". Relatedly,
`AiImagePrompt` still wraps the buttons in `<fieldset>`/`<legend>` (lines 64–65), form-semantics
remnants of the radio era that now group plain buttons.

#### Proposed solution

Reword the comment to the stable fact: "The client renders the style picker in the order these keys
are defined". Optionally, in `AiImagePrompt.svelte`, replace the `fieldset`/`legend` with a `div` +
heading (or keep them deliberately with a role rationale) — the current markup implies a form
control group that isn't one.

### [Types] Style plumbing widens the closed `StyleName` union back to `string` mid-flight

**File(s):** `web/src/lib/drawing/aiImage.ts` (`buildRequest`, lines 151–154) and
`web/src/lib/ai/prompt.ts` (`buildPromptForStyle`, lines 7–10) @ 9ae62ff1

**Priority:** P4

#### Problem

CLAUDE.md: closed value sets are "threaded end to end — never bare `string`… plus a runtime
fallback." `generateAiImage` correctly accepts `style?: StyleName | ''` (line 201), but the very
next hop drops the union:

```ts
function buildRequest(
  uploadBlob: Blob,
  style: string,
): { endpoint: string; headers: Record<string, string>; body: Blob };
```

(lines 151–154). Similarly
`buildPromptForStyle(style: string | null, suffixes: Record<string, string>)` (`prompt.ts` lines
7–10) types both parameters loosely and re-derives membership at runtime via `Object.hasOwn` — on
the *server* that's a legitimate boundary (the style arrives as an unvalidated query param), but the
suffix map could still be typed as the concrete `STYLE_SUFFIXES` shape without breaking the
asset-gen import (the module stays dependency-free; a generic constraint is erased by
`--experimental-strip-types`).

#### Proposed solution

Type `buildRequest`'s `style` as `StyleName | ''` (zero-cost, one token). For `prompt.ts`, keep
`style: string | null` (genuine boundary input) but tighten the map:
`buildPromptForStyle<S extends Record<string, string>>(style: string | null, suffixes: S)` — or
simply accept `Readonly<Record<string, string>>` and leave a WHY comment that `style` is
deliberately unvalidated because the server treats an unknown style as "no suffix". The current code
half-implies that policy; the type should state it.

### [Correctness] Download filename hardcodes `.png` while the AI result can be WebP or JPEG

**File(s):** `web/src/lib/components/AiImageResult.svelte` (`handleDownload`, lines 62–69, filename
at line 64) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
triggerDownload(ui.aiResultUrl, `${AI_IMAGE_BASENAME}-${timestamp()}.png`);
```

The result blob's MIME type is whatever `/api/generate-image` relayed from the provider —
`geminiSafety.ts` (line 39) passes through `imagePart.inlineData.mimeType`, and `gemini.test.ts`
(lines 35–41) explicitly exercises an `image/webp` result. A WebP or JPEG payload downloaded as
`splotch-ai-….png` opens fine in most viewers (they sniff), but breaks tools that trust extensions
and mislabels the child's keepsake. The blob's type is known at commit time (`aiImage.ts` line 195
has the blob), but only the object URL string reaches `ui.aiResultUrl`, so the component has no way
to know the real type today.

#### Proposed solution

Smallest fix: track the result MIME alongside the URL (e.g. `ui.aiResultType`) set in
`finishAiGeneration`, and derive the extension via a tiny map (`image/png → png`,
`image/webp → webp`, `image/jpeg → jpg`, default `png`). Note the sibling gallery path
(`screenshot.ts` line 86, another section) has the same hardcoded `.png` — if this is fixed, fix
both through one shared `extensionForImageType()` helper so the two agree.

### [Readability] `aiKey.svelte.ts` carries the `.svelte.ts` suffix but contains no runes

**File(s):** `web/src/lib/state/aiKey.svelte.ts` (whole file) @ 9ae62ff1

**Priority:** P4

#### Problem

The `.svelte.ts` suffix signals "this module uses Svelte 5 runes and needs the Svelte compiler."
`aiKey.svelte.ts` declares no `$state`/`$derived`/`$effect` anywhere — it only *mutates* the
reactive `settings` object imported from `settings.svelte.ts`, which works from any plain module.
The suffix misleads a reader into hunting for reactive state that isn't there, and needlessly routes
the file through the Svelte compile step. The repo already has precedent for rune-free state modules
without the suffix: `web/src/lib/state/books.ts`.

#### Proposed solution

Rename to `web/src/lib/state/aiKey.ts` (and `aiKey.test.ts`), updating the two importers
(`lib/boot/persistedState.ts` line 1, `lib/components/parent/AiKeyManager.svelte` line 13). Gotcha:
verify no tooling globs on `state/*.svelte.ts` specifically (test config uses generic `*.test.ts`,
so this should be safe).

### [Testing] "Never mutates UI state" test is tautological and drags a reactive state module into a node-env pure test

**File(s):** `web/src/lib/drawing/aiImageResponse.test.ts` (lines 1–4, 48–60) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// @vitest-environment node
import { ui } from '$lib/state/ui.svelte';
...
it('never mutates UI state', async () => {
  const before = JSON.stringify(ui);
  ...
  expect(JSON.stringify(ui)).toBe(before);
});
```

`readAiImageResponse` (`aiImageResponse.ts`) does not import `ui` — or anything at all beyond the
`Response` it's handed. The test asserts a module cannot mutate state it has no reference to; it can
only fail if someone first adds a `ui` import to `aiImageResponse.ts`, at which point the *import
diff itself* is the reviewable signal. Meanwhile the test file pays a real cost for the assertion:
it pulls `$lib/state/ui.svelte` (and transitively `modal.svelte`'s rune state) into an otherwise
dependency-free `node`-environment spec, coupling a pure-parser test to the state layer. The testing
rules favor one behavior per test with the lowest-cost setup; this one covers a non-behavior.

#### Proposed solution

Delete the test and the `ui` import. If the intent was to document the design rule "response parsing
owns no UI transitions" (the split that `applyResponse` in `aiImage.ts` handles), state it in a
one-line comment atop `aiImageResponse.ts` instead — that's where a future contributor adding UI
writes would see it.

### [Readability] AiDial's hue sweep and exit transition are unnamed tuning literals

**File(s):** `web/src/lib/components/AiDial.svelte` (lines 79–82, 90) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// A friendly violet → blue → teal → green sweep as the dial fills.
const hueA = $derived(282 - 132 * progress);
const dialColor = $derived(`hsl(${hueA}, 82%, 62%)`);
const dialColor2 = $derived(`hsl(${hueA + 46}, 88%, 67%)`);
```

and in the template: `out:scale={{ duration: 480, start: 1.35, ... }}` (line 90). Per CLAUDE.md, "a
numeric literal that encodes a tunable decision — threshold, duration, … curve shaping — gets a
named module-scope constant with the unit in the name." `282`, `132`, `46`, `480`, and `1.35` are
all curve-shaping/duration knobs someone will want to retune (the file already names `ESTIMATE_MS`
for exactly this reason at line 17). The comment mitigates but doesn't name which literal is the
start hue vs. the sweep span vs. the second-stop offset.

#### Proposed solution

```ts
const HUE_START_DEG = 282; // violet
const HUE_SWEEP_DEG = 132; // → green at full
const HUE_SECOND_STOP_OFFSET_DEG = 46;
const DIAL_EXIT_MS = 480;
const DIAL_EXIT_START_SCALE = 1.35;
```

with the sweep comment moved onto the constants.

### [Maintainability] Dev-harness artifact filenames are duplicated boundary strings between the page and its endpoint

**File(s):** `web/src/routes/dev/ai-timer/+page.svelte` (lines 17–18) and
`web/src/routes/dev/ai-timer/artifacts/[name]/+server.ts` (lines 11–12) @ 9ae62ff1

**Priority:** P4

#### Problem

The page hardcodes:

```ts
const drawingInputUrl = '/dev/ai-timer/artifacts/drawing-input.jpeg';
const aiOutputUrl = '/dev/ai-timer/artifacts/ai-output.jpeg';
```

and the sibling endpoint independently hardcodes the allowlist:

```ts
const ALLOWED = new Set(['drawing-input.jpeg', 'ai-output.jpeg']);
```

CLAUDE.md: boundary strings are "declared once, imported everywhere (tests deliberately excepted)".
These two files must agree byte-for-byte or the dev page 404s its own artifacts; a rename of an
artifact under `tests/artifacts/` must be repeated in two more places. This is a dev-only surface,
so severity is low, but it's exactly the drift class the convention targets, and there's a natural
shared home.

#### Proposed solution

Add a small module beside the route (e.g. `web/src/routes/dev/ai-timer/artifactNames.ts`) exporting
`export const AI_TIMER_ARTIFACTS = ['drawing-input.jpeg', 'ai-output.jpeg'] as const;`. The endpoint
builds its `Set` from it; the page maps names to URLs. (`tests/ai-timer.spec.ts` may keep its own
literals per the tests exception.)

### [Maintainability] AiConfetti's fall keyframes are hardcoded to a ~540 px stage; leaves vanish mid-air on taller stages

**File(s):** `web/src/lib/components/AiConfetti.svelte` (`@keyframes leafFall`, lines 97–121) @
9ae62ff1

**Priority:** P4

#### Problem

The fall path is a fixed pixel ladder:

```css
0%   { transform: translateY(-40px) ... }
25%  { transform: translateY(110px) ... }
50%  { transform: translateY(260px) ... }
75%  { transform: translateY(410px) ... }
100% { transform: translateY(540px) ...; opacity: 0; }
```

The confetti layer is `inset: 0` of `.ai-stage`, whose height tracks the drawing's aspect and the
viewport (`stage-sizer` allows up to `calc(96vh - 70px)` — comfortably over 540 px on tablets in
portrait). On any stage taller than ~540 px, every leaf fades out partway down and the bottom of the
stage stays permanently empty; on a short stage the tail of the fall is clipped invisibly (fine).
The magic pixel ladder also violates the named-tuning-literal convention — the component
painstakingly names every other knob (`LEFT_SPAN`, `DURATION_MIN`, …, lines 19–28) but the fall
geometry is inline in CSS.

#### Proposed solution

Drive the fall distance from the stage: keyframes in percentages of a custom property, e.g.
`transform: translateY(calc(var(--fall-distance, 540px) * 0.25 - 40px))`-style stops, with
`--fall-distance` set to `100% of stage` via `AiImageResult` (it already passes
`--confetti-rx`/`--confetti-ry` down, lines 121). Simplest robust variant: keyframe the leaf from
`-40px` to `calc(var(--stage-h, 540px) + 40px)` with intermediate stops as fractions, where
`.ai-stage` sets `--stage-h` from a resize observer — or accept viewport-relative units (`vh`) as an
approximation with a comment. Whichever route, name the ladder's constants.

### [Performance] WebP transcode runs on the main thread with a DOM canvas; OffscreenCanvas would avoid dial jank

**File(s):** `web/src/lib/drawing/aiImage.ts` (`encodeWebpUpload`, lines 30–53) @ 9ae62ff1

**Priority:** P4

#### Problem

`encodeWebpUpload` decodes the full-resolution drawing PNG, creates a DOM `<canvas>`, draws into it,
and calls `canvas.toBlob` — all on the main thread, at the exact moment the progress-dial rAF loop
(`AiDial.svelte` `loop()`) and the modal's open animation are running. On a low-end tablet with a
large canvas, the synchronous `drawImage` + encoder work can produce a visible hitch in the dial
right after tap — the most scrutinized moment of the flow. `createImageBitmap` and `toBlob` are
async, but the raster copy and encode still contend with the animation frames.

#### Proposed solution

Prefer `OffscreenCanvas` + `convertToBlob({ type: 'image/webp', quality: UPLOAD_WEBP_QUALITY })`
when available (feature-detect; fall back to the current DOM-canvas path — the browser floor in
`docs/COMPATIBILITY.md` should be consulted before assuming availability). `convertToBlob` keeps the
encode off the layout-coupled canvas path, and the whole helper could later move into a worker if
profiling (`npm run perf:*`) shows the hitch is real — measure first; if the profile shows nothing
on floor devices, downgrade this to a comment.

### [Readability] Dead `.ai-prompt-close:disabled` styles — the close button is never disabled

**File(s):** `web/src/lib/components/AiImagePrompt.svelte` (lines 111–114) @ 9ae62ff1

**Priority:** P5

#### Problem

```css
.ai-prompt-close:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

The close button (lines 60–62) never receives a `disabled` attribute — only the style-option buttons
do (`disabled={!previewUrl}`, line 72), and those have their own `:disabled` rule (lines 192–195).
This selector can never match; it's residue from an earlier design where closing was blocked during
load.

#### Proposed solution

Delete the rule.

### [Readability] Dead `typeof window` guard inside a `$effect`

**File(s):** `web/src/lib/components/AiImageResult.svelte` (lines 26–32, guard at line 28) @
9ae62ff1

**Priority:** P5

#### Problem

```ts
$effect(() => {
  if (ui.aiResultOpen && ui.aiGenerating) {
    if (typeof window !== 'undefined' && window.innerHeight > 0) {
```

`$effect` bodies never run during SSR (the repo's own svelte rules lean on exactly this for
teardown), so `typeof window !== 'undefined'` is unreachable-false — dead defensive code that
implies an SSR hazard that doesn't exist and invites cargo-culting into other effects.

#### Proposed solution

Reduce the guard to `if (window.innerHeight > 0)`.

### [Readability] `REVEAL_EPSILON` names a threshold, not an epsilon

**File(s):** `web/src/lib/components/aiDialProgress.ts` (lines 14–15, use at line 52) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
// Snap progress to 1 once it climbs within this of full.
const REVEAL_EPSILON = 0.999;
...
if (progress >= REVEAL_EPSILON) {
```

The comment says "within this of full", which describes an epsilon of `0.001`; the constant actually
holds the absolute snap threshold `0.999`. Name and comment disagree with the value's semantics — a
tuner "tightening the epsilon" would move the number the wrong way.

#### Proposed solution

Rename to `REVEAL_SNAP_THRESHOLD` (comment: "snap to 1 once progress crosses this"), or keep the
epsilon framing with `const REVEAL_EPSILON = 0.001;` and `progress >= 1 - REVEAL_EPSILON`.

### [Maintainability] Deliberately untracked component `let`s lack the required one-line comment

**File(s):** `web/src/lib/components/AiDial.svelte` (line 20),
`web/src/routes/dev/ai-timer/+page.svelte` (line 27) @ 9ae62ff1

**Priority:** P5

#### Problem

`.claude/rules/svelte.md`: "a deliberately non-reactive `let` (timer handles, transition-time
latches) carries a one-line comment saying it's intentionally untracked." `AiDial.svelte` declares
`let rafId = 0;` (line 20) with no comment; the ai-timer page declares `let runId = 0;` (line 27)
likewise (its sibling `pending` on line 26 *does* carry the comment, highlighting the omission).
Both are legitimate untracked handles — they just don't say so, leaving a reviewer to wonder whether
`$state` was forgotten.

#### Proposed solution

Add the one-liners, e.g. `let rafId = 0; // rAF handle — intentionally untracked` and
`let runId = 0; // aiGeneration run id — intentionally untracked`.

### [Testing] `deferred<T>()` helper is re-declared per test file

**File(s):** `web/src/lib/drawing/aiImage.test.ts` (lines 22–36),
`web/src/lib/components/aiPreview.test.ts` (lines 5–11) @ 9ae62ff1

**Priority:** P5

#### Problem

Both files (and, outside this section, `pwa/updates.test.ts`, `drawing/undoHistory.test.ts`,
`state/install.svelte.test.ts` — five in total) hand-roll the identical
promise-with-exposed-resolvers helper. The testing rule that "a page-driving helper needed by a
second spec moves to the shared helpers module at that moment" is written for Playwright, but the
same duplication cost applies here: five drifting copies of the same fixture (some with `reject`,
some without).

#### Proposed solution

Add a shared test util (e.g. `web/src/lib/testUtils/deferred.ts`, or adopt the platform's
`Promise.withResolvers()` if the toolchain's TS lib target includes it — it's Baseline 2024, and
Vitest's runtime certainly has it) and migrate the five call sites. Low urgency; do it
opportunistically when next touching these specs.

### [Readability] `generateAiImage`'s `blob` option and `exportUploadImage`'s `blob` parameter under-describe what they carry

**File(s):** `web/src/lib/drawing/aiImage.ts` (`generateAiImage`, lines 198–201;
`exportUploadImage`, lines 121–126) @ 9ae62ff1

**Priority:** P5

#### Problem

The public entry point reads:

```ts
export async function generateAiImage({
  blob = null,
  style = '',
}: { blob?: Blob | null; style?: StyleName | '' } = {});
```

`blob` is specifically *the already-exported drawing handed over by the style picker* (vs. `null`
meaning "export the canvas yourself") — a meaning only recoverable from the comment at lines 205–210
and from reading `AiImagePrompt.svelte`. Inside, `exportUploadImage(blob, runId)` reuses the same
bare name, and `if (!blob) setAiPreview(...)` (line 132) makes the branch's intent opaque.
Everywhere else the module names blobs by role (`aiBlob`, `drawingBlob`, `uploadBlob`, `imageBlob`).

#### Proposed solution

Rename the option to `drawing` (or `drawingBlob`) at both signatures:
`generateAiImage({ drawing = null, style = '' }: { drawing?: Blob | null; ... })`. Two call sites
change (`AiImagePrompt.svelte` line 45 becomes `generateAiImage({ drawing: blob, style })`;
`ActionsPanel.svelte` line 247 passes nothing).

## Source: Code audit — Parent Center / settings UI

### [Maintainability] Three hand-rolled copies of the iOS-style segmented control — extract a design primitive

**File(s):** `web/src/lib/components/parent/AppearanceSection.svelte` (`.theme-picker`, lines 33–47
markup, 89–135 styles), `web/src/lib/components/parent/CompactShell.svelte` (`.orient-seg`, lines
97–111 markup, 169–219 styles), `web/src/lib/components/parent/ReportForm.svelte` (`.report-kind`,
lines 115–128 markup, 235–270 styles) @ 9ae62ff1

**Priority:** P2

#### Problem

The same segmented-control widget is implemented three times inside this one section, and two of the
copies openly admit it in comments:

* `AppearanceSection.svelte:89`:
  `/* iOS-style segmented control: the active segment reads as a raised card. */`
* `CompactShell.svelte:169`:
  `/* iOS-style segmented control, matching the Theme picker in AppearanceSection. … */`
* `ReportForm.svelte:235`:
  `/* Bug / feature segmented control — mirrors the Appearance theme picker. */`

Each copy re-declares the flex row + `--slider-track` well + padded segments + active raised card +
hover rules, but they have already drifted: the theme picker uses `border-radius: var(--radius-md)`
outer / `9px` inner with `--shadow-segment`; CompactShell uses `10px` outer / `var(--radius-sm)`
inner, `12.5px` font, and `touch-action: manipulation`; ReportForm uses a bordered `--surface` well,
`10px`/`7px` radii, **no** `--shadow-segment` on the active segment, and a filled `--brand` active
state instead of the raised-card look. The accessibility patterns diverge too: two are
`role="radiogroup"`/`role="radio"`+`aria-checked`, one is `role="group"`+`aria-pressed`.
"Matching"/"mirrors" comments are cross-file agreement by prose — exactly what CLAUDE.md calls a
defect, and the drift shows the prose isn't holding.

The design-system tree (`web/src/lib/components/design/`) already exists for this (Button,
Disclosure, StatusMessage), and `web/src/lib/design/tokens.ts:108` even documents `--shadow-segment`
as "the tight lift on the selected segment of a segmented toggle (theme, …)" — the vocabulary
anticipates a shared primitive that never got built.

#### Proposed solution

Add `web/src/lib/components/design/SegmentedControl.svelte`, generic over the option value:

```svelte
<script lang="ts" generics="T extends string">
  interface Option { value: T; label: string; icon?: CommonIconName; id?: string }
  interface Props {
    options: Option[];
    selected: T | null;          // null = nothing active (CompactShell's unlocked state)
    onSelect: (value: T) => void;
    ariaLabel: string;
  }
</script>
```

The primitive owns the well, segment chrome, active state, and the radiogroup/radio ARIA wiring;
call sites keep sizing tweaks via a forwarded `class`, the established Disclosure pattern.
CompactShell's "tap the active side to release" behavior stays in its `onSelect` handler.
ReportForm's filled-brand active style can either adopt the raised-card look (visual consistency
win) or pass a variant — decide with the `design` skill open. Note the a11y wrinkle:
`selected: null` with `role="radio"` is legal (no radio checked), so CompactShell's `aria-pressed`
variant can be dropped.

### [Types] Section→content mapping is an unchecked if/else chain — a new `SectionId` silently renders nothing

**File(s):** `web/src/lib/components/ParentCenter.svelte` (`sectionContent` snippet, lines 88–108;
`activeMeta`, line 44), `web/src/lib/components/parent/sections.ts` (`SectionId`, lines 18–27;
`SECTIONS`, lines 29–39) @ 9ae62ff1

**Priority:** P2

#### Problem

Three artifacts must agree for a section to work, and only one of them is compiler-checked:

1. The `SectionId` union (`sections.ts:18–27`) — hand-written.
2. The `SECTIONS` array (`sections.ts:29–39`) — each entry's `id` is checked *against* the union,
   but nothing guarantees every union member appears (or appears once). Removing an entry while
   forgetting the union member compiles clean.
3. The `sectionContent` snippet in `ParentCenter.svelte:88–108` — a 9-branch `{#if}/{:else if}`
   chain with no final `{:else}` and no exhaustiveness: add a tenth `SectionId`, register it in
   `SECTIONS`, and the hub row/nav item appears but drilling in renders an empty pane.
   `sectionSubtitle`'s `switch` (`sections.ts:50–83`) is the only exhaustiveness-checked consumer
   (via the `string` return type with no default).

The `?? SECTIONS[0]` fallback on line 44
(`SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]`) exists only because the array lookup
isn't total — dead code under a closed mapping, and a `find` scan per render besides.

CLAUDE.md's convention is explicit: "Close finite value sets in the type … constant maps are
`Record<UnionType, V>` (or `satisfies`), not `Record<string, V>`."

#### Proposed solution

Two steps:

1. In `sections.ts`, derive the union from the data instead of maintaining it by hand:

```ts
export const SECTIONS = [
  { id: 'appearance', label: 'Appearance & Display', icon: 'theme-auto' },
  // …
] as const satisfies readonly { id: string; label: string; title?: string; icon: IconName }[];
export type SectionId = (typeof SECTIONS)[number]['id'];
```

Duplicates and drift become impossible; `SectionMeta` becomes `(typeof SECTIONS)[number]`.

2. In `ParentCenter.svelte`, replace the chain with a closed component map (Svelte 5 components are
   values):

```ts
const SECTION_CONTENT: Record<SectionId, Component<{ open?: boolean }>> = {
  appearance: AppearanceSection,
  sound: SoundSection, /* … */
};
```

then `{@const Section = SECTION_CONTENT[id]}<Section open={parentCenter.open} />`. Wrinkle: only
`AiKeyManager`, `SetupInstructions`, and `ReportForm` accept `open` today; passing it to all nine
either means adding an unused prop (violates no-speculative-surface) or typing the map as
`Component<{ open?: boolean }>` and letting Svelte ignore the extra prop for the others — the latter
is fine, but say so at the map. `activeMeta` similarly becomes a `Record<SectionId, SectionMeta>`
lookup (or keep `find` and drop the now-provably-dead `??` fallback).

### [Maintainability] ReportForm's 4000-char limit and `hp` honeypot field duplicate the server's contract as bare literals

**File(s):** `web/src/lib/components/parent/ReportForm.svelte` (line 137 `maxlength={4000}`, line 83
`hp: honeypot`), `web/src/routes/api/report/+server.ts` (line 10 `MAX_MESSAGE_LENGTH = 4000`, line
68 `body?.hp`) @ 9ae62ff1

**Priority:** P3

#### Problem

The client textarea caps input at a literal `4000`:

```svelte
<textarea id="reportMessage" class="report-textarea" rows="4" maxlength={4000} …>
```

while the server independently declares `const MAX_MESSAGE_LENGTH = 4000;` and truncates at it
(`+server.ts:82`). If the server limit changes, the client cap silently disagrees — either users hit
an invisible wall short of the real limit, or their text gets truncated server-side after the UI
accepted it. Same story for the honeypot field name: the string `hp` is typed independently on both
sides of the wire. CLAUDE.md is categorical: values that must agree cross-file come from one
exported constant, and boundary strings are "declared once, imported everywhere."

Server route modules can't be imported client-side, but the constant doesn't have to live in the
route — the repo already keeps shared wire contracts in `$lib` (e.g. `$lib/inviteLink`'s
`AI_ACCESS_TOKEN_PARAM`, imported by `settings.svelte.ts:13`).

#### Proposed solution

Add a small shared module, e.g. `web/src/lib/reportContract.ts`:

```ts
export const REPORT_MESSAGE_MAX_LENGTH = 4000;
export const REPORT_HONEYPOT_FIELD = 'hp';
```

Import it from both `ReportForm.svelte` and `routes/api/report/+server.ts` (the route already
imports other `$lib` modules, so there's no layering issue — it's an isomorphic constants file, not
client code in the server). The `hp` key in the JSON body becomes
`[REPORT_HONEYPOT_FIELD]: honeypot` client-side and `body?.[REPORT_HONEYPOT_FIELD]` server-side.

### [Maintainability] ReportForm's inline `slide` durations are unnamed tuning literals that bypass the section-wide `SECTION_SLIDE` convention

**File(s):** `web/src/lib/components/parent/ReportForm.svelte` (lines 149, 158),
`web/src/lib/components/parent/sections.ts` (`SECTION_SLIDE`, lines 41–44) @ 9ae62ff1

**Priority:** P3

#### Problem

`sections.ts` establishes exactly one reveal timing for conditional blocks in this section, with a
comment explaining why it's a JS constant:

```ts
// Reveal timing shared by every conditional settings block inside a section.
export const SECTION_SLIDE = { duration: 220 };
```

Every other conditional block in the section uses it (AppearanceSection, SoundSection,
ControlsSection ×3, AiFeatureToggles ×2). ReportForm alone hand-rolls two different anonymous
durations:

```svelte
<div class="report-device" transition:slide={{ duration: 180 }}>
…
<div transition:slide={{ duration: 160 }}>
```

That's a double convention miss: the "every conditional settings block" claim in the `SECTION_SLIDE`
comment is now false, and `180`/`160` are unnamed tuning literals (CLAUDE.md: "Tuning literals get
names… the WHY comment lives on the constant"). There is no visible reason these two reveals need to
be 40–60ms faster than every sibling.

#### Proposed solution

Use `SECTION_SLIDE` for both. If the slightly snappier feel inside the nested disclosure is
deliberate, name it in `sections.ts` beside `SECTION_SLIDE` (e.g.
`NESTED_SLIDE = { duration: 160 }`) with a WHY comment, and update `SECTION_SLIDE`'s "every
conditional settings block" comment to describe the two-tier scheme.

### [Maintainability] ToggleRow's icon-column indent is duplicated into SliderRow and kept in sync by prose

**File(s):** `web/src/lib/components/parent/ToggleRow.svelte` (`.setting-help`, lines 50–57;
`.setting-icon`/`.setting-info`, lines 59–70), `web/src/lib/components/parent/SliderRow.svelte`
(`.slider-row.indented`, lines 55–61) @ 9ae62ff1

**Priority:** P3

#### Problem

ToggleRow indents its help line past the icon column:

```css
/* Indented past the icon column so the help line starts under the label:
   .setting-icon's width + .setting-info's gap, both declared below. */
.setting-help { margin: 6px 0 0 calc(20px + 10px); … }
```

SliderRow re-derives the same `calc(20px + 10px)` and documents the coupling instead of fixing it:

```css
/* … Mirrors ToggleRow's .setting-icon width + .setting-info gap; there's no
   shared token for that pairing. */
.slider-row.indented { margin-left: calc(20px + 10px); }
```

CLAUDE.md: "Cross-file agreement is never maintained by prose … A 'keep in sync with X' comment
marks a defect, not a mitigation." Change ToggleRow's icon size or gap and SliderRow's sub-setting
alignment silently drifts — the exact failure mode the rule exists for. The comment even
acknowledges the missing token.

#### Proposed solution

Since scoped `<style>` blocks can't import TS constants, use the CSS-native sharing mechanism:
declare the pairing once as custom properties in `tokens.css` (or on `.parent-help-content` in
`ParentCenter.svelte`, whose `:global(.setting)` rules already act as the shared setting-card token
block, lines 489–508):

```css
--setting-icon-size: 20px;
--setting-icon-gap: 10px;
--setting-indent: calc(var(--setting-icon-size) + var(--setting-icon-gap));
```

Both components then consume `var(--setting-indent)`, and ToggleRow's
`.setting-icon`/`.setting-info` use the two base properties. The prose comments go away.

### [Maintainability] Close-button clearance is hardcoded at four sites against geometry owned by `app.css`, with a comment restating the numbers

**File(s):** `web/src/lib/components/ParentCenter.svelte` (`.pc-header` `padding-right: 68px`, line
266; media-query `padding-right: 64px`, line 513),
`web/src/lib/components/parent/CompactShell.svelte` (`.pc-header-compact` `padding-right: 64px` and
`min-height: 62px`, lines 129–142), `web/src/app.css` (`.modal-close-btn`, lines 146–151) @ 9ae62ff1

**Priority:** P3

#### Problem

The modal close button's geometry — `top: var(--space-3)` (12px), `width/height: 44px` — is owned by
`.modal-close-btn` in `app.css`. Four rules in this section hardcode clearances derived from it, and
CompactShell's comment restates the owned values verbatim:

```css
/* Reserve the close button's full vertical extent (top:12 + 44px height =
   56px, plus a little breathing room) so the top-right toggle cell starts
   below it instead of sliding up under the button. … */
min-height: 62px;
```

CLAUDE.md forbids exactly this: comments must not restate values "owned elsewhere — name the owning
identifier or file instead", and cross-file numeric agreement should flow through one declared
value. If the touch target ever grows (it's sized for "small fingers" per the app.css comment, a
plausible knob), the header paddings and CompactShell's `min-height` all silently stop clearing it.

#### Proposed solution

Beside `.modal-close-btn` in `app.css`, declare the derived clearances as custom properties on
`:root` (or on `.modal-shell`):

```css
--modal-close-size: 44px;
--modal-close-inset: var(--space-3);
--modal-close-clearance-x: calc(var(--modal-close-inset) + var(--modal-close-size) + var(--space-2));
--modal-close-clearance-y: calc(var(--modal-close-inset) + var(--modal-close-size) + 6px);
```

`.modal-close-btn` consumes `--modal-close-size`/`--modal-close-inset`; the ParentCenter headers and
CompactShell consume the clearance values. The 68px/64px variance between breakpoints suggests the
horizontal clearance can collapse to one value once it's computed instead of eyeballed — verify
visually at both widths (the `run-splotch` skill covers screenshots).

### [Readability] `submitKey` is a 52-line four-outcome state machine — extract the persist step and name the phases

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte` (`submitKey`, lines 72–124) @
9ae62ff1

**Priority:** P3

#### Problem

`submitKey` interleaves five concerns in one function body: input gating, latest-request
bookkeeping, network verification, credential persistence (with its own inner `try/catch` and
kind-dependent branching), and four different terminal UI states — verify-failed (86–91),
persist-failed (99–107), superseded (81, 100, 109), and success (111–117). The staleness guard
`latest.isCurrent(id)` appears four times at different depths, and the inner `try/catch` around
persistence (93–108) nests a kind-ternary inside a guard inside a catch. A first-time reader has to
simulate the whole flow to answer "what happens if the save fails after a successful verify?".

Per the audit brief, a long function splittable into named helpers that explain the steps is itself
a finding; the numbered-steps rule in CLAUDE.md ("write it that way the first time") points the same
direction.

#### Proposed solution

Extract the persistence phase, which is the self-contained chunk with a clean boundary:

```ts
// throws on persist failure; returns false when superseded
async function persistCredential(
  result: VerifyCredentialResult,
  value: string,
  id: number,
): Promise<boolean>;
```

and hoist the four user-facing message pairs into a small `const` map (e.g.
`KEY_MESSAGES: Record<'invalid' | 'saveFailed' | 'accepted', Record<CredentialKind, string>>`),
which also removes the string-building ternaries from the control flow. `submitKey` then reads as:
gate → verify → persist → celebrate, each ≤6 lines. Keep `latest` handling in `submitKey` itself so
the supersede semantics stay in one place.

### [Readability] AiKeyManager's open-effect calls `latest.begin()` for its side effect only, behind a pointless alias

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte` (`$effect`, lines 62–70) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
$effect(() => {
  const isOpen = open;
  latest.begin();
  if (isOpen) {
    platform = getPlatform();
    keyInput = '';
    resetKeyFeedback();
  }
});
```

Two readability problems. First, `latest.begin()` is called with its return value (`{ id, signal }`)
discarded — the *actual* intent is "abort any in-flight verify whenever the modal opens or closes,
and invalidate its `isCurrent` token", but nothing says so; `begin` reads like the start of a
request, so a discarded `begin()` looks like a half-finished refactor or a bug. Second,
`const isOpen = open` exists (presumably) to establish the reactive read before the early-branch,
but `open` is read in the `if` anyway, so the alias adds nothing — the untracked-reads subtlety it
hints at doesn't apply here.

Compare `ReportForm.svelte:50–52`, which handles the same prop with a bare `if (open) reset();` and
no abort — the asymmetry (does ReportForm leak an in-flight submit across close? it deliberately
doesn't abort, or it was missed?) is unanswerable from the code.

#### Proposed solution

Give the abort a name on the `LatestRequest` interface — e.g. add `cancel(): void` to
`web/src/lib/latestRequest.ts` (aborts the controller and bumps the counter, same as `begin` minus
the handout) — and write the effect as:

```ts
$effect(() => {
  latest.cancel(); // opening or closing obsoletes any in-flight verify
  if (open) {
    platform = getPlatform();
    keyInput = '';
    resetKeyFeedback();
  }
});
```

Then decide whether `ReportForm` should do the same on close (it probably should — a success message
from a submit that finished after close would greet the next open, except `reset()` on open happens
to clear it; a one-line comment either way).

### [Maintainability] AiKeyManager and ReportForm hand-roll the same async-submit status machine, including identical error copy

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte` (lines 31–32, 57–60, 118–123,
239–241), `web/src/lib/components/parent/ReportForm.svelte` (lines 30–31, 34, 99–103, 200–209) @
9ae62ff1

**Priority:** P4

#### Problem

Both components independently implement: a status union (`'idle' | 'checking' | 'error' | 'success'`
vs `'idle' | 'submitting' | 'success' | 'error'` — same shape, different busy-word), a message
string, a `createLatestRequest()` guard, a network-failure catch that checks `latest.isCurrent(id)`
and sets the **byte-identical** message
`'Could not reach the server. Check your connection and try again.'` (AiKeyManager:121,
ReportForm:102), and a `<StatusMessage status={x === 'error' ? 'error' : 'success'}>` render. The
duplicated copy string alone means a wording fix will miss one of the two.

This stops short of a full extraction mandate — the two flows differ enough (verify-then-persist vs
single POST) that a heavy abstraction would obscure them — but the shared vocabulary should be
shared.

#### Proposed solution

Minimum: hoist the shared copy to one exported constant (e.g. `NETWORK_ERROR_MESSAGE` in
`web/src/lib/latestRequest.ts` or a small `$lib/submitCopy.ts`) and unify the status union name
(`type SubmitStatus = 'idle' | 'busy' | 'success' | 'error'`, exported once). Optional next step if
a third form ever appears: a `createSubmitState()` rune factory owning `status` + `message` + the
latest-request guard, with the fetch itself staying in the component. Don't build that third-caller
abstraction speculatively — the constant + type is the right size today.

### [Correctness] CompactShell's Night Mode toggle silently discards a parent's `system` theme preference

**File(s):** `web/src/lib/components/parent/CompactShell.svelte` (Night Mode `ToggleRow`, lines
73–81) @ 9ae62ff1

**Priority:** P4

#### Problem

```svelte
<ToggleRow
  icon={resolvedTheme() === 'dark' ? 'theme-dark' : 'theme-light'}
  label="Night Mode"
  checked={resolvedTheme() === 'dark'}
  onToggle={(next) => setTheme(next ? 'dark' : 'light')}
/>
```

A parent whose theme is `system` (the default follow-the-OS mode, one of three explicit choices in
AppearanceSection) who taps this toggle — even toggling it off again immediately — has their
preference rewritten to a pinned `'dark'` or `'light'`. Nothing restores `system`; the only way back
is finding the three-way picker in the full portrait settings. Every other CompactShell cell
round-trips losslessly to its full-settings counterpart (sound, advanced controls, orientation
lock), so this one silently destroying state is surprising. The file's other subtle behaviors (the
orientation release-on-retap, lines 46–55) get thorough WHY comments; this tradeoff gets none, so it
reads as an oversight rather than a decision.

#### Proposed solution

Cheapest correct option: when the requested resolved theme equals what `system` would currently
resolve to, set `'system'` instead of pinning:

```ts
onToggle={(next) => {
  const wanted: ResolvedTheme = next ? 'dark' : 'light';
  setTheme(resolveTheme('system', appearanceSystemDark()) === wanted ? 'system' : wanted);
}}
```

(needs a small exported read of the OS preference from `appearance.svelte.ts`, or a
`setResolvedTheme(wanted)` helper there). If pinning is actually the intended semantic for a "quick
toggle", keep the code and add the WHY comment — but the asymmetric data loss deserves one or the
other.

### [Readability] `keyStorageNote`'s nested ternary should be a `Record<Platform, string>` per the closed-union convention

**File(s):** `web/src/lib/components/parent/AiKeyManager.svelte` (lines 48–55) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
let keyStorageNote = $derived(
  platform === 'ios'
    ? "Your key is saved in this device's iOS Keychain — encrypted by the system and kept only on this device"
    : platform === 'android'
    ? "Your key is saved in this device's Android Keystore — encrypted by the system and kept only on this device."
    : 'Your key is encrypted and stored only in this browser on this device.',
);
```

`Platform` is a closed literal union (`'android' | 'ios' | 'web'`, `platform.ts:69`). CLAUDE.md:
"constant maps are `Record<UnionType, V>` … not bare string plus a runtime fallback" — and a nested
ternary over a union is the fallback-shaped version of that. A `Record` also gets exhaustiveness for
free (adding a platform breaks the build here instead of silently landing in the web copy).
Incidentally, the iOS string is missing its trailing period while the other two have one — the kind
of asymmetry a table layout makes visible.

The codebase already does this correctly for the same union:
`PLATFORM_LABEL: Record<Platform, string>` in `deviceInfo.ts:7`.

#### Proposed solution

```ts
const KEY_STORAGE_NOTE: Record<Platform, string> = {
  ios:
    "Your key is saved in this device's iOS Keychain — encrypted by the system and kept only on this device.",
  android:
    "Your key is saved in this device's Android Keystore — encrypted by the system and kept only on this device.",
  web: 'Your key is encrypted and stored only in this browser on this device.',
};
let keyStorageNote = $derived(KEY_STORAGE_NOTE[platform]);
```

### [Maintainability] Off-scale hardcoded font sizes where the token scale is the convention

**File(s):** `web/src/lib/components/ParentCenter.svelte` (lines 271 `24px`, 277 `20px`, 441
`15px`), `web/src/lib/components/parent/CompactShell.svelte` (line 193 `12.5px`),
`web/src/lib/components/parent/SetupInstructions.svelte` (lines 239 `24px`, 280 `20px`) @ 9ae62ff1

**Priority:** P4

#### Problem

`tokens.css:37–43` defines a seven-step type scale (`--font-size-xs` 12px … `--font-size-3xl` 28px)
and these same files use it dozens of times — then break out into raw pixels in six places: the
ParentCenter `h2` at `24px` and `20px`, the sidebar nav item at `15px`, CompactShell's segment label
at `12.5px`, and SetupInstructions' chevron at `24px` / check at `20px`. Three of these (`15px`,
`12.5px`, `24px`) don't even exist on the scale, so they can't be a token-name-forgotten slip —
they're ad-hoc sizes that silently fork the type ramp. The `design` skill owns this vocabulary
("read before … picking a color/size"), and a mixed file (tokens on line 388, raw px on line 441 of
the same component) is the worst of both: a reader can't tell which sizes are decisions and which
are drift.

#### Proposed solution

Audit each against the scale with the `design` skill open: `20px` and `24px` headings likely become
`--font-size-2xl` (22px) or justify a new heading token; `15px` nav items are a hair off
`--font-size-lg`/`md` and almost certainly round to one; `12.5px` rounds to `--font-size-sm` (13px)
or `--font-size-xs` (12px) — CompactShell is space-constrained, so verify in the landscape-phone
viewport. Any size that genuinely must stay off-scale gets a local named custom property with a WHY
comment (the `--drawer-transition` pattern from the svelte rules). Same treatment for the
`install-check`'s `font-size: 20px`.

### [Maintainability] ParentHelpButton hardcodes `color: #999` instead of a theme token

**File(s):** `web/src/lib/components/ParentHelpButton.svelte` (line 28) @ 9ae62ff1

**Priority:** P4

#### Problem

```css
.parent-help-button {
  position: fixed;
  bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
  right: calc(var(--space-2) + env(safe-area-inset-right));
  color: #999;
  z-index: var(--z-corner-button);
}
```

Every other declaration in the rule uses tokens; the `color` is a raw hex. `app.css:196–199`
describes the shared corner-button chrome ("gray icon tint … steps up idle → hover → pressed") that
this component participates in, and the theme system has muted-gray tokens (`--text-muted`,
`--icon-muted` — the latter is what the sibling modal-close icon uses at `app.css:181`). A literal
`#999` is invisible to theme switches: whatever dark-mode treatment the token family gets, this
button keeps its light-mode gray.

#### Proposed solution

Replace with the token that matches the corner-button family's intent — check with the `design`
skill whether `.corner-button` chrome expects `currentColor` fed by `--icon-muted` or
`--text-muted`, and whether `FullscreenToggle.svelte` (the other corner button) has the same
literal; if it does, fix both and consider moving the color into the shared `.corner-button` rule in
`app.css` so the family can't diverge.

### [Maintainability] SoundSection's non-reactive `previewingVolume` latch lacks the required "intentionally untracked" comment

**File(s):** `web/src/lib/components/parent/SoundSection.svelte` (line 15) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const PREVIEW_SPEED = 0.45;
let previewingVolume = false;
```

`.claude/rules/svelte.md`: "Mutable component-level state defaults to `$state`; a deliberately
non-reactive `let` (timer handles, transition-time latches) carries a one-line comment saying it's
intentionally untracked." `previewingVolume` is mutated in `onVolumeActive` (line 25) and read in
`previewVolume` (line 20), never in the template — a legitimate untracked latch, but the mandatory
comment is missing, so the next reader (or reviewer) must re-derive whether the missing `$state` is
a bug. The nearby comment (lines 17–18) explains the *feature*, not the tracking choice.

#### Proposed solution

One line:

```ts
// Intentionally untracked: only read inside event handlers, never rendered.
let previewingVolume = false;
```

### [Readability] ReportForm's submit-time device fallback duplicates the effect's collection and can send data the preview never showed

**File(s):** `web/src/lib/components/parent/ReportForm.svelte` (collection `$effect`, lines 56–62;
`submit`, line 81) @ 9ae62ff1

**Priority:** P4

#### Problem

Device info is collected in two places. The effect populates `device` when the parent opts in (so
"the preview below reflects exactly what will be sent", per its comment):

```ts
$effect(() => {
  if (includeDevice && kind === 'bug' && !device) {
    collectDeviceInfo().then((info) => (device = info)).catch(() => {});
  }
});
```

and `submit` has an inline fallback re-collection:

```ts
device: attachDevice ? (device ?? (await collectDeviceInfo())) : undefined,
```

Problems: (a) the fallback races the effect — check the box and tap Send before collection resolves
(native path awaits a Capacitor plugin) and a *second* collection runs, its result is sent but never
stored into `device`, so the payload was sent while the preview still said "Gathering device info…"
— quietly contradicting the effect's stated exactly-what-you-saw guarantee; (b) if this fallback
ever rejects, the outer catch reports "Could not reach the server" — wrong diagnosis (the effect's
`.catch(() => {})` acknowledges collection can fail); (c) the duplication itself: one collection
concern, two call sites with different error handling.

#### Proposed solution

Make the collection single-path: extract
`async function ensureDeviceInfo(): Promise<DeviceInfo | undefined>` that memoizes into `device`
(and catches, returning `undefined`), call it from both the effect and `submit`. Then `submit` sends
exactly the state the preview renders, a collection failure degrades to "no device info attached"
instead of a fake network error, and the two sites can't drift.

### [Maintainability] WhatsNewSection's `slice(0, 5)` recent-release count is an unnamed tuning literal

**File(s):** `web/src/lib/components/parent/WhatsNewSection.svelte` (line 10) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const RELEASES_URL = 'https://github.com/KyleMit/Splotch/releases';
const recent = releases.slice(0, 5);
```

How many releases the Updates section shows is precisely a "tunable decision" under CLAUDE.md's
naming rule ("threshold, duration, dimension, … retry count — gets a named module-scope constant").
The neighboring `RELEASES_URL` is named; the `5` is not, and nothing at the call site says whether
it balances scroll length, staleness, or payload size.

#### Proposed solution

```ts
// Enough history to show momentum without the section becoming a scroll chore;
// older releases live behind the "See all releases" link.
const RECENT_RELEASE_COUNT = 5;
const recent = releases.slice(0, RECENT_RELEASE_COUNT);
```

### [Readability] ParentCenter's two media-query flags are four pieces of duplicated wiring — extract a `mediaQueryFlag` helper

**File(s):** `web/src/lib/components/ParentCenter.svelte` (lines 26–61) @ 9ae62ff1

**Priority:** P4

#### Problem

Each of `wide` and `compact` needs: a query constant, a seeded `$state`
(`browser ? matchMedia(Q).matches : false`), a `MediaQueryList` re-created inside the `$effect`, and
paired add/remove listener calls — eight lines of ceremony per flag, interleaved so the effect body
syncs both at once:

```ts
let wide = $state(browser ? matchMedia(WIDE_QUERY).matches : false);
…
let compact = $state(browser ? matchMedia(COMPACT_QUERY).matches : false);
$effect(() => {
  if (typeof matchMedia === 'undefined') return;
  const wideMql = matchMedia(WIDE_QUERY);
  const compactMql = matchMedia(COMPACT_QUERY);
  const sync = () => { wide = wideMql.matches; compact = compactMql.matches; };
  sync();
  wideMql.addEventListener('change', sync);
  compactMql.addEventListener('change', sync);
  return () => { … };
});
```

The excellent WHY comments (seed-before-first-frame, landscape-phone detection) are the valuable
part; the plumbing around them is boilerplate that a third breakpoint would copy again. The
immediate `sync()` inside the effect also re-does the seeding the `$state` initializers already did
— harmless, but a reader must convince themselves of that.

#### Proposed solution

A small rune factory in `$lib` (or file-local, if no second consumer exists yet — check
`bootHiddenOverlays`/layout code before promoting):

```ts
function mediaQueryFlag(query: string): { readonly matches: boolean }; // seeds from matchMedia, subscribes in $effect.root or via action
```

used as `const wide = mediaQueryFlag(WIDE_QUERY);` … `wide.matches` in the template. Gotcha: the
current design deliberately seeds *before* mount to avoid the narrow-then-wide flash — the helper
must keep constructor-time seeding, not effect-time. If a shared helper feels heavy, even a local
`function watchMedia(mql: MediaQueryList, apply: () => void)` collapsing the listener pairs would
halve the block.

### [Readability] ControlsSection's `.slider-setting` class duplicates `.button-size-setting` on the same lone element

**File(s):** `web/src/lib/components/parent/ControlsSection.svelte` (line 112; styles, lines
162–168) @ 9ae62ff1

**Priority:** P5

#### Problem

```svelte
<div class="setting slider-setting button-size-setting" transition:slide={SECTION_SLIDE}>
```

is the only element in this component carrying either class, and the two scoped rules say the same
thing twice:

```css
.slider-setting { margin-top: 12px; }
.button-size-setting { margin: 12px 0 0; }
```

`.button-size-setting` is load-bearing (ParentCenter's resize-melt reaches it via
`:global(.button-size-setting)`, ParentCenter.svelte:240); `.slider-setting` here is a leftover from
the shared naming that `SoundSection.svelte:65` still uses for its own scoped rule. One redundant
class + one dead-weight rule.

#### Proposed solution

Drop `slider-setting` from the element and delete the `.slider-setting` rule in this component (keep
SoundSection's — it's a separate scoped rule). Grep `web/tests` for `.slider-setting` first; the E2E
suite selects by ids (`actionButtonScaleLabel`), so this should be inert.

### [Readability] AboutSection's `typeof __IS_CAPACITOR__ !== 'undefined'` guard is dead defensive code, unique in the codebase

**File(s):** `web/src/lib/components/parent/AboutSection.svelte` (lines 22–23) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const adminHref = typeof __IS_CAPACITOR__ !== 'undefined' && __IS_CAPACITOR__
  ? '/admin/native'
  : '/admin';
```

Everywhere else — including this section's own `SetupInstructions.svelte:44`
(`const native = __IS_CAPACITOR__ && isNative()`) — the compile-time define is read bare, per the
src-orientation doc ("Compile-time constants from Vite"). `app.d.ts:25` declares it, both Vite and
Vitest define it, and `buildDefines.test.ts` asserts it. The `typeof` guard defends against an
environment that doesn't exist in this repo, and its uniqueness makes a reader wonder what special
hazard this one call site knows about (none).

#### Proposed solution

`const adminHref = __IS_CAPACITOR__ ? '/admin/native' : '/admin';` — and run `npm run check` + unit
tests to confirm no config actually relies on the guard.

### [Readability] AboutSection's `showAdminLink` is a pass-through `$derived` alias

**File(s):** `web/src/lib/components/parent/AboutSection.svelte` (line 21, template line 54) @
9ae62ff1

**Priority:** P5

#### Problem

```ts
let showAdminLink = $derived(settings.adminLinkVisible);
```

A `$derived` that wraps a single reactive property read adds no computation, no memoization value,
and one extra name to track; the template's `{#if showAdminLink}` could read
`{#if settings.adminLinkVisible}` directly, as this section's sibling components do throughout
(`settings.aiImageEnabled`, `settings.applePencilSeen`, etc.). The alias mildly obscures that the
flag is shared persisted state (reset by the admin console) rather than local component state.

#### Proposed solution

Inline it: `{#if settings.adminLinkVisible}`. The valuable context (who sets/resets the flag)
already lives in the comment block at lines 7–11 and on the setting's declaration in
`settings.svelte.ts:52–56`.

### [Docs] ParentCenter's pinch-zoom comment says "whichever scroll shell is mounted binds it," but the compact shell never does

**File(s):** `web/src/lib/components/ParentCenter.svelte` (comment, lines 76–79; compact branch,
lines 131–132), `web/src/lib/components/parent/CompactShell.svelte` (`.quick-toggles` scroller,
lines 151–160) @ 9ae62ff1

**Priority:** P5

#### Problem

The tier-2 accessibility comment claims universal coverage:

```ts
// Tier-2 accessibility (ADR-0076): let a low-vision parent pinch to enlarge the
// reading content. The bound element gets CSS `zoom`; whichever scroll shell is
// mounted binds it.
```

but the compact branch renders `<CompactShell />` with no `use:pinchTextZoom` and no `.pc-zoom`
target — CompactShell has its own scroll region (`.quick-toggles`, `overflow-y: auto`) that a
low-vision parent cannot enlarge. Skipping the cramped landscape-phone shell may well be the right
call (there's barely room at 1×, and its content is toggles rather than reading material), but as
written the comment asserts coverage the code doesn't provide, so a reader auditing ADR-0076
compliance gets a false all-clear.

#### Proposed solution

Either amend the comment to record the exclusion and its rationale ("…both full shells bind it; the
compact quick-toggle shell is deliberately excluded — no prose to read, no vertical room to zoom
into") or, if the exclusion wasn't a decision, thread the action through CompactShell like the other
shells (bind `.quick-toggles`' inner content and pass the `textZoom` getter as a prop). Check
ADR-0076 for whether the tier-2 commitment scoped itself to reading content before choosing.

## Source: Code audit — App state (runes)

### [Architecture] Move the seven `ai*` fields out of `ui.svelte.ts` into the AI-generation state module

**File(s):** `web/src/lib/state/ui.svelte.ts` (`UiState`/`ui`, lines 1–32) @ 9ae62ff1

**Priority:** P2

#### Problem

Seven of the nine fields in the generic `ui` state object are AI-result view state:

```ts
interface UiState {
  resizingActionButtons: boolean;
  clearTutorialVisible: boolean;
  aiGenerating: boolean;
  aiResultOpen: boolean;
  aiResultUrl: string | null;
  aiPreviewUrl: string | null;
  aiError: boolean;
  aiErrorMessage: string | null;
  aiErrorKind: AiErrorKind;
}
```

Every writer of those fields lives in `web/src/lib/state/aiGeneration.svelte.ts`
(`startAiGeneration`, `setAiPreview`, `finishAiGeneration`, `failAiGeneration`, `closeAiResult` —
that module's entire body is `ui.ai* = …` assignments). The split produces a module cycle as its
telltale: `ui.svelte.ts:1` does `import type { AiErrorKind } from './aiGeneration.svelte'` while
`aiGeneration.svelte.ts:1` does `import { ui } from './ui.svelte'`. The type-only import erases at
runtime so nothing breaks, but the cycle is the signature of state declared on the wrong side of the
boundary: the lifecycle owner (`aiGeneration`) has to reach into a foreign module for every
mutation, and a first-time reader looking for "where does `aiResultUrl` live" finds the declaration
in a file that knows nothing about its invariants.

#### Proposed solution

Move the seven `ai*` fields into an exported `$state` object in `aiGeneration.svelte.ts` (e.g.
`export const aiResult = $state({ generating: false, open: false, resultUrl: null, … })`), dropping
the `ai` prefix that the module name now carries. `ui.svelte.ts` keeps `resizingActionButtons`, the
modal instances, `PARENT_HELP_BUTTON_ID`, and `buttonCenter`, and loses its `aiGeneration` import —
cycle gone. Readers to update: `ActionsPanel.svelte`, `AiImageResult.svelte`, `AiDial.svelte`,
`ParentCenter.svelte` (reads `ui.resizingActionButtons` only), `lib/drawing/aiImage.ts`,
`routes/dev/ai-timer/+page.svelte`, plus tests. Mechanical rename churn is the only cost;
`aiGeneration.svelte.ts` itself is owned by the AI section, so coordinate the halves as one change.

### [Readability] Delete the dead `clearTutorialVisible` field

**File(s):** `web/src/lib/state/ui.svelte.ts` (lines 9, 24) @ 9ae62ff1

**Priority:** P2

#### Problem

`clearTutorialVisible: boolean` is declared in `UiState` (line 9) and initialized to `false` (line
24), but a repo-wide grep (`web/src` + `web/tests`, `.ts`/`.svelte`/`.spec.ts`) finds no other
reference — nothing ever reads or writes it. It is a leftover from a removed (or never-shipped)
clear-tutorial feature and now misleads a reader into hunting for a tutorial flow that doesn't
exist.

#### Proposed solution

Remove both lines. If a clear tutorial is planned, its state should arrive with the feature (the "no
speculative surface" convention).

### [Maintainability] The folder-save support predicate is duplicated and kept in sync by prose

**File(s):** `web/src/lib/state/saveFolder.svelte.ts` (`hydrateSaveFolder`, lines 65–76) @ 9ae62ff1

**Priority:** P3

#### Problem

Line 72 inlines the support check:

```ts
if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return;
```

and the comment above (lines 67–70) says it is "the same predicate as folderSaveSupported" — which
lives in `web/src/lib/drawing/folderSave.ts:75-76` as
`return browser && 'showDirectoryPicker' in window;`. CLAUDE.md is explicit that this pattern is a
defect, not a mitigation: "Cross-file agreement is never maintained by prose. … A 'keep in sync with
X' comment marks a defect." If the folderSave predicate ever changes (e.g. adds a permissions
probe), the boot hydration gate silently diverges. The duplication exists for a good reason —
importing `folderSave.ts` here would defeat the lazy-chunk optimization (issue #461) — but the fix
doesn't require importing the chunk.

#### Proposed solution

Extract the predicate to a tiny dependency-light module, e.g.
`web/src/lib/drawing/folderSaveSupport.ts` exporting `folderSaveSupported(): boolean`, imported
statically by both `folderSave.ts` and `saveFolder.svelte.ts`. A one-function module adds nothing
measurable to the startup bundle, keeps the folderSave chunk lazy, and deletes the prose contract.
Alternative (weaker): a drift-guard test that greps both sites, per the `app.html.test.ts` pattern —
but the shared module is simpler here since both sides are importable TS. `folderSave.ts` is owned
by the drawing section; coordinate.

### [Maintainability] Sound-volume bounds 0/100 are duplicated between `clampVolume` and the slider markup

**File(s):** `web/src/lib/state/settings.svelte.ts` (`clampVolume`, lines 78–81) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
function clampVolume(v: number) {
  if (!Number.isFinite(v)) return SOUND_VOLUME_DEFAULT;
  return Math.max(0, Math.min(100, Math.round(v)));
}
```

The `0`/`100` bounds are re-stated as bare literals in
`web/src/lib/components/parent/SoundSection.svelte:53-54` (`min={0} max={100}`). These two sites
must agree — a slider whose range exceeds the clamp silently snaps on release; a clamp wider than
the slider makes stored values unreachable. The module already demonstrates the correct pattern one
screen down: `ACTION_BUTTON_SCALE_MIN`/`MAX` (lines 86–87) are exported and imported by
`ControlsSection.svelte:118` and `actionButtonLayout.ts:103`. Volume is the one slider setting that
skipped it.

#### Proposed solution

Export `SOUND_VOLUME_MIN = 0` and `SOUND_VOLUME_MAX = 100` beside `SOUND_VOLUME_DEFAULT`, use them
in `clampVolume`, and import them in `SoundSection.svelte` for `min`/`max`. Mirrors the existing
scale-constant pattern exactly.

### [Maintainability] Name the 600px tablet threshold in `defaultForceLandscapeOrientation`

**File(s):** `web/src/lib/state/settings.svelte.ts` (`defaultForceLandscapeOrientation`, lines
15–21) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
function defaultForceLandscapeOrientation() {
  if (typeof window === 'undefined') return true;
  // iPad Mini and larger tablets have a smallest CSS viewport side around
  // 744px; Android tablet layouts commonly start at 600dp. Phone-class devices
  // stay below that, even in landscape, so they default to portrait.
  return Math.min(window.innerWidth, window.innerHeight) >= 600;
}
```

`600` is a tuning literal — a device-classification threshold with a researched rationale — and
CLAUDE.md requires exactly this kind of number to be a named module-scope constant with the unit in
the name ("Tuning literals get names… the WHY comment lives on the constant"). Inline, it can't be
found by grepping for a name, and the comment is attached to the function instead of the decision.

#### Proposed solution

```ts
// iPad Mini and larger tablets have a smallest CSS viewport side around 744px;
// Android tablet layouts commonly start at 600dp. Phone-class devices stay
// below this even in landscape, so they default to portrait.
const TABLET_MIN_VIEWPORT_SIDE_PX = 600;
```

and use it in the comparison.

### [Maintainability] `BRUSH_TYPES` and `BRUSH_OPTIONS` are two hand-maintained copies of the same ordered list

**File(s):** `web/src/lib/state/tool.svelte.ts` (lines 15–33, 46–51) @ 9ae62ff1

**Priority:** P3

#### Problem

Line 16 declares `export const BRUSH_TYPES: BrushType[] = ['pen', 'crayon', 'magic', 'eraser'];`
with the comment "Presentation order in the Brush Menu", and lines 23–33 declare `BRUSH_OPTIONS` —
also "in presentation order" — whose `brush` fields are the same four values in the same order.
Adding or reordering a brush requires editing both lists and keeping their order aligned; nothing
enforces the agreement (a unit test asserts `BRUSH_TYPES`' content but not its correspondence to
`BRUSH_OPTIONS`). Two smaller issues in the same lines: `BRUSH_TYPES` and `BRUSH_OPTIONS` are
mutable exported arrays (contrast `STROKE_SIZES: readonly StrokeSize[]` in
`strokeWidth.svelte.ts:6`), and `readBrush` (line 48) validates via a widening cast
`(BRUSH_TYPES as string[]).includes(raw)`.

#### Proposed solution

Derive one from the other so a single list owns the order:

```ts
export const BRUSH_OPTIONS: readonly BrushOption[] = [/* the four entries */];
export const BRUSH_TYPES: readonly BrushType[] = BRUSH_OPTIONS.map((o) => o.brush);
```

with a named
`interface BrushOption { brush: BrushType; icon: CommonIconName; label: string; id: string }`.
Optionally add `function isBrushType(raw: string): raw is BrushType` to replace the `as string[]`
widening in `readBrush`. Consumers (`BrushMenu.svelte:34`, `ActionsPanel.svelte:287`, tests) are
unaffected.

### [Types] `TRIM_ORDER`'s label lookup lets a typo produce a silent `undefined` entry

**File(s):** `web/src/lib/state/colors.svelte.ts` (lines 21–33) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
const paletteByLabel = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label, hex]));
export const TRIM_ORDER: string[] = [
  'Brown',
  'Teal',
  'Pink',
  'Red',
  'Orange',
  'Green',
  'Yellow',
  'Blue',
  'Purple',
  'Black',
].map((label) => paletteByLabel[label]);
```

`PALETTE_COLORS` types `label` as bare `string` (`lib/palette.ts`), and `Object.fromEntries` yields
`Record<string, string>`, so a misspelled or stale label here type-checks and maps to `undefined` at
runtime — `TRIM_ORDER`'s declared `string[]` is a lie in that case. The only guard is a unit test
(`colors.svelte.test.ts:29-31`) comparing sorted hex sets, i.e. a runtime check for what the "close
finite value sets in the type" convention says should be a compile error. `TRIM_ORDER` is also a
mutable exported array.

#### Proposed solution

In `lib/palette.ts`, make the labels a literal union: declare the array
`as const satisfies readonly PaletteColor[]` (or give `PaletteColor` a generic label parameter) and
export `type PaletteLabel = (typeof PALETTE_COLORS)[number]['label']`. Then in `colors.svelte.ts`
type the literal list as `readonly PaletteLabel[]` (renaming a palette label becomes a compile error
here) and export `TRIM_ORDER` as `readonly string[]`. `palette.ts` belongs to the color-palette
section — coordinate that half. The existing unit test stays as the completeness check (the type
can't prove every label appears exactly once).

### [Types] Collapse the `aiError`/`aiErrorMessage`/`aiErrorKind` tri-field into one nullable error value

**File(s):** `web/src/lib/state/ui.svelte.ts` (lines 14–19, 29–31) @ 9ae62ff1

**Priority:** P3

#### Problem

The error state is spread across three parallel fields:

```ts
aiError: boolean;
aiErrorMessage: string | null;
aiErrorKind: AiErrorKind;
```

Illegal combinations are representable (`aiError: false` with a stale message/kind), so every writer
must reset all three in lockstep — and does, three times over, in `aiGeneration.svelte.ts`
(`startAiGeneration`, `failAiGeneration`, `closeAiResult` each touch the full triple). Readers
re-derive the grouping too: `AiImageResult.svelte:107-111` branches on `aiError`, then reads
`aiErrorKind` and `aiErrorMessage` separately.

#### Proposed solution

One field models the whole thing:

```ts
aiError: { kind: AiErrorKind; message: string | null } | null;
```

`failAiGeneration` sets it in one assignment; `startAiGeneration`/`closeAiResult` reset with
`= null`; truthiness replaces the boolean at every read site. Best folded into the `ai*`-field
relocation finding above (same files, same writers) rather than done as a separate pass.

### [Performance] `syncViewport` constructs a fresh `MediaQueryList` on every resize event

**File(s):** `web/src/lib/state/layout.svelte.ts` (`syncViewport`, lines 55–64; `readOrientation`,
line 26) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
function syncViewport() {
  const next = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
```

`window.matchMedia(...)` allocates and evaluates a new `MediaQueryList` per call, and `syncViewport`
runs on every `resize` — which fires in bursts during desktop window drags and mobile URL-bar
show/hide transitions. The repo's hot-path rule flags per-resize allocation; the fix is the standard
hoist. Line 26 (`readOrientation`'s fallback) creates another one at module load — harmless once,
but it can share the same hoisted instance. Secondary micro-nit in the same function:
`document.documentElement.dataset.orientation = next` (line 59) writes the attribute even when
unchanged; engines short-circuit same-value `setAttribute`, so this is optional to guard.

#### Proposed solution

```ts
const portraitQuery = browser ? window.matchMedia('(orientation: portrait)') : null;
```

at module scope; `syncViewport` and `readOrientation`'s fallback read `portraitQuery.matches`.
(Keeping the resize/orientationchange listeners rather than subscribing to the MQL's `change` event
is fine — the function must re-measure insets/viewport anyway.) The existing `layout.svelte.test.ts`
stubs `window.matchMedia` per test and calls `freshModule()`, so a module-scope query still picks up
the stub; verify the stub is installed before import (it is — `beforeEach` runs `setMatchMedia()`
first).

### [Maintainability] Three different SSR-guard idioms across the state modules (and docs say `appearance` uses `browser`)

**File(s):** `web/src/lib/state/appearance.svelte.ts` (lines 17–18, 35),
`web/src/lib/state/settings.svelte.ts` (lines 16, 234), `web/src/lib/state/saveFolder.svelte.ts`
(line 72) @ 9ae62ff1

**Priority:** P4

#### Problem

The state directory's documented pattern (web/src CLAUDE.md) is self-initialization "gated on
`browser`", and it explicitly lists `appearance.svelte.ts` among the examples. In fact `appearance`
gates on `typeof matchMedia !== 'undefined'` (line 17) and `typeof document !== 'undefined'` (line
35); `settings.svelte.ts` uses `typeof window === 'undefined'` (lines 16, 234);
`saveFolder.svelte.ts` uses `typeof window === 'undefined'` (line 72); while `layout`, `network`,
`fullscreen`, and `install` import `browser` from `$app/environment`. Three idioms for one concept
make it harder to grep for "client-only" gates and leave the orientation doc mildly wrong about one
of its own examples.

#### Proposed solution

Standardize on `browser` from `$app/environment` in all five spots. Gotcha:
`appearance.svelte.test.ts` and `settings.svelte.test.ts` currently import these modules without
mocking `$app/environment`; under Vitest the SvelteKit plugin resolves it but `browser` may be
`false`, so the tests will need the same `vi.mock('$app/environment', () => ({ browser: true }))`
that `layout.svelte.test.ts` and `install.svelte.test.ts` already use. If that test churn is judged
not worth it, the fallback is to fix the CLAUDE.md source (`.ruler/`) so the doc stops claiming
`appearance` is browser-gated — either way the current doc/code disagreement should not stand.

### [Types] `settings.svelte.ts` repeats its typed-entries casts in two places

**File(s):** `web/src/lib/state/settings.svelte.ts` (lines 133–147, 213–229) @ 9ae62ff1

**Priority:** P4

#### Problem

The `$state` initializer casts `Object.fromEntries(Object.entries(BOOL_SETTINGS)...)` through
`as Record<BoolSettingKey, boolean>` (lines 134–136) and the INT equivalent (137–142), and
`reloadSettings` re-states the sibling casts
`Object.entries(BOOL_SETTINGS) as [BoolSettingKey, [StorageKey, boolean]][]` (lines 214–217) and the
three-tuple INT form (220–223). Four `as`-casts encode the same two facts (the entries of each table
keep their key/value types), each written out longhand, and any change to a table's tuple shape must
be mirrored in two casts.

#### Proposed solution

Hoist the typed iteration once, next to each table:

```ts
const boolSettingEntries = () =>
  Object.entries(BOOL_SETTINGS) as [BoolSettingKey, [StorageKey, boolean]][];
const intSettingEntries = () =>
  Object.entries(INT_SETTINGS) as [IntSettingKey, [StorageKey, number, (v: number) => number]][];
```

Both the `$state` initializer (`Object.fromEntries(boolSettingEntries().map(...))`) and
`reloadSettings` iterate the helpers; the casts live exactly once per table, beside the structure
they describe.

### [Readability] The persistence-split comment sits on `SIZE_TO_PX` instead of on `strokeState`

**File(s):** `web/src/lib/state/strokeWidth.svelte.ts` (lines 33–42, 48–51) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// Drawing brushes (pen/crayon/magic) share one remembered level and the eraser
// keeps its own, persisted separately, so switching tools restores the size the
// child last used for that tool.
const SIZE_TO_PX: Record<StrokeSize, number> = { ... };
```

The comment describes the pen/eraser persistence split — i.e. the `strokeState` object declared at
lines 48–51 — but is attached to the level→pixel lookup table, which has nothing to do with
persistence. A reader scanning `SIZE_TO_PX` gets an explanation for the wrong thing, and
`strokeState` (the thing that actually encodes the split via its two keys) carries no comment.

#### Proposed solution

Move the comment down to sit directly above `export const strokeState = $state({ ... })`. If
`SIZE_TO_PX` wants a comment at all, one line ("stroke level → brush width in CSS px") suffices,
though the name already says it.

### [Maintainability] `getStrokeWidthPx`/`getEraserWidthPx` default parameters and the `??` fallback have no production caller

**File(s):** `web/src/lib/state/strokeWidth.svelte.ts` (lines 80–86) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
export function getStrokeWidthPx(size: StrokeSize = strokeState.penSize): number {
  return SIZE_TO_PX[size] ?? SIZE_TO_PX[DEFAULT_SIZE];
}
export function getEraserWidthPx(size: StrokeSize = strokeState.eraserSize): number {
  return getStrokeWidthPx(size) * ERASER_SIZE_MULTIPLIER;
}
```

Every production call site passes an explicit argument (`DrawingCanvas.svelte:82,88,177,231`,
`earlyBoot.ts:39`); only the unit test exercises the no-arg form (`strokeWidth.svelte.test.ts:34`,
via `undefined`). Per the "no speculative surface" convention, an optional parameter needs a
production caller or a test-only-seam comment. The defaults are also subtly hazardous: they read
reactive state, so a future zero-arg call inside a `$derived` would silently subscribe to `penSize`.
Separately, the `?? SIZE_TO_PX[DEFAULT_SIZE]` fallback is unreachable for the closed `StrokeSize`
union — the only unvalidated inputs are the test's deliberate `0 as StrokeSize` casts, and the
storage path already validates through `readStrokeLevel`'s allowed-list. A runtime fallback
shadowing a closed union is exactly what the "close finite value sets in the type" convention argues
against.

#### Proposed solution

Make `size` required in both functions and drop the `??` fallback (updating the garbage-input test,
which currently proves behavior no caller can reach). If the defensive fallback is judged worth
keeping for belt-and-braces, keep it but delete the default parameters and add the convention's
test-only-seam comment.

### [Architecture] `ColorPalette` mutates `layout.paletteWidth/Height` directly instead of through a setter

**File(s):** `web/src/lib/state/layout.svelte.ts` (lines 29–36) @ 9ae62ff1

**Priority:** P4

#### Problem

`.claude/rules/svelte.md` states: "Components read state and call setters; they never own shared
state." Yet `ColorPalette.svelte:47-54` assigns the shared store directly from its ResizeObserver
and unmount cleanup:

```ts
layout.paletteWidth = rect.width;
layout.paletteHeight = rect.height;
// …and on teardown:
layout.paletteWidth = 0;
layout.paletteHeight = 0;
```

`layout.svelte.ts` exposes no setter for these two fields (every other write to `layout` happens
inside the module's own `syncViewport`). The module comment (lines 5–10) documents the publish
mechanism but not the raw-assignment API; a setter would also give the "0 = unmeasured" sentinel
(documented at lines 33–35) a single named home instead of being re-encoded at the component's
teardown site.

#### Proposed solution

Add to `layout.svelte.ts`:

```ts
export function publishPaletteSize(width: number, height: number) {
  layout.paletteWidth = width;
  layout.paletteHeight = height;
}
```

`ColorPalette` calls `publishPaletteSize(rect.width, rect.height)` and `publishPaletteSize(0, 0)` on
teardown. Small change; brings the one rule-breaking write site in the state layer into line.

### [Testing] `fullscreen.svelte.ts` has no unit tests

**File(s):** `web/src/lib/state/fullscreen.svelte.ts` (whole file, 67 lines) @ 9ae62ff1

**Priority:** P4

#### Problem

Every other logic-bearing state module in the directory has a colocated test file (`layout`,
`colors`, `strokeWidth`, `tool`, `settings`, `install`, `appearance`, `coloringBook`, `aiKey`);
`fullscreen.svelte.ts` has none. Its behavior is exactly the kind the neighboring
`install.svelte.test.ts` proves testable with the `freshModule()` + platform-mock pattern: the
four-way `supported` gating (`fullscreenSupported`, lines 25–29 — native, standalone,
`document.fullscreenEnabled`, Android-browser sniff), the `fullscreenchange` sync keeping `active`
truthful (lines 47–51), and `toggleFullscreen`'s guard + swallow semantics (lines 58–67). A
regression in the gating (e.g. the toggle appearing on iOS, where `fullscreenEnabled` is false, or
inside the native shell) currently has no unit-level net.

#### Proposed solution

Add `fullscreen.svelte.test.ts` mirroring `install.svelte.test.ts`'s structure:
`vi.mock('$app/environment', ...)`, `vi.mock('$lib/platform', ...)` for
`isNative`/`isStandalone`/`isAndroidBrowser`, drive `document.fullscreenEnabled`/`fullscreenElement`
via `Object.defineProperty`, and `vi.resetModules()` per test since the module seeds at load. Cover:
supported=false for native/standalone/non-Android/no-API; supported=true path syncs `active` on
`fullscreenchange`; `toggleFullscreen` no-ops when unsupported and swallows a rejected
`requestFullscreen`.

### [Testing] `captureAiAccessTokenFromUrl` and `aiCredentialKind` are untested

**File(s):** `web/src/lib/state/settings.svelte.ts` (`aiCredentialKind`, lines 204–208;
`captureAiAccessTokenFromUrl`, lines 233–241) @ 9ae62ff1

**Priority:** P4

#### Problem

`settings.svelte.test.ts` covers the generated setters, clamps, and `reloadSettings`, but not these
two exports. `captureAiAccessTokenFromUrl` has real branching worth pinning: no-op without the
param, persisting the token via `setAiAccessToken`, and scrubbing the URL with
`history.replaceState` — it is the landing path for every parent invite link (`/​?ai_access_token=…`,
built in `lib/server/admin.ts:90`), so a silent regression here breaks token onboarding.
`aiCredentialKind` encodes the BYOK-beats-access-code precedence that `AiKeyManager.svelte:33` and
`parent/sections.ts:69` rely on.

#### Proposed solution

In `settings.svelte.test.ts`, add a `describe('captureAiAccessTokenFromUrl')` that sets
`window.location` (happy-dom allows `window.happyDOM`-style navigation or `history.replaceState` to
seed the URL) and asserts token persistence + URL scrub + the no-param no-op, and a small
`describe('aiCredentialKind')` covering the three states (key set, token only, neither) by assigning
`settings.aiUserApiKey`/`settings.aiAccessToken` directly.

### [Readability] `coloringBook` exported from `ui.svelte.ts` collides with the coloring-book state module's domain name

**File(s):** `web/src/lib/state/ui.svelte.ts` (lines 36–39) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
export const colorPicker = createModal();
export const coloringBook = createModal();
export const parentCenter = createModal();
export const aiPrompt = createModal();
```

`import { coloringBook } from '$lib/state/ui.svelte'` (as in `ColoringBook.svelte:3` and
`ActionsPanel.svelte:11`) reads as if it were the coloring-book selection state, which actually
lives in `lib/state/coloringBook.svelte.ts` (as `coloringBookState`). Nothing in the binding names
says these four are modal open/origin handles; at a call site, `coloringBook.show(...)` vs
`coloringBookState.overlayPage` forces the reader to know which module each identifier came from.
Note: issue #564 tracks unifying `$state` object naming across state modules — these are `Modal`
factory instances rather than `$state` objects, so they likely fall outside that issue, but the
rename should be coordinated with it.

#### Proposed solution

Suffix the modal handles: `colorPickerModal`, `coloringBookModal`, `parentCenterModal`,
`aiPromptModal`. Purely mechanical rename across ~10 importing components; the payoff is that every
use is self-identifying and the `coloringBook` name is freed for the domain that owns it.

### [Correctness] `captureAiAccessTokenFromUrl` rewrites the URL to a bare `/`, dropping unrelated params and hash

**File(s):** `web/src/lib/state/settings.svelte.ts` (`captureAiAccessTokenFromUrl`, lines 233–241) @
9ae62ff1

**Priority:** P5

#### Problem

```ts
const url = new URL(window.location.href);
const token = url.searchParams.get(AI_ACCESS_TOKEN_PARAM);
if (!token) return;
setAiAccessToken(token);
window.history.replaceState({}, '', '/');
```

The scrub replaces the entire URL with `/`, discarding any other query params (campaign tags a
parent's messenger app appended, a future feature param) and any hash — not just the token. Today
invite links (`lib/server/admin.ts:90`) carry only the token so impact is nil, which is why this is
P5, but the function's name promises "capture the token from the URL", not "reset the URL".

#### Proposed solution

Delete only the captured param:

```ts
url.searchParams.delete(AI_ACCESS_TOKEN_PARAM);
window.history.replaceState({}, '', url);
```

Same length, no behavior change for current links, and future-proof against additional params.

### [Types] Name the `promptInstall` outcome union

**File(s):** `web/src/lib/state/install.svelte.ts` (lines 128, 135) @ 9ae62ff1

**Priority:** P5

#### Problem

`'accepted' | 'dismissed' | 'unavailable'` is written out inline in the return type (line 128) and
`'accepted' | 'dismissed'` again for the local `outcome` (line 135). The module already names its
other closed sets (`InstallMode`, `InstallDeviceOs`, lines 23–27); the prompt outcome is the one
vocabulary left anonymous, so callers switching on the result have no named type to import.

#### Proposed solution

```ts
export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'unavailable';
```

Return `Promise<InstallPromptOutcome>`; type the local as
`Exclude<InstallPromptOutcome, 'unavailable'>`.

### [Testing] Small coverage gaps: `isDarkInk` and the layout viewport dimensions

**File(s):** `web/src/lib/state/colors.svelte.test.ts` (imports, lines 2–14),
`web/src/lib/state/layout.svelte.test.ts` (lines 38–89) @ 9ae62ff1

**Priority:** P5

#### Problem

Two exports in the section have colocated test files that skip them entirely. (a)
`colors.svelte.test.ts` tests `isWhite` thoroughly (lines 93–113) but never imports `isDarkInk`
(`colors.svelte.ts:83-85`) — the tuned `DARK_INK_LUMINANCE_MAX = 0.15` cutoff that drives the
keyline on dark action-button cards has no test pinning that Black ink is below it and, say, Purple
is above. (b) `layout.svelte.test.ts` asserts orientation and safe-area syncing but never
`layout.viewportWidth`/`viewportHeight` (`layout.svelte.ts:62-63`), which `actionButtonLayout.ts`
and the Parent Center size ceiling consume; a regression that stopped syncing them would pass the
suite.

#### Proposed solution

(a) Add an `isDarkInk` describe: `expect(isDarkInk(BLACK_INK)).toBe(true)` and false for each
non-black palette hex. (b) In the existing "re-measures on resize" test, set
`window.innerWidth/innerHeight` (happy-dom allows assignment) before dispatching `resize` and assert
the two fields track.

### [Readability] `tool.svelte.test.ts` duplicates its three-line `beforeEach` in both describes

**File(s):** `web/src/lib/state/tool.svelte.test.ts` (lines 15–19, 101–105) @ 9ae62ff1

**Priority:** P5

#### Problem

Both `describe('tool state')` and `describe('reloadBrushType')` contain the identical reset block:

```ts
beforeEach(() => {
  localStorage.clear();
  selectBrush('pen');
  localStorage.clear();
});
```

The double-`clear()` dance (reset the store to pen, then wipe the write that `selectBrush` just
persisted) is non-obvious enough that having it twice invites the copies drifting; every sibling
test file (`strokeWidth`, `colors`, `settings`) uses a single file-level `beforeEach`.

#### Proposed solution

Hoist one `beforeEach` to file level above both describes; optionally add a one-line WHY on the
second `clear()` ("selectBrush persists; tests start with empty storage").

### [Architecture] `buttonCenter` computes an `Origin` but lives a module away from the `Origin` type

**File(s):** `web/src/lib/state/ui.svelte.ts` (`buttonCenter`, lines 41–44),
`web/src/lib/state/modal.svelte.ts` (lines 1–12) @ 9ae62ff1

**Priority:** P5

#### Problem

`modal.svelte.ts` defines `Origin` and the `Modal` interface whose `show(origin)` consumes it;
`ui.svelte.ts` imports the type (line 3) solely to define `buttonCenter(el): Origin` — the standard
producer of that value (`ColorPalette.svelte:15`, `ParentHelpButton.svelte:3`,
`ActionsPanel.svelte:11` all import it to call `someModal.show(buttonCenter(el))`). The helper is
pure DOM geometry with no dependency on the `ui` state object; it sits in `ui.svelte.ts` only by
historical accident, splitting the modal-origin concept across two files.

#### Proposed solution

Move `buttonCenter` into `modal.svelte.ts` beside `Origin` and `createModal` (it has no runes, so
the `.svelte.ts` home is fine), re-exporting from `ui.svelte.ts` only if avoiding import churn
matters — though with ~4 importers, updating them directly is cleaner. Low urgency; bundle with the
modal-rename finding if that lands.

## Source: Code audit — Admin console + token backend

### [Correctness] Token mutations silently "succeed" into the per-request memory fallback during a transient Blobs failure

**File(s):** `web/src/lib/server/tokens.ts` (`readStore` lines 105–115, `persist` lines 122–130,
`mutateList` lines 178–196) @ 9ae62ff1

**Priority:** P1

#### Problem

`readStore` deliberately collapses two very different situations into the same `source: 'memory'`
result: Blobs genuinely unconfigured (plain `vite dev` — `openStore` returns null, line 49) and a
*transient* Blobs read failure on an instance where Blobs is configured (the catch at lines 105–111
falls through to the memory fallback at lines 113–114):

```ts
  } catch (err) {
    // Transient Blobs error: degrade to memory for THIS request only. Do not
    // latch blobsUnavailable, or one blip would make the warm instance
    // silently drop every future write.
    const detail = err instanceof Error ? err.message : err;
    console.warn('[tokens] Netlify Blobs read failed, using in-memory list:', detail);
  }
}
if (memoryTokens === null) memoryTokens = seedFromEnv();
return { source: 'memory', store: null, list: memoryTokens };
```

For *reads* this degradation is fine (and the `persistent: false` banner covers it). But
`mutateList` (lines 182–193) makes no distinction: it calls `persist(store, result.next, etag)` with
`store === null`, and `persist` then writes to `memoryTokens` and returns `true` (lines 123–126).
The mutation reports `{ ok: true }`, the `/admin` form action shows "Added …"/"Removed …", and the
write is gone the moment Blobs recovers — the next `readStore` reads the real blob, which never saw
the change.

This directly contradicts the module's own stated design goal at lines 160–164:

```ts
// Unlike usage.ts we do NOT concede after the retries: under eventual
// consistency (ADR-0025) they can exhaust, and an admin mutation that quietly
// did nothing is as bad as the clobber the CAS prevents — so it surfaces as
// `{ ok: false, error }` ...
```

The worst case is security-relevant: an admin revokes a token during a one-request Blobs blip, sees
"Removed “X”", but the token is still in the durable list and remains a valid AI-generation
credential after recovery (`isAllowedToken`, line 152, reads the recovered Blobs list). The success
message plus a recovered `persistent: true` on the next load means nothing ever tells the operator
the revocation didn't happen.

#### Proposed solution

Distinguish the two memory cases in `StoreRead` — e.g. split `source: 'memory'` into `'memory'`
(Blobs unconfigured; local dev, writes to `memoryTokens` are the intended behavior) and `'degraded'`
(Blobs configured but this read failed). In `mutateList`, treat `'degraded'` like `'unconfirmed'`:
return `{ ok: false, reason: 'conflict', error: TOKEN_CONFLICT_ERROR }` (or introduce a third
`reason: 'unavailable'` mapped to 503 by both front doors) instead of persisting to memory. Gotchas:
widening the `reason` union ripples into the 400/409 mapping in
`web/src/routes/admin/+page.server.ts` (line 99) and `/api/admin/tokens`' `mutationError`, and into
`tokenActions.integration.test.ts` / `wire.integration.test.ts`; the distinction is cheap to compute
— `openStore()` already tells you whether Blobs is configured (the catch block runs only when
`store` was non-null).

### [Maintainability] The MutationFailure→HTTP-status mapping is duplicated and kept in agreement only by prose

**File(s):** `web/src/routes/admin/+page.server.ts` (`tokenMutation`, line 99) @ 9ae62ff1;
`web/src/lib/server/tokens.ts` (`MutationFailure`, line 170)

**Priority:** P2

#### Problem

The rule "`reason: 'conflict'` → 409, `reason: 'invalid'` → 400" exists twice: in the `/admin` form
action —

```ts
if (!result.ok) return fail(result.reason === 'conflict' ? 409 : 400, { error: result.error });
```

— and in `/api/admin/tokens`' `mutationError` (`web/src/routes/api/admin/tokens/+server.ts`,
`json(payload, { status: result.reason === 'conflict' ? 409 : 400 })`). The only thing tying them
together is the comment at `+page.server.ts` lines 85–88 ("The status mapping mirrors
/api/admin/tokens' mutationError…"). CLAUDE.md is explicit: "Cross-file agreement is never
maintained by prose … a value that must agree with another module is imported from one exported
constant." The two integration tests (`tokenActions.integration.test.ts`,
`wire.integration.test.ts`) each pin their own side, so a change to one side plus its own test keeps
CI green while the two front doors diverge — exactly the drift the convention exists to prevent.

#### Proposed solution

Export the mapping once from the module that owns `MutationFailure`, e.g. in
`web/src/lib/server/tokens.ts`:

```ts
export function mutationFailureStatus(failure: MutationFailure): 400 | 409 {
  return failure.reason === 'conflict' ? 409 : 400;
}
```

Both `tokenMutation` and `mutationError` call it. The return type stays a closed literal union so
any new `reason` (see the P1 finding) forces both call sites through the compiler at once.

### [Maintainability] AdminConsole duplicates the copy-code/copy-link button markup three times

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte` (invite row, lines 243–288) @
9ae62ff1; `web/src/lib/components/admin/InviteMenu.svelte` (lines 41–60)

**Priority:** P3

#### Problem

The full-width action row (lines 243–269) and the compact row (lines 271–288) repeat the same
copy-button pattern verbatim — same `class:copied={copied === copyKey(invite.token, 'code')}`, same
`onclick={() => copy(copyKey(invite.token, 'code'), invite.token)}`, same ternary label — four
button instances differing only in target (`'code'`/`'url'`) and label text. `InviteMenu.svelte`
then repeats the same two copy actions a third time (lines 44–60) in menu-item form. Any change to
the copy interaction (feedback duration, an aria-live announcement, analytics) has to be applied in
up to six places, and the 46-line block in the invite row makes the `{#each}` body hard to scan.

#### Proposed solution

Extract a Svelte 5 snippet inside `AdminConsole.svelte` for the in-row buttons:

```svelte
{#snippet copyButton(invite: Invite, target: CopyTarget, label: string)}
  <button type="button" class="btn btn-ghost"
    class:copied={copied === copyKey(invite.token, target)}
    onclick={() => copy(copyKey(invite.token, target), target === 'code' ? invite.token : invite.url)}>
    {copied === copyKey(invite.token, target) ? 'Copied!' : label}
  </button>
{/snippet}
```

and render it four times (`{@render copyButton(invite, 'code', 'Copy code')}` etc.). The
`InviteMenu` items have different markup (`more-menu-item`) so leave them; the shared `copyKey`
helper already keeps the keys in agreement there.

### [Correctness] Native console shows a stale success flash after logout → login

**File(s):** `web/src/routes/admin/native/+page.svelte` (`signOutLocally`, lines 27–35; `flash`
state, line 22; `login`, lines 135–158) @ 9ae62ff1

**Priority:** P3

#### Problem

`signOutLocally` resets `session`, `authed`, `invites`, `persistent`, and `loginError`, but never
clears `flash`:

```ts
function signOutLocally(message: string | null = null) {
  session = '';
  authed = false;
  invites = [];
  persistent = ASSUME_PERSISTENT;
  loginError = message;
  setAdminLinkVisible(false);
  void clearAdminSession();
}
```

`login()` (line 136) clears only `loginError`. `AdminConsole` renders `flash` only in the authed
branch (lines 179–188 of `AdminConsole.svelte`), so the sequence: add a token (→
`flash = { kind: 'success', text: 'Added “X”' }` in `mutate`, line 164) → sign out → sign back in
re-enters the authed branch with the old flash still set, and the console greets the fresh session
with a stale "Added “X”" banner for an action from the previous session. The web `/admin` twin has
no such leak (its flash derives from the per-request `form` prop).

#### Proposed solution

Add `flash = null;` to `signOutLocally` (or clear it at the top of `login()`, symmetric with
`loginError = null`). One-line fix; the admin E2E spec's native sign-out path is the natural place
to pin it if coverage is wanted.

### [Maintainability] `getTokens` has no production caller — test-only export without the required marker

**File(s):** `web/src/lib/server/tokens.ts` (`getTokens`, lines 132–136) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
/** All currently allowed access tokens. */
export async function getTokens() {
  const { list } = await readStore();
  return [...list];
}
```

Every production consumer uses something else: the `/admin` loader and `/api/admin/tokens` call
`getTokensStatus()` (they need the `persistent` flag), and the generation/verification paths call
`isAllowedToken()`. The only callers of `getTokens` are in `tokens.test.ts` (lines 110–116, 314).
CLAUDE.md's no-speculative-surface rule: "a seam kept only for tests gets a comment saying so at the
declaration" — and ideally the seam wouldn't exist, since `getTokensStatus().tokens` covers the same
need.

#### Proposed solution

Delete `getTokens` and rewrite the handful of test assertions against `getTokensStatus()` (e.g.
`(await getTokensStatus()).tokens`). If keeping it is preferred for test ergonomics, add the
convention's test-seam comment at the declaration — but removal is cleaner and shrinks the public
surface of a security-sensitive module.

### [Types] `recordTokenUsage` casts blob data without the runtime validation its sibling reader applies

**File(s):** `web/src/lib/server/usage.ts` (`recordTokenUsage`, lines 58–66; contrast `getUsage`,
line 123) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
const existing = await store.getWithMetadata(token, { type: 'json' });
const prev = (existing?.data as Partial<TokenUsage> | null) || {};
const next: TokenUsage = {
  count: (prev.count || 0) + 1,
```

The cast is at a storage boundary but with *no* runtime validation — CLAUDE.md allows `as` only
"where typed code meets untyped input … after runtime validation". `getUsage` in the same file does
validate (`usage && typeof usage.count === 'number'`, line 123) before trusting the blob, so the
module is internally inconsistent. Concretely: if a usage blob ever holds `count` as a string (a
hand-edit in the Netlify dashboard, or an older/foreign writer), `("3" || 0) + 1` produces the
string `"31"` and the corrupted value is written back as the new tally — the exact "spot a token
going rogue" signal this store exists for silently becomes garbage, while `getUsage` then hides the
row entirely (non-number `count`), so the admin sees "Never used" for an actively used token.

#### Proposed solution

Validate before use, mirroring the reader:

```ts
const prev = existing && typeof (existing.data as Partial<TokenUsage>)?.count === 'number'
  ? (existing.data as Partial<TokenUsage>)
  : {};
```

or extract a tiny `parseTokenUsage(data: unknown): Partial<TokenUsage>` guard used by both
`recordTokenUsage` and `getUsage` so the two ends of the store share one notion of a well-formed
record.

### [Testing] The client `Usage` mirror of server `TokenUsage` has no drift guard

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte` (`Usage` interface, lines 8–16) @
9ae62ff1; `web/src/lib/server/usage.ts` (`TokenUsage`, lines 10–16)

**Priority:** P3

#### Problem

`AdminConsole.svelte` re-declares the usage record shape:

```ts
// Per-token AI generation tally (mirrors $lib/server/usage TokenUsage). Kept
// structural here so this client component never imports server code.
export interface Usage {
  count: number;
  firstUsed: string;
  lastUsed: string;
  lastStyle: string | null;
  lastPrompt: string;
}
```

Not importing server code from a client component is a sound, commented decision. But the
*agreement* between `Usage` and `TokenUsage` is maintained purely by the "mirrors" comment —
precisely what CLAUDE.md forbids: "when the agreeing sites can't share code … add a drift-guard test
that reads both sides and fails on divergence." If `TokenUsage` grows or renarrows a field (e.g.
`lastPrompt` becomes nullable under issue #228's minimization work), the `/admin` loader keeps
compiling (the extra/changed field flows through `PageData` structurally) and the console silently
renders wrong or missing data.

#### Proposed solution

Tests are explicitly excepted from the no-server-import rule, so add a type-level drift guard in an
existing node test (e.g. `adminFormat.test.ts`, which already imports `Usage` adjacent types):

```ts
import type { Usage } from './components/admin/AdminConsole.svelte';
import type { TokenUsage } from './server/usage';
// Mutual assignability: fails to compile the moment the shapes diverge.
const _serverToClient: Usage = {} as TokenUsage;
const _clientToServer: TokenUsage = {} as Usage;
```

(`expectTypeOf<TokenUsage>().toEqualTypeOf<Usage>()` from Vitest is the tidier spelling.) Zero
runtime cost; `svelte-check`/`vitest` both catch it.

### [Testing] `parseSnapshot` and its guards are component-inline logic whose only coverage is E2E

**File(s):** `web/src/routes/admin/native/+page.svelte`
(`isInvite`/`isSnapshot`/`responseError`/`parseSnapshot`, lines 48–92) @ 9ae62ff1

**Priority:** P3

#### Problem

Forty-plus lines of pure response-parsing logic — two hand-rolled type guards, an error extractor,
and the `SnapshotResult` state machine (401 → expired, malformed → error, ok → data) — live inline
in the `<script>` of a Svelte page. The testing rule is direct about this: "Imperative logic whose
only coverage is E2E (inline in a component or config) is an extraction candidate: pure injectable
module + unit tests." Today the only exercise these branches get is `web/tests/admin.spec.ts`, which
can't cheaply reach cases like "200 with a malformed body", "non-401 error with a JSON `error`
field", or "401 during a mutation vs during the initial load". Note: issue #567 (share
request/response contract types between API routes and client callers) will likely replace the
guards themselves; the extraction is complementary — wherever the validation ends up, it should be a
plain module, not page-inline.

#### Proposed solution

Move the four functions and the `SnapshotResult` type into a sibling plain-TS module, e.g.
`web/src/routes/admin/native/snapshot.ts`, exporting
`parseSnapshot(response: Response): Promise<SnapshotResult>`, and add a colocated `snapshot.test.ts`
(node environment, `new Response(...)` fixtures) covering the 401 / malformed / error-body / happy
paths. The page keeps only `applySnapshot`, which is where the state writes belong. If #567 lands
first, fold this into that work rather than doing it twice.

### [Correctness] CAS retry loops re-read instantly, so under replica lag the retries are spent in microseconds

**File(s):** `web/src/lib/server/tokens.ts` (`mutateList`, lines 182–194) @ 9ae62ff1;
`web/src/lib/server/usage.ts` (`recordTokenUsage`, lines 57–70)

**Priority:** P4

#### Problem

`tokens.ts` itself documents (lines 25–32) why an instant re-read after a lost write is futile under
eventual consistency: "rereading instantly just re-hits the same lag; a short, growing pause gives
eventual consistency a moment to converge" — and `confirmSeedRaceWinner` accordingly paces its
re-reads with `SEED_CONFIRMATION_BACKOFF_MS`. But the two CAS loops ignore their own module's
lesson: when `persist`/`setJSON` returns `modified: false`, both `mutateList` and `recordTokenUsage`
loop back to `readStore()`/`getWithMetadata` immediately. A lagging replica can serve the same stale
etag on all three attempts back-to-back, so the retry budget is exhausted in one burst and the admin
gets the 409 `TOKEN_CONFLICT_ERROR` (or the usage write is conceded) in situations a 50–150 ms pause
would have resolved.

#### Proposed solution

Reuse the existing pacing: `await sleep(SEED_CONFIRMATION_BACKOFF_MS * attempt)` before each retry
iteration (attempts 2+) in `mutateList`, and the same in `recordTokenUsage` (usage.ts would need its
own small constant or an export from a shared spot). Tradeoff: adds up to ~300 ms latency to a
genuinely conflicting admin mutation — negligible for a human-driven console, and `recordTokenUsage`
is already fire-and-forget relative to the generation response. The fake-store tests serialize
writes so they need no change; add one test asserting the retry paths still pass with fake timers if
sleep-in-tests is a concern.

### [Performance] `timeAgo` allocates an `Intl.RelativeTimeFormat` and the units table on every call

**File(s):** `web/src/lib/adminFormat.ts` (`timeAgo`, lines 12–21) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const units: [Intl.RelativeTimeFormatUnit, number][] = [ ... ];
```

Both are invariant across calls, yet are rebuilt per invocation. `Intl` formatter construction is
the classic expensive-constructor case (locale-data lookup, ICU object allocation — comfortably the
dominant cost of this function), and `timeAgo` runs once per invite row on every render of the
console list, re-running whenever `invites` is replaced (each mutation snapshot, each
`invalidateAll`). Not user-visible at today's token counts, but it's pure waste with a two-line fix,
and the constants convention prefers named module-scope values for tables like this anyway.

#### Proposed solution

Hoist both to module scope:

```ts
const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const TIME_AGO_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [ ... ];
```

Note the module is client-loaded only (both consoles), so module-eval cost moves to first import —
fine. The existing `adminFormat.test.ts` cases pass unchanged.

### [Docs] `timeAgo`'s comment promises a plain-date fallback the code doesn't implement

**File(s):** `web/src/lib/adminFormat.ts` (lines 7–11) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// Compact "3 days ago" label for a last-used timestamp, falling back to a
// plain date if the value won't parse.
export function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
```

The fallback is an empty string, not a plain date (an unparseable value has no date to show, so `''`
is the only sensible fallback — the comment describes a behavior that can't exist). Downstream,
`AdminConsole.svelte` line 235 renders `last used {timeAgo(invite.usage.lastUsed)}`, which for a
corrupt timestamp shows the dangling fragment "last used ". The test at `adminFormat.test.ts` line
18 pins the empty-string behavior, so the comment is simply wrong.

#### Proposed solution

Fix the comment ("returns '' if the value won't parse") — and optionally harden the call site to
skip the "last used" fragment when `timeAgo` returns `''`. If the dangling-label case is deemed
worth handling, that's a two-line `{#if}` in `AdminConsole.svelte`; the comment fix alone resolves
the finding.

### [Maintainability] The `[ai-usage]` log-line format is duplicated between the BYOK and managed-token writers

**File(s):** `web/src/lib/server/usage.ts` (`recordByokUsage`, lines 27–31; `recordTokenUsage`,
lines 51–53) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
`[ai-usage] token=byok style=${style || 'none'} prompt=${JSON.stringify(prompt)} at=${
  new Date().toISOString()
}`;
```

```ts
`[ai-usage] token=${maskToken(token)} style=${style || 'none'} prompt=${
  JSON.stringify(prompt)
} at=${now}`;
```

The structured format (`[ai-usage] token=… style=… prompt=… at=…`) is the de-facto schema for anyone
grepping the Netlify function log or wiring a log drain, and it exists twice with only the token
label differing. `usage.test.ts` (line 37) pins the format with a regex — against only the BYOK
variant, so the managed-token line can drift (field renamed, reordered) without any test failing,
silently splitting the log schema in two.

#### Proposed solution

Extract one formatter:

```ts
function usageLogLine(
  tokenLabel: string,
  style: string | null,
  prompt: string,
  at: string,
): string {
  return `[ai-usage] token=${tokenLabel} style=${style || 'none'} prompt=${
    JSON.stringify(prompt)
  } at=${at}`;
}
```

called with `'byok'` and `maskToken(token)` respectively. The existing regex test then covers both
call sites by construction.

### [Types] Native console's `authedFetch` takes a bare `string` method

**File(s):** `web/src/routes/admin/native/+page.svelte` (`authedFetch`, line 37) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
async function authedFetch(method: string, body?: { token: string }) {
```

The endpoint supports exactly three methods, and the callers already prove it: `mutate` is typed
`(method: 'POST' | 'DELETE', …)` (line 160) and the two other call sites pass the literal `'GET'`
(lines 122, 153). CLAUDE.md: "a value drawn from a fixed vocabulary … is a literal union … threaded
end to end — never bare `string`." As written, a typo like `authedFetch('PSOT')` type-checks and
fails only at runtime with a confusing 405.

#### Proposed solution

`async function authedFetch(method: 'GET' | 'POST' | 'DELETE', body?: { token: string })` — or
tighter, encode the valid combinations (`'GET'` never carries a body):
`(method: 'GET') | (method: 'POST' | 'DELETE', body: { token: string })` via two overloads if that
reads better. The one-union change is sufficient.

### [Maintainability] Copy-feedback duration is a bare `1500` literal

**File(s):** `web/src/lib/components/admin/AdminConsole.svelte` (`copy`, line 111) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
setTimeout(() => {
  if (copied === key) copied = '';
}, 1500);
```

The 1.5 s "Copied!" flash duration is exactly the class of value CLAUDE.md's tuning-literal rule
targets: "a numeric literal that encodes a tunable decision — threshold, duration … gets a named
module-scope constant with the unit in the name (`_MS` …)". Anyone tuning the feedback (or reusing
it in `InviteMenu`) has to find a naked number inside a callback.

#### Proposed solution

```ts
const COPY_FEEDBACK_MS = 1500;
```

at module scope (the `<script module>` block is a fine home since `copyKey` already lives there) and
use it in the `setTimeout`.

### [Testing] `createIssue` has zero test coverage — only the Markdown escaper is tested

**File(s):** `web/src/lib/server/github.ts` (`createIssue`, lines 56–85) @ 9ae62ff1;
`web/src/lib/server/github.test.ts`

**Priority:** P4

#### Problem

`github.test.ts` covers `escapeIssueMarkdown` thoroughly (6 cases) but nothing else in the module.
Untested behavior in `createIssue`: the missing-token throw (line 60), the request contract (Bearer
header, `X-GitHub-Api-Version`, the User-Agent GitHub mandates — line 62–73), the non-201 error path
including the `res.text().catch(() => '')` fallback and 300-char truncation (lines 75–78), and the
malformed-payload rejection (lines 80–83). Any of these regressing (say, dropping the `User-Agent`
header during a refactor — which makes GitHub reject every report) would ship silently; the
`/api/report` endpoint tests presumably mock this seam, so nothing exercises the real request shape.

#### Proposed solution

Add `describe('createIssue')` cases using `vi.stubGlobal('fetch', …)` (the file already mocks
`$env/dynamic/private`; extend the env mock so `config.githubIssueToken()`/`githubIssueRepo()`
resolve): (1) happy path asserts URL, method, headers, and body; (2) 404/422 response → throws with
status and truncated detail; (3) 201 with missing `html_url` → throws the unexpected-payload error;
(4) unset token → throws without fetching. Node-environment, no network — cheap and fast.

### [Types] The invite pair shape is re-declared inline instead of being a named export of its builder

**File(s):** `web/src/lib/server/admin.ts` (`buildInvites`, lines 87–92) @ 9ae62ff1;
`web/src/routes/admin/+page.server.ts` (line 64)

**Priority:** P4

#### Problem

`buildInvites` has no named return type, so its consumers each improvise: the `/admin` loader writes
the shape out longhand —

```ts
invites: [] as { token: string; url: string }[],
```

— and `/api/admin/tokens/+server.ts` reaches for `invites: ReturnType<typeof buildInvites>` (line
21). The inline `as` on an empty array is an annotation-by-cast that duplicates the shape by hand,
and `ReturnType<typeof …>` is an indirection where a noun would do. (Issue #567 covers sharing
contract types between API routes and *client* callers; this is the server-internal half — a named
type would also give #567 something to re-export.)

#### Proposed solution

In `admin.ts`:

```ts
export type Invite = { token: string; url: string };
export function buildInvites(tokens: string[], origin: string): Invite[] { … }
```

Then the loader's unauthed branch becomes `invites: [] satisfies Invite[]` (or a typed
`const NO_INVITES: Invite[] = []`), and the API route's `TokenSnapshot` uses `invites: Invite[]`.
Name collision warning: `AdminConsole.svelte` exports a client-side `Invite` (with the optional
`usage` field) — the server type is its base; keep the names distinct or import aliased in any file
that sees both.

### [Maintainability] `SESSION_MAX_AGE` lacks the unit suffix the constants convention requires

**File(s):** `web/src/routes/admin/+page.server.ts` (line 25) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const SESSION_MAX_AGE = 60 * 60 * 24 * 365 * 10;
```

Cookie `maxAge` is seconds, but nothing in the name says so — and this repo has both conventions in
play (`_MS` timers everywhere else), so a reader must recall the cookie API to know the unit.
CLAUDE.md: "a named module-scope constant with the unit in the name (`_MS`, `_PX` …)".

#### Proposed solution

Rename to `SESSION_MAX_AGE_S` (one call site, line 32). Trivial, but it's the convention's exact
letter.

### [Readability] `targetRepo()` is a single-use one-line indirection

**File(s):** `web/src/lib/server/github.ts` (lines 12–14, sole use line 62) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
function targetRepo(): string {
  return config.githubIssueRepo();
}
```

Called exactly once, inside the fetch URL template (line 62). It renames `config.githubIssueRepo()`
without adding behavior, defaulting, or validation — a reader chasing the URL has to hop through it
only to land on the config call the name already described. Its sibling `isReportingConfigured()` is
different: it *is* the module's exported feature-flag seam with an external caller.

#### Proposed solution

Inline it: ``fetch(`${GITHUB_API}/repos/${config.githubIssueRepo()}/issues`, … )`` and delete the
function.

### [Maintainability] GitHub error-detail truncation length is a bare `300`

**File(s):** `web/src/lib/server/github.ts` (`createIssue`, line 77) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
throw new Error(`GitHub issue creation failed (${res.status}): ${detail.slice(0, 300)}`);
```

The truncation cap is a tunable log-hygiene decision (how much of an arbitrary GitHub error body may
enter the thrown message and any downstream log), which per the tuning-literal rule should be a
named constant carrying its unit.

#### Proposed solution

```ts
const ERROR_DETAIL_MAX_CHARS = 300;
```

with the WHY (bound the log line; GitHub error bodies can be large HTML) on the constant.

### [Architecture] `ASSUME_PERSISTENT` is a status default living in a formatting module

**File(s):** `web/src/lib/adminFormat.ts` (lines 3–5) @ 9ae62ff1

**Priority:** P5

#### Problem

`adminFormat.ts` advertises itself (by name and by its other exports, `timeAgo`/`usageDetail`) as
display formatting, yet its first export is a behavioral default for the Blobs-persistence banner:

```ts
export const ASSUME_PERSISTENT = true;
```

It's imported by both console pages (`routes/admin/+page.server.ts` line 6,
`routes/admin/native/+page.svelte` line 7) precisely because it needs a client-safe shared home —
but a first-time reader grepping for the banner's initial state won't look in a "format" module, and
a formatter importing nothing about persistence has no reason to own it.

#### Proposed solution

Move it into `AdminConsole.svelte`'s `<script module>` block, which is already the shared,
client-safe home for the console's contract types (`Invite`, `Flash`, `copyKey`) that both pages
import. Alternative: rename the module to something honest like `adminConsoleShared.ts` — but the
component-module home is the smaller change and keeps one shared surface.

### [Maintainability] The mutation success-message copy is duplicated between the two front doors

**File(s):** `web/src/routes/admin/+page.server.ts` (`tokenMutation`, line 100) @ 9ae62ff1;
`web/src/routes/admin/native/+page.svelte` (lines 183–185)

**Priority:** P5

#### Problem

The web action builds `` `${verb} “${token}”` `` (with `verb: 'Added' | 'Removed'`), and the native
page independently hardcodes `` `Added “${token}”` `` / `` `Removed “${token}”` `` as `mutate`'s
`message` arguments. The two consoles deliberately present one identical UI (shared `AdminConsole`),
so identical actions wording success differently would read as a bug; today only coincidence keeps
the strings (including the curly quotes) aligned. Low stakes — divergence breaks nothing
functionally — hence P5.

#### Proposed solution

Export a tiny formatter from the shared client-safe home (see the `ASSUME_PERSISTENT` finding — same
destination): `export const mutationMessage = (verb: 'Added' | 'Removed', token: string) =>`
${verb} “${token}”`;` and use it in both pages. The `tokenActions.integration.test.ts` assertion at
line 82 keeps pinning the rendered result.

### [Readability] tokens.ts header comment uses the temporal phrasing the comment convention bans

**File(s):** `web/src/lib/server/tokens.ts` (lines 5–8) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
// Access tokens used to be a static comma-separated env var (ALLOWED_TOKENS_LIST).
// They now live in Netlify Blobs so they can be added/removed at runtime from the
// admin page. The env var is only used as a one-time seed on first read, ...
```

"used to be" / "now live" is history-relative narration — CLAUDE.md: "A comment that does survive
states stable facts: no temporal phrasing ('now', 'previously')." As the migration recedes, the
first sentence becomes trivia, and the load-bearing facts (Blobs is the store; the env var is only a
first-read seed) are buried behind it.

#### Proposed solution

Restate as stable facts: "Access tokens live in Netlify Blobs so they can be added/removed at
runtime from the admin page. ALLOWED_TOKENS_LIST is only a one-time seed on first read, which keeps
pre-Blobs deployments and local dev working." Same information, no timeline.

## Source: Code audit — Routes / app shell / dev harness

### [Architecture] Centralize the dev-harness gate in a `routes/dev/+layout.ts` so new harnesses are gated by default

**File(s):** `web/src/routes/dev/+page.ts` (lines 7–12), `web/src/routes/dev/design/+page.ts` (lines
7–12) @ 9ae62ff1 (same pattern in `dev/engine/+page.ts` and `dev/ai-timer/+page.ts`, owned by other
sections)

**Priority:** P2

#### Problem

Every page under `routes/dev/*` repeats the identical boilerplate:

```ts
export const prerender = false;

export const load: PageLoad = () => {
  requireDevHarness();
  return {};
};
```

Four copies exist today (`dev/+page.ts`, `dev/design/+page.ts`, `dev/engine/+page.ts`,
`dev/ai-timer/+page.ts`). Beyond the duplication, the security posture is opt-in: a future
`/dev/crayon` playground (already floated in issue \#382) ships to production unless its author
remembers to add the `load` gate. `devHarness.ts:10` even instructs "call it from every dev-harness
`load`/request handler" — a per-page convention maintained by prose, which is exactly the failure
mode the repo's cross-file-agreement rule exists to prevent. The gate should be structural: anything
placed under `routes/dev/` should 404 in production with zero per-page code.

#### Proposed solution

Add `web/src/routes/dev/+layout.ts`:

```ts
import { requireDevHarness } from '$lib/devHarness';
import type { LayoutLoad } from './$types';

export const prerender = false;

export const load: LayoutLoad = () => {
  requireDevHarness();
  return {};
};
```

A layout `load` runs before any child page renders, so the whole subtree is gated; delete the
now-redundant `load` functions and `prerender = false` exports from the four `+page.ts` files
(`dev/engine/+page.ts` keeps its `ssr = false` and its comment). Gotchas: (a) the `+server.ts` under
`dev/ai-timer/artifacts/[name]/` does **not** run layout loads — server endpoints must keep their
own `requireDevHarness()` call, so soften (don't delete) the "call it from every load" comment in
`devHarness.ts` to say pages are covered by `routes/dev/+layout.ts` and only `+server.ts` handlers
need their own call; (b) confirm the Playwright engine spec still reaches `/dev/engine` under
`PUBLIC_ENABLE_DEV_HARNESS=true` (it should — the gate logic is unchanged, only its location moves).

### [Testing] The boot script's brush (`'crayon' | 'magic'`) and theme (`'light' | 'dark'`) value literals are unguarded

**File(s):** `web/src/app.html` (lines 114–118), `web/src/app.html.test.ts` @ 9ae62ff1

**Priority:** P3

#### Problem

The boot script re-types two closed value sets as literals:

```js
var brush = localStorage.getItem('splotch-brush-type');
if (brush === 'crayon' || brush === 'magic') el.setAttribute('data-brush', brush);

var theme = localStorage.getItem('splotch-theme');
if (theme === 'light' || theme === 'dark') el.setAttribute('data-theme', theme);
```

The brush set mirrors `tool.svelte.ts` (`BrushType = 'pen' | 'crayon' | 'magic' | 'eraser'`, with
`readBrush` at lines 46–50 accepting everything but `'eraser'`, and `'pen'` being the no-attribute
default); the theme set mirrors `theme.ts`'s `isThemePreference` minus `'system'`. Neither is
covered by `app.html.test.ts`, which stops at keys, boolean defaults, the clamp, and the route. Add
a fourth persistable ink brush (say `'chalk'`) and every stored-chalk user gets a pen-faced Brush
Button at first paint with all tests green — the identical silent-divergence failure the file's own
header comment (lines 15–20) describes for keys and defaults.

#### Proposed solution

In `app.html.test.ts`, import `BRUSH_TYPES` from `$lib/state/tool.svelte` (the file already
tolerates happy-dom imports with load-time storage reads — see its lines 1–4) and assert the boot
literal set equals the persistable non-default set:

```ts
it('stamps data-brush for every persistable non-default brush', () => {
  const bootBrushes = bootScript.match(/brush === '(\w+)' \|\| brush === '(\w+)'/)!.slice(1, 3);
  expect(new Set(bootBrushes)).toEqual(
    new Set(BRUSH_TYPES.filter((b) => b !== 'pen' && b !== 'eraser')),
  );
});
```

For the theme pair, either export a `RESOLVED_THEMES: ResolvedTheme[]` constant from `theme.ts` to
assert against, or at minimum assert the two literals with the same regex approach. Gotcha: the
`'pen'`/`'eraser'` exclusions re-state knowledge from `tool.svelte.ts` (`DEFAULT_BRUSH`, the
`readBrush` eraser filter) — importing `DEFAULT_BRUSH` (would need exporting) makes the test track a
default change too.

### [Correctness] `installWakeLock` teardown never releases the held sentinel

**File(s):** `web/src/lib/boot/wakeLock.ts` (`installWakeLock`, lines 3–25) @ 9ae62ff1

**Priority:** P3

#### Problem

The teardown only removes the listeners:

```ts
return () => {
  document.removeEventListener('pointerdown', onFirstPointerDown);
  document.removeEventListener('visibilitychange', onVisibilityChange);
};
```

The `WakeLockSentinel` acquired on the first pointerdown is never released. `installWakeLock` is a
page-scoped boot step — `routes/+page.svelte:83–92` runs the teardown on unmount precisely so the
drawing route's behaviors don't leak to other routes (the same commit scoped the zoom/scroll locks
per ADR-0076). But after a client-side navigation from `/` to `/privacy` (the Parent Center links
there), the screen-sleep suppression persists for the life of the tab: a parent who leaves the
privacy policy open keeps burning battery with a screen that never dims, on a route that has no
reason to hold a wake lock.

#### Proposed solution

Release in the teardown and null the handle:

```ts
return () => {
  document.removeEventListener('pointerdown', onFirstPointerDown);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
};
```

`release()` on an already-released sentinel resolves fine, so no released-state check is needed.
Cheap to unit-test with a mocked `navigator.wakeLock` (the module currently has no test at all —
worth adding while touching it).

### [Maintainability] `/dev/design`'s `nonColorKeys` hand-list duplicates token-kind knowledge that belongs in `tokens.ts`

**File(s):** `web/src/routes/dev/design/+page.svelte` (lines 23–30, 81) @ 9ae62ff1

**Priority:** P3

#### Problem

The styleguide classifies theme tokens by hand:

```ts
// Tokens whose value isn't a paintable color get listed as text, not swatches.
const nonColorKeys = new Set<keyof ThemeTokens>([
  'lineartFilter',
  'lineartBlend',
  'floatShadow',
  'floatShadowFlyout',
]);
```

and separately excludes `brandTintFilter` inline at line 81
(`Object.entries(brand).filter(([k]) => k !== 'brandTintFilter')`) — two different exclusion
mechanisms for the same concept. When someone adds a new non-color theme token (another filter, a
gradient, a shadow), this page silently renders it as a blank/garbage swatch, defeating the page's
stated purpose ("If it's not on this page, it's not part of the visual language", line 62). The
classification "this token is not a paintable color" is a fact about the token, owned by
`tokens.ts`, currently re-derived by hand in a consumer — the shape CLAUDE.md's closed-value-set and
cross-file-agreement rules both target.

#### Proposed solution

Move the classification to the source: either export a
`NON_COLOR_THEME_TOKENS: ReadonlySet<keyof ThemeTokens>` (and a brand equivalent, or a naming
convention like `*Filter`/`*Blend`/`*Shadow` checked by one exported predicate `isColorToken(key)`),
or derive it — a token whose value doesn't parse as a color (`CSS.supports('color', value)` works
in-browser; a regex works at build time) is non-color. The styleguide then imports the predicate,
and the inline `brandTintFilter` special case collapses into the same mechanism. Tradeoff: a
derivation is self-maintaining but slightly magic; an exported set is explicit but still a list —
either way it lives next to the tokens it describes, and `tokens.ts`'s own tests can pin it.

### [Testing] `buildVersion.test.ts` lives two directories away from the module it tests

**File(s):** `web/src/lib/buildVersion.test.ts` (line 3) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
import { buildMetadata, deriveWebVersion } from '../../buildVersion';
```

The subject is `web/buildVersion.ts` (build-time config code), but its test is filed under
`web/src/lib/` — presumably because `vitest.config.ts:31` only includes
`src/**/*.{test,spec}.{js,ts}`. The repo's testing rule is colocation ("Vitest unit tests
(`src/**/*.test.ts`), colocated with source"), and this file silently violates the spirit while
satisfying the glob: someone editing `web/buildVersion.ts` sees no sibling test and can reasonably
conclude it's untested; conversely, a reader browsing `src/lib/` finds a test for something that
isn't in `src/` at all. Nothing in the file explains the placement.

#### Proposed solution

Widen the vitest `include` to also match `*.test.ts` at the `web/` root (e.g.
`['src/**/*.{test,spec}.{js,ts}', '*.test.ts']`) and move the file to `web/buildVersion.test.ts`
beside its subject — it's already `// @vitest-environment node`, so no DOM-environment concern. If
widening the glob is unwanted (risk of accidentally picking up config-adjacent files), the minimal
fix is a one-line comment at the top of the test explaining why it lives in `src/lib/`, so the
placement reads as deliberate instead of lost. The move is strictly better for grepability; check
nothing else (coverage config, CODE-MAP LOC buckets) keys on the current path.

### [Correctness] `mountBootHiddenOverlays` discards the idle-callback cancel handle and leaves `onParentCenter` unguarded

**File(s):** `web/src/lib/boot/bootHiddenOverlays.ts` (`mountBootHiddenOverlays`, lines 15–47) @
9ae62ff1

**Priority:** P4

#### Problem

Two gaps in the teardown story:

```ts
let stopped = false;
scheduleIdle(() => {            // cancel handle returned by scheduleIdle is dropped
  import('$lib/components/bootHiddenOverlays')
    .then((module) => {
      onParentCenter(module.ParentCenter);   // runs even when stopped
      ...
```

(a) `scheduleIdle` returns a cancel function (see `lib/idle.ts:6–13`) that this caller throws away;
the returned teardown only flips `stopped`. If the drawing page unmounts before the idle callback
fires (fast navigation to `/privacy`), the callback still runs and kicks off the dynamic chunk
import for a page that's gone — wasted network/parse on exactly the slow devices the idle pump
exists to protect. (b) Inside the `.then`, `mountNext()` checks `stopped` but
`onParentCenter(module.ParentCenter)` does not, so the unmounted page's `$state` setter still runs.
Harmless in practice today (writing to orphaned `$state` is inert), but the asymmetry — one callback
guarded, its sibling not — reads as an oversight, and the comment at lines 15–17 explains the
`stopped` flag as *the* guard for "running after unmount".

#### Proposed solution

Keep and use the cancel handle, and guard the whole continuation:

```ts
let stopped = false;
const cancelIdle = scheduleIdle(() => { ... });
// inside .then:
if (stopped) return;
onParentCenter(module.ParentCenter);
...
return () => {
  stopped = true;
  cancelIdle();
};
```

The `stopped` flag is still needed (the cancel can't reach the in-flight import continuation, as the
existing comment says), but the two mechanisms together close both windows.

### [Correctness] `body { width: 100vw }` causes horizontal overflow on body-scrolling routes

**File(s):** `web/src/app.css` (lines 20–31) @ 9ae62ff1

**Priority:** P4

#### Problem

```css
body {
  width: 100vw;
  height: 100vh;
  ...
  height: 100dvh;
```

`100vw` is the viewport width *including* the vertical scrollbar gutter. On the drawing route this
is masked (`overflow: hidden` under `[data-app-surface]`), and `/privacy` and `/dev/design` scroll
inside `position: fixed` / fixed-height containers — but `/dev` (the harness index) scrolls the body
itself (`.index { min-height: 100dvh; ... }`, `dev/+page.svelte:48–55`). On any browser with classic
(non-overlay) scrollbars, the moment the index grows a vertical scrollbar the body is ~15px wider
than the available space and a horizontal scrollbar appears. The same trap awaits any future
normal-document route, which ADR-0076 explicitly invites ("any page added later ... is a normal
scrollable ... document by default"). `width: 100vw` also buys nothing: `body` is a block element
and fills its containing block at `width: auto`.

#### Proposed solution

Delete the `width: 100vw` declaration (or replace with `width: 100%` if an explicit width is wanted
for clarity). Verify the drawing route and `/privacy` visually after the change — `run-splotch`
covers all three surfaces — but since block-level `auto` width equals `100%` here, no pixel should
move except the overflow fix.

### [Readability] Portrait `.app-container` height overrides are redundant with `height: 100%`

**File(s):** `web/src/app.css` (lines 56–83) @ 9ae62ff1

**Priority:** P4

#### Problem

`.app-container` already gets `height: 100%` (line 59), resolving against `body`'s `100dvh` (the
`display: contents` wrapper in `app.html:128` generates no box, so percentages resolve against
`body`). The portrait media query then re-declares the same height directly:

```css
@media (orientation: portrait) {
  .app-container {
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }
}
```

`100dvh` here equals the inherited `100%`-of-`100dvh` in every case, so the two height lines are
dead weight — and actively misleading: a reader hunting for why portrait sizing differs from
landscape will study these lines for a difference that doesn't exist. They also re-encode the vh→dvh
fallback pattern a second time, whose rationale comment lives only on the `body` rule (lines 23–27).
The media query's real payload is one line: `flex-direction: column`.

#### Proposed solution

Delete the two `height` declarations from the portrait block, leaving `flex-direction: column`.
Verify with a quick portrait screenshot (the palette-centering symptom described in the body comment
is the regression to watch). If a real historical reason for the direct heights exists (e.g. a
browser where percentage-of-dvh misresolved), it's exactly the kind of WHY that must be a comment —
but git history for these lines predates the dvh comment, and the current code gives no such reason.

### [Maintainability] `.flyout-option`'s `60px` silently mirrors `ACTION_BUTTON_BASE_LANDSCAPE`

**File(s):** `web/src/app.css` (lines 289–311) @ 9ae62ff1

**Priority:** P4

#### Problem

```css
.flyout-option {
  width: calc(60px * var(--action-btn-scale, 1));
  height: calc(60px * var(--action-btn-scale, 1));
```

The `60` is the landscape action-button base size — `web/src/lib/actionButtonLayout.ts:19` exports
`ACTION_BUTTON_BASE_LANDSCAPE = 60`, and `ActionsPanel.svelte:569` uses the same
`calc(60px * var(--action-btn-scale, 1))` expression for the buttons the flyout options are designed
to visually match. Three sites, one value, zero linkage: bump the base button size and the flyout
options stay 60px, with nothing failing. This is the exact case CLAUDE.md's cross-file rule
addresses — agreeing sites that can't share code (CSS can't import TS) get either a generated
constant or a drift-guard test.

#### Proposed solution

Since `tokens.css` is already generated from TS (ADR-0071, `gen:tokens`), the cleanest fix is a
generated custom property (e.g. `--action-btn-base-landscape: 60px;`) sourced from
`ACTION_BUTTON_BASE_LANDSCAPE`, consumed by both `app.css` and `ActionsPanel.svelte`. Cheaper
alternative: a drift-guard test in `actionButtonLayout.test.ts` that reads `app.css` (and the
`ActionsPanel.svelte` style block) and asserts the `calc(<N>px * var(--action-btn-scale` literals
equal the exported constant — the same pattern as `app.html.test.ts`. Gotcha: confirm the flyout's
`60px` is genuinely intended to track the landscape base (the visual parity with action buttons
strongly suggests it) rather than coincidentally equal; if it's a coincidence, the fix is instead a
comment saying so.

### [Readability] The boot-script comment restates the clamp values and says "keep them in sync" instead of naming its drift guard

**File(s):** `web/src/app.html` (lines 73–74) @ 9ae62ff1

**Priority:** P4

#### Problem

```
The keys, defaults, and the 70/130/100 scale clamp mirror settings.svelte.ts
(ACTION_BUTTON_SCALE_* and BOOL_SETTINGS) — keep them in sync.
```

Two convention violations in one sentence. First, it restates the mutable values `70/130/100`, which
are owned by `ACTION_BUTTON_SCALE_MIN/MAX/DEFAULT` in `settings.svelte.ts:86–88` — CLAUDE.md: "no
restating mutable facts (counts, dates, values ...) owned elsewhere — name the owning identifier".
Change the clamp and this comment silently lies. Second, "keep them in sync" is the phrasing
CLAUDE.md calls "a defect, not a mitigation" — yet here the sync *is* mechanically enforced by
`app.html.test.ts`, and the comment doesn't say so. A reader (or agent) editing the boot script has
no pointer to the test that will fail, and may conclude the mirroring is guarded by vigilance alone.
(`app.html.test.ts:19–20` even quotes this comment as the problem it solves — the comment was never
updated when the test landed.)

#### Proposed solution

Reword the tail of the comment block to name the guard and drop the literals, e.g.: "The keys,
defaults, and the scale clamp mirror settings.svelte.ts (`ACTION_BUTTON_SCALE_*`, `BOOL_SETTINGS`);
`app.html.test.ts` fails on divergence." One-line change, no behavior.

### [Maintainability] The GitHub repo URL is a duplicated boundary string (4 copies)

**File(s):** `web/src/routes/privacy/+page.svelte` (line 12) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const CONTACT_URL = 'https://github.com/KyleMit/Splotch/issues/new/choose';
```

The `KyleMit/Splotch` repo URL is independently hardcoded in four client/server files: this page,
`lib/components/parent/AboutSection.svelte`, `lib/components/parent/WhatsNewSection.svelte`, and
`lib/server/config.ts`. A repo rename/transfer (or an org move — a real event for a project heading
to app stores) means a four-site hunt, and a missed one ships a dead support link inside the privacy
policy the stores require. CLAUDE.md's rule: boundary strings are "declared once, imported
everywhere".

#### Proposed solution

Add a tiny shared module, e.g. `web/src/lib/githubRepo.ts`:

```ts
export const GITHUB_REPO_URL = 'https://github.com/KyleMit/Splotch';
export const GITHUB_NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new/choose`;
```

and import it from the three client sites. `lib/server/config.ts` can import it too (client→server
imports are forbidden, but server→shared-lib is fine); if the server value is deliberately
configuration (env-overridable), leave it and note the intentional divergence there instead. Keep it
out of `lib/server/` so the client pages can reach it.

### [Maintainability] The dev-harness index list is hand-maintained and can silently drift from `routes/dev/*`

**File(s):** `web/src/routes/dev/+page.svelte` (lines 4–20) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const harnesses = [
  { href: '/dev/design', ... },
  { href: '/dev/engine', ... },
  { href: '/dev/ai-timer', ... },
];
```

The index's whole job is to enumerate the harnesses, but the enumeration is a hand-typed list with
no tie to the filesystem. Add `/dev/crayon` (issue \#382's plan) and the index silently omits it;
delete a harness and the index links a 404. The route set is knowledge the bundler already has.

#### Proposed solution

Derive the hrefs from the filesystem and keep only the blurbs by hand:

```ts
const routes = Object.keys(import.meta.glob('./*/+page.svelte')).map(
  (p) => `/dev/${p.split('/')[1]}`
);
const blurbs: Record<string, { name: string; blurb: string }> = { '/dev/design': {...}, ... };
```

Render from `routes`, falling back to the bare path when a blurb entry is missing — a new harness
then appears automatically (unstyled prose is a visible nudge to add its blurb, vs. today's silent
absence). Alternative with less cleverness: keep the static list and add a tiny unit test that globs
`web/src/routes/dev/*/+page.svelte` and asserts set-equality with the list's hrefs (the
`app.html.test.ts` read-both-sides pattern). Either satisfies the cross-file-agreement rule; the
test variant keeps the page dead simple.

### [Correctness] `/dev/design` blocks pinch-zoom with `touch-action: pan-y`, and both dev pages carry stale `user-select` opt-outs

**File(s):** `web/src/routes/dev/design/+page.svelte` (lines 286–295),
`web/src/routes/dev/+page.svelte` (lines 48–55) @ 9ae62ff1

**Priority:** P4

#### Problem

```css
.styleguide {
  ...
  touch-action: pan-y;
  user-select: text;
  -webkit-user-select: text;
}
```

Post-ADR-0076, the app-surface locks are scoped to the drawing route; every other route "is a normal
scrollable, selectable, zoomable document by default" (`app.css:33–47`), and `/privacy` was cleaned
accordingly (its comment at `privacy/+page.svelte:162–164` explicitly notes "no opt-out is needed").
The dev pages weren't: `user-select: text` on both pages sets the default value (a no-op opt-out
from a lock that no longer reaches them), and `touch-action: pan-y` on the styleguide actively
*disallows* pinch-zoom — the very behavior ADR-0076 restored to non-drawing routes. On a tablet, a
designer inspecting a swatch can't zoom into it. Dev-only audience, so low stakes, but the
declarations contradict the documented model and will confuse the next reader reconciling routes
against ADR-0076.

#### Proposed solution

Delete `touch-action: pan-y` and both `user-select` pairs from `.styleguide`, and the `user-select`
pair from `.index` in `dev/+page.svelte`. If any is retained deliberately (e.g. `pan-y` to stop
accidental horizontal rubber-banding), it needs a WHY comment referencing ADR-0076's default — but
the simplest reconciliation is deletion, matching `/privacy`.

### [Types] `/dev/design` widens token keys to `string`, forcing four `as keyof typeof scale` casts in the template

**File(s):** `web/src/routes/dev/design/+page.svelte` (lines 32–41, 133, 146, 173) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const spaceKeys = Object.keys(scale).filter((k) => k.startsWith('space'));
```

`Object.keys` returns `string[]`, so every downstream indexed read needs a cast — the template does
`{scale[key as keyof typeof scale]}` at lines 133, 146, and 173. Per CLAUDE.md, `as` is a boundary
tool, not a way to re-narrow a union the code itself widened; and a typo'd prefix (`'font-size'`
instead of `'fontSize'`) currently produces an empty section instead of a type error. The
`themeKeys` line above (line 22) already shows the right move:
`Object.keys(themes.light) as (keyof ThemeTokens)[]`.

#### Proposed solution

Cast once at the `Object.keys` boundary and let inference carry the rest:

```ts
const scaleKeys = Object.keys(scale) as (keyof typeof scale)[];
const spaceKeys = scaleKeys.filter((k) => k.startsWith('space'));
```

`filter` preserves the element type, so all three template casts disappear. Same treatment for
`cssVar` (line 43): typing its parameter as `keyof typeof scale | keyof ThemeTokens | ...` (or a
shared `TokenKey` union exported from `tokens.ts`) would catch the string literals passed at lines
96, 150, 159, 177 etc. against the real token vocabulary — currently `cssVar('anything')` compiles.

### [Readability] `/dev/design`'s hand-written one-off type-scale rows repeat the same 5-line block five times

**File(s):** `web/src/routes/dev/design/+page.svelte` (lines 165–199) @ 9ae62ff1

**Priority:** P4

#### Problem

After the `fontSizeKeys` loop, the Type-scale section hand-writes near-identical `scale-row` blocks
for `inputFontSize`, `fontFamily`, `fontMono`, and `fontWeightSemibold` (lines 175–197), each
differing only in the token key and which CSS property the sample styles (`font-size` vs
`font-family` vs `font-weight`). The Radius section repeats the pattern for `radiusPill` and
`borderWidth` (lines 149–162), and Elevation for the two float shadows (lines 210–217). ~40 lines of
copy-paste where the varying data is two fields — exactly the "numbered step comments / repeated
blocks → extract" shape the conventions call out, and each new one-off token grows the page by
another pasted block.

#### Proposed solution

Fold the one-offs into data the existing loop shape can render, e.g.:

```ts
const extraTypeEntries: {
  key: keyof typeof scale;
  styleProp: 'font-size' | 'font-family' | 'font-weight';
}[] = [
  { key: 'inputFontSize', styleProp: 'font-size' },
  { key: 'fontFamily', styleProp: 'font-family' },
  { key: 'fontMono', styleProp: 'font-family' },
  { key: 'fontWeightSemibold', styleProp: 'font-weight' },
];
```

and one `{#each}` whose sample span uses `style:{...}` via a small dynamic-style helper (Svelte's
`style:` directive needs a static property name, so use `style=` string interpolation for the
dynamic case — a real gotcha; the current static markup avoids it, which is worth weighing). If the
dynamic-style ergonomics feel worse than the duplication, at minimum group the four rows under one
mapped snippet (`{#snippet typeRow(key, sampleStyle)}`) so the structure is written once.

### [Correctness] A failed first wake-lock request is never retried

**File(s):** `web/src/lib/boot/wakeLock.ts` (lines 12–18) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const onFirstPointerDown = () => requestWakeLock();
const onVisibilityChange = () => {
  if (wakeLock !== null && document.visibilityState === 'visible') { ... }
};
document.addEventListener('pointerdown', onFirstPointerDown, { once: true });
```

The pointerdown listener is `{ once: true }`, so the request fires exactly once per page lifetime.
If that request rejects — `NotAllowedError` under battery-saver, a transient policy denial, low
battery on Android — `wakeLock` stays `null`, and the `visibilitychange` re-request path is
explicitly gated on `wakeLock !== null`. Result: one unlucky first tap permanently disables
screen-sleep prevention for the whole drawing session, the one feature this module exists for.
Contrast `pwa/updates.ts:66–76`, which releases its `registrationScheduled` latch on failure
precisely so "a later gate call retries".

#### Proposed solution

Track success rather than the listener firing: keep a `let requested = false` latch set only when
`request()` resolves, re-arm on failure by re-adding the once-listener (or drop `{ once: true }` and
early-return when `wakeLock` is held):

```ts
const onPointerDown = () => {
  if (wakeLock !== null) return;
  void requestWakeLock();
};
document.addEventListener('pointerdown', onPointerDown);
```

A per-pointerdown null-check is one comparison — well within the hot-path rule's budget (no
allocation, no DOM) — and makes both the retry and the visibility path self-healing. Also loosen the
`visibilitychange` guard to attempt when `wakeLock === null` but a request was previously wanted,
since a sentinel can be system-released while hidden.

### [Performance] Native builds' service-worker `$effect` subscribes to `strokeCount` forever for a no-op

**File(s):** `web/src/routes/+page.svelte` (lines 55–58) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
$effect(() => {
  if (canvasState.strokeCount < SETTLED_IN_STROKES) return;
  if (!__IS_CAPACITOR__) pwaUpdates.registerDeferredServiceWorker();
});
```

`__IS_CAPACITOR__` is a compile-time literal, so in the native build the second line
dead-code-eliminates — but the first line's reactive read survives. The effect subscribes to
`canvasState.strokeCount` and re-runs on **every stroke for the app's whole lifetime**, doing
nothing. (On web the re-runs are deliberate — `registerDeferredServiceWorker` is a retrying latch,
see `pwa/updates.ts:66–76` — so only the native ordering is wrong.)

#### Proposed solution

Put the build-time guard first:

```ts
$effect(() => {
  if (__IS_CAPACITOR__) return;
  if (canvasState.strokeCount < SETTLED_IN_STROKES) return;
  pwaUpdates.registerDeferredServiceWorker();
});
```

Native: the effect returns before any reactive read, so it runs once and never again. Web:
`if (false) return;` is eliminated and behavior is byte-identical. Micro but free, and it aligns
with the repo's stated preference for `__IS_CAPACITOR__` as the first-class build-time branch.

### [Readability] `+layout.ts` restates the SvelteKit defaults `ssr = true` and `csr = true`

**File(s):** `web/src/routes/+layout.ts` (lines 1–3) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
export const prerender = true;
export const ssr = true;
export const csr = true;
```

`ssr` and `csr` default to `true` in SvelteKit; only `prerender = true` changes anything. Restating
defaults with no comment reads as if the values were deliberate deviations, sending a reader to the
docs to discover they aren't — and it's uncommented dead configuration, which the
no-speculative-surface convention frowns on. Notably `dev/engine/+page.ts` sets `ssr = false` *with*
a five-line WHY comment; the contrast makes these bare re-defaults look like they carry similar
weight when they carry none.

#### Proposed solution

Delete the `ssr` and `csr` exports, leaving `export const prerender = true;`. If they were written
to pin behavior against a future SvelteKit default change, that intent is exactly a WHY comment —
but that's not a realistic risk SvelteKit has signaled, so deletion is the honest fix.

### [Readability] `+layout.svelte` uses an inline `import('svelte').Snippet` though `svelte` is already imported

**File(s):** `web/src/routes/+layout.svelte` (lines 2, 14–17) @ 9ae62ff1

**Priority:** P5

#### Problem

```svelte
import { onMount } from 'svelte';
...
interface Props {
  children: import('svelte').Snippet;
}
```

The file already has an import statement from `'svelte'` two lines up; the dynamic
`import('svelte').Snippet` type reference is the pattern for files that *can't* add an import
(ambient `.d.ts`), and here it just adds noise. Every other component in the repo that needs
`Snippet` imports it as a named type.

#### Proposed solution

```ts
import { onMount, type Snippet } from 'svelte';
interface Props {
  children: Snippet;
}
```

Or inline the props type entirely: `let { children }: { children: Snippet } = $props();` and drop
the single-use interface. Cosmetic, one-minute change.

### [Readability] Two modules named `bootHiddenOverlays.ts` in sibling `lib/` directories

**File(s):** `web/src/lib/boot/bootHiddenOverlays.ts`,
`web/src/lib/components/bootHiddenOverlays.ts` @ 9ae62ff1

**Priority:** P5

#### Problem

`lib/boot/bootHiddenOverlays.ts` (the idle mount pump, `mountBootHiddenOverlays`) and
`lib/components/bootHiddenOverlays.ts` (the lazy barrel of overlay components) share an exact
basename. Each file's header comment cross-references the other by path — necessary precisely
because the names alone can't distinguish them. A grep for `bootHiddenOverlays` returns both plus
every import of either; an agent (or human) opening "bootHiddenOverlays.ts" from a fuzzy-finder has
a coin-flip. The pump is a verb-thing (it mounts); the barrel is a noun-thing (it lists) — the names
should reflect that, per the repo's own workflow-vs-reference naming instinct.

#### Proposed solution

Rename one side — the barrel is the better candidate since the pump's name is load-bearing in the
boot sequence docs: e.g. `lib/components/bootHiddenOverlays.ts` → `lib/components/overlayChunk.ts`
(or `bootHiddenOverlayChunk.ts`). Update the dynamic import in the pump (line 20), the two header
comments, and the `src/` orientation doc if it names the file (it references
`components/bootHiddenOverlays.ts`). Pure rename, no behavior; the dynamic-import specifier is the
one easy-to-miss call site.

### [Docs] Privacy page comment points to a `MOBILE.md` that no longer exists

**File(s):** `web/src/routes/privacy/+page.svelte` (line 7) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
// This page exists mostly to *prove* that. It's required by the app stores
// (see MOBILE.md). Keep the tone simple enough for a parent to skim in 30 seconds.
```

There is no `MOBILE.md` anywhere in the repo (verified with a full-tree find). The store-release and
kids-compliance material now lives in the `mobile` skill (`.claude/skills/mobile/`). A stale pointer
in the file agents read before editing the store-required privacy policy sends them hunting for a
dead document. CLAUDE.md: "If you discover any doc, skill, or rule is out of date while working,
update it as part of the same task."

#### Proposed solution

Change the parenthetical to `(see the \`mobile\` skill's store-release
checklist)`. While there, note the adjacent line "Bump LAST_UPDATED whenever the wording changes" is a keep-in-sync-by-prose instruction — acceptable here since a legal effective-date is inherently a human judgment, but worth a glance at whether the`leave-pr-review`/PR
flow should nudge it (out of scope for this finding).

## Source: Code audit — Design system + icons

### [Correctness] StatusMessage's explicit `aria-live="polite"` defeats its own `role="alert"`

**File(s):** `web/src/lib/components/design/StatusMessage.svelte` (lines 18–24, comment lines 8–9) @
9ae62ff1

**Priority:** P2

#### Problem

The component's own header comment states the intent (lines 8–9):

```
// Errors take role="alert" (interrupt) while successes take role="status"
// (queue behind whatever is speaking).
```

But the markup pins `aria-live="polite"` on both branches (lines 18–24):

```svelte
<p
  class="status-message"
  class:error={status === 'error'}
  class:success={status === 'success'}
  role={status === 'error' ? 'alert' : 'status'}
  aria-live="polite"
>
```

Per the ARIA spec, an explicit `aria-live` attribute overrides the role's implicit live-region
politeness. `role="alert"` implies `aria-live="assertive"`; the explicit `polite` downgrades it, so
error messages queue politely instead of interrupting — exactly the behavior the comment says errors
should *not* have. For `role="status"` the attribute is a no-op (its implicit value is already
`polite`). So the one thing the attribute does is break the error case.

This is a production a11y defect on the parent-facing forms that use the primitive (ReportForm,
AiKeyManager, SetupInstructions).

#### Proposed solution

Drop the `aria-live` attribute entirely — both roles carry the correct implicit politeness — or, if
an explicit value is wanted for older AT, make it follow the role:

```svelte
aria-live={status === 'error' ? 'assertive' : 'polite'}
```

Verify with an axe scan / screen reader smoke that the error banner interrupts. No visual change.

### [Architecture] `splotchy.svg` is an 88 KB byte-identical duplicate with no drift guard

**File(s):** `web/src/lib/icons/splotchy.svg` (88,461 bytes), `web/static/splotchy.svg`
(byte-identical), `web/src/lib/components/SplotchyIcon.svelte` (line 10) @ 9ae62ff1

**Priority:** P2

#### Problem

The repo carries two byte-identical 88 KB copies of the mascot SVG:

* `web/src/lib/icons/splotchy.svg` — read by `scripts/lib/scrapbook-index.mjs`
  (`ICONS_DIR = web/src/lib/icons`, line 35/41) and by `scripts/generate-icon-names.mjs`, which is
  why `'splotchy'` appears in the `IconName` union at all. It is excluded from every runtime glob
  (`Icon.svelte` line 53, both guard tests) via the whole `NON_RENDERABLE_ICONS` apparatus.
* `web/static/splotchy.svg` — the copy the app actually renders, hard-coded by URL in
  `SplotchyIcon.svelte` line 10:

```svelte
<span class="{className} icon-color" {...rest} data-icon="splotchy">
  <img src="/splotchy.svg" alt="" />
</span>
```

Nothing asserts the two files stay identical. Edit one (re-export the mascot, optimize it) and the
app and the scrapbook/icon tooling silently diverge. This is precisely the "cross-file agreement
maintained by prose" failure mode the root conventions call a defect — except here there isn't even
prose; nothing documents that the static copy mirrors the lib copy. The hard-coded `/splotchy.svg`
URL is also unguarded: rename the static file and the `<img>` 404s silently (`alt=""` hides it).

#### Proposed solution

Keep exactly one canonical file — `web/src/lib/icons/splotchy.svg` (the scripts already read it, and
it keeps the icon beside its siblings) — and delete `web/static/splotchy.svg`. In
`SplotchyIcon.svelte`, import the asset so Vite emits a hashed URL and the build fails loudly if the
file moves:

```svelte
import splotchyUrl from '../icons/splotchy.svg';
...
<img src={splotchyUrl} alt="" />
```

Gotchas: confirm nothing external hotlinks `https://splotch.art/splotchy.svg` (no in-repo consumer
was found — not the manifest, not `app.html`, not any route); the Vite URL import must not collide
with the `?raw` globs (it doesn't — different import query); and the hashed asset works identically
in the `CAPACITOR=true` static export. Alternative if the stable public URL must be preserved: keep
`static/` canonical, point the scrapbook script at it, and add a drift-guard test comparing the two
files — but the single-copy solution is strictly simpler.

### [Correctness] Disclosure's chevron rotation only works when callers happen to blockify the pseudo-element

**File(s):** `web/src/lib/components/design/Disclosure.svelte` (lines 40–48) @ 9ae62ff1

**Priority:** P3

#### Problem

The primitive claims to own "the chevron" (comment lines 4–8) and rotates it when open:

```css
.disclosure summary::after {
  content: '›';
  color: var(--text-faint);
  transition: transform var(--duration-base) ease;
}

.disclosure[open] summary::after {
  transform: rotate(90deg);
}
```

A `::after` pseudo-element defaults to `display: inline`, and per CSS Transforms, non-replaced
inline boxes are **not transformable** — `transform: rotate(90deg)` silently no-ops. The rotation
only works today because every parent-center caller happens to blockify the pseudo-element from
outside:

* `SetupInstructions.svelte` makes `summary` a flexbox (lines 226–228) so `::after` becomes a flex
  item (line 240 even sets `flex-shrink: 0` on it);
* `AiKeyManager.svelte` line 311–313 and `ReportForm.svelte` line 352–354 both set `float: right` on
  `::after` (floats are blockified).

The one caller that styles nothing — the `/dev/design` styleguide's own demo
(`web/src/routes/dev/design/+page.svelte`, lines 335–341 style only `summary`) — renders a chevron
that neither rotates nor sits at the right edge. The primitive's core affordance is broken in its
default state, and each caller re-invents the positioning (`float: right` duplicated twice, flex
once).

#### Proposed solution

Make the primitive own the chevron's layout as well as its glyph. Minimal fix: add
`display: inline-block` to the `::after` rule so the transform always applies. Better: give the
primitive the layout every caller rebuilds —

```css
.disclosure summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

— then delete the per-caller `float: right` / flex duplication. Check each caller visually after the
change (SetupInstructions' `text-align: left` and `.summary-text` wrapper should be unaffected; the
two float-based callers lose a line each). Screenshot per the `pr-screenshots` skill since this
touches visible UI.

### [Maintainability] `THEME_COLOR_LIGHT` agrees with `app.html`'s meta tag only by prose

**File(s):** `web/src/lib/theme.ts` (lines 30–32), `web/src/app.html` (line 24),
`web/src/lib/state/appearance.svelte.test.ts` (line 14) @ 9ae62ff1

**Priority:** P3

#### Problem

`theme.ts` lines 30–32:

```ts
// Light keeps app.html's original white; dark is --app-bg, read from the
// design-token source of truth (ADR-0071) so it can never drift from the CSS.
const THEME_COLOR_LIGHT = '#ffffff';
```

`app.html` line 24:

```html
<meta name="theme-color" content="#ffffff" />
```

The dark value is properly derived from `themes.dark.appBg`, but the light value's agreement with
the prerendered meta tag is maintained purely by the comment "Light keeps app.html's original
white". Change the meta in `app.html` and the browser chrome color now flips from the new value to
stale `#ffffff` the moment appearance state hydrates — with no failing test. The repo convention is
explicit: when agreeing sites can't share code (the `app.html` boot markup is exactly that case),
add a drift-guard test "the pattern of `web/src/app.html.test.ts`" — and `app.html.test.ts` exists
but contains no theme-color assertion.

Additionally, `appearance.svelte.test.ts` line 14 re-declares its own mirror copy
(`const THEME_COLOR_LIGHT = '#ffffff';`) because the constant isn't exported — the mirrored-copy
anti-pattern the testing rules call out.

#### Proposed solution

Export the pair from `theme.ts` (e.g.
`export const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#ffffff', dark: themes.dark.appBg }`,
mirroring the existing `PAPER_COLORS` shape and simplifying `updateThemeColorMeta`'s ternary at line
57 to a lookup). Then: (1) add an assertion in `web/src/app.html.test.ts` that the `theme-color`
meta's `content` equals `THEME_COLORS.light`; (2) import the constant in `appearance.svelte.test.ts`
instead of re-declaring it.

### [Maintainability] `brandTintFilter`'s "keep the two in sync" comment marks a defect — add a computed drift guard

**File(s):** `web/src/lib/design/tokens.ts` (lines 33–36) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
// Filter chain that renders a black icon in --brand. Filters can't reference
// a color directly, so this hand-tuned chain re-encodes the brand color —
// keep the two in sync if the brand color ever changes.
brandTintFilter:
  'invert(45%) sepia(63%) saturate(471%) hue-rotate(231deg) brightness(92%) contrast(88%)',
```

The root conventions say verbatim: "A 'keep in sync with X' comment marks a defect, not a
mitigation." If `BRAND_HEX` (line 16) ever changes, nothing fails — icons tinted through this filter
just silently render the old purple.

#### Proposed solution

Add a unit test beside `tokens.test.ts` that numerically applies the filter chain to black and
asserts the result lands within a tolerance of `BRAND_HEX`. Every primitive in the chain has an
exact definition in the Filter Effects spec — `invert`/`brightness`/`contrast` are per-channel
transfer functions and `sepia`/`saturate`/`hue-rotate` are 3×3 color matrices — so a ~40-line pure
implementation (e.g. `applyFilterChain(rgb: [number, number, number], filter: string)`) can compute
the filtered color deterministically. Assert per-channel distance (or a simple deltaE) under a
tolerance loose enough for the hand-tuned chain (it won't be exact — measure the current distance
first and set the tolerance just above it, so any *drift* of `BRAND_HEX` trips it). Gotcha: sRGB vs
linear-RGB — CSS shorthand filters operate in sRGB, so no linearization is needed; note that in the
test.

### [Performance] Eager `?raw` glob inlines ~84 KB of SVG source into the main bundle

**File(s):** `web/src/lib/components/Icon.svelte` (lines 53–57) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
const modules = import.meta.glob(['../icons/*.svg', '!../icons/splotchy.svg'], {
  eager: true,
  query: '?raw',
  import: 'default',
});
```

Every icon ships as an inline JS string in whatever chunk `Icon.svelte` lands in — and `Icon` is
imported by core drawing chrome, so that's the boot-path bundle. The 69 bundled SVGs total 84,377
bytes of source, and the heaviest are spot icons used only on parent/AI surfaces, not the toddler
canvas: `magic-brush.svg` 13,222 B (What's New), `wand-stars.svg` 10,241 B (AI Art section),
`shapes.svg` 10,766 B, `camera.svg` 7,534 B. Gzip roughly halves this, but ~40 KB of compressed
payload parsed at boot for icons the drawing screen never shows is real cost on the slow devices the
`lighthouse-audit` skill targets. (The orphan guard test exists precisely because every SVG in the
directory is unconditionally bundled.)

#### Proposed solution

Keep the eager glob for the small monochrome glyph set, and move the heavy parent-surface spot icons
to a lazy path — either a second, non-eager glob resolved on first use (cache the promise; render
nothing or a fixed-size placeholder until it settles), or plain `<img src={assetUrl}>` for spot
icons that contain no `currentColor` parts (they opt out of the tint filter anyway; verify which
ones mix `currentColor` — `pen`/`crayon`/`line-weight` do and must stay inline). Gotchas: the
`{@html}`-hydration rule in `.claude/rules/svelte.md` (an async-loaded icon must not swap the
`{@html}` body based on client-only state), icon pop-in inside the parent dialog (preload on dialog
open), and the `COLOR_ICONS`/chroma guard test globs would need the same split. Measure with
`npm run perf:*` / Lighthouse before and after; if the win is under a few KB gzipped, document the
tradeoff instead of splitting.

### [Maintainability] Button's `ghost` variant has no production caller

**File(s):** `web/src/lib/components/design/Button.svelte` (lines 14–15, 80–84, 100–103) @ 9ae62ff1

**Priority:** P4

#### Problem

Grepping all of `web/src`, `variant="ghost"` (or `'ghost'`) appears only in
`web/src/routes/dev/design/+page.svelte` (the styleguide harness, lines 46 and 68), which is gated
behind `PUBLIC_ENABLE_DEV_HARNESS` and enumerates every variant by construction. Production usage is
`brand` ×5, `danger` ×2, `wash` ×1 (+ the default). The root convention: "No speculative surface. A
new prop, option, or optional parameter needs a production caller that exercises it; a seam kept
only for tests gets a comment saying so at the declaration." `ghost` has neither — and meanwhile
`AdminConsole.svelte` hand-rolls its own quiet button (`.btn-ghost`, lines 559–569) with
admin-accent styling rather than using the primitive, so the variant isn't even serving as shared
vocabulary.

A secondary wrinkle: `ghost` is the only variant with a real border (line 82) while `.btn` sets
`border: none` (line 33), so a ghost button renders 2 × `--border-width` taller than a sibling
`brand`/`wash` button in the same row — a baked-in misalignment for the first real caller.

#### Proposed solution

Either delete the variant (narrowing the union at line 15 and removing lines 80–84 / 100–103, plus
the styleguide row and ADR-0071's variant list), or land its first production caller. If kept, fix
the box model so variants align: give `.btn` `border: var(--border-width) solid transparent` and let
`.ghost` recolor the border instead of adding one. Note ADR-0071 documents the four-variant set, so
removal should touch that ADR's wording (an amendment, not a rewrite).

### [Types] SplotchyIcon's string-interpolated class forces SectionIcon to narrow `ClassValue` to `string`

**File(s):** `web/src/lib/components/SplotchyIcon.svelte` (line 10),
`web/src/lib/components/SectionIcon.svelte` (lines 8–12) @ 9ae62ff1

**Priority:** P4

#### Problem

`SplotchyIcon` builds its class by string interpolation:

```svelte
<span class="{className} icon-color" {...rest} data-icon="splotchy">
```

which only works for `string`, so `SectionIcon` must narrow its prop and carry a comment explaining
why:

```ts
// Narrowed from ClassValue to match SplotchyIcon, which interpolates it
// into a class string.
class?: string;
```

`Icon.svelte` (line 76) already uses the Svelte 5 class-array form —
`class={[className, COLOR_ICONS.has(name) && 'icon-color']}` — which accepts full `ClassValue`. The
narrowing is an avoidable seam: any caller passing a class array/object through `SectionIcon` gets a
type error that `Icon` itself would accept, and the interpolated form also emits a stray leading
space when `className` is empty (`class=" icon-color"`).

#### Proposed solution

Change `SplotchyIcon` to `class={[className, 'icon-color']}`, widen its `Props['class']` to the
inherited `HTMLAttributes<HTMLSpanElement>['class']`, delete `SectionIcon`'s narrowing and its
comment, and drop the now-unneeded `= ''` defaults in both. Purely a type/markup cleanup; no visual
change.

### [Types] Icon map typed `Record<string, string>` with a silent-blank fallback instead of a closed union

**File(s):** `web/src/lib/components/Icon.svelte` (lines 59–62, 69) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const icons: Record<string, string> = {};
for (const [path, src] of Object.entries(modules)) {
  icons[iconNameFromPath(path)] = src as string;
}
...
const markup = $derived(icons[name] ?? '');
```

The repo convention says constant maps over a closed vocabulary are `Record<UnionType, V>`, "never
bare `string`/`number` plus a runtime fallback". `name` is already `CommonIconName`, and the
generated union is derived from the same directory the glob reads, so a miss is a
build-inconsistency bug — yet the `?? ''` swallows it and renders an empty span, the
hardest-to-notice possible failure (the guard comments in `iconTypes.ts` lines 8–11 even name "an
empty icon at runtime" as the symptom this machinery exists to prevent).

#### Proposed solution

Type the map at the glob boundary and fail loud on the impossible miss:

```ts
const icons = Object.fromEntries(
  Object.entries(modules).map(([path, src]) => [iconNameFromPath(path), src as string]),
) as Record<CommonIconName, string>;
```

(the `as` is a legitimate boundary cast — glob paths are untyped input). With the value
non-optional, `icons[name]` needs no `?? ''`; if extra safety is wanted, throw in `$derived` when
the lookup is `undefined` so the inconsistent build screams in dev instead of shipping blank chrome.
Optionally tighten `iconNameFromPath` to return `IconName` at this one boundary rather than
`string`.

### [Maintainability] Delete the grandfathered orphan icons instead of carving them out of the guard

**File(s):** `web/src/lib/icons/chevron-up.svg` (235 B), `web/src/lib/icons/settings.svg` (948 B),
`web/src/lib/components/icon-orphans.test.ts` (lines 47–51, 109–114) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// Pre-existing orphans, grandfathered rather than deleted here — this guard's
// job is to stop *new* orphans appearing. chevron-up: the drawer's chevron is a
// single chevron-right rotated with CSS. settings: nothing renders it; the only
// mentions of the word are prose about the `settings` state module.
const KNOWN_ORPHANS = ['chevron-up', 'settings'];
```

The comment explains why the *test* doesn't fail on them, not why the files should exist. They cost
on every axis the guard was built to protect: both are eagerly bundled into the boot chunk by
`Icon.svelte`'s glob and shipped to every user, both inflate the generated `IconName` union, and the
test file carries a second describe block (lines 109–114) whose only job is proving the carve-out is
still needed. ~1.2 KB of dead asset plus ~15 lines of test machinery to keep dead assets dead.

#### Proposed solution

Delete the two SVGs, run `npm run gen:icons` to shrink the union, empty (or remove) `KNOWN_ORPHANS`
and its "still an orphan" describe block. If the mascot-era originals are worth keeping for
reference, `git log` already has them — or promote them to `/scrapbook`, which exists for exactly
this kind of keeper. Zero behavioral risk: the orphan guard itself proves nothing references them.

### [Testing] `iconInk`'s "matches the SVGs' baked fill" is prose agreement across ~50 files

**File(s):** `web/src/lib/design/tokens.ts` (lines 193–194, 278), `web/src/lib/icons/*.svg` @
9ae62ff1

**Priority:** P4

#### Problem

The token interface documents:

```ts
/** monochrome icon fill (matches the SVGs' baked fill) */
iconInk: string;
```

and light `iconInk` is `'#1f1f1f'` (line 278) — matching the `fill="#1f1f1f"` baked into every
monochrome icon (verified: `chevron-right`, `download`, `home`, `lock`, `more-horiz`, `theme-dark`,
`volume-on`, …). Untinted icons read correctly only because these two agree. Nothing enforces it:
drop in a fresh Material export with `fill="#000"` (Material's default) and the icon renders subtly
off wherever it isn't run through a tint filter, with no failing test. This is exactly the
"cross-file agreement maintained by prose" pattern the conventions ban — and the agreeing sites (SVG
assets vs a TS module) can't share code, which is the stated trigger for a drift-guard test.

#### Proposed solution

Extend one of the existing glob-based icon tests (natural home: `Icon.svelte.test.ts`, which already
loads every renderable SVG raw and imports the chroma helpers) with an assertion: for every icon
*not* in `COLOR_ICONS`, all painted `fill`/`stroke` values are drawn from
`{ themes.light.iconInk, 'currentColor', 'none', 'white' }` (measure the actual set first — build it
from what the icons legitimately use today, then lock it). Reuse `paintHexes`-style extraction from
`scripts/lib/iconChroma.mjs` rather than re-writing the attribute regex.

### [Maintainability] trimGeometry's `geometry` parameters are speculative surface — nothing ever passes them

**File(s):** `web/src/lib/design/trimGeometry.ts` (lines 68–118, 208–232) @ 9ae62ff1

**Priority:** P4

#### Problem

All six exported ladder functions (and the two internal helpers behind them) take an optional
geometry argument defaulted to the module constant, e.g. lines 76–80:

```ts
export function landscapeSingleColumnFloorPx(
  geometry: PaletteStackGeometry = PALETTE_COLUMN_GEOMETRY
): number {
```

No caller anywhere passes a non-default value: `ColorPicker.svelte`/`ColorPalette.svelte` import
only the geometry constants, and every call in `trimGeometry.test.ts` is zero-arg (lines 139,
144–148, 152–155, 158–161, 164, 205, 209). The convention is explicit: "A new prop, option, or
optional parameter needs a production caller that exercises it; a seam kept only for tests gets a
comment saying so" — and these aren't even used by tests. The injectable-geometry seam suggests a
what-if flexibility the module doesn't have, and every signature pays for it.

#### Proposed solution

Remove the parameters and let each function close over `PALETTE_COLUMN_GEOMETRY` /
`PALETTE_ROW_GEOMETRY` / `HEX_GRID_GEOMETRY` directly (the internal `hexGridBreakpointPx` keeps
`viewportFraction` as a plain argument or reads the constant). `portraitLadderPx()` etc. shrink to
one-liners over the module constants. Purely mechanical; the drift-guard test is unaffected since it
already calls with defaults.

### [Testing] `KNOWN_ORPHANS` entries are neither typed nor checked to exist

**File(s):** `web/src/lib/components/icon-orphans.test.ts` (lines 51, 97–115) @ 9ae62ff1

**Priority:** P5

#### Problem

`const KNOWN_ORPHANS = ['chevron-up', 'settings'];` is a bare `string[]`. Two gaps: (1) a typo'd or
stale entry is invisible — if `chevron-up.svg` were deleted, the first describe block skips it (it
iterates actual SVGs) and the second block passes vacuously (`isReferenced('chevron-up')` is false
for a nonexistent icon too), so the dead carve-out lingers forever; (2) the list isn't typed against
the icon vocabulary (`CommonIconName`), the repo's standard for closed sets. (If the P4 finding to
delete the orphans lands, this whole list disappears and this finding is moot — it applies only if
the grandfather list survives.)

#### Proposed solution

Type it `const KNOWN_ORPHANS: CommonIconName[] = [...]` (compile-time typo guard, auto-invalidated
when `gen:icons` drops a deleted icon from the union) and add one assertion that every entry is a
key of `svgs`, so a stale entry fails with "no longer exists — remove the carve-out" instead of
passing silently.

### [Maintainability] Disclosure hard-codes `1px` instead of the `--border-width` token

**File(s):** `web/src/lib/components/design/Disclosure.svelte` (line 25) @ 9ae62ff1

**Priority:** P5

#### Problem

```css
.disclosure {
  border: 1px solid var(--border);
```

`scale.borderWidth` exists precisely for this (`tokens.ts` line 64), and the sibling primitive
`Button.svelte` uses it (`border: var(--border-width) solid var(--border)`, line 82). A
design-system primitive off its own token vocabulary is the worst place for the inconsistency — it's
the exemplar other components copy.

#### Proposed solution

`border: var(--border-width) solid var(--border);`. One-line change, no visual difference at the
current token value.

### [Readability] StatusMessage: off-ramp `10px` padding and hand-rolled class toggles

**File(s):** `web/src/lib/components/design/StatusMessage.svelte` (lines 20–21, 31) @ 9ae62ff1

**Priority:** P5

#### Problem

Two small deviations in a design-system primitive: (1) line 31 `padding: 10px var(--space-3);` —
`10px` sits off the spacing ramp (`--space-2` = 8, `--space-3` = 12) with no comment earning the
exception, in the component whose job is to model token usage; (2) lines 20–21 spell out both class
toggles even though `status` is exactly the closed union of the two class names:

```svelte
class:error={status === 'error'}
class:success={status === 'success'}
```

#### Proposed solution

For (2), `class={['status-message', status]}` — the union type guarantees the emitted class is one
of the two styled selectors. For (1), either snap to `var(--space-2)` or `var(--space-3)` (needs a
quick visual check across ReportForm/AiKeyManager/SetupInstructions), or keep 10px deliberately with
a one-line WHY on the declaration.

### [Testing] tokens.test.ts re-asserts what the compiler already enforces

**File(s):** `web/src/lib/design/tokens.test.ts` (lines 25–29), `web/src/lib/design/tokens.ts`
(lines 12–14) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
describe('themes', () => {
  it('light and dark stay structurally identical', () => {
    expect(Object.keys(themes.dark)).toEqual(Object.keys(themes.light));
  });
});
```

`tokens.ts`'s own header says (lines 12–14): "The `ThemeTokens` interface is what keeps light and
dark structurally identical — the compiler now enforces what app.css previously demanded via a
comment." Both theme objects are literals annotated `ThemeTokens`, so excess-property checking plus
required members make key divergence a compile error; the only thing the runtime test adds is
*declaration order* equality, which nothing depends on (`gen-tokens.mjs` iterates each theme's own
`Object.entries` independently, and per-block ordering of emitted custom properties is inert).

#### Proposed solution

Delete the test, or — if key order is deemed worth pinning for diff-readability of the generated CSS
— keep it with a one-line comment saying order (not structure) is what it guards, so the next reader
doesn't conclude the interface guarantee is distrusted.

### [Correctness] `iconNameFromPath` uses an unanchored `.replace('.svg', ...)`

**File(s):** `web/src/lib/components/iconTypes.ts` (lines 16–18), `scripts/generate-icon-names.mjs`
(lines 11–18) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
export function iconNameFromPath(path: string): string {
  return (path.split('/').pop() ?? '').replace('.svg', '');
}
```

`String.replace` with a string pattern replaces the *first* occurrence anywhere, not the extension —
a hypothetical `foo.svg-outline.svg` maps to `foo-outline.svg` while the generator's anchored
`replace(/\.svg$/, '')` maps it to `foo.svg-outline`. The runtime map key and the generated union
entry would disagree, producing exactly the blank-icon failure the guard machinery works so hard to
prevent. No current filename triggers it, but the two implementations of the same mapping quietly
differ, and this is the cheapest possible convergence.

#### Proposed solution

Anchor it: `.replace(/\.svg$/, '')`. (Truly sharing one implementation isn't practical — the `.mjs`
generator can't import the `.ts` module without adding a loader — so matching semantics is the
right-sized fix; a one-line pointer comment in either file is optional.)

### [Testing] `QUICKSAND_FONT_FAMILY` agrees with the @fontsource package's registered family only by convention

**File(s):** `web/src/lib/fonts.ts` (line 1), `web/src/routes/+layout.svelte` (line 8),
`web/src/lib/design/tokens.ts` (line 85) @ 9ae62ff1

**Priority:** P5

#### Problem

`fonts.ts` is one line: `export const QUICKSAND_FONT_FAMILY = 'Quicksand Variable';`. That string
must equal the `font-family` name declared by `@fontsource-variable/quicksand/index.css` (imported
in `+layout.svelte` line 8) — a third-party file that could rename the family on a major bump. If it
drifts, the app-wide stack (`tokens.ts` line 85) silently falls through `'Quicksand Variable'` →
`'Quicksand'` (also absent) → system sans, and nothing fails; a font swap on a toddler app is easy
to miss in review. This is cross-file agreement with a file that can't share the constant — the
stated trigger for a drift-guard test.

#### Proposed solution

Add a tiny node-environment test (beside `fonts.ts` or in `tokens.test.ts`) that reads
`node_modules/@fontsource-variable/quicksand/index.css` and asserts
`font-family: 'Quicksand Variable'` (i.e. `QUICKSAND_FONT_FAMILY`) appears in its `@font-face`
rules. Runs against the locked dependency, so it fails exactly when a Dependabot bump changes the
registered name. Gotcha: resolve the file via `import.meta.resolve`/`require.resolve` rather than a
relative path so hoisting layout changes don't break it.

### [Readability] Icon.svelte.test.ts classifies every icon twice

**File(s):** `web/src/lib/components/Icon.svelte.test.ts` (lines 25–27, 34–43) @ 9ae62ff1

**Priority:** P5

#### Problem

Lines 25–27 compute the full classification once:

```ts
const colorful = Object.entries(svgs)
  .filter(([, src]) => isSpot(src))
  .map(([path]) => iconNameFromPath(path));
```

but the per-icon test re-runs the classifier instead of consulting it (line 37):
`if (!isSpot(svgs[`../icons/${name}.svg`])) return;` — re-deriving the key string by hand along the
way. Harmless at this scale, but the second derivation invites the two to diverge (e.g. if the key
format or classifier call ever changes in one place).

#### Proposed solution

Use the computed set in the guard: `if (!colorful.includes(name)) return;` (or convert `colorful` to
a `Set<string>`). Drops the hand-rebuilt glob key and makes the sanity-check test and the guard test
provably examine the same classification.

### [Testing] Eraser-size SVGs bake token fallback hexes that can drift from tokens.ts

**File(s):** `web/src/lib/icons/eraser-size-1.svg` … `eraser-size-5.svg`,
`web/src/lib/icons/line-weight-eraser.svg`, `web/src/lib/design/tokens.ts` (lines 289, 291) @
9ae62ff1

**Priority:** P5

#### Problem

The eraser-size previews style themselves through theme vars with literal fallbacks, e.g.
`eraser-size-1.svg`:

```
style="fill:var(--paper,#fcfbf8);stroke:var(--hole-stroke,#8a8a93);stroke-width:1.5"
```

The fallback hexes duplicate `themes.light.paper` (`'#fcfbf8'`, tokens.ts line 289) and
`themes.light.holeStroke` (`'#8a8a93'`, line 291) across five-plus SVG files. In-app the vars always
resolve, so the fallbacks are inert — but they're exactly what renders anywhere `tokens.css` isn't
loaded (an SVG previewed standalone, a future email/docs embed, the scrapbook's `inlineIcon`
output), and retuning the light paper color leaves six stale copies with no failing test. Boundary
values are supposed to be declared once or drift-guarded.

#### Proposed solution

Add a small assertion to an existing icon test (node environment): for every SVG whose source
contains `var(--paper,` or `var(--hole-stroke,`, the fallback hex equals the corresponding
`themes.light` token. A ~10-line regex loop over the already-globbed raw sources; keeps the SVGs
self-contained while making the duplication safe.

## Source: Code audit — Core UI controls

### [Correctness] Apply the scribbleGuard/scribbleTap contract to the Clear Button

**File(s):** `web/src/lib/components/ClearButton.svelte` (lines 38–74) @ 9ae62ff1

**Priority:** P1

> **Verified 2026-07-28.** An adversarial re-check confirmed the ClearButton half and **refuted** an
> original second half naming `FullscreenToggle.svelte`: `fullscreenSupported()` in
> `web/src/lib/state/fullscreen.svelte.ts` returns `isAndroidBrowser()` (after bailing on
> `isNative()`/`isStandalone()`), and `platform.ts` line 47 matches `/android/i` against the UA — so
> the toggle never renders on any WebKit surface, the only place iPadOS Scribble exists. Guarding it
> would be dead work; that half has been removed from this finding.

#### Problem

ADR-0038 closes with an explicit standing rule: "Any future control a pen can tap right before
drawing gets `use:scribbleGuard` on its surface and `use:scribbleTap` instead of `onclick`." The ADR
also documents that the *arming tap itself* is the trigger — it does not matter what the app does
with the tap; a pen tap anywhere followed within ~450ms by a stroke gets that stroke silently
swallowed by iPadOS Scribble (the ink commits to the engine and undo log but never paints).

The Clear Button, a toddler-facing control sitting directly on the canvas, is unguarded: the whole
`dragToClear` gesture surface (lines 44–67) is pointer-event driven, and neither the component nor
`web/src/lib/actions/dragToClear.ts` cancels the parallel stylus touch stream (grep for `touch` in
`dragToClear.ts` finds nothing). A pen tap on the Clear Button arms Scribble exactly like a swatch
tap did before ADR-0038 — and because a plain tap does nothing app-visible, the subsequent invisible
stroke is even more mysterious than the swatch case.

Currently guarded surfaces are only `ColorPalette`, `ColorPicker`, and `ActionsPanel` (the three
`use:scribbleGuard` sites in the repo).

#### Proposed solution

Add `use:scribbleGuard` to `.clear-container` (or the button). Verify on-device that cancelling
stylus `touchstart` doesn't break `dragToClear` — it is pointer-driven and does its own capture, so
it should be unaffected; the guard also only fires for `touchType === 'stylus'`.

If the exclusion turns out to be deliberate (e.g. verified inert), the ADR-0038 rule deserves a
written carve-out; today nothing documents it.

### [Maintainability] Deduplicate the AI-button visibility predicate between the layout math and the template

**File(s):** `web/src/lib/actionButtonLayout.ts` (`visibleActionButtonCount`, line 64),
`web/src/lib/components/ActionsPanel.svelte` (line 357) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — both quotes exact at the cited lines. Adjacent to open issue #599 ("A
> BYO Gemini key never unhides the magic-image button"), which is a correctness bug in this same
> predicate: fix them together so the two sites collapse into one shared function rather than
> re-diverging.

#### Problem

The condition deciding whether the AI button exists is written twice, in inverted forms that must
agree:

`actionButtonLayout.ts:64`:

```ts
(settings.aiAccessToken && settings.aiImageEnabled && network.online ? 1 : 0) +
```

`ActionsPanel.svelte:357`:

```svelte
hidden={!settings.aiAccessToken || !settings.aiImageEnabled || !network.online}
```

If one side gains a condition the other doesn't (say, a future per-child AI lockout), the failure is
silent and geometric: `visibleActionButtonCount()` feeds the divisor of the `buttonSize` cap
(ActionsPanel lines 92–104) and the Parent Center slider ceiling (`maxActionButtonScale`), so a
mismatch renders a row whose button count and per-button budget disagree — buttons overlap the
Parent Help Button or shrink for a button that isn't there. CLAUDE.md's rule is explicit: cross-file
agreement is never maintained by prose/duplication; boundary predicates are declared once and
imported.

#### Proposed solution

Export the predicate once, next to the count it feeds:

```ts
export function aiButtonVisible(): boolean {
  return Boolean(settings.aiAccessToken && settings.aiImageEnabled && network.online);
}
```

Use it in `visibleActionButtonCount()` and in the template (`hidden={!aiButtonVisible()}` wrapped in
a `$derived` in ActionsPanel so reactivity is preserved — the reads happen synchronously inside the
call, same pattern as `publishActionPanelState`). Existing unit tests in
`actionButtonLayout.test.ts` (lines 49–59) can pin the new function directly.

### [Maintainability] The hydrated button-size formula exists in three copies; two are kept in step only by comments

**File(s):** `web/src/lib/actionButtonLayout.ts` (`availablePerButton`, lines 73–91),
`web/src/lib/components/ActionsPanel.svelte` (`buttonSize`, lines 98–104; CSS fallback lines 568–571
and 607–610) @ 9ae62ff1

**Priority:** P2

#### Problem

The "space per button" formula lives in three places:

1. The CSS `--action-btn-fallback` blocks (first paint) — drift-guarded by
   `actionButtonLayout.fallback.test.ts` against the exported constants. Fine.
2. The hydrated inline calc string built in ActionsPanel's `buttonSize` derived (lines 98–104) — a
   six-line nested ternary producing opaque template strings like:

```ts
? `min(calc(${ACTION_BUTTON_BASE_PORTRAIT}px * var(--action-btn-scale, 1)), calc((${layout.viewportHeight - layout.paletteHeight - PALETTE_CLEARANCE}px - env(safe-area-inset-top) - env(safe-area-inset-bottom) - ${buttonSpread}px) / ${buttonCount}))`
```

3. The JS mirror `availablePerButton` in `actionButtonLayout.ts` (lines 73–91), whose header comment
   says "Mirrors the CSS cap in ActionsPanel — keep the two formulas in step" (lines 70–72).

Copies 2 and 3 are the same budget arithmetic (viewport − palette − reserve/clearance − insets −
chrome, ÷ count) with no mechanical guard between them — exactly the "keep in sync with X" comment
that CLAUDE.md calls a defect, not a mitigation. A change to one (e.g. adding a new fixed cost)
silently desynchronizes the slider ceiling from the rendered cap, defeating the module's stated
purpose ("two consumers that must agree", lines 1–5).

#### Proposed solution

Move the calc-string builders into `actionButtonLayout.ts` beside `availablePerButton`, e.g.:

```ts
export function buttonSizeCssExpr(orientation: Orientation, buttonCount: number): string;
```

so both formulas live in one file, share the same constants and sub-expressions, and ActionsPanel's
derived collapses to `browser ? buttonSizeCssExpr(layout.orientation, buttonCount) : undefined`
(reactive reads still tracked, same as `publishActionPanelState`). Then add a unit test that
evaluates the returned expression with `env(...)` = 0 and `--action-btn-scale` = 1 (trivial string
substitution + arithmetic) and asserts it equals `min(base, availablePerButton(n))` for a few layout
fixtures — making the mirror mechanical instead of prose. Gotcha: the CSS string uses `env()` for
insets while the JS uses measured `layout.safeArea`; the test should pin both formulas with zero
insets and document that divergence surface.

### [Maintainability] `buttonSpread` in ActionsPanel re-derives the chrome sum owned by `availablePerButton`

**File(s):** `web/src/lib/components/ActionsPanel.svelte` (lines 94–96),
`web/src/lib/actionButtonLayout.ts` (lines 75–76) @ 9ae62ff1

**Priority:** P3

#### Problem

The same four-term sum is computed independently in both files:

`ActionsPanel.svelte:94–96`:

```ts
const buttonSpread = $derived(
  (buttonCount - 1) * ACTION_BUTTON_GAP + PANEL_INSET + DRAWER_TOGGLE_MARGIN + DRAWER_TOGGLE_SIZE,
);
```

`actionButtonLayout.ts:75–76`:

```ts
const chrome = PANEL_INSET + DRAWER_TOGGLE_MARGIN + DRAWER_TOGGLE_SIZE
  + (buttonCount - 1) * ACTION_BUTTON_GAP;
```

(and a third, fixed-count variant as `WORST_CASE_CHROME`, lines 47–51). Both import the same
constants, so drift risk is lower than a raw literal, but adding a new fixed cost (another margin, a
divider) requires editing both sums — and missing one desynchronizes the slider ceiling from the
render cap, the exact failure this module exists to prevent.

#### Proposed solution

Export one helper and use it in all three places:

```ts
export function panelChromePx(buttonCount: number): number {
  return (buttonCount - 1) * ACTION_BUTTON_GAP + PANEL_INSET + DRAWER_TOGGLE_MARGIN
    + DRAWER_TOGGLE_SIZE;
}
```

`WORST_CASE_CHROME` becomes `panelChromePx(MAX_ACTION_BUTTON_COUNT)`. This is subsumed by the
`buttonSizeCssExpr` extraction above if that lands first; on its own it is a five-minute change.

### [Maintainability] The drawer gap's "keep in sync" comment pair needs a drift-guard test instead

**File(s):** `web/src/lib/components/ActionsPanel.svelte` (lines 436–437),
`web/src/lib/actionButtonLayout.ts` (lines 15–16), `web/src/lib/actionButtonLayout.fallback.test.ts`
@ 9ae62ff1

**Priority:** P3

#### Problem

`actionButtonLayout.ts:15–16`:

```ts
// Keep in sync with the .actions-drawer-inner gap in ActionsPanel.svelte.
export const ACTION_BUTTON_GAP = 12;
```

`ActionsPanel.svelte:436–437`:

```css
/* Keep in sync with ACTION_BUTTON_GAP in actionButtonLayout.ts. */
gap: 12px;
```

CLAUDE.md: "A 'keep in sync with X' comment marks a defect, not a mitigation" — when the agreeing
sites can't share code (CSS vs TS), the prescribed fix is a drift-guard test. The infrastructure
already exists: `actionButtonLayout.fallback.test.ts` imports `ActionsPanel.svelte?raw` and asserts
the CSS fallback literals against the constants (guarding `WORST_CASE_CHROME`, which *contains* the
gap — but only in the pre-hydration fallback; the hydrated path's CSS `gap: 12px` on
`.actions-drawer-inner` is unguarded, and a changed `ACTION_BUTTON_GAP` would leave the rendered gap
and the sizing math disagreeing by a few px per gap).

#### Proposed solution

Add one assertion to `actionButtonLayout.fallback.test.ts`:

```ts
it('the drawer gap matches ACTION_BUTTON_GAP', () => {
  expect(actionsPanelSource).toMatch(new RegExp(`gap: ${ACTION_BUTTON_GAP}px;`));
});
```

(anchor it to `.actions-drawer-inner` context if a second `gap:` ever appears in the file). Then
delete both "keep in sync" comments, or replace them with a pointer to the guard.

### [Testing] The `data-*` attribute names written by publishActionPanelState are mirrored in app.html and two test files with no drift guard

**File(s):** `web/src/lib/actionButtonLayout.ts` (`publishActionPanelState`, lines 126–145),
`web/src/app.html` (lines 103–115), `web/src/app.html.test.ts`,
`web/src/lib/actionButtonLayout.test.ts` (lines 150–157, 189–196) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — every mirror site confirmed; `app.html.test.ts` guards `STORAGE_KEYS`,
> `BOOL_SETTINGS` defaults and `data-app-surface`, but nothing checks the `data-off-*` vocabulary
> against the TS writer. Citation correction: the "must stay in lockstep" prose is at
> `actionButtonLayout.ts` lines 113–114, not 115–116.

#### Problem

The `data-drawer-open` / `data-off-adv` / `data-off-stroke` / `data-off-eraser` /
`data-off-coloring` / `data-off-screenshot` / `data-off-undo` / `data-brush` attribute vocabulary is
hardcoded independently in:

* `publishActionPanelState` (actionButtonLayout.ts lines 131–144),
* the app.html boot IIFE (lines 106–115),
* the CSS selectors in `ActionsPanel.svelte` (lines 447, 451, 493–513, 541, 749–754) and
  `BrushMenu.svelte` (line 54),
* both hardcoded attribute lists in `actionButtonLayout.test.ts` (lines 150–157 and 189–196,
  duplicated within the file).

`app.html.test.ts` mechanically guards the boot script's *storage keys and boolean defaults* against
`STORAGE_KEYS`/`BOOL_SETTINGS`, but nothing guards the *attribute names* the two writers stamp.
`publishActionPanelState`'s own header admits the contract ("Those two writers must stay in
lockstep", lines 115–116) yet the lockstep is prose. Rename an attribute in the TS + its test + the
CSS and forget app.html, and every test stays green while returning users get a first-paint flash
(seed writes a dead attribute; the real one arrives only at hydration) — precisely the flash this
machinery exists to prevent.

#### Proposed solution

Export the mapping as data, iterate it in the function, and guard it in the app.html test:

```ts
export const CONTROL_OFF_ATTRIBUTES = {
  advancedControlsEnabled: 'data-off-adv',
  strokeWidthControlEnabled: 'data-off-stroke',
  // …
} as const satisfies Record<BoolControlSetting, `data-off-${string}`>;
```

`publishActionPanelState` loops the table; `actionButtonLayout.test.ts` iterates
`Object.values(CONTROL_OFF_ATTRIBUTES)` instead of two hand-copied lists; `app.html.test.ts` (which
already regex-parses the boot script) asserts every `toggleAttribute('data-…')` name in the boot
script appears in the exported table + `data-drawer-open`. The CSS selectors stay literal
(tests-excepted rule doesn't cover CSS, but the CSS side breaks visibly in E2E; the seed/publish
split is the silent one).

Merged from the app-shell section's duplicate of this finding: the same missing guard was
independently flagged from the `app.html` boot-script side, which raises its priority — one drift
guard (asserting the attribute vocabulary against an exported constant, the `app.html.test.ts`
pattern) resolves both reports.

### [Maintainability] The white-stroke/dark-stroke keyline rule is copied six times across three components

**File(s):** `web/src/lib/components/ActionsPanel.svelte` (lines 766–781),
`web/src/lib/components/BrushMenu.svelte` (lines 66–81),
`web/src/lib/components/StrokeWidthMenu.svelte` (lines 87–102) @ 9ae62ff1

**Priority:** P3

#### Problem

Each of the three files carries a near-identical pair of rules (six blocks total) differing only in
the stroke color and, for StrokeWidthMenu, the selector (`path` vs `path[fill='currentColor']`):

```css
.action-button.white-stroke :global(svg path[fill='currentColor']) {
  stroke: #000;
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}
.action-button.dark-stroke :global(svg path[fill='currentColor']) {
  stroke: var(--dark-ink-keyline);
  …same three lines…
}
```

Six copies of a four-declaration technique (plus six copies of the explanatory comment) mean a
future tweak — say the stroke-width, or a third keyline state — touches six blocks in three files.
The shared flyout chrome for these same components already lives in `app.css` ("Each component keeps
only what differs — the eraser-mode sizing and the white-stroke/dark-stroke keylines", app.css lines
242–245), so the precedent for hoisting is established; the keylines only stayed local because the
color differs per state.

#### Proposed solution

Reduce each pair to one rule via a custom property: a shared rule (in `app.css` beside the flyout
chrome, or one per component) does

```css
.white-stroke { --keyline: #000; }
.dark-stroke { --keyline: var(--dark-ink-keyline); }
.keylined :global(svg path[fill='currentColor']) {
  stroke: var(--keyline);
  stroke-width: 2px;
  paint-order: stroke;
  vector-effect: non-scaling-stroke;
}
```

Both classes can coexist today (`inkWhite`/`inkDark` are mutually exclusive in practice — `isWhite`
vs `isDarkInk` — but define the cascade order deliberately). Gotcha: StrokeWidthMenu deliberately
strokes plain `path` (single-path icons); confirm `path[fill='currentColor']` also matches its icons
or keep its selector local while sharing the declarations.

### [Maintainability] ClearCoachmark's timing/geometry tuning literals lack named constants

**File(s):** `web/src/lib/components/ClearCoachmark.svelte` (`show`, lines 38 and 56) @ 9ae62ff1

**Priority:** P3

#### Problem

Two tunable decisions are inline literals, against the CLAUDE.md rule that tuning literals
(threshold, duration, curve shaping) get named module-scope constants with the unit in the name:

* Line 56: `tutorialDismissTimer = setTimeout(dismiss, 6000);` — the coachmark's auto-dismiss
  duration, completely uncommented and unitless at the call site.
* Line 38: `const travel = radius * 1.18;` — the overshoot factor (the comment above explains the
  WHY, but the value itself is unnamed, so a tuner greps for nothing).

Compare the same file's neighbor `dragToClear.ts`, which names all its knobs (`HOLD_DURATION`,
`MULTI_CLICK_WINDOW`, …), and `InstallBanner.svelte`, which names every duration
(`PARTING_MESSAGE_MS`, `BANNER_ENTER_MS`).

#### Proposed solution

```ts
const COACHMARK_AUTO_DISMISS_MS = 6000;
// Overshoot past the ring edge so the mime reads "pull past the threshold, not just to it".
const GHOST_TRAVEL_OVERSHOOT = 1.18;
```

and move the existing overshoot comment onto the constant.

### [Correctness] ErrorScreen's crash-path premise is undermined by three token references without fallbacks

**File(s):** `web/src/lib/components/ErrorScreen.svelte` (lines 52, 62, 66) @ 9ae62ff1

**Priority:** P3

#### Problem

The component's stated contract (lines 2–4) is "dependency-light crash fallback … can render even
when the rest of the app failed to", and most declarations honor it with literal fallbacks:
`var(--app-bg, #fcfbf8)` (29), `var(--text-strong, #333)` (30), `var(--font-family, …)` (31),
`var(--font-size-3xl, 32px)` with a WHY comment (44–47), `var(--text-mid, #666)` (53),
`var(--brand, #ab71e1)` (38, 63), `var(--on-brand, #fff)` (64). But three slipped through:

* Line 52: `font-size: var(--font-size-lg);` — the message paragraph.
* Line 62: `border-radius: var(--radius-pill);` — the restart button.
* Line 66: `font-size: var(--font-size-xl);` — the restart button label.

If `tokens.css` failed to load (the exact scenario the other fallbacks are budgeted for), these
resolve to the guaranteed-invalid initial value: the paragraph and button drop to default UA sizing
and the button loses its pill shape — a degraded restart CTA on the one screen that must always
work.

#### Proposed solution

Add literal fallbacks matching the tokens' light values (e.g. `var(--font-size-lg, 18px)`,
`var(--radius-pill, 999px)`, `var(--font-size-xl, 20px)` — read the actual token values from
`tokens.css` when implementing). Consider a comment on the block reminding future edits that *every*
token use here needs a fallback; or a tiny drift test over the component source asserting each
`var(--` in this file carries a comma fallback.

### [Maintainability] PANEL_INSET is re-typed as bare `8` in `leftOffset`, and the portrait branch duplicates the stylesheet

**File(s):** `web/src/lib/components/ActionsPanel.svelte` (`leftOffset`, lines 59–63; CSS lines
395–396) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const leftOffset = $derived(
  isPortrait
    ? 'calc(8px + env(safe-area-inset-left))'
    : `calc(${layout.paletteWidth + 8}px + env(safe-area-inset-left))`,
);
```

Both `8`s are the panel's screen inset — the exported `PANEL_INSET` constant (actionButtonLayout.ts
line 28) that this same file already imports and uses three lines later in `buttonSpread`. The CSS
base rule (lines 395–396) types the same `8px` again. Worse, the portrait string exactly reproduces
the stylesheet's own `left: calc(8px + env(safe-area-inset-left))` — an inline style whose only
effect is overriding the stylesheet with an identical value.

#### Proposed solution

* Use the constant:
  `` `calc(${layout.paletteWidth + PANEL_INSET}px + env(safe-area-inset-left))` ``.
* Return `undefined` for portrait so `style:left` is simply absent and the stylesheet owns it
  (Svelte removes the style for `undefined`), shrinking the derived to the one case that needs JS
  (measured palette width).
* The CSS literals (`bottom`/`left` 8px) can either stay (first-paint owner, like the fallback
  formula) with coverage added to `actionButtonLayout.fallback.test.ts`, or be judged plain
  geometry; at minimum the JS side should stop re-typing the constant it already imports.

### [Maintainability] Alarm-palette rgba literals repeated 5–7× per file in ClearButton and ClearCoachmark styles

**File(s):** `web/src/lib/components/ClearButton.svelte` (lines 180, 200–201, 220, 222),
`web/src/lib/components/ClearCoachmark.svelte` (lines 125–126, 209, 219, 223–224, 231–233, 252–254)
@ 9ae62ff1

**Priority:** P4

#### Problem

`.claude/rules/svelte.md`: "A value repeated 3+ times in a component's `<style>` … becomes a local
custom property on the block's root selector."

* ClearButton repeats the alarm red `255, 56, 56` seven times across five lines (accept-zone
  border/gradients, delete-ready shadow, threshold state).
* ClearCoachmark repeats the hint coral `255, 107, 107` six times and the "ready" rose
  `238, 90, 111` six more — including a wholesale copy of the 70% keyframe's border+gradient into
  the reduced-motion block (lines 231–233 duplicated at 252–254).

A palette tweak (e.g. matching the ready color to the live threshold red) currently means a dozen
coordinated edits, and the coachmark's reduced-motion fork can silently drift from the animated
keyframe it is supposed to freeze.

#### Proposed solution

Local custom properties on each block root, e.g. in ClearCoachmark:

```css
.clear-coachmark {
  --hint-rgb: 255, 107, 107;
  --ready-border: rgba(238, 90, 111, 0.85);
  --ready-fill: radial-gradient(circle, rgba(238, 90, 111, 0) 50%, rgba(238, 90, 111, 0.18) 100%);
}
```

and the analog (`--alarm-rgb: 255, 56, 56`) in ClearButton. Gotcha: custom properties are fine
inside `@keyframes` frame bodies (the property is resolved at use), but keep the rgba fallback
ordering where `color-mix` fallbacks already exist. Optionally fold the hardcoded delete-ready
gradient (`#ff3838, #d63031`, line 179) into a `--clear-gradient-ready` token beside the existing
`--clear-gradient-rest` — flag to the design-skill vocabulary if done.

### [Correctness] InstallBanner's parting timer is never cleaned up

**File(s):** `web/src/lib/components/InstallBanner.svelte` (`$effect`, lines 45–57) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
$effect(() => {
  if (!visible || parting) return;
  …
  parting = true;
  setTimeout(() => {
    exitIntoParentButton = true;
    parting = false;
  }, PARTING_MESSAGE_MS);
});
```

The `setTimeout` handle is discarded and the effect returns no cleanup. If the component unmounts
during the 4-second parting window (route teardown, or the boot-hidden-overlay tree being torn down
in a test), the callback still fires and writes component state after destroy. It is also the only
latch that ever resets `parting` — an effect re-run can't cancel or double-schedule it today only
because `parting = true` guards re-entry; that invariant is implicit and one refactor away from
stacked timers. Every other timer in this section is cleaned up (`ClearCoachmark` clears
`tutorialDismissTimer` on dismiss and unmount; `dragToClear` tracks a `resetTimers` set).

#### Proposed solution

Store the handle and return a cleanup from the `$effect` (cleanup never runs on the server, matching
the repo's SSR-teardown rule):

```ts
let partingTimer: ReturnType<typeof setTimeout>;
$effect(() => {
  …
  partingTimer = setTimeout(…, PARTING_MESSAGE_MS);
  return () => clearTimeout(partingTimer);
});
```

Note the cleanup also runs on dependency re-runs — verify the `parting` guard ordering still
schedules exactly once (the early `if (!visible || parting) return` runs before any scheduling, so a
re-run during parting registers no new timer and must not clear the live one; scoping the clear to
unmount via a nested `$effect` or an explicit `onMount`-style teardown may be cleaner).

### [Correctness] `.install-cta:hover` is not guarded behind `@media (hover: hover)`

**File(s):** `web/src/lib/components/InstallBanner.svelte` (lines 285–287) @ 9ae62ff1

**Priority:** P4

#### Problem

```css
.install-cta:hover {
  filter: brightness(1.05);
}
```

The same file wraps `.install-dismiss:hover` in `@media (hover: hover)` (lines 206–212), and
ActionsPanel documents the WHY at length (lines 625–632: "iOS WebKit applies :hover on tap and keeps
it sticky until the user taps elsewhere"). The install banner is primarily a *touch* surface (its
whole purpose is phones/tablets), so the unguarded rule leaves the CTA stuck 5% brighter after every
tap — minor visually, but it is the exact documented bug class this codebase already fights, applied
inconsistently within one component.

#### Proposed solution

Move `.install-cta:hover` inside an `@media (hover: hover)` block (can share the existing one at
line 206).

### [Maintainability] Slider's `step`/`pageStep` props are speculative surface, and pointer drags ignore `step` anyway

**File(s):** `web/src/lib/components/Slider.svelte` (lines 12–13, 35–36, 59–61, 87–97, 116–145) @
9ae62ff1

**Priority:** P4

#### Problem

No production caller passes `step` or `pageStep`: the only consumer is `SliderRow.svelte`, whose
`Props` (lines 6–24) don't even include them, so both Parent Center sliders always get the defaults
(`1`/`10`). CLAUDE.md: "A new prop, option, or optional parameter needs a production caller that
exercises it; a seam kept only for tests gets a comment saying so" — these have neither.

The props are also misleading as a contract: `step` only quantizes the keyboard path (lines 121,
124), while `apply()`/`clamp()` (lines 59–67) round pointer-drag values to whole integers regardless
— a `step={5}` slider would arrow-key in fives but drag to any integer. Nobody hits this today
precisely because nothing passes `step`, which is the tell that the surface is speculative.

#### Proposed solution

Demote both to named module constants:

```ts
const KEY_STEP = 1;
const PAGE_STEP = 10;
```

and delete the props (SliderRow needs no change). If a future setting genuinely needs coarser steps,
reintroduce `step` then — and make `clamp` quantize to it on the pointer path too so the contract is
honest.

### [Readability] ClearCoachmark's `tutorialFadeOut` state and `.fade-out` rule are dead weight

**File(s):** `web/src/lib/components/ClearCoachmark.svelte` (lines 10, 54, 68, 82, 115–117) @
9ae62ff1

**Priority:** P4

#### Problem

`dismiss()` sets `tutorialVisible = false; tutorialFadeOut = true` and the template binds
`class:fade-out={tutorialFadeOut}`. But the base rule already declares `opacity: 0` with a `0.4s`
opacity transition and delayed `visibility` (lines 98–108); removing `.visible` alone produces
exactly the fade-out the `.fade-out` class (line 115–117: `opacity: 0`) restates. Since `.fade-out`
is only ever present when `.visible` is absent, the class changes nothing — the extra `$state`, the
two writes, the class binding, and the CSS rule are all inert, and a reader has to reason through
the transition timing to discover that.

#### Proposed solution

Delete `tutorialFadeOut`, its writes in `show()`/`dismiss()`, the `class:fade-out` binding, and the
`.clear-coachmark.fade-out` rule; verify the dismiss fade in the browser (the base
`transition: opacity 0.4s ease, visibility 0.4s` carries it). If some engine quirk actually needs
the explicit class, that's a WHY comment the current code is missing.

### [Maintainability] Deliberately non-reactive `let`s lack the required "intentionally untracked" comments

**File(s):** `web/src/lib/components/Slider.svelte` (lines 47–50),
`web/src/lib/components/ClearCoachmark.svelte` (line 12),
`web/src/lib/components/ClearButton.svelte` (lines 18–19) @ 9ae62ff1

**Priority:** P4

#### Problem

`.claude/rules/svelte.md`: "a deliberately non-reactive `let` (timer handles, transition-time
latches) carries a one-line comment saying it's intentionally untracked." Violations in this
section:

* `Slider.svelte:47–50` — `dragPointerId`, `dragStartX`, `dragStartValue`, `active`: four
  uncommented plain `let`s (all correctly non-reactive — nothing renders from them — but nothing
  says so).
* `ClearCoachmark.svelte:12` — `tutorialDismissTimer`: a timer handle, the rule's own canonical
  example, uncommented.
* `ClearButton.svelte:18–19` — `isDragging` has a comment ("Tracked so resetButtonPosition can skip
  a reset mid-gesture") that explains its purpose but not that it is deliberately untracked — and
  the word "Tracked" actively suggests the opposite of its reactivity status.

A reviewer (or a lint pass someday) can't distinguish these from forgotten `$state`.

#### Proposed solution

One-line comments per the rule, e.g.
`// Untracked on purpose: drag bookkeeping, nothing renders from these.` above the Slider block;
reword ClearButton's to
`// Untracked latch — read imperatively by resetButtonPosition to skip a reset mid-gesture.`

### [Maintainability] The accept-radius derivation is duplicated between ClearCoachmark and dragToClear

**File(s):** `web/src/lib/components/ClearCoachmark.svelte` (`getAcceptRadius`, lines 14–16),
`web/src/lib/actions/dragToClear.ts` (lines 59–61) @ 9ae62ff1

**Priority:** P4

#### Problem

Both files define the identical function:

```ts
function getAcceptRadius() {
  return Math.min(window.innerWidth, window.innerHeight) * ACCEPT_RADIUS_FACTOR;
}
```

Sharing only the factor constant but duplicating the derivation means the coachmark's "faint preview
of the real accept-zone ring" (its stated purpose, line 29) only matches the live ring as long as
both formulas stay identical by hand — e.g. if the gesture ever switches to `visualViewport`
dimensions or clamps the radius, the tutorial would silently demonstrate the wrong threshold.

#### Proposed solution

Export the function, not just the factor, from `dragToClear.ts`:

```ts
export function acceptRadiusPx(): number { … }
```

and delete both local copies (dragToClear's internal `getAcceptRadius` becomes the exported one;
ClearCoachmark imports it instead of `ACCEPT_RADIUS_FACTOR`).

### [Testing] `MAX_ACTION_BUTTON_COUNT` agrees with `visibleActionButtonCount` only by prose; the test pins a bare `6`

**File(s):** `web/src/lib/actionButtonLayout.ts` (lines 35–38),
`web/src/lib/actionButtonLayout.test.ts` (lines 49–51) @ 9ae62ff1

**Priority:** P4

#### Problem

`MAX_ACTION_BUTTON_COUNT = 6` (line 38) must equal `visibleActionButtonCount()`'s value with every
toggle on — the constant sizes the SSR worst case, the function sizes the live row. The link is
maintained by the comment listing the six buttons (lines 35–37). The existing test asserts the
all-on count as a literal `6` (test line 50: `expect(visibleActionButtonCount()).toBe(6)`), not
against the constant — so adding a seventh button to the function while forgetting the constant
keeps every test green (the fallback test would still pass: it checks the CSS matches the stale
constant), and first paint budgets for one button too few, letting the pre-hydration row overflow
into the Parent Help Button. The testing rule is explicit: "Parametrized tests import the
constant/manifest they exercise — never re-declare the value."

#### Proposed solution

In `actionButtonLayout.test.ts`, add (or amend the existing AI test):

```ts
it('all-on count equals MAX_ACTION_BUTTON_COUNT', () => {
  setAiAccessToken('tok');
  expect(visibleActionButtonCount()).toBe(MAX_ACTION_BUTTON_COUNT);
});
```

which turns the prose comment into a mechanical guard.

### [Architecture] The global Ctrl+Z shortcut lives inside ActionsPanel and bypasses the undo parent toggle

**File(s):** `web/src/lib/components/ActionsPanel.svelte` (lines 168–174) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    handleUndoClick();
  }
};
window.addEventListener('keydown', onKeyDown);
```

Two issues:

1. **Placement.** A window-level, app-wide keyboard shortcut is not panel UI; it works only because
   ActionsPanel happens to be always-mounted on the drawing route. A first-time reader looking for
   "where is Ctrl+Z handled" has no reason to open the actions panel component, and any future
   route/layout where the panel unmounts silently loses the shortcut. The repo's own pattern for
   page-lifecycle imperative wiring is a named helper in `lib/boot/` returning a teardown.
2. **Setting bypass.** When the parent switches the undo control off (`settings.undoButtonEnabled` →
   `data-off-undo` hides the button), Ctrl+Z still undoes. Whether that's intended (the toggle is
   about button clutter, not forbidding undo) is undocumented either way.

#### Proposed solution

Extract e.g. `installUndoShortcut(): () => void` into `lib/boot/` (called from the route's `onMount`
chain like `installContextMenuGuard`), taking the end-of-history nudge callback so the shake still
plays — or keep the nudge panel-local and have the boot helper call `undo()` guarded on
`canvasState.canUndo`. Decide and document the `undoButtonEnabled` interaction (a one-line WHY if
the bypass is deliberate; a `settings` check if not).

### [Readability] Slider's `clamp()` hides a `Math.round`

**File(s):** `web/src/lib/components/Slider.svelte` (lines 59–61) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
function clamp(v: number) {
  return Math.round(Math.min(max, Math.max(min, v)));
}
```

The name promises clamping; the function also quantizes to integers — a behavior callers rely on
(drag deltas are fractional) but cannot see at the call sites (`apply` line 64). Anyone extending
the slider to fractional values (or wiring `step` quantization, see the step finding) would
reasonably not expect `clamp` to round.

#### Proposed solution

Rename to `roundAndClamp` (or `toSliderValue`), or split the round into `apply()` where the drag →
value conversion happens.

### [Testing] NotchBand's native status-bar branching is untested inline effect logic with an unguarded dynamic import

**File(s):** `web/src/lib/components/NotchBand.svelte` (lines 41–56) @ 9ae62ff1

**Priority:** P5

#### Problem

The `$effect` maps `band.statusBarStyle`/`band.statusBarHidden` to plugin calls inline:

```ts
import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
  if (style) {
    StatusBar.setStyle({ style: style === 'DARK' ? Style.Dark : Style.Light }).catch(() => {});
  }
  if (hidden !== null) {
    (hidden ? StatusBar.hide() : StatusBar.show()).catch(() => {});
  }
});
```

Per the testing rule, imperative logic whose only coverage is E2E (here: none — it needs a device)
inline in a component is an extraction candidate. The mapping (`'DARK'` → `Style.Dark`, tri-state
`hidden`) is pure decision logic married to plugin I/O. Also, the two plugin calls swallow
rejections but the `import()` itself has no `.catch` — a failed chunk resolution would surface as an
unhandled rejection (unlikely on native where the chunk is local, hence P5).

#### Proposed solution

Extract
`applyStatusBar(style: 'DARK' | 'LIGHT' | null, hidden: boolean | null, bar: Pick<StatusBarPlugin, 'setStyle' | 'hide' | 'show'>)`
into `lib/notchBand.ts` (or a sibling), unit-test the branch matrix with a stub, and add
`.catch(() => {})` to the import chain. The component effect shrinks to the `__IS_CAPACITOR__`
gate + lazy import + one call.

## Source: Code audit — Gestures / Svelte actions

### [Correctness] pinchTextZoom can leak a phantom pointer — a lone finger then drives zoom and every tap gets swallowed

**File(s):** `web/src/lib/actions/pinchTextZoom.svelte.ts` (`onPointerDown` lines 75–86,
`onPointerMove` lines 88–96, `onClickCapture` lines 107–112) @ 9ae62ff1

**Priority:** P2

#### Problem

Only the finger that *completes* the pair is captured (line 84, inside
`if (tracker.pointerCount === 2)`):

```ts
if (tracker.pointerCount === 2) {
  pinchedRecently = true;
  rebase();
  capturePointer(node, e.pointerId);
}
```

The first finger is deliberately left uncaptured so one-finger scrolling stays native — but that
means its `pointerup` is only seen when it fires inside `node`'s subtree. During a pinch the fingers
spread apart; if the resting first finger drifts outside the `.pc-pane` bounds (easy in the exact
scenario the comment at lines 49–53 describes: primary finger resting on a hub row while the second
finger spreads) and lifts there, `node`'s `pointerup` listener never fires for it, `tracker.up()` is
never called, and the tracker keeps a phantom entry forever. The pane's `touch-action` permits
panning, so a scroll-claimed finger would get `pointercancel` — but a
*stationary-then-lifted-outside* finger gets nothing.

Consequences while the phantom persists (until an option change reruns the reset `$effect`, e.g.
navigating sections via `resetKey: view` or closing the overlay):

* `onPointerMove` (line 92): `tracker.pointerCount` is now 2 with one real finger, so ordinary
  one-finger scrolling drives `nextTextZoom` against a stale spread — the text zooms erratically
  while the user tries to scroll.
* `onPointerDown` (line 79): `tracker.pointerCount === 0` is never true again, so `pinchedRecently`
  is never cleared at gesture start, and every subsequent tap re-enters the `pointerCount === 2`
  branch setting `pinchedRecently = true` — `onClickCapture` then swallows the tap's click. Parent
  Center rows, toggles, and links go dead.

`pinchZoom` does not have this hole because it captures *every* finger on `pointerdown`
(`web/src/lib/actions/pinchZoom.svelte.ts` line 197).

#### Proposed solution

Two options, cheapest first:

1. When the pinch engages (count reaches 2), capture *both* pointers, not just the incoming one. The
   tracker knows the other id — expose it (e.g. `tracker.ids(): number[]`) and call
   `capturePointer(node, id)` for each. Capturing the first finger only once a pinch is confirmed
   does not disturb native one-finger scrolling (that gesture never reaches count 2).
2. Alternatively (or additionally, as belt-and-braces), listen for `pointerleave` on `node` and
   route it to `onPointerUp` — for touch pointers, leaving the element's bounds fires
   `pointerleave`, which reclaims the entry.

Add a unit test that simulates down(1), down(2), lift of pointer 1 *not* delivered to the node, then
asserts a single-finger move does not change zoom / a following tap's click is not swallowed.

### [Performance] spreadTracker's SvelteMap is dead reactivity — nothing reads it in a reactive context, and its comment claims otherwise

**File(s):** `web/src/lib/actions/spreadTracker.svelte.ts` (lines 1, 13–18) @ 9ae62ff1; consumers
`web/src/lib/actions/pinchZoom.svelte.ts`, `web/src/lib/actions/pinchTextZoom.svelte.ts`

**Priority:** P2

#### Problem

```ts
// It is a SvelteMap so `pointerCount` stays reactive for `pinchZoom`'s
// `pointerCount`/`isZoomed` getters.
export function createSpreadTracker() {
  const pointers = new SvelteMap<number, Point>();
```

The stated justification is false at 9ae62ff1: every read of
`pointerCount`/`isZoomed`/`points()`/`spread()` happens inside plain pointer-event handlers
(`engaged()` at pinchZoom line 189–191, `apply()` line 174–178, pinchTextZoom lines 79/81/92/101),
never in a template, `$derived`, or tracking `$effect`. The only component-visible output is the
`.zoomed` class, toggled imperatively via `classList.toggle` (pinchZoom line 177) —
`AiImageResult.svelte` line 241 even documents that. The two `$effect`s in the actions only *write*
(via `reset()` → `tracker.clear()`).

Cost of keeping it: `SvelteMap.set()` runs on **every pointermove** of both pinch gestures (signal
version bumps and reaction scheduling on a path the repo's hot-path rule says must stay lean), and
the comment sends the next reader hunting for a reactive consumer that doesn't exist. It also props
up the misleading `.svelte.ts` suffix story — nothing in the file uses runes.

#### Proposed solution

Replace `SvelteMap` with a plain `Map`, delete the reactivity comment, and rename the file
`spreadTracker.ts` (updating the two imports and the test import). If a future consumer genuinely
needs a reactive `pointerCount`, that is the moment to reintroduce it — with a real reader to point
at. Check `git log` first (f3faf52 already trimmed an allocation here) to confirm no reactive
consumer existed and was removed without downgrading the map; the current tree has none.

### [Maintainability] dragToClear's exit-choreography timings agree with ClearButton.svelte's CSS by prose only

**File(s):** `web/src/lib/actions/dragToClear.ts` (lines 14–15, `playClearExit` lines 224–244) @
9ae62ff1; `web/src/lib/components/ClearButton.svelte` (line 291)

**Priority:** P3

#### Problem

```ts
const PAGE_TURN_DURATION = 600;
const EXIT_RETURN_DELAY = 650;
```

`PAGE_TURN_DURATION` must equal the ripple animation it waits out —
`animation: ripple 0.6s var(--ease-glide) forwards;` (ClearButton.svelte line 291) — and
`EXIT_RETURN_DELAY` is implicitly `PAGE_TURN_DURATION + 50` (the comment at lines 221–223 says the
delays "only hand the classes over at each stage"). CLAUDE.md is explicit: cross-file agreement is
never maintained by prose; when the agreeing sites can't share code (JS constant ↔ component CSS), a
drift-guard test reads both sides. Today, retuning the ripple in CSS silently desynchronizes the
class handoff: the `animating` class is removed before/after the animation actually ends, and
`clearing-done` lands at the wrong moment.

#### Proposed solution

Two-part fix:

1. Express the dependency inside the module:
   `const EXIT_RETURN_DELAY_MS = PAGE_TURN_DURATION_MS + RETURN_HANDOFF_GAP_MS;` so only one number
   encodes the ripple length.
2. Add a drift-guard test in the pattern of `web/src/app.html.test.ts`: export
   `PAGE_TURN_DURATION_MS`, and have a test read `ClearButton.svelte` source, extract the `ripple`
   animation duration (regex on `animation: ripple ([\d.]+)s`), and assert it matches. (The existing
   `onTransitionEnd` trick at lines 250–254 shows the codebase already prefers reading timing off
   the DOM where possible — an alternative is doing the same for the ripple via `animationend`,
   which removes the constant entirely.)

### [Maintainability] Tuning constants missing the mandated unit suffixes

**File(s):** `web/src/lib/actions/dragToClear.ts` (lines 8–15) @ 9ae62ff1;
`web/src/lib/actions/launchGuard.ts` (line 20)

**Priority:** P3

#### Problem

CLAUDE.md: "a numeric literal that encodes a tunable decision … gets a named module-scope constant
**with the unit in the name** (`_MS`, `_PX`, …)". These violate it:

```ts
const HOLD_DURATION = 500; // → HOLD_DURATION_MS
const MOVEMENT_THRESHOLD = 50; // → MOVEMENT_THRESHOLD_PX
const MULTI_CLICK_WINDOW = 1000; // → MULTI_CLICK_WINDOW_MS
const ACCEPT_ZONE_HIDE_DELAY = 250; // → ..._MS
const DRAW_SOUND_STOP_DELAY = 300; // → ..._MS
const PAGE_TURN_DURATION = 600; // → ..._MS
const EXIT_RETURN_DELAY = 650; // → ..._MS
```

and in launchGuard, `export const DEFAULT_RADIUS = 72;` (px). `MULTI_CLICK_THRESHOLD` (a count) and
`ACCEPT_RADIUS_FACTOR` (dimensionless) are fine. The launchGuard names carry a second problem: the
`DEFAULT_` prefix implies an override path that does not exist (no caller can pass a different
radius/duration — that would be speculative surface anyway), so `LAUNCH_ZONE_RADIUS_PX` /
`LAUNCH_ZONE_DURATION_MS` say what they are without promising configurability. `DEFAULT_DURATION_MS`
at least has the unit; `DEFAULT_RADIUS` has neither.

#### Proposed solution

Mechanical rename (constants are module-private except `ACCEPT_RADIUS_FACTOR`, `DEFAULT_RADIUS`,
`DEFAULT_DURATION_MS`; the latter two are imported by `launchGuard.test.ts` only, so the rename
touches that one test). Keep the WHY comments on the constants as-is.

### [Readability] `holdStartX/holdStartY` are byte-for-byte duplicates of `startPointerX/startPointerY`

**File(s):** `web/src/lib/actions/dragToClear.ts` (lines 37–38, 43–44, 108–117, 146–147) @ 9ae62ff1

**Priority:** P3

#### Problem

`onPointerDown` assigns both pairs from the same event coordinates:

```ts
holdStartX = clientX;   // line 110
holdStartY = clientY;   // line 111
...
startPointerX = clientX; // line 116
startPointerY = clientY; // line 117
```

Neither pair is written anywhere else, so they are always equal. `onPointerMove` measures
hold-cancel movement against `holdStartX/Y` (lines 146–147) and drag distance against
`startPointerX/Y` (via `dragDistance`, lines 63–65) — two names for one anchor point. A reader must
diff the assignments to discover they can't diverge, and a future edit that moves one assignment
silently forks the semantics.

#### Proposed solution

Delete `holdStartX/holdStartY` and compute the hold-cancel deltas from
`startPointerX/startPointerY`. If the per-axis (Chebyshev) check at line 148 versus the Euclidean
`dragDistance` elsewhere is deliberate, keep the check shape and just swap the variables; the
behavior is identical.

### [Types] `onRequestClose` is documented required but typed optional

**File(s):** `web/src/lib/actions/modalDialog.svelte.ts` (`ModalOptions`, lines 38–46; doc lines
16–18) @ 9ae62ff1

**Priority:** P3

#### Problem

The header comment says:

```
//   onRequestClose  (required) called to dismiss — should flip `open` to false.
```

but the interface says `onRequestClose?: () => void;` (line 40). All five production call sites
(`AiImagePrompt`, `AiImageResult`, `ColorPicker`, `ColoringBook`, `ParentCenter`) pass it. The
optional marker forces `o.onRequestClose?.()` call sites (lines 73, 105) and lets a sixth dialog
compile without any way to dismiss on backdrop tap or re-sync after Esc — exactly the bug the type
should prevent. This is a closed contract being kept open at the type level, contradicting the
repo's "close finite value sets in the type" spirit and its own docs.

#### Proposed solution

Make it required: `onRequestClose: () => void;`, drop the two `?.` invocations, and delete the
now-redundant "(required)" prose (the type says it). Same review for `open` (already required —
fine).

### [Correctness] pinchZoom writes a non-normalized identity transform on every plain tap (and while disabled)

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts` (`apply` lines 174–178, `onPointerUp` lines
213–218) @ 9ae62ff1

**Priority:** P3

#### Problem

`apply()` writes unconditionally:

```ts
if (target) target.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
```

`onPointerUp` always calls `apply(getOptions().target)` (line 216) — including after a simple tap
that never zoomed, and (per the deliberate comment at line 212) even after `enabled` flipped false
mid-gesture, i.e. right after the reset `$effect` wrote `''`. So the "un-zoomed" state has two
on-DOM representations: `''` and `translate(0px, 0px) scale(1)`. The non-empty inline transform
creates a containing block/stacking context the reset state doesn't have, and makes DOM assertions
("transform cleared") flaky-by-design. The sibling `pinchTextZoom` already normalizes:
`target.style.zoom = zoom === MIN_TEXT_ZOOM ? '' : String(zoom)` (line 57).

#### Proposed solution

Normalize in `apply()` the way `pinchTextZoom` does:

```ts
const identity = t.scale === MIN_SCALE && t.x === 0 && t.y === 0;
target.style.transform = identity ? '' : `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
```

That keeps the line-212 release path intact while collapsing the two rest-state representations into
one.

### [Correctness] modalDialog leaves stale `--origin-x/y` behind for a later unanchored open

**File(s):** `web/src/lib/actions/modalDialog.svelte.ts` (`$effect`, lines 113–128) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
if (o.origin) {
  node.style.setProperty('--origin-x', `${o.origin.x - window.innerWidth / 2}px`);
  node.style.setProperty('--origin-y', `${o.origin.y - window.innerHeight / 2}px`);
}
```

There is no `else` clearing the vars. The `Modal` contract explicitly admits `show(null)`
(`web/src/lib/state/modal.svelte.ts`: `show(origin: Origin | null)`, and `hide()` does not reset
`origin` to null — but nothing forbids a caller passing null). After one anchored open, a later
`show(null)` on the same dialog replays `dialogFlyFromOrigin` (`app.css` line 113, reading
`var(--origin-x, 0px)`) from the *previous* button's position instead of the centered default. The
launch guard handles this case correctly one line later (`guardLaunchZone(o.origin ?? null)` arms
nothing); the fly-in doesn't.

#### Proposed solution

Add the else branch:
`node.style.removeProperty('--origin-x'); node.style.removeProperty('--origin-y');` so the
keyframe's `0px` fallback applies. One-line fix, and it makes the `origin: null` path actually mean
"no anchor" end to end.

### [Testing] modalDialog is the only action in the directory with no unit test

**File(s):** `web/src/lib/actions/modalDialog.svelte.ts` (whole file) @ 9ae62ff1

**Priority:** P4

#### Problem

Every other action here has a colocated `.test.ts` — `dragToClear`, `launchGuard`, `pinchTextZoom`,
`pinchZoom`, `scribbleGuard`, `spreadTracker`. `modalDialog` has none, yet it encodes the subtlest
logic in the directory: the capture-phase launch-zone swallow (lines 54–74), the ghost-click guard
with the `detail === 0` keyboard carve-out (lines 83–89, the issue `#308` fix), Esc gating via
`cancel` (lines 91–96), and the Esc/flag re-sync in `onClose` (lines 98–106). Some of this is
exercised end-to-end (e.g. `flows-*` specs), but the branch matrix — `blockBackdropAt` veto vs
`allowDismiss` gate vs inside-dialog fall-through, keyboard click vs ghost click — is exactly what a
unit layer should pin, per the repo's "pick the lowest layer that can catch the regression" rule.

#### Proposed solution

Add `modalDialog.svelte.test.ts` (happy-dom). The `$effect` at line 113 needs a reactive context —
wrap action setup in `$effect.root(...)` (which Vitest + the svelte plugin supports in
`.svelte.test.ts` files), or split the handler wiring from the effect so handlers are testable
without it. Reuse the `pointerEvent` stub pattern from `dragToClear.test.ts`. Cases: backdrop tap
dismisses; tap inside rect does not; launch-zone tap swallowed on backdrop *and* content; `detail 0`
click passes; `blockBackdropAt` veto; `allowDismiss` false blocks tap and `cancel`; `close` with
`open` still true calls `onRequestClose`.

### [Testing] dragToClear's multi-tap tutorial path has zero coverage

**File(s):** `web/src/lib/actions/dragToClear.ts` (`registerTap`, lines 69–82) @ 9ae62ff1;
`web/src/lib/actions/dragToClear.test.ts`

**Priority:** P4

#### Problem

`dragToClear.test.ts` covers pointer identity, the exit choreography, cancel paths, destroy, and the
*hold* tutorial trigger (lines 252–304) — but nothing exercises `registerTap`:
`MULTI_CLICK_THRESHOLD` taps inside `MULTI_CLICK_WINDOW` showing the tutorial, the count resetting
when the window lapses, and (critically) the `return true` path in `onPointerDown` (line 106) that
suppresses starting a drag on the tutorial-triggering tap. That last branch changes gesture behavior
— a regression there would make the third rapid tap simultaneously open the tutorial *and* begin a
drag — and no test would notice.

#### Proposed solution

Three tests with fake timers: (1) three `pointerdown`s within 1s → `onTutorialShow` called once and
no `dragging` class after the third; (2) taps spaced past `MULTI_CLICK_WINDOW` never trigger; (3)
after a triggering run the counter resets (a fourth tap doesn't re-trigger). Import the thresholds
from the module rather than inlining 3/1000 (see the next finding).

### [Testing] dragToClear.test.ts re-declares `ACCEPT_RADIUS_FACTOR` instead of importing it

**File(s):** `web/src/lib/actions/dragToClear.test.ts` (line 26) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const acceptRadius = () => Math.min(window.innerWidth, window.innerHeight) * 0.4;
```

The source exports `ACCEPT_RADIUS_FACTOR = 0.4` (dragToClear.ts line 7) precisely so consumers
(`ClearCoachmark.svelte`) don't fork the value — and the test file, which imports the module anyway,
hardcodes `0.4`. The testing rule is explicit: "tests import the constant they exercise — never
re-declare the value (a mirrored copy keeps passing for the wrong reason)". Concretely: lower the
factor to 0.3 and every "drag past the radius" test still passes while asserting against a
now-oversized distance — passing for the wrong reason. The fake-timer durations
(`vi.advanceTimersByTime(499)` etc.) mirror `HOLD_DURATION`/the exit delays the same way; those
constants aren't exported today.

#### Proposed solution

`import { ACCEPT_RADIUS_FACTOR } from './dragToClear'` in the test and use it in `acceptRadius()`.
For the timing assertions, either export the timing constants (they're already named) or accept the
mirroring there — the radius one is the clear-cut fix since the constant is already exported.

### [Maintainability] `clampScale` and `clampTextZoom` duplicate the same clamp-with-NaN-fallback policy

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts` (lines 35–38) @ 9ae62ff1;
`web/src/lib/actions/pinchTextZoom.svelte.ts` (lines 7–10)

**Priority:** P4

#### Problem

```ts
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}
```

```ts
export function clampTextZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_TEXT_ZOOM;
  return Math.min(MAX_TEXT_ZOOM, Math.max(MIN_TEXT_ZOOM, zoom));
}
```

Identical logic, different bounds. The "non-finite falls back to min" behavior is a shared safety
policy, and today it's only kept in agreement by a test comment — `pinchTextZoom.svelte.test.ts`
line 11: `'falls back to MIN for non-finite input (matches clampScale)'` — which is exactly the
prose-maintained agreement CLAUDE.md bans.

#### Proposed solution

Add `clampFinite(value: number, min: number, max: number): number` to `spreadTracker` (the file both
actions already import) or a tiny shared `gestureMath.ts`, and reduce both exported clamps to
one-liners over it. Keep the two named wrappers exported — the tests and the min/max constants stay
put; only the policy is shared.

### [Maintainability] Hold-timer lifecycle: stale handle after natural fire + duplicated cancel block

**File(s):** `web/src/lib/actions/dragToClear.ts` (`scheduleReset` lines 50–57, `onPointerMove`
lines 149–153, `finishDrag` lines 190–194) @ 9ae62ff1

**Priority:** P4

#### Problem

Two related smells. First, when the hold timer fires naturally, `scheduleReset`'s wrapper removes
the id from `resetTimers` but `holdTimer` keeps the dead handle — it is only nulled by the cancel
paths. Code that later runs `clearTimeout(holdTimer)` on the fired id is harmless *today*, but
`holdTimer !== null` no longer means "a hold is pending", which is precisely the kind of stale-latch
a future guard would trip over. Second, the cancel ritual is copy-pasted verbatim:

```ts
if (holdTimer !== null) {
  resetTimers.delete(holdTimer);
  clearTimeout(holdTimer);
  holdTimer = null;
}
```

at lines 149–153 and again at 190–194.

#### Proposed solution

Extract `cancelHoldTimer()` and call it from both sites; have the scheduled callback also null
`holdTimer` when it fires
(`holdTimer = scheduleReset(() => { holdTimer = null; o.onTutorialShow(); }, ...)`). Note
`onPointerMove`'s `o.onTutorialDismiss()` at line 155 must stay *outside* the null-guard — it also
dismisses a tutorial the hold already showed.

### [Readability] `playClearExit` shadows the action's `node` with a redundant parameter

**File(s):** `web/src/lib/actions/dragToClear.ts` (`playClearExit`, lines 224–244; call site
line 272) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
function playClearExit(node: HTMLButtonElement, o: DragToClearOptions): void {
```

The only call passes the enclosing action's `node` (line 272: `playClearExit(node, o)`), so the
parameter shadows the closure variable every sibling helper (`finishDrag`, `resetDragVisuals`,
`onTransitionEnd`) reads directly. The shadowing invites the classic bug of the two diverging, and
the inconsistency makes a reader ask why this one helper is parameterized.

#### Proposed solution

Drop the parameter; use the closed-over `node` like the other helpers:
`function playClearExit(o: DragToClearOptions): void`.

### [Readability] `homeButtonCenter` is dead module-scope state — written and read only inside `armAcceptZone`

**File(s):** `web/src/lib/actions/dragToClear.ts` (lines 39, 84–100) @ 9ae62ff1

**Priority:** P4

#### Problem

`let homeButtonCenter = { x: 0, y: 0 };` (line 39) is assigned at line 89 and read only at lines
91–92 — all within `armAcceptZone`. Nothing else in the file touches it, so hoisting it to
gesture-lifetime state is a lie about its scope: a reader auditing the (already large) per-drag
state block must trace it to discover it carries nothing between events.

#### Proposed solution

Delete the module-scope `let`; inside `armAcceptZone` use the `center` parameter directly
(`o.acceptZoneEl.style.left = \`${center.x - radius}px\`` …). The parameter name already documents
it.

### [Performance] Pinch move path allocates per pointermove, against the repo's hot-path rule

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts` (`centroid` lines 54–62, `recompute` lines
89–108, `local` lines 169–172) @ 9ae62ff1; `web/src/lib/actions/spreadTracker.svelte.ts` (`points()`
lines 24–26)

**Priority:** P4

#### Problem

The svelte rule file is explicit that gesture trackers are hot paths: "code reached per pointermove
… must not allocate arrays/objects". Each `pinchZoom` move allocates: `tracker.points()` builds a
fresh array (twice per move — `recompute` line 91 and inside `centroid`'s caller), `centroid`
returns a new object, `local` returns a new `Point`, `recompute` builds a new transform object, and
`apply` builds a template string. A prior commit (f3faf52) already removed one such allocation from
`spread()`, so the codebase treats this path as worth tightening; the remaining ones are the same
class. In fairness this runs only while pinching the AI preview (not while drawing), so the
practical stakes are modest — but the stated rule draws no such distinction, and the fix is cheap.

Secondary: the `rect ?? node.getBoundingClientRect()` fallbacks (lines 165, 171) are defensive
lazy-init on the move path — unreachable in practice (`rect` is always set by the `pointerdown` that
made `pointerCount > 0`), which the hot-path rule also calls out.

#### Proposed solution

Give the tracker a non-allocating iteration surface (e.g. `forEach(cb)` or reused first/second
accessors — it already has an allocation-free `spread()`); compute the centroid with a running sum
over that; reuse a scratch `Point`/transform object in `recompute`. Replace the `??` fallbacks with
a direct `rect!`-free structure: snapshot `rect` in `onPointerDown` and pass width/height/left/top
through the closure invariant (a comment stating the invariant beats a silent re-measure). Verify
with `npm run perf:*` only if the drawing path is ever routed through this tracker; otherwise a
before/after allocation check in DevTools is enough.

### [Correctness] `preventDefault()` on pointermove in both pinch actions is a no-op — the real suppression is `touch-action` CSS

**File(s):** `web/src/lib/actions/pinchTextZoom.svelte.ts` (line 95) @ 9ae62ff1;
`web/src/lib/actions/pinchZoom.svelte.ts` (lines 198, 208)

**Priority:** P4

#### Problem

Per the pointer-events spec, canceling `pointermove` has no default action — scrolling/zooming
interruption is governed by `touch-action` (and canceling `touchstart`/`touchmove`). The codebase
knows this: `pinchZoom`'s own header (lines 2–5) attributes the drawing-surface lock to
"touch-action:none + the engine's touch preventDefault", and the AI zoom surface carries
`touch-action: none` (`AiImageResult.svelte` line 229). So `e.preventDefault()` at pinchTextZoom
line 95 and pinchZoom line 208 does nothing, and a reader debugging a scroll/zoom conflict will be
misled into thinking these calls are load-bearing. (The `pointerdown` preventDefault at pinchZoom
line 198 *does* have real effects — suppressing compat mouse events, text selection, and native
image drag — and should stay.)

#### Proposed solution

Remove the two `pointermove` `preventDefault()` calls, or — if on-device testing (the guarded
browsers in `docs/COMPATIBILITY.md`) reveals an engine that still honors them — keep them behind a
WHY comment naming that engine. Verify with the existing `parent-zoom.spec.ts` plus a manual iOS
Safari pass, since this is exactly the class of behavior E2E in Chromium can't fully certify.

### [Readability] `isPointInLaunchZone` is a query with hidden writes and a hand-rolled loop

**File(s):** `web/src/lib/actions/launchGuard.ts` (lines 52–61) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
export function isPointInLaunchZone(x: number, y: number): boolean {
  zones = liveZones();
  let hit = false;
  for (const zone of zones) {
    ...
    if (dx * dx + dy * dy <= zone.radiusSq) hit = true;
  }
  return hit;
}
```

Two small things: an `is*` predicate mutates module state (the prune) — the comment discloses it,
but the *name* doesn't; and the loop keeps scanning after a hit instead of early-returning (or just
`return zones.some(...)`). Neither matters for perf (zones is ~1 element), but both cost a beat of
reader attention in a security-adjacent input path.

#### Proposed solution

```ts
export function isPointInLaunchZone(x: number, y: number): boolean {
  zones = liveZones();
  return zones.some((z) => (x - z.x) ** 2 + (y - z.y) ** 2 <= z.radiusSq);
}
```

The prune is worth keeping (it's the timer-free reclamation strategy); consider renaming the private
step so the side effect is named where it happens (`pruneLapsedZones()` instead of assigning from
`liveZones()` inline).

### [Readability] `allowDismiss && o.allowDismiss() === false` — verbose gate duplicated twice

**File(s):** `web/src/lib/actions/modalDialog.svelte.ts` (lines 72, 95) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
if (o.allowDismiss && o.allowDismiss() === false) return;   // onPointerDown
...
if (o.allowDismiss && o.allowDismiss() === false) e.preventDefault();  // onCancel
```

The double mention plus `=== false` obscures the simple semantics ("absent gate means allowed") and
calls the getter through a guard that optional chaining already handles:
`o.allowDismiss?.() === false` is exactly equivalent (absent → `undefined === false` → allowed).

#### Proposed solution

Extract `function dismissAllowed(o: ModalOptions) { return o.allowDismiss?.() !== false; }` and use
it at both sites (`if (!dismissAllowed(o)) ...`). One name, one place, one truth for the
default-allowed policy.

### [Docs] launchGuard comment restates the fly-in duration owned by tokens.css — and misattributes the file

**File(s):** `web/src/lib/actions/launchGuard.ts` (lines 21–23) @ 9ae62ff1; `web/src/tokens.css`
(line 50); `web/src/app.css` (line 113)

**Priority:** P5

#### Problem

```ts
// Fly-in is 0.35s (app.css); hold a little past it so the dialog is plainly
// present before the backdrop goes live.
export const DEFAULT_DURATION_MS = 600;
```

The fly-in duration is not a literal in app.css — it is `var(--duration-slow)` (app.css line 113),
and `--duration-slow: 0.35s` lives in `tokens.css` line 50. CLAUDE.md's comment rule: no restating
mutable values owned elsewhere — name the owning identifier. If the motion token is retuned, this
comment silently lies, and the 600ms margin claim ("a little past it") may stop holding without
anyone noticing.

#### Proposed solution

Reword to name the owner: "Fly-in is `--duration-slow` (tokens.css); hold a little past it …".
Optionally add a drift-guard test asserting `DEFAULT_DURATION_MS` exceeds the parsed
`--duration-slow` value (an inequality guard, matching the intent rather than an exact sync).

### [Testing] `pointerEvent` stub duplicated across test files with a "same way as" pointer comment

**File(s):** `web/src/lib/actions/dragToClear.test.ts` (lines 10–18) @ 9ae62ff1;
`web/src/lib/actions/scribbleGuard.test.ts` (lines 60–66)

**Priority:** P5

#### Problem

Both files hand-roll the happy-dom PointerEvent stub, and dragToClear.test.ts even documents the
copy: "stub it the same way scribbleGuard.test.ts does" (lines 10–11). That's agreement-by-prose
between test files; the testing rule's "a helper needed by a second spec moves to a shared module at
that moment" is written for E2E specs but the rationale (divergent copies rot) applies identically
here. The two copies have already drifted in signature (`clientX/clientY` support in one, not the
other).

#### Proposed solution

Add `web/src/lib/actions/testPointerEvents.ts` (or a `test-helpers` module beside the actions)
exporting `pointerEvent(type, pointerId, clientX?, clientY?)` and, while there,
`transitionEndEvent`. A modalDialog test suite (see the earlier finding) would be the third
consumer, which settles the question.

### [Performance] scribbleGuard allocates `Array.from` on every touch event of guarded controls

**File(s):** `web/src/lib/actions/scribbleGuard.ts` (`cancel`, lines 18–23) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const cancel = (e: TouchEvent) => {
  const touches = Array.from(e.changedTouches) as StylusAwareTouch[];
  if (touches.length > 0 && touches.every((t) => t.touchType === 'stylus')) {
```

`cancel` is wired to `touchmove` too (line 26), so a stylus sliding across a guarded control (the
color palette) allocates an array per move event. Tiny in absolute terms, but it's an allocation in
a per-move handler on toddler-facing chrome, and avoiding it costs nothing.

#### Proposed solution

Iterate the `TouchList` by index:

```ts
const { changedTouches } = e;
if (changedTouches.length === 0) return;
for (let i = 0; i < changedTouches.length; i++) {
  if ((changedTouches[i] as StylusAwareTouch).touchType !== 'stylus') return;
}
e.preventDefault();
```

The `as` stays a per-item boundary cast, same as today.

### [Types] Actions hand-roll their contract instead of using `Action` from `svelte/action`

**File(s):** `web/src/lib/actions/dragToClear.ts`, `web/src/lib/actions/scribbleGuard.ts`,
`web/src/lib/actions/modalDialog.svelte.ts`, `web/src/lib/actions/pinchZoom.svelte.ts`,
`web/src/lib/actions/pinchTextZoom.svelte.ts` @ 9ae62ff1

**Priority:** P5

#### Problem

Every action returns an untyped object literal whose `destroy`/`update` shape is checked only
structurally at the `use:` site. Svelte ships `Action<Element, Parameter>` for exactly this: it
validates the return shape at the declaration, and (for `scribbleTap`, the one action with an
`update`) ties the `update` parameter type to the action's second argument — today `scribbleTap`'s
`update(next: () => void)` (scribbleGuard.ts line 69) and its `activate` parameter agree only by
coincidence.

#### Proposed solution

Annotate, e.g.
`export const scribbleTap: Action<HTMLElement, () => void> = (node, activate) => {...}` and the
getter-parameter actions as `Action<HTMLButtonElement, () => DragToClearOptions>` etc. No runtime
change; purely a contract tightening. Gotcha: `Action`'s parameter is typed as possibly-undefined
when optional — these actions all require their parameter, so use the two-generic form which keeps
it required.

## Source: Code audit — Color palette & picker

### [Correctness] Picker taps that land in a hexagon gap are silently dropped, defeating the snap machinery's stated purpose

**File(s):** `web/src/lib/components/ColorPicker.svelte` (`handlePickerDown`, lines 40–55; snap
rationale comment, lines 57–64) @ 9ae62ff1

**Priority:** P1

#### Problem

The nearest-center snapping (`findHexagonInPicker`, lines 80–92, radius `HEX_SNAP_RADIUS`, line 66)
exists explicitly because — per the comment at lines 57–64 — "A pointed Apple Pencil tip often lands
in the clip-path gap between hexagons, where an element hit-test sees only the picker background.
Snap to the nearest hexagon center within this radius (px) so gap hits still resolve — for the hover
highlight while dragging and the committed color alike."

But the gesture can only reach the snapping code if it *starts* on a direct hexagon hit.
`handlePickerDown` bails on anything that isn't inside a hexagon's clip-path:

```ts
function handlePickerDown(e: PointerEvent) {
  const hex = (e.target as HTMLElement).closest('.hexagon') as HTMLElement | null;
  if (!hex) return;
  isTrackingDrag = true;
  ...
}
```

`clip-path` clips hit-testing as well as painting, so a pointerdown in the gap between hexagons
targets the `.picker` div, `closest('.hexagon')` returns `null`, and the handler returns without
setting `isTrackingDrag`. Both `handlePickerMove` (line 95) and `handlePickerUp` (line 102)
early-return when `!isTrackingDrag`, and `handleHexClick` (line 115) only fires for keyboard clicks
(`e.detail === 0`). Net effect: a **tap** — down + up at the same gap point, the single most common
toddler/pencil interaction — selects nothing, even though the up-coordinate is well inside
`HEX_SNAP_RADIUS` of a hexagon center. The snap only helps when a drag that began on a hexagon
*wanders* into a gap, which is the rarer case; the comment's claim that gap hits resolve for "the
committed color alike" is not true for taps.

(Related but distinct from issue #164, which is about multi-tap color *palette* reliability, not the
picker's gap hit-testing.)

#### Proposed solution

In `handlePickerDown`, when the direct hit-test misses, fall back to the snap before bailing:

```ts
function handlePickerDown(e: PointerEvent) {
  const direct = e.target instanceof Element ? e.target.closest('.hexagon') : null;
  const color =
    (direct instanceof HTMLElement ? direct.dataset.color : null) ??
    findHexagonInPicker(e.clientX, e.clientY);
  if (!color) return;
  isTrackingDrag = true;
  hoveredHex = color;
  ...
}
```

`findHexagonInPicker` already lazy-snapshots centers (`hexCenters ??= snapshotHexCenters()`, line
81), so the eager `hexCenters = snapshotHexCenters()` on line 45 can stay or be dropped. Gotchas: a
down on the picker padding far from any hexagon still (correctly) bails and can continue to
light-dismiss via the dialog backdrop path; and this is a chance to replace the double
`as HTMLElement` cast with the `instanceof` guards shown, per the repo's "`as` is a boundary tool"
convention. Verify with an E2E tap at a known gap coordinate.

### [Architecture] ColorPalette owns the black-ink/theme sync invariant and writes shared state directly from an `$effect`

**File(s):** `web/src/lib/components/ColorPalette.svelte` (`$effect`, lines 35–39) @ 9ae62ff1

**Priority:** P2

#### Problem

```svelte
$effect(() => {
  if (colors.activeSwatch === BLACK_INK) {
    colors.activeColor = themedSwatchColor(BLACK_INK, dark);
  }
});
```

This encodes a *state-level* invariant — "the black swatch paints white on dark paper, even when the
theme flips live" — inside one component, by assigning `colors.activeColor` directly. Two problems:

1. `.claude/rules/svelte.md` is explicit: "Components read state and call setters; they never own
   shared state." Every other write to `colors` goes through `selectPaletteColor` /
   `pickCustomColor` / `selectCustomSwatch` (`web/src/lib/state/colors.svelte.ts`, lines 47–64);
   this is the sole direct field assignment from a component.
2. The invariant only holds while `ColorPalette` happens to be mounted. Today it always is on the
   drawing route, but the engine consumes `colors.activeColor` independently
   (`web/src/lib/drawing/earlyBoot.ts`, line 38), and nothing about the rule is palette-UI-specific
   — it's a property of the color state itself. A future surface that draws without mounting the
   palette (or a test exercising theme flips against the state module) silently loses the sync.

#### Proposed solution

Move the rule into the state layer. Options, in increasing ambition:

* Minimal: keep the effect where it is but route it through the setter —
  `selectPaletteColor(BLACK_INK, themedSwatchColor(BLACK_INK, dark))` — removing the direct-write
  violation only.
* Better: export `syncInkToTheme(dark: boolean)` from `colors.svelte.ts` (guarding on
  `activeSwatch === BLACK_INK` internally) and invoke it from the place that already observes theme
  changes at module scope — `appearance.svelte.ts` runs `updateThemeColorMeta(resolvedTheme())` on
  every flip (line 38); the ink sync belongs beside it. `ColorPalette` then drops the `$effect`
  entirely.

Tradeoff: option 2 introduces an `appearance → colors` module dependency; that direction seems safe
(colors does not import appearance), but confirm no cycle. Unit-test the new function in
`colors.svelte.test.ts` (theme flip while black selected repaints; while another swatch selected
does not).

### [Types] Palette hexes and labels are open `string`s — the trim list and swatch identity are unchecked at compile time

**File(s):** `web/src/lib/palette.ts` (`PaletteColor` / `PALETTE_COLORS`, lines 5–28);
`web/src/lib/state/colors.svelte.ts` (`paletteByLabel` / `TRIM_ORDER`, lines 21–33; `colors` state,
lines 37–42) @ 9ae62ff1

**Priority:** P2

#### Problem

`PALETTE_COLORS: PaletteColor[]` widens every hex and label to `string`. Downstream, `TRIM_ORDER` is
built by looking labels up in an untyped map:

```ts
const paletteByLabel = Object.fromEntries(PALETTE_COLORS.map(({ hex, label }) => [label, hex]));
export const TRIM_ORDER: string[] = ['Brown', 'Teal', 'Pink', ...].map((label) => paletteByLabel[label]);
```

`Object.fromEntries` produces `Record<string, string>`, so a typo'd label (`'Grean'`) type-checks
and yields `undefined` at runtime, caught only by the unit test at `colors.svelte.test.ts` lines
29–31. Likewise `colors.activeSwatch` is a bare `string` even though its value set is closed — a
palette hex or `CUSTOM_SWATCH` — so nothing stops a call site passing an arbitrary string. This is
exactly the situation CLAUDE.md's convention targets: "Close finite value sets in the type. A value
drawn from a fixed vocabulary … is a literal union or `keyof typeof`, threaded end to end — never
bare `string` … plus a runtime fallback."

#### Proposed solution

Make the palette literal-typed at its source:

```ts
export const PALETTE_COLORS = [
  { hex: '#AB71E1', label: 'Purple' },
  ...
] as const satisfies readonly PaletteColor[];
export type PaletteHex = (typeof PALETTE_COLORS)[number]['hex'];
export type PaletteLabel = (typeof PALETTE_COLORS)[number]['label'];
```

Then `TRIM_ORDER` becomes `PaletteHex[]` built from a `PaletteLabel[]` literal (the
`Object.fromEntries` result needs one boundary cast to `Record<PaletteLabel, PaletteHex>`, or build
the map with a typed `for` loop instead), and `colors.activeSwatch` can be
`PaletteHex | typeof CUSTOM_SWATCH`. Gotchas: `BLACK_INK` is referenced inside the array, so its
literal type must flow (it already does as a `const`); test files that assign raw hexes to
`activeSwatch` will need the palette constants instead of string literals — an improvement per the
testing rules. The runtime-completeness unit test stays as a belt-and-braces drift guard.

### [Maintainability] Two canonical import paths for the palette constants; node-env tests import pure data through the stateful rune module

**File(s):** `web/src/lib/state/colors.svelte.ts` (re-export, line 4);
`web/src/lib/colorRing.test.ts` (line 4); `web/src/lib/palette.ts` @ 9ae62ff1

**Priority:** P3

#### Problem

`colors.svelte.ts` re-exports the palette data verbatim:

```ts
import { BLACK_INK, PALETTE_COLORS } from '../palette';
export { BLACK_INK, PALETTE_COLORS };
```

The result is two public paths to the same constants, and the codebase has settled on the *wrong*
one: `palette.ts` has exactly one importer (`colors.svelte.ts` itself), while every other consumer —
`ColorPalette.svelte`, `colorRing.test.ts`, `notchBand.test.ts` — imports
`PALETTE_COLORS`/`BLACK_INK` from `$lib/state/colors.svelte`. That means:

* `colorRing.test.ts` (a `// @vitest-environment node` test of a pure module) pulls in the `$state`
  rune module just to reach a data constant, when the side-effect-free `./palette` sits in the same
  directory. The testing rule says precisely this: "If the source executes at import time, move the
  constant to a side-effect-free module" — the module exists, tests just bypass it.
* A first-time reader grepping `PALETTE_COLORS` finds two apparent owners and has to trace the
  re-export to learn which is real.
* Related staleness: the `TRIM_ORDER` comment at `colors.svelte.ts` line 18–19 says it is
  "independent of the display order above" — the display order no longer lives "above", it lives in
  `palette.ts`.

#### Proposed solution

Pick one canonical home. Given `palette.ts` was evidently extracted to be the side-effect-free
source, keep it canonical: delete the re-export on line 4, update the four import sites to
`$lib/palette` (or `./palette` / `../palette`), and fix the "above" comment to name `palette.ts`.
Alternative (if a single module is preferred): fold `palette.ts` back into `colors.svelte.ts` — but
that re-couples pure data to the rune module and loses the node-test benefit, so the first option is
better. Either way, `WHITE_INK` and `DEFAULT_STROKE_COLOR` are candidates to move beside the palette
data they describe.

### [Readability] `ringAnimateKey`'s `Date.now()` suffix is dead — and the flourish cannot replay on a same-swatch re-tap

**File(s):** `web/src/lib/components/ColorPalette.svelte` (lines 59–61, 73, 123) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
let ringAnimateKey = $state<string | null>(null);
...
ringAnimateKey = hex + ':' + Date.now();          // line 73
...
class:ring-animate={ringAnimateKey?.startsWith(hex + ':')}   // line 123
```

The only consumer of the key is `startsWith(hex + ':')`, which discards the timestamp entirely — the
state is functionally just "which hex was last tapped". The `Date.now()` suffix strongly implies
per-tap uniqueness was intended (i.e., re-tapping the currently-selected swatch should restart the
confirmation ring), but a class toggle can't deliver that: on a same-swatch re-tap the
`ring-animate` class boolean stays `true`, the CSS animation (`swatch-ring-expand`, `forwards`,
lines 214–230) has already completed, and nothing replays. So the code carries dead complexity *and*
fails the behavior that complexity gestures at.

#### Proposed solution

Decide which behavior is wanted:

* If replay-on-re-tap is *not* needed: simplify to
  `let ringAnimateHex = $state<string | null>(null)` and
  `class:ring-animate={ringAnimateHex === hex}` — same behavior, no fake uniqueness.
* If replay *is* wanted: keep the timestamped key and force an element-level restart, e.g. wrap the
  `::before` host in `{#key ringAnimateKey}` (heavyweight for a button) or, cheaper, drive the
  animation from a `data-` attribute change plus `animation: none`/reflow re-trigger inside
  `selectSwatch`. The first option is the low-risk default; note the flourish is cosmetic, so this
  is not a functional regression either way. Distinct from issue #164 (tap *registration*
  reliability).

### [Maintainability] The swatch drop-shadow literal is duplicated between the JS-built selection ring and the stylesheet

**File(s):** `web/src/lib/components/ColorPalette.svelte` (`selectionRingShadow`, line 67;
`.color-swatch` rule, line 180) @ 9ae62ff1

**Priority:** P3

#### Problem

The resting swatch shadow and the tail of the JS-composed selection-ring shadow must be the same
value, and today that agreement is maintained by copy-paste of `0 4px 8px rgba(0, 0, 0, 0.2)`:

```ts
return `0 0 0 0.5px var(--surface), 0 0 0 var(--selection-ring-width) ${ringColor}, 0 4px 8px rgba(0, 0, 0, 0.2)`;
```

```css
.color-swatch {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
```

If someone retunes the CSS drop shadow, the selected swatch keeps the old one (the inline `style`
overrides the class), producing a subtle depth pop on selection that nobody will trace quickly.
CLAUDE.md: "Cross-file agreement is never maintained by prose" (or duplication) — "a value that must
agree with another module is imported from one exported constant."

#### Proposed solution

Hoist a custom property on the component root and reference it from both sides — custom properties
resolve inside inline styles:

```css
.color-palette {
  --swatch-drop-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}
.color-swatch { box-shadow: var(--swatch-drop-shadow); }
```

```ts
return `0 0 0 0.5px var(--surface), 0 0 0 var(--selection-ring-width) ${ringColor}, var(--swatch-drop-shadow)`;
```

No behavior change; also brings the block in line with the svelte rule about promoting repeated
style values to local custom properties.

### [Readability] Selection-state conditions are re-derived three ways inline in the swatch template

**File(s):** `web/src/lib/components/ColorPalette.svelte` (palette swatch, lines 122–128; custom
swatch, lines 138–144) @ 9ae62ff1

**Priority:** P4

#### Problem

For each palette swatch, `!erasing && colors.activeSwatch === hex` is written twice — once in
`class:active` (line 122) and once inside the `style` ternary (lines 126–128). The custom swatch is
worse: `!erasing && colors.activeSwatch === CUSTOM_SWATCH` appears in `class:active` (line 138), and
the longer `... && colors.customColorSelected` variant appears twice more (`class:ringed` line 139,
`style` ternary lines 142–144). A reader must diff three near-identical expressions to confirm they
agree, and a future edit to one of them (e.g. adding a new brush that also hides the ring) has three
sites to miss.

#### Proposed solution

Hoist per-item with `{@const}` and component-level with `$derived`:

```svelte
{#each PALETTE_COLORS as { hex, label, bonus } (hex)}
  {@const shown = themedSwatchColor(hex, dark)}
  {@const selected = !erasing && colors.activeSwatch === hex}
  ...
  class:active={selected}
  style="... {selected ? `box-shadow: ...` : ''}"
```

and above the template:

```ts
const customArmed = $derived(!erasing && colors.activeSwatch === CUSTOM_SWATCH);
const customRinged = $derived(customArmed && colors.customColorSelected);
```

Pure refactor; keeps the `armed` vs `ringed` distinction (documented at lines 258–261) visible in
named identifiers instead of expression deltas.

### [Maintainability] `WHITE_INK` is duplicated as a raw `'#FFFFFF'` literal in the picker's greys ramp

**File(s):** `web/src/lib/hexPickerLayout.ts` (greys family, line 143);
`web/src/lib/state/colors.svelte.ts` (`WHITE_INK`, line 6; `isWhite`, lines 72–75) @ 9ae62ff1

**Priority:** P4

#### Problem

`colors.svelte.ts` documents that white "is only reachable via the picker's greys ramp — the palette
has none" (lines 66–68), and downstream behavior hinges on recognizing it: `isWhite()` gates the
dark outline on stroke-width icons and the picker swatch keyline (`ColorPicker.svelte` line 163).
Yet the picker declares that swatch as a fresh literal `'#FFFFFF'` (line 143), connected to
`WHITE_INK` (`'#ffffff'`, note the different case) only by `isWhite`'s lowercasing. If the greys
ramp's top swatch were ever retuned to a near-white (`'#FDFDFD'`), it would silently stop matching
`isWhite` — an invisible swatch with no keyline — with no compile-time or drift-guard signal. Per
CLAUDE.md, special-case ids are "declared once, imported everywhere."

#### Proposed solution

Import the constant: `shades: [WHITE_INK, '#90A4AE', ...]`. `WHITE_INK` currently lives in the rune
module; importing a state module from `hexPickerLayout.ts` (a pure data module) is the wrong
direction, so move `WHITE_INK` to `palette.ts` beside `BLACK_INK` first (pairs naturally with the
dual-import-path finding above). Note the hexPickerLayout test regex `/^#[0-9A-F]{6}$/` (uppercase)
would fail on lowercase `#ffffff` — either normalize `WHITE_INK`'s casing or relax the regex, which
feeds the casing finding below.

### [Maintainability] Hex casing is normalized at every comparison site instead of once at the source

**File(s):** `web/src/lib/hexPickerLayout.ts` (families, lines 27–154);
`web/src/lib/components/ColorPicker.svelte` (line 165); `web/src/lib/state/colors.svelte.ts`
(`isWhite`, line 73) @ 9ae62ff1

**Priority:** P4

#### Problem

The repo mixes hex casings — palette and picker constants are uppercase (`'#AB71E1'`, `'#FFB3C1'`),
`BLACK_INK`/`WHITE_INK` are lowercase (`'#0a0b10'`, `'#ffffff'`) — so equality can never be `===` on
raw values. The cost shows up at the hot comparison in the picker template, run for all 162 rendered
hexagons on every re-render of the selected state:

```svelte
class:selected={colors.customColor.toLowerCase() === hex.toLowerCase()}
```

`hex.toLowerCase()` re-lowercases compile-time constants at runtime, and
`colors.customColor.toLowerCase()` is repeated per hexagon. `isWhite` similarly lowercases per call.
`hexPickerLayout.test.ts` line 18 lowercases the whole grid just to run its uniqueness check.

#### Proposed solution

Adopt one casing (lowercase is the CSS-serialization norm) for every color constant, normalize
`customColor` once at its single write boundary (`pickCustomColor`), and add a one-line drift guard
to the existing hexPickerLayout test asserting the chosen casing (adjusting the current uppercase
regex at line 16). Then the template comparison becomes `colors.customColor === hex`, and `isWhite`
keeps its `.toLowerCase()` only for the genuinely external inputs it documents (`'white'`,
`'#FFF'`). Gotcha: screenshot/E2E assertions that match `data-color` values would need the same
casing.

### [Readability] "Luminance" names for thresholds that gate `perceivedBrightness`

**File(s):** `web/src/lib/colorRing.ts` (`DARK_SWATCH_LUMINANCE`, line 29, used line 41);
`web/src/lib/state/colors.svelte.ts` (`DARK_INK_LUMINANCE_MAX`, line 81) @ 9ae62ff1

**Priority:** P4

#### Problem

The one brightness metric in this code is `perceivedBrightness` — BT.601-weighted luma on a 0–1
scale (colorRing.ts lines 15–20). But both constants thresholding it are named "luminance"
(`DARK_SWATCH_LUMINANCE`, `DARK_INK_LUMINANCE_MAX`), and the colorRing tests repeat the misnomer
("luminance well above 0.2", `colorRing.test.ts` lines 8, 14). Luminance (relative,
gamma-linearized, as in WCAG) and perceived brightness/luma (gamma-encoded weighted sum) are
different quantities that give different orderings for saturated colors; anyone reaching for
WCAG-contrast math later could reasonably assume these thresholds are comparable to
relative-luminance cutoffs. Well-named identifiers are the documentation here, and these ones
mislead.

#### Proposed solution

Rename to match the function they gate: `DARK_SWATCH_BRIGHTNESS_MAX` and `DARK_INK_BRIGHTNESS_MAX`
(the `_MAX` suffix also fixes `DARK_SWATCH_LUMINANCE` reading as a value rather than a bound), and
update the two test comments. Mechanical rename; `DARK_INK_LUMINANCE_MAX`'s WHY comment (lines
77–80) stays as-is.

### [Architecture] `colorRing.ts` is a general color-math module wearing a ring-specific name

**File(s):** `web/src/lib/colorRing.ts` (whole module) @ 9ae62ff1

**Priority:** P4

#### Problem

Of the module's three exports, only `getRingColor` (lines 37–47) is about selection rings.
`perceivedBrightness` (lines 17–20) is imported by `state/colors.svelte.ts` for ink-keyline logic,
and `isLightColor` (lines 24–26) is imported by `notchBand.ts` for status-bar icon styling — neither
has anything to do with rings. A developer needing hex→brightness math would not grep for "ring",
and finding brightness utilities inside `colorRing` reads as reaching into another feature's
internals. `hexToRgb` (lines 1–13) is likewise a general utility trapped un-exported behind the ring
name.

#### Proposed solution

Rename the module to what it is — `colorMath.ts` (or split: `colorMath.ts` for
`hexToRgb`/`perceivedBrightness`/`isLightColor`, keeping `getRingColor` beside its consumer or in
the renamed module). Update the four import sites and the test filename. Low churn (5 files), and
the `architecture` skill's source map should be updated in the same change per CLAUDE.md's "update
stale docs as part of the same task."

### [Readability] `colors` state initializer repeats `PALETTE_COLORS[0].hex` instead of the `DEFAULT_STROKE_COLOR` constant declared 30 lines above

**File(s):** `web/src/lib/state/colors.svelte.ts` (lines 8, 37–42) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
export const DEFAULT_STROKE_COLOR = PALETTE_COLORS[0].hex;   // line 8
...
export const colors = $state({
  activeSwatch: PALETTE_COLORS[0].hex,
  activeColor: PALETTE_COLORS[0].hex,
  customColor: PALETTE_COLORS[0].hex,
  ...
});
```

The named constant exists precisely to say "the default color", and `engine.ts` uses it — but the
very state object it describes spells out the raw expression three times. A reader has to verify the
four expressions are the same thing, and the semantic content (these all start at the default) is
lost. Additionally, `customColor` starting at *the default stroke color* is a subtly different idea
(it's a placeholder until `customColorSelected` flips); using the named constant makes the intent
legible.

#### Proposed solution

```ts
export const colors = $state({
  activeSwatch: DEFAULT_STROKE_COLOR,
  activeColor: DEFAULT_STROKE_COLOR,
  customColor: DEFAULT_STROKE_COLOR,
  customColorSelected: false,
});
```

Pure rename-in-place; also lets `colors.svelte.test.ts`'s `beforeEach` reset via the same constant
(see the testing finding below).

### [Maintainability] Deliberately untracked component `let`s lack the required "intentionally untracked" comment

**File(s):** `web/src/lib/components/ColorPicker.svelte` (lines 29–30) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
let isTrackingDrag = false;
let hexCenters: HexCenter[] | null = null;
```

Both are mutable component state that is *deliberately* non-reactive — `isTrackingDrag` is a gesture
latch and `hexCenters` a per-drag layout cache; neither should trigger renders.
`.claude/rules/svelte.md` requires exactly this situation to be marked: "a deliberately non-reactive
`let` (timer handles, transition-time latches) carries a one-line comment saying it's intentionally
untracked." Without the marker, the next contributor (or a lint pass converting `let` to `$state`)
can't distinguish these from an oversight, and making `hexCenters` reactive would add pointless
invalidations on every drag.

#### Proposed solution

Add the one-line markers, e.g.:

```ts
// Gesture latch + per-drag layout cache — intentionally untracked (nothing renders from them).
let isTrackingDrag = false;
let hexCenters: HexCenter[] | null = null;
```

### [Readability] `e.detail === 0` keyboard-activation check carries no WHY comment

**File(s):** `web/src/lib/components/ColorPicker.svelte` (`handleHexClick`, lines 114–116) @
9ae62ff1

**Priority:** P4

#### Problem

```ts
function handleHexClick(e: MouseEvent, hex: string) {
  if (e.detail === 0) selectColor(hex);
}
```

That a `click` with `detail === 0` means "keyboard/assistive-tech activation, not a pointer" is
non-obvious trivia; that pointer-driven clicks must be *ignored* here (because selection is
pointerup-driven, lines 101–112, and handling both would double-commit) is even less obvious. The
same idiom elsewhere in the repo is explained (`scribbleGuard.ts` lines 43–44 comments the
`detail === 0` semantics; `modalDialog.svelte.ts` line 84 uses it too). The repo's comment rule is
"no comments unless the WHY is non-obvious" — this is the non-obvious case that warrants one, and it
has none.

#### Proposed solution

One line:

```ts
// detail === 0 ⇒ keyboard/AT activation; pointer clicks are ignored — selection is pointerup-driven.
function handleHexClick(e: MouseEvent, hex: string) {
```

Alternatively extract a shared `isKeyboardClick(e: MouseEvent)` helper next to `scribbleGuard`'s
existing use, giving the idiom a single named home.

### [Readability] Drag-state reset is triplicated across ColorPicker's teardown paths

**File(s):** `web/src/lib/components/ColorPicker.svelte` (`selectColor`, lines 36–37; `onClose`,
lines 134–137; `onpointercancel`, lines 147–150) @ 9ae62ff1

**Priority:** P4

#### Problem

The pair `hoveredHex = null; isTrackingDrag = false;` (order varies) appears three times: at commit
(`selectColor`), on dialog close (`modalDialog`'s `onClose`), and on `pointercancel`. Any future
addition to the gesture state (`hexCenters` staleness, a pressed-class latch) has three reset sites
to keep in sync, and the reader must confirm all three do the same thing.

#### Proposed solution

Extract one helper and call it from all three sites:

```ts
function resetDragState() {
  isTrackingDrag = false;
  hoveredHex = null;
}
```

`selectColor` becomes
`pickCustomColor(hex); releaseAllPointers(); colorPicker.hide(); resetDragState();`. Consider
whether `hexCenters = null` belongs in it too (currently only reset on window resize, line 119) —
clearing per-drag cache on drag end is cheap and removes a class of staleness questions.

### [Testing] `isDarkInk` (and `isLightColor`) have zero direct unit coverage beside heavily-tested siblings

**File(s):** `web/src/lib/state/colors.svelte.ts` (`isDarkInk`, lines 83–85);
`web/src/lib/colorRing.ts` (`isLightColor`, lines 24–26) @ 9ae62ff1

**Priority:** P4

#### Problem

`colors.svelte.test.ts` exhaustively tests its neighbors — `isWhite` gets three describe-blocks
including palette-wide negative cases (lines 93–113) — but `isDarkInk`, the function gating the
dark-ink keyline on action buttons (`ActionsPanel.svelte` line 142, per ADR-0052), is never imported
by any test. Its load-bearing invariants are unpinned: `BLACK_INK` must be dark ink, every other
palette color (and `WHITE_INK`) must not be, and the darkest picker greys sit on a deliberate side
of the `0.15` cutoff. A retune of `DARK_INK_LUMINANCE_MAX` or a palette color edit could silently
flip a keyline. `isLightColor` is only covered transitively through `notchBand` tests (outside this
section), so its own threshold semantics are similarly unpinned.

#### Proposed solution

Add a `describe('isDarkInk')` to `colors.svelte.test.ts` mirroring the `isWhite` structure:
`expect(isDarkInk(BLACK_INK)).toBe(true)`, loop `PALETTE_COLORS` excluding `BLACK_INK` expecting
`false`, plus the boundary greys from the picker (`PICKER_DIM_BORDER` true, `'#263238'`/nearby
expected value). A small direct `isLightColor` spec in `colorRing.test.ts` (both sides of `0.5`)
closes the other gap.

### [Readability] palette.ts's ordering/invariant comment is attached to the interface, not the constant it documents

**File(s):** `web/src/lib/palette.ts` (lines 1–10, 17) @ 9ae62ff1

**Priority:** P5

#### Problem

The header comment — "Display order, top-to-bottom (landscape) / left-to-right (portrait)… Purple
must stay at index 0 — it's the default selection" (lines 1–4) — describes `PALETTE_COLORS`, but it
sits directly above `export interface PaletteColor` (line 5). A reader who jumps to the
`PALETTE_COLORS` definition (line 17), e.g. via go-to-definition from any of its many import sites,
lands on an uncommented array and misses both the ordering semantics and the index-0 invariant.

#### Proposed solution

Move the comment block from above the interface to immediately above `export const PALETTE_COLORS`
(line 17). The interface keeps only interface-relevant prose (the existing `bonus` doc-comment on
line 8 already covers it).

### [Maintainability] Picker's dim keyline `#4d4d5b` coincides with the dark-theme `borderWarmStrong` token value with no declared relationship

**File(s):** `web/src/lib/components/ColorPicker.svelte` (`.hexagon.border-dim`, lines 453–455);
`web/src/tokens.css` (line 123); `web/src/lib/design/tokens.ts` (line 309) @ 9ae62ff1

**Priority:** P5

#### Problem

```css
.hexagon.border-dim {
  background-color: #4d4d5b;
}
```

The value is deliberately theme-*constant* (per the comment at lines 444–448: a "constant dim grey
ring — deliberately quieter than `--icon-ink`"), so substituting `var(--border-warm-strong)` would
be wrong — that token is `#c4bbad` in light mode. But the raw literal is byte-identical to the
dark-theme `borderWarmStrong` token, and a reader (or a token-sweep refactor) cannot tell whether
that agreement is intended-and-must-track or pure coincidence. Either way the literal is an unnamed
tuning decision in a style block.

#### Proposed solution

Name it as a local custom property on the component root with a one-line WHY:

```css
.color-picker {
  /* Theme-constant on purpose: same dim ring on both surfaces (not --border-warm-strong,
     which flips to warm beige in light mode). */
  --picker-dim-keyline: #4d4d5b;
}
```

and use `var(--picker-dim-keyline)` at line 454. If the match with the dark token IS intentional,
import/emit it from the token source instead and say so.

### [Readability] colorRing.ts declares its tuning constants mid-file, after their first textual use

**File(s):** `web/src/lib/colorRing.ts` (lines 24–31) @ 9ae62ff1

**Priority:** P5

#### Problem

`isLightColor` (line 24–26) references `LIGHT_COLOR_BRIGHTNESS`, which is declared two lines *below*
it (line 28), inside a four-constant block that also mixes in `getRingColor`'s knobs
(`DARK_SWATCH_LUMINANCE`, `LIGHTEN_STEP`, `DARKEN_FACTOR`). It works (the reference is inside a
function body, no TDZ at runtime), but reading top-to-bottom the threshold appears out of nowhere,
and the constant block groups knobs belonging to two unrelated functions with no attribution. The
repo convention puts the WHY on the named constant — these four carry no WHY at all (what is 38? why
0.9?), while `getRingColor`'s doc comment (lines 33–36) holds the rationale the constants should
own.

#### Proposed solution

Move `LIGHT_COLOR_BRIGHTNESS` above `isLightColor`, and the ring trio directly above `getRingColor`,
pushing the relevant halves of the current function comment onto the constants (e.g.
`// ~10% darkening reads as a contrasting outline` on `DARKEN_FACTOR`;
`// Visible lift for near-black swatches where darkening is invisible` on `LIGHTEN_STEP`). Purely
organizational.

### [Performance] Palette ResizeObserver ignores its entries and forces a `getBoundingClientRect` layout read

**File(s):** `web/src/lib/components/ColorPalette.svelte` (`onMount`, lines 45–57) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
const ro = new ResizeObserver(() => {
  const rect = paletteEl.getBoundingClientRect();
  layout.paletteWidth = rect.width;
  layout.paletteHeight = rect.height;
});
```

The observer callback already receives the observed size in its entries (`borderBoxSize` is what the
consumers want — the palette has padding the layout math must clear), delivered at a point in the
frame where no forced synchronous layout is needed. Calling `getBoundingClientRect` instead discards
that and performs an extra layout read. Resizes are infrequent (breakpoint trims, orientation
changes), so the cost is small — this is mostly about using the API as designed.

#### Proposed solution

```ts
const ro = new ResizeObserver(([entry]) => {
  const box = entry.borderBoxSize[0];
  layout.paletteWidth = box.inlineSize;
  layout.paletteHeight = box.blockSize;
});
```

Gotchas: `borderBoxSize` support must clear the floor in `docs/COMPATIBILITY.md` (older Safari
shipped `contentRect` first — verify before switching; if the floor doesn't allow it, keep the
current code and add a one-line WHY so the next auditor doesn't refile this). Note inline/block map
to width/height only in horizontal writing mode, which holds here.

### [Readability] Per-swatch `onpointerdown={handlePaletteDown}` duplicates the container's identical bubbling handler

**File(s):** `web/src/lib/components/ColorPalette.svelte` (container, line 113; swatch, line 131;
custom swatch, line 146) @ 9ae62ff1

**Priority:** P5

#### Problem

`handlePaletteDown` (lines 84–88: `releaseAllPointers(); e.preventDefault(); e.stopPropagation();`)
is attached to the `.color-palette` container *and* to every swatch button. A pointerdown on a
swatch runs the button's copy, whose `stopPropagation` then prevents the container's copy from
running — so the container handler only ever fires for gap/padding hits, and the per-button
registrations add nothing the bubbling container handler wouldn't do identically (the handler never
inspects `e.target`). Eleven redundant listener registrations, and a reader must convince themself
the double-wiring isn't load-bearing.

#### Proposed solution

Drop `onpointerdown={handlePaletteDown}` from the two button sites and keep the container's, or — if
the per-button wiring is guarding an ordering subtlety with the `scribbleTap`/`scribbleGuard`
actions — keep it and add a one-line WHY. Verify with the existing palette E2E specs plus a manual
pen/touch pass, since pointer plumbing here has history (`handleSwatchCancel` stays: `pointercancel`
is separate).

### [Maintainability] Hexagon buttons expose raw hex codes as their accessible names

**File(s):** `web/src/lib/components/ColorPicker.svelte` (line 168) @ 9ae62ff1

**Priority:** P5

#### Problem

`aria-label={hex}` gives every picker swatch a name like "#FFB3C1" — read by a screen reader as a
letter-by-letter hash string, meaningless as a color identity. The repo deliberately scopes axe
scans away from toddler-facing chrome (`.claude/rules/testing.md`), so this won't fail CI, but the
data to do better already exists: `hexPickerLayout.ts` has family names, and shade indices are known
at render time (`row`/`c` in the each-blocks, lines 157–159). The palette's own swatches set the
precedent with human labels (`aria-label={label}`, `ColorPalette.svelte` line 129).

#### Proposed solution

Derive a human name per swatch — e.g. `"reds 3 of 9"` or precompute `label: string` per color in
`hexPickerLayout.ts` (portrait rows have the family at hand; landscape rows can carry per-cell
labels if `PickerRow.colors` becomes `{ hex, label }[]`). Keep `data-color` as the test/gesture
identity — only the `aria-label` changes. Low priority given the a11y scoping decision, but it's a
data-shape nicety that costs little while touching `PickerRow` for other reasons.

### [Testing] colors.svelte.test.ts's reset hardcodes `'#AB71E1'` beside lines that use the imported constant

**File(s):** `web/src/lib/state/colors.svelte.test.ts` (`beforeEach`, lines 16–22) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
beforeEach(() => {
  colors.activeSwatch = PALETTE_COLORS[0].hex;
  colors.activeColor = PALETTE_COLORS[0].hex;
  colors.customColor = '#AB71E1';
  ...
```

Two fields reset via the imported constant, the third via a re-declared literal that happens to
equal it. The testing rule warns exactly against mirrored copies ("a mirrored copy keeps passing for
the wrong reason"): if Purple's hex were retuned, lines 18–19 would track it while line 20 silently
kept resetting `customColor` to a stale value, making the reset internally inconsistent.

#### Proposed solution

Use the same source for all three — ideally `DEFAULT_STROKE_COLOR` (already exported from the module
under test), which also documents *why* that's the reset value:

```ts
colors.activeSwatch = DEFAULT_STROKE_COLOR;
colors.activeColor = DEFAULT_STROKE_COLOR;
colors.customColor = DEFAULT_STROKE_COLOR;
```

## Source: Code audit — Storage / persistence + PWA / service worker

### [Correctness] Guard the version-mismatch cache-bust redirect with the canvas-empty check

**File(s):** `web/src/lib/pwa/updates.ts` (`checkVersionMismatch`, lines 138–151) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — no drawing autosave/restore exists, so the hard navigation does lose
> in-progress work. Caveat: the module header (lines 23–29) does describe the cache-bust redirect as
> intentional design, and the blank-canvas invariant is scoped to waiting workers — so this is an
> unconsidered gap rather than a documented tradeoff.

#### Problem

The entire update machinery is built around one invariant, stated in the module header (lines
20–21): a waiting worker is applied "(with a reload) only while the canvas is blank — never
mid-drawing". `activateWaitingSW` (lines 153–187) and the `owed` state exist solely to defend it.
But the cache-bust path violates it:

```ts
async function checkVersionMismatch(attemptedVersion: string | null = null) {
  try {
    const resp = await fetch('/version.json', { cache: 'no-store' });
    if (!resp.ok) return;
    const { version } = await resp.json();
    if (version !== __APP_VERSION__ && version !== attemptedVersion) {
      const next = new URL(window.location.href);
      next.searchParams.set('v', version);
      window.location.replace(next.toString());
    }
```

`window.location.replace` is a hard navigation with no `canvasState.canvasEmpty` check. The scenario
is not exotic: after every deploy, every returning client is stale, so `version !== __APP_VERSION__`
is true on that boot. `checkVersionMismatch` is kicked off at init (line 105, from `initPWAUpdates`
via `initWebOnlyServices` in the drawing route's `onMount`), but its `fetch` can take seconds on a
slow connection — and the app is explicitly designed so the child can draw immediately, including
pre-hydration strokes (ADR-0072, and the comment in `web/src/routes/+page.svelte` lines 47–55). A
toddler who starts scribbling in the first seconds after a deploy gets their drawing wiped by the
redirect when the response lands.

#### Proposed solution

Apply the same policy the SW-activation path already uses: only navigate while
`canvasState.canvasEmpty` is true. Minimal version — early-return when the canvas has ink:

```ts
if (version !== __APP_VERSION__ && version !== attemptedVersion) {
  if (!canvasState.canvasEmpty) return; // never discard a drawing for a cache-bust
  ...
}
```

The tradeoff (a stale-HTML session keeps running until the next blank-canvas boot) is exactly the
tradeoff the module already accepts for waiting workers. A richer version could stash the pending
version and retry from `checkForUpdates` when the canvas empties, mirroring the `owed` state — but
given `checkVersionMismatch` runs once per boot, the early-return is likely enough. Add a unit test
in `updates.test.ts` ("does not redirect while the canvas has content") alongside the existing
`checkVersionMismatch` suite (lines 78–163).

### [Types] Give `readInt`/`readString` allowed-list generics so callers stop casting and hand-rolling validators

**File(s):** `web/src/lib/storage.ts` (`readString` lines 117–125, `readInt` lines 142–154) @
9ae62ff1

**Priority:** P2

#### Problem

The repo convention is "close finite value sets in the type … never bare `string`/`number` plus a
runtime fallback". `readInt` already implements the runtime half — an `allowed` list — but throws
the type information away:

```ts
export function readInt(
  key: StorageKey,
  fallback: number,
  allowed: readonly number[] | null = null
): number {
```

so its one allowed-list caller must cast a value the function just validated
(`web/src/lib/state/strokeWidth.svelte.ts:45`):

```ts
return readInt(key, fallback, STROKE_SIZES) as StrokeSize;
```

`readString` has no allowed-list support at all, so every union-typed string setting hand-rolls the
same validate-or-fallback wrapper with its own casts: `readBrush` in
`web/src/lib/state/tool.svelte.ts` lines 46–51
(`(BRUSH_TYPES as string[]).includes(raw) … (raw as BrushType)`) and `readTheme` in
`web/src/lib/state/settings.svelte.ts` lines 112–115. Three call sites, three `as` casts, two
duplicated validators — for a check `storage.ts` could own once, typed.

#### Proposed solution

Add generic overloads (keeping the existing plain ones):

```ts
export function readInt<T extends number>(key: StorageKey, fallback: T, allowed: readonly T[]): T;
export function readInt(key: StorageKey, fallback: number): number;

export function readString<T extends string>(
  key: StorageKey,
  fallback: T,
  allowed: readonly T[],
): T;
export function readString(key: StorageKey, fallback: string): string;
export function readString(key: StorageKey, fallback: null): string | null;
```

Inside the implementation the `allowed.includes(raw)` check is the runtime validation that justifies
the single internal narrow. Then `readStrokeLevel` drops its cast, `readTheme` becomes
`readString(STORAGE_KEYS.theme, fallback, THEME_PREFERENCES)`, and `readBrush` passes a precomputed
`RESTORABLE_BRUSHES` (BRUSH_TYPES minus `'eraser'` — its extra exclusion rule stays where it is, as
data instead of logic). Gotcha: `readonly T[]`'s `includes` takes `T`, so the raw string needs one
internal cast or a `(allowed as readonly (string | number)[]).includes(raw)` — keep that inside
storage.ts, at the validated boundary where the convention allows it.

### [Correctness] `hydrateDurableStorage` bypasses the module's own safe localStorage wrappers, so one throw aborts the whole restore

**File(s):** `web/src/lib/storage.ts` (`hydrateDurableStorage`, lines 179–208; raw reads/writes at
187 and 191) @ 9ae62ff1

**Priority:** P3

#### Problem

The first half of this file exists because "localStorage.setItem can throw — QuotaExceededError …
SecurityError" (lines 34–38) and "merely touching the `localStorage` global raises SecurityError"
(lines 51–55). Yet the restore loop touches localStorage raw:

```ts
hydrationKeys.forEach((key, i) => {
  const local = localStorage.getItem(key);
  ...
  if (action.restore !== undefined) {
    localStorage.setItem(key, action.restore); // WebView lost it — recover from durable store
```

A throw from either call propagates out of the `forEach`, is swallowed by
`runWithDurablePreferences`'s blanket `catch` (line 89), and silently abandons every remaining key —
no restore, no backup, no warning. The bitter irony: iOS storage pressure is both the scenario this
function exists to recover from *and* a scenario where `setItem` throws `QuotaExceededError`. The
keys that happen to sort after the failing one just stay lost, and nothing distinguishes this from a
clean run (the partial `restored` flag still fires `notifyDurableRestore`).

#### Proposed solution

Use the module's own `safeStorageRead`/`safeStorageMutation` inside the loop:

```ts
const local = safeStorageRead(() => localStorage.getItem(key), null);
...
safeStorageMutation(() => localStorage.setItem(key, action.restore));
```

Per-key failures then degrade to a warn-once console message while every other key still reconciles.
One subtlety: a failed `setItem` should ideally not count toward `restored` for that key, but the
existing warn-once machinery doesn't report per-call success — keeping `restored = true` (stores
re-read and fall back to defaults for the lost key) is acceptable and simpler. Extend
`storage.test.ts`'s throwing-localStorage suite with a native hydrate case.

### [Correctness] Validate the `version.json` payload — a versionless 200 response causes `?v=undefined` and an infinite redirect loop

**File(s):** `web/src/lib/pwa/updates.ts` (`checkVersionMismatch`, lines 140–147) @ 9ae62ff1

**Priority:** P3

#### Problem

```ts
const resp = await fetch('/version.json', { cache: 'no-store' });
if (!resp.ok) return;
const { version } = await resp.json();
if (version !== __APP_VERSION__ && version !== attemptedVersion) {
```

`resp.json()` returns `any`; `version` is destructured with no runtime check, violating the
"cast/validate at the wire boundary" convention. If a captive portal, misconfigured proxy, or broken
deploy ever serves a 200 JSON body without a string `version` field, `version` is `undefined`, which
`!==` both compared strings, so the client navigates to `?v=undefined`. Worse, the
one-attempt-per-version loop guard then fails structurally: on the next load `attemptedVersion` is
the *string* `'undefined'` (read from the URL at line 98) while `version` is the *value* `undefined`
— they never compare equal, so the client redirects again, forever. The module header's promise
("one attempt per deployed version, no reload loop", lines 28–29) doesn't hold for non-string
payloads.

#### Proposed solution

Guard the field before using it:

```ts
const { version } = (await resp.json()) as { version?: unknown };
if (typeof version !== 'string' || version.length === 0) return;
```

That single check fixes both the bogus redirect and the loop (a malformed payload simply skips
cache-busting; the next healthy deploy resolves it). Add two unit tests to the existing
`checkVersionMismatch` suite: `{}` payload → no redirect; non-JSON→`json()` rejects is already
covered by the catch.

### [Readability] Replace the eleven inline `import('idb')` type references with top-level `import type`

**File(s):** `web/src/lib/idb.ts` (lines 18–67) @ 9ae62ff1

**Priority:** P3

#### Problem

Every signature in the file spells types as inline dynamic-import references:

```ts
export function lazyIdbDatabase<Schema extends import('idb').DBSchema>(
  dbName: string,
  storeName: import('idb').StoreNames<Schema>,
): () => Promise<import('idb').IDBPDatabase<Schema>>;
```

`import('idb').X` appears eleven times across `lazyIdbDatabase` and `idbKvStore`, making short
signatures read like transport headers — `idbKvStore`'s generic parameter list (lines 50–53) is
nearly unreadable. The inline form buys nothing: type-only imports are fully erased at compile time,
so a top-level `import type` keeps the runtime `import('idb')` (line 33) exactly as lazy as it is
today. The codebase already relies on this — `secureStorage.ts:1` does
`import type { DBSchema } from 'idb'` in a module whose whole point is that the idb chunk stays out
of the boot bundle, and `folderSave.ts:1` does the same.

#### Proposed solution

```ts
import type { DBSchema, IDBPDatabase, StoreKey, StoreNames, StoreValue } from 'idb';
```

and rewrite the signatures plainly (`storeName: StoreNames<Schema>`,
`Promise<IDBPDatabase<Schema>>`, …). Purely mechanical; no behavior or bundle change (verifiable by
diffing the built chunk list before/after).

### [Readability] Extract `initPWAUpdates`'s five inline steps into named helpers

**File(s):** `web/src/lib/pwa/updates.ts` (`initPWAUpdates`, lines 91–136) @ 9ae62ff1

**Priority:** P3

#### Problem

`initPWAUpdates` performs five distinct jobs in one body: (1) strip and capture the `?v=` cache-bust
param (lines 97–102), (2) fire the initial update check (104), (3) fire the version-mismatch check
(105), (4) re-register an existing registration for repeat visits (109–114), and (5) install the
hourly interval plus visibility/focus listeners and build their teardown (116–135). The repo
convention says section-shaped functions get split into named helpers that explain the steps — this
is the poster case: each step already needs its own explanatory comment to be followable, and the
version-param handshake (capture → strip → thread into `checkVersionMismatch`) is easy to lose in
the middle.

#### Proposed solution

Extract three private helpers inside `createPWAUpdates` (steps 2–3 are already named calls):

```ts
function consumeAttemptedVersionParam(): string | null; // strip ?v=, return it
function resumeExistingRegistration(): void; // getRegistration → scheduleRegistration
function startUpdateCheckTriggers(): () => void; // interval + visibility/focus, returns teardown
```

`initPWAUpdates` then reads as its own summary: guard clauses,
`const attemptedVersion = consumeAttemptedVersionParam()`, the two checks,
`resumeExistingRegistration()`, `return startUpdateCheckTriggers()` (wrapping `initialized = false`
into the returned teardown). No behavior change; the existing `initPWAUpdates` test suite
(updates.test.ts lines 515–626) pins everything.

### [Correctness] The Save-Data guard is bypassed on the repeat-visit registration path

**File(s):** `web/src/lib/pwa/updates.ts` (`registerDeferredServiceWorker` lines 84–89,
`initPWAUpdates` lines 109–114, `scheduleRegistration` lines 66–79) @ 9ae62ff1

**Priority:** P4

#### Problem

`registerDeferredServiceWorker` refuses to register under Save-Data — "Save-Data users never get the
~39 MB precache forced on them" (lines 85–87). But `initPWAUpdates` calls `scheduleRegistration()`
directly when a registration already exists (lines 109–114), and `scheduleRegistration` has no
Save-Data check. The stated purpose of that re-register is to *resume an interrupted precache*
(lines 12–13: "so an install interrupted mid-precache resumes") — which is precisely the ~39 MB
download the guard exists to prevent. Sequence: first visit on wifi with Save-Data off →
registration starts, precache interrupted; later visit on metered data with Save-Data on → the
resume path re-registers and the precache continues against the user's expressed preference.

#### Proposed solution

Move the `saveDataEnabled()` check into `scheduleRegistration` (the single choke point), so both
entry paths honor it:

```ts
function scheduleRegistration() {
  if (registrationScheduled || saveDataEnabled()) return;
  ...
}
```

This is safe for update checks: the module header (lines 14–16) already documents that
`checkForUpdates` reaches the existing registration through `getRegistration` without any
re-register. A fully-precached repeat visitor with Save-Data on loses only a redundant `register()`
call. Add a unit test: existing registration + Save-Data on → `register` not called.

### [Readability] `activateWaitingSW`'s rethrow is silently swallowed in one call path and unhandled in the other

**File(s):** `web/src/lib/pwa/updates.ts` (`activateWaitingSW` lines 169–175, callers at 205–206 and
216–219) @ 9ae62ff1

**Priority:** P4

#### Problem

`activateWaitingSW` carefully unwinds state and rethrows a `postMessage` failure:

```ts
try {
  sw.postMessage({ type: 'SKIP_WAITING' });
} catch (error) {
  navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  updateReload = 'none';
  throw error;
}
```

But its two callers treat that throw inconsistently. The call inside `checkForUpdates` (line 206)
sits under the function-wide `try`, whose `catch` comment claims "registration lookup or update
failed (e.g. offline)" (line 226) — a `postMessage` throw is silently absorbed and misattributed.
The call inside the `statechange` → `setTimeout` callback (line 218) runs on the timer stack with no
try at all, so the same throw escapes as an unhandled exception. So the deliberate `throw error`
signals nothing in one path and a global error in the other — neither looks intended.

#### Proposed solution

Decide the contract and make both paths match. Simplest: `activateWaitingSW` already restores its
own state in the catch, so stop rethrowing (log via the existing warn-once pattern or
`console.warn`) and delete the dead signal — then both call sites behave identically and
`checkForUpdates`'s catch comment becomes accurate. If the throw should stay, wrap the `setTimeout`
call site and narrow `checkForUpdates`'s catch comment. Either way, add a unit test with a throwing
`postMessage` asserting `updateReload` releases and no unhandled rejection/exception escapes.

### [Readability] Simplify `hydrateDurableStorage`'s dual-channel `restored` tracking

**File(s):** `web/src/lib/storage.ts` (`hydrateDurableStorage`, lines 179–208) @ 9ae62ff1

**Priority:** P4

#### Problem

The `restored` flag travels through two channels at once: the async callback mutates the *outer*
`let restored` via closure (line 192) *and* returns it (line 198), and then the caller conditionally
re-assigns the same value back:

```ts
let restored = false;
const completedRestore = await runWithDurablePreferences(async (Preferences) => {
  ...
  restored = true;      // closure mutation
  ...
  return restored;       // and returned
});
if (completedRestore !== undefined) restored = completedRestore;
```

Line 200 is a no-op: whenever `completedRestore` is defined it is by construction the current value
of `restored` (same variable, returned at the end). The only case where the channels differ is when
the callback throws mid-way and `runWithDurablePreferences` returns `undefined` — and there the
*mutation* channel is the one that carries the (deliberate, tested — storage.test.ts lines 260–277)
partial-restore semantics. A reader has to disprove three interactions to conclude the code does the
simple thing.

#### Proposed solution

Keep only the mutation channel: make the callback `Promise<void>`, delete the `return restored`, the
`completedRestore` binding, and line 200. Behavior is identical in all paths (including the
partial-failure path the integration test pins), and the function shrinks to one obvious flag.
Alternatively make the callback pure and drop the closure mutation — but that changes the
partial-failure semantics, so the delete-the-return direction is the safe one.

### [Maintainability] Mark (or trim) the test-only surface of `createPWAUpdates`

**File(s):** `web/src/lib/pwa/updates.ts` (exports at lines 39, 42; returned API lines 230–235) @
9ae62ff1

**Priority:** P4

#### Problem

Production callers use exactly two members of the returned API: `initPWAUpdates`
(`web/src/lib/boot/webOnlyServices.ts:9`) and `registerDeferredServiceWorker`
(`web/src/routes/+page.svelte:57`). The other two returned members — `checkForUpdates` and
`checkVersionMismatch` — plus the exported constants `ACTIVATION_RECOVERY_MS` and
`WAITING_SETTLE_MS`, and `checkVersionMismatch`'s `attemptedVersion` default (production always
passes it; only tests rely on the default) are consumed solely by `updates.test.ts`. The repo
convention is explicit: "a seam kept only for tests gets a comment saying so at the declaration."
None of these carry one, so a reader auditing the API can't tell deliberate seam from speculative
surface without grepping.

#### Proposed solution

Add the convention's comment at each declaration, e.g. on the return object:

```ts
return {
  initPWAUpdates,
  registerDeferredServiceWorker,
  // Exposed for tests only — production drives these through initPWAUpdates.
  checkForUpdates,
  checkVersionMismatch,
};
```

and similar one-liners on the two exported `_MS` constants. Dropping the members instead is possible
but would force the tests through `initPWAUpdates`'s listeners — noisier tests for no production
gain; the comment is the intended fix.

### [Types] Delete the unused untyped `lazyIdbDatabase` overload

**File(s):** `web/src/lib/idb.ts` (lines 18–21) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
export function lazyIdbDatabase(
  dbName: string,
  storeName: string,
): () => Promise<import('idb').IDBPDatabase>;
```

No production or test caller uses the schema-less form: `secureStorage.ts:64` calls
`lazyIdbDatabase<SecureDb>(...)`, `idbKvStore`'s internal call (line 54) passes `Schema`, and
`idb.test.ts:68` uses `lazyIdbDatabase<TestDb>`. The untyped overload is speculative surface ("a new
prop, option, or optional parameter needs a production caller") and it actively degrades safety: any
future caller that forgets the type argument silently gets the unchecked `IDBPDatabase` where store
names and values are `string`/`any`-ish, defeating the typed-schema design.

#### Proposed solution

Remove the first overload; keep the generic overload as the only public signature (the untyped
implementation signature at lines 26–29 stays, invisible to callers, as TS requires). If the
overloads collapse to one, consider folding it into a single generic declaration. Compile
(`npm run check`) proves nothing depended on it.

### [Types] `payloadStore`'s narrowed schema silently mistypes the master-key row — document or restructure the dual-schema trick

**File(s):** `web/src/lib/secureStorage.ts` (`SecureDb`/`SecretPayloadDb` lines 37–49,
`getDb`/`payloadStore` lines 64–65) @ 9ae62ff1

**Priority:** P4

#### Problem

The same IndexedDB store is typed two different ways: `getDb` sees `SecureDb`
(`value: CryptoKey | SecretPayload` — the truth: the store holds both the master key and secret
payloads), while `payloadStore` sees `SecretPayloadDb` (`value: SecretPayload` — a lie for the
`master-key` row):

```ts
const getDb = lazyIdbDatabase<SecureDb>(DB_NAME, STORE);
const payloadStore = idbKvStore<SecretPayloadDb>(DB_NAME, STORE);
```

The narrowing is a type assertion in module form — nothing stops `payloadStore.get(MASTER_KEY_ROW)`
from typechecking as `SecretPayload | undefined` while returning a `CryptoKey` at runtime. Today it
happens to be safe because secret names never collide with `'master-key'` and `webLoad` (line 134)
runtime-validates with `isSecretPayload` anyway — but neither the safety argument nor the reason for
two schemas is written down, in a file that otherwise explains every non-obvious decision at length.
Per the conventions, an unvalidated-looking narrow at a non-boundary needs either removal or a WHY.

#### Proposed solution

Cheapest: a two-line comment on `SecretPayloadDb`/`payloadStore` stating the contract — "same store
as SecureDb, narrowed to the secret rows; safe because secret names (`API_KEY`, `ADMIN_SESSION`)
never equal `MASTER_KEY_ROW`, and webLoad still runtime-validates" — plus noting the payoff (put()
through `payloadStore` cannot write a CryptoKey). Stronger: type `payloadStore` against `SecureDb`
and let `webLoad`'s existing `isSecretPayload` guard do the narrowing; that deletes
`SecretPayloadDb` entirely at the cost of a wider `put` signature. Either resolves the silent
mismatch; the comment route preserves the current (real) typing benefit.

### [Performance] Returning to the tab fires two overlapping update checks — debounce or latch `checkForUpdates`

**File(s):** `web/src/lib/pwa/updates.ts` (`initPWAUpdates`, lines 120–128; `checkForUpdates`, lines
189–228) @ 9ae62ff1

**Priority:** P4

#### Problem

Both a `visibilitychange`→visible handler and a `focus` handler call `checkForUpdates` (lines
120–125). Switching back to the tab fires both events back-to-back, so every tab return runs two
concurrent `checkForUpdates` invocations, each performing `getRegistration()` and a network-touching
`registration.update()`. `checkForUpdates` has no in-flight latch, so the two `update()` calls race;
beyond the wasted request, both can observe `registration.waiting` — only the
`updateReload !== 'none'` guard inside `activateWaitingSW` (line 154) keeps the double-call benign,
and that protection is incidental (both callers pass through the same synchronous window before
`updateReload` flips). Toddler devices on slow connections is exactly the profile this app optimizes
for elsewhere.

#### Proposed solution

Add a simple in-flight latch inside `checkForUpdates`:

```ts
let updateCheckInFlight = false;
async function checkForUpdates() {
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  try { ... } finally { updateCheckInFlight = false; }
}
```

or coalesce the two triggers (drop the `focus` listener — `visibilitychange` covers tab returns;
`focus` adds only window-manager focus changes within an already-visible tab). The latch is the
smaller, safer change and also removes the incidental-guard reliance above. One existing test
("registers only one reload while a waiting worker activates", updates.test.ts line 259) already
sequentially covers double-call; add a concurrent-call variant.

### [Architecture] Move the `isIosSafari` UA sniff into `platform.ts` with the other UA heuristics

**File(s):** `web/src/lib/state/install.svelte.ts` (`isIosSafari`, lines 43–49) @ 9ae62ff1

**Priority:** P4

#### Problem

`platform.ts` is the declared home for UA sniffing (`isIosDevice`, `isAndroidBrowser`,
`osLabelFromUserAgent`), and `install.svelte.ts` itself enforces that centralization for its
consumers — `installDeviceOs`'s comment (lines 51–52): "consumers (the Parent Center setup guide)
must not re-sniff the UA themselves." Yet six lines above, the module re-sniffs the UA locally:

```ts
function isIosSafari() {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent || '';
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
```

A state module holding a browser-detection regex is the wrong layer: anyone hunting for "how do we
detect real iOS Safari" greps `platform.ts` and misses this, and a second consumer (e.g. a future
Share-sheet hint elsewhere) would either re-derive the regex or import browser detection from an
install-prompt state module.

#### Proposed solution

Move `isIosSafari()` to `web/src/lib/platform.ts` (exported, with its in-app-browser comment) next
to `isIosDevice`, and import it in `install.svelte.ts`. The install tests keep passing unchanged —
`install.svelte.test.ts` already mocks `$lib/platform` with `importOriginal` spread (lines 8–11), so
the real `isIosSafari` continues to read the stubbed UA.

### [Testing] Deduplicate the native-Preferences mock boilerplate shared by the two storage suites

**File(s):** `web/src/lib/storage.test.ts` (lines 3–26),
`web/src/lib/storage.restore.integration.test.ts` (lines 19–38) @ 9ae62ff1

**Priority:** P4

#### Problem

Both suites carry a near-identical ~25-line preamble: a `vi.hoisted` `ctrl { native }` toggle, a
`vi.mock('./platform', ...)` factory, a hoisted `prefsStore` Map, and a
`vi.mock('@capacitor/preferences', ...)` factory. The integration file even annotates the copy:
"(mirrors storage.test.ts)" (line 20) — which is precisely the "keep in sync with X" comment the
conventions call a defect marker. The mocks have already drifted once: `storage.test.ts` adds
`prefsSetFailure` injection (lines 14, 21) that the integration copy lacks, so a future behavior
needing failure injection in the integration suite invites a third variant.

#### Proposed solution

Extract a colocated helper, e.g. `web/src/lib/testSupport/nativePrefsMock.ts`, exporting the
hoisted-state factory and the two mock-module factories:

```ts
export function createNativePrefsCtrl(): { native: boolean; prefsStore: Map<string, string>; prefsSetFailure: { key: string | null } };
export function platformMockFor(ctrl: { native: boolean }): typeof import('../platform');
export function preferencesMockFor(ctrl: ...): { Preferences: ... };
```

Each spec keeps its own two-line `vi.mock` calls (hoisting requires the calls stay in-file) whose
factories delegate:
`vi.mock('./platform', async () => (await import('./testSupport/nativePrefsMock')).platformMockFor(ctrl))`
— `vi.mock` factories may dynamically import helpers. Gotcha: the `ctrl` the factory closes over
must still come from `vi.hoisted`, so the helper exports builders, not the mocks themselves. If the
indirection proves too fiddly for Vitest's hoisting, the fallback is at least deleting the "mirrors"
comment in favor of pointing both files at one canonical mock shape documented in the helper.

### [Maintainability] Make the `'/sw.js'` filename agreement with the Workbox build explicit

**File(s):** `web/src/lib/pwa/updates.ts` (line 71) @ 9ae62ff1

**Priority:** P5

#### Problem

`updates.ts` registers a hard-coded path:

```ts
navigator.serviceWorker.register('/sw.js');
```

The other side of the agreement is `vite-plugin-pwa`'s *default* `filename: 'sw.js'` — nothing in
`web/vite.config.ts` (VitePWA block, lines 71–115) states the filename at all, so the contract is
one literal here and an implicit default there. The convention says cross-file agreement lives in an
imported constant or a drift-guard test. There is a de facto guard —
`web/tests/pwa-registration.spec.ts` registers against the built output and would fail if the
emitted name changed — but that E2E exists to test the stroke gate, not the filename contract, and
it's skipped entirely under `DEV_SERVER=1` (line 12).

#### Proposed solution

Declare the constant once and thread it to both sides: export `SW_SCRIPT_PATH = '/sw.js'` from a
small src module (or `updates.ts` itself), use it in `register(...)`, and set
`filename: SW_SCRIPT_PATH.slice(1)` explicitly in the VitePWA options (`vite.config.ts` already
imports sibling TS modules, and a src import with no Svelte deps is fine there). That converts the
implicit default into a stated, single-sourced decision; the E2E remains as the behavioral backstop.

### [Testing] Let `makePromptEvent` take overrides instead of hand-rolling two more `beforeinstallprompt` events

**File(s):** `web/src/lib/state/install.svelte.test.ts` (`makePromptEvent` lines 29–36; ad-hoc
copies at 200–205 and 215–220) @ 9ae62ff1

**Priority:** P5

#### Problem

The file has a helper for fabricating `BeforeInstallPromptEvent`s, but two tests rebuild the event
by hand because they need a different `prompt`/`userChoice` — each copy repeating the
`new Event(...)` + two `(e as any)` assignments + two `eslint-disable` lines:

```ts
const e = new Event('beforeinstallprompt');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(e as any).prompt = vi.fn().mockRejectedValue(new Error('prompt went stale'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(e as any).userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
```

Six `as any` casts and six eslint suppressions total for one event shape the project already types
globally (`BeforeInstallPromptEvent`, `web/src/app.d.ts` lines 45–48).

#### Proposed solution

Widen the helper to accept overrides and type the result once:

```ts
function makePromptEvent(
  outcome: 'accepted' | 'dismissed',
  overrides: Partial<Pick<BeforeInstallPromptEvent, 'prompt' | 'userChoice'>> = {},
): BeforeInstallPromptEvent {
  return Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
    ...overrides,
  }) as BeforeInstallPromptEvent;
}
```

The two ad-hoc blocks become
`makePromptEvent('accepted', { prompt: vi.fn().mockRejectedValue(...) })` and
`makePromptEvent('accepted', { userChoice: new Promise(() => {}) })`, and all six suppressions
disappear (the one remaining `as` sits at the DOM boundary, which is where the convention allows
it).

### [Testing] `updates.test.ts` re-declares `SETTLED_IN_STROKES` in a mock the module under test never imports

**File(s):** `web/src/lib/pwa/updates.test.ts` (line 5) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
vi.mock('$lib/state/canvas.svelte', () => ({ canvasState, SETTLED_IN_STROKES: 3 }));
```

`updates.ts` imports only `canvasState` from that module (line 31), so the `SETTLED_IN_STROKES: 3`
member is dead mock surface — and it mirrors a real constant's value
(`web/src/lib/state/canvas.svelte.ts:4`) by hand, the exact pattern the testing rules ban ("never
re-declare the value — a mirrored copy keeps passing for the wrong reason"). If the real threshold
changed, this mock would silently keep exporting 3 to any future import, masking the change from
this suite.

#### Proposed solution

Delete `SETTLED_IN_STROKES: 3` from the factory. If some future test here genuinely needs the
constant, re-export the real one:
`vi.mock('$lib/state/canvas.svelte', async (importOriginal) => ({ ...(await importOriginal()), canvasState }))`
— though note the original module executes `$state`, so the plain deletion is the right first step.

### [Types] Name the install-prompt outcome union once instead of three structural repeats

**File(s):** `web/src/lib/state/install.svelte.ts` (lines 128, 135), `web/src/app.d.ts` (line 47) @
9ae62ff1

**Priority:** P5

#### Problem

The `'accepted' | 'dismissed'` pair is spelled out in three places:
`BeforeInstallPromptEvent.userChoice`'s type (`app.d.ts:47`), `promptInstall`'s return type
(`install.svelte.ts:128`, extended with `'unavailable'`), and the local
`let outcome: 'accepted' | 'dismissed'` (line 135). They must agree — a Chromium spec change or a
widened union would need three synchronized edits — and nothing links them; this is the
closed-vocabulary case the conventions say to declare once and thread through.

#### Proposed solution

Derive from the platform type, which is the actual source of truth:

```ts
type NativePromptOutcome = Awaited<BeforeInstallPromptEvent['userChoice']>['outcome'];
export type InstallPromptOutcome = NativePromptOutcome | 'unavailable';
```

in `install.svelte.ts`, using `InstallPromptOutcome` as `promptInstall`'s return type and
`NativePromptOutcome` for the local. Callers (`InstallBanner.svelte:86`,
`SetupInstructions.svelte:20`) compare against `'unavailable'` and keep compiling unchanged.

### [Readability] Drop the temporal "identical to before" phrasing from the storage module header

**File(s):** `web/src/lib/storage.ts` (lines 18–19) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
// On the web, isNative() is false and the Preferences layer is skipped entirely
// — behaviour is identical to before.
```

"identical to before" is exactly the temporal phrasing the conventions ban ("no temporal phrasing
('now', 'previously')"): "before" refers to a change-time baseline no future reader has, and the
clause carries no information once the migration context is gone — the preceding sentence already
states the web behavior completely.

#### Proposed solution

Delete the trailing clause: "On the web, isNative() is false and the Preferences layer is skipped
entirely." (Or, if the intent was to stress single-layer semantics: "— the web is a pure
localStorage store.") One-line comment edit, no code change.

### [Testing] The restore integration test re-declares store defaults instead of importing them

**File(s):** `web/src/lib/storage.restore.integration.test.ts` (lines 58–60) @ 9ae62ff1

**Priority:** P5

#### Problem

The sanity block hardcodes each store's default:

```ts
expect(strokeState.penSize).toBe(3);
expect(toolState.brush).toBe('pen');
expect(settings.soundVolume).toBe(50);
```

`3` mirrors `DEFAULT_SIZE` (`strokeWidth.svelte.ts:7`), `'pen'` mirrors `DEFAULT_BRUSH`
(`tool.svelte.ts:35`), `50` mirrors `SOUND_VOLUME_DEFAULT` (`settings.svelte.ts:76`). The testing
rule says parametrized tests import the constant they exercise, never re-declare it. Here a
legitimate product change (say, default pen size 2) would fail this suite for a reason unrelated to
what it guards (the `onDurableRestore` registration wiring), sending the person changing the default
on a detour through the durable-restore machinery.

#### Proposed solution

Import the constants (`DEFAULT_SIZE` and `SOUND_VOLUME_DEFAULT` are exported; export `DEFAULT_BRUSH`
from `tool.svelte.ts`, currently module-private at line 35) and assert against them — the sanity
check's real intent, "the store starts at its default, so the restored value below is a meaningful
change," survives any default change. Also pick injected restore values that provably differ (e.g.
compute `restoredSize = DEFAULT_SIZE === 5 ? 4 : 5`) or simply assert `not.toBe` between default and
injected value before restoring.

## Source: Code audit — Server / API backend

### [Correctness] Make the /api/report smoke burst incapable of creating real GitHub issues (payload-level honeypot, not just env clearing)

**File(s):** `web/src/routes/api/report/+server.ts` (`POST`, lines 57–70) and
`scripts/api-smoke.mjs` (`checkReport` burst loop, lines ~198–208) @ 9ae62ff1

**Priority:** P2

#### Problem

The repo currently has three open junk issues titled `[Bug] burst 0` (`#586`, `#539`, `#537`,
labeled `type:bug,user-report`) — the exact output of `titleFor('bug', 'burst 0')` in
`web/src/routes/api/report/+server.ts`. They were created by the api-smoke script's throttle burst:

```js
const res = await report({ kind: 'bug', message: `burst ${i}` });
```

running against a server that *did* have `GITHUB_ISSUE_TOKEN` configured. The chosen defense is
environment-level: `scripts/api-smoke.mjs` line 404 passes `GITHUB_ISSUE_TOKEN: ''` when spawning
its dev server. That defense has already failed twice — commit 8788642 (2026-07-24, "Prevent
api-smoke test from creating real GitHub issues") and commit 3c4e443 (2026-07-28, "Prevent API smoke
test issue creation"), and issue `#586` was still created on 2026-07-28. Any future path that runs
these payloads against a configured server (a deploy smoke, `dev:netlify` with injected Netlify env,
someone pointing `BASE` at production) recreates the problem.

The endpoint itself provides a payload-level kill switch that the smoke doesn't use: the handler
charges the rate limit **before** the honeypot check (lines 58–62 vs 66–70):

```ts
const { limited, retryAfter } = rateLimit(
  reportBucket(getClientAddress()),
  rateLimitPolicy.report
);
if (limited) return throttled(retryAfter);
...
if (typeof body?.hp === 'string' && body.hp.trim()) {
  return json({ ok: true });
}
```

So a burst payload carrying `hp: 'smoke'` still consumes budget and still trips the 429 the burst
asserts — but can never create an issue, on any server, under any env configuration.

#### Proposed solution

1. In `scripts/api-smoke.mjs`, send `hp: 'smoke-burst'` in the burst-loop payloads (and arguably in
   every payload except the ones that assert honeypot/validation semantics). Keep the env clear as
   belt-and-braces.
2. In `web/src/routes/api/report/+server.ts`, the ordering "rate limit is charged before the
   honeypot short-circuit" becomes load-bearing for this defense — add a colocated unit test
   asserting a honeypot submission still charges the bucket (mock `rateLimit` like
   `verify-access-code/server.test.ts` does), so a future reorder fails a test instead of silently
   disarming the smoke's safety.
3. Close/clean the three `burst 0` junk issues as part of the fix.

Gotcha: the smoke's honeypot contract case (line ~178) must keep asserting `{ ok: true }` without
`url`, so give the burst payloads a distinct `hp` value to keep the two cases readable. (The
burst-loop half of the fix lives in `scripts/`, outside this section; the in-section half is the
ordering guard test.)

### [Maintainability] Deduplicate the sliding-window arithmetic shared by `rateLimit` and `peekRateLimit`

**File(s):** `web/src/lib/server/rateLimit.ts` (`rateLimit`, lines 28–49; `peekRateLimit`, lines
63–67) @ 9ae62ff1

**Priority:** P3

#### Problem

The two exported functions each re-implement the same two computations:

* Window filtering — line 31: `const hits = (buckets.get(key) || []).filter((t) => t > cutoff);` and
  line 64: `const hits = (buckets.get(key) || []).filter((t) => t > now - windowMs);`
* Retry-after — line 43:
  `const retryAfter = Math.max(Math.ceil((hits[0] + windowMs - now) / 1000), 1);` and line 66,
  character-for-character identical.

The retry-after expression encodes a non-obvious contract (seconds until the *oldest* hit ages out,
floored at 1 so `Retry-After: 0` never ships). Today a change to one copy (say, rounding, or
switching to the newest hit) would silently diverge the peek path from the charging path — precisely
the pair that must agree for the "peek then charge only failures" choreography in
`verify-access-code` and `generationAuthorization` to be coherent.

#### Proposed solution

Extract two module-private helpers and call them from both:

```ts
function hitsWithinWindow(key: string, now: number, windowMs: number): number[];
function retryAfterSeconds(oldestHit: number, windowMs: number, now: number): number;
```

`rateLimit` keeps its write-back/sweep behavior; `peekRateLimit` stays read-only.
Behavior-preserving; the existing `rateLimit.test.ts` suite already covers both paths and should
pass unchanged.

### [Maintainability] Remove the shadow default policy from the limiter and share one `RateLimitOptions` type with `rateLimitPolicy`

**File(s):** `web/src/lib/server/rateLimit.ts` (lines 26, 61),
`web/src/lib/server/rateLimitPolicy.ts` (lines 1–10) @ 9ae62ff1

**Priority:** P3

#### Problem

Two related issues:

1. Both `rateLimit` and `peekRateLimit` carry default options —
   `{ limit = 10, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}` (lines 26 and
   61). Every production call site passes an explicit entry from `rateLimitPolicy` (verified: all
   seven call sites across `verify-key`, `csp-report`, `report`, `verify-access-code`,
   `generationAuthorization`, and `admin.ts` do). The defaults are exercised only by tests
   (`rateLimit.test.ts`, and one no-options `peekRateLimit` call in
   `verify-access-code/server.integration.test.ts:38`). Per the repo's "no speculative surface"
   rule, that's a seam kept only for tests — and worse, it is a *shadow policy*: `10`/`60_000`
   silently duplicates `rateLimitPolicy`'s numbers, so a future caller that forgets the options
   argument compiles and gets an unreviewed limit.
2. `rateLimitPolicy.ts` declares the option shape inline (`{ limit: number; windowMs: number }`,
   line 9) instead of importing it from the limiter — the same shape typed twice in adjacent
   modules, against the "cross-file agreement via imported constants/types" convention.

#### Proposed solution

Export the shape once from `rateLimit.ts`:

```ts
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}
export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult;
export function peekRateLimit(key: string, options: RateLimitOptions): RateLimitResult;
```

and use `Record<..., RateLimitOptions>` in `rateLimitPolicy.ts`. Update the handful of test call
sites to pass `windowMs` explicitly (they already pass `limit`). Making options required means the
compiler — not a default — catches a missing policy.

### [Architecture] Give `authorizeGenerationRequest` one failure channel instead of three exit modes

**File(s):** `web/src/lib/server/generationAuthorization.ts` (`authorizeGenerationRequest`, lines
17–57) @ 9ae62ff1

**Priority:** P3

#### Problem

The function terminates through three different channels:

* returns a `GenerationAuthorization` object on success (lines 42–46, 56);
* **returns** a `Response` for throttling (lines 31, 39, 55);
* **throws** a SvelteKit `HttpError` for auth/config failures (line 34 `throw error(403, …)`, line
  41 `throw error(500, …)`).

The caller (`generate-image/+server.ts:113–118`) must know that the union return type only covers
two of the three outcomes and that a third escapes via exceptions — the signature
`Promise<GenerationAuthorization | Response>` under-describes the contract. Tests mirror the
awkwardness: some assert `result instanceof Response`, others `rejects.toMatchObject`. For a
first-time reader, the mixed convention obscures which failures are "expected flow" and which are
exceptional.

#### Proposed solution

Pick one convention. The lightest change is to throw nothing and return a discriminated union:

```ts
export type GenerationAuthorization =
  | { authorized: true; usingByok: boolean; effectiveKey: string; managedToken: string | null }
  | { authorized: false; response: Response };
```

with the 403/500 branches producing `{ authorized: false, response: json({...}, { status }) }` (or
keep `error()` throws for *both* 403/500 and throttling by throwing `HttpError`-shaped 429s — but
`throttled()` is the repo's canonical 429, so the return-based shape fits better). Tradeoff: the
route's `instanceof Response` check becomes a plain discriminant check, which is also more grepable.
Update `generationAuthorization.test.ts` accordingly.

### [Maintainability] Two wire shapes for JSON errors: thrown `error()` produces `{ message }`, handlers produce `{ ok: false, error }`

**File(s):** `web/src/lib/server/http.ts` (`readJsonBody`, line 15; `throttled`, lines 50–55),
`web/src/routes/api/generate-image/+server.ts` (lines 20, 67–68, 79–81, 124, 140–141) @ 9ae62ff1

**Priority:** P3

#### Problem

The section's error responses come in two incompatible body shapes:

* `json({ ok: false, error }, { status })` — verify-key, verify-access-code, report, throttled 429s
  (the shape `.claude/rules/server-api.md` documents as canonical).
* `throw error(status, message)` — `readJsonBody`'s 400 (`http.ts:15`) and every generate-image
  failure (400/413/415/422/403/500/502) — which SvelteKit serializes as `{ message }`.

Concretely: a malformed JSON body sent to `/api/verify-access-code` yields a 400 whose body is
`{ message: 'Expected a JSON body' }`; the client (`web/src/lib/aiCredential.ts:37–44`) reads
`data.error`, finds `undefined`, and drops the server's explanation on the floor. The generate-image
portion is partially insulated because its client reads raw text as `detail`, but the split still
means every new endpoint author must know which of two error dialects each helper speaks.

Note: open issue `#567` records this as a *sequencing constraint* ("until the error-shape
unification lands, `ApiErrorResponse = { ok: false; error: string }` is false for `readJsonBody`'s
400 and generate-image's thrown errors") — the unification itself is referenced there but is not
itself an open tracked issue, so filing it here. Coordinate with `#567` rather than duplicating its
contract-types work.

#### Proposed solution

Add a `fail(status, error)` helper next to `throttled()` in `http.ts` returning
`json({ ok: false, error }, { status })`, convert `readJsonBody` and the generate-image validation
throws to it (or have `handleError`/a small wrapper translate `HttpError` into the canonical shape
for `/api/*`), and extend `scripts/api-smoke.mjs` assertions to pin the body shape on the
400/413/415 cases. Sequence before `#567` per that issue's own recommendation.

### [Testing] The pure formatting/parsing helpers in `report` and `csp-report` have no unit tests

**File(s):** `web/src/routes/api/report/+server.ts` (`titleFor`, lines 20–26; `bodyFor`, lines
28–47), `web/src/routes/api/csp-report/+server.ts` (`extractViolations` + converters, lines 38–93) @
9ae62ff1

**Priority:** P3

#### Problem

`verify-access-code` demonstrates the section's pattern: colocated `server.test.ts` +
`server.integration.test.ts`. The other two content-bearing routes have none:

* `titleFor` encodes truncation (72/69 + ellipsis), first-line extraction, and per-kind fallbacks —
  none unit-tested. Its output lands verbatim in the public issue tracker.
* `bodyFor` composes attacker-controlled text through `escapeIssueMarkdown` and renders device rows
  — the escaping *call* is the security-relevant part, and nothing asserts it happens for both the
  message and each device value.
* `extractViolations` normalizes two browser payload dialects with field capping
  (`MAX_FIELD_LENGTH`), `finiteNumberOrNull`, and the `MAX_REPORTS_PER_PAYLOAD` slice at line 131.
  The api-smoke covers one happy payload per dialect; the caps, non-finite numbers, missing-field
  defaults (`disposition || 'enforce'`), and the report-count slice have zero coverage anywhere.

These are exactly the "pure logic" tier the testing rules say Vitest should own; the smoke script is
a live-contract check, not a substitute.

#### Proposed solution

Add `web/src/routes/api/report/server.test.ts` and `web/src/routes/api/csp-report/server.test.ts`
(`// @vitest-environment node`). The helpers are module-private, so either export them (the route
file is already imported by tests elsewhere in the repo pattern) or test through `POST` with mocked
`createIssue`/`console.warn`. Testing through `POST` also covers the honeypot/ordering guard
proposed in the P2 finding above.

### [Performance] `generate-image` buffers up to 15 MB before rejecting an unsupported Content-Type on the raw path

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`POST`, lines 120–125; raw
`readValidatedImage`, lines 77–84) @ 9ae62ff1

**Priority:** P4

#### Problem

On the raw-body contract the MIME type is known from the header before any body byte is read
(`contentTypeOf(request)`, line 82), yet the allowlist check runs only after `readValidatedImage()`
has buffered the full body:

```ts
const { bytes: inputBytes, mimeType } = await source.readValidatedImage();
// An empty type is fine (default to PNG below); only reject a type that's
// present and not on the allowlist.
if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
  throw error(415, 'Unsupported image type');
}
```

A credentialed caller posting 15 MB of `application/octet-stream` costs a full buffer + copy on the
single synchronous Netlify function (the memory/DoS scenario `MAX_IMAGE_BYTES`'s own comment worries
about) before the cheap header check rejects it. The multipart path can't avoid buffering
(credentials live in the body), but the raw path — the current contract — can.

#### Proposed solution

Move the allowlist check inside each `readValidatedImage` thunk: the raw thunk checks
`contentTypeOf(request)` *before* `readBodyWithinLimit`; the multipart thunk checks `imageFile.type`
after the (unavoidable) parse. This also relocates the 415 beside the 413/400 it belongs with.
Gotcha: the raw path's status for "oversized AND unsupported" flips from 413 to 415 — update the
api-smoke expectation if it pins that combination (it currently only pins the multipart 415 case).

### [Maintainability] Name the limiter sweep threshold and remove its cross-policy window assumption

**File(s):** `web/src/lib/server/rateLimit.ts` (`rateLimit`, lines 33–39) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// Opportunistic sweep so the Map can't grow unbounded across many distinct
// IPs; only runs once the map is already large.
if (buckets.size > 5000) {
  for (const [k, ts] of buckets) {
    if (ts[ts.length - 1] <= cutoff) buckets.delete(k);
  }
}
```

Two issues:

1. `5000` is a tuning literal (a memory/CPU tradeoff threshold) without a named constant — the
   convention says such literals get a module-scope name carrying the decision
   (`SWEEP_THRESHOLD_BUCKETS` or similar) with the WHY comment attached to it.
2. The sweep judges *every* bucket by the **calling endpoint's** `cutoff` (derived from the caller's
   `windowMs`). Today all policies use `WINDOW_MS = 60_000` so this is invisible, but the first
   endpoint that adopts a longer window (say a 10-minute admin window) can have its still-live
   buckets deleted by a 60-second-window caller's sweep — a correctness bug armed silently by a
   future `rateLimitPolicy` edit. Nothing tests the sweep at all.

#### Proposed solution

Name the threshold, and make the sweep window-independent: either store `(timestamps, windowMs)` per
bucket and sweep with each bucket's own window, or sweep with the maximum window across
`rateLimitPolicy` (import it, or a named `MAX_WINDOW_MS`). Add a unit test that fills past the
threshold and asserts stale buckets are dropped while a live longer-window bucket survives.

### [Readability] `verify-key`'s "Same throttle as verify-access-code" comment describes a policy the endpoint doesn't use

**File(s):** `web/src/routes/api/verify-key/+server.ts` (`POST`, lines 15–25) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// Same throttle as verify-access-code: a live model call per request makes
// this worth guarding against rapid repeated probes from one client.
const { limited, retryAfter } = rateLimit(
  verifyKeyBucket(getClientAddress()),
  rateLimitPolicy.verifyKey,
);
```

`verify-access-code` deliberately uses the peek-then-charge-failures choreography (limited callers
get a blind 429; successful verifications never spend budget — its lines 22–33). `verify-key`
charges **every** request up front, success or failure — a materially different policy (correct
here, since every request costs a live model call regardless of outcome). "Same throttle as
verify-access-code" points the reader at the wrong model; someone "fixing" verify-key to match its
comment would remove the very property the endpoint wants. It also charges the bucket before the
trivial empty-key rejection (line 24–25), which the comment doesn't acknowledge.

#### Proposed solution

Rewrite the comment to state the actual policy and its WHY, e.g.: "Unlike verify-access-code (which
charges only failed guesses), every request charges the bucket up front — each attempt costs a live
model call, so successes are as expensive as failures." Optionally hoist the empty-key check above
the charge so client bugs don't burn budget without a model call.

### [Readability] `hasDevice` holds a `DeviceInfo | null`, not a boolean

**File(s):** `web/src/routes/api/report/+server.ts` (`POST`, lines 84–86, 100) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const device = body?.device && typeof body.device === 'object'
  ? sanitizeDeviceInfo(body.device)
  : null;
const hasDevice = device && Object.keys(device).length > 0 ? device : null;
```

A `has*` prefix promises a boolean; `hasDevice` is the sanitized `DeviceInfo` object (or null), then
passed as data into `bodyFor(kind, message, hasDevice)` at line 100. The two adjacent near-identical
bindings (`device`, `hasDevice`) also make the reader diff them to see what the second adds (the
empty-object collapse).

#### Proposed solution

Collapse into one well-named binding, e.g.:

```ts
const device = sanitizedDeviceOrNull(body?.device);
```

with a small helper that folds both the type check and the empty-after-sanitize collapse — or at
minimum rename to `nonEmptyDevice`. Pure rename/extract; no behavior change.

### [Maintainability] Name `titleFor`'s truncation literals and derive the slice length from the cap

**File(s):** `web/src/routes/api/report/+server.ts` (`titleFor`, line 23) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const summary = firstLine.length > 72 ? `${firstLine.slice(0, 69)}…` : firstLine;
```

`72` (the title-length cap) and `69` (cap minus room for the ellipsis) are unnamed tuning literals,
and their relationship (`69 = 72 − 3`? actually `…` is one char, so the 3 is a soft aesthetic gap)
is preserved only by hand — exactly the pattern the "tuning literals get names" convention exists
for. A future edit to one number quietly breaks the pairing.

#### Proposed solution

```ts
const TITLE_SUMMARY_MAX_CHARS = 72;
const TITLE_TRUNCATED_CHARS = 69;
```

with a one-line WHY on the pair (or compute `TITLE_SUMMARY_MAX_CHARS - '…'.length - 2` if the gap is
intentional — state which). Covered by the new `titleFor` unit tests proposed above.

### [Readability] Extract `report`'s inline validation ladder into a named parser

**File(s):** `web/src/routes/api/report/+server.ts` (`POST`, lines 57–111) @ 9ae62ff1

**Priority:** P4

#### Problem

The handler runs six sequential concerns inline: throttle → honeypot → kind validation → message
validation/truncation → device sanitation → configuration check → issue creation. Each step is
small, but the middle four are pure payload interpretation interleaved with early-return responses,
and the `Kind` type is referenced (line 16, `KIND_LABEL: Record<Kind, string>`) before it is
declared (line 18). Per the audit bar, a function that can be split into named steps that explain
themselves is a finding — and the parsing half is what the missing unit tests (above) most want to
exercise in isolation.

#### Proposed solution

```ts
type ReportSubmission = { kind: Kind; message: string; device: DeviceInfo | null };
function parseReportSubmission(body: unknown): ReportSubmission | { error: string };
```

`POST` becomes: throttle → honeypot → `parseReportSubmission` (single 400 branch) → config check →
`createIssue`. Move `type Kind` above `KIND_LABEL` while touching it. This pairs naturally with the
unit-test finding and keeps the wire contract unchanged.

### [Maintainability] Missing-input on the verify endpoints answers 200 while the same class of validation answers 400 on `report`

**File(s):** `web/src/routes/api/verify-access-code/+server.ts` (line 28),
`web/src/routes/api/verify-key/+server.ts` (line 25), `web/src/routes/api/report/+server.ts` (lines
74–81) @ 9ae62ff1

**Priority:** P4

#### Problem

`.claude/rules/server-api.md` draws the line precisely: HTTP 200 + `{ ok: false }` is reserved for
*failed verification* (so validity isn't disclosed via status); "non-oracle request validation
retains 4xx responses with the same body shape." An absent/blank input is request validation — it
discloses nothing about credential validity — yet:

```ts
if (!code) return json({ ok: false, error: 'No access code provided' });   // 200
...
if (!apiKey) return json({ ok: false, error: 'No API key provided' });     // 200
```

while `report` correctly answers 400 for its equivalent cases (`Please choose bug or feature.`,
`Please type a short description.`). The inconsistency makes the rule harder to learn from the code,
and monitoring can't distinguish client bugs (should be 4xx) from ordinary wrong guesses (200).

#### Proposed solution

Return `json({ ok: false, error: … }, { status: 400 })` for the empty-input branches of both verify
endpoints. The client (`web/src/lib/aiCredential.ts:41`) already computes
`ok: res.ok && data.ok === true`, so behavior is unchanged there; the api-smoke doesn't pin these
cases. Cheap, and it re-aligns the code with its own documented rule — if instead the 200 is
deliberate (keep the oracle surface perfectly uniform), record that in the rule file, which
currently says the opposite.

### [Testing] Nothing guards `generate-image`'s deferred-body-read invariant

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`readGenerationRequest`, lines 56–85;
`POST`, lines 110–120) @ 9ae62ff1

**Priority:** P4

#### Problem

The route's central performance/DoS property — the ≤15 MB body is *not* read until
`authorizeGenerationRequest` succeeds (the whole reason `readValidatedImage` is a thunk, per the
comment at lines 39–42) — has no test at any level. The api-smoke can only observe statuses, not
read ordering; there is no colocated unit test for this route at all. A well-meaning refactor that
inlines the read before authorization (the "obvious" simplification) would pass every existing gate
while reinstating the buffer-before-auth cost for unauthenticated garbage traffic.

`http.test.ts` already demonstrates the exact technique: `vi.spyOn(request, 'arrayBuffer')` plus
`expect(arrayBuffer).not.toHaveBeenCalled()` (its lines 50–60).

#### Proposed solution

Add `web/src/routes/api/generate-image/server.test.ts` (`// @vitest-environment node`), mocking
`$lib/server/generationAuthorization`, `$lib/server/usage`, and `$lib/server/ai/provider` (the
`verify-access-code` tests show the `vi.hoisted` pattern). Key cases: (1) 403/429 from authorization
→ `request.arrayBuffer`/`formData` never called on the raw path; (2) raw path happy case threads
header credentials and query style; (3) multipart path still parses legacy fields. This also gives
the legacy-contract branch its first regression net before its planned removal.

### [Types] Export `AiImageResult` and `KeyCheckResult` from the provider seam

**File(s):** `web/src/lib/server/ai/provider.ts` (lines 14–22),
`web/src/lib/server/ai/gemini.test.ts` (line 57) @ 9ae62ff1

**Priority:** P4

#### Problem

`provider.ts` exports only `AiImageProvider`; the result unions it is built from are file-private:

```ts
type AiImageResult = … // not exported
type KeyCheckResult = { ok: true } | { ok: false; reason: string }; // not exported
```

Consumers can name the provider but not its results. The cost shows up immediately in
`gemini.test.ts:57`:

```ts
expect((result as { reason: string }).reason).toMatch(/^Model did not return an image/);
```

— a cast to re-widen what a discriminated-union narrow (`if (result.kind === 'error')`) would give
for free if the type were nameable/known. Any future non-test consumer that wants to store or pass a
result (a retry queue, a usage recorder) hits the same wall. The repo convention treats `as` as a
boundary-only tool; here it papers over a missing export.

#### Proposed solution

`export type AiImageResult` and `export type KeyCheckResult` (zero runtime cost), and replace the
test cast with a discriminant narrow. Optionally also export `AiImageRequest` for symmetry — it is
already structurally exposed through the interface.

### [Maintainability] The shared guess-budget choreography is written twice with duplicated comments

**File(s):** `web/src/lib/server/generationAuthorization.ts` (lines 25–35),
`web/src/routes/api/verify-access-code/+server.ts` (lines 17–33) @ 9ae62ff1

**Priority:** P4

#### Problem

The ADR-0014 charging policy — peek the shared `verifyAccessCodeBucket`, blind-429 a limited IP,
validate via `isAllowedToken`, charge the bucket only on failure — is implemented independently in
both files, each with its own multi-line comment re-explaining the same contract ("peek before …
then charge only failures … so valid families behind one NAT never consume it"). The two sites
*must* stay in lockstep (same bucket, same policy, same peek/charge discipline — that shared budget
is the whole point), but nothing structural links them beyond the bucket-key function; the
choreography itself is prose-synchronized.

#### Proposed solution

Extract the pair into `rateLimit`- or `generationAuthorization`-adjacent helpers, e.g. in a small
`guessBudget.ts`:

```ts
export function peekGuessBudget(address: string): RateLimitResult;
export function chargeFailedGuess(address: string): void;
```

Both call sites keep their own outcome handling (the route returns `200 { ok:false }`, the
authorizer throws 403) but the bucket/policy/discipline is encoded once, and the WHY comment lives
once at the helper. Gotcha: `rateLimitKeys` usage is lint-enforced — keep the bucket-key import
inside the helper so the lint contract still sees it.

### [Readability] Extract the duplicated first-line truncation and type the evolving `response` in `gemini.ts`

**File(s):** `web/src/lib/server/ai/gemini.ts` (`generateImage`, lines 50, 69–75) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
let response;
try {
  response = await ai.models.generateContent({ … });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;
  console.error(`Gemini call failed (${status ?? 'unknown'}): ${msg.split('\n')[0]}`);
  if (isSafetyError(err)) return { kind: 'refusal', reason: msg.split('\n')[0] };
  return { kind: 'error', reason: `Gemini request failed: ${msg}` };
}
```

`msg.split('\n')[0]` appears twice (lines 72 and 74) — the "first line only" decision (SDK errors
append multi-line JSON detail) is enacted twice without a name. `let response;` (line 50) relies on
TypeScript's evolving-`any`; an explicit `let response: GenerateContentResponse;` documents the type
where control flow makes it non-obvious. The `status` extraction also duplicates the same cast in
`geminiSafety.isSafetyError` (line 66).

#### Proposed solution

Add a tiny module helper `const firstLine = (message: string) => message.split('\n')[0];` (name
carries the WHY better with a short comment about SDK multi-line errors), annotate `response`, and
optionally share a `statusOf(err: unknown)` helper with `geminiSafety.ts`. Pure cleanup;
`gemini.test.ts` pins the observable behavior.

### [Types] `classifyGeminiResponse` leans on non-null assertions and defensive optional chaining on a non-optional parameter

**File(s):** `web/src/lib/server/ai/geminiSafety.ts` (`classifyGeminiResponse`, lines 28–41) @
9ae62ff1

**Priority:** P5

#### Problem

```ts
const imagePart = parts.find((p) => p.inlineData?.data);
if (imagePart) {
  return {
    kind: 'image',
    data: imagePart.inlineData!.data!,
    mimeType: imagePart.inlineData!.mimeType || 'image/png',
  };
}
```

Three `!` assertions restate what the `find` predicate already checked but TS cannot carry across
the boundary. A `for…of` with an inline narrow
(`const data = p.inlineData?.data; if (data) return { kind: 'image', data, mimeType: … }`) expresses
the same logic with zero assertions. Separately, lines 28 and 31 use `response?.promptFeedback` /
`response?.candidates` although the parameter is typed non-nullable `GenerateContentResponse` — the
`?.` implies a runtime contract ("callers may pass undefined") the signature denies; if untyped
`.mjs` asset-gen callers are the reason, the parameter type should say so instead.

#### Proposed solution

Rewrite the image scan as a loop with local narrowing (assertions disappear), and either drop the
`response?.` chains or widen the parameter to `GenerateContentResponse | undefined` with a comment
naming the strip-types consumers that justify it. `geminiSafety.test.ts` fully pins behavior.

### [Readability] The header-credentials design comment in `generate-image` is attached to an unrelated helper

**File(s):** `web/src/routes/api/generate-image/+server.ts` (lines 28–33) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
// The credentials ride in headers, not the query string: the managed access
// token and (especially) a parent's BYO Gemini key are secrets, and query
// strings leak into server/CDN access logs, browser history, and Referer
// headers. The non-secret style enum is a plain query param. See ADR-0064.
const asString = (value: FormDataEntryValue | null): string | null =>
  typeof value === 'string' ? value : null;
```

The comment explains the raw-body contract's credential placement, but its attachment point is
`asString` — a multipart-only coercion helper with nothing to do with headers. A reader scanning for
why `asString` exists gets ADR-0064 secrets rationale; a reader looking for the credential rationale
won't look above a form-data helper.

#### Proposed solution

Move the comment onto `readGenerationRequest` (whose block comment at lines 45–55 already describes
the two shapes — fold it in there, beside the raw-branch `request.headers.get(ACCESS_TOKEN_HEADER)`
lines) and leave `asString` bare or with a one-liner about `FormDataEntryValue` being
`string | File`.

### [Maintainability] `config.geminiApiKey` returns the env var untrimmed, unlike its sibling

**File(s):** `web/src/lib/server/config.ts` (lines 3–7) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
export const config = {
  geminiApiKey: () => env.GEMINI_API_KEY,
  githubIssueToken: () => env.GITHUB_ISSUE_TOKEN,
  githubIssueRepo: () => env.GITHUB_ISSUE_REPO?.trim() || 'KyleMit/Splotch',
};
```

`githubIssueRepo` trims; the two secrets don't. A `GEMINI_API_KEY` pasted into the Netlify env UI
with a trailing newline/space (a classic copy-paste artifact) passes the truthiness check in
`generationAuthorization.ts:41` and then fails every model call with an auth error that looks like a
Google-side problem — a debugging trap the BYOK path explicitly defends against on its side
(`input.apiKey.trim()` in `generationAuthorization.ts:22`). The asymmetry (server-managed key
untrimmed, user key trimmed) is easy to fix at the single choke point.

#### Proposed solution

`geminiApiKey: () => env.GEMINI_API_KEY?.trim() || undefined` (and the same for `githubIssueToken`,
whose `isReportingConfigured`/`createIssue` consumers have the identical failure mode). Keep the
return type `string | undefined` so the existing `if (!effectiveKey)` checks behave unchanged.

## Source: Code audit — Coloring books + platform/device + audio + misc utilities

### [Performance] Coloring-book prefetch warms only the pen outline, missing the chalk art dark mode actually displays

**File(s):** `web/src/lib/components/ColoringBook.svelte` (`prefetchPageOverlay`, lines 45–47;
rotation-warm `$effect`, lines 59–63) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — confirmed that no other site warms chalk. Magnitude caveat the finding
> omits: `web/vite.config.ts` line 93 precaches `**/*.webp` (all 96 chalk files, ~39 MB), so once
> the service-worker precache completes both variants are local; the real win narrows to the
> pre-SW/first-visit window plus decode warming, and is near-nil on native where assets are bundled.
> Weigh that before ranking the work.

#### Problem

Both full-res warm-up paths in `ColoringBook.svelte` prefetch only the PEN outline:

```svelte
function prefetchPageOverlay(page: ColoringPage) {
  prefetchImages([pageImage(page, orientation)]);
}
```

and (lines 59–63):

```svelte
$effect(() => {
  if (!coloringBookState.overlayPage) return;
  const other = orientation === 'portrait' ? 'landscape' : 'portrait';
  prefetchImages([pageImage(coloringBookState.overlayPage, other)]);
});
```

But what the canvas actually renders in dark mode is the CHALK outline, not the pen outline —
`DrawingCanvas.svelte` lines 266–268:

```ts
const themedOverlayUrl = $derived(
  resolvedTheme() === 'dark' ? (chalkUrl() ?? overlayUrl()) : overlayUrl(),
);
```

The comment on the rotation-warm effect (lines 58–63) states its purpose: "warm it as soon as a page
is applied so that swap is a cache hit and the ready-gated fade-in (DrawingCanvas) is near-instant."
In dark mode that promise is broken: the effect warms `pageImage(page, other)` (the pen
`.outline.webp`), while the ready-gated decode in `DrawingCanvas` (lines 277–284) loads the
`.chalk.webp` — a cold fetch, so the blank-canvas rotation swap and the pick-from-picker path both
pay full network + decode latency in dark mode. Notably, the *thumbnail* prefetch
(`prefetchBookPages`, lines 42–44) already got this right — it is theme-aware via
`pageThumb(page, orientation, resolvedTheme())` and its comment explicitly says "reading
resolvedTheme() keeps the warmed set and the grid in sync". The full-res paths just never got the
same treatment when chalk art landed.

#### Proposed solution

Add a theme-aware full-res URL helper mirroring `DrawingCanvas`'s selection, e.g. in `books.ts`:

```ts
export function pageOverlayImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme,
): string {
  return (theme === 'dark' ? page.chalkImages[orientation] : undefined) ?? page.images[orientation];
}
```

and use it in `prefetchPageOverlay` and the rotation-warm effect
(`pageOverlayImage(page, other, resolvedTheme())`). Bonus: `DrawingCanvas`'s `themedOverlayUrl`
could be re-expressed through the same helper (via a `coloringBook.svelte.ts` getter), collapsing
the currently duplicated "chalk in dark, else pen" rule into one place. Gotcha: dark mode with no
chalk must still fall back to the pen outline (the `??`), and prefetching *both* pen+chalk in dark
mode is wasteful — only the resolved one is displayed. Consider also whether the night fill
(`nightSheetUrl`) used by the magic brush deserves the same warm-up; that is a larger asset and may
be a deliberate omission worth a comment.

### [Correctness] Every page tile in a book announces the same aria-label; `ColoringPage.name` has no production reader

**File(s):** `web/src/lib/components/ColoringBook.svelte` (page-tile button, line 163);
`web/src/lib/state/books.ts` (`ColoringPage.name`, line 54) @ 9ae62ff1

**Priority:** P3

#### Problem

Line 163:

```svelte
aria-label="{activeBook.name} coloring page"
```

All six page tiles inside a book get the identical label ("Farm coloring page"): a screen-reader or
accessibility-tree consumer cannot distinguish Cat from Cow, and E2E specs cannot target a specific
page by role+name. Meanwhile every page carries a human-readable `name` field ("Cat", "T. Rex",
`books.ts` lines 174–237) that is populated for all 48 pages but — verified by grep — never read by
any production code (only the `book()` builder stores it). Under the repo's "no speculative surface"
rule, a field with no production caller is itself a smell; the aria-label is the caller it was
obviously meant to have.

#### Proposed solution

`aria-label="{page.name} coloring page"` (or `"{page.name} — {activeBook.name}"`). This fixes the
duplicate-label problem and gives `ColoringPage.name` its production reader in one line. If for some
reason the name should not be exposed, the alternative is deleting the `name` field and the second
`page(id, name)` argument — but wiring the label is clearly the better outcome for a picker grid.

### [Correctness] A failed orientation lock latches `lastRequested`, permanently suppressing same-target retries for the session

**File(s):** `web/src/lib/orientation.ts` (`applyDeviceOrientationPreference`, lines 11, 29–30,
42–46, 57) @ 9ae62ff1

**Priority:** P3

#### Problem

The dedup latch is set *before* the async lock attempt and never rolled back on failure:

```ts
if (target === lastRequested) return;
lastRequested = target;
```

Native path (lines 42–46): if `ScreenOrientation.lock()` throws (plugin not ready during a boot
race, OS transiently refuses), the catch swallows it — but `lastRequested` still holds `target`, so
every later call with the same preference short-circuits at line 29. The comment says "the setting
stays persisted for the next launch", i.e. the accepted cost is a whole relaunch, yet a one-line
rollback would recover within the session. Web path (line 57):
`orientation?.lock?.(target).catch(() => {})` — browsers commonly reject `lock()` outside
fullscreen. The user later enters fullscreen (the app has a fullscreen affordance), the preference
is re-applied from `+page.svelte` — and is silently skipped because the latch claims the lock
already took. The latch conflates "requested" with "applied".

Secondary issue: `lastRequested` is module-scope mutable `let` that is neither a pure memoization
cache nor behind a `createX()` factory (the stated convention in `CLAUDE.md`), which is also why
this module has no unit tests (see separate finding).

#### Proposed solution

Reset the latch when the attempt fails so the next call retries:

```ts
} catch {
  lastRequested = null;
}
```

on the native branch, and `orientation?.lock?.(target).catch(() => { lastRequested = null; })` on
the web branch. Alternatively restructure as `createOrientationLock()` returning `{ apply }` with
the latch inside, exported as a singleton instance for the app — which both fixes testability and
makes the latch's lifecycle explicit. Gotcha: don't retry in a loop — the latch reset only re-arms
the *next* explicit apply call, which is the right behavior.

### [Maintainability] "Reach plugin modules only via lazy import" is a prose-only contract with no drift guard

**File(s):** `web/src/lib/plugins/deviceLock.ts` (lines 9–10), `web/src/lib/plugins/pencilEraser.ts`
(lines 12–13), `web/src/lib/nativePlugin.ts` @ 9ae62ff1

**Priority:** P3

#### Problem

Both custom plugin wrappers import `@capacitor/core` at module top level and rely on a comment to
keep themselves out of the web/SSR graph:

```ts
// Reach this module only through lazyPluginModule() so @capacitor/core stays out of the
// SSR/prerender graph — see web/src/lib/nativePlugin.ts.
```

`CLAUDE.md` is explicit: "Cross-file agreement is never maintained by prose … add a drift-guard test
that reads both sides and fails on divergence. A 'keep in sync with X' comment marks a defect, not a
mitigation." Today the agreement holds only because the two call sites (`DrawingCanvas.svelte` line
191, `SetupInstructions.svelte` line ~71) happen to use `__IS_CAPACITOR__`-gated dynamic `import()`.
Nothing fails if a future change adds `import { DeviceLock } from '$lib/plugins/deviceLock'`
statically from web-reachable code — the web bundle silently grows `@capacitor/core`, and worse,
module evaluation of `registerPlugin` enters the SSR/prerender graph, the exact class of breakage
`nativePlugin.ts`'s long WHY-comment documents (the hung-promise/blank-page failure). Grep confirms
no existing guard: no script under `scripts/`, no repo-script test, and no Playwright assertion
checks the built web client for `@capacitor` chunks.

#### Proposed solution

Add a drift-guard in the pattern of `web/src/app.html.test.ts` /
`scripts/tests/android-config.test.mjs`: a node-env unit test (e.g.
`web/src/lib/plugins/pluginImportGuard.test.ts` or a repo-script test) that scans
`web/src/**/*.{ts,svelte}` (excluding `*.test.ts` and `lib/plugins/**` itself) and fails on (a) any
static `import ... from '@capacitor/...'` outside the allowed lazy sites, and (b) any static
(non-`import()`) reference to `$lib/plugins/`. A stronger complement is a post-build assertion (in
the Playwright global setup or an asset-pipeline test) that no emitted web chunk contains the string
`@capacitor`, which also covers `haptics.ts`, `storage.ts`, `orientation.ts`, and
`network.svelte.ts`'s equivalent `__IS_CAPACITOR__` gating in one sweep. The source-scan version is
cheap and catches the mistake at unit-test speed; the bundle scan is the ground truth.

### [Testing] `platform.ts`'s riskiest logic — `supportsOrientationLock`, `isStandalone`, `isIosDevice` — has zero unit coverage

**File(s):** `web/src/lib/platform.ts` (`supportsOrientationLock`, lines 112–116;
`TABLET_MIN_SIDE_PX`, line 78; `isStandalone`, lines 23–31; `isIosDevice`, lines 38–44),
`web/src/lib/platform.test.ts`, `web/src/lib/platform.osLabel.test.ts` @ 9ae62ff1

**Priority:** P3

#### Problem

The two existing test files cover only `getPlatform` (`platform.test.ts`, 28 lines) and
`osLabelFromUserAgent` (`platform.osLabel.test.ts`). Untested:

* `supportsOrientationLock()` — the most consequential function in the module. It carries a 35-line
  WHY comment (lines 79–111) explaining a subtle iPadOS-26 windowing heuristic and a named tuning
  constant `TABLET_MIN_SIDE_PX = 600`, and it gates whether orientation toggles are shown *and*
  whether `applyDeviceOrientationPreference` does anything at all (`orientation.ts` line 21). The
  `< 600` boundary, the "web always true", the "SSR false", and the "native tablet false / native
  phone true" branches are all unasserted; a regression (e.g. flipping `<` to `<=` or reading window
  instead of screen) would ship silently.
* `isStandalone()` — four OR'd display-mode probes including the iOS-legacy `navigator.standalone`;
  drives PWA-vs-tab classification in `deviceInfo.ts` and fullscreen affordances.
* `isIosDevice()` — the iPadOS-masquerading-as-Mac branch (`MacIntel` + `maxTouchPoints > 1`) is
  exactly the kind of clever check that dies quietly.

These are pure, cheaply mockable functions (`globalThis.Capacitor` stubbing is already demonstrated
in `platform.test.ts`; `matchMedia`/`screen` stubs via `vi.stubGlobal` are demonstrated in
`idle.test.ts`).

#### Proposed solution

Extend `platform.test.ts` (happy-dom env) with table-driven cases: `supportsOrientationLock` at
screen min-sides 599/600/601 for native vs web vs SSR (stub `globalThis.Capacitor.isNativePlatform`
and `window.screen` width/height getters); `isStandalone` for each display-mode query plus the
`navigator.standalone` legacy path; `isIosDevice` for iPhone UA, plain-Mac UA (false), and touch-Mac
(true). Keep `osLabel` in its node-env sibling file as-is.

### [Maintainability] `drawingSound.ts` module-scope mutable state forces tests into `vi.resetModules()` gymnastics

**File(s):** `web/src/lib/audio/drawingSound.ts` (lines 14–17),
`web/src/lib/audio/drawingSound.test.ts` (lines 10, 14–16, 85–87) @ 9ae62ff1

**Priority:** P3

#### Problem

The module keeps four mutable module-scope variables:

```ts
let audioContext: AudioContext | null = null;
let buffers: AudioBuffer[] | null = null;
let loadStarted = false;
let currentPlayback: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
```

`CLAUDE.md`'s rule: "Module-scope mutable `let` is either a pure memoization cache or lives behind a
`createX()` factory so tests get fresh instances." `audioContext` and `buffers` arguably qualify as
memo caches, but `loadStarted` and `currentPlayback` are genuine mutable state. The predicted cost
is visible in the test file: every test must `vi.resetModules()` in `afterEach` (line 10) and
re-`await import('./drawingSound')` plus re-import `settings.svelte` at the top of each test body
(lines 14–16, 85–86) to get a fresh instance — the exact friction the convention exists to prevent.
It also means `settings.svelte` state (`setSound(true)`) leaks across module resets in ways that are
easy to get subtly wrong.

#### Proposed solution

Restructure as `createDrawingSound()` returning `{ preload, play, stop }`, with the module exporting
one shared instance for production callers (`DrawingCanvas.svelte`, `SoundSection.svelte` — call
sites keep their current named-function ergonomics via
`export const { preloadDrawSounds, playDrawSound, stopDrawSound } = createDrawingSound()` or thin
wrappers). Tests then construct fresh instances directly, dropping `resetModules` and the dynamic
imports. Gotcha: keep the `AudioContext` lazily created inside the factory (constructing it at
module load would regress the suspended-context boot behavior documented at lines 30–37), and keep
the failed-preload `loadStarted = false` retry reset (lines 52–54).

### [Types] `'portrait' | 'landscape'` is re-declared in seven places instead of one shared type

**File(s):** `web/src/lib/notchBand.ts` (line 38), `web/src/lib/orientation.ts` (line 4),
`web/src/lib/state/books.ts` (line 50); also (context, other sections) `state/layout.svelte.ts:4`,
`state/canvas.svelte.ts:26`, `drawing/engine.ts:265`, `components/parent/CompactShell.svelte:29` @
9ae62ff1

**Priority:** P4

#### Problem

The same closed union is independently declared at least seven times; three of those declarations
sit in this section's files: `notchBand.ts`'s private `type Orientation`, `orientation.ts`'s
`type OrientationLockType`, and `books.ts`'s exported `BookOrientation`. The canonical exported name
(`Orientation` in `layout.svelte.ts`) lives in a rune module that pure/Node-loaded modules cannot
import at runtime — `books.ts` is executed by `scripts/strip-native-assets.mjs` under
`--experimental-strip-types`, and `notchBand.ts` deliberately keeps a no-runtime-import purity (its
lines 21–22 already resort to a type-only import for `Platform`). So each pure module minted its own
copy. The unions can't drift in *shape* (TS would flag mismatched literals at the call sites that
connect them, e.g. `ColoringBook.svelte` line 32 feeding
`canvasState.paperOrientation ?? layout.orientation` into `BookOrientation` parameters), but every
new copy adds naming noise (`Orientation` vs `OrientationLockType` vs `BookOrientation` vs inline
literals) and hides that they are one vocabulary. `BookOrientation` in particular is pure
indirection — unlike `BookPlatform` (line 49), which has a real doc comment distinguishing it from
the runtime platform, `BookOrientation` is semantically identical to viewport orientation and is
used interchangeably with it.

#### Proposed solution

Declare the union once in a tiny rune-free module (candidates: a new
`web/src/lib/orientationType.ts`, or piggyback on an existing pure module like `safeArea.ts`),
`export type Orientation = 'portrait' | 'landscape'`, and re-point the section's three declarations
at it via `import type` (erased at build, so Node-script and pure-layer constraints are preserved;
`layout.svelte.ts` can re-export it for its existing importers). Keep `BookOrientation` as an alias
(`export type BookOrientation = Orientation`) only if churn on `books.ts`'s many usages is a concern
— otherwise rename through. Tradeoff: one more micro-module; the payoff is grepability (one
definition to find) and ending the per-file re-derivation.

### [Testing] `coloringBook.svelte.test.ts` hosts `books.ts` tests, duplicating `books.test.ts` coverage

**File(s):** `web/src/lib/state/coloringBook.svelte.test.ts` (lines 56–76, 98–128),
`web/src/lib/state/books.test.ts` @ 9ae62ff1

**Priority:** P4

#### Problem

The file named for the rune-state module spends a third of its lines testing `books.ts` exports with
no `coloringBook.svelte.ts` involvement:

* Lines 56–63 ("the colored fill is derived from the line-art path") and the derivation halves of
  lines 65–76 assert `page.colorImages`/`nightImages` path shapes — pure catalog facts.
* The entire `describe('book asset manifest')` block (lines 98–128) tests `bookAssetPaths` — and
  overlaps directly with `books.test.ts`'s own `bookAssetPaths` describe (lines 59–116):
  "bookAssetPaths lists each page and its colored fill" (coloringBook test, lines 99–114) re-asserts
  what "lists the cover, both orientations of every page, and the colored fills" (books test, lines
  70–79) already covers.

Consequences: a `books.ts` regression fails in two files with different framings; anyone extending
catalog coverage must discover the split; and the catalog assertions in
`coloringBook.svelte.test.ts` run under the more expensive default happy-dom environment (needed for
the rune half of the file) when `books.test.ts` is already `@vitest-environment node` — exactly the
per-file fixed cost `.claude/rules/testing.md` calls the suite's biggest.

#### Proposed solution

Move lines 56–76's derivation assertions and the lines 98–128 manifest describe into `books.test.ts`
(merging with the existing `bookAssetPaths` describe, dropping the duplicated assertions), leaving
`coloringBook.svelte.test.ts` to test only the overlay-state behavior (set/clear/orientation-switch
through the four URL getters). Net effect: one home per module's tests, and the catalog suite stays
in the cheap node environment.

### [Testing] `drawingSound.test.ts`'s first test bundles four behaviors behind one name, with heavy duplicated scaffolding

**File(s):** `web/src/lib/audio/drawingSound.test.ts` (lines 13–82; scaffolding duplication 17–54 vs
88–124) @ 9ae62ff1

**Priority:** P4

#### Problem

The test named "ramps to the base scratch gain at normal volume and full speed" actually asserts, in
sequence: (1) preload fires one fetch per sound URL on stroke start (line 63), (2) a failed load is
not re-fetched mid-stroke (lines 65–69), (3) a later stroke start retries the failed load (lines
72–74), and (4) the gain ramp lands at `0.2` / `4.06` (lines 76–81). `.claude/rules/testing.md`:
"One behavior per test: a spec accumulating assertion clusters across behaviors gets split." When
assertion 3 fails, the name says nothing about retry semantics — the diagnosis cost the rule exists
to avoid. Additionally, ~40 lines of mock plumbing (gain node, source node, `AudioContext` class
stub, fetch stub — lines 17–54) are copy-pasted nearly verbatim into the second test (lines 88–124),
differing only in `disconnect` on the source node and the failing-fetch toggle.

#### Proposed solution

Extract a builder, e.g. `function makeAudioMocks({ failFetch = false } = {})` returning
`{ gainNode, sourceNode, fetchMock, install() }`, then split the mega-test into three: "preload
fetches each sound once per stroke start", "a failed preload is retried on the next stroke start"
(assertions 1–3), and "ramps to the base scratch gain at full speed" (assertion 4, which only needs
the happy-path mocks). Tests re-deriving `0.2`/`4.06` from `BASE_SCRATCH_GAIN`/`GAIN_RAMP_S` inline
is acceptable (tests are exempt from the import-the-constant rule) but a short comment naming the
constants would help. If the factory refactor from the `drawingSound.ts` finding lands first, the
`resetModules` dance disappears too and this cleanup gets simpler.

### [Maintainability] `ColoringBook` branches on runtime `isNative()` for a build-time fact

**File(s):** `web/src/lib/components/ColoringBook.svelte` (line 24) @ 9ae62ff1

**Priority:** P4

#### Problem

```svelte
const books = booksForPlatform(isNative() ? 'mobile' : 'web');
```

Which distribution catalog applies is a build-time fact: the native app is exactly the
`CAPACITOR=true` static export, and the strip script this line must agree with
(`scripts/strip-native-assets.mjs`, invoked only in `build:cap`) keys off the same build.
`CLAUDE.md` is categorical: "The `CAPACITOR=true` env var at build time is the single signal for all
web-vs-native branching … Do not add runtime platform branches that could be build-time branches
instead," and `web/src/CLAUDE.md` repeats it ("prefer `__IS_CAPACITOR__` over a runtime `isNative()`
for build-time platform branches"). Sibling code in the same component tree follows the rule
(`DrawingCanvas.svelte` line 189 gates on `__IS_CAPACITOR__ && isNative()`). Beyond convention
consistency, the runtime check has a real skew: a web deployment where the `Capacitor` global
somehow evaluates truthy-native (or a future embedding) would silently hide web-licensed books whose
assets *are* present, while a native build always has the web-only assets stripped regardless of
what `isNative()` returns.

#### Proposed solution

`const books = booksForPlatform(__IS_CAPACITOR__ ? 'mobile' : 'web');` — this also lets the comment
above it (lines 21–23, "this filter and that strip must agree") point at the shared build signal
rather than a runtime proxy for it. No tree-shaking win here (both catalogs come from the same
`BOOKS` array), so the change is purely about using the declared single signal.

### [Correctness] `measureSafeAreaInsets` silently returns garbage if its cached probe is ever detached

**File(s):** `web/src/lib/safeArea.ts` (`measureSafeAreaInsets`, lines 16–37) @ 9ae62ff1

**Priority:** P4

#### Problem

The probe `<div>` is created once, appended to `document.body`, and cached in module state forever
(lines 20–27). `getBoundingClientRect()` on a *detached* element returns an all-zero rect, so if
anything ever removes the probe from the DOM — a full-body re-render, test DOM cleanup between
happy-dom cases, a future migration that replaces `document.body` content — the function keeps
"working" but returns `{ top: 0, right: clientWidth, bottom: clientHeight, left: 0 }`: a fabricated
right/bottom inset the size of the whole viewport. Downstream, `layout.svelte.ts`'s `syncViewport()`
(line 61) would push those insets into every consumer (edge-swipe guard bands, notch band,
action-button layout) on the next resize with no error anywhere. The failure mode is silent and
bizarre-looking at the UI layer, which makes it expensive to trace back here.

#### Proposed solution

One-line hardening: treat a disconnected probe as absent —

```ts
if (!safeAreaProbe?.isConnected) {
  safeAreaProbe = document.createElement('div');
  ...
  document.body.appendChild(safeAreaProbe);
}
```

`isConnected` is universally supported far below the repo's browser floor. `safeArea.test.ts` can
pin it with a case that removes the probe (`probe.remove()`) and asserts a re-append plus correct
values on the next call.

### [Architecture] `armHoverOnMouseMove` is a Svelte action defined inline in a component

**File(s):** `web/src/lib/components/ColoringBook.svelte` (lines 75–92, usage line 108) @ 9ae62ff1

**Priority:** P4

#### Problem

Lines 81–92 define hover-arming as a hand-rolled action inside the component:

```svelte
let hoverArmed = $state(false);
function armHoverOnMouseMove(node: HTMLElement) {
  function onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') hoverArmed = true;
  }
  node.addEventListener('pointermove', onMove);
  return { destroy: () => node.removeEventListener('pointermove', onMove) };
}
```

`.claude/rules/svelte.md`: "Complex gestures and dialog wiring are Svelte actions in
`src/lib/actions/` … not inline component logic." This is precisely a pointer-interaction action (it
exists to defeat the tile-appears-under-a-stationary-finger `:hover` misfire documented at lines
75–80 — a device-behavior workaround, not ColoringBook-specific logic). Living inline, it is
invisible to the next component that hits the same `:hover`-on-touch problem (any modal grid — the
Parent Center's tile-like controls are plausible next customers), and its behavior (mouse-only
arming, per-view reset) is untestable except through E2E. It also has a subtle contract with
`showView()` (line 89–92 resets `hoverArmed`) that is easy to miss when reading the template.

#### Proposed solution

Move it to `web/src/lib/actions/armHover.ts` as
`export function armHoverOnMouseMove(node: HTMLElement, onArm: () => void)` (or return-arming via a
callback param so the component keeps owning the `$state`), with a colocated unit test dispatching
`pointermove` with `pointerType: 'mouse'` vs `'touch'`. Keep the excellent WHY comment with the
action. Counter-consideration: with a single consumer today, "no speculative surface" argues for
minimalism — so move it as-is (same signature, one consumer) rather than generalizing; the placement
rule, not reuse, is the driver.

### [Testing] `orientation.ts` has zero unit tests despite branchy, convention-relevant logic

**File(s):** `web/src/lib/orientation.ts` (whole module, 58 lines) @ 9ae62ff1

**Priority:** P4

#### Problem

There is no `orientation.test.ts`. The module contains: target computation from two booleans (lines
23–27 — a nested ternary mapping to three states), the `lastRequested` dedup latch (lines 29–30),
the `supportsOrientationLock()` early-out (line 21), a native plugin path with error swallowing
(lines 37–47), and a web `screen.orientation` fallback with optional-chained lock/unlock (lines
52–57). Its only coverage is `boot/persistedState.test.ts` asserting it was *called* with certain
arguments (line 80) — nothing asserts what it does. The latch behavior (including the
failure-latching defect filed separately) is exactly the kind of logic a unit test would have
caught, and the module-scope `let` is what makes testing awkward today: a second test case inherits
the first case's latch state with no reset seam.

#### Proposed solution

Alongside the latch fix, restructure for testability (a `createOrientationLock()` factory or an
injected `lock`/`unlock` pair) and add node/happy-dom tests: target mapping (locked+landscape →
'landscape', locked+!landscape → 'portrait', unlocked), dedup (second same-target call performs no
lock call), latch reset on failure, `supportsOrientationLock() === false` short-circuit (mock via
`vi.mock('$lib/platform')` as `pencilEraser.test.ts` already demonstrates), and the web `unlock()`
path.

### [Types] Dead `?? platform` fallback on a total `Record<Platform, string>` lookup

**File(s):** `web/src/lib/deviceInfo.ts` (line 52; `PLATFORM_LABEL`, line 7) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
platform: PLATFORM_LABEL[platform] ?? platform,
```

`platform` is the closed union `Platform` (`'android' | 'ios' | 'web'`) returned by `getPlatform()`,
and `PLATFORM_LABEL` is `Record<Platform, string>` — a total map. The `?? platform` arm can never
execute; TypeScript types the indexed access as `string`, so the `??` isn't even flagged as
unnecessary, but it reads as if unlabeled platforms were possible, undermining the closed-union
guarantee the repo's conventions work hard to establish ("never bare `string` … plus a runtime
fallback"). `getPlatform()` itself already funnels every unexpected value to `'web'` (platform.ts
lines 71–75), which is the single sanctioned boundary.

#### Proposed solution

`platform: PLATFORM_LABEL[platform],` — delete the fallback. If a future `Platform` member is added,
the `Record` type errors at `PLATFORM_LABEL`'s declaration until a label is provided, which is the
intended failure mode.

### [Readability] `isStandalone` spells out three identical `matchMedia` probes

**File(s):** `web/src/lib/platform.ts` (`isStandalone`, lines 23–31) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
return !!(
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: fullscreen)').matches
  || window.matchMedia?.('(display-mode: minimal-ui)').matches
  || (window.navigator as { standalone?: boolean }).standalone === true
);
```

Three structurally identical probes differ only in the mode keyword; the set of "app-like display
modes" is an implicit vocabulary buried in string literals, and adding `window-controls-overlay` (or
reordering) means editing copy-pasted lines. Minor, but the repo's closed-value-set convention
suggests naming the set.

#### Proposed solution

```ts
const APP_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'] as const;
...
return (
  APP_DISPLAY_MODES.some((mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches) ||
  (window.navigator as { standalone?: boolean }).standalone === true
);
```

Behavior-identical (`some` on an empty/false chain short-circuits the same way); the doc comment's
"any app-like display mode" phrase now has a named referent.

### [Maintainability] `coloringBook.svelte.ts` re-exports `booksForPlatform`, creating a second import path for one symbol

**File(s):** `web/src/lib/state/coloringBook.svelte.ts` (line 11),
`web/src/lib/components/ColoringBook.svelte` (lines 4–13) @ 9ae62ff1

**Priority:** P5

#### Problem

Line 11:

```ts
export { booksForPlatform } from './books';
```

The only consumer, `ColoringBook.svelte`, imports `booksForPlatform` from
`$lib/state/coloringBook.svelte` (line 5) while importing four other catalog symbols (`pageImage`,
`pageThumb`, `thumbPath`, types) directly from `$lib/state/books` (line 13) — the same underlying
module reached through two paths in one import block. The re-export adds nothing (no rune wrapping,
no state involvement — `booksForPlatform` is a pure catalog filter) and costs grepability: a search
for who uses `books.ts`'s API must now also trace the pass-through, and a reader of the import block
reasonably (and wrongly) infers the platform filter is state-coupled while the path helpers aren't.

#### Proposed solution

Delete line 11 and move `booksForPlatform` into the existing `$lib/state/books` import in
`ColoringBook.svelte`. One symbol, one home, one import path.

### [Readability] `bookAssetPaths` duplicates the optional-orientation-asset collection for night fills and chalk outlines

**File(s):** `web/src/lib/state/books.ts` (`bookAssetPaths`, lines 308–315) @ 9ae62ff1

**Priority:** P5

#### Problem

Two blocks are identical except for the field name:

```ts
const nightFills = book.pages.flatMap((page) =>
  ALL_ORIENTATIONS.map((o) => page.nightImages[o]).filter((p): p is string => !!p)
);
...
const chalkOutlines = book.pages.flatMap((page) =>
  ALL_ORIENTATIONS.map((o) => page.chalkImages[o]).filter((p): p is string => !!p)
);
```

The `map`+type-narrowing-`filter` idiom is the noisiest part of the function and is written twice; a
third optional asset variant (a plausible future — e.g. cover chalk, which the comments at lines
32–33 anticipate) would make it three.

#### Proposed solution

```ts
function presentOrientationAssets(
  pages: ColoringPage[],
  key: 'nightImages' | 'chalkImages',
): string[] {
  return pages.flatMap((page) =>
    ALL_ORIENTATIONS.map((o) => page[key][o]).filter((p): p is string => !!p)
  );
}
```

then `const nightFills = presentOrientationAssets(book.pages, 'nightImages');` etc. The per-block
WHY comments (lines 306–312) stay, attached to the call sites.

### [Maintainability] `scheduleIdle`'s two branches have divergent latency guarantees

**File(s):** `web/src/lib/idle.ts` (lines 6–13) @ 9ae62ff1

**Priority:** P5

#### Problem

On Safari/iOS the fallback guarantees the callback runs at `IDLE_FALLBACK_MS = 200`; on Chromium,
`requestIdleCallback(fn)` with no `timeout` option can be starved indefinitely while the main thread
stays busy — and this app's core interaction (continuous stroking on a canvas) is exactly a
sustained-busy workload. Consumers assume "soon after idle": `DrawingCanvas` defers the
pencil-eraser bridge (line 195) and the 357 KB sound preload (line 220), `bootHiddenOverlays` pumps
overlay mounts through chained `scheduleIdle` calls. A child who starts drawing immediately and
continuously can postpone those arbitrarily on Chromium while a Safari user gets them at 200 ms —
the two engines get materially different behavior from one helper whose comment ("a short timeout
that still lands after first paint") implies a bounded delay. The sound path self-heals
(`playDrawSound` preloads on pointerdown), but the overlay pump and the pencil bridge do not.

#### Proposed solution

Pass a deadline: `requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS })` with a named constant (a
couple of seconds fits "idle work that must still happen"), documenting that both branches now bound
worst-case latency. Tradeoff: a timeout-fired callback runs even when genuinely busy, briefly
competing with a stroke — pick a timeout long enough that this is a rare fallback, or accept the
current unbounded behavior explicitly with a WHY comment saying starvation is acceptable for every
current caller (which would also satisfy the convention — today the divergence is undocumented).

### [Readability] Dead `coloring-remove-tile` class on the Clear Page tile

**File(s):** `web/src/lib/components/ColoringBook.svelte` (line 123) @ 9ae62ff1

**Priority:** P5

#### Problem

```svelte
class="coloring-tile coloring-book-tile coloring-remove-tile"
```

Grep across `web/` finds no `.coloring-remove-tile` selector in this component's `<style>` block, no
global stylesheet rule, and no test referencing it — the class is attached to nothing. Svelte's
unused-CSS warning only fires for the inverse case (selector without markup), so this rots silently;
a reader hunting for the tile's styling burns time confirming the class does nothing.

#### Proposed solution

Delete the class from the markup. If a distinct hook for the Clear Page tile is wanted later
(styling or test targeting), reintroduce it together with its consumer; today
`aria-label="Clear Page"` is already the stable test handle.

### [Maintainability] `handleDoubleTap` is exported only for tests without the required seam comment

**File(s):** `web/src/lib/plugins/pencilEraser.ts` (`handleDoubleTap`, line 25) @ 9ae62ff1

**Priority:** P5

#### Problem

`handleDoubleTap` is exported, but its only production caller is inside the same module
(`initPencilEraser` passes it to `PencilEraser.addListener`, line 40); the sole external importer is
`pencilEraser.test.ts` (line 18), which drives it directly to unit-test the toggle/record logic
without the native bridge. `CLAUDE.md`: "a seam kept only for tests gets a comment saying so at the
declaration." The existing comment (lines 21–24) documents behavior thoroughly but never says the
export exists for tests, so a reader auditing the module's public surface can't tell whether
removing `export` would break production code.

#### Proposed solution

Append one line to the declaration comment, e.g. "Exported for unit tests — production code reaches
it only through the addListener subscription in initPencilEraser." (matching how other test seams in
the repo are annotated). Alternative — testing through `initPencilEraser` with a mocked plugin — is
strictly worse: the direct seam is the right design, it just needs its label.

# Audit — tools/asset-gen — bin (pipeline CLIs)

## Source: Code audit — tools/asset-gen — bin (pipeline CLIs)

### [Maintainability] Extract the triplicated arg→target resolver (`resolveArg` + glob-under helper) into `lib/`

**File(s):** `tools/asset-gen/bin/audit-invented-shapes.mjs` (`targetsUnder`/`resolveArg`, lines
94–122), `tools/asset-gen/bin/audit-night-halo.mjs` (`pagesUnder`/`resolveArg`, lines 72–89),
`tools/asset-gen/bin/punch-fill-outlines.mjs` (`rawsUnder`/`resolveArg`, lines 29–62) @ 9ae62ff1

**Priority:** P2

#### Problem

Three bins hand-roll the same CLI-arg resolution — "an arg is a page or a category dir; empty args =
whole catalog; unknown arg = `fail()`" — each against a different filename suffix, when the repo
already centralizes exactly this shape for outlines in `tools/asset-gen/lib/outline-targets.mjs`
(`resolveOutlineTargets`, used by six other bins).

`audit-invented-shapes.mjs:94–122`:

```js
async function targetsUnder(sub = '') {
  const cwd = sub ? join(FILL_SRC_DIR, sub) : FILL_SRC_DIR;
  const out = [];
  for await (const entry of glob('**/*.{light,night}.raw.webp', { cwd })) { ... }
  ...
}
async function resolveArg(arg) { ... existsSync file → [target]; existsSync dir → targetsUnder(arg); else fail(...) }
const targets = (positionals.length ? (await Promise.all(positionals.map(resolveArg))).flat() : await targetsUnder()).sort(...)
```

`audit-night-halo.mjs:72–89` is the same skeleton over `COLORING_DIR` + `**/*.night.webp`;
`punch-fill-outlines.mjs:29–62` the same over `FILL_SRC_DIR` + `**/*.raw.webp` (with a prefix-match
twist at lines 39–43). All three re-implement the `existsSync`-file / `existsSync`+`statSync`-dir /
fail branching that `resolveOutlineTargets` already encapsulates and *tests*
(`tests/outline-targets.test.mjs`). The three copies have zero test coverage
(`tests/audit-cli.test.mjs:120–123` covers only `check-coloring-drift`, `audit-fill-eyes`,
`audit-outline-solidity`, `audit-golden`), and each future suffix-shaped bin (this section grew
three of these in one era) will clone the pattern again.

#### Proposed solution

Add a generalized `resolveSuffixTargets(args, { root, pattern, toTarget, onMissing })` to
`lib/outline-targets.mjs` (or a sibling `lib/suffix-targets.mjs`), returning the resolved absolute
paths plus whatever per-target metadata the caller derives (the invented-shapes bin needs
`{ page, theme }` — a `toTarget(relPath)` mapper covers it). Reimplement the three bins' resolvers
on top of it and extend `tests/outline-targets.test.mjs` to cover the new helper. Gotcha:
`punch-fill-outlines`' arg form matches a *prefix* (`nature/ant-wide` → both `.light` and `.night`
raws) rather than an exact file, so the helper needs either a prefix mode or a caller-supplied
candidate-file probe; don't force the three into a shape that loses that behavior.

---

### [Maintainability] Name and centralize the retry temperature-ladder literals (step 0.15, sample spread 0.12, cap 2)

**File(s):** `tools/asset-gen/bin/gen-coloring-chalk.mjs` (line 346),
`tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (lines 234, 346),
`tools/asset-gen/bin/gen-coloring-fills.mjs` (lines 144, 153),
`tools/asset-gen/bin/gen-coloring-outlines-fresh.mjs` (line 149),
`tools/asset-gen/bin/normalize-outline-strokes.mjs` (line 239) @ 9ae62ff1

**Priority:** P2

#### Problem

The keep-best-of-N retry loops all escalate temperature with the same inline arithmetic:

```js
const temperature = Math.min(2, cfg.baseTemp + attempt * 0.15); // chalk:346, normalize:239
const temperature = Math.min(2, temp0 + (attempt - 1) * 0.15); // dark:234
const temperature = Math.min(2, baseTempForSlot(slot) + attempt * 0.15); // fills:153
const temperature = Math.min(2, baseTemp + attempt * 0.1); // fresh:149
```

and two generators spread multi-sample base temperatures by the same `0.12` (`fills:144`
`0.55 + i * 0.12`, `dark:346` `cfg.baseTemp + i * 0.12`). The `0.15` retry step and `0.12` sample
spread are textbook tuning literals under the repo rule "a numeric literal that encodes a tunable
decision … gets a named module-scope constant"; today they're repeated in four files with no name
and no WHY. The `2` cap is worse: it must agree with `parseTemperature`'s validation bound in
`lib/cli.mjs:41` (`value >= 0 && value <= 2` — the Gemini API's range), a cross-file agreement
currently maintained by repetition in six places, which the repo conventions say is a defect.
(`fresh`'s `0.1` step may or may not be a deliberate divergence — nothing records which.)

This is distinct from issue \#566, which covers `MODEL`, `WEBP_QUALITY`, and timeout constants only.

#### Proposed solution

In `lib/cli.mjs` (next to `MAX_ATTEMPTS` and `parseTemperature`, which already own the temperature
contract) export `TEMPERATURE_MAX = 2` (used by `parseTemperature` too), `RETRY_TEMP_STEP = 0.15`,
and `SAMPLE_TEMP_SPREAD = 0.12`, each with the WHY on the constant, plus a one-liner
`retryTemperature(base, attempt)` = `Math.min(TEMPERATURE_MAX, base + attempt * RETRY_TEMP_STEP)`.
Update the five generators to call it (fresh either adopts the shared step or keeps its own named
`FRESH_RETRY_TEMP_STEP = 0.1` with a comment explaining the divergence). Deliberately do *not* try
to extract the whole keep-best-of-N loop — the loops differ structurally (dark keeps a dual
`best`/`bestAccept`, fills tracks overlay separately), and forcing one skeleton would obscure them.

---

### [Correctness] `audit-night-halo` and `audit-invented-shapes` have no per-page error handling — one bad file aborts the whole catalog run

**File(s):** `tools/asset-gen/bin/audit-night-halo.mjs` (page loop, lines 93–99; `auditPage`, lines
41–63), `tools/asset-gen/bin/audit-invented-shapes.mjs` (page loop, lines 128–163) @ 9ae62ff1

**Priority:** P3

#### Problem

Every other catalog audit wraps its per-page work in try/catch, logs `` `${rel}  ERROR (…)` ``,
counts the error, and continues (`audit-fill-eyes.mjs:43–79`, `audit-outline-solidity.mjs:30–48`,
`check-coloring-drift.mjs:55–68`, `audit-golden.mjs:152–162`). These two don't:

```js
// audit-night-halo.mjs:93-95
for (const page of pages) {
  const r = await auditPage(page);   // readFile of the raw at :42 throws if fill-src is missing/corrupt
```

`auditPage` unconditionally reads `${page}.night.raw.webp` from `FILL_SRC_DIR` (line 42) even though
pages are enumerated from the *shipped* `**/*.night.webp` (line 75) — a shipped night fill whose raw
was deleted or never committed makes the whole ~50 s catalog run die mid-loop with a bare ENOENT and
no page-ranked output at all. Same for a corrupt webp in `audit-invented-shapes`' loop
(`readFile`/`detectInventedShapes`, lines 132–135). For tools whose whole point is a full-catalog
ranking, losing the 90 good pages to one bad file is the wrong failure shape, and it's inconsistent
with the section's own established pattern.

#### Proposed solution

Mirror the sibling audits: wrap each page body in try/catch, `console.error(`${page} ERROR (…)`)`,
increment an `errors` counter, continue, and set `process.exitCode = 1` at the end when `errors > 0`
(night-halo currently has no failure exit path at all — it's a ranking, but an errored page should
still fail the run so CI-adjacent use can't silently skip pages).

---

### [Readability] Bare discarded `chalkSettings(values)` / `nightSettings(values)` / `normalizeSettings(values)` calls hide the fail-fast intent

**File(s):** `tools/asset-gen/bin/gen-coloring-chalk.mjs` (line 222),
`tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (line 201),
`tools/asset-gen/bin/normalize-outline-strokes.mjs` (line 95) @ 9ae62ff1

**Priority:** P3

#### Problem

Each of the three registry-aware generators calls its settings builder once at module scope and
throws the result away:

```js
chalkSettings(values); // gen-coloring-chalk.mjs:222
nightSettings(values); // gen-coloring-fills-dark.mjs:201
normalizeSettings(values); // normalize-outline-strokes.mjs:95
```

The purpose — validate the raw CLI flags and `fail()` before any page work or API client
construction, since the real per-page call happens later with registry-merged values (`chalk:278`,
`dark:308`, `normalize:170`) — is completely invisible. A first-time reader sees a no-op expression
statement; a well-meaning cleanup would delete it and silently defer flag validation until mid-run
(after the first pages have already burned paid API calls in the multi-page case). The repo bans
comments unless the WHY is non-obvious — this is exactly the non-obvious case, and the better fix is
a name, not a comment.

#### Proposed solution

Make the intent the identifier. Either rename the discarded call site to a dedicated wrapper, e.g.
`validateCliFlags(values)` defined as `const validateCliFlags = (v) => void chalkSettings(v);` with
the WHY on it — or, simpler, keep one shared line in each file:

```js
chalkSettings(values); // fail fast on malformed CLI flags before any page/API work
```

The named-wrapper variant is preferred (`no comments` convention); it also gives the three files an
identical greppable seam.

---

### [Maintainability] `audit-invented-shapes` re-derives the FLAG/wash classification inline, duplicating `lib/invented-shapes.mjs`' decision logic

**File(s):** `tools/asset-gen/bin/audit-invented-shapes.mjs` (verbose annotation, lines 147–157) @
9ae62ff1

**Priority:** P3

#### Problem

The `--verbose` per-blob annotation re-implements the classifier's predicate instead of asking the
classifier:

```js
// bin, lines 152-156
b.area >= MIN_BLOB && b.area <= MAX_BLOB && b.anchorFrac < ANCHOR_MAX
  ? '  << FLAG'
  : b.area > MAX_BLOB && b.anchorFrac < ANCHOR_MAX
  ? '  (wash)'
  : '';
```

is a literal copy of `lib/invented-shapes.mjs:168–171`:

```js
const flagged = blobs.filter((b) =>
  b.area >= MIN_BLOB && b.area <= MAX_BLOB && b.anchorFrac < ANCHOR_MAX
);
const washes = blobs.filter((b) => b.area > MAX_BLOB && b.anchorFrac < ANCHOR_MAX);
```

The repo rule is that cross-file agreement is never maintained by prose *or re-derivation*: if the
lib ever adds a condition (e.g. the `borderPx` stat it already computes), the verbose labels will
silently disagree with the actual `flagged`/`washes` sets while still looking authoritative. It's
also the only reason the bin imports `MIN_BLOB`/`MAX_BLOB`/`ANCHOR_MAX` at all (line 38–40;
`MIN_BLOB` is also used in the summary line 141–144).

#### Proposed solution

`flagged` and `washes` are filtered subsets of the same `blobs` objects, so identity membership is
exact: label with `res.flagged.includes(b) ? '  << FLAG' : res.washes.includes(b) ? '  (wash)' : ''`
(or build `Set`s once above the loop). Then drop the now-unneeded `MAX_BLOB`/`ANCHOR_MAX` imports.

---

### [Readability] `gen-coloring-chalk` and `normalize-outline-strokes` per-page loop bodies are ~130–145 lines of staged work — extract the stages

**File(s):** `tools/asset-gen/bin/gen-coloring-chalk.mjs` (page loop, lines 273–405),
`tools/asset-gen/bin/normalize-outline-strokes.mjs` (page loop, lines 166–308) @ 9ae62ff1

**Priority:** P3

#### Problem

Both generators run one giant `for (const page of pages)` body whose stages are marked by prose
comments — exactly the "numbered step comments … are the signal to extract each step into a named
helper" pattern the repo conventions call out. In `gen-coloring-chalk.mjs` the body covers: lever
resolution (274–289), skip checks (290–298), reference preparation
(`penSolidity`/`keepReference`/`displayInput`, 299–309), eye-reference load (313–318), a nested
`score` closure (319–334), the rescore-vs-generate branch and retry loop (336–364),
sample/display/overlay writes (366–373), warn-line assembly (375–392), and the `--apply` gate
(394–404). `normalize-outline-strokes.mjs` has the same shape plus a nested `whitenEyeInteriors`
closure (207–226) re-created per page. Nested closures capturing half a dozen loop locals (`score`
captures `keepReference`, `pen`, `lightEyes`) make the data flow hard to trace, and the twin files'
parallel structure is invisible because everything is inlined differently in each.

#### Proposed solution

Extract per-file named helpers so the loop reads as its stages, e.g. for chalk:

```js
async function prepareChalkReferences(pen) -> { keepReference, displayInput, width, height, lightEyes }
async function scoreChalkCandidate(candidate, refs, shift, attempt) -> cand
async function generateBestChalk(refs, cfg) -> { best, overlay }
function chalkWarnings(best, cfg) -> string[]
```

and the analogous set for normalize (`whitenEyeInteriors(buf, overDeep)` becomes a top-level
function taking the rings explicitly). No behavior change; the win is that the retry loop and the
`--apply` gate each fit on a screen and the two generators' shared shape becomes greppable.

---

### [Performance] Catalog audits run one page at a time; `audit-golden`'s worker pool should be a shared lib helper

**File(s):** `tools/asset-gen/bin/audit-golden.mjs` (inline pool, lines 146–165; `CONCURRENCY`, line
56), `tools/asset-gen/bin/audit-night-halo.mjs` (serial loop, lines 93–99),
`tools/asset-gen/bin/audit-fill-eyes.mjs` (lines 39–80),
`tools/asset-gen/bin/check-coloring-drift.mjs` (lines 51–69),
`tools/asset-gen/bin/audit-invented-shapes.mjs` (lines 128–163) @ 9ae62ff1

**Priority:** P3

#### Problem

`audit-golden.mjs` hand-rolls a 4-worker pool with a shared `next` cursor (lines 149–165) because
scoring ~94 pages serially is slow (~1 min per the root CLAUDE.md). The other catalog audits do the
identical per-page sharp-decode work but strictly serially — `audit-night-halo`'s own header comment
(line 8) prices itself at "~0.5 s/page, ~50 s catalog", which the same 4-way pool would cut to ~13
s; `audit-fill-eyes` decodes up to four images per page (source, light, night, chalk composite) in
sequence. These audits are run repeatedly during regen iterations, so wall-clock matters. Meanwhile
the pool implementation itself is inline anonymous machinery inside `scoreCatalog` — un-reusable and
untested.

#### Proposed solution

Extract `audit-golden`'s pool to `lib/` as e.g. `mapConcurrent(items, limit, fn)` returning results
in input order (collect into an array by index; the `erroredPages` bookkeeping stays with the
caller), unit-test it, and adopt it in the serial audits. Gotcha: the serial audits print
progressively per page — either buffer each page's line and flush in order (what `audit-golden`
effectively does by sorting at the end), or let `audit-night-halo` keep streaming to stderr
out-of-order since its stdout table is sorted post-hoc anyway. Sharp's own libuv thread pool means
diminishing returns past ~4 workers; keep `CONCURRENCY = 4` as the shared named default.

---

### [Architecture] `review-orb-eyes` defaults its output to the repo root, outside the gitignored review-scratch dirs

**File(s):** `tools/asset-gen/bin/review-orb-eyes.mjs` (line 28) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
const OUT = values.out ?? join(REPO_ROOT, 'orb-review.html');
```

Every other review artifact in this section lands in the gitignored samples dirs
(`.coloring-samples/`, `.coloring-samples-dark/` — `.gitignore:204–205`): `check-coloring-drift`
overlays go to `SAMPLES_DIR/drift`, `audit-invented-shapes` overlays to
`SAMPLES_DIR/invented-shapes`, the proof sheet to `SAMPLES_DIR/coloring-book-proof-sheet.html`
(`gen-coloring-book-proof-sheet.mjs:67`). The folder's CLAUDE.md states generators write "review
scratch into the gitignored `.coloring-samples*/`". `orb-review.html` at the repo root is not
covered by any `.gitignore` pattern, so the default invocation
(`npm run gen:coloring-fills:audit:eyes:review`, `package.json:83`) dirties the working tree with an
untracked file that `git add -A` in an unrelated commit would happily pick up.

#### Proposed solution

Default to `join(SAMPLES_DIR, 'orb-review.html')` (add `SAMPLES_DIR` to the existing
`../lib/paths.mjs` import on line 18). `--out` already exists for anyone who wants it elsewhere.

---

### [Maintainability] `judgeChalkEyes`' bright-core cutoff `180` is an unnamed tuning literal beside two named ones

**File(s):** `tools/asset-gen/bin/gen-coloring-chalk.mjs` (`judgeChalkEyes`, line 164) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
if (ref.coreLuma <= EYE_DARK_MAX && chalkCore.coreLuma < EYE_LIGHT_MIN) pupilsInked++;
if (ref.coreLuma >= 180 && chalkCore.coreLuma > EYE_DARK_MAX) whitesMissed++;
```

Line 163 gates on two imported, named thresholds from `lib/eye-fill.mjs` (`EYE_DARK_MAX`,
`EYE_LIGHT_MIN`), but line 164's `180` — the luma above which a light-fill eye core counts as
"painted bright" (a catchlight/white that the chalk should ink) — is a bare literal. It encodes a
tunable classification decision on the same 0–255 luma scale as its named neighbors, so per the repo
rule it needs a name and the WHY. Note issue \#572 tracks reconciling luma *definitions* across
classifiers; this is a different gap (an unnamed threshold, not a divergent formula), so it isn't
covered there.

#### Proposed solution

`const BRIGHT_CORE_LUMA_MIN = 180;` at module scope (near `PEN_SLACK`/`BG_SLACK`, lines 90–100) with
a comment tying it to the light-raw reference model ("a core the light fill paints at/above this
luma is an eye white/catchlight the chalk should own"). If `lib/eye-fill.mjs` already has a
semantically-equivalent bright bar, import that instead of minting a new one.

---

### [Maintainability] Manifest lines parsed by magic slice offsets `66`/`64`

**File(s):** `tools/asset-gen/bin/gen-asset-manifest.mjs` (lines 71–76) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const want = new Map(
  committed
    .split('\n')
    .filter(Boolean)
    .map((line) => [line.slice(66), line.slice(0, 64)]),
);
```

The `64` (sha256 hex length) and `66` (hash + the two-space separator of the `sha256sum` format) are
unexplained offsets that must agree with `render()`'s `` `${hash}  ${path}` `` template on line 51 —
an intra-file agreement maintained by arithmetic the reader has to reconstruct. A hand-edited
manifest line with a single space (or a CRLF checkout) silently produces a corrupted path key and
reports every asset as ADDED/REMOVED rather than failing loudly on the malformed line.

#### Proposed solution

Name the format once and parse with it: `const MANIFEST_LINE = /^([0-9a-f]{64})  (.+)$/;` — `render`
keeps its template, the check mode maps each line through the regex and `fail()`s on a non-matching
line (naming the line number). This both removes the magic offsets and upgrades silent corruption
into a diagnosable error.

---

### [Maintainability] The 16 MB Artifact cap is written three times in the proof-sheet generator

**File(s):** `tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs` (lines 50, 55, 240–244) @
9ae62ff1

**Priority:** P4

#### Problem

The Artifact upload cap appears as prose in two `fail()` messages ("the Artifact cap is 16 MB", line
50; "exceeds the 16 MB Artifact cap", line 55) and as arithmetic in the final size check:

```js
if (bytes > 16 * 1024 * 1024) {
  console.warn('⚠ exceeds the 16 MB Artifact cap — build focused page sheets instead.');
}
```

If the platform cap ever changes, three sites (two of them inside strings) must be found and updated
in lockstep — the exact "value that must agree … is imported from one exported constant" situation
the conventions forbid, here in miniature within one file.

#### Proposed solution

`const ARTIFACT_UPLOAD_CAP_BYTES = 16 * 1024 * 1024;` (WHY comment: the claude.ai Artifact tool's
upload limit) plus a derived `ARTIFACT_UPLOAD_CAP_MB` for the messages, interpolated into all three
strings. If other tooling ever needs the cap, promote it to `lib/`; today one file owning it is
enough.

---

### [Maintainability] Dot-path `get` helper is duplicated between `audit-golden.mjs` and `lib/golden-catalog.mjs`

**File(s):** `tools/asset-gen/bin/audit-golden.mjs` (line 189),
`tools/asset-gen/lib/golden-catalog.mjs` (line 55) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
// bin/audit-golden.mjs:189
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
// lib/golden-catalog.mjs:55
const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);
```

Two independently-written implementations of the same accessor, both used to walk `GOLDEN_VERDICTS`
dot-paths (bin: line 210 for the freeze-time known-failing list; lib: `diffGoldenPage`). They
already differ textually (explicit null-check vs optional chaining) and could diverge behaviorally
if either is "fixed" alone — and both exist solely to serve `GOLDEN_VERDICTS`, which the lib owns.

#### Proposed solution

Export the lib's version (e.g. `export const getPath = …` or `verdictAt(entry, path)`) from
`lib/golden-catalog.mjs` next to `GOLDEN_VERDICTS`, and delete the bin's copy. Naming it
`getPath`/`verdictAt` avoids shadow-prone bare `get`.

---

### [Architecture] `GOLDEN_PATH` and `MANIFEST_PATH` are exported from side-effecting CLI modules with zero importers

**File(s):** `tools/asset-gen/bin/audit-golden.mjs` (line 55),
`tools/asset-gen/bin/gen-asset-manifest.mjs` (line 28) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
export const GOLDEN_PATH = join(ASSET_GEN_DIR, 'golden', 'golden-scores.json'); // audit-golden.mjs:55
export const MANIFEST_PATH = join(ASSET_GEN_DIR, 'golden', 'asset-manifest.sha256'); // gen-asset-manifest.mjs:28
```

A repo-wide grep finds no importer of either name — the `export` keyword is speculative surface
(repo rule: a new export needs a production caller, or a "seam kept only for tests" comment; there's
neither, and no test imports them). Worse, the export invites a trap: both modules execute their
full CLI at import time (`audit-golden` scores the entire catalog at line 196; `gen-asset-manifest`
parses argv and *writes the manifest* at lines 54–66, since no `--check` flag means write mode). Any
future module that innocently does `import { MANIFEST_PATH } from '../bin/gen-asset-manifest.mjs'`
would silently rewrite the committed manifest. Contrast `gen-coloring-fills.mjs:255`, which guards
its CLI behind `import.meta.url === pathToFileURL(process.argv[1]).href` precisely so its exports
(`run`, `RenderFailuresError` — which *do* have consumers in `tests/light-fill-cli.test.mjs:7`) are
safely importable.

#### Proposed solution

Drop the `export` keyword from both constants. If a shared home for the two golden-fixture paths is
ever needed (they're sibling files in `golden/`), put them in `lib/paths.mjs` beside `ASSET_GEN_DIR`
— never export importable names from a module whose import runs a CLI.

---

### [Readability] `gen-coloring-fills` carries a dead `drift` field on every candidate

**File(s):** `tools/asset-gen/bin/gen-coloring-fills.mjs` (lines 165, 174) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const [{ keep, drift, localKeep, worstTile }, white, eyeScore] = await Promise.all([...]);
const cand = { colored, keep, drift, localKeep, worstTile, white, ... };
```

`outlineMatch` returns `drift: 1 - keep` (`lib/outline-match.mjs:152`) — a pure derivation of
`keep`. Nothing in this file reads `cand.drift`: `passes` (line 103), `rank` (line 110), the warn
list (211–214), the stats line (215), and `run`'s return value all use `keep`/`localKeep` only. The
field survives as noise that makes a reader hunt for a consumer (and invites confusion with the
*structural* drift score of the night pipeline, which is a completely different measure in
`lib/night-scores.mjs`).

#### Proposed solution

Drop `drift` from the destructuring and the `cand` object. (`worstTile` is also unused in this file
after line 174 — verify and drop it in the same pass if so; it *is* used by `check-coloring-drift`
and `audit-golden`, which destructure it themselves from their own `outlineMatch` calls.)

---

### [Correctness] `gen-coloring-thumbs` builds its glob pattern with `join`, against the folder's stated glob rule

**File(s):** `tools/asset-gen/bin/gen-coloring-thumbs.mjs` (line 55; duplicate import, lines 19
and 22) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const sources = dirs.flatMap((dir) => globSync(join(COLORING_DIR, dir, '*.webp')).filter(isSource));
```

`tools/asset-gen/CLAUDE.md` explicitly requires "forward-slash glob patterns with a resolved `cwd`
(not `join`-built patterns)" (ADR-0017), and the sibling `png-to-webp.mjs:14–16` even carries the
how-to comment for the correct form. This is the one bin that violates it. Windows dev support is
dropped (ADR-0062) so it happens to work, but the file contradicts the folder's own stated invariant
— a first-time reader can't tell which pattern is the convention. Cosmetic second issue in the same
header: `node:fs/promises` is imported twice (line 19 `readdir`, line 22 `stat`).

#### Proposed solution

```js
const sources = dirs.flatMap((dir) =>
  globSync('*.webp', { cwd: join(COLORING_DIR, dir) }).map((f) => join(COLORING_DIR, dir, f))
    .filter(isSource)
);
```

and merge the imports into `import { readdir, stat } from 'node:fs/promises';`. Alternatively switch
the whole file to `resolveOutlineTargets`-style enumeration — but that helper is
outline-suffix-specific, so the local fix is proportionate.

---

### [DX] `check-coloring-drift`'s table header misaligns with (and mislabels) its rows

**File(s):** `tools/asset-gen/bin/check-coloring-drift.mjs` (lines 75–81) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const pct = (v) => `${(v * 100).toFixed(1)}%`.padStart(6);
console.log(`${'page'.padEnd(28)} ${'keep'.padStart(6)} ${'worstTile'.padStart(9)}  where`);
...
console.log(`${r.rel.padEnd(28)} ${pct(r.keep)} ${pct(r.localKeep)}  ${where}${flag}`);
```

The header's third column is padded to 9 characters (`'worstTile'.padStart(9)`) while every data row
pads that column to 6 (`pct(...)`), so from the second column on, the header sits 3 characters off
the data. Semantically it's also mislabeled: the 6-char value under `worstTile` is `localKeep` (the
worst tile's keep *percentage*), while the tile *coordinates* land in the `where` column. Compare
`audit-fill-eyes.mjs:36–38`, where header and row widths are kept in lockstep.

#### Proposed solution

Rename and re-pad: `` `${'page'.padEnd(28)} ${'keep'.padStart(6)} ${'local'.padStart(6)}  where` ``
— 'local' matches the `localKeep` terminology every other tool's output uses (`gen-coloring-fills`'
stats line prints `local X%`), and 6 chars matches `pct`'s width.

---

### [Maintainability] `--dilate-lines` is validated inline instead of via a shared parser like its five sibling flags

**File(s):** `tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (`nightSettings`, lines 185–189) @
9ae62ff1

**Priority:** P4

#### Problem

Five of `nightSettings`' six levers go through the shared `lib/cli.mjs` parsers (`parseTemperature`,
`parsePositiveInt`, `parseNonNegative` — each handling `undefined`→default, coercion, validation,
and the `source` label for registry-supplied values). The sixth is hand-rolled:

```js
'dilate-lines': v['dilate-lines'] === undefined ? 0 : Number(v['dilate-lines']),
...
if (!(Number.isInteger(leverSettings['dilate-lines']) && leverSettings['dilate-lines'] >= 0))
  fail(`--dilate-lines must be a non-negative integer${source ? ` (${source})` : ''}`);
```

It re-implements the default/validate/source-label contract the shared parsers own, splitting the
value construction (line 185) from its validation (lines 188–189) across the settings object literal
— the one flag a future editor can get subtly wrong (e.g. moving the object build without the
guard).

#### Proposed solution

Add `parseNonNegativeInt(raw, name, fallback, source)` to `lib/cli.mjs` (the obvious fourth member
of the parser family) and use it:
`'dilate-lines': parseNonNegativeInt(v['dilate-lines'], '--dilate-lines', 0, source)`. One extra
exported function, one deleted inline validation block, and the parser gets covered by
`tests/cli.test.mjs` alongside its siblings.

---

### [Maintainability] Fresh-outline page dimensions `[1536, 1024]` and the border margin are unnamed contract values

**File(s):** `tools/asset-gen/bin/gen-coloring-outlines-fresh.mjs` (lines 62, 102, 129–131) @
9ae62ff1

**Priority:** P4

#### Problem

```js
const [W, H] = wide ? [1536, 1024] : [1024, 1536];   // line 62
...
const margin = 8;                                     // line 102, inside borderWhiteFraction
```

`1536`/`1024` are the shipped catalog's page pixel dimensions — the contract every derived asset
(chalk, fills, thumbs, punch) inherits from the pen. Here they're inline array literals with no name
and no pointer to what they must agree with; if the catalog ever moved to a different resolution,
nothing connects this authoring tool to that decision. `margin` (the border-strip width sampled by
the white-border gate) is a tuning literal without the `_PX` unit convention. Meanwhile the file's
other gates *are* properly named (`BORDER_WHITE_LEVEL`, `INK_SCAN_SIZE`, `INK_DARK` at 34–37,
`BORDER_WHITE_MIN`/`INK_MIN`/`INK_MAX` at 129–131 — though these three sit 30 lines below the
functions that conceptually pair with them).

#### Proposed solution

`const PAGE_LONG_EDGE_PX = 1536;` / `const PAGE_SHORT_EDGE_PX = 1024;` at module scope with a
comment naming the owner ("the shipped catalog's pen-outline dimensions — every page under
web/static/coloring is this size"), used as
`wide ? [PAGE_LONG_EDGE_PX, PAGE_SHORT_EDGE_PX] : [...]`; `const BORDER_MARGIN_PX = 8;` hoisted next
to `BORDER_WHITE_LEVEL`. Better still, add a drift-guard test that reads one shipped outline's
`sharp().metadata()` and asserts it matches the constants — the repo's stated pattern for agreement
that can't share code with binary assets.

---

### [Maintainability] `review-orb-eyes` crop/preview geometry is all unnamed literals

**File(s):** `tools/asset-gen/bin/review-orb-eyes.mjs` (lines 49, 54, 64, 80) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const full = bytesToDataUri(await sharp(comp).resize(320).png().toBuffer(), 'image/png');  // 320 = card width
const box = Math.round(Math.min(meta.width, meta.height) * 0.08);                          // 0.08 = crop half-size fraction
.resize(200, 200, { kernel: 'nearest' })                                                   // 200 = crop preview px
...style="width:120px;..."                                                                 // 120 = rendered crop width
```

Four tuning decisions — the full-page preview width, the eye-crop half-size as a fraction of the
page, the crop's upscaled resolution, and its rendered width — are bare numbers scattered across the
card builder. `0.08` in particular is a real judgment call (how much context around a flagged pupil
the reviewer sees) with no name and no unit; contrast `audit-invented-shapes.mjs:43–46`, which names
all four of its overlay constants (`OVERLAY_DIM`, `DEVIANT_RGB`, `OVERLAY_RECT_PADDING`,
`OVERLAY_RECT_STROKE_WIDTH`).

#### Proposed solution

Module-scope constants per the convention: `FULL_PREVIEW_WIDTH_PX = 320`,
`EYE_CROP_HALF_SIZE_FRACTION = 0.08`, `EYE_CROP_RESOLUTION_PX = 200`,
`EYE_CROP_DISPLAY_WIDTH_PX = 120`, with the WHY on the fraction (enough surround to judge whether
the "blank orb" is really blank).

---

### [Architecture] `dilateWhiteLines` is a general grayscale morphology op living inside a generator bin

**File(s):** `tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (`dilateWhiteLines`, lines 97–131) @
9ae62ff1

**Priority:** P4

#### Problem

`dilateWhiteLines` is a textbook separable grayscale max-filter (row pass, lines 104–116; column
pass, lines 117–129) — 35 lines of pure pixel-domain morphology with nothing night-fill-specific
about it beyond its name. The repo already has a morphology home: `lib/morphology.mjs` exports
`dilateMask` (the binary counterpart, imported by `gen-coloring-chalk.mjs:71`), and it has a test
file (`tests/morphology.test.mjs`). Keeping the grayscale variant in a bin means it's untested (bins
have no unit tests for internals), un-reusable (a future tool needing to thicken strokes would clone
it), and invisible to anyone reading `lib/morphology.mjs` as the inventory of available ops.

#### Proposed solution

Move it to `lib/morphology.mjs` as `dilateGray(data, width, height, radius)` operating on a raw
`Uint8Array` (the sharp decode/encode stays in the bin, keeping the lib function pure and
unit-testable like `dilateMask`), and add coverage to `tests/morphology.test.mjs` (identity at
radius 0, known 1-px dilation fixture). The bin keeps a thin `dilateWhiteLines(negatedBuf, radius)`
that decodes, calls the lib, and rewraps.

---

### [Readability] `OUT_DIR = SAMPLES_DARK_DIR` alias adds indirection without meaning

**File(s):** `tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (line 82) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const OUT_DIR = SAMPLES_DARK_DIR;
```

A bare rename of an imported path constant. In `gen-coloring-chalk.mjs:79` the same-named binding
earns its keep (`join(SAMPLES_DARK_DIR, 'chalk')` — a real subdirectory), but here it's identity, so
a reader greps `OUT_DIR` (line 352) and has to bounce through line 82 to learn it's just the shared
samples dir.

#### Proposed solution

Delete the alias and use `SAMPLES_DARK_DIR` directly at line 352.

---

### [Readability] `gen-coloring-fills-dark` validates "no targets given" after resolving targets

**File(s):** `tools/asset-gen/bin/gen-coloring-fills-dark.mjs` (lines 288–295) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
let pages = await resolveOutlineTargets(positionals, { ... defaultAll: false, ... });
if (!positionals.length) fail('give a category or page, e.g. "space"');
```

The empty-argv guard runs *after* the (awaited) resolution call. It's harmless today —
`resolveOutlineTargets` with empty args and `defaultAll: false` returns `[]` without touching the
filesystem — but the ordering reads as if resolution is expected to matter for the guard, and it
depends on that internal short-circuit staying cheap. Sibling generators guard first
(`gen-coloring-chalk.mjs:183–184`, `normalize-outline-strokes.mjs:73`).

#### Proposed solution

Move the `if (!positionals.length) fail(...)` above the `resolveOutlineTargets` call, matching the
siblings.

---

### [Performance] Proof sheet's git mode spawns one `git show` subprocess per asset layer

**File(s):** `tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs` (`gitDataUri`, lines 91–102;
`makeCell`, lines 107–146) @ 9ae62ff1

**Priority:** P5

#### Problem

In `--source git:<ref>` mode, each before-cell issues up to 7 `execFileSync('git', ['show', ...])`
calls (night, light, lineArt, chalk, and the two raw fallbacks at lines 118–130, plus `light` again
via `read`). A 12-page category × 2 orientations ≈ 24 before-cells ≈ 150+ synchronous subprocess
spawns, each paying full `git` startup, serially blocking the event loop. It's a human-invoked
review tool so this is seconds not minutes, but it's the slowest part of the sheet build and pure
overhead.

#### Proposed solution

Batch with a single `git cat-file --batch` child process fed `<ref>:<path>` lines (missing objects
come back as `missing`, matching the current null semantics), or at minimum collect all needed
`(ref, path)` pairs and issue one `git archive` of the two coloring trees at the ref. Only worth
doing if git-mode sheets become a routine part of regen review; otherwise record the tradeoff and
leave it.

---

## Source: Code audit — tools/asset-gen — lib (pipeline core) + root config

Dedup notes: findings about the duplicated `0.299/0.587/0.114` luma formula vs sharp `grayscale()`,
and about the dual `median` conventions, are already tracked as issue #572; centralizing
`IMAGE_MODEL` / `WEBP_QUALITY` / timeout constants is issue #566; the `--experimental-strip-types`
flag duplication in `tools/asset-gen/package.json` is covered by
`docs/audit-deferred/decisions/strip-types-flags.md`. All are skipped below.

### [Maintainability] invented-shapes duplicates three gate constants and syncs them by prose comment

**File(s):** `tools/asset-gen/lib/invented-shapes.mjs` (lines 30–39) @ 9ae62ff1; agreeing sites
`tools/asset-gen/lib/outline-match.mjs` (line 20), `tools/asset-gen/lib/night-scores.mjs` (lines
23, 41)

**Priority:** P2

#### Problem

The repo convention is explicit: "Cross-file agreement is never maintained by prose. A value that
must agree with another module is imported from one exported constant." `invented-shapes.mjs`
violates this three times in ten lines, each with a "keep in sync with X" comment that the
convention calls "a defect, not a mitigation":

```js
export const W = 512; // working width, matches scoreDrift's scale
const LINE_DILATE = 6; // px of slack around source ink (registration + glow), as DRIFT_DILATE
...
const MIN_BG_FRAC = 0.04; // skip pages with almost no open background (as scoreNightness)
```

* `W = 512` duplicates `OUTLINE_MASK_SIZE = 512` (`outline-match.mjs:20`), which this very file
  already imports from (`OUTLINE_INK_CUTOFF`, line 23). The module-level comment (lines 27–29) even
  states "Geometry constants are inherited unchanged from scoreDrift/scoreNightness … so this
  detector sees the same picture the gates do" — the whole design premise depends on the values
  agreeing, yet nothing enforces it. `W` is also a single-letter export consumed across module
  boundaries (`bin/audit-invented-shapes.mjs:37` imports it), the least greppable possible name.
* `LINE_DILATE = 6` duplicates `DRIFT_DILATE = 6` (`night-scores.mjs:23`, not exported).
* `MIN_BG_FRAC = 0.04` duplicates `NIGHT_MIN_BG_FRAC = 0.04` (`night-scores.mjs:41`, not exported).

If someone recalibrates `DRIFT_DILATE` or the drift working width in `night-scores.mjs`, the
invented-shapes detector silently starts scoring a *different* picture than the gates, and its
calibrated blob thresholds (`MIN_BLOB`, `MAX_BLOB`, calibrated at W=512 per the comment on lines
33–38) quietly lose their meaning.

#### Proposed solution

Export `DRIFT_DILATE` and `NIGHT_MIN_BG_FRAC` from `night-scores.mjs` and import them here; replace
`W` with the imported `OUTLINE_MASK_SIZE` (keep a re-export
`export const INVENTED_SHAPES_WORK_W = OUTLINE_MASK_SIZE` or update `bin/audit-invented-shapes.mjs`
to import `OUTLINE_MASK_SIZE` directly — the latter is cleaner and kills the single-letter export).
The comments then shrink to nothing because the import *is* the documentation. Gotcha:
`MIN_BLOB`/`MAX_BLOB`/`ANCHOR_MAX` are calibrated at 512, so if anyone ever wants the detector at a
different scale than the drift gate, that becomes an explicit decision at the import site instead of
a silent fork — which is the point.

### [Performance] scoreNightFillGates re-decodes the fill buffer once per scorer, against the stated convention

**File(s):** `tools/asset-gen/lib/night-scores.mjs` (`scoreNightFillGates`, lines 168–174; fill
decodes at 57–61, 81–85, 140–144) @ 9ae62ff1

**Priority:** P2

#### Problem

`tools/asset-gen/CLAUDE.md` states the rule this module half-follows: "Scorers composed into a gate
accept a shared prepared analysis (decode/resize/label once), not raw buffers each — never re-decode
per scorer." `prepareSourceScore` (lines 43–49) exists exactly for this and is threaded into
`scoreDrift` and `scoreLineColor` — but only for the *source*. The *fill* is decoded and resized
from the compressed buffer three times per gate run:

* `scoreDrift` (lines 81–85): fill → RGB @ `OUTLINE_MASK_SIZE` (512).
* `scoreLineColor` (lines 140–144): fill → grayscale @ 512 — derivable from the RGB decode above.
* `scoreNightness` (lines 57–61): fill → RGB @ `NIGHT_W` (384); and it *also* re-decodes the source
  at 384 (lines 52–56) despite `preparedSource` existing, because the scales differ.

`scoreNightFillGates` runs once per generated take inside `generateCleanTake`'s retry loop
(`bin/gen-coloring-fills-dark.mjs:246`, up to `maxAttempts` takes per page across a ~90-page
catalog), and again per page in `bin/audit-golden.mjs`. Each decode is a full webp/png decompress +
resample of a ~1MP image. The three scorers are also awaited strictly sequentially (lines 169–172)
even though sharp decodes run on the libuv threadpool and could overlap.

#### Proposed solution

Extend the prepared-analysis pattern to the fill: add `prepareFillScore(fillBuf)` returning the
512-wide RGB raster (plus its dims), have `scoreDrift` and `scoreLineColor` accept it (lineColor
computes luma from the RGB data — it already computes luma per pixel elsewhere in this file), and
have `scoreNightFillGates` build both prepared objects once. `scoreNightness`'s 384 scale is
calibration-bearing (`NIGHT_BG_LUMA_MAX_DEFAULT` is calibrated at that scale), so either keep its
own decode and note why, or downsample from the 512 raster and re-verify the calibration — the
former is the safe first step. While there, run independent scorers under `Promise.all`. Keep the
standalone `(fillBuf, sourceBuf)` signatures working for the existing tests by making the prepared
params optional, as `preparedSource` already is.

### [Maintainability] crisp-ink's ramp bounds are prose-synced to OUTLINE_LUMA_THRESHOLD instead of derived from it

**File(s):** `tools/asset-gen/lib/crisp-ink.mjs` (lines 23–25) @ 9ae62ff1; agreeing site
`tools/asset-gen/lib/punch-fill.mjs` (line 35)

**Priority:** P3

#### Problem

```js
// Ramp ends, symmetric around lib/punch-fill.mjs's OUTLINE_LUMA_THRESHOLD (150).
const CRISP_LO = 110;
const CRISP_HI = 190;
```

The whole design of this module (per its own header, lines 14–20) is that the smoothstep is
"CENTERED ON THE PUNCH THRESHOLD" so "the punch boundary … stays exactly where it was". That
centering — `(110 + 190) / 2 === 150` — is maintained only by the comment, which additionally
restates the value `150` owned by `punch-fill.mjs` (the "no restating mutable facts owned elsewhere"
comment rule). If `OUTLINE_LUMA_THRESHOLD` is ever recalibrated, `crispInk` silently starts *moving*
the punch boundary on every chalk — the exact defect the module exists to prevent — and nothing
fails.

#### Proposed solution

Import the threshold and derive the ends from a named half-width:

```js
import { OUTLINE_LUMA_THRESHOLD } from './punch-fill.mjs';
const CRISP_RAMP_HALF_WIDTH = 40; // ~1px antialias ramp survives; wider would leave grey ringing
const CRISP_LO = OUTLINE_LUMA_THRESHOLD - CRISP_RAMP_HALF_WIDTH;
const CRISP_HI = OUTLINE_LUMA_THRESHOLD + CRISP_RAMP_HALF_WIDTH;
```

No import cycle: `crisp-ink.mjs` currently imports nothing from `punch-fill.mjs`, and
`punch-fill.mjs` does not import `crisp-ink.mjs`.

### [Maintainability] night-composite hardcodes the dark paper color with a comment naming the wrong owning file

**File(s):** `tools/asset-gen/lib/night-composite.mjs` (line 11) @ 9ae62ff1; owners
`web/src/lib/design/tokens.ts` (line 330), `web/src/tokens.css` (line 144)

**Priority:** P3

#### Problem

```js
const PAPER_DARK = [0x21, 0x1f, 0x29]; // app.css --paper (dark)
```

Two problems. First, cross-file agreement by prose: `#211f29` is owned by the design-token pipeline
(`web/src/lib/design/tokens.ts:330`, generated into `web/src/tokens.css:144`) and independently
re-declared here and in
`tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js:12`. The repo
convention prescribes exactly this situation: "when the agreeing sites can't share code … add a
drift-guard test that reads both sides and fails on divergence — the pattern of
`web/src/app.html.test.ts`". If the dark paper token is ever retuned, `compositeNight` keeps
simulating the *old* board, and every calibrated composite-eye threshold (`CORE_DARK_FRAC_MIN` etc.)
is silently judged against a render the app no longer produces. Second, the comment points at
`app.css`, which does not own the value — `--paper` lives in `tokens.css` — so even the prose sync
is mis-aimed.

#### Proposed solution

Preferred: import the value — `tools/asset-gen` already sanctions importing from `web/src` token
sources (`lib/gemini.mjs` imports `geminiSafety.ts`), and `web/src/lib/design/tokens.ts` is the
single source of truth; parse `#211f29` from the exported token into the RGB triple at module load.
If pulling the tokens module into plain-`node` audit entry points is undesirable before the
Node-floor bump lands (see `docs/audit-deferred/decisions/strip-types-flags.md`), add a small
drift-guard test in `tools/asset-gen/tests/` that imports both `PAPER_DARK` (export it) and the
token and fails on divergence. Either way, fix the comment to name the real owner. Consider covering
the proof-sheet client's copy in the same guard.

### [Correctness] night-scores scorers index the fill raster with the source's dimensions after independent resizes

**File(s):** `tools/asset-gen/lib/night-scores.mjs` (`scoreNightness` lines 51–77, `scoreDrift`
lines 79–119, `scoreLineColor` lines 138–166) @ 9ae62ff1

**Priority:** P3

#### Problem

All three scorers resize the source and the fill *independently* with `fit: 'inside'` (fixed width,
height derived from each image's own aspect ratio), then take `w`/`h` from the **source** and index
into the **fill's** data with them, e.g. `scoreDrift`:

```js
const t = await sharp(fillBuf).resize(OUTLINE_MASK_SIZE, null, { fit: 'inside' })...
const w = s.info.width;
const h = s.info.height;
...
const r = t.data[i * 3];   // i ranges over the SOURCE's w*h
```

If the fill's aspect ratio differs from the source's by even a few pixels — a model output that
wasn't normalized, or a future caller that skips the `resize(width, height, { fit: 'fill' })` step
`bin/gen-coloring-fills-dark.mjs:243` currently performs — the reads run past `t.data`'s end (or
stop short), yielding `undefined` → `NaN` lumas that flow into medians and ratios with **no error**:
the gate returns plausible-looking garbage instead of throwing. `scoreEyeFill`
(`eye-fill.mjs:335–338`) and `compositeNight` (`night-composite.mjs:18–22`) already show the safe
pattern: resize the second image to the first's exact raster with `fit: 'fill'`.

#### Proposed solution

In each scorer, resize the fill to the source's decoded dimensions:
`.resize(s.info.width, s.info.height, { fit: 'fill' })` (requires decoding the source first, which
the `preparedSource` refactor from the `scoreNightFillGates` finding gives for free). Alternatively,
a two-line assert `if (t.info.width !== w || t.info.height !== h) throw ...` turns the silent
failure into a loud one at minimal cost. The `fit: 'fill'` variant is preferable — a sub-pixel
aspect mismatch is exactly the case the ±slack tolerances are built to absorb, and it keeps the
scorer usable on un-normalized buffers.

### [Correctness] judgeNightEyes pairs night and light cores by array index on an undocumented invariant

**File(s):** `tools/asset-gen/lib/eye-fill.mjs` (`judgeNightEyes`, lines 409–424; the
invariant-bearing skip at line 352) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
for (let i = 0; i < scoredLight.cores.length; i++) {
  const lightCore = scoredLight.cores[i];
  const nightCore = scoredNight.cores[i];
```

The pairing is positional across two independent `scoreEyeFill` runs (night fill vs light fill). It
is correct today only because `scoreEyeFill`'s single skip condition —
`if (bandVals.length < MIN_BAND_SAMPLES) continue;` (line 352) — happens to depend purely on source
geometry (`sampleAnnulus` counts non-ink annulus pixels of the *source*), so both runs skip the same
cores and the arrays stay parallel. Nothing states this invariant, and it is easy to break: any
future fill-dependent filter in `scoreEyeFill` (e.g. skipping saturated cores) would silently
misalign the arrays, and `judgeNightEyes` would start comparing eye A's light score with eye B's
night score. The `!nightCore` guard on line 417 handles length mismatch but not *shift* — a shifted
pairing produces wrong verdicts, not crashes. `golden-catalog.mjs:5` and
`bin/gen-coloring-fills-dark.mjs:253` both feed gates through this path.

#### Proposed solution

Make the identity explicit: `scoreEyeFill` already emits `x`/`y` per core (lines 361–362) — match
night cores to light cores by rounded core coordinates (they come from the same source analysis, so
coordinates are identical), e.g. build a `Map` keyed by `${x},${y}` from `scoredNight.cores` and
look up per light core. Alternatively, cheaper: keep positional pairing but include the source
core's identity in each entry and
`if (nightCore && (nightCore.x !== lightCore.x || nightCore.y !== lightCore.y)) throw` — an
assertion that fails loudly the day the invariant breaks. Either removes the trap; the map version
also removes the need for the invariant at all.

### [Maintainability] night-halo re-implements punch-fill's mask construction and syncs it by prose

**File(s):** `tools/asset-gen/lib/night-halo.mjs` (`punchMask`, lines 41–53) @ 9ae62ff1; duplicated
from `tools/asset-gen/lib/punch-fill.mjs` (lines 117–130)

**Priority:** P3

#### Problem

`night-halo.mjs`'s `punchMask` is a line-for-line duplicate of the mask-building block inside
`punchFill` (decode line art, `removeAlpha`, resize to fill dims with `fit: 'fill'`, per-pixel luma
vs `OUTLINE_LUMA_THRESHOLD` into a `Uint8Array`). The agreement is maintained by comment only — line
40: "The shipped punch's mask, rebuilt with lib/punch-fill.mjs's exact math", and the module header
(line 10): "rebuild the punch mask from the line art exactly like lib/punch-fill.mjs". The whole
point of the halo scorer is to reconstruct the *identical* shipped mask (it already imports
`bleedUnderMask` and `OUTLINE_LUMA_THRESHOLD` from punch-fill for exactly that reason), yet the one
step where a divergence would corrupt every halo score is copy-pasted. `eye-fill.mjs`'s `inkMask`
(lines 41–50) is a third sibling (same formula/threshold, native resolution, no resize). Note: issue
#572 covers reconciling the *luma formulas* across classifiers; this finding is the structural
duplication of the mask-builder itself, which survives #572.

#### Proposed solution

Export the mask builder from `punch-fill.mjs` beside its two already-exported collaborators:

```js
export async function punchMaskFromLineArt(lineArtBuf, width, height) { ... }
```

Use it in `punchFill` and `night-halo.mjs`; `eye-fill.mjs`'s native-resolution `inkMask` can call it
with the buffer's own dims or stay separate if the extra metadata read isn't worth it. The prose
"exact math" comments then become imports, and the halo auditor can no longer drift from the shipped
punch.

### [Architecture] eye-fill.mjs packs four separable concerns into one 424-line module

**File(s):** `tools/asset-gen/lib/eye-fill.mjs` (whole file; analysis lines 41–135, core/ring
detection lines 137–223, fill measurement lines 225–372, judges lines 374–424) @ 9ae62ff1

**Priority:** P3

#### Problem

The file is the largest in `lib/` and layers four distinct things:

1. **Line-art region analysis** (lines 41–135): `inkMask`, `labelRegions`, the WeakMap-cached
   `analyzeEyePage`, `parentOf` — pure geometry over the pen outline, no fill involved.
2. **Outline anatomy gates** (lines 137–223): `findEyeCores`, `scoreEyeRings`, `scoreEyes` —
   consumed by the *outline* tooling (`bin/normalize-outline-strokes.mjs`, `bin/audit-golden.mjs`'s
   outline section, `tests/eye-rings.test.mjs`), which never touches fills.
3. **Fill measurement** (lines 225–372): `sampleAnnulus`, `scoreEyeFill` — measures a *fill* at the
   outline's cores.
4. **Verdict policy** (lines 374–424): `judgeLightEyes`, `judgeNightEyes` and their calibration
   constants (`STRONG_LIGHT_SIDE`, `BAND_BLIND_INK_FRAC`, `CHALK_WHITE_MIN`).

A first-time reader hunting "how does the normalizer detect hypno-swirl eyes" (concern 2) must page
through fill-scoring machinery that is irrelevant to it, and vice versa. The module name
(`eye-fill`) actively misleads for concerns 1–2 — `scoreEyeRings` has nothing to do with fills.
`composite-eye.mjs` (a fifth eye concern) already lives in its own file, showing the intended grain.

#### Proposed solution

Split along the existing internal seams: `lib/eye-anatomy.mjs` (concerns 1–2: analysis cache,
`findEyeCores`, `scoreEyeRings`, `scoreEyes`, `EYE_RING_DEPTH_MAX`, size-band constants) and keep
`lib/eye-fill.mjs` for concerns 3–4 (importing cores from anatomy). Import sites:
`composite-eye.mjs`, `golden-catalog.mjs`, four `bin/` scripts, four test files — a mechanical
update. No behavior change; the WeakMap cache moves intact. The judges could be a third file, but
two modules already restore the "name tells you what's inside" property; don't over-split.

### [Testing] The pipeline's core deterministic transforms have zero unit coverage

**File(s):** `tools/asset-gen/lib/align-to-source.mjs`, `tools/asset-gen/lib/punch-fill.mjs`
(`bleedUnderMask`, `punchFill`), `tools/asset-gen/lib/crisp-ink.mjs`,
`tools/asset-gen/lib/page-notes.mjs` (`pageLevers`, `mergeFlags`) @ 9ae62ff1

**Priority:** P3

#### Problem

The `tests/` suite covers every *scorer* (outline-match, night-scores, night-halo, solid-regions,
eye-fill, composite-eye, invented-shapes, golden-catalog, morphology, stats, outline-targets, cli)
but none of the *transforms that produce shipped bytes*:

* `alignToSource` — the registration nudge applied to every generated candidate. It contains the
  codebase's most delicate sharp interaction, flagged by its own comment (lines 74–75: "chaining
  extend+extract in one pipeline lets sharp reorder them and mis-computes the window") plus
  scale-back rounding and clamping (lines 69–87). A regression here mis-registers every future
  asset, and no test would notice; only a human eyeballing a proof sheet might.
* `bleedUnderMask` / `punchFill` — the punch is the transform whose output ships in `web/static/`.
  Its ring-peeling convergence, the `if (!done.length) break` stall guard (line 79), and the
  per-theme chalk/pen mask selection (lines 101–106) are all untested. The golden manifest catches
  output drift only when someone runs it against real assets; a synthetic test (e.g. a 3px black
  stroke over a two-color fill → assert the stroke pixels take neighbor colors, opaque RGB output)
  pins the semantics cheaply.
* `crispInk` — the LUT construction (lines 27–31) is easy to pin: assert `LUT` endpoints
  (`v ≤ CRISP_LO → 0`, `v ≥ CRISP_HI → 255`) and midpoint fixedness at the threshold via a tiny
  gradient image.
* `pageLevers` / `mergeFlags` — the registry-merge policy ("explicit CLI always wins", `*` wildcard
  layering, boolean-vs-string normalization, lines 47–67) is documented behavior every generator
  relies on, exercised only in production runs.

These are all pure/deterministic (buffer-in/buffer-out or object-in/object-out) and fit the existing
Vitest-node harness with synthetic fixtures — no Gemini, no committed art needed.

#### Proposed solution

Add `tests/align-to-source.test.mjs` (render a synthetic outline with sharp, shift it by a known
`(dx, dy)`, assert the recovered correction and that a zero-shift input returns the same buffer),
`tests/punch-fill.test.mjs` (synthetic mask/fill for `bleedUnderMask`; a tmp-dir fixture tree for
`punchFill`'s path/mask-selection logic, following `outline-targets.test.mjs`'s tmp-root pattern),
`tests/crisp-ink.test.mjs`, and `tests/page-notes.test.mjs` (pure JSON-in/JSON-out, trivially
table-driven). Prioritize `alignToSource` and `bleedUnderMask` — highest blast radius per line of
test.

### [Maintainability] outline-match hand-rolls dilation as a per-pixel window scan instead of using morphology.dilateMask

**File(s):** `tools/asset-gen/lib/outline-match.mjs` (`nearby`, lines 55–68; call sites lines
109, 124) @ 9ae62ff1

**Priority:** P4

#### Problem

`nearby(mask, i, r)` answers "any set pixel within Chebyshev radius r" by scanning a (2r+1)² window
per query — which is exactly a membership test against `dilateMask(mask, w, h, r)` from
`lib/morphology.mjs`, the shared helper five sibling modules already use (`night-scores.mjs:97,114`,
`night-halo.mjs:59,104`, `invented-shapes.mjs:146`). `outlineMatch` calls `nearby(fill, i, TOL)` for
every source-ink pixel (line 109) and, on overlay runs, `nearby(src, i, TOL)` for every
candidate-ink pixel far from source (line 124). Precomputing
`const fillNear = dilateMask(fill, SIZE, SIZE, TOL)` (and `srcNear` when `overlay` is set) turns
both into O(1) lookups, deletes 14 lines including the hand-maintained bounds checks, and — the real
win — makes "tolerant match" mean the same dilation everywhere in the pipeline instead of a private
re-implementation. The two `darkMask` decodes at lines 90–91 are also sequential awaits that can run
under `Promise.all`.

#### Proposed solution

```js
const src = ...; const fill = ...;            // Promise.all the two darkMask calls
const fillNear = dilateMask(fill, OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, TOL);
const srcNear = overlay ? dilateMask(src, OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, TOL) : null;
```

then replace `nearby(fill, i, TOL)` → `fillNear[i]` and `!nearby(src, i, TOL)` → `!srcNear[i]`, and
delete `nearby`. `dilateMask`'s separable box is Chebyshev-radius, identical semantics to the window
scan. `tests/outline-match.test.mjs` already pins `keep`/`localKeep` values and will catch any
accidental semantic change.

### [Maintainability] Calibrated shape-discrimination thresholds in the eye/blob scorers are unnamed inline literals

**File(s):** `tools/asset-gen/lib/composite-eye.mjs` (lines 157, 158, 171),
`tools/asset-gen/lib/eye-fill.mjs` (line 151), `tools/asset-gen/lib/invented-shapes.mjs` (line 113)
@ 9ae62ff1

**Priority:** P4

#### Problem

The convention says a numeric literal encoding a tunable decision gets a named module-scope constant
with the WHY on the constant. These files mostly comply (`CORE_DARK_FRAC_MIN`, `PUPIL_MIN_FRAC`,
`ANCHOR_MAX`, … all named and documented), which makes the stragglers stand out:

* `composite-eye.mjs:157` — `if (blob.length / (bw * bh) < 0.4) return false;` (bbox fill-ratio bar
  for "is a disc").
* `composite-eye.mjs:158` — `if (Math.max(bw, bh) / Math.min(bw, bh) > 2.5) return false;` (aspect
  bar).
* `composite-eye.mjs:171` — `return surviving >= Math.max(12, blob.length * 0.3);` (erosion-survival
  floor: both the `12` px floor and the `0.3` mass fraction).
* `eye-fill.mjs:151` — `a.area > b.area * 0.7` (core must be meaningfully smaller than its parent).
* `invented-shapes.mjs:113` — `if (area < 8) continue; // ignore speckle entirely` (pre-filter below
  the named `MIN_BLOB = 60`).

Each of these is a calibrated discriminator (the surrounding comments describe the failure classes
they were tuned against), not "plain geometry arithmetic". Anyone re-tuning the shape-page false
positives has to find them by reading function bodies rather than the constants block every sibling
threshold lives in.

#### Proposed solution

Hoist with unit-suffixed names beside their existing siblings, e.g. `PUPIL_BBOX_FILL_MIN = 0.4`,
`PUPIL_ASPECT_MAX = 2.5`, `PUPIL_ERODE_SURVIVE_MIN_PX = 12`, `PUPIL_ERODE_SURVIVE_FRAC = 0.3`,
`CORE_PARENT_AREA_MAX_FRAC = 0.7`, `SPECKLE_MIN_PX = 8`, moving the in-body WHY comments onto the
constants. Pure rename-refactor; the tests pin behavior.

### [Maintainability] eye-fill's memoized page analysis caches rejections forever, against the stated convention

**File(s):** `tools/asset-gen/lib/eye-fill.mjs` (`analyzeEyePage`, lines 92–100) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const eyePageAnalyses = new WeakMap();

function analyzeEyePage(sourceBuf) {
  const existing = eyePageAnalyses.get(sourceBuf);
  if (existing) return existing;
  const analysis = analyzeEyePageOnce(sourceBuf);
  eyePageAnalyses.set(sourceBuf, analysis);
  return analysis;
}
```

`analyzeEyePageOnce` is async, so the WeakMap stores a *promise*. The root convention: "A memoized
promise resets itself on rejection (see `web/src/lib/idb.ts`) unless permanent failure is intended"
— and if permanent failure is intended, that intent is supposed to be visible. Here a transient
sharp failure (ENOMEM under a parallel batch, a truncated read) poisons the cache entry for that
buffer: every subsequent scorer in the same run (`scoreEyeFill`, `scoreEyeRings`, `scoreEyes`,
`scoreCompositeEyes` — they deliberately share the pen buffer to hit this cache) receives the same
stale rejection even though a retry would succeed. Nothing marks the pinning as intended.

#### Proposed solution

Follow the `idb.ts` pattern:

```js
const analysis = analyzeEyePageOnce(sourceBuf);
analysis.catch(() => eyePageAnalyses.delete(sourceBuf));
eyePageAnalyses.set(sourceBuf, analysis);
```

Three lines, no behavior change on the success path. If pinning rejections were actually desired,
the alternative fix is a comment saying so — but there's no evident reason a decode failure should
be permanent per buffer.

### [Testing] diffGoldenPage silently ignores metric paths missing from the score shape — a renamed producer key disables its gate

**File(s):** `tools/asset-gen/lib/golden-catalog.mjs` (`diffGoldenPage`, lines 57–79; skip
conditions lines 61, 73) @ 9ae62ff1

**Priority:** P4

#### Problem

`GOLDEN_METRICS` and `GOLDEN_VERDICTS` (lines 18–53) address the score object built in
`bin/audit-golden.mjs` via dotted string paths (`'night.bgLuma'`, `'light.eyesOk'`, …). The diff
loops skip any path that doesn't resolve:

```js
if (was === now || was === undefined || now === undefined) continue;   // verdicts
...
if (was == null || now == null || was === now) continue;               // metrics
```

`null` legitimately means "not scoreable" (and the verdict loop reports it as "scoreability
changed"), but `undefined` means "key absent" — and it takes the same silent path. So if
`audit-golden.mjs` renames or drops a field (or a typo lands in a `GOLDEN_METRICS` key), that
regression channel just stops firing: `gen:coloring-golden:diff` keeps exiting 0 while one of its
gates is dead. The existing `tests/golden-catalog.test.mjs` exercises the diff with hand-built
partial objects, so it cannot catch shape drift against the real producer.

#### Proposed solution

Two cheap layers: (1) in `diffGoldenPage`, distinguish `undefined` from `null` — push an
`out.regressions` (or at least `out.info` with a loud prefix) entry like
`"${rel}  ${path} MISSING from score shape"` when exactly one side is `undefined` on a *current*
score; (2) add a drift-guard test that scores one committed fixture page through the same scoring
path `audit-golden.mjs` uses and asserts every `GOLDEN_METRICS`/`GOLDEN_VERDICTS` path resolves to
non-`undefined`. The second layer requires the score assembly to be importable — worth extracting
from `bin/audit-golden.mjs` into `golden-catalog.mjs` anyway, since the path vocabulary and the
shape producer belong together.

### [Performance] night-halo re-sorts each band three times and recomputes per-pixel deltas across three passes

**File(s):** `tools/asset-gen/lib/night-halo.mjs` (`scoreNightHalo`, lines 116–136, 141–149) @
9ae62ff1

**Priority:** P4

#### Problem

Per band, `bandStats` (lines 116–128) computes `deltas` once but then calls `quantile(deltas, f)`
three times — and `quantile` (`stats.mjs:4–7`) copies **and sorts** the whole array on every call,
so each band's deltas are sorted three times. The bands cover every pixel within 3px of ink (a large
fraction of a ~1–4MP page for dense line art). On top of that, `lumaOf` per pixel is evaluated in
three separate passes: `band.map(deltaAt)` (line 117), `band.filter(isHalo)` (line 126, which calls
`deltaAt` again plus a shipped-luma read), and the hotspot loop (lines 141–149) calls `isHalo` a
third time over bands 1..3. Finally, lines 132–136 reconstruct pixel *counts* by multiplying the
just-divided shares back by `n` (`bandStats[0].haloShare * bandStats[0].n`) — a float round-trip of
numbers that existed as integers moments earlier.

This is a per-page audit tool (`bin/audit-night-halo.mjs`) run over the catalog, so it's seconds not
milliseconds — but the fix is also a readability win: shares derived from counts read better than
counts re-derived from shares.

#### Proposed solution

In `bandStats`, sort each `deltas` copy once and index p50/p90/p99 directly (or add a
`quantiles(vals, fs)` helper to `stats.mjs` — it already documents "sorts a copy" as its contract);
compute `haloCount`/`rimCount` as integers in the same pass and expose them alongside the shares, so
lines 132–136 become simple additions. For the triple `deltaAt` evaluation, either memoize a
`Float32Array` of deltas for the union of band pixels or precompute an `isHalo` byte mask once and
reuse it in `bandStats` and the hotspot loop. `tests/night-halo.test.mjs` pins the scores.

### [Readability] scoreCompositeEyes packs pupil location, validation, and measurement into one 55-line loop with repeated inline rounding

**File(s):** `tools/asset-gen/lib/composite-eye.mjs` (`scoreCompositeEyes`, lines 218–273) @
9ae62ff1

**Priority:** P4

#### Problem

The main loop (lines 240–268) does, per reference core: coordinate rescaling, dark-blob flood,
size-band rejection, dedupe, disc validation, centroid, disc radius derivation, disc stats, and
result assembly — each step separated by a comment rather than a name. The result assembly repeats
the `Math.round(v * 100) / 100` round-to-2dp idiom three times (lines 260, 264, 265). Separately,
the four preparation awaits (lines 225–236: `scoreEyeFill`, two `metadata()` calls, two
`grayResized` calls) run strictly sequentially though only `h` depends on `meta`; the decodes could
overlap on sharp's threadpool.

#### Proposed solution

Extract two helpers so the loop reads as its steps:
`findConfirmedPupilBlob(light, w, h, page, cx, cy, claimed)` (snap+flood+size/disc/dedupe checks,
returns `blob | null` — subsumes lines 243–248) and `measurePupilAtCore(comp, w, h, cx, cy, blob)`
(radius, `discStats`, verdict — lines 250–258). Add a local
`round2 = (v) => Math.round(v * 100) / 100`. Overlap the independent loads with
`Promise.all([sharp(penBuf).metadata(), sharp(compBuf).metadata()])` then
`Promise.all([grayResized(lightBuf, ...), grayResized(compBuf, ...)])`. Behavior-neutral;
`tests/composite-eye.test.mjs` pins verdicts.

### [Performance] bleedUnderMask allocates a fresh 4-element neighbor array per pixel per ring pass

**File(s):** `tools/asset-gen/lib/punch-fill.mjs` (`bleedUnderMask`, lines 57–78, allocation at
line 63) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
```

The innermost statement of the bleed builds a new array (and iterator) for every pending pixel on
every ring pass. Mask pixels are ~5–15% of a 1–4MP page, and pixels that fail to converge get
re-visited on later passes (`next.push(p)`), so a catalog-wide punch (`gen:coloring-punch`, plus
`scoreNightHalo`'s reference bleed which re-runs this with a dilated mask) churns through millions
of short-lived arrays. The `ring`/`next`/`done` number arrays add further GC pressure. It's a
one-off tool, so this is polish — but it's the hottest loop in the punch and the fix is local.

#### Proposed solution

Unroll the four neighbors into explicit `q0..q3` checks (or a reused module-scope `Int32Array(4)`),
and replace `done` with in-place two-phase marking (e.g. set `pending[p] = 2` during the pass, sweep
to 0 after) so per-ring array allocation disappears. Keep the two-phase semantics — the
direction-neutral bleed depends on not consuming this ring's results within the same pass (the WHY
comment at lines 50–52 already explains this; keep it).

### [Correctness] CLI number parsers accept empty-string env values as 0

**File(s):** `tools/asset-gen/lib/cli.mjs` (`parsePngToWebpOptions` lines 8–20, `parseNonNegative`
lines 47–54, `parseTemperature` lines 38–45) @ 9ae62ff1

**Priority:** P5

#### Problem

`parsePngToWebpOptions` resolves `values.quality ?? env.QUALITY`. An empty environment variable
(`QUALITY= npm run …`, or an unset-but-exported var in a wrapper script) yields `''`, which is not
`undefined`, so the fallback never applies — and `Number('') === 0` passes the `value >= 0` check in
`parseNonNegative`, silently producing `quality: 0` (maximally destroyed webp output) instead of the
intended default 80. `parseTemperature` has the same hole (`'' → 0`, in range). `parsePositiveInt`
is safe by accident (`0` fails `>= 1`). The failure is silent precisely where these helpers
otherwise fail loudly on garbage (`fail(...)` for `'abc'`).

#### Proposed solution

Treat blank as unset at the top of each parser:
`if (raw === undefined || raw === '') return fallback;` — or normalize once in
`parsePngToWebpOptions` (`env.QUALITY || undefined`). One-line change per parser; add the `''` case
to `tests/cli.test.mjs`'s existing env-precedence tests.

### [Readability] outline-match's tile bucketing is an opaque inline expression with a dead clamp

**File(s):** `tools/asset-gen/lib/outline-match.mjs` (lines 102–107) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const tx = Math.min(GRID - 1, (((i % OUTLINE_MASK_SIZE) / OUTLINE_MASK_SIZE) * GRID) | 0);
const ty = Math.min(
  GRID - 1,
  ((((i / OUTLINE_MASK_SIZE) | 0) / OUTLINE_MASK_SIZE) * GRID) | 0,
);
const t = ty * GRID + tx;
```

Three stacked idioms (`% SIZE` for x, `| 0` for floor, normalize-then-scale for the bucket) plus a
`Math.min` clamp that is provably dead: `x < OUTLINE_MASK_SIZE` guarantees
`(x / SIZE) * GRID < GRID`, so the floor is already `<= GRID - 1`. The dead clamp actively misleads
— it implies the expression can overflow, sending a reader off to figure out when. The `ty` line
only works because the mask is square (y is divided by the *width* constant), a second silent
assumption.

#### Proposed solution

Extract a named helper next to `nearby`:

```js
const TILE_PX = OUTLINE_MASK_SIZE / GRID;
function tileIndexOf(i) {
  const tx = ((i % OUTLINE_MASK_SIZE) / TILE_PX) | 0;
  const ty = (((i / OUTLINE_MASK_SIZE) | 0) / TILE_PX) | 0;
  return ty * GRID + tx;
}
```

(`512 / 8 = 64` divides evenly; if GRID ever stops dividing SIZE, `TILE_PX` makes that visible at
the constant instead of buried in arithmetic.) Drop the dead clamps.

### [Docs] resolveNightLineArt's tri-state return contract is undocumented at the definition

**File(s):** `tools/asset-gen/lib/paths.mjs` (`resolveNightLineArt`, lines 31–38) @ 9ae62ff1

**Priority:** P5

#### Problem

The function encodes three subtle behaviors its five `bin/` consumers plus `punch-fill.mjs` each
rely on differently: `source` is `null` when the resolved file is missing (callers must check —
`punchFill` throws on it, `tests/audit-cli.test.mjs` mocks exactly this shape); `chalk` is `null`
when the page falls back to the pen (callers branch chalked-vs-pen behavior on it, e.g.
`punchFill`'s mask choice and `gen-coloring-fills-dark`'s prompt/eye-gate selection); and the
optional `pen` parameter is a pre-read pen buffer used to skip a second disk read (passed at
`gen-coloring-fills-dark.mjs:325`, `audit-fill-eyes.mjs:56`, `audit-golden.mjs:106`). None of this
is stated at the definition — the six call sites each re-derive the contract, and the file's header
comment covers the directory constants but not this function.

#### Proposed solution

A three-line WHY/contract comment above the function (or a `@typedef` matching the style of
`outline-match.mjs`/`night-halo.mjs`): what each field means, that `source === null` signals a
missing file, and that `pen` is purely a read-avoidance optimization for the fallback path.
Documentation-only; no code change.

### [Maintainability] night-composite duplicates the screen-blend and punch decision inline rather than naming them

**File(s):** `tools/asset-gen/lib/night-composite.mjs` (`compositeNight`, lines 24–31) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const punched = ink[p] < OUTLINE_LUMA_THRESHOLD;
const chalkWhite = 255 - ink[p];
for (let c = 0; c < 3; c++) {
  const base = punched ? PAPER_DARK[c] : fill[i + c];
  out[i + c] = 255 - ((255 - base) * (255 - chalkWhite)) / 255;
}
```

Two small issues in the pipeline's single most consequence-laden simulation (every composite
eye-gate threshold is calibrated against this function's output). First, the screen blend is an
unnamed inline formula; a named `screen(base, over)` helper would let the header's claim ("mirroring
… the app's dark `--lineart-*` treatment") be verified at a glance and reused if any other tool
needs the same simulation. Second, the result is assigned unrounded — Buffer assignment truncates,
so every channel is biased up to 1 luma step darker than the app's compositor (which goes through
canvas paths that round). Individually invisible, but `CORE_DARK_FRAC_MIN = 0.07`
(`composite-eye.mjs:78`) was calibrated to two decimal places against these pixels, so keeping the
simulation bit-faithful where it's free is worth one `Math.round`.

#### Proposed solution

```js
const screen = (base, over) => Math.round(255 - ((255 - base) * (255 - over)) / 255);
```

used in the loop; re-run `npm run gen:coloring-golden:diff` after the change — if any calibrated
verdict flips (unlikely at ±1 luma), that is exactly the sensitivity worth knowing about before
trusting the thresholds further.

### [Readability] invented-shapes' labelBlobs accumulates eight loop-carried variables through comma-chained lets

**File(s):** `tools/asset-gen/lib/invented-shapes.mjs` (`labelBlobs`, lines 67–123, declarations at
74–84) @ 9ae62ff1

**Priority:** P5

#### Problem

The flood loop threads eight accumulators declared in two comma-chained `let` statements
(`area, anchored, borderPx, sr, sg, sb` and `minX, maxX, minY, maxY`) through a 40-line `while`,
mixing four concerns per visited pixel: color averaging, bbox tracking, anchor classification, and
frontier expansion. The neighbor-push block (lines 105–111) additionally re-derives the
no-wraparound guard (`Math.abs(jx - x) > 1`) that siblings solve structurally
(`solid-regions.mjs:81–84` guards with `x > 0`/`x < w - 1` before pushing — clearer and cheaper than
pushing then filtering). This is the kind of function where the next calibration session (this
detector is explicitly a calibrated heuristic, per lines 27–29) pays the comprehension cost.

#### Proposed solution

Restructure the flood to collect the blob's pixel list first (as `composite-eye.mjs`'s `darkBlob`
does, lines 98–136), then compute area/bbox/color/anchoring in small named passes over the list
(`blobBBox`, `blobMeanColor`, `blobAnchorStats` — the bbox pass already exists in spirit at
`composite-eye.mjs:147–156`). Use the structural `x > 0` / `x < w - 1` neighbor guards. Slightly
more memory (pixel list per blob), identical output; `tests/invented-shapes.test.mjs` and
`tests/gate-redundancy.test.mjs` pin the flagged/washes behavior.

## Source: Code audit — tools/asset-gen — tests

### [Correctness] Mocked lib constants in audit-cli.test.mjs have already drifted from their real values

**File(s):** `tools/asset-gen/tests/audit-cli.test.mjs` (mock factories, lines 44–112),
`tools/asset-gen/tests/light-fill-cli.test.mjs` (lines 46–48) @ 9ae62ff1

**Priority:** P2

#### Problem

The audit-CLI plumbing tests replace each scorer module with a `vi.mock` factory that **re-declares
the module's exported threshold constants as literals**, and four of them no longer match the real
module:

```js
// audit-cli.test.mjs:77-79
vi.mock('../lib/eye-fill.mjs', () => ({
  EYE_RING_DEPTH_MAX: 5,          // real: lib/eye-fill.mjs:173 → 4
```

```js
// audit-cli.test.mjs:105-108
vi.mock('../lib/night-scores.mjs', () => ({
  DRIFT_THRESHOLD_DEFAULT: 0.1,   // real: lib/night-scores.mjs:29 → 0.004
  NIGHT_BG_LUMA_MAX_DEFAULT: 50,  // real: lib/night-scores.mjs:40 → 60
  LINE_WHITE_MIN_DEFAULT: 200,    // real: lib/night-scores.mjs:136 → 150
```

The other mocked constants (`KEEP_THRESHOLD: 0.92` / `LOCAL_KEEP_THRESHOLD: 0.8` at lines 45–46,
`SOLID_BLOB_MAX: 100` / `SOLID_INTERIOR_MAX: 60` at lines 62–63, and the same outline-match pair in
`light-fill-cli.test.mjs:47-48`) currently match — but that is coincidence, not enforcement; they
will drift exactly the way the four above already did. The repo convention says cross-file agreement
is never maintained by prose, and these are cross-file value agreements maintained by copy-paste.
Today the drifted values are behaviorally harmless (the mocked scorers always return passing
results, so the thresholds only flow into log formatting), which is precisely why nobody noticed — a
reader debugging a bin script against these tests sees `EYE_RING_DEPTH_MAX: 5` and is misled, and if
a bin script ever starts comparing against a mocked threshold the tests will exercise the wrong bar
silently.

#### Proposed solution

Use the `importOriginal` spread pattern **already used in the same file** for `../lib/cli.mjs`
(audit-cli.test.mjs:33–38): import the real module, spread it, and override only the scorer
functions:

```js
vi.mock('../lib/eye-fill.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  scoreEyeRings: async (buffer) => { assertReadable(buffer); return { maxDepth: 0, passes: true }; },
  ...
}));
```

The scorer libs import `sharp`, so `importOriginal` pays a real module load — acceptable here (sharp
is already loaded by sibling suites in the same run). If that cost is deemed too high for these two
files, the alternative is obviously-fake sentinel values (`EYE_RING_DEPTH_MAX: 9999`) so no reader
can mistake them for the real bars — but the spread fixes drift outright and is the same pattern the
file already established.

### [Performance] composite-eye suite re-scores every fixture up to three times and carries a fully redundant test

**File(s):** `tools/asset-gen/tests/composite-eye.test.mjs` (`score`, lines 24–27; margin test,
lines 64–75; manifest test, lines 77–82) @ 9ae62ff1

**Priority:** P2

#### Problem

`scoreCompositeEyes` on the full-resolution webp trios (~130 KB each; the detector is
native-resolution bound) costs ~350–470 ms per fixture. The suite runs it 15 times where 5 would do:

* The true-positive/legible describes score each of the 5 fixtures once (lines 33–62).
* `separates the two classes with margin...` re-scores **all 5** via `worstOf` (lines 64–75) —
  measured 1121 ms.
* `every fixture matches its manifest expectation` (lines 77–82) re-scores **all 5 again** —
  measured 1827 ms — to assert `r.passes === !entry.expectBlankOrb`, which is a strict subset of
  what the two describes above already assert (`expect(r.passes).toBe(false)` for every
  `expectBlankOrb` fixture at line 38, `expect(r.passes).toBe(true)` for every legible one at line
  52, both iterating the same manifest-derived lists). The test adds zero coverage and ~1.8 s of
  runtime.

That is roughly 3 s of pure waste in a 13 s suite that runs on every `npm test` / CI push.

#### Proposed solution

Memoize the score per fixture name and delete the redundant test:

```js
const scores = new Map();
const score = (name) =>
  scores.get(name)
    ?? scores.set(
      name,
      loadTrio(name).then(({ comp, light, pen }) => scoreCompositeEyes(comp, light, pen)),
    ).get(name);
```

(A `Map<string, Promise<result>>` at module scope — the sanctioned pure-memoization-cache pattern.
Results are plain read-only objects, so sharing across tests is safe.) Then drop
`every fixture matches its manifest expectation` outright, or reduce it to asserting the manifest
and the describe lists cover the same names (a cheap set-equality check) if the "manifest is the
source of truth" property should stay pinned.

### [Performance] gate-redundancy recomputes the full fixtures×gates matrix in every test

**File(s):** `tools/asset-gen/tests/gate-redundancy.test.mjs` (`catchMatrix`, lines 34–43; line-art
tests, lines 68–82; night tests, lines 105–131) @ 9ae62ff1

**Priority:** P3

#### Problem

`catchMatrix(gates, fixtures)` rebuilds every fixture and runs every gate over it. The night group
calls it in each of its three tests (lines 107, 118, 124) — measured 1877 ms + 1931 ms + 1733 ms —
and the line-art group in each of its two (lines 69, 79; 472 ms + 329 ms). The matrix is
deterministic for a given group; recomputing it per test wastes ~4 s per suite run with no isolation
benefit (the gates are pure scorers over freshly built buffers).

#### Proposed solution

Compute the matrix once per describe in a `beforeAll` and let each test assert against the shared
result:

```js
let matrix;
beforeAll(async () => {
  src = await F.nightSource();
  matrix = await catchMatrix(gates, fixtures);
});
```

Each `it` then reads `matrix` directly. This also removes the triplicated
`src = await F.nightSource()` lines (106, 117, 123). Gotcha: `catchMatrix` results are `Set`s the
tests only read — safe to share.

### [Maintainability] The unexported NIGHT_MIN_BG_FRAC floor is hand-rolled as 0.04 in two test files

**File(s):** `tools/asset-gen/tests/gate-redundancy.test.mjs` (line 89),
`tools/asset-gen/tests/night-scores.test.mjs` (line 43) @ 9ae62ff1

**Priority:** P3

#### Problem

`lib/night-scores.mjs:41` defines the open-background floor as a private constant:

```js
const NIGHT_MIN_BG_FRAC = 0.04; // skip the check if there's barely any open background
```

Two tests re-state the value as a bare literal:

```js
// gate-redundancy.test.mjs:87-90
nightness: async (fill) => {
  const r = await scoreNightness(fill, src);
  return r.bgFrac >= 0.04 && r.bgLuma > NIGHT_BG_LUMA_MAX_DEFAULT;
},
```

```js
// night-scores.test.mjs:43
expect(r.bgFrac).toBeGreaterThan(0.04); // enough open bg to judge
```

If the lib floor moves, both tests keep asserting the stale value — exactly the cross-file drift the
"declared once, imported everywhere" convention exists to prevent. (The boundary-string test
exception in CLAUDE.md covers string keys, not shared tuning thresholds like this one.) The
gate-redundancy predicate additionally re-implements skip logic the scorer already encodes:
`scoreNightness` returns `bgLuma: 0` when `bgFrac` is below the floor (lib/night-scores.mjs:75), and
the production gate is plain `night.bgLuma <= nightLumaMax` (bin/gen-coloring-fills-dark.mjs:279) —
so the test's hand-rolled `bgFrac >= 0.04 &&` prefix duplicates internal behavior and can diverge
from the gate it claims to represent.

#### Proposed solution

Export `NIGHT_MIN_BG_FRAC` from `lib/night-scores.mjs` and import it at both test sites. In
gate-redundancy, simplify the predicate to mirror the production gate
(`r.bgLuma > NIGHT_BG_LUMA_MAX_DEFAULT` — the scorer's internal floor already makes low-bg pages
return 0 and pass); if the explicit `bgFrac` guard is kept for matrix-attribution clarity, express
it with the imported constant.

### [Testing] Int32Array.prototype.fill spy couples the label-once tests to a private sentinel

**File(s):** `tools/asset-gen/tests/eye-rings.test.mjs` (lines 64–72, 74–85) @ 9ae62ff1

**Priority:** P3

#### Problem

Two tests verify "the combined operation labels regions once" by spying on a **global prototype
method** and filtering for a magic sentinel:

```js
// eye-rings.test.mjs:65-68
const fill = vi.spyOn(Int32Array.prototype, 'fill');
try {
  await scoreEyes(await goodEyeSource());
  expect(fill.mock.calls.filter(([value]) => value === -1)).toHaveLength(1);
```

This encodes two private implementation details of `lib/eye-fill.mjs`: that the label array is an
`Int32Array` initialized via `.fill(-1)` (eye-fill.mjs:54), and that nothing else on the code path
fills an Int32Array with -1 (eye-fill.mjs:105 fills with -2 — one sentinel away from a false count).
A harmless refactor — switching sentinel, using `new Int32Array(...).fill(-1)` elsewhere in a
scorer, or letting sharp/vitest internals touch a typed array — either breaks the test cryptically
or silently makes it count the wrong thing. The intent (labeling is computed once and reused)
deserves a first-class assertion, not prototype forensics.

#### Proposed solution

Assert the caching contract at a real seam. The second test already half-does this with
`expect(combined.rings).toEqual(rings)` (line 80); strengthen it to identity on the cached analysis
if the lib exposes one, or module-mock/spy the exported labeling entry point (e.g. `vi.spyOn` on the
labeling helper if it is exported from `lib/eye-fill.mjs` or `lib/regions.mjs`) and count its
invocations. If no seam exists, exporting the labeling function is a smaller commitment than pinning
`Int32Array.prototype` behavior. Keep the intent-comment; replace the mechanism.

### [Performance] Synthetic fixture builders re-draw and re-encode on every call

**File(s):** `tools/asset-gen/tests/fixtures/synthetic.mjs` (all exported builders, e.g.
`nightSource` lines 164–169) @ 9ae62ff1

**Priority:** P3

#### Problem

Every exported builder is a pure zero-argument function that allocates a 400–600 px canvas, runs a
few hundred thousand pixel writes, and pays a sharp PNG encode — yet nothing is memoized, so each
call repeats the work. `nightSource()` alone is rebuilt ~10 times across the suites (3× in
gate-redundancy's night tests via lines 107/118/124, ~5× in night-scores.test.mjs lines
38/43/50/55/62/66/72/88, 2× in invented-shapes.test.mjs lines 16/26, plus night-halo via
`haloLineArt` lines 21/28), and `goodEyeSource`/`swirlEyeSource`/the night fills are similarly
re-invoked by their own suites plus gate-redundancy. Individually a few ms each, collectively a
steady tax on a suite already dominated by scorer runtime.

#### Proposed solution

Memoize each builder at module scope — the repo convention explicitly sanctions a module-scope `let`
as "a pure memoization cache":

```js
const memo = (build) => {
  let p;
  return () => (p ??= build());
};
export const nightSource = memo(() => { ... });
```

The returned value is an encoded `Buffer` handed to sharp pipelines that only read it, so sharing
one instance across tests is safe. (If any future caller mutates a fixture buffer, that test should
build its own — worth a one-line note on `memo`.) Apply to every zero-arg export, including the
`concentricEyeSource(n)` wrappers (`goodEyeSource`/`swirlEyeSource`, lines 99–100).

### [Docs] composite-eye test header points fixture rebuilds at a gitignored, non-existent script

**File(s):** `tools/asset-gen/tests/composite-eye.test.mjs` (lines 16–17),
`tools/asset-gen/tests/fixtures/composite-eye/README.md` (lines 28–34) @ 9ae62ff1

**Priority:** P3

#### Problem

The test header says:

```js
// ... Rebuild them with
// tools/asset-gen/.coloring-samples/orb-fixtures/build-fixtures.mjs.
```

`.coloring-samples/` is the gitignored scratch dir (verified: `git check-ignore` matches the path,
and the directory does not exist in this checkout). A fresh clone cannot follow the pointer. The
fixtures README acknowledges this and instead instructs the reader to *reconstruct* the builder from
prose ("The builder used to generate this set is small and offline — reconstruct it from the
recovery commands above..."). So the two docs disagree, and the actual rebuild procedure —
recovering pre-fix assets from pinned SHAs, compositing, re-encoding at q90, re-verifying against
`manifest.json` — exists nowhere executable. These fixtures guard a real shipped-regression class;
if they ever need regenerating (e.g. a `scoreCompositeEyes` input-format change), whoever does it
starts from archaeology.

#### Proposed solution

Commit the small offline builder beside the fixtures (e.g.
`tools/asset-gen/tests/fixtures/composite-eye/build-fixtures.mjs`), have it encode the recovery SHAs
from the README as constants, and update both the test header and the README's "Rebuilding" section
to point at it. If committing it is rejected (it needs git-history access and is run ~never), then
at minimum fix the test comment to point at the README's reconstruction instructions instead of a
path that cannot exist.

### [Maintainability] audit-cli and light-fill-cli duplicate ~40 lines of mock scaffolding

**File(s):** `tools/asset-gen/tests/audit-cli.test.mjs` (lines 12–38, 44–59, 145–171),
`tools/asset-gen/tests/light-fill-cli.test.mjs` (lines 19–41, 46–69, 111–136) @ 9ae62ff1

**Priority:** P3

#### Problem

The two CLI-workflow suites independently re-implement the same harness pieces:

* the `../lib/paths.mjs` mock exposing `state.roots` through getters plus `toPosix` (audit-cli
  12–32; light-fill-cli 19–35 — same shape, different subset of dirs);
* the `../lib/cli.mjs` `importOriginal`-spread mock overriding `fail` to throw (audit-cli 33–38;
  light-fill-cli 36–41 — byte-identical);
* the `../lib/outline-match.mjs` mock returning threshold constants + a stubbed `outlineMatch` with
  overlay counting (audit-cli 44–59; light-fill-cli 46–69);
* the temp-root lifecycle: `mkdtemp` + `state.roots = {...}` in `beforeEach`,
  `rm(state.roots.root, { recursive: true, force: true })` in `afterEach` (audit-cli 145–171;
  light-fill-cli 111–136).

A change to `lib/paths.mjs`'s export surface or to the outline-match result shape must now be
mirrored in two hand-maintained mock copies; the light-fill copy already grew extra fields (`drift`)
the audit copy lacks, and the constants in each are re-declared literals (see the P2 drift finding).

#### Proposed solution

Extract a shared helper, e.g. `tools/asset-gen/tests/helpers/pipeline-harness.mjs`, exporting
`makeRoots(prefix)` / `cleanupRoots(state)` and mock-factory builders (`pathsMock(state)`,
`failThrowsCliMock`, `outlineMatchMock(state, behavior)`). `vi.mock` factories are hoisted but may
`await import(...)` inside the factory body, so each suite keeps a thin
`vi.mock('../lib/paths.mjs', async () => (await import('./helpers/pipeline-harness.mjs')).pathsMock(state))`
line while the shape lives once. Gotcha: `state` must stay in `vi.hoisted`, so the helper functions
should take it as a parameter rather than importing it.

### [Performance] golden-catalog scores the same fixture pair in both async tests

**File(s):** `tools/asset-gen/tests/golden-catalog.test.mjs` (`scoreFixture`, lines 6–12; tests at
lines 21–33, 35–42) @ 9ae62ff1

**Priority:** P4

#### Problem

`scoreFixture` runs `scoreEyeFill` + `scoreGoldenNightEyes` over the full-resolution composite-eye
fixtures (~550 ms per fixture). The regression-direction test (lines 21–33) and the
improvement-direction test (lines 35–42) each compute the identical `unicorn-tall` /
`stegosaurus-tall` pair — the only difference is the argument order to `diff()`. Measured: 1125 ms +
1136 ms, half of it duplicate work.

#### Proposed solution

Score the pair once in a `beforeAll` (or memoize `scoreFixture` the same way as proposed for
composite-eye.test.mjs) and let both direction tests diff the shared results. The score objects are
treated as read-only by `diffGoldenPage`, so sharing is safe.

### [Maintainability] gate-redundancy leans on a mutable module `src` closure and states the broken/good split twice

**File(s):** `tools/asset-gen/tests/gate-redundancy.test.mjs` (lines 85–103) @ 9ae62ff1

**Priority:** P4

#### Problem

The night gates close over a `let src` (line 85) that every test must remember to assign first
(`src = await F.nightSource()` at lines 106, 117, 123). A new test that forgets the assignment
silently reuses the previous test's value — or `undefined` under test isolation/reordering — and the
gates would score against garbage rather than fail loudly. Separately, each fixture's broken/good
classification is stated twice: as a trailing comment on the fixtures object (lines 58–63, 95–101,
e.g. `driftSubBlob: F.nightFillDriftSubBlob, // broken → drift only`) and again as string arrays
(`broken` at lines 65/103, `good` at line 66). The two encodings can drift; the comments are the
kind of restated-fact prose the repo conventions warn about.

#### Proposed solution

Make `src` explicit — either pass it into the gate functions
(`gates = { nightness: async (fill, src) => ... }` with `catchMatrix(gates, fixtures, src)`) or
hoist it into the group's `beforeAll` alongside the shared-matrix change proposed above. Fold the
classification into one table and derive the arrays:

```js
const fixtures = {
  daytime: { mk: F.nightFillDaytime, broken: true },
  ...
};
const broken = Object.keys(fixtures).filter((f) => fixtures[f].broken);
```

The `// → drift only` attribution comments carry real WHY and can stay.

### [Testing] Global sharp mock exists for one call-count assertion that pins decode counts

**File(s):** `tools/asset-gen/tests/night-scores.test.mjs` (mock at lines 31–34; assertion at
line 81) @ 9ae62ff1

**Priority:** P4

#### Problem

The whole file wraps sharp in a pass-through `vi.fn` (lines 31–34) so that a single test can count
constructor calls:

```js
// night-scores.test.mjs:81
expect(sharp.mock.calls.filter(([input]) => input === source)).toHaveLength(2);
```

Every other test in the file pays the mock for nothing, and the assertion pins an exact decode count
(`2`) that is an implementation detail: a refactor that decodes the source *once* — an improvement
fully aligned with the repo's "scorers accept a shared prepared analysis, never re-decode" rule —
fails this test, while a regression from 2 to 3 fails it too (the useful direction). The test's name
("one shared 512px source preparation") and its expected count of 2 also read as contradictory to a
first-time reader, with no comment explaining which two decodes are the sanctioned ones.

#### Proposed solution

Keep the guard but make it directional and documented: assert `...toHaveLength` with a named
constant like `EXPECTED_SOURCE_DECODES = 2` plus a WHY comment naming the two pipelines (outline
mask + luma prep), or better, assert `toBeLessThanOrEqual(2)` so improvements don't trip it.
Alternatively drop the sharp mock and assert the contract through the seam that exists for it —
`prepareSourceScore` — e.g. that `scoreNightFillGates` accepts/uses a prepared source (spy on
`prepareSourceScore` via a scoped module mock in just this test using `vi.doMock` + dynamic import).

### [Readability] cli.test.mjs duplicates the spawnSync invocation and repeats three command cases across its two matrices

**File(s):** `tools/asset-gen/tests/cli.test.mjs` (lines 206–218, 239–250; duplicate cases at
144–148 vs 222–226 and 149–153 vs 232–236) @ 9ae62ff1

**Priority:** P4

#### Problem

The two `it.each` blocks each hand-build the same subprocess invocation —
`spawnSync(process.execPath, ['--experimental-strip-types', join(import.meta.dirname, '..', 'bin', script), ...args], { encoding: 'utf8', env })`
— differing only in whether `GEMINI_API_KEY` is set or deleted (lines 207–214 vs 242–246). Meanwhile
three cases appear verbatim in both matrices:
`gen-coloring-chalk.mjs ['nature/ant-tall','--dry-run','--temperature','invalid']` (145–148 and
223–226) and `normalize-outline-strokes.mjs` with the same args (150–153 and 233–236). Each
duplicate costs a ~370 ms subprocess on every run. The with-key copy adds coverage only if a
present-but-unused key could change the diagnostic; if that's the intent, nothing says so.

#### Proposed solution

Extract `function runBin(script, args, { withKey }) { ... }` that owns the
`--experimental-strip-types` flag, the path join, and the env construction (including the
`NODE_NO_WARNINGS: '1'` repeated at 212 and 240). Then either drop the with-key duplicates from
`commandCases` (the offline matrix already proves the parser is reached and emits the canonical
diagnostic) or keep them with a one-line comment stating the property the redundancy buys ("a
present key must not change arg-parse diagnostics").

### [Maintainability] synthetic.mjs duplicates its drawing primitives in mono and RGB variants

**File(s):** `tools/asset-gen/tests/fixtures/synthetic.mjs` (`px`/`disc`/`ring` lines 24–40 vs
`setRGB`/`discRGB`/`ringRGB` lines 133–154) @ 9ae62ff1

**Priority:** P4

#### Problem

The grayscale and color primitive sets are structural clones: `ring` (lines 33–40) and `ringRGB`
(lines 142–149) share the identical bounding-box loop and annulus predicate, `disc` (28–32) and
`discRGB` (150–154) likewise, and `px` (24–27) is `setRGB(c, x, y, v, v, v)` spelled out. A future
fix to the annulus math (e.g. the `rin` clamp when `t > r`) must be applied twice or the mono/RGB
fixtures silently diverge in edge geometry.

#### Proposed solution

Implement the mono set on the RGB core:

```js
const px = (c, x, y, v) => setRGB(c, x, y, v, v, v);
const disc = (c, cx, cy, r, v = 0) => discRGB(c, cx, cy, r, v, v, v);
const ring = (c, cx, cy, r, t = 3, v = 0) => ringRGB(c, cx, cy, r, t, v, v, v);
```

This requires hoisting the RGB primitives above the mono section (or converting all to function
declarations, which hoist anyway). No behavior change; the section-banner comments can shrink
accordingly.

### [Readability] eye-fill's `scored()` helper hides an assertion and recomputes three scorer runs per test

**File(s):** `tools/asset-gen/tests/eye-fill.test.mjs` (`scored`, lines 23–30) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
async function scored() {
  const src = await goodEyeSource();
  expect((await findEyeCores(src)).cores.length).toBeGreaterThan(0);
  return { lively: ..., flooded: ... };
}
```

Two issues. (1) An `expect` buried inside a shared helper means every one of the five tests that
call `scored()` silently re-runs the finder sanity check; when it fails, the failure is attributed
to whichever test happened to run, not to a test named for the property ("the finder must detect
cores"). The header comment (lines 10–12) documents the intent, but a dedicated
`it('the finder detects cores in the synthetic source')` would express it directly. (2) `scored()`
is called by five tests (lines 34, 41, 49, 55, 64) and each call runs `findEyeCores` + two
`scoreEyeFill` passes over 600×600 fixtures (~190 ms/test measured) — deterministic results
recomputed five times.

#### Proposed solution

Promote the sanity check to its own test, and memoize the scored pair (module-scope promise cache or
`beforeAll`):

```js
let pair; // { lively, flooded }
beforeAll(async () => {
  pair = await buildScoredPair();
});
```

The results are read-only score objects; sharing is safe. This cuts ~0.7 s and makes the
finder-sanity property greppable by test name.

### [Testing] gemini.test.mjs buries model-id and timeout pins inside an unrelated behavior test

**File(s):** `tools/asset-gen/tests/gemini.test.mjs` (lines 30–31) @ 9ae62ff1

**Priority:** P5

#### Problem

In the middle of "sends image bytes before the prompt with optional temperature":

```js
expect(IMAGE_MODEL).toBe('gemini-3.1-flash-image');
expect(IMAGE_TIMEOUT_MS).toBe(120_000);
```

These pin two constants that have nothing to do with the request-shape behavior under test. When a
model migration bumps `IMAGE_MODEL`, the failure will be reported as "sends image bytes before the
prompt..." — a misleading name for a deliberate constant change. (Issue #566 tracks centralizing
these constants in source; regardless of where they end up, the pin belongs in a test named for it.)

#### Proposed solution

Move the two assertions into a dedicated `it('pins the image model id and timeout', ...)` so a
migration diff touches a test whose name says exactly what changed — or drop them if the pin adds no
value beyond the source constant itself (the request-shape test already asserts `model: IMAGE_MODEL`
by reference).

### [Readability] expectFailure's positional parameter list forces `undefined` placeholders at call sites

**File(s):** `tools/asset-gen/tests/cli.test.mjs` (`expectFailure`, lines 27–31; call sites at
41–48, 62–69, 81–88) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
function expectFailure(parse, raw, name, fallback, source, message) { ... }
```

Two of the three call sites pass `undefined` for `source` positionally (lines 45 and 67), and a
reader at the call site cannot tell what `3` or `undefined` mean without jumping to the signature:

```js
expectFailure(parsePositiveInt, raw, '--samples', 3, undefined, `--samples must be ...`);
```

#### Proposed solution

Take the parser args as a trailing options object or rest tuple:
`expectFailure(parse, message, ...parseArgs)` — the call becomes
`expectFailure(parsePositiveInt, msg, raw, '--samples', 3)`, mirroring the real
`parse(raw, name, fallback, source)` call order with no placeholder. Only worth doing while touching
the file for the other cli.test.mjs findings.

### [Readability] PNG signature asserted as unexplained magic bytes

**File(s):** `tools/asset-gen/tests/outline-match.test.mjs` (line 30) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
expect(r.overlay.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
```

The eight bytes are the PNG file signature, but nothing says so — a reader must recognize
`137 80 78 71` ("‰PNG") on sight. The repo convention names tuning/boundary literals.

#### Proposed solution

`const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);` at module
scope (hex makes the ASCII visible), then
`expect(r.overlay.subarray(0, 8)).toEqual(PNG_SIGNATURE);`.

### [Readability] addOutline derives the parent directory with `join(path, '..')` instead of `dirname`

**File(s):** `tools/asset-gen/tests/outline-targets.test.mjs` (`addOutline`, lines 9–14) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
await mkdir(join(path, '..'), { recursive: true });
```

`join(path, '..')` works, but it makes the reader resolve the `..` mentally; `dirname(path)` states
the intent (`node:path` is already imported one symbol away).

#### Proposed solution

Import `dirname` alongside `join` and use `await mkdir(dirname(path), { recursive: true });`.

### [Maintainability] audit-cli's corrupt/drift sentinels are bare strings coordinated across three sites

**File(s):** `tools/asset-gen/tests/audit-cli.test.mjs` (`assertReadable` lines 8–10, `outlineMatch`
mock line 51, `addPage` lines 134–135) @ 9ae62ff1

**Priority:** P5

#### Problem

The string `'corrupt'` links `assertReadable` (line 9:
`if (buffer.toString() === 'corrupt') throw ...`) to `addPage`'s file contents (line 134), and
`'drift fill'` links the outline-match mock (line 51) to `addPage` (line 135). The coordination is
invisible at each site — a typo in one produces tests that pass vacuously (a "corrupt" page that
scores clean) rather than fail loudly.

#### Proposed solution

Name them once at module scope — `const CORRUPT_BYTES = 'corrupt';` /
`const DRIFT_FILL_BYTES = 'drift fill';` — and reference the constants from all three sites. Small,
but it turns a stringly-typed protocol into a greppable one.

### [Readability] Bare positional `1` for dilateMask's out-of-bounds flag

**File(s):** `tools/asset-gen/tests/morphology.test.mjs` (line 50) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const expandedBorder = dilateMask(empty, w, h, 1, 1);
```

The fifth argument is `outOfBounds` (lib/morphology.mjs:44, default 0) — here set to 1 meaning
"treat off-image pixels as set". Two adjacent `1`s with different meanings (radius, then a
boolean-ish flag) force a trip to the lib signature; the test title explains it but the call site
doesn't.

#### Proposed solution

A local named value: `const OUT_OF_BOUNDS_SET = 1;` then
`dilateMask(empty, w, h, 1, OUT_OF_BOUNDS_SET)`. (Changing the lib to an options bag is out of this
section's scope; the local name is enough.)

### [Maintainability] eye-rings' exact-object pins hard-code fixture geometry defined in synthetic.mjs

**File(s):** `tools/asset-gen/tests/eye-rings.test.mjs` (lines 43–61) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
expect(good.rings).toEqual({
  maxDepth: 3,
  worst: { x: 300, y: 300, depth: 3 },
  ...
});
```

The center `(300, 300)`, the bbox `259–341`, and depths 3/5 all derive from `concentricEyeSource`'s
geometry in synthetic.mjs (canvas 600, center 300, rings `12 + k * 8`, and the
`goodEyeSource`/`swirlEyeSource` ring counts at lines 96–100). Nothing links the two files: nudging
the fixture (e.g. to satisfy another suite after memoization consolidation) breaks these tests with
raw coordinate diffs and no pointer to where the numbers come from.

#### Proposed solution

Export the shared geometry from synthetic.mjs (`export const EYE_CENTER = 300;`, ring counts as
named constants used by `goodEyeSource`/`swirlEyeSource`) and build the expected objects from them —
or relax the pins to the properties that matter (`maxDepth`, `worst.depth`, `overDeep.length`,
`passes`) and let the center coordinates be asserted approximately. The exact-`toEqual` regression
value is real, so option one (derive, don't loosen) is preferable.

### [Testing] light-fill-cli hand-rolls env save/restore and leaves console.error unmuted

**File(s):** `tools/asset-gen/tests/light-fill-cli.test.mjs` (lines 95, 126–128, 131–133) @ 9ae62ff1

**Priority:** P5

#### Problem

The file saves and restores `GEMINI_API_KEY` manually
(`const originalKey = process.env.GEMINI_API_KEY` at line 95; conditional delete/restore at 132–133)
while its sibling `cli.test.mjs` uses vitest's `vi.stubEnv` / `vi.unstubAllEnvs` for the same job
(cli.test.mjs:119, 24) — two patterns for one need within the same suite directory. Separately,
`beforeEach` mutes `console.log` and `process.stdout.write` (lines 127–128) but not `console.error`,
so the failure-path tests (`retains failed candidates...`, `fails closed...`) can leak the
generator's error reporting into vitest output noise — audit-cli.test.mjs mutes both (lines
162–163).

#### Proposed solution

Replace the manual save/restore with `vi.stubEnv('GEMINI_API_KEY', 'test')` in `beforeEach` +
`vi.unstubAllEnvs()` in `afterEach`, and add
`vi.spyOn(console, 'error').mockImplementation(() => {})` beside the existing log spies (asserting
on it where the failure-path tests currently rely on the thrown `RenderFailuresError` alone, if the
printed report is worth pinning).

## Source: Code audit — tools/asset-gen — ideas-exploration, legacy & sample assets

### [Docs] Fix ~18 broken relative links in legacy/README.md (`../pipeline.md`, `../pipeline-assets/`)

**File(s):** `tools/asset-gen/legacy/README.md` (lines 6, 17, 30, 32, 55, 59, 72, 83, 88,
101–107, 115) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — the partial-move story checks out (line 72's sibling
> `../docs/pen-chalk-fork.md` link is correct). The count is understated: there is a 6th
> `../pipeline.md` reference at line 14 (a code span, not a link), and 23 raw occurrences total
> rather than 18.

#### Problem

`legacy/README.md` is the canonical chronicle of the retired dark-mode approaches —
`docs/pipeline.md` line 7 and the folder CLAUDE.md both send readers here. But most of its relative
links point at paths that do not exist. The pipeline doc and its assets live under
`tools/asset-gen/docs/`, yet the README links one level too high:

* Line 6: "The current pipeline lives one level up: [`../pipeline.md`](../pipeline.md)" —
  `tools/asset-gen/pipeline.md` does not exist (the file is `docs/pipeline.md`). Same broken target
  again on line 72.
* Line 17: "Illustrations reference the frozen copies in
  [`../pipeline-assets/`](../pipeline-assets/)" — the directory is `docs/pipeline-assets/`.
* Every one of the ~15 illustration embeds uses the same wrong prefix, e.g. line 30:

```markdown
| ![owl with white goggle eyes](../pipeline-assets/problem-invert-owl.webp) |
![owl raw night fill with correct amber eyes](../pipeline-assets/problem-rawfill-owl.webp) |
```

(also lines 32, 55, 59, 83, 88, and the failure-gallery table at 101–107 and 115). None of these
images render on GitHub or in an editor preview — the entire "eye problem" failure gallery, which
`docs/pipeline.md` line 359 explicitly tells gate authors to consult ("the shipped failure gallery
that motivated each gate is in `legacy/README.md`"), is invisible.

The same sentence on line 7 correctly links `../docs/pen-chalk-fork.md`, proving the docs were moved
into `docs/` and this file was only partially updated. `legacy/README.md` is not ruler-generated (no
`<!-- Source -->` marker), so it is edited in place.

#### Proposed solution

Mechanical fix: `../pipeline.md` → `../docs/pipeline.md` and `../pipeline-assets/` →
`../docs/pipeline-assets/` throughout (18 occurrences). Consider adding a tiny repo-script test
(pattern of `scripts/tests/*`) that walks `tools/asset-gen/**/*.md` and asserts every relative
link/image target exists — this class of breakage has now happened once and the docs tree moves
around; a link check would also have caught the `night-fills.md` and `pipeline.md` findings below.

### [Maintainability] Prune the full-resolution working-set images committed under ideas-exploration (~34 MB)

**File(s):** `tools/asset-gen/ideas-exploration/idea-16/work/` (~14 MB),
`tools/asset-gen/ideas-exploration/idea-15/{hotspots,compare,img,regionmean}/` (~11 MB, 285 PNGs),
plus smaller sets in `idea-18/work/`, `idea-2/`, `idea-12/img/` @ 9ae62ff1

**Priority:** P2

#### Problem

`ideas-exploration/` weighs 63 MB. Its own README (lines 122–129) defines the per-idea contract:
`report.md`, `meta.json`, `code/`, and "`*.webp` … before/after evidence (≤560 px)". But several
ideas committed their entire full-resolution working sets wholesale:

* `idea-16/work/` — 14 MB of full-res takes and composites for an idea whose Status is **NOT
  PROMOTED**; the decisive evidence is already inlined at 480 px (report line 156–162 names the
  ≤480px webp files and then says "Full-resolution takes and all composites are in `work/`").
* `idea-15/` — 12 MB for another **NOT PROMOTED** idea: four image dirs (`hotspots/`, `compare/`,
  `img/`, `regionmean/`) full of uncompressed PNGs (285 PNGs totalling 29 MB across the folder vs 13
  MB for all 416 webps).
* A scripted cross-check found 442 image files (~34 MB) referenced by neither any `meta.json` (what
  `build-review.mjs` inlines into the dashboard) nor individually by any `report.md` — they are
  covered at best by a directory-level "everything else is in work/" sentence.

This is committed R&D scratch, so the bar is "dead weight worth pruning": every clone, and every
future `git` operation, carries 30+ MB of full-res exploration outputs whose conclusions are already
captured in the ≤560 px evidence, the reports, and the 5 MB dashboard.

#### Proposed solution

For each idea, keep exactly what the README contract promises — the report, meta.json, code, and the
small webp evidence the report/meta reference — and delete the wholesale full-res dirs (or, where a
dir genuinely earns its keep, downsize to ≤560 px webp like the rest of the folder). `idea-16/work/`
and `idea-15/`'s three of four PNG dirs are the big wins. Update the affected reports' "evidence
files" sections in the same commit. Gotcha: history still carries the bytes — that's acceptable; the
goal is checkout/clone weight and honoring the folder's own layout contract, not history rewriting.

### [Docs] legacy/night-fills.md's live pointers are broken and its "still accurate" claims are stale

**File(s):** `tools/asset-gen/legacy/night-fills.md` (lines 5, 12–13, 15, 20, 145–151, 187) @
9ae62ff1

**Priority:** P3

#### Problem

The doc's body is deliberately frozen, but its **retirement banner makes live claims**, and those
are wrong at HEAD:

* Lines 5, 13, 15 point to the live runbook as `../pipeline.md` — same broken path as the legacy
  README (`docs/pipeline.md` is the real location).
* Line 12: "Owner script: `tools/asset-gen/gen-coloring-fills-dark.mjs` (still the active
  generator…)" — the active generator lives at `tools/asset-gen/bin/gen-coloring-fills-dark.mjs`;
  the stated path has no file.
* Line 20 claims "the gate documentation and the ship/wire steps are still accurate", but the ship
  steps invoke tooling that no longer exists: `npm run gen:contact-sheet` (lines 145–146) was
  retired into `gen:coloring-book-proof-sheet`, the referenced `contact-sheet.md` (line 151) does
  not exist anywhere in the repo, and line 187 runs `node tools/asset-gen/gen-coloring-thumbs.mjs`
  (now under `bin/`). A session following the banner's "still accurate" pointer into those steps
  hits dead commands.

#### Proposed solution

Fix the banner only (the frozen body can stay verbatim): correct the three `../pipeline.md` pointers
to `../docs/pipeline.md`, fix the owner-script path to `bin/gen-coloring-fills-dark.mjs`, and narrow
line 20's claim — e.g. "the gate documentation is still accurate; the ship/wire mechanics have moved
to `../docs/pipeline.md` (the contact sheet became the coloring-book proof sheet)". That keeps the
historical record honest about what is history and what is live.

### [Docs] Dangling "ISSUES #N" references — the numbering's source file was deleted

**File(s):** `tools/asset-gen/docs/gate-redundancy.md` (lines 89, 91, 93, 95),
`tools/asset-gen/docs/fresh-outline-regen.md` (lines 9, 57, 64) @ 9ae62ff1

**Priority:** P3

#### Problem

Both docs identify gate blind spots by numbers from the retired `tools/asset-gen/ISSUES.md`, which
no longer exists (the backlog moved to GitHub issues labeled `area:asset-gen`; the folder CLAUDE.md
documents the move). Unlike "IDEAS #N" — which stays resolvable because
`ideas-exploration/idea-N/report.md` preserves the numbering — "ISSUES #N" is now unresolvable
without archaeology in git history:

```markdown
* **Invention *inside* the subject** (ISSUES #7, #8): `detectInventedShapes` scans only the open
* **Hero-region ↔ background contrast** (ISSUES #6): a fill can paint the subject a colour
* **Chalk whitening on solid-pen-eye pages** (ISSUES #8): a solid pen pupil has no nested rings, so
* **Palette / motif coherence across light↔night and tall↔wide** (ISSUES #11, #12): each fill is an
```

(gate-redundancy.md 89–95; fresh-outline-regen.md cites "ISSUES #6 caveat", "ISSUES #1", "ISSUES
#9"). gate-redundancy.md's negative-space section is exactly the list a session consults before
trusting a gate, and each entry now points at nothing. Several have live GitHub successors (e.g.
"Chalk whitening on solid-pen-eye pages" is issue 271; "false-positive suppressions to
judgeLightEyes" is issue 269).

#### Proposed solution

Replace each `ISSUES #N` with either the live GitHub issue number (where a successor exists —
`#271`, `#269`, …) or drop the parenthetical entirely and let the prose class name stand (the
blind-spot descriptions are self-contained). Note per repo convention these are repo docs, not
GitHub comment bodies, so bare `#N` references are fine here but will auto-link if the text is ever
pasted into an issue.

### [Architecture] crayon-brush-samples contradicts the folder's path rules — hardcoded `../../..` walks and repo-root `scripts/lib` imports

**File(s):** `tools/asset-gen/crayon-brush-samples/build-sheet.mjs` (lines 13–24),
`build-compare-sheet.mjs` (lines 15–26), `capture-current.mjs` (lines 19–24), `gen.mjs` (line 18),
`to-webp.mjs` (lines 8–11); claim at `tools/asset-gen/docs/README.md` (lines 26–28) @ 9ae62ff1

**Priority:** P3

#### Problem

The folder's documented invariant is explicit. `tools/asset-gen/CLAUDE.md`: "Paths go through
`lib/paths.mjs`… don't hardcode `../../..` walks or import from the repo-root `scripts/lib/`."
`docs/README.md` lines 26–28 states it as fact: "so the scripts **never** hardcode `../../..` walks
or reach back into the repo-root `scripts/lib/`." `docs/architecture.md` line 63–65 repeats it.

Every script in `crayon-brush-samples/` violates both halves:

```js
// build-sheet.mjs lines 13–24
import { chromeStyle, inlineImage, masthead, page, siteFooter } from '../../../scripts/lib/scrapbook-chrome.mjs';
import { argFlag } from '../../../scripts/lib/proc.mjs';
…
const OUT = join(HERE, '../../../scrapbook/crayon-brush-samples');
```

`capture-current.mjs` additionally imports `../../../scripts/lib/playwright.mjs`; `gen.mjs` and
`to-webp.mjs` hardcode the `../../../scrapbook/...` walk. So either the rule has an undocumented
carve-out for scrapbook tooling, or these scripts are in the wrong place / wired the wrong way.
Today a reader of the docs gets a false invariant, and the next scrapbook-adjacent tool will copy
whichever pattern it finds first.

#### Proposed solution

Two consistent options; pick one and update the docs to match:

1. Add `SCRAPBOOK_DIR` (and, if kept, a screenshots scratch constant) to `lib/paths.mjs` and route
   the crayon scripts through it, then document `scripts/lib/scrapbook-chrome.mjs` / `proc.mjs` /
   `playwright.mjs` as a sanctioned import surface (the scrapbook chrome is the repo-wide standard
   for published sheets — asset-gen genuinely should not fork it).
2. Or scope the CLAUDE.md/README/architecture claims to the *pipeline* scripts (`bin/`, `lib/`) and
   note that scrapbook-publishing tools deliberately use the repo-root scrapbook helpers.

Option 1 is stronger: it keeps one true rule and fixes the `coloring-book-proof-sheet.css` palette
contradiction below for free.

### [Maintainability] Proof-sheet CSS palette "kept in sync by eye" — the repo's own convention calls this a defect

**File(s):** `tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.css` (lines
1–3) @ 9ae62ff1

**Priority:** P3

#### Problem

```css
/* Palette kept in sync by eye with the shared scrapbook chrome
   (scripts/lib/scrapbook-chrome.mjs) — asset-gen can't import across that boundary.
   --accent is the site's interactive blue; --gold is the warm "shipped/source" tag. */
```

Root CLAUDE.md is explicit: "Cross-file agreement is never maintained by prose… A 'keep in sync with
X' comment marks a defect, not a mitigation" — the prescribed fix when the agreeing sites can't
share code is a drift-guard test. And the stated justification is false: sibling scripts in the same
`tools/asset-gen/` folder (`crayon-brush-samples/build-sheet.mjs` line 13) *do* import
`scripts/lib/scrapbook-chrome.mjs`, so the boundary is crossable. The proof-sheet generator
(`bin/gen-coloring-book-proof-sheet.mjs`) is a Node script assembling HTML — it could source the
palette values at build time.

#### Proposed solution

Either (a) have the generator read the token values from `scrapbook-chrome.mjs` (export the palette
as a data object there) and inject them as the `:root` custom-property block, keeping the rest of
the CSS static; or (b) keep the CSS self-contained but add a drift-guard test (pattern of
`web/src/app.html.test.ts`) that parses the `--accent`/`--gold`/`--paper`… declarations out of both
files and fails on divergence. Either way delete the "kept in sync by eye" comment. If the palettes
are actually allowed to diverge (the proof sheet is its own surface), say *that* instead — but then
the comment shouldn't claim sync at all.

### [Correctness] retouch-line-art.mjs double-encodes its output, silently discarding WEBP_QUALITY

**File(s):** `tools/asset-gen/legacy/retouch-line-art.mjs` (`normalize` lines 112–119, write at
lines 134–137) @ 9ae62ff1

**Priority:** P3

#### Problem

`normalize()` already produces the final webp at the tool's declared quality:

```js
async function normalize(buf, width, height) {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .linear(1.25, -18)
    .webp({ quality: WEBP_QUALITY }) // 92
    .toBuffer();
}
```

but the write path then runs the encoded buffer through sharp again:

```js
const out = await normalize(edited, width, height);
…
await sharp(out).toFile(dest);
```

`sharp(out).toFile('*.webp')` decodes the q92 webp and re-encodes it with sharp's **default** webp
quality (80). Net effect: two lossy generations, and the `WEBP_QUALITY = 92` constant (line 42) is
dead — the shipped candidate is q80 of a q80-decoded q92 image. This is a kept-runnable tool (the
README markets its `--instruction` mode as the template for one-off line-art edits), so the defect
propagates into any future edit built from this template. Extra risk for this tool specifically:
line-art candidates get copied over `*.outline.webp`, where compression ringing on edges is exactly
what the chalk-crisping decision record documents as harmful.

#### Proposed solution

Replace the re-encode with a plain write:

```js
import { writeFile } from 'node:fs/promises';
…
await writeFile(dest, out);
```

(`mkdir` already precedes it). One-line fix; behavior otherwise identical.

### [Maintainability] idea-21 carries 12.6 MB of regenerable proof-sheet HTML for a LANDED feature

**File(s):** `tools/asset-gen/ideas-exploration/idea-21/farm-compare-46bc770.html` (6.9 MB),
`idea-21/farm-git-46bc770.html` (5.7 MB); smaller: `owl-tall-compare-34a606f-prerename.html`,
`owl-tall-compare-6e3f14f.html` @ 9ae62ff1

**Priority:** P3

#### Problem

Idea 21's Status is LANDED: `--source git:<ref>` is now a first-class mode of
`bin/gen-coloring-book-proof-sheet.mjs` (report line 3). The folder nonetheless commits four
self-contained demo sheets, two of them whole-category farm sheets at ~6–7 MB each — 12.6 MB, the
single largest weight in `ideas-exploration/` (15 MB total). Unlike NOT-PROMOTED evidence, these
prove nothing that can't be reproduced in ~3 s offline by the shipped tool
(`npm run gen:coloring-book-proof-sheet -- farm --source git:46bc770`); the small `pair-*.webp`
crops and `overview-owl-compare.webp` already document the outcome visually. The repo also has a
designated home for keeper run outputs — `/scrapbook` (ADR-0059) — and these aren't published there
either; they're dead bytes in a frozen R&D folder.

#### Proposed solution

Delete the four HTML sheets (certainly the two farm ones) and let the report's "how to reproduce"
line plus the committed webp crops carry the record; update `idea-21/report.md` and the folder
README's layout note ("idea-21 carries generated comparison sheets") in the same commit. If one
exemplar sheet is genuinely worth keeping browsable, publish the smallest owl sheet via
`npm run scrapbook:publish` instead of storing it here.

### [Maintainability] idea-24 commits 14 byte-identical copies of already-shipped assets

**File(s):** `tools/asset-gen/ideas-exploration/idea-24/assets/**` (14 files, ~1.1 MB) @ 9ae62ff1

**Priority:** P3

#### Problem

Idea 24 (complete the orphan pages) LANDED: heart-wide and umbrella-tall ship from
`web/static/coloring/` and `tools/asset-gen/fill-src/`. The frozen folder still carries an `assets/`
tree mirroring both live locations, and every file is byte-identical to the live tree (verified with
`cmp`: all 10 `web/static/coloring/...` copies and all 4 `fill-src/...` raw copies match). The
duplication made sense while the idea was un-promoted (the folder was the only home); now it's pure
redundancy with a misleading edge: the copies will silently diverge from the live tree the first
time either page regenerates, and a future reader has no way to tell whether `idea-24/assets/` is
"the shipped bytes" or "an older take" without diffing.

#### Proposed solution

Delete `idea-24/assets/` and note in `idea-24/report.md` that the finished assets live at their
canonical paths (the report's Status line already says this). The `gen/` dir (outline candidates and
previews that never shipped) is genuine evidence and stays. Fold into the same commit as the other
ideas-exploration pruning.

### [Docs] pipeline.md has an empty link target: `[docs/]()`

**File(s):** `tools/asset-gen/docs/pipeline.md` (line 10) @ 9ae62ff1

**Priority:** P4

#### Problem

```markdown
Companion docs: `README.md` (runbook), `coloring-book-proof-sheet.md` (review surface), the decision
records in [`docs/`]() — [pen/chalk fork](pen-chalk-fork.md),
```

`[`docs/`]()` is a Markdown link with an **empty** URL — it renders as a link to the current page
(or as broken markup, viewer-dependent). Presumably a leftover from the docs-folder move. Also
slightly off conceptually: pipeline.md itself lives in `docs/`, so "the decision records in `docs/`"
pointing anywhere is redundant — the individual record links that follow already do the job.

#### Proposed solution

Drop the link wrapper: "…the sibling decision records — [pen/chalk fork](pen-chalk-fork.md), …".
One-line change.

### [Docs] pen-chalk-fork.md points the alternatives chronicle at pipeline.md; it lives in legacy/README.md

**File(s):** `tools/asset-gen/docs/pen-chalk-fork.md` (lines 24–25) @ 9ae62ff1

**Priority:** P4

#### Problem

```markdown
Alternatives evaluated for dark mode (chronicled with illustrations in
`tools/asset-gen/docs/pipeline.md`): a build-time morphological classifier …
```

The illustrated alternatives table (options A–D, with the option-A prototype screenshots) is in
`tools/asset-gen/legacy/README.md` ("Alternatives considered and rejected for dark mode", lines
74–90), not in pipeline.md — pipeline.md itself defers to legacy for exactly this chronicle (line
41–42: "…is chronicled in `legacy/README.md`"). A reader sent to pipeline.md for the illustrations
won't find them.

#### Proposed solution

Change the pointer to `tools/asset-gen/legacy/README.md`. (Once the legacy README's broken image
links are fixed — the P2 finding — the illustrations will actually render there too.)

### [Maintainability] Duplicate identical JSON committed twice within idea-15 and idea-18

**File(s):** `tools/asset-gen/ideas-exploration/idea-15/hotspots.json` vs
`idea-15/hotspots/hotspots.json`;
`idea-18/code/{creatures-mermaid-tall,objects-balloon-tall,shapes-circle-tall}-plan.json` vs the
same three names under `idea-18/work/` @ 9ae62ff1

**Priority:** P4

#### Problem

`diff -q` confirms each pair is byte-identical. idea-15 commits `hotspots.json` both at the idea
root and inside `hotspots/`; idea-18 commits its three color-plan JSONs in both `code/` (presented
as the re-appliable artifact) and `work/` (the run dir). Frozen records are read by future sessions
deciding whether to promote an OPEN idea (idea-18 *is* OPEN) — two copies with no marked canonical
one invites reading the wrong file if they ever diverge, and pads the record for no benefit.

#### Proposed solution

Keep one canonical copy each: `idea-15/hotspots.json` at the root (where `report.md` line 163's
evidence list points) and the plans under `idea-18/code/` (the "working code" home the README layout
defines); delete the duplicates. Verify `report.md`/`meta.json` don't reference the removed paths
before deleting.

### [Maintainability] Crayon stage vocabulary triplicated — and the samples.mjs copy already drifted (missing stage 6)

**File(s):** `tools/asset-gen/crayon-brush-samples/samples.mjs` (header lines 1–10, stage arrays
through line 174), `build-sheet.mjs` (`STAGES`, lines 26–57), `README.md` (table lines 16–23) @
9ae62ff1

**Priority:** P4

#### Problem

The stage list (prefix → name → what it pins down) exists three times: the README table,
`build-sheet.mjs`'s `STAGES` array, and `samples.mjs`'s header comment. The comment has already
drifted — it enumerates stages 1–5:

```js
// Reference sample specs for the crayon brush mode. Grouped in progressive
// stages so the set can be generated and reviewed incrementally:
//   1-  single lines (one crayon stroke per color)
//   …
//   5-  fills & swatches (area coverage, texture at a glance)
```

while the file itself defines `stage6` (macro close-ups, lines 160–172) and exports it in `SAMPLES`
(line 174), and the README/build-sheet both list six stages. This is the exact drift class the root
conventions call out (comments restating facts owned elsewhere; cross-file agreement by prose).

#### Proposed solution

Make `samples.mjs` the single owner: export a `STAGES` array (`[{ prefix, heading, blurb }]`) beside
`SAMPLES`, import it in `build-sheet.mjs`, and cut the header comment's stage enumeration down to
"grouped in progressive stages — see STAGES". The README table stays as human prose but then has one
code source to check against.

### [Maintainability] Reference-scene IDs are string-coupled between capture-current.mjs and build-compare-sheet.mjs

**File(s):** `tools/asset-gen/crayon-brush-samples/capture-current.mjs` (shot names, lines 91–135),
`build-compare-sheet.mjs` (`SCENES` ids, lines 29–60; inline at lines 81–82) @ 9ae62ff1

**Priority:** P4

#### Problem

`build-compare-sheet.mjs` hard-fails (ENOENT inside `inlineImage`) unless `RENDERS` contains a PNG
for every id in its `SCENES` array; those ids must exactly match the `shot('…')` string literals
scattered through `capture-current.mjs` (and, on the reference side, the ids in `samples.mjs`).
Nothing ties the three together — renaming a scene in one file breaks the other with a raw fs error,
and today the coupling is already lossy: `capture-current.mjs` captures nine scenes (`1-line-blue`,
`1-line-green`, `2-buildup-red`, `3-cross-red-blue` among them) of which the compare sheet uses only
five, so four captures are dead work with no consumer.

#### Proposed solution

Export one `COMPARE_SCENES` list from a shared module (natural home: `samples.mjs`, whose ids are
already the root vocabulary) shaped `{ id, title, notes, capture: (helpers) => … }` or minimally
`{ id, title, notes }`, and have `capture-current.mjs` iterate it for its shots while
`build-compare-sheet.mjs` iterates it for its sections. That makes add/rename a one-place edit and
either gives the four extra captures a consumer or makes their deliberate extra-ness explicit.

### [Docs] night-fills.md's ordered workflow list is mangled — steps 3 and 4 fused into preceding paragraphs

**File(s):** `tools/asset-gen/legacy/night-fills.md` (lines 195–198, 220–225) @ 9ae62ff1

**Priority:** P4

#### Problem

The "Per-category workflow" numbered list (1 Generate, 2 Build the contact sheet, …) loses its
structure midway: item 3 appears inline at the end of an unrelated parenthetical paragraph —

```markdown
…the whole light+dark+thumb suite regenerated and verified in Combined light and dark.) 3.
**Iterate**: regenerate any that look off …
```

and item 4 is likewise fused mid-paragraph (line 225: "…the default 0 keeps the input
pixel-faithful. 4. **On the user's approval**, ship:"). This looks like a Markdown-formatter re-wrap
that swallowed the list markers (the intervening `###` subsection broke list continuity). Rendered,
the doc shows a 2-item list followed by prose containing literal "3." / "4." — the workflow's shape,
one of the era-specific things the file exists to preserve, is unreadable.

#### Proposed solution

Restore `3.` and `4.` as top-level list items (or, simpler and dprint-stable, convert the workflow
to `### Step N` headings, since the "Retouching the base line art" subsection already interrupts the
list). The fix is layout-only — no content changes to the frozen prose — and should be run through
`npm run format:check` to confirm dprint preserves it.

### [DX] ideas-exploration meta.json has no disposition field — the committed dashboard can't show LANDED / NOT PROMOTED / OPEN

**File(s):** `tools/asset-gen/ideas-exploration/build-review.mjs` (lines 36–40, 69–74, 106–110),
`idea-*/meta.json` (no status key), `idea-*/report.md` (line 3 `Status:` prose) @ 9ae62ff1

**Priority:** P4

#### Problem

The promotion pass recorded each idea's current disposition only as a prose `Status:` line at the
top of every `report.md` (all 25 verified present: 13 LANDED, 7 NOT PROMOTED, 5 OPEN — matching the
README scoreboard). `meta.json` — which the README calls "the machine-readable summary" and which is
the sole input to `build-review.mjs` — has keys
`idea/title/verdict/oneline/summary/tried/worked/failed/limitations/comparisons/images/code` but no
disposition. Consequence: the committed 5 MB dashboard (`ideas-review.html`) chips every idea only
by its exploration-time verdict (`WORKED`/`PARTIAL`/`BLOCKED`), so a reviewer browsing it sees "24
worked" with no signal for the fact that most decision-relevant state today is the disposition; they
must open 25 report files to learn it.

#### Proposed solution

Add `"status": "LANDED" | "NOT PROMOTED" | "OPEN"` (and optionally the pointer sentence) to each
`meta.json`, render it as a second chip and an index-table column in `build-review.mjs`, and
regenerate `ideas-review.html` (the README already mandates re-running the builder whenever any
meta.json changes). Cheap consistency guard while there: have `build-review.mjs` warn if a report's
`Status:` prefix disagrees with its meta.json status.

### [Docs] build-sheet.mjs header claims it writes `./out/index.html` — it writes straight into the committed scrapbook tree

**File(s):** `tools/asset-gen/crayon-brush-samples/build-sheet.mjs` (line 8 vs lines 24, 125–128) @
9ae62ff1

**Priority:** P5

#### Problem

```js
// Writes ./out/index.html. Promote with the scrapbook:publish flow when happy.
```

There is no `out/` dir anywhere in this flow: `OUT` (line 24) is
`../../../scrapbook/crayon-brush-samples` and the file is written to `join(OUT, 'index.html')` —
i.e. directly into the committed, GitHub-Pages-published tree, no promote step involved (the
README's regeneration steps confirm: run the builder, then `scrapbook:index`). The comment misleads
on the one thing that matters here — whether running the tool mutates committed content (it does).

#### Proposed solution

Fix the comment: "Writes scrapbook/crayon-brush-samples/index.html (committed — commit the
regenerated sheet)." Drop the stale `scrapbook:publish` sentence or replace it with the actual
follow-up (`npm run scrapbook:index` when samples were added/removed).

### [Correctness] build-review.mjs: hardcoded "of 25" and a misleading error for a missing meta.json

**File(s):** `tools/asset-gen/ideas-exploration/build-review.mjs` (lines 49–67, 221) @ 9ae62ff1

**Priority:** P5

#### Problem

Two small defects in the (maintained, re-runnable) dashboard builder:

1. Line 221 bakes the total into prose: `All ${done} of 25 ideas explored.` — if an idea dir were
   ever added/removed the sentence lies; `dirs.length` is the owned value.
2. Lines 49–60: a directory *missing* `meta.json` is skipped silently
   (`if (!existsSync(metaPath)) continue;` — no message), but the count check at 62–67 then exits
   with "only parsed N of M idea-* directories — see the \"bad meta.json\" errors above" — and there
   are no errors above for the missing-file case, sending the operator hunting for parse errors that
   don't exist.

#### Proposed solution

Use `${dirs.length}` in the subtitle (or drop the denominator), and log the missing-file case
explicitly (`console.error(\`missing meta.json in ${d}\`)`) before`continue` so the exit message's
promise holds for both failure modes.

### [Readability] Proof-sheet review thresholds restate cross-file gate values in prose

**File(s):** `tools/asset-gen/coloring-book-proof-sheet-assets/coloring-book-proof-sheet.client.js`
(lines 135–138), `tools/asset-gen/docs/coloring-book-proof-sheet.md` (line 70) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
// Review buckets are deliberately stricter than the KEEP_THRESHOLD ship gate (92%,
// lib/outline-match.mjs) — a page can pass the pipeline gate and still show yellow/red here.
const KEEP_GOOD = 99;
const KEEP_OK = 96;
```

The comment correctly names the owning identifier and file (good) but also restates its current
value ("92%"), which the root conventions forbid ("no restating mutable facts (counts, dates,
values…) owned elsewhere"): if `KEEP_THRESHOLD` in `lib/outline-match.mjs` (line 38, `0.92`) ever
moves, this comment silently lies. Likewise `docs/coloring-book-proof-sheet.md` line 70 restates the
client's bucket values as prose: "Badge colors: green ≥ 99, yellow ≥ 96, red below."

#### Proposed solution

In the comment, drop the literal: "deliberately stricter than `KEEP_THRESHOLD`
(`lib/outline-match.mjs`)". In the doc, either drop the numbers ("badge buckets are defined by
`KEEP_GOOD`/`KEEP_OK` in `coloring-book-proof-sheet.client.js`") or accept the doc restatement as
the one place a human reads the values and instead leave a pointer next to the constants. The
client.js file is browser-side plain JS and can't import from `lib/`, so a comment pointer (without
the value) is the right form there.

## Source: Code audit — scripts — root build/dev drivers

### [Correctness] Hand-rolled flag parsing in release.mjs silently ignores typos — a misspelled `--dry-run` performs the full destructive release

**File(s):** `scripts/release.mjs` (`parseReleaseArgs`, lines 54–66),
`scripts/publish-artifacts.mjs` (`parsePublishArgs`, lines 40–52) @ 9ae62ff1

**Priority:** P2

#### Problem

`scripts/CLAUDE.md` mandates "Script options are flags via `parseArgs`". `release.mjs` instead does:

```js
return {
  version,
  dryRun: args.includes('--dry-run'),
  noPublish: args.includes('--no-publish'),
};
```

An unknown flag is silently dropped: `node scripts/release.mjs 1.5.0 --dry-rn` (or `--dryrun`,
`--dry_run`) parses as `dryRun: false, noPublish: false` and proceeds to the *full* release path —
`bumpVersions`, `commitAndTag` (lines 130–134: `git add -A`, `git commit`, `git tag`), and `publish`
(lines 136–159: `git push`, `git push origin v<version>`, `gh release create`). A one-character typo
in the safety flag converts a rehearsal into an irreversible published release. `parsePublishArgs`
in `publish-artifacts.mjs` has the same shape (`args.includes('--dry-run')` at line 51,
prefix-sliced `--only=` at line 47), where a typo'd `--dry-run` uploads real artifacts.

Node's `util.parseArgs` is strict by default and throws on unknown options — the repo already uses
it correctly in `scripts/gha-versions.mjs` (lines 108–110), `scripts/gen-tokens.mjs` (lines 68–70),
`scripts/image-audit.mjs` (lines 38–40), and `scripts/publish-scrapbook.mjs` (lines 54–57), so these
two scripts (the most dangerous ones in the directory) are the outliers.

#### Proposed solution

Rewrite both parsers on `parseArgs`:

```js
function parseReleaseArgs(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { 'dry-run': { type: 'boolean' }, 'no-publish': { type: 'boolean' } },
  });
  const version = positionals[0];
  // existing semver validation …
  return { version, dryRun: values['dry-run'], noPublish: values['no-publish'] };
}
```

Wrap the `parseArgs` call in try/catch to re-emit the existing usage string via `fail()` so the
error stays actionable. `parsePublishArgs` gets `only: { type: 'string' }` with the existing
`PLATFORMS.includes` check. Both functions are already exported and covered by
`scripts/tests/release.test.mjs` / `publish-artifacts.test.mjs`, so add a case asserting an unknown
flag fails instead of being ignored.

### [Correctness] android-emulator-smoke boot wait can spin forever and crashes opaquely when no serial matches

**File(s):** `scripts/android-emulator-smoke.mjs` (lines 70–73) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
await Promise.race([adb('wait-for-device'), emulatorCrash]);
while ((await adb('shell', 'getprop', 'sys.boot_completed')) !== '1') await sleep(2000);
emulatorProc.unref();
const serial = (await adb('devices')).match(/emulator-\d+/)[0];
```

Three issues:

1. The `getprop sys.boot_completed` loop (line 71) has no timeout. A boot that hangs (the exact
   hardware-accel misconfiguration this script preflights for at lines 25–38 is not the only way an
   emulator wedges) leaves `npm run test:android` spinning silently forever. `scripts/CLAUDE.md`
   says explicitly: "name polling budgets". The repo already has
   `pollUntil(callback, timeoutMs, intervalMs)` in `scripts/lib/proc.mjs` (lines 82–91) built for
   precisely this.
2. The `emulatorCrash` race only guards `wait-for-device` (line 70); the boot-completed loop and
   `adb devices` call are outside it. (A hard crash usually makes `adb` reject so the failure
   surfaces, but a crash that leaves adb responsive with no device does not.)
3. `.match(/emulator-\d+/)[0]` (line 73) throws a bare `TypeError: Cannot read properties of null`
   when no emulator serial appears — an opaque failure at the exact moment something already went
   wrong.

#### Proposed solution

Name a budget and use the existing helper:

```js
const BOOT_TIMEOUT_MS = 300_000; // cold emulator boot on CI-class hardware
const BOOT_POLL_INTERVAL_MS = 2_000;
const booted = await pollUntil(
  async () => (await adb('shell', 'getprop', 'sys.boot_completed')) === '1',
  BOOT_TIMEOUT_MS,
  BOOT_POLL_INTERVAL_MS,
);
if (!booted) throw new Error(`Emulator did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s`);
```

For the serial, guard the match:
`const serial = (await adb('devices')).match(/emulator-\d+/)?.[0]; if (!serial) throw new Error('No emulator serial in adb devices output');`.

### [Maintainability] driver-smoke re-hardcodes store-shots' dialog transition durations as bare magic sleeps

**File(s):** `scripts/driver-smoke.mjs` (lines 69, 71), `scripts/store-shots.mjs` (lines 117–123) @
9ae62ff1

**Priority:** P3

#### Problem

`store-shots.mjs` names its dialog-animation waits with the required unit-suffixed constants and a
WHY comment:

```js
// No DOM signal is surfaced for these dialog animations, so they stay timed.
const MENU_TRANSITION_MS = 450; // coloring-book dialog sliding open
const PAGE_GRID_TRANSITION_MS = 400; // a book's page grid animating in
```

`driver-smoke.mjs` — the smoke test that exists specifically to guard the same `app-driver.mjs`
flows — repeats the same two values as anonymous literals:

```js
await openColoringBook(page);
await sleep(450);
await pickBook(page, 'Farm');
await sleep(400);
```

This violates two conventions at once: "tuning literals get names" (with `_MS` unit), and
"cross-file agreement is never maintained by prose" — if the coloring-book dialog animation is
retuned, store-shots' constants get updated and driver-smoke silently keeps stale timings (the exact
"rots silently" failure mode `scripts/CLAUDE.md` documents for this driver).

#### Proposed solution

Move `MENU_TRANSITION_MS` and `PAGE_GRID_TRANSITION_MS` into `scripts/lib/app-driver.mjs` (which
already owns a timing constant of this kind: `STROKE_MENU_TRANSITION_DELAY_MS`, line 23) and export
them; import in both `store-shots.mjs` and `driver-smoke.mjs`. Better still, fold the waits into
`openColoringBook()` / `pickBook()` themselves so every driver client gets the settle for free —
`store-shots.mjs` scenes 02/03 and `driver-smoke.mjs` all sleep immediately after the same calls
today.

### [Maintainability] Three scripts reimplement `isMain` inline instead of importing it from proc.mjs

**File(s):** `scripts/ruler-apply.mjs` (line 81), `scripts/apply-ruler-skill-forks.mjs` (line 193),
`scripts/gen-coloring-book-proof-sheet-hub.mjs` (line 146) @ 9ae62ff1

**Priority:** P3

#### Problem

`scripts/lib/proc.mjs` exports the canonical entry-point guard (lines 12–13):

```js
export const isMain = (url) =>
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url;
```

Yet three scripts — all of which already import `ROOT` from that same module — hand-roll the check:

```js
// ruler-apply.mjs:81, apply-ruler-skill-forks.mjs:193
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
// gen-coloring-book-proof-sheet-hub.mjs:146
if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
```

Each drags in `fileURLToPath` (and `resolve`) imports solely for this. The hub variant additionally
omits the `process.argv[1] &&` guard, so importing it in a context with no script path (e.g.
`node -e` / REPL dynamic import) throws `TypeError` from `resolve(undefined)` before
`publish-scrapbook.mjs` can use its exports. Duplicated boundary logic also means a future fix to
`isMain` (say, symlink handling — the inline `resolve` version and the `pathToFileURL` version
already disagree about symlinked invocation) diverges silently.

Related doc nit for the same fix: the convention line in `scripts/CLAUDE.md` says "gates execution
behind `isMain(import.meta)`" while every real call site passes `import.meta.url` — passing
`import.meta` as documented always returns false. The `.ruler` source of that file should say
`isMain(import.meta.url)`.

#### Proposed solution

Replace all three inline checks with `if (isMain(import.meta.url)) { … }`, dropping the now-unused
`fileURLToPath` imports. Fix the `.ruler/` source for `scripts/CLAUDE.md`/`AGENTS.md` to spell the
call correctly and regenerate via `npm run ruler:apply`.

### [Maintainability] Roughly 30 of 42 CLI scripts execute at import time, against the documented isMain-gate convention

**File(s):** `scripts/publish-scrapbook.mjs` (line 149), `scripts/gen-icons-sheet.mjs` (lines
73–154), `scripts/image-audit.mjs` (lines 38–100), `scripts/gen-large-image.mjs` (lines 111–152),
`scripts/generate-icon-names.mjs` (lines 11–31), `scripts/mirror-skill-notes.mjs` (lines 17–42),
`scripts/api-smoke.mjs` (lines 392–417), `scripts/model-eval-run.mjs` (line 268), and most other
top-level scripts @ 9ae62ff1

**Priority:** P3

#### Problem

`scripts/CLAUDE.md` states: "Every CLI script gates execution behind `isMain(import.meta)`
(`scripts/lib/proc.mjs`) and exports a distinctly named entry function." In reality only five
top-level scripts use `isMain` (`release.mjs`, `publish-artifacts.mjs`, `generate-releases.mjs`,
`gha-versions.mjs`, `lint-token-styles.mjs`) plus three with inline equivalents; the other ~30 run
their whole body as top-level side effects. Consequences beyond the rule itself:

* Pure, test-worthy logic is locked away: `gen-large-image.mjs`
  `parsePath`/`parseSvg`/`svgWidthToAppSize` (lines 60–109), `image-audit.mjs`'s file filtering
  (lines 42–54), `generate-icon-names.mjs`'s union rendering, `mirror-skill-notes.mjs`'s stale-note
  deletion (see separate finding) — importing any of these to unit-test them boots a browser,
  rewrites files, or spawns servers.
* `publish-scrapbook.mjs` is the sharpest case: it already has a `main()` (line 53) but calls it
  unconditionally (line 149), even though it *imports* `gen-coloring-book-proof-sheet-hub.mjs` — the
  pattern of one script importing another is live in this exact file pair, and only works because
  the imported side happens to be gated.

Either the tree should follow the rule or the rule should be narrowed; today the doc and the code
teach opposite lessons to anyone adding a script.

#### Proposed solution

Don't blanket-refactor all 30. Prioritize: (a) scripts that export or contain pure
parsing/derivation logic (`gen-large-image`, `image-audit`, `generate-icon-names`,
`mirror-skill-notes`, `gen-icons-sheet`) — wrap the side-effecting tail in
`if (isMain(import.meta.url)) main();` and export the helpers; (b) `publish-scrapbook.mjs`, a
one-line fix. Then decide whether the convention sentence in `.ruler`'s scripts orientation should
be softened to "any script that exports helpers, or that another script imports, must gate execution
behind `isMain`" so the doc matches intent.

### [Testing] mirror-skill-notes is the only untested leg of the ruler pipeline, and it mutates global cwd

**File(s):** `scripts/mirror-skill-notes.mjs` (lines 17–42) @ 9ae62ff1

**Priority:** P3

#### Problem

The `ruler:apply` pipeline has three custom steps. Two are structured as exported,
root-parameterized functions and are locked by tests:
`withPreservedDirectProviderPaths(root, apply)` (`ruler-apply.mjs`, tested by
`scripts/tests/ruler-apply.test.mjs`) and `applyRulerSkillForks(root)`
(`apply-ruler-skill-forks.mjs`, tested by `scripts/tests/ruler-skill-forks.test.mjs`). The third —
`mirror-skill-notes.mjs` — is a bare top-level script with no exported entry point and no test, yet
it holds equally destructive logic: the stale-note sweep at lines 28–32 deletes every file in
`.claude/skill-notes/` and `.agents/skill-notes/` that isn't in the source set or in `DIRECT_NOTES`:

```js
for (
  const stale of readdirSync(target).filter(
    (file) => !sourceFiles.includes(file) && !DIRECT_NOTES.has(file),
  )
) {
  rmSync(join(target, stale), { force: true });
}
```

A regression here (e.g. `DIRECT_NOTES` falling out of sync with `DIRECT_PROVIDER_PATHS` in
`ruler-apply.mjs` — the two lists name the same skill independently today) would delete a
directly-maintained provider note; nothing would catch it before commit. It also opens with
`process.chdir(ROOT)` (line 17) and then uses relative paths — the only script in the directory that
mutates the process's global cwd instead of joining onto `ROOT`, which would leak into any future
importer.

#### Proposed solution

Restructure to match its siblings: export `mirrorSkillNotes(root = ROOT)` that joins `root` into
`SOURCE`/`TARGETS` (dropping `process.chdir`), gate the CLI behind `isMain(import.meta.url)`, and
add `scripts/tests/mirror-skill-notes.test.mjs` covering: generated notes copied with the
`<!-- Source: … -->` marker, stale generated notes removed, and `burn-down-audits.md` preserved.
Consider deriving `DIRECT_NOTES` from (or drift-guarding it against) `DIRECT_PROVIDER_PATHS` in
`ruler-apply.mjs`, since they encode the same exception.

### [Maintainability] model-eval-run duplicates the whole report-rendering block between reportOnly() and main()

**File(s):** `scripts/model-eval-run.mjs` (`reportOnly`, lines 111–131; `main` tail, lines 247–265)
@ 9ae62ff1

**Priority:** P3

#### Problem

Both paths launch a browser, resolve `VERDICT_FILE`, call `buildReport` with the same argument
shape, log the `file://` link, and close the browser in a `finally`:

```js
// lines 116–130 (reportOnly)                       // lines 248–264 (main)
const browser = await chromium.launch({ … });       const browser = await chromium.launch({ … });
try {                                               try {
  const htmlPath = await buildReport({                const htmlPath = await buildReport({
    runId: data.runId, outDir: dir, inputsDir: IN,      runId: effRunId, outDir, inputsDir: IN,
    results: data.results, samples: …, browser,         verdictHtml: process.env.VERDICT_FILE ? … ,
    verdictHtml,                                        results, samples: effSamples, browser,
  });                                                 });
  console.log(`Report: ${pathToFileURL(htmlPath)…`); console.log(`\nReport: ${pathToFileURL(htmlPath)…`);
} finally { await browser.close(); }                } finally { await browser.close(); }
```

The `VERDICT_FILE` read is itself written twice (lines 113–115 and 254–256). Any change to report
inputs (a new `buildReport` option, a different browser launch flag) must now be made in two places,
and the two call sites have already drifted cosmetically (argument order, newline in the log).

#### Proposed solution

Extract one helper and call it from both paths:

```js
async function renderReport({ runId, outDir, results, samples }) {
  const verdictHtml = process.env.VERDICT_FILE
    ? readFileSync(process.env.VERDICT_FILE, 'utf8')
    : undefined;
  const browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
  try {
    const htmlPath = await buildReport({
      runId,
      outDir,
      inputsDir: IN,
      results,
      samples,
      browser,
      verdictHtml,
    });
    console.log(`\nReport: ${pathToFileURL(htmlPath).href}`);
  } finally {
    await browser.close();
  }
}
```

`reportOnly` then reduces to reading `results.json` and calling `renderReport`.

### [Correctness] generate-icon-names breaks when run from any cwd other than the repo root

**File(s):** `scripts/generate-icon-names.mjs` (lines 9, 11, 30) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
const OUT = 'web/src/lib/components/icon-names.d.ts';
const names = globSync('web/src/lib/icons/*.svg')
…
writeFileSync(OUT, contents);
```

Both the glob and the output path are cwd-relative — this is the only script in the directory that
doesn't anchor its filesystem access to `ROOT` (it even imports `fail` from `./lib/proc.mjs`, so
`ROOT` is on the same import line). The file's own header advertises
`node scripts/generate-icon-names.mjs` as the manual invocation; run from anywhere but the repo root
that fails with the misleading "No SVGs found under web/src/lib/icons/" (or, worse, if a sibling
checkout happened to match the glob, would write the generated union into the wrong tree). It works
today only because the `gen:icons` npm script always runs with cwd = root.

#### Proposed solution

Anchor both paths: `import { fail, ROOT } from './lib/proc.mjs';` then
`globSync(join(ROOT, 'web/src/lib/icons/*.svg'))` (or
`globSync('web/src/lib/icons/*.svg', { cwd: ROOT })`, the pattern `image-audit.mjs` line 42 already
uses) and `writeFileSync(join(ROOT, OUT), contents)`.

### [Readability] Numbered step comments in the native smoke scripts and check-assets mark helpers that were never extracted

**File(s):** `scripts/android-emulator-smoke.mjs` (lines 24, 40, 69, 76),
`scripts/ios-simulator-smoke.mjs` (lines 22, 34, 53), `scripts/check-assets.mjs` (lines 17, 29) @
9ae62ff1

**Priority:** P4

#### Problem

Root `CLAUDE.md` is explicit: "Numbered step comments (`// 1. …`) or section banners inside one
function are the signal to extract each step into a named helper — write it that way the first
time." Both native smoke scripts are structured as one top-level run annotated `// 1.` through
`// 4.`:

```js
// 1. Check hardware acceleration before trying to boot (diagnoses 0xC0000005 crashes).
…
// 2. Boot a headless emulator, detached so it keeps running until we kill it.
…
// 3. Wait for it to come online and finish booting — but bail if the emulator crashes first.
…
// 4. Build + install, run the flow, and always tear the emulator down.
```

`ios-simulator-smoke.mjs` mirrors it (`// 1. Preflight`, `// 2. Pick a simulator`,
`// 3. Build + install`), and `check-assets.mjs` has `// 1. Verify every catalog asset…` /
`// 2. Cross-check platform filtering…`. The numbers are doing the job function names should do, and
extraction would also give these scripts the exported-entry shape the directory convention asks for
(see the isMain finding).

#### Proposed solution

Extract per-comment helpers and let the tail read as the recipe. Android:
`assertHardwareAcceleration()`, `bootHeadlessEmulator()` (returns
`{ emulatorProc, emulatorCrash }`), `waitForBoot(adb, emulatorCrash)` (returns the serial), and a
`main()` that composes them inside the existing try/finally. iOS: `assertXcodeAvailable()`,
`pickSimulator()` (returns `{ device, bootedByUs }`), `buildInstallAndSmoke(device)`. check-assets:
`missingCatalogAssets()` and `platformFilterMismatches()` returning arrays the tail reports.
Behavior-preserving; the comments then delete themselves.

### [Readability] api-smoke repeats the burst-until-429 loop three times

**File(s):** `scripts/api-smoke.mjs` (lines 198–202, 269–273, 346–350) @ 9ae62ff1

**Priority:** P4

#### Problem

The same poll-for-429 pattern appears in `checkReport`, `checkCspReport`, and `checkThrottling`,
each with its own mutable accumulator:

```js
let reportLimited = null;
for (let i = 0; i < 8 && !reportLimited; i++) {
  const res = await report({ kind: 'bug', message: `burst ${i}` });
  if (res.status === 429) reportLimited = res;
}
```

```js
let cspLimited = null;
for (let i = 0; i < 8 && !cspLimited; i++) { … }
```

```js
let limited = null;
for (let i = 0; i < 12 && !limited; i++) { … }
```

Three near-identical copies obscure the one interesting per-site difference — the attempt budget (8
vs 8 vs 12, each tied to a different route's bucket size) — and any future change to the pattern
(e.g. asserting nothing *before* the 429 was a 5xx) needs three edits.

#### Proposed solution

Extract:

```js
// Sends until a 429 arrives (returns it) or attempts run out (returns null).
async function burstUntil429(send, attempts) {
  for (let i = 0; i < attempts; i++) {
    const res = await send(i);
    if (res.status === 429) return res;
  }
  return null;
}
```

Call sites become
`const reportLimited = await burstUntil429((i) => report({ kind: 'bug', message:`burst ${i}`}), 8);`
— and the attempt counts can pick up names tied to the bucket they exhaust (`REPORT_BUCKET_BURST`,
etc.), satisfying the named-tuning-literal rule.

### [Performance] gha-versions --check-latest fetches release tags serially

**File(s):** `scripts/gha-versions.mjs` (`main`, lines 126–129) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
if (checkLatest) {
  console.error(`Checking ${actions.length} actions against their latest releases…`);
  for (const action of actions) latest.set(action, await fetchLatestTag(action));
}
```

Each `fetchLatestTag` is an independent GitHub API GET (lines 86–97) already wrapped in its own
try/catch that degrades to `null`. Awaiting them one at a time makes the `--check-latest` run take N
× RTT — with a dozen-plus distinct actions and typical API latency this is several seconds of pure
serialization for no ordering benefit (results land in a keyed `Map`).

#### Proposed solution

```js
const tags = await Promise.all(actions.map((a) => fetchLatestTag(a)));
actions.forEach((a, i) => latest.set(a, tags[i]));
```

Gotcha: unauthenticated GitHub API rate limiting is 60 req/hr per IP — bursting in parallel neither
helps nor hurts that quota (it's request-count, not rate, based), and failures already degrade to
`unknown`, so no throttling guard is needed. If ever needed, the `pool()` helper pattern from
`model-eval-run.mjs` (lines 96–107) caps concurrency.

### [Readability] lint-token-styles dynamically imports proc.mjs for ROOT while statically importing it two lines up

**File(s):** `scripts/lint-token-styles.mjs` (lines 29, 108–110) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
import { isMain } from './lib/proc.mjs';   // line 29
…
async function main() {
  const { ROOT } = await import('./lib/proc.mjs');   // line 109
```

The module is already statically imported for `isMain`, so the dynamic import defers nothing
(proc.mjs is loaded before `main` runs regardless) and buys nothing for the `.d.mts`-typed test
import (the test imports `countRawHex`/`countRawZIndex`, and the static import at line 29 executes
either way). Its only effects are making `main` needlessly `async` (forcing the `await main()` at
line 156) and making a first-time reader hunt for a reason that doesn't exist.

#### Proposed solution

`import { isMain, ROOT } from './lib/proc.mjs';` at line 29, delete line 109, make `main`
synchronous, and call `main()` plainly in the `isMain` block.

### [DX] The model-eval and redteam tools take every option as an env var, not flags

**File(s):** `scripts/model-eval-run.mjs` (lines 40–48, 113, 134, 247),
`scripts/model-eval-fixtures.mjs` (lines 346–347), `scripts/redteam-run.mjs` (lines 27, 159),
`scripts/api-smoke.mjs` (line 21), `scripts/driver-smoke.mjs` (line 30) @ 9ae62ff1

**Priority:** P4

#### Problem

`scripts/CLAUDE.md`: "Script options are flags via `parseArgs`; an env var is at most a documented
fallback." `model-eval-run.mjs` exposes eight options exclusively as env vars — `SAMPLES`,
`CONCURRENCY`, `FILTER`, `RESUME`, `OUT_TAG`, `REPORT_FROM`, `VERDICT_FILE`, `SKIP_REPORT` — with no
flag form at all; `model-eval-fixtures.mjs` adds `FILTER`/`DEBUG_SAMPLE`, `redteam-run.mjs`
`REDTEAM_PORT`/`REDTEAM_NO_OPEN`, and the smoke tests `SMOKE_PORT`. Generic names like `FILTER` and
`SAMPLES` also risk colliding with whatever happens to be exported in a developer's shell (an
ambient `FILTER=…` from an unrelated tool silently narrows the corpus). These are manual tools, so
the cost is discoverability and accident-proneness rather than CI breakage — but the convention
exists and the scripts-info entries currently have to document a bespoke env grammar per script.

#### Proposed solution

Add `parseArgs` fronts (`--samples`, `--filter`, `--concurrency`, `--resume <dir>`,
`--report-from <dir>`, `--verdict-file <f>`, `--skip-report`, `--out-tag`), keeping the env vars as
documented fallbacks (`values.samples ?? process.env.SAMPLES ?? 1`) for one release of muscle-memory
compatibility. Update the `scripts-info` descriptions in `package.json` in the same change
(ADR-0019). Low urgency; do it when next touching these tools rather than as a standalone churn PR.

### [Maintainability] gen-large-image's size-mapping comment restates SIZE_TO_PX values it cannot see

**File(s):** `scripts/gen-large-image.mjs` (`svgWidthToAppSize`, lines 59–64) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
// SIZE_TO_PX: {1:2, 2:4, 3:8, 4:14, 5:22} (from strokeWidth.svelte.ts)
function svgWidthToAppSize(w) {
  if (w <= 9) return 2; // SVG 8   → app 4px
  if (w <= 14) return 3; // SVG 14  → app 8px
  return 4; // SVG 15+ → app 14px
}
```

The comment copies the full value table of `SIZE_TO_PX` from
`web/src/lib/state/strokeWidth.svelte.ts` (lines 36–42) — exactly the "restating mutable facts
(counts, dates, values…) owned elsewhere" the root `CLAUDE.md` comment rule forbids — and the branch
thresholds/px annotations encode agreement with that table with no import and no drift guard.
Retuning the app's stroke sizes leaves this comment confidently wrong and the thresholds quietly
mismapped; nothing fails. The script already runs under `--experimental-strip-types` (the
`gen:large-image` npm script) and already imports `PALETTE_COLORS` from app TS (line 17), so
importing from the state module is mechanically available.

#### Proposed solution

Export `SIZE_TO_PX` from `strokeWidth.svelte.ts` (it's currently module-private; exporting the
owning table is the convention's preferred fix) and derive the mapping here — e.g. pick the app size
whose px value is nearest the SVG stroke-width, replacing the hand-tuned thresholds and all three
value comments. If exporting is undesirable, at minimum trim the comment to name the owner without
the values:
`// Buckets SVG stroke widths into app sizes; px values live in strokeWidth.svelte.ts (SIZE_TO_PX).`

### [Readability] gen-icons-sheet: manual --out parsing, double isSpot() call, and fully top-level execution

**File(s):** `scripts/gen-icons-sheet.mjs` (lines 23–34, 79–84) @ 9ae62ff1

**Priority:** P4

#### Problem

Three small deviations in one script. (1) The lone flag is parsed by hand (lines 23–34):

```js
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : join(…);
```

— `parseArgs({ options: { out: { type: 'string' } } })` is the directory convention and rejects
typos (`--otu` today silently writes to the default location). (2) `isSpot(svg)` is computed twice
per icon (lines 82–83): once for the `inlineSvg` argument and once for the bucket choice:

```js
const entry = { name, html: inlineSvg(svg, isSpot(svg)) };
(isSpot(svg) ? spot : plain).push(entry);
```

`isSpot` regex-scans the whole SVG source each call; harmless at this scale but it reads as if the
two calls might differ. (3) Everything from line 73 down runs at import — see the grouped isMain
finding; this script is on the priority list there because `inkColors`/`inlineSvg` are pure and
test-worthy.

#### Proposed solution

`const spot = isSpot(svg);` once per file; switch to `parseArgs`; wrap the generation tail in a
`main()` gated by `isMain(import.meta.url)` and export `inkColors`/`inlineSvg`.

### [Architecture] Proof-sheet hub bakes its category list as a pre-formatted string that a checker later regex-parses back out of the HTML

**File(s):** `scripts/gen-coloring-book-proof-sheet-hub.mjs` (`CATEGORIES`, lines 34–43; inline
script, lines 75–136), `scripts/lib/scrapbook-index.mjs` (`coloringBookProofSheetHubProblems`, lines
144–162) @ 9ae62ff1

**Priority:** P4

#### Problem

`CATEGORIES` is not data — it is a hand-indented string literal spliced into the page's `<script>`:

```js
const CATEGORIES = `[
        { id: 'farm', name: 'Farm', pages: 6 },
        …
      ]`;
```

Downstream, `coloringBookProofSheetHubProblems` recovers the structure by regexing the *generated
HTML* (`hub.match(/const CATEGORIES = \[([\s\S]*?)\];/)` then a per-entry regex). So the same
information exists three times: the string here, the regex-decoded copy in the checker, and the
ground truth (the sibling `<id>.html` proof sheets the checker compares against). Editing a category
means editing a string in exact-whitespace form; a formatting change (trailing comma style, double
quotes) silently breaks the checker's regex parse, not the page. The repo's own precedent points the
other way — `model-eval-fixtures.mjs` (line 335) keeps its in-page code as a real JS file precisely
"so it is real, lintable browser JS rather than a template string", and this hub embeds ~60 lines of
tab/hash/keyboard logic in a template string too.

#### Proposed solution

Make `CATEGORIES` a real exported array of objects and inject `JSON.stringify(CATEGORIES, null, 2)`
into the template; have `coloringBookProofSheetHubProblems` import the array from this module (it
already lives one import away) instead of regex-mining the HTML, keeping only the on-disk sheet
comparison. Optionally go further and derive `{ id, pages }` from the sibling sheets' embedded
`window.__COLORING_BOOK_PROOF_SHEET__` data at generation time, which deletes the hand-maintained
list entirely (names would still need a small id→label map). Extracting the inline script to
`scripts/lib/proof-sheet-hub-client.js` (the fixture-renderer pattern) is a worthwhile companion but
separable.

### [Correctness] model-eval-gen-inputs builds a data URI with the invalid MIME `image/*`

**File(s):** `scripts/model-eval-gen-inputs.mjs` (line 87) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const dataUri = `data:image/*;base64,${raw.toString('base64')}`;
```

`image/*` is a media-type *range*, not a media type — it is not valid in a data URI. The script
works today only because Chromium content-sniffs the payload, an implementation kindness the spec
doesn't promise (Firefox, for one, refuses to render `data:image/*` URIs). The repo already owns a
format detector — `imageFormat(buffer)` in `scripts/lib/model-eval.mjs` (imported by
`model-eval-run.mjs` at line 31 for exactly this: distinguishing png/jpeg from magic bytes) — so the
correct MIME is one call away.

#### Proposed solution

```js
const fmt = imageFormat(raw); // 'png' | 'jpeg' | …
const dataUri = `data:image/${fmt === 'jpeg' ? 'jpeg' : 'png'};base64,${raw.toString('base64')}`;
```

(or reject/log when `imageFormat` can't identify the payload, which today would surface as an opaque
`img.onerror`).

### [Correctness] model-eval-fixtures silently renders fixtures with missing coloring assets

**File(s):** `scripts/model-eval-fixtures.mjs` (`assetUri`, lines 78–82; used at 124, 156, 177–179,
195–199) @ 9ae62ff1

**Priority:** P4

#### Problem

`assetUri` returns `null` when the `.webp` doesn't exist (line 80), and most call sites pass the
result straight into a layer with no check:

```js
layers: [
  …
  { op: 'outline', uri: assetUri(book, page, o, 'outline') },
],
```

Only the night category has fallbacks (`assetUri(…, 'chalk') || assetUri(…, 'outline')`, line 195).
Everywhere else, a renamed page or book in `web/static/coloring/` yields `uri: null`, the in-page
renderer draws nothing for that layer, and the corpus quietly gains a blank-or-partial "coloring
page" fixture — which then skews the model eval it feeds. `scripts/CLAUDE.md` calls for exactly the
opposite: "Multi-item CLI runs: validate inputs up front with a path-specific one-line error and a
non-zero exit."

#### Proposed solution

Make missing assets loud: in `assetUri`, `throw new Error(\`missing coloring asset:
${p}\`)`(with the night fallback expressed as an explicit`optionalAssetUri`or a try-order list), or collect all missing paths during spec construction and`fail()`with the list before launching the browser. The specs are built eagerly at module load, so an upfront sweep over`specs`checking every`uri
!== null`before`main()` starts is a three-line guard.

### [Readability] model-eval-fixtures assigns each spec's seed mid-render-loop via specs.indexOf

**File(s):** `scripts/model-eval-fixtures.mjs` (line 362) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
for (const spec of list) {
  …
  spec.seed = 987654 + specs.indexOf(spec) * 7;
```

The seed — part of the fixture's identity and the reason the corpus is reproducible under `FILTER`
(it's indexed against the *full* `specs` array, not the filtered `list`) — is bolted onto the spec
object inside the screenshot loop, with two unexplained magic numbers and an O(n²) `indexOf`. A
reader auditing determinism has to find this line to learn specs even *have* seeds; the
FILTER-stability property is entirely implicit.

#### Proposed solution

Assign at construction: in `add()`,
`specs.push({ ...s, seed: SEED_BASE + specs.length * SEED_STRIDE })` with named module constants
(`SEED_BASE = 987654`, `SEED_STRIDE = 7`) and a one-line WHY on `SEED_BASE` noting the index is
corpus-positional so `FILTER` never changes a fixture's pixels.

### [Maintainability] blobs-smoke's eventual-consistency retry loop has unnamed budget literals

**File(s):** `scripts/blobs-smoke.mjs` (lines 94–99) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
let readBack = false;
for (let attempt = 0; attempt < 6 && !readBack; attempt++) {
  if (attempt) await sleep(1000);
  const { body: after } = await admin.listTokens(auth);
  readBack = Boolean(after?.tokens?.includes(probe));
}
```

`6` and `1000` are a polling budget (~5s of patience for Blobs replica convergence) expressed as
bare literals — `scripts/CLAUDE.md` says "name polling budgets", and the root convention wants
tuning literals named with units. The prose comment above ("with a little patience for eventual
consistency") carries the WHY that belongs on constants.

#### Proposed solution

```js
const READBACK_ATTEMPTS = 6;
const READBACK_INTERVAL_MS = 1_000; // Blobs replica convergence patience
```

or reuse `pollUntil` from `./lib/proc.mjs` with a named `READBACK_TIMEOUT_MS`.

### [Maintainability] api-smoke re-hardcodes the seeded token 'alpha' three times beside its SEED_TOKENS declaration

**File(s):** `scripts/api-smoke.mjs` (lines 24, 149, 305, 334) @ 9ae62ff1

**Priority:** P5

#### Problem

The seed list is declared once — `const SEED_TOKENS = 'alpha,beta';` (line 24, passed to the server
env at line 398) — but the checks that depend on a member of that list spell it out again:
`{ code: 'alpha' }` (line 149), `genRequest({ token: 'alpha' })` (line 305),
`legacyMultipart({ token: 'alpha', … })` (line 334). Renaming the seed means four edits, and the
connection between "this must be a token the server was seeded with" and the literal is prose-only.
The root convention treats boundary strings as declared-once-imported-everywhere (tests are excepted
repo-wide, but here declaration and reuse are in the *same file*, so there's no exception to lean
on).

#### Proposed solution

```js
const SEED_TOKENS = ['alpha', 'beta'];
const [VALID_TOKEN] = SEED_TOKENS;
```

pass `ALLOWED_TOKENS_LIST: SEED_TOKENS.join(',')` to the server env and use `VALID_TOKEN` at the
three call sites.

### [Readability] store-shots' feature-graphic capture is an anonymous banner-comment block inside the top-level run

**File(s):** `scripts/store-shots.mjs` (lines 252–265) @ 9ae62ff1

**Priority:** P5

#### Problem

Every screenshot flow in the file is a named `sceneX` function with a `.label` (lines 128–233), but
the fifth deliverable hides in a bare block after the scene loop:

```js
// FEATURE GRAPHIC — 1024x500
{
  const iconB64 = readFileSync(join(OUT, 'icon-512.png')).toString('base64');
  const ctx = await browser.newContext({ … });
  …
}
```

The `// FEATURE GRAPHIC` banner is the section-banner smell root `CLAUDE.md` flags, and the
asymmetry costs the block the per-scene affordance the comment at lines 125–126 advertises ("a
single scene can be run on its own while iterating on it") — the one visual here that has needed
iteration (it composes fonts, gradients, and the icon) is the one you can't run alone.

#### Proposed solution

Extract `async function captureFeatureGraphic(browser)` beside the scenes (it doesn't fit the
`SCENES` signature since it takes no device/dir — keep it a sibling call, not a list entry), with
`1024`/`500` promoted to `FEATURE_GRAPHIC_W`/`FEATURE_GRAPHIC_H` shared with `featureGraphicHtml`
(line 189 hardcodes `1024px`/`500px` in the CSS today — a second copy of the same dimensions).

## Source: Code audit — scripts/perf — performance harness

### [Correctness] `perf:mount` crashes with ReferenceError — `join` is used but never imported

**File(s):** `scripts/perf/mount.mjs` (`runMountProfile`, lines 13–21, 101–102, 117) @ 9ae62ff1

**Priority:** P1

#### Problem

`mount.mjs` calls `join(...)` three times but never imports it. The import block (lines 13–21) is:

```js
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import { isMain, runMain } from '../lib/proc.mjs';
import { parsePerfArgs } from './args.mjs';
import { startTrace, stopTrace } from './capture.mjs';
import { profilePath } from './paths.mjs';
import { buildAndPreview } from './preview.mjs';
import { LONG_TASK_MS } from './thresholds.mjs';
```

There is no `import { join } from 'node:path'`, yet lines 101–102 and 117 use it:

```js
writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents: events }));
writeFileSync(join(outDir, 'mount-summary.json'), JSON.stringify(summary, null, 2));
...
console.log(`Analyze the trace with: npm run perf:analyze -- ${join(outDir, 'trace.json')}`);
```

`npm run perf:mount` (package.json line 43) therefore runs the entire expensive front half —
production build, preview server, headless Chromium launch, Slow-4G-throttled navigation, 5 s
post-load settle, trace stop — and then throws `ReferenceError: join is not defined` at line 101,
before either artifact is written. The whole run is wasted; the trace is lost. Verified: `grep`
confirms no `node:path` import anywhere in the file, and ESLint passes it clean (see the next
finding for why). No test imports `mount.mjs` either (`scripts/tests/perf-cli-inputs.test.mjs`
covers `analyze.mjs`, `analyze-webinspector.mjs`, `replay-scenario.mjs`, and `android.mjs` only), so
nothing catches the break.

#### Proposed solution

Add `import { join } from 'node:path';` to `mount.mjs`. Additionally add a cheap smoke to
`scripts/tests/perf-cli-inputs.test.mjs` that imports `../perf/mount.mjs` without invoking its
driver (the same pattern as the existing "imports the Android profiler without starting its driver"
test) — an import alone wouldn't catch a missing binding used at runtime, so the durable prevention
is the lint change in the next finding.

---

### [Testing] Extend the `no-undef` lint carve-out from `tools/asset-gen` to `scripts/**` — it exists precisely to catch the `perf:mount` class of bug

**File(s):** `eslint.config.js` (lines 126–134) @ 9ae62ff1; `scripts/perf/mount.mjs`

**Priority:** P2

#### Problem

The ESLint config already documents the exact failure that shipped in `mount.mjs` — but enables the
guard only for `tools/asset-gen`:

```js
{
  // Plain-Node ESM tooling (no TypeScript to resolve identifiers). Re-enable no-undef here so a
  // used-but-unimported binding — e.g. dropping `import { existsSync } from 'node:fs'` while a
  // call remains — fails lint instead of throwing ReferenceError only at CLI runtime.
  files: ['tools/asset-gen/**/*.mjs'],
  rules: {
    'no-undef': 'error',
  },
},
```

`scripts/**/*.mjs` is equally plain-Node ESM with no TypeScript to resolve identifiers, and the base
config turns `no-undef` off globally (line 37). Result: `npx eslint scripts/perf/mount.mjs` passes
clean despite the `join` ReferenceError bug above. Every on-demand script in `scripts/` (the perf
harness especially, which is run rarely and never in CI) can silently rot in this way.

#### Proposed solution

Add `'scripts/**/*.mjs'` to the `files` list of that block (the base config's
`globals: { ...globals.browser, ...globals.node }` at line 32 already covers the `page.evaluate`
callbacks that reference `document`/`performance`/`window`, so no false positives from in-page
code). The browser-paste snippets are `.js` and blanket-disabled, so they're unaffected. Run
`npm run lint` over the tree once to flush any other latent unimported bindings.

---

### [Maintainability] Engine constants mirrored into the harness by prose comment, with no drift guard

**File(s):** `scripts/perf/replay-scenario.mjs` (`SIZE_PX`, lines 28–30);
`scripts/perf/undo-scenarios.mjs` (`MAX_UNDO_DEPTH`, line 148; `MAX_HOT_RASTERS`, line 287) @
9ae62ff1

**Priority:** P2

#### Problem

Three engine-owned values are hand-copied into the harness and kept in sync only by comment —
exactly the pattern CLAUDE.md calls a defect ("A 'keep in sync with X' comment marks a defect, not a
mitigation"):

1. `replay-scenario.mjs:28–30`:
   ```js
   // Mirrors SIZE_TO_PX in web/src/lib/state/strokeWidth.svelte.ts; this Node script
   // cannot import the app's Svelte rune module.
   export const SIZE_PX = { 1: 2, 2: 4, 3: 8, 4: 14, 5: 22 };
   ```
   The app source is `web/src/lib/state/strokeWidth.svelte.ts:36`. The existing test ("replays every
   recorded size level at the app stroke width", `scripts/tests/perf-cli-inputs.test.mjs:129–149`)
   asserts against a *third* hand-copied set of the same literals (2/4/8/14/22), so if the app
   changes `SIZE_TO_PX`, both the mirror and its test stay green while replays silently use the
   wrong widths.
2. `undo-scenarios.mjs:148`: `const MAX_UNDO_DEPTH = 20;` mirrors the exported `MAX_UNDO_DEPTH` in
   `web/src/lib/drawing/undoHistory.ts:58`. If the engine cap moves, `STROKES = MAX_UNDO_DEPTH + 2`
   (line 150) silently stops exercising the depth-cap shift path the scenario exists to hit ("Two
   strokes past MAX_UNDO_DEPTH, so every scenario … exercises the depth-cap shift path").
3. `undo-scenarios.mjs:287`: `const MAX_HOT_RASTERS = 2;` mirrors the unexported `MAX_HOT_RASTERS`
   in `undoHistory.ts:63`; `settleColdTier` uses it as its settling predicate, so a drifted value
   makes the cold-tier wait either time out spuriously or return before demotion finishes —
   corrupting the `historyRasterMB` gate numbers.

The repo already has the canonical fix pattern for values that genuinely can't be imported:
`scripts/tests/palette-source.test.mjs` regex-reads `web/src/lib/palette.ts` and fails on divergence
(and it already covers `session.mjs`'s COLORS copy — these three constants have no equivalent).

#### Proposed solution

Add a drift-guard test (e.g. `scripts/tests/perf-engine-mirrors.test.mjs`) that reads the two app
sources as text, extracts `SIZE_TO_PX`'s entries, `MAX_UNDO_DEPTH`, and `MAX_HOT_RASTERS` with
anchored regexes, and asserts equality with the harness's exported/parsed values (export
`MAX_UNDO_DEPTH`/`MAX_HOT_RASTERS` from the harness modules, or regex-read the harness files too).
Then delete the hand-copied literals from the SIZE_PX replay test and assert against the imported
`SIZE_PX` instead — the drift guard makes the mirror trustworthy.

---

### [Architecture] Five entry scripts duplicate the launch → context → goto → settle → CDP → throttle boilerplate

**File(s):** `scripts/perf/scenario.mjs` (lines 30–50); `scripts/perf/ios.mjs` (lines 28–40);
`scripts/perf/mount.mjs` (lines 44–78); `scripts/perf/replay-scenario.mjs` (lines 76–98);
`scripts/perf/undo-scenarios.mjs` (lines 434–452) @ 9ae62ff1

**Priority:** P2

#### Problem

Every Chromium-based entry repeats the same ~15-line block with slight variations:

```js
const { base, stop } = await buildAndPreview(port, { build });
const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutablePath(chromium) });
...
const ctx = await browser.newContext({ viewport: {...}, deviceScaleFactor: ..., hasTouch: true, isMobile: false });
const page = await ctx.newPage();
await page.goto(..., { waitUntil: 'networkidle' });
await page.waitForSelector('#drawingCanvas' /* or #engineCanvas */);
await sleep(400 /* or 150 */);
const cdp = await ctx.newCDPSession(page);
if (throttle.active) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle.rate });
```

plus the mirrored teardown `finally { await browser.close(); stop(); }` in all five. The variations
are small and enumerable: engine (`chromium` vs `webkit`), URL (`/` vs `/dev/engine`), ready
selector, and whether a CDP session is possible. The duplication has already produced drift:
`scenario.mjs`/`ios.mjs`/`mount.mjs` pass `isMobile: false` while `replay-scenario.mjs:83–87` and
`undo-scenarios.mjs:441–445` omit it, and the settle sleeps differ silently (400 vs 150 ms). Any
future change (e.g. a new ready condition, a `reducedMotion` setting) must be applied five times.

#### Proposed solution

Add `scripts/perf/browser.mjs` with something like:

```js
export async function openProfiledPage({ base, path = '/', viewport, deviceScaleFactor, throttle, readySelector = '#drawingCanvas', engine = 'chromium' })
// → { browser, page, cdp /* null for webkit */, close() }
```

that owns launch, context creation, navigation, the ready wait + named settle constant, CDP session
creation, and throttling. Entries keep `buildAndPreview` and their per-target settings; teardown
becomes `finally { await close(); stop(); }`. Gotcha: `mount.mjs` must install its `addInitScript`
and start tracing *before* `goto`, so the helper needs either a `navigate: false` mode or a
`beforeNavigate(page, cdp)` hook — worth designing around mount first since it's the odd one out.

---

### [Maintainability] Every perf entry parses argv at module scope; tests must mutate `process.argv` to cope

**File(s):** `scripts/perf/scenario.mjs` (lines 20–23); `scripts/perf/ios.mjs` (line 21);
`scripts/perf/mount.mjs` (lines 35–38); `scripts/perf/replay-scenario.mjs` (lines 33–39);
`scripts/perf/undo-scenarios.mjs` (lines 43–56); `scripts/perf/android.mjs` (lines 28–29);
`scripts/perf/args.mjs` (lines 18–23) @ 9ae62ff1

**Priority:** P2

#### Problem

All six entry modules run `parsePerfArgs(...)` (or a hand-rolled `process.argv.slice(2)`) at module
top level, outside the `isMain`-gated entry function. `args.mjs` documents the resulting contortion:

```js
// Tolerant lookup (never throws) and an `entry`-gated warn-only unknown-flag
// report: the perf entry modules parse at module scope but are also imported as
// libraries by the vitest script suites, where argv is vitest's own.
```

So the parser must be tolerant-by-design (it can never `fail()` on a bad flag — see the P3
device-typo finding), needs the `entry` boolean to suppress warnings under vitest, and the test
suite has to smuggle flags in through the real `process.argv`
(`scripts/tests/undo-scenarios.test.mjs:41–46` saves/patches/restores `process.argv` in
`beforeEach`/`afterEach` just to set `--cold-tier-timeout-ms=0`). Module-scope parsing also means
simply *importing* `undo-scenarios.mjs` computes `LONG_OPS`, `STROKES`, etc. from whatever argv
happens to hold.

#### Proposed solution

Move the `parsePerfArgs` call inside each `runX()` entry function (and thread the result to helpers
as a parameter — `undo-scenarios.mjs` closes over module-scope `flag`/`throttle` in
`runUndoScenarios`, `buildUndoSettings`, and `runUndoScenario`, so those gain an options argument).
Then: the `entry` parameter and its warn-only compromise disappear (unknown flags can `fail()`
hard), and tests pass options directly instead of patching `process.argv`. This is a mechanical but
cross-cutting change; do it together with the argv-validation finding below so the parser's error
behavior only changes once.

---

### [Maintainability] `analyze-webinspector.mjs` is an ungated top-level script — violates the scripts convention

**File(s):** `scripts/perf/analyze-webinspector.mjs` (lines 32–166) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — the missing gate is real and `isMain(import.meta.url)` matches the
> actual `scripts/lib/proc.mjs` signature. The testability argument is weaker than stated, though:
> `perf-cli-inputs.test.mjs` spawns `analyze.mjs` as a subprocess even though that file *is* gated.

#### Problem

`scripts/CLAUDE.md` requires: "Every CLI script gates execution behind `isMain(import.meta)` … and
exports a distinctly named entry function." `analyze-webinspector.mjs` does neither — everything
from argv handling (line 32) through the final `console.log` (line 158) executes at module top
level, with `const` state (`markers`, `spans`, line 54–63) and output interleaved at module scope.
Its sibling `analyze.mjs` follows the convention (a `main()` gated at line 555, exported
`analyze`/`renderReport`). Consequences beyond consistency: the file cannot be imported for unit
testing (the CLI-failure tests in `perf-cli-inputs.test.mjs` must spawn it as a subprocess for every
case), and any future harness module that wants to reuse `engineOp`/`enclosing`/`stat` cannot import
them without executing the whole analysis on vitest's argv.

#### Proposed solution

Wrap the body in `export function analyzeWebInspectorExport(path)` (parsing, `engineOp`, and the
report printing), keep `stat`/`fmt`/`enclosing` as module-level helpers, and gate with
`if (isMain(import.meta.url)) runMain(...)` like the other entries. The subprocess-based CLI-failure
tests keep working unchanged; new tests can then unit-test `engineOp`'s pairing logic (ring-buffer
unpaired starts, out-of-order ends) directly, which is the trickiest logic in the file and currently
untested.

---

### [Correctness] `perf:undo`'s frame/heap metrics silently cover only the last scenario, but the report presents them as session-wide

**File(s):** `scripts/perf/undo-scenarios.mjs` (`runUndoScenario`, lines 326–330;
`runUndoScenarios`, lines 484–496) @ 9ae62ff1

**Priority:** P3

#### Problem

`resetEngine` (line 224–233) does a full `page.goto` before every scenario, wiping `window.__perf`.
`runUndoScenario` re-injects the observers (line 328–329: "Reload drops the rAF FPS sampler injected
before the trace; re-inject so frame health still reflects this scenario"), but `readObservers` is
called exactly once, after the loop (line 484). So `metrics.frames` and `metrics.longTasks` describe
only the final scenario (`crayon-scribbles`), while `report.md`'s "Frame health" section (rendered
by the shared `analyze.mjs` `renderReport`, lines 385–412) presents them as "Avg FPS (whole
session)" with `settings.durationMs` spanning the entire run. Similarly `buildMetrics` is called
with `heapBefore: 0` (line 494), which produces a misleading Memory section (see the separate heap
finding). Anyone comparing two `perf:undo` runs' frame health is actually comparing one scenario
against another run's same scenario at best — or nothing meaningful if `--scenarios` filtered
differently.

#### Proposed solution

Drain per scenario: call `readObservers(page)` at the end of `runUndoScenario` (before the next
reset), store the result on the scenario's `result`, and aggregate (sum counts, recompute fps over
the summed span) into the session-level metrics — or, if per-scenario frame data isn't worth
keeping, at minimum stamp the frames object with the scenario key it covers so the report can label
it honestly ("Frame health (last scenario: crayon-scribbles)"). The first option also enriches
`undo-scenarios.md` with a per-scenario long-frame column, which is the number the ADR-0066 "no
dropped frames while blobs encode" gate actually wants.

---

### [Correctness] `beat()` converts every failure — including harness bugs — into a console-only "skipped", leaving no trace in the artifacts

**File(s):** `scripts/perf/session.mjs` (`beat`, lines 34–42; `runToddlerSession`, lines 118–163) @
9ae62ff1

**Priority:** P3

#### Problem

```js
async function beat(page, label, fn) {
  process.stdout.write(`  • ${label}… `);
  try {
    await markPhase(page, label, fn);
    console.log('ok');
  } catch (err) {
    console.log(`skipped (${err.message})`);
  }
}
```

Two problems. First, the skip is recorded nowhere except transient stdout: `metrics.json`,
`summary.json`, and `report.md` are written as if the session ran fully. A run where `pickColor`
broke (the app-driver module "rots silently when app markup … change[s]" per `scripts/CLAUDE.md`)
yields a report whose `change-colors` phase is simply absent or near-empty — indistinguishable from
a genuinely fast phase, which invites false "regression fixed!" readings when comparing profiles.
Second, the catch swallows *all* errors, including programming errors in the harness itself (a typo
in `multiFingerDraw` reports as `skipped (foo is not defined)` and the run "succeeds"). The scripts
convention explicitly requires per-item failures to be "report[ed] … at the end without discarding
completed results".

#### Proposed solution

Have `beat` return `{ label, ok, error? }`, collect the results in `runToddlerSession`, and thread
them into `driveSession`'s `settings` (e.g. `settings.skippedBeats: ['change-colors: …']`) so they
land in `metrics.json`/`summary.json`; make `renderReport` print a prominent warning section when
any beat skipped. Optionally re-throw on a second consecutive skip or when *all* beats fail, which
is the "driver rotted" signature.

---

### [DX] Unknown `--device` silently profiles the phone viewport while labeling artifacts with the typo

**File(s):** `scripts/perf/devices.mjs` (`resolveDevice`, lines 9–11); `scripts/perf/scenario.mjs`
(lines 28, 57) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
export function resolveDevice(name) {
  return DEVICES[name] || DEVICES.phone;
}
```

`--device=tabelt` (typo) resolves to the phone viewport, but `deviceName` — the raw string — is what
gets baked into both the artifact directory (`profilePath('web', deviceName, throttle.tag)`,
scenario.mjs:28) and the recorded settings (`device: deviceName`, scenario.mjs:57; same in
ios.mjs:26/47). The resulting profile claims to be a "tabelt" run in its dirname and report header
while actually measuring 412×915@2.6 — a silently wrong artifact that can mislead later comparisons.
This contradicts both the closed-value-set convention ("never bare `string` … plus a runtime
fallback") and the scripts convention ("validate inputs up front with a path-specific one-line error
and a non-zero exit"). Note `parsePerfArgs` can't currently `fail()` at module scope (see the
module-scope-parsing finding), so the fix sequencing matters.

#### Proposed solution

Make `resolveDevice` throw (or return `null` and have the entry `fail()`) on an unknown name:
``fail(`Unknown --device=${name} — known: ${Object.keys(DEVICES).join(', ')}`)``. Land it after (or
together with) moving argv parsing inside the entry functions so the hard failure can't fire during
a vitest library import.

---

### [Maintainability] The undo-drain loop and its unnamed 5000 ms stall cap are triplicated

**File(s):** `scripts/perf/undo-scenarios.mjs` (`undoAll`, lines 253–272);
`scripts/perf/ipad-console-driver.js` (`undoAll`, lines 113–128); `scripts/perf/replay-scenario.mjs`
(drain loop, lines 270–282) @ 9ae62ff1

**Priority:** P3

#### Problem

Three near-identical implementations of "fire undo, then poll
`performance.getEntriesByName('engine.undo', 'measure')` until a new measure lands, with a stall
cap": `undo-scenarios.mjs:257–269`, `ipad-console-driver.js:114–127`, and the tail-drain in
`replay-scenario.mjs:271–282` (whose comment even says "a stall cap (matching undo-scenarios'
per-step wait)" — sync by prose). The `5000` cap appears as a bare literal in all three (lines 265,
122, 274) despite the tuning-literal convention (named constant, `_MS` unit, WHY on the constant —
the WHY here is the non-obvious "a marks-less build never lands a measure, so the cap keeps the loop
moving"). The console snippet legitimately can't import Node modules, but the two `.mjs` copies can
share, and `MAX_UNDO_STEPS`' cap of 60 (undo-scenarios:149) is hardcoded as bare `60` in the console
driver (line 116).

#### Proposed solution

Name the constant once (`const UNDO_MEASURE_STALL_CAP_MS = 5000;` in e.g. `thresholds.mjs`) and pass
it into the in-page functions of both `.mjs` call sites (they already thread parameters through
`page.evaluate`, so adding one is mechanical). Extract the shared in-page waiter into a serializable
helper both pass in, or at least a single exported page-function `undoAllInPage` used by both. For
the console snippet, give the literal a named local `const UNDO_MEASURE_STALL_CAP_MS = 5000;` so the
value is at least greppable under the same name across all three.

---

### [Readability] `renderReport` is a 166-line monolith of nine report sections

**File(s):** `scripts/perf/analyze.mjs` (`renderReport`, lines 367–533) @ 9ae62ff1

**Priority:** P3

#### Problem

`renderReport` linearly builds nine distinct sections — settings table, frame health, long tasks,
main-thread buckets, engine hot paths, per-phase table (two variants gated on `userTimingOnly`),
long-task attribution, JS self-time, memory — each with its own empty-state fallback and conditional
logic (`userTimingOnly` at line 414 changes two sections' shape). At 166 lines it is the exact
"section banners inside one function" shape the CLAUDE.md convention says to extract "the first
time": each `out.push('\n## …')` boundary is a natural named helper. Today, changing one section
means scrolling a function that also owns eight others, and none of the section logic is
independently testable (the existing `perf-analyze.test.mjs` tests only `analyze()`, not the
rendering).

#### Proposed solution

Extract one helper per section, each `(s) => string` (or `string[]`), e.g.
`renderSettingsSection(settings)`, `renderFrameHealth(frames, longTasks)`,
`renderMainThreadBuckets(breakdown, userTimingOnly)`, `renderEngineHotPaths(engineHotPaths)`,
`renderPhaseSection(phases, userTimingOnly)`, `renderLongTaskAttribution(longTaskAttribution)`,
`renderSelfTimeSection(topSelfTime)`, `renderMemorySection(heap)`; `renderReport` becomes a ~12-line
concatenation that reads as the report's table of contents. Pure string-in/string-out helpers also
become trivially unit-testable (empty-state branches especially).

---

### [Correctness] `android.mjs`: a missing `adb` binary reports "No Android device/emulator on adb", and the entry ignores the shared arg parser

**File(s):** `scripts/perf/android.mjs` (lines 28–43) @ 9ae62ff1

**Priority:** P3

#### Problem

Two issues in the entry plumbing:

1. `adb()` wraps `spawnSync('adb', …)`. When `adb` is not installed (the common first-run failure on
   a fresh machine), `spawnSync` returns `{ error: ENOENT, stdout: null }`; `requireDevice` (lines
   33–43) does `adb(['devices']).stdout || ''` and fails with *"No Android device/emulator on adb.
   Boot one (npm run android:boot) and retry."* — sending the user to boot an emulator when the
   actual problem is a missing toolchain. `scripts/lib/proc.mjs` already exports `hasCommand` for
   exactly this preflight.
2. Lines 28–29 hand-roll argv handling at module scope
   (`const args = process.argv.slice(2); const build = !args.includes('--no-build');`) instead of
   using `parsePerfArgs` like every sibling entry — so `perf:android` alone gets no unknown-flag
   warning (`--nobuild` silently does a full rebuild+reinstall, which takes minutes) and diverges
   from the harness's one arg surface.

#### Proposed solution

Start `runAndroidProfile` with
`if (!hasCommand('adb')) fail('adb not found on PATH — install Android platform-tools (see the mobile skill).')`,
and check `result.error` in `adb()` generally. Switch to
`parsePerfArgs({ entry: isMain(import.meta.url) })` for the `build` flag (device/port/throttle don't
apply, so `COMMON_FLAGS` may need a narrower variant — or accept the extra known-but-unused flags as
harmless).

---

### [Maintainability] The `engine.*` mark vocabulary is scattered as bare string literals across four harness files, unanchored to its source

**File(s):** `scripts/perf/replay-scenario.mjs` (lines 316–321);
`scripts/perf/analyze-webinspector.mjs` (lines 132–139); `scripts/perf/undo-scenarios.mjs` (lines
349–355); `scripts/perf/ipad-console-driver.js` (lines 197–200); `scripts/perf/analyze.mjs`
(line 342) @ 9ae62ff1

**Priority:** P4

#### Problem

The mark names emitted by the app's PERF_MARKS instrumentation (`web/src/lib/drawing/engine.ts` —
e.g. `'engine.commit'` at line 646, `'engine.draw'` at 920, `'engine.undo'` at 1098) are consumed as
re-typed literals in at least five harness locations: the replay report's five-row list, the Web
Inspector analyzer's six-name loop, `undo-scenarios`' per-phase lookups, the console driver's
`agg(...)` calls, and `analyze.mjs`'s `startsWith('engine.')` filter. These are boundary strings in
the CLAUDE.md sense ("declared once, imported everywhere"); today, renaming a mark in `engine.ts`
(or adding a new one like `engine.fold`'s sibling) silently drops rows from some reports and not
others — the Web Inspector analyzer would just print nothing for the renamed op, with no error.
There is no shared constant and no drift guard.

#### Proposed solution

Declare the closed list once on the scripts side —
`export const ENGINE_OPS = ['engine.draw', 'engine.snapshot', 'engine.fold', 'engine.commit', 'engine.undo', 'engine.resize'];`
(a natural fit next to `LONG_TASK_MS` in a widened `thresholds.mjs` or a new `engine-marks.mjs`) —
import it in the three `.mjs` consumers, and add a drift-guard test that regex-scans
`web/src/lib/drawing/engine.ts` (and `crayonBrush.ts`/`undoHistory.ts` if they emit marks) for
`performance.measure('engine.…'` names and asserts set-equality with `ENGINE_OPS`. The console
snippet stays hand-listed (it can't import) but the drift guard's failure message can name it for
manual update.

---

### [Correctness] `heapBefore ?? 0` masks "unavailable" as zero, producing a bogus Memory section for `perf:undo` runs

**File(s):** `scripts/perf/profile-artifacts.mjs` (`buildMetrics`, line 10);
`scripts/perf/undo-scenarios.mjs` (line 494); `scripts/perf/analyze.mjs` (`renderReport`, lines
514–529) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
heap: { beforeBytes: heapBefore ?? 0, afterBytes: heapAfter ?? obs.heapBytes ?? 0 },
```

`heapBytes()` returns `null` on engines without `performance.memory` (WebKit), and
`undo-scenarios.mjs:494` passes `heapBefore: 0` outright. `renderReport` gates the Memory section
only on `s.heap.afterBytes` being truthy (line 515), then prints:

```
| JS heap before | 0.0 MiB |
| JS heap after  | 87.3 MiB |
| Delta          | 87.3 MiB |
```

— a fabricated "the session leaked 87 MiB" reading, when in truth the before-sample was never taken.
The zero-coalescing erases the distinction the renderer needs between "measured 0" (impossible for a
live page) and "not measured".

#### Proposed solution

Keep `null` through:
`heap: { beforeBytes: heapBefore ?? null, afterBytes: heapAfter ?? obs.heapBytes ?? null }`, have
`renderReport` print `n/a` for a null before-value and skip the Delta row when either side is null,
and drop the explicit `heapBefore: 0` in `undo-scenarios.mjs` (pass `null`; its own report already
owns the meaningful per-scenario heap table and explains why `performance.memory` is the wrong lens
there anyway).

---

### [Types] Numeric flag values are never validated — `--throttle=abc`, `--port=abc`, `--hz=abc` all silently produce NaN behavior

**File(s):** `scripts/perf/args.mjs` (`resolveThrottle`, lines 3–14; `parsePerfArgs`, line 52);
`scripts/perf/undo-scenarios.mjs` (lines 56, 64–66, 71) @ 9ae62ff1

**Priority:** P4

#### Problem

`resolveThrottle` does `Number(hit ? hit.split('=')[1] : defaultRate)`; `--throttle=abc` yields
`rate: NaN`, `active: false` (NaN > 1 is false), `tag: 'raw'` — the run proceeds unthrottled,
labeled as a deliberate raw run, with no warning. `--port=abc` (args.mjs:52) yields `NaN`, so
`buildAndPreview` polls `http://localhost:NaN/` until its 90 s timeout — a slow, opaque failure far
from the typo. The `undo-scenarios` numeric flags (`--hz`, `--long-seconds`, `--strokes`,
`--cold-tier-timeout-ms`, lines 56–72) have the same hole; `--strokes=abc` makes every
`Array.from({ length: NaN })` empty and the run reports empty scenarios as if the engine did
nothing. The scripts convention requires validating inputs up front with a one-line error.

#### Proposed solution

Add a `numericFlag(name, fallback)` helper to `args.mjs` that parses and `fail()`s on `Number.isNaN`
(``fail(`--${name} must be a number, got "${raw}"`)``), and use it for throttle/port and the
`undo-scenarios` flags. Do this after (or with) moving argv parsing into the entry functions, since
`fail()` at module scope would break library imports under vitest.

---

### [Readability] `CONTAINER_EVENTS` is declared 175 lines after its first use, stranded mid-file between unrelated functions

**File(s):** `scripts/perf/analyze.mjs` (line 304; first use line 129) @ 9ae62ff1

**Priority:** P4

#### Problem

`classifyEvents` (line 108) reads `CONTAINER_EVENTS` at line 129, but the constant is declared at
line 304, wedged between `perPhase` and `attributeLongTasks`. It only works because `classifyEvents`
isn't called until `analyze()` runs post-module-evaluation — a temporal-dead-zone trap for anyone
who refactors module-load-time calls in, and a navigation cost for anyone reading `classifyEvents`
top-down (the natural reading order suggests the constant doesn't exist). Every other event-name set
(`SCRIPTING`, `RENDERING`, `PAINTING`, `HARNESS_SYMBOLS`) lives at the top of the file, lines 24–80.

#### Proposed solution

Move `CONTAINER_EVENTS` (with its attribution comment) up beside the other event-name sets, around
line 58. Pure move, no behavior change.

---

### [Maintainability] `LONG_FRAME_MS` lives in `capture.mjs` while `analyze.mjs` hardcodes ">32 ms" in the report label

**File(s):** `scripts/perf/capture.mjs` (line 19); `scripts/perf/analyze.mjs` (line 393);
`scripts/perf/thresholds.mjs` @ 9ae62ff1

**Priority:** P4

#### Problem

The long-frame threshold is applied in `capture.mjs` (`const LONG_FRAME_MS = 32;`, used by
`readObservers` at line 75), but the report's row label is a re-typed literal:

```js
['Long frames (>32 ms)', String(s.frames.longFrames ?? 'n/a')],
```

If the threshold moves (e.g. to a 120 Hz-aware value — plausible given ProMotion is the target
device per `undo-scenarios.mjs`), the report will label the count with the wrong number. Cross-file
agreement by prose is exactly what `thresholds.mjs` exists to prevent — it already single-sources
`LONG_TASK_MS` for both files. The same pattern appears with the `>50 ms` literals in
`renderReport`'s prose (lines 404, 482), which do agree with `LONG_TASK_MS` only by coincidence of
both being hand-typed 50s.

#### Proposed solution

Move `LONG_FRAME_MS` into `thresholds.mjs` beside `LONG_TASK_MS`, import it in both `capture.mjs`
and `analyze.mjs`, and interpolate both thresholds into the report strings:
`` `Long frames (>${LONG_FRAME_MS} ms)` ``, `` `Long tasks (>${LONG_TASK_MS} ms)` ``.

---

### [Maintainability] Settle/pacing sleeps are unnamed tuning literals scattered across the harness

**File(s):** `scripts/perf/scenario.mjs` (line 45); `scripts/perf/ios.mjs` (line 40);
`scripts/perf/android.mjs` (line 107); `scripts/perf/session.mjs` (lines 94, 113, 115, 119, 156,
158); `scripts/perf/preview.mjs` (line 22); `scripts/perf/undo-scenarios.mjs` (lines 232, 301);
`scripts/perf/replay-scenario.mjs` (line 94) @ 9ae62ff1

**Priority:** P4

#### Problem

The harness is full of bare-number waits that encode tunable pacing decisions: `await sleep(400)`
post-canvas settle (three entries), `sleep(150)` engine-resize settle (`undo-scenarios.mjs:232`,
`replay-scenario.mjs:94`), `sleep(120)` between undo clicks (`session.mjs:94`), `sleep(700)` for the
`boot-settle` beat (`session.mjs:119`), `sleep(500)` after `freePort` (`preview.mjs:22`),
`sleep(100)` cold-tier poll interval (`undo-scenarios.mjs:301`). Per the CLAUDE.md convention, a
duration literal is a named tuning constant with the unit in the name and the WHY on the constant —
and the same files prove the convention works when followed (`POST_LOAD_SETTLE_MS`,
`WEBVIEW_SOCKET_POLL_INTERVAL_MS`, `MAX_IDLE_GAP_MS` all carry their rationale). The unnamed ones
are precisely the values someone tuning harness flakiness needs to find, and today they're only
greppable as `sleep(4`.

#### Proposed solution

Name each at module scope where it's used: e.g. `CANVAS_SETTLE_MS = 400` (scenario/ios/android —
ideally hoisted into the shared launch helper proposed above), `ENGINE_RESIZE_SETTLE_MS = 150`,
`UNDO_CLICK_PACE_MS = 120`, `BOOT_SETTLE_MS = 700`, `PORT_RELEASE_SETTLE_MS = 500`,
`COLD_TIER_POLL_INTERVAL_MS = 100`. One-line WHY each; no behavior change.

---

### [Readability] Speculative/unused tuning parameters: `attributeLongTasks(limit = 12)`, `jsSelfTime`'s bare `slice(0, 15)`, `multiFingerDraw(fingers, steps)` defaults

**File(s):** `scripts/perf/analyze.mjs` (line 310, line 242); `scripts/perf/session.mjs` (line 48,
call at line 133) @ 9ae62ff1

**Priority:** P4

#### Problem

* `attributeLongTasks(runTasks, nested, windows, limit = 12)` — the only caller (`analyze()`,
  line 344) never passes `limit`; per the no-speculative-surface convention an optional parameter
  needs a production caller exercising it (none does, no test does either). The `12` is also an
  unnamed top-N tuning value.
* `jsSelfTime` ends with `.slice(0, 15)` (line 242) — the same "top-N rows in the report" decision
  as `limit`, but expressed a different way in the same file, unnamed.
* `multiFingerDraw(page, fingers = 5, steps = 48)` (session.mjs:48) — only called as
  `multiFingerDraw(page)` (line 133); the defaults are speculative knobs.

Two conventions hit at once: unnamed tuning literals and speculative surface.

#### Proposed solution

Replace the parameters with named module-scope constants: `LONG_TASK_ATTRIBUTION_LIMIT = 12` and
`SELF_TIME_TABLE_ROWS = 15` in `analyze.mjs`; `MULTI_FINGER_COUNT = 5` / `MULTI_FINGER_STEPS = 48`
in `session.mjs` (the in-page evaluate already receives them as an argument object, so keep passing
the constants through). If a knob is genuinely wanted later, reintroduce it with a caller.

---

### [Maintainability] Undo-scenario stroke geometry is duplicated between the Node harness and the iPad console driver, synced only by comment

**File(s):** `scripts/perf/undo-scenarios.mjs` (`longSquiggle`/`scribble`/`multiFingerGesture`,
lines 79–144; `engineMeasuresIn`, lines 206–222); `scripts/perf/ipad-console-driver.js` (lines
44–108, 221–225) @ 9ae62ff1

**Priority:** P4

#### Problem

`ipad-console-driver.js` re-implements `longSquiggle`, `scribble`, and `multiGesture` (lines 44–87)
plus the measure aggregation (`agg`, lines 94–108 ≈ `engineMeasuresIn`) and pins the scenario shape
by prose: "22 strokes — two past the depth-20 cap (MAX_UNDO_DEPTH, matching
scripts/perf/undo-scenarios.mjs)" (lines 221–223). The whole point of the console driver is that its
numbers are comparable to the desktop harness's — the A/B is meaningless if the shapes drift (e.g.
`scribble`'s `sweeps = 8` or the sine frequency `Math.PI * 12` changed on one side only). The
snippet legitimately can't `import` (it's pasted into Safari's console), so this isn't a simple
deduplication — but today nothing would even flag a divergence.

#### Proposed solution

Two workable options, in order of preference: (a) extract the generators into a dependency-free
`scripts/perf/undo-stroke-shapes.mjs` that `undo-scenarios.mjs` imports, and add a drift-guard test
that reads `ipad-console-driver.js` as text and asserts its geometry literals (`sweeps`, sine
multipliers, margins, `HZ`, stroke counts) match the shared module's exported constants; or (b)
generate the snippet's geometry section from the shared module at build/check time. Option (a) is
far cheaper and follows the established source-scanning drift-guard pattern
(`palette-source.test.mjs`). Either way the "matching scripts/perf/undo-scenarios.mjs" comment stops
being the only enforcement.

---

### [Readability] `renderUndoReport` repeats the `if (s.skipped)` n/a-row branch in all four tables

**File(s):** `scripts/perf/undo-scenarios.mjs` (`renderUndoReport`, lines 518–622) @ 9ae62ff1

**Priority:** P4

#### Problem

The 105-line renderer builds four Markdown tables (snapshot stack, drawing cost, undo cost, history
memory, plus the JS-heap table — five), and each repeats the same shape:

```js
for (const s of scenarios) {
  if (s.skipped) {
    out.push(`| ${s.label} | ... | n/a | n/a | ... |`);
    continue;
  }
  out.push(`| ${s.label} | ...real columns... |`);
}
```

Five hand-maintained n/a row templates whose column counts must each match their header (a mismatch
renders broken Markdown silently — nothing checks it). Adding a column to any table means touching
two format strings that must stay in sync.

#### Proposed solution

Extract a row helper, e.g. `scenarioTable(out, scenarios, headers, (s) => [cells...])` that renders
`n/a` for every data column automatically when `s.skipped` (deriving the n/a count from
`headers.length`), or reuse/extend `analyze.mjs`'s `table(headers, rows)` (currently unexported) so
both renderers share one table primitive. This collapses ~40 lines and makes header/row arity
structurally correct.

---

### [DX] `perf:mount` prints raw unrounded floats for blocking time

**File(s):** `scripts/perf/mount.mjs` (lines 104–110) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const blocking = summary.longTasks.reduce(
  (sum, t) => sum + Math.max(0, t.duration - LONG_TASK_MS),
  0,
);
console.log(
  `Long tasks (>${LONG_TASK_MS} ms): ${summary.longTasks.length}, blocking time ~${blocking} ms`,
);
```

`t.duration` values are DOMHighResTimeStamps, so the summed value interpolates as e.g.
`blocking time ~347.20000000000005 ms` — noisy next to the neighboring lines that all use
`.toFixed(0)`.

#### Proposed solution

`blocking.toFixed(0)` (the `~` already signals approximation). One-character-class fix; only worth
doing while touching the file for the P1 `join` bug.

---

### [DX] `replay-scenario.mjs` uses `console.error` + `process.exit(1)` for one input error and `fail()` for the other three

**File(s):** `scripts/perf/replay-scenario.mjs` (`runReplayScenario`, lines 42–47 vs 52, 56, 61) @
9ae62ff1

**Priority:** P5

#### Problem

The missing `--recording` flag path hand-rolls its exit:

```js
if (!recordingPath) {
  console.error(
    'Usage: npm run perf:replay -- --recording=<recording.json> [--turbo] [--throttle=N]',
  );
  process.exit(1);
}
```

while the unreadable-file, bad-JSON, and no-events-array paths three lines later all use `fail(...)`
from `scripts/lib/proc.mjs` (lines 52, 56, 61), as does the rest of the harness. `analyze.mjs`'s
`main()` (lines 543–547) has the same hand-rolled usage exit. Minor, but it's the one place a
`process.exit` hides inside an exported library function rather than the shared helper, and
consistency here is what keeps the CLI-failure tests' expectations uniform.

#### Proposed solution

`fail('Usage: npm run perf:replay -- --recording=<recording.json> [--turbo] [--throttle=N]')` in
both files. If the usage text should go to stderr without the shared `fail` prefix styling, extend
`fail` rather than bypassing it.

## Source: Code audit — scripts/lib — shared script helpers

### [Correctness] Dark-theme token values have drifted between the duplicated theme blocks in scrapbook-chrome

**File(s):** `scripts/lib/scrapbook-chrome.mjs` (`CHROME_CSS`, lines 53–65 vs 77–87) @ 9ae62ff1

**Priority:** P2

#### Problem

`CHROME_CSS` states each theme's custom properties twice: once for the OS preference
(`@media (prefers-color-scheme: dark)`, lines 53–65) and once for the explicit toggle
(`:root[data-theme=dark]`, lines 77–87). The light pair (`:root` at lines 38–51 vs
`:root[data-theme=light]` at lines 66–76) is byte-identical, but the two dark blocks disagree on six
tokens:

| token           | `@media` dark (l. 55–57) | `[data-theme=dark]` (l. 79–83) |
| --------------- | ------------------------ | ------------------------------ |
| `--card`        | `#1d1f27`                | `#1c1e24`                      |
| `--card-2`      | `#181a20`                | `#191b20`                      |
| `--muted`       | `#a8a4af`                | `#a19da8`                      |
| `--faint`       | `#807d89`                | `#797682`                      |
| `--hair`        | `#34373f`                | `#2b2e36`                      |
| `--hair-strong` | `#464a55`                | `#3a3e48`                      |

So a viewer whose OS is dark sees different card/hairline/muted colors than a viewer who used a
theme toggle to select dark — on every published scrapbook page (index, icons sheet, model-eval
report, which layers `EXTRA_CSS` on this at `scripts/lib/model-eval-report.mjs` lines 90–94 using
the same two-block pattern, there without drift). Nothing marks the divergence as intentional; it is
exactly the failure mode the repo convention ("cross-file agreement is never maintained by prose")
exists to prevent, here within a single file.

#### Proposed solution

Stop hand-writing each palette twice. Define the token sets once as JS objects and emit them into
all selectors:

```js
const LIGHT_TOKENS = { paper: '#f5f3ee' /* … */ };
const DARK_TOKENS = { paper: '#131418' /* … */ };
const cssVars = (tokens) => Object.entries(tokens).map(([k, v]) => `--${k}:${v};`).join('');
```

then interpolate `cssVars(DARK_TOKENS)` into both the `@media` block and `:root[data-theme=dark]`.
This removes the whole drift class (and shrinks the file). If the current rendered look must be
preserved exactly, first decide which of the two dark palettes is the intended one. The same
generator-object approach could also be offered to page-specific CSS like model-eval-report's
`--a`/`--b` pair, but that is optional.

### [Maintainability] model-eval's `classify()` re-implements the app's safety classifier instead of importing it

**File(s):** `scripts/lib/model-eval.mjs` (`SAFETY_REASONS` + `classify`, lines 83–111) @ 9ae62ff1

**Priority:** P2

#### Problem

Lines 85–111 duplicate `classifyGeminiResponse` from `web/src/lib/server/ai/geminiSafety.ts` (lines
17–60), including a verbatim copy of the six-value `SAFETY_REASONS` set. The comment admits it:
"Mirror of the app's classifyGeminiResponse … reduced to what the harness records". Two problems:

1. `geminiSafety.ts` was *deliberately made dependency-free* so scripts can import it — its own
   header (lines 5–8) says it is "Kept as its own dependency-free module (only a type import)
   because the asset scripts … import it directly via --experimental-strip-types". This module
   already imports web TS the same way (`themes` from `web/src/lib/design/tokens.ts` line 10,
   `PALETTE_COLORS` line 11), so the mechanism is proven in this very file.
2. The harness goes to great lengths to guarantee it measures what production does —
   `assertProductionConfig()` (lines 62–70) throws if the prompt or system instruction drifts from
   the app source — yet the *classifier* that decides whether a response counts as
   image/refusal/error has no such guard. If the app adds a finish reason to `SAFETY_REASONS` or
   changes the text-part handling, the harness silently classifies differently from production,
   undermining the refusal/error columns of the bake-off report.

#### Proposed solution

Delete the mirror and wrap the real one:

```js
import { classifyGeminiResponse } from '../../web/src/lib/server/ai/geminiSafety.ts';

export function classify(response) {
  const c = classifyGeminiResponse(response);
  if (c.kind === 'image') return c;
  if (c.kind === 'safety') return { kind: 'refusal', reason: c.reason.slice(0, 200) };
  return { kind: 'error', reason: c.reason };
}
```

Gotcha: `classifyGeminiResponse` types its parameter as `GenerateContentResponse` (type-only import
— erased by strip-types, so no runtime dependency). The mapping keeps the harness's
`refusal`/`error` vocabulary and its 200-char truncation. Confirm the model-eval scripts already run
under `--experimental-strip-types` (they must, since they import `tokens.ts` through this module
today).

### [DX] `run()` swallows the spawn error when the command itself can't be launched

**File(s):** `scripts/lib/proc.mjs` (`run`, lines 42–50; `capture`, lines 94–98) @ 9ae62ff1

**Priority:** P3

#### Problem

`run()` checks only `result.status`:

```js
const result = spawnSync(cmd, args, { … });
if (result.status !== 0) process.exit(result.status ?? 1);
```

When the command cannot be spawned at all (ENOENT — a missing SDK tool, `plutil` on Linux, an unset
PATH), `spawnSync` returns `{ error: Error, status: null }` and nothing is written to stdio. The
script prints `$ cmd args` and exits 1 with **no error message at all** — the classic "why did my
script silently die" trap, in the single most-used helper in `scripts/`. `capture()` (line 96) is
only slightly better: `fail(\`${cmd} failed (exit ${result.status})…\`)` prints "failed (exit null)"
and an empty stderr for the same case, hiding the ENOENT.

#### Proposed solution

Surface `result.error` in both helpers before exiting:

```js
if (result.error) fail(`Failed to launch ${cmd}: ${result.error.message}`);
if (result.status !== 0) process.exit(result.status ?? 1);
```

and in `capture()` include `result.error?.message` in the failure line. Two lines, and every script
that shells out through proc.mjs gets an actionable message for missing-binary failures.

### [Correctness] fixtureCrypto loads `.env` relative to cwd, as a module-import side effect

**File(s):** `scripts/lib/fixtureCrypto.mjs` (lines 17–24) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
try {
  process.loadEnvFile('.env');
} catch {
  // no .env file — rely on an exported REDTEAM_FIXTURE_KEY
}
```

Two issues. (1) The path is cwd-relative. The rest of `scripts/lib` deliberately anchors every path
on `ROOT` from `proc.mjs` precisely because scripts must not depend on the invoker's cwd; run a
redteam script from anywhere but the repo root and the `.env` lookup silently misses, the catch
swallows it, and the user gets the "Missing REDTEAM_FIXTURE_KEY" failure despite having a perfectly
good `.env` — a misleading error. (2) It executes at import time, so merely importing this module
for its pure `encryptBuffer`/`decryptBuffer` helpers (e.g. from a test) mutates `process.env`.

#### Proposed solution

Anchor and defer: move the load into `getKey()` (the only consumer of the env var), and resolve it
against the repo root:

```js
import { ROOT, fail, requireEnv } from './proc.mjs';
function getKey() {
  if (!process.env.REDTEAM_FIXTURE_KEY) {
    try { process.loadEnvFile(join(ROOT, '.env')); } catch { /* rely on exported var */ }
  }
  const secret = requireEnv('REDTEAM_FIXTURE_KEY', …);
  …
}
```

The `if` guard also stops `loadEnvFile` from clobbering an explicitly exported key with a stale
`.env` value (Node's loadEnvFile does not override existing vars, but the guard makes the intent
explicit and skips the file read).

### [Readability] iconChroma's hue thresholds are unnamed tuning literals

**File(s):** `scripts/lib/iconChroma.mjs` (`isHue`, lines 30–33) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
function isHue(hex) {
  const c = chroma(hex);
  return c.s >= 0.35 && c.l >= 0.14 && c.l <= 0.93;
}
```

`0.35`, `0.14`, and `0.93` are exactly the kind of values the repo convention singles out: "A
numeric literal that encodes a tunable decision — threshold … gets a named module-scope constant …
the WHY comment lives on the constant." These three thresholds *are* the spot-vs-monochrome
classification (they decide which icons the `COLOR_ICONS` guard test in `Icon.svelte.test.ts`
accepts), yet a reader tuning a misclassified icon has to reverse-engineer which bound is saturation
and which two are the lightness window, and there is nowhere to record why 0.35 and not 0.3.

#### Proposed solution

```js
// Below this saturation a color reads as tinted grey, not a hue.
const MIN_SPOT_SATURATION = 0.35;
// Lightness window: near-black ink and near-white paper are monochrome, not spot.
const MIN_SPOT_LIGHTNESS = 0.14;
const MAX_SPOT_LIGHTNESS = 0.93;
```

and use them in `isHue`. The existing prose comment above the function (lines 29–30) then attaches
to concrete names.

### [Readability] The fixture renderer uses the literal `7` as a stand-in for 2π (and other unnamed thresholds)

**File(s):** `scripts/lib/model-eval-fixture-renderer.js` (`dot` line 157, `circle` line 162,
`ellipse` line 167, `rays` line 187, `flower` lines 369–370, `__coloredPct` line 483, `containBox`
line 31) @ 9ae62ff1

**Priority:** P3

#### Problem

Full circles are drawn by looping angles to `7` because 7 > 2π:

```js
ctx.arc(x, y, r, 0, 7);                       // dot, line 157
for (let a = 0; a < 7; a += 0.25) …           // circle/ellipse, lines 162/167
for (let a = 0; a < 7; a += Math.PI / 6) …    // rays, line 187
```

Nothing says "this is a full turn"; a first-time reader has to notice that 7 exceeds τ and that the
overshoot is harmless. Worse, `flower()` (lines 369–370) does `const a = (k / 7) * 7;` — a no-op
expression (`a === k`) that only works because `k` runs 0…6 ≈ a full turn; it reads like a bug. Also
unnamed: the `mx - mn > 30` channel-spread threshold that defines "colored" in `__coloredPct`
(line 483) and the `pad = 0.06` contain-box margin (line 31). The file's browser-injection
constraints (IIFE, no imports) are well-commented, but they don't preclude named constants inside
the IIFE.

#### Proposed solution

Inside the IIFE add:

```js
const TAU = Math.PI * 2;
// Min RGB channel spread for a pixel to count as "colored" (vs paper/ink grey).
const COLORED_MIN_CHANNEL_SPREAD = 30;
const CONTAIN_PAD_FRACTION = 0.06;
```

Replace the `7` loop bounds with `TAU` (and `ctx.arc(x, y, r, 0, TAU)`), and rewrite `flower`'s
angle as `const a = (k / 7) * TAU;` — which is almost certainly what was meant (7 petals evenly
spaced) and currently only approximately holds. Verify the regenerated fixtures are visually
unchanged (petal positions shift by up to ~2.6°, imperceptible, but fixtures feed committed eval
inputs — regenerate deliberately or keep `a = k` with a comment if byte-stability matters).

### [Maintainability] `coloringBookProofSheetHubProblems` scrapes generated HTML with unchecked regex/indexOf and a triplicated marker string

**File(s):** `scripts/lib/scrapbook-index.mjs` (`coloringBookProofSheetHubProblems`, lines 144–180)
@ 9ae62ff1

**Priority:** P3

#### Problem

Line 146:

```js
const categoriesSource = hub.match(/const CATEGORIES = \[([\s\S]*?)\];/)[1];
```

If the hub generator ever renames `CATEGORIES` or reshapes the array, `match` returns `null` and
this crashes with `TypeError: Cannot read properties of null` — a stack trace, not a diagnosis, from
the very function whose job is producing readable drift diagnostics. Same at lines 167–169:
`sheet.indexOf(marker)` is not checked for `-1`; a missing marker makes
`dataStart = marker.length - 1` and the subsequent `JSON.parse` throws an opaque syntax error. And
the boundary string `window.__COLORING_BOOK_PROOF_SHEET__ =` is independently declared in three
places: the generator (`tools/asset-gen/bin/gen-coloring-book-proof-sheet.mjs` line 230), here (line
167), and the test fixture (`scripts/tests/scrapbook-index.test.mjs` line 31) — the test copy is the
sanctioned exception, but generator↔checker agreement is currently maintained by nothing (the import
boundary between `tools/asset-gen` and `scripts/lib` noted in scrapbook-chrome's header cuts both
ways).

#### Proposed solution

Guard both extraction points with a purpose-built error, e.g.:

```js
const m = hub.match(/const CATEGORIES = \[([\s\S]*?)\];/);
if (!m) {
  return [
    `Hub index.html no longer contains the CATEGORIES array this check parses — update scrapbook-index.mjs.`,
  ];
}
```

and similarly return a problem string (these feed a problems list already — the natural channel)
when the sheet marker is absent. For the marker itself, either export it from a tiny shared
constants module both sides may import (if the boundary rule permits a leaf constants file), or
extend `scrapbook-index.test.mjs` to read the *generator source* and assert it contains the same
marker literal — a one-assertion drift guard.

### [Architecture] `writeFileDeep` is a generic fs helper living in the frontmatter module

**File(s):** `scripts/lib/frontmatter.mjs` (`writeFileDeep`, lines 20–23) @ 9ae62ff1

**Priority:** P4

#### Problem

`frontmatter.mjs` is documented (root CLAUDE.md scripts table) as owning "the release
frontmatter/semver parsing" — `parseFrontmatter` and `compareSemverDesc` fit. But lines 20–23:

```js
export function writeFileDeep(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
```

is mkdir-p-then-write, with no relation to frontmatter or semver. The scripts convention says a
helper "joins the purpose-named module that owns its concern (or gets a new purpose-named file) —
never a utils/misc/helpers grab-bag"; parking generic fs plumbing under `frontmatter` is the seed of
exactly that grab-bag, and nobody looking for a deep-write helper will find it here (note
`fixtureCrypto.mjs` lines 53–55 already re-implemented the same thing as its private `ensureDir`
because it couldn't find one).

#### Proposed solution

Move `writeFileDeep` to a purpose-named home — `proc.mjs` is process/CLI-scoped, so a new
`scripts/lib/fs.mjs` (or naming it into `proc.mjs` is defensible if a one-function module feels
heavy) — and update the single caller (`scripts/generate-releases.mjs` line 49). While there,
consider having `fixtureCrypto.mjs` use it in place of its private `ensureDir` + `writeFileSync`
pairs (lines 75–77, 90–92).

### [Readability] Polling and settle intervals are unnamed / unit-less in net.mjs and app-driver

**File(s):** `scripts/lib/net.mjs` (`waitForUrl`, line 13) · `scripts/lib/app-driver.mjs`
(`ensureDevServer`, line 37) @ 9ae62ff1

**Priority:** P4

#### Problem

`net.mjs` line 13 hard-codes the poll cadence: `await sleep(500);` — a tuning literal (retry
interval) with no name or unit, in a file whose sibling helpers (`app-driver.mjs` lines 20–25)
demonstrate the convention perfectly (`APP_STARTUP_SETTLE_DELAY_MS = 400`, etc.). And
`app-driver.mjs` line 37 declares `ensureDevServer(port, timeout = 90_000)` — the parameter lacks
the `_MS`/`Ms` unit the convention requires in the name (`waitForUrl(url, timeoutMs, …)` next door
gets it right). Additionally, `proc.mjs` already exports a generic
`pollUntil(callback, timeoutMs, intervalMs)` (lines 82–91); `waitForUrl` re-implements the same
deadline loop by hand with its fixed 500.

#### Proposed solution

In `net.mjs`: `const URL_POLL_INTERVAL_MS = 500;` and either use it in the existing loop or rebuild
`waitForUrl` on `pollUntil`:

```js
export async function waitForUrl(url, timeoutMs, ready = (res) => res.ok) {
  const ok = await pollUntil(
    async () => {
      try {
        return ready(await fetch(url));
      } catch {
        return false;
      }
    },
    timeoutMs,
    URL_POLL_INTERVAL_MS,
  );
  if (!ok) throw new Error(`${url} did not become ready within ${timeoutMs}ms`);
}
```

In `app-driver.mjs`: rename the parameter to `timeoutMs` (callers pass positionally; no call-site
churn).

### [Architecture] smoke.mjs mixes the pass/fail reporter with an unrelated fetch helper, on module-scope mutable counters

**File(s):** `scripts/lib/smoke.mjs` (counters lines 5–6, `json` line 28) ·
`scripts/lib/adminClient.mjs` (line 8) @ 9ae62ff1

**Priority:** P4

#### Problem

Two concerns share the module. (1) `export const json = (res) => res.json().catch(() => null);`
(line 28) is response-parsing plumbing, not reporting — and it's why `adminClient.mjs` (pure request
plumbing, per its own header "this module only makes the requests") imports the *reporter* module at
line 8, coupling every adminClient consumer to the tally state. (2) The tally itself is module-scope
mutable `let passed/failed` (lines 5–6); the repo convention says module-scope mutable state "is
either a pure memoization cache or lives behind a `createX()` factory so tests get fresh instances."
It works today only because each smoke script is its own process; the module is untestable
in-process and a second suite importing it would share counters.

#### Proposed solution

Minimal: move `json` into `adminClient.mjs` (its only external consumer besides `api-smoke.mjs`,
which can import it from there or inline it) so the reporter stands alone. Fuller,
convention-aligned: `export function createSmokeReporter()` returning `{ check, fatal, summarize }`
over closure counters; the three consumer scripts (`api-smoke.mjs`, `blobs-smoke.mjs`,
`driver-smoke.mjs`) create one at their top. Low urgency — single-process CLI usage masks the state
issue — but the `json` misplacement is worth fixing whenever this file is next touched.

### [Readability] makeThumber's size, quality, and wildcard-MIME literals are unnamed or dubious

**File(s):** `scripts/lib/model-eval-report.mjs` (`makeThumber`, lines 21–54; specifically 21,
27, 44) @ 9ae62ff1

**Priority:** P4

#### Problem

Line 21: `async function makeThumber(browser, assetsDir, max = 380)` — the thumbnail bounding size
is a tuning literal hidden as a default parameter, with no unit (`_PX`) and no caller ever
overriding it (speculative parameter). Line 44: `c.toDataURL('image/jpeg', 0.8)` — the JPEG quality
knob, unnamed. Line 27 builds `data:image/*;base64,…` — `image/*` is not a valid concrete MIME type
for a data URI; it happens to decode in Chromium via sniffing, but it encodes an assumption about
browser leniency that a comment doesn't even acknowledge, and the sibling module
`scrapbook-chrome.mjs` (lines 273–278) already maintains a correct extension→MIME map.

#### Proposed solution

```js
const THUMB_MAX_PX = 380;
const THUMB_JPEG_QUALITY = 0.8;
```

drop the `max` parameter (no production caller exercises it — repo "no speculative surface" rule) or
keep it only if a second call site appears; and derive the real MIME from the source file extension
(export the `MIME` map from `scrapbook-chrome.mjs`, or a small shared `mime.mjs`, and use
`MIME[extname(absPath)] ?? 'image/png'`).

### [Correctness] `inlineImage` silently emits `data:undefined;…` for an unmapped extension

**File(s):** `scripts/lib/scrapbook-chrome.mjs` (`inlineImage`, lines 282–292; `MIME`, lines
273–278) @ 9ae62ff1

**Priority:** P4

#### Problem

The pass-through branch (line 291):

```js
return `data:${MIME[extname(path).toLowerCase()]};base64,${buf.toString('base64')}`;
```

For any extension outside the four-entry `MIME` map (`.svg`, `.gif`, `.avif`, a typo'd name), the
lookup is `undefined` and the generator embeds the literal string `data:undefined;base64,…` into a
committed, published page — a broken image discovered only by eyeballing the output. Also, the sharp
branch's `quality: 78` (line 288) is a tuning literal that per convention wants a named constant
(`INLINE_WEBP_QUALITY = 78`) carrying the size/fidelity rationale currently squeezed into the doc
comment.

#### Proposed solution

Fail closed:

```js
const mime = MIME[extname(path).toLowerCase()];
if (!mime) {
  throw new Error(
    `inlineImage: no MIME mapping for ${path} — add it to MIME in scrapbook-chrome.mjs`,
  );
}
```

Generators run at publish time, so a loud throw is strictly better than a silently broken committed
page. Name the quality constant while in the file.

### [Maintainability] `spawnViteServer` leaks process-level listeners and hijacks SIGINT per call

**File(s):** `scripts/lib/vite-server.mjs` (`spawnViteServer`, lines 44–61) @ 9ae62ff1

**Priority:** P4

#### Problem

Every call registers two permanent process-wide handlers:

```js
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(1);
});
```

Neither is removed when the caller invokes the returned `stop()`. Consequences: (a) a script that
starts servers sequentially (e.g. a perf run booting dev then preview, or repeated `ensureDevServer`
cycles) accumulates handlers toward Node's MaxListeners warning; (b) after a clean `stop()`, a later
Ctrl-C still runs the stale closure and force-exits with code 1 even if the script was
mid-graceful-shutdown of something else; (c) two servers in one process means the *first* SIGINT
handler exits the process before the second server's teardown ordering is under the caller's
control. The dead-`server.pid` kill inside `stop` is harmlessly caught, but the exit-code hijack is
real.

#### Proposed solution

Make `stop` idempotent and self-deregistering:

```js
const onExit = () => stop();
const onSigint = () => { stop(); process.exit(1); };
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  process.off('exit', onExit);
  process.off('SIGINT', onSigint);
  … existing kill logic …
};
```

Tradeoff: with multiple servers, each still installs its own SIGINT handler — that's fine once they
deregister on stop; the last one standing performs the exit.

### [Correctness] redteam-report interpolates `base` into HTML unescaped

**File(s):** `scripts/lib/redteam-report.mjs` (`buildReport`, line 144) @ 9ae62ff1

**Priority:** P4

#### Problem

Line 144:

```js
<p class='sub'>${results.length} cases · ${base} · the suite does not pass/fail …</p>;
```

Every other dynamic value in this file goes through `esc()` (`runId` line 143, ids, details,
labels), but `base` — the target URL, which arrives from CLI/env in `redteam-run.mjs` — is
interpolated raw. A base containing `&` (query string) renders invalid HTML; one containing `<`
breaks the header markup. It's an internal report, so this is a consistency/robustness issue rather
than a security one, but it's a one-word fix and the file's own convention.

#### Proposed solution

`${esc(base)}`.

### [Maintainability] `argFlag` is a hand-rolled flag parser competing with the repo's parseArgs convention

**File(s):** `scripts/lib/proc.mjs` (`argFlag`, lines 35–38) @ 9ae62ff1

**Priority:** P4

#### Problem

The scripts convention (scripts/CLAUDE.md) says "Script options are flags via `parseArgs`", and the
modern scripts comply (`gen-tokens.mjs`, `gha-versions.mjs`, `publish-scrapbook.mjs`,
`image-audit.mjs` all use `node:util` `parseArgs`). `argFlag` (lines 35–38) is a shared helper that
institutionalizes the competing pattern — prefix-scan of `process.argv` supporting only
`--name=value`, no `--name value`, no validation, no unknown-flag detection. Its only remaining
consumers are the three crayon-brush-sample scripts under `tools/asset-gen/crayon-brush-samples/`
(`build-compare-sheet.mjs` lines 26/154, `capture-current.mjs` lines 23–24, `build-sheet.mjs` line
135). As long as the helper exists in the shared lib, new scripts will keep reaching for it.

#### Proposed solution

Migrate those three call sites to `parseArgs({ options: { renders: { type: 'string' }, … } })` and
delete `argFlag`. Mechanical change; the only behavioral difference is that `--flag value`
(space-separated) starts working and typo'd flags fail loudly — both improvements.

### [Docs] book-assets' complement contract should name its guard (or become an import)

**File(s):** `scripts/lib/book-assets.mjs` (lines 1–4) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
// Books whose required `platforms` field omits 'mobile'.
// This script-side filter must remain the complement of booksForPlatform('mobile')
// in web/src/lib/state/books.ts.
export const webOnlyBooks = (books) => books.filter((book) => !book.platforms.includes('mobile'));
```

Reads as a bare "keep in sync with X" prose contract — which the repo convention labels a defect. A
guard actually *does* exist: `scripts/check-assets.mjs` lines 29–33 cross-check
`webOnlyBooks(BOOKS)` against `booksForPlatform('mobile')`. But the comment doesn't say so, so a
reader (or the next auditor) can't tell mitigated from unmitigated, and someone touching the
predicate has no pointer to the check they should run.

#### Proposed solution

Cheapest: reword the comment to name the owning guard — "Complement of booksForPlatform('mobile') in
web/src/lib/state/books.ts; the check-assets script cross-checks the two (npm run check:assets)."
Better, if all consumers (`strip-native-assets.mjs`, `check-assets.mjs`) run under
`--experimental-strip-types` anyway: define it *as* the complement —
`const mobileIds = new Set(booksForPlatform('mobile').map((b) => b.id)); export const webOnlyBooks = (books) => books.filter((b) => !mobileIds.has(b.id));`
— collapsing contract, guard, and comment into an import. Check `strip-native-assets.mjs`'s
invocation supports TS imports before choosing the second route.

### [Docs] Header comments restate consumer lists that have already gone stale

**File(s):** `scripts/lib/smoke.mjs` (lines 1–3) · `scripts/lib/app-driver.mjs` (lines 1–3) @
9ae62ff1

**Priority:** P5

#### Problem

The repo comment convention forbids "restating mutable facts (counts, dates, values, paths) owned
elsewhere — name the owning identifier or file instead." Both headers enumerate their consumers, and
both lists are wrong at 9ae62ff1:

* `smoke.mjs` line 1–2: "Shared pass/fail reporter for the smoke tests (api-smoke.mjs,
  blobs-smoke.mjs)" — `driver-smoke.mjs` (line 15) also imports it.
* `app-driver.mjs` line 1–2: "Playwright helpers for scripts that drive the live Splotch app …
  (store-shots.mjs, gen-large-image.mjs)" — `perf/session.mjs` and `driver-smoke.mjs` also import it
  (four consumers, two listed). This one matters more: scripts/CLAUDE.md documents that this module
  rots silently and names `test:driver:smoke` as its guard, yet the file's own header doesn't
  mention the smoke consumer.

(`adminClient.mjs`'s equivalent list is still accurate — no change needed there.)

#### Proposed solution

Drop the enumerations and describe the *kind* of consumer: "Shared pass/fail reporter for the smoke
scripts" / "Playwright helpers for scripts that drive the live Splotch app in a browser (the gen:*
generators, driver smoke, perf sessions)". Grep, not the header, is the source of truth for the
actual list.

### [Performance] `statsFor` aggregates are computed twice per report build

**File(s):** `scripts/lib/model-eval-report.mjs` (`renderReportHtml` line 167; `buildReport`
line 351) @ 9ae62ff1

**Priority:** P5

#### Problem

`renderReportHtml` computes
`const agg = Object.fromEntries(modelIds.map((m) => [m, statsFor(results, m)]))` (line 167), and
`buildReport` then recomputes the identical structure at line 351 for `summary.json`. Each
`statsFor` call itself makes five-plus filter passes over `results` (lines 66–83). The corpus is
small so the cost is negligible; the real issue is duplication — the two aggregates can drift if one
call site changes (e.g. someone adds a filter to one), and the double computation obscures that
report HTML and summary.json are meant to describe the same numbers.

#### Proposed solution

Compute `agg` once in `buildReport`, pass it into `renderReportHtml({ …, agg })`, and reuse it for
`summary.json`. Alternatively have `renderReportHtml` return `{ html, agg }`. Either way there is
exactly one aggregation.

### [Readability] Zip structural sizes/offsets in artifact-version are unnamed magic numbers

**File(s):** `scripts/lib/artifact-version.mjs` (`findEndOfCentralDirectory` lines 21–28;
`inflateEntry` lines 36–38; `eachCentralDirectoryEntry` lines 52–70) @ 9ae62ff1

**Priority:** P5

#### Problem

The signatures are named (`EOCD_SIG`, `CD_SIG`, `LOCAL_SIG`, lines 13–16) but the record geometry is
not: `22` (EOCD fixed size) appears twice at lines 23–24 with only a comment; `30` (local header
fixed size) at line 38; `46` (central-directory entry fixed size) three times at lines 65–70; and
the field offsets (`+10`, `+16`, `+20`, `+26`, `+28`, `+30`, `+32`, `+42`, `+46`) are bare. The
convention explicitly lists "byte offset" among the literals that get names. The module is otherwise
exemplary (well-tested, well-commented), which makes the bare offsets the one place a maintainer
must keep the ZIP appnote open to follow along.

#### Proposed solution

Name the three record sizes:

```js
const EOCD_MIN_SIZE = 22;
const LOCAL_HEADER_SIZE = 30;
const CD_ENTRY_SIZE = 46;
```

and use them in the arithmetic (`buf.length - EOCD_MIN_SIZE - 0xffff`,
`localHeaderOffset + LOCAL_HEADER_SIZE + nameLength + …`, `at + CD_ENTRY_SIZE + nameLength + …`).
Naming every per-field offset is optional — a single
`// CD entry fields: method@10, csize@20, nameLen@28 …` layout comment plus the three size constants
captures most of the value without ceremony.

## Source: Code audit — scripts/tests — repo-script tests

### [Testing] Replace the `fn.toString()`-sniffing evaluate stub in the undo-scenarios test with a routed fake that fails loudly

**File(s):** `scripts/tests/undo-scenarios.test.mjs` (`page.evaluate` mock, lines 60–81; the single
`it`, lines 52–131) @ 9ae62ff1

**Priority:** P2

#### Problem

The only test of `scripts/perf/undo-scenarios.mjs` stubs `page.evaluate` by string-matching the
*source text* of whatever function the production code passes in:

```js
evaluate: vi.fn(async (fn) => {
  const source = fn.toString();
  if (source.includes('getUndoDebug')) { … }
  if (source.includes('document.querySelector')) { … }
  if (source.includes("getEntriesByType('measure')")) { … }
  if (source.includes('async (maxUndoSteps)')) return 1;
  if (source.includes('performance.now')) return 0;
  return undefined;
}),
```

Three compounding fragilities:

1. **Order-sensitive overlap.** The real function at `scripts/perf/undo-scenarios.mjs:254` is
   `async (maxUndoSteps) => { … performance.now() … }` — it contains *both* the
   `'async (maxUndoSteps)'` marker and `'performance.now'`. Only the current if-ordering routes it
   correctly; reordering the checks (or renaming the parameter in the source under test) silently
   reroutes it to the `performance.now → 0` branch.
2. **Silent `undefined` fallback.** Any new `page.evaluate` call site added to `undo-scenarios.mjs`
   returns `undefined` from the stub, producing a downstream failure (or worse, a pass) far from the
   cause instead of an immediate "unmatched evaluate" error.
3. The single 80-line `it` builds the fake page, CDP session, context, browser, clock, and console
   spies inline, then asserts seven different things — there are no named seams for a reader to
   follow.

This is exactly the kind of stub that rots invisibly when the production file is refactored: the
test keeps passing while exercising different branches than it claims.

#### Proposed solution

Extract a routed stub with an explicit contract and a loud default:

```js
function stubPageEvaluate(routes /* : Array<{ marker: string, result: (callCount) => unknown }> */) {
  return vi.fn(async (fn, ...args) => {
    const source = fn.toString();
    const route = routes.find(({ marker }) => source.includes(marker));
    if (!route) throw new Error(`Unmatched page.evaluate:\n${source}`);
    return route.result(...);
  });
}
```

Order the routes most-specific-first and keep the maxUndoSteps/performance.now overlap documented in
the route list. Also pull `makeFakePage()` / `makeFakeBrowser(page)` out as named builders so the
`it` body reads as scenario → run → assertions. Gotcha: the `navigations === 3` conditional inside
the current `getUndoDebug` branch is load-bearing (it makes exactly one scenario time out); keep it
as an explicitly named `coldTierNeverSettlesOnNavigation(3)` route rather than an inline ternary.

---

### [Testing] The store-changelog pipeline (`toPlainText`, `parseRelease`, `compareSemverDesc`) has no unit coverage

**File(s):** `scripts/tests/generate-releases.test.mjs` (whole file, lines 1–14);
`scripts/tests/frontmatter.test.mjs` (lines 1–24) @ 9ae62ff1

#### Problem

**Priority:** P2

`scripts/tests/generate-releases.test.mjs` is 14 lines and tests only `validateStoreText` (two
cases). Everything else that produces the shipped store listings is untested:

* `toPlainText` (`scripts/generate-releases.mjs:25–40`) — six chained regex transformations
  (headings, bullets, bold, italic with a lookbehind/lookahead pair, links, inline code, blank-line
  collapsing) that generate the *actual Play Store / App Store changelog text*. A regression here
  ships garbled release notes; none of the six transforms has a test.
* `compareSemverDesc` (`scripts/lib/frontmatter.mjs:25–32`) — determines release ordering
  (`generate-releases.mjs:59` sorts with it). Its `(pb[i] || 0)` padding for short versions and
  descending direction are untested; `frontmatter.test.mjs` covers only `parseFrontmatter`.
* `parseRelease`'s missing/malformed-frontmatter failure path (`generate-releases.mjs:18–22`).

These are pure string/array functions — precisely the shape this suite tests well everywhere else
(compare the exhaustive `native-version.test.mjs` for the sibling release seam).

#### Proposed solution

Extend `generate-releases.test.mjs` with a `toPlainText` describe (one case per transform plus a
combined realistic release body, and the `\n{3,}` collapse), and add a `compareSemverDesc` describe
to `frontmatter.test.mjs` covering descending order, equal versions, and `1.4` vs `1.4.0` padding.
`toPlainText` is currently module-private; export it (it gains a production caller in `main`
already, so no speculative surface) alongside the already-exported `validateStoreText`.

---

### [Maintainability] Eight test files hand-roll the repo root instead of importing `ROOT` from `scripts/lib/proc.mjs`

**File(s):** `scripts/tests/workflow-hygiene.test.mjs` (line 8),
`scripts/tests/native-version.test.mjs` (line 11), `scripts/tests/labels.test.mjs` (line 8),
`scripts/tests/claude-cloud-setup.test.mjs` (line 8), `scripts/tests/palette-source.test.mjs` (line
8), `scripts/tests/perf-cli-inputs.test.mjs` (line 23), `scripts/tests/claude-permissions.test.mjs`
(line 5), `scripts/tests/android-config.test.mjs` (line 5) @ 9ae62ff1

**Priority:** P3

#### Problem

Seven files repeat the same line:

```js
const repoRoot = join(import.meta.dirname, '..', '..');
```

and `android-config.test.mjs:5` spells the same fact a third way:

```js
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
```

Meanwhile `scripts/lib/proc.mjs:8` already exports `ROOT`, and one file in this same directory —
`scripts/tests/publish-artifacts.test.mjs:4` — imports it. So the section maintains the "where is
the repo root" fact in nine places across two idioms. Any relocation of `scripts/tests/` (or of
`proc.mjs`) breaks eight files instead of one, and the CLAUDE.md convention is explicit that
cross-file agreement is maintained by one imported constant.

#### Proposed solution

Replace each local `repoRoot` with `import { ROOT } from '../lib/proc.mjs'` (the path most of these
files already import from for other helpers is one directory over). In `android-config.test.mjs`,
keep the `read(p)` helper but base it on `join(ROOT, p)`. Zero behavior change; the tests already
run from arbitrary CWDs since they use absolute paths either way.

---

### [Testing] `perf-cli-inputs.test.mjs` depends on module-registry state left over from earlier tests

**File(s):** `scripts/tests/perf-cli-inputs.test.mjs` (`beforeEach`, lines 30–34; "imports the
Android profiler without starting its driver", lines 151–160; guarded-profiler loop, lines 189–206)
@ 9ae62ff1

**Priority:** P3

#### Problem

The test at lines 151–160 asserts that importing `../perf/android.mjs` starts nothing:

```js
await import('../perf/android.mjs');
expect(spawnSync).not.toHaveBeenCalled();
```

That assertion is only meaningful on the *first* import — a cached module never re-executes, so if
this test ran after any other test that imports `android.mjs` (lines 164, 176) or after the
guarded-profiler loop (which calls `vi.resetModules()` at line 199 and re-imports with
`state.directEntry = true`), it would pass vacuously against a stale registry. Today it works only
because Vitest happens to run `it` blocks in declaration order and this test is declared first among
the importers. Reordering tests, adding `.only`, or enabling test shuffling silently converts the
guard into a no-op. Conversely, the last iteration of the loop at 198–206 leaves a
`directEntry=true`-loaded `android.mjs` in the registry for any test added below it.

#### Proposed solution

Add `vi.resetModules()` to the existing `beforeEach` (line 30) so every test starts from an empty
registry and each `await import(...)` genuinely re-evaluates the module under its own
`state.directEntry`. Gotcha: the two `getWebviewPage` tests (lines 162–187) then each pay a fresh
module evaluation — that is exactly what makes them order-independent, and the modules are tiny.

---

### [Architecture] `perf-cli-inputs.test.mjs` bundles three unrelated suites under one misleading describe

**File(s):** `scripts/tests/perf-cli-inputs.test.mjs` (`describe('performance CLI input failures')`,
lines 55–207) @ 9ae62ff1

**Priority:** P3

#### Problem

The single describe named `performance CLI input failures` contains:

1. Genuine CLI input-failure tests that spawn real subprocesses via `expectCliFailure` (lines
   56–127).
2. A unit test of `replayInPage`'s size-level mapping using stubbed globals (lines 129–149) — no
   CLI, no failure.
3. Android-profiler unit tests (`getWebviewPage` selection and timeout, import side-effect guard,
   lines 151–187).
4. An entry-guard test looping over four profiler modules (lines 189–206).

The heavy top-of-file mock scaffolding (`vi.mock` of `@playwright/test`, `node:child_process`,
`../lib/proc.mjs`, lines 8–21) exists only for groups 2–4, yet loads for the subprocess tests too. A
reader grepping for "where is `getWebviewPage` tested" has no reason to open a file named
`perf-cli-inputs`, and the describe name actively misdescribes three quarters of the file.

#### Proposed solution

Split along the existing seams: keep `perf-cli-inputs.test.mjs` for the `expectCliFailure`
subprocess tests (which then need none of the `vi.mock` scaffolding), and move groups 2–4 to a new
`perf-drivers.test.mjs` (or `perf-entry-guards.test.mjs` for group 4) with the mocks. Each file's
describe then names what it actually covers. No logic changes — this is a file move plus scaffolding
relocation.

---

### [Testing] The cloud-setup test harness can rot silently: an unchecked source patch and an answer-anything `node` stub

**File(s):** `scripts/tests/claude-cloud-setup.test.mjs` (`runSetup`, lines 16–68; the `replaceAll`
at line 23; the `node` stub at lines 39–44) @ 9ae62ff1

**Priority:** P3

#### Problem

Two fixture seams in `runSetup` fail without signal when `.claude/cloud/setup.sh` changes:

1. Line 23 patches the script under test by string replacement:

```js
const setup = readFileSync(setupPath, 'utf8').replaceAll('/usr/local/bin/chisel', chisel);
```

If setup.sh ever renames or parameterizes that install path, `replaceAll` silently matches nothing
and the fixture runs the *unpatched* script, which then tries to write to the real
`/usr/local/bin/chisel` — producing a permission-denied → spurious extra warning → a confusing
assertion failure about warning counts, several steps removed from the actual cause (and on a
privileged CI runner, potentially a real write outside the tmpdir).

2. The `node` stub (lines 39–44) ignores its arguments entirely and always prints
   `$PLAYWRIGHT_VERSION`. The sibling `npx` stub carefully branches on `"$*"`; if setup.sh gains any
   *other* `node` invocation, the stub feeds it a version string and exits 0, silently corrupting
   whatever that step does.

#### Proposed solution

For (1), assert the patch took: `expect(setup).not.toBe(original)` (or
`expect(setup).toContain(chisel)`) immediately after the `replaceAll`, so a renamed path fails with
"fixture patch no longer matches setup.sh" instead of a downstream warning-count mismatch. For (2),
mirror the `npx` stub's shape — match the specific argument pattern setup.sh uses to derive the
Playwright version and `exit 1` on anything else. Optionally extract the four `writeExecutable`
blocks into named helpers (`stubNpx(bin)`, `stubNodeVersionProbe(bin)`, …) so `runSetup` reads as a
list of seams.

---

### [Maintainability] WebView poll budget literals (`10_000`, `21`) duplicate unexported constants from `android.mjs`

**File(s):** `scripts/tests/perf-cli-inputs.test.mjs` ("reports when CDP exposes only about pages",
lines 173–187) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
await vi.advanceTimersByTimeAsync(10_000);
await rejection;
expect(context.pages).toHaveBeenCalledTimes(21);
```

`10_000` is `WEBVIEW_PAGE_TIMEOUT_MS` and `21` is
`WEBVIEW_PAGE_TIMEOUT_MS / WEBVIEW_PAGE_POLL_INTERVAL_MS + 1` — both defined (unexported) in
`scripts/perf/android.mjs:25–26`. Neither the derivation nor the linkage is stated in the test, so a
tuning change to either constant in `android.mjs` breaks this test with an inscrutable "expected 21,
got 41" and the fixer has to re-derive the arithmetic. The repo convention allows tests to restate
boundary *strings*, but `21` is derived arithmetic on two tuning literals, not a boundary value —
the agreement is currently maintained by nothing.

#### Proposed solution

Export `WEBVIEW_PAGE_TIMEOUT_MS` and `WEBVIEW_PAGE_POLL_INTERVAL_MS` from `android.mjs` (they gain a
production-adjacent caller: the test asserting their contract) and compute both values in the test:

```js
await vi.advanceTimersByTimeAsync(WEBVIEW_PAGE_TIMEOUT_MS);
expect(context.pages).toHaveBeenCalledTimes(
  WEBVIEW_PAGE_TIMEOUT_MS / WEBVIEW_PAGE_POLL_INTERVAL_MS + 1,
);
```

The `+ 1` (initial immediate probe before the first sleep) deserves a one-line WHY comment since it
encodes `pollUntil`'s call shape.

---

### [Maintainability] Redundant `api-level` test that also crashes instead of failing when the pattern is missing

**File(s):** `scripts/tests/android-config.test.mjs` ("workflow api-level input matches", lines
35–38; ENFORCED loop, lines 40–49) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
it('workflow api-level input matches', () => {
  const yml = read('.github/workflows/android-deploy.yml');
  expect(yml.match(/api-level:\s*(\d+)/)[1]).toBe(String(ANDROID_API_LEVEL));
});
```

Two issues:

1. **Fully redundant.** `.github/workflows/android-deploy.yml` is in `ENFORCED` (line 15) and
   `/api-level:\s*(\d+)/g` is in `EMULATOR_API_PATTERNS` (line 26); the loop at lines 40–49 already
   asserts every `api-level` match in that file equals `ANDROID_API_LEVEL` *and* that at least one
   match exists. The standalone test checks a strict subset (first match only).
2. **Crash, not failure.** If the workflow drops the `api-level:` input, `yml.match(...)` returns
   `null` and the test dies with `TypeError: Cannot read properties of null` rather than a
   meaningful assertion message — the loop version reports "expected length > 0" instead.

#### Proposed solution

Delete the standalone test; the loop is stronger on both axes. If a named, single-purpose test is
wanted for the workflow specifically, keep it but null-guard:
`const match = yml.match(...); expect(match, 'android-deploy.yml lost its api-level input').not.toBeNull();`.

---

### [Maintainability] The mkdtemp-track-and-clean scaffold is hand-rolled in eight files with four divergent idioms

**File(s):** `scripts/tests/ruler-apply.test.mjs` (lines 11–33),
`scripts/tests/ruler-skill-forks.test.mjs` (lines 7–23), `scripts/tests/scrapbook-index.test.mjs`
(lines 11–38), `scripts/tests/claude-cloud-setup.test.mjs` (lines 7, 17–18, 70–72),
`scripts/tests/audit-burndown-lib.test.mjs` (lines 82–93), `scripts/tests/artifact-version.test.mjs`
(lines 86–93), `scripts/tests/perf-cli-inputs.test.mjs` (lines 28–41),
`scripts/tests/undo-scenarios.test.mjs` (lines 34–49), `scripts/tests/proc.test.mjs` (lines 20–33) @
9ae62ff1

**Priority:** P4

#### Problem

Nine files implement "make a temp dir under a `splotch-*` prefix, remember it,
`rmSync(..., { recursive: true, force: true })` afterwards" from scratch, under four different
shapes: a module-level `roots` array drained in `afterEach` (ruler-apply, ruler-skill-forks,
claude-cloud-setup), a `fixtures` array (scrapbook-index), a single `let dir`/`fixtureDir` with
`beforeEach`/`afterEach` (audit-burndown-lib, perf-cli-inputs, undo-scenarios) or
`beforeAll`/`afterAll` (artifact-version), and an inline `try/finally` (proc.test). Each re-states
the same cleanup flags and each invents its own accessor (`makeRoot`, `fixture`, bare
`mkdtempSync`). A reader has to re-verify the leak-safety of each variant independently, and a new
test file copies whichever variant it happens to open first.

#### Proposed solution

Add `scripts/tests/helpers/tempdir.mjs` (a `helpers/` subdir stays outside the `tests/**/*.test.mjs`
include in `scripts/vitest.config.mjs:12`) exporting one factory:

```js
export function useTempDirs(prefix) {
  const dirs = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  return () => {
    const d = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(d);
    return d;
  };
}
```

(plus a `useTempDirAll` variant for the `beforeAll` case). Migrate opportunistically — the win is
one audited cleanup implementation and one idiom for future files, not churn in files that already
work.

---

### [Testing] `freePort`'s actual purpose — killing the found listener — is the one branch without a test

**File(s):** `scripts/tests/vite-server.test.mjs` (whole file, lines 1–42) @ 9ae62ff1

**Priority:** P4

#### Problem

The two tests cover the `lsof`-missing warning and the no-listener silence. The function's reason to
exist — `scripts/lib/vite-server.mjs:23–32`, parsing `lsof` stdout into PIDs, `SIGTERM`-ing each,
and swallowing `ESRCH` for already-dead processes — is untested. The parsing has real edge shapes
(trailing newline, multiple PIDs, blank lines filtered by `.filter(Boolean)`) and the mock
infrastructure to test it is already fully in place in this file (`spawnSync` mocked, `process.kill`
spied).

#### Proposed solution

Add two tests using the existing scaffold:

```js
it('SIGTERMs every listener lsof reports', () => {
  spawnSync.mockReturnValue({ status: 0, stdout: '123\n456\n' });
  freePort(4173);
  expect(process.kill).toHaveBeenCalledWith(123, 'SIGTERM');
  expect(process.kill).toHaveBeenCalledWith(456, 'SIGTERM');
});

it('survives a listener that exited between lsof and kill', () => {
  spawnSync.mockReturnValue({ status: 0, stdout: '123\n' });
  process.kill.mockImplementation(() => {
    throw new Error('ESRCH');
  });
  expect(() => freePort(4173)).not.toThrow();
});
```

---

### [Testing] `imageDims` is tested only on the happy path, with hand-poked byte offsets no reader can verify

**File(s):** `scripts/tests/model-eval.test.mjs` (whole file, lines 1–25) @ 9ae62ff1

**Priority:** P4

#### Problem

The single test builds a PNG and a JPEG by writing raw bytes at unexplained offsets
(`png.writeUInt32BE(640, 16)`, `jpeg.writeUInt16BE(17, 4)` — the `17` is a segment length whose role
is opaque without the JPEG spec open). Untested behavior in `scripts/lib/model-eval.mjs:131–151`:

* the `null` returns for a short buffer (`buf.length < 24`) and an unrecognized format;
* the JPEG marker *walk* — the production code skips non-SOF segments
  (`i += 2 + buf.readUInt16BE(i + 2)`) to find SOFn behind APP0/EXIF headers, but the fixture places
  SOF0 at offset 2 so the walk never iterates;
* the C4/C8/CC non-SOF exclusions.

A real camera/model-output JPEG always has APP segments before SOF, so the untested walk is the path
production actually takes.

#### Proposed solution

Add named fixture builders that make the offsets self-documenting:

```js
function pngWithDims(width, height) { … }
function jpegWithDims(width, height, { leadingSegments = [] } = {}) { … }
```

then test: dims behind a leading APP0 segment (exercises the walk), a DHT (0xC4) segment before SOF
(exercises the exclusion), a 10-byte buffer → `null`, and a GIF header → `null`. The builders also
let the existing test drop its bare `16`/`20`/`17` literals.

---

### [Architecture] `release.mjs` source assertions live in `publish-artifacts.test.mjs` while `release.test.mjs` exists

**File(s):** `scripts/tests/publish-artifacts.test.mjs` (`describe('release.mjs')`, lines 64–77);
`scripts/tests/release.test.mjs` @ 9ae62ff1

**Priority:** P4

#### Problem

```js
describe('release.mjs', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'release.mjs'), 'utf8');
  it('never attaches a build artifact to the GitHub release it creates', () => { … });
  it('points at the separate publish step instead', () => { … });
});
```

These are drift guards over `scripts/release.mjs`'s source text, filed inside
`publish-artifacts.test.mjs`. A dedicated `scripts/tests/release.test.mjs` already exists and is
where anyone auditing release.mjs's coverage will look; conversely, someone editing `release.mjs`
who runs "its" test file gets a green suite while the real guard lives one file over. The rationale
comment (lines 64–66) explains why the *seam* matters, not why the test lives in the publish file.

#### Proposed solution

Move the describe (with its comment) into `release.test.mjs`. Note `release.test.mjs` currently
imports nothing from `proc.mjs` — bring `ROOT` along (or apply the repoRoot-consolidation finding
above). Pure relocation; no assertions change.

---

### [Testing] Pure `scripts/lib` glue with production callers has no direct unit coverage: `waitForUrl`, `pollUntil`, `requireEnv`, `argFlag`

**File(s):** `scripts/tests/` (missing coverage; nearest homes: `scripts/tests/proc.test.mjs`, a new
`scripts/tests/net.test.mjs`) @ 9ae62ff1

**Priority:** P4

#### Problem

* `waitForUrl` (`scripts/lib/net.mjs:5–16`) is used by four production scripts (`api-smoke.mjs`,
  `perf/preview.mjs`, `lib/app-driver.mjs`, `cloud-tunnel.mjs`) and implements a deadline loop with
  a custom `ready` predicate and a swallowed-fetch-error retry — all pure logic once `fetch`/`sleep`
  are stubbed, none of it tested.
* `pollUntil` (`scripts/lib/proc.mjs:82`) is tested only *incidentally* through `getWebviewPage` in
  `perf-cli-inputs.test.mjs`; its own contract (immediate first probe, interval spacing, timeout
  rejection) has no direct test, which is why the `21`-calls literal in that file had to encode it
  by hand.
* `requireEnv` / `argFlag` (`proc.mjs:29`, `proc.mjs:35`) parse CLI/env inputs for every script and
  are untested.

`proc.test.mjs` (71 lines) covers `hasCommand`, `capture`, `run`, and `sh`, so the section clearly
intends to unit-test this layer — these four just never got picked up.

#### Proposed solution

Add a `net.test.mjs` stubbing `fetch` (resolve-after-N-calls, always-throw, custom `ready`) and fake
timers for the deadline; extend `proc.test.mjs` with `pollUntil` (fake timers), `requireEnv`
(set/unset, hint in the message), and `argFlag` cases. Testing `pollUntil` directly would also let
the `perf-cli-inputs` timeout test shrink to "calls pollUntil with the page timeout constants".

---

### [Testing] The permissions test audits `allow` but never looks at the `deny` list

**File(s):** `scripts/tests/claude-permissions.test.mjs` (line 7 and whole file) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const allow = settings.permissions.allow;
```

`.claude/settings.json` also carries a 7-rule `deny` list (`git push --force*`, `git rebase*`,
`git clean*`, `rm -rf /*`, …) that is the actual safety net for destructive commands. The test
file's stated purpose is permission hygiene, yet: the shadow/duplicate check (`shadowedRules`, lines
28–44) runs only over `allow`; nothing asserts the deny rules still exist; and `isBashAllowed`
deliberately tests that destructive shapes are *not in allow* (lines 54–59) while the layer that
would actually block them if an allow rule ever widened — the deny list — can be deleted wholesale
without any test going red.

#### Proposed solution

Read `settings.permissions.deny ?? []` alongside `allow` and add: (1)
`expect(shadowedRules(deny)).toEqual([])` — a duplicated/shadowed deny is dead weight; (2) a
`deniedShapes` check mirroring `isBashAllowed` (e.g. `isBashDenied('git push --force')`,
`'git clean -fd'`, `'git rebase main'` all true), which locks the deny list's coverage of the
destructive shapes the allow-side test enumerates. Gotcha: keep the two rule-set reads sharing the
existing `ruleToRegex` so the glob semantics stay in one place.

---

### [Readability] Dead `export` on `countPaletteHexes` inside a test file

**File(s):** `scripts/tests/palette-source.test.mjs` (`countPaletteHexes`, line 62) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
export function countPaletteHexes(text) {
```

Nothing in the repo imports it — its only callers are within this same file (lines 73–85). An
`export` on a test-file function advertises a reuse surface that doesn't exist and invites another
test file to couple to this one; the repo's no-speculative-surface convention applies. (Vitest's
include is `tests/**/*.test.mjs`, so nothing can legitimately import from a `.test.mjs` without
creating a cross-test dependency.)

#### Proposed solution

Drop the `export` keyword. If cross-file reuse ever becomes real, the function belongs in a
`scripts/tests/helpers/` module, not exported from a test.

---

### [Readability] `renderReport(summary)` recomputed for every substring assertion

**File(s):** `scripts/tests/perf-analyze.test.mjs` (lines 122–125 and 138–140) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
expect(renderReport(summary)).toContain('| Long tasks (>50 ms) | Value |');
expect(renderReport(summary)).toContain('| Count | 2 |');
expect(renderReport(summary)).toContain('| Total | 140.0 ms |');
expect(renderReport(summary)).toContain('| Longest | 80.0 ms |');
```

The full report is regenerated four times (and three more at 138–140) to assert substrings of one
output. Beyond the trivial waste, the repetition obscures that all four assertions describe a single
rendered artifact.

#### Proposed solution

`const report = renderReport(summary);` once per test, then assert against `report`. Purely
mechanical.

---

### [Readability] Magic `3` drain loop restates the fixture's entry count that a sibling test derives

**File(s):** `scripts/tests/audit-burndown-lib.test.mjs` (line 172; contrast the `while` idiom at
lines 155–159) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
for (let i = 0; i < 3; i++) deleteFirstEntry(file);
```

The `3` silently encodes "how many entries `FIXTURE` has". The test 17 lines above already drains
without the literal (`while (countEntries(file) > 0) { deleteFirstEntry(file); … }`), so the file
uses two idioms for the same operation, and adding a fourth fixture entry breaks this test's premise
(drained file) without touching the visible fixture-to-test link.

#### Proposed solution

Reuse the derived idiom: `while (deleteFirstEntry(file));` (it returns `false` when drained), or
`for (let i = 0; i < FIXTURE_ENTRY_COUNT; i++)` with a named constant beside `FIXTURE_LINES` if the
explicit count is wanted.

---

### [Docs] `labels.test.mjs` hand-parses YAML without the WHY its sibling carries

**File(s):** `scripts/tests/labels.test.mjs` (`parseLabels`, lines 19–38; header comment, lines 5–7)
@ 9ae62ff1

**Priority:** P5

#### Problem

`parseLabels` hand-rolls YAML list parsing (inline `[a, b]` and block `- item` forms, quote
stripping). The sibling `workflow-hygiene.test.mjs:5–7` explains the identical choice —
"Line-oriented on purpose: no YAML parser ships in this repo's dependency tree" — but this file's
header comment covers only the label-taxonomy rationale. A first-time reader (or an audit pass like
this one) reasonably flags the hand parser as a smell and has to rediscover the dependency-tree
constraint that justifies it.

#### Proposed solution

Add the same one-line WHY above `parseLabels` (or fold it into the existing header comment). If more
hand-YAML tests accumulate, the shared line-oriented helpers could later move to
`scripts/tests/helpers/`, carrying the comment once.

---

### [Testing] `parseFrontmatter`'s CRLF handling is implemented but never tested

**File(s):** `scripts/tests/frontmatter.test.mjs` (whole file, lines 1–24) @ 9ae62ff1

**Priority:** P5

#### Problem

`parseFrontmatter` (`scripts/lib/frontmatter.mjs:8–11`) spends four `\r?\n` alternations tolerating
CRLF fences and line splits — deliberate robustness for release files authored elsewhere — but all
three tests feed pure-`\n` input. If a refactor dropped the `\r?` (plausible now that Windows dev
support is gone, per ADR-0062, even though *data files* can still arrive with CRLF), no test would
notice, and the failure mode is `parseFrontmatter` returning `null` → `parseRelease` failing the
whole release run.

#### Proposed solution

One additional case: `parseFrontmatter('---\r\nversion: 1.3.1\r\n---\r\nNotes')` asserting
`meta.version === '1.3.1'` and the body. Alternatively, if CRLF tolerance is judged obsolete, remove
the `\r?`s from the source instead — either way the current silent mismatch between implementation
and coverage ends.

## Source: Code audit — scripts/audit-burndown — audit burndown tooling

### [Architecture] Extract burndown.mjs's numbered loop steps into named helpers behind a factory

**File(s):** `scripts/audit-burndown/burndown.mjs` (main loop, lines 513–873) @ 9ae62ff1

**Priority:** P1

#### Problem

The driver's entire lifecycle is one ~360-line `while` loop at module scope, structured by exactly
the section banners the repo convention names as the signal to extract: `// ---- 1. POP ----` (line
525), `// ---- 2. VERIFY ----` (line 539), `// ---- 3. IMPLEMENT ----` (line 606),
`// ---- 4/5. REVIEW, at most two fix rounds ----` (line 671), `// ---- 6. CLOSE OUT ----` (line
803), `// ---- 7. PUSH ----` (line 869). CLAUDE.md: "Numbered step comments (`// 1. …`) or section
banners inside one function are the signal to extract each step into a named helper — write it that
way the first time."

The cost is not hypothetical — `comment.mjs` lines 3–4 admit the consequence outright:

```js
// its own module so burndown.mjs and the backfill share one implementation and
// it can be unit-tested (burndown.mjs runs its loop on import and can't be).
```

Every piece of pure-ish logic that needed testing has had to be exiled to `lib.mjs`/`comment.mjs`
one function at a time (`resolveImplSha`, `deferralReason`, `briefIsStale`, `reachedHandledLimit`,
…), while the sequencing itself — the part where the 2026-07-25 canary bugs actually lived (push
cadence on deferrals, line 316–326; positional vs by-title delete, line 841) — remains untestable.

The loop also communicates through five module-scope mutable `let`s (`deferred`/`consecutive` at
lines 275–276, `done`/`dropped`/`sincePush` at 458–460) mutated from `defer()` (lines 317–326), the
INVALID branch (lines 572–574), and the close-out (lines 865–867), with `defer()` calling
`pushBatch()` that is declared *below* it — the comment at line 324 has to explain "`pushBatch` is a
hoisted declaration" instead of the code just reading top-down. CLAUDE.md's rule is that
module-scope mutable state lives behind a `createX()` factory.

#### Proposed solution

Restructure around a `createBurndownRun(config)` factory holding the counters plus
`pushBatch`/`defer`, and extract each banner into a helper the loop calls in sequence, e.g.:

```js
function popNextFinding()                      // step 1 → { issue, title, tag, issueWrittenAt } | null
async function verifyFinding({ tag, title })   // step 2 → { verdict, e2eSpecs, briefOk } outcome
async function implementFinding({ … })         // step 3 → { impl, sha, implSession } | failure
async function reviewWithFixRounds({ … })      // steps 4/5 → { status, sha, fixSummaries, reviewCatches, … }
function closeOutApproved({ title, sha, … })   // step 6
```

The loop body then reads as the seven-step pipeline the banners currently narrate. Pair with the
next finding (isMain gating) so the extracted pieces become importable by `scripts/tests/`. Gotcha:
`defer()`'s coupling to `sincePush`/`pushBatch` is exactly why the factory (rather than free
functions plus globals) is the right shape.

### [Correctness] Iteration tag omits `dropped`, so a drop makes the next finding reuse the same log-file names

**File(s):** `scripts/audit-burndown/burndown.mjs` (line 523) @ 9ae62ff1;
`scripts/audit-burndown/cost.mjs` (lines 11–31, 57); `scripts/audit-burndown/backfill-comments.mjs`
(lines 100–112)

**Priority:** P2

#### Problem

```js
const tag = `iter${String(done + deferred + 1).padStart(4, '0')}`;
```

Only fixes and deferrals advance the tag. When a finding is dropped as INVALID (`dropped += 1` at
line 572; `done`/`deferred` unchanged), the *next* finding computes the identical tag. Consequences:

* `runAgentStep` writes envelopes with `writeFileSync(join(logsDir,`${tag}.json`), out)`
  (agent-runner.mjs line 285), so the next finding's `iterNNNN.verify.json` **overwrites** the
  dropped finding's verify envelope — the very record that explains *why* it was dropped, which the
  verifier prompt (verifier.md lines 21–28) goes to great lengths to make auditable ("lets a reader
  who audits the drop commits later tell 'the audit was wrong' from 'the audit is working as
  designed' apart"). The reason survives only as one line in the commit message.
* `${tag}.err` is `appendFileSync`'d (agent-runner.mjs line 286), so stderr from two different
  findings interleaves in one file.
* `cost.mjs` counts one `.verify` file where two verify calls were paid (line 57
  `calls.filter((call) => call.file.includes('.verify')).length`), and the overwritten call's
  cost/turn/error record disappears from the "any capped or errored calls" table.
* `backfill-comments.mjs`'s mtime heuristic (lines 100–112) is built to disambiguate same-named
  files **across runs**; same-named files **within one run** were plainly not anticipated.

#### Proposed solution

Include drops in the counter: `done + dropped + deferred + 1` — i.e. one tag per popped finding,
which is what "iteration" means everywhere else (run.log, backfill). Verify nothing parses the tag
number as a fixes-only ordinal (status.mjs and backfill match `iter\d+` opaquely, so they're fine).
A one-character fix plus a regression test in `scripts/tests/` once the loop is testable.

### [Maintainability] None of the eight CLI entry scripts gates on `isMain` or exports an entry function

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 72–73, 513), `overnight.mjs` (lines
21–24), `pop.mjs` (lines 15–18), `preflight.mjs` (line 20), `status.mjs` (line 7), `cost.mjs` (lines
9–15), `watch.mjs` (line 11), `backfill-comments.mjs` (lines 23–25) @ 9ae62ff1

**Priority:** P2

#### Problem

`scripts/CLAUDE.md` states the directory convention: "Every CLI script gates execution behind
`isMain(import.meta)` (`scripts/lib/proc.mjs`) and exports a distinctly named entry function."
Sibling scripts follow it (`scripts/generate-releases.mjs` line 111, `scripts/gha-versions.mjs` line
194, `scripts/lint-token-styles.mjs`). Every CLI script in `scripts/audit-burndown/` instead runs
its side effects (`chdirRoot()`, git mutations, spawning, the whole burndown loop) at module top
level on import.

This is not just a consistency nit: it is the direct cause of the untestability that forced
`comment.mjs` to exist as a separate module (its header comment: "burndown.mjs runs its loop on
import and can't be [unit-tested]"), and it means an accidental `import` of any of these files from
a test or tool executes a run. `pop.mjs` in particular is invoked programmatically-adjacent (role
prompts reference it; implementer.md line 17 forbids agents running it) — importing it to test its
exit codes is currently impossible.

#### Proposed solution

Per script: wrap the body in an exported entry function (`runBurndown()`, `launchOvernight()`,
`popEntry()`, `runPreflight()`, `printStatus()`, `printCost()`, `watchRun()`, `drainComments()`) and
gate with `if (isMain(import.meta.url)) …`. For `burndown.mjs` this composes with the P1 loop
extraction. Cheap for the six small scripts; do those even if the burndown.mjs restructure waits.

### [Maintainability] Env-knob defaults are re-derived in up to four files instead of declared once

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 88, 89, 109, 392), `preflight.mjs` (lines
22, 23, 85, 108), `backfill-comments.mjs` (line 25), `status.mjs` (line 88) @ 9ae62ff1

**Priority:** P2

#### Problem

CLAUDE.md: "Cross-file agreement is never maintained by prose… boundary strings… declared once,
imported everywhere." These defaults are copy-pasted:

* `process.env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl')` — **four** copies:
  burndown.mjs 109, backfill-comments.mjs 25, preflight.mjs 85, status.mjs 88.
* `process.env.BRANCH ?? 'audit/burndown'` — burndown.mjs 88, preflight.mjs 23.
* `process.env.RESUME === '1' || process.env.RESUME === 'true'` — burndown.mjs 392,
  preflight.mjs 22.
* `process.env.CHECK_CMD ?? 'npm run check'` — burndown.mjs 89, preflight.mjs 108.

If a default drifts (say the store moves, or `RESUME=yes` support is added in one place),
preflight/status silently check a *different* file or mode than the driver uses — precisely the
silent-late failure mode the `LAUNCH_KNOBS` comment in lib.mjs (lines 128–136) documents as having
"already failed twice" for the knob list itself. lib.mjs already models the fix with `auditFile()`
(line 16).

#### Proposed solution

Add to lib.mjs beside `auditFile()`:

```js
export const commentStore = () => process.env.COMMENT_STORE ?? join(WORK, 'pending-comments.jsonl');
export const burndownBranch = () => process.env.BRANCH ?? 'audit/burndown';
export const resumeRequested = () => process.env.RESUME === '1' || process.env.RESUME === 'true';
export const checkCmd = () => process.env.CHECK_CMD ?? 'npm run check';
```

and import everywhere. Function form (like `auditFile()`) so tests that mutate `process.env` see
fresh values.

### [Correctness] The finish path swallows a failed final push — an unattended run can end "successfully" with unpushed commits

**File(s):** `scripts/audit-burndown/burndown.mjs` (`pushBatch`, lines 472–487; finish, lines
875–887) @ 9ae62ff1

**Priority:** P3

#### Problem

The whole design says an unpushed commit is a lost commit: the `PUSH_EVERY` comment (lines 82–87) —
"an unpushed commit is a commit at risk: the only durable artifact is what is on origin". Yet the
final flush ignores its own failure signal:

```js
if (sincePush > 0) pushBatch({ final: true });
…
logLine(`finished: ${done} fixed, …`);
```

`pushBatch` returns `false` on a red `PUSH_TEST_CMD` or a failed push (lines 473–486) — a return
value no call site ever reads (lines 326, 577, 872, 877). Mid-run that's fine (the next boundary
retries), but at the *end* there is no next boundary: the process logs a normal `finished:` line and
exits 0. A supervising agent (or the overnight log reader) sees a clean completion while the tail of
the run sits only in a reclaimable container. The mid-run "will retry next batch" copy inside
`pushBatch` is also wrong for the `final` case, which its own message text acknowledges ("commits
held locally, not pushed") without escalating.

#### Proposed solution

Have the finish path act on the result:

```js
if (sincePush > 0 && !pushBatch({ final: true })) {
  logLine(
    `WARNING: ${sincePush} commit(s) not on origin — push manually before the container is reclaimed`,
  );
  process.exitCode = 1;
}
```

Exit code 1 makes the failure visible to `overnight.log` scrapers and any wrapper. Since the return
value then has a real consumer, the unused-return smell disappears too.

### [Maintainability] `docs/AUDIT-DEFERRED.md` / `docs/audit-deferred/` literals are scattered across three modules

**File(s):** `scripts/audit-burndown/burndown.mjs` (line 266), `lib.mjs`
(`protectedImplementationPaths`, lines 92–99; `DRAFT_DIR`, line 226), `status.mjs` (lines 18–19) @
9ae62ff1

**Priority:** P3

#### Problem

The deferred-findings file path is a boundary string with three independent spellings:
`const DEFERRED_FILE = 'docs/AUDIT-DEFERRED.md'` in burndown.mjs line 266, the raw literals
`'docs/AUDIT-DEFERRED.md'` and `'docs/audit-deferred/'` inside `protectedImplementationPaths`
(lib.mjs lines 96–97), and `'docs/AUDIT-DEFERRED.md'` twice in status.mjs lines 18–19. lib.mjs even
exports `DRAFT_DIR = 'docs/audit-deferred'` (line 226) yet line 97 hardcodes
`'docs/audit-deferred/'` instead of `` `${DRAFT_DIR}/` `` (only because `DRAFT_DIR` is declared 130
lines below). If the deferred file ever moves, `protectedImplementationPaths` stops protecting it —
the guard that exists specifically to stop Codex implementers from mutating audit state — while
burndown keeps writing to the new location, and nothing fails loudly.

#### Proposed solution

In lib.mjs, hoist `DRAFT_DIR` above `protectedImplementationPaths`, add
`export const DEFERRED_FILE = 'docs/AUDIT-DEFERRED.md'`, and use both inside
`protectedImplementationPaths`. Import `DEFERRED_FILE` in burndown.mjs (delete its local const) and
status.mjs.

### [Correctness] The implementer's self-reported SHA is trusted verbatim over git, with no format or ancestry validation

**File(s):** `scripts/audit-burndown/lib.mjs` (`resolveImplSha`, lines 34–37) @ 9ae62ff1;
`scripts/audit-burndown/burndown.mjs` (lines 631–642, 702, 781–797, 819–823)

**Priority:** P3

#### Problem

```js
export function resolveImplSha({ reported, head, baseSha }) {
  if (reported) return reported;
  return head && head !== baseSha ? head : '';
}
```

`reported` is LLM-authored (`impl.structured.sha`). The driver sanitizes the other LLM-authored
strings that reach commands hard — burndown.mjs lines 596–600 on `e2e_specs`: "these strings are
LLM-authored and reach a shell, so keep only spec-path-shaped values" — but the SHA is used
unvalidated as a git argument in the reviewer prompt's range (`${baseSha}..${sha}`, line 702),
`gitOut('diff', baseSha, sha, …)` (line 820), and `gitOut('rev-list', '--count',`
${baseSha}..${sha}`)` (line 823). Worse, when `reported` and `head` *both* exist and disagree —
implementer reports a short SHA despite the prompt (implementer.md lines 40–41 begs for 40 chars
precisely because it happens), or reports the first round's SHA after a second commit, or
hallucinates — the envelope wins over git. That inverts the module's own stated philosophy (lib.mjs
lines 30–33: "Trust git over the envelope"). The reviewer then reviews the wrong range, or git
errors mid-flow on a garbage ref.

#### Proposed solution

Validate and prefer git:

```js
export function resolveImplSha({ reported, head, baseSha }) {
  const moved = head && head !== baseSha ? head : '';
  if (moved) return moved;
  return /^[0-9a-f]{40}$/.test(reported ?? '') ? reported : '';
}
```

Since `head` is `gitOut('rev-parse', 'HEAD')` captured right after the step, it is always at least
as authoritative as `reported`; keep `reported` only as the fallback (with the hex-shape check) for
the legacy-envelope case the comment describes. Log when the two disagree so a misreporting role is
visible. Update the `resolveImplSha` unit tests in `scripts/tests/audit-burndown-lib.test.mjs` for
the new precedence.

### [Maintainability] The three-round review cap is duplicated as literals across burndown.mjs and backfill-comments.mjs

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 687, 732), `backfill-comments.mjs` (lines
115, 124) @ 9ae62ff1

**Priority:** P3

#### Problem

"At most two fix rounds" (comment, line 671) is encoded four separate times:
`for (let round = 1; round <= 3; round++)` (burndown 687), `if (round === 3) break` (burndown 732),
the log-name list ``[`${iter}.impl`, `${iter}.fix1`, `${iter}.fix2`]`` (backfill 115), and
`for (const round of [1, 2, 3])` (backfill 124). Raising the cap to 4 in burndown.mjs would silently
make `capture` drop every round-4 catch and fix summary from reconstructed PR comments — no error,
just quieter comments. CLAUDE.md: cross-file agreement goes through one exported constant.

#### Proposed solution

Export from lib.mjs:

```js
// One initial implementation plus (REVIEW_ROUNDS_MAX - 1) fix rounds.
export const REVIEW_ROUNDS_MAX = 3;
```

Use it in burndown's loop bounds and derive backfill's name lists from it
(`Array.from({ length: REVIEW_ROUNDS_MAX - 1 }, (_, i) =>` ${iter}.fix${i + 1}`)` etc.).

### [Maintainability] Implementation-commit resolution is duplicated nearly verbatim between the initial pass and fix rounds

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 631–642 and 781–797) @ 9ae62ff1

**Priority:** P3

#### Problem

Two eleven-line blocks perform the same four-step dance — runner-conditional `reportedSha`,
success-conditional `headAfter`, Codex driver-commit fallback via `commitCodexImplementation`, then
`resolveImplSha` — differing only in the base they compare against (`baseSha` vs the previous
round's `sha`) and the `round` argument:

```js
const reportedSha = AGENT_RUNNER === 'codex' ? '' : (impl.structured.sha ?? '');
const headAfterImpl = impl.structured.success === true ? gitOut('rev-parse', 'HEAD') : '';
const driverSha = impl.ok && impl.structured.success === true && headAfterImpl === baseSha
  ? commitCodexImplementation({ title, baseSha })
  : '';
let sha = resolveImplSha({ reported: reportedSha, head: driverSha || headAfterImpl, baseSha });
```

(lines 631–641; near-identical at 781–791). The valuable WHY comments around the second copy (lines
772–780) explain the *base* choice, not the mechanism — the mechanism is pure duplication. A fix to
one (e.g. the SHA-validation finding above) must be remembered in the other.

#### Proposed solution

Extract into burndown.mjs (or lib.mjs once the loop is factored):

```js
function resolveImplementationCommit({ impl, title, base, round = 0 }) // → sha | ''
```

with the one asymmetry (`impl.ok &&` guard exists only in the first copy — the second is inside an
`impl.ok` early-return path already) resolved explicitly. Both call sites become one line.

### [Correctness] overnight.mjs neither validates the count argument nor shell-quotes it

**File(s):** `scripts/audit-burndown/overnight.mjs` (lines 24, 51–52) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
const count = process.argv[2] ?? '600';
…
const envPrefix = [`MAX_ISSUES=${count}`, ...forwarded].join(' ');
const cmd = `env ${envPrefix} node scripts/audit-burndown/burndown.mjs`;
```

Two defects:

1. **No validation.** `npm run audit:burndown:overnight -- 6OO` (typo) launches a detached job whose
   `Number('6OO')` is `NaN`; burndown's `while (done < MAX_ISSUES)` (line 513) is instantly false,
   so the run preflights green, detaches, prints the launch banner… and exits having done nothing,
   with only a `finished: 0 fixed` line in a log nobody is watching. scripts/CLAUDE.md requires:
   "validate inputs up front with a path-specific one-line error and a non-zero exit."
2. **Inconsistent quoting.** Every forwarded knob goes through `shellQuote` (line 48) but `count` is
   interpolated raw into a `shell: true` spawn (line 55). Operator-supplied, so not a security hole
   in practice, but an argument containing a space or metachar corrupts the command line silently
   instead of failing loudly.

The same `Number(...)`-NaN silence applies to `MAX_ISSUES`/`MAX_HANDLED`/etc. inside burndown.mjs
itself (lines 76–111), but the launcher is where a human types the value.

#### Proposed solution

```js
const count = process.argv[2] ?? '600';
if (!/^\d+$/.test(count) || Number(count) < 1) {
  console.error(
    `overnight: finding count must be a positive integer, got ${JSON.stringify(count)}`,
  );
  process.exit(2);
}
```

and `MAX_ISSUES=${shellQuote(count)}` in the prefix for symmetry with the forwarded knobs.

### [Correctness] pop.mjs treats any unknown flag as "print", so a typo'd `--delete` silently succeeds without deleting

**File(s):** `scripts/audit-burndown/pop.mjs` (lines 18, 25–50) @ 9ae62ff1

**Priority:** P3

#### Problem

```js
const mode = process.argv[2] ?? 'print';
```

The mode is then compared against `--count`, `--peek`, and (at line 50) `--delete`; anything else
falls through the whole ladder and behaves as `print`, exit 0. So `pop.mjs --delte` (or `--pop`,
`-d`, a stray argument) prints the first entry and reports success — and the caller, typically an
*agent* following a runbook, now believes the entry was consumed when the backlog is untouched. The
header documents "Exit codes: … 2 bad usage" (line 10) but bad usage is only detected for `--peek`'s
argument. For a tool whose whole reason to exist is deterministic surgery no agent should improvise
around (lib.mjs lines 348–355), silently doing the wrong-but-plausible thing on a typo is the worst
failure shape.

#### Proposed solution

Close the mode set:

```js
const MODES = new Set(['print', '--delete', '--count', '--peek']);
if (!MODES.has(mode)) {
  console.error(`pop: unknown mode ${mode} (see header for usage)`);
  process.exit(2);
}
```

(Also aligns with the CLAUDE.md "close finite value sets" instinct, applied at a CLI boundary.)

### [Correctness] status.mjs labels invalid drops as "completed", the exact conflation burndown.mjs warns against

**File(s):** `scripts/audit-burndown/status.mjs` (lines 16–33) @ 9ae62ff1;
`scripts/audit-burndown/burndown.mjs` (lines 455–457, 568–571)

**Priority:** P3

#### Problem

burndown.mjs appends **two** kinds of lines to `completed.log`: real fixes (`${sha}  ${title}`,
line 849) and invalid drops (`${sha}  [invalid]  ${title}`, lines 568–571). It keeps `done` and
`dropped` separate precisely because — its own comment, lines 455–457 — "conflating them in the
summary makes the closeout AUDIT-LOG row wrong in the flattering direction." status.mjs then commits
that sin:

```js
const done = countLines(join(WORK, 'completed.log'));
…
console.log(`completed  ${done}`);
```

Every drop inflates "completed". A supervising agent using `npm run audit:status` to fill the
AUDIT-LOG closeout row (the documented workflow) copies the flattering number.

#### Proposed solution

Split on the marker burndown already writes:

```js
const lines = existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()) : [];
const droppedCount = lines.filter((l) => l.includes('  [invalid]  ')).length;
const fixedCount = lines.length - droppedCount;
```

and print `completed`, `dropped`, `deferred` as three rows. The `[invalid]` marker string becomes a
shared constant in lib.mjs (same drift argument as the other boundary strings; burndown writes it,
status parses it).

### [Readability] Unnamed tuning literals: per-role `maxTurns`, retry backoff curve, and the fix-round budgets

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 548, 623, 708, 763), `agent-runner.mjs`
(line 316) @ 9ae62ff1

**Priority:** P4

#### Problem

CLAUDE.md: "A numeric literal that encodes a tunable decision — threshold, duration, … retry count —
gets a named module-scope constant with the unit in the name; the WHY comment lives on the
constant." The per-role turn caps are bare literals at four call sites — `maxTurns: 40` (verify,
line 548), `80` (impl, line 623), `50` (review, line 708), `60` (fix rounds, line 763) — with no
name and no WHY, even though they encode a deliberate tiering (implementation gets 2× a verify) and
sit right beside the fully named-and-commented `BUDGET_*`/`EFFORT_*` knobs (lines 122–133) that
express the same per-role tuning. The retry backoff in agent-runner.mjs line 316 is likewise opaque
arithmetic: `const waitSeconds = attempt * attempt * 30;` — quadratic backoff with a 30-second base,
unnamed and uncommented.

#### Proposed solution

In burndown.mjs beside the other knobs:

```js
// Turn caps per role: implementation gets the most headroom because it
// manufactures the change; fix rounds resume with history so need less.
const MAX_TURNS_VERIFY = 40;
const MAX_TURNS_IMPL = 80;
const MAX_TURNS_REVIEW = 50;
const MAX_TURNS_FIX = 60;
```

In agent-runner.mjs: `const RETRY_BACKOFF_BASE_S = 30;` with `attempt ** 2 * RETRY_BACKOFF_BASE_S`.
(Env-knobbing the turn caps is *not* proposed — no caller needs it; names and WHY are the ask.)

### [Correctness] Acceptance-criteria excerpt matches any line containing "acceptance" and slices a magic 40 lines

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 672–680) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const acceptanceAt = brief.split('\n').findIndex((line) => /acceptance/i.test(line));
const acceptance = acceptanceAt === -1
  ? ''
  : brief.split('\n').slice(acceptanceAt, acceptanceAt + 40).join('\n');
```

The verifier prompt mandates 'A section headed "Acceptance criteria"' (verifier.md line 35), but the
extractor matches the *first line mentioning the word anywhere* — a brief whose problem statement
says "…the acceptance flow regressed…" cuts the excerpt from that sentence, feeding the reviewer
prose mislabeled as "Acceptance criteria the verifier derived" (line 702). And `+ 40` is an unnamed
tuning literal (CLAUDE.md rule) that both truncates long criteria silently and drags in up to 40
lines of whatever follows a short section — there is no stop-at-next-heading logic.

#### Proposed solution

Extract a tested helper (lib.mjs or comment.mjs — `findingProblem` at comment.mjs lines 8–33 already
models heading-bounded extraction):

```js
export function acceptanceSection(brief, maxLines = ACCEPTANCE_EXCERPT_MAX_LINES)
```

Match a heading (`/^#{1,6}\s.*acceptance/i`), end at the next heading of the same-or-higher level,
and name the cap. Falling back to the current loose match when no heading matches keeps old briefs
working.

### [Correctness] The E2E spec sanitizer admits leading-dash values and `..` traversal

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 595–601, 360–367) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const e2eSpecs = (verify.structured.e2e_specs ?? []).filter(
  (spec) => typeof spec === 'string' && /^[\w./-]+$/.test(spec),
);
```

The comment says "Sanitize hard: these strings are LLM-authored and reach a shell" — and the class
does block shell metacharacters. But `-` and `.` are in the class unanchored, so `--grep-invert`,
`-x`, or `../../something.spec.ts` all pass and are joined straight into the shell command at line
362 (``runGate(`${E2E_CMD} ${specs.join(' ')}` …)``). A verifier that emits a flag-shaped "spec"
silently changes Playwright's behavior for the gate (e.g. inverting the filter), which corrupts the
gate's verdict rather than failing loudly. The verifier prompt says specs are "paths relative to
web/, e.g. `tests/flows.spec.ts`" (verifier.md lines 51–52) — the sanitizer should encode that
shape.

#### Proposed solution

Tighten to the documented shape:

```js
const E2E_SPEC_SHAPE = /^tests\/[\w/-]+\.(spec|test)\.ts$/;
```

or minimally reject `spec.startsWith('-')` and `spec.split('/').includes('..')`. Log rejected values
(currently they vanish silently) so a misbehaving verifier is visible in run.log.

### [Correctness] `backfill-comments done <sha>` with a short prefix can drop several records while marking only one posted

**File(s):** `scripts/audit-burndown/backfill-comments.mjs` (lines 186–202) @ 9ae62ff1

**Priority:** P4

#### Problem

```js
const remaining = store.filter((r) => !r.sha.startsWith(sha));
…
const [dropped] = store.filter((r) => r.sha.startsWith(sha));
writeStore(remaining);
appendFileSync(POSTED, `${dropped.sha}\n`);
```

`done` accepts any prefix. If the operator (an agent pasting a short SHA) supplies a prefix matching
two pending records — unlikely with 12 chars, plausible with the 7-char form git prints elsewhere —
*all* matches are removed from the store but only the first is appended to `POSTED`. The extra
records are neither pending nor recorded as posted: `capture` will then re-add them (they fail the
`posted.has(sha)` check at line 158), which is survivable but exactly the re-arming confusion the
`POSTED` file exists to prevent (lines 27–37). The double `filter` over the same predicate is also
wasted work.

#### Proposed solution

Partition once and refuse ambiguity:

```js
const matches = store.filter((r) => r.sha.startsWith(sha));
if (matches.length > 1) {
  console.error(
    `ambiguous prefix ${sha} matches ${matches.length} pending records — use more characters`,
  );
  process.exit(1);
}
```

then drop exactly `matches[0]`.

### [Maintainability] run.log's line format is an unexported boundary parsed by regex in two other files, and its timestamps have no date

**File(s):** `scripts/audit-burndown/lib.mjs` (`logLine`, lines 303–309), `status.mjs` (lines
52–71), `backfill-comments.mjs` (lines 66–84) @ 9ae62ff1

**Priority:** P4

#### Problem

`logLine` writes `[HH:MM:SS] message` (line 304: `new Date().toTimeString().slice(0, 8)`). Two
consumers then reverse-engineer that format with hand-rolled regexes: status.mjs matches
`/^\[(\d{2}):(\d{2}):(\d{2})\]/` (line 57) and `/^\[\d{2}:\d{2}:\d{2}\]\s+/` (line 70);
backfill-comments matches `/^\[[\d:]+\] (iter\d+)…/` (line 72) and `/^\[[\d:]+\]\s+DONE…/` (line
77). The producer and both parsers agree only by prose. Worse, the date-less timestamp forces
status.mjs into wrap-around arithmetic — `(nowSecs - secs + 86400) % 86400` (line 62) — that is
simply wrong for any in-flight duration ≥ 24 h (an overnight run stalled a full day reads as "2m"),
and makes multi-day run.logs ambiguous to any future reader.

#### Proposed solution

Switch `logLine` to `new Date().toISOString()` (or epoch-prefixed) and export the parse from lib.mjs
— e.g. `export const RUN_LOG_LINE = /^\[(?<ts>[^\]]+)\] (?<msg>.*)$/` plus a
`parseRunLogTimestamp()` helper — so status/backfill consume one owned contract and status's
duration math becomes plain `Date` subtraction. Gotcha: a format change orphans parsing of
*existing* run.logs mid-campaign; land it between runs, or accept both formats in the helper for one
transition.

### [Maintainability] status.mjs re-implements lib.mjs's entry-heading detection for AUDIT-DEFERRED headings

**File(s):** `scripts/audit-burndown/status.mjs` (line 21), `lib.mjs` (`isEntryStart`, line 356) @
9ae62ff1

**Priority:** P4

#### Problem

lib.mjs owns the finding-heading grammar — `const isEntryStart = (line) => /^### \[/.test(line);`
(line 356, module-private) — with a comment block explaining the format's source of truth
(`.claude/audit-conventions.md`). status.mjs pastes the same regex inline to count deferred
findings: `.filter((l) => /^### \[/.test(l))` (line 21), then strips the prefix again at line 114
(`l.replace(/^### /, '')`), which also duplicates the title-from-heading strip in burndown.mjs line
535 and lib.mjs line 418. If the heading grammar ever changes (it has one owner and three shadow
copies), status silently reports zero deferred.

#### Proposed solution

Export `isEntryStart` (and a small `entryTitle(line)` for the `replace(/^### /, '')` triplet) from
lib.mjs and import in status.mjs/burndown.mjs. Zero behavior change; one grammar owner.

### [Testing] `runAgentStep` — the retry/cap/session-minting core — has no test despite carrying injected seams for one

**File(s):** `scripts/audit-burndown/agent-runner.mjs` (`runAgentStep`, lines 216–323) @ 9ae62ff1;
`scripts/tests/audit-burndown-agent-runner.test.mjs`

**Priority:** P4

#### Problem

`runAgentStep` takes `runCmd`, `logLine`, and `sleep` as parameters — a textbook
dependency-injection seam — yet `scripts/tests/audit-burndown-agent-runner.test.mjs` imports only
the pure helpers (`agentAuthCommand`, `agentRunnerDefaults`, `codexArgs`, `codexRoleInstructions`,
`normalizeAgentRunner`, `parseSavedAgentOutput`); nothing exercises the function the seams exist
for. The untested behavior is the subtlest in the module: fresh-UUID-per-attempt session minting
(lines 247–252, 265), the resolved-session precedence
`sessionId || (runner === 'claude' ? mintedSession : parsed.sessionId)` (line 289), the no-retry
short-circuit on `error_max_budget_usd`/`error_max_turns` (lines 308–315), and the `ok` predicate
(lines 290–294). CLAUDE.md: "a seam kept only for tests gets a comment saying so at the declaration"
— currently the seams are neither used by tests nor marked; they're paid for at the call site
(burndown.mjs lines 175–186 threads all three) and deliver nothing.

#### Proposed solution

Add `runAgentStep` cases to the existing test file with a stubbed `runCmd` returning canned
Claude/Codex envelopes and a no-op `sleep`: (a) budget-cap short-circuit returns without retrying,
(b) a transient failure retries with a *new* minted session id, (c) resumed calls pass `--resume`
and omit the system-prompt flag, (d) the `ok` predicate rejects an empty structured object. That
earns the seams their keep; alternatively, if testing is declined, the seams should be removed and
the module import `runCmd`/`logLine`/`sleep` directly.

### [DX] cost.mjs reports zero tokens for Claude runs because `parseSavedAgentOutput` discards the Claude envelope's usage

**File(s):** `scripts/audit-burndown/agent-runner.mjs` (`parseSavedAgentOutput`, lines 102–110),
`cost.mjs` (lines 26–28, 62–65) @ 9ae62ff1

**Priority:** P4

#### Problem

The Claude branch hardcodes `usage: {}` (line 106) even though the `claude -p --output-format json`
result envelope carries a `usage` object (input/output/cache-read token counts). cost.mjs
consequently prints `input tokens` / `output tokens` / `(cached)` lines and per-issue token
projections **only for Codex runs**; a Claude run gets dollars but no token breakdown, and the
cache-hit ratio — the one number that would confirm the "EFFORT_IMPL must stay identical … discards
the cached prefix" tuning in burndown.mjs (lines 739–743) is actually working — is invisible.

#### Proposed solution

Map the Claude envelope's usage into the same normalized shape the Codex branch produces
(`input_tokens`, `cached_input_tokens`, `output_tokens`), e.g.
`usage: normalizeClaudeUsage(envelope.usage ?? {})` translating Claude's cache-read field name to
`cached_input_tokens`. Gotcha: verify the exact field names against a real saved envelope in
`.audit-work/logs/` before wiring — the two CLIs name cache fields differently, which is presumably
why `{}` was the expedient placeholder.

### [Readability] `commandFailureOutput` rebuilds its ANSI-stripping regex per call from a char-code puzzle

**File(s):** `scripts/audit-burndown/lib.mjs` (`commandFailureOutput`, lines 337–346) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');
```

is constructed inside the function on every call (it runs on each gate failure with up to 64 MB of
captured output) and obscures a well-known escape: `\x1b` in a regex literal says "ESC" directly;
`String.fromCharCode(27)` forces the reader to decode ASCII. There is no dynamic input justifying
`new RegExp`.

#### Proposed solution

Hoist to module scope:

```js
// Strips ANSI SGR/CSI sequences from captured command output.
const ANSI_ESCAPE_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
```

(If a lint rule objects to the control-character class, `/…/` is equally direct.) Also give the
`6000` default of `maxLength` a name with units — `FAILURE_OUTPUT_MAX_CHARS` — per the
tuning-literal rule.

### [Readability] `captureSummary` closes over the reassigned `impl` binding instead of taking the value it records

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 663–668, 800) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
const captureSummary = () => {
  const text = (impl.structured.summary ?? '').trim();
  if (text) fixSummaries.push(text);
};
```

The closure reads whatever `let impl` happens to hold when called — correct today because both call
sites (line 668, line 800) immediately follow the relevant assignment, but the correctness is
positional: inserting any code that touches `impl` between assignment and call silently records the
wrong round's summary, and the long WHY comment above (lines 658–662) about `impl` being "reassigned
on every fix round" is describing exactly this hazard.

#### Proposed solution

Make the data flow explicit:
`const captureSummary = (step) => { const text = (step.structured.summary ?? '').trim(); if (text) fixSummaries.push(text); };`
called as `captureSummary(impl)`. One-line change; the hazard and half the comment disappear.

### [Readability] `RETRIES` is actually the total attempt count, not the retry count

**File(s):** `scripts/audit-burndown/burndown.mjs` (line 111), `agent-runner.mjs` (line 246) @
9ae62ff1

**Priority:** P5

#### Problem

`const RETRIES = Number(process.env.RETRIES ?? 3); // retries for transient agent failures`
(burndown line 111) feeds `for (let attempt = 1; attempt <= retries; attempt += 1)` (agent-runner
line 246) — so `RETRIES=3` yields three *attempts*, i.e. two retries; `RETRIES=1` yields **zero**
retries. An operator tuning the knob by its name will consistently get one less recovery than
expected. The env-var name is a published knob (it's in `LAUNCH_KNOBS`, lib.mjs line 151), so
renaming has compat cost; the comment and the parameter name are free to fix.

#### Proposed solution

Minimally, correct the docs: `// total attempts per agent step (N-1 retries)` at line 111 and rename
the `retries` parameter/loop reading in `runAgentStep` to `maxAttempts`. If a breaking rename is
ever palatable, `MAX_ATTEMPTS` in `LAUNCH_KNOBS` with `RETRIES` accepted as a deprecated alias.

### [Maintainability] preflight re-implements `shellOk` inline and hand-rolls its check-reporting instead of naming the pattern

**File(s):** `scripts/audit-burndown/preflight.mjs` (lines 108–110) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
if (runCmd(checkCmd, [], { shell: true, stdio: 'ignore' }).status === 0) ok(`${checkCmd} passes`);
```

lib.mjs exports `shellOk(command)` (lines 325–327) for exactly this — run a user-supplied command
line through the shell, boolean status — and burndown.mjs uses it for the same `CHECK_CMD` (line
453). preflight instead passes a whole command string as the *program* argument of `runCmd` with
`shell: true`, which works but reads as a mistake (a `cmd, args` runner given a command line and
empty args) and gives future editors two idioms for one operation.

#### Proposed solution

`import { shellOk } from './lib.mjs'` (already imported for other helpers) and write
`if (shellOk(checkCmd)) ok(…)`. Note `shellOk` uses `stdio: 'ignore'` semantics compatibly (it
ignores output; status only is consumed).

### [Performance] `logLine` re-runs `mkdirSync` for every single log line

**File(s):** `scripts/audit-burndown/lib.mjs` (`logLine`, lines 303–309) @ 9ae62ff1

**Priority:** P5

#### Problem

```js
export function logLine(message) {
  …
  ensureWorkDirs();
  appendFileSync(join(LOGS, 'run.log'), `${line}\n`);
}
```

Every log line pays a `mkdirSync(LOGS, { recursive: true })` syscall (line 307 → line 300) even
though every entry script already calls `ensureWorkDirs()` at startup (burndown.mjs line 73,
overnight.mjs line 22). The cost is trivial next to agent calls, but the call inside `logLine` also
*misleads*: it suggests the work dir might vanish mid-run, and it means the "ensure" idiom appears
both at process start (where it belongs) and per-line (where it's noise).

#### Proposed solution

Either drop the call from `logLine` (callers own setup; a genuinely missing dir would throw loudly
on `appendFileSync`, which is the honest failure), or make `ensureWorkDirs` a memoized once-guard
(`let workDirsEnsured = false; …`) if the belt-and-braces behavior for ad-hoc importers (status/cost
don't call it) is worth keeping. Given status.mjs/cost.mjs never call `ensureWorkDirs()` but do call
`logLine`-free read paths, the memoized variant is the safer minimal change.

## Source: Code audit — web/tests — E2E + integration suites

### [Maintainability] `COLOR_CHANGE_DEBOUNCE_SETTLE_MS` keeps cross-file agreement with the engine by prose, not import

**File(s):** `web/tests/helpers.ts` (lines 27–28) and `web/src/lib/drawing/engine.ts`
(`COLOR_CHANGE_DEBOUNCE_MS`, line 702) @ 9ae62ff1

**Priority:** P2

#### Problem

`web/tests/helpers.ts:27-28` is a textbook instance of the pattern CLAUDE.md calls a defect ("A
'keep in sync with X' comment marks a defect, not a mitigation"):

```ts
// Must remain greater than the engine's COLOR_CHANGE_DEBOUNCE_MS (100).
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = 150;
```

The engine's constant is module-private (`web/src/lib/drawing/engine.ts:702`:
`const COLOR_CHANGE_DEBOUNCE_MS = 100;`), so the agreement is maintained only by this comment —
which also restates the mutable value `(100)`, a second convention violation ("no restating mutable
facts … owned elsewhere"). If the engine debounce is ever raised past 150 ms, every spec that sleeps
`COLOR_CHANGE_DEBOUNCE_SETTLE_MS` (`flows-magic-brush.spec.ts:438`,
`flows-palette-brush.spec.ts:70`, `engine-pointer-recovery.spec.ts:63`) starts flaking or silently
testing inside the debounce window, with nothing failing loudly to point at the drift.

The suite already imports engine constants directly — `engine-pointer-recovery.spec.ts:3-9` imports
`EDGE_SWIPE_BAND_PX`, `POINTER_RESUME_GAP_MS`, etc. from `$lib/drawing/strokeMath` — so the import
path is proven.

#### Proposed solution

Export the constant from a side-effect-free module (either export it from `engine.ts` if importing
it doesn't drag in import-time side effects for the Playwright Node context, or move it to
`$lib/drawing/strokeMath.ts` beside the other pointer-timing constants and have `engine.ts` import
it). Then derive the settle value:

```ts
import { COLOR_CHANGE_DEBOUNCE_MS } from '$lib/drawing/strokeMath';
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = COLOR_CHANGE_DEBOUNCE_MS + 50;
```

Gotcha: `engine.ts` touches DOM at module scope in places — verify it imports cleanly under
Playwright's Node transform before choosing it as the export home; `strokeMath.ts` is the safe host
(it is already imported by a spec today).

### [Maintainability] `generate-image.spec.ts` re-declares server policy values (rate limits, upload cap) instead of importing them

**File(s):** `web/tests/generate-image.spec.ts` (lines 19–21, 41–42) @ 9ae62ff1

**Priority:** P2

> **Verified 2026-07-28** — `rateLimitPolicy.ts` is side-effect-free and `admin.spec.ts` line 2
> already imports a server module by relative path, so the proposed import is proven viable.
> Citation correction: the constants are on lines 19–20 (line 18 is the comment).

#### Problem

The testing rule says "Parametrized tests import the constant/manifest they exercise — never
re-declare the value." This spec re-declares three server policy values:

```ts
// Mirrors of generateToken / generateByok in src/lib/server/rateLimitPolicy.ts.
const GENERATE_LIMIT = 15;
const BYOK_LIMIT = 30;
```

(lines 19–21), and line 42 hard-codes the upload cap's neighbor:

```ts
// 16 MB — just over the 15 MB cap.
const tooBig = Buffer.alloc(16 * 1024 * 1024);
```

where the cap is `MAX_IMAGE_BYTES = 15 * 1024 * 1024` — a module-private const at
`web/src/routes/api/generate-image/+server.ts:25`.

`rateLimitPolicy.ts` is side-effect-free and exports `rateLimitPolicy.generateToken.limit` /
`.generateByok.limit`, and the same spec directory already imports server modules (`admin.spec.ts:2`
imports `SECURITY_HEADERS` from `../src/lib/server/securityHeaders`). If someone tunes a limit, the
burst tests fail with a confusing throttle mismatch instead of tracking the source; the "Mirrors
of…" comment is exactly the prose-sync pattern the conventions ban.

#### Proposed solution

```ts
import { rateLimitPolicy } from '../src/lib/server/rateLimitPolicy';
const GENERATE_LIMIT = rateLimitPolicy.generateToken.limit;
const BYOK_LIMIT = rateLimitPolicy.generateByok.limit;
```

For the upload cap, export `MAX_IMAGE_BYTES` from the `+server.ts` (the server rules already
sanction exporting contract values from `+server.ts` files) and use
`Buffer.alloc(MAX_IMAGE_BYTES + 1)`. Gotcha: confirm the `+server.ts` imports cleanly in the
Playwright Node context (it imports the AI provider seam); if it doesn't, move the cap into a small
`generateImagePolicy.ts` module the route imports.

### [Maintainability] Admin sign-in and token add/remove flows are copy-pasted between `admin.spec.ts` and `a11y.spec.ts`

**File(s):** `web/tests/a11y.spec.ts` (lines 47–62), `web/tests/admin.spec.ts` (`signIn` lines
13–18, `addsAndRemovesToken` lines 20–33), `web/tests/admin-helpers.ts` @ 9ae62ff1

**Priority:** P3

#### Problem

The testing rule is explicit: "A page-driving helper needed by a second spec moves to the shared
helpers module at that moment — never copied between specs." `a11y.spec.ts:48-57` re-implements the
sign-in sequence (`goto` → fill `Admin access key` → click `Sign in` → wait for `Add a code…`) and
the add-token sequence (fill → `Add code` → wait for the row) that `admin.spec.ts` already owns as
`signIn` and `addsAndRemovesToken`. `admin-helpers.ts` exists precisely as the shared admin module
but holds only the token constant. When the console's placeholders or button labels change, two
files break in parallel and must be fixed twice.

#### Proposed solution

Move `signIn(page: Page, path: string)` into `admin-helpers.ts` (it is CDP-free, so
WebKit-portability is not a concern), and add an assertion-free
`addToken(page: Page, token: string)` setup helper there that `a11y.spec.ts` can use for its
"populate an invite row" step (the a11y spec only needs setup; `addsAndRemovesToken`'s assertions
stay in `admin.spec.ts` — this also satisfies "setup-only helpers carrying zero assertions").

### [Maintainability] The `SETTLED_IN_STROKES` gate is encoded as unexplained raw loop bounds in two specs

**File(s):** `web/tests/pwa-registration.spec.ts` (lines 37–55, 65–70),
`web/tests/install-banner.spec.ts` (lines 19–40), `web/src/lib/state/canvas.svelte.ts`
(`SETTLED_IN_STROKES`, line 4) @ 9ae62ff1

**Priority:** P3

#### Problem

Both specs test the "3 committed strokes" gate but encode it as magic loop bounds:
`pwa-registration.spec.ts:37-44` draws exactly two strokes ("Two strokes stay below the gate"), then
one more; `install-banner.spec.ts:19-26` loops `stroke < 2`, then draws a third, then loops `3..8`
for the five-parting strokes. The value's owner is `SETTLED_IN_STROKES = 3` in
`web/src/lib/state/canvas.svelte.ts:4` — but that module can't be imported by a Playwright spec
because line 14 executes `$state(...)` at import time (a Svelte-compile-only rune). The testing rule
anticipates exactly this: "If the source executes at import time, move the constant to a
side-effect-free module." Today, changing the gate to 4 makes both specs fail with opaque
"registration never happened" timeouts rather than pointing at the constant, and the loop bounds
(`2`, `3`, `8`) are unexplained numbers a reader must reverse-engineer from comments.

#### Proposed solution

Move `SETTLED_IN_STROKES` to a rune-free module (e.g. `web/src/lib/state/settledIn.ts` or beside
`storageKeys.ts`), re-export it from `canvas.svelte.ts` for existing importers, and derive the
spec's counts:

```ts
import { SETTLED_IN_STROKES } from '../src/lib/state/settledIn';
for (let stroke = 0; stroke < SETTLED_IN_STROKES - 1; stroke += 1) { … }
```

The install banner's "five additional strokes" parting threshold has its own owner in the banner
component — check whether it too can live in the same side-effect-free module.

### [Maintainability] Synthetic `PointerEvent` dispatch helper (`fire`) is re-implemented seven times across the suite

**File(s):** `web/tests/engine-pointer-recovery.spec.ts` (lines 103–115, 168–180, 202–214),
`web/tests/engine-lifecycle.spec.ts` (lines 46–57), `web/tests/engine-crayon.spec.ts` (lines
356–367), `web/tests/flows-palette-brush.spec.ts` (lines 272–284), `web/tests/ai-timer.spec.ts`
(lines 58–67), `web/tests/parent-zoom.spec.ts` (lines 39–50) @ 9ae62ff1

**Priority:** P3

#### Problem

Seven `page.evaluate` blocks each define a near-identical `fire(type, …)` closure that constructs
and dispatches a `PointerEvent` with
`{ pointerId, pointerType, buttons, clientX, clientY, bubbles, cancelable }`. Three of those copies
live in one file (`engine-pointer-recovery.spec.ts`). The copies drift subtly —
`engine-crayon.spec.ts:359` adds `isPrimary`, `flows-palette-brush.spec.ts:278` adds `pressure`,
`parent-zoom.spec.ts` parameterizes `pointerType` — so a future fix to event construction (e.g.
adding `isPrimary` everywhere, which the engine may start discriminating on) must be replicated by
hand across seven sites. Playwright serializes evaluate callbacks by source, so the closure can't
simply be hoisted, but the *sequences* are data and can be.

This is not the sanctioned "self-contained white-box pixel specs" exception — that carve-out covers
canvas pixel readers, not gesture synthesis.

#### Proposed solution

Add a data-driven dispatcher to `engine-harness.ts` (harness specs) and/or `helpers.ts`:

```ts
export interface SyntheticPointerEvent {
  type: 'pointerdown' | 'pointermove' | 'pointerup';
  pointerId: number;
  pointerType: 'pen' | 'touch' | 'mouse';
  x: number;
  y: number;
  buttons?: number;
}
export function dispatchPointerSequence(
  page: Page,
  selector: string,
  events: SyntheticPointerEvent[],
): Promise<void>;
```

with a single in-page loop that resolves coordinates relative to the target's rect. Tests that
interleave dispatch with engine API calls or pixel reads mid-sequence (e.g.
`engine-crayon.spec.ts`'s eraser-interleave test) can keep their bespoke evaluate — consolidate only
the straightforward fire-sequence cases first (`engine-pointer-recovery`'s three,
`engine-lifecycle`, `flows-palette-brush`). Keep the helper CDP-free so it stays WebKit-portable.

### [Readability] The in-page horizontal-line point generator is rebuilt inside eight `page.evaluate` blocks

**File(s):** `web/tests/engine-crayon.spec.ts` (lines 22–26, 105–107, 158–162, 205–207, 233–238,
281–285, 321–323), `web/tests/engine-snapshot-tier.spec.ts` (lines 59–63) @ 9ae62ff1

**Priority:** P3

#### Problem

Eight evaluate blocks each re-implement the same 41-sample line interpolator under rotating names
(`line`, `pts`, `seg`, or a bare loop):

```ts
const line = (x0: number, x1: number) => {
  const p: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y: ymid });
  return p;
};
```

Other engine specs already show the better pattern — generate the points Node-side and pass them as
the evaluate argument (`engine-resize.spec.ts:8-12`, `engine-undo.spec.ts:168-172`,
`multitouch.spec.ts:18-23` with its named `horizontalStroke`). The in-page copies both bloat every
evaluate body (the crayon file's evaluates run 30–50 lines) and hide that all eight are the same
shape with different endpoints. The `40`-sample count is an unexplained magic literal repeated eight
times.

#### Proposed solution

Export from `engine-harness.ts`:

```ts
const STROKE_SAMPLES = 40;
export function linePoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  samples = STROKE_SAMPLES,
): { x: number; y: number }[];
```

and pass the result into `page.evaluate((pts) => { … E.strokeSync(pts, 'pen'); }, pts)`. Gotcha:
several call sites compute endpoints from `cv.width`/`cv.height` inside the page — fetch the canvas
size once per test (`page.evaluate(() => [cv.width, cv.height])`, or use the known 300×300 harness
geometry the file already relies on) and compute endpoints Node-side. Where a test's evaluate does
substantial other in-page work, the diff should only swap point construction, not restructure the
block.

### [Readability] `picker-trim.spec.ts` hard-codes the half-hex offset `31` beside an import from its owner module

**File(s):** `web/tests/picker-trim.spec.ts` (`expectHoneycomb`, lines 70–78) @ 9ae62ff1

**Priority:** P3

#### Problem

Line 75 asserts the honeycomb interlock with a bare literal:

```ts
expect(Math.abs(grid.rowLefts[i] - grid.rowLefts[i - 1])).toBe(31);
```

The value's owner is `HEX_GRID_GEOMETRY.rowOffsetPx: 31` in `web/src/lib/design/trimGeometry.ts:143`
(documented there as "Honeycomb indent on alternating rows") — and this very spec already imports
`hexGridRowLadderPx` from that module (line 3). If the hexagon size changes, the ladder assertions
auto-track through the import while the interlock assertion fails on a mystery `31`. This is both a
magic tuning literal (convention: named with unit) and a re-declared parametrized-test constant.

#### Proposed solution

```ts
import { HEX_GRID_GEOMETRY, hexGridRowLadderPx } from '$lib/design/trimGeometry';
…
expect(Math.abs(grid.rowLefts[i] - grid.rowLefts[i - 1])).toBe(HEX_GRID_GEOMETRY.rowOffsetPx);
```

### [Readability] `engine-harness.ts` exports `drawStroke`, a pure alias of `dragStroke`

**File(s):** `web/tests/engine-harness.ts` (`drawStroke`, lines 10–17), `web/tests/helpers.ts`
(`dragStroke`, lines 100–112) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
/** Drag a stroke through the given canvas-space points using real mouse input. */
export async function drawStroke(
  page: Page,
  box: { x: number; y: number } | null,
  points: { x: number; y: number }[],
) {
  await dragStroke(page, box, points);
}
```

`drawStroke` forwards every argument to `dragStroke` unchanged and even duplicates its doc comment
verbatim. Seven engine specs import `drawStroke` while the flows specs use `dragStroke`/`draw` — two
names for one behavior, which misleads a first-time reader into hunting for a difference (is the
harness version engine-aware? No). This is speculative surface: an indirection with no production of
its own.

#### Proposed solution

Delete the wrapper and re-export: `export { dragStroke as drawStroke } from './helpers';` — or
better, update the seven engine specs to import `dragStroke` directly and drop the alias entirely,
so a grep for the helper finds one name. Zero behavior change; purely mechanical.

### [Readability] `global-setup.ts` tuning literals are unnamed

**File(s):** `web/tests/global-setup.ts` (lines 28, 37, 46, 65, 69) @ 9ae62ff1

**Priority:** P4

#### Problem

The dep-optimizer warm-up encodes four tuned durations inline: the overall deadline
`Date.now() + 180_000` (line 28), the re-navigation insurance interval
`Date.now() - lastNav > 15_000` (line 37), the poll interval `waitForTimeout(500)` (lines 46 and
69), and the required stable streak `>= 3_000` (line 65). The repo convention is explicit: "A
numeric literal that encodes a tunable decision — threshold, duration … — gets a named module-scope
constant with the unit in the name." These are each genuinely tuned values (the comments explain
their WHY at the call sites), and `500` appears twice, so a change must find both.

#### Proposed solution

```ts
const WARMUP_DEADLINE_MS = 180_000;
const RENAV_INSURANCE_INTERVAL_MS = 15_000;
const READY_POLL_INTERVAL_MS = 500;
const SETTLED_STREAK_MS = 3_000;
```

Move the per-site WHY comments onto the constants (that's where the convention says they live).

### [Readability] `ai-timer.spec.ts` `trigger()` re-implements the shared `retryOpen` helper

**File(s):** `web/tests/ai-timer.spec.ts` (`trigger`, lines 11–16), `web/tests/helpers.ts`
(`retryOpen`, lines 78–87) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
async function trigger(page: Page, name: RegExp) {
  await expect(async () => {
    await page.getByRole('button', { name }).click({ timeout: 1000 });
    await expect(page.locator('dialog.ai-result-modal')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}
```

This is the exact click-until-sentinel-visible shape `retryOpen` was extracted for
(`helpers.ts:78-87`) — the flake-resistance checklist even says "reuse a retrying helper." `trigger`
also lacks `retryOpen`'s already-open short-circuit (it re-clicks even when the modal is up;
harmless for a dialog trigger, but a behavioral divergence a reader must reason about). Timeout
literals `10000`/`1000` are inline where `retryOpen` names them as parameters.

#### Proposed solution

```ts
const trigger = (page: Page, name: RegExp) =>
  retryOpen(
    page.locator('dialog.ai-result-modal'),
    () => page.getByRole('button', { name }).click({ timeout: 1000 }),
  );
```

Same semantics, one fewer bespoke retry loop in the suite.

### [Types] `global.d.ts` engine-harness surface uses open `string`/`number[]` where closed unions/tuples exist

**File(s):** `web/tests/global.d.ts` (lines 9, 56, 59, 62) @ 9ae62ff1

**Priority:** P4

#### Problem

Three typing gaps against the "close finite value sets in the type" convention:

1. `strokeSync(points, pointerType?: string)` (line 59) and
   `multiStrokeSync(strokes, pointerType?: string)` (line 62) — every caller passes
   `'pen' | 'touch' | 'mouse'`, the vocabulary the engine actually discriminates on (`engine.ts:737`
   branches on `'pen'`). A typo like `'stylus'` or `'Pen'` type-checks today and silently exercises
   the wrong debounce path.
2. `pixelAt(x, y): number[]` (line 56) — always an RGBA quad; specs index `[3]` blind. `helpers.ts`
   already exports the right type: `export type Rgba = readonly [number, number, number, number]`
   (line 25).
3. `__engineState` (line 9) is typed non-optional while `__engineReady` is optional — off the
   harness route neither exists, so the types claim more than reality (a spec that forgot the
   harness `beforeEach` would type-check reads of `undefined`).

#### Proposed solution

```ts
strokeSync(points: { x: number; y: number }[], pointerType?: 'pen' | 'touch' | 'mouse'): void;
pixelAt(x: number, y: number): [number, number, number, number];
```

For (3), either mark `__engineState`/`__engine` optional (forcing specs through the readiness gate
types-first) or leave them and add a comment that the harness `beforeEach` is the guarantee — the
union fix in (1) is the valuable part.

### [Maintainability] `TEST_PALETTE` re-declares the production palette hex values

**File(s):** `web/tests/helpers.ts` (`TEST_PALETTE`, lines 9–20), `web/src/lib/palette.ts`
(`PALETTE_COLORS`, lines 17–28) @ 9ae62ff1

**Priority:** P4

#### Problem

`TEST_PALETTE` hand-copies all ten hex values from `PALETTE_COLORS` (`'#AB71E1'`, `'#62A2E9'`, …,
`BLACK_INK`'s `'#0a0b10'`). The failure mode is at least loud (a changed hex makes
`swatch(page, TEST_PALETTE.blue)`'s `[data-color=…]` locator time out), but the testing rule still
applies — "Parametrized tests import the constant … never re-declare the value" — and `palette.ts`
is side-effect-free while the file already imports `COLOR_FAMILIES` from
`../src/lib/hexPickerLayout` (line 3) to derive `PICKER_GREEN` the right way. Any palette tweak
currently requires editing ten mirrored literals plus the per-viewport expectation lists in
`palette-trim.spec.ts`.

#### Proposed solution

```ts
import { PALETTE_COLORS } from '../src/lib/palette';
export const TEST_PALETTE = Object.fromEntries(
  PALETTE_COLORS.map(({ hex, label }) => [label.toLowerCase(), hex]),
) as Record<
  'purple' | 'blue' | 'teal' | 'green' | 'yellow' | 'orange' | 'brown' | 'red' | 'pink' | 'black',
  string
>;
```

(The keyed literal-union cast keeps existing `TEST_PALETTE.blue` call sites type-safe; alternatively
keep explicit named exports derived by a small `hexFor(label)` lookup that throws on a miss.) The
trim-expectation lists in `palette-trim.spec.ts` stay as the visible oracle — only the hex↔name
mapping becomes derived.

### [Maintainability] `proof-sheet-history.spec.ts` hard-codes the tab count `8` next to the directory that owns it

**File(s):** `web/tests/proof-sheet-history.spec.ts` (line 42; `proofSheetsDir` lines 5–7) @
9ae62ff1

**Priority:** P4

#### Problem

```ts
await expect(page.getByRole('tab')).toHaveCount(8);
```

The `8` is the number of proof-sheet book pages in `scrapbook/coloring-book-proof-sheets/`
(currently `creatures, dinosaur, farm, nature, objects, shapes, space, vehicles` — 9 html files
minus `index.html`). The spec already computes `proofSheetsDir` (lines 5–7) to serve those exact
files via `page.route`, so the owning manifest is on disk and one `readdirSync` away. Adding a ninth
coloring book breaks this test with a bare count mismatch instead of tracking the source — the
"parametrized tests import the manifest" rule, in filesystem form.

#### Proposed solution

```ts
const bookCount = readdirSync(proofSheetsDir)
  .filter((f) => f.endsWith('.html') && f !== 'index.html').length;
…
await expect(page.getByRole('tab')).toHaveCount(bookCount);
```

Keeps the assertion meaningful (the tab strip renders one tab per committed sheet) while making it
self-updating.

### [DX] `flows-ai.spec.ts` collapses four request assertions into one opaque boolean

**File(s):** `web/tests/flows-ai.spec.ts` (lines 20–31, 50) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
postedImage = req.method() === 'POST'
  && req.headers()['content-type'] === 'image/webp'
  && Boolean(req.headers()['x-access-token'] ?? req.headers()['x-api-key'])
  && Boolean(req.postDataBuffer()?.length);
```

then line 50: `expect(postedImage).toBe(true);`. When this fails, the report says only
`expected true, received false` — the four distinct contract clauses (method, WebP content-type,
credential header, non-empty body) are indistinguishable, so a regression (say, the client falling
back to PNG encoding) costs a debugging round-trip that individual assertions would answer for free.

#### Proposed solution

Capture the observed values in the route handler and assert each after the flow:

```ts
let posted: { method: string; contentType?: string; hasCredential: boolean; bodyBytes: number } | undefined;
…
expect(posted?.method).toBe('POST');
expect(posted?.contentType).toBe('image/webp');
expect(posted?.hasCredential).toBe(true);
expect(posted?.bodyBytes).toBeGreaterThan(0);
```

Same coverage, self-explanatory failure output.

### [Maintainability] `engine-pointer-recovery.spec.ts` premise check re-derives the jump distance from detached literals

**File(s):** `web/tests/engine-pointer-recovery.spec.ts` (lines 32–38) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
// The premise: the diagonal jump is far past the resume threshold.
expect(Math.hypot(220, 220)).toBeGreaterThan(POINTER_RESUME_JUMP_RATIO * CANVAS_PX);

await page.mouse.move(box.x + 40, box.y + 40);
…
await page.mouse.move(box.x + 260, box.y + 260);
```

The `220` is `260 − 40`, but nothing ties the premise check to the actual mouse coordinates four
lines below — edit the stroke endpoints and the guard silently validates a stale delta, defeating
its purpose (it exists precisely to keep the test honest against `POINTER_RESUME_JUMP_RATIO`
changes).

#### Proposed solution

```ts
const START = { x: 40, y: 40 };
const END = { x: 260, y: 260 };
expect(Math.hypot(END.x - START.x, END.y - START.y)).toBeGreaterThan(
  POINTER_RESUME_JUMP_RATIO * CANVAS_PX
);
await page.mouse.move(box.x + START.x, box.y + START.y);
…
```

Now the premise is computed from the same values the gesture uses.

### [Readability] `flows-magic-brush.spec.ts` carries three near-identical opaque-pixel counters

**File(s):** `web/tests/flows-magic-brush.spec.ts` (`opaquePixelsInLeftBand` lines 280–289,
`opaquePixelsInTopBand` lines 317–326, `opaqueCount` lines 400–408) @ 9ae62ff1

**Priority:** P4

#### Problem

Three helpers in the same file run the identical loop — `getImageData` over a region, count
`data[i] > 200` alpha — differing only in the sampled rectangle (left band by width fraction, top
band by height fraction, whole canvas). Each carries its own doc comment and `frac` default; a
threshold change (the `200` strong-alpha cutoff, itself an unnamed magic literal repeated three
times) must be made in three places. Staying inside this file keeps the sanctioned
self-contained-pixel-spec boundary intact — the duplication is purely internal.

#### Proposed solution

One parameterized counter, kept in-file:

```ts
const STRONG_ALPHA = 200;
function opaquePixelCount(
  page: Page,
  region?: { xFrac?: number; yFrac?: number; wFrac?: number; hFrac?: number },
): Promise<number>;
```

with the three call sites passing `{ wFrac: 0.04 }`, `{ hFrac: 0.05 }`, and nothing. Name the alpha
cutoff once.

### [Performance] `picker-trim.spec.ts` ladder walk does a full page load + dialog-animation wait per rung

**File(s):** `web/tests/picker-trim.spec.ts` (`openPickerAt` lines 20–68, ladder test lines 105–115)
@ 9ae62ff1

**Priority:** P4

#### Problem

The height-ladder test loops `openPickerAt` over 7 rungs; each call does `setViewportSize` → full
`page.goto('/')` → retry-open the picker → await the fly-in animation. That's 7 serial cold loads
inside one test on the suite's critical path, when the file's own header states the trim is "purely
via CSS media queries (no JS measurement)" — meaning a viewport resize with the dialog already open
re-evaluates the media queries live, no reload or re-open needed. The 6 parametrized `CASES` tests
are separate tests (parallel-friendly, fine); the ladder walk is the serial hot spot.

#### Proposed solution

In the ladder test, load and open the picker once, then per rung: `setViewportSize` → re-measure the
grid (extract the measurement half of `openPickerAt` into
`measureVisibleGrid(page): Promise<VisibleGrid>` so both paths share it). Tradeoff: this stops
re-exercising the *open-at-this-size* path per rung — but the six `CASES` tests already cover
open-at-size, and the ladder test's stated subject is the offset restatement in the CSS, which
resize exercises identically. Verify with `--repeat-each=10` that resize-with-open-dialog is stable
before committing (the fly-in has finished by then, so it should be).

### [Maintainability] `flows-coloring-book.spec.ts` re-inlines the Farm-page application it has a harness helper for

**File(s):** `web/tests/flows-coloring-book.spec.ts` (lines 134–141), `web/tests/flows-harness.ts`
(`applyFarmPage`, lines 54–66) @ 9ae62ff1

**Priority:** P4

#### Problem

The "rotating the viewport swaps the coloring overlay" test (lines 126–150) re-inlines the
open-dialog → click Farm book → click first page sequence:

```ts
await openColoringDialog(page);
const dialog = page.locator('#coloring-book-dialog');
await dialog.getByRole('button', { name: /Farm coloring book/i }).click();
await dialog.getByRole('button', { name: /Farm coloring page/i }).first().click();
```

`applyFarmPage` in `flows-harness.ts:54-66` is exactly this plus two *stronger* readiness waits
(dialog hidden, `src` decoded) — the inline copy skips those and goes straight to
`toHaveAttribute('src', /-wide…/)`, which happens to retry, but the duplication means a book-picker
relabel breaks two sites and the readiness discipline exists in only one. (The first test, lines
10–29, legitimately inlines the steps because the intermediate states *are* its subject.)

#### Proposed solution

Replace lines 134–141 with `await applyFarmPage(page);` — the subsequent `-wide` assertion still
pins the orientation-specific variant. One behavior change: the helper waits for the decoded src
first, which only makes the test less racy.

### [Maintainability] `admin.spec.ts` route mock hard-codes the Playwright preview origin

**File(s):** `web/tests/admin.spec.ts` (line 83) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
invites: … [{ token, url: `http://localhost:4173/?ai_access_token=${token}` }],
```

The port is owned by `web/playwright.shared.ts:3-4` (`playwrightPort = 4173`, `playwrightBaseURL`).
If the port ever changes, this mock silently serves an invite URL for the wrong origin — harmless
today (the UI only displays/copies it) but a copied-URL assertion added later would chase a phantom
mismatch.

#### Proposed solution

`import { playwrightBaseURL } from '../playwright.shared';` and interpolate it — or build the URL
from the test's `baseURL` fixture. One-line change.

### [Readability] `a11y.spec.ts` inlines the `gotoApp` hydration wait

**File(s):** `web/tests/a11y.spec.ts` (lines 66–67) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
await page.goto('/');
await expect(page.locator('#drawingCanvas')).toBeVisible();
```

is `gotoApp(page)` (`helpers.ts:66-69`) written out longhand, in a file that already imports from
`./helpers` (line 4). Trivial, but the helper exists precisely so the "canvas visible ⇒ hydrated"
reasoning lives in one commented place; inline copies erode that. (`parent-zoom.spec.ts` similarly
uses bare `page.goto('/')` eight times — acceptable there since `openParentCenter` immediately
retries, but worth normalizing if touched.)

#### Proposed solution

Replace with `await gotoApp(page);` in `a11y.spec.ts`; optionally sweep `parent-zoom.spec.ts` in the
same commit.

### [Readability] `flows-palette-brush.spec.ts` duplicates the crayon/pen comparison scene inline in both tests

**File(s):** `web/tests/flows-palette-brush.spec.ts` (lines 88–89 and 114–115) @ 9ae62ff1

**Priority:** P5

#### Problem

The crayon-buildup test and its deliberate mirror, the pen-no-buildup test, each re-declare the
identical scene:

```ts
const line = Array.from({ length: 15 }, (_, index) => ({ x: 240 + index * 20, y: 320 }));
const region = { x: 220, y: 280, width: 320, height: 80 };
```

The two tests are meaningful only as a contrast pair over the *same* stroke and sample region — that
shared premise is currently maintained by copy-paste. Nudge one copy's geometry and the pair
silently stops being a controlled comparison.

#### Proposed solution

Hoist to module scope beside a one-line comment stating the pairing:

```ts
// The crayon-buildup and pen-no-buildup tests contrast the SAME stroke and region.
const BUILDUP_LINE = Array.from({ length: 15 }, (_, i) => ({ x: 240 + i * 20, y: 320 }));
const BUILDUP_REGION = { x: 220, y: 280, width: 320, height: 80 };
```

# Section 27 — web/* build & test configuration

## Source: Code audit — web/* — build & test configuration

### [Architecture] Internal coloring-book planning doc (with third-party IP character lists) is publicly served from static/

**File(s):** `web/static/coloring/COLORING-BOOK.md` (346 lines) @ 9ae62ff1

**Priority:** P1

#### Problem

`web/static/**` ships verbatim to production and into the native app bundles.
`web/static/coloring/COLORING-BOOK.md` is a 346-line internal planning document — publicly reachable
at `https://splotch.art/coloring/COLORING-BOOK.md` — containing:

* Brainstormed coloring-book sections built around trademarked third-party IP (lines 1–40: "Frozen …
  Ana, Elsa, Kristoph", "Bluey", "Paw Patrol", "Spidey and His Amazing Friends" with full character
  rosters).
* Draft AI-generation prompt text for the coloring pipeline ("## Style Rules … Create a
  coloring-page background image for a kids digital coloring app…", the trailing ~40 lines).

Nothing in the repo references the file as a served asset (`grep -rn "COLORING-BOOK"` matches
nothing in `web/src`, `scripts/`, or `tools/`). Serving an internal ideation doc that name-drops
Disney/BBC/Nickelodeon/Marvel characters from a kids-app production domain is a needless legal/PR
exposure, and it bloats the native bundles (adapter-static copies `static/` wholesale). The repo
already has a designated home for reusable AI art prompts: `docs/PROMPTS.md` (per CLAUDE.md's docs
table), and asset-pipeline records live in `tools/asset-gen/docs/`.

#### Proposed solution

Move the file out of `web/static/` — the prompt sections belong with `docs/PROMPTS.md` or
`tools/asset-gen/docs/`; the section-idea lists belong in a GitHub issue (the repo's stated backlog
mechanism) or the same docs tree. Delete it from `static/`. Gotchas: `.svelte-kit/non-ambient.d.ts`
regenerates its `Asset()` union on the next `svelte-kit sync` (no manual edit needed); double-check
no external bookmark relies on the URL (nothing in-repo does).

### [Maintainability] Dev/preview ports (5173, 4173) are synced by prose comments and hand-maintained duplicates, with no drift guard

**File(s):** `web/vite.config.ts` (lines 30–33), `web/netlify.toml` (lines 25–26),
`web/playwright.shared.ts` (line 3) @ 9ae62ff1

**Priority:** P2

#### Problem

CLAUDE.md is explicit: "A 'keep in sync with X' comment marks a defect, not a mitigation" — when
agreeing sites can't share code, a drift-guard test must read both sides (the
`web/src/app.html.test.ts` / `scripts/tests/android-config.test.mjs` pattern). Both port values
violate this:

* **5173** — `web/vite.config.ts:30-32`:

  ```ts
  // Keep with web/netlify.toml's [dev].targetPort and Vite dev-port consumers:
  // scripts/cloud-tunnel.mjs and root dev:kill/live-reload/ADB scripts must all update together.
  port: 5173,
  ```

  mirrored by hand in `web/netlify.toml:26` (`targetPort = 5173`, with its own "Keep in sync with
  server.port in web/vite.config.ts" comment at line 25), `scripts/cloud-tunnel.mjs:22`
  (`const PORT = 5173`), and root `package.json` scripts `dev:kill` (line 16), `ios:live` (line
  118), `adb:reverse` (line 124), plus `scripts/android-emulator.mjs:15`.
* **4173** — `web/playwright.shared.ts:3` exports `playwrightPort = 4173`, but
  `scripts/store-shots.mjs:37` (`const PORT = 4173`) and `package.json` `perf:serve` (line 48,
  `--port 4173`) re-declare it independently.

No test reads any of these (`scripts/tests/` has no port drift test; `vite-server.test.mjs` only
tests `freePort` behavior). A port change breaks `dev:netlify` proxying or the phone-preview/perf
tooling silently.

#### Proposed solution

Add `scripts/tests/dev-ports.test.mjs` (repo-script suite) that declares the two expected ports once
and asserts, by text-parsing each non-importing site, that `web/vite.config.ts`, `web/netlify.toml`,
`web/playwright.shared.ts`, `scripts/cloud-tunnel.mjs`, `scripts/store-shots.mjs`,
`scripts/android-emulator.mjs`, and the relevant `package.json` scripts all agree — then delete the
"keep in sync" comments (pointing instead at the guard). A fancier option (a shared `web/ports.ts`
imported by the TS sites) works for `vite.config.ts`/`playwright.shared.ts` but not for `.mjs`
scripts run directly by node or for TOML/JSON, so the drift test is needed either way.

### [Maintainability] CI retry-token derivation formula is duplicated between playwright.config.ts and the spec that consumes it

**File(s):** `web/playwright.config.ts` (`ciAllowedTokens`, lines 64–67) @ 9ae62ff1

**Priority:** P2

#### Problem

`web/playwright.config.ts:64-67` derives the per-retry token list served to the web server:

```ts
const ciRetries = 2;
const ciAllowedTokens = Array.from(
  { length: ciRetries + 1 },
  (_, retry) => retry === 0 ? 'daycare-club' : `daycare-club-retry${retry}`,
).join(',');
```

and `web/tests/generate-image.spec.ts:112` re-derives the identical formula independently:

```ts
const token = testInfo.retry === 0 ? 'daycare-club' : `daycare-club-retry${testInfo.retry}`;
```

Two hand-maintained copies of the same string-construction rule. If either side changes (rename the
base token, change the suffix scheme), the other keeps compiling and the breakage only manifests
**on a CI retry** — the rarest, least-debuggable path, and precisely the situation the retry tokens
exist to handle (rate-limit buckets per retry). CLAUDE.md's boundary-string rule ("declared once,
imported everywhere") excepts *tests* re-typing literals, but here the non-test config side and the
spec each derive a *formula*, not a literal — the derivation itself is the shared contract.

#### Proposed solution

Extract `export function retryScopedToken(retry: number): string` (plus
`export const CI_MANAGED_TOKEN = 'daycare-club'`) into a small shared module, e.g.
`web/tests/ai-tokens.ts`, imported by both `playwright.config.ts` (which already imports from
`./tests/admin-helpers`, so the precedent exists) and `generate-image.spec.ts`. `ciAllowedTokens`
becomes `Array.from({ length: ciRetries + 1 }, (_, r) => retryScopedToken(r)).join(',')`.

### [Performance] Service-worker precache includes assets the app never fetches (social og:image, generator source SVGs)

**File(s):** `web/vite.config.ts` (`workbox.globPatterns`, line 93) @ 9ae62ff1

**Priority:** P3

#### Problem

`globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,woff2,webmanifest}']` (line 93) sweeps everything
in the build output — including `static/` files that only exist for *external* consumers and are
never requested by the running app:

* `web/static/large-image.png` (556,002 bytes) — referenced only by `og:image`/`twitter:image` meta
  in `web/src/app.html:32,41`; fetched by link-unfurling scrapers, never by a browser session.
* `web/static/large-image.svg` (7,497 bytes) — input file for `scripts/gen-large-image.mjs:32`, not
  a runtime asset.
* `web/static/styles/source.svg` (55,652 bytes) — input for
  `tools/asset-gen/bin/gen-style-covers.mjs:21`, not a runtime asset.

That is ~620 KB of precache downloaded by every client that installs the SW, on top of the ~39 MB
the config already frets about ("a window.load registration would saturate a slow connection", lines
76–81). The config already demonstrates deliberate precache curation (`navigateFallback: ''`, html
excluded) — these files just slipped through the glob.

#### Proposed solution

Add `globIgnores: ['large-image.png', 'large-image.svg', 'styles/source.svg']` beside `globPatterns`
(workbox supports it at the same level), with a WHY comment ("social-card + generator inputs —
served, never fetched by the app"). If the generator-input SVGs move out of `static/` entirely (see
the next finding), only `large-image.png` needs ignoring. Verify by inspecting the emitted `sw.js`
precache manifest after `npm run build`.

### [Architecture] Generator input files live in web/static and ship to production

**File(s):** `web/static/large-image.svg`, `web/static/styles/source.svg` @ 9ae62ff1

**Priority:** P3

#### Problem

Both SVGs are *inputs* to offline tooling, not app assets: `scripts/gen-large-image.mjs:32` reads
`web/static/large-image.svg` to replay strokes onto the live canvas, and
`tools/asset-gen/bin/gen-style-covers.mjs:21` reads `web/static/styles/source.svg` to generate the
style-cover webps. Neither is referenced by any runtime code path (only `scripts/image-audit.mjs:34`
— which has to special-case both in its `IGNORE` set precisely because they aren't app images).
Housing tool inputs in the production publish directory means they are served publicly, copied into
the native binaries, and precached (previous finding), and it muddies the otherwise-clean rule that
`static/` is "the files meant to be served verbatim" (`web/netlify.toml:16-17`).

#### Proposed solution

Move `large-image.svg` beside its consumer (e.g. `scripts/assets/large-image.svg`) and `source.svg`
into `tools/asset-gen/` (its docs at `tools/asset-gen/docs/README.md:142` already describe it as a
committed pipeline input). Update the two generator paths and drop both entries from
`scripts/image-audit.mjs`'s `IGNORE` set. Gotcha: confirm neither URL is referenced externally
(nothing in-repo fetches them over HTTP).

### [Testing] `chromiumExecutablePath` is 25 lines of untested imperative fallback logic, triplicated across the repo

**File(s):** `web/playwright.config.ts` (`chromiumExecutablePath`, lines 18–43) @ 9ae62ff1

**Priority:** P2

#### Problem

The cloud Chromium-revision fallback in `playwright.config.ts:18-43` (env override → pinned-binary
check → scan `PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'` for the newest `chromium-*` build
across two subdir layouts) is exactly what `.claude/rules/testing.md` flags: "Imperative logic whose
only coverage is E2E (inline in a component or config) is an extraction candidate: pure injectable
module + unit tests." It currently has *no* coverage at all — a regression in the sort/filter only
surfaces as a broken cloud session. Worse, the logic exists in three near-identical copies:

* `web/playwright.config.ts:18-43`
* `.claude/skills/run-splotch/driver.mjs` (~lines 37–55, using a magic `slice(9)` where the config
  version at least names `chromiumPrefix`)
* `.claude/skills/lighthouse-audit/run-audit.mjs` (`resolveChrome`, lines 189–203, a diverged
  variant: no `chrome-linux` fallback, lexicographic `.sort().reverse()` instead of numeric)

and the `'/opt/pw-browsers'` default literal appears in all three plus two skill docs. The copies
have already drifted (numeric vs lexicographic revision ordering — lexicographic mis-sorts once
revisions cross a digit-count boundary, e.g. `chromium-999` vs `chromium-1228`).

Internal inconsistency inside the config copy itself: line 26 defines
`const chromiumPrefix = 'chromium-'` but line 29's regex re-hardcodes the prefix
(`/^chromium-\d+$/`) instead of being built from it.

#### Proposed solution

Extract the discovery into one injectable helper — e.g. `scripts/lib/chromium-fallback.mjs`
exporting
`findFallbackChromium({ base, exists = existsSync, readdir = readdirSync }): string | undefined` —
with unit tests in `scripts/tests/` covering: env override, pinned-present, numeric ordering across
digit counts, both subdir layouts, unreadable dir. `playwright.config.ts` imports it (a `.mjs`
import from a TS config is fine under Vite/Playwright's loader). The two skill drivers are packaged
trees (run-splotch is ruler-generated; edit `.ruler/skills/run-splotch/driver.mjs`) — they run from
a repo checkout, so they *can* import `scripts/lib/`, but if keeping skills self-contained is
preferred, at minimum fix lighthouse-audit's lexicographic sort and note the canonical copy.

Merged from two duplicates of this finding (scripts/lib and .ruler sections):
`scripts/lib/playwright.mjs` is a further copy and carries an undocumented
`PLAYWRIGHT_CHROMIUM_PATH` env-var alias that exists nowhere else — decide its fate when
consolidating — and `.ruler/skills/run-splotch/SKILL.md` instructs pasting an inline copy into
driver code; change it to import the one shared helper instead.

### [Maintainability] `version.json` boundary string is declared in two places (emitter and fetcher)

**File(s):** `web/vite.config.ts` (`emit-version-json` plugin, line 63) @ 9ae62ff1

**Priority:** P3

#### Problem

The build emits the version endpoint at `vite.config.ts:63` (`fileName: 'version.json'`) and the app
fetches it at `web/src/lib/pwa/updates.ts:140`
(`await fetch('/version.json', { cache: 'no-store' })`). CLAUDE.md's rule for boundary strings —
"declared once, imported everywhere (tests deliberately excepted)" — applies squarely: both sides
are production code, and both *can* share a constant (vite.config.ts already imports sibling TS
modules, and Vite bundles the config with esbuild, so importing a side-effect-free module from
`src/` works). Today a rename on either side deploys cleanly and only fails at runtime as a
silently-dead stuck-client recovery path (updates.ts swallows the failed fetch at lines 148–150 by
design).

#### Proposed solution

Create a tiny constants module, e.g. `web/src/lib/pwa/versionEndpoint.ts` exporting
`export const VERSION_JSON_FILENAME = 'version.json';` (and optionally
`VERSION_JSON_PATH = '/' + VERSION_JSON_FILENAME`). Import it in both `vite.config.ts` and
`updates.ts`. Keep the module side-effect-free (no browser globals at top level) so the node-side
config import stays safe. The `updates.test.ts` literals (lines 131, 139) stay as literals per the
tests exception.

### [Types] playwright.shared.ts config objects bypass excess-property checking when spread

**File(s):** `web/playwright.shared.ts` (`commonPlaywrightConfig` lines 6–11, `commonWebServer`
lines 16–24) @ 9ae62ff1

**Priority:** P3

#### Problem

Both shared objects are plain untyped literals:

```ts
export const commonPlaywrightConfig = {
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  use: { baseURL: playwrightBaseURL },
};
```

They only ever reach Playwright via spreads (`...commonPlaywrightConfig` in
`playwright.config.ts:70` and `playwright.webkit-scratch.config.ts:12`; `...commonWebServer` in the
`webServer` blocks) — and TypeScript's excess-property check does **not** apply to spread-introduced
properties. A typo'd key here (`globalSteup`, `fullyParallell`) compiles clean in every consumer and
is silently ignored by Playwright at runtime — the exact failure mode the repo's "close finite value
sets in the type" convention exists to prevent, and the setup keys govern real behavior (a dropped
`globalSetup` just makes DEV_SERVER runs flaky).

#### Proposed solution

Constrain the declarations at the source with `satisfies`:

```ts
import type { PlaywrightTestConfig } from '@playwright/test';
export const commonPlaywrightConfig = { ... } satisfies PlaywrightTestConfig;
export const commonWebServer = { ... } satisfies Partial<NonNullable<PlaywrightTestConfig['webServer']>> & { url: string };
```

`satisfies` keeps the narrow inferred type (so `use.baseURL` stays a `string` literal type for
consumers) while making unknown keys a compile error.

### [Types] defines.ts returns an open `Record<string, string>` for a closed define vocabulary mirrored by hand in app.d.ts

**File(s):** `web/defines.ts` (`buildDefines`, lines 1–21) @ 9ae62ff1

**Priority:** P4

#### Problem

The five compile-time define names (`__APP_VERSION__` … `__PERF_MARKS__`) form a fixed vocabulary
that appears twice: as string keys in `defines.ts:14-20` and as hand-mirrored ambient declarations
in `web/src/app.d.ts:22-29`. The function's return type, `Record<string, string>` (line 13), is
exactly the open-keys shape CLAUDE.md's convention forbids for closed sets ("constant maps are
`Record<UnionType, V>` … not `Record<string, V>`"). Adding a define in one file but not the other
produces no compile error at the boundary — a missing `define` entry for a declared global surfaces
only as a bare identifier surviving into the bundle and a runtime `ReferenceError` in whichever code
path reads it.

#### Proposed solution

Close the key set:

```ts
const DEFINE_NAMES = [
  '__APP_VERSION__', '__BUILD_TIME__', '__NATIVE_API_BASE__', '__IS_CAPACITOR__', '__PERF_MARKS__',
] as const;
type DefineName = (typeof DEFINE_NAMES)[number];
export function buildDefines(...): Record<DefineName, string> { ... }
```

Optionally add a small drift test (the `app.html.test.ts` text-parsing pattern) asserting every
`DEFINE_NAMES` entry has a `const __X__:` declaration in `app.d.ts` and vice versa — cheap, and it
closes the remaining prose-synced half.

### [Correctness] `readPackageVersion` resolves package.json relative to cwd, not to the module

**File(s):** `web/buildVersion.ts` (`readPackageVersion`, lines 51–53) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
function readPackageVersion(): string {
  return (JSON.parse(readFileSync('../package.json', 'utf8')) as { version: string }).version;
}
```

`'../package.json'` is resolved against `process.cwd()`, so the function only works when the build
runs with `cwd = web/` (true today via `scripts/web.mjs`, but an unstated invariant). Any future
consumer — a repo-root script importing `buildMetadata`, a test runner with a different cwd — would
silently read a *different* `package.json` (or throw), and because `deriveWebVersion` already has
layered fallbacks, a wrong-but-parseable read could produce a plausible wrong version rather than a
loud failure. The repo's own configs model the fix: `web/src/browserFloor.test.ts:13` and
`app.html.test.ts` use `new URL(..., import.meta.url)` for module-relative reads.

#### Proposed solution

```ts
readFileSync(new URL('../package.json', import.meta.url), 'utf8');
```

Note the file's header comment (lines 4–5, "at the repo root, one dir up from web/") stays accurate
— it describes the module-relative location, which the fix makes literally true regardless of cwd.

### [Readability] `profilingEsbuildOptions` hoists a one-liner behind an odd intersection type

**File(s):** `web/vite.config.ts` (lines 17–19 and 49–53) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const profilingEsbuildOptions: import('vite').ESBuildOptions & {
  keepNames: boolean;
} = { keepNames: true };
```

is consumed once, 30 lines later:

```ts
...(perfMarks
  ? {
      esbuild: profilingEsbuildOptions,
    }
  : {}),
```

The intersection type is noise — `ESBuildOptions` already includes `keepNames?: boolean`, and
`defineConfig` would type-check an inline literal anyway. Hoisting a single-property object away
from its use site forces a reader to jump to learn that "profiling esbuild options" means exactly
`keepNames: true`, and the intersection suggests some subtle type requirement that doesn't exist.

#### Proposed solution

Inline it, keeping the existing WHY comment (lines 46–48) at the spread:

```ts
...(perfMarks ? { esbuild: { keepNames: true } } : {}),
```

Delete lines 17–19.

### [Readability] `webkitAvailable` is a predicate that throws, and `REQUIRE_WEBKIT` parsing diverges from the repo's env-flag convention

**File(s):** `web/playwright.config.ts` (`webkitAvailable`, lines 51–61) @ 9ae62ff1

**Priority:** P4

#### Problem

Two issues in one function:

1. The name promises a boolean question, but lines 57–59 throw:

   ```ts
   if (process.env.REQUIRE_WEBKIT) {
     throw new Error('REQUIRE_WEBKIT is set but the WebKit binary is not installed');
   }
   ```

   A reader scanning the projects array (`...(webkitAvailable() ? [...] : [])`, line 97) has no
   signal that evaluating the config can abort the run — the enforcement side effect is hidden
   inside what reads as a pure check.
2. The flag is tested for truthiness, while the file-family convention is strict comparison:
   `CAPACITOR === 'true'` (`svelte.config.js:10`, `vite.config.ts:10`), `PERF_MARKS === 'true'`
   (`vite.config.ts:16`). `REQUIRE_WEBKIT=false` or `REQUIRE_WEBKIT=0` in a workflow env block still
   *requires* WebKit — a surprising inversion for anyone pattern-matching on the repo's other flags.

#### Proposed solution

Split the concerns: a pure `isWebkitInstalled(): boolean` (the try/existsSync part), and an explicit
module-level guard next to it:

```ts
const webkitInstalled = isWebkitInstalled();
if (!webkitInstalled && process.env.REQUIRE_WEBKIT === 'true') {
  throw new Error('REQUIRE_WEBKIT is set but the WebKit binary is not installed');
}
```

Gotcha: changing to `=== 'true'` requires confirming what CI's e2e step actually exports
(`.github/workflows` sets `REQUIRE_WEBKIT` — align the workflow value in the same change so the gate
never silently loosens).

### [Maintainability] Timeout constant lacks the unit suffix the conventions require

**File(s):** `web/playwright.shared.ts` (line 14) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
const PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET = 180_000;
```

CLAUDE.md: "Tuning literals get names … with the unit in the name (`_MS`, `_PX` …)". This is
precisely such a tuning literal (it feeds Playwright's `webServer.timeout`, which is milliseconds),
but the name omits the unit — a reader can plausibly misread 180_000 as 180 seconds only after
checking Playwright's docs.

#### Proposed solution

Rename to `PRODUCTION_BUILD_AND_PREVIEW_BOOT_BUDGET_MS` (one definition, one use at line 18).

### [Maintainability] vitest include/exclude globs contradict the repo's TS-only and test-naming conventions

**File(s):** `web/vitest.config.ts` (lines 31–33) @ 9ae62ff1

**Priority:** P4

#### Problem

```ts
include: ['src/**/*.{test,spec}.{js,ts}'],
// The Playwright specs live under tests/ and must not be picked up here.
exclude: ['tests/**', 'node_modules/**', '.svelte-kit/**'],
```

Three mismatches:

* `.js` in the include glob is dead vocabulary: `web/tsconfig.json:7` sets `allowJs: false` with a
  comment enforcing "src/ is TypeScript-only", and no `.test.js`/`.spec.js` exists under `src/`.
* `.spec` blurs the layer-naming boundary: `.claude/rules/testing.md` defines the tiers as "Vitest
  unit tests (`src/**/*.test.ts`…)" vs "Playwright E2E (`tests/*.spec.ts`)". Permitting
  `src/**/*.spec.ts` invites a unit test whose name reads as E2E; no such file exists today, so
  tightening is free.
* The `exclude` override is misleading: with `include` scoped to `src/**`, `'tests/**'` can never
  match anyway — the comment on line 32 claims a purpose the entry doesn't serve — and overriding
  `exclude` at all replaces Vitest's default exclude list, which is why `node_modules/**` had to be
  re-listed by hand.

#### Proposed solution

`include: ['src/**/*.test.ts']` and drop the `exclude` key entirely (Vitest's defaults already cover
`node_modules`/dist; `.svelte-kit` contains no files matching the tightened include). Run
`npm run test:unit` and diff the collected-file count to confirm nothing was silently dropped.

### [Maintainability] site.webmanifest duplicates app.html's name/description/theme-color with no drift guard

**File(s):** `web/static/site.webmanifest` (lines 2–4, 33) @ 9ae62ff1

**Priority:** P4

#### Problem

The manifest hand-mirrors values owned by `web/src/app.html`:

* `"name": "Splotch - Drawing for Kids"` (manifest:2) ↔ `<title>Splotch - Drawing for Kids</title>`
  (app.html:26) and `og:title`/`twitter:title`;
* `"description": "A simple drawing app for toddlers"` (manifest:4) ↔ `<meta name="description" …>`
  (app.html:25);
* `"theme_color": "#ffffff"` (manifest:33) ↔ `<meta name="theme-color" content="#ffffff" />`
  (app.html:24).

Static JSON can't import constants, which per CLAUDE.md is exactly the case that gets a drift-guard
test ("when the agreeing sites can't share code … add a drift-guard test that reads both sides").
The repo already has the model — `web/src/app.html.test.ts` mechanically guards app.html's other
hand-mirrored literals — but the manifest has no guard, and a rebrand or theme-color change would
ship a mismatched install surface (splash screen/title bar) with no failing test. Neither
`page.spec.ts` nor any unit test reads `site.webmanifest`.

#### Proposed solution

Add a small node-environment unit test (e.g. `web/src/webmanifest.test.ts`) that `readFileSync`s
both `static/site.webmanifest` and `src/app.html` via `new URL(..., import.meta.url)` and asserts:
manifest `name` equals the `<title>` text, manifest `description` equals the meta description, and
manifest `theme_color` equals the theme-color meta content. ~15 lines, same shape as
`browserFloor.test.ts`.

### [Docs] ICONS-README.md is a stale AI-session artifact published at splotch.art/ICONS-README.md

**File(s):** `web/static/ICONS-README.md` (26 lines) @ 9ae62ff1

**Priority:** P4

#### Problem

The file is celebratory session prose, not documentation — "All required icons have been
successfully implemented!" (line 3), a ✅-emoji checklist of files that exist two directories away,
and generic PWA marketing copy (lines 18–26). Because it sits in `static/`, it is served publicly on
the production domain and copied into both native binaries. As documentation it is already drifting:
it describes only the favicon/manifest set and knows nothing of `icons/`, `styles/`, `sounds/`, or
the coloring set that now dominate `static/`. Icon provenance documentation is separately tracked as
issue \#234 ("Document icon source + move toward hand-drawn icons") — this file isn't that; it's
clutter that will mislead whoever picks that issue up.

#### Proposed solution

Delete it. If any fact in it is worth keeping (the icon-design description, lines 12–16), fold that
sentence into the artifact produced for issue \#234 (a `docs/` page, not a `static/` file). Zero
code references exist — only the regenerated `.svelte-kit` asset union.

### [Maintainability] `CAPACITOR === 'true'` is parsed independently in both build configs

**File(s):** `web/svelte.config.js` (line 10), `web/vite.config.ts` (line 10) @ 9ae62ff1

**Priority:** P5

#### Problem

CLAUDE.md declares `CAPACITOR=true` "the **single signal** for all web-vs-native branching", yet the
signal is decoded twice:

```js
const isCapacitor = process.env.CAPACITOR === 'true'; // svelte.config.js:10
```

```ts
const isCapacitor = process.env.CAPACITOR === 'true'; // vite.config.ts:10
```

Two independent parses of one boundary value; a change to the sentinel (e.g. accepting `1`) must be
made twice, and a mismatch would split the adapter choice from the PWA/defines choice — a genuinely
nasty half-native build.

#### Proposed solution

A shared `web/capacitorFlag.js` (plain `.js`, since `svelte.config.js` is loaded by node without a
TS loader) exporting `export const isCapacitor = process.env.CAPACITOR === 'true';`, imported by
both configs. Tradeoff: it's a two-line duplication today, and the fix adds a file — worth it mainly
because the value gates the repo's most consequential build fork; reasonable to bundle into any
change that next touches either config rather than as standalone churn.

### [DX] netlify-cli's own dev port (8888) is implicit while dev:kill hardcodes it

**File(s):** `web/netlify.toml` (`[dev]` block, lines 22–27) @ 9ae62ff1

**Priority:** P5

#### Problem

The `[dev]` block pins `targetPort = 5173` but leaves netlify-cli's *listening* port to the tool's
default (8888). Meanwhile root `package.json:16` (`dev:kill": "npx kill-port 5173 8888"`) and its
scripts-info line 144 both hardcode 8888. If netlify-cli ever changes its default (or a second
instance bumps to 8889), `dev:kill` silently stops killing the right listener. The agreement exists
only in contributors' heads.

#### Proposed solution

Add `port = 8888` to the `[dev]` block so the value is declared where it's configured, and include
8888 in the dev-ports drift test proposed above (assert `netlify.toml` `[dev].port` matches the port
list in `dev:kill`).

### [DX] `includeAssets` likely duplicates what `globPatterns` already precaches

**File(s):** `web/vite.config.ts` (`includeAssets`, lines 83–88) @ 9ae62ff1

**Priority:** P5

#### Problem

```ts
includeAssets: [
  'favicon.ico',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'sounds/*.mp3',
],
```

Every listed pattern is already matched by `globPatterns` on line 93 (`ico`, `png`, `mp3` are all in
the extension set), and in the SvelteKit integration the static dir's files land in the glob
directory — which is how the coloring `.webp` set reaches the precache with no `includeAssets`
entry. Two overlapping mechanisms for the same outcome invite a false mental model (a future reader
may believe removing an extension from `globPatterns` still leaves `includeAssets` files precached,
or vice versa) and the workbox manifest de-dupes them anyway.

#### Proposed solution

Build once, inspect the generated service worker's precache manifest, and if (as expected) every
`includeAssets` entry already appears via the glob, delete the `includeAssets` block with a short
note in the commit. If some entry is *only* reachable via `includeAssets`, keep it and add a WHY
comment saying which and why — either outcome removes the ambiguity.

### [Maintainability] The webkit-smoke partition regex is declared twice in one file

**File(s):** `web/playwright.config.ts` (lines 91 and 101) @ 9ae62ff1

**Priority:** P5

#### Problem

The chromium project excludes and the webkit project matches the same file via two separately-typed
regex literals:

```ts
testIgnore: /webkit-smoke\.spec\.ts/,   // line 91
...
testMatch: /webkit-smoke\.spec\.ts/,    // line 101
```

These two literals *are* the partition invariant (webkit-smoke runs exactly once, under WebKit). If
the spec is renamed and only one regex follows, the failure is silent: either the file runs twice
(once under Chromium, wasted) or stops running under WebKit while `testIgnore` still hides it from
Chromium — the exact "quietly stop running" failure the `REQUIRE_WEBKIT` machinery elsewhere in this
file exists to prevent.

#### Proposed solution

`const WEBKIT_SMOKE_SPEC = /webkit-smoke\.spec\.ts/;` at module scope, referenced by both
`testIgnore` and `testMatch`. One-line change; the constant name also gives the partition a
greppable handle.

### [Maintainability] Manifest reuses identical PNGs for both `any` and `maskable` icon purposes

**File(s):** `web/static/site.webmanifest` (lines 7–32) @ 9ae62ff1

**Priority:** P5

#### Problem

Each size lists the same file twice, once per purpose:

```json
{ "src": "/web-app-manifest-192x192.png", ..., "purpose": "any" },
{ "src": "/web-app-manifest-192x192.png", ..., "purpose": "maskable" },
```

The two purposes have conflicting art requirements: a maskable icon needs its content inside the
~80% safe zone (Android crops the outer ring into circles/squircles), while an `any` icon should
fill the canvas. One bitmap cannot satisfy both — either the "S" gets clipped on masked launchers or
the unmasked icon looks undersized. This is a launcher-quality issue on the platform (Android) where
the PWA install path is most prominent.

#### Proposed solution

Generate a dedicated maskable variant (same art scaled to the safe zone over a filled background)
via the existing asset tooling and point the `maskable` entries at it (e.g.
`web-app-manifest-maskable-512x512.png`). Verify with Chrome DevTools' Application → Manifest
maskable preview. If the current art already happens to sit within the safe zone, the `any` entries
are the ones to revisit — either way the two purposes should stop sharing a file blindly.

## Source: Code audit — android + ios + fastlane — native shells

### [Correctness] Native shell chrome is hard-coded light while the app ships dark mode

**File(s):** `android/app/src/main/res/values/styles.xml` (lines 5–10) · `capacitor.config.json`
(lines 8–13) @ 9ae62ff1

**Priority:** P2

#### Problem

Version 1.4.0 shipped dark mode (see `fastlane/metadata/android/en-US/changelogs/6.txt`: "Dark mode
— Light, Dark, or follow your device"), and the launch assets were made dark-aware (Android has
`drawable-*-night*/splash.png` variants; iOS has `Default@*~universal~anyany-dark.png` splash
variants and a `systemBackgroundColor` launch screen). The native shells behind the WebView were
not:

`android/app/src/main/res/values/styles.xml:5`:

```xml
<style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
```

A hard-coded `Light` theme means every piece of native chrome that renders outside the web layer —
the window background behind the WebView, WebView-spawned dialogs (file chooser, JS alerts),
permission prompts on API 24–28 for `WRITE_EXTERNAL_STORAGE` — stays light for a child using the app
in dark mode. There is no `values-night/` variant anywhere under `android/app/src/main/res/`.

`capacitor.config.json:8–13` pins both platforms' WebView background to white:

```json
"android": {
  "backgroundColor": "#ffffff"
},
"ios": {
  "backgroundColor": "#ffffff",
  "contentInset": "always"
}
```

That color is what shows in dark mode wherever the web content hasn't painted: the gap between
splash dismissal and first web paint, and on iOS every rubber-band overscroll (made more likely by
`contentInset: "always"`, which insets the scroll view). A dark-theme user gets a white flash on a
canvas app whose whole surface is otherwise dark.

Additionally, the `AppTheme` items at lines 7–9 (`@color/colorPrimary`, `@color/colorPrimaryDark`,
`@color/colorAccent`) resolve to resources the app does not define — they come from the Capacitor
library's own `node_modules/@capacitor/android/capacitor/src/main/res/values/colors.xml`, where all
three are marked `tools:ignore="UnusedResources"` (template Indigo `#3F51B5` / Pink `#FF4081`). The
app's build silently depends on library-internal template resources that a Capacitor upgrade is free
to delete, and the values themselves are meaningless to Splotch's design.

#### Proposed solution

* Change `AppTheme`'s parent to `Theme.AppCompat.DayNight` (the action-bar variant is irrelevant —
  the launch theme replaces it and BridgeActivity shows no action bar), or keep `Light` only if a
  deliberate always-light decision exists — none is recorded.
* Drop the three `@color/color*` items (nothing in Splotch renders them) or, if any native widget
  chrome should be branded, define app-owned colors in `res/values/colors.xml` instead of leaning on
  Capacitor's internals.
* For the WebView background: Capacitor's `backgroundColor` is a single static value, so full dark
  support needs a native touch-up — on Android a `values-night` override is not possible for the
  config value, but `MainActivity` can set the WebView background from the resolved theme
  (`bridge.getWebView().setBackgroundColor(...)`); on iOS `MainViewController.capacitorDidLoad()`
  can set `webView.backgroundColor = UIColor.systemBackground` (dynamic). Alternatively accept the
  static color but document the tradeoff where the value is set.

Gotcha: verify on an API 24 device/emulator that a DayNight theme with the `Theme.SplashScreen`
launch theme still hands off cleanly (the launch theme at line 12 stays as-is; splash night variants
already exist).

### [Testing] Version numbers must agree across three files but have no at-rest drift guard

**File(s):** `android/app/build.gradle` (lines 28–29) · `ios/App/App.xcodeproj/project.pbxproj`
(lines 311, 318, 333, 340) · `package.json` (line 3) @ 9ae62ff1

**Priority:** P3

#### Problem

The same release identity lives in three places: `package.json:3` (`"version": "1.4.0"`),
`android/app/build.gradle:28–29` (`versionCode 6`, `versionName "1.4.0"`), and
`ios/App/App.xcodeproj/project.pbxproj` (`CURRENT_PROJECT_VERSION = 6;` at 311/333,
`MARKETING_VERSION = 1.4.0;` at 318/340). `scripts/release.mjs` (`bumpVersions`, lines 102–111)
writes all three in one transaction, and `android/CLAUDE.md` warns "Don't hand-edit
versionCode/versionName".

But the repo convention (root `CLAUDE.md`, "Cross-file agreement is never maintained by prose")
requires a drift-guard test when agreeing sites can't share code — exactly the situation here
(Groovy, pbxproj, JSON). The existing tests don't cover it: `scripts/tests/native-version.test.mjs`
reads both real files but only asserts the bump transforms are idempotent per file ("is
byte-identical when re-applying the committed version", lines 28–32 and 78–82) — it never compares
Android's committed version to iOS's or to `package.json`'s. A hand edit (or a partially applied
release script run, e.g. killed between `setAndroidVersion` and `setIosVersion`) desyncs the stores'
versions and nothing goes red until store submission.

#### Proposed solution

Add an at-rest agreement suite to `scripts/tests/native-version.test.mjs` (the file already loads
both real sources):

```js
describe('committed native versions agree', () => {
  it('android versionName === ios MARKETING_VERSION === package.json version', ...);
  it('android versionCode === ios CURRENT_PROJECT_VERSION', ...);
});
```

Parse with the same strict regexes the bump code uses (export them from
`scripts/lib/native-version.mjs` rather than duplicating). pbxproj carries each key twice (Debug +
Release); assert all occurrences are identical, not just the first match.

### [Maintainability] Dead Capacitor-template strings are not only kept but actively enforced

**File(s):** `android/app/src/main/res/values/strings.xml` (lines 4–6) ·
`scripts/check-native-app-id.mjs` (lines 71–75) @ 9ae62ff1

**Priority:** P3

#### Problem

`strings.xml:5–6` carries two Capacitor-template strings:

```xml
<string name="package_name">art.splotch.app</string>
<string name="custom_url_scheme">art.splotch.app</string>
```

Nothing in this app consumes them. Neither is referenced by `AndroidManifest.xml`, any Gradle file,
or `MainActivity.java`/`DeviceLockPlugin.java`, and `node_modules/@capacitor/android`'s Java sources
never read them — the only consumer in the whole dependency tree is the `@capacitor/app` plugin (per
its README), which is **not installed** (absent from `android/capacitor.settings.gradle` and
`ios/App/CapApp-SPM/Package.swift`).

Worse, they are actively maintained dead surface: `scripts/check-native-app-id.mjs:71–75` enforces
that both stay in sync with `capacitor.config.json`'s `appId`, so every future app-id change pays to
update strings nothing reads. This is the "no speculative surface" convention inverted — speculative
surface with its own drift guard.

Related template residue in the same file: `title_activity_main` (line 4) duplicates `app_name`
(line 3) verbatim; the `android:label` on the activity (`AndroidManifest.xml:17`) is redundant when
it equals the application label and can point at `@string/app_name` or be dropped, letting
`title_activity_main` go too.

#### Proposed solution

Delete `package_name`, `custom_url_scheme`, and `title_activity_main` from `strings.xml`; drop the
strings.xml entry from the `checks` array in `scripts/check-native-app-id.mjs`; change
`AndroidManifest.xml:17` to reference `@string/app_name` (or remove the attribute). Gotcha: if
`@capacitor/app` is ever installed for deep links, `custom_url_scheme` comes back with the
intent-filter that uses it — that future need doesn't justify carrying it now.

### [Maintainability] Native test scaffolding with zero native tests

**File(s):** `android/app/build.gradle` (lines 30, 61–63) · `android/variables.gradle` (lines 12–14)
@ 9ae62ff1

**Priority:** P3

#### Problem

`android/app/src/` contains only `main/` — there is no `test/` or `androidTest/` source set
anywhere, and the repo's native smoke testing is Maestro-based (per the `testing` skill). Yet the
Gradle setup declares the full instrumented-test template surface:

`android/app/build.gradle:30`:

```groovy
testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
```

`android/app/build.gradle:61–63`:

```groovy
testImplementation "junit:junit:$junitVersion"
androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
```

plus the three matching version pins in `android/variables.gradle:12–14` (`junitVersion`,
`androidxJunitVersion`, `androidxEspressoCoreVersion`). These resolve dependencies on every sync,
appear in dependency-health/Dependabot surface, and — per the "no speculative surface" convention —
advertise a native test tier that doesn't exist.

#### Proposed solution

Remove the three dependency lines, the `testInstrumentationRunner` line, and the three
`variables.gradle` entries. Gotcha: `variables.gradle`'s other entries (e.g.
`androidxAppCompatVersion`, `coreSplashScreenVersion`, `cordovaAndroidVersion`) are read by the
Capacitor/Cordova library builds — touch only the three test pins. If a native unit test ever lands,
the template is one `cap add`-style snippet away.

### [Maintainability] Android Studio template launcher art is dead — the adaptive icon uses PNGs instead

**File(s):** `android/app/src/main/res/values/ic_launcher_background.xml` (lines 1–3) ·
`android/app/src/main/res/drawable/ic_launcher_background.xml` (170 lines) ·
`android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` (34 lines) @ 9ae62ff1

**Priority:** P4

#### Problem

Both adaptive-icon descriptors (`mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`)
reference the **mipmap** PNG layers:

```xml
<background>
    <inset android:drawable="@mipmap/ic_launcher_background" android:inset="16.7%" />
</background>
<foreground>
    <inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16.7%" />
</foreground>
```

That leaves three Android Studio template files with no referrer anywhere in the tree:

* `values/ic_launcher_background.xml` — a `@color/ic_launcher_background` (#FFFFFF) nothing
  resolves,
* `drawable/ic_launcher_background.xml` — the 170-line teal-grid (#26A69A) template vector,
* `drawable-v24/ic_launcher_foreground.xml` — the template Android-robot foreground vector.

`shrinkResources` keeps them out of the shipped AAB, but in the repo they are misleading: a
first-time reader hunting for "where does the launcher art come from" finds two competing background
definitions and a robot vector before finding the real PNG pipeline.

#### Proposed solution

Delete all three files. Verify with a `bundleRelease` build (aapt will fail if anything unexpectedly
referenced them) and `grep -rn ic_launcher_background android/` afterwards.

### [Readability] AppDelegate carries dead template URL handlers and boilerplate comments

**File(s):** `ios/App/App/AppDelegate.swift` (lines 9–25) @ 9ae62ff1

**Priority:** P4

#### Problem

The app declares no `CFBundleURLTypes` in `Info.plist`, no associated domains, and does not install
`@capacitor/app` (the plugin whose deep-link events these proxy calls feed). Yet
`AppDelegate.swift:14–25` keeps both Capacitor template handlers:

```swift
func application(_ app: UIApplication, open url: URL, options: ...) -> Bool {
    // Called when the app was launched with a url. Feel free to add additional processing here,
    // but if you want the App API to support tracking app url opens, make sure to keep this call
    return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
}
```

plus `continue userActivity` (20–25) and the
`// Override point for customization after application launch.` comment (line 10). These are dead
code paths — nothing can invoke them without a URL scheme/universal link registration — and the
"Feel free to add…" comments violate the repo's no-comments-unless-WHY convention. The one genuinely
local addition in the file, `supportedInterfaceOrientationsFor` (lines 27–38), is excellent and gets
buried under the boilerplate.

#### Proposed solution

Delete `application(_:open:options:)`, `application(_:continue:restorationHandler:)`, and the
line-10 comment, leaving `didFinishLaunchingWithOptions` and the orientation handler. Optionally
modernize `@UIApplicationMain` (line 4) to `@main` while touching the file. Gotcha: if deep links
ever arrive, both handlers must return — note that in the commit message, not in a kept-just-in-case
handler.

### [Performance] Gradle build runs on template performance defaults (1.5 GB heap, no parallel/config cache, `-all` wrapper)

**File(s):** `android/gradle.properties` (lines 12, 17) ·
`android/gradle/wrapper/gradle-wrapper.properties` (line 3) @ 9ae62ff1

**Priority:** P4

#### Problem

Every `android:*` npm script funnels through this Gradle setup, and it still carries the stock
template tuning:

* `gradle.properties:12` — `org.gradle.jvmargs=-Xmx1536m`. With `minifyEnabled true` +
  `shrinkResources` + `android.r8.optimizedResourceShrinking=true` (lines 24–26), R8 runs a
  full-mode shrink of the app plus nine library subprojects in a 1.5 GB daemon; AGP 8.x guidance is
  2–4 GB, and undersized heaps show up as long GC pauses or `OutOfMemoryError` in `bundleRelease`.
* `gradle.properties:17` — `# org.gradle.parallel=true` is still commented out, though the build has
  10 decoupled subprojects (`:app` + capacitor + 8 plugin projects listed in
  `capacitor.settings.gradle`).
* No `org.gradle.configuration-cache=true` (Gradle 8.14 + AGP 8.13 support it), which is the biggest
  win for the repeated small invocations the dev loop makes.
* `gradle-wrapper.properties:3` pins `gradle-8.14.3-all.zip` — the `-all` distribution (sources +
  docs, for IDE navigation) is roughly double the `-bin` download, paid on every cold CI runner and
  fresh clone.

#### Proposed solution

Set `org.gradle.jvmargs=-Xmx4g` (or 2g if CI runners are tight), uncomment
`org.gradle.parallel=true`, add `org.gradle.configuration-cache=true`, and switch `distributionUrl`
to `gradle-8.14.3-bin.zip`. Gotchas: configuration cache can flag violations in third-party plugin
build scripts — run `bundleRelease` and the Maestro flow once with it on before committing; keep the
WHY comments per the repo's named-tuning-literal convention (the existing template prose comments at
lines 1–11 and 14–16 can be culled at the same time).

### [Maintainability] Gradle constructs deprecated in AGP 8 / removed in Gradle 9

**File(s):** `android/app/build.gradle` (lines 31–35) · `android/build.gradle` (lines 26–28) @
9ae62ff1

**Priority:** P4

#### Problem

Two template-era constructs generate deprecation warnings today and break on the next major
toolchain bump:

`android/app/build.gradle:31–35` — `aaptOptions` inside `defaultConfig`:

```groovy
aaptOptions {
     // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
    ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
}
```

`aaptOptions` is deprecated in AGP 8 in favor of `androidResources` (and slated for removal in AGP
9, which `gradle.properties:25–26` already anticipates for resource shrinking). Note also the
irregular indentation on the comment line and the template phrasing.

`android/build.gradle:26–28` — the `clean` task uses `rootProject.buildDir`:

```groovy
task clean(type: Delete) {
    delete rootProject.buildDir
}
```

`Project.getBuildDir()` is deprecated since Gradle 8.2 (use `layout.buildDirectory`); Gradle 9
removes it.

#### Proposed solution

Move the ignore pattern to `androidResources { ignoreAssetsPattern = '…' }` at the `android` block
level, and rewrite the clean task as
`tasks.register('clean', Delete) { delete rootProject.layout.buildDirectory }`. While there, drop
the pure-boilerplate comments in `android/build.gradle:1,12–13` ("Top-level build file where you can
add…") per the comment convention — the aapt pattern's WHY comment (with its source link) is worth
keeping, reformatted.

### [Readability] Release-signing gate re-tests `keystorePropsFile.exists()` at three sites

**File(s):** `android/app/build.gradle` (lines 5–9, 16–21, 39–41) @ 9ae62ff1

**Priority:** P4

#### Problem

The same condition is evaluated three times across 35 lines: line 7
(`if (keystorePropsFile.exists())` to load the props), line 16 (inside `signingConfigs.release` to
populate it), and line 39 (inside `buildTypes.release` to attach it). A reader must reconvince
themselves at each site that the three checks are the same gate — and the file's own comment (lines
3–4) is the only thing tying them together. The repo convention is a named identifier over prose.

#### Proposed solution

Name the gate once and branch on the name:

```groovy
def keystorePropsFile = rootProject.file("keystore.properties")
def releaseSigningConfigured = keystorePropsFile.exists()
```

then use `releaseSigningConfigured` at all three sites. Pure rename-and-reuse; no behavior change,
and the "unsigned when absent" comment can live on the declaration.

### [Testing] Android minSdk floor ↔ COMPATIBILITY.md agreement is maintained by prose

**File(s):** `android/variables.gradle` (line 2) · `scripts/tests/android-config.test.mjs` (lines
14–29) @ 9ae62ff1

**Priority:** P4

#### Problem

`docs/COMPATIBILITY.md` names `android/variables.gradle → minSdkVersion` as the authoritative source
of the "Android 7.0 / API 24+" support floor (its lines 18, 34–36, 52) and repeats "API 24" in
several risk-register rows. The iOS side of the same table got a real drift guard —
`web/src/browserFloor.test.ts` parses `IPHONEOS_DEPLOYMENT_TARGET` out of the pbxproj and compares
it against `BROWSER_TARGETS`. The Android side has none: `scripts/tests/android-config.test.mjs`
deliberately scopes its patterns to the *emulator* API level ("the API 24 minSdk floor … don't
false-positive", lines 22–24), so nothing fails if `minSdkVersion = 24` (`variables.gradle:2`) is
raised while COMPATIBILITY.md, the store listing floor, and the Maestro floor-run issues (\#483)
still say 24. Per the cross-file-agreement convention this is exactly the drift-guard-test case.

#### Proposed solution

Add a `describe('Android support floor single source')` block to `android-config.test.mjs`: parse
`minSdkVersion = (\d+)` from `android/variables.gradle`, and assert the contextual "API 24"/"Android
7.0 / API 24+" phrases in `docs/COMPATIBILITY.md` (and `.ruler/skills/mobile/android.md` if it
states the floor) match. Use the same allowlist + context-anchored-pattern approach the file already
established for the emulator level, so historical docs stay exempt.

### [Testing] The user-visible app name agrees across four files with no guard

**File(s):** `capacitor.config.json` (line 3) · `android/app/src/main/res/values/strings.xml`
(line 3) · `ios/App/App/Info.plist` (lines 9–10) @ 9ae62ff1

**Priority:** P5

#### Problem

"Splotch" as the installed-app display name is declared independently in `capacitor.config.json:3`
(`"appName"`), `strings.xml:3` (`app_name`), and `Info.plist:9–10` (`CFBundleDisplayName`).
`scripts/check-native-app-id.mjs` guards exactly this shape of agreement for the app **id** (appId ↔
gradle ↔ pbxproj ↔ docs) but never checks the app **name**, so a rename would have to find every
copy by hand — the same failure mode the id checker exists to prevent, one field over.

#### Proposed solution

Extend `check-native-app-id.mjs` (or a sibling check) with an `appName` pass:
`capacitor.config.json → appName` as the source, matched against `strings.xml`'s `app_name` and
`Info.plist`'s `CFBundleDisplayName`. The script's existing `checks` table structure takes this with
two more entries and a second expected value.

### [Readability] Info.plist mixes space and tab indentation

**File(s):** `ios/App/App/Info.plist` (lines 5–6, 9–10) @ 9ae62ff1

**Priority:** P5

#### Problem

The file is tab-indented throughout except two hand-edited spots: the `CAPACITOR_DEBUG` key at line
5 uses four spaces while its value at line 6 uses a tab, and `CFBundleDisplayName`'s value at line
10 is indented with eight spaces under a tab-indented key at line 9. Harmless to builds, but every
future diff of these lines shows spurious whitespace churn, and neither Prettier nor dprint owns
`.plist` files so nothing auto-fixes it.

#### Proposed solution

Normalize the four lines to tabs to match the rest of the file (Xcode's own convention for plists).
One-line-each mechanical fix.

### [Docs] Photo-library permission copy says "screenshot" for saving the drawing itself

**File(s):** `ios/App/App/Info.plist` (lines 29–30) @ 9ae62ff1

**Priority:** P5

#### Problem

```xml
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Splotch can save a screenshot of your drawing to your photo library.</string>
```

The save feature (via `@capacitor-community/media`) writes the drawing's exported image, not a
screen capture. "Screenshot" is the one word a parent reads in the iOS permission alert, and it
misdescribes the action — the store listing and changelogs consistently say "save your drawing".
Permission strings are also reviewed by App Review for accuracy.

#### Proposed solution

Reword to something like "Splotch saves your child's drawing to your photo library." No code change;
re-ships with the next release.

### [Maintainability] Pencil-eraser attach silently no-ops if the web view is missing

**File(s):** `ios/App/App/MainViewController.swift` (lines 13–19) @ 9ae62ff1

**Priority:** P5

#### Problem

```swift
override func capacitorDidLoad() {
    bridge?.registerPluginInstance(DeviceLockPlugin())
    bridge?.registerPluginInstance(pencilEraser)
    if let webView = bridge?.webView {
        pencilEraser.attach(to: webView)
    }
}
```

If `bridge` or `bridge?.webView` were ever nil at `capacitorDidLoad` (a Capacitor upgrade changing
lifecycle timing is the realistic path), Apple Pencil double-tap would silently stop working — no
log, no assertion, and the plugin still registers so the web side sees nothing wrong. The repo's
stated preference elsewhere (e.g. `native-version.mjs`'s "fail closed" transforms) is loud failure
over silent degradation.

#### Proposed solution

Make the impossible case loud in debug builds:

```swift
guard let webView = bridge?.webView else {
    assertionFailure("capacitorDidLoad without a webView — pencil eraser not attached")
    return
}
pencilEraser.attach(to: webView)
```

`assertionFailure` compiles out of Release, so shipping behavior is unchanged; only development
against a future Capacitor picks up the regression immediately.

## Source: Code audit — Root config + .github CI + .claude/.codex runtime config

### [Testing] Run the self-contained API-contract smoke (`test:api:smoke`) in CI

**File(s):** `.github/workflows/test.yml` (`test` job, lines 87–152); `package.json` (line 63,
scripts-info line 191) @ 9ae62ff1

**Priority:** P2

#### Problem

The repo has a purpose-built, dependency-free gate for the `/api/*` contract:

```json
"test:api:smoke": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/api-smoke.mjs",
```

whose own scripts-info description (package.json line 191) says it is "self-contained: boots a
throwaway vite dev with test env, exercises the CORS/preflight contract + the admin auth flow + a
public oracle against the documented /api/* shapes, tears down (no Gemini/Blobs needed)". Nothing in
`.github/workflows/test.yml` runs it — the `test` job runs `test:unit`, `test:asset-gen`,
`test:scripts`, `test:e2e`, and `test:driver:smoke` (lines 98–144), and no other workflow references
`api:smoke`/`api-smoke` (grep of `.github/` returns nothing). The driver smoke was added to CI at
lines 140–144 precisely because "the gen:* generators … never run elsewhere in CI, so this smoke
keeps that module from rotting silently" — the identical rationale applies to the API smoke, which
`.claude/rules/server-api.md` (lines 45–47) relies on developers remembering to run by hand after
endpoint changes. A CORS/auth/shape regression on `/api/*` currently ships with green CI and is only
caught post-deploy by `blobs-smoke.yml` (which tests one narrow thing: Blobs persistence).

#### Proposed solution

Add a step to the `test` job after the E2E run (it needs no browsers, so placement is flexible):

```yaml
# The /api/* contract (CORS, admin auth, oracle shapes) has no other CI
# coverage; self-contained — boots its own throwaway dev server.
- name: API contract smoke
  run: npm run test:api:smoke
```

Also consider folding it into `npm test` (package.json line 40) so the local composite matches; if
that is done, update the `test` scripts-info entry and CLAUDE.md's command table in `.ruler/` in the
same change. Gotcha: verify the throwaway vite dev server's port doesn't collide with the Playwright
`vite preview` server if steps ever run concurrently (they don't today — steps are sequential).

### [Correctness] `.codex/cloud/setup.sh` Node floor check drifts from `engines` and contradicts its own message

**File(s):** `.codex/cloud/setup.sh` (lines 27–33); `package.json` (line 6) @ 9ae62ff1

**Priority:** P3

#### Problem

The Codex setup script hardcodes a Node floor that disagrees with the repo's declared floor, and
implements a check that contradicts its own error message:

```bash
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 22 || minor < 12) {
    console.error(`Expected Node 22.12+; found ${process.version}.`);
    process.exit(1);
  }
' || warn "Node version check failed — expected Node 22.12+ (found $(node --version)). ..."
```

Two defects:

1. **Drift:** `package.json` `engines` says `"node": ">=22.13"` (line 6). The script checks
   `minor < 12`, so Node 22.12 — which npm's engines declaration rejects — passes the Codex check.
   (`docs/CLOUD/Codex.md` line 9 also says "22.12 or newer", so the stale value is mirrored in prose
   too.) This is exactly the "cross-file agreement maintained by prose" pattern CLAUDE.md calls a
   defect: three sites carry the floor, none imports it.
2. **Message mismatch:** `major !== 22` fails Node 23/24/25 outright, but the message claims
   "Expected Node 22.12+". If exact-major-22 is deliberate (to match the lockfile-authoring
   toolchain), the message should say "Node 22.x, at least 22.13"; if not, the check should be
   `major > 22 || (major === 22 && minor >= 13)`.

#### Proposed solution

Derive the floor from the single source of truth instead of restating it:

```bash
node -e '
  const floor = require("./package.json").engines.node.replace(/^\D*/, "");
  const [fMaj, fMin] = floor.split(".").map(Number);
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < fMaj || (maj === fMaj && min < fMin)) process.exit(1);
' || warn "Node $(node --version) is below the package.json engines floor ..."
```

Decide explicitly whether newer majors are acceptable in the Codex container and encode that
decision (with a WHY comment) rather than leaving it implied by `!==`. Update
`docs/CLOUD/Codex.md`'s "22.12" alongside. There is already a
`scripts/tests/claude-cloud-setup.test.mjs` harness pattern for exercising these cloud scripts with
stubbed binaries — a case pinning the check to `engines.node` would keep it from drifting again.

### [Maintainability] The supported Node floor (engines 22.13) is never exercised — CI hardcodes Node 24 with no tie to `engines`

**File(s):** `.github/actions/setup-node/action.yml` (line 19); `package.json` (lines 5–7);
`README.md` (line 39) @ 9ae62ff1

**Priority:** P3

#### Problem

The Node version is stated independently in at least four places with three different values:

* `package.json` engines: `"node": ">=22.13"` (line 6)
* `.github/actions/setup-node/action.yml`: `node-version: 24` (line 19) — every CI job (quality,
  tests, both deploy smokes, blobs smoke) runs on 24
* `README.md` line 39: "Node.js 22+ and npm" (22.0 does not satisfy engines)
* `.codex/cloud/setup.sh`: 22.12 (previous finding)

Meanwhile the production Netlify build pins no `NODE_VERSION` in `netlify.toml`, so it runs
Netlify's platform default (a 22.x LTS). Net effect: **CI validates the whole suite on Node 24, but
the deploy — and the declared minimum — run on 22.x, which CI never touches.** A dependency or
script using an API that exists in 24 but not in 22.13 (the `--experimental-strip-types` behavior
itself differs across these majors) goes green in CI and breaks only at deploy or on a floor-version
dev machine. There is no comment in `action.yml` explaining why 24 was chosen over the floor, and no
drift guard connecting any of these sites — the repo's own convention says cross-file agreement is
kept by an imported constant or a drift-guard test, never prose.

#### Proposed solution

Pick one deliberate policy and encode it:

* Cheapest: point CI at the floor via `node-version-file: package.json` (setup-node resolves
  `engines.node`), so CI always tests the version the repo promises to support, and bumping the
  floor is a one-line `engines` edit. If testing the latest major is also wanted, that's a matrix
  decision worth a comment.
* If staying on a hardcoded 24 (e.g. "test what developers actually run"), add the WHY comment in
  `action.yml` and a drift-guard case in `scripts/tests/workflow-hygiene.test.mjs` asserting
  `node-version` ≥ the `engines` floor, so a future engines bump can't silently overtake CI.

Fix `README.md`'s "Node.js 22+" to match `engines` (or reword to "the version in package.json
`engines`" so it can't drift again).

### [Docs] `.claude/rules/testing.md` misstates what `npm test` runs (omits `test:scripts`)

**File(s):** `.claude/rules/testing.md` (lines 22–23); `package.json` (line 40) @ 9ae62ff1

**Priority:** P3

#### Problem

The path-scoped testing rule — loaded into context whenever an agent edits any test file — says:

```markdown
* `npm test` = `test:unit` + `test:asset-gen` + `test:e2e`; the native smoke tests (`test:android`,
  `test:ios`) are deliberately excluded (need an emulator/simulator + native toolchain).
```

but `package.json` line 40 is:

```json
"test": "npm run test:unit && npm run test:asset-gen && npm run test:scripts && npm run test:e2e",
```

The `test:scripts` tier (repo-automation tests in `scripts/tests/` — including the very
workflow-hygiene, labels, and claude-permissions tests that guard this section's files) is missing
from the rule. CLAUDE.md's command table has the correct four-tier description, so the two
instruction surfaces disagree, and an agent following the rule may conclude `scripts/tests/` is not
part of `npm test` and skip running it. This is also an instance of the repo's own comment
convention violation: the rule restates a mutable composition owned by `package.json` instead of
naming the owner.

#### Proposed solution

Update line 22 to include `test:scripts` — or better, stop enumerating: "`npm test` runs every CI
tier (see the `test` entry in package.json `scripts-info`); the native smokes (`test:android`,
`test:ios`) are deliberately excluded…". The pointer form can't drift when a fifth tier is added.
`.claude/rules/` is edit-in-place (not ruler-generated), so this is a direct one-file fix.

### [Maintainability] ESLint keeps two `no-restricted-imports` blocks in sync by comment instead of a shared constant

**File(s):** `eslint.config.js` (lines 52–67 and 139–164) @ 9ae62ff1

**Priority:** P3

#### Problem

Because flat-config rule entries replace rather than merge, the repo-wide `playwright` import ban
must be restated inside the `web/src` runes-convention block. Today that agreement is maintained by
a pair of warning comments:

```js
// NOTE (flat-config gotcha): a later block that configures
// no-restricted-imports REPLACES this entry — the web/src conventions block below must
// carry the playwright path too.
```

and (line 137–138) "this block must restate the repo-wide playwright ban from the root block
alongside its own paths." The `paths` entry for `playwright` — name plus message string — is
duplicated verbatim at lines 60–65 and 156–160. CLAUDE.md is explicit that "a 'keep in sync with X'
comment marks a defect, not a mitigation": whoever edits the ban's message (or adds a second
repo-wide banned import) must remember to touch both blocks, and nothing fails if they don't — the
web/src tree silently loses (or diverges from) the repo-wide ban.

The same file has a smaller triplication: the three `rateLimit` `no-restricted-syntax` selectors
(lines 83–96) differ only in `arguments.0.type` (`Literal` / `TemplateLiteral` / `BinaryExpression`)
and repeat the identical message three times.

#### Proposed solution

Hoist the shared entries to module scope and spread them:

```js
const PLAYWRIGHT_IMPORT_BAN = {
  name: 'playwright',
  message: 'Import from @playwright/test — bare playwright is an undeclared transitive dependency.',
};
```

used as `paths: [PLAYWRIGHT_IMPORT_BAN]` in the root block and
`paths: [ {…svelte/store…}, {…onDestroy…}, PLAYWRIGHT_IMPORT_BAN ]` in the web/src block. The
flat-config-replaces gotcha comment stays (it explains WHY the constant appears twice), but the
value itself can no longer fork. For the rateLimit selectors:

```js
const RATE_LIMIT_KEY_ARG_TYPES = ['Literal', 'TemplateLiteral', 'BinaryExpression'];
...RATE_LIMIT_KEY_ARG_TYPES.map((type) => ({
  selector: `CallExpression[callee.name="rateLimit"][arguments.0.type="${type}"]`,
  message: 'Build rate-limit bucket keys via src/lib/server/rateLimitKeys.ts (ADR-0014 shared-bucket contract).',
})),
```

### [Correctness] `install-maestro` pipes an unpinned remote script to bash and never verifies the pin took effect

**File(s):** `.github/actions/install-maestro/action.yml` (lines 7–13) @ 9ae62ff1

**Priority:** P3

#### Problem

```yaml
- name: Install Maestro CLI
  shell: bash
  env:
    MAESTRO_VERSION: 2.4.0
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

This is the one place in `.github/` that executes remote code without a pin: every external action
is SHA-pinned (and `scripts/tests/workflow-hygiene.test.mjs` enforces exactly that, rejecting any
`uses:` ref not ending in a 40-char SHA), yet whatever `get.maestro.mobile.dev` serves at run time
executes verbatim on the runner. The `MAESTRO_VERSION` env var pins the CLI *only if* the remote
script continues to honor that variable — if upstream renames it, the step silently installs latest,
and the action's own description ("Install the pinned Maestro CLI version") becomes false with no
failing signal. Both release-tag deploy smokes (`android-deploy.yml` line 55, `ios-deploy.yml`
line 32) depend on it at the most sensitive moment in the pipeline.

#### Proposed solution

Two independent, cheap hardenings:

1. **Assert the pin took:** after install, fail loudly on drift —
   ```bash
   installed="$("$HOME"/.maestro/bin/maestro --version 2>/dev/null | head -1)"
   [[ "$installed" == *"$MAESTRO_VERSION"* ]] || { echo "::error::Maestro $installed != pinned $MAESTRO_VERSION"; exit 1; }
   ```
2. Optionally, fetch the install script from Maestro's GitHub repo at a tagged ref (or vendor the
   ~30-line script into `.github/actions/install-maestro/`) so the executed bytes are pinned the
   same way every `uses:` ref already is.

Tradeoff: vendoring means occasionally refreshing the script; the version assertion alone converts
"silently wrong version" into a red job, which is most of the value.

### [Testing] The `scripts` ↔ `scripts-info` contract (ADR-0019) has no drift guard

**File(s):** `package.json` (lines 8–135 vs 136–263) @ 9ae62ff1

**Priority:** P3

#### Problem

CLAUDE.md's command section states the contract: "every new or renamed script gets a matching
one-line entry in the `scripts-info` block". With 126 scripts and 126 descriptions maintained as two
parallel JSON objects, that agreement is currently kept purely by discipline — nothing fails when a
script is added without a description or a description is orphaned by a rename. (Today the key sets
happen to match exactly; the *ordering* has already drifted — first divergence at index 68,
`gen:shots` vs `gen:style-covers` — showing the two blocks are in fact edited independently.) The
repo convention says exactly this situation gets a drift-guard test, and `scripts/tests/` already
hosts the analogous guards (`workflow-hygiene.test.mjs`, `labels.test.mjs`,
`claude-permissions.test.mjs`).

#### Proposed solution

Add `scripts/tests/scripts-info.test.mjs` (runs under the existing `test:scripts` tier):

```js
const { scripts, 'scripts-info': info } = JSON.parse(readFileSync(pkgPath, 'utf8'));
it('every script has a scripts-info entry', () =>
  expect(Object.keys(scripts).filter((k) => !(k in info))).toEqual([]));
it('every scripts-info entry has a script', () =>
  expect(Object.keys(info).filter((k) => !(k in scripts))).toEqual([]));
```

Optionally assert matching key order so the two blocks read in parallel; that's a style choice — the
presence checks are the load-bearing part.

### [Correctness] `format-edited-file.sh` breaks its "non-blocking by design" promise when `jq` is absent

**File(s):** `.claude/hooks/format-edited-file.sh` (lines 2, 21) @ 9ae62ff1

**Priority:** P4

#### Problem

The header (lines 18–19) promises: "Non-blocking by design … any formatter error is swallowed and we
exit 0." But the script runs under `set -euo pipefail` (line 2) and its very first operation is an
unguarded `jq`:

```bash
file="$(jq -r '.tool_input.file_path // empty')"
```

Only the *formatter* invocations are wrapped in `|| true` (lines 27–28). On a machine without `jq`
(stock macOS ships none), `set -e` aborts at line 21 with a non-zero exit, so **every single
Edit/Write in a session surfaces a PostToolUse hook failure** — the exact nagging the design note
says must not happen. The sibling hook `precompact-burndown-snapshot.sh` already models the correct
posture: it checks `command -v jq` before using it (line 71) and defaults gracefully.

#### Proposed solution

Guard the dependency the same way the sibling does:

```bash
command -v jq >/dev/null 2>&1 || exit 0
file="$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
```

(Exiting 0 silently on a jq-less machine means edits go unformatted there — acceptable, since
`npm run format:check`/CI still catch it, and that degradation is strictly better than failing every
tool call. A one-time stderr hint could be added if silent skipping feels too quiet.)

### [Maintainability] `--experimental-strip-types --disable-warning=ExperimentalWarning` is copy-pasted into 16 npm scripts

**File(s):** `package.json` (lines 20, 25, 63, 69–71, 74–80, 87–88, 93) @ 9ae62ff1

**Priority:** P4

#### Problem

Sixteen scripts repeat the identical flag pair
`node --experimental-strip-types --disable-warning=ExperimentalWarning …` verbatim. Any change —
Node making strip-types default (it is unflagged from 23.6, so an engines bump to ≥23.6/24 makes the
whole pair deletable), a new required flag, or a rename — is a 16-site edit with nothing guarding
consistency; a script added with only one of the two flags would work but spam the
ExperimentalWarning. This is the tuning-literal/duplication pattern the conventions call out,
applied to a CLI incantation instead of a number.

#### Proposed solution

Two options, in preference order:

1. **Make it obsolete:** when the engines floor next moves to ≥23.6 (CI already runs 24), delete the
   flags in one sweep — worth a note on the engines line or an issue so the cleanup isn't forgotten.
2. **Single-source it now:** a 3-line launcher `scripts/node-ts.mjs` that re-spawns
   `node --experimental-strip-types --disable-warning=ExperimentalWarning <args>` (or exports the
   flags via `NODE_OPTIONS`), so scripts read
   `"check:assets": "node scripts/node-ts.mjs scripts/check-assets.mjs"`. Tradeoff: one more process
   hop per invocation and a slightly less transparent command line — which is why option 1 is
   preferable if the floor bump is near.

### [Maintainability] `dev:kill` executes `kill-port` via bare `npx` — an undeclared, unpinned dependency fetched at run time

**File(s):** `package.json` (line 16) @ 9ae62ff1

**Priority:** P4

#### Problem

```json
"dev:kill": "npx kill-port 5173 8888",
```

`kill-port` is not in `devDependencies` (only `tree-kill` exists in `node_modules/.bin`), so `npx`
resolves it from the registry on each first use: the script needs network to run (it exists
precisely for when the local environment is wedged), executes whatever version is `latest` that day,
and is exposed to registry-side supply-chain swaps. The repo's own ESLint config bans the bare
`playwright` import specifically because "bare playwright is an undeclared transitive dependency"
(eslint.config.js lines 60–65) — the same principle applies to tooling invoked from scripts.

#### Proposed solution

Either pin it as a devDependency (`"kill-port": "^2"`) so `npx` resolves the local, locked copy — or
drop the dependency entirely with a tiny Node helper in `scripts/` (consistent with ADR-0017's
"platform-specific tools are invoked via Node helpers"): find the PID listening on 5173/8888 via
`lsof -ti :5173` / reading `/proc` and `process.kill` it. The helper route also removes the one
remaining scripted network dependency for a purely local operation.

### [Maintainability] `prebuild` and `prebuild:cap` duplicate the same three-step pipeline

**File(s):** `package.json` (lines 17, 19) @ 9ae62ff1

**Priority:** P4

#### Problem

```json
"prebuild": "node scripts/web.mjs svelte-kit sync && npm run gen:icons && npm run gen:releases",
...
"prebuild:cap": "node scripts/web.mjs svelte-kit sync && npm run gen:icons && npm run gen:releases",
```

Two identical command strings. When the pre-build pipeline gains a step (as it already has —
`gen:icons`, then `gen:releases` were threaded through both), each edit must be made twice, and a
missed one silently diverges the web and native builds' generated inputs — the kind of drift the
asset/config drift guards elsewhere in this repo exist to prevent, with no guard here.

#### Proposed solution

Delegate one to the other: `"prebuild:cap": "npm run prebuild"`. Note the subtlety worth a
scripts-info sentence: `npm run prebuild` does *not* recursively trigger `prebuild`'s own pre-hook
(there is none for `prebuild` itself), so the delegation is safe. Alternatively extract a
`build:prep` script both pre-hooks call, which reads more explicitly.

### [Maintainability] `tools/asset-gen` `no-undef` re-enable is weakened by inherited browser globals

**File(s):** `eslint.config.js` (lines 30–33, 126–134) @ 9ae62ff1

**Priority:** P4

#### Problem

The root block sets `globals: { ...globals.browser, ...globals.node }` for every file (line 32). The
`tools/asset-gen/**/*.mjs` block then re-enables `no-undef` specifically so "a used-but-unimported
binding … fails lint instead of throwing ReferenceError only at CLI runtime" (lines 127–133). But
because the block inherits the merged globals, all browser globals are "defined" in these Node-only
CLIs: a stray `document`, `window`, `fetch`-adjacent DOM name, or the classic footguns `name`,
`status`, `length`, `open`, `close`, `top` (all `window` properties in `globals.browser`) pass
`no-undef` and still throw `ReferenceError` at runtime — the exact failure class the block exists to
catch, through the exact hole it re-opened.

#### Proposed solution

Give the Node-CLI block its own `languageOptions`:

```js
{
  files: ['tools/asset-gen/**/*.mjs'],
  languageOptions: { globals: globals.node },
  rules: { 'no-undef': 'error' },
},
```

(Flat config merges `languageOptions.globals` per-block, later blocks winning, so this narrows the
vocabulary for just these files.) Consider the same treatment for `scripts/**/*.mjs` if `no-undef`
is ever enabled there. Run `npm run lint` after — any current hit is a live latent bug, which is the
point.

### [Readability] `.gitignore` carries ~70 lines of dead template boilerplate with hazardous unanchored patterns

**File(s):** `.gitignore` (lines 26–147, especially 42–59, 87–135, 140–147, and 91–97) @ 9ae62ff1

**Priority:** P4

#### Problem

Roughly half the file is the stock GitHub Node template for tools this repo will never use: Grunt
(43), Bower (45–46), node-waf (48–49), Snowpack (58–59), parcel (87–89), Next.js (91–93), Nuxt
(95–97), Gatsby (99–102), vuepress (104–108), vitepress (113–117), Docusaurus (119–120),
Serverless/FuseBox/DynamoDB/Firebase/TernJS (122–135), yarn v3/pnp (140–147), jscoverage (32–33),
lerna logs (21). Beyond noise, several template patterns are unanchored and over-broad in ways that
have already bitten or can bite:

* `build/` (line 162) required three `!` exceptions (165–167) just to keep the `build` skill
  packages tracked — a cost paid because the blanket pattern stayed.
* `dist` (97) and `out` (93) ignore **any** directory of that name anywhere in the tree; a future
  `tools/*/dist` or `web/out` output intended for commit would silently vanish from `git status`.
* `.cache` (88) and `.temp` (108) are similarly global.

Every real, repo-specific entry in this file carries a WHY comment (the top and bottom thirds are
exemplary); the dead middle is the opposite.

#### Proposed solution

Prune to what the repo actually produces: keep Node/npm basics (`node_modules/`, logs, `.env*`,
`*.tsbuildinfo`, caches actually generated), the SvelteKit/Vite/PWA entries, and every commented
repo-specific block; delete the framework boilerplate. For the survivors that are genuinely wanted,
anchor them (`/dist/` → not needed at all here; `web/build/` etc. are already covered by the
specific entries). Verify with `git status --ignored` before/after that no currently-ignored,
actually-present path changes state. One-time cost, permanent readability gain for a file agents and
humans consult when debugging "why isn't this file showing up".

### [Maintainability] The npm-11 lockfile-dialect requirement is enforced in three cloud scripts but not declared in `engines`

**File(s):** `package.json` (lines 5–7); `.claude/cloud/setup.sh` (lines 27–32);
`.codex/cloud/setup.sh` (lines 37–42); `.codex/cloud/maintenance.sh` (lines 29–31) @ 9ae62ff1

**Priority:** P4

#### Problem

Three separate cloud-environment scripts each pin `npm@11` with the same rationale ("a mismatched
npm rewrites lockfile metadata in its own dialect and dirties the tree", per
`.claude/cloud/setup.sh` lines 27–29 and docs/CLOUD notes), and `session-start.sh` carries
discard-the-churn recovery logic for when the pin is missing. Yet `package.json` declares only
`"engines": { "node": ">=22.13" }` — no `npm` entry. A local contributor (or a fourth environment)
on npm 10 or 12 gets zero signal before `npm install` rewrites `package-lock.json`, hitting the
exact known failure the three scripts exist to prevent. The knowledge lives only in scripts and
prose.

#### Proposed solution

Declare it once where every npm reads it:

```json
"engines": { "node": ">=22.13", "npm": "^11" }
```

npm prints an `EBADENGINE` warning on mismatch by default (hard failure only with `engine-strict`),
which is exactly the right strength: a visible nudge, not a wall. The cloud scripts keep their pins
(they *fix* the version; engines only warns), but their comments can then point at the engines field
as the canonical statement of the requirement.

### [Docs] `knip.json` `$schema` points at the knip v5 schema while knip v6 is installed

**File(s):** `knip.json` (line 2); `package.json` (line 282) @ 9ae62ff1

**Priority:** P5

#### Problem

```json
"$schema": "https://unpkg.com/knip@5/schema.json",
```

but the installed tool is `knip@6.29.0` (devDependencies line 282; confirmed in `node_modules`).
Editor validation/completion for this config is checked against a major-old schema — options added
or changed in v6 will be flagged as unknown (or missing options not flagged), which is quietly
misleading in the one file whose purpose is tooling precision.

#### Proposed solution

Point at the installed major: `"$schema": "https://unpkg.com/knip@6/schema.json"`. Worth a one-line
check in the next dependency-update pass so the schema ref rides along with future knip majors
(Dependabot bumps the package but not this string).

### [Readability] `package.json` script blocks interleave: `perf:*` splits the `test` tier list, and `scripts-info` ordering has drifted

**File(s):** `package.json` (lines 40–65; scripts-info lines 168–199) @ 9ae62ff1

**Priority:** P5

#### Problem

The composite `"test"` (line 40) is followed by ten `perf:*` scripts (lines 41–50) before its own
constituent tiers `test:unit` … `test:driver:smoke` (lines 51–65) appear — a reader scanning for
what `npm test` runs has to jump over the perf block. ADR-0019's `namespace:variant` naming implies
namespace grouping; this is the one spot where the grouping breaks. Separately, `scripts-info` no
longer mirrors `scripts` order (first divergence at index 68: `gen:shots` vs `gen:style-covers`),
confirming the two blocks are edited independently.

#### Proposed solution

Move the `perf:*` block below `test:driver:smoke` (or above `test`), and re-order the `gen:*` region
of `scripts-info` to match `scripts`. Pure moves, zero behavior change. If the drift-guard test from
the earlier finding adopts an order assertion, that keeps this fixed permanently; otherwise it's a
cheap tidy-up while touching the file.

### [Docs] `label-sync.yml` header comment states the skip-delete behavior three times in one run-on sentence

**File(s):** `.github/workflows/label-sync.yml` (lines 7–8) @ 9ae62ff1

**Priority:** P5

#### Problem

```yaml
# Deliberately NOT pruning by default (skip-delete) so a hand-made label isn't
# wiped by accident — normal runs apply changes (dry-run: false) but do not prune hand-made labels (skip-delete: true); set skip-delete to false for a full reconciliation.
```

Line 8 restates "not pruning / skip-delete / hand-made labels" twice more after line 7 already said
it, in a single unwrapped ~160-char line (every other comment in this file wraps at ~80). It reads
like a merge of two draft sentences.

#### Proposed solution

Collapse to one wrapped statement, e.g.:

```yaml
# Deliberately NOT pruning (skip-delete: true) so a hand-made label isn't wiped
# by accident; runs still apply creates/updates (dry-run: false). Set
# skip-delete to false for a full reconciliation.
```

### [DX] `.claude/cloud/setup.sh` never `cd`s to the project dir, unlike its Codex siblings

**File(s):** `.claude/cloud/setup.sh` (lines 12, 42); `.codex/cloud/setup.sh` (line 12) @ 9ae62ff1

**Priority:** P5

#### Problem

Both Codex cloud scripts open with `cd "${CODEX_PROJECT_DIR:-$PWD}"`, but the Claude setup script
assumes it is already at the repo root: line 42 reads `./package.json` relative to whatever cwd the
environment dialog invoked it from. If the dialog's one-liner (`bash .claude/cloud/setup.sh`) ever
runs from elsewhere — or the invocation convention changes — the Playwright version derivation fails
and the browser install is skipped with only a warning banner, the exact "#1 cloud-session E2E
failure" the derivation comment (lines 36–41) exists to prevent. The failure is graceful but
avoidable.

#### Proposed solution

Mirror the sibling scripts' first line, using whichever project-dir variable Claude's environment
provides (`cd "${CLAUDE_PROJECT_DIR:-$PWD}"` degrades to today's behavior when unset). One line, and
the three cloud scripts then share the same defensive shape —
`scripts/tests/claude-cloud-setup.test.mjs` already exercises this script and can pin the
cwd-independence with a fixture run from a temp dir.

### [Maintainability] Personal device serial and simulator UDIDs are hardcoded into shared npm scripts

**File(s):** `package.json` (lines 109, 116–117; scripts-info lines 237, 244–245) @ 9ae62ff1

**Priority:** P5

#### Problem

```json
"android:run:device": "npm run cap:sync && ANDROID_SERIAL=R5CY128YMGF node scripts/gradle.mjs :app:installDebug",
"ios:run:emulator": "npm run cap:sync && cap run ios --target C6012C49-AA93-4869-B3A6-E47C9EAAC567",
"ios:run:device": "npm run cap:sync && cap run ios --target 00008103-0006202E3CF1001E",
```

One maintainer's physical-phone serial and machine-local simulator/device UDIDs are baked into the
shared `package.json` (the scripts-info entries even name "Kyle's iPad"). Simulator UDIDs are
per-Mac — `ios:run:emulator` cannot work on any other machine (or after a simulator reset on the
same machine), and any contributor must edit tracked `package.json` (risking committing their own
IDs) to use these scripts. The generic fallbacks (`ios:run` prompts; `adb:devices` discovers) exist
right beside them, so the hardcoded variants are convenience aliases for exactly one environment.

#### Proposed solution

Make the target an env override with a documented default, e.g.
`"ios:run:device": "npm run cap:sync && cap run ios --target ${IOS_DEVICE_UDID:?set IOS_DEVICE_UDID (see mobile skill)}"`
(inline env expansion needs a `sh -c` wrapper or a small Node helper per ADR-0017 — a
`scripts/cap-run-target.mjs` reading the var keeps it cross-platform), with personal values in an
untracked `.env`/shell profile. Low urgency for a solo repo — but these are the only
machine-specific literals in an otherwise machine-portable script surface.

## Source: Code audit — docs — ADRs & guides (+ scrapbook/store-assets/releases prose)

### [Docs] Two distinct Active ADRs share the number 0077 — the "immutable number" invariant is broken and every `ADR-0077` reference is ambiguous

**File(s):** `docs/adrs/0077-dependabot-claude-review-workflow.md` (whole file),
`docs/adrs/0077-three-phase-release-verified-artifact-publish.md` (whole file),
`docs/adrs/README.md` (lines 130, 140) @ 9ae62ff1

**Priority:** P1

#### Problem

Two unrelated ADRs carry the same number:

* `docs/adrs/0077-three-phase-release-verified-artifact-publish.md` — "ADR-0077: Three-Phase
  Shipping (Release → Build → Publish)…", created in 1112776 (2026-07-28 13:11 UTC).
* `docs/adrs/0077-dependabot-claude-review-workflow.md` — "ADR-0077: Auto-Review Dependabot PRs with
  Claude…", created in 718dd72 (2026-07-28 13:15 UTC), four minutes later — evidently two parallel
  sessions each took "next number".

`docs/adrs/README.md` states the numbering contract at lines 7–8: "ADR numbers and filenames are
**immutable** — records are never renumbered, deleted, or rewritten once superseded." A duplicated
number breaks the premise that makes immutability workable (a number uniquely names a record
forever). The index itself lists "0077" twice — line 130 (Build & tooling) and line 140 (Agent
workflow & docs).

The ambiguity is already live in prose references that use the bare number:

* `docs/DEPENDABOT.md:6` — "[ADR-0077](adrs/0077-dependabot-claude-review-workflow.md)" (means the
  Dependabot one).
* `releases/README.md:43` — "three ordered phases — release, build, publish (ADR-0077)" (means the
  release one).
* `.ruler/skills/release/SKILL.md:64`, `.ruler/skills/build/SKILL.md:17`,
  `.ruler/skills/publish-artifacts/SKILL.md:19`, `.ruler/skills/skills-guide/SKILL.md:94` — all
  "ADR-0077" meaning the release one.
* Both ADR bodies self-identify as "ADR-0077" in their `# ADR-0077:` H1s.

Any future "see ADR-0077" without a path is a coin flip, and the collision compounds as more
references accrete.

#### Proposed solution

Renumber the later-created record (`0077-dependabot-claude-review-workflow.md` →
`0078-dependabot-claude-review-workflow.md`), update its H1 to `ADR-0078`, and fix the references
that point at it (`docs/DEPENDABOT.md:6` and the index row at `docs/adrs/README.md:140`). The
release-flow ADR keeps 0077, so the five skill references and `releases/README.md:43` stay correct
untouched. This is the one legitimate exception to "never renumbered": the invariant being repaired
is precisely the uniqueness the rule exists to protect, and the collision is hours old with only one
prose link to move. Also worth a line in the `create-adr` skill (out of this section's scope, so
just flag it): "take the number from the highest existing file *and check for an unmerged sibling PR
claiming it*", since parallel sessions are how this happened.

### [Correctness] CONTRIBUTING.md documents three server env vars under names the code never reads

**File(s):** `docs/CONTRIBUTING.md` (lines 60–66, env-var table) @ 9ae62ff1

**Priority:** P1

#### Problem

The environment-variable table tells a contributor/operator:

```
| `AI_ACCESS_TOKENS`          | Netlify env   | Comma-separated list of valid AI invite tokens (server-only)          |
| `ADMIN_PASSWORD`            | Netlify env   | Password for the `/admin` token console (server-only)                 |
| `GOOGLE_API_KEY`            | Netlify env   | Gemini API key for the hosted image generation endpoint (server-only) |
```

None of those names exist anywhere in the codebase. The server reads:

* `ALLOWED_TOKENS_LIST` — `web/src/lib/server/tokens.ts:37`
  (`const raw = env.ALLOWED_TOKENS_LIST || ''`), the env-seeded token allowlist (ADR-0025).
* `ADMIN_ACCESS_TOKEN` — `web/src/lib/server/admin.ts:28` and `:46`, the admin secret (also the HMAC
  key, ADR-0016).
* `GEMINI_API_KEY` — `web/src/lib/server/config.ts:4` (`geminiApiKey: () => env.GEMINI_API_KEY`);
  `generationAuthorization.ts:41` even errors with the literal message "Server is missing
  GEMINI_API_KEY".

Someone following this doc to configure a Netlify site (or a local `netlify dev` env) would set
three variables that do nothing: the AI endpoint would 500 with "Server is missing GEMINI_API_KEY",
admin login would be unconfigured, and the token allowlist empty — with the doc actively pointing
away from the fix. The table is also incomplete: it omits `GITHUB_ISSUE_TOKEN` / `GITHUB_ISSUE_REPO`
(feedback endpoint, `web/src/lib/server/config.ts:5–6`, ADR-0060) and `REDTEAM_FIXTURE_KEY`
(ADR-0023, local-only). Note the sibling docs get this right — `docs/CLOUD/Codex.md:16` names
`GEMINI_API_KEY`, `ADMIN_ACCESS_TOKEN`, and `ALLOWED_TOKENS_LIST` — so CONTRIBUTING.md contradicts
them too.

#### Proposed solution

Replace the three rows with the real names (`ALLOWED_TOKENS_LIST`, `ADMIN_ACCESS_TOKEN`,
`GEMINI_API_KEY`) and add rows for `GITHUB_ISSUE_TOKEN` / `GITHUB_ISSUE_REPO` (Netlify env, feedback
issue proxy — ADR-0060) and optionally `REDTEAM_FIXTURE_KEY` (local `.env`, red-team corpus —
ADR-0023). Per the repo's cross-file-agreement convention, consider noting in the table that the
authoritative reader is `web/src/lib/server/config.ts` / `tokens.ts` / `admin.ts` so future renames
have one obvious sync target.

### [Docs] DEPENDENCIES.md still inventories two dependencies that were removed from the repo — one with a claimed usage site that was never true

**File(s):** `docs/DEPENDENCIES.md` (lines 9, 19, 29, 68–75, 109, 175–190, 533–546, 944) @ 9ae62ff1

**Priority:** P2

#### Problem

The dependency-health inventory ("Last refresh: 2026-07-17 at `e2812b3`", line 9) predates two
removals and now misdescribes the dependency set:

* **`@capacitor/filesystem`** — verdict-summary row at line 29 (`prod | keep`), listed as an
  alternative "already a dep" at line 109, full section at lines 175–190 with verdict "keep —
  official plugin; healthy". The package was removed from `package.json` in c5ba3746 ("chore(deps):
  drop the unused @capacitor/filesystem plugin", 2026-07-28, on `main`);
  `grep "@capacitor/filesystem" package.json` returns nothing. Worse, line 178–179's usage claim —
  "Used in `web/src/lib/drawing/folderSave.ts` and related" — was false even at refresh time:
  `folderSave.ts` uses the browser File System Access API (ADR-0037), and the removal commit
  confirms "nothing in web/src imports it".
* **`capacitor-set-version`** — verdict-summary row at line 19 (`dev | investigate replacement`),
  backlog note at lines 68–75 (issue \#332), full section at lines 533+, and the "Phase 3 note" at
  line 944. It was replaced by an in-repo helper in 9a47e2b ("Replace archived capacitor-set-version
  with an in-repo version helper", 2026-07-22) — `scripts/release.mjs` now calls
  `setAndroidVersion`/`setIosVersion` (lines 102–107) and the package is gone from `package.json`.

The doc's header does frame external facts as dated snapshots, but the *inventory membership* is
presented as current ("18 prod + 30 dev direct"), and the burndown reviewer for the filesystem
finding explicitly flagged these rows as needing an update when the removal landed (recorded in
`docs/AUDIT-DEFERRED.md:103–105`). That owed update never happened.

#### Proposed solution

Either re-run `/dependency-health-audit` (the doc says it is "refreshed in place") or make a
targeted edit: delete the two package sections and their verdict rows, update the "18 prod + 30 dev"
counts at line 9, mark the \#332 backlog item resolved (replaced in 9a47e2b), and fix or drop the
false `folderSave.ts` usage claim. A full refresh is preferable since the 2026-07-17 health facts
(stars, latest versions) are also 11 days old.

### [Docs] Stale handoff packet: `audit-burndown-236.md` outlived its merged PR and drained backlog, violating the handoff lifecycle it sits next to

**File(s):** `docs/handoff/audit-burndown-236.md` (whole file, lines 1–207) @ 9ae62ff1

**Priority:** P2

#### Problem

`docs/handoff/CLAUDE.md` (lines 58–66) defines the lifecycle: "`resume-handoff` consumes then
deletes it… **Prune stale handoffs.** If a handoff's PR merged or its work is abandoned, delete the
file — don't let the folder accumulate dead packets." This packet's world no longer exists:

* Its PR — \#552, `claude/burn-down-audit-skill-hidj17` — merged in ced5523.
* Its objective ("Resume the bulk burndown of `docs/AUDIT.md` — 236 → 183 done") is complete:
  `docs/AUDIT.md` no longer exists (the backlog was fully drained; `docs/AUDIT-LOG.md` lines 21–27
  record the follow-on 2026-07-27/28 burndown and triage runs that finished the job).
* Its "Relaunch command — use this verbatim" (lines 38–42) targets a merged branch, and its owed
  follow-ups are themselves stale — e.g. lines 184–186 cite `build-review.mjs:121`/`:212`, a file
  that no longer exists under `scripts/audit-burndown/` (current contents: `agent-runner.mjs`,
  `backfill-comments.mjs`, `burndown.mjs`, …).

A future session listing open handoffs (the documented `resume-handoff` entry path) would surface
this as apparently-resumable in-flight work and could re-launch a burndown against an empty backlog
on a dead branch.

#### Proposed solution

Delete `docs/handoff/audit-burndown-236.md` and commit the deletion, per the conventions in the
sibling `CLAUDE.md`. Before deleting, skim the "Owed follow-ups" section for anything still live and
file each as a GitHub issue if not already tracked (the mislabelled `docs/AUDIT-DEFERRED.md`
deferral it names was already handled by the 2026-07-27/28 triage passes; the device-run
verifications of b1f32762/e0b9e7b2/d685bdca may still be worth an issue).

### [Docs] ADR-0020 and ADR-0030 still credit `capacitor-set-version` with native version syncing — replaced by in-repo helpers a week before the release-flow ADR was written

**File(s):** `docs/adrs/0020-ios-build-toolchain.md` (lines 50–52),
`docs/adrs/0030-git-derived-web-version.md` (lines 36–37) @ 9ae62ff1

**Priority:** P3

#### Problem

Both Active ADRs state the mechanism as current fact:

* `0020-ios-build-toolchain.md:50–52`: "Version numbers are not managed in Xcode:
  `scripts/release.mjs` sets `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` via
  `capacitor-set-version`, keeping them locked to Android's `versionName`/`versionCode`."
* `0030-git-derived-web-version.md:36–37`: "Store submissions need deliberate numbers;
  `capacitor-set-version` keeps Android/iOS in sync from the same source."

The package was removed in 9a47e2b (2026-07-22, "Replace archived capacitor-set-version with an
in-repo version helper"); `scripts/release.mjs` now calls in-repo `setAndroidVersion(ROOT, …)` /
`setIosVersion(ROOT, …)` (lines 103–107), hardened further in 8dbad416 (line-based, fail-closed
bumpers). This repo's ADR culture is to amend records when a stated mechanism changes (ADR-0004,
-0015, -0032 all carry `## Amendment` sections; ADR-0029's Status line notes the removed
`postinstall`), so these two are drifted, not deliberately frozen. A reader of ADR-0020 deciding how
iOS versions are managed would go looking for a dependency that isn't installed.

#### Proposed solution

Add a one-line amendment note to each Status header, following the ADR-0029 pattern — e.g. ADR-0020:
"Amended 2026-07-22: `capacitor-set-version` (archived upstream) was replaced by in-repo line-based
bumpers in `scripts/release.mjs` (`setAndroidVersion`/`setIosVersion`); the
versions-locked-to-Android invariant is unchanged." Mirror the same sentence in ADR-0030's Decision
bullet. No renumbering, no body rewrite.

### [Docs] CONTRIBUTING.md "Release process" predates the three-phase model — it describes exactly the flow ADR-0077 was written to kill

**File(s):** `docs/CONTRIBUTING.md` (lines 199–202) @ 9ae62ff1

**Priority:** P3

#### Problem

The section reads, in full:

```
See the `/release` slash command in `.claude/skills/release/SKILL.md`. The short version:
`npm run release` bumps the version, tags, and pushes; the `android-deploy.yml` CI workflow fires on
the tag.
```

Two problems:

1. **It omits phases 2 and 3.** `docs/adrs/0077-three-phase-release-verified-artifact-publish.md`
   and `releases/README.md:41–52` define shipping as three ordered phases — `/release` → `/build` →
   `/publish-artifacts` (`npm run release` / `android:bundle`+`ios:ipa` / `release:publish`) —
   precisely because the "release does everything" mental model shipped a stale 1.2.0 binary on the
   v1.4.0 GitHub Release. A contributor following CONTRIBUTING's "short version" stops after phase 1
   and leaves the GitHub Release permanently binary-less (`release.mjs` now "attaches nothing,
   unconditionally" per the ADR).
2. **The `android-deploy.yml` mention misleads.** In a section titled "Release process", "the
   `android-deploy.yml` CI workflow fires on the tag" reads as the deployment step. The workflow is
   a tag-gated *Maestro smoke test* ("Runtime smoke test for the Android *deployment*… Tag-only by
   design", `.github/workflows/android-deploy.yml:1–9`) — it deploys nothing; store artifacts are
   built locally by `/build`.

#### Proposed solution

Rewrite the section to mirror `releases/README.md`'s three-phase table (or simply link it as the
authoritative source and keep one sentence: "Shipping is three ordered phases — `/release`,
`/build`, `/publish-artifacts` (ADR-0077); see `releases/README.md`."). If the smoke test stays
mentioned, name it as such: "pushing the `v*` tag also triggers the Android/iOS launch smoke
workflows."

### [Maintainability] COMPATIBILITY.md's risk register pins claims to line numbers that have broadly rotted

**File(s):** `docs/COMPATIBILITY.md` (lines 70–101, API risk register table) @ 9ae62ff1

**Priority:** P3

#### Problem

The register cites exact `file:line` anchors, and a spot-check shows most have drifted:

| Doc claim (line)                                             | Actual at 9ae62ff1                  |
| ------------------------------------------------------------ | ----------------------------------- |
| `getCoalescedEvents()` — `engine.ts:883` (line 74)           | `web/src/lib/drawing/engine.ts:899` |
| `color-mix` — `ColorPicker.svelte:447` (line 75)             | `:468`                              |
| `ClearButton.svelte:221–222`, `:240–241` (line 75)           | `:201/:222` and `:238–:243`         |
| `100dvh` — `app.css:28` + `:70` (line 76)                    | `:28` + `:81`                       |
| mask — `DrawingCanvas.svelte:534`/`:529` (line 78)           | `:537`/`:532`                       |
| mask — `AiConfetti.svelte:50`/`:44` (line 78)                | `:80`/`:79`                         |
| `navigator.vibrate` — `haptics.ts:24` (line 88)              | `:34`                               |
| `saveData` — `updates.ts:62–64` (line 93)                    | `:48–49`, `:87`                     |
| orientation listener guard — `engine.ts:1300–1302` (line 87) | `~:1328`                            |

None of the drifts is dangerous yet (every file and API claim itself still holds — verified), but
the doc is the canonical risk register consulted "before raising the floor [or] adding a modern web
API", and rotting anchors erode trust in the rows that matter. Unlike `docs/CODE-MAP.md`, this doc
carries no snapshot disclaimer; its "Maintaining this" section (lines 140–146) implies it is kept
current.

#### Proposed solution

Two-part fix: (a) refresh the current numbers once; (b) reduce future rot by switching the Where
column to identifier-level anchors — file + function/selector/constant name (`engine.ts`
`pointermove` handler; `ClearButton.svelte` `.clear-button--armed` gradient) — keeping line numbers
only where no stable identifier exists. The register's value is "which file guards this API and
how", which identifiers convey better than line numbers. A drift-guard test is overkill here (the
register is prose), but a note in "Maintaining this" saying anchors are identifier-level would set
the convention.

### [Docs] AUDIT-DEFERRED.md still carries the `@capacitor/filesystem` finding as "awaiting triage" — it was resolved on main the same day

**File(s):** `docs/AUDIT-DEFERRED.md` (lines 68–121) @ 9ae62ff1

**Priority:** P3

#### Problem

The header (line 21) says "Entries below arrived after those passes and are awaiting triage." The
second entry, "[P3][dependency-split] `@capacitor/filesystem` appears unused — no JS import
anywhere" (lines 68–121), proposes removing the dependency and preserves a rolled-back draft patch.
That exact change already landed on `main`: c5ba3746 ("chore(deps): drop the unused
@capacitor/filesystem plugin") removed the declaration and regenerated the native registrations —
the finding's proposed solution, done. A future triage pass (or `burn-down-audits` re-stage) would
waste a verify/implement cycle rediscovering this, and the kept patch at
`docs/audit-deferred/p3-dependency-split-capacitor-filesystem-appears-unused-no-js-import-any.patch`
is now dead weight. Note the reviewer objection recorded in the entry (lines 103–105) — update
`docs/DEPENDENCIES.md` — is still unmet; that is filed as its own finding above.

#### Proposed solution

Drain the entry with a one-line resolution note in the commit message ("resolved by c5ba3746"), per
the file's own convention ("it's okay to drain the audit finding, but do so with an explanation"),
and delete the associated `.patch` file. Fold the outstanding DEPENDENCIES.md update into the
DEPENDENCIES refresh finding rather than keeping this entry open for it.

### [Docs] Stale "not yet validated on a real Netlify build" caveats — the root staging deploy has been production for weeks

**File(s):** `docs/adrs/0024-web-app-subdirectory-for-netlify-watcher.md` (lines 59–61),
`docs/CONTRIBUTING.md` (lines 103–104) @ 9ae62ff1

**Priority:** P3

#### Problem

Both docs carry the same warning about the `stage-netlify.mjs` production deploy path:

* ADR-0024:59–61: "**This must still be confirmed green on a Netlify deploy preview before merging**
  — it is implemented but not yet validated against a real Netlify build."
* CONTRIBUTING.md:103–104: "This is implemented but **must be confirmed green on a Netlify deploy
  preview before merging to `main`** — don't assume the live `splotch.art` deploy works until that
  preview passes."

The layout has been the live production path since June 2026 and has been validated many times over:
ADR-0025 records an end-to-end deploy-preview verification of the SSR function ("verified end-to-end
on a deploy preview"), ADR-0063 measured the *deployed* function's 26 s ceiling on a branch preview,
ADR-0030 documents fixing the tag fetch in the root `netlify.toml` build after observing real
deploys, and releases 1.0.0–1.4.0 all shipped through it. A reader today is told to distrust
infrastructure that has been production-proven for six-plus weeks — the exact "temporal phrasing /
mutable facts" smell the repo's comment convention bans in code.

#### Proposed solution

In CONTRIBUTING.md, delete the caveat sentence. In ADR-0024, replace the bolded warning with a short
validation note ("Validated in production since 2026-06; see ADR-0025's deploy-preview verification
and ADR-0030's tag-fetch fix for the deploy-time wrinkles found since"), keeping the record's
history intact.

### [Docs] CONTRIBUTING.md dev-routes table omits `/dev/design` (and the `/dev` index)

**File(s):** `docs/CONTRIBUTING.md` (lines 129–137) @ 9ae62ff1

**Priority:** P4

#### Problem

The "Dev routes" table lists only `/dev/engine` and `/dev/ai-timer`. The gated dev surface actually
has four routes: `web/src/routes/dev/` contains `+page.svelte` (a landing index, gated by
`requireDevHarness()` in `dev/+page.ts`), `ai-timer/`, `design/`, and `engine/`. `/dev/design` is
the design-system styleguide that the `design` skill and root CLAUDE.md treat as a first-class
surface ("the token vocabulary, primitives, and `/dev/design`"), so its absence from the contributor
doc's supposedly-complete table is a discoverability gap — a human contributor reading only
CONTRIBUTING.md wouldn't learn the styleguide exists or that `/dev` itself lists the harnesses.

#### Proposed solution

Add two rows — `/dev` ("index of the dev harnesses") and `/dev/design` ("design-token styleguide —
every token, primitive, and component state; see the `design` skill") — and consider a trailing
sentence noting the list's source of truth is `web/src/routes/dev/`.

### [Docs] ISSUE-WORKFLOW.md's "full label glossary" is missing the `user-report` meta label

**File(s):** `docs/ISSUE-WORKFLOW.md` (lines 70–78, meta table) @ 9ae62ff1

**Priority:** P4

#### Problem

Root CLAUDE.md advertises this doc as holding "the full label glossary", and
`docs/ISSUE-WORKFLOW.md:25` says labels are declared in `.github/labels.yml`. That file declares
`user-report` at line 88, ADR-0060 documents the feedback endpoint applying it ("Issues are labelled
`user-report` + `type:bug`/`type:feature`", `0060-user-feedback-github-issue-endpoint.md:40`), and
it is live on the tracker (open issues \#586, \#539, \#538, \#537, \#324 carry it). Yet the
meta-label table (lines 70–78) lists `in-progress`, `reviewed`, `needs-triage`, `needs-scoping`,
`needs-adr`, `wont-do`, `good first issue` — and not `user-report`. An agent triaging issues per
this doc has no guidance for the label's meaning (auto-filed from the in-app feedback form,
unvetted, may be noise like the "[Bug] burst 0" reports). Separately worth noting while editing: the
live tracker also uses labels absent from `labels.yml` entirely (`area:crayon` on \#354–\#383,
`enhancement` on \#278) — either add them to `labels.yml` or note them as legacy strays, since the
doc claims the file is the taxonomy's single source.

#### Proposed solution

Add a `user-report` row to the meta table: "Auto-applied by the `/api/report` feedback endpoint
(ADR-0060) — filed by an in-app user, not yet vetted; triage before trusting the report." Decide on
`area:crayon`/`enhancement` (declare or retire) as a follow-up to keep the "labels.yml is the
taxonomy" claim true.

### [Docs] ADR-0006 still describes the legacy form-field contract with no pointer to its ADR-0064 amendment

**File(s):** `docs/adrs/0006-server-side-ai-generation.md` (lines 25–26), `docs/adrs/README.md`
(line 88) @ 9ae62ff1

**Priority:** P4

#### Problem

ADR-0006's Decision states: "the client must supply an `access-token` form field that is validated
against an allowlist" (lines 25–26). ADR-0064 changed the contract — `/api/generate-image` now takes
a raw `image/*` body with credentials in `X-Access-Token` / `X-Api-Key` *headers*, with multipart
kept only as a legacy shape for old native builds. ADR-0007, which had the same staleness exposure,
got a proper amendment blockquote and an index annotation ("Active (amended by ADR-0064)",
`README.md:89`); ADR-0006 got neither — its index row (line 88) reads plain "Active". Since ADR-0006
is the entry-point record for the whole AI-generation feature, a reader stops there and learns the
superseded wire format as current fact.

#### Proposed solution

Mirror the ADR-0007 treatment: add a one-line amendment note under ADR-0006's Status ("Amended by
ADR-0064 (2026-07): credentials moved from the `access-token` form field to the
`X-Access-Token`/`X-Api-Key` headers over a raw image body; the token-gating and allowlist model
below is unchanged") and update the index row to "Active (amended by [0064](…))".

### [Docs] PROMPTS.md has drifted from its documented purpose — two consumed one-off workflow prompts filed under "Reusable AI art prompts"

**File(s):** `docs/PROMPTS.md` (lines 75–112, "AUDIT-DEFERRED" and "Self Heal" sections) @ 9ae62ff1

**Priority:** P4

#### Problem

Root CLAUDE.md's docs table defines this file as "Reusable AI art prompts for assets". Lines 1–73
fit (coloring-page outlines, drawings, icons). Lines 75–112 do not:

* "AUDIT-DEFERRED" (lines 75–102) is the one-off kickoff prompt for the deferred-findings triage —
  work that has since *completed twice* (the 2026-07-27 and 2026-07-28 triage passes recorded in
  `docs/AUDIT-DEFERRED.md:7–19` and `docs/audit-deferred/decisions/README.md`). It's a spent session
  prompt, not a reusable recipe, and it carries raw typos ("possilbe", "beed", "implemenation",
  "traiged").
* "Self Heal" (lines 104–112) is a session-retro prompt for "the codex burn down agent skill" with a
  placeholder ("I merged PR ###") — again a one-off template for a specific workflow, not an art
  prompt.

Neither belongs in the file per its own charter; both would mislead an agent scanning PROMPTS.md for
asset-generation recipes, and the AUDIT-DEFERRED one invites re-running a completed campaign.

#### Proposed solution

Delete the AUDIT-DEFERRED section (its useful essence — the triage methodology — is now permanently
encoded in `docs/audit-deferred/decisions/README.md`'s verdict scheme and template). For "Self
Heal": if the retro pattern is genuinely reusable, it belongs in the skill machinery (a note in the
relevant skill or skill-notes), not here; otherwise delete it too. If any workflow prompt is kept,
at minimum retitle the doc's purpose line in CLAUDE.md — but trimming the file is the better fix.

### [Docs] releases/README.md cites pre-ADR-0024 paths and the wrong iOS version artifact

**File(s):** `releases/README.md` (lines 9, 13) @ 9ae62ff1

**Priority:** P5

#### Problem

The generated-artifacts table has two loose facts:

* Line 9: "In-app About tab → `src/lib/releases.json`" — the generator writes
  `web/src/lib/releases.json` (`scripts/generate-releases.mjs:73`:
  `write(join(ROOT, 'web', 'src', 'lib', 'releases.json'), …)`). `src/lib/…` was the pre-ADR-0024
  layout; every path in a root-level doc should be repo-root-relative.
* Line 13: "App version → `package.json`, Android `build.gradle`, iOS `Info.plist`" — the iOS value
  `release.mjs` writes is `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` in
  `ios/App/App.xcodeproj/project.pbxproj`; `Info.plist` merely contains the `$(MARKETING_VERSION)`
  build-setting passthrough (verified at `ios/App/App/Info.plist:21–24`). Someone auditing "did the
  version bump land" would open the wrong file and find no literal version in it.

#### Proposed solution

Change line 9 to `web/src/lib/releases.json` and line 13's iOS cell to "iOS `project.pbxproj`
(`MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`)".

### [Docs] ADR-0018's invariant list still names the deleted `docs/BACKLOG.md` as a current docs/ resident

**File(s):** `docs/adrs/0018-claude-native-knowledge-tiers.md` (line 55) @ 9ae62ff1

**Priority:** P5

#### Problem

The Decision's invariant reads: "`docs/` retains only human-process artifacts: `adrs/`,
`CONTRIBUTING.md`, `BACKLOG.md`, `PROMPTS.md`, and the generated `AUDIT.md` / `AUDIT-LOG.md`."
`docs/BACKLOG.md` no longer exists — `docs/ISSUE-WORKFLOW.md:4–5` records that it (and `IDEAS.md`)
were migrated into GitHub Issues in 2026-07, and the root CLAUDE.md now says "don't look for a
backlog file." The ADR already carries an ADR-0058 amendment blockquote at the top, so the record is
maintained — this one enumerated invariant just wasn't touched when the backlog moved. Low stakes
(ADR-0031's BACKLOG mentions are Context-narrative and fine), but this line is phrased as a
prescriptive invariant about the present.

#### Proposed solution

Extend the existing amendment blockquote with one clause: "…and `docs/BACKLOG.md` was retired in
2026-07 in favor of GitHub Issues (see `docs/ISSUE-WORKFLOW.md`); `docs/` has since grown other
human-process docs (COMPATIBILITY, ISSUE-WORKFLOW, DEPENDABOT, CLOUD/)." No body rewrite needed.

### [Docs] CONTRIBUTING.md's `npm test` description omits the repo-script test tier

**File(s):** `docs/CONTRIBUTING.md` (line 120) @ 9ae62ff1

**Priority:** P5

#### Problem

Line 120: `npm test  # unit + asset-pipeline + E2E (what CI runs on every push)`. The script is four
tiers: `package.json:40` —
`"test": "npm run test:unit && npm run test:asset-gen && npm run test:scripts && npm run test:e2e"`.
Both root CLAUDE.md ("Unit (Vitest) + asset-pipeline + repo-script + E2E") and the `scripts-info`
entry (`package.json:168`) name all four; ADR-0019 explicitly requires "Description wording matches
the prose docs … so the catalog and the guides never disagree about what a script is for." A
contributor whose change breaks `scripts/tests/` would be surprised that `npm test` (and CI) catches
it, since the doc they read said it doesn't run.

#### Proposed solution

Change the comment to `# unit + asset-pipeline + repo-script + E2E (what CI runs on every push)` —
one word, restoring the ADR-0019 wording agreement.

## Source: Code audit — .ruler — agent-instruction & skill sources

### [Correctness] run-splotch driver.mjs commits the exact orphaned-vite anti-pattern its own SKILL.md forbids

**File(s):** `.ruler/skills/run-splotch/driver.mjs` (`startServer`, lines 92–103; shutdown at lines
173–186) and `.ruler/skills/run-splotch/SKILL.md` (lines 139–155) @ 9ae62ff1

**Priority:** P1

#### Problem

The SKILL.md contains an emphatic, hard-won warning (lines 139–151):

> **Never hand-roll the dev server in a throwaway script.** `spawn('npx', ['vite', 'dev', …])` +
> `server.kill('SIGTERM')` does **not** work: `npx` exits but the real `vite` keeps running, and
> because its stdout is piped to your script the Node event loop never drains — the script hangs on
> exit and leaves an **orphaned `vite dev` holding the port for hours** … **If you truly must spawn
> one**, use `spawnViteServer(port, env)` from `scripts/lib/vite-server.mjs` — it launches vite in a
> **detached process group** and its `stop()` kills the whole group.

Yet `driver.mjs` — the very driver that SKILL.md tells every agent to run — does exactly the
forbidden thing:

```js
server = spawn('npx', ['vite', 'dev', '--port', String(port), '--strictPort'], {
  cwd: resolve(repoRoot, 'web'),
  env: { ...process.env, PUBLIC_ENABLE_DEV_HARNESS: 'true' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
server.stdout.on('data', (d) => process.stderr.write(d));
```

(lines 97–102), and tears down with `server.kill('SIGTERM')` (lines 178 and 184).
`scripts/lib/vite-server.mjs` (lines 1–7 of its header comment) explains precisely why this leaks:
`npx vite` adds a wrapper layer, so killing the child leaves the process that actually holds the
port alive. `spawnViteServer()` runs vite's bin directly with node in a `detached: true` process
group and `stop()` kills the whole group (`process.kill(-server.pid, 'SIGTERM')`), plus it installs
`process.on('exit'/'SIGINT')` cleanup — none of which the driver has. The driver also has no cleanup
for the case where the browser launch or screenshot throws after the server started but before
`main()`'s teardown besides the single top-level `catch` (which again only kills the npx wrapper).

So every non-`--keep` driver run risks leaving a `vite dev` holding port 5199 — the "task running
for hours" failure the skill itself documents.

#### Proposed solution

Have `driver.mjs` reuse the shared helper:
`import { spawnViteServer, freePort } from '<repoRoot>/scripts/lib/vite-server.mjs'` (the driver
already computes `repoRoot` at line 29; use a `pathToFileURL`-based dynamic import or a relative
`../../../scripts/lib/vite-server.mjs` — the generated copies live at a fixed depth in
`.claude/skills/` and `.agents/skills/`, same depth as the source).
`spawnViteServer(port, { env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' }, stdout: 'pipe' })` covers the
current behavior; replace the two `server.kill('SIGTERM')` calls with the returned `stop()`. Gotcha:
`spawnViteServer` currently hardcodes `stdio` ignore/inherit choices — its `stdout` option already
supports `'pipe'`, so the driver's log-forwarding still works. Keep `--keep` behavior by simply not
calling `stop()` (the detached group survives the parent exiting, which is exactly what `--keep`
wants).

### [Docs] testing and run-splotch skills still document `flows.spec.ts` / `engine.spec.ts`, deleted in the spec split

**File(s):** `.ruler/skills/testing/SKILL.md` (lines 107, 134–135, 145, 152, 168, 189) and
`.ruler/skills/run-splotch/SKILL.md` (lines 137, 211) @ 9ae62ff1

**Priority:** P1

#### Problem

`web/tests/` no longer contains `flows.spec.ts` or `engine.spec.ts` — they were split into
`flows-ai.spec.ts`, `flows-coloring-book.spec.ts`, `flows-icons.spec.ts`,
`flows-magic-brush.spec.ts`, `flows-palette-brush.spec.ts`, `flows-parent-center.spec.ts`,
`flows-undo-persistence.spec.ts` and the `engine-*.spec.ts` family, with shared helpers extracted to
`helpers.ts`, `flows-harness.ts`, `engine-harness.ts`, and `cdp.ts`. The skills still cite the dead
files in eight places:

* `testing/SKILL.md:107` — the canonical "run one spec" example:
  `npm run test:e2e -- flows.spec.ts -g "the undo button enables on a stroke and reverts it"`.
  Playwright treats the CLI arg as a pattern; `flows.spec.ts` matches none of the `flows-*.spec.ts`
  files, so the doc-prescribed command runs **zero tests**. (That test title now lives in
  `web/tests/flows-undo-persistence.spec.ts`.)
* `testing/SKILL.md:134–135` — "`flows.spec.ts` has a shared `retryOpen(ready, open, opts?)`
  primitive". `retryOpen` is exported from `web/tests/helpers.ts:78`; the one-liner wrappers are in
  `flows-harness.ts`.
* `testing/SKILL.md:145` — "the stroke-resume gap in `engine.spec.ts`" → now
  `web/tests/engine-pointer-recovery.spec.ts` (line 25).
* `testing/SKILL.md:152` — "`MAGIC_REVEAL_TIMEOUT` in `flows.spec.ts`" →
  `web/tests/flows-magic-brush.spec.ts:21`.
* `testing/SKILL.md:168` — "`drawMagicReveal` in `flows.spec.ts`" → `flows-magic-brush.spec.ts:41`.
* `testing/SKILL.md:189` — "the viewport-rotation and touch-synthesis helpers in `flows.spec.ts` are
  Chromium-only" → `web/tests/cdp.ts` (`rotateViewportViaCdp`).
* `run-splotch/SKILL.md:137` — "A full worked example … lives in the magic-brush E2E test,
  `web/tests/flows.spec.ts`."
* `run-splotch/SKILL.md:211` — troubleshooting row repeats the dead
  `npm run test:e2e -- flows.spec.ts -g "<title>"` example.

The testing skill is the designated reference for "writing/running tests" — an agent following it
verbatim runs an empty suite and then greps for helpers in a file that doesn't exist.

#### Proposed solution

Update all eight citations to the current file names (`flows-undo-persistence.spec.ts` for the
example command, `helpers.ts`/`flows-harness.ts` for `retryOpen`, `flows-magic-brush.spec.ts` for
`MAGIC_REVEAL_TIMEOUT`/`drawMagicReveal`, `engine-pointer-recovery.spec.ts`, `cdp.ts`), then
`npm run ruler:apply`. Consider phrasing that survives future splits ("the flows specs' shared
harness, `web/tests/flows-harness.ts`") per the repo's own no-mutable-facts convention.

### [Correctness] create-adr's "count the files" numbering rule produces wrong, colliding ADR numbers — and already has

**File(s):** `.ruler/skills/create-adr/SKILL.md` (step 4, lines 42–43) @ 9ae62ff1

**Priority:** P2

#### Problem

Step 4 reads:

> **Determine the next ADR number.** Count existing files in `docs/adrs/` (excluding `README.md`)
> and use the next four-digit number (`0015`, `0016`, etc.).

File count and max number diverged long ago: `docs/adrs/` currently holds **74** numbered files, but
the highest number is **0077** — several ADRs were moved out to `tools/asset-gen/docs/` (the index
marks them "Moved"), so counting yields 0075, a number that is already taken. The repo already shows
the collision this instruction invites: both `0077-dependabot-claude-review-workflow.md` and
`0077-three-phase-release-verified-artifact-publish.md` exist. (The duplicate files themselves are a
`docs/` cleanup, but the instruction that manufactures duplicates lives here, and
`update-adrs/SKILL.md:52` — "Use the next available four-digit number" — leans on the same broken
procedure via its `/create-adr` reference.)

#### Proposed solution

Replace the counting rule with max+1 plus a collision check, e.g.:

> Take the highest existing number (`ls docs/adrs | grep -oE '^[0-9]{4}' | sort | tail -1`) and add
> one. Numbers are never reused — moved/superseded ADRs keep their number — and before writing,
> confirm no existing file already carries the chosen number.

Optionally note that a duplicate number is a defect to flag, not to extend. Regenerate with
`npm run ruler:apply`.

### [Maintainability] Audit skills link `audit-conventions.md` with a path that is broken in the `.agents/` tree (and inside `.ruler/` itself)

**File(s):** `.ruler/skills/code-audit/SKILL.md` (line 55), `.ruler/skills/extract-audit/SKILL.md`
(line 53), `.ruler/skills/lighthouse-audit/SKILL.md` (line 112),
`.ruler/skills/session-audit/SKILL.md` (line 164), `.ruler/skills/dependency-health-audit/SKILL.md`
(line 229), `.ruler/skills/dependency-update-audit/SKILL.md` (lines 23 vs 120),
`.ruler/skills/workflow-audit/SKILL.md` (line 117) @ 9ae62ff1

**Priority:** P2

#### Problem

Skills are copied verbatim into **both** `.claude/skills/<name>/` and `.agents/skills/<name>/`
(agent-files.md lines 10–11). Six audit skills link the shared conventions as
`[`.claude/audit-conventions.md`](../../audit-conventions.md)`. That relative path only resolves
from `.claude/skills/<name>/`; from `.agents/skills/<name>/` it points at
`.agents/audit-conventions.md`, which does not exist (`.agents/` contains only `skills/` and
`skill-notes/`), and from the `.ruler/` source itself it points at a nonexistent
`.ruler/audit-conventions.md`. A Codex session following the link (the explicitly supported consumer
per ADR-0058 and knowledge-map.md lines 3–5) hits a dead path for the conventions that define the
finding format, the AUDIT-LOG entry, and the self-heal rule.

The correct form already exists in the same tree — `dependency-update-audit/SKILL.md:23` uses
`(../../../.claude/audit-conventions.md)`, which resolves to the repo-root
`.claude/audit-conventions.md` from **both** generated locations — but the same file then uses the
broken `(../../audit-conventions.md)` form at line 120, so even one skill is internally
inconsistent.

#### Proposed solution

Normalize every audit-conventions link in `.ruler/skills/**` to the
`../../../.claude/audit-conventions.md` form (or drop the hyperlink and keep the plain backticked
path, which several skills — `vet-audits`, `fix-audits`, `skills-guide` — already do successfully).
A cheap drift-guard in `scripts/tests/` that resolves every relative markdown link in the generated
`.claude/skills/**` and `.agents/skills/**` and fails on a missing target would catch this whole
class (see also the pr-screenshots and knowledge-map findings below).

### [Docs] architecture skill's "file-by-file source map" and route table have drifted well behind `web/src/`

**File(s):** `.ruler/skills/architecture/SKILL.md` (source map lines 62–112, route table lines
124–137, tech-stack lines 18–19 and 55–56, `server/rateLimit.ts` row line 110) @ 9ae62ff1

**Priority:** P2

#### Problem

The skill advertises a "file-by-file source map of web/src/" (description, line 3) and is the
designated navigation reference, but large module families are absent or misdescribed:

* **`lib/drawing/`** — the map (lines 66–76) omits `aiImage.ts`, `aiImageResponse.ts`,
  `earlyBoot.ts` (the ADR-0072 pre-hydration boot the run-splotch skill leans on), `folderSave.ts`
  (named at line 71 as if mapped, but has no row), `magicBrush.ts`, and `perf.ts` (named at line 60
  of the profiling skill as the shared marks flag).
* **`lib/state/`** — omits `aiGeneration.svelte.ts`, `aiKey.svelte.ts`, `modal.svelte.ts`,
  `saveFolder.svelte.ts`, `ui.svelte.ts`.
* **`lib/actions/`** — lists only `dragToClear` and `modalDialog` (lines 89–90); missing
  `launchGuard`, `pinchTextZoom`, `pinchZoom`, `pointerCapture`, `scribbleGuard`, `spreadTracker`.
* **`lib/server/`** — lists five modules (lines 105–110); missing `http.ts` (the shared
  `throttled()`/`readJsonBody` helpers the api skill calls mandatory), `github.ts` (the ADR-0060
  seam), `config.ts`, `generationAuthorization.ts`, `rateLimitKeys.ts`, `rateLimitPolicy.ts`,
  `securityHeaders.ts`, `usage.ts`. The `server/rateLimit.ts` row (line 110) still reads "per-token
  rate limiting for the image generation endpoint" — it is the generic per-key sliding window
  backing seven endpoint policies in `rateLimitPolicy.ts`.
* **`lib/` top level** — no rows for `adminFormat.ts`, `aiCredential.ts`, `apiHeaders.ts`,
  `appVersion.ts`, `devHarness.ts`, `deviceInfo.ts`, `deviceReport.ts`, `errorLog.ts`, `fonts.ts`,
  `haptics.ts`, `idb.ts`, `idle.ts`, `imagePrefetch.ts`, `inviteLink.ts`, `latestRequest.ts`,
  `notchBand.ts`, `palette.ts`, `safeArea.ts`, `storageKeys.ts`, or the `plugins/` facades that
  mobile/native.md describes at length.
* **Route table** (lines 124–137) — missing `/api/report` and `/api/csp-report`, both live routes
  (`web/src/routes/api/report/`, `web/src/routes/api/csp-report/`) fully documented in the api
  skill.
* **Tech stack** — line 18–19 says Vite "Injects three compile-time constants: `__APP_VERSION__`,
  `__BUILD_TIME__`, `__NATIVE_API_BASE__`"; `web/defines.ts` lines 15–19 defines five, and the two
  omitted (`__IS_CAPACITOR__`, `__PERF_MARKS__`) are exactly the load-bearing ones other skills
  document (the tree-shaking gate in mobile/native.md lines 54–60, the marks flag in profiling).
  Line 55–56 describes Maestro as "Android smoke test" only; the iOS smoke (`npm run test:ios`) has
  existed since the ios-deploy workflow landed.

An auditor or contributor using this map concludes files don't exist, or places new code where an
unlisted sibling already lives.

#### Proposed solution

Refresh the map against the actual tree (the listing above is the checklist), add the two missing
route rows, fix the `rateLimit.ts` description, say "five compile-time constants" (or name the file
`web/defines.ts` and drop the count per the no-mutable-facts convention), and mention iOS beside
Android in the Maestro bullet. Consider a drift-guard test comparing `ls web/src/lib` module names
against the map's cited paths so the next split fails CI instead of silently rotting — the repo's
own "cross-file agreement is never maintained by prose" convention applied to its own docs.

### [Docs] architecture route table describes generate-image's retired "base64 PNG" contract, contradicting the api skill

**File(s):** `.ruler/skills/architecture/SKILL.md` (line 127) @ 9ae62ff1

**Priority:** P2

#### Problem

The `/api/generate-image` row says:

> Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image.

The api skill (`.ruler/skills/api/SKILL.md` lines 48–58, ADR-0064) documents the current contract
precisely: **raw image bytes as the body** (WebP preferred, `Content-Type` allowlist, style as a
`?style=` query enum, credential in a header), with multipart as a labelled legacy shim. "base64
PNG + style prompt" matches neither the current nor even the legacy multipart shape, and two
generated instruction files now contradict each other on the same endpoint — the exact
"contradictory instructions" failure ruler exists to prevent.

#### Proposed solution

Rewrite the row to defer to the api skill for the contract, e.g.: "Serverless function (Netlify).
Raw drawing bytes in, stylized image out — see the `api` skill for the full contract. Token-gated +
rate-limited. Not bundled for native." Route-table rows shouldn't re-state wire details a sibling
skill owns.

### [Docs] pr-screenshots links ADR-0046 one directory too shallow — dead link in every generated location

**File(s):** `.ruler/skills/pr-screenshots/SKILL.md` (line 22) @ 9ae62ff1

**Priority:** P2

#### Problem

Line 22 links `[ADR-0046](../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md)`. From
the generated `.claude/skills/pr-screenshots/SKILL.md` this resolves to `.claude/docs/adrs/…`, and
from `.agents/skills/pr-screenshots/` to `.agents/docs/adrs/…` — neither exists. Every other skill
in the tree that reaches the repo root uses three levels (`mobile/android.md:11` →
`../../../docs/COMPATIBILITY.md`, `burn-down-backlog:21` → `../../../.github/labels.yml`), so this
is a one-off typo, but it dead-ends the pointer to the ADR that holds "the full rationale, sources,
and rejected options" the skill explicitly declines to restate inline.

#### Proposed solution

Change to `../../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md` and run
`npm run ruler:apply`. The relative-link drift-guard test proposed in the audit-conventions finding
would have caught this too.

### [Docs] mobile and profiling docs prescribe npm scripts that don't exist (`ios:run:choose`, `ios:run:ipad`, `npm run ios`)

**File(s):** `.ruler/skills/mobile/ios.md` (lines 65, 143),
`.ruler/skills/profiling/ipad-device-profiling.md` (line 212) @ 9ae62ff1

**Priority:** P3

#### Problem

Three commands cited as the way to run the app on iOS hardware are not in `package.json`:

* `ios.md:65` — "or `npm run ios:run:choose` and choose the device at the prompt". No such script;
  the chooser behavior belongs to plain `ios:run` (scripts-info line 243: "prompting to choose the
  iOS simulator or connected device").
* `ios.md:143` — "covers all Debug builds — `ios:run`, `ios:run:ipad`, `cap:ios` Run". No
  `ios:run:ipad`; the real variants are `ios:run:emulator` and `ios:run:device` (package.json lines
  116–117).
* `ipad-device-profiling.md:212` — "Build + run the native app with marks on:
  `PERF_MARKS=true npm run ios`". No `ios` script; should be `ios:run`.

Each fails with `npm error Missing script` at the exact moment a user is mid-runbook with a device
cabled up. The repo's own guidance ("run `npm run info` before guessing at a script") exists because
of this class of drift — the docs shouldn't require it.

#### Proposed solution

Replace with the real script names (`ios:run`; `ios:run:emulator` / `ios:run:device`;
`PERF_MARKS=true npm run ios:run`). A tiny repo-script test that extracts `npm run <name>` tokens
from `.ruler/**` and asserts each (or its namespace prefix) exists in `package.json` scripts would
fence the whole category — this audit found these three by exactly that grep.

### [Docs] testing skill's CI description omits the quality-job gates that actually redden PRs

**File(s):** `.ruler/skills/testing/SKILL.md` (lines 23–26, 328–333) @ 9ae62ff1

**Priority:** P3

#### Problem

Line 23–24 summarizes the quality job as "type-check, ESLint, Prettier `--format:check`, and
`npm audit --audit-level=critical`", and the CI table (line 330) says test.yml runs "`quality`
(type-check, lint, format:check, audit) + app/asset unit + Playwright E2E". The actual `test.yml`
quality job also runs `img:audit:check`, `ruler:check` (the ADR-0058 drift gate),
`gen:tokens:check`, `lint:tokens` (the token ratchet), `lint:dead` (knip), `check:assets:manifest`,
and `scrapbook:check` (workflow lines 39–80), and the test job additionally runs `test:scripts` and
`test:driver:smoke` (lines 105, 144). The skill's description promises coverage of "CI workflow
triggers … debugging CI failures", but an agent debugging a red quality job caused by ruler drift, a
knip hit, or a raw hex color finds none of those steps listed — the very gates most likely to fail a
docs/skills PR (`ruler:check` fails whenever someone edits a generated file, the failure mode this
whole tree is designed around). "Prettier `--format:check`" is also garbled — the step is
`npm run format:check` (dprint owns Markdown, per conventions.md).

#### Proposed solution

Rewrite the two spots to enumerate the real quality steps (or, better, name the job and point at
`.github/workflows/test.yml` for the list, keeping only the commonly-failing trio — `format:check`,
`ruler:check`, `lint:tokens`/`lint:dead` — called out with their usual causes), and add
`test:scripts` + `test:driver:smoke` to the test.yml row.

### [Docs] testing skill hardcodes "4 workers" — the config says `workers: '100%'`

**File(s):** `.ruler/skills/testing/SKILL.md` (lines 126, 173) @ 9ae62ff1

**Priority:** P3

#### Problem

Line 126: "The full suite runs **4 workers in parallel** (`playwright.config.ts`), so every spec
shares the CPU with three others." Line 173: "`--repeat-each=10` (which still fans out across the 4
workers)". `web/playwright.config.ts:75` sets `workers: '100%'` — one worker per logical core, with
a comment explaining the choice ("on a 4-core box that's the difference between ~90s and ~58s"). On
an 8- or 16-core machine the skill's number is simply wrong, and the flake-resistance reasoning
("shares the CPU with three others") mis-sizes the contention it teaches agents to design for. This
violates the repo's own convention: a mutable fact owned by `playwright.config.ts` is restated as a
constant in prose.

#### Proposed solution

Phrase it ownership-first: "The full suite runs one worker per core (`workers: '100%'` in
`playwright.config.ts`), so every spec shares the machine with the rest of the suite" and drop "the
4 workers" at line 173 ("fans out across all workers").

### [Maintainability] android.md cites hardcoded source line numbers that have already drifted

**File(s):** `.ruler/skills/mobile/android.md` (lines 312, 314, 319–320, 332) @ 9ae62ff1

**Priority:** P3

#### Problem

The Play-compliance section anchors claims to exact line numbers:

* line 312 — "`captureAiAccessTokenFromUrl` (`state/settings.svelte.ts:236-241`)" → the function now
  starts at `settings.svelte.ts:233`;
* line 314 — "`buildInvites` in `/admin` (`server/admin.ts:92-95`)" → now at `admin.ts:87`;
* line 319–320 — "`visibleActionButtonCount()` (`actionButtonLayout.ts:64`)" → now
  `actionButtonLayout.ts:58`;
* line 332 — "`aiImage.ts:158`" → the `apiUrl('/api/generate-image')` call is now at
  `aiImage.ts:162`.

(`ActionsPanel.svelte:357` at line 319 happens to still be right — for now.) These citations sit in
a compliance runbook that will next be read months from now during a store review; every number is a
mutable fact owned by the source file, exactly what conventions.md forbids restating ("no restating
mutable facts (counts, dates, values, paths) owned elsewhere — name the owning identifier"). The
function names alone are stable and greppable.

#### Proposed solution

Drop the `:NNN` suffixes and keep `identifier (file)` form — `captureAiAccessTokenFromUrl`
(`state/settings.svelte.ts`), `buildInvites` (`server/admin.ts`), etc. Where the identifier is a
bare expression (the `ActionsPanel.svelte` gate), name the prop/handler instead of the line.

### [Docs] dependency-update-audit still instructs updating superseded ADR-0011 "if the Capacitor patch changed"

**File(s):** `.ruler/skills/dependency-update-audit/SKILL.md` (line 111) @ 9ae62ff1

**Priority:** P3

#### Problem

Phase 4 step 12 ends: "If the Capacitor patch changed, update ADR-0011's notes." ADR-0011
("patch-package for Capacitor CLI Windows gradlew Bug") is **Superseded by ADR-0062** — Windows dev
support was dropped and both the patch and `patch-package` were removed from the repo. There is no
Capacitor patch to change; a monthly unattended Routine runs this skill (lines 19–24), so the stale
sentence is re-read by an autonomous agent every month, and an eager one could "update" a historical
record.

#### Proposed solution

Delete the sentence. If a stand-in is wanted, the modern equivalent is the `overrides`-pinned
`sharp` entanglement already documented in dependency-health-audit Phase 1 — but a pointer there is
optional; the landmine list in Phase 1 (lines 41–48) already covers coordinated families.

### [Docs] Machine-specific absolute paths baked into shared skills (`/Users/kylemit/…`)

**File(s):** `.ruler/skills/run-splotch/SKILL.md` (line 13), `.ruler/skills/workflow-audit/SKILL.md`
(lines 24–25) @ 9ae62ff1

**Priority:** P4

#### Problem

* `run-splotch/SKILL.md:13`: "**All paths below are relative to the repo root**
  (`/Users/kylemit/Code/Splotch`)." The parenthetical is one contributor's macOS checkout; in a
  cloud session the root is `/home/user/Splotch`, and for any other machine it's something else. The
  clause before the parenthesis is complete on its own.
* `workflow-audit/SKILL.md:24–25`: "the JSONL transcripts under
  `~/.claude/projects/-Users-kylemit-Code-Splotch/`". The directory name is derived from the
  absolute repo path, so this is wrong on every machine but one — an agent on another checkout greps
  an empty/nonexistent dir and concludes there's no session history.

Skills are shared cross-runner, cross-machine artifacts (ADR-0058); per-machine facts belong in
untracked local config, the same principle that keeps `DEVELOPMENT_TEAM` out of the pbxproj (ios.md
§4).

#### Proposed solution

run-splotch: drop the parenthetical. workflow-audit: describe the derivation instead — "under
`~/.claude/projects/<slug>/`, where `<slug>` is the absolute repo path with `/` replaced by `-`
(list `~/.claude/projects/` and match the current checkout)".

### [Docs] run-splotch describes the wrong verification landmark: "Parent Controls button top-right"

**File(s):** `.ruler/skills/run-splotch/SKILL.md` (lines 42–44) @ 9ae62ff1

**Priority:** P4

#### Problem

The screenshot-verification paragraph says: "**Open the PNG and look at it** —
`screenshots/splotch-home.png` shows the color palette down the left, the Parent Controls button
top-right…". Two errors: the element's canonical name is the **Parent Help Button** (architecture
skill's UI glossary, line 219 — the glossary exists precisely so skills use one name), and it is
positioned at the **bottom** edge (`ParentHelpButton.svelte:25–26`:
`position: fixed; bottom: calc(var(--space-2) + env(safe-area-inset-bottom))`; the architecture
skill's layout notes, lines 155–158, call the bottom edge "contested" between this button and the
Actions Panel). An agent doing the prescribed visual check against this text either fails the
verification ("no button top-right — did my change break the UI?") or, worse, passes a screenshot
where the real button regressed.

#### Proposed solution

Fix to "the Parent Help Button bottom-right" (and keep "color palette down the left", which is
correct for the driver's 1280×800 landscape viewport).

### [Docs] knowledge-map's ADR-0059 link breaks in the generated root CLAUDE.md/AGENTS.md

**File(s):** `.ruler/knowledge-map.md` (line 79) @ 9ae62ff1

**Priority:** P4

#### Problem

Line 79 links `[ADR-0059](../docs/adrs/0059-committed-run-artifacts-github-pages.md)`. The path is
correct relative to the *source* location (`.ruler/`), but the root `.ruler/*.md` files are
concatenated into `CLAUDE.md` and `AGENTS.md` at the **repo root** (agent-files.md lines 7–9), where
`../docs/…` points outside the repository — the generated `CLAUDE.md:260` and `AGENTS.md:262` carry
the broken link today. It's the only relative markdown link in the root sources (every other
cross-reference uses plain backticked paths), so it's also a one-off style break.

#### Proposed solution

Write it for the generated location —
`[ADR-0059](docs/adrs/0059-committed-run-artifacts-github-pages.md)` — or match the file's own
convention and use a backticked plain path with no hyperlink. (Root sources should generally use
root-relative link targets since the concatenation destination is fixed at the root.)

### [Readability] dprint-mangled bullet corrupts a sentence in burn-down-backlog's review step

**File(s):** `.ruler/skills/burn-down-backlog/SKILL.md` (lines 104–108) @ 9ae62ff1

**Priority:** P4

#### Problem

The pre-granted-go-ahead instruction renders as:

```
its comments on the PR** (a single pending review submitted with `add_comment_to_pending_review`
* submit), and must never end by asking whether to post or by leaving the review only in chat.
  Wait for the subagent to finish before continuing — its comments are the input to the next
  step.
```

The original text was evidently "`add_comment_to_pending_review` + submit)", and dprint's reflow
turned the line-leading `+` into a `*` list marker — the exact failure mode the repo documented for
ADR consequences lists (create-adr SKILL.md lines 74–76: "escape the plus — a bare `+` after the
list marker parses as a nested list and dprint restructures it, ADR-0057"). The result is a nested
bullet reading "submit), and must never end…" — a broken sentence in the middle of the skill's most
safety-relevant instruction (when a subagent may post to GitHub without a human gate).

#### Proposed solution

Reword to avoid the line-leading operator entirely, e.g. "(a single pending review:
`add_comment_to_pending_review` for each finding, then submit)". While there, consider a note in the
ruler/authoring docs that the `\+` escaping rule applies to all `.ruler` markdown, not just ADRs —
this instance shows the trap firing outside `docs/adrs/`.

### [Performance] gather.mjs contradicts its own header and spends 3 subprocesses per branch; table columns misalign

**File(s):** `.ruler/skills/prune-remote-branches/gather.mjs` (header lines 2–4, loop lines 52–58,
table lines 83–97) @ 9ae62ff1

**Priority:** P4

#### Problem

The header claims the script exists "so the prune-remote-branches skill can triage 100+ branches
**without one git call per branch**" (lines 2–4), but only the metadata is batched (`for-each-ref`,
line 39); the loop then shells out per branch: `rev-list --count` twice (lines 52–53) and
`git cherry` for any branch with unique commits (line 57) — 2–3 synchronous `execSync` spawns × 100+
branches. The two rev-list calls are one call as
`git rev-list --left-right --count ${baseRef}...${shortRef}` (returns both numbers). The comment as
written is misleading about what the script does.

Separately, the table header pads the `ahead` column to 5 after a 2-space gap (line 85) while data
rows emit a 2-char current-marker plus `padL(r.ahead, 3)` (line 93) — 7 vs 5 chars, so every numeric
column sits 2 characters left of its header. And `nameW` is capped at 48 (line 83) but `pad()` never
truncates, so one long cloud-session branch name (they routinely exceed 48 chars) breaks alignment
for its whole row.

#### Proposed solution

Fold the two rev-list calls into one `--left-right --count` call (halves the spawn count; `cherry`
stays conditional), fix the header comment to claim what's true ("one metadata pass plus 1–2 counts
per branch"), and align the header/row padding (give rows `padL(r.ahead, 5)` after the marker or
shrink the header pad). Truncate names past `nameW` with an ellipsis.

### [Correctness] lighthouse run-audit summary table ingests stale and priming reports from the output dir

**File(s):** `.ruler/skills/lighthouse-audit/run-audit.mjs` (`printSummary`, lines 205–235; priming
pass lines 63–65) @ 9ae62ff1

**Priority:** P4

#### Problem

`printSummary()` globs **every** `*.report.json` in `--out` (line 208), not just the files this run
wrote. Two consequences:

* The default `--out lighthouse-reports/` is reused across runs (it's a stable gitignored dir), so a
  `--device phone` run's summary silently includes last week's tablet rows — against a different URL
  if `--url` changed — with nothing marking which rows are fresh. The skill then says to build the
  AUDIT.md score table from "the console summary" (SKILL.md lines 99–101), so stale rows can flow
  straight into findings.
* A repeat-only run (`--visits repeat`) first executes a priming pass named `${name}-prime`
  (line 64) whose reports land in the same dir; the summary prints the throwaway priming row
  (`phone-portrait-repeat-prime`) as if it were a measurement.

#### Proposed solution

Track the names actually run this invocation (they're already computed in the main loop) and have
`printSummary(names)` read only those files; alternatively write priming output to a temp subdir and
filter `-prime` from the glob. Keeping the "read whatever's there" behavior behind an explicit
`--summarize-existing` flag would preserve the re-summarize use case without contaminating fresh
runs.

### [Docs] build skill says the reveal command opens "Explorer" — Windows was dropped (ADR-0062)

**File(s):** `.ruler/skills/build/SKILL.md` (line 60) @ 9ae62ff1

**Priority:** P4

#### Problem

Step 6 of the Android flow: "that `npm run android:open` will reveal the file in Explorer." Explorer
is the Windows file manager; Windows dev support was dropped in ADR-0062 and conventions.md ships
the cross-platform phrasing already — `scripts-info` for `ios:open` says "Reveal … in the OS file
manager" and the opener is the platform-neutral `scripts/open-path.mjs`. On the supported platforms
(macOS/Linux) the sentence names a program that doesn't exist there.

#### Proposed solution

"…will reveal the file in the OS file manager" (matching the scripts-info wording).

### [Docs] skill-forks and per-skill notes are documented as populated trees, but zero instances exist

**File(s):** `.ruler/agent-files.md` (lines 12–19, 24–28), `.ruler/knowledge-map.md` (lines 5–6),
`.ruler/skill-notes/README.md` (lines 3–4, 12–22) @ 9ae62ff1

**Priority:** P5

#### Problem

The instructions describe `.ruler/skill-forks/<runner>/skills/<name>/` ("Its complete, independent
packages live in…") and per-skill notes ("one file per skill, named after it") in the present
indicative, but neither exists: there is no `.ruler/skill-forks/` directory at all, and
`.ruler/skill-notes/` contains only `README.md` — no note file for any of the 31 shared skills. The
machinery is real (`scripts/apply-ruler-skill-forks.mjs` runs cleanly against the missing dir —
"applied 0 runner-specific skill(s)" — and has tests), so this is convention-ahead-of-content rather
than rot; but an agent sent to "check the skill's notes" or locate a fork package burns a search
cycle before concluding the trees are empty, and nothing in the text licenses that conclusion.

#### Proposed solution

One clause in each spot: e.g. agent-files.md — "…live in
`.ruler/skill-forks/<runner>/skills/<name>/` (none currently exist; the mechanism is exercised by
`scripts/tests/`)"; skill-notes README — "one file per skill, named after it (absent until a skill
accrues design history — currently only the direct `burn-down-audits` notes exist, in the provider
trees)". Cheap, and it converts a dead-end search into a one-line read.

### [Readability] Stray apostrophe garbles the address-pr-review handoff sentence in leave-pr-review

**File(s):** `.ruler/skills/leave-pr-review/SKILL.md` (lines 105–107) @ 9ae62ff1

**Priority:** P5

#### Problem

The closing paragraph reads: "…and know that working through those comments is `address-pr-review`'
job on the other side." — a code span followed by a bare apostrophe
(`` `address-pr-review`' job ``), which renders as a dangling quote rather than a possessive.
Trivial, but it sits in the sentence that wires the two PR skills together, and the sister skill's
mirror sentence (address-pr-review line 13) is clean.

#### Proposed solution

Reword to avoid possessive-on-code-span: "…working through those comments is the job of
`address-pr-review` on the other side."
