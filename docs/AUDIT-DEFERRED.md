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
