<script lang="ts">
  import { getPlatform } from '$lib/platform';
  import {
    isParentalGateModeAvailable,
    parentalGatePolicies,
    PARENTAL_GATE_FEATURES,
    PARENTAL_GATE_MODES,
    setParentalGateMode,
    type ParentalGateFeature,
    type ParentalGateMode,
  } from '$lib/state/parentalGate.svelte';

  const MODE_LABELS: Record<ParentalGateMode, string> = {
    always: 'Every time',
    session: 'Per session',
    never: 'Never',
  };

  const PROTECTED_FEATURES: Record<ParentalGateFeature, { label: string; help: string }> = {
    aiImage: {
      label: 'Generating an AI image',
      help: 'Before a drawing is sent to Google for image generation.',
    },
    imageReport: {
      label: 'Reporting an AI picture',
      help: 'Before a drawing and generated picture are sent to Splotch for review.',
    },
    externalLinks: {
      label: 'Viewing external links',
      help: 'Before a link opens another website or app.',
    },
    feedback: {
      label: 'Sending feedback',
      help: "Before a report is sent to Splotch's issue tracker.",
    },
    parentCenter: {
      label: 'Opening Parent Center',
      help: 'Before anyone can change these protections.',
    },
  };

  const platform = getPlatform();
  let externalLinksExplanationOpen = $state(false);

  function chooseMode(feature: ParentalGateFeature, mode: ParentalGateMode) {
    if (!isParentalGateModeAvailable(feature, mode, platform)) {
      externalLinksExplanationOpen = !externalLinksExplanationOpen;
      return;
    }
    if (feature === 'externalLinks') externalLinksExplanationOpen = false;
    setParentalGateMode(feature, mode);
  }
</script>

<section class="setting-group parent-center">
  <p class="parent-center-intro">
    Choose when Splotch should ask for a grown-up check. Each action includes a short explanation so
    you can see what the protection is for.
  </p>

  <div class="policy-table-scroll">
    <div class="policy-table">
      <div class="policy-header" aria-hidden="true">
        <span>Action</span>
        {#each PARENTAL_GATE_MODES as mode (mode)}
          <span>{MODE_LABELS[mode]}</span>
        {/each}
      </div>

      {#each PARENTAL_GATE_FEATURES as featureId (featureId)}
        {@const feature = PROTECTED_FEATURES[featureId]}
        {@const helpId = `parental-gate-${featureId}-help`}
        <div
          class="policy-row"
          role="radiogroup"
          aria-label={`${feature.label} parental gate frequency`}
          aria-describedby={helpId}
        >
          <div class="protection-copy">
            <h3>{feature.label}</h3>
            <p id={helpId}>{feature.help}</p>
          </div>

          {#each PARENTAL_GATE_MODES as mode (mode)}
            {@const available = isParentalGateModeAvailable(featureId, mode, platform)}
            {@const selected = parentalGatePolicies[featureId] === mode}
            <button
              type="button"
              class="mode-button"
              class:selected
              class:unavailable={!available}
              role={available ? 'radio' : undefined}
              aria-checked={available ? selected : undefined}
              aria-disabled={!available || undefined}
              aria-expanded={!available ? externalLinksExplanationOpen : undefined}
              aria-controls={!available ? 'external-links-never-explanation' : undefined}
              aria-label={`${feature.label}: ${MODE_LABELS[mode]}${
                available ? '' : ', unavailable on iOS. Show why'
              }`}
              onclick={() => chooseMode(featureId, mode)}
            >
              <span class="radio-mark" aria-hidden="true"></span>
              {#if !available}<span class="unavailable-mark" aria-hidden="true">*</span>{/if}
            </button>
          {/each}

          {#if featureId === 'externalLinks'}
            <div
              id="external-links-never-explanation"
              class="unavailable-explanation"
              hidden={!externalLinksExplanationOpen}
              role="note"
            >
              <strong>Why Never is unavailable on iOS</strong>
              <span>
                Apple's Kids Category requires links that leave Splotch to stay behind a grown-up
                check. Choose Every time or Per session instead.
              </span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <p class="mode-note">
    <strong>Per session</strong> asks once until Splotch is closed. <strong>Never</strong> skips the grown-up
    check on this device where available.
  </p>
</section>

<style>
  .parent-center-intro,
  .mode-note {
    margin: 0;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .parent-center-intro {
    margin-bottom: var(--space-4);
  }

  .policy-table-scroll {
    max-width: 100%;
    overflow-x: auto;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
  }

  .policy-table {
    min-width: 340px;
    background: var(--surface);
  }

  .policy-header,
  .policy-row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) repeat(3, minmax(56px, 0.32fr));
  }

  .policy-header {
    min-height: 52px;
    align-items: end;
    background: var(--surface-2);
    color: var(--text-soft);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .policy-header span {
    padding: var(--space-3) var(--space-2);
    text-align: center;
  }

  .policy-header span:first-child {
    padding-left: var(--space-4);
    text-align: left;
  }

  .policy-row {
    border-top: var(--border-width) solid var(--border);
  }

  .protection-copy h3,
  .protection-copy p {
    margin: 0;
  }

  .protection-copy {
    align-self: stretch;
    padding: var(--space-5) var(--space-4);
  }

  .protection-copy h3 {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  .protection-copy p {
    margin-top: var(--space-1);
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }

  .mode-button {
    position: relative;
    display: flex;
    min-width: 44px;
    min-height: 64px;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    border: 0;
    border-left: var(--border-width) solid var(--border);
    background: transparent;
    color: var(--text-strong);
    cursor: pointer;
    touch-action: manipulation;
  }

  .radio-mark {
    width: 24px;
    height: 24px;
    box-sizing: border-box;
    border: 3px solid var(--border-warm-strong);
    border-radius: var(--radius-pill);
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .mode-button.selected .radio-mark {
    border-color: var(--text-strong);
    box-shadow: inset 0 0 0 5px var(--surface);
    background: var(--text-strong);
  }

  @media (hover: hover) {
    .mode-button:hover {
      background: var(--surface-hover);
    }
  }

  .mode-button:focus-visible {
    outline: 3px solid var(--brand);
    outline-offset: -3px;
  }

  .mode-button.unavailable {
    background: var(--surface-2);
    color: var(--text-soft);
    cursor: help;
  }

  .mode-button.unavailable .radio-mark {
    border-color: var(--border);
    opacity: 0.55;
  }

  .unavailable-mark {
    margin-left: 2px;
    margin-top: -18px;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .unavailable-explanation {
    grid-column: 1 / -1;
    padding: var(--space-4);
    border-top: var(--border-width) solid var(--border);
    background: var(--brand-wash);
    color: var(--text);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .unavailable-explanation strong,
  .unavailable-explanation span {
    display: block;
  }

  .unavailable-explanation strong {
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  .mode-note {
    margin-top: var(--space-4);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  .mode-note strong {
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }
</style>
