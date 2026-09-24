<script lang="ts">
  import DialogHeader from './design/DialogHeader.svelte';
  import ColoringBookHeaderActions from './ColoringBookHeaderActions.svelte';
  import ColoringTile from './ColoringTile.svelte';
  import { coloringBookModal } from '$lib/state/ui.svelte';
  import { coloringBookState, setOverlayOrientation } from '$lib/state/coloringBook.svelte';
  import { isNative } from '$lib/platform';
  import {
    coloringBookGridLayout,
    COLORING_IMAGE_SIZES,
    coverThumbImageSource,
    pageOverlayImage,
    pageSelectorImageSource,
    type Book,
    type ColoringPage,
    type ResponsiveColoringImage,
  } from '$lib/state/books';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { createDialogTheme } from '$lib/state/dialogTheme.svelte';
  import { modalDialog, waitForDialogRetirement } from '$lib/actions/modalDialog.svelte';
  import { runSingleFlightActivation } from '$lib/actions/pressFeedback';
  import ScrollCue from './design/ScrollCue.svelte';
  import { cutTrailingRow } from '$lib/actions/scrollCue';
  import { guardTapZone } from '$lib/actions/launchGuard';
  import { layoutState } from '$lib/state/layout.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { createColoringPickerBooks } from '$lib/state/coloringPicker.svelte';
  import {
    cancelImageRequest,
    cancelImagePrefetchesExcept,
    predecodeImage,
    predecodeImages,
    prefetchImages,
    type ResponsiveImageRequest,
  } from '$lib/imagePrefetch';
  import { scheduleIdle } from '$lib/idle';
  import { nextFrame } from '$lib/nextFrame';
  import {
    applyColoringPageWithMagicUndo,
    clearColoringPageWithMagicUndo,
  } from '$lib/drawing/coloringAppearance';
  const pickerBooks = createColoringPickerBooks(isNative() ? 'mobile' : 'web');
  const books = $derived(pickerBooks.shown);
  const hasBookPicker = $derived(pickerBooks.listsBooks);

  let activeBook = $state<Book | null>(null);
  let pagesGridToken = $state(0);
  let retiringAfterPageSelection = $state(false);
  let dialogEl: HTMLDialogElement;
  // The tall/wide art variant follows the engine's PAPER, not the live viewport:
  // after a rotation with ink on the canvas the paper stays locked (ADR-0050),
  // so the variant the child colored on must stay applied — and any page picked
  // mid-lock must match that same locked space. The viewport-driven
  // layoutState.orientation is only a fallback until the engine mounts.
  const orientation = $derived(canvasState.paperOrientation ?? layoutState.orientation);
  const activePage = $derived(coloringBookState.overlayPage);
  // The picker's covers, page tiles, and active-page preview are themed art
  // behind a closed dialog most of the time; they follow the theme only while
  // the picker is open. Prefetches and the picked overlay keep the live theme.
  const pickerTheme = createDialogTheme(coloringBookModal);
  const activePagePreview = $derived(
    activePage
      ? pageSelectorImageSource(activePage, coloringBookState.orientation, pickerTheme.current)
      : null
  );
  const bookGridLayout = $derived(coloringBookGridLayout(books.length));
  const coverThumbnailSizes = $derived(bookGridLayout.imageSizes);

  // Warm the resolved theme's cover thumbnails at idle so the first picker open
  // and a later theme change both paint without fetching every cover on demand.
  function imageRequest(
    image: ResponsiveColoringImage,
    sizes: string
  ): string | ResponsiveImageRequest {
    return __IS_CAPACITOR__ ? image.src : { ...image, sizes };
  }

  // The covers the next open will show, so a book that arrived since is warm.
  $effect(() => {
    const nextOpenBooks = pickerBooks.installed;
    if (nextOpenBooks.length < 2) return;
    const theme = resolvedTheme();
    const sizes = coloringBookGridLayout(nextOpenBooks.length).imageSizes;
    return scheduleIdle(() =>
      prefetchImages(
        nextOpenBooks.map((book) => imageRequest(coverThumbImageSource(book, theme), sizes))
      )
    );
  });

  // Hover fetches selector bytes without decoding an entire book. A press is the
  // stronger intent signal that decodes the imminent selector grid before paint.
  function bookPageRequests(book: Book) {
    return book.pages.map((page) =>
      imageRequest(
        pageSelectorImageSource(page, orientation, resolvedTheme()),
        COLORING_IMAGE_SIZES.pageSelector[orientation]
      )
    );
  }
  function prefetchPageOverlay(page: ColoringPage) {
    predecodeImage(pageOverlayImage(page, orientation, resolvedTheme()));
  }

  // Swap the active overlay to the paper's portrait/landscape art when the
  // paper re-adopts the viewport — i.e. only on rotations with a blank canvas;
  // a locked paper keeps `orientation` (and so the art) unchanged. An effect
  // for now because the overlay store does not yet derive its orientation from
  // the paper itself; that derivation is #1916's change, and this site goes
  // with it.
  $effect(() => {
    setOverlayOrientation(orientation);
  });

  async function pickPage(page: ColoringPage, button: HTMLButtonElement) {
    if (retiringAfterPageSelection) return;
    retiringAfterPageSelection = true;
    await runSingleFlightActivation(button, async () => {
      const selectedOrientation = orientation;
      const selectedTheme = resolvedTheme();
      const selectedOverlayUrl = pageOverlayImage(page, selectedOrientation, selectedTheme);
      cancelImagePrefetchesExcept(selectedOverlayUrl);
      for (const img of dialogEl.querySelectorAll<HTMLImageElement>('.coloring-pages-grid img')) {
        cancelImageRequest(img);
      }
      const dialogRetired = waitForDialogRetirement(dialogEl);
      coloringBookModal.hide();
      await dialogRetired;
      await nextFrame();
      applyColoringPageWithMagicUndo(page, selectedOrientation, selectedTheme);
    });
  }

  async function clearAndClose() {
    const dialogRetired = waitForDialogRetirement(dialogEl);
    coloringBookModal.hide();
    await dialogRetired;
    await nextFrame();
    clearColoringPageWithMagicUndo();
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

  function initialView(): Book | null {
    return hasBookPicker ? null : (books.at(0) ?? null);
  }

  function showInitialView() {
    pickerBooks.holdForOpen();
    retiringAfterPageSelection = false;
    pagesGridToken += 1;
    showView(initialView());
  }

  $effect(() => {
    const activeBookStillAvailable = books.some((book) => book.id === activeBook?.id);
    if ((!activeBook && !hasBookPicker) || (activeBook && !activeBookStillAvailable)) {
      showView(initialView());
    }
  });

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
    onOpen: showInitialView,
  })}
