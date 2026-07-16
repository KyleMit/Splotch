<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
  import {
    settings,
    setSaveOnDelete,
    changeSaveFolder,
    forgetSaveFolder,
  } from '$lib/state/settings.svelte';
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
          <button
            class="folder-pill"
            id="changeSaveFolderButton"
            title="Change folder"
            onclick={changeSaveFolder}
          >
            {settings.saveFolderName}
          </button>
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
        <button class="folder-change" id="changeSaveFolderButton" onclick={changeSaveFolder}>
          Choose folder
        </button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .setting-group .setting + .setting {
    margin-top: 6px;
  }

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
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
  }

  /* Empty state: primary CTA to pick a folder. */
  .folder-change {
    flex-shrink: 0;
    border: none;
    border-radius: 999px;
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: var(--brand);
    cursor: pointer;
  }

  .folder-change:hover {
    background: var(--brand-hover);
  }

  .folder-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* Selected state: secondary (lighter) pill showing the current folder. */
  .folder-pill {
    min-width: 0;
    max-width: 190px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: none;
    border-radius: 999px;
    padding: 7px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--brand-text);
    background: var(--brand-wash);
    cursor: pointer;
  }

  .folder-pill:hover {
    background: var(--brand-wash-hover);
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
