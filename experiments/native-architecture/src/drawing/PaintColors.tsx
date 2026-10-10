import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  paintHex,
  paintLabel,
  type PaletteLabel,
  type PaintColor,
  type CustomColor,
} from './palette';
import { CONTROL_GAP, CONTROL_RADIUS, DRAWING_SCALE, DRAWING_THEME, TOUCH_TARGET } from './theme';
const COLORS: readonly PaletteLabel[] = [
  'Purple',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Red',
  'Black',
];

export function PaintColors({
  color,
  customColors,
  disabled,
  pickerOpen,
  onChange,
  onExplore,
}: {
  color: PaintColor;
  customColors: readonly CustomColor[];
  disabled: boolean;
  pickerOpen: boolean;
  onChange: (color: PaintColor) => void;
  onExplore: () => void;
}) {
  const explore = useRef<View>(null);
  const wasPickerOpen = useRef(pickerOpen);
  useEffect(() => {
    const closing = wasPickerOpen.current && !pickerOpen;
    wasPickerOpen.current = pickerOpen;
    if (closing && !disabled) explore.current?.focus();
  }, [pickerOpen, disabled]);
  return (
    <View style={styles.colors}>
      <View style={styles.palette}>
        {COLORS.map((entry) => (
          <PaintSwatch
            key={entry}
            color={entry}
            selected={color}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
        <Pressable
          ref={explore}
          accessibilityRole="button"
          accessibilityLabel="More colors"
          disabled={disabled}
          onPress={onExplore}
          style={styles.explore}
        >
          <Text style={styles.label}>More colors</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        accessibilityLabel="Your custom paints"
        style={styles.savedRow}
        contentContainerStyle={styles.savedPalette}
      >
        {customColors.length ? (
          customColors.map((entry) => (
            <PaintSwatch
              key={entry}
              color={entry}
              selected={color}
              disabled={disabled}
              onChange={onChange}
            />
          ))
        ) : (
          <Text style={styles.label}>Your custom paints</Text>
        )}
      </ScrollView>
    </View>
  );
}

function PaintSwatch({
  color,
  selected,
  disabled,
  onChange,
}: {
  color: PaintColor;
  selected: PaintColor;
  disabled: boolean;
  onChange: (color: PaintColor) => void;
}) {
  const chosen = selected === color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paintLabel(color)}
      accessibilityState={{ selected: chosen, disabled }}
      aria-pressed={chosen}
      disabled={disabled}
      onPress={() => onChange(color)}
      style={[styles.swatch, { backgroundColor: paintHex(color) }, chosen && styles.selectedSwatch]}
    >
      {chosen ? <Text style={styles.swatchMark}>✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  colors: { width: '100%', gap: CONTROL_GAP, alignItems: 'center' },
  savedRow: { width: '100%', height: TOUCH_TARGET, flexGrow: 0 },
  savedPalette: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: CONTROL_GAP,
    flexGrow: 1,
  },
  palette: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CONTROL_GAP },
  swatch: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedSwatch: { borderColor: DRAWING_THEME.textStrong },
  swatchMark: {
    fontSize: 28,
    fontWeight: '800',
    color: DRAWING_THEME.surface,
    textShadowColor: DRAWING_THEME.textStrong,
    textShadowRadius: 2,
  },
  explore: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: DRAWING_SCALE.space4,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
    borderColor: DRAWING_THEME.borderWarm,
    backgroundColor: DRAWING_THEME.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: DRAWING_SCALE.fontSizeMd, color: DRAWING_THEME.textStrong },
});
