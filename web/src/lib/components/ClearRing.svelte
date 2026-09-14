<script lang="ts">
  import { onMount } from 'svelte';
  import { createClearRingContours } from './clearRingContours';

  const INITIAL_DIAMETER_PX = 255;
  let diameterPx = $state(INITIAL_DIAMETER_PX);
  let ringEl: SVGSVGElement;
  const contours = $derived(createClearRingContours(diameterPx));

  onMount(() => {
    // Layout size ignores the reveal transform; hidden rings retain their last artwork.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) diameterPx = entry.contentRect.width;
    });
    observer.observe(ringEl);
    return () => observer.disconnect();
  });
</script>

<svg
  bind:this={ringEl}
  class="clear-ring"
  viewBox={`0 0 ${diameterPx} ${diameterPx}`}
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <path class="dashes" d={contours.dashes} vector-effect="non-scaling-stroke" />
  <path class="solid" d={contours.solid} vector-effect="non-scaling-stroke" />
</svg>

<style>
  .clear-ring {
    --ring-stroke-width: 4px;
    position: absolute;
    inset: calc(var(--ring-stroke-width) / 2);
    width: calc(100% - var(--ring-stroke-width));
    height: calc(100% - var(--ring-stroke-width));
    overflow: visible;
    pointer-events: none;
    stroke: currentColor;
    stroke-width: var(--ring-stroke-width);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dashes {
    opacity: var(--clear-ring-dashes, 1);
  }

  .solid {
    opacity: var(--clear-ring-solid, 0);
  }
</style>
