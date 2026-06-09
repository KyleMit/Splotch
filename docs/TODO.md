# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.

- [ ] **[Extract] calculateStrokeSpeed** — File: `src/lib/drawing/engine.ts`, ~line 280
  The sliding-window velocity calculation in `draw()` (lines 280–292) maintains a timestamped sample array, trims stale entries, sums covered distance, and divides by the window span. Currently inline in the hot pointer-move path. Extract into:
  `function calculateStrokeSpeed(samples: { t: number; distance: number }[], newSample: { t: number; distance: number }, windowMs: number): number`
  Live in the same file. Makes `draw()` read as intent (track position → compute speed → stroke → notify) and makes the algorithm independently unit-testable.

- [ ] **[Extract] findHexagonInPicker** — File: `src/lib/components/ColorPicker.svelte`, ~line 47
  The same two-step pattern — `element?.closest?.('.hexagon') as HTMLElement | null` then validate `pickerEl.contains(hex)` and read `hex.dataset.color` — appears in both `handlePickerMove` (lines 47–53) and `handlePickerUp` (lines 61–65). Extract into:
  `function findHexagonInPicker(x: number, y: number, pickerEl: HTMLElement): string | null`
  Live in the same `<script>` block. Returns the color string or null, eliminating the duplication and naming the "hit-test the picker for a hovered color" intent.

- [ ] **[Extract] buildPromptForStyle** — File: `src/routes/api/generate-image/+server.ts`, ~line 111
  Lines 111–115 look up a style suffix and append it to the default prompt. Extract into:
  `function buildPromptForStyle(style: FormDataEntryValue | null, defaultPrompt: string, suffixes: Record<string, string>): string`
  Live in the same file (or move to `$lib/ai/styles.ts` alongside `STYLE_SUFFIXES`). Pure function; makes the prompt-composition step testable without an HTTP context.

- [ ] **[Extract] extractImagePart** — File: `src/routes/api/generate-image/+server.ts`, ~line 156
  Lines 156–162 navigate the Gemini response shape (`candidates[0].content.parts`), find the image part, and construct a diagnostic reason string from the text part or finish reason on failure. Extract into:
  `function extractImagePart(response: GenerateContentResponse): { data: string; mimeType: string }`  (throws on missing image)
  Live in the same file. Isolates the response-parsing contract from the HTTP handler and makes the fallback-reason logic legible on its own.

- [ ] **[Extract] getPolaroidFrameOffset** — File: `src/lib/drawing/screenshot.ts`, ~line 117
  Inside `playPolaroidAnimation()`, lines 117–127 compute the pixel offset from the screenshot button's center to the viewport center (used as CSS `--from-x` / `--from-y` on the polaroid frame). Extract into:
  `function getPolaroidFrameOffset(buttonRect: DOMRect): { fromX: number; fromY: number }`
  Live in the same file. Pure geometry; independently testable and separates layout math from DOM mutation in `playPolaroidAnimation`.
