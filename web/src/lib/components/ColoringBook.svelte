<script lang="ts">
  import Icon from './Icon.svelte';
  import { coloringBookModal } from '$lib/state/ui.svelte';
  import {
    setOverlayPage,
    setOverlayOrientation,
    overlayUrl,
    clearOverlay,
  } from '$lib/state/coloringBook.svelte';
  import { isNative } from '$lib/platform';
  import {
    COLORING_IMAGE_SIZES,
    coloringBookGridLayout,
    coloringOverlayImageSize,
    coverThumbImageSource,
    pageOverlayImageSource,
    pageThumbImageSource,
    type Book,
    type ColoringPage,
    type ResponsiveColoringImage,
  } from '$lib/state/books';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { guardTapZone } from '$lib/actions/launchGuard';
  import { layout } from '$lib/state/layout.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { availableColoringBooks } from '$lib/state/coloringPacks.svelte';
  import {
    cancelImageRequest,
    cancelImagePrefetchesExcept,
    prefetchImages,
    type ResponsiveImageRequest,
  } from '$lib/imagePrefetch';
  import { scheduleIdle } from '$lib/idle';

  const platform = isNative() ? 'mobile' : 'web';
  const books = $derived(availableColoringBooks(platform));

  let activeBook = $state<Book | null>(null);
  let dialogEl: HTMLDialogElement;
  // The tall/wide art variant follows the engine's PAPER, not the live viewport:
  // after a rotation with ink on the canvas the paper stays locked (ADR-0050),
  // so the variant the child colored on must stay applied — and any page picked
  // mid-lock must match that same locked space. The viewport-driven
  // layout.orientation is only a fallback until the engine mounts.
  const orientation = $derived(canvasState.paperOrientation ?? layout.orientation);
  const overlayActive = $derived(!!overlayUrl());
  const visibleBookTileCount: number = $derived(books.length + (overlayActive ? 1 : 0));
  const bookGridLayout = $derived(coloringBookGridLayout(visibleBookTileCount));
  const coverThumbnailSizes = $derived(bookGridLayout.imageSizes);
  const pageThumbnailSizes = $derived(COLORING_IMAGE_SIZES.pageThumbnail[orientation]);

  // Warm the cover thumbnails once at idle so the very first open of the picker
  // paints instantly instead of fetching every book's cover thumbnail on demand.
  function imageRequest(
    image: ResponsiveColoringImage,
    sizes: string
  ): string | ResponsiveImageRequest {
    return __IS_CAPACITOR__ ? image.src : { ...image, sizes };
  }

  function currentPaperImageSize(): string {
    return coloringOverlayImageSize(canvasState.paperCssWidth);
  }

  $effect(() =>
    scheduleIdle(() =>
      prefetchImages(
        books.map((book) => imageRequest(coverThumbImageSource(book), coverThumbnailSizes))
      )
    )
  );

  // Pressing/hovering a book tile warms that book's page thumbs before the
  // sub-grid renders; hovering a page tile warms its selected overlay candidate
  // so applying it to the canvas is immediate. Page thumbs are theme-aware (chalk in dark
  // mode) — reading resolvedTheme() keeps the warmed set and the grid in sync.
  function prefetchBookPages(book: Book) {
    prefetchImages(
      book.pages.map((page) =>
        imageRequest(pageThumbImageSource(page, orientation, resolvedTheme()), pageThumbnailSizes)
      )
    );
  }
  function prefetchPageOverlay(page: ColoringPage) {
    prefetchImages([
      imageRequest(
        pageOverlayImageSource(page, orientation, resolvedTheme()),
        currentPaperImageSize()
      ),
    ]);
  }

  // Swap the active overlay to the paper's portrait/landscape art when the
  // paper re-adopts the viewport — i.e. only on rotations with a blank canvas;
  // a locked paper keeps `orientation` (and so the art) unchanged.
  $effect(() => {
    setOverlayOrientation(orientation);
  });

  function pickPage(page: ColoringPage) {
    const selectedOverlayUrl = pageOverlayImageSource(page, orientation, resolvedTheme()).src;
    cancelImagePrefetchesExcept(selectedOverlayUrl);
    for (const img of dialogEl.querySelectorAll('img')) cancelImageRequest(img);
    setOverlayPage(page, orientation);
    coloringBookModal.hide();
  }

  function clearAndClose() {
    clearOverlay();
    coloringBookModal.hide();
  }

  // A tile that merely *appears* under a stationary pointer/finger — on open, or
  // when the grid swaps as a book is picked/backed out of — must not read as
  // selected. `:hover` alone fires the moment the tile renders beneath the
  // pointer (and sticks after a tap on hover-capable touch/hybrid devices), so
  // we gate the hover chrome behind a real mouse move: freshly shown views start
  // unarmed, and only a `mouse` pointermove arms them.
  let hoverArmed = $state(false);
  function armHoverOnMouseMove(node: HTMLElement) {
    function onMove(e: PointerEvent) {
      if (e.pointerType === 'mouse') hoverArmed = true;
    }
    node.addEventListener('pointermove', onMove);
    return { destroy: () => node.removeEventListener('pointermove', onMove) };
  }
  function showView(book: Book | null) {
    activeBook = book;
    hoverArmed = false;
  }

  // The tap-burst hazard modalDialog guards at launch (launchGuard), one level
  // in. A toddler mashes a cover tile several times before registering that
  // anything happened; the first tap swaps the grid, so the follow-ups land on
  // whichever page tile painted under the finger and apply it — the picker
  // closes on a page nobody chose, before the child ever saw the pages. Arm the
  // same short-lived dead zone at the tap point: modalDialog's capture-phase
  // handlers already swallow pointerdown and click inside it, and once it
  // lapses a deliberate tap in that spot picks normally. detail 0 is
  // keyboard/AT activation — no coordinates, and no finger to guard.
  function swapView(book: Book | null, event: MouseEvent) {
    if (event.detail > 0) guardTapZone(event.clientX, event.clientY);
    showView(book);
  }
