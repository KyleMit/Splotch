<script lang="ts">
  import { onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
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
    setForceLandscapeOrientation,
    setPencilEraserEnabled,
    toggleSaveFeature,
    changeSaveFolder,
  } from '$lib/state/settings.svelte';
  import { clearOverlay } from '$lib/state/coloringBook.svelte';
  import { supportsOrientationLock } from '$lib/platform';
  import { folderSaveSupported } from '$lib/drawing/folderSave';
  import { playDrawSound, stopDrawSound } from '$lib/audio/drawingSound';

  // Windowed platforms (iPadOS 26+) own device orientation through their own
  // window controls and ignore in-app locks, so the toggles are hidden there.
  const showOrientationControls = supportsOrientationLock();

  // Silent folder save is desktop-Chromium only (File System Access API). On
  // every other browser the folder row is hidden and saves stay as downloads.
  const showFolderSave = folderSaveSupported();

  const PREVIEW_SPEED = 0.45;
  let previewingVolume = false;

  let volumeTrack: HTMLDivElement;
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartValue = 0;

  function clampVolume(value: number) {
    return Math.round(Math.min(100, Math.max(0, value)));
  }

  function applyVolume(next: number) {
    const clamped = clampVolume(next);
    if (clamped === settings.soundVolume) return;
    setSoundVolume(clamped);
    previewVolume();
  }

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

  // Relative drag: grabbing anywhere on the bar and sliding moves the value by
  // the distance travelled, rather than jumping to the finger like a native range.
  // Move/up are tracked on window so the drag keeps following the finger even when
  // it leaves the bar (more reliable than setPointerCapture).
  function onVolumePointerDown(event: PointerEvent) {
    if (!event.isPrimary) return;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartValue = settings.soundVolume;
    window.addEventListener('pointermove', onVolumePointerMove);
    window.addEventListener('pointerup', onVolumePointerUp);
    window.addEventListener('pointercancel', onVolumePointerUp);
    startVolumePreview();
    event.preventDefault();
  }

  function onVolumePointerMove(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    const width = volumeTrack?.clientWidth || 1;
    const deltaValue = ((event.clientX - dragStartX) / width) * 100;
    applyVolume(dragStartValue + deltaValue);
    event.preventDefault();
  }

  function onVolumePointerUp(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    window.removeEventListener('pointermove', onVolumePointerMove);
    window.removeEventListener('pointerup', onVolumePointerUp);
    window.removeEventListener('pointercancel', onVolumePointerUp);
    stopVolumePreview();
  }

  onDestroy(() => {
    window.removeEventListener('pointermove', onVolumePointerMove);
    window.removeEventListener('pointerup', onVolumePointerUp);
    window.removeEventListener('pointercancel', onVolumePointerUp);
  });

  function onVolumeKeyDown(event: KeyboardEvent) {
    let next = settings.soundVolume;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next -= 1;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next += 1;
        break;
      case 'PageDown':
        next -= 10;
        break;
      case 'PageUp':
        next += 10;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 100;
        break;
      default:
        return;
    }
    event.preventDefault();
    startVolumePreview();
    applyVolume(next);
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
        <div class="volume-label" id="soundVolumeLabel">
          <span>Volume</span>
          <span>{settings.soundVolume}%</span>
        </div>
        <div
          class="volume-slider"
          role="slider"
          tabindex="0"
          aria-labelledby="soundVolumeLabel"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={settings.soundVolume}
          aria-valuetext="{settings.soundVolume}%"
          onpointerdown={onVolumePointerDown}
          onkeydown={onVolumeKeyDown}
          onkeyup={stopVolumePreview}
          onblur={stopVolumePreview}
        >
          <div class="volume-track" bind:this={volumeTrack}>
            <div class="volume-fill" style:width="{settings.soundVolume}%"></div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="setting">
    <ToggleRow
      icon="camera-party"
      label="Auto-Save on Delete"
      id="saveOnDeleteToggle"
      checked={settings.saveOnDeleteEnabled}
      onToggle={(next) => toggleSaveFeature(setSaveOnDelete, next)}
      help="Saves the current drawing each time the page is cleared"
    />
  </div>

  {#if showFolderSave}
    <div class="setting folder-location">
      <div class="folder-info">
        <Icon name="folder" class="setting-icon" />
        <div class="folder-text">
          <span class="folder-title">Saved photos folder</span>
          {#if settings.saveFolderName}
            <span class="folder-path">{settings.saveFolderName}</span>
          {:else}
            <span class="folder-path unset">Not set yet</span>
          {/if}
        </div>
      </div>
      <button class="folder-change" id="changeSaveFolderButton" onclick={changeSaveFolder}>
        {settings.saveFolderName ? 'Change' : 'Select folder'}
      </button>
    </div>
  {/if}

  {#if showOrientationControls}
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
  {/if}

  {#if settings.applePencilSeen}
    <div class="setting" transition:slide={{ duration: 220 }}>
      <ToggleRow
        icon="eraser"
        label="Apple Pencil double-tap to erase"
        id="pencilEraserToggle"
        checked={settings.pencilEraserEnabled}
        onToggle={setPencilEraserEnabled}
        help="Double-tap an Apple Pencil to switch between drawing and erasing"
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
        onToggle={(next) => toggleSaveFeature(setScreenshot, next)}
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

  .folder-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .folder-title {
    font-size: 14px;
    font-weight: 500;
    color: #555;
  }

  .folder-path {
    font-size: 13px;
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-path.unset {
    font-style: italic;
    color: #999;
  }

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
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .volume-slider:focus-visible {
    outline: none;
  }

  .volume-slider:focus-visible .volume-track {
    outline: 3px solid var(--brand);
    outline-offset: 2px;
  }

  .volume-track {
    position: relative;
    width: 100%;
    height: 28px;
    border-radius: 999px;
    background: #e9e9e9;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
    overflow: hidden;
  }

  .volume-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--brand);
  }
</style>
