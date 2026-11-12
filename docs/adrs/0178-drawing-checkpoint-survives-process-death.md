# ADR-0178: Checkpoint the Picture in Progress So It Survives Process Death

**Status:** Active (amends [ADR-0165](0165-android-system-back-plugin.md)'s Leave copy) **Date:**
2026-11

## Context

The drawing route kept ink only in memory: the tiled live canvas and its history (ADR-0085). Every
way the app's process can end lost the page. The RN go/no-go campaign's durability lane (issue 2690;
`durability.md` on `claude/rn-decision-2026-11`) measured it on a Galaxy S21 FE: 30 of 30 page tries
lost the picture, whether the OS reclaimed a backgrounded app, a force-stop landed mid-stroke or
just after a stroke, or the kill came during Save. Nothing was ever corrupted. Shipping also lost
the page without the process dying, through a WebView renderer death and an activity recreation,
both closed separately on Android (`RendererGoneListener.java`, the manifest's `configChanges`). The
iPad's WebContent process can die alone too; Capacitor then reloads the page blank.

Alternatives considered:

* **Persist the op log.** The retained commands are vectors, but the history base folds older
  commands into raster tiles (ADR-0086), so a log alone cannot rebuild the page. Serializing base
  tiles plus ops reproduces this raster checkpoint with more moving parts and a format tied to the
  op vocabulary.
* **Save only when the app is backgrounded.** It cannot cover a death in the foreground (mid-stroke,
  just after a stroke, an ANR), and a frozen background page may never finish the write.
* **Per-tile incremental blobs.** Cheaper writes, but the tile layout follows the window, so a
  restore would have to reconcile layouts. One page-sized image is simpler and is written at most
  once per quiet period.
* **A native snapshot.** Each shell would need its own capture and the web build none at all.

## Decision

`web/src/lib/drawing/drawingCheckpoint.ts` (loaded on demand, outside the startup bundle) keeps one
IndexedDB record, `splotch-drawing-checkpoint`: the page's ink as a transparent PNG, the CSS size of
the paper it covers, and the applied coloring page's id and orientation. The bytes are stored as an
`ArrayBuffer`, not a Blob, for the WKWebView reason `unsavedPictureStore.ts` records. Writes and
removals wait for a `durability: 'strict'` commit, since the record exists for the moment the
process is killed.

* **Capture.** `captureTiledCheckpoint()` takes the settled live tiles (`createImageBitmap`, the
  same read the matched-scale export uses) and the PNG worker composes them on transparent paper,
  with no texture or overlay, at the live render scale. A pointer down makes the capture `busy`; the
  stroke's end is a change of its own.
* **When.** `lib/boot/drawingCheckpoint.svelte.ts` reports every committed change the page can show
  (`canvasState.strokeCount`, `undoCount`, `canvasEmpty`, `coloringBookState.overlayPage`); the
  write runs `CHECKPOINT_QUIET_MS` after the last one, one write at a time with one rerun for
  changes during it, and at once on `visibilitychange` to hidden and `pagehide`.
* **Blank pages.** A page that goes blank removes the record, but only in a launch whose page has
  had ink. A launch that never had ink leaves the record for a later launch that can restore it.
* **Restore.** Before any write, the boot step reads the record (validated from `unknown`), finds
  its coloring page if that page's book is on this device (waiting up to `PACK_DISCOVERY_WAIT_MS`
  for the installed-pack scan), and decodes the PNG. Then, in one synchronous step, it refuses if
  the checkpoint was disposed, a page was chosen meanwhile, or the coloring book was switched off;
  otherwise `restoreDrawing()` hands the ink to the engine, which accepts it only onto an untouched
  page (`canvasEmpty`, no stroke in progress, no history) whose paper has the same CSS size, and
  `restoreTiledBase()` draws it into the history base, scaled to this render scale. The coloring
  page is applied only after the ink was accepted. A restore the page refused is retried when the
  paper's CSS size changes while the page is still untouched. The restored ink is outside the undo
  window: Undo starts empty, and a later Clear is undoable as usual. A picture whose coloring page
  is unavailable is not restored, because its ink without the line art is not the picture the child
  left.
* **Android renderer death.** `RendererGoneListener` starts the activity afresh in a cleared task
  rather than calling `recreate()`. On an API 36 emulator the recreated activity logged Capacitor's
  "Error injecting safe area CSS" and laid the paper out 24 dp shorter than a launch, so the
  checkpoint was refused; the fresh launch lays out as a cold start and restores it.
* **Copy.** Leave Splotch's second sentence now says the drawing comes back if Splotch closes
  (ADR-0165).

`web/tests/drawing-checkpoint.spec.ts` relaunches the app (a reload, the closest a browser gets to
process death): a drawing comes back pixel-identical with Undo disabled, a cleared page stays blank,
a coloring page comes back with its drawing, a restore that lands after the child's first stroke
changes nothing, and a page from a downloaded book comes back after the pack scan. Each fails
without the behaviour it pins.

On an API 36 emulator (Android 16 WebView, debug build) a stroke came back after a renderer kill and
after the campaign's K1 cell (background, then `am kill`). After `am force-stop` it did not in three
of four runs: WebView recreated the origin's IndexedDB directory at the next launch, with no error
logged and 70% of the data partition free. Whether the Galaxy does the same is a pending device
check.

## Consequences

* \+ A process death, a renderer death or a page reload costs at most the changes of the last
  `CHECKPOINT_QUIET_MS` before it, plus a stroke still in progress.
* \+ The same mechanism serves the web build, Android and iOS, with no native code.
* \+ Nothing is added to the startup bundle; the module loads after mount.
* − Each checkpoint reads every live tile back and encodes a page-sized PNG in the PNG worker. On
  Android those read-backs are small GPU-thread tasks; they run only after the page has been quiet,
  never with a pointer down, but their cost on the Galaxy and the iPad is unmeasured.
* − The restore needs paper of the same CSS size. A launch in the other orientation, or a resized
  window, starts blank and keeps the record until the child draws on that page.
* − Undo history does not survive: the restored picture cannot be undone stroke by stroke.
* − A picture on a coloring page from a book no longer on the device does not come back.
* − On native the record lives in WebView storage, which this repo already treats as evictable
  (settings are mirrored to Capacitor Preferences for that reason). On the emulator an explicit
  force-stop wiped it. If a device shows the same, the native checkpoint needs a file store of its
  own, which this decision does not build.
* − The checkpoint is best effort. A failed capture or write leaves the previous record, so a
  relaunch can show the picture as it was one change earlier.
* − A relaunch now shows the previous picture instead of a blank page. A parent who expected a fresh
  page clears it as usual.
