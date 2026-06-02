<script>
  import { onMount } from 'svelte';
  import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import ColoringBook from '$lib/components/ColoringBook.svelte';
  import ParentCenter from '$lib/components/ParentCenter.svelte';
  import AiImagePrompt from '$lib/components/AiImagePrompt.svelte';
  import AiImageResult from '$lib/components/AiImageResult.svelte';
  import { initPWAUpdates } from '$lib/pwa/updates.js';
  import { captureAiAccessTokenFromUrl, reloadSettings, hydrateApiKey } from '$lib/state/settings.svelte.js';
  import { reloadStrokeWidth } from '$lib/state/strokeWidth.svelte.js';
  import { hydrateDurableStorage } from '$lib/storage.js';
  import { initNetwork } from '$lib/state/network.svelte.js';
  import { isNative } from '$lib/platform.js';

  onMount(() => {
    captureAiAccessTokenFromUrl();
    // Load the BYOK Gemini key from secure storage into the live store (async,
    // transparent — the AI button is only used long after boot completes).
    hydrateApiKey();
    initNetwork();

    // Native only: recover any settings the WebView's localStorage may have
    // evicted from the durable Capacitor Preferences store, then refresh the
    // live stores if anything was restored. No-op (and instant) on the web.
    hydrateDurableStorage().then((restored) => {
      if (restored) {
        reloadSettings();
        reloadStrokeWidth();
      }
    });

    // Prevent context menu on long press
    const blockContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', blockContextMenu);

    // Wake lock to prevent screen sleep — request on first pointerdown, and
    // re-request when the page becomes visible again.
    let wakeLock = null;
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
    // their shell on-device, so there's nothing to update-check there.
    if (!isNative()) initPWAUpdates();

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('pointerdown', onFirstPointerDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });
</script>

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
