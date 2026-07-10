# ADR-0045: Coloring-Picker Thumbnails + Prefetch (Two Resolutions per Page)

**Status:** Active
**Date:** 2026-07

## Context

The Coloring Book Picker (`ColoringBook.svelte`) renders every book cover and,
inside a book, every page as a grid tile. Each tile paints at roughly 140–300 px,
but the source art shipped at a **single, full resolution** sized for the
full-screen canvas overlay: covers are 1024×1024 (~84 KB) and pages are
1024×1536 / 1536×1024 (~120 KB each). So the grid downloaded **5–8× more pixels
than it ever painted** — across ~100 images that is **~10 MB** of grid-facing
bytes, all decoded to draw thumbnails. On a cold visit (before the service worker
precache is populated) the grid visibly popped in slowly, and the tiles used
`loading="lazy"` with nothing warming the cache, so each asset was fetched
full-res on demand the moment the modal opened.

Two independent problems:

1. **Wrong resolution for the grid.** One image served two purposes — a tiny
   selector tile and a full-canvas overlay — at the overlay's resolution.
2. **No prefetch.** Nothing primed the cache ahead of need, so opening the
   picker, entering a book, and applying a page each paid first-fetch latency.

## Decision

Ship **two resolutions of the same art** and **prefetch along the interaction
path**.

### 1. A `.thumb.webp` sibling for every cover and page

`tools/asset-gen/gen-coloring-thumbs.mjs` (`npm run gen:coloring-thumbs`) uses `sharp` to
write a `{name}.thumb.webp` beside every full-res source — longest edge 400 px
(covers a 2× DPR ~200 px tile), quality 80. A thumbnail is ~15 KB vs. the source's
~84–120 KB, so regenerating the whole set saves ~9 MB. The colored `.light.webp`
fills (the magic brush's reveal layer, ADR-0043) are skipped; they're never shown
in the picker, so they get no thumbnail.

- **Grid tiles** (`ColoringBook.svelte`) use `thumbPath(src)`.
- **The canvas overlay** (`#coloringOverlay` in `DrawingCanvas.svelte`) keeps the
  **full-res** source — it fills the screen, and the existing E2E assertion
  (`flows.spec.ts`, overlay `src` matches `/-(wide|tall)\.outline\.webp$/`) pins that.

`books.ts` is the single mapping point: `thumbPath()` derives the thumb path
(`x.outline.webp` → `x.thumb.webp`), and `bookAssetPaths()` returns **both** the full-res
paths and their thumbs. That one change flows to both tools that consume it —
`check-assets.mjs` now validates the thumbs exist (200 assets, up from 100), and
`strip-native-assets.mjs` removes a web-only book's thumbs alongside its source.
The thumbs match the PWA `globPatterns` `**/*.webp`, so they're precached and
revisioned by content md5 exactly like the sources (ADR-0042) — no new cache
bookkeeping.

### 2. Prefetch along the path, not all at once

`$lib/imagePrefetch.ts` warms URLs via a detached `Image()` (deduped per session,
no-op under SSR). Three triggers, each one step ahead of need:

- **Cover thumbs** — warmed once at idle when the picker mounts (`requestIdleCallback`,
  `setTimeout` fallback for iOS, mirroring `preloadDrawSounds`), so the **first**
  open paints instantly.
- **A book's page thumbs** — warmed on `pointerenter`/`pointerdown` of its tile,
  before the sub-grid renders.
- **A page's full-res overlay** — warmed on `pointerenter`/`pointerdown` of its
  tile, so applying it to the canvas is immediate.

Prefetch is deliberately **scoped to the thumbnails plus the one full-res image
the pointer is over** — warming all ~100 full-res images on open would re-create
the original slowness, just earlier.

## Consequences

- **+** Grid downloads drop ~85% (thumbnails ~15 KB vs. 84–120 KB); the picker
  paints fast even on a cold visit, and decode cost per tile falls with the pixel
  count.
- **+** The overlay stays full-res — no quality loss where it's shown large.
- **+** Prefetch turns each hop (open → book → apply) from first-fetch latency
  into a cache hit on the common path — measured at 14–137× faster first open
  and 1.5–44× faster page-apply (see **Measured impact** below).
- **+** One derivation point (`thumbPath` + `bookAssetPaths`) keeps the catalog,
  the asset check, and the native strip in agreement automatically.
- **−** ~100 new committed binary files and roughly a doubling of the coloring
  precache entry count (still small — thumbs are tiny). Regenerate with
  `npm run gen:coloring-thumbs` whenever a source page changes; `check:assets`
  fails loudly if a thumb is missing.
- **−** Two files per page to keep in sync. The generator is the source of truth
  and is idempotent, so the sync step is "re-run the script," not hand-editing.

### When to escalate

If more than two sizes are ever needed (e.g. a distinct 2-up vs. 3-up grid
density), move to a `srcset`/`<picture>` responsive-image approach rather than
adding more hand-named suffixes.

## Measured impact (prefetch A/B, 2026-07)

The two decisions are separable, so the prefetch was validated **independently
of the thumbnail size win**. The production build was driven headless
(Playwright + CDP network throttling) with the prefetch ON (this code) vs. OFF
(`prefetchImages` neutered) — **thumbnails stayed on in both arms**, so the
numbers below are the prefetch's *marginal* contribution on top of the smaller
tiles, not a re-count of the byte savings. 4 cold-context trials per cell; two
network profiles (slow-4g ≈ 400 kbps/400 ms RTT, fast-4g ≈ 4 Mbps/40 ms).

**First open of the picker — all 8 covers decoded:**

| Network | ON | OFF | Prefetch saves |
| --- | --- | --- | --- |
| slow-4g | 27 ms | 3,632 ms | −3.6 s (137×) |
| fast-4g | 27 ms | 378 ms | −351 ms (14×) |

ON warmed 8/8 covers on idle → **0 bytes** fetched on the open click; OFF fetched
154 KB on the click. This is the unconditional headline win — the idle warm gets
seconds of lead, so the first open is effectively instant on any network.

**Pick a page → full-res art on the canvas (121 KB overlay):**

| Network | Interaction | ON | OFF | Prefetch saves |
| --- | --- | --- | --- | --- |
| slow-4g | tap (~120 ms lead) | 6,200 ms | 9,372 ms | −3.2 s (1.5×) |
| slow-4g | hover (~600 ms lead) | 5,717 ms | 8,915 ms | −3.2 s (1.6×) |
| fast-4g | tap (~120 ms lead) | 523 ms | 837 ms | −314 ms (1.6×) |
| fast-4g | hover (~600 ms lead) | 10 ms | 452 ms | −442 ms (44×) |

Transferred bytes were identical (120,996 B) in every cell — the prefetch changes
*when* bytes move (jumping the overlay request ahead of the click-time
color-sheet fetch, ADR-0043), not how many.

**Caveat — the overlay warm is dwell-dependent.** It becomes a true instant
cache-hit only when the pointer lingers long enough to finish the 121 KB download
before the click (fast-4g hover: 10 ms, 44×). On a **touch tap** — the primary
tablet path, which has no hover — the lead is only the pointerdown→click gap
(~120 ms), so it still saves 0.3–3.2 s from the queue-jump but is not instant on a
weak link. The cover-grid idle warm has no such caveat: its lead is seconds, so it
lands for touch and pointer alike.
