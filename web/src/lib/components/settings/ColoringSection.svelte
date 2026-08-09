<script lang="ts">
  import Icon from '../Icon.svelte';
  import Button from '../design/Button.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import { BOOKS, STARTER_COLORING_BOOK_ID } from '$lib/state/books';
  import { clearOverlay } from '$lib/state/coloringBook.svelte';
  import { coloringPackState } from '$lib/state/coloringPacks.svelte';
  import {
    settings,
    setColoringBook,
    setColoringPacksAllowMetered,
  } from '$lib/state/settings.svelte';
  import { notifyColoringPackPolicyChanged } from '$lib/coloringPacks/policy';

  let removing = $state(false);
  let removeError = $state(false);
  const downloadedBookCount = $derived(
    coloringPackState.installedBookIds.filter((id) => id !== STARTER_COLORING_BOOK_ID).length
  );
  const downloadingBookName = $derived(
    BOOKS.find((book) => book.id === coloringPackState.downloadingBookId)?.name ?? null
  );

  function megabytes(bytes: number): string {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  function setAllowMetered(next: boolean) {
    setColoringPacksAllowMetered(next);
    notifyColoringPackPolicyChanged();
  }

  function setColoringBooksEnabled(next: boolean) {
    setColoringBook(next);
    if (!next) clearOverlay();
    notifyColoringPackPolicyChanged();
  }

  async function removeDownloadedPictures() {
    removing = true;
    removeError = false;
    try {
      const { removeDownloadedColoringPacks } = await import('$lib/coloringPacks/manager');
      await removeDownloadedColoringPacks();
    } catch {
      removeError = true;
    } finally {
      removing = false;
    }
  }
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon="shapes"
      label="Coloring book"
      id="coloringBookToggle"
      checked={settings.coloringBookEnabled}
      onToggle={setColoringBooksEnabled}
      help="Show coloring pages and download new books automatically"
    />
  </div>

  <div class="setting">
    <ToggleRow
      icon="download"
      label="Download over mobile data"
      id="coloringPacksMeteredToggle"
      checked={settings.coloringPacksAllowMetered}
      onToggle={setAllowMetered}
      help="Allows automatic picture downloads when Wi-Fi isn't available"
      disabled={!settings.coloringBookEnabled}
    />
  </div>

  <div class="setting pack-storage">
    <div class="pack-summary">
      <Icon name="shapes" class="setting-icon" />
      <div>
        <span class="pack-title">Downloaded pictures</span>
        {#if coloringPackState.initialized}
          <p>
            {downloadedBookCount} of {coloringPackState.totalBookCount - 1} extra books · {megabytes(
              coloringPackState.downloadedBytes
            )}
          </p>
          {#if downloadingBookName}
            <p>Downloading {downloadingBookName} in the background</p>
          {:else if downloadedBookCount === coloringPackState.totalBookCount - 1}
            <p>Every coloring book is ready offline</p>
          {/if}
        {:else if !settings.coloringBookEnabled}
          <p>Storage details are unavailable while coloring books are off</p>
        {/if}
      </div>
    </div>
    <Button
      variant="danger"
      size="sm"
      disabled={removing || (coloringPackState.initialized && downloadedBookCount === 0)}
      onclick={removeDownloadedPictures}
    >
      {removing ? 'Removing…' : 'Remove downloaded pictures'}
    </Button>
    {#if removeError}
      <p class="remove-error">Downloaded pictures could not be removed. Try again.</p>
    {/if}
  </div>
</section>

<style>
  .pack-storage {
    display: grid;
    gap: var(--space-4);
  }

  .pack-summary {
    display: flex;
    align-items: flex-start;
    gap: var(--setting-icon-gap);
  }

  .pack-title {
    display: block;
    color: var(--text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .pack-summary p,
  .remove-error {
    margin: var(--space-1) 0 0;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .pack-storage :global(.btn) {
    justify-self: start;
  }

  .remove-error {
    color: var(--danger-text);
  }
</style>
