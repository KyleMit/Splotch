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
  type ParentRequestOptions,
} from './parentPolicy';
import { PARENT_PLATFORM } from '../platform/parentPlatform';

export const PARENT_GATE_SHAKE_MS = 400;
// How long the "Unlocked!" card holds before the destination shows (shipping GATE_SUCCESS_HOLD_MS).
export const PARENT_GATE_SUCCESS_HOLD_MS = 1200;
// How long the wrong-answer line stays readable under the equation (shipping GATE_ERROR_VISIBLE_MS).
export const PARENT_GATE_ERROR_VISIBLE_MS = 2200;
// The countdown re-renders on each whole second remaining while the card is open.
const LOCKOUT_TICK_MS = 1000;
// Shipping GATE_ERROR_MESSAGE; native-parent-center-parity.test.mjs reads it back.
export const PARENT_GATE_ERROR_MESSAGE = 'Not quite — try this one';
// The shipping keypad's keys in reading order; rsd-native-parent-center.test.mjs pins them to
// GATE_KEYPAD_KEYS in parentalGate.svelte.ts.
export const PARENT_GATE_CHECK_KEY = 'submit';
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
  /** A correct answer holds the "Unlocked!" card until the destination is handed over. */
  unlocked: boolean;
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
  let errorUntil: number | null = null;
  // Settles the clock-driven parts of the card. An ended lockout is announced and its line goes
  // blank, as shipping shows nothing once the pause is over.
  function tick() {
    const time = now();
    if (until !== null) until = Math.min(until, time + GATE_LOCKOUT_MAX_MS);
    if (until !== null && time >= until) {
      quietSince = until;
      until = null;
    }
    const locked = until !== null;
    if (getState().locked && !locked) announce(GATE_LOCKOUT_ENDED_MESSAGE);
    if (errorUntil !== null && time >= errorUntil) {
      errorUntil = null;
      if (getState().announcement === PARENT_GATE_ERROR_MESSAGE) update({ announcement: '' });
    }
    update({
      locked,
      shaking: time < shakingUntil,
      message: locked
        ? gateLockoutMessage((until ?? time) - time)
        : errorUntil !== null
          ? PARENT_GATE_ERROR_MESSAGE
          : '',
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
    if (wrong >= GATE_WRONG_ANSWERS_BEFORE_LOCKOUT) {
      until = time + gateLockoutDurationMs(tier);
      tier += 1;
      wrong = 0;
      errorUntil = null;
      update({ shaking: true });
      tick();
      announce(gateLockoutMessage(until - time));
    } else {
      errorUntil = time + PARENT_GATE_ERROR_VISIBLE_MS;
      update({ shaking: true, message: PARENT_GATE_ERROR_MESSAGE });
      announce(PARENT_GATE_ERROR_MESSAGE);
    }
  }
  /** When the card next changes on its own: a shake or error ending, or the countdown's second. */
  function nextChange(time: number) {
    const deadlines = [
      shakingUntil > time ? shakingUntil : null,
      errorUntil,
      until === null ? null : time + ((until - time) % LOCKOUT_TICK_MS || LOCKOUT_TICK_MS),
    ].filter((deadline) => deadline !== null);
    return deadlines.length ? Math.min(...deadlines) : null;
  }
  return {
    tick,
    wrongAnswer,
    nextChange,
    /** A fresh or retargeted card starts with no shake and no wrong-answer line. */
    calm() {
      shakingUntil = 0;
      errorUntil = null;
    },
    reset() {
      wrong = 0;
      tier = 0;
      until = null;
      quietSince = null;
      shakingUntil = 0;
      errorUntil = null;
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
  unlocked: false,
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
  let immediate = false;
  let unlockedUntil: number | null = null;
  // A solved destination waits for the card's exit to finish, as shipping's notifyGateClosed does,
  // so it never opens over a card on its way out.
  let handoff: ((proof: ParentProof) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
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
  const lockout = createParentGateLockout(
    { getState: () => state, update, announce, challenge },
    now
  );
  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  // The open card wakes itself at its next deadline, so a shake, an error line, a countdown and
  // the success hold each end on time whoever is watching.
  function wake() {
    stopTimer();
    if (disposed || !state.open) return;
    const time = now();
    const next = state.unlocked ? unlockedUntil : lockout.nextChange(time);
    if (next === null) return;
    timer = setTimeout(
      () => {
        timer = null;
        tick();
      },
      Math.max(0, next - time)
    );
  }
  /** Settles the card against the clock; true while it takes no input. */
  function tick() {
    if (state.unlocked) {
      if (unlockedUntil !== null && now() >= unlockedUntil) release();
      else wake();
      return true;
    }
    const busy = lockout.tick();
    wake();
    return busy;
  }
  function close() {
    stopTimer();
    unlockedUntil = null;
    update({ open: false, unlocked: false, input: '', message: '' });
  }
  // The hold is over: the card closes, and its destination waits for the exit.
  function release() {
    handoff = pending;
    pending = null;
    close();
  }
  function dismiss() {
    epoch += 1;
    pending = null;
    handoff = null;
    immediate = false;
    close();
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
  function wrongAnswer() {
    lockout.wrongAnswer();
    wake();
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
    lockout.reset();
    // Only a solve made under Per session counts for the session (shipping succeed): an Every time
    // solve must not satisfy a later switch to Per session.
    if (policies()[state.feature] === 'session') sessions.add(state.feature);
    if (immediate) {
      const action = pending;
      pending = null;
      immediate = false;
      close();
      if (action) execute(action);
      return;
    }
    unlockedUntil = now() + PARENT_GATE_SUCCESS_HOLD_MS;
    update({
      unlocked: true,
      input: '',
      message: '',
      shaking: false,
      locked: false,
    });
    wake();
  }
  return {
    getState: () => state,
    request(
      feature: ParentFeature,
      action: (proof: ParentProof) => void,
      options: ParentRequestOptions = {}
    ) {
      if (disposed || state.open) return false;
      epoch += 1;
      if (bypass(feature)) {
        execute(action);
        return true;
      }
      pending = action;
      immediate = options.immediate === true;
      lockout.calm();
      challenge();
      update({
        open: true,
        unlocked: false,
        feature,
        message: '',
        shaking: false,
      });
      tick();
      if (state.locked) announce(state.message);
      return true;
    },
    // The footer's way into Parent Center keeps the problem on the card but starts the answer over,
    // and a link's immediate handover goes with the link (shipping redirectGateToParentCenter).
    retarget(action: (proof: ParentProof) => void) {
      if (!state.open || state.unlocked || disposed) return;
      epoch += 1;
      immediate = false;
      if (bypass('parentCenter')) {
        pending = null;
        close();
        execute(action);
        return;
      }
      pending = action;
      lockout.calm();
      update({ feature: 'parentCenter', input: '' });
      tick();
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
    /** The card's exit has played: a solved destination runs now, once. */
    closed() {
      const action = handoff;
      handoff = null;
      if (action && !disposed) execute(action);
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
