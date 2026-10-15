import { describe, expect, it } from 'vitest';
import { createParentGate } from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';

const MASH_WINDOW_MS = 120_000;
const TRIALS = 2000;
const MASH_PASS_RATE_CEILING = 0.015;
const GUIDED_PASS_RATE_CEILING = 0.12;
const SIMULATION_TIMEOUT_MS = 60_000;
const KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 'delete', 'check'];
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function unlockRate(interval, guided, brokenAutoSubmit = false) {
  let unlocked = 0;
  for (let seed = 1; seed <= TRIALS; seed += 1) {
    const random = seededRandom(seed);
    let clock = 1000;
    let solved = false;
    const gate = createParentGate(
      () => ({
        ai: 'always',
        imageReport: 'always',
        externalLinks: 'always',
        feedback: 'always',
        parentCenter: 'always',
      }),
      () => {},
      () => clock,
      random
    );
    gate.request('parentCenter', () => {
      solved = true;
    });
    for (let elapsed = 0; elapsed < MASH_WINDOW_MS && !solved; elapsed += interval) {
      clock = 1000 + elapsed;
      gate.tick();
      const state = gate.getState();
      const key =
        guided && state.input.length === String(state.x * state.y).length
          ? 'check'
          : KEYS[Math.floor(random() * (guided ? 10 : KEYS.length))];
      if (state.unlocked) {
        solved = true;
        break;
      }
      if (state.locked || state.shaking) continue;
      if (key === 'check') gate.answer();
      else if (key === 'delete') gate.input(state.input.slice(0, -1));
      else {
        gate.input(state.input + String(key));
        if (brokenAutoSubmit && gate.getState().input.length === String(state.x * state.y).length)
          gate.answer();
      }
    }
    if (solved) unlocked += 1;
    gate.dispose();
  }
  return unlocked / TRIALS;
}
describe('shared Parent Center gate mash resistance', () => {
  it.each([160, 333])(
    'bounds random keys at one tap per %i ms across two minutes',
    (interval) => {
      expect(unlockRate(interval, false)).toBeLessThan(MASH_PASS_RATE_CEILING);
    },
    SIMULATION_TIMEOUT_MS
  );
  it(
    'pins the learned fill-then-check residual risk rather than calling it random tapping',
    () => {
      expect(unlockRate(333, true)).toBeLessThan(GUIDED_PASS_RATE_CEILING);
    },
    SIMULATION_TIMEOUT_MS
  );
  it(
    'detects a controlled regression that auto-submits complete random guesses',
    () => {
      expect(unlockRate(160, false, true)).toBeGreaterThan(MASH_PASS_RATE_CEILING);
    },
    SIMULATION_TIMEOUT_MS
  );
});
