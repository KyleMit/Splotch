<script lang="ts">
  import type { DeviceProfile } from './deviceProfile';
  import DeviceChrome from './DeviceChrome.svelte';
  import { appliedInsets, bandVerdict, diagnose, unreclaimedInsetPx } from './diagnostics';
  import { isFrameReady } from './frameReady';
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

  // What the app lays out against: the device's insets with the app's own
  // status-bar policy applied. On Android native landscape the app hides the
  // status bar, so the top inset the device reports is not the one the shipped
  // app sees — a tile drawn from the raw numbers would show padding that does
  // not exist on the device.
  const insets = $derived(appliedInsets(profile, orientation));
  const deviceInsets = $derived(profile.insets[orientation]);
  const statusBarHidden = $derived(!!insets && !!deviceInsets && insets.top !== deviceInsets.top);
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

  let slotEl = $state<HTMLDivElement | undefined>();
  let iframeEl = $state<HTMLIFrameElement | undefined>();
  let near = $state(false);
  let ready = $state(false);
  let timedOut = $state(false);

  // Each frame is a whole app document, so a page of sixty is sixty boots. The
  // browser's own lazy-loading margin is wide enough to start most of them at
  // once on a first scroll through; this narrower band keeps it to the few
  // sections either side of the reader.
  const NEAR_VIEWPORT_MARGIN_PX = 600;
  const READY_POLL_MS = 150;
  // Generous: a cold dev server compiles the route on the first frame that asks
  // for it. Past this the tile says it gave up rather than claiming to be busy.
  const READY_TIMEOUT_MS = 60_000;

  $effect(() => {
    if (!slotEl || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) near = true;
      },
      { rootMargin: `${NEAR_VIEWPORT_MARGIN_PX}px` }
    );
    observer.observe(slotEl);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!iframeEl || ready) return;
    const startedAt = performance.now();
    const poll = window.setInterval(() => {
      if (isFrameReady(iframeEl)) {
        ready = true;
        window.clearInterval(poll);
      } else if (performance.now() - startedAt > READY_TIMEOUT_MS) {
        timedOut = true;
        window.clearInterval(poll);
      }
    }, READY_POLL_MS);
    return () => window.clearInterval(poll);
  });

  const diagnosis = $derived(diagnose(profile, orientation));
  const unreclaimed = $derived(unreclaimedInsetPx(profile, orientation));

  // The tile's verdict in one line. Painting the band on an edge the cutout is
  // not on is the failure worth shouting about: it spends claimable screen on a
  // colour bar while leaving the strip it exists to fill unpainted.
  const verdict = $derived.by(() => {
    if (!diagnosis) return null;
    const painted = diagnosis.bandEdges;
    if (diagnosis.missesCutout) {
      return {
        level: 'bad' as const,
        text: `band on ${painted.join(' + ')}, cutout on ${diagnosis.cutoutScreenEdge}`,
      };
    }
    if (diagnosis.insetWithoutCutout) {
      return { level: 'warn' as const, text: `band on ${painted.join(' + ')}, no cutout there` };
    }
    if (painted.length > 0) {
      return { level: 'good' as const, text: `band on ${painted.join(' + ')}` };
    }
    // No band is the right answer on a device with no cutout; on one that HAS a
    // cutout it is a gap, and bandVerdict is the thing that names why.
    const gap = bandVerdict(profile, orientation)?.cause;
    return gap
      ? { level: 'warn' as const, text: `no band — ${gap}` }
      : { level: 'none' as const, text: 'no band' };
  });
</script>

{#if insets}
  <figure class="tile">
    <div class="slot" bind:this={slotEl} style:width="{budgetPx}px" style:height="{budgetPx}px">
      <div class="viewport" style:width="{width * scale}px" style:height="{height * scale}px">
        <div
          class="screen"
          style:width="{width}px"
          style:height="{height}px"
          style:scale={String(scale)}
        >
          {#if near}
            <iframe
              bind:this={iframeEl}
              {src}
              title="{profile.label} · {ORIENTATION_LABELS[orientation]}"
            ></iframe>
          {/if}
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
      {#if !ready}
        <div class="veil" class:failed={timedOut}>
          <span>{timedOut ? 'frame never became ready' : 'loading…'}</span>
        </div>
      {/if}
    </div>
    <figcaption>
      <span class="orientation">{ORIENTATION_LABELS[orientation]}</span>
      <span class="readout" title="top · right · bottom · left">{readout}</span>
      {#if verdict}
        <span class="verdict" data-level={verdict.level}>{verdict.text}</span>
      {/if}
      {#if statusBarHidden}
        <span class="unreclaimed"
          >status bar hidden by the app ({deviceInsets?.top}px reclaimed)</span
        >
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
    position: relative;
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
  /* Sits over the whole slot, outside the scaled screen, so its label reads at
     a fixed size whatever the tile scale is. */
  .veil {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--app-bg);
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .veil.failed {
    color: var(--danger-text);
  }

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
    color: var(--text-strong);
  }

  .readout {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .verdict {
    font-size: var(--font-size-xs);
    padding: 1px 8px;
    border-radius: var(--radius-pill);
  }

  .verdict[data-level='good'] {
    color: var(--success-text);
    background: var(--success-wash);
  }

  .verdict[data-level='bad'] {
    color: var(--danger-text);
    background: var(--danger-wash);
  }

  .verdict[data-level='warn'] {
    color: var(--notch-warn-ink);
    background: var(--notch-warn-wash);
  }

  .verdict[data-level='none'] {
    color: var(--text-soft);
    background: var(--surface-hover);
  }

  .unreclaimed {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }
</style>
