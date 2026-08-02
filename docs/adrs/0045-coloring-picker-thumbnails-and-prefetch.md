# ADR-0045: Coloring-Picker Thumbnails + Prefetch (Two Resolutions per Page)

**Status:** Active — the 2026-07-31 thumbnail decode bridge is superseded by the 2026-08-01
amendment below. **Date:** 2026-07

## Context

The Coloring Book Picker (`ColoringBook.svelte`) renders every book cover and, inside a book, every
page as a grid tile. Each tile paints at roughly 140–300 px, but the source art shipped at a
**single, full resolution** sized for the full-screen canvas overlay: covers are 1024×1024 (~84 KB)
and pages are 1024×1536 / 1536×1024 (~120 KB each). So the grid downloaded **5–8× more pixels than
it ever painted** — across ~100 images that is **~10 MB** of grid-facing bytes, all decoded to draw
thumbnails. On a cold visit (before the service worker precache is populated) the grid visibly
popped in slowly, and the tiles used `loading="lazy"` with nothing warming the cache, so each asset
was fetched full-res on demand the moment the modal opened.

Two independent problems:

1. **Wrong resolution for the grid.** One image served two purposes — a tiny selector tile and a
   full-canvas overlay — at the overlay's resolution.
2. **No prefetch.** Nothing primed the cache ahead of need, so opening the picker, entering a book,
   and applying a page each paid first-fetch latency.

## Decision

Ship **two resolutions of the same art** and **prefetch along the interaction path**.

### 1. A `.thumb.webp` sibling for every cover and page

