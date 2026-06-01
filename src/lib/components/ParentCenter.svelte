<script>
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { ui, openParentCenter, closeParentCenter } from '$lib/state/ui.svelte.js';
  import {
    settings,
    setSound,
    setSaveOnDelete,
    setScreenshot,
    setUndoButton,
    setStrokeWidthControl,
    setEraser,
    setColoringBook,
    setAiImage,
    setAiCustomization,
    setAiAccessToken,
    setAdminAccessToken,
    setAdvancedControls
  } from '$lib/state/settings.svelte.js';
  import { clearOverlay } from '$lib/state/coloringBook.svelte.js';

  let dialogEl;
  let buttonEl;
  let activeTab = $state('settings');
  let installOs = $state('ios');
  let pwaInstalled = $state(false);
  let accessCodeInput = $state('');
  let aiLocked = $derived(!settings.aiAccessToken);

  function submitAccessCode() {
    const code = accessCodeInput.trim();
    if (!code) return;
    setAiAccessToken(code);
    accessCodeInput = '';
  }

  const APP_VERSION =
    typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  // Hidden admin unlock: tapping the version text 5 times prompts for the
  // access key, which is then persisted to localStorage. The key is only
  // trusted after server-side validation against ADMIN_ACCESS_TOKEN.
  let versionClicks = 0;
  function handleVersionClick() {
    versionClicks += 1;
    if (versionClicks < 5) return;
    versionClicks = 0;
    const key = window.prompt('Enter admin access key');
    if (key && key.trim()) setAdminAccessToken(key.trim());
  }

  let adminLink = $derived(
    settings.adminAccessToken
      ? `/admin?access-key=${encodeURIComponent(settings.adminAccessToken)}`
      : ''
  );

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
        activeTab = 'settings';
        installOs = detectOS();
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
  <Icon name="parent" class="parent-help-icon" aria-label="Parent Center" role="img" />
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
      <button class="tab-button" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>
        <Icon name="settings" class="tab-icon" />
        <span>Settings</span>
      </button>
      <button class="tab-button" class:active={activeTab === 'install'} onclick={() => (activeTab = 'install')}>
        <Icon name="install-app" class="tab-icon" />
        <span>Install</span>
      </button>
    </div>

    <div class="tab-content" class:active={activeTab === 'install'}>
      {#each installOs === 'android' ? ['android', 'ios'] : ['ios', 'android'] as os (os)}
        {#if os === 'ios'}
          <section class="os-section">
            <h3 class="os-heading">iOS</h3>
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
          </section>
        {:else}
          <section class="os-section">
            <h3 class="os-heading">Android</h3>
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
          </section>
        {/if}
      {/each}
    </div>

    <div class="tab-content" class:active={activeTab === 'settings'}>
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

      <section class="setting-group">
        <h3 class="setting-group-heading">
          AI
          {#if aiLocked}
            <span class="lock-badge"><Icon name="lock" class="lock-badge-icon" />Locked</span>
          {/if}
        </h3>

        {#if aiLocked}
          <div class="setting access-code">
            <label class="access-code-label" for="aiAccessCode">Access Code</label>
            <p class="access-code-hint">Enter an access code to unlock AI features.</p>
            <div class="access-code-row">
              <input
                id="aiAccessCode"
                class="access-code-input"
                type="text"
                placeholder="Enter access code"
                bind:value={accessCodeInput}
                onkeydown={(e) => e.key === 'Enter' && submitAccessCode()}
              />
              <button
                class="access-code-submit"
                onclick={submitAccessCode}
                disabled={!accessCodeInput.trim()}
              >
                Submit
              </button>
            </div>
          </div>
        {/if}

        <div class="ai-controls" class:locked={aiLocked} aria-hidden={aiLocked}>
          <div class="setting">
            <div class="setting-toggle">
              <label class="setting-info" for="aiImageToggle">
                <Icon name="wand-stars" class="setting-icon" />
                <span class="setting-label">AI Image Button</span>
              </label>
              <button
                class="toggle-switch"
                class:active={!aiLocked && settings.aiImageEnabled}
                id="aiImageToggle"
                role="switch"
                aria-label="AI Image Button"
                aria-checked={!aiLocked && settings.aiImageEnabled}
                disabled={aiLocked}
                onclick={() => setAiImage(!settings.aiImageEnabled)}
              >
                <span class="toggle-switch-thumb"></span>
              </button>
            </div>
          </div>

          {#if !aiLocked && settings.aiImageEnabled}
            <div class="setting" transition:slide={{ duration: 220 }}>
              <div class="setting-toggle">
                <label class="setting-info" for="aiCustomizationToggle">
                  <Icon name="customize" class="setting-icon" />
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
        </div>
      </section>
    </div>

    <footer class="parent-help-footer">
      <p>Having issues? <a href="https://github.com/KyleMit/Splotch/issues/new/choose" target="_blank" rel="noopener noreferrer">Report a problem</a></p>
      <p><a href="/privacy">Privacy Policy</a> — no ads, no tracking, no accounts.</p>
      <p class="github-link">
        <a href="https://github.com/KyleMit/Splotch" target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub">
          <Icon name="github" class="github-icon" aria-label="GitHub" role="img" />
          View on GitHub
        </a>
      </p>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <p class="version-text" onclick={handleVersionClick}>Version {APP_VERSION}</p>
      {#if adminLink}
        <p class="admin-link"><a href={adminLink}>Admin</a></p>
      {/if}
      {#if import.meta.env.DEV}
        <p class="admin-link"><a href="/dev/ai-timer">AI Timer</a></p>
      {/if}
    </footer>
  </div>
</dialog>

<style>
  /* Trigger button (floats in the bottom-right corner) */
  .parent-help-button {
    position: fixed;
    bottom: 8px;
    right: 8px;
    width: 48px;
    height: 48px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: #999;
    opacity: 0.4;
    transition: opacity 0.2s ease;
    z-index: 900;
    padding: 8px;
    touch-action: manipulation;
  }

  .parent-help-button:hover {
    opacity: 0.7;
  }

  .parent-help-button:active {
    opacity: 1;
  }

  :global(.parent-help-icon) {
    width: 100%;
    height: 100%;
    filter: invert(60%) grayscale(100%);
  }

  .parent-help-button:hover :global(.parent-help-icon) {
    filter: invert(40%) grayscale(100%);
  }

  .parent-help-button:active :global(.parent-help-icon) {
    filter: invert(0%) grayscale(100%);
  }

  /* Modal dialog */
  .parent-help-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
    padding: 0;
  }

  .parent-help-modal::backdrop {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  }

  .parent-help-modal[open] {
    animation: dialogFlyFromOrigin 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
    transform-origin: center;
  }

  .parent-help-content {
    padding: 32px;
    position: relative;
    max-height: 80vh;
    overflow-y: auto;
  }

  .parent-help-content h2 {
    margin: 0 0 20px 0;
    font-size: 24px;
    color: #333;
    font-weight: 600;
  }

  .parent-help-content h3 {
    margin: 0 0 12px 0;
    font-size: 18px;
    color: #555;
    font-weight: 600;
  }

  /* Tab Buttons */
  .tab-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 2px solid #e0e0e0;
  }

  .tab-button {
    flex: 1;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: #999;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: -2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  :global(.tab-icon) {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    opacity: 0.7;
    transition: opacity 0.2s ease;
  }

  .tab-button.active :global(.tab-icon) {
    opacity: 1;
  }

  .tab-button:hover {
    color: #666;
    background: #f5f5f5;
  }

  .tab-button.active {
    color: #AB71E1;
    border-bottom-color: #AB71E1;
  }

  /* Tab Content */
  .tab-content {
    display: none;
  }

  .tab-content.active {
    display: block;
  }

  .help-section {
    margin-bottom: 16px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
  }

  .help-section:last-of-type {
    margin-bottom: 0;
  }

  .help-section summary {
    padding: 16px;
    font-size: 18px;
    font-weight: 600;
    color: #555;
    cursor: pointer;
    user-select: none;
    list-style: none;
    background: #f8f8f8;
    transition: background 0.2s ease;
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }

  .help-section summary:hover {
    background: #f0f0f0;
  }

  .help-section summary::-webkit-details-marker {
    display: none;
  }

  .help-section summary::after {
    content: '›';
    font-size: 24px;
    color: #999;
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .help-section[open] summary::after {
    transform: rotate(90deg);
  }

  .os-section + .os-section {
    margin-top: 20px;
  }

  .os-heading {
    margin: 0 0 10px 0;
    font-size: 13px;
    font-weight: 700;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .summary-text {
    flex: 1;
    text-align: left;
  }

  .section-number {
    color: #AB71E1;
    margin-right: 8px;
  }

  .install-check {
    color: #4CAF50;
    font-weight: bold;
    margin-left: 8px;
    font-size: 20px;
  }

  .help-section ol {
    padding: 16px 24px 16px 40px;
    margin: 0;
    color: #666;
    line-height: 1.8;
  }

  .parent-help-content li {
    margin-bottom: 8px;
  }

  .parent-help-content li:last-child {
    margin-bottom: 0;
  }

  .parent-help-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    font-size: 32px;
    line-height: 32px;
    color: #999;
    cursor: pointer;
    padding: 0;
    transition: color 0.2s ease;
  }

  .parent-help-close:hover {
    color: #666;
  }

  /* Settings */
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

  /* Locked AI controls */
  .lock-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #eee;
    color: #999;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    vertical-align: middle;
  }

  :global(.lock-badge-icon) {
    width: 13px;
    height: 13px;
  }

  .ai-controls.locked {
    opacity: 0.5;
    filter: grayscale(1);
    pointer-events: none;
    user-select: none;
  }

  /* AI access code entry */
  .access-code-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #555;
    margin-bottom: 4px;
  }

  .access-code-hint {
    margin: 0 0 10px 0;
    font-size: 13px;
    color: #777;
    line-height: 1.4;
  }

  .access-code-row {
    display: flex;
    gap: 8px;
  }

  .access-code-input {
    flex: 1;
    min-width: 0;
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fff;
    color: #333;
  }

  .access-code-input:focus {
    outline: none;
    border-color: #AB71E1;
  }

  .access-code-submit {
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: #AB71E1;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s ease;
    flex-shrink: 0;
  }

  .access-code-submit:hover {
    background: #9961d1;
  }

  .access-code-submit:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .parent-help-footer {
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    color: #999;
    font-size: 14px;
  }

  .parent-help-footer p {
    margin: 0 0 8px 0;
  }

  .parent-help-footer a {
    color: #AB71E1;
    text-decoration: none;
    font-weight: 500;
  }

  .parent-help-footer a:hover {
    text-decoration: underline;
  }

  .github-link {
    margin: 12px 0 !important;
  }

  .github-link a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #666;
    font-size: 14px;
    transition: color 0.2s ease;
  }

  .github-link a:hover {
    color: #333;
    text-decoration: none;
  }

  :global(.github-icon) {
    width: 20px;
    height: 20px;
    opacity: 0.8;
    transition: opacity 0.2s ease;
  }

  .github-link a:hover :global(.github-icon) {
    opacity: 1;
  }

  .version-text {
    font-size: 12px;
    color: #bbb;
    font-family: 'Courier New', monospace;
    user-select: none;
  }

  .admin-link {
    font-size: 12px;
  }
</style>
