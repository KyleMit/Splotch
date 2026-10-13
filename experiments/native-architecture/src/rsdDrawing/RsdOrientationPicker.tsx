import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
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

// OrientationPicker.svelte's container query: below this track width "Landscape" and its icon no
// longer fit side by side, so every option puts its icon above its label.
// rsd-native-settings-layouts.test.mjs reads it from that source.
export const ORIENTATION_COLUMN_MAX_WIDTH_PX = 329.98;

const layout = StyleSheet.create({
  // Grows to fill its row, as shipping's wrapper does in the compact shell's cell.
  track: { flexGrow: 1, alignSelf: 'stretch' },
});

// The shipping OrientationPicker.svelte: one segmented track of the three locks with their device
// glyphs, held still while a choice is saving. Its width decides the option layout, so it is
// measured; until the first measurement the options sit side by side.
export function RsdOrientationPicker({
  selected,
  busy,
  onChange,
}: {
  selected: OrientationChoice;
  busy: boolean;
  onChange: (orientation: OrientationChoice) => void;
}) {
  const [width, setWidth] = useState<number | null>(null);
  const narrow = width !== null && width <= ORIENTATION_COLUMN_MAX_WIDTH_PX;
  return (
    <View
      testID="orientation-picker"
      style={layout.track}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
    >
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
        optionDirection={narrow ? 'column' : 'row'}
      />
    </View>
  );
}
