<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { LANDSCAPE_COLORS, landscapeTrimRank } from '$lib/landscapeToolbar';
  import { colorsState, isDarkInk, themedSwatchColor } from '$lib/state/colors.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { toolState } from '$lib/state/tool.svelte';

  let {
    onpick,
    oncustom,
  }: {
    onpick: (hex: string, paint: string) => void;
    oncustom: () => void;
  } = $props();
  const dark = $derived(resolvedTheme() === 'dark');
</script>

<!-- The sizing box is the container the trim ladder in the style block queries:
     it spans the room to the right of the Color Button, every swatch is in the
     DOM, and the ladder hides the ranks that do not fit — decided in the same
     layout pass that places the menu, so the set is right in its first frame. -->
<div class="color-menu-space">
  <div class="flyout-menu color-menu" aria-label="Colors" role="group">
    {#each LANDSCAPE_COLORS as { hex, label } (hex)}
      {@const paint = themedSwatchColor(hex, dark)}
      <button
        class="color-option"
        class:outlined={isDarkInk(paint)}
        style:background={paint}
        data-trim-rank={landscapeTrimRank(hex)}
        aria-label={paint === hex ? label : 'White'}
        aria-pressed={toolState.brush !== 'eraser' && colorsState.activeSwatch === hex}
        use:scribbleTap={() => onpick(hex, paint)}
      ></button>
    {/each}
    <button class="color-option more-colors" aria-label="Custom Color" use:scribbleTap={oncustom}>
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
    --swatch: 56px;
    --gap: 6px;
    --padding: 6px;

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
    border: 0;
    border-radius: var(--radius-pill);
    cursor: pointer;
    touch-action: manipulation;
  }
  .color-option.outlined {
    box-shadow: 0 0 0 2px var(--dark-ink-keyline);
  }
  .color-option[aria-pressed='true'] {
    outline: 3px solid var(--text-strong);
    outline-offset: 3px;
  }
  .more-colors {
    background: transparent;
    display: grid;
    place-items: center;
  }
  .more-colors :global(span) {
    width: var(--swatch);
    height: var(--swatch);
  }

  /* Trim ladder, roomiest first (ADR-0048): just below the width that seats
     twelve slots — eleven colors and the custom swatch — the lowest-ranked
     color goes, and one more at each rung down to the custom swatch alone.
     Every swatch carries its data-trim-rank, its place in palette.ts's
     TRIM_ORDER; trimGeometry.test.ts holds these thresholds and ranks to
     colorMenuTrimSteps(). */
  @container color-menu (max-width: 749.98px) {
    .color-option[data-trim-rank='4'] {
      display: none;
    }
  }
  @container color-menu (max-width: 687.98px) {
    .color-option[data-trim-rank='5'] {
      display: none;
    }
  }
  @container color-menu (max-width: 625.98px) {
    .color-option[data-trim-rank='6'] {
      display: none;
    }
  }
  @container color-menu (max-width: 563.98px) {
    .color-option[data-trim-rank='7'] {
      display: none;
    }
  }
  @container color-menu (max-width: 501.98px) {
    .color-option[data-trim-rank='8'] {
      display: none;
    }
  }
  @container color-menu (max-width: 439.98px) {
    .color-option[data-trim-rank='9'] {
      display: none;
    }
  }
  @container color-menu (max-width: 377.98px) {
    .color-option[data-trim-rank='10'] {
      display: none;
    }
  }
  @container color-menu (max-width: 315.98px) {
    .color-option[data-trim-rank='11'] {
      display: none;
    }
  }
  @container color-menu (max-width: 253.98px) {
    .color-option[data-trim-rank='12'] {
      display: none;
    }
  }
  @container color-menu (max-width: 191.98px) {
    .color-option[data-trim-rank='13'] {
      display: none;
    }
  }
  @container color-menu (max-width: 129.98px) {
    .color-option[data-trim-rank='14'] {
      display: none;
    }
  }
</style>
