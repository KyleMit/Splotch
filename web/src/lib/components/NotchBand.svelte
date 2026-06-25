<script lang="ts">
  import { onMount } from 'svelte';
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { isNative, getPlatform } from '$lib/platform';
  import { lazyPluginModule } from '$lib/nativePlugin';
  import { computeNotchBandState } from '$lib/notchBand';

  const loadStatusBar = lazyPluginModule(() => import('@capacitor/status-bar'));

  // Measured env(safe-area-inset-top), in CSS px. A hidden probe is the only
  // reliable way to read a safe-area inset as a number across engines; we need
  // the number (not just the CSS value) to tell a real notch from a bezel.
  let insetTop = $state(0);

  function measureInset() {
    if (typeof document === 'undefined') return;
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    insetTop = probe.getBoundingClientRect().height;
    probe.remove();
  }

  onMount(() => {
    measureInset();
    const onChange = () => measureInset();
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
      insetTop,
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
</script>

<div
  class="notch-band"
  aria-hidden="true"
  style:background-color={band.show ? band.color : 'transparent'}
></div>

<style>
  /* Fills the top safe-area inset (the notch / hole-punch strip), behind the
     OS clock. Height collapses to 0 on devices without a cutout, and the fill
     stays transparent unless the inset is deep enough to be a real notch. */
  .notch-band {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: env(safe-area-inset-top);
    z-index: 1000;
    pointer-events: none;
    transition: background-color 250ms ease;
  }
</style>
