<script lang="ts">
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { isNative, getPlatform } from '$lib/platform';
  import { applyStatusBar, computeNotchBandState } from '$lib/platform/notchBand';
  import { layout } from '$lib/state/layout.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { PAPER_COLORS, setThemeColorMeta, updateThemeColorMeta } from '$lib/theme';

  // Measured env(safe-area-inset-*), in CSS px — we need the number (not just
  // the CSS value) to tell a real notch from a bezel. The top and both sides
  // matter so the band can follow the hole-punch as it rotates from the top
  // (portrait) to a side (landscape); the shared layout module re-measures
  // them on every resize/orientationchange.
  const band = $derived(
    computeNotchBandState({
      platform: getPlatform(),
      native: isNative(),
      orientation: layout.orientation,
      insetTop: layout.safeArea.top,
      insetLeft: layout.safeArea.left,
      insetRight: layout.safeArea.right,
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
  $effect(() => {
    const style = band.statusBarStyle;
    const hidden = band.statusBarHidden;
    if (__IS_CAPACITOR__ && isNative()) {
      import('@capacitor/status-bar')
        .then(({ StatusBar, Style }) => applyStatusBar(style, hidden, StatusBar, Style))
        .catch(() => {});
    }
  });
</script>

<div
  class="notch-band notch-band--{band.show ? band.edge : 'top'}"
  aria-hidden="true"
  style:background-color={band.show ? band.color : 'transparent'}
></div>

<style>
  /* Fills the safe-area inset of whichever edge the hole-punch sits on, behind
     the OS clock. The inset (and so the band's thickness) collapses to 0 on
     devices without a cutout, and the fill stays transparent unless the inset
     is deep enough to be a real notch. The hole-punch is at the device's
     physical top: that's the top edge in portrait and a side edge in landscape. */
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
    height: env(safe-area-inset-top);
  }
  .notch-band--left {
    top: 0;
    bottom: 0;
    left: 0;
    width: env(safe-area-inset-left);
  }
  .notch-band--right {
    top: 0;
    bottom: 0;
    right: 0;
    width: env(safe-area-inset-right);
  }
</style>
