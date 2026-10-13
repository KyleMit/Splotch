import { Pressable } from 'react-native';
import { Text } from '../drawing/Text';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { SETTINGS_METRICS, TOUCH_TARGET } from '../drawing/theme';

export function ColoringBookSetting({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const theme = useDrawingTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Coloring book"
      accessibilityState={{ checked: enabled, disabled }}
      aria-checked={enabled}
      disabled={disabled}
      onPress={() => onChange(!enabled)}
      style={{ minHeight: TOUCH_TARGET, justifyContent: 'center', padding: SETTINGS_METRICS.gap }}
    >
      <Text style={{ color: theme.textStrong, fontSize: SETTINGS_METRICS.textSize }}>
        Coloring book {enabled ? 'on' : 'off'}
      </Text>
    </Pressable>
  );
}
