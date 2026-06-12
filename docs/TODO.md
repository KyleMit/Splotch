# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.


- [ ] **[Readability] Remove dead coloring-book overlay state** — File(s): `src/lib/state/coloringBook.svelte.ts`
  `setOverlay()` is exported but never called, and `coloringBookState.overlayPage` is written by `setOverlayPage`/`clearOverlay` but never read anywhere. Delete `setOverlay`. For `overlayPage`: either delete it too, or (better, one small step) use it to re-derive `overlayUrl` when orientation changes so the overlay swaps to the matching tall/wide art on rotation — BACKLOG already tracks "make sure background works horizontally and vertically", and the data to fix it is being stored and thrown away. If taking the rotation fix, the existing orientation listener in `ColoringBook.svelte` can call `setOverlayPage(coloringBookState.overlayPage, newOrientation)` when an overlay page is set.

- [ ] **[Maintainability] `saveScreenshot` reimplements `saveImageBlob`** — File(s): `src/lib/drawing/screenshot.ts`
  `saveScreenshot()` (lines 74–91) duplicates the native-gallery-vs-web-download branch that `saveImageBlob()` already owns, including the same try/catch and error log. Refactor so `saveScreenshot` exports the blob, delegates persistence to `saveImageBlob`, then plays the polaroid. Watch the object-URL lifetime: the polaroid animation needs its own `URL.createObjectURL(blob)` revoked after `POLAROID_DURATION_MS` (the web path of `saveImageBlob` revokes its internal URL immediately, which is fine — just don't share one URL for both).

- [ ] **[Maintainability] Extract the duplicated verify-credential flow in `submitKey`** — File(s): `src/lib/components/parent/AiKeyManager.svelte`
  The BYOK and access-code branches of `submitKey()` are near-identical: POST JSON to a verify endpoint, parse `{ ok }`, persist the credential, `setAiImage(true)`, clear the input, set success/error feedback. Extract a small helper so the two branches each become a few lines and a future third credential type doesn't copy the block a third time. Behavior must stay identical, including the `data.error` passthrough existing only on the API-key path.

- [ ] **[Readability] Fix stale module descriptions in ARCHITECTURE.md** — File(s): `docs/ARCHITECTURE.md`
  Three Source Map rows no longer match the code: `colorRing.ts` is described as "Honeycomb color-ring layout math for the custom color picker" but it computes the selection-ring color for palette swatches (the honeycomb layout is pure CSS in `ColorPicker.svelte`); `drawing/screenshot.ts` is described as "Exports the canvas as a PNG blob" but the export lives in `engine.exportCanvasBlob` — screenshot.ts saves/downloads and plays the polaroid; `pwa/updates.ts` "Detects and prompts for PWA service worker updates" — it applies updates automatically (no prompt). Reword each row to match reality (and re-check after the PWA item above lands).

- [ ] **[Readability] Sweep small dead/stale fragments** — File(s): `src/lib/components/parent/AboutTab.svelte`, `src/lib/components/AiImagePrompt.svelte`
  AboutTab has two consecutive identical `{#if import.meta.env.DEV}` blocks (lines 66–71, the second mis-indented) — merge into one block containing both dev links. AiImagePrompt's comment "The open/close $effect above only revokes on an explicit close" (line 27) refers to an `$effect` that no longer exists — cleanup now happens via the `modalDialog` action's `onClose`; rewrite the comment to say the teardown effect covers the still-open-at-unmount case.
