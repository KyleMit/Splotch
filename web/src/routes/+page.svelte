<script lang="ts">
  import { onMount } from 'svelte';
  import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import ColoringBook from '$lib/components/ColoringBook.svelte';
  import ParentCenter from '$lib/components/ParentCenter.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import AiImagePrompt from '$lib/components/AiImagePrompt.svelte';
  import AiImageResult from '$lib/components/AiImageResult.svelte';
  import InstallBanner from '$lib/components/InstallBanner.svelte';
  import { initPWAUpdates } from '$lib/pwa/updates';
  import { initInstallPrompt } from '$lib/state/install.svelte';
  import {
    captureAiAccessTokenFromUrl,
    reloadSettings,
    hydrateApiKey,
    hydrateSaveFolder,
    settings,
  } from '$lib/state/settings.svelte';
  import { reloadStrokeWidth } from '$lib/state/strokeWidth.svelte';
  import { hydrateDurableStorage } from '$lib/storage';
  import { initNetwork } from '$lib/state/network.svelte';
  import { isNative } from '$lib/platform';
  import { applyDeviceOrientationPreference } from '$lib/orientation';

  $effect(() => {
    settings.lockRotationEnabled;
    settings.forceLandscapeOrientation;
    applyDeviceOrientationPreference();
  });

  onMount(() => {
    captureAiAccessTokenFromUrl();
    // Load the BYOK Gemini key from secure storage into the live store (async,
    // transparent — the AI button is only used long after boot completes).
    hydrateApiKey();
    // Load the optional saved-photo folder name for the Parent Center display
    // (web/desktop only; no effect on whether saves happen).
    hydrateSaveFolder();
    initNetwork();

    // Native only: recover any settings the WebView's localStorage may have
    // evicted from the durable Capacitor Preferences store, then refresh the
    // live stores if anything was restored. No-op (and instant) on the web.
    hydrateDurableStorage().then((restored) => {
      if (restored) {
        reloadSettings();
        reloadStrokeWidth();
        applyDeviceOrientationPreference();
      }
    });

    // Prevent context menu on long press
    const blockContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', blockContextMenu);

    // Wake lock to prevent screen sleep — request on first pointerdown, and
    // re-request when the page becomes visible again.
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {}
    }
    const onFirstPointerDown = () => requestWakeLock();
    const onVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('pointerdown', onFirstPointerDown, { once: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    // The service worker only exists in the web build; the native apps bundle
    // their shell on-device, so there's nothing to update-check there. The
    // install prompt is likewise web-only (the native app is already installed).
    let teardownPWAUpdates: (() => void) | undefined;
    if (!isNative()) {
      teardownPWAUpdates = initPWAUpdates();
      initInstallPrompt();
    }

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('pointerdown', onFirstPointerDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      teardownPWAUpdates?.();
    };
  });
</script>

<NotchBand />

<main class="app-container">
  <ColorPalette />
  <DrawingCanvas />
</main>

<ClearButton />
<ActionsPanel />
<ColorPicker />
<ColoringBook />
<ParentCenter />
<AiImagePrompt />
<AiImageResult />
<InstallBanner />
