import type { AccessibilityActionEvent } from 'react-native';

// A finger only ever drags Clear; the one way to clear without a drag is an assistive activation
// (VoiceOver or TalkBack's double tap), as the shipping button accepts only a detail-zero click.
export function clearActivationProps(activate: () => void) {
  return {
    accessibilityActions: [{ name: 'activate' }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'activate') activate();
    },
  };
}
