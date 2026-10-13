export function createAccessibilityInfoFixture() {
  return {
    isReduceMotionEnabled: async () => true,
    addEventListener(event) {
      if (event !== 'reduceMotionChanged') throw new Error('Unexpected accessibility event');
      return { remove() {} };
    },
  };
}
