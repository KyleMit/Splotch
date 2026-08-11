<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
  import Button from '../design/Button.svelte';
  import { settings, setSaveOnDelete, setScreenshot } from '$lib/state/settings.svelte';
  import { changeSaveFolder, forgetSaveFolder } from '$lib/state/saveFolder.svelte';
  import { folderSaveSupported } from '$lib/drawing/folderSave';

  // The optional save folder is desktop-Chromium only (File System Access API).
  // On every other browser the row is hidden and saves stay as downloads.
  const showFolderSave = folderSaveSupported();
</script>

<section class="setting-group">
  <!-- The camera button's visibility lives with saving rather than with the
       Tool Drawer's chip grid, the way Coloring and AI Art each own their own
       button: it is the other way a drawing gets saved. It leads the section
       because it is the deliberate save — the two rows under it govern what
       happens without anyone asking.

       Every action button lives inside the drawer, which Advanced Controls
       gates (see ActionsPanel's data-off-adv rule), so this row states what it
       can actually deliver in the state the parent is in rather than promising
       a button that setting is currently suppressing. -->
  <div class="setting">
    <ToggleRow
      icon="camera"
      label="Camera button"
      id="screenshotToggle"
      checked={settings.screenshotEnabled}
      onToggle={setScreenshot}
      help={settings.advancedControlsEnabled
        ? 'Shows the camera button in the tool drawer'
        : 'The tool drawer is off, so the camera button stays hidden'}
    />
  </div>

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
  /* The action drops below the label rather than crowding it once the row is
     too narrow to seat both — the label keeps its full name, and the chosen
     folder gets the whole second line to say where drawings land. */
  .folder-location {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .folder-info {
    display: flex;
    align-items: center;
    gap: var(--setting-icon-gap);
    min-width: 0;
  }

  .folder-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
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
     the label in an anonymous flex item that text-overflow can't clip. The cap
     is the line it sits on rather than a fixed width: a name too long for the
     label's line wraps the whole action below it and then has the row to
     itself. */
  .folder-actions :global(.folder-pill) {
    display: block;
    min-width: 0;
    max-width: 100%;
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
    color: var(--text-soft);
    background: var(--surface);
    cursor: pointer;
  }

  .folder-clear:hover {
    background: var(--surface-hover);
  }

  :global(.folder-clear-icon) {
    width: 13px;
    height: 13px;
  }
</style>
