# Repository Health TODO

Instructions for the AI agent: address these recommendations one at a time. For each item, inspect the referenced code, make the smallest coherent improvement, run the relevant checks/tests, and then remove that completed recommendation from this file in the same change.

- Replace loose `any` typing around the Capacitor Media plugin in `src/lib/drawing/screenshot.ts`. A narrow local interface for `getAlbums()`, `createAlbum()`, and `savePhoto()` would make the contracts visible and catch any API shape changes at compile time. First check whether `@capacitor-community/media` exports a `MediaPlugin` type that can be imported directly — if it does, use that instead of a local interface.

- Do minor import/readability cleanup in `src/lib/components/ClearButton.svelte`. The two imports from `$lib/drawing/engine` (lines 4–5) are split across separate statements and should be combined into one: `import { clearCanvas, releaseAllPointers } from '$lib/drawing/engine';`.
