# ADR-0045: Coloring-Picker Thumbnails + Prefetch (Two Resolutions per Page)

**Status:** Active — the 2026-07-31 thumbnail decode bridge is superseded by the 2026-08-01
amendment, the 2026-08-02 issue #621 amendment adds responsive web presentation, the 2026-08-08
amendment reuses derivatives for screen-sized web/native packs, and the 2026-08-20 amendment retires
raster page thumbnails after vector overlays shipped. **Date:** 2026-07

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
ready, so strokes cannot sample the previous page. Export observes the same ready gate and therefore
receives either the correct composition or no overlay during the decode window. The generator and
catalog no longer produce or ship alpha overlay thumbnails; picker thumbnails remain unchanged. The
next amendment separates the ready element's presentation candidate from the canonical bytes used
once export begins.

### 5. Responsive web presentation; canonical export and offline authority

**Amendment (2026-08-02, issue #621).** The escalation anticipated below is now implemented with
`srcset` rather than more semantic suffixes. Web builds offer one generated candidate beside each
canonical picker thumbnail and canvas overlay:

* `/coloring/max-240px/` bounds picker images to a 240 px longest edge (240 px covers and landscape
  thumbs; 160 px portrait widths).
* `/coloring/max-1152px/` bounds canvas overlays to a 1,152 px longest edge (768 px portrait widths
  and 1,152 px landscape widths).

`books.ts` owns the source URL, candidate URL, intrinsic width descriptors, and generated-asset
inventory. The picker publishes layout-specific `sizes`; the canvas publishes its locked paper
width. Native builds omit `srcset` and strip both responsive directories from the initial bundle. At
the time of this amendment, downloaded native packs retained the prior single-canonical behavior;
section 6 supersedes that download behavior. `gen:coloring-responsive` deterministically derives all
candidates, and the catalog fidelity test checks dimensions, alpha preservation, overlay channel
error, and total byte savings against those same catalog records.

The DOM's ready-gated image may decode a responsive candidate on web. That is presentation only: the
element's `src` remains the canonical root URL, and every exported drawing resolves that URL.
`engine.exportCanvasBlob()` captures the active ready overlay source synchronously with the stroke
snapshot. The save-time compositor reuses an already decoded canonical image when available or loads
the canonical URL on demand before drawing/bitmap transfer. Screenshot, save-on-delete, and AI
preview/upload all use that central path. A canonical load failure rejects the export; it never
silently omits the overlay or substitutes the selected low-resolution candidate.

The responsive derivatives are network-only service-worker routes, not precache entries (ADR-0022).
Offline, a request for a responsive candidate maps explicitly to the corresponding revisioned
canonical entry. This removes 11.66 MiB of duplicate install data while retaining the complete
canonical coloring catalog. Production PWA tests clear the HTTP cache and decode the responses
selected at DPR 1 and DPR 3, so both the responsive URL path and its canonical fallback bytes are
exercised.

**Amendment (2026-08-08, issue #200).** [ADR-0103](0103-progressive-coloring-book-packs.md) makes
that canonical offline authority progressive. Farm's canonical runtime set remains in the initial
install; each other book's cover, thumbnails, overlays, and fills is verified and published as one
background pack. Picker prefetch observes only the installed-book list, so it cannot request or
advertise an incomplete book. Responsive web requests still fall back to the corresponding canonical
URL, whether that URL is in Farm's Workbox precache or a downloaded pack cache.

### 6. Screen-sized downloaded packs on web, Android, and iOS

**Amendment (2026-08-08).** The responsive generator also derives every light/night Magic fill at
the 1,152 px tier. A book therefore has a complete compact runtime inventory: canonical 400 px cover
thumbnails plus 1,152 px overlays and fills, all mapped to the same logical canonical paths as the
full tier. Keeping thumbnails canonical avoids softening 2× and 3× picker tiles; they account for
little of the pack saving. The fidelity test regenerates every derivative byte-for-byte, so changing
a master without rerunning `gen:coloring-responsive` fails rather than leaving a stale rendition.

The pack manifest carries `compact` and `full` variants. Selection uses the device's full screen in
CSS pixels, the true device pixel ratio, and the contained 3:2 paper geometry. Compact is selected
only when the paper's required long edge fits within the 1,152 px asset. The drawing canvas's 2×
render-scale cap (ADR-0015) does not apply: line art is an `<img>` rasterized at the device's true
DPR. This keeps downloaded bytes consistent with web `srcset` width descriptors and limits compact
selection to screens that do not upscale its line art. The screen rather than the current viewport
makes the choice stable across rotation and split-view changes.

Each manifest file has a logical `path` and, when the selected bytes differ, a tier-specific
`downloadPath`; parsing defaults an omitted `downloadPath` to `path` to avoid repeating every
canonical URL on the wire. Web Cache Storage fetches the resolved download path but stores it under
the logical path; Android WorkManager and iOS background `URLSession` do the same in app-private
storage. Every existing WebView consumer therefore keeps resolving the canonical URL shape, while
the installed bytes match the device. Native `<img>` elements still omit `srcset`: their whole local
book has already been selected, so a second per-element mechanism would only create missing local
candidate URLs.

The Farm starter book remains full resolution in the initial PWA/native bundle. It is the complete
offline baseline and cannot be selected per device inside one static Capacitor bundle without
shipping both copies. Android `drawable-*dpi` and iOS asset-catalog scales were rejected for this
catalog: they select compiled native UI resources, while these files are WebView content and
post-install background downloads. Moving them into native resources would duplicate the catalog,
require a native resource bridge, and still not solve web delivery.

### 7. Reuse invariant SVG overlays in page selectors

**Amendment (2026-08-20).** ADR-0129 shipped one transparent SVG per page orientation and theme.
Those files are small enough to serve both the picker and the canvas, so page tiles and the
active-page chip now use the exact `pageOverlayImage()` URL the canvas applies. They publish no
`srcset` or `sizes`, and ordinary transparent source-over rendering replaces the raster picker's
blend/filter treatment.

Book covers remain raster thumbnails even though their canonical line-art masters are SVG.
`gen:coloring-thumbs` rasterizes `cover.overlay.svg` and `cover.dark.overlay.svg` into
`cover.thumb.webp` and `cover.chalk.thumb.webp`; `responsiveColoringAssets()` retains only those
cover candidates and the compact fill tier. The 192 canonical page thumbnails and their 192
`max-240px` derivatives are removed from the app, PWA precache, and downloadable packs. Book hover
now prefetches the six SVGs the page grid will render, while page hover warms the same URL for
selection; the existing dedupe keeps that from creating a second request. Selection cancels detached
prefetches for other pages but leaves the decoded grid images intact: they are no longer
lower-resolution transfers competing with the selected overlay, and preserving the selected SVG lets
WebKit reuse its decoded resource.

## Consequences

* **+** Page grids reuse the already-shipped SVG presentation files; 384 redundant raster page
  thumbnails and responsive derivatives leave the repository and runtime inventories.
* **+** The steady-state web overlay uses the browser-selected resolution appropriate for the locked
  paper width, and its decode window preserves the paper texture instead of displaying an opaque
  substitute. Export still resolves the canonical logical source; a compact downloaded pack may
  provide screen-sized bytes at that path.
* **+** Prefetch turns each hop (open → book → apply) from first-fetch latency into a cache hit on
  the common path — measured at 14–137× faster first open and 1.5–44× faster page-apply (see
  **Measured impact** below).
* **+** Save and Magic-fill state follow the same ready gate: a pending composition cannot export a
  thumbnail or paint with the previous page's fill.
* **−** A Magic stroke made during that gate is recorded as an undoable command but stays invisible
  until the selected fill raster is ready; the ready repaint reveals it against the new page. This
  preserves the child's gesture and Undo entry instead of dropping input based on network timing.
* **+** `pageOverlayImage()` and `bookAssetPaths()` keep picker, canvas, packs, asset checks, and
  native stripping on one page-preview inventory.
* **−** Page-grid decode cost now follows the SVG complexity rather than a fixed raster dimension;
  physical-device picker opening and scrolling are release gates for future traces.
* **−** A cold constrained connection shows textured blank paper until the full-resolution alpha
  overlay decodes. This is deliberate: the retired bridge remained blank for its own transfer and
  then substituted visibly soft art for the rest of the window.

* **+** Responsive presentation reduces cold web transfer and decode cost. Screen-sized downloaded
  packs extend the same generated catalog to web, Android, and iOS without changing consumer URL
  shapes.

* **+** A compact seven-book background install transfers about 19.3 MiB instead of 28.3 MiB, a
  31.6% reduction, while denser phones and tablets retain the full tier.
* **−** The web catalog carries 208 deterministic raster derivatives. They are committed and
  drift-guarded, but excluded from the PWA precache so installs do not store both resolutions.

### Superseded escalation threshold

The earlier instruction to adopt `srcset` if more sizes became necessary was exercised by the
2026-08-02 amendment. Future tiers belong in the same catalog/generator contract; they must not add
new semantic filename suffixes or enter the PWA precache without revisiting ADR-0022's byte budget.

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
