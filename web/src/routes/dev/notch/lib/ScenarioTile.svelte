<script lang="ts">
  import type { DeviceProfile } from './deviceProfile';
  import DeviceChrome from './DeviceChrome.svelte';
  import { diagnose, unreclaimedInsetPx } from './diagnostics';
  import { ORIENTATION_LABELS, isLandscape, type Orientation } from './orientations';

  // One device held one way: the live HUD in an iframe at the device's own CSS
  // viewport, scaled down to thumbnail size, with the hardware drawn over it and
  // the claimable region outlined.
  interface Props {
    profile: DeviceProfile;
    orientation: Orientation;
    /** Longest edge of the rendered tile, in px. Sets the scale. */
    budgetPx: number;
  }

  let { profile, orientation, budgetPx }: Props = $props();

  const insets = $derived(profile.insets[orientation]);
  const landscape = $derived(isLandscape(orientation));
  const width = $derived(landscape ? profile.viewport.height : profile.viewport.width);
  const height = $derived(landscape ? profile.viewport.width : profile.viewport.height);
  const scale = $derived(budgetPx / Math.max(width, height));
  const src = $derived(`/dev/notch/frame?device=${profile.id}&orientation=${orientation}`);

  // Reading order matches the CSS shorthand so a tile's label can be compared
  // against a stylesheet without re-ordering it in your head.
  const readout = $derived(
    insets ? `${insets.top} · ${insets.right} · ${insets.bottom} · ${insets.left}` : ''
  );

  const diagnosis = $derived(diagnose(profile, orientation));
  const unreclaimed = $derived(unreclaimedInsetPx(profile, orientation));

  // The tile's verdict in one line. Painting the band on an edge the cutout is
  // not on is the failure worth shouting about: it spends claimable screen on a
  // colour bar while leaving the strip it exists to fill unpainted.
  const verdict = $derived.by(() => {
    if (!diagnosis) return null;
    if (diagnosis.wrongSide) {
      return {
        level: 'bad' as const,
        text: `band on ${diagnosis.bandEdge}, cutout on ${diagnosis.cutoutScreenEdge}`,
      };
    }
    if (diagnosis.insetWithoutCutout) {
      return { level: 'warn' as const, text: `band on ${diagnosis.bandEdge}, no cutout there` };
    }
    if (diagnosis.bandEdge) {
      return { level: 'good' as const, text: `band on ${diagnosis.bandEdge}` };
    }
    return { level: 'none' as const, text: 'no band' };
  });
</script>

{#if insets}
  <figure class="tile">
    <div class="slot" style:width="{budgetPx}px" style:height="{budgetPx}px">
      <div class="viewport" style:width="{width * scale}px" style:height="{height * scale}px">
        <div
          class="screen"
          style:width="{width}px"
          style:height="{height}px"
          style:scale={String(scale)}
        >
          <!-- lazy so a page of sixty scenarios does not boot sixty HUDs at once;
             each one is a full app document. -->
          <iframe {src} title="{profile.label} · {ORIENTATION_LABELS[orientation]}" loading="lazy"
          ></iframe>
          <DeviceChrome {profile} {orientation} {width} {height} {insets} />
          <!-- The claimable region: everything outside this outline is what the OS
             says you may not use. A control drawn outside it is the bug. -->
          <div
            class="safe-outline"
            style:inset="{insets.top}px {insets.right}px {insets.bottom}px {insets.left}px"
            style:--outline-width="{2 / scale}px"
          ></div>
        </div>
      </div>
    </div>
    <figcaption>
      <span class="orientation">{ORIENTATION_LABELS[orientation]}</span>
      <span class="readout" title="top · right · bottom · left">{readout}</span>
      {#if verdict}
        <span class="verdict" data-level={verdict.level}>{verdict.text}</span>
      {/if}
      {#if unreclaimed > 0}
        <span class="unreclaimed">{unreclaimed}px given up, not reclaimed</span>
      {/if}
    </figcaption>
  </figure>
{/if}

<style>
  .tile {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
  }

  /* A square slot the size of the longest edge, so portrait and landscape tiles
     in one row share a baseline instead of stair-stepping. */
  .slot {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .viewport {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-sm);
  }

  /* Scaled from the top-left so the parent's px box, computed from the same
     scale, lands exactly on the rendered edges. */
  .screen {
    position: absolute;
    top: 0;
    left: 0;
    scale: 1;
    transform-origin: 0 0;
  }

  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: var(--app-bg);
  }

  /* Border width is divided by the tile scale so the outline stays the same
     thickness on screen whatever size the tiles are set to. */
  .safe-outline {
    position: absolute;
    border: var(--outline-width) dashed var(--notch-safe-outline);
    pointer-events: none;
  }

  figcaption {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
  }

  .orientation {
    font-size: var(--font-size-sm);
    color: var(--notch-body);
  }

  .readout {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--notch-muted);
  }

  .verdict {
    font-size: var(--font-size-xs);
    padding: 1px 8px;
    border-radius: var(--radius-pill);
  }

  .verdict[data-level='good'] {
    color: #9ee6a8;
    background: #1d3a22;
  }

  .verdict[data-level='bad'] {
    color: #ff9d9d;
    background: #4d1616;
  }

  .verdict[data-level='warn'] {
    color: #ffd479;
    background: #4d3810;
  }

  .verdict[data-level='none'] {
    color: var(--notch-muted);
    background: #2a2a34;
  }

  .unreclaimed {
    font-size: var(--font-size-xs);
    color: var(--notch-muted);
  }
</style>
