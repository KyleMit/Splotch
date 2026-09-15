import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parentalGateState,
  parentalGatePoliciesState,
  requireParentalGate,
  pressGateDigit,
  submitGateAnswer,
  dismissGate,
  PARENTAL_GATE_FEATURES,
  GATE_ANNOUNCE_DELAY_MS,
  GATE_ERROR_MESSAGE,
  GATE_SHAKE_MS,
} from './parentalGate.svelte';
import {
  gateLockoutMessage,
  GATE_ESCALATION_QUIET_MS,
  GATE_LOCKOUT_BASE_MS,
  GATE_LOCKOUT_ENDED_MESSAGE,
  GATE_LOCKOUT_MAX_MS,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
} from './parentalGateLockout';

const ELAPSED_BEFORE_REOPEN_MS = 25_000;
const ONE_SECOND_MS = 1000;
const ONE_DAY_MS = 86_400_000;

function typeAnswer(value: string) {
  for (const digit of value) pressGateDigit(Number(digit));
  submitGateAnswer();
}

function correctAnswer() {
  return String(parentalGateState.x * parentalGateState.y);
}

function answerWrongly() {
  typeAnswer('');
  vi.advanceTimersByTime(GATE_SHAKE_MS);
}

function lockOut() {
  for (let i = 1; i < GATE_WRONG_ANSWERS_BEFORE_LOCKOUT; i++) answerWrongly();
  typeAnswer('');
}

function remainingLockoutMs() {
  return parentalGateState.lockoutUntil === null
    ? null
    : parentalGateState.lockoutUntil - Date.now();
}

