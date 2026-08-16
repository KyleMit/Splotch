<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<ol class="steps">
  {@render children()}
</ol>

<style>
  .steps {
    /* The wash reproduces the light sheet's hand-tuned tints. The ink keeps every
       crayon comfortably above WCAG AA on that wash in both themes. */
    --step-wash-strength: 9%;
    --step-ink-strength: 45%;

    /* Each rail segment bridges its step to the next numeral, so the gap and
       numeral geometry are named together rather than tuned independently. */
    --step-gap: 56px;
    --num-size: 32px;
    --num-gutter: 52px;
    --rail-width: 2px;
    --rail-inset: 8px;

    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--step-gap);
  }

  @media (max-width: 540px) {
    .steps {
      --step-gap: 42px;
      --num-size: 26px;
    }
  }
</style>
