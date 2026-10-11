import {
  GATE_ESCALATION_QUIET_MS,
  GATE_LOCKOUT_MAX_MS,
  GATE_LOCKOUT_ENDED_MESSAGE,
  GATE_WRONG_ANSWERS_BEFORE_LOCKOUT,
  gateLockoutDurationMs,
  gateLockoutMessage,
} from './gateLockout';

// Candidate import isolation is enforced by native-feedback-contract.test.mjs, which pins these to parentalGate.svelte.ts.
export const GATE_OPERAND_MIN = 3;
export const GATE_OPERAND_MAX = 9;
export const GATE_ANSWER_MAX_LENGTH = String(GATE_OPERAND_MAX * GATE_OPERAND_MAX).length;
export const FEEDBACK_GATE_MODES = ['always', 'session', 'never'] as const;
export type FeedbackGateMode = (typeof FEEDBACK_GATE_MODES)[number];
export const FEEDBACK_GATE_LABELS: Record<FeedbackGateMode, string> = {
  always: 'Every time',
  session: 'Per session',
  never: 'Never',
};
export type FeedbackGateState = Readonly<{
  open: boolean;
  x: number;
  y: number;
  input: string;
  message: string;
  locked: boolean;
}>;

export function isFeedbackGateMode(value: unknown): value is FeedbackGateMode {
  return FEEDBACK_GATE_MODES.some((mode) => mode === value);
}

// Clock and randomness are injected so lockout and challenge boundaries have deterministic negative controls.
export function createFeedbackGate(
  publish: (state: FeedbackGateState) => void,
  now: () => number = Date.now,
  random: () => number = Math.random
) {
  let state: FeedbackGateState = {
    open: false,
    x: GATE_OPERAND_MIN,
    y: GATE_OPERAND_MIN,
    input: '',
    message: '',
    locked: false,
  };
  let pending: (() => void) | null = null;
  let wrong = 0;
  let lockouts = 0;
  let until: number | null = null;
  let quietSince: number | null = null;
  let mode: FeedbackGateMode = 'always';
  let solvedSession = false;
  function update(next: Partial<FeedbackGateState>) {
    state = { ...state, ...next };
    publish(state);
  }
  function challenge() {
    const operand = () =>
      GATE_OPERAND_MIN + Math.floor(random() * (GATE_OPERAND_MAX - GATE_OPERAND_MIN + 1));
    update({ x: operand(), y: operand(), input: '', message: '', locked: false });
  }
  function tick() {
    const time = now();
    if (until !== null) until = Math.min(until, time + GATE_LOCKOUT_MAX_MS);
    if (until !== null && time >= until) {
      quietSince = until;
      until = null;
    }
    const locked = until !== null;
    update({
      locked,
      ...(locked
        ? { message: gateLockoutMessage((until ?? time) - time) }
        : state.locked
          ? { message: GATE_LOCKOUT_ENDED_MESSAGE }
          : {}),
    });
    return locked;
  }
  function dismiss() {
    pending = null;
    update({ open: false, input: '', message: '' });
  }
  return {
    getState: () => state,
    loadMode(value: FeedbackGateMode) {
      mode = value;
      solvedSession = false;
    },
    request(destination: () => void, policyEdit = false) {
      if (state.open) {
        pending = destination;
        tick();
        return;
      }
      if (!policyEdit && (mode === 'never' || (mode === 'session' && solvedSession))) {
        destination();
        return;
      }
      pending = destination;
      if (!state.open) {
        challenge();
        update({ open: true });
      }
      tick();
    },
    input(value: string) {
      if (!state.open || tick()) return;
      if (!/^\d*$/.test(value) || value.length > GATE_ANSWER_MAX_LENGTH) return;
      update({ input: value });
    },
    answer() {
      if (!state.open || tick()) return;
      if (state.input === String(state.x * state.y)) {
        wrong = 0;
        lockouts = 0;
        until = null;
        quietSince = null;
        solvedSession = true;
        const destination = pending;
        dismiss();
        destination?.();
        return;
      }
      const time = now();
      if (quietSince !== null && time - quietSince >= GATE_ESCALATION_QUIET_MS) {
        wrong = 0;
        lockouts = 0;
      }
      quietSince = time;
      wrong += 1;
      challenge();
      if (wrong >= GATE_WRONG_ANSWERS_BEFORE_LOCKOUT) {
        until = time + gateLockoutDurationMs(lockouts);
        lockouts += 1;
        wrong = 0;
        tick();
      } else update({ message: 'Try a new problem.' });
    },
    tick,
    dismiss,
  };
}
