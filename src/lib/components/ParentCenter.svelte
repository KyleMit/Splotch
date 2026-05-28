<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { ui, openParentCenter, closeParentCenter } from '$lib/state/ui.svelte.js';
  import {
    settings,
    setSound,
    setSaveOnDelete,
    setScreenshot,
    setUndoButton,
    setStrokeWidthControl,
    setColoringBook,
    setAiImage,
    setAiCustomization
  } from '$lib/state/settings.svelte.js';
  import { clearOverlay } from '$lib/state/coloringBook.svelte.js';

  let dialogEl;
  let buttonEl;
  let activeTab = $state('ios');
  let pwaInstalled = $state(false);

  const APP_VERSION =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  function detectOS() {
    if (typeof navigator === 'undefined') return 'ios';
    const ua = navigator.userAgent || navigator.vendor || '';
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'ios';
  }

  function isPWAInstalled() {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true
    );
  }

  $effect(() => {
    if (!dialogEl) return;
    if (ui.parentCenterOpen) {
      if (!dialogEl.open) {
        if (ui.parentCenterOrigin) {
          const { x, y } = ui.parentCenterOrigin;
          dialogEl.style.setProperty('--origin-x', `${x - window.innerWidth / 2}px`);
          dialogEl.style.setProperty('--origin-y', `${y - window.innerHeight / 2}px`);
        }
        activeTab = detectOS();
        pwaInstalled = isPWAInstalled();
        dialogEl.showModal();
      }
    } else {
      if (dialogEl.open) dialogEl.close();
    }
  });

  function openModal() {
    if (!buttonEl) return;
    const rect = buttonEl.getBoundingClientRect();
    openParentCenter({
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    });
  }

  function handleBackdropClick(e) {
    const rect = dialogEl.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) closeParentCenter();
  }

  function handleDialogClose() {
    if (ui.parentCenterOpen) closeParentCenter();
  }

  // Side-effects on top of the persisted settings rune. (Toggles below set
  // the persisted value directly; we just need to react to it for the
  // coloring-book case, where disabling should also clear any active page.)
  function toggleColoringBook() {
    const next = !settings.coloringBookEnabled;
    setColoringBook(next);
    if (!next) clearOverlay();
  }
</script>

<button
  class="parent-help-button"
  id="parentHelpButton"
  aria-label="Parent Center"
  bind:this={buttonEl}
  onclick={openModal}
>
  <img src="/icons/parent.svg" alt="Parent Center" class="parent-help-icon" />
</button>

<dialog
  class="parent-help-modal"
  id="parentHelpModal"
  bind:this={dialogEl}
  onclick={handleBackdropClick}
  onclose={handleDialogClose}
