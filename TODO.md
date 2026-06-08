# Repository Health TODO

Instructions for the AI agent: address these recommendations one at a time. For each item, inspect the referenced code, make the smallest coherent improvement, run the relevant checks/tests, and then remove that completed recommendation from this file in the same change.

- Do minor import/readability cleanup in `src/lib/components/ClearButton.svelte`. The two imports from `$lib/drawing/engine` (lines 4–5) are split across separate statements and should be combined into one: `import { clearCanvas, releaseAllPointers } from '$lib/drawing/engine';`.
