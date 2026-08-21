import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import { settingsModal, ui } from './ui.svelte';
import {
  gate,
  parentalGatePolicies,
  requireParentalGate,
  requiresParentalGate,
  pressGateDigit,
  pressGateBackspace,
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
    dismissGate();
    settingsModal.hide();
    ui.requestedSettingsSection = null;
    for (const feature of PARENTAL_GATE_FEATURES) {
      parentalGatePolicies[feature] = 'always';
      gate.sessionSolved[feature] = false;
    }
  });

  afterEach(() => {
    globalThis.Capacitor = originalCapacitor;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks every time for every feature set to that mode', () => {
    for (const feature of PARENTAL_GATE_FEATURES) {
      expect(parentalGatePolicies[feature]).toBe('always');
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
      expect(fresh.parentalGatePolicies[feature]).toBe(fresh.DEFAULT_PARENTAL_GATE_MODE);
    }
  });

  it('opens with a fresh single-digit challenge instead of running the destination', () => {
    const destination = vi.fn();
    requireParentalGate('aiImage', destination, { x: 10, y: 20 });
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

  it('solving unlocks, then closes and runs the destination after the success hold', () => {
    const destination = vi.fn();
    requireParentalGate('aiImage', destination);
    typeAnswer(correctAnswer());
    expect(gate.unlocked).toBe(true);
    expect(destination).not.toHaveBeenCalled();

    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
  });

  it('a wrong answer regenerates the problem, clears input, and shows a timed error', () => {
    requireParentalGate('aiImage', vi.fn());
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
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    requireParentalGate('aiImage', vi.fn());
    expect(correctAnswer()).toBe(String(GATE_OPERAND_MAX * GATE_OPERAND_MAX));

    pressGateDigit(5);
    expect(gate.input).toBe('5');
    pressGateBackspace();
    expect(gate.input).toBe('');
  });

  it('every-time mode asks again after a successful solve', () => {
    requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    const destination = vi.fn();
    requireParentalGate('aiImage', destination);
    expect(destination).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
  });

  it('an every-time solve does not satisfy a later switch to per-session mode', () => {
    requireParentalGate('parentCenter', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    setParentalGateMode('parentCenter', 'session');

    expect(gate.sessionSolved.parentCenter).toBe(false);
    expect(requiresParentalGate('parentCenter')).toBe(true);
  });

  it('changing a policy re-arms a previously solved per-session gate', () => {
    setParentalGateMode('feedback', 'session');
    requireParentalGate('feedback', vi.fn());
    typeAnswer(correctAnswer());
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(requiresParentalGate('feedback')).toBe(false);

    setParentalGateMode('feedback', 'always');

    expect(gate.sessionSolved.feedback).toBe(false);
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
    expect(gate.feature).toBe('feedback');
  });

  it('never mode bypasses the challenge for that feature', () => {
    setParentalGateMode('feedback', 'never');
    const destination = vi.fn();
    requireParentalGate('feedback', destination);
    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
  });

  it('retargets the open challenge at Parent Center, keeping the problem on screen', () => {
    // Pin the operands to 9×9: with a random problem, 3×3's one-digit answer
    // turns the partial "4" below into a completed wrong answer, which
    // regenerates the very problem this test asserts is kept.
    vi.spyOn(Math, 'random').mockReturnValue(MAX_OPERAND_RANDOM);
    const destination = vi.fn();
    requireParentalGate('externalLinks', destination, { x: 10, y: 20 }, { immediate: true });
    const problem = [gate.x, gate.y];
    pressGateDigit(4);

    redirectGateToParentCenter();

    expect(gate.open).toBe(true);
    expect(gate.feature).toBe('parentCenter');
    expect([gate.x, gate.y]).toEqual(problem);
    expect(gate.input).toBe('');

    // The link's immediate handoff went with the link: this solve earns the
    // success card, then Settings opens on Parent Center itself.
    typeAnswer(correctAnswer());
    expect(gate.unlocked).toBe(true);
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
    expect(destination).not.toHaveBeenCalled();
    expect(ui.requestedSettingsSection).toBe('parentCenter');
    expect(settingsModal.open).toBe(true);
    expect(settingsModal.origin).toEqual({ x: 10, y: 20 });
  });

  it('hands straight over when Parent Center asks for no check of its own', () => {
    setParentalGateMode('parentCenter', 'never');
    const destination = vi.fn();
    requireParentalGate('feedback', destination);

    redirectGateToParentCenter();

    expect(gate.open).toBe(false);
    expect(destination).not.toHaveBeenCalled();
    expect(ui.requestedSettingsSection).toBe('parentCenter');
    expect(settingsModal.open).toBe(true);
  });

  it('hands Parent Center off to a caller-provided destination', () => {
    setParentalGateMode('parentCenter', 'never');
    const origin = { x: 12, y: 34 };
    requireParentalGate('externalLinks', vi.fn(), origin);
    const destination = vi.fn();

    redirectGateToParentCenter(destination);

    expect(gate.open).toBe(false);
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
      expect(parentalGatePolicies[feature]).toBe(mode);
      expect(localStorage.getItem(storageKeyByFeature[feature])).toBe(mode);
    });
  });

  it('an immediate solve hands off synchronously and counts for per-session mode', () => {
    setParentalGateMode('externalLinks', 'session');
    const destination = vi.fn();
    requireParentalGate('externalLinks', destination, null, { immediate: true });
    typeAnswer(correctAnswer());

    expect(destination).toHaveBeenCalledOnce();
    expect(gate.open).toBe(false);
    expect(gate.sessionSolved.externalLinks).toBe(true);
    expect(requiresParentalGate('externalLinks')).toBe(false);
  });

  it('dismissing discards input and the destination without recording a solve', () => {
    setParentalGateMode('feedback', 'session');
    const destination = vi.fn();
    requireParentalGate('feedback', destination);
    pressGateDigit(4);
    dismissGate();
    expect(gate.open).toBe(false);
    expect(gate.input).toBe('');
    expect(gate.sessionSolved.feedback).toBe(false);
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS * 2);
    expect(destination).not.toHaveBeenCalled();
  });

  it('ignores keypad input while closed or already unlocked', () => {
    pressGateDigit(5);
    expect(gate.input).toBe('');

    requireParentalGate('aiImage', vi.fn());
    typeAnswer(correctAnswer());
    const solvedInput = gate.input;
    pressGateDigit(1);
    pressGateBackspace();
    expect(gate.input).toBe(solvedInput);
  });

  it('reloads valid stored modes, rejects garbage, and migrates the legacy AI choice', () => {
    localStorage.setItem(STORAGE_KEYS.parentalGateFeedbackMode, 'session');
    localStorage.setItem(STORAGE_KEYS.parentalGateParentCenterMode, 'never');
    reloadParentalGate();
    expect(parentalGatePolicies.feedback).toBe('session');
    expect(parentalGatePolicies.parentCenter).toBe('never');

    localStorage.setItem(STORAGE_KEYS.parentalGateFeedbackMode, 'sparkles');
    reloadParentalGate();
    expect(parentalGatePolicies.feedback).toBe('session');

    localStorage.removeItem(STORAGE_KEYS.parentalGateAiImageMode);
    localStorage.setItem(STORAGE_KEYS.legacyGateRememberMode, 'forever');
    reloadParentalGate();
    expect(parentalGatePolicies.aiImage).toBe('always');

    localStorage.setItem(STORAGE_KEYS.legacyGateUnlockedForever, 'true');
    reloadParentalGate();
    expect(parentalGatePolicies.aiImage).toBe('never');
  });

  it.each(['web', 'android'] as const)('allows Never for external links on %s', (platform) => {
    globalThis.Capacitor = platform === 'android' ? { getPlatform: () => platform } : undefined;
    expect(isParentalGateModeAvailable('externalLinks', 'never', platform)).toBe(true);

    setParentalGateMode('externalLinks', 'never');
    expect(parentalGatePolicies.externalLinks).toBe('never');
    expect(localStorage.getItem(STORAGE_KEYS.parentalGateExternalLinksMode)).toBe('never');
  });

  it('rejects Never for external links from both storage and direct updates on iOS', () => {
    globalThis.Capacitor = { getPlatform: () => 'ios' };
    expect(isParentalGateModeAvailable('externalLinks', 'never', 'ios')).toBe(false);
    localStorage.setItem(STORAGE_KEYS.parentalGateExternalLinksMode, 'never');
    reloadParentalGate();
    expect(parentalGatePolicies.externalLinks).toBe('always');

    localStorage.removeItem(STORAGE_KEYS.parentalGateExternalLinksMode);
    expect(() => setParentalGateMode('externalLinks', 'never')).toThrow(
      'Unsupported parental gate mode: externalLinks/never'
    );
    expect(parentalGatePolicies.externalLinks).toBe('always');
    expect(localStorage.getItem(STORAGE_KEYS.parentalGateExternalLinksMode)).toBeNull();
  });
});
