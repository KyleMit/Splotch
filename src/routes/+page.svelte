<script>
  import { onMount } from 'svelte';
  import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import ColoringBook from '$lib/components/ColoringBook.svelte';
  import ParentCenter from '$lib/components/ParentCenter.svelte';
  import { initPWAUpdates } from '$lib/pwa/updates.js';
  import { captureAiAccessTokenFromUrl } from '$lib/state/settings.svelte.js';

  onMount(() => {
    captureAiAccessTokenFromUrl();

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

    initPWAUpdates();

    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('pointerdown', onFirstPointerDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  });
</script>

<div class="app-container">
  <ColorPalette />
  <DrawingCanvas />
</div>

<ClearButton />
<ActionsPanel />
<ColorPicker />
<ColoringBook />
<ParentCenter />
