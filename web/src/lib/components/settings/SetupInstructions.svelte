<script lang="ts">
  import { isNative, getPlatform, type Platform } from '$lib/platform';
  import Icon from '../Icon.svelte';
  import Button from '../design/Button.svelte';
  import Disclosure from '../design/Disclosure.svelte';
  import {
    install,
    promptInstall,
    installDeviceOs,
    type InstallDeviceOs,
  } from '$lib/state/install.svelte';

  type SetupOs = 'ios' | 'android';

  let installing = $state(false);

  async function oneTapInstall() {
    installing = true;
    try {
      await promptInstall();
    } finally {
      installing = false;
    }
  }

  interface Props {
    // `open` flips true when the Settings modal opens; we re-run device/OS
    // detection then so the instructions match the current device and install state.
    open?: boolean;
  }
  let { open = false }: Props = $props();

  // Which OS's manual steps fit this device, from the install module's shared
  // detection (never re-sniffed here).
  let deviceOs = $state<InstallDeviceOs>('desktop');
  // True when Guided Access (iOS) / App Pinning (Android) is currently engaged. Native
  // only — the web can't observe either, so it stays false there. Re-checked on open.
  let deviceLocked = $state(false);
  // True inside a native Capacitor shell — a build-time fact, so the compile-time
  // flag leads and the isNative() factor exists for unit tests (which define
  // __IS_CAPACITOR__ as true and steer via runtime isNative() mocks). Native builds
  // are already "installed", so we drop the PWA install step and only show the
  // device-lock setup for the platform we're actually running on.
  const native = __IS_CAPACITOR__ && isNative();
  // ios-vs-android stays a runtime read: one CAPACITOR=true bundle ships in both
  // the iPhone and Android binaries, so it's a per-device fact.
  let platform = $state<Platform>('web');

  // Which OS setup sections to render. On native we know the exact platform, so
  // we show just that one; on the web we show both, detected OS first.
  let setupOsList = $derived<SetupOs[]>(
    native
      ? [platform === 'android' ? 'android' : 'ios']
      : deviceOs === 'android'
        ? ['android', 'ios']
        : ['ios', 'android']
  );

  function lockTitle(os: SetupOs) {
    if (deviceLocked) return os === 'ios' ? 'Guided Access is on' : 'App Pinning is on';
    return os === 'ios' ? 'Enable Guided Access' : 'Enable App Pinning';
  }

  $effect(() => {
    if (!open) return;
    deviceOs = installDeviceOs();
    platform = getPlatform();

    // Lock state is a native-only async query, so reset and re-detect each open. The
    // `cancelled` guard drops a stale result if the modal closes/reopens mid-flight.
    // The literal __IS_CAPACITOR__ keeps the DeviceLock wrapper (and @capacitor/core)
    // out of the web bundle; the inline import() resolves to the module namespace,
    // never the plugin proxy.
    deviceLocked = false;
    if (__IS_CAPACITOR__ && native) {
      let cancelled = false;
      (async () => {
        try {
          const { DeviceLock } = await import('$lib/plugins/deviceLock');
          const { locked } = await DeviceLock.isLocked();
          if (!cancelled) deviceLocked = locked;
        } catch {
          // Plugin missing/unavailable — treat as unlocked (show the enable steps).
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  });
</script>

<!-- The two checklists are authored once here and reused across the web
     accordion and the flat native view. -->
{#snippet installSteps(os: SetupOs)}
  {#if os === 'ios'}
    <ol class="steps">
      <li>
        Tap the <Icon name="share-ios" class="step-icon" aria-label="Share" />
        <strong>Share</strong> button at the bottom
      </li>
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

{#snippet lockSteps(os: SetupOs)}
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
{#snippet exitSteps(os: SetupOs)}
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

<!-- Chromium hands us a real one-tap install dialog (Android and desktop alike),
     so offer it above the per-OS manual steps rather than inside one section —
     the OS lists below stay as the fallback. Never true on native. -->
{#if install.mode === 'oneTap'}
  <div class="one-tap">
    <Button variant="brand" onclick={oneTapInstall} disabled={installing}>
      <Icon name="home" class="one-tap-icon" />
      Install Splotch
    </Button>
    <p class="one-tap-hint">One tap — your browser will do the rest.</p>
  </div>
{/if}

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
      <Disclosure class="help-section">
        {#snippet summary()}
          <span class="summary-text">
            <span class="section-number">1.</span> Install as App
            {#if install.installed}<span class="install-check">✓</span>{/if}
          </span>
        {/snippet}
        {@render installSteps(os)}
      </Disclosure>

      <Disclosure class="help-section">
        {#snippet summary()}
          <span class="summary-text"><span class="section-number">2.</span> {lockTitle(os)}</span>
        {/snippet}
        {@render lockSteps(os)}
      </Disclosure>
    </section>
  {/if}
{/each}

<style>
  /* The accordion's own chrome on the Disclosure primitive — reached with
     :global() because the class lands on the primitive's own markup. */
  .os-section :global(.help-section) {
    margin-bottom: 16px;
  }

  .os-section :global(.help-section:last-of-type) {
    margin-bottom: 0;
  }

  .os-section :global(.help-section summary) {
    padding: 16px;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
    background: var(--surface-2);
    transition: background var(--duration-base) ease;
    justify-content: space-between;
    align-items: center;
    text-align: left;
  }

  @media (hover: hover) {
    .os-section :global(.help-section summary:hover) {
      background: var(--surface-hover);
    }
  }

  .os-section :global(.help-section summary::after) {
    font-size: var(--font-size-xl);
    flex-shrink: 0;
  }

  .os-section + .os-section {
    margin-top: 20px;
  }

  .os-heading {
    margin: 0 0 10px 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  /* Native: the lock-setup title is the section header, styled to match the
     accordion summary it replaces. */
  .lock-heading {
    margin: 0;
    padding: 16px 16px 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
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
    color: var(--success-text);
    font-weight: var(--font-weight-bold);
    margin-left: 8px;
    font-size: var(--font-size-lg);
  }

  .one-tap {
    margin-bottom: 20px;
    text-align: center;
  }

  :global(.one-tap-icon) {
    width: 20px;
    height: 20px;
    filter: brightness(0) invert(1);
  }

  .one-tap-hint {
    margin: 8px 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  :global(.step-icon) {
    display: inline-flex;
    width: 17px;
    height: 17px;
    vertical-align: -3px;
  }

  .steps {
    padding: 16px 24px 16px 40px;
    margin: 0;
    color: var(--text-soft);
    line-height: 1.8;
  }

  .steps li {
    margin-bottom: 8px;
  }

  .steps li:last-child {
    margin-bottom: 0;
  }
</style>