>
  <div class="parent-help-content">
    <button class="parent-help-close" aria-label="Close" onclick={closeParentCenter}>×</button>
    <h2>Parent Center</h2>

    <div class="tab-buttons">
      <button class="tab-button" class:active={activeTab === 'ios'} onclick={() => (activeTab = 'ios')}>iOS</button>
      <button class="tab-button" class:active={activeTab === 'android'} onclick={() => (activeTab = 'android')}>Android</button>
      <button class="tab-button" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>Settings</button>
    </div>

    <div class="tab-content" class:active={activeTab === 'ios'}>
      <details class="help-section">
        <summary>
          <span class="summary-text">
            <span class="section-number">1.</span> Install as App
            {#if pwaInstalled}<span class="install-check">✓</span>{/if}
          </span>
        </summary>
        <ol>
          <li>Tap the <strong>Share</strong> button (square with arrow)</li>
          <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
          <li>Tap <strong>"Add"</strong> in the top right</li>
          <li>Launch from your home screen for fullscreen mode</li>
        </ol>
      </details>

      <details class="help-section">
        <summary><span class="summary-text"><span class="section-number">2.</span> Enable Guided Access</span></summary>
        <ol>
          <li>Go to <strong>Settings → Accessibility → Guided Access</strong></li>
          <li>Turn on <strong>Guided Access</strong></li>
          <li>Set a passcode</li>
          <li>Open Splotch and triple-click the side button</li>
          <li>Tap <strong>Start</strong> to lock the app</li>
          <li>Triple-click and enter passcode to exit</li>
        </ol>
      </details>
    </div>

    <div class="tab-content" class:active={activeTab === 'android'}>
      <details class="help-section">
        <summary>
          <span class="summary-text">
            <span class="section-number">1.</span> Install as App
            {#if pwaInstalled}<span class="install-check">✓</span>{/if}
          </span>
        </summary>
        <ol>
          <li>Tap the <strong>menu</strong> (three dots)</li>
          <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></li>
          <li>Follow the prompts</li>
          <li>Launch from your home screen for fullscreen mode</li>
        </ol>
      </details>

      <details class="help-section">
        <summary><span class="summary-text"><span class="section-number">2.</span> Enable App Pinning</span></summary>
        <ol>
          <li>Go to <strong>Settings → Security → App Pinning</strong></li>
          <li>Turn on <strong>App Pinning</strong></li>
          <li>Open Splotch and tap the <strong>Recent Apps</strong> button</li>
          <li>Swipe up on Splotch and tap the <strong>Pin</strong> icon</li>
          <li>Tap <strong>Start</strong> to lock the app</li>
          <li>Long-press Back + Recent Apps to exit</li>
        </ol>
      </details>
    </div>

    <div class="tab-content" class:active={activeTab === 'settings'}>
      <section class="setting-group">
        <h3 class="setting-group-heading">Settings</h3>

        <div class="setting">
          <div class="setting-toggle">
            <label class="setting-info" for="soundToggle">
              <img src="/icons/volume-on.svg" alt="" class="setting-icon" />
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
              <img src="/icons/camera-party.svg" alt="" class="setting-icon" />
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
        </div>
      </section>

      <section class="setting-group">
        <h3 class="setting-group-heading">Controls</h3>

        <div class="setting">
          <div class="setting-toggle">
            <label class="setting-info" for="strokeWidthToggle">
              <img src="/icons/line-weight.svg" alt="" class="setting-icon" />
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

        <div class="setting">
          <div class="setting-toggle">
            <label class="setting-info" for="coloringBookToggle">
              <img src="/icons/shapes.svg" alt="" class="setting-icon" />
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

        <div class="setting">
          <div class="setting-toggle">
            <label class="setting-info" for="screenshotToggle">
              <img src="/icons/camera.svg" alt="" class="setting-icon" />
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

        <div class="setting">
          <div class="setting-toggle">
            <label class="setting-info" for="undoToggle">
              <img src="/icons/undo.svg" alt="" class="setting-icon" />
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
      </section>

      {#if settings.aiAccessToken}
        <section class="setting-group">
          <h3 class="setting-group-heading">AI</h3>

          <div class="setting">
            <div class="setting-toggle">
              <label class="setting-info" for="aiImageToggle">
                <img src="/icons/wand-stars.svg" alt="" class="setting-icon" />
                <span class="setting-label">AI Image Button</span>
              </label>
              <button
                class="toggle-switch"
                class:active={settings.aiImageEnabled}
                id="aiImageToggle"
                role="switch"
                aria-label="AI Image Button"
                aria-checked={settings.aiImageEnabled}
                onclick={() => setAiImage(!settings.aiImageEnabled)}
              >
                <span class="toggle-switch-thumb"></span>
              </button>
            </div>
          </div>

          {#if settings.aiImageEnabled}
            <div class="setting" transition:slide={{ duration: 220 }}>
              <div class="setting-toggle">
                <label class="setting-info" for="aiCustomizationToggle">
                  <img src="/icons/customize.svg" alt="" class="setting-icon" />
                  <span class="setting-label">AI Customization</span>
                </label>
                <button
                  class="toggle-switch"
                  class:active={settings.aiCustomizationEnabled}
                  id="aiCustomizationToggle"
                  role="switch"
                  aria-label="AI Customization"
                  aria-checked={settings.aiCustomizationEnabled}
                  onclick={() => setAiCustomization(!settings.aiCustomizationEnabled)}
                >
                  <span class="toggle-switch-thumb"></span>
                </button>
              </div>
            </div>
          {/if}
        </section>
      {/if}
    </div>

    <footer class="parent-help-footer">
      <p>Having issues? <a href="https://github.com/KyleMit/Splotch/issues/new/choose" target="_blank" rel="noopener noreferrer">Report a problem</a></p>
      <p class="github-link">
        <a href="https://github.com/KyleMit/Splotch" target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub">
          <img src="/icons/github.svg" alt="GitHub" class="github-icon" />
          View on GitHub
        </a>
      </p>
      <p class="version-text">Version {APP_VERSION}</p>
    </footer>
  </div>
</dialog>
