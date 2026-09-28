<script lang="ts">
  import type { Snippet } from 'svelte';

  // Text a screen reader announces but the eye never sees: the word an icon
  // stands in for, what a badge means, or a role="status" announcement. A
  // component rather than an app.css class, so the rule rides in the lazy
  // chunks that use it instead of the render-blocking startup stylesheet.
  interface Props {
    children: Snippet;
    as?: 'span' | 'p';
    role?: 'status';
  }

  let { children, as = 'span', role }: Props = $props();
</script>

<svelte:element this={as} class="visually-hidden" {role}>{@render children()}</svelte:element>

<style>
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
