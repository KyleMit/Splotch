<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
  import Button from '../design/Button.svelte';
  import { settings, setSaveOnDelete } from '$lib/state/settings.svelte';
  import { changeSaveFolder, forgetSaveFolder } from '$lib/state/saveFolder.svelte';
  import { folderSaveSupported } from '$lib/drawing/folderSave';

  // The optional save folder is desktop-Chromium only (File System Access API).
  // On every other browser the row is hidden and saves stay as downloads.
  const showFolderSave = folderSaveSupported();
</script>

<section class="setting-group">
  <div class="setting">
    <ToggleRow
      icon="camera-party"
      label="Auto-Save on Delete"
      id="saveOnDeleteToggle"
      checked={settings.saveOnDeleteEnabled}
      onToggle={setSaveOnDelete}
      help="Saves the current drawing each time the page is cleared"
    />
  </div>

  {#if showFolderSave}
    <div class="setting folder-location">
      <div class="folder-info">
        <Icon name="folder" class="setting-icon" />
        <span class="folder-title">Save drawings to</span>
      </div>
      {#if settings.saveFolderName}
        <div class="folder-actions">
          <Button
            variant="wash"
            size="sm"
            class="folder-pill"
            id="changeSaveFolderButton"
            title="Change folder"
            onclick={changeSaveFolder}
          >
            {settings.saveFolderName}
          </Button>
          <button
            class="folder-clear"
            id="forgetSaveFolderButton"
            aria-label="Forget folder"
            title="Forget folder"
            onclick={forgetSaveFolder}
          >
            <Icon name="close" class="folder-clear-icon" />
          </button>
        </div>
      {:else}
        <Button
          variant="brand"
          size="sm"
          class="folder-change"
          id="changeSaveFolderButton"
          onclick={changeSaveFolder}
        >
          Choose folder
        </Button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .folder-location {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .folder-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .folder-title {
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
  }

  /* Empty state: primary CTA to pick a folder. Chrome comes from the Button
     primitive; the pill radius is this row's own shape, matching .folder-pill. */
  .folder-location :global(.folder-change) {
    flex-shrink: 0;
    border-radius: var(--radius-pill);
  }

  .folder-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* Selected state: the wash variant carries the secondary (lighter) fill; this
     row supplies the pill shape and the ellipsis for a long folder name. The
     display override matters — the primitive is inline-flex, which would wrap
     the label in an anonymous flex item that text-overflow can't clip. */
  .folder-actions :global(.folder-pill) {
    display: block;
    min-width: 0;
    max-width: 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: var(--radius-pill);
  }

  .folder-clear {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 50%;
    color: var(--text-mid);
    background: var(--slider-track);
    cursor: pointer;
  }

  .folder-clear:hover {
    background: var(--control-track-hover);
  }

  :global(.folder-clear-icon) {
    width: 13px;
    height: 13px;
  }
</style>
