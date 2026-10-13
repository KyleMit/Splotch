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

// Web and Android speak a live region when its words change. iOS has no live regions, so there
// the same words go to VoiceOver as an announcement each time a region shows or changes them.
export function useAnnouncement(text: string) {
  useEffect(() => {
    if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}
