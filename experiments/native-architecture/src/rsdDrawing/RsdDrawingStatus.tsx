import { StyleSheet, View } from 'react-native';
import { CONTROL_GAP, TOUCH_TARGET } from '../drawing/theme';
import { useDraftNotice } from '../product/useDraftNotice';
import type { useDrawingScreen } from '../useDrawingScreen';
import { RsdAction } from './controls';
import { EDGE_INSET_PX } from './edgeLayout';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';

// Between the drawer chevron and Settings, which hold the bottom corners.
const CORNER_CLEARANCE_PX = EDGE_INSET_PX + TOUCH_TARGET + CONTROL_GAP;

const styles = StyleSheet.create({
  retries: {
    position: 'absolute',
    left: CORNER_CLEARANCE_PX,
    right: CORNER_CLEARANCE_PX,
    bottom: EDGE_INSET_PX,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: CONTROL_GAP,
  },
});

// Shipping shows no status text on the paper: what the drawing screen has to say is spoken from a
// visually hidden live region. Only a failure the child can act on keeps a visible control.
export function RsdDrawingStatus({
  screen,
  messages,
  blocked,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  messages: readonly string[];
  blocked: boolean;
}) {
  const draft = useDraftNotice(screen, blocked);
  const spoken = [...messages, draft.state.message].filter(Boolean).join(' ');
  const draftFailed = draft.state.status === 'failed';
  return (
    <>
      <RsdVisuallyHidden live>{spoken}</RsdVisuallyHidden>
      {draftFailed || screen.recovery.failed ? (
        <View testID="rsd-drawing-retries" pointerEvents="box-none" style={styles.retries}>
          {draftFailed ? (
            <RsdAction
              label="Retry draft recovery"
              disabled={draft.disabled}
              onClick={draft.retry}
            />
          ) : null}
          {screen.recovery.failed ? (
            <RsdAction
              label="Retry drawing"
              disabled={screen.recovery.retryDisabled}
              onClick={screen.recovery.retry}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}
