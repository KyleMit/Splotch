import { StyleSheet, Text } from 'react-native';
import { Action } from '../DrawingControls';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import { DRAWING_SCALE } from '../drawing/theme';
import type { AiState, NativeAiOwner } from './generation';

export function AiRecoveryActions({
  owner,
  state,
  waiting,
}: {
  owner: NativeAiOwner;
  state: AiState;
  waiting: boolean;
}) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
      <Text style={styles.text}>
        Recovery preview saves a held request on this device. Recovery sending is unavailable and no
        drawing is uploaded.
      </Text>
      <Action
        label="Save held recovery request"
        disabled={state.busy || waiting || !!state.recovery || state.credential === 'unavailable'}
        onPress={() => {
          void owner.prepareRecovery();
        }}
      />
      {state.recovery ? (
        <Action
          label="Check held recovery request"
          disabled={state.busy}
          onPress={() => {
            void owner.collectRecovery();
          }}
        />
      ) : null}
    </>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
  })
);