`tools/asset-gen/bin/gen-coloring-thumbs.mjs` (`npm run gen:coloring-thumbs`) uses `sharp` to write
a `{name}.thumb.webp` beside every full-res source — longest edge 400 px (covers a 2× DPR ~200 px
tile), quality 80. A thumbnail is ~15 KB vs. the source's ~84–120 KB, so regenerating the whole set
saves ~9 MB. The colored `.light.webp` fills (the magic brush's reveal layer, ADR-0043) are skipped;
they're never shown in the picker, so they get no thumbnail.

* **Grid tiles** (`ColoringBook.svelte`) use `thumbPath(src)`.
* **The canvas overlay** (`#coloringOverlay` in `DrawingCanvas.svelte`) keeps the **full-res**
  source — it fills the screen, and the existing E2E assertion (`flows-coloring-book.spec.ts`,
  overlay `src` matches `/-(wide|tall)\.outline\.webp$/`) pins that.

`books.ts` is the single mapping point: `thumbPath()` derives the thumb path (`x.outline.webp` →
`x.thumb.webp`), and `bookAssetPaths()` returns **both** the full-res paths and their thumbs. That
one change flows to both tools that consume it — `check-assets.mjs` now validates the thumbs exist
(200 assets, up from 100), and `strip-native-assets.mjs` removes a web-only book's thumbs alongside
its source. The thumbs match the PWA `globPatterns` `**/*.webp`, so they're precached and revisioned
by content md5 exactly like the sources (ADR-0042) — no new cache bookkeeping.

**Amendment (2026-07-13) — thumbnails are theme-forked like the line art.** Since the pen/chalk fork
(ADR-0052; `tools/asset-gen/docs/pen-chalk-fork.md`), each page's dark-mode canvas overlay is a
dedicated CHALK outline, so a pen-derived tile previewed different art than the canvas applied.
`gen-coloring-thumbs.mjs` now also writes a `{name}.chalk.thumb.webp` beside every
`{name}.chalk.webp`, `chalkThumbPath()` maps one to the other, and the picker's page tiles pick per
theme via `pageThumb(page, orientation, resolvedTheme())` — dark mode shows the chalk thumb
(ink-on-white, rendered as white chalk by the tile's existing `--lineart-*` treatment), falling back
to the inverted pen thumb where no chalk exists. Covers have no chalk yet, so book tiles stay on
`thumbPath(book.cover)`.

### 2. Prefetch along the path, not all at once

`$lib/imagePrefetch.ts` warms URLs via a detached `Image()` (deduped per session, no-op under SSR).
Three triggers, each one step ahead of need:

* **Cover thumbs** — warmed once at idle when the picker mounts (`requestIdleCallback`, `setTimeout`
  fallback for iOS, mirroring `preloadDrawSounds`), so the **first** open paints instantly.
* **A book's page thumbs** — warmed on `pointerenter`/`pointerdown` of its tile, before the sub-grid
  renders.
* **A page's full-res overlay** — warmed on `pointerenter`/`pointerdown` of its tile, so applying it
  to the canvas is immediate.

Prefetch is deliberately **scoped to the thumbnails plus the one full-res image the pointer is
over** — warming all ~100 full-res images on open would re-create the original slowness, just
earlier.

### 3. Apply the selected page visible-first and cancel obsolete picker transfers

**Amendment (2026-07-31).** A touch device does not provide enough pointer dwell for the selected
full-resolution image to finish before the click. Worse, closing the picker left its detached
prefetches and hidden grid images competing with the selected page, the Magic Brush fill, and the
opposite-orientation line art. On a throttled cold load, the canvas stayed blank for 1.8 seconds on
fast 4G and several seconds on the constrained profile. That transient blank interval was reported
on the physical iPad as both a slow page selection and a page landing off-center. The final overlay
geometry was correct: `#coloringOverlay` and `#drawingCanvas` had identical
`{ x: 84, y: 0, width: 1282, height: 934 }` bounds.

Page application is now a visible-first sequence:

1. The theme- and orientation-matched picker thumbnail becomes the canvas overlay immediately.
   Thumbnail and full art share an aspect ratio and registration, so it stays centered while the
   higher-resolution sibling decodes.
2. The selected full-resolution line art receives high fetch priority and replaces the thumbnail
   only after `decode()` resolves.
3. Detached speculative images are tracked by `$lib/imagePrefetch.ts`. Selecting a page cancels
   every active prefetch except that selected full-resolution URL and removes `src` from the closing
   dialog's grid images. Cancelled URLs are removed from the warm set so reopening can fetch them
   again.
4. The Magic Brush fill and the alternate-orientation line art do not start until the visible
   full-resolution line art has decoded. They cannot take connection slots from the page the child
   just chose.
5. The dark-mode prefetch uses `pageOverlayImage()`, the same helper as the canvas, so it warms the
   chalk image instead of the unused pen sibling.

The full-resolution image remains the steady state. The thumbnail is an explicit progressive-image
fallback: on the physical iPad it lasted 19 ms; on fast 4G it lasted 300 ms. On the intentionally
extreme link it remains soft for about three seconds, but the correctly centered page is usable in
the first frame instead of leaving the child on a blank canvas.

### 4. Retire the thumbnail decode bridge; keep request prioritization

**Amendment (2026-08-01, issue #693).** The progressive canvas thumbnail was removed after
cold-cache measurements showed that it did not solve the transfer gap it targeted. Network
throttling alone hid the problem behind cache hits; the reproducing gate clears the browser cache
through CDP immediately before applying a page and then enables Slow 3G.

The first bridge used the picker's opaque ink-on-white thumbnail, which covered the paper texture
and rendered with the wrong polarity in dark mode. A follow-up alpha-thumbnail bridge fixed that
compositing defect but retained the low-resolution full-canvas swap, a separate cold transfer, and
192 bridge-only assets. Under the reproducing profile the 400×267 alpha thumbnail became complete at
about 1.2–1.5 seconds and the 1536×1024 overlay replaced it at about 1.9–3.2 seconds. The bridge
therefore showed no art during the first transfer and then showed visibly soft art only until the
real file arrived.

When a new page composition is selected, `DrawingCanvas.svelte` now clears the displayed overlay,
decodes only the full-resolution alpha overlay off-DOM at high fetch priority, and fades it in when
ready. The textured paper stays visible throughout the decode window. A same-composition theme
sibling may keep the prior full-resolution overlay until its registered sibling decodes; no
thumbnail participates. The transfer cancellation, high-priority selected request, deferred Magic
fill, and alternate-orientation idle warm from the earlier amendment remain.

Clearing the displayed composition also clears the active Magic fill until the selected overlay is
ready, so strokes cannot sample the previous page. Screenshot export reads the same ready-gated
overlay element and therefore receives either the correct full-resolution art or no overlay during
the decode window. The generator and catalog no longer produce or ship alpha overlay thumbnails;
picker thumbnails remain unchanged.

## Consequences

* **+** Grid downloads drop ~85% (thumbnails ~15 KB vs. 84–120 KB); the picker paints fast even on a
  cold visit, and decode cost per tile falls with the pixel count.
* **+** The steady-state overlay stays full-res, and its decode window preserves the paper texture
  instead of displaying a low-resolution or opaque full-canvas substitute.
* **+** Prefetch turns each hop (open → book → apply) from first-fetch latency into a cache hit on
  the common path — measured at 14–137× faster first open and 1.5–44× faster page-apply (see
  **Measured impact** below).
* **+** Save and Magic-fill state follow the same ready gate: a pending composition cannot export a
  thumbnail or paint with the previous page's fill.
* **−** A Magic stroke made during that gate is recorded as an undoable command but stays invisible
  until the selected fill raster is ready; the ready repaint reveals it against the new page. This
  preserves the child's gesture and Undo entry instead of dropping input based on network timing.
* **+** One derivation point (`thumbPath` + `bookAssetPaths`) keeps the catalog, the asset check,
  and the native strip in agreement automatically.
* **−** ~100 picker-thumbnail binary files and roughly a doubling of the picker-facing coloring
  precache entry count (still small — thumbs are tiny). Regenerate with
  `npm run gen:coloring-thumbs` whenever a source page changes; `check:assets` fails loudly if a
  thumb is missing.
* **−** Two files per page to keep in sync. The generator is the source of truth and is idempotent,
  so the sync step is "re-run the script," not hand-editing.
* **−** A cold constrained connection shows textured blank paper until the full-resolution alpha
  overlay decodes. This is deliberate: the retired bridge remained blank for its own transfer and
  then substituted visibly soft art for the rest of the window.

### When to escalate

If more than two sizes are ever needed (e.g. a distinct 2-up vs. 3-up grid density), move to a
`srcset`/`<picture>` responsive-image approach rather than adding more hand-named suffixes.

## Measured impact (prefetch A/B, 2026-07)

The two decisions are separable, so the prefetch was validated **independently of the thumbnail size
win**. The production build was driven headless (Playwright + CDP network throttling) with the
prefetch ON (this code) vs. OFF (`prefetchImages` neutered) — **thumbnails stayed on in both arms**,
so the numbers below are the prefetch's *marginal* contribution on top of the smaller tiles, not a
re-count of the byte savings. 4 cold-context trials per cell; two network profiles (slow-4g ≈ 400
kbps/400 ms RTT, fast-4g ≈ 4 Mbps/40 ms).

**First open of the picker — all 8 covers decoded:**

| Network | ON    | OFF      | Prefetch saves |
| ------- | ----- | -------- | -------------- |
| slow-4g | 27 ms | 3,632 ms | −3.6 s (137×)  |
| fast-4g | 27 ms | 378 ms   | −351 ms (14×)  |

ON warmed 8/8 covers on idle → **0 bytes** fetched on the open click; OFF fetched 154 KB on the
click. This is the unconditional headline win — the idle warm gets seconds of lead, so the first
open is effectively instant on any network.

**Pick a page → full-res art on the canvas (121 KB overlay):**

| Network | Interaction          | ON       | OFF      | Prefetch saves |
| ------- | -------------------- | -------- | -------- | -------------- |
| slow-4g | tap (~120 ms lead)   | 6,200 ms | 9,372 ms | −3.2 s (1.5×)  |
| slow-4g | hover (~600 ms lead) | 5,717 ms | 8,915 ms | −3.2 s (1.6×)  |
| fast-4g | tap (~120 ms lead)   | 523 ms   | 837 ms   | −314 ms (1.6×) |
| fast-4g | hover (~600 ms lead) | 10 ms    | 452 ms   | −442 ms (44×)  |

Transferred bytes were identical (120,996 B) in every cell — the prefetch changes *when* bytes move
(jumping the overlay request ahead of the click-time color-sheet fetch, ADR-0043), not how many.

**Caveat — the overlay warm is dwell-dependent.** It becomes a true instant cache-hit only when the
pointer lingers long enough to finish the 121 KB download before the click (fast-4g hover: 10 ms,
44×). On a **touch tap** — the primary tablet path, which has no hover — the lead is only the
pointerdown→click gap (~120 ms), so it still saves 0.3–3.2 s from the queue-jump but is not instant
on a weak link. The cover-grid idle warm has no such caveat: its lead is seconds, so it lands for
touch and pointer alike.

## Visible-first page-application trials (2026-07-31)

Every trial changed one architecture, reran the same cold-browser probe, and then backed the change
out before the next. The fast profile is 40 ms latency and 4 Mbps down; the constrained profile is
400 ms latency and 400 Kbps down. “Visible” means a correctly registered overlay is painted; “full”
means the 1,536×1,024 art decoded. Most rows use click-to-full time because they intentionally had
no progressive preview.

| #  | Isolated strategy                                          | Profile             | Result                       |
| -- | ---------------------------------------------------------- | ------------------- | ---------------------------- |
| 01 | Existing production path                                   | Fast, immediate tap | Full 1,811 ms                |
| 02 | Theme-aware selected-page prefetch only                    | Fast, immediate tap | Full 1,314 ms                |
| 03 | High-priority off-DOM selected image only                  | Fast, immediate tap | Full 1,315 ms                |
| 04 | Remove eager alternate-orientation prefetch only           | Fast, immediate tap | Full 1,310 ms                |
| 05 | Remove eager Magic Brush fill only                         | Fast, immediate tap | Full 1,825 ms; no gain       |
| 06 | Immediately unmount the active book view                   | Fast, mouse probe   | Full 2,349 ms; no cancel     |
| 07 | Combine theme match, priority, and visible-first deferrals | Fast, immediate tap | Full 805 ms                  |
| 08 | Add `fetchPriority=low` to speculative picker images       | Constrained         | Full 12.4 s; no preemption   |
| 09 | Queue detached cover prefetches serially at idle           | Constrained         | Full 12.4 s; DOM still eager |
| 10 | Use the selected thumbnail as a progressive canvas overlay | Fast, 750 ms dwell  | Visible 47 ms; full 300 ms   |
| 11 | Same progressive overlay                                   | Constrained, 8 s    | Visible 51 ms; full 4.24 s   |
| 12 | Cancel obsolete detached and dialog image transfers        | Constrained, 8 s    | Full 3.07 s                  |
| 13 | Retained combined architecture                             | Fast, immediate tap | Visible 53 ms; full 353 ms   |
| 14 | Retained combined architecture                             | Constrained, 8 s    | Visible 56 ms; full 3,145 ms |
| 15 | Retained architecture, trusted physical-iPad tap           | Local Wi-Fi         | Visible 1 ms; full 20 ms     |

The physical-iPad interaction had a 29 ms maximum frame gap and 14 ms P95, below the shared 33.5 ms
interaction gate. The overlay and canvas bounds remained identical after full decode. A trusted
Magic Brush stroke after the deferred fill loaded held at 25 ms maximum / 10 ms P95.

### Re-attempting the rejected page-load strategies

Drive a production build at iPad Pro geometry (1,366×934 CSS pixels at 2× DPR), use touch input, and
start with a fresh browser context. Enter a book grid, optionally dwell for the named interval, tap
the first page, and record `pointerdown`, `click`, every `#coloringOverlay` `src` mutation, image
natural dimensions, request start/finish times, and `requestAnimationFrame` gaps. A mouse click is
not interchangeable with a touch tap because hover creates download lead time.

To isolate a single request class, preserve all other production behavior and change only one of:

* the current page's pen/chalk prefetch URL;
* the selected request's `fetchPriority`;
* the eager Magic Brush fill;
* the alternate-orientation warm-up;
* the dialog grid's lifetime after close; or
* detached prefetch concurrency.

Browser fetch priority does not interrupt requests that already own connection slots. Likewise,
serializing only detached idle prefetches does not control the real `<img>` elements in the picker.
Removing or hiding a dialog is also insufficient unless its in-flight image requests are explicitly
cancelled. Check the request waterfall rather than inferring cancellation from DOM visibility.

For the retained path, stall the full-resolution request in Playwright and assert that the overlay
has no displayed source or ready class, the textured paper stays visible, and only the
full-resolution art appears after release. No `.overlay.thumb.webp` request may occur. Reopen the
dialog afterward: its cover images must regain `src`, proving cancelled URLs can be warmed again.
Re-run Magic Brush, rotation, theme switching, undo, and screenshot export on the physical device
after changing this ordering.
