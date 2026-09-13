import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  gate,
  parentalGatePolicies,
  requireParentalGate,
  pressGateKey,
  dismissGate,
  GATE_KEYPAD_KEYS,
  PARENTAL_GATE_FEATURES,
} from './parentalGate.svelte';

// A child tapping keypad keys at random, at the cadence the product audit
// measured in the running app (about 6 taps/s) and at a slower toddler pace.
// Every run is seeded, so the pass counts are deterministic. ADR-0094's
// mash-resistance amendment records what the same simulation measured against
// the auto-submitting keypad this replaced.
//
// The ceiling bounds one two-minute window, not a lifetime. Once the pauses
// reach their cap a child who never stops still earns a few guesses every cap
// period, so the chance keeps climbing with time: the same seeded model at
// 3 taps/s measured about 1.6% over 10 minutes, 3% over 30, and 6% over an
// hour of unbroken tapping. The window is the two minutes a child is likely to
// keep at it; the longer figures are in the ADR so nobody reads this one as
// the whole risk.
const MASH_WINDOW_MS = 120_000;
const TRIALS = 2000;
const MASH_PASS_RATE_CEILING = 0.015;
const TAP_INTERVALS_MS = [160, 333];

// mulberry32: a tiny seedable PRNG, so a failing run can be replayed exactly.
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resetGate() {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  dismissGate();
  gate.wrongStreak = 0;
  gate.lockouts = 0;
  gate.lockoutUntil = null;
  gate.escalationQuietSince = null;
}

function mashUnlocks(seed: number, tapIntervalMs: number): boolean {
  const random = seededRandom(seed);
  vi.spyOn(Math, 'random').mockImplementation(random);
  requireParentalGate('parentCenter', () => {});
  for (let elapsed = 0; elapsed < MASH_WINDOW_MS; elapsed += tapIntervalMs) {
    pressGateKey(GATE_KEYPAD_KEYS[Math.floor(random() * GATE_KEYPAD_KEYS.length)]);
    if (gate.unlocked) return true;
    vi.advanceTimersByTime(tapIntervalMs);
  }
  return false;
}

describe('parental gate under random tapping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const feature of PARENTAL_GATE_FEATURES) parentalGatePolicies[feature] = 'always';
  });

  afterEach(() => {
    resetGate();
    vi.useRealTimers();
  });

  it.each(TAP_INTERVALS_MS)(
    'rarely unlocks within two minutes at one tap per %i ms',
    (interval) => {
      let unlocked = 0;
      for (let seed = 1; seed <= TRIALS; seed++) {
        resetGate();
        if (mashUnlocks(seed, interval)) unlocked++;
      }
      expect(unlocked / TRIALS).toBeLessThan(MASH_PASS_RATE_CEILING);
    }
  );
});
