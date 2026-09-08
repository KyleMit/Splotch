<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import Button from './design/Button.svelte';
  import { aiResult, closeAiResult, AI_FAILURE_RETRY_LIMIT } from '$lib/state/aiGeneration.svelte';
  import { retryAiImage } from '$lib/drawing/aiImage';

  let { children }: { children: Snippet } = $props();
  const repeatedFailure = $derived(aiResult.consecutiveFailures >= AI_FAILURE_RETRY_LIMIT);
</script>

<div class="ai-error-card">
  <div class="ai-error-glyph" aria-hidden="true">
    <Icon name={repeatedFailure ? 'dottie-stumped' : 'dottie-another-idea'} />
  </div>
  <h2>{repeatedFailure ? 'Still not working' : "Hmm, that didn't work"}</h2>
  <p class="ai-error-body">
    {repeatedFailure
      ? "The picture-maker needs a little rest. Let's keep drawing!"
      : "Let's give it one more go."}
  </p>
  <Button
    variant="brand"
    class="ai-error-primary"
    onclick={() => (repeatedFailure ? closeAiResult() : void retryAiImage())}
  >
    <Icon
      name={repeatedFailure ? 'brush-pen' : 'refresh'}
      class={repeatedFailure ? 'ai-error-pen' : 'ai-error-refresh'}
    />
    {repeatedFailure ? 'Keep drawing' : 'Try again'}
  </Button>
  {#if repeatedFailure}<p class="ai-error-note">Try the wand again in a few minutes.</p>{/if}
  {@render children()}
</div>

<style>
  .ai-error-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .ai-error-card p {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--text);
  }
  .ai-error-card :global(.ai-image-report) {
    margin-top: var(--space-4);
  }
  .ai-error-glyph {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    margin-bottom: var(--space-4);
  }

  .ai-error-glyph :global([data-icon]) {
    width: 100%;
    height: 100%;
  }

  .ai-error-card h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
    line-height: 1.2;
  }

  .ai-error-card p.ai-error-body {
    margin-top: var(--space-2);
    font-weight: var(--font-weight-medium);
    line-height: 1.35;
  }

  .ai-error-card :global(.ai-error-primary) {
    margin-top: var(--space-6);
    width: 100%;
    min-height: 56px;
    padding: 0 var(--space-6);
    border-radius: var(--radius-pill);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    gap: 10px;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 40%, transparent);
  }

  .ai-error-card :global(.ai-error-refresh) {
    width: 22px;
    height: 22px;
  }
  .ai-error-card :global(.ai-error-pen) {
    width: 24px;
    height: 24px;
  }
  .ai-error-card :global(.ai-error-refresh svg) {
    color: var(--on-brand);
    fill: none;
  }

  .ai-error-card p.ai-error-note {
    margin-top: var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
  }
</style>
