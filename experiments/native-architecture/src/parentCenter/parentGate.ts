import { GATE_OPERAND_MIN, GATE_OPERAND_MAX } from '../feedback/feedbackGate';
import {
  GATE_ESCALATION_QUIET_MS,
  GATE_LOCKOUT_MAX_MS,
  GATE_LOCKOUT_ENDED_MESSAGE,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
  gateLockoutDurationMs,
  gateLockoutMessage,
} from '../feedback/gateLockout';
import {
  isParentModeAvailable,
  type ParentFeature,
  type ParentPolicies,
  type ParentProof,
} from './parentPolicy';
import { PARENT_PLATFORM } from '../platform/parentPlatform';

export const PARENT_GATE_SHAKE_MS = 400;
// How long the "Unlocked!" card holds before the destination shows (shipping GATE_SUCCESS_HOLD_MS).
export const PARENT_GATE_SUCCESS_HOLD_MS = 1200;
// Shipping GATE_ERROR_MESSAGE; native-parent-center-parity.test.mjs reads it back.
export const PARENT_GATE_ERROR_MESSAGE = 'Not quite — try this one';
// The shipping keypad's keys in reading order; rsd-native-parent-center.test.mjs pins them to
// GATE_KEYPAD_KEYS in parentalGate.svelte.ts.
const PARENT_GATE_CHECK_KEY = 'submit';
export const PARENT_GATE_KEYPAD_KEYS = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  0,
  'delete',
  PARENT_GATE_CHECK_KEY,
] as const;
export type ParentGateKey = (typeof PARENT_GATE_KEYPAD_KEYS)[number];
export type ParentGateState = Readonly<{
  open: boolean;
  feature: ParentFeature;
  x: number;
  y: number;
  input: string;
  locked: boolean;
  shaking: boolean;
  /** Counts correct answers, so the card can hold its success after the gate has closed. */
  solves: number;
  message: string;
  announcement: string;
  announcementId: number;
}>;
function createParentGateLockout(
  {
    getState,
    update,
    announce,
    challenge,
  }: {
    getState: () => ParentGateState;
    update: (next: Partial<ParentGateState>) => void;
    announce: (message: string) => void;
    challenge: () => void;
  },
  now: () => number
) {
  let wrong = 0;
  let tier = 0;
  let until: number | null = null;
  let quietSince: number | null = null;
  let shakingUntil = 0;
  function tick() {
    const time = now();
    if (until !== null) until = Math.min(until, time + GATE_LOCKOUT_MAX_MS);
    if (until !== null && time >= until) {
      quietSince = until;
      until = null;
    }
    const locked = until !== null;
    if (getState().locked && !locked) announce(GATE_LOCKOUT_ENDED_MESSAGE);
    update({
      locked,
      shaking: time < shakingUntil,
      message: locked
        ? gateLockoutMessage((until ?? time) - time)
        : getState().locked
          ? GATE_LOCKOUT_ENDED_MESSAGE
          : getState().message,
    });
    return locked || time < shakingUntil;
  }
  function wrongAnswer() {
    const time = now();
    if (quietSince !== null && until === null && time - quietSince >= GATE_ESCALATION_QUIET_MS) {
      wrong = 0;
      tier = 0;
    }
    quietSince = time;
    wrong += 1;
    shakingUntil = time + PARENT_GATE_SHAKE_MS;
    challenge();
    update({ shaking: true, message: PARENT_GATE_ERROR_MESSAGE });
    if (wrong >= GATE_WRONG_ANSWERS_BEFORE_LOCKOUT) {
      until = time + gateLockoutDurationMs(tier);
      tier += 1;
      wrong = 0;
      tick();
      announce(gateLockoutMessage(until - time));
    } else announce(PARENT_GATE_ERROR_MESSAGE);
  }
  return {
    tick,
    wrongAnswer,
    reset() {
      wrong = 0;
      tier = 0;
      until = null;
      quietSince = null;
      shakingUntil = 0;
    },
  };
}

const CLOSED_GATE: ParentGateState = {
  open: false,
  feature: 'parentCenter',
  x: GATE_OPERAND_MIN,
  y: GATE_OPERAND_MIN,
  input: '',
  locked: false,
  shaking: false,
  solves: 0,
  message: '',
  announcement: '',
  announcementId: 0,
};

