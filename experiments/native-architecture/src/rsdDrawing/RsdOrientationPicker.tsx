import {
  ORIENTATION_CHOICES,
  ORIENTATION_LABELS,
  type OrientationChoice,
} from '../settings/orientation';
import type { NativeIconName } from './icons.generated';
import { RsdSegmentedPicker } from './RsdSegmentedPicker';

const ORIENTATION_ICONS: Record<OrientationChoice, NativeIconName> = {
  portrait: 'mobile-portrait',
  landscape: 'mobile-landscape',
  auto: 'mobile-rotate',
};

// The shipping OrientationPicker.svelte: one segmented track of the three locks with their device
// glyphs, held still while a choice is saving.
export function RsdOrientationPicker({
  selected,
  busy,
  onChange,
}: {
  selected: OrientationChoice;
  busy: boolean;
  onChange: (orientation: OrientationChoice) => void;
}) {
  return (
    <RsdSegmentedPicker
      label="Orientation"
      options={ORIENTATION_CHOICES.map((choice) => ({
        value: choice,
        label: ORIENTATION_LABELS[choice],
        icon: ORIENTATION_ICONS[choice],
        disabled: busy,
      }))}
      selected={selected}
      onSelect={onChange}
    />
  );
}
