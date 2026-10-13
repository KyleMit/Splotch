import {
  createDrawingStyles,
  useDrawingStyles,
  useDrawingTheme,
} from './drawing/DrawingAppearance';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './drawing/Text';
import type { useDrawingScreen } from './useDrawingScreen';
import { CONTROL_GAP } from './drawing/theme';
import { PngRecoveryNotice } from './export/PngRecoveryNotice';
import { Action } from './DrawingControls';
import { useDraftNotice } from './product/useDraftNotice';

function useIdleMessage(message: string, drawing: boolean) {
  const [settled, setSettled] = useState(message);
  // Changing status layout invalidates the paper frame owned by the active contacts.
  if (!drawing && settled !== message) setSettled(message);
  return drawing ? settled : message;
}

export function DrawingStatus({
  screen,
  soundMessage,
  blocked,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  soundMessage: string;
  blocked: boolean;
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  const visibleNotice = useIdleMessage(screen.notice, screen.drawing);
  const visibleSoundMessage = useIdleMessage(soundMessage, screen.drawing);
  const draft = useDraftNotice(screen, blocked);
  return (
    <>
      <View style={styles.status}>
        {screen.busy && !screen.recovery.failed ? (
          <ActivityIndicator color={theme.brandSolid} />
        ) : null}
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {visibleNotice}
        </Text>
      </View>
      {visibleSoundMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {visibleSoundMessage}
        </Text>
      ) : null}
      {draft.state.message ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {draft.state.message}
        </Text>
      ) : null}
      {draft.state.status === 'failed' ? (
        <Action label="Retry draft recovery" disabled={draft.disabled} onPress={draft.retry} />
      ) : null}
      <PngRecoveryNotice
        state={screen.pngRecovery.state}
        drawing={screen.drawing}
        blocked={
          blocked || screen.pictures !== null || screen.pagePickerOpen || screen.settingsOpen
        }
        retry={() => {
          void screen.pngRecovery.retry();
        }}
        dismiss={(id) => {
          void screen.pngRecovery.dismiss(id);
        }}
      />
    </>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    status: {
      minHeight: 32,
      flexDirection: 'row',
      gap: CONTROL_GAP,
      alignItems: 'center',
      maxWidth: 1024,
    },
    notice: { fontSize: 15, color: palette.text, flexShrink: 1 },
  })
);
