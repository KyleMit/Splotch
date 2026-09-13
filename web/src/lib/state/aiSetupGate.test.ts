import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAiSettingBehindGate } from './aiSetupGate';
import {
  dismissGate,
  gate,
  GATE_SUCCESS_HOLD_MS,
  parentalGatePolicies,
  pressGateDigit,
} from './parentalGate.svelte';

function solveOpenGate() {
  for (const digit of String(gate.x * gate.y)) pressGateDigit(Number(digit));
  vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);
}

describe('setAiSettingBehindGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dismissGate();
    parentalGatePolicies.aiSetup = 'always';
    gate.sessionSolved.aiSetup = false;
  });

  afterEach(() => {
    dismissGate();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('holds switching a setting on until the AI setup check is solved', () => {
    const apply = vi.fn();

    setAiSettingBehindGate(true, apply, 'aiImageToggle');

    expect(apply).not.toHaveBeenCalled();
    expect(gate.open).toBe(true);
    expect(gate.feature).toBe('aiSetup');

    solveOpenGate();

    expect(apply).toHaveBeenCalledExactlyOnceWith(true);
    expect(gate.open).toBe(false);
  });

  it('never applies the setting when the check is closed unsolved', () => {
    const apply = vi.fn();

    setAiSettingBehindGate(true, apply, 'aiImageToggle');
    dismissGate();
    vi.advanceTimersByTime(GATE_SUCCESS_HOLD_MS);

    expect(apply).not.toHaveBeenCalled();
  });

  it('switches a setting off at once, without a check', () => {
    const apply = vi.fn();

    setAiSettingBehindGate(false, apply, 'aiImageToggle');

    expect(apply).toHaveBeenCalledExactlyOnceWith(false);
    expect(gate.open).toBe(false);
  });

  it('follows the policy Parent Center holds for AI setup', () => {
    parentalGatePolicies.aiSetup = 'never';
    const apply = vi.fn();

    setAiSettingBehindGate(true, apply, 'aiImageToggle');

    expect(apply).toHaveBeenCalledExactlyOnceWith(true);
    expect(gate.open).toBe(false);
  });

  it('flies the check in from the control that asked for it', () => {
    const control = document.createElement('button');
    control.id = 'autoSaveAiToggle';
    control.getBoundingClientRect = () => new DOMRect(10, 20, 40, 60);
    document.body.append(control);

    setAiSettingBehindGate(true, vi.fn(), 'autoSaveAiToggle');

    expect(gate.origin).toEqual({ x: 30, y: 50 });
  });
});
