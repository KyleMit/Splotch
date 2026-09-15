<script lang="ts">
  // Side-effect import, deliberately static: it puts the engine boot in this
  // page's module graph so it evaluates (and the prerendered canvas starts
  // accepting strokes) before the hydration pass, not after it (ADR-0072). A
  // dynamic import would push init back behind hydration — exactly the wait
  // this removes.
  import '$lib/drawing/earlyBoot';
  import { onMount, type Component } from 'svelte';
  import DrawingCanvas from '$lib/components/DrawingCanvas.svelte';
  import { tick } from 'svelte';
  import { syncDrawingViewport } from '$lib/drawing/engine';
  import { uiState } from '$lib/state/ui.svelte';
  import GlassPanes from '$lib/components/GlassPanes.svelte';
  import type { OpenFlyout } from '$lib/glassPanes';
  let openFlyout: OpenFlyout = $state(null);
  import BareToolbarPaper from '$lib/components/BareToolbarPaper.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import SettingsButton from '$lib/components/SettingsButton.svelte';
  import SocialCard from '$lib/components/page/SocialCard.svelte';
  import { HOME_CARD } from '$lib/components/page/socialCard';
  import {
    aiPromptModal,
    coloringBookModal,
    colorPickerModal,
    settingsModal,
  } from '$lib/state/ui.svelte';
  import { parentalGateState } from '$lib/state/parentalGate.svelte';
  import { aiGenerationState } from '$lib/state/aiGeneration.svelte';
  import { canvasState, SETTLED_IN_STROKES } from '$lib/state/canvas.svelte';
  import { settingsState } from '$lib/state/settings.svelte';
  import { captureAiAccessTokenFromUrl } from '$lib/state/aiAccessToken';
  import { applyTheme } from '$lib/theme';
  import { applyDeviceOrientationPreference } from '$lib/platform/orientation';
  import {
    mountBootHiddenOverlays,
    type BootHiddenOverlayKey,
    type BootHiddenOverlays,
  } from '$lib/boot/bootHiddenOverlays';
  import { installWakeLock } from '$lib/boot/wakeLock';
  import { installContextMenuGuard } from '$lib/boot/contextMenuGuard';
  import { hydrateSettings } from '$lib/boot/persistedState';
  import { initWebOnlyServices } from '$lib/boot/webOnlyServices';
  import { installSettledInEffects } from '$lib/boot/settledIn.svelte';
  import { installDevHarnessSeam } from '$lib/boot/devHarnessSeam';
  import { installUndoShortcut } from '$lib/boot/undoShortcut';
  import {
    installColoringPackDownloads,
    type ColoringPackDownloads,
  } from '$lib/boot/coloringPacks';
  import { installSystemBack } from '$lib/boot/systemBack';
  import { installOverlayDemand } from '$lib/state/overlayDemand';

  $effect(() => {
    applyDeviceOrientationPreference(
      settingsState.lockRotationEnabled,
      settingsState.forceLandscapeOrientation
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
  if (!__IS_CAPACITOR__) installSettledInEffects(() => hiddenOverlays);

  // A first visit's coloring-pack downloads wait for the same settled-in
  // signal, or for the picker opening, which asks for books outright. Opening
  // the picker is also how a page gets selected. Native ignores the call and
  // keeps downloading at boot (lib/coloringPacks/manager.ts).
  $effect(() => {
    if (canvasState.strokeCount < SETTLED_IN_STROKES && !coloringBookModal.open) return;
    coloringPackDownloads?.engage();
  });

  // Filled once by foreground demand or one at a time by the interaction-quiet
  // background pump (see boot/bootHiddenOverlays.ts).
  let overlays = $state<Component[]>([]);
  let InstallBanner = $state<Component | null>(null);
  let SettingsModal = $state<Component | null>(null);
  let hiddenOverlays = $state<BootHiddenOverlays | null>(null);
  let coloringPackDownloads = $state<ColoringPackDownloads | null>(null);

  function mountHiddenOverlay(key: BootHiddenOverlayKey, overlay: Component) {
    if (key === 'installBanner') {
      InstallBanner = overlay;
      return;
    }
    if (key === 'settings') {
      SettingsModal = overlay;
      return;
    }
    overlays = [...overlays, overlay];
  }

  // An overlay is demanded by the action that opens it (a modal's show(), the
  // gate opening, an AI run starting — lib/state/overlayDemand.ts). One that is
  // already open when this route mounts had its action run while no controller
  // was installed, so the mount reconciles it once, here, rather than watching
  // every open flag for the life of the route.
  const OPEN_OVERLAYS: [() => boolean, BootHiddenOverlayKey][] = [
    [() => parentalGateState.open, 'parentalGate'],
    [() => colorPickerModal.open, 'colorPicker'],
    [() => coloringBookModal.open, 'coloringBook'],
    [() => aiPromptModal.open, 'aiPrompt'],
    [() => aiGenerationState.phase.kind !== 'closed', 'aiResult'],
    [() => settingsModal.open, 'settings'],
  ];

  function demandOpenOverlays(controller: BootHiddenOverlays) {
    for (const [isOpen, key] of OPEN_OVERLAYS) if (isOpen()) controller.demand(key);
  }

  onMount(() => {
    const capturedAccessToken = captureAiAccessTokenFromUrl().catch((err) => {
      console.warn('Access-code invitation could not be saved', err);
    });
    // The app.html head script already stamped data-theme before first paint;
    // this re-stamps it as a fallback if that inline script was blocked. The
    // theme-color meta and OS-switch tracking now fall out of the single
    // reactive source in lib/state/appearance.svelte.ts.
    applyTheme(settingsState.theme);
    const settingsReady = capturedAccessToken.then(hydrateSettings);

    const overlayController = mountBootHiddenOverlays(mountHiddenOverlay);
    hiddenOverlays = overlayController;
    const uninstallOverlayDemand = installOverlayDemand(overlayController.demand);
    demandOpenOverlays(overlayController);
    const packDownloads = installColoringPackDownloads(settingsReady);
    coloringPackDownloads = packDownloads;
    const teardowns = [
      uninstallOverlayDemand,
      () => overlayController.stop(),
      installContextMenuGuard(),
      installWakeLock(),
      initWebOnlyServices(),
      installDevHarnessSeam(),
      installUndoShortcut(),
      packDownloads.stop,
      installSystemBack((overlay) => (overlays = [...overlays, overlay])),
    ];
    return () => {
      hiddenOverlays = null;
      coloringPackDownloads = null;
      teardowns.forEach((teardown) => teardown());
    };
  });
  $effect(() => {
    document.documentElement.dataset.toolbar = settingsState.toolbarStyle;
    void tick().then(syncDrawingViewport);
  });
</script>

<svelte:head>
  <title>{HOME_CARD.title}</title>
  <meta name="description" content={HOME_CARD.description} />
</svelte:head>

<SocialCard />

<NotchBand />

<main class="app-container">
  <ColorPalette />
  <DrawingCanvas />
</main>

{#if settingsState.toolbarStyle === 'bare'}
  <GlassPanes
    {openFlyout}
    drawerExpanded={settingsState.drawerOpen || uiState.resizingActionButtons}
  />
{/if}
<BareToolbarPaper />
<ClearButton />
<div class="bottom-dock">
  <ActionsPanel bind:openFlyout />
  {#if InstallBanner}
    <InstallBanner />
  {/if}
  <SettingsButton />
</div>
{#each overlays as Overlay (Overlay)}
  <Overlay />
{/each}
{#if SettingsModal}
  <SettingsModal />
{/if}

<style>
  /* Fixed corner controls retain their drawer geometry; the dock reserves their
     collapsed footprints while sharing the canvas-chrome stacking layer. */
  .bottom-dock {
    position: fixed;
    z-index: var(--z-panel);
    left: calc(var(--palette-landscape-width) + var(--safe-area-left));
    right: var(--safe-area-right);
    bottom: var(--safe-area-bottom);
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding: var(--space-2);
    padding-inline: calc(var(--space-2) + var(--corner-button-size) + var(--space-4));
    padding-bottom: var(--space-4);
    pointer-events: none;
  }
  @media (orientation: portrait) {
    .bottom-dock {
      left: var(--safe-area-left);
    }
  }
  @media (max-width: 599px) and (orientation: portrait) {
    .bottom-dock {
      padding-inline: var(--space-4);
      padding-bottom: calc(var(--space-2) + var(--corner-button-size) + var(--space-2));
    }
  }
</style>