</script>

<dialog
  bind:this={dialogEl}
  class="coloring-book-modal modal-dialog modal-fly-in modal-shell"
  id="coloring-book-dialog"
  use:modalDialog={() => ({
    open: coloringBookModal.open,
    origin: coloringBookModal.origin,
    onRequestClose: coloringBookModal.hide,
    onOpen: () => showView(null),
  })}
>
  <div class="coloring-book-content" class:hover-armed={hoverArmed} use:armHoverOnMouseMove>
    <button
      class="coloring-book-close modal-close-btn"
      aria-label="Close"
      onclick={coloringBookModal.hide}
    >
      <Icon name="close" class="modal-close-icon" />
    </button>

    {#if !activeBook}
      <div class="coloring-book-view">
        <h2>Coloring Books</h2>
        <div
          class="coloring-grid coloring-books-grid"
          class:book-grid-has-orphan={bookGridLayout.hasOrphan}
          class:book-grid-has-nine-tiles={bookGridLayout.hasNineTiles}
        >
          {#if overlayActive}
            <button
              class="coloring-tile coloring-book-tile"
              type="button"
              aria-label="Clear Page"
              onclick={clearAndClose}
            >
              <Icon name="remove-page" class="coloring-remove-icon" />
              <span class="coloring-book-label">Clear Page</span>
            </button>
          {/if}
          {#each books as book (book.id)}
            {@const coverImage = coverThumbImageSource(book)}
            <button
              class="coloring-tile coloring-book-tile"
              type="button"
              aria-label="{book.name} coloring book"
              onclick={(e) => swapView(book, e)}
              onpointerenter={() => prefetchBookPages(book)}
              onpointerdown={() => prefetchBookPages(book)}
            >
              <img
                src={coverImage.src}
                srcset={__IS_CAPACITOR__ ? undefined : coverImage.srcset}
                sizes={__IS_CAPACITOR__ ? undefined : coverThumbnailSizes}
                alt=""
                loading="lazy"
              />
              <span class="coloring-book-label">{book.name}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="coloring-book-view">
        <div class="coloring-book-header">
          <button class="coloring-back-button" aria-label="Back" onclick={(e) => swapView(null, e)}>
            <Icon name="chevron-left" class="coloring-back-icon" />
          </button>
          <h2>{activeBook.name}</h2>
        </div>
        <div
          class="coloring-grid coloring-pages-grid"
          class:portrait-pages={orientation === 'portrait'}
        >
          {#each activeBook.pages as page (page.id)}
            {@const pageImage = pageThumbImageSource(page, orientation, resolvedTheme())}
            <button
              class="coloring-tile"
              type="button"
              aria-label="{page.name} coloring page"
              onclick={() => pickPage(page)}
              onpointerenter={() => prefetchPageOverlay(page)}
              onpointerdown={() => prefetchPageOverlay(page)}
            >
              <img
                src={pageImage.src}
                srcset={__IS_CAPACITOR__ ? undefined : pageImage.srcset}
                sizes={__IS_CAPACITOR__ ? undefined : pageThumbnailSizes}
                alt=""
                loading="lazy"
              />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .coloring-book-modal {
    --coloring-book-modal-max-height: 85vh;
    max-width: min(920px, calc(100vw - 32px));
    width: 90%;
    max-height: var(--coloring-book-modal-max-height);
    overflow-y: auto;
  }

  .coloring-book-content {
    padding: var(--space-7);
    position: relative;
  }

  .coloring-book-content h2 {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--font-size-xl);
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  .coloring-book-close {
    transition: opacity var(--duration-base) ease;
    z-index: 1;
  }

  .coloring-book-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .coloring-book-header h2 {
    margin: 0;
  }

  /* 36px is control sizing, not spacing — the repo has no size ramp (the 44px
     modal close disc and 48px corner buttons in app.css are raw for the same
     reason). */
  .coloring-back-button {
    width: 36px;
    height: 36px;
    background: var(--surface-hover);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2);
    transition: background var(--duration-base) ease;
  }

  /* Tinted via `fill` (not a filter chain) so the gray and the brand hover
     both track the theme tokens. */
  :global(.coloring-back-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  :global(.coloring-back-icon svg) {
    fill: var(--icon-muted);
    transition: fill var(--duration-base) ease;
  }

  @media (hover: hover) {
    .hover-armed .coloring-back-button:hover {
      background: var(--brand-wash);
    }

    .hover-armed .coloring-back-button:hover :global(.coloring-back-icon svg) {
      fill: var(--brand);
    }
  }

  .coloring-grid {
    display: grid;
    gap: var(--space-3);
  }

  .coloring-books-grid {
    --book-cols: 4;
    --book-grid-max-width: 856px;
    width: min(100%, var(--book-grid-max-width));
    margin-inline: auto;
    grid-template-columns: repeat(var(--book-cols), minmax(0, 1fr));
  }

  @media (min-width: 741px) {
    /* A last row of one reads as accidental, so catalog sizes that would leave
       that orphan use the next-lower column count. This also covers Clear Page. */
    .coloring-books-grid.book-grid-has-orphan {
      --book-cols: 3;
    }
  }

  .coloring-books-grid.book-grid-has-nine-tiles {
    --book-grid-roomy-max-width: 639px;
    /* Reserve the non-grid content and whole-pixel rounding inside the modal cap. */
    --book-grid-height-reserve: 115px;
    --book-grid-max-width: min(
      var(--book-grid-roomy-max-width),
      calc(var(--coloring-book-modal-max-height) - var(--book-grid-height-reserve))
    );
  }

  .coloring-pages-grid {
    --page-cols: 2;
    grid-template-columns: repeat(var(--page-cols), minmax(0, 1fr));
  }

  .coloring-pages-grid.portrait-pages {
    --page-cols: 3;
  }

  /* Tiles are little paper cards that preview each page/cover's line art, and
     they follow the theme so the preview matches the applied page (ADR-0052):
     a light card with black lines in light mode, a dark card with white "chalk"
     lines in dark mode (via the --lineart-* tokens on the img below). */
  .coloring-tile {
    position: relative;
    background: var(--surface-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .hover-armed .coloring-tile:hover {
      border-color: var(--brand);
      background: var(--brand-wash);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.25);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
    }
  }

  .coloring-tile:active {
    transform: scale(0.96);
  }

  /* Same treatment as the canvas overlay (--lineart-*): black lines multiply over
     the light tile; dark mode inverts them to white and screens them over the dark
     tile, so the picker preview matches the chalkboard the page applies to. */
  .coloring-tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: var(--space-2);
    pointer-events: none;
    mix-blend-mode: var(--lineart-blend);
    filter: var(--lineart-filter);
  }

  /* No --lineart-filter here: the modal's icon re-ink already flips this
     monochrome icon's fill per theme, so only the blend needs to follow. */
  :global(.coloring-remove-icon) {
    width: 100%;
    height: 75%;
    padding: var(--space-2);
    pointer-events: none;
    mix-blend-mode: var(--lineart-blend);
  }

  /* The 28px bottom band reserves the overlaid .coloring-book-label's height:
     snapping down risks the caption covering the art, snapping up opens a gap.
     Functional, not scale drift. */
  .coloring-book-tile img {
    padding: var(--space-2) var(--space-2) 28px var(--space-2);
  }

  .coloring-pages-grid .coloring-tile {
    aspect-ratio: 3 / 2;
  }

  .coloring-pages-grid.portrait-pages .coloring-tile {
    aspect-ratio: 2 / 3;
  }

  /* Keep four cover tiles at least 140px wide after the modal's content padding
     and grid gaps are accounted for. */
  @media (max-width: 740px) {
    .coloring-books-grid {
      --book-cols: 3;
    }
  }

  @media (max-width: 520px) {
    .coloring-book-content {
      padding: var(--space-6) var(--space-4);
    }

    .coloring-books-grid {
      --book-cols: 2;
    }

    .coloring-pages-grid.portrait-pages {
      --page-cols: 2;
    }
  }

  .coloring-book-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: var(--space-1) var(--space-2);
    /* rgba fallback precedes the color-mix (docs/COMPATIBILITY.md); both follow
       the theme so the caption sits on the tile's own paper tone. */
    background: rgba(255, 255, 255, 0.92);
    background: color-mix(in srgb, var(--surface-2) 92%, transparent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
    text-align: center;
  }
</style>
