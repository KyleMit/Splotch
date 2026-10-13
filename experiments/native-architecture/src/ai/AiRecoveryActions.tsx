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
  const request = state.recovery?.kind === 'recovery-request' ? state.recovery : null;
  return (
    <>
      {state.recovery?.kind === 'recovery-held' ? (
        <>
          <Text style={styles.text}>
            Sending this saved drawing needs a new approval from a grown-up. Saving it here did not
            give permission to upload it.
          </Text>
          <Action
            label="Send saved drawing for AI"
            disabled
            onPress={() => {
              void owner.sendRecovery();
            }}
          />
          <Action
            label="Check held recovery request"
            disabled={state.busy || waiting}
            onPress={() => {
              void owner.collectRecovery();
            }}
          />
        </>
      ) : null}
      {request ? (
        <>
          <Text style={styles.text}>
            Your saved original stays here while this request is checked. It will never be sent
            again automatically.
          </Text>
          <Action
            label="Check saved picture"
            disabled={state.busy || waiting || request.recovery.state === 'terminal'}
            onPress={() => {
              void owner.collectRecovery();
            }}
          />
          <Action
            label="Continue saved request"
            disabled
            onPress={() => {
              void owner.reconcileRecovery();
            }}
          />
          <Action
            label="Finish saving picture"
            disabled
            onPress={() => {
              void owner.acknowledgeRecovery();
            }}
          />
          <Action
            label="Check saved original request"
            disabled={state.busy || waiting}
            onPress={() => {
              void owner.readRecoverySource().catch(() => {});
            }}
          />
        </>
      ) : null}
    </>
  );
}
const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    text: { color: palette.text, fontSize: DRAWING_SCALE.fontSizeMd },
  })
);
