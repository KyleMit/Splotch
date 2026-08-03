<script lang="ts">
  import Icon from './Icon.svelte';
  import { coloringBook } from '$lib/state/ui.svelte';
  import {
    booksForPlatform,
    setOverlayPage,
    setOverlayOrientation,
    overlayUrl,
    clearOverlay,
  } from '$lib/state/coloringBook.svelte';
  import { isNative } from '$lib/platform';
  import {
    pageOverlayImage,
    pageThumb,
    thumbPath,
    type Book,
    type ColoringPage,
  } from '$lib/state/books';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { layout } from '$lib/state/layout.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { cancelImagePrefetchesExcept, prefetchImages } from '$lib/imagePrefetch';
  import { scheduleIdle } from '$lib/idle';

  // Only show books licensed for this platform. Native builds also strip the
  // web-only books' assets at build time (scripts/strip-native-assets.mjs), so
  // this filter and that strip must agree — both read the same `platforms`.
  const books = booksForPlatform(isNative() ? 'mobile' : 'web');

  let activeBook = $state<Book | null>(null);
  let dialogEl: HTMLDialogElement;
  // The tall/wide art variant follows the engine's PAPER, not the live viewport:
  // after a rotation with ink on the canvas the paper stays locked (ADR-0050),
  // so the variant the child colored on must stay applied — and any page picked
  // mid-lock must match that same locked space. The viewport-driven
  // layout.orientation is only a fallback until the engine mounts.
  const orientation = $derived(canvasState.paperOrientation ?? layout.orientation);

  // Warm the cover thumbnails once at idle so the very first open of the picker
  // paints instantly instead of fetching every book's cover thumbnail on demand.
  $effect(() => scheduleIdle(() => prefetchImages(books.map((book) => thumbPath(book.cover)))));

  // Pressing/hovering a book tile warms that book's page thumbs before the
  // sub-grid renders; hovering a page tile warms its full-res overlay so applying
  // it to the canvas is immediate. Page thumbs are theme-aware (chalk in dark
  // mode) — reading resolvedTheme() keeps the warmed set and the grid in sync.
  function prefetchBookPages(book: Book) {
    prefetchImages(book.pages.map((page) => pageThumb(page, orientation, resolvedTheme())));
  }
  function prefetchPageOverlay(page: ColoringPage) {
    prefetchImages([pageOverlayImage(page, orientation, resolvedTheme())]);
  }

  // Swap the active overlay to the paper's portrait/landscape art when the
  // paper re-adopts the viewport — i.e. only on rotations with a blank canvas;
  // a locked paper keeps `orientation` (and so the art) unchanged.
  $effect(() => {
    setOverlayOrientation(orientation);
  });

  function pickPage(page: ColoringPage) {
    const selectedOverlayUrl = pageOverlayImage(page, orientation, resolvedTheme());
    cancelImagePrefetchesExcept(selectedOverlayUrl);
    for (const img of dialogEl.querySelectorAll('img')) img.removeAttribute('src');
    setOverlayPage(page, orientation);
    coloringBook.hide();
  }

  function clearAndClose() {
    clearOverlay();
    coloringBook.hide();
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

  const overlayActive = $derived(!!overlayUrl());
  const visibleBookTileCount: number = $derived(books.length + (overlayActive ? 1 : 0));
  const bookGridHasOrphan: boolean = $derived(
    visibleBookTileCount > 1 && visibleBookTileCount % 4 === 1
  );
  const bookGridHasNineTiles: boolean = $derived(visibleBookTileCount === 9);
</script>

<dialog
  bind:this={dialogEl}
  class="coloring-book-modal modal-dialog modal-fly-in modal-shell"
  id="coloring-book-dialog"
  use:modalDialog={() => ({
    open: coloringBook.open,
    origin: coloringBook.origin,
    onRequestClose: coloringBook.hide,
    onOpen: () => showView(null),
  })}
>
  <div class="coloring-book-content" class:hover-armed={hoverArmed} use:armHoverOnMouseMove>
    <button
      class="coloring-book-close modal-close-btn"
      aria-label="Close"
      onclick={coloringBook.hide}
    >
      <Icon name="close" class="modal-close-icon" />
    </button>

    {#if !activeBook}
      <div class="coloring-book-view">
        <h2>Coloring Books</h2>
        <div
          class="coloring-grid coloring-books-grid"
          class:book-grid-has-orphan={bookGridHasOrphan}
          class:book-grid-has-nine-tiles={bookGridHasNineTiles}
        >
          {#if overlayActive}
            <button
              class="coloring-tile coloring-book-tile coloring-remove-tile"
              type="button"
              aria-label="Clear Page"
              onclick={clearAndClose}
            >
              <Icon name="remove-page" class="coloring-remove-icon" />
              <span class="coloring-book-label">Clear Page</span>
            </button>
          {/if}
          {#each books as book (book.id)}
            <button
              class="coloring-tile coloring-book-tile"
              type="button"
              aria-label="{book.name} coloring book"
              onclick={() => showView(book)}
              onpointerenter={() => prefetchBookPages(book)}
              onpointerdown={() => prefetchBookPages(book)}
            >
              <img src={thumbPath(book.cover)} alt="" loading="lazy" />
              <span class="coloring-book-label">{book.name}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="coloring-book-view">
        <div class="coloring-book-header">
          <button class="coloring-back-button" aria-label="Back" onclick={() => showView(null)}>
            <Icon name="chevron-left" class="coloring-back-icon" />
          </button>
          <h2>{activeBook.name}</h2>
        </div>
        <div
          class="coloring-grid coloring-pages-grid"
          class:portrait-pages={orientation === 'portrait'}
        >
          {#each activeBook.pages as page (page.id)}
            <button
              class="coloring-tile"
              type="button"
              aria-label="{activeBook.name} coloring page"
              onclick={() => pickPage(page)}
              onpointerenter={() => prefetchPageOverlay(page)}
              onpointerdown={() => prefetchPageOverlay(page)}
            >
              <img src={pageThumb(page, orientation, resolvedTheme())} alt="" loading="lazy" />
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
    padding: 32px;
    position: relative;
  }

  .coloring-book-content h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: var(--text-strong);
    font-weight: 600;
  }

  .coloring-book-close {
    transition: opacity var(--duration-base) ease;
    z-index: 1;
  }

  .coloring-book-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .coloring-book-header h2 {
    margin: 0;
  }

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
    padding: 8px;
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
    gap: 12px;
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
    padding: 8px;
    pointer-events: none;
    mix-blend-mode: var(--lineart-blend);
    filter: var(--lineart-filter);
  }

  /* No --lineart-filter here: the modal's icon re-ink already flips this
     monochrome icon's fill per theme, so only the blend needs to follow. */
  :global(.coloring-remove-icon) {
    width: 100%;
    height: 75%;
    padding: 8px;
    pointer-events: none;
    mix-blend-mode: var(--lineart-blend);
  }

  .coloring-book-tile img {
    padding: 8px 8px 28px 8px;
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
      padding: 24px 18px;
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
    padding: 6px 8px;
    /* rgba fallback precedes the color-mix (docs/COMPATIBILITY.md); both follow
       the theme so the caption sits on the tile's own paper tone. */
    background: rgba(255, 255, 255, 0.92);
    background: color-mix(in srgb, var(--surface-2) 92%, transparent);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text);
    text-align: center;
  }
</style>
