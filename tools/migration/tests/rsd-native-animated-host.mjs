import { useRef } from 'react';

export function pressNative(props) {
  props.onPress?.({ nativeEvent: {} });
  if (props.onStartShouldSetResponder?.()) props.onResponderRelease?.({ nativeEvent: {} });
}

export function imagePort(View) {
  return Object.assign(View, { getSize: (_uri, done) => queueMicrotask(() => done(1024, 768)) });
}

// A synchronous stand-in for React Native's Animated: every timing lands on its
// target at once and loops never tick, so mounted RSD tests observe end states.
class Value {
  constructor(value) {
    this.value = value;
  }
  setValue(value) {
    this.value = value;
  }
  stopAnimation() {}
  interpolate(config) {
    const interpolation = new Value(0);
    interpolation.restsAt = config?.outputRange?.at(-1);
    return interpolation;
  }
}

// What a Fabric host view shows of its style. An animated value moves the view on the native side
// and leaves it at rest there, while a React commit changes only a prop whose value differs from
// the last one React committed, so a static value equal to that one never replaces it.
export function useShownStyle(style) {
  const shown = useRef({});
  const committed = useRef({});
  const flat = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  for (const [key, value] of Object.entries(flat)) {
    if (value instanceof Value) shown.current[key] = value.restsAt ?? value.value;
    else if (committed.current[key] !== value) {
      committed.current[key] = value;
      shown.current[key] = value;
    }
  }
  return shown.current;
}

class ValueXY {
  constructor({ x, y }) {
    this.x = new Value(x);
    this.y = new Value(y);
  }
  setValue({ x, y }) {
    this.x.setValue(x);
    this.y.setValue(y);
  }
  stopAnimation() {}
}

function group(animations, finish) {
  return {
    start(done) {
      for (const animation of animations) animation.start();
      if (finish) done?.({ finished: true });
    },
    stop() {
      for (const animation of animations) animation.stop();
    },
  };
}

export function animatedPort(View, Text) {
  return {
    createAnimatedComponent: (component) => component,
    View,
    Text,
    Image: View,
    Value,
    ValueXY,
    add: () => new Value(0),
    multiply: () => new Value(0),
    modulo: () => new Value(0),
    delay: () => group([], true),
    loop: () => group([], false),
    parallel: (animations) => group(animations, true),
    sequence: (animations) => group(animations, false),
    timing: (value, config) => ({
      start(done) {
        value.setValue(config.toValue);
        done?.({ finished: true });
      },
      stop() {},
    }),
  };
}

export const easingPort = new Proxy({}, { get: () => () => (t) => t });

// Hardware Back presses reach the listeners the test fires; exits are counted, not taken.
// Audio is outside the selection fixture unless a case hands it a pencil loop to load.
export function drawingAudioPort(caller) {
  return {
    loadDrawingLoop: async (signal, onFailure) => {
      if (caller.drawingLoop) return caller.drawingLoop(signal, onFailure);
      throw new Error('Audio playback is outside this native caller fixture.');
    },
  };
}

// The app's foreground: a case moves it by calling each recorded listener with the next state.
export function appStatePort(records) {
  records.appStateListeners = new Set();
  return {
    currentState: 'active',
    addEventListener: (_type, listener) => {
      records.appStateListeners.add(listener);
      return { remove: () => records.appStateListeners.delete(listener) };
    },
  };
}

export function backHandlerPort(records) {
  return {
    addEventListener: (_type, listener) => {
      records.backListeners.add(listener);
      return { remove: () => records.backListeners.delete(listener) };
    },
    exitApp: () => {
      records.exits += 1;
    },
  };
}

// The platform the records name.
export function platformPort(records) {
  return {
    get OS() {
      return records.os;
    },
    constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
    select: (values) => values.ios ?? values.native ?? values.default,
  };
}

// The device's accessibility settings as the records hold them, and every announcement it is asked
// to speak.
export function accessibilityPort(records) {
  return {
    isReduceMotionEnabled: async () => records.reduceMotion,
    isReduceTransparencyEnabled: async () => records.reduceTransparency,
    addEventListener: () => ({ remove() {} }),
    announceForAccessibility: (text) => records.announcements.push(text),
    announceForAccessibilityWithOptions: (text) => records.announcements.push(text),
  };
}
