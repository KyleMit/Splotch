import { createDrawingStyles, useDrawingStyles } from './DrawingAppearance';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { CONTROL_GAP, CONTROL_RADIUS, DRAWING_SCALE, TOUCH_TARGET } from './theme';
import { STROKE_WIDTHS, STROKE_WIDTH_LABELS, type StrokeWidth } from './strokeWidth';

export function StrokeWidthSelector({
  tool,
  selected,
  disabled,
  onChange,
}: {
  tool: 'drawing' | 'eraser';
  selected: StrokeWidth;
  disabled: boolean;
  onChange: (width: StrokeWidth) => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const label = tool === 'eraser' ? 'Eraser width' : 'Drawing width';
  return (
    <View style={styles.selector}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {STROKE_WIDTHS.map((width) => (
          <Pressable
            key={width}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${STROKE_WIDTH_LABELS[width]}`}
            accessibilityState={{ selected: selected === width, disabled }}
            aria-pressed={selected === width}
            disabled={disabled}
            onPress={() => onChange(width)}
            style={[
              styles.choice,
              selected === width && styles.selected,
              disabled && styles.disabled,
            ]}
          >
            <Text style={styles.label}>{STROKE_WIDTH_LABELS[width]}</Text>
            {selected === width ? <Text style={styles.mark}>✓</Text> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    selector: { alignItems: 'center', gap: CONTROL_GAP },
    choices: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CONTROL_GAP },
    label: {
      fontSize: DRAWING_SCALE.fontSizeMd,
      fontWeight: DRAWING_SCALE.fontWeightSemibold,
      color: palette.textStrong,
    },
    choice: {
      minHeight: TOUCH_TARGET,
      minWidth: TOUCH_TARGET,
      paddingHorizontal: DRAWING_SCALE.space4,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderRadius: CONTROL_RADIUS,
      borderColor: palette.borderWarm,
      backgroundColor: palette.surface,
    },
    selected: {
      borderColor: palette.brandSolid,
      backgroundColor: palette.brandWash,
    },
    mark: {
      position: 'absolute',
      top: CONTROL_GAP / 2,
      right: CONTROL_GAP / 2,
      fontSize: DRAWING_SCALE.fontSizeSm,
      color: palette.textStrong,
    },
    disabled: { opacity: 0.4 },
  })
);
