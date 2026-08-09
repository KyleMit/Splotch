<script lang="ts">
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
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

  const MODE_OPTIONS: SegmentedPickerOption<ParentalGateMode>[] = PARENTAL_GATE_MODES.map(
    (mode) => ({ value: mode, label: MODE_LABELS[mode] })
  );

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

  function optionsFor(feature: ParentalGateFeature): SegmentedPickerOption<ParentalGateMode>[] {
    return MODE_OPTIONS.map((option) => ({
      ...option,
      disabled: !isParentalGateModeAvailable(feature, option.value, platform),
    }));
  }
</script>

<section class="setting-group parent-center">
  <p class="parent-center-intro">
    Choose when Splotch should ask for a grown-up check. Each action includes a short explanation so
    you can see what the protection is for.
  </p>

  <div class="policy-list">
    {#each PARENTAL_GATE_FEATURES as featureId (featureId)}
      {@const feature = PROTECTED_FEATURES[featureId]}
      {@const helpId = `parental-gate-${featureId}-help`}
      {@const unavailableHelpId = isParentalGateModeAvailable(featureId, 'never', platform)
        ? undefined
        : `parental-gate-${featureId}-unavailable`}
      <article class="setting policy-card">
        <div class="protection-copy">
          <h3>{feature.label}</h3>
          <p id={helpId}>{feature.help}</p>
        </div>

        <SegmentedPicker
          label={`${feature.label} parental gate frequency`}
          describedBy={[helpId, unavailableHelpId].filter(Boolean).join(' ')}
          options={optionsFor(featureId)}
          selected={parentalGatePolicies[featureId]}
          onSelect={(mode) => setParentalGateMode(featureId, mode)}
        />

        {#if unavailableHelpId}
          <div id={unavailableHelpId} class="unavailable-explanation" role="note">
            <strong>Why Never is unavailable on iOS</strong>
            <span>
              Apple's Kids Category requires links that leave Splotch to stay behind a grown-up
              check. Choose Every time or Per session instead.
            </span>
          </div>
        {/if}
      </article>
    {/each}
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

  .policy-list {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--space-2);
  }

  .protection-copy h3,
  .protection-copy p {
    margin: 0;
  }

  .protection-copy {
    min-width: 0;
    margin-bottom: var(--space-3);
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

  .policy-card {
    min-width: 0;
  }

  .unavailable-explanation {
    margin-top: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
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
