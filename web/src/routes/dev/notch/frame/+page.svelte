<script lang="ts">
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import FullscreenToggle from '$lib/components/FullscreenToggle.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import SettingsButton from '$lib/components/SettingsButton.svelte';
  import { page } from '$app/state';
  import { SAFE_AREA_EDGES, SAFE_AREA_PROPERTIES, ZERO_INSETS } from '$lib/platform/safeArea';
  import { DEVICE_PROFILES } from '../lib/devices';
  import { appliedInsets } from '../lib/diagnostics';
  import { NOTCH_FRAME_READY_ATTRIBUTE } from '../lib/frameReady';
  import { ORIENTATION_ANGLES, isOrientation } from '../lib/orientations';

  // One scenario's worth of the real HUD, rendered at the device's own CSS
  // viewport under that device's insets. The gallery mounts this in an <iframe>
  // sized to the device and scaled down, which is what makes the illusion hold:
  // an iframe is a genuine viewport, so window.innerWidth, matchMedia
  // (orientation: portrait), the layout store's listeners, and the safe-area
  // probe all see the emulated device rather than the developer's monitor.
  // Nothing here is mocked except the four inset values.
  const profile = $derived(
    DEVICE_PROFILES.find((entry) => entry.id === page.url.searchParams.get('device'))
  );
  const requested = $derived(page.url.searchParams.get('orientation'));
  const orientation = $derived(isOrientation(requested) ? requested : 'portrait');
  // The insets the app lays out against — the device's, with the app's own
  // status-bar policy applied (see appliedInsets).
  const insets = $derived((profile && appliedInsets(profile, orientation)) ?? ZERO_INSETS);

  // The drawing route's own app-surface locks, so the preview lays out under the
  // same rules as the real page rather than as a scrolling document.
  $effect(() => {
    document.documentElement.setAttribute('data-app-surface', '');
    return () => document.documentElement.removeAttribute('data-app-surface');
  });

  // Override the four inset properties on :root, where the app.css seed put them
  // and where the JS probe's fixed-position element inherits from.
  //
  // The layout store measures once at module load — before this effect runs — so
  // the numbers it published are the frame's real (zero) insets. A synthetic
  // resize is how we make it re-read: the store already treats resize as
  // "re-measure everything", so this needs no test-only export to reach into it.
  // The rotation this tile depicts, reported the way the OS would.
  //
  // screen.orientation belongs to the screen, not the frame, so every tile would
  // otherwise read the developer's monitor at angle 0 — and the Notch Band needs
  // the angle to tell the two landscape rotations apart on a device whose insets
  // cannot. Redefining the getter on the instance keeps this entirely inside the
  // dev-only preview: production keeps no override seam for it, unlike the
  // engine's simulated-rotation harness, which has no DOM state to drive.
  $effect(() => {
    const screenOrientation = window.screen?.orientation;
    if (!screenOrientation) return;
    const angle = ORIENTATION_ANGLES[orientation];
    try {
      Object.defineProperty(screenOrientation, 'angle', { get: () => angle, configurable: true });
    } catch {
      // An engine that refuses leaves the tile on the real angle; the readout
      // and the verdict below it still come from the dataset, so the tile is
      // wrong rather than silently plausible only if this ever fires.
    }
  });

  $effect(() => {
    const root = document.documentElement;
    for (const edge of SAFE_AREA_EDGES) {
      root.style.setProperty(SAFE_AREA_PROPERTIES[edge], `${insets[edge]}px`);
    }
    window.dispatchEvent(new Event('resize'));

    // Raised only after the insets are in place and the layout store has
    // re-measured, so an un-veiled tile is always showing the finished layout.
    root.setAttribute(NOTCH_FRAME_READY_ATTRIBUTE, '');
  });
</script>

<svelte:head>
  <title>{profile?.label ?? 'Unknown device'} · notch frame</title>
</svelte:head>

{#if profile}
  <NotchBand />
  <div class="app-container">
    <ColorPalette />
    <!-- Stands in for DrawingCanvas: the same flex child wearing the same paper
         margin, minus the engine. The HUD's geometry question is where the
         chrome lands against the safe area, and a live canvas answers none of
         it while costing the harness a per-tile engine boot. FullscreenToggle
         is a real child of the canvas container, so it comes along. -->
    <div class="canvas-container">
      <div class="paper-stand-in"></div>
      <FullscreenToggle />
    </div>
  </div>
  <ClearButton />
  <ActionsPanel />
  <SettingsButton />
{:else}
  <p class="missing">No device profile with id “{page.url.searchParams.get('device')}”.</p>
{/if}

<style>
  /* .app-container and .canvas-container both come from app.css / DrawingCanvas;
     only the paper stand-in is local. */
  .canvas-container {
    flex: 1;
    display: flex;
    position: relative;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    background-color: var(--paper-margin);
  }

  .paper-stand-in {
    flex: 1;
    background: var(--paper);
  }

  .missing {
    padding: var(--space-4);
    font-family: var(--font-mono);
    color: var(--text-strong);
  }
</style>
