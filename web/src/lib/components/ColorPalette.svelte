<script lang="ts">
  import { renderedActionButtonSize } from '$lib/actionButtonLayout';
  import { layoutState } from '$lib/state/layout.svelte';
  const paletteBottom = $derived(
    layoutState.viewportWidth > 0
      ? Math.max(0, 8 + renderedActionButtonSize() / 2 - 30 + layoutState.safeArea.bottom)
      : 8
  );
  import {
    PALETTE_COLORS,
    TRIM_ORDER,
    CUSTOM_SWATCH,
    colorsState,
    selectPaletteColor,
    selectCustomSwatch,
    themedSwatchColor,
  } from '$lib/state/colors.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { releaseAllPointers } from '$lib/drawing/engine';
  import { scribbleGuard, scribbleTap } from '$lib/actions/scribbleGuard';
  import { colorPickerModal } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { toolState, selectInkBrush } from '$lib/state/tool.svelte';
  import {
    getRingColor,
    selectionRingShadow,
    SELECTION_RING_WIDTH_PX,
    SELECTION_RING_GAP_PX,
  } from '$lib/colorRing';
  import Icon from './Icon.svelte';
  import { prefersReducedMotion } from '$lib/platform/reducedMotion';

  const SWATCH_RELEASE_CLASS = 'releasing';

  let customSwatchEl: HTMLButtonElement | undefined;

  const dark = $derived(resolvedTheme() === 'dark');

  // The selection ring hides while erasing (no ink is being laid down) and
  // stays visible for every other brush, matching the pre-brush-menu behavior.
  const erasing = $derived(toolState.brush === 'eraser');

  // Track the most recent click so we can fire the confirmation ring animation
  // only on the actual selection (not on every reactivity change).
  let ringAnimateHex = $state<string | null>(null);
  let ringStartedReduced = $state(false);

  function selectSwatch(hex: string, paint: string) {
    selectInkBrush();
    selectPaletteColor(hex, paint);
    ringStartedReduced = prefersReducedMotion();
    ringAnimateHex = hex;
    releaseAllPointers();
  }

  function selectCustomColor() {
    selectInkBrush();
    selectCustomSwatch();
    colorPickerModal.show(customSwatchEl ? buttonCenter(customSwatchEl) : null);
    releaseAllPointers();
  }

  function handlePaletteDown(e: PointerEvent) {
    releaseAllPointers();
    e.preventDefault();
  }

  function handlePaletteUp(e: PointerEvent) {
    e.stopPropagation();
  }

  // The press gets its own springy release instead of snapping back from the
  // :active scale. A press landing while the last one is still settling rewinds
  // that animation rather than stacking a second. Svelte scopes the keyframe's
  // name, so the release is found as the swatch's only own CSS animation — its
  // selection rings animate its pseudo-elements, which getAnimations() without
  // subtree leaves out.
  function playSwatchRelease(e: PointerEvent & { currentTarget: HTMLButtonElement }) {
    const swatch = e.currentTarget;
    if (prefersReducedMotion()) {
      swatch.classList.remove(SWATCH_RELEASE_CLASS);
      return;
    }
    const release = swatch.getAnimations().find((animation) => animation instanceof CSSAnimation);
    if (release) {
      release.currentTime = 0;
      release.play();
      return;
    }
    swatch.classList.add(SWATCH_RELEASE_CLASS);
  }

  // The rings' animationend bubbles from the swatch's pseudo-elements.
  function endSwatchRelease(e: AnimationEvent & { currentTarget: HTMLButtonElement }) {
    if (e.target === e.currentTarget && e.pseudoElement === '')
      e.currentTarget.classList.remove(SWATCH_RELEASE_CLASS);
  }

  function clearReleaseOnCancel(node: HTMLButtonElement) {
    const cancel = (event: AnimationEvent) => {
      if (event.target === node && event.pseudoElement === '')
        node.classList.remove(SWATCH_RELEASE_CLASS);
    };
    node.addEventListener('animationcancel', cancel);
    return { destroy: () => node.removeEventListener('animationcancel', cancel) };
  }

  function handleSwatchCancel(e: PointerEvent) {
    releaseAllPointers();
    e.stopPropagation();
  }

  // Each swatch is tagged with its trim rank (0 = first to be hidden) so the
  // style block can drop swatches by priority at each breakpoint. Hiding is
  // done entirely in CSS media queries — no JS measurement — so the layout is
  // correct on the prerendered first paint with no resize flash. The palette
  // always spans the full relevant viewport dimension (height in landscape,
  // width in portrait), so viewport breakpoints map directly onto its room.
  const trimRank = new Map(TRIM_ORDER.map((hex, i) => [hex, i]));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="color-palette"
  style:--palette-bottom={`${paletteBottom}px`}
  style:--selection-ring-width={`${SELECTION_RING_WIDTH_PX}px`}
  style:--selection-ring-gap-width={`${SELECTION_RING_GAP_PX}px`}
  use:scribbleGuard
  onpointerdown={handlePaletteDown}
  onpointerup={handlePaletteUp}
