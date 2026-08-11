<!--
  The Grown-Ups Only challenge's footer: says where the frequency of these checks
  is set, and goes there. Both named places lead to the same one tap, so the whole
  line is a single target rather than two controls with one destination. The icons
  are the Settings Button's cog and the section's own row icon, so the words point
  at something the parent can recognize on arrival.

  Its own component only because ParentalGate.svelte is at its line ceiling; it has
  no other call site.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { redirectGateToParentCenter } from '$lib/state/parentalGate.svelte';
</script>

<button class="gate-manage" onclick={redirectGateToParentCenter}>
  <span>Manage these checks in</span>
  <span class="gate-manage-path">
    <span class="gate-manage-place">
      <Icon name="settings" class="gate-manage-icon" aria-hidden="true" />
      <span>Settings</span>
    </span>
    <span aria-hidden="true">›</span>
    <span class="gate-manage-place">
      <Icon name="parent-center" class="gate-manage-icon" aria-hidden="true" />
      <span>Parent Center</span>
    </span>
  </span>
</button>

<style>
  .gate-manage {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    width: 100%;
    margin-top: var(--space-4);
    padding: var(--space-3) 0 0;
    border: none;
    border-top: var(--border-width) solid var(--border);
    background: none;
    font-family: inherit;
    font-size: var(--font-size-xs);
    line-height: 1.4;
    color: var(--text-soft);
    text-align: center;
    cursor: pointer;
    touch-action: manipulation;
    transition: color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .gate-manage:hover,
    .gate-manage:hover .gate-manage-place {
      color: var(--brand-text);
    }
  }

  .gate-manage:active {
    transform: scale(0.98);
  }

  /* The path is one unit: on a narrow card the line breaks before it rather than
     inside it, which would strand the separator at the end of a line. */
  .gate-manage-path {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    white-space: nowrap;
  }

  /* Each destination keeps its icon glued to its own name, so nothing can break
     between an icon and the word it marks. */
  .gate-manage-place {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }

  :global(.gate-manage-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Tints the monochrome cog with the line's own ink; the full-color Parent
     Center mark carries fills on its own paths and is untouched by this. */
  :global(.gate-manage-icon svg) {
    fill: currentColor;
  }

  /* Steps with the card it sits in — the gate's tablet-class floor, pinned
     against it by dialogTabletScaling.test.ts. It takes no second step: fine
     print stays fine print, and the gate's large-tablet step moves the card and
     its spacing rather than this line. */
  @media (min-width: 600px) and (min-height: 600px) {
    .gate-manage {
      font-size: var(--font-size-sm);
    }

    :global(.gate-manage-icon) {
      width: 18px;
      height: 18px;
    }
  }
</style>
