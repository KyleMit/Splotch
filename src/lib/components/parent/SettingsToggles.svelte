<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import {
    settings,
    setSound,
    setSoundVolume,
    setSaveOnDelete,
    setScreenshot,
    setUndoButton,
    setStrokeWidthControl,
    setEraser,
    setColoringBook,
    setAdvancedControls,
    setLockRotation,
    setForceLandscapeOrientation
  } from '$lib/state/settings.svelte';
  import { clearOverlay } from '$lib/state/coloringBook.svelte';
  import { playDrawSound, stopDrawSound } from '$lib/audio/drawingSound';

  const PREVIEW_SPEED = 0.45;
  let previewingVolume = false;

  // Side-effect on top of the persisted setting: disabling the coloring book
  // should also clear any active overlay page.
  function toggleColoringBook() {
    const next = !settings.coloringBookEnabled;
    setColoringBook(next);
    if (!next) clearOverlay();
  }

  function previewVolume() {
    if (!settings.soundEnabled || !previewingVolume) return;
    playDrawSound({ speed: PREVIEW_SPEED });
  }

  function startVolumePreview() {
    previewingVolume = true;
    previewVolume();
  }

  function stopVolumePreview() {
    previewingVolume = false;
    stopDrawSound();
  }

  function updateSoundVolume(event: Event) {
    setSoundVolume(Number((event.currentTarget as HTMLInputElement).value));
    previewVolume();
  }
</script>

<section class="setting-group">
  <h3 class="setting-group-heading">Settings</h3>

  <div class="setting">
    <ToggleRow
      icon={settings.soundEnabled ? 'volume-on' : 'volume-off'}
      label="Drawing Sounds"
      id="soundToggle"
      checked={settings.soundEnabled}
      onToggle={setSound}
    />
    {#if settings.soundEnabled}
      <div class="volume-setting" transition:slide={{ duration: 220 }}>
        <label class="volume-label" for="soundVolume">
          <span>Volume</span>
          <span>{settings.soundVolume}%</span>
        </label>
        <input
          id="soundVolume"
          class="volume-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={settings.soundVolume}
          aria-label="Drawing sound volume"
          oninput={updateSoundVolume}
          onpointerdown={startVolumePreview}
          onpointerup={stopVolumePreview}
          onpointercancel={stopVolumePreview}
          onlostpointercapture={stopVolumePreview}
          onkeydown={startVolumePreview}
          onkeyup={stopVolumePreview}
          onblur={stopVolumePreview}
        />
      </div>
    {/if}
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

    <div class="setting">
    <ToggleRow
      icon={settings.lockRotationEnabled ? 'mobile-lock' : 'mobile-rotate'}
      label="Lock device rotation"
      id="lockRotationToggle"
      checked={settings.lockRotationEnabled}
      onToggle={setLockRotation}
    />
  </div>

  {#if settings.lockRotationEnabled}
  <div class="setting" transition:slide={{ duration: 220 }}>
    <ToggleRow
      icon={settings.forceLandscapeOrientation ? 'mobile-landscape' : 'mobile-portrait'}
      label="Force landscape orientation"
      id="forceLandscapeToggle"
      checked={settings.forceLandscapeOrientation}
      onToggle={setForceLandscapeOrientation}
    />
  </div>
  {/if}
  
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

  .volume-setting {
    margin: 12px 0 2px 30px;
  }

  .volume-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #666;
  }

  .volume-slider {
    width: 100%;
    height: 32px;
    accent-color: var(--brand);
    cursor: pointer;
  }
</style>