>
  {#each PALETTE_COLORS as { hex, label } (hex)}
    {@const shown = themedSwatchColor(hex, dark)}
    {@const ringColor = getRingColor(shown)}
    <button
      class="color-swatch"
      class:active={!erasing && colorsState.activeSwatch === hex}
      class:ring-animate={ringAnimateHex === hex}
      data-start-reduced-motion={ringAnimateHex === hex && ringStartedReduced ? '' : undefined}
      data-color={hex}
      data-trim-rank={trimRank.get(hex)}
      style="background-color: {shown}; {!erasing && colorsState.activeSwatch === hex
        ? `box-shadow: ${selectionRingShadow(ringColor, 'var(--palette-surface, var(--surface))')}; --ring-color: ${ringColor};`
        : ''}"
      aria-label={shown === hex ? label : 'White'}
      use:scribbleTap={() => selectSwatch(hex, shown)}
      use:clearReleaseOnCancel
      onpointerup={playSwatchRelease}
      onpointercancel={handleSwatchCancel}
      onanimationend={endSwatchRelease}
    ></button>
  {/each}

  <button
    class="color-swatch gradient-swatch"
    class:active={!erasing && colorsState.activeSwatch === CUSTOM_SWATCH}
    class:ringed={!erasing &&
      colorsState.activeSwatch === CUSTOM_SWATCH &&
      colorsState.customColorSelected}
    data-color="custom"
    aria-label="Custom Color"
    style={!erasing && colorsState.activeSwatch === CUSTOM_SWATCH && colorsState.customColorSelected
      ? `box-shadow: ${selectionRingShadow(colorsState.customColor, 'var(--palette-surface, var(--surface))')};`
      : ''}
    use:scribbleTap={selectCustomColor}
    use:clearReleaseOnCancel
    onpointerup={playSwatchRelease}
    onpointercancel={handleSwatchCancel}
    onanimationend={endSwatchRelease}
    bind:this={customSwatchEl}
    ><Icon name="more-colors" class="more-colors-icon" aria-hidden="true" /></button
  >
</div>

