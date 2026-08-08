<script lang="ts">
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import {
    parentalGatePolicies,
    setParentalGateMode,
    type ParentalGateFeature,
    type ParentalGateMode,
  } from '$lib/state/parentalGate.svelte';

  const MODE_OPTIONS: SegmentedPickerOption<ParentalGateMode>[] = [
    { value: 'always', label: 'Every time' },
    { value: 'session', label: 'Per session' },
    { value: 'never', label: 'Never' },
  ];

  const PROTECTED_FEATURES = [
    {
      id: 'aiImage',
      label: 'Generating an AI image',
      help: 'Before a drawing is sent to Google for image generation.',
    },
    {
      id: 'externalLinks',
      label: 'Viewing external links',
      help: 'Before a link opens another website or app.',
    },
    {
      id: 'feedback',
      label: 'Sending feedback',
      help: "Before a report is sent to Splotch's issue tracker.",
    },
    {
      id: 'parentCenter',
      label: 'Opening Parent Center',
      help: 'Before anyone can change these protections.',
    },
  ] as const satisfies readonly {
    id: ParentalGateFeature;
    label: string;
    help: string;
  }[];
</script>

<section class="setting-group parent-center">
  <p class="parent-center-intro">
    Parental gates keep actions that can leave Splotch or share information behind a quick grown-up
    check. Choose how often the math problem appears for each action.
  </p>

  <div class="protection-list">
    {#each PROTECTED_FEATURES as feature (feature.id)}
      {@const helpId = `parental-gate-${feature.id}-help`}
      <div class="setting protection-setting">
        <div class="protection-copy">
          <h3>{feature.label}</h3>
          <p id={helpId}>{feature.help}</p>
        </div>
        <SegmentedPicker
          label={`${feature.label} parental gate frequency`}
          describedBy={helpId}
          options={MODE_OPTIONS}
          selected={parentalGatePolicies[feature.id]}
          onSelect={(mode) => setParentalGateMode(feature.id, mode)}
        />
      </div>
    {/each}
  </div>

  <p class="mode-note">
    Per session asks once until Splotch is closed. Never skips the check on this device.
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
