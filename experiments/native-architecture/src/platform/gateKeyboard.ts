import { createElement } from 'react';
import {
  requireNativeComponent,
  StyleSheet,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import { PARENT_GATE_KEYPAD_KEYS, type ParentGateKey } from '../parentCenter/parentGate';

type GateKeyEvent = NativeSyntheticEvent<Readonly<{ key: unknown }>>;
type ReceiverProps = ViewProps & Readonly<{ onGateKey: (event: GateKeyEvent) => void }>;
const Receiver = requireNativeComponent<ReceiverProps>('SplotchGateKeyboard');
// Android skips hardware-key dispatch to focused descendants with empty bounds.
const KEY_RECEIVER_SIZE_DP = 1;
const styles = StyleSheet.create({
  receiver: { position: 'absolute', width: KEY_RECEIVER_SIZE_DP, height: KEY_RECEIVER_SIZE_DP },
});

export function GateKeyboard({ onPress }: { onPress: (key: ParentGateKey) => void }) {
  return createElement(Receiver, {
    testID: 'parent-gate-keyboard',
    style: styles.receiver,
    pointerEvents: 'none',
    focusable: true,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    onGateKey: ({ nativeEvent }) => {
      const key = PARENT_GATE_KEYPAD_KEYS.find((value) => String(value) === nativeEvent.key);
      if (key === undefined) throw new Error('Unrecognized grown-up check key.');
      onPress(key);
    },
  });
}
