import type { AccessibilityActionEvent } from 'react-native';

// A finger only ever drags Clear; the one way to clear without a drag is an assistive activation
// (VoiceOver or TalkBack's double tap), as the shipping button accepts only a detail-zero click.
export function clearActivationProps(activate: () => void) {
  return {
    // VoiceOver's default activation on the iOS view dispatches onAccessibilityTap; TalkBack sends
    // the activate action. A press that arrives both ways clears once: the gesture ignores an
    // activation while the page is still departing.
    onAccessibilityTap: activate,
    accessibilityActions: [{ name: 'activate' }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'activate') activate();
    },
  };
}
