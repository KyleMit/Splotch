// The product's Reduce Motion preference, as a split capture seeds it (issue
// 2229's Reduce Motion arm, and the "--reduce-motion capture option" drafted on
// epic 2210). The key is the product's STORAGE_KEYS.reduceMotion; a tools module
// cannot import the TypeScript source at runtime, so
// tools/perf/tests/reduce-motion.test.mjs reads web/src/lib/storageKeys.ts and
// fails if the two disagree.
export const REDUCE_MOTION_STORAGE_KEY = 'splotch-reduce-motion';

// `reduce` forces reduced motion whatever the OS says; `system` is the product's
// default (the key absent), which follows the OS. `full` exists in the product
// but no capture needs it, so it is not offered.
const REDUCE_MOTION_SEEDS = ['reduce', 'system'];

export function reduceMotionSeedProblem(seed) {
  if (seed === undefined || seed === null) return null;
  return REDUCE_MOTION_SEEDS.includes(seed)
    ? null
    : `--reduce-motion must be one of ${REDUCE_MOTION_SEEDS.join(', ')}`;
}

// A `reduce` seed must come back as reduced motion from the page itself. A
// `system` seed follows the OS, so the page's answer is recorded, not judged.
export function reduceMotionReadinessProblem(ready, seed) {
  if (seed !== 'reduce' || ready?.reducedMotion === true) return null;
  return `Reduce Motion was seeded as reduce, but the page reports reducedMotion=${
    ready?.reducedMotion ?? 'unreported'
  }`;
}
