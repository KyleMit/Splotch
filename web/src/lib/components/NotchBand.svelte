<script lang="ts">
  import { onMount } from 'svelte';
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { isNative, getPlatform } from '$lib/platform';
  import { lazyPluginModule } from '$lib/nativePlugin';
  import { computeNotchBandState, type Orientation } from '$lib/notchBand';

  const loadStatusBar = lazyPluginModule(() => import('@capacitor/status-bar'));

  // Measured env(safe-area-inset-*), in CSS px. A hidden probe is the only
  // reliable way to read a safe-area inset as a number across engines; we need
  // the number (not just the CSS value) to tell a real notch from a bezel. We
  // track the top and both sides so the band can follow the hole-punch as it
  // rotates from the top (portrait) to a side (landscape).
  let insetTop = $state(0);
  let insetLeft = $state(0);
  let insetRight = $state(0);
  let orientation = $state<Orientation>('portrait');

  function measureInset(side: 'top' | 'left' | 'right'): number {
    const probe = document.createElement('div');
    const axis = side === 'top' ? 'height' : 'width';
    const cross = side === 'top' ? 'width:0' : 'height:0';
    probe.style.cssText =
      `position:fixed;top:0;left:0;${axis}:env(safe-area-inset-${side});${cross};visibility:hidden;pointer-events:none`;
    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    return side === 'top' ? rect.height : rect.width;
  }

  function measure() {
    if (typeof document === 'undefined') return;
    insetTop = measureInset('top');
    insetLeft = measureInset('left');
    insetRight = measureInset('right');
    orientation = window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
  }

  onMount(() => {
    measure();
    const onChange = () => measure();
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  });

  const band = $derived(
    computeNotchBandState({
      platform: getPlatform(),
      native: isNative(),
      orientation,
      insetTop,
      insetLeft,
      insetRight,
      activeColor: colors.activeColor,
      eraser: toolState.eraser
    })
  );

  // Web: keep <meta name="theme-color"> in sync — the only mechanism that tints
  // the Android web status bar; a harmless no-op on iOS and native builds.
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', band.themeColor);
  });

  // Native: flip the system clock/battery icons light or dark for contrast.
  $effect(() => {
    const style = band.statusBarStyle;
    if (!isNative() || !style) return;
    loadStatusBar().then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: style === 'DARK' ? Style.Dark : Style.Light }).catch(() => {});
    });
  });

  // Android native: hide the status bar in landscape to reclaim the long top
  // edge as canvas; show it again in portrait. null elsewhere = leave it alone.
  $effect(() => {
    const hidden = band.statusBarHidden;
    if (!isNative() || hidden === null) return;
    loadStatusBar().then(({ StatusBar }) => {
      (hidden ? StatusBar.hide() : StatusBar.show()).catch(() => {});
    });
  });
</script>

<div
  class="notch-band notch-band--{band.edge}"
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
    z-index: 1000;
    pointer-events: none;
    transition: background-color 250ms ease;
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