>
  <div class="coloring-book-content" use:armHoverOnMouseMove>
    {#if !activeBook}
      <div class="coloring-book-view">
        <div class="coloring-book-header">
          <DialogHeader onclose={coloringBookModal.hide}>
            <h2>Coloring Books</h2>
            {#snippet actions()}
              <ColoringBookHeaderActions
                {activePage}
                {activePagePreview}
                {hoverArmed}
                onclear={clearAndClose}
              />
            {/snippet}
          </DialogHeader>
        </div>
        <div
          class="coloring-grid coloring-books-grid"
          class:book-grid-has-orphan={bookGridLayout.hasOrphan}
          use:cutTrailingRow
        >
          {#each books as book (book.id)}
            <ColoringTile
              image={coverThumbImageSource(book, pickerTheme.current)}
              sizes={coverThumbnailSizes}
              shape="cover"
              label={book.name}
              {hoverArmed}
              retiring={retiringAfterPageSelection}
              aria-label="{book.name} coloring book"
              onclick={(e) => swapView(book, e)}
              onpointerenter={() => prefetchImages(bookPageRequests(book))}
              onpointerdown={() => predecodeImages(bookPageRequests(book))}
            />
          {/each}
        </div>
      </div>
    {:else}
      <div class="coloring-book-view">
        <div class="coloring-book-header">
          <DialogHeader
            backClass="coloring-back-button"
            onback={hasBookPicker ? (event) => swapView(null, event) : undefined}
            onclose={coloringBookModal.hide}
          >
            <h2>{activeBook.name}</h2>
            {#snippet actions()}
              <ColoringBookHeaderActions
                {activePage}
                {activePagePreview}
                {hoverArmed}
                onclear={clearAndClose}
              />
            {/snippet}
          </DialogHeader>
        </div>
        {#key pagesGridToken}
          <div
            class="coloring-grid coloring-pages-grid"
            class:portrait-pages={orientation === 'portrait'}
            use:cutTrailingRow
          >
            {#each activeBook.pages as page (page.id)}
              <ColoringTile
                image={pageSelectorImageSource(page, orientation, pickerTheme.current)}
                sizes={COLORING_IMAGE_SIZES.pageSelector[orientation]}
                shape={orientation}
                {hoverArmed}
                retiring={retiringAfterPageSelection}
                aria-label="{page.name} coloring page"
                onclick={(event) => pickPage(page, event.currentTarget)}
                onpointerenter={() => prefetchPageOverlay(page)}
                onpointerdown={() => prefetchPageOverlay(page)}
              />
            {/each}
          </div>
        {/key}
      </div>
    {/if}
    <!-- Outside the view branches on purpose: one cue serves the book grid and
         every page grid, so its observer never ends up watching a node the keyed
         page grid has since replaced. -->
    <ScrollCue />
  </div>
</dialog>

<style>
  /* This is the ceiling, not the height the picker settles at. Whenever the
     catalog outgrows it, `cutTrailingRow` budgets an inline max-height derived
     from the live row pitch so the fold cuts a tile in half instead of landing
     between two rows — a flat cap has no relationship to the grid, so which of
     those two it does is down to the device. */
  .coloring-book-modal {
    --coloring-book-modal-max-height: 85vh;
    width: calc(100vw - 2 * var(--modal-gutter));
    max-width: 920px;
    max-height: var(--coloring-book-modal-max-height);
    overflow-y: auto;
    /* The dialog is the scrollport its ScrollCue sticks to, and .modal-shell
       pads it by nothing: the content block below carries the inset. */
    --scrollport-bottom-padding: 0px;
  }

  .coloring-book-content {
    padding: var(--space-7);
    position: relative;
  }

  .coloring-book-content h2 {
    font-size: var(--font-size-xl);
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  .coloring-book-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--modal-close-size);
    margin-bottom: var(--space-5);
  }

  .coloring-book-header h2 {
    margin: 0;
    min-width: 0;
    margin-right: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
       that orphan use the next-lower column count. */
    .coloring-books-grid.book-grid-has-orphan {
      --book-cols: 3;
    }
  }

  .coloring-pages-grid {
    --page-cols: 2;
    grid-template-columns: repeat(var(--page-cols), minmax(0, 1fr));
  }

  .coloring-pages-grid.portrait-pages {
    --page-cols: 3;
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

    /* Tighter than the roomier layouts above: on a two-column phone grid the
       reclaimed pixels both widen the tiles and expose more of the next row. */
    .coloring-grid {
      gap: var(--space-2);
    }

    .coloring-books-grid {
      --book-cols: 2;
    }

    .coloring-pages-grid.portrait-pages {
      --page-cols: 2;
    }
  }

  @media (max-width: 400px) {
    .coloring-book-content {
      padding-inline: var(--space-2);
    }

    .coloring-book-header {
      --dialog-header-gap: var(--space-1);
    }

    .coloring-book-header h2 {
      font-size: var(--font-size-md);
    }
  }

  /* ── Tall portrait: the covers go tall instead of wide ───────────────────
     Same width floor the four-column layout starts at, because this replaces
     it: four small covers in a short, wide card leave the height unspent, and
     two columns turn that height into cover art.

     The gate is an aspect ratio rather than `orientation: portrait` because the
     grid below is capped by the dialog's height. On a barely-portrait viewport
     that cap is tighter than the width four columns already had, so the swap
     would shrink the very covers it exists to grow; the two layouts draw the
     same tile where height is about 1.06 times width, and 4:5 clears that at
     every width this rule can see. Every tablet held upright is 3:4 or taller,
     so none of them loses the treatment. flows-coloring-book.spec.ts measures
     the covers across that band rather than trusting the arithmetic.

     The orphan selector is restated so this beats it on order at equal
     specificity — its three-column fallback is a four-column repair, and at two
     columns it would only shrink the tiles this step exists to grow. */
  @media (max-aspect-ratio: 4 / 5) and (min-width: 741px) {
    .coloring-books-grid,
    .coloring-books-grid.book-grid-has-orphan {
      --book-cols: 2;
      /* Square tiles that fill the width would run the catalog well past the
         fold, so the grid is capped at the width whose tiles seat this many
         rows inside the dialog's height cap instead — the whole catalog today,
         and a longer one still gets the trailing-row cut cue. */
      --book-grid-rows-in-view: 4;
      /* Everything inside that height cap that isn't tile: the content padding
         above and below, the header row, the gaps between rows, and a little
         slack so a sub-pixel row can't tip the last one past the fold. */
      --book-grid-chrome: calc(
        2 * var(--space-7) + var(--modal-close-size) + var(--space-5) +
          (var(--book-grid-rows-in-view) - 1) * var(--space-3) + var(--space-4)
      );
      --book-grid-max-width: calc(
        (var(--coloring-book-modal-max-height) - var(--book-grid-chrome)) /
          var(--book-grid-rows-in-view) * var(--book-cols) + (var(--book-cols) - 1) * var(--space-3)
      );
    }
  }
</style>
