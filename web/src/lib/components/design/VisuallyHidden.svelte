<script lang="ts">
  import type { Snippet } from 'svelte';

  // Text a screen reader announces but the eye never sees: the word an icon
  // stands in for, what a badge means, a role="status" announcement, or the
  // label of a field whose design shows only a placeholder. A component rather
  // than an app.css class, so the rule rides in the lazy chunks that use it
  // instead of the render-blocking startup stylesheet. It is out of flow, so a
  // label beside its field adds no flex or grid gap.
  type Props = { children: Snippet } & (
    { as?: 'span' | 'p'; role?: 'status'; for?: never } | { as: 'label'; for: string; role?: never }
  );

  let { children, as = 'span', role, for: labelFor }: Props = $props();
</script>

<svelte:element this={as} class="visually-hidden" {role} for={labelFor}
  >{@render children()}</svelte:element
>

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