describe('parental gate lockout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dismissGate();
    Object.assign(parentalGateState, {
      wrongStreak: 0,
      lockouts: 0,
      lockoutUntil: null,
      escalationQuietSince: null,
    });
    for (const feature of PARENTAL_GATE_FEATURES) parentalGatePoliciesState[feature] = 'always';
    requireParentalGate('aiImage', vi.fn());
  });

  afterEach(() => {
    dismissGate();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pauses the keypad after repeated wrong answers, ignoring even a right one', () => {
    lockOut();
    expect(remainingLockoutMs()).toBe(GATE_LOCKOUT_BASE_MS);
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(false);
    expect(parentalGateState.input).toBe('');
  });

  it('counts the pause down on each whole second while the card is open', () => {
    lockOut();
    expect(parentalGateState.lockoutMessage).toBe(gateLockoutMessage(GATE_LOCKOUT_BASE_MS));

    vi.advanceTimersByTime(ONE_SECOND_MS);
    expect(parentalGateState.lockoutMessage).toBe(
      gateLockoutMessage(GATE_LOCKOUT_BASE_MS - ONE_SECOND_MS)
    );

    vi.advanceTimersByTime(GATE_LOCKOUT_BASE_MS - ONE_SECOND_MS);
    expect(parentalGateState.lockoutUntil).toBeNull();
    expect(parentalGateState.lockoutMessage).toBeNull();
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(true);
  });

  it('shows the time actually left when the card is reopened mid-pause', () => {
    lockOut();
    dismissGate();
    vi.advanceTimersByTime(ELAPSED_BEFORE_REOPEN_MS);

    requireParentalGate('aiImage', vi.fn());
    expect(parentalGateState.lockoutMessage).toBe(
      gateLockoutMessage(GATE_LOCKOUT_BASE_MS - ELAPSED_BEFORE_REOPEN_MS)
    );
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(false);

    vi.advanceTimersByTime(GATE_LOCKOUT_BASE_MS - ELAPSED_BEFORE_REOPEN_MS);
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(true);
  });

  it('ends the pause by the clock, even when no timer ran through it', () => {
    lockOut();
    dismissGate();
    vi.setSystemTime(Date.now() + GATE_LOCKOUT_BASE_MS);

    requireParentalGate('aiImage', vi.fn());
    expect(parentalGateState.lockoutMessage).toBeNull();
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(true);
  });

  it('announces a pause when it starts, on reopen, and when it ends, never per tick', () => {
    lockOut();
    const started = gateLockoutMessage(GATE_LOCKOUT_BASE_MS);
    expect(parentalGateState.announcement).toBe(started);
    vi.advanceTimersByTime(ONE_SECOND_MS);
    expect(parentalGateState.announcement).toBe(started);

    dismissGate();
    requireParentalGate('aiImage', vi.fn());
    expect(parentalGateState.announcement).toBe('');
    vi.advanceTimersByTime(GATE_ANNOUNCE_DELAY_MS);
    expect(parentalGateState.announcement).toBe(parentalGateState.lockoutMessage);

    vi.advanceTimersByTime(GATE_LOCKOUT_BASE_MS);
    expect(parentalGateState.announcement).toBe(GATE_LOCKOUT_ENDED_MESSAGE);
  });

  it('says a wrong answer again when the last one is still showing', () => {
    answerWrongly();
    expect(parentalGateState.announcement).toBe(GATE_ERROR_MESSAGE);

    typeAnswer('');
    expect(parentalGateState.announcement).toBe('');
    vi.advanceTimersByTime(GATE_ANNOUNCE_DELAY_MS);
    expect(parentalGateState.announcement).toBe(GATE_ERROR_MESSAGE);
  });

  it('holds a pause to the longest one when the clock is set backwards', () => {
    lockOut();
    vi.setSystemTime(Date.now() - ONE_DAY_MS);
    dismissGate();

    requireParentalGate('aiImage', vi.fn());
    expect(remainingLockoutMs()).toBe(GATE_LOCKOUT_MAX_MS);
  });

  it('lengthens each pause up to the cap, and a solve resets it', () => {
    const expected = [GATE_LOCKOUT_BASE_MS];
    while (expected.at(-1)! < GATE_LOCKOUT_MAX_MS) {
      expected.push(Math.min(expected.at(-1)! * 2, GATE_LOCKOUT_MAX_MS));
    }
    expected.push(GATE_LOCKOUT_MAX_MS);
    for (const lockoutMs of expected) {
      lockOut();
      expect(remainingLockoutMs()).toBe(lockoutMs);
      vi.advanceTimersByTime(lockoutMs);
    }

    answerWrongly();
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(true);
    expect(parentalGateState.wrongStreak).toBe(0);
    expect(parentalGateState.lockouts).toBe(0);
  });

  it('starts a quiet device back at the first pause instead of the last one', () => {
    let lockoutMs = 0;
    while (lockoutMs < GATE_LOCKOUT_MAX_MS) {
      lockOut();
      lockoutMs = remainingLockoutMs()!;
      vi.advanceTimersByTime(lockoutMs);
    }

    vi.advanceTimersByTime(GATE_ESCALATION_QUIET_MS - ONE_SECOND_MS);
    lockOut();
    expect(remainingLockoutMs()).toBe(GATE_LOCKOUT_MAX_MS);
    vi.advanceTimersByTime(GATE_LOCKOUT_MAX_MS);

    vi.advanceTimersByTime(GATE_ESCALATION_QUIET_MS);
    lockOut();
    expect(remainingLockoutMs()).toBe(GATE_LOCKOUT_BASE_MS);
  });

  it('forgets wrong answers left over from before a quiet period', () => {
    for (let i = 1; i < GATE_WRONG_ANSWERS_BEFORE_LOCKOUT; i++) answerWrongly();
    vi.advanceTimersByTime(GATE_ESCALATION_QUIET_MS);

    answerWrongly();
    expect(parentalGateState.wrongStreak).toBe(1);
    expect(parentalGateState.lockoutUntil).toBeNull();
  });

  it('names the time left in rounded-up seconds, then whole minutes', () => {
    expect(gateLockoutMessage(30_000)).toBe('Too many tries — wait 30 seconds');
    expect(gateLockoutMessage(4_200)).toBe('Too many tries — wait 5 seconds');
    expect(gateLockoutMessage(1_000)).toBe('Too many tries — wait 1 second');
    expect(gateLockoutMessage(60_000)).toBe('Too many tries — wait 1 minute');
    expect(gateLockoutMessage(230_000)).toBe('Too many tries — wait 4 minutes');
  });
});
