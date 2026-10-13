// A synchronous stand-in for React Native's Animated: every timing lands on its
// target at once and loops never tick, so mounted RSD tests observe end states.
class Value {
  constructor(value) {
    this.value = value;
  }
  setValue(value) {
    this.value = value;
  }
  interpolate() {
    return new Value(0);
  }
}

function group(animations, finish) {
  return {
    start(done) {
      for (const animation of animations) animation.start();
      if (finish) done?.();
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
    add: () => new Value(0),
    modulo: () => new Value(0),
    delay: () => group([], true),
    loop: () => group([], false),
    parallel: (animations) => group(animations, true),
    sequence: (animations) => group(animations, false),
    timing: (value, config) => ({
      start(done) {
        value.setValue(config.toValue);
        done?.();
      },
      stop() {},
    }),
  };
}

export const easingPort = new Proxy({}, { get: () => () => (t) => t });
