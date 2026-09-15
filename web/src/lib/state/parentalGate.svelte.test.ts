import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import { settingsModal, uiState } from './ui.svelte';
import {
  parentalGateState,
  parentalGatePoliciesState,
  requireParentalGate,
  requiresParentalGate,
  pressGateDigit,
  pressGateBackspace,
  pressGateKey,
  submitGateAnswer,
  dismissGate,
  endsParentCenterProtection,
  isParentCenterUnprotected,
  redirectGateToParentCenter,
  setParentalGateMode,
  reloadParentalGate,
  isParentalGateModeAvailable,
  PARENTAL_GATE_FEATURES,
  GATE_OPERAND_MIN,
  GATE_OPERAND_MAX,
  GATE_ERROR_MESSAGE,
  GATE_ERROR_VISIBLE_MS,
  GATE_SHAKE_MS,
  GATE_SUCCESS_HOLD_MS,
} from './parentalGate.svelte';

const originalCapacitor = globalThis.Capacitor;

function typeAnswer(value: string) {
  for (const digit of value) pressGateDigit(Number(digit));
  submitGateAnswer();
}

function correctAnswer() {
  return String(parentalGateState.x * parentalGateState.y);
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
    dismissGate();
    Object.assign(parentalGateState, {
      wrongStreak: 0,
      lockouts: 0,
      lockoutUntil: null,
      escalationQuietSince: null,
    });
    settingsModal.hide();
    uiState.requestedSettingsSection = null;
    for (const feature of PARENTAL_GATE_FEATURES) {
      parentalGatePoliciesState[feature] = 'always';
      parentalGateState.sessionSolved[feature] = false;
    }
  });

  afterEach(() => {
    globalThis.Capacitor = originalCapacitor;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks every time for every feature set to that mode', () => {
    for (const feature of PARENTAL_GATE_FEATURES) {
      expect(parentalGatePoliciesState[feature]).toBe('always');
      expect(requiresParentalGate(feature)).toBe(true);
    }
  });

  // Which mode that default *is* comes from the build: gates are an app-store
  // requirement, so the store build arms them and the web build ships with every
  // check off. This suite compiles with __IS_CAPACITOR__ true (vitest.config.ts),
  // so it can only pin the fallback's shape, not the web value — that is pinned
  // against the real web bundle by flows-parental-gate.spec.ts, "the web build
  // ships every grown-up check off".
  it('starts every protected feature at the build default when nothing is stored', async () => {
    localStorage.clear();
    vi.resetModules();
    const fresh = await import('./parentalGate.svelte');

    for (const feature of fresh.PARENTAL_GATE_FEATURES) {
      expect(fresh.parentalGatePoliciesState[feature]).toBe(fresh.DEFAULT_PARENTAL_GATE_MODE);
    }
  });

  it('opens with a fresh single-digit challenge instead of running the destination', () => {
    const destination = vi.fn();
    requireParentalGate('aiImage', destination, { x: 10, y: 20 });
    expect(destination).not.toHaveBeenCalled();
    expect(parentalGateState.open).toBe(true);
    expect(parentalGateState.feature).toBe('aiImage');
    expect(parentalGateState.origin).toEqual({ x: 10, y: 20 });
    expect(parentalGateState.input).toBe('');
    for (const operand of [parentalGateState.x, parentalGateState.y]) {
      expect(operand).toBeGreaterThanOrEqual(GATE_OPERAND_MIN);
      expect(operand).toBeLessThanOrEqual(GATE_OPERAND_MAX);
    }
  });

  it('solving unlocks, then closes and runs the destination after the success hold', () => {
    const destination = vi.fn();
    requireParentalGate('aiImage', destination);
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(true);
    expect(destination).not.toHaveBeenCalled();

    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(destination).toHaveBeenCalledOnce();
    expect(parentalGateState.open).toBe(false);
  });

  it('a wrong answer regenerates the problem, clears input, and shows a timed error', () => {
    requireParentalGate('aiImage', vi.fn());
    typeAnswer(wrongAnswer());
    expect(parentalGateState.input).toBe('');
    expect(parentalGateState.error).toBe(GATE_ERROR_MESSAGE);
    expect(parentalGateState.shaking).toBe(true);
    expect(parentalGateState.unlocked).toBe(false);

    vi.advanceTimersByTime(GATE_SHAKE_MS);
    expect(parentalGateState.shaking).toBe(false);
    vi.advanceTimersByTime(GATE_ERROR_VISIBLE_MS - GATE_SHAKE_MS);
    expect(parentalGateState.error).toBeNull();
  });

  it('waits for the check key instead of submitting a complete answer', () => {
    const destination = vi.fn();
    requireParentalGate('aiImage', destination);
    for (const digit of correctAnswer()) pressGateDigit(Number(digit));
    expect(parentalGateState.unlocked).toBe(false);
    expect(parentalGateState.input).toBe(correctAnswer());

    pressGateKey('submit');
    expect(parentalGateState.unlocked).toBe(true);
  });

  it('counts a digit past the answer, or a check before it is complete, as wrong', () => {
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    requireParentalGate('aiImage', vi.fn());
    typeAnswer('');
    expect(parentalGateState.error).toBe(GATE_ERROR_MESSAGE);
    expect(parentalGateState.wrongStreak).toBe(1);

    vi.advanceTimersByTime(GATE_SHAKE_MS);
    for (const digit of correctAnswer()) pressGateDigit(Number(digit));
    pressGateDigit(1);
    expect(parentalGateState.input).toBe('');
    expect(parentalGateState.wrongStreak).toBe(2);
    expect(parentalGateState.unlocked).toBe(false);
  });

  it('ignores keypad input while the wrong-answer shake plays', () => {
    requireParentalGate('aiImage', vi.fn());
    typeAnswer(wrongAnswer());
    pressGateDigit(1);
    expect(parentalGateState.input).toBe('');

    vi.advanceTimersByTime(GATE_SHAKE_MS);
    pressGateDigit(1);
    expect(parentalGateState.input).toBe('1');
  });

  it('backspace deletes the last typed digit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    requireParentalGate('aiImage', vi.fn());
    expect(correctAnswer()).toBe(String(GATE_OPERAND_MAX * GATE_OPERAND_MAX));

    pressGateDigit(5);
    expect(parentalGateState.input).toBe('5');
    pressGateBackspace();
    expect(parentalGateState.input).toBe('');
  });

  it('every-time mode asks again after a successful solve', () => {
    requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const destination = vi.fn();
    requireParentalGate('aiImage', destination);
    expect(destination).not.toHaveBeenCalled();
    expect(parentalGateState.open).toBe(true);
  });

  it('an every-time solve does not satisfy a later switch to per-session mode', () => {
    requireParentalGate('parentCenter', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    setParentalGateMode('parentCenter', 'session');

    expect(parentalGateState.sessionSolved.parentCenter).toBe(false);
    expect(requiresParentalGate('parentCenter')).toBe(true);
  });

  it('changing a policy re-arms a previously solved per-session gate', () => {
    setParentalGateMode('feedback', 'session');
    requireParentalGate('feedback', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(requiresParentalGate('feedback')).toBe(false);

    setParentalGateMode('feedback', 'always');

    expect(parentalGateState.sessionSolved.feedback).toBe(false);
    expect(requiresParentalGate('feedback')).toBe(true);
  });

  it('per-session mode skips only the feature already solved this session', () => {
    setParentalGateMode('aiImage', 'session');
    setParentalGateMode('feedback', 'session');
    requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const aiDestination = vi.fn();
    requireParentalGate('aiImage', aiDestination);
    expect(aiDestination).toHaveBeenCalledOnce();

    const feedbackDestination = vi.fn();
    requireParentalGate('feedback', feedbackDestination);
    expect(feedbackDestination).not.toHaveBeenCalled();
    expect(parentalGateState.feature).toBe('feedback');
  });

  it('never mode bypasses the challenge for that feature', () => {
    setParentalGateMode('feedback', 'never');
    const destination = vi.fn();
    requireParentalGate('feedback', destination);
    expect(destination).toHaveBeenCalledOnce();
    expect(parentalGateState.open).toBe(false);
  });

  it('retargets the open challenge at Parent Center, keeping the problem on screen', () => {
    const destination = vi.fn();
    requireParentalGate('externalLinks', destination, { x: 10, y: 20 }, { immediate: true });
    const problem = [parentalGateState.x, parentalGateState.y];
    pressGateDigit(4);

    redirectGateToParentCenter();

    expect(parentalGateState.open).toBe(true);
    expect(parentalGateState.feature).toBe('parentCenter');
    expect([parentalGateState.x, parentalGateState.y]).toEqual(problem);
    expect(parentalGateState.input).toBe('');

    // The link's immediate handoff went with the link: this solve earns the
    // success card, then Settings opens on Parent Center itself.
    typeAnswer(correctAnswer());
    expect(parentalGateState.unlocked).toBe(true);
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(destination).not.toHaveBeenCalled();
    expect(uiState.requestedSettingsSection).toBe('parentCenter');
    expect(settingsModal.open).toBe(true);
    expect(settingsModal.origin).toEqual({ x: 10, y: 20 });
  });

  it('hands straight over when Parent Center asks for no check of its own', () => {
    setParentalGateMode('parentCenter', 'never');
    const destination = vi.fn();
    requireParentalGate('feedback', destination);

    redirectGateToParentCenter();

    expect(parentalGateState.open).toBe(false);
    expect(destination).not.toHaveBeenCalled();
    expect(uiState.requestedSettingsSection).toBe('parentCenter');
    expect(settingsModal.open).toBe(true);
  });

  it('hands Parent Center off to a caller-provided destination', () => {
    setParentalGateMode('parentCenter', 'never');
    const origin = { x: 12, y: 34 };
    requireParentalGate('externalLinks', vi.fn(), origin);
    const destination = vi.fn();

    redirectGateToParentCenter(destination);

    expect(parentalGateState.open).toBe(false);
    expect(destination).toHaveBeenCalledWith(origin);
    expect(settingsModal.open).toBe(false);
  });

  it('flags only the choice that ends Parent Center protection', () => {
    expect(endsParentCenterProtection('parentCenter', 'never')).toBe(true);

    for (const mode of ['always', 'session'] as const) {
      expect(endsParentCenterProtection('parentCenter', mode)).toBe(false);
    }
    // Every other policy's Never gives up one operation's check, not the
    // protections themselves.
    for (const feature of PARENTAL_GATE_FEATURES.filter((f) => f !== 'parentCenter')) {
      expect(endsParentCenterProtection(feature, 'never')).toBe(false);
    }
  });

  it('stops asking to confirm a protection that is already off', () => {
    expect(isParentCenterUnprotected()).toBe(false);

    setParentalGateMode('parentCenter', 'never');

    expect(isParentCenterUnprotected()).toBe(true);
    expect(endsParentCenterProtection('parentCenter', 'never')).toBe(false);

    setParentalGateMode('parentCenter', 'session');

    expect(isParentCenterUnprotected()).toBe(false);
    expect(endsParentCenterProtection('parentCenter', 'never')).toBe(true);
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
      setParentalGateMode(feature, mode);
      expect(parentalGatePoliciesState[feature]).toBe(mode);
      expect(localStorage.getItem(storageKeyByFeature[feature])).toBe(mode);
    });
  });

  it('an immediate solve hands off synchronously and counts for per-session mode', () => {
    setParentalGateMode('externalLinks', 'session');
    const destination = vi.fn();
    requireParentalGate('externalLinks', destination, null, { immediate: true });
    typeAnswer(correctAnswer());

    expect(destination).toHaveBeenCalledOnce();
    expect(parentalGateState.open).toBe(false);
    expect(parentalGateState.sessionSolved.externalLinks).toBe(true);
    expect(requiresParentalGate('externalLinks')).toBe(false);
  });

  it('dismissing discards input and the destination without recording a solve', () => {
    setParentalGateMode('feedback', 'session');
    const destination = vi.fn();
    requireParentalGate('feedback', destination);
    pressGateDigit(4);
    dismissGate();
    expect(parentalGateState.open).toBe(false);
    expect(parentalGateState.input).toBe('');
    expect(parentalGateState.sessionSolved.feedback).toBe(false);
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS * 2);
    expect(destination).not.toHaveBeenCalled();
  });

  it('ignores keypad input while closed or already unlocked', () => {
    pressGateDigit(5);
    expect(parentalGateState.input).toBe('');

    requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    const solvedInput = parentalGateState.input;
    pressGateDigit(1);
    pressGateBackspace();
    expect(parentalGateState.input).toBe(solvedInput);
  });

  it('reloads valid stored modes, rejects garbage, and migrates the legacy AI choice', () => {
    localStorage.setItem(STORAGE_KEYS.parentalGateFeedbackMode, 'session');
    localStorage.setItem(STORAGE_KEYS.parentalGateParentCenterMode, 'never');
    reloadParentalGate();
    expect(parentalGatePoliciesState.feedback).toBe('session');
    expect(parentalGatePoliciesState.parentCenter).toBe('never');

    localStorage.setItem(STORAGE_KEYS.parentalGateFeedbackMode, 'sparkles');
    reloadParentalGate();
    expect(parentalGatePoliciesState.feedback).toBe('session');

    localStorage.removeItem(STORAGE_KEYS.parentalGateAiImageMode);
    localStorage.setItem(STORAGE_KEYS.legacyGateRememberMode, 'forever');
    reloadParentalGate();
    expect(parentalGatePoliciesState.aiImage).toBe('always');

    localStorage.setItem(STORAGE_KEYS.legacyGateUnlockedForever, 'true');
    reloadParentalGate();
    expect(parentalGatePoliciesState.aiImage).toBe('never');
  });

  it.each(['web', 'android'] as const)('allows Never for external links on %s', (platform) => {
    globalThis.Capacitor = platform === 'android' ? { getPlatform: () => platform } : undefined;
    expect(isParentalGateModeAvailable('externalLinks', 'never', platform)).toBe(true);

    setParentalGateMode('externalLinks', 'never');
    expect(parentalGatePoliciesState.externalLinks).toBe('never');
    expect(localStorage.getItem(STORAGE_KEYS.parentalGateExternalLinksMode)).toBe('never');
  });

  it('rejects Never for external links from both storage and direct updates on iOS', () => {
    globalThis.Capacitor = { getPlatform: () => 'ios' };
    expect(isParentalGateModeAvailable('externalLinks', 'never', 'ios')).toBe(false);
    localStorage.setItem(STORAGE_KEYS.parentalGateExternalLinksMode, 'never');
    reloadParentalGate();
    expect(parentalGatePoliciesState.externalLinks).toBe('always');

    localStorage.removeItem(STORAGE_KEYS.parentalGateExternalLinksMode);
    expect(() => setParentalGateMode('externalLinks', 'never')).toThrow(
      'Unsupported parental gate mode: externalLinks/never'
    );
    expect(parentalGatePoliciesState.externalLinks).toBe('always');
    expect(localStorage.getItem(STORAGE_KEYS.parentalGateExternalLinksMode)).toBeNull();
  });
});
