import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DRAWING_SCALE, DRAWING_THEME, TOUCH_TARGET } from '../drawing/theme';
import { useLibraryControls } from './LibraryScope';
import { librarySummary, libraryActions } from './controls';
export function NativeLibraryControls() {
  const library = useLibraryControls();
  if (!library) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.label}>Offline coloring library</Text>
      <Text style={styles.text} accessibilityLiveRegion="polite">
        {librarySummary(library.state)}
      </Text>
      <Text style={styles.text}>
        Downloads pause while drawing or when the app is in the background. Saved pictures keep
        their artwork.
      </Text>
      {libraryActions(library).map((action) => (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: action.disabled }}
          disabled={action.disabled}
          onPress={action.run}
          style={styles.action}
        >
          <Text style={styles.label}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: DRAWING_SCALE.space2, padding: DRAWING_SCALE.space3 },
  action: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DRAWING_THEME.borderWarm,
    borderRadius: DRAWING_SCALE.radiusMd,
    padding: DRAWING_SCALE.space2,
  },
  label: { color: DRAWING_THEME.textStrong, fontSize: DRAWING_SCALE.fontSizeMd },
  text: { color: DRAWING_THEME.text, fontSize: DRAWING_SCALE.fontSizeSm },
});
