<script lang="ts">
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { isNative, getPlatform } from '$lib/platform';
  import {
    createStatusBarApplier,
    computeNotchBandState,
    listenForStatusBarReentry,
    type StatusBarStyle,
  } from '$lib/platform/notchBand';
  import { layout } from '$lib/state/layout.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { PAPER_COLORS, setThemeColorMeta, updateThemeColorMeta } from '$lib/theme';

  // Measured env(safe-area-inset-*), in CSS px — we need the number (not just
  // the CSS value) to tell a real notch from a bezel. The top and both sides
  // matter so the band can follow the hole-punch as it rotates from the top
  // (portrait) to a side (landscape); the shared layout module re-measures
  // them on every resize and orientation event.
  //
  // The rotation angle rides along because the insets alone cannot say which
  // side a landscape cutout is on — iOS reports both sides identically. See
  // landscapeBandEdges for the rule the two feed.
  const band = $derived(
    computeNotchBandState({
      platform: getPlatform(),
      native: isNative(),
      orientation: layout.orientation,
      insetTop: layout.safeArea.top,
      insetLeft: layout.safeArea.left,
      insetRight: layout.safeArea.right,
      orientationAngle: layout.orientationAngle,
      activeColor: colors.activeColor,
      eraser: toolState.brush === 'eraser',
      paperColor: PAPER_COLORS[resolvedTheme()],
    })
  );

  // Web: keep <meta name="theme-color"> in sync — the only mechanism that tints
  // the Android web status bar; a harmless no-op on iOS and native builds.
  $effect(() => {
    setThemeColorMeta(band.themeColor);
  });

  // Taking the tag means handing it back. This component is the only thing that
  // paints the drawing color there, and it lives only on the drawing route — so
  // on a client-side navigation to a standalone page nothing else would repaint
  // it, and that page would sit under an address bar wearing the last drawing
  // color. The pre-paint script in app.html can't help: it runs on load only,
  // and its OS-change listener stands down while data-app-surface is set.
  //
  // A separate effect, reading nothing reactive, so this runs on destroy alone
  // rather than between every band repaint. resolvedTheme() honors the parent's
  // three-state preference, so the tag lands on the theme the next page renders.
  $effect(() => () => updateThemeColorMeta(resolvedTheme()));

  // Native: flip the system clock/battery icons light or dark for contrast.
  // The literal __IS_CAPACITOR__ keeps the status-bar plugin out of the web
  // bundle; the inline import() resolves to the module namespace, never the
  // plugin proxy, and repeat calls share one module.
  // Android native: hide the status bar in landscape to reclaim the long top
  // edge as canvas; show it again in portrait. null elsewhere = leave it alone.
  // One memo per mount: `band` is recomputed on every active-colour change, so
  // without it each palette tap pushes an identical value across the bridge.
  const statusBar = createStatusBarApplier();

  function pushStatusBar(style: StatusBarStyle | null, hidden: boolean | null) {
    if (!__IS_CAPACITOR__ || !isNative()) return;
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => statusBar.apply(style, hidden, StatusBar, Style))
      .catch(() => {});
  }

  $effect(() => {
    pushStatusBar(band.statusBarStyle, band.statusBarHidden);
  });

  // The memo means the app stops re-asserting, and re-entry is where the
  // platform may have reset the bar underneath it — Android does not
  // necessarily preserve a hidden status bar across one. Drop the memo and push
  // again, since `band` has not changed and the effect will not re-run.
  $effect(() => {
    if (!__IS_CAPACITOR__) return;
    return listenForStatusBarReentry(() => {
      statusBar.forget();
      pushStatusBar(band.statusBarStyle, band.statusBarHidden);
    });
  });
</script>

<!-- All physical edges stay mounted so live env() insets resize during the
     rotation hold; the pure state keeps the fill on exactly one cutout edge. -->
<div
  class="notch-band notch-band--top"
  aria-hidden="true"
  style:background-color={band.backgroundColors.top}
></div>
<div
  class="notch-band notch-band--left"
  aria-hidden="true"
  style:background-color={band.backgroundColors.left}
></div>
<div
  class="notch-band notch-band--right"
  aria-hidden="true"
  style:background-color={band.backgroundColors.right}
></div>

<style>
  /* Fills the selected safe-area edge behind the OS clock. Insets keep each
     mounted edge live while pure state leaves every non-cutout edge clear. */
  .notch-band {
    position: fixed;
    z-index: var(--z-notch);
    pointer-events: none;
    transition: background-color var(--duration-base) ease;
  }
  .notch-band--top {
    top: 0;
    left: 0;
    right: 0;
    height: var(--safe-area-top);
  }
  .notch-band--left {
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--safe-area-left);
  }
  .notch-band--right {
    top: 0;
    bottom: 0;
    right: 0;
    width: var(--safe-area-right);
  }
</style>
