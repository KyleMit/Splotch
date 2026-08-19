<script lang="ts">
  import Icon from '../Icon.svelte';
  import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { freeGenerations } from '$lib/state/freeGenerations.svelte';
  import { aiCredentialKind } from '$lib/state/settings.svelte';

  const STEPS = [
    {
      number: 1,
      caption: 'They draw',
      alt: "A child's colorful crayon drawing of a smiling person",
    },
    {
      number: 2,
      caption: 'One magic tap',
      alt: 'The same drawing with the AI picture button glowing over it',
    },
    {
      number: 3,
      caption: 'Ta-da!',
      alt: 'The drawing transformed into a colorful storybook character',
    },
  ] as const;

  const theme = $derived(resolvedTheme());
  const credentialKind = $derived(aiCredentialKind());
</script>

<section class="ai-value-prop" aria-labelledby="ai-value-prop-title">
  <h3 id="ai-value-prop-title">What turning this on does</h3>
  <p class="ai-value-prop-body">
    One tap on a finished drawing, and it comes back as a storybook picture — same colors, same
    character, same big smile.
  </p>

  <ol class="ai-value-prop-steps">
    {#each STEPS as step (step.number)}
      <li>
        <div class="ai-value-prop-image-wrap">
          <img
            src={`/ai-value-prop/step-${step.number}.${theme}.webp`}
            alt={step.alt}
            width="556"
            height="426"
            loading="lazy"
            decoding="async"
          />
          <span class="ai-value-prop-badge" aria-hidden="true">{step.number}</span>
        </div>
        <span class="ai-value-prop-caption">{step.caption}</span>
      </li>
    {/each}
  </ol>

  <ul class="ai-value-prop-claims">
    <li>
      <Icon name="check" class="ai-value-prop-claim-icon" />
      <span>
        {#if credentialKind === 'accessCode'}
          Your access code is saved — turn this on whenever you're ready.
        {:else if credentialKind === 'apiKey'}
          Your OpenAI key is saved and ready whenever you turn this on.
        {:else if freeGenerations.available && freeGenerations.remaining === 0}
          Your {FREE_GENERATION_LIMIT} free pictures are used up.
        {:else if freeGenerations.available && freeGenerations.remaining < FREE_GENERATION_LIMIT}
          You have {freeGenerations.remaining} free pictures left — nothing to set up, no card.
        {:else}
          The first {FREE_GENERATION_LIMIT} pictures are free — nothing to set up, no card.
        {/if}
      </span>
    </li>
    <li>
      <Icon name="lock" class="ai-value-prop-claim-icon" />
      <span>
        {#if credentialKind === 'accessCode'}
          AI art is on us with your access code — no OpenAI key needed.
        {:else if credentialKind === 'apiKey'}
          Your key stays saved on this device only.
        {:else}
          After that, use your own OpenAI key — saved on this device only.
        {/if}
      </span>
    </li>
  </ul>
</section>

<style>
  .ai-value-prop {
    padding: var(--space-4);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .ai-value-prop h3 {
    margin: 0 0 var(--space-2);
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    text-wrap: pretty;
  }

  .ai-value-prop-body {
    margin: 0;
    color: var(--text);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .ai-value-prop-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    list-style: none;
    margin: var(--space-4) 0;
    padding: 0;
  }

  .ai-value-prop-steps li {
    min-width: 0;
    text-align: center;
  }

  .ai-value-prop-image-wrap {
    position: relative;
    overflow: hidden;
    aspect-ratio: 278 / 213;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--paper);
  }

  .ai-value-prop-image-wrap img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .ai-value-prop-badge {
    position: absolute;
    top: 6px;
    left: 6px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-pill);
    background: var(--brand-solid);
    color: var(--on-brand);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    line-height: 1;
  }

  .ai-value-prop-caption {
    display: block;
    margin-top: var(--space-1);
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    line-height: 1.25;
  }

  .ai-value-prop-claims {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .ai-value-prop-claims li {
    display: grid;
    grid-template-columns: 16px 1fr;
    align-items: start;
    gap: var(--space-2);
    color: var(--text);
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  :global(.ai-value-prop-claim-icon) {
    width: 14px;
    height: 14px;
    margin-top: 3px;
    color: var(--success-text);
  }

  :global(.ai-value-prop-claim-icon svg) {
    fill: currentColor;
  }

  @media (max-width: 480px) {
    .ai-value-prop-steps {
      gap: var(--space-2);
    }

    .ai-value-prop-badge {
      top: var(--space-1);
      left: var(--space-1);
      width: 18px;
      height: 18px;
    }

    .ai-value-prop-caption {
      font-size: var(--font-size-xs);
    }
  }
</style>
