<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, closeColoringBook } from '$lib/state/ui.svelte';
  import {
    booksForPlatform,
    coloringBookState,
    setOverlayPage,
    clearOverlay,
  } from '$lib/state/coloringBook.svelte';
  import { isNative } from '$lib/platform';
  import { pageImage, thumbPath, type Book, type ColoringPage } from '$lib/state/books';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { layout } from '$lib/state/layout.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { prefetchImages } from '$lib/imagePrefetch';
  import { scheduleIdle } from '$lib/idle';

  // Only show books licensed for this platform. Native builds also strip the
  // web-only books' assets at build time (scripts/strip-native-assets.mjs), so
  // this filter and that strip must agree — both read the same `platforms`.
  const books = booksForPlatform(isNative() ? 'mobile' : 'web');

  let activeBook = $state<Book | null>(null);
  // The tall/wide art variant follows the engine's PAPER, not the live viewport:
  // after a rotation with ink on the canvas the paper stays locked (ADR-0050),
  // so the variant the child colored on must stay applied — and any page picked
  // mid-lock must match that same locked space. The viewport-driven
  // layout.orientation is only a fallback until the engine mounts.
  const orientation = $derived(canvasState.paperOrientation ?? layout.orientation);

  // Warm the cover thumbnails once at idle so the very first open of the picker
  // paints instantly instead of fetching eight full covers on demand.
  $effect(() => scheduleIdle(() => prefetchImages(books.map((book) => thumbPath(book.cover)))));

  // Pressing/hovering a book tile warms that book's page thumbs before the
  // sub-grid renders; hovering a page tile warms its full-res overlay so applying
  // it to the canvas is immediate.
  function prefetchBookPages(book: Book) {
    prefetchImages(book.pages.map((page) => thumbPath(pageImage(page, orientation))));
  }
  function prefetchPageOverlay(page: ColoringPage) {
    prefetchImages([pageImage(page, orientation)]);
  }

  // Swap the active overlay to the paper's portrait/landscape art when the
  // paper re-adopts the viewport — i.e. only on rotations with a blank canvas;
  // a locked paper keeps `orientation` (and so the art) unchanged.
  $effect(() => {
    if (coloringBookState.overlayPage) {
      setOverlayPage(coloringBookState.overlayPage, orientation);
    }
  });

  // The other orientation's art is what a blank-canvas rotation will swap to;
  // warm it as soon as a page is applied so that swap is a cache hit and the
  // ready-gated fade-in (DrawingCanvas) is near-instant.
  $effect(() => {
    if (!coloringBookState.overlayPage) return;
    const other = orientation === 'portrait' ? 'landscape' : 'portrait';
    prefetchImages([pageImage(coloringBookState.overlayPage, other)]);
  });

  function pickPage(page: ColoringPage) {
    setOverlayPage(page, orientation);
    closeColoringBook();
  }

  function clearAndClose() {
    clearOverlay();
    closeColoringBook();
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
  function selectBook(book: Book) {
    activeBook = book;
    hoverArmed = false;
  }
  function goToBooks() {
    activeBook = null;
    hoverArmed = false;
  }

  const overlayActive = $derived(!!coloringBookState.overlayUrl);
</script>

<dialog
  class="coloring-book-modal modal-dialog modal-fly-in modal-shell"
  id="coloring-book-dialog"
  use:modalDialog={() => ({
    open: ui.coloringBookOpen,
    origin: ui.coloringBookOrigin,
    onRequestClose: closeColoringBook,
    onOpen: goToBooks,
    onClose: goToBooks,
  })}
>
  <div class="coloring-book-content" class:hover-armed={hoverArmed} use:armHoverOnMouseMove>
    <button
      class="coloring-book-close modal-close-btn"
      aria-label="Close"
      onclick={closeColoringBook}
    >
      <Icon name="close" class="modal-close-icon" />
    </button>

    {#if !activeBook}
      <div class="coloring-book-view">
        <h2>Coloring Books</h2>
        <div class="coloring-grid coloring-books-grid">
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
              onclick={() => selectBook(book)}
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
          <button class="coloring-back-button" aria-label="Back" onclick={goToBooks}>
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
              <img src={thumbPath(pageImage(page, orientation))} alt="" loading="lazy" />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</dialog>

<style>
  .coloring-book-modal {
    max-width: min(920px, calc(100vw - 32px));
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
  }

  .coloring-book-content {
    padding: 32px;
    position: relative;
  }

  .coloring-book-content h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #333;
    font-weight: 600;
  }

  .coloring-book-close {
    transition: opacity 0.2s ease;
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
    background: #f5f5f5;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    transition: background 0.2s ease;
  }

  :global(.coloring-back-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(35%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(85%);
    transition: filter 0.2s ease;
  }

  @media (hover: hover) {
    .hover-armed .coloring-back-button:hover {
      background: #ede7f6;
    }

    .hover-armed .coloring-back-button:hover :global(.coloring-back-icon) {
      filter: var(--brand-tint-filter);
    }
  }

  .coloring-grid {
    display: grid;
    gap: 12px;
  }

  .coloring-books-grid {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }

  .coloring-pages-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .coloring-pages-grid.portrait-pages {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .coloring-tile {
    position: relative;
    background: #f8f8f8;
    border: 2px solid #e0e0e0;
    border-radius: 12px;
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .hover-armed .coloring-tile:hover {
      border-color: var(--brand);
      background: #f5f0ff;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(171, 113, 225, 0.25);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
    }
  }

  .coloring-tile:active {
    transform: scale(0.96);
  }

  .coloring-tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8px;
    pointer-events: none;
    mix-blend-mode: multiply;
  }

  :global(.coloring-remove-icon) {
    width: 100%;
    height: 75%;
    padding: 8px;
    pointer-events: none;
    mix-blend-mode: multiply;
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

  @media (max-width: 520px) {
    .coloring-book-content {
      padding: 24px 18px;
    }

    .coloring-books-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .coloring-pages-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .coloring-pages-grid.portrait-pages {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .coloring-book-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.92);
    font-size: 14px;
    font-weight: 600;
    color: #555;
    text-align: center;
  }
</style>
