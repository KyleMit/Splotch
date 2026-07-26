<script lang="ts">
  // Side-effect import, deliberately static: it puts the engine boot in this
  // page's module graph so it evaluates (and the prerendered canvas starts
  // accepting strokes) before the hydration pass, not after it (ADR-0072). A
  // dynamic import would push init back behind hydration — exactly the wait
  // this removes.
  import '$lib/drawing/earlyBoot';
  import { onMount, type Component } from 'svelte';
  import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import ParentHelpButton from '$lib/components/ParentHelpButton.svelte';
  import { parentCenter } from '$lib/state/ui.svelte';
  import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
  import { registerDeferredServiceWorker } from '$lib/pwa/updates';
  import { captureAiAccessTokenFromUrl, settings } from '$lib/state/settings.svelte';
  import { isNative } from '$lib/platform';
  import { applyTheme } from '$lib/theme';
  import { applyDeviceOrientationPreference } from '$lib/orientation';
  import { scheduleIdle } from '$lib/idle';
  import { installWakeLock } from '$lib/boot/wakeLock';
  import { installContextMenuGuard } from '$lib/boot/contextMenuGuard';
  import { hydratePersistedState } from '$lib/boot/persistedState';
  import { initWebOnlyServices } from '$lib/boot/webOnlyServices';

  $effect(() => {
    settings.lockRotationEnabled;
    settings.forceLandscapeOrientation;
    applyDeviceOrientationPreference();
  });

  // Own the drawing route's app-surface locks (ADR-0076): no scroll, selection,
  // zoom, or iOS callout. Every other route is a normal document; the drawing
  // page is the override, so it sets the flag app.css keys off and clears it when
  // the user navigates away (client-side nav to /privacy etc.). The app.html boot
  // script seeds the same flag for first paint.
  $effect(() => {
    document.documentElement.setAttribute('data-app-surface', '');
    return () => document.documentElement.removeAttribute('data-app-surface');
  });

  // First-visit service worker registration waits for the Install Banner's
  // "a few strokes drawn" signal so the ~39 MB precache never lands on top of
  // boot or the first strokes (issue #462). Repeat visits don't pass through
  // here — initPWAUpdates re-registers an existing registration at idle.
  // The gate waits for the shared settled-in signal (the same one the Install
  // Banner uses). Pre-hydration strokes (ADR-0072) don't tick strokeCount, so
  // only post-hydration strokes count — acceptable, it only defers
  // registration slightly further.
  $effect(() => {
    if (canvasState.strokeCount < SETTLED_IN_STROKES) return;
    if (!isNative()) registerDeferredServiceWorker();
  });

  // The boot-hidden overlays (see bootHiddenOverlays.ts) load and mount at idle
  // so the ~470 ms first-load hydration long task doesn't pay for subtrees that
  // are invisible until a tap or a few strokes later. One overlay per idle
  // callback: mounting them all at once just relocates a long task to idle,
  // where it would jank a stroke already in progress.
  let overlays = $state<Component[]>([]);

  // The Parent Center dialog is the one overlay too heavy even for an idle
  // slice (~200 ms mounted under a 4× throttle), so it waits for its first
  // open — the tap that flips parentCenter.open latches the mount, and the
  // dialog's modalDialog $effect shows it as soon as it lands. The corner
  // button that opens it (ParentHelpButton) stays eagerly mounted above.
  let ParentCenter = $state<Component | null>(null);
  let parentCenterWanted = $state(false);
  $effect(() => {
    if (parentCenter.open) parentCenterWanted = true;
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
    // this re-stamps it as a fallback if that inline script was blocked. The
    // theme-color meta and OS-switch tracking now fall out of the single
    // reactive source in lib/state/appearance.svelte.ts.
    applyTheme(settings.theme);
    hydratePersistedState();

    const teardowns = [installContextMenuGuard(), installWakeLock(), initWebOnlyServices()];
    return () => teardowns.forEach((teardown) => teardown());
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
