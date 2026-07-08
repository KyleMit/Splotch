<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import Slider from '../Slider.svelte';
  import Icon from '../Icon.svelte';
  import {
    settings,
    setSound,
    setSoundVolume,
    SOUND_VOLUME_DEFAULT,
    setActionButtonScale,
    ACTION_BUTTON_SCALE_MIN,
    ACTION_BUTTON_SCALE_MAX,
    ACTION_BUTTON_SCALE_DEFAULT,
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
    setTheme,
    changeSaveFolder,
    forgetSaveFolder,
  } from '$lib/state/settings.svelte';
  import type { ThemePreference } from '$lib/theme';
  import type { IconName } from '../icon-names';
  import { setResizingActionButtons } from '$lib/state/ui.svelte';
  import { clearOverlay } from '$lib/state/coloringBook.svelte';
  import { supportsOrientationLock } from '$lib/platform';
  import { folderSaveSupported } from '$lib/drawing/folderSave';
  import { playDrawSound, stopDrawSound } from '$lib/audio/drawingSound';

  // Windowed platforms (iPadOS 26+) own device orientation through their own
  // window controls and ignore in-app locks, so the toggles are hidden there.
  const showOrientationControls = supportsOrientationLock();

  // The optional save folder is desktop-Chromium only (File System Access API).
  // On every other browser the row is hidden and saves stay as downloads.
  const showFolderSave = folderSaveSupported();

  const themeOptions: { value: ThemePreference; label: string; icon: IconName }[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
    { value: 'system', label: 'System', icon: 'theme-auto' },
  ];

  const PREVIEW_SPEED = 0.45;
  let previewingVolume = false;

  // Side-effect on top of the persisted setting: disabling the coloring book
  // should also clear any active overlay page.
  function toggleColoringBook() {
    const next = !settings.coloringBookEnabled;
    setColoringBook(next);
    if (!next) clearOverlay();
  }

  // While the volume slider is being adjusted, loop the pencil-scratch sound so
  // the parent hears the level they're setting.
  function previewVolume() {
    if (!settings.soundEnabled || !previewingVolume) return;
    playDrawSound({ speed: PREVIEW_SPEED });
  }

  function onVolumeActive(active: boolean) {
    previewingVolume = active;
    if (active) previewVolume();
    else stopDrawSound();
  }

  function onVolumeInput(value: number) {
    setSoundVolume(value);
    previewVolume();
  }

  // While the button-size slider is dragged, the Parent Center melts away to just
  // the slider (see ParentCenter) so the parent can watch the action buttons
  // resize live behind it.
  function onScaleActive(active: boolean) {
    setResizingActionButtons(active);
  }
</script>

<section class="setting-group">
  <h3 class="setting-group-heading">Settings</h3>

  <div class="setting">
    <div class="appearance-label">
      <Icon name="theme-auto" class="setting-icon" />
      <span class="appearance-title">Appearance</span>
    </div>
    <div class="theme-picker" role="radiogroup" aria-label="Appearance">
      {#each themeOptions as option (option.value)}
        <button
          class="theme-option"
          class:active={settings.theme === option.value}
          id="themeOption-{option.value}"
          role="radio"
          aria-checked={settings.theme === option.value}
          onclick={() => setTheme(option.value)}
        >
          <Icon name={option.icon} class="theme-option-icon" />
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="setting">
    <ToggleRow
      icon={settings.soundEnabled ? 'volume-on' : 'volume-off'}
      label="Drawing Sounds"
      id="soundToggle"
      checked={settings.soundEnabled}
      onToggle={setSound}
    />
    {#if settings.soundEnabled}
      <div class="slider-setting" transition:slide={{ duration: 220 }}>
        <div class="slider-label" id="soundVolumeLabel">
          <span>Volume</span>
          <span>{settings.soundVolume}%</span>
        </div>
        <Slider
          value={settings.soundVolume}
          min={0}
          max={100}
          snap={SOUND_VOLUME_DEFAULT}
          labelId="soundVolumeLabel"
          valueText="{settings.soundVolume}%"
          onInput={onVolumeInput}
          onActiveChange={onVolumeActive}
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
    <div class="setting slider-setting button-size-setting" transition:slide={{ duration: 220 }}>
      <div class="slider-label" id="actionButtonScaleLabel">
        <span class="slider-label-name">
          <Icon name="photo-size-select-small" class="setting-icon" />
          Button Size
        </span>
        <span>{settings.actionButtonScale}%</span>
      </div>
      <Slider
        value={settings.actionButtonScale}
        min={ACTION_BUTTON_SCALE_MIN}
        max={ACTION_BUTTON_SCALE_MAX}
        snap={ACTION_BUTTON_SCALE_DEFAULT}
        labelId="actionButtonScaleLabel"
        valueText="{settings.actionButtonScale}%"
        onInput={setActionButtonScale}
        onActiveChange={onScaleActive}
      />
    </div>

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
  .setting-group .setting + .setting {
    margin-top: 6px;
  }

  h3.setting-group-heading {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .appearance-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .appearance-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }

  /* iOS-style segmented control: the active segment reads as a raised card. */
  .theme-picker {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--slider-track);
    border-radius: 12px;
  }

  .theme-option {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 4px;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--text-mid);
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  @media (hover: hover) {
    .theme-option:not(.active):hover {
      color: var(--text-strong);
    }
  }

  .theme-option.active {
    background: var(--surface);
    color: var(--text-strong);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  }

  :global(.theme-option-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
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

  /* Volume sits indented under its toggle; the button-size slider is a full
     setting card of its own. Both share the label + Slider layout. */
  .slider-setting {
    margin: 12px 0 2px 30px;
  }

  .button-size-setting {
    margin: 0;
  }

  .slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-mid);
  }

  .slider-label-name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
  }
</style>