export function createParentGate(
  policies: () => ParentPolicies,
  publish: (state: ParentGateState) => void,
  now: () => number = Date.now,
  random: () => number = Math.random
) {
  let state = CLOSED_GATE;
  let pending: ((proof: ParentProof) => void) | null = null;
  const sessions = new Set<ParentFeature>();
  let epoch = 0;
  let disposed = false;
  function update(next: Partial<ParentGateState>) {
    state = { ...state, ...next };
    if (!disposed) publish(state);
  }
  function announce(message: string) {
    update({ announcement: message, announcementId: state.announcementId + 1 });
  }
  function challenge() {
    const operand = () =>
      GATE_OPERAND_MIN + Math.floor(random() * (GATE_OPERAND_MAX - GATE_OPERAND_MIN + 1));
    update({ x: operand(), y: operand(), input: '' });
  }
  const {
    tick,
    wrongAnswer,
    reset: resetLockout,
  } = createParentGateLockout({ getState: () => state, update, announce, challenge }, now);
  function dismiss() {
    epoch += 1;
    pending = null;
    update({ open: false, input: '', message: '' });
  }
  function execute(action: (proof: ParentProof) => void) {
    const proofEpoch = epoch;
    action({ valid: () => !disposed && proofEpoch === epoch });
  }
  // A Never the platform forbids still asks: the store rule holds even against a policy record
  // that reached the gate without passing the settings checks.
  function bypass(feature: ParentFeature) {
    const mode = policies()[feature];
    return (
      (mode === 'never' && isParentModeAvailable(feature, mode, PARENT_PLATFORM)) ||
      (mode === 'session' && sessions.has(feature))
    );
  }
  /** A digit past the answer's length counts as a wrong answer, as it does on the shipping card. */
  function input(value: string) {
    if (!state.open || tick() || !/^\d*$/.test(value)) return;
    if (value.length > String(state.x * state.y).length) {
      wrongAnswer();
      return;
    }
    update({ input: value });
  }
  function answer() {
    if (!state.open || tick()) return;
    if (state.input !== String(state.x * state.y)) {
      wrongAnswer();
      return;
    }
    resetLockout();
    // Only a solve made under Per session counts for the session (shipping succeed): an Every time
    // solve must not satisfy a later switch to Per session.
    if (policies()[state.feature] === 'session') sessions.add(state.feature);
    const action = pending;
    pending = null;
    update({
      open: false,
      input: '',
      message: '',
      shaking: false,
      locked: false,
      solves: state.solves + 1,
    });
    if (action) execute(action);
  }
  return {
    getState: () => state,
    request(feature: ParentFeature, action: (proof: ParentProof) => void) {
      if (disposed || state.open) return false;
      epoch += 1;
      if (bypass(feature)) {
        execute(action);
        return true;
      }
      pending = action;
      challenge();
      update({ open: true, feature, message: '' });
      tick();
      if (state.locked) announce(state.message);
      return true;
    },
    retarget(action: (proof: ParentProof) => void) {
      if (!state.open || disposed) return;
      epoch += 1;
      pending = action;
      update({ feature: 'parentCenter' });
      if (bypass('parentCenter')) {
        pending = null;
        update({ open: false });
        execute(action);
      }
    },
    /** Whether the feature would ask for a check now, rather than run at once. */
    requires: (feature: ParentFeature) => !bypass(feature),
    input,
    answer,
    /** One keypad tap: a digit appends, delete removes the last digit, check answers. */
    press(key: ParentGateKey) {
      if (key === 'delete') input(state.input.slice(0, -1));
      else if (key === PARENT_GATE_CHECK_KEY) answer();
      else input(state.input + String(key));
    },
    cancel(feature: ParentFeature) {
      if (state.feature === feature && state.open) dismiss();
    },
    invalidate: dismiss,
    /** A changed policy asks again, whatever was solved under the old one (shipping setParentalGateMode). */
    rearm(feature: ParentFeature) {
      sessions.delete(feature);
    },
    tick,
    dismiss,
    dispose() {
      dismiss();
      disposed = true;
      sessions.clear();
    },
  };
}
