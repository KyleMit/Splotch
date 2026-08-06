import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import {
  gate,
  requireParentalGate,
  pressGateDigit,
  pressGateBackspace,
  dismissGate,
  setGateRememberMode,
  resetParentalGate,
  disableParentalGate,
  reloadParentalGate,
  hasActiveGateUnlock,
  GATE_OPERAND_MIN,
  GATE_OPERAND_MAX,
  GATE_ERROR_MESSAGE,
  GATE_ERROR_VISIBLE_MS,
  GATE_SHAKE_MS,
  GATE_SUCCESS_HOLD_MS,
} from './parentalGate.svelte';

function typeAnswer(value: string) {
  for (const digit of value) pressGateDigit(Number(digit));
}

function correctAnswer() {
  return String(gate.x * gate.y);
}

// randomOperand() maps [0, 1) across [GATE_OPERAND_MIN, GATE_OPERAND_MAX], so
// the top of that range pins both operands to GATE_OPERAND_MAX.
const MAX_OPERAND_RANDOM = 0.999;

// A same-length string that cannot equal the real answer: no product of two
// operands in [3, 9] is all-nines (9, 99).
function wrongAnswer() {
  return '9'.repeat(correctAnswer().length) === correctAnswer()
    ? '8'.repeat(correctAnswer().length)
    : '9'.repeat(correctAnswer().length);
}

