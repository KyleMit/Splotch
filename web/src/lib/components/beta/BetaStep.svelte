<script module lang="ts">
  import { paletteHex, type PaletteLabel } from '$lib/palette';

  // The beta ledger is deliberately four steps long: the closed number prop
  // makes a fifth step a type error instead of resolving an undefined hue.
  // beta.spec.ts measures every derived ink/wash pair in both themes.
  const STEP_HUE_LABELS: PaletteLabel[] = ['Red', 'Orange', 'Green', 'Blue'];
  const STEP_HUES = STEP_HUE_LABELS.map(paletteHex);
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    number: 1 | 2 | 3 | 4;
    title: string;
    actionHref: string;
    actionLabel: string;
    cardLabel?: string;
    body: Snippet;
    cardBody?: Snippet;
    external?: boolean;
    optional?: boolean;
    showCard?: boolean;
  }

  let {
    number,
    title,
    actionHref,
    actionLabel,
    cardLabel,
    body,
    cardBody,
    external = true,
    optional = false,
    showCard = true,
  }: Props = $props();
</script>

<li class="beta-step step-{number}" style="--step-hue:{STEP_HUES[number - 1]}">
  <div class="head">
    <span class="num">{number}</span>
    <h3>{title}</h3>
    {#if optional}<span class="optional">Optional</span>{/if}
  </div>
  <p class="body">{@render body()}</p>
  <div class="action">
    <a
      class="btn"
      href={actionHref}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}>{actionLabel}</a
    >
  </div>
  {#if showCard && cardLabel && cardBody}
    <div class="card">
      <p class="card-label">{cardLabel}</p>
      <p class="card-body">{@render cardBody()}</p>
    </div>
  {/if}
</li>

<style>
  .beta-step {
    --step-wash: color-mix(in srgb, var(--step-hue) var(--step-wash-strength), var(--page-sheet));
    --step-ink: color-mix(in srgb, var(--step-hue) var(--step-ink-strength), var(--page-ink));

    position: relative;
    padding-left: var(--num-gutter);
  }

  .beta-step:not(:last-child)::before {
    /* Per-step segments avoid extending a rail past the final variable-height
       step while still reading as one continuous sequence. */
    content: '';
    position: absolute;
    left: calc((var(--num-size) - var(--rail-width)) / 2);
    top: calc(var(--num-size) + var(--rail-inset));
    bottom: calc(var(--rail-inset) - var(--step-gap));
    width: var(--rail-width);
    background: var(--page-rule);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-height: var(--num-size);
  }

  .num {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--num-size);
    width: var(--num-size);
    height: var(--num-size);
    border-radius: 50%;
    background: var(--step-wash);
    color: var(--step-ink);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    font-variant-numeric: tabular-nums;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    line-height: 1.25;
    color: var(--page-ink);
  }

  .optional {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  .body {
    margin: 14px 0 0;
    max-width: var(--page-measure);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    line-height: 1.65;
    color: var(--page-body);
    text-wrap: pretty;
  }

  .body :global(strong) {
    color: var(--page-ink);
  }

  .action {
    margin-top: 18px;
  }

  .btn {
    display: inline-block;
    padding: 15px 24px;
    border-radius: var(--radius-md);
    background: var(--page-accent);
    color: var(--page-on-accent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    text-decoration: none;
    transition:
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .card {
    max-width: var(--page-measure);
    margin-top: 22px;
    padding: 14px 18px;
    border-left: 3px solid var(--step-hue);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    background: var(--step-wash);
  }

  .card-label {
    margin: 0 0 4px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--step-ink);
  }

  .card-body {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
    color: var(--page-body);
  }

  .card-body :global(strong) {
    color: var(--page-ink);
  }

  .body :global(a),
  .card-body :global(a) {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Touch browsers can retain :hover after a tap, so hover-only changes stay
     behind a capability query instead of becoming sticky touch states. */
  @media (hover: hover) {
    .btn:hover {
      background: var(--page-accent-hover);
    }

    .body :global(a:hover),
    .card-body :global(a:hover) {
      text-decoration-thickness: 2px;
    }
  }

  @media (max-width: 540px) {
    .beta-step {
      padding-left: 0;
    }

    .beta-step:not(:last-child)::before {
      content: none;
    }

    .num {
      position: static;
      font-size: var(--font-size-xs);
    }

    h3 {
      font-size: var(--font-size-lg);
    }

    .btn {
      display: block;
      min-height: 48px;
      text-align: center;
    }
  }
</style>
