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
  import SettingsButton from '$lib/components/SettingsButton.svelte';
  import { settingsModal } from '$lib/state/ui.svelte';
  import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
  import { pwaUpdates } from '$lib/pwa/updates';
  import { settings } from '$lib/state/settings.svelte';
  import { captureAiAccessTokenFromUrl } from '$lib/state/aiAccessToken';
  import { applyTheme } from '$lib/theme';
  import { applyDeviceOrientationPreference } from '$lib/platform/orientation';
  import { mountBootHiddenOverlays } from '$lib/boot/bootHiddenOverlays';
  import { installWakeLock } from '$lib/boot/wakeLock';
  import { installContextMenuGuard } from '$lib/boot/contextMenuGuard';
  import { hydratePersistedState } from '$lib/boot/persistedState';
  import { initWebOnlyServices, recordWebInstallRepromptSession } from '$lib/boot/webOnlyServices';
  import { installDevHarnessSeam } from '$lib/boot/devHarnessSeam';
  import { installUndoShortcut } from '$lib/boot/undoShortcut';
  import { installColoringPackDownloads } from '$lib/boot/coloringPacks';

  $effect(() => {
    applyDeviceOrientationPreference(
      settings.lockRotationEnabled,
      settings.forceLandscapeOrientation
    );
  });

  // Own the drawing route's app-surface locks (ADR-0076): no scroll, selection,
  // zoom, or iOS callout. Every other route is a normal document; the drawing
  // page is the override, so it sets the flag app.css keys off and clears it when
  // the user navigates away (client-side nav to /privacy etc.). The app.html boot
  // script re-types the same route as a `'/'` literal to seed the flag for first
  // paint (it can't import `DRAWING_ROUTE` from `lib/boot/appSurfaceRoute.ts` —
  // it's vanilla JS in a template file); `app.html.test.ts` asserts that literal
  // matches the constant.
  $effect(() => {
    document.documentElement.setAttribute('data-app-surface', '');
    return () => document.documentElement.removeAttribute('data-app-surface');
  });

  // First-visit service worker registration waits for the Install Banner's
  // "a few strokes drawn" signal so the offline install never lands on top of
  // boot or the first strokes (issue #462). Repeat visits don't pass through
  // here — initPWAUpdates re-registers an existing registration at idle.
  // The gate waits for the shared settled-in signal (the same one the Install
  // Banner uses). Pre-hydration strokes (ADR-0072) don't tick strokeCount, so
  // only post-hydration strokes count — acceptable, it only defers
  // registration slightly further.
  $effect(() => {
    if (__IS_CAPACITOR__) return;
    if (canvasState.strokeCount < SETTLED_IN_STROKES) return;
    pwaUpdates.registerDeferredServiceWorker();
  });

  $effect(() => {
    if (__IS_CAPACITOR__) return;
    if (canvasState.strokeCount < SETTLED_IN_STROKES) return;
    recordWebInstallRepromptSession();
  });

  // Filled one at a time by the idle mount pump (see boot/bootHiddenOverlays.ts).
  let overlays = $state<Component[]>([]);

  // The Settings dialog mounts at whichever comes first: the idle pump's final
  // slice (its staged wide pane makes that slice a shell plus two light
  // sections, then prewarms the rest one section per idle slice — ADR-0049),
  // or a tap that beats the queue — settingsModal.open latches the mount and
  // the dialog's modalDialog $effect shows it as soon as it lands. The corner
  // button that opens it (SettingsButton) stays eagerly mounted above.
  let SettingsModal = $state<Component | null>(null);
  let settingsModalMounted = $state(false);
  $effect(() => {
    if (settingsModal.open) settingsModalMounted = true;
  });

  onMount(() => {
    const capturedAccessToken = captureAiAccessTokenFromUrl().catch((err) => {
      console.warn('Access-code invitation could not be saved', err);
    });
    // The app.html head script already stamped data-theme before first paint;
    // this re-stamps it as a fallback if that inline script was blocked. The
    // theme-color meta and OS-switch tracking now fall out of the single
    // reactive source in lib/state/appearance.svelte.ts.
    applyTheme(settings.theme);
    const settingsReady = capturedAccessToken.then(hydratePersistedState);

    const teardowns = [
      mountBootHiddenOverlays(
        (overlay) => (SettingsModal = overlay),
        (overlay) => (overlays = [...overlays, overlay]),
        () => (settingsModalMounted = true)
      ),
      installContextMenuGuard(),
      installWakeLock(),
      initWebOnlyServices(),
      installDevHarnessSeam(),
      installUndoShortcut(),
      installColoringPackDownloads(settingsReady),
    ];
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
<SettingsButton />
{#each overlays as Overlay (Overlay)}
  <Overlay />
{/each}
{#if SettingsModal && settingsModalMounted}
  <SettingsModal />
{/if}
