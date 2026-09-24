import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import { clearRequestedSettingsSection, settingsModal, uiState } from './ui.svelte';
import {
  createParentalGate,
  isParentalGateModeAvailable,
  DEFAULT_PARENTAL_GATE_MODE,
  PARENTAL_GATE_FEATURES,
  GATE_OPERAND_MIN,
  GATE_OPERAND_MAX,
  GATE_ERROR_MESSAGE,
  GATE_ERROR_VISIBLE_MS,
  GATE_SHAKE_MS,
  GATE_SUCCESS_HOLD_MS,
  type ParentalGateState,
} from './parentalGate.svelte';

const originalCapacitor = globalThis.Capacitor;

// Each case builds its own gate from cleared storage: every policy at the build
// default, no escalation state, nothing solved this session.
let gate: ParentalGateState;

function typeAnswer(value: string) {
  for (const digit of value) gate.pressGateDigit(Number(digit));
  gate.submitGateAnswer();
}

function correctAnswer() {
  return String(gate.x * gate.y);
}

const MAX_OPERAND_RANDOM = 0.999;

function wrongAnswer() {
  return '9'.repeat(correctAnswer().length) === correctAnswer()
    ? '8'.repeat(correctAnswer().length)
    : '9'.repeat(correctAnswer().length);
}

