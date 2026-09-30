<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import Icon from '../Icon.svelte';
  import '$lib/components/deferredIcons';
  import { DRAWING_ROUTE } from '$lib/boot/appSurfaceRoute';
  import { COLD_VISIT_LABEL, readDrawingVisitedFlag, resolveBackLabel } from './backLabel';

  // The way to the canvas every standalone page and /design open with. A 44px
  // target that the negative block margin hands back to the bar it sits in, so
  // the bar keeps its height. Never wraps: the mark beside it shrinks first,
  // because a two-line back link reads as a layout fault.
  //
  // The label fits how the visitor arrived (backLabel.ts). The server renders
  // the cold-visit label; afterNavigate runs once this link mounts, so a
  // client navigation from the canvas swaps it before the first paint and only
  // a full page load can show the swap.
  let { class: className = '' }: { class?: string } = $props();
  let label = $state(COLD_VISIT_LABEL);

  afterNavigate(({ from }) => {
    label = resolveBackLabel({
      fromPath: from?.url.pathname ?? null,
      sessionFlag: readDrawingVisitedFlag(() => sessionStorage),
      referrer: document.referrer,
      origin: location.origin,
    });
  });
</script>

<!-- An icon, not a "←" glyph: the Quicksand subsets cover ↑ and ↓ but not
     U+2190, which fell to the OS font at its own weight. -->
<a class={['back', className]} href={DRAWING_ROUTE}>
  <span class="back-blob" aria-hidden="true">
    <Icon name="chevron-left" class="back-icon" />
  </span>
  {label}
</a>

<style>
  .back {
    flex-shrink: 0;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    margin-block: -11px;
    color: var(--page-link, var(--brand-text));
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    text-decoration: none;
  }

  /* The paint blob the swatches and the parental gate's operands are made of,
     sized to the 44px target floor so the visual fills the whole target. */
  .back-blob {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-blob);
    background-color: var(--brand-solid);
    box-shadow: 0 3px 8px color-mix(in srgb, var(--brand-solid) 35%, transparent);
    transition:
      background-color var(--duration-fast) ease,
      transform var(--duration-base) var(--ease-pop);
  }

  .back-blob :global(.back-icon) {
    width: 24px;
    height: 24px;
  }

  .back-blob :global(.back-icon svg) {
    fill: var(--on-brand);
  }

  .back:active .back-blob {
    transform: scale(0.94);
  }

  :global(:root[data-reduce-motion]) .back-blob {
    transition: none;
  }

  :global(:root[data-reduce-motion]) .back:active .back-blob {
    transform: none;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .back:hover {
      text-decoration: underline;
    }

    .back:hover .back-blob {
      background-color: var(--brand-solid-hover);
    }
  }

  /* SHORT_PAGE_HEIGHT_PX: PageShell's topbar padding drops to 10px, so the
     margin follows it and the blob stays inside the bar. */
  @media (max-height: 500px) {
    .back {
      margin-block: -10px;
    }
  }
</style>
