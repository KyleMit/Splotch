<script lang="ts">
  import Icon from '../Icon.svelte';
  import '$lib/components/deferredIcons';

  // The "Back to drawing" link every standalone page and /design open with.
  // A 44px target: only the inline text was the anchor (22.7px, under WCAG
  // 2.5.8's 24px), so the box grows to the floor and the negative block margin
  // hands the growth back to the bar it sits in. Never wraps: the mark beside
  // it shrinks first, because a two-line back link reads as a layout fault.
  let { class: className = '' }: { class?: string } = $props();
</script>

<!-- An icon, not a "←" glyph: the Quicksand subsets cover ↑ and ↓ but not
     U+2190, which fell to the OS font at its own weight. -->
<a class={['back', className]} href="/">
  <Icon name="chevron-left" class="back-icon" aria-hidden="true" />
  Back to drawing
</a>

<style>
  .back {
    flex-shrink: 0;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    margin-block: -11px;
    color: var(--page-link, var(--brand-text));
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    text-decoration: none;
  }

  /* The glyph's own side bearing would float it off the sheet edge the text
     sits on, so the negative margin pulls it back into the text column. */
  .back :global(.back-icon) {
    width: 18px;
    height: 18px;
    margin-left: -5px;
  }

  .back :global(.back-icon svg) {
    fill: currentColor;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .back:hover {
      text-decoration: underline;
    }
  }
</style>
