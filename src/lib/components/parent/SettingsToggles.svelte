<script>
  import { slide } from 'svelte/transition';
  import Icon from '../Icon.svelte';
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
  } from '$lib/state/settings.svelte.js';
  import { clearOverlay } from '$lib/state/coloringBook.svelte.js';

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
    <div class="setting-toggle">
      <label class="setting-info" for="soundToggle">
        <Icon name="volume-on" class="setting-icon" />
        <span class="setting-label">Drawing Sounds</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.soundEnabled}
        id="soundToggle"
        role="switch"
        aria-label="Drawing Sounds"
        aria-checked={settings.soundEnabled}
        onclick={() => setSound(!settings.soundEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
  </div>

  <div class="setting">
    <div class="setting-toggle">
      <label class="setting-info" for="saveOnDeleteToggle">
        <Icon name="camera-party" class="setting-icon" />
        <span class="setting-label">Auto-Save on Delete</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.saveOnDeleteEnabled}
        id="saveOnDeleteToggle"
        role="switch"
        aria-label="Auto-Save on Delete"
        aria-checked={settings.saveOnDeleteEnabled}
        onclick={() => setSaveOnDelete(!settings.saveOnDeleteEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
    <p class="setting-help">Saves the current drawing each time the page is cleared</p>
  </div>
</section>

<section class="setting-group">
  <h3 class="setting-group-heading">Controls</h3>

  <div class="setting">
    <div class="setting-toggle">
      <label class="setting-info" for="advancedControlsToggle">
        <Icon name="dashboard-customize" class="setting-icon" />
        <span class="setting-label">Enable Advanced Controls</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.advancedControlsEnabled}
        id="advancedControlsToggle"
        role="switch"
        aria-label="Enable Advanced Controls"
        aria-checked={settings.advancedControlsEnabled}
        onclick={() => setAdvancedControls(!settings.advancedControlsEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
  </div>

  {#if settings.advancedControlsEnabled}
  <div class="setting" transition:slide={{ duration: 220 }}>
    <div class="setting-toggle">
      <label class="setting-info" for="strokeWidthToggle">
        <Icon name="line-weight" class="setting-icon" />
        <span class="setting-label">Stroke Width Button</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.strokeWidthControlEnabled}
        id="strokeWidthToggle"
        role="switch"
        aria-label="Stroke Width Button"
        aria-checked={settings.strokeWidthControlEnabled}
        onclick={() => setStrokeWidthControl(!settings.strokeWidthControlEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <div class="setting-toggle">
      <label class="setting-info" for="eraserToggle">
        <Icon name="eraser" class="setting-icon" />
        <span class="setting-label">Eraser Button</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.eraserEnabled}
        id="eraserToggle"
        role="switch"
        aria-label="Eraser Button"
        aria-checked={settings.eraserEnabled}
        onclick={() => setEraser(!settings.eraserEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <div class="setting-toggle">
      <label class="setting-info" for="coloringBookToggle">
        <Icon name="shapes" class="setting-icon" />
        <span class="setting-label">Coloring Book Button</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.coloringBookEnabled}
        id="coloringBookToggle"
        role="switch"
        aria-label="Coloring Book Button"
        aria-checked={settings.coloringBookEnabled}
        onclick={toggleColoringBook}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <div class="setting-toggle">
      <label class="setting-info" for="screenshotToggle">
        <Icon name="camera" class="setting-icon" />
        <span class="setting-label">Screenshot Button</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.screenshotEnabled}
        id="screenshotToggle"
        role="switch"
        aria-label="Screenshot Button"
        aria-checked={settings.screenshotEnabled}
        onclick={() => setScreenshot(!settings.screenshotEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
  </div>

  <div class="setting" transition:slide={{ duration: 220 }}>
    <div class="setting-toggle">
      <label class="setting-info" for="undoToggle">
        <Icon name="undo" class="setting-icon" />
        <span class="setting-label">Undo Button</span>
      </label>
      <button
        class="toggle-switch"
        class:active={settings.undoButtonEnabled}
        id="undoToggle"
        role="switch"
        aria-label="Undo Button"
        aria-checked={settings.undoButtonEnabled}
        onclick={() => setUndoButton(!settings.undoButtonEnabled)}
      >
        <span class="toggle-switch-thumb"></span>
      </button>
    </div>
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

  .setting-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .setting-help {
    margin: 6px 0 0 30px;
    font-size: 13px;
    color: #777;
    line-height: 1.4;
  }

  .setting-info {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  :global(.setting-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .setting-label {
    font-size: 14px;
    font-weight: 500;
    color: #555;
  }

  /* iOS-style toggle switch (boolean settings) */
  .toggle-switch {
    width: 52px;
    height: 32px;
    background: #ddd;
    border: none;
    border-radius: 999px;
    padding: 0;
    position: relative;
    cursor: pointer;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .toggle-switch:hover {
    background: #ccc;
  }

  .toggle-switch.active {
    background: #AB71E1;
  }

  .toggle-switch.active:hover {
    background: #9961d1;
  }

  .toggle-switch-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 26px;
    height: 26px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease;
  }

  .toggle-switch.active .toggle-switch-thumb {
    transform: translateX(20px);
  }

  .toggle-switch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .toggle-switch:disabled:hover {
    background: #ddd;
  }
</style>