describe('parental gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    dismissGate();
    resetParentalGate();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('defaults to asking every time with no stored unlock', () => {
    expect(gate.rememberMode).toBe('always');
    expect(hasActiveGateUnlock()).toBe(false);
  });

  it('opens with a fresh single-digit challenge instead of running the destination', () => {
    const destination = vi.fn();
    requireParentalGate(destination, { x: 10, y: 20 });
    expect(destination).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
    expect(gate.origin).toEqual({ x: 10, y: 20 });
    expect(gate.input).toBe('');
    for (const operand of [gate.x, gate.y]) {
      expect(operand).toBeGreaterThanOrEqual(GATE_OPERAND_MIN);
      expect(operand).toBeLessThanOrEqual(GATE_OPERAND_MAX);
    }
  });

  it('solving unlocks, then closes and runs the destination after the success hold', () => {
    const destination = vi.fn();
    requireParentalGate(destination);
    typeAnswer(correctAnswer());
    expect(gate.unlocked).toBe(true);
    expect(destination).not.toHaveBeenCalled();

    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
  });

  it('a wrong answer regenerates the problem, clears input, and shows a timed error', () => {
    requireParentalGate(vi.fn());
    typeAnswer(wrongAnswer());
    expect(gate.input).toBe('');
    expect(gate.error).toBe(GATE_ERROR_MESSAGE);
    expect(gate.shaking).toBe(true);
    expect(gate.unlocked).toBe(false);

    vi.advanceTimersByTime(GATE_SHAKE_MS);
    expect(gate.shaking).toBe(false);
    vi.advanceTimersByTime(GATE_ERROR_VISIBLE_MS - GATE_SHAKE_MS);
    expect(gate.error).toBeNull();
  });

  it('backspace deletes the last typed digit', () => {
    // Backspace only exists mid-entry, and entry auto-submits the moment it
    // reaches the answer's digit count — so a random 3 × 3 would submit the
    // first digit as a wrong answer and clear it. Pin a two-digit challenge.
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    requireParentalGate(vi.fn());
    expect(correctAnswer()).toBe(String(GATE_OPERAND_MAX * GATE_OPERAND_MAX));

    pressGateDigit(5);
    expect(gate.input).toBe('5');
    pressGateBackspace();
    expect(gate.input).toBe('');
  });

  it('"ask me every time" stores no unlock — the next open asks again', () => {
    requireParentalGate(vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const destination = vi.fn();
    requireParentalGate(destination);
    expect(destination).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
  });

  it('"skip for this session" unlocks in memory only', () => {
    requireParentalGate(vi.fn());
    setGateRememberMode('session');
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const destination = vi.fn();
    requireParentalGate(destination);
    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.gateUnlockedForever)).not.toBe('true');
  });

  it('"don\'t ask again" persists the unlock', () => {
    requireParentalGate(vi.fn());
    setGateRememberMode('forever');
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    expect(gate.foreverUnlocked).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.gateUnlockedForever)).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.gateRememberMode)).toBe('forever');

    const destination = vi.fn();
    requireParentalGate(destination);
    expect(destination).toHaveBeenCalledOnce();
  });

  it('the remember choice alone never unlocks anything', () => {
    requireParentalGate(vi.fn());
    setGateRememberMode('forever');
    dismissGate();
    expect(hasActiveGateUnlock()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.gateUnlockedForever)).not.toBe('true');
  });

  it('dismissing discards input and the destination but keeps the remember mode', () => {
    const destination = vi.fn();
    requireParentalGate(destination);
    setGateRememberMode('session');
    pressGateDigit(4);
    dismissGate();
    expect(gate.open).toBe(false);
    expect(gate.input).toBe('');
    expect(gate.rememberMode).toBe('session');
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS * 2);
    expect(destination).not.toHaveBeenCalled();
  });

  it('ignores keypad input while closed or already unlocked', () => {
    pressGateDigit(5);
    expect(gate.input).toBe('');

    requireParentalGate(vi.fn());
    typeAnswer(correctAnswer());
    const solvedInput = gate.input;
    pressGateDigit(1);
    pressGateBackspace();
    expect(gate.input).toBe(solvedInput);
  });

  it('resetParentalGate clears both unlocks and returns to always-ask', () => {
    requireParentalGate(vi.fn());
    setGateRememberMode('forever');
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    gate.sessionUnlocked = true;

    resetParentalGate();
    expect(hasActiveGateUnlock()).toBe(false);
    expect(gate.rememberMode).toBe('always');
    expect(localStorage.getItem(STORAGE_KEYS.gateUnlockedForever)).toBe('false');
  });

  it('disableParentalGate stores a forever unlock (Settings-only escape hatch)', () => {
    disableParentalGate();
    expect(gate.foreverUnlocked).toBe(true);
    expect(gate.rememberMode).toBe('forever');
    const destination = vi.fn();
    requireParentalGate(destination);
    expect(destination).toHaveBeenCalledOnce();
  });

  it('force: true asks even while a stored unlock is active', () => {
    disableParentalGate();
    const destination = vi.fn();
    requireParentalGate(destination, null, { force: true });
    expect(destination).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
    expect(gate.force).toBe(true);
  });

  it('a forced solve closes and runs the destination immediately, storing no unlock', () => {
    setGateRememberMode('session');
    const destination = vi.fn();
    requireParentalGate(destination, null, { force: true });
    typeAnswer(correctAnswer());
    // Immediate — no success hold: a deferred external navigation would lose
    // the solving tap's user activation and trip the popup blocker.
    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
    expect(hasActiveGateUnlock()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.gateUnlockedForever)).not.toBe('true');
    expect(gate.force).toBe(false);
  });

  it('dismissing a forced attempt clears the force flag for the next open', () => {
    requireParentalGate(vi.fn(), null, { force: true });
    dismissGate();
    expect(gate.force).toBe(false);

    requireParentalGate(vi.fn());
    expect(gate.force).toBe(false);
  });

  it('reloadParentalGate re-reads persisted values and rejects garbage modes', () => {
    localStorage.setItem(STORAGE_KEYS.gateRememberMode, 'forever');
    localStorage.setItem(STORAGE_KEYS.gateUnlockedForever, 'true');
    reloadParentalGate();
    expect(gate.rememberMode).toBe('forever');
    expect(gate.foreverUnlocked).toBe(true);

    localStorage.setItem(STORAGE_KEYS.gateRememberMode, 'sparkles');
    reloadParentalGate();
    expect(gate.rememberMode).toBe('forever');
  });
});
