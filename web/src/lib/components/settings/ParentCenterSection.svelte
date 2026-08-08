<script lang="ts">
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import {
    parentalGatePolicies,
    PARENTAL_GATE_FEATURES,
    PARENTAL_GATE_MODES_BY_FEATURE,
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
    externalLinks: {
      label: 'Viewing external links',
      help: 'Before a link opens another website or app. This check cannot be turned off.',
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
</script>

<section class="setting-group parent-center">
  <p class="parent-center-intro">
    Parental gates keep actions that can leave Splotch or share information behind a quick grown-up
    check. Choose how often the math problem appears for each action.
  </p>

  <div class="protection-list">
    {#each PARENTAL_GATE_FEATURES as featureId (featureId)}
      {@const feature = PROTECTED_FEATURES[featureId]}
      {@const helpId = `parental-gate-${featureId}-help`}
      <div class="setting protection-setting">
        <div class="protection-copy">
          <h3>{feature.label}</h3>
          <p id={helpId}>{feature.help}</p>
        </div>
        <SegmentedPicker
          label={`${feature.label} parental gate frequency`}
          describedBy={helpId}
          options={PARENTAL_GATE_MODES_BY_FEATURE[featureId].map(
            (value): SegmentedPickerOption<ParentalGateMode> => ({
              value,
              label: MODE_LABELS[value],
            })
          )}
          selected={parentalGatePolicies[featureId]}
          onSelect={(mode) => setParentalGateMode(featureId, mode)}
        />
      </div>
    {/each}
  </div>

  <p class="mode-note">
    Per session asks once until Splotch is closed. Never skips the check on this device, except for
    external links.
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

  .protection-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .protection-setting {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .protection-copy h3,
  .protection-copy p {
    margin: 0;
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

  .mode-note {
    margin-top: var(--space-4);
  }
</style>
