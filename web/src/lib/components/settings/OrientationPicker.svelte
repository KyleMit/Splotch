<script lang="ts">
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import {
    orientationChoice,
    setOrientationChoice,
    type OrientationChoice,
  } from '$lib/state/settings.svelte';
  import '$lib/components/deferredIcons';

  const options: SegmentedPickerOption<OrientationChoice>[] = [
    {
      value: 'portrait',
      label: 'Portrait',
      icon: 'mobile-portrait',
      id: 'orientationOption-portrait',
    },
    {
      value: 'landscape',
      label: 'Landscape',
      icon: 'mobile-landscape',
      id: 'orientationOption-landscape',
    },
    { value: 'auto', label: 'Auto', icon: 'mobile-rotate', id: 'orientationOption-auto' },
  ];

  const selected = $derived(orientationChoice());
</script>

<!-- One picker for both settings shells, so each shell sets the lock the same
     way. The container is this wrapper, not the track, because a container
     query styles only the container's descendants. -->
<div class="orientation-picker">
  <SegmentedPicker
    label="Orientation"
    class="orientation-track"
    {options}
    {selected}
    onSelect={setOrientationChoice}
  />
</div>

<style>
  /* Inline-size containment takes away the wrapper's content width, so it
     grows to fill its row instead: the compact shell's cell is a flex row. */
  .orientation-picker {
    container: orientation-picker / inline-size;
    display: flex;
    flex: 1;
  }

  .orientation-picker :global(.orientation-track) {
    flex: 1;
  }

  /* Below this track width, "Landscape" and its icon no longer fit side by
     side, so every option puts its icon above its label. The width is the
     widest label plus its icon, gap, and padding, times three, plus the track's
     own padding and gaps. orientation-picker.spec.ts checks that no label is
     clipped on each side of this width. */
  @container orientation-picker (max-width: 329.98px) {
    .orientation-picker :global(.orientation-track) {
      --segment-option-direction: column;
      --segment-option-gap: 2px;
      --segment-option-padding: var(--space-1) 2px;
    }
  }
</style>
