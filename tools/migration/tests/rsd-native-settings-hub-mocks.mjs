import { afterEach, vi } from 'vitest';
import { SETTINGS_ACTIVITY_DOTS_START_SESSION } from '../../../experiments/native-architecture/src/settings/settingsSessions.ts';

// The launch count the Settings hub's activity dots wait on, read live so a case can set its own;
// unset, the dots are due.
export const hubSessions = { count: null };
afterEach(() => {
  hubSessions.count = null;
});
vi.mock('../../../experiments/native-architecture/src/platform/settingsSessions.ts', () => {
  const count = () => hubSessions.count ?? SETTINGS_ACTIVITY_DOTS_START_SESSION;
  return {
    settingsSessions: { current: count, subscribe: () => () => {}, load: async () => count() },
  };
});
// The hub's switches slide their thumb through Reanimated on Android and iOS; this stand-in lands
// each slide at once.
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const { View } = await import('react-native');
  return {
    default: { View },
    Easing: { bezier: (...curve) => ({ bezier: curve }) },
    ReduceMotion: { Never: 'never' },
    useSharedValue: (initial) => React.useState(() => ({ value: initial }))[0],
    useAnimatedStyle: (worklet) => worklet(),
    withTiming: (toValue) => toValue,
  };
});