describe('parental gate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    globalThis.Capacitor = undefined;
    gate = createParentalGate();
    settingsModal.hide();
    clearRequestedSettingsSection();
  });

  afterEach(() => {
    gate.dismissGate();
    globalThis.Capacitor = originalCapacitor;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks every time for every feature set to that mode', () => {
    for (const feature of PARENTAL_GATE_FEATURES) {
      expect(gate.policies[feature]).toBe('always');
      expect(gate.requiresParentalGate(feature)).toBe(true);
    }
  });

  // Which mode that default *is* comes from the build: gates are an app-store
  // requirement, so the store build arms them and the web build ships with every
  // check off. This suite compiles with __IS_CAPACITOR__ true (vitest.config.ts),
  // so it can only pin the fallback's shape, not the web value — that is pinned
  // against the real web bundle by flows-parent-center.spec.ts, "the web build
  // ships every grown-up check off".
  it('starts every protected feature at the build default when nothing is stored', () => {
    localStorage.clear();
    const fresh = createParentalGate();

    for (const feature of PARENTAL_GATE_FEATURES) {
      expect(fresh.policies[feature]).toBe(DEFAULT_PARENTAL_GATE_MODE);
    }
  });

  it('refuses writes into the policy and session-solved maps', () => {
    expect(() => {
      Object.assign(gate.sessionSolved, { aiImage: true });
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(gate.policies, { aiImage: 'never' });
    }).toThrow(TypeError);
    expect(gate.requiresParentalGate('aiImage')).toBe(true);
  });

  it('refuses writes through the origin getter', () => {
    gate.requireParentalGate('aiImage', vi.fn(), { x: 10, y: 20 });

    expect(() => {
      Object.assign(gate.origin!, { x: 30 });
    }).toThrow(TypeError);
    expect(gate.origin).toEqual({ x: 10, y: 20 });
  });

  it('enumerates fields without mutator methods', () => {
    expect(Object.keys(gate)).toEqual(
      expect.arrayContaining(['policies', 'sessionSolved', 'open', 'origin'])
    );
    expect(Object.values(gate).map((value) => typeof value)).not.toContain('function');
  });

  it('opens with a fresh single-digit challenge instead of running the destination', () => {
    const destination = vi.fn();
    gate.requireParentalGate('aiImage', destination, { x: 10, y: 20 });
    expect(destination).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
    expect(gate.feature).toBe('aiImage');
    expect(gate.origin).toEqual({ x: 10, y: 20 });
    expect(gate.input).toBe('');
    for (const operand of [gate.x, gate.y]) {
      expect(operand).toBeGreaterThanOrEqual(GATE_OPERAND_MIN);
      expect(operand).toBeLessThanOrEqual(GATE_OPERAND_MAX);
    }
  });

  it('solving unlocks, then closes and runs the destination once the dialog has closed', () => {
    const destination = vi.fn();
    gate.requireParentalGate('aiImage', destination);
    typeAnswer(correctAnswer());
    expect(gate.unlocked).toBe(true);
    expect(destination).not.toHaveBeenCalled();

    // The success hold closes the gate, but the destination waits for the
    // dialog's own close — its exit plays first (ADR-0170) — so a destination
    // that opens a modal never opens it over a dialog on its way out.
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(gate.open).toBe(false);
    expect(destination).not.toHaveBeenCalled();

    gate.notifyGateClosed();
    expect(destination).toHaveBeenCalledOnce();
  });

  it('releases a solved handoff only once, and never for an unsolved dismissal', () => {
    const destination = vi.fn();
    gate.requireParentalGate('aiImage', destination);
    gate.dismissGate();
    gate.notifyGateClosed();
    expect(destination).not.toHaveBeenCalled();

    gate.requireParentalGate('aiImage', destination);
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    gate.notifyGateClosed();
    gate.notifyGateClosed();
    expect(destination).toHaveBeenCalledOnce();
  });

  it('a wrong answer regenerates the problem, clears input, and shows a timed error', () => {
    gate.requireParentalGate('aiImage', vi.fn());
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

  it('waits for the check key instead of submitting a complete answer', () => {
    const destination = vi.fn();
    gate.requireParentalGate('aiImage', destination);
    for (const digit of correctAnswer()) gate.pressGateDigit(Number(digit));
    expect(gate.unlocked).toBe(false);
    expect(gate.input).toBe(correctAnswer());

    gate.pressGateKey('submit');
    expect(gate.unlocked).toBe(true);
  });

  it('counts a digit past the answer, or a check before it is complete, as wrong', () => {
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    gate.requireParentalGate('aiImage', vi.fn());
    typeAnswer('');
    expect(gate.error).toBe(GATE_ERROR_MESSAGE);
    expect(gate.wrongStreak).toBe(1);

    vi.advanceTimersByTime(GATE_SHAKE_MS);
    for (const digit of correctAnswer()) gate.pressGateDigit(Number(digit));
    gate.pressGateDigit(1);
    expect(gate.input).toBe('');
    expect(gate.wrongStreak).toBe(2);
    expect(gate.unlocked).toBe(false);
  });

  it('ignores keypad input while the wrong-answer shake plays', () => {
    gate.requireParentalGate('aiImage', vi.fn());
    typeAnswer(wrongAnswer());
    gate.pressGateDigit(1);
    expect(gate.input).toBe('');

    vi.advanceTimersByTime(GATE_SHAKE_MS);
    gate.pressGateDigit(1);
    expect(gate.input).toBe('1');
  });

  it('backspace deletes the last typed digit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    gate.requireParentalGate('aiImage', vi.fn());
    expect(correctAnswer()).toBe(String(GATE_OPERAND_MAX * GATE_OPERAND_MAX));

    gate.pressGateDigit(5);
    expect(gate.input).toBe('5');
    gate.pressGateBackspace();
    expect(gate.input).toBe('');
  });

  it('every-time mode asks again after a successful solve', () => {
    gate.requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const destination = vi.fn();
    gate.requireParentalGate('aiImage', destination);
    expect(destination).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
  });

  it('an every-time solve does not satisfy a later switch to per-session mode', () => {
    gate.requireParentalGate('parentCenter', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    gate.setParentalGateMode('parentCenter', 'session');

    expect(gate.sessionSolved.parentCenter).toBe(false);
    expect(gate.requiresParentalGate('parentCenter')).toBe(true);
  });

  it('changing a policy re-arms a previously solved per-session gate', () => {
    gate.setParentalGateMode('feedback', 'session');
    gate.requireParentalGate('feedback', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(gate.requiresParentalGate('feedback')).toBe(false);

    gate.setParentalGateMode('feedback', 'always');

    expect(gate.sessionSolved.feedback).toBe(false);
    expect(gate.requiresParentalGate('feedback')).toBe(true);
  });

  it('per-session mode skips only the feature already solved this session', () => {
    gate.setParentalGateMode('aiImage', 'session');
    gate.setParentalGateMode('feedback', 'session');
    gate.requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const aiDestination = vi.fn();
    gate.requireParentalGate('aiImage', aiDestination);
    expect(aiDestination).toHaveBeenCalledOnce();

    const feedbackDestination = vi.fn();
    gate.requireParentalGate('feedback', feedbackDestination);
    expect(feedbackDestination).not.toHaveBeenCalled();
    expect(gate.feature).toBe('feedback');
  });

  it('never mode bypasses the challenge for that feature', () => {
    gate.setParentalGateMode('feedback', 'never');
    const destination = vi.fn();
    gate.requireParentalGate('feedback', destination);
    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
  });

  it('retargets the open challenge at Parent Center, keeping the problem on screen', () => {
    const destination = vi.fn();
    gate.requireParentalGate('externalLinks', destination, { x: 10, y: 20 }, { immediate: true });
    const problem = [gate.x, gate.y];
    gate.pressGateDigit(4);

    gate.redirectGateToParentCenter();

    expect(gate.open).toBe(true);
    expect(gate.feature).toBe('parentCenter');
    expect([gate.x, gate.y]).toEqual(problem);
    expect(gate.input).toBe('');

    // The link's immediate handoff went with the link: this solve earns the
    // success card, then Settings opens on Parent Center itself.
    typeAnswer(correctAnswer());
    expect(gate.unlocked).toBe(true);
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    gate.notifyGateClosed();
    expect(destination).not.toHaveBeenCalled();
    expect(uiState.requestedSettingsSection).toBe('parentCenter');
    expect(settingsModal.open).toBe(true);
    expect(settingsModal.origin).toEqual({ x: 10, y: 20 });
  });

  it('hands straight over when Parent Center asks for no check of its own', () => {
    gate.setParentalGateMode('parentCenter', 'never');
    const destination = vi.fn();
    gate.requireParentalGate('feedback', destination);

    gate.redirectGateToParentCenter();

    expect(gate.open).toBe(false);
    expect(destination).not.toHaveBeenCalled();
    expect(uiState.requestedSettingsSection).toBe('parentCenter');
    expect(settingsModal.open).toBe(true);
  });

  it('hands Parent Center off to a caller-provided destination', () => {
    gate.setParentalGateMode('parentCenter', 'never');
    const origin = { x: 12, y: 34 };
    gate.requireParentalGate('externalLinks', vi.fn(), origin);
    const destination = vi.fn();

    gate.redirectGateToParentCenter(destination);

    expect(gate.open).toBe(false);
    expect(destination).toHaveBeenCalledWith(origin);
    expect(settingsModal.open).toBe(false);
  });

  it('flags only the choice that ends Parent Center protection', () => {
    expect(gate.endsParentCenterProtection('parentCenter', 'never')).toBe(true);

    for (const mode of ['always', 'session'] as const) {
      expect(gate.endsParentCenterProtection('parentCenter', mode)).toBe(false);
    }
    // Every other policy's Never gives up one operation's check, not the
    // protections themselves.
    for (const feature of PARENTAL_GATE_FEATURES.filter((f) => f !== 'parentCenter')) {
      expect(gate.endsParentCenterProtection(feature, 'never')).toBe(false);
    }
  });

  it('stops asking to confirm a protection that is already off', () => {
    expect(gate.isParentCenterUnprotected()).toBe(false);

    gate.setParentalGateMode('parentCenter', 'never');

    expect(gate.isParentCenterUnprotected()).toBe(true);
    expect(gate.endsParentCenterProtection('parentCenter', 'never')).toBe(false);

    gate.setParentalGateMode('parentCenter', 'session');

    expect(gate.isParentCenterUnprotected()).toBe(false);
    expect(gate.endsParentCenterProtection('parentCenter', 'never')).toBe(true);
  });

  it('persists an independent mode for every protected feature', () => {
    const storageKeyByFeature = {
      aiImage: STORAGE_KEYS.parentalGateAiImageMode,
      imageReport: STORAGE_KEYS.parentalGateImageReportMode,
      externalLinks: STORAGE_KEYS.parentalGateExternalLinksMode,
      feedback: STORAGE_KEYS.parentalGateFeedbackMode,
      parentCenter: STORAGE_KEYS.parentalGateParentCenterMode,
    } as const;
    const modeByFeature = {
      aiImage: 'session',
      imageReport: 'session',
      externalLinks: 'session',
      feedback: 'never',
      parentCenter: 'never',
    } as const;

    PARENTAL_GATE_FEATURES.forEach((feature) => {
      const mode = modeByFeature[feature];
      gate.setParentalGateMode(feature, mode);
      expect(gate.policies[feature]).toBe(mode);
      expect(localStorage.getItem(storageKeyByFeature[feature])).toBe(mode);
    });
  });

  it('an immediate solve hands off synchronously and counts for per-session mode', () => {
    gate.setParentalGateMode('externalLinks', 'session');
    const destination = vi.fn();
    gate.requireParentalGate('externalLinks', destination, null, { immediate: true });
    typeAnswer(correctAnswer());

    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
    expect(gate.sessionSolved.externalLinks).toBe(true);
    expect(gate.requiresParentalGate('externalLinks')).toBe(false);
  });

  it('dismissing discards input and the destination without recording a solve', () => {
    gate.setParentalGateMode('feedback', 'session');
    const destination = vi.fn();
    gate.requireParentalGate('feedback', destination);
    gate.pressGateDigit(4);
    gate.dismissGate();
    expect(gate.open).toBe(false);
    expect(gate.input).toBe('');
    expect(gate.sessionSolved.feedback).toBe(false);
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS * 2);
    expect(destination).not.toHaveBeenCalled();
  });

  it('ignores keypad input while closed or already unlocked', () => {
    gate.pressGateDigit(5);
    expect(gate.input).toBe('');

    gate.requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    const solvedInput = gate.input;
    gate.pressGateDigit(1);
    gate.pressGateBackspace();
    expect(gate.input).toBe(solvedInput);
  });

  it('reloads valid stored modes, rejects garbage, and migrates the legacy AI choice', () => {
    localStorage.setItem(STORAGE_KEYS.parentalGateFeedbackMode, 'session');
    localStorage.setItem(STORAGE_KEYS.parentalGateParentCenterMode, 'never');
    gate.reloadParentalGate();
    expect(gate.policies.feedback).toBe('session');
    expect(gate.policies.parentCenter).toBe('never');

    localStorage.setItem(STORAGE_KEYS.parentalGateFeedbackMode, 'sparkles');
    gate.reloadParentalGate();
    expect(gate.policies.feedback).toBe('session');

    localStorage.removeItem(STORAGE_KEYS.parentalGateAiImageMode);
    localStorage.setItem(STORAGE_KEYS.legacyGateRememberMode, 'forever');
    gate.reloadParentalGate();
    expect(gate.policies.aiImage).toBe('always');

    localStorage.setItem(STORAGE_KEYS.legacyGateUnlockedForever, 'true');
    gate.reloadParentalGate();
    expect(gate.policies.aiImage).toBe('never');
  });

  it.each(['web', 'android'] as const)('allows Never for external links on %s', (platform) => {
    globalThis.Capacitor = platform === 'android' ? { getPlatform: () => platform } : undefined;
    expect(isParentalGateModeAvailable('externalLinks', 'never', platform)).toBe(true);

    gate.setParentalGateMode('externalLinks', 'never');
    expect(gate.policies.externalLinks).toBe('never');
    expect(localStorage.getItem(STORAGE_KEYS.parentalGateExternalLinksMode)).toBe('never');
  });

  it('rejects Never for external links from both storage and direct updates on iOS', () => {
    globalThis.Capacitor = { getPlatform: () => 'ios' };
    expect(isParentalGateModeAvailable('externalLinks', 'never', 'ios')).toBe(false);
    localStorage.setItem(STORAGE_KEYS.parentalGateExternalLinksMode, 'never');
    gate.reloadParentalGate();
    expect(gate.policies.externalLinks).toBe('always');

    localStorage.removeItem(STORAGE_KEYS.parentalGateExternalLinksMode);
    expect(() => gate.setParentalGateMode('externalLinks', 'never')).toThrow(
      'Unsupported parental gate mode: externalLinks/never'
    );
    expect(gate.policies.externalLinks).toBe('always');
    expect(localStorage.getItem(STORAGE_KEYS.parentalGateExternalLinksMode)).toBeNull();
  });
});
