import { Switch, Text, View, StyleSheet } from 'react-native';
import {
  createDrawingStyles,
  useDrawingStyles,
  useDrawingTheme,
} from '../drawing/DrawingAppearance';
import { SETTINGS_METRICS, TOUCH_TARGET } from '../drawing/theme';
import type { DrawingControlPreferences } from './drawingControlPreferences';

export function DrawingControlChoices({
  state,
  busy,
  onUndoButtonChange,
  onStrokeWidthControlChange,
}: {
  state: DrawingControlPreferences;
  busy: boolean;
  onUndoButtonChange: (enabled: boolean) => void;
  onStrokeWidthControlChange: (enabled: boolean) => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.label}>Undo button</Text>
        <Switch
          accessibilityLabel="Show Undo button"
          value={state.undoButtonEnabled}
          disabled={busy}
          onValueChange={onUndoButtonChange}
          style={styles.switch}
          trackColor={{ true: theme.brandSolid, false: theme.textSoft }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Drawing width controls</Text>
        <Switch
          accessibilityLabel="Show drawing width controls"
          value={state.strokeWidthControlEnabled}
          disabled={busy}
          onValueChange={onStrokeWidthControlChange}
          style={styles.switch}
          trackColor={{ true: theme.brandSolid, false: theme.textSoft }}
        />
      </View>
    </>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: SETTINGS_METRICS.gap },
    label: {
      flex: 1,
      color: palette.textStrong,
      fontSize: SETTINGS_METRICS.textSize,
      fontWeight: '600',
    },
    switch: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET },
  })
);
