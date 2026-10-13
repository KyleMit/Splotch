import { Children, isValidElement, useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// The words a live region holds, gathered through any inline markup (strong, code) around them.
export function spokenText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return spokenText(child.props.children);
      return '';
    })
    .join('');
}

export type Politeness = 'polite' | 'assertive';

// Web and Android speak a live region when its words change. iOS has no live regions, so there
// the same words go to VoiceOver as an announcement each time a region shows or changes them: a
// polite one queues behind whatever VoiceOver is saying, an assertive one interrupts it.
export function useAnnouncement(text: string, politeness: Politeness) {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !text) return;
    if (politeness === 'polite')
      AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
    else AccessibilityInfo.announceForAccessibility(text);
  }, [text, politeness]);
}
