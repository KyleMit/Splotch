// React Strict DOM drops aria-pressed on Android and iOS. Selected is the state VoiceOver and
// TalkBack announce for a toggled button.
export function pressedState(pressed: boolean) {
  return { 'aria-selected': pressed } as const;
}

// No roving tab stop: the arrow-key handler is react-native-web's alone, and on Android React
// Native leaves a `focusable={false}` view focusable but not clickable, so a hardware keyboard
// reached an unselected option and Enter, Space and D-pad centre did nothing. Every enabled option
// takes its activation keys instead.
export function optionTabIndex({ disabled }: { rovingStop: boolean; disabled: boolean }) {
  return disabled ? -1 : 0;
}

// React Strict DOM runs a native style transition through React Native's JS-driven Animated, which
// re-renders per frame; a native option takes its new ink at once.
export const optionFades = { segment: null, chip: null, underline: null } as const;
