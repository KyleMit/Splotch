# max-lines-per-function plan (2026-09-24)

Target: ESLint `max-lines-per-function` over app code (`web/src/**/*.{ts,svelte}`, excluding
`*.test.ts`), hard cap 125 in CI and a soft target of 100. Options:
`{ max: 125, skipBlankLines: true, skipComments: true, IIFEs: true }`.

Line limits are smells, not rules: a function is split only where the result is genuinely cleaner (a
named step with a narrow signature, a pure helper testable on its own, a sub-factory with a real
responsibility). Where it does not separate cleanly, its file gets a per-file override at the
longest function + 25.

## Baseline

Measured on origin/main at f80a9372c with:

```bash
npx eslint --no-warn-ignored \
  --rule '{"max-lines-per-function":["warn",{"max":1,"skipBlankLines":true,"skipComments":true,"IIFEs":true}]}' \
  -f json 'web/src/**/*.ts' 'web/src/**/*.svelte'
```

2532 app functions measured; 17 over 100, 9 over 125, 5 over 150, 3 over 200. Each candidate lives
in a different file and no two share a test file, so every function is its own unit.

| Lines | Function                       | Location                                         |
| ----- | ------------------------------ | ------------------------------------------------ |
| 251   | `createParentalGate`           | `web/src/lib/state/parentalGate.svelte.ts:192`   |
| 237   | `dragToClear`                  | `web/src/lib/actions/dragToClear.ts:55`          |
| 203   | `createPWAUpdates`             | `web/src/lib/pwa/updates.ts:86`                  |
| 164   | `createInstall`                | `web/src/lib/state/install.svelte.ts:99`         |
| 160   | `createInkMotion`              | `web/src/lib/drawing/inkMotion.ts:47`            |
| 143   | `scribbleTap`                  | `web/src/lib/actions/scribbleGuard.ts:138`       |
| 139   | `createSettings`               | `web/src/lib/state/settings.svelte.ts:258`       |
| 132   | `buildEngineApi`               | `web/src/routes/dev/engine/+page.svelte:117`     |
| 130   | `toolbarGlassPanes`            | `web/src/lib/glassPanes.ts:134`                  |
| 119   | `createFreeGenerations`        | `web/src/lib/state/freeGenerations.svelte.ts:78` |
| 117   | `createAiGeneration`           | `web/src/lib/state/aiGeneration.svelte.ts:110`   |
| 116   | `edgeMargins`                  | `web/src/lib/drawing/magicSheetEdges.ts:31`      |
| 114   | `installWebBackHandler`        | `web/src/lib/boot/webBackHandler.ts:48`          |
| 112   | `createColoringPackDownloader` | `web/src/lib/coloringPacks/manager.ts:88`        |
| 112   | `createLayout`                 | `web/src/lib/state/layout.svelte.ts:45`          |
| 108   | `createSaveFailure`            | `web/src/lib/state/saveFailure.svelte.ts:63`     |
| 102   | `composeExportPng`             | `web/src/lib/drawing/exportDrawing.ts:201`       |

Just under the soft target, not candidates: the `POST` handler in
`web/src/routes/api/generate-image/+server.ts` (100), `createAiProgress` (98).
