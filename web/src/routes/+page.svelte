<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import ParentHelpButton from '$lib/components/ParentHelpButton.svelte';
  import { ui } from '$lib/state/ui.svelte';
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
  import { reloadBrushType } from '$lib/state/tool.svelte';
  import { hydrateDurableStorage } from '$lib/storage';
  import { initNetwork } from '$lib/state/network.svelte';
  import { isNative } from '$lib/platform';
  import { applyTheme } from '$lib/theme';
  import { applyDeviceOrientationPreference } from '$lib/orientation';
  import { initFullscreen } from '$lib/state/fullscreen.svelte';
  import { scheduleIdle } from '$lib/idle';

  $effect(() => {
    settings.lockRotationEnabled;
    settings.forceLandscapeOrientation;
    applyDeviceOrientationPreference();
  });

  // The boot-hidden overlays (see bootHiddenOverlays.ts) load and mount at idle
  // so the ~470 ms first-load hydration long task doesn't pay for subtrees that
  // are invisible until a tap or a few strokes later. One overlay per idle
  // callback: mounting them all at once just relocates a long task to idle,
  // where it would jank a stroke already in progress.
  let overlays = $state<Component[]>([]);

  // The Parent Center dialog is the one overlay too heavy even for an idle
  // slice (~200 ms mounted under a 4× throttle), so it waits for its first
  // open — the tap that flips ui.parentCenterOpen latches the mount, and the
  // dialog's modalDialog $effect shows it as soon as it lands. The corner
  // button that opens it (ParentHelpButton) stays eagerly mounted above.
  let ParentCenter = $state<Component | null>(null);
  let parentCenterWanted = $state(false);
  $effect(() => {
    if (ui.parentCenterOpen) parentCenterWanted = true;
  });

  onMount(() => {
    // The cancel handle scheduleIdle returns can't reach the async import().then
    // continuation below, so a `stopped` flag guards the recursive mount from
    // running after unmount.
    let stopped = false;
    scheduleIdle(() => {
      import('$lib/components/bootHiddenOverlays').then((module) => {
        ParentCenter = module.ParentCenter;
        const queue = [
          module.ColorPicker,
          module.ColoringBook,
          module.AiImagePrompt,
          module.AiImageResult,
          module.InstallBanner,
        ];
        const mountNext = () => {
          if (stopped) return;
          overlays = [...overlays, queue[overlays.length]];
          if (overlays.length < queue.length) scheduleIdle(mountNext);
        };
        mountNext();
      });
    });
    return () => (stopped = true);
  });

  onMount(() => {
    captureAiAccessTokenFromUrl();
    // The app.html head script already stamped data-theme before first paint;
    // this pass syncs the theme-color meta and arms the OS dark-mode watcher.
    applyTheme(settings.theme);
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
        reloadBrushType();
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

    // Seed the opt-in Fullscreen Toggle (Android web only; inert elsewhere) that
    // dismisses the mobile URL bar a non-scrolling canvas can never scroll away.
    initFullscreen();

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
<ParentHelpButton />
{#each overlays as Overlay (Overlay)}
  <Overlay />
{/each}
{#if ParentCenter && parentCenterWanted}
  <ParentCenter />
{/if}