<style>
  .color-palette {
    display: grid;
    grid-template-columns: 1fr;
    justify-items: center;
    align-content: space-between;
    width: var(--palette-landscape-width);
    gap: 12px;
    /* Bottom: the clearance that centres the custom swatch on the Brush Button
       (bare-toolbar.spec.ts); the vertical clip below trims the last swatch's
       shadow where it is under 12px, since it cannot grow. */
    padding: 12px 12px var(--palette-bottom);
    background: var(--palette-surface, var(--surface));
    box-shadow: 2px 0 10px rgb(0 0 0 / 10%);
    z-index: var(--z-palette); /* Above the clear coachmark, the tallest chrome below it */
    flex-shrink: 0;
    position: relative;
    /* Visible sideways so the selection bloom can overshoot the edges; clipped
       (not hidden: no scroll container) vertically because the ladder trims by
       viewport height, so a status-bar iPad's inset-shortened column overruns
       its last swatch (safe-area-matrix.spec.ts) and would scroll the page. */
    overflow-x: visible;
    overflow-y: clip;
    touch-action: manipulation; /* Prevent iOS gesture delays */
  }

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
    box-shadow: 0 4px 8px rgb(0 0 0 / 20%);
    touch-action: manipulation; /* Prevent iOS gesture delays */
  }

  .color-swatch:active {
    transform: scale(0.9);
  }

  .color-swatch:global(.releasing) {
    animation: swatch-press 420ms var(--ease-pop);
  }

  @keyframes swatch-press {
    0% {
      transform: scale(0.9);
    }
    42% {
      transform: scale(1.075);
    }
    72% {
      transform: scale(0.984);
    }
    100% {
      transform: scale(1);
    }
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

  /* Landscape tablets use one column, trimming swatches as the viewport
     shortens. Phone landscape uses ColorControl instead. trimGeometry.test.ts
     verifies the remaining palette ladder against its geometry. */

  @media (orientation: portrait) {
    .color-palette {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      /* Declared, not content-sized: the Actions Panel's portrait column and
         the AI Waiting Polaroid both start below this bar by reading the same
         token, so the bar has to be exactly that tall. */
      height: var(--palette-portrait-height);
      /* 8 + 55 + 12 = the 75px bar: the swatch sits 2px higher so its 12px
         drop shadow ends at the bar's edge instead of 2px past the clip. */
      padding: 8px 10px 12px;
      gap: 8px;
      box-shadow: 0 2px 10px rgb(0 0 0 / 10%);
      /* The clip margin lets the swatch bloom overshoot the bar (WebKit ignores
         it and clips at the padding box); no overrun risk here, the bar is a
         declared height. */
      overflow: clip;
      overflow-clip-margin: 12px;
      flex-wrap: nowrap;
    }

    .color-swatch {
      width: 55px;
      height: 55px;
      flex-shrink: 0;
    }
  }

  /* ── Trim-by-priority ──────────────────────────────────────────────────────
     Every swatch carries its data-trim-rank — its place in palette.ts's
     TRIM_ORDER, 0 being the first to go. All of them render by default and each
     rule below hides the next rank as the palette's room shrinks, so a viewport
     shows as many swatches as fit at full size: the touch target never shrinks
     to make room for a color. The gradient swatch has no rank and is never
     hidden.

     The ladders cascade — a smaller viewport satisfies every larger max-*
     threshold at once — and each layout owns its own, because the same viewport
     holds a different number of swatches depending on which one it is in.

     Every threshold is derived arithmetically; design/trimGeometry.ts is the
     executable form of the ladders, and trimGeometry.test.ts parses this
     whole style block back out — swatch sizes and gaps as well as the thresholds
     and the ranks each rule hides — and asserts the module still produces
     exactly these values.

     PORTRAIT — the palette is a full-width row of 55px swatches with 8px gaps
     inside 10px side padding, so N of them fit at width ≥ 63·N + 12 (the
     gradient swatch takes one of those slots). */
  @media (orientation: portrait) and (max-width: 1019.98px) {
    .color-swatch[data-trim-rank='0'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 956.98px) {
    .color-swatch[data-trim-rank='1'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 893.98px) {
    .color-swatch[data-trim-rank='2'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 830.98px) {
    .color-swatch[data-trim-rank='3'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 767.98px) {
    .color-swatch[data-trim-rank='4'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 704.98px) {
    .color-swatch[data-trim-rank='5'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 641.98px) {
    .color-swatch[data-trim-rank='6'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 578.98px) {
    .color-swatch[data-trim-rank='7'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 515.98px) {
    .color-swatch[data-trim-rank='8'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 452.98px) {
    .color-swatch[data-trim-rank='9'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 389.98px) {
    .color-swatch[data-trim-rank='10'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 326.98px) {
    .color-swatch[data-trim-rank='11'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 263.98px) {
    .color-swatch[data-trim-rank='12'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 200.98px) {
    .color-swatch[data-trim-rank='13'] {
      display: none;
    }
  }
  @media (orientation: portrait) and (max-width: 137.98px) {
    .color-swatch[data-trim-rank='14'] {
      display: none;
    }
  }

  /* LANDSCAPE, single column (1 bar) — 60px swatches, 12px gaps, 12px side
     padding: N fit at height ≥ 72·N + 12. Floored at the layout switch. */
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 1163.98px) {
    .color-swatch[data-trim-rank='0'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 1091.98px) {
    .color-swatch[data-trim-rank='1'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 1019.98px) {
    .color-swatch[data-trim-rank='2'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 947.98px) {
    .color-swatch[data-trim-rank='3'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 875.98px) {
    .color-swatch[data-trim-rank='4'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 803.98px) {
    .color-swatch[data-trim-rank='5'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 731.98px) {
    .color-swatch[data-trim-rank='6'] {
      display: none;
    }
  }
  @media (orientation: landscape) and (min-height: 600px) and (max-height: 659.98px) {
    .color-swatch[data-trim-rank='7'] {
      display: none;
    }
  }

  /* Phone landscape hands the palette's strip back to the drawing canvas. */
  @media (orientation: landscape) and (max-height: 599.98px) {
    .color-palette {
      display: none;
    }
  }
  :global(html[data-toolbar='bare']) .color-palette {
    --palette-surface: var(--paper);
    position: absolute;
    top: var(--safe-area-top);
    left: var(--safe-area-left);
    bottom: 0;
    background: transparent;
    box-shadow: none;
    align-content: space-between;
    padding: 12px 0 var(--palette-bottom);
  }
  :global(html[data-toolbar='bare']) .gradient-swatch {
    background: transparent;
    box-shadow: none;
  }
  @media (orientation: portrait) {
    :global(html[data-toolbar='bare']) .color-palette {
      width: calc(100% - var(--safe-area-left) - var(--safe-area-right));
      bottom: auto;
      padding: 8px 10px 12px;
    }
  }
</style>
