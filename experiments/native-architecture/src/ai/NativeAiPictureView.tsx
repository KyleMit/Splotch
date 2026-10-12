import { StyleSheet, Text } from 'react-native';
import { Action } from '../DrawingControls';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE } from '../drawing/theme';
import type { AiState, NativeAiOwner } from './generation';
import type { AiResult } from './journal';
import { AiPictureViewport } from './AiPictureViewport';
import { useAiPictureShare } from './useAiPictureShare';

export function NativeAiPictureView({
  owner,
  state,
  picture,
}: {
  owner: NativeAiOwner;
  state: AiState;
  picture: AiResult;
}) {
  const styles = useDrawingStyles(themedStyles);
  const share = useAiPictureShare(state, picture);
  return (
    <>
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {state.message}
      </Text>
      {owner.hasHeldResult() ? (
        <Action
          label="Retry saving AI picture"
          disabled={state.busy}
          onPress={() => {
            void owner.retryRetention();
          }}
        />
      ) : null}
      <Action
        label="Share AI picture"
        disabled={state.busy || share.busy}
        onPress={() => {
          void share.share();
        }}
      />
      <Text accessibilityLiveRegion="polite" style={styles.text}>
        {share.message}
      </Text>
      <AiPictureViewport key={picture.uri} picture={picture} />
    </>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
  })
);
