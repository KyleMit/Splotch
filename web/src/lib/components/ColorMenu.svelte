<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { LANDSCAPE_COLORS, landscapeTrimRank } from '$lib/landscapeToolbar';
  import {
    CUSTOM_SWATCH,
    colorsState,
    isDarkInk,
    themedSwatchColor,
  } from '$lib/state/colors.svelte';
  import { getRingColor, selectionRingShadow, SELECTION_RING_GAP_PX } from '$lib/colorRing';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { stampMotionAtStart } from '$lib/platform/reducedMotion';

  let {
    onpick,
    oncustom,
  }: {
    onpick: (hex: string, paint: string) => void;
    oncustom: () => void;
  } = $props();
  const dark = $derived(resolvedTheme() === 'dark');
  const erasing = $derived(toolState.brush === 'eraser');
  const customRinged = $derived(
    !erasing && colorsState.activeSwatch === CUSTOM_SWATCH && colorsState.customColorSelected
  );
</script>

<!-- The sizing box is the container the trim ladder in the style block queries:
     it spans the room to the right of the Color Button, every swatch is in the
     DOM, and the ladder hides the ranks that do not fit — decided in the same
     layout pass that places the menu, so the set is right in its first frame. -->
<div class="color-menu-space">
  <div
    class="flyout-menu color-menu"
    aria-label="Colors"
    role="group"
    style:--selection-ring-gap-width={`${SELECTION_RING_GAP_PX}px`}
    use:stampMotionAtStart
  >
    {#each LANDSCAPE_COLORS as { hex, label } (hex)}
      {@const paint = themedSwatchColor(hex, dark)}
      {@const ringed = !erasing && colorsState.activeSwatch === hex}
      <button
        class="color-option"
        class:outlined={isDarkInk(paint)}
        class:active={ringed}
        style="background: {paint}; {ringed
          ? `box-shadow: ${selectionRingShadow(getRingColor(paint), 'var(--color-menu-surface)')};`
          : ''}"
        data-trim-rank={landscapeTrimRank(hex)}
        aria-label={paint === hex ? label : 'White'}
        aria-pressed={ringed}
        use:scribbleTap={() => onpick(hex, paint)}
      ></button>
    {/each}
    <button
      class="color-option more-colors"
      class:active={customRinged}
      aria-label="Custom Color"
      aria-pressed={customRinged}
      style={customRinged
        ? `box-shadow: ${selectionRingShadow(colorsState.customColor, 'var(--color-menu-surface)')};`
        : ''}
      use:scribbleTap={oncustom}
    >
      <Icon name="more-colors" />
    </button>
  </div>
</div>

<style>
  /* The room the flyout has: the viewport less the safe-area insets, the
     Color Button, the 8px the Actions Panel insets it by, the 8px gap to the
     pill and an 8px margin at the right edge. It carries
     app.css's phone-landscape flyout placement so the pill inside can sit at
     its origin and hug its swatches. */
  .color-menu-space {
    position: absolute;
    left: calc(100% + 8px);
    bottom: 0;
    width: calc(
      100vw - var(--safe-area-left) - var(--safe-area-right) - var(--action-btn-size) - 24px
    );
    container: color-menu / inline-size;
    /* Spans the canvas; only the pill inside may take a tap. */
    pointer-events: none;
  }
  .color-menu-space .color-menu {
    --swatch: 55px;
    --gap: 8px;
    --padding: 10px;
    --color-menu-surface: var(--float-surface);

    position: relative;
    left: auto;
    bottom: auto;
    width: fit-content;
    max-width: 100%;
    pointer-events: auto;
    padding: var(--padding);
    gap: var(--gap);
  }
  .color-option {
    width: var(--swatch);
    height: var(--swatch);
    flex: 0 0 auto;
    border: var(--selection-ring-gap-width) solid transparent;
    border-radius: var(--radius-pill);
    cursor: pointer;
    touch-action: manipulation;
  }
  .color-option.outlined {
    box-shadow: 0 0 0 2px var(--dark-ink-keyline);
  }
  .color-option.active {
    border-color: var(--color-menu-surface);
  }
  .more-colors {
    --pop-scale: 1.12;

    background: transparent;
    position: relative;
  }
  .more-colors :global(span) {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: calc(100% / var(--pop-scale));
    height: calc(100% / var(--pop-scale));
    pointer-events: none;
    transition: transform var(--duration-fast) ease-out;
  }
  .more-colors.active :global(span) {
    transform: translate(-50%, -50%) scale(var(--pop-scale));
  }
  :global(:root[data-reduce-motion]) .more-colors :global(span) {
    transition: none;
  }

  :global(html[data-toolbar='bare']) .color-menu-space .color-menu {
    --color-menu-surface: var(--paper);
  }

  /* Trim ladder, roomiest first (ADR-0048): just below the width that seats
     twelve slots — eleven colors and the custom swatch — the lowest-ranked
     color goes, and one more at each rung down to the custom swatch alone.
     Every swatch carries its data-trim-rank, its place in palette.ts's
     TRIM_ORDER; trimGeometry.test.ts holds these thresholds and ranks to
     colorMenuTrimSteps(). The row uses ColorPalette's portrait geometry. */
  @container color-menu (max-width: 767.98px) {
    .color-option[data-trim-rank='4'] {
      display: none;
    }
  }
  @container color-menu (max-width: 704.98px) {
    .color-option[data-trim-rank='5'] {
      display: none;
    }
  }
  @container color-menu (max-width: 641.98px) {
    .color-option[data-trim-rank='6'] {
      display: none;
    }
  }
  @container color-menu (max-width: 578.98px) {
    .color-option[data-trim-rank='7'] {
      display: none;
    }
  }
  @container color-menu (max-width: 515.98px) {
    .color-option[data-trim-rank='8'] {
      display: none;
    }
  }
  @container color-menu (max-width: 452.98px) {
    .color-option[data-trim-rank='9'] {
      display: none;
    }
  }
  @container color-menu (max-width: 389.98px) {
    .color-option[data-trim-rank='10'] {
      display: none;
    }
  }
  @container color-menu (max-width: 326.98px) {
    .color-option[data-trim-rank='11'] {
      display: none;
    }
  }
  @container color-menu (max-width: 263.98px) {
    .color-option[data-trim-rank='12'] {
      display: none;
    }
  }
  @container color-menu (max-width: 200.98px) {
    .color-option[data-trim-rank='13'] {
      display: none;
    }
  }
  @container color-menu (max-width: 137.98px) {
    .color-option[data-trim-rank='14'] {
      display: none;
    }
  }
</style>
