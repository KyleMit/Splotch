import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { useDrawingScreen } from './useDrawingScreen';
import { CONTROL_GAP, DRAWING_THEME } from './drawing/theme';
import { PngRecoveryNotice } from './export/PngRecoveryNotice';

function useIdleMessage(message: string, drawing: boolean) {
  const [settled, setSettled] = useState(message);
  // Changing status layout invalidates the paper frame owned by the active contacts.
  if (!drawing && settled !== message) setSettled(message);
  return drawing ? settled : message;
}

export function DrawingStatus({
  screen,
  soundMessage,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  soundMessage: string;
}) {
  const visibleNotice = useIdleMessage(screen.notice, screen.drawing);
  const visibleSoundMessage = useIdleMessage(soundMessage, screen.drawing);
  return (
    <>
      <View style={styles.status}>
        {screen.busy && !screen.recovery.failed ? (
          <ActivityIndicator color={DRAWING_THEME.brandSolid} />
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
      <PngRecoveryNotice
        state={screen.pngRecovery.state}
        drawing={screen.drawing}
        blocked={screen.pictures !== null || screen.pagePickerOpen || screen.settingsOpen}
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

const styles = StyleSheet.create({
  status: {
    minHeight: 32,
    flexDirection: 'row',
    gap: CONTROL_GAP,
    alignItems: 'center',
    maxWidth: 1024,
  },
  notice: { fontSize: 15, color: DRAWING_THEME.text, flexShrink: 1 },
});
