<script>
  import { ui, closeColoringBook } from '$lib/state/ui.svelte.js';
  import {
    BOOKS,
    coloringBookState,
    setOverlay,
    clearOverlay
  } from '$lib/state/coloringBook.svelte.js';

  let dialogEl;
  let activeBook = $state(null);

  $effect(() => {
    if (!dialogEl) return;
    if (ui.coloringBookOpen) {
      if (!dialogEl.open) {
        if (ui.coloringBookOrigin) {
          const { x, y } = ui.coloringBookOrigin;
          dialogEl.style.setProperty('--origin-x', `${x - window.innerWidth / 2}px`);
          dialogEl.style.setProperty('--origin-y', `${y - window.innerHeight / 2}px`);
        }
        activeBook = null;
        dialogEl.showModal();
      }
    } else {
      if (dialogEl.open) dialogEl.close();
    }
  });

  function pickPage(src) {
    setOverlay(src);
    closeColoringBook();
  }

  function clearAndClose() {
    clearOverlay();
    closeColoringBook();
  }

  function handleDialogPointerDown(e) {
    const rect = dialogEl.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      closeColoringBook();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleDialogClose() {
    if (ui.coloringBookOpen) closeColoringBook();
    activeBook = null;
  }

  const overlayActive = $derived(!!coloringBookState.overlayUrl);
</script>

<dialog
  class="coloring-book-modal"
  id="coloring-book-dialog"
  bind:this={dialogEl}
  onpointerdown={handleDialogPointerDown}
  onclose={handleDialogClose}
>
  <div class="coloring-book-content">
    <button class="coloring-book-close" aria-label="Close" onclick={closeColoringBook}>
      <img src="/icons/close.svg" alt="" />
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
              <img src="/icons/remove-page.svg" alt="" />
              <span class="coloring-book-label">Clear Page</span>
            </button>
          {/if}
          {#each BOOKS as book (book.id)}
            <button
              class="coloring-tile coloring-book-tile"
              type="button"
              aria-label="{book.name} coloring book"
              onclick={() => (activeBook = book)}
            >
              <img src={book.cover} alt="" />
              <span class="coloring-book-label">{book.name}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="coloring-book-view">
        <div class="coloring-book-header">
          <button class="coloring-back-button" aria-label="Back" onclick={() => (activeBook = null)}>
            <img src="/icons/chevron-back.svg" alt="" />
          </button>
          <h2>{activeBook.name}</h2>
        </div>
        <div class="coloring-grid coloring-pages-grid">
          {#each activeBook.pages as src (src)}
            <button
              class="coloring-tile"
              type="button"
              aria-label="{activeBook.name} coloring page"
              onclick={() => pickPage(src)}
            >
              <img {src} alt="" />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</dialog>
