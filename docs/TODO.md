# TODO

> Work through these items one at a time using `/fix-next-todo`.
> After each fix: remove the completed item, run relevant type checks or tests, and suggest a commit message.
> Do **not** `git add` or `git commit` — the user reviews the diff first.


- [ ] **[Maintainability] Extract the duplicated verify-credential flow in `submitKey`** — File(s): `src/lib/components/parent/AiKeyManager.svelte`
  The BYOK and access-code branches of `submitKey()` are near-identical: POST JSON to a verify endpoint, parse `{ ok }`, persist the credential, `setAiImage(true)`, clear the input, set success/error feedback. Extract a small helper so the two branches each become a few lines and a future third credential type doesn't copy the block a third time. Behavior must stay identical, including the `data.error` passthrough existing only on the API-key path.

- [ ] **[Readability] Fix stale module descriptions in ARCHITECTURE.md** — File(s): `docs/ARCHITECTURE.md`
  Three Source Map rows no longer match the code: `colorRing.ts` is described as "Honeycomb color-ring layout math for the custom color picker" but it computes the selection-ring color for palette swatches (the honeycomb layout is pure CSS in `ColorPicker.svelte`); `drawing/screenshot.ts` is described as "Exports the canvas as a PNG blob" but the export lives in `engine.exportCanvasBlob` — screenshot.ts saves/downloads and plays the polaroid; `pwa/updates.ts` "Detects and prompts for PWA service worker updates" — it applies updates automatically (no prompt). Reword each row to match reality (and re-check after the PWA item above lands).

- [ ] **[Readability] Sweep small dead/stale fragments** — File(s): `src/lib/components/parent/AboutTab.svelte`, `src/lib/components/AiImagePrompt.svelte`
  AboutTab has two consecutive identical `{#if import.meta.env.DEV}` blocks (lines 66–71, the second mis-indented) — merge into one block containing both dev links. AiImagePrompt's comment "The open/close $effect above only revokes on an explicit close" (line 27) refers to an `$effect` that no longer exists — cleanup now happens via the `modalDialog` action's `onClose`; rewrite the comment to say the teardown effect covers the still-open-at-unmount case.
