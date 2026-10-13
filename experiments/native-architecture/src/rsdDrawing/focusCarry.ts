// React Strict DOM's native refs carry no DOM focus(), and a screen reader's focus on Android and
// iOS belongs to the platform's accessibility service, so there is no keyboard focus to carry.
export function focusedElementId(): string | null {
  return null;
}

export function focusElementById(_id: string) {}
