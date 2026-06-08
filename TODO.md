# Repository Health TODO

Instructions for the AI agent: address these recommendations one at a time. For each item, inspect the referenced code, make the smallest coherent improvement, run the relevant checks/tests, and then remove that completed recommendation from this file in the same change.

- Fix the PWA precache asset coverage in `vite.config.ts`. Add the app's WebP assets to the Workbox `globPatterns` or otherwise explicitly cache the coloring-book and AI-style images that the offline drawing experience depends on. This improves offline reliability and avoids unnecessary network fetches for the largest static image families.

- Make the drawing engine instance-based instead of module-singleton state in `src/lib/drawing/engine.ts`. Convert globals such as `canvas`, `ctx`, `activePointers`, `undoStack`, callbacks, and virtual-canvas state into fields owned by the object returned from `initDrawingCanvas`, then update callers to use that instance or a narrow exported facade. This improves testability and prevents hidden cross-mount coupling if the canvas is ever remounted, tested in parallel, or embedded more than once.

- Harden canvas resize preservation in `src/lib/drawing/engine.ts`. Review `resizeCanvas()` and the virtual canvas sizing so growing the viewport after the first mount cannot clip existing drawing data; expand or recreate the virtual canvas when needed and add a focused test or dev-page check for orientation/viewport growth. This protects user drawings during responsive layout changes.

- Make undo memory usage explicit in `src/lib/drawing/engine.ts`. The current undo stack stores full canvas snapshots in memory; add a byte/pixel budget, document the budget, and consider lowering `MAX_UNDO_STACK_SIZE` dynamically for very large canvases or storing compressed `ImageBitmap`/blob snapshots if appropriate. This reduces the risk of memory pressure on tablets and mobile WebViews.

- Reduce main-thread work after erasing in `src/lib/drawing/engine.ts`. `scanCanvasIsEmpty()` reads the full canvas after erase completion; replace it with a cheaper dirty-state strategy where possible, constrain scans to affected bounds, or defer the full scan outside the gesture-critical path. This improves responsiveness on large canvases.

- Deduplicate image download and timestamp helpers across `src/lib/drawing/screenshot.ts` and `src/lib/components/AiImageResult.svelte`. Move timestamp creation and browser download-link creation into a small shared helper, then use it from screenshots, AI downloads, and auto-save paths. This improves maintainability and keeps download behavior consistent.

- Factor repeated dialog shell styling into shared classes. `ParentCenter.svelte`, `ColoringBook.svelte`, `AiImagePrompt.svelte`, and `AiImageResult.svelte` each define similar fixed centered dialog, close-button, border-radius, shadow, and content padding rules; move the common shell rules to `src/app.css` or a small shared component/action pattern while keeping per-dialog layout local. This reduces CSS drift and makes modal polish easier to maintain.

- Split `src/lib/components/ClearButton.svelte` into smaller units. Extract the drag-to-clear gesture state/timers into a Svelte action or TypeScript helper, and keep the component focused on markup and visual state. This large component mixes gesture recognition, tutorial timing, canvas clearing, save-on-delete, haptics, and animation cleanup; separating those responsibilities will make regressions easier to isolate.

- Split `src/lib/components/AiImageResult.svelte` into smaller pieces. Extract the progress dial, confetti layer, generated-image stage, and download/saved footer into local child components or helpers. This improves readability and makes it easier to test or tune the AI loading experience without editing a 20k+ byte component.

- Centralize modal open/close and origin behavior where practical. Components currently calculate button-center origins directly before calling `openColoringBook`, `openParentCenter`, and `openAiPrompt`; consider a small helper that turns an element into an origin point and handles null fallbacks consistently. This reduces repeated geometry code and makes future modal triggers less error-prone.

- Add validation for the coloring-book catalog in `src/lib/state/books.ts`. Create a script or unit test that verifies every `cover`, portrait image, and landscape image listed in `BOOKS` exists under `static/coloring`, and that platform filtering still agrees with `scripts/strip-native-assets.mjs`. This catches broken asset references before release.

- Review AI usage logging in `src/routes/api/generate-image/+server.ts` for privacy minimization. Avoid persisting or logging the full generated prompt when it may describe a child's drawing; store only token metadata, style, counts, timestamps, and a short non-sensitive diagnostic if needed. This improves privacy posture while preserving abuse auditing.

- Add server-side image content validation in `src/routes/api/generate-image/+server.ts`. The route checks upload size and declared MIME type, but should also verify the bytes decode as an allowed image type, and ideally reject extreme dimensions before forwarding to Gemini. This improves robustness against malformed uploads and reduces backend resource abuse.

- Add bounded timeouts/cancellation around AI generation. On the client in `src/lib/drawing/aiImage.ts`, use an `AbortController` for the fetch and surface a useful timeout failure; on the server in `src/routes/api/generate-image/+server.ts`, wrap the Gemini call with a clear timeout policy if the SDK does not provide one. This prevents stuck requests from leaving UI and function resources hanging indefinitely.

- Revisit BYOK request throttling in `src/routes/api/generate-image/+server.ts`. BYOK requests do not spend the app's Gemini quota, but they still consume server memory, function time, and network bandwidth; add a modest per-IP or per-key limiter that is high enough for normal use. This protects the backend without changing the billing model.

- Centralize AI model and prompt configuration. Move `MODEL`, `TEST_MODEL`, and the default image prompt/style composition into a shared server-side config module, with clear comments about which values are safe for client import and which are server-only. This makes future model upgrades and prompt tuning less scattered.

- Replace loose `any` typing around the Capacitor Media plugin in `src/lib/drawing/screenshot.ts`. Add a small local interface for the `getAlbums`, `createAlbum`, and `savePhoto` calls used by this file, or import an appropriate plugin type if available. This improves type safety around native gallery saves.

- Do minor import/readability cleanup in `src/lib/components/ClearButton.svelte`. Combine the duplicate imports from `$lib/drawing/engine` and scan nearby components for similar small import/style inconsistencies. This is a low-risk cleanup that reduces noise for future edits.

- Add a lightweight lint/format script to `package.json` if the project wants automated style enforcement beyond `svelte-check`. Evaluate whether Prettier and ESLint are already desired by the repo; if so, add scoped scripts and CI usage without reformatting unrelated files in the same change. This improves consistency and catches maintainability issues earlier.

- Add focused tests for lifecycle cleanup in UI helpers. Cover object URL revocation in `src/lib/state/ui.svelte.ts`, PWA update listener behavior in `src/lib/pwa/updates.ts`, and timer cleanup in `ClearButton.svelte` where feasible. These areas manage external resources and timers, so regression tests would reduce leak risk.
