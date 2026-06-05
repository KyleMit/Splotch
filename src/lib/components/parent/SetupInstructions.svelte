<script lang="ts">
  import { isNative, getPlatform } from '$lib/platform';

  // `open` flips true when the Parent Center modal opens; we re-run platform/OS
  // detection then so the instructions match the current device and install state.
  let { open = false } = $props();

  let installOs = $state('ios');
  let pwaInstalled = $state(false);
  // True inside a native Capacitor shell. Native builds are already "installed",
  // so we drop the PWA install step and only show the device-lock setup for the
  // platform we're actually running on.
  let native = $state(false);
  // 'web' | 'ios' | 'android' — the platform we're running on.
  let platform = $state('web');

  // Which OS setup sections to render. On native we know the exact platform, so
  // we show just that one; on the web we show both, detected OS first.
  let setupOsList = $derived(
    native
      ? [platform === 'android' ? 'android' : 'ios']
      : installOs === 'android'
        ? ['android', 'ios']
        : ['ios', 'android']
  );
  // Native builds have a single setup step per platform, so the accordion
  // numbering is dropped.
  let showSectionNumbers = $derived(!native);

  function detectOS() {
    if (typeof navigator === 'undefined') return 'ios';
    const ua = navigator.userAgent || navigator.vendor || '';
    if (/iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'ios';
  }

  function isPWAInstalled() {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    );
  }

  $effect(() => {
    if (open) {
      installOs = detectOS();
      pwaInstalled = isPWAInstalled();
      platform = getPlatform();
      native = isNative();
    }
  });
</script>

{#each setupOsList as os (os)}
  {#if os === 'ios'}
    <section class="os-section">
      <h3 class="os-heading">iOS</h3>
      {#if !native}
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
      {/if}

      <details class="help-section">
        <summary><span class="summary-text">{#if showSectionNumbers}<span class="section-number">2.</span> {/if}Enable Guided Access</span></summary>
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
      {#if !native}
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
      {/if}

      <details class="help-section">
        <summary><span class="summary-text">{#if showSectionNumbers}<span class="section-number">2.</span> {/if}Enable App Pinning</span></summary>
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

<style>
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
    color: var(--brand);
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

  .help-section li {
    margin-bottom: 8px;
  }

  .help-section li:last-child {
    margin-bottom: 0;
  }
</style>
