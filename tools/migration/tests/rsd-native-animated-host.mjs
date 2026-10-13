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
  interpolate() {
    return new Value(0);
  }
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
