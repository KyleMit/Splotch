// React Strict DOM drops aria-pressed on Android and iOS. Selected is the state VoiceOver and
// TalkBack announce for a toggled button.
export function pressedState(pressed: boolean) {
  return { 'aria-selected': pressed } as const;
}

// React Strict DOM runs a native style transition through React Native's JS-driven Animated, which
// re-renders per frame; a native option takes its new ink at once.
export const optionFades = { segment: null, chip: null, underline: null } as const;
