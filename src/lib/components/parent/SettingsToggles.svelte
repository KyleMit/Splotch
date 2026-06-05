<script>
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import {
    settings,
    setSound,
    setSaveOnDelete,
    setScreenshot,
    setUndoButton,
    setStrokeWidthControl,
    setEraser,
    setColoringBook,
    setAdvancedControls
  } from '$lib/state/settings.svelte';
  import { clearOverlay } from '$lib/state/coloringBook.svelte';

  // Side-effect on top of the persisted setting: disabling the coloring book
  // should also clear any active overlay page.
  function toggleColoringBook() {
    const next = !settings.coloringBookEnabled;
    setColoringBook(next);
    if (!next) clearOverlay();
  }
</script>

<section class="setting-group">
  <h3 class="setting-group-heading">Settings</h3>

  <div class="setting">
    <ToggleRow
      icon="volume-on"
      label="Drawing Sounds"
      id="soundToggle"
      checked={settings.soundEnabled}
      onToggle={setSound}
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
</section>

<section class="setting-group">
  <h3 class="setting-group-heading">Controls</h3>

  <div class="setting">
    <ToggleRow
      icon="dashboard-customize"
      label="Enable Advanced Controls"
      id="advancedControlsToggle"
      checked={settings.advancedControlsEnabled}
      onToggle={setAdvancedControls}
    />
  </div>

  {#if settings.advancedControlsEnabled}
  <div class="setting" transition:slide={{ duration: 220 }}>
    <ToggleRow
      icon="line-weight"
      label="Stroke Width Button"
      id="strokeWidthToggle"
      checked={settings.strokeWidthControlEnabled}
      onToggle={setStrokeWidthControl}
    />
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <ToggleRow
      icon="eraser"
      label="Eraser Button"
      id="eraserToggle"
      checked={settings.eraserEnabled}
      onToggle={setEraser}
    />
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <ToggleRow
      icon="shapes"
      label="Coloring Book Button"
      id="coloringBookToggle"
      checked={settings.coloringBookEnabled}
      onToggle={toggleColoringBook}
    />
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <ToggleRow
      icon="camera"
      label="Screenshot Button"
      id="screenshotToggle"
      checked={settings.screenshotEnabled}
      onToggle={setScreenshot}
    />
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <ToggleRow
      icon="undo"
      label="Undo Button"
      id="undoToggle"
      checked={settings.undoButtonEnabled}
      onToggle={setUndoButton}
    />
  </div>
  {/if}
</section>

<style>
  .setting-group {
    margin-bottom: 24px;
  }

  .setting-group:last-child {
    margin-bottom: 0;
  }

  .setting-group .setting + .setting {
    margin-top: 6px;
  }

  h3.setting-group-heading {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: 700;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .setting {
    padding: 12px 16px;
    background: #f8f8f8;
    border-radius: 8px;
  }
</style>
