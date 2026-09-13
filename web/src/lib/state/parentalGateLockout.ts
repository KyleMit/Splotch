// Mash resistance for the Grown-Ups Only gate (ADR-0094's 2026-09-12
// amendment). A random two-digit guess is right about one time in a hundred,
// so the odds of a child tapping through come from how many guesses they get:
// after this many wrong answers in a row the keypad pauses, and each further
// pause lasts twice as long, up to the cap. parentalGate.mash.test.ts measures
// the result against simulated tapping. Plain TypeScript rather than part of
// the runes state module so the Playwright specs can import the same values.
export const GATE_WRONG_ANSWERS_BEFORE_LOCKOUT = 3;
export const GATE_LOCKOUT_BASE_MS = 30_000;
export const GATE_LOCKOUT_MAX_MS = 240_000;

// Escalation belongs to one bout of tapping. After this long with no wrong
// answer and no lockout in force, the streak and the lockout tier start over,
// so a parent arriving after a child's tapping is not handed the child's
// longest pause. Longer than the cap, so waiting out a pause is not quiet, and
// a child tapping without a break never reaches it.
export const GATE_ESCALATION_QUIET_MS = 300_000;

export const GATE_LOCKOUT_ENDED_MESSAGE = 'You can try again now';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export function gateLockoutDurationMs(priorLockouts: number): number {
  return Math.min(GATE_LOCKOUT_BASE_MS * 2 ** priorLockouts, GATE_LOCKOUT_MAX_MS);
}

/** Rounds up, so the card never says a pause is over before it is. */
export function gateLockoutMessage(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / MS_PER_SECOND);
  if (seconds < SECONDS_PER_MINUTE) {
    return `Too many tries — wait ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  const minutes = Math.ceil(seconds / SECONDS_PER_MINUTE);
  return `Too many tries — wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
