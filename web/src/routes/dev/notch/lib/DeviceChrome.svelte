<script lang="ts">
  import type { SafeAreaInsets } from '$lib/platform/safeArea';
  import type { DeviceProfile } from './deviceProfile';
  import { ORIENTATION_ANGLES, isLandscape, type Orientation } from './orientations';

  // The hardware layer drawn over a preview tile: the screen's rounded corners,
  // the physical cutout, the system glyphs that sit in the top inset, and the
  // home indicator. Everything here is illustration — it exists so a tile shows
  // where the camera and the gesture bar physically are, next to the insets the
  // OS reports for them. On iOS landscape those two disagree, and seeing them
  // side by side is the entire point of the harness.
  interface Props {
    profile: DeviceProfile;
    orientation: Orientation;
    /** Screen size in CSS px for this orientation, before the tile's scale. */
    width: number;
    height: number;
    insets: SafeAreaInsets;
  }

  let { profile, orientation, width, height, insets }: Props = $props();

  const angle = $derived(ORIENTATION_ANGLES[orientation]);
  const landscape = $derived(isLandscape(orientation));

  // The cutout is authored in portrait device coordinates, so placing it means
  // rotating that point into the current orientation. Each branch reads as
  // "which screen edge is the device's top edge now, and which way along it does
  // the portrait X axis run".
  const cutout = $derived(profile.cutout);
  const cutoutBox = $derived.by(() => {
    if (cutout.kind === 'none') return null;
    const { widthPx: w, heightPx: h, topPx: t, centerX } = cutout;
    // Distance along the device's top edge to the cutout's leading corner.
    const alongPortrait = centerX * profile.viewport.width - w / 2;
    switch (angle) {
      case 0:
        return { left: alongPortrait, top: t, width: w, height: h };
      case 180:
        return { left: width - alongPortrait - w, top: height - t - h, width: w, height: h };
      // Device top edge is on the screen's left; the portrait X axis runs down.
      case 90:
        return { left: t, top: alongPortrait, width: h, height: w };
      default:
        return { left: width - t - h, top: height - alongPortrait - w, width: h, height: w };
    }
  });

  const cornerRadius = $derived(profile.cornerRadiusPx);

  // The home indicator sits on the visual bottom in every orientation on iOS —
  // it rotates with the interface rather than staying on one physical edge.
  const showHomeIndicator = $derived(insets.bottom > 0 && profile.platform === 'ios');
  const homeIndicatorWidth = $derived(Math.round(Math.min(width, height) * 0.36));
</script>

<div class="chrome" style:--corner="{cornerRadius}px" aria-hidden="true">
  <div class="rounding"></div>

  {#if cutoutBox}
    <div
      class="cutout"
      class:pill={cutout.kind !== 'notch'}
      class:notch={cutout.kind === 'notch'}
      class:vertical={landscape}
      style:left="{cutoutBox.left}px"
      style:top="{cutoutBox.top}px"
      style:width="{cutoutBox.width}px"
      style:height="{cutoutBox.height}px"
    ></div>
  {/if}

  <!-- System glyphs: a clock and a status cluster, placed inside the top inset
       so a tile shows what the band would be painting behind. Only drawn where
       the OS actually keeps a status bar in this orientation. -->
  {#if insets.top > 0}
    <div
      class="status-bar"
      style:height="{insets.top}px"
      style:padding-inline="{insets.left + 24}px {insets.right + 24}px"
    >
      <span class="glyph clock">9:41</span>
      <span class="glyph cluster">
        <span class="bar sig"></span>
        <span class="bar wifi"></span>
        <span class="bar battery"></span>
      </span>
    </div>
  {/if}

  {#if showHomeIndicator}
    <div
      class="home-indicator"
      style:bottom="{Math.max(1, (insets.bottom - 5) / 2)}px"
      style:width="{homeIndicatorWidth}px"
    ></div>
  {/if}
</div>

<style>
  .chrome {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  /* Masks the tile's square corners down to the device's radius by painting the
     gap rather than clipping, so the rounding reads against the page ground the
     way a device bezel does. */
  .rounding {
    position: absolute;
    inset: 0;
    border-radius: var(--corner);
    box-shadow: 0 0 0 400px var(--notch-page-ground);
  }

  .cutout {
    position: absolute;
    background: #05050a;
  }

  /* A notch hangs off the screen edge, so only its trailing corners round. */
  .notch {
    border-radius: 0 0 18px 18px;
  }

  .notch.vertical {
    border-radius: 0 18px 18px 0;
  }

  .pill {
    border-radius: 999px;
  }

  .status-bar {
    position: absolute;
    inset: 0 0 auto 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--notch-glyph);
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-family);
  }

  .cluster {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .bar {
    display: block;
    background: currentColor;
    border-radius: 1px;
  }

  .sig {
    width: 11px;
    height: 8px;
    clip-path: polygon(0 100%, 100% 100%, 100% 0);
  }

  .wifi {
    width: 10px;
    height: 8px;
    border-radius: 50% 50% 0 0;
  }

  .battery {
    width: 16px;
    height: 8px;
    border-radius: 2px;
  }

  .home-indicator {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    height: 5px;
    border-radius: 999px;
    background: var(--notch-glyph);
    opacity: 0.75;
  }
</style>
