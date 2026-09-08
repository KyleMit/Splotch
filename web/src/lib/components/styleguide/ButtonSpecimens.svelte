<script lang="ts">
  import { primitiveSections } from './primitiveSections';
  import { onMount } from 'svelte';
  import Button from '$lib/components/design/Button.svelte';

  const BUTTON_VARIANTS = ['brand', 'wash', 'outline', 'danger'] as const;
  const BUTTON_STATES = ['Default', 'Hover', 'Pressed', 'Disabled'] as const;
  const BUSY_DURATION_MS = 10_000;
  const BUSY_VISIBILITY_FRACTION = 0.6;
  const sizes = [
    { size: 'lg', dimensions: '16px label, 14px vertical padding', use: 'a screen’s one decision' },
    { size: 'md', dimensions: '14px label, 12px vertical padding', use: 'the default' },
    { size: 'sm', dimensions: '14px label, 8px vertical padding', use: 'inline retry, dense rows' },
  ] as const;

  let busy = $state(false);
  // Intentionally untracked: mount-only observer target and timeout cancellation handle.
  let busyCard: HTMLDivElement;
  let busyTimer: ReturnType<typeof setTimeout> | undefined;

  function playBusy() {
    if (busy) return;
    busy = true;
    busyTimer = setTimeout(() => {
      busy = false;
    }, BUSY_DURATION_MS);
  }

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.intersectionRatio >= BUSY_VISIBILITY_FRACTION)) return;
        observer.disconnect();
        playBusy();
      },
      { threshold: BUSY_VISIBILITY_FRACTION }
    );
    observer.observe(busyCard);
    return () => {
      observer.disconnect();
      clearTimeout(busyTimer);
    };
  });
</script>

<div class="button-specimens">
  <h3 id={primitiveSections.button.id} data-sg-section>
    Button <code class="file-path">design/Button.svelte</code>
  </h3>
  <p class="intro">
    Four variants, one set of states. <code>brand</code> is the primary action;
    <code>wash</code> is secondary or selected; <code>outline</code> is the quiet secondary for
    dense rows and toolbars; <code>danger</code> confirms something destructive. Disabled drops
    every variant to the same neutral treatment (<code>--control-track</code> fill,
    <code>--text-soft</code>
    label at 0.7 opacity; outline keeps a <code>--border</code> hairline instead), so a parked
    button cannot be mistaken for a live one on either paper. Busy is the <code>busy</code> prop: it
    implies
    <code>disabled</code>, sets <code>aria-busy</code>, keeps the variant’s fill, and adds a 14px
    ring in <code>currentColor</code> before the label. The call site supplies the present-tense verb.
    The specimen below plays once as it comes into view; tap it to replay.
  </p>

  <div class="cards">
    <div class="card states" role="group" aria-label="Button states">
      <span class="card-label">States</span>
      {#each BUTTON_STATES as state (state)}
        <span class="caption">{state}</span>
      {/each}
      {#each BUTTON_VARIANTS as variant (variant)}
        <span class="variant-label">{variant}</span>
        {#each BUTTON_STATES as state (state)}
          {@const preview = state === 'Hover' || state === 'Pressed'}
          <Button
            {variant}
            class={{ 'preview-hover': state === 'Hover', 'preview-pressed': state === 'Pressed' }}
            tabindex={preview ? -1 : undefined}
            aria-hidden={preview || undefined}
            inert={preview}
            disabled={state === 'Disabled'}>{variant}</Button
          >
        {/each}
      {/each}
    </div>

    <div class="card sizes" role="group" aria-label="Button sizes">
      <span class="card-label">Sizes</span>
      {#each sizes as specimen (specimen.size)}
        <code>{specimen.size}</code>
        <Button variant="brand" size={specimen.size}>Send report</Button>
        <span class="note">{specimen.dimensions} <span>· {specimen.use}</span></span>
      {/each}
    </div>

    <div class="card busy" role="group" aria-label="Busy button" bind:this={busyCard}>
      <span class="card-label">Busy</span>
      <Button variant="brand" {busy} onclick={playBusy}>{busy ? 'Sending…' : 'Send report'}</Button>
      <span class="note"
        >{busy
          ? 'Sending… for 10 seconds, then the button hands itself back.'
          : 'Tap to replay the busy state.'}</span
      >
    </div>
  </div>
</div>

<style>
  h3 {
    margin: 22px 0 var(--space-1);
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    overflow-wrap: anywhere;
  }

  .file-path {
    font-weight: 400;
  }

  .intro {
    max-width: 62ch;
    margin: 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .cards {
    display: grid;
    gap: 14px;
  }

  .card {
    display: grid;
    align-items: center;
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px var(--space-4) var(--space-4);
  }

  .states {
    grid-template-columns: 64px repeat(4, minmax(0, 1fr));
    gap: 10px var(--space-2);
  }

  .card-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-soft);
  }

  .caption {
    /* Compact matrix headings are smaller than the control labels they caption. */
    font-size: 11px;
    color: var(--text-soft);
    text-align: center;
  }

  .variant-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
  }

  .states :global(.preview-hover.brand) {
    background: var(--brand-solid-hover);
  }
  .states :global(.preview-hover.wash) {
    background: var(--brand-wash-hover);
  }
  .states :global(.preview-hover.outline) {
    background: var(--brand-wash);
  }
  .states :global(.preview-hover.danger) {
    background: var(--danger-text);
    color: var(--danger-wash);
  }
  .states :global(.preview-pressed) {
    transform: scale(0.96);
  }

  .states :global(.btn) {
    white-space: nowrap;
  }

  .sizes {
    grid-template-columns: 64px 40px auto minmax(0, 1fr);
    gap: var(--space-3);
  }
  .sizes .card-label {
    grid-row: span 3;
  }
  .sizes :global(.btn) {
    justify-self: start;
  }

  .note {
    font-size: var(--font-size-xs);
    color: var(--text);
  }
  .note span {
    color: var(--text-soft);
  }

  .busy {
    grid-template-columns: 64px auto minmax(0, 1fr);
    gap: var(--space-3);
  }

  @media (max-width: 600px) {
    .states {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .states .card-label,
    .variant-label {
      grid-column: 1 / -1;
    }
    .states :global(.btn.md) {
      padding-inline: 0;
    }
    .sizes {
      grid-template-columns: 40px minmax(0, 1fr);
    }
    .sizes .card-label {
      grid-column: 1 / -1;
      grid-row: auto;
    }
    .sizes .note {
      grid-column: 2;
    }
    .busy {
      grid-template-columns: 40px auto;
    }
    .busy .note {
      grid-column: 1 / -1;
    }
    .busy :global(.btn) {
      justify-self: start;
    }
  }
</style>
