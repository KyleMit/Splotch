import type { RefObject } from 'react';
import { Pressable, type View } from 'react-native';
import { Text } from './drawing/Text';
import { useDrawingScreenStyles } from './drawing/drawingScreenStyles';

export function Action({
  label,
  disabled,
  onPress,
  primary = false,
  selected,
  accessibilityLabel = label,
  openerRef,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  primary?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  openerRef?: RefObject<View | null>;
}) {
  const styles = useDrawingScreenStyles();
  return (
    <Pressable
      ref={openerRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, selected }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.primary,
        selected && styles.chosenBrush,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}
