<script lang="ts">
  import { isNative, getPlatform } from '$lib/platform';
  import { lazyPluginModule } from '$lib/nativePlugin';

  const loadDeviceLock = lazyPluginModule(() => import('$lib/plugins/deviceLock'));

  // `open` flips true when the Parent Center modal opens; we re-run platform/OS
  // detection then so the instructions match the current device and install state.
  let { open = false } = $props();

  let installOs = $state('ios');
  let pwaInstalled = $state(false);
  // True when Guided Access (iOS) / App Pinning (Android) is currently engaged. Native
  // only — the web can't observe either, so it stays false there. Re-checked on open.
  let deviceLocked = $state(false);
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

  function lockTitle(os: string) {
    if (deviceLocked) return os === 'ios' ? 'Guided Access is on' : 'App Pinning is on';
    return os === 'ios' ? 'Enable Guided Access' : 'Enable App Pinning';
  }

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
    if (!open) return;
    installOs = detectOS();
    pwaInstalled = isPWAInstalled();
    platform = getPlatform();
    native = isNative();

    // Lock state is a native-only async query, so reset and re-detect each open. The
    // `cancelled` guard drops a stale result if the modal closes/reopens mid-flight.
    deviceLocked = false;
    if (!native) return;
    let cancelled = false;
    (async () => {
      try {
        const { DeviceLock } = await loadDeviceLock();
        const { locked } = await DeviceLock.isLocked();
        if (!cancelled) deviceLocked = locked;
      } catch {
        // Plugin missing/unavailable — treat as unlocked (show the enable steps).
      }
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

<!-- The two checklists are authored once here and reused across the web
     accordion and the flat native view. -->
{#snippet installSteps(os: string)}
  {#if os === 'ios'}
    <ol class="steps">
      <li>Tap the <strong>Share</strong> button (square with arrow)</li>
      <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
      <li>Tap <strong>"Add"</strong> in the top right</li>
      <li>Launch from your home screen for fullscreen mode</li>
    </ol>
  {:else}
    <ol class="steps">
      <li>Tap the <strong>menu</strong> (three dots)</li>
      <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></li>
      <li>Follow the prompts</li>
      <li>Launch from your home screen for fullscreen mode</li>
    </ol>
  {/if}
{/snippet}

{#snippet lockSteps(os: string)}
  {#if os === 'ios'}
    <ol class="steps">
      <li>Go to <strong>Settings → Accessibility → Guided Access</strong></li>
      <li>Turn on <strong>Guided Access</strong></li>
      <li>Set a passcode</li>
      <li>Open Splotch and triple-click the side button</li>
      <li>Tap <strong>Start</strong> to lock the app</li>
      <li>Triple-click and enter passcode to exit</li>
    </ol>
  {:else}
    <ol class="steps">
      <li>Go to <strong>Settings → Security → App Pinning</strong></li>
      <li>Turn on <strong>App Pinning</strong></li>
      <li>Open Splotch and tap the <strong>Recent Apps</strong> button</li>
      <li>Swipe up on Splotch and tap the <strong>Pin</strong> icon</li>
      <li>Tap <strong>Start</strong> to lock the app</li>
      <li>Long-press Back + Recent Apps to exit</li>
    </ol>
  {/if}
{/snippet}

<!-- Shown in place of the enable steps once the lock is already active, so the parent
     just needs to know how to get back out. -->
{#snippet exitSteps(os: string)}
  {#if os === 'ios'}
    <ol class="steps">
      <li>Triple-click the <strong>side button</strong> (or Home button)</li>
      <li>Enter your Guided Access passcode</li>
      <li>Tap <strong>End</strong> in the top left</li>
    </ol>
  {:else}
    <ol class="steps">
      <li>Touch and hold <strong>Back</strong> + <strong>Recent Apps</strong> together</li>
      <li>(or swipe up and hold, then tap <strong>Unpin</strong>)</li>
      <li>Splotch is now unlocked</li>
    </ol>
  {/if}
{/snippet}

{#each setupOsList as os (os)}
  {#if native}
    <!-- Native builds have a single setup step, so the lock-setup title stands
         in as the section header and the steps render flat — no OS label, no
         accordion toggle. -->
    <section class="os-section">
      <h3 class="lock-heading">
        {lockTitle(os)}
        {#if deviceLocked}<span class="install-check">✓</span>{/if}
      </h3>
      {#if deviceLocked}
        {@render exitSteps(os)}
      {:else}
        {@render lockSteps(os)}
      {/if}
    </section>
  {:else}
    <section class="os-section">
      <h3 class="os-heading">{os === 'ios' ? 'iOS' : 'Android'}</h3>
      <details class="help-section">
        <summary>
          <span class="summary-text">
            <span class="section-number">1.</span> Install as App
            {#if pwaInstalled}<span class="install-check">✓</span>{/if}
          </span>
        </summary>
        {@render installSteps(os)}
      </details>

      <details class="help-section">
        <summary
          ><span class="summary-text"><span class="section-number">2.</span> {lockTitle(os)}</span
          ></summary
        >
        {@render lockSteps(os)}
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

  /* Native: the lock-setup title is the section header, styled to match the
     accordion summary it replaces. */
  .lock-heading {
    margin: 0;
    padding: 16px 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #555;
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
    color: #4caf50;
    font-weight: bold;
    margin-left: 8px;
    font-size: 20px;
  }

  .steps {
    padding: 16px 24px 16px 40px;
    margin: 0;
    color: #666;
    line-height: 1.8;
  }

  .steps li {
    margin-bottom: 8px;
  }

  .steps li:last-child {
    margin-bottom: 0;
  }
</style>
