<script lang="ts">
  import { CUSTOM_SWATCH } from '$lib/state/colors.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { selectionRingShadow } from '$lib/colorRing';
  import Icon from './Icon.svelte';
  import { playPressRelease, pressRelease } from '$lib/actions/pressRelease';

  type Props = {
    active: boolean;
    /** The Selection Ring's color while the ring shows; undefined hides it. */
    ring: string | undefined;
    onselect: (button: HTMLButtonElement) => void;
  } & (
    | {
        variant: 'flat';
        hex: string;
        color: string;
        label: string;
        trimRank: number | undefined;
        animate: boolean;
        startReduced: boolean;
      }
    | { variant: 'custom' }
  );

  const props: Props = $props();

  const flat = $derived(props.variant === 'flat' ? props : undefined);

  const ringShadow = $derived(
    props.ring === undefined
      ? ''
      : `box-shadow: ${selectionRingShadow(props.ring, 'var(--palette-surface, var(--surface))')};`
  );

  const style = $derived(
    flat
      ? `background-color: ${flat.color}; ${props.ring === undefined ? '' : `${ringShadow} --ring-color: ${props.ring};`}`
      : ringShadow
  );

  // Read only when a press activates, so it stays untracked.
  let buttonEl: HTMLButtonElement;

  // The press gets its own springy release instead of snapping back from the
  // :active scale (lib/actions/pressRelease.ts).
  function playSwatchRelease(e: PointerEvent & { currentTarget: HTMLButtonElement }) {
    playPressRelease(e.currentTarget);
  }

  function handleSwatchCancel(e: PointerEvent) {
    releaseAllPointers();
    e.stopPropagation();
  }
</script>

<button
  class="color-swatch"
  class:gradient-swatch={!flat}
  class:active={props.active}
  class:ring-animate={flat?.animate}
  class:ringed={!flat && props.ring !== undefined}
  data-start-reduced-motion={flat?.animate && flat.startReduced ? '' : undefined}
  data-color={flat ? flat.hex : CUSTOM_SWATCH}
  data-trim-rank={flat?.trimRank}
  {style}
  aria-label={flat ? flat.label : 'Custom Color'}
  use:scribbleTap={() => props.onselect(buttonEl)}
  use:pressRelease
  onpointerup={playSwatchRelease}
  onpointercancel={handleSwatchCancel}
  bind:this={buttonEl}
  >{#if !flat}<Icon name="more-colors" class="more-colors-icon" aria-hidden="true" />{/if}</button
>

<style>
  .color-swatch {
    display: block;
    position: relative;
    width: 60px;
    height: 60px;
    border: var(--selection-ring-gap-width) solid transparent;
    border-radius: 50%;
    cursor: pointer;
    /* Orientation changes resize every swatch together. Keep those geometry
       changes synchronous so rotation does not schedule sixteen layout
       transitions; only interaction and theme feedback should animate. */
    transition:
      background-color var(--duration-base) ease,
      border-color var(--duration-base) ease,
      box-shadow var(--duration-base) ease,
      transform var(--duration-base) ease;
    /* Themed: a black drop shadow vanished on the dark bar and went flat. */
    box-shadow: var(--float-shadow);
    touch-action: manipulation; /* Prevent iOS gesture delays */
  }

  .color-swatch:active {
    transform: scale(0.9);
  }

  .color-swatch:global(.releasing) {
    animation: swatch-press var(--press-release-duration) linear;
  }

  .color-swatch.active {
    border-color: var(--palette-surface, var(--surface));
    /* Selection Ring is set dynamically via JavaScript to match swatch color */
  }

  /* Selection-confirmation flourish: ink blooming past the rim — a ring that
     overshoots the resting selection-ring position as it fades, followed by a
     thinner, fainter one. Skipped on the gradient swatch (whose confirmation is
     the picker opening). */
  .color-swatch:not(.gradient-swatch)::before,
  .color-swatch:not(.gradient-swatch)::after {
    content: '';
    position: absolute;
    inset: calc(-1 * var(--selection-ring-width));
    border-radius: 50%;
    border: var(--selection-ring-width) solid var(--ring-color, transparent);
    box-sizing: border-box;
    pointer-events: none;
    opacity: 0;
    transform: scale(0);
  }

  .color-swatch:not(.gradient-swatch)::after {
    border-width: 3px;
  }

  .color-swatch.ring-animate:not(.gradient-swatch)::before {
    animation: swatch-ring-expand 620ms var(--ease-glide) forwards;
  }

  .color-swatch.ring-animate:not(.gradient-swatch)::after {
    animation: swatch-ring-trail 700ms 90ms var(--ease-glide) forwards;
  }

  @keyframes swatch-ring-expand {
    0% {
      transform: scale(0.34);
      opacity: 0;
    }
    26% {
      opacity: 0.95;
    }
    100% {
      transform: scale(1.16);
      opacity: 0;
    }
  }

  @keyframes swatch-ring-trail {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    34% {
      opacity: 0.4;
    }
    100% {
      transform: scale(1.34);
      opacity: 0;
    }
  }

  /* Both rings are a transient pulse that ends at opacity 0 — the selection
     itself is the resting ring, which stays. */
  :global(:root[data-reduce-motion]) .color-swatch:global(.releasing),
  .color-swatch.ring-animate:global([data-start-reduced-motion]):not(.gradient-swatch)::before,
  .color-swatch.ring-animate:global([data-start-reduced-motion]):not(.gradient-swatch)::after {
    animation: none;
  }

  /* The custom-color swatch is a honeycomb of palette-color dots (echoing the
     picker's hexagon swatches) on the bar's own surface color, so it reads as
     "more colors" beside the flat swatches and follows the theme in dark mode. */
  .gradient-swatch {
    --pop-scale: 1.12;
    background: var(--palette-surface, var(--surface));
    position: relative;
  }

  /* Centered absolutely (not via flex) so it survives the display:block/none
     toggling on each swatch. The SVG keeps its aspect ratio. Resting size is
     the content box divided by the selection pop, so the popped cluster lands
     exactly on the content box — the same circle an active swatch's disc fills
     inside the Selection Ring — giving the ringed hexagon the same width of
     white band as a ringed round swatch (issue #310). */
  .gradient-swatch :global(.more-colors-icon) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% / var(--pop-scale));
    height: calc(100% / var(--pop-scale));
    pointer-events: none;
    transition: transform var(--duration-fast) ease-out;
  }

  /* Selection pop: the hexagon cluster scales toward the ring. Keyed on .ringed
     (ring visible), not .active — tapping the swatch arms it before a color is
     picked, and the cluster shouldn't pop ringless. Popped it spans exactly the
     content box (52px at 60px), well inside the button, so nothing clips
     against the portrait bar's overflow clip. */
  .gradient-swatch.ringed :global(.more-colors-icon) {
    transform: translate(-50%, -50%) scale(var(--pop-scale));
  }

  /* Reduced motion: the cluster still fills the ring when selected — that is
     the selection reading — it just arrives there rather than popping. */
  :global(:root[data-reduce-motion]) .gradient-swatch :global(.more-colors-icon) {
    transition: none;
  }

  @media (orientation: portrait) {
    .color-swatch {
      width: 55px;
      height: 55px;
      flex-shrink: 0;
    }
  }

  :global(html[data-toolbar='bare']) .gradient-swatch {
    background: transparent;
    box-shadow: none;
  }
</style>
