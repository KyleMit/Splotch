import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAiSettingBehindGate } from './aiSetupGate';
import { requireParentalGate } from './parentalGate.svelte';

// Stands in for the challenge itself, whose solve mechanics and policy lookup
// parentalGate.svelte.test.ts owns: this suite pins only which policy the AI
// setup controls ask, in which direction, and what a solve goes on to apply.
vi.mock('./parentalGate.svelte', () => ({ requireParentalGate: vi.fn() }));

function queuedDestination(): () => void {
  const [, destination] = vi.mocked(requireParentalGate).mock.calls[0];
  return destination;
}

describe('setAiSettingBehindGate', () => {
  afterEach(() => {
    vi.mocked(requireParentalGate).mockReset();
    document.body.replaceChildren();
  });

  it('holds switching a setting on behind the AI setup check', () => {
    const apply = vi.fn();

    setAiSettingBehindGate(true, apply, 'aiImageToggle');

    expect(requireParentalGate).toHaveBeenCalledOnce();
    expect(vi.mocked(requireParentalGate).mock.calls[0][0]).toBe('aiSetup');
    expect(apply).not.toHaveBeenCalled();
  });

  it('switches the setting on only once the check hands over', () => {
    const apply = vi.fn();

    setAiSettingBehindGate(true, apply, 'aiImageToggle');
    queuedDestination()();

    expect(apply).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('switches a setting off at once, without a check', () => {
    const apply = vi.fn();

    setAiSettingBehindGate(false, apply, 'aiImageToggle');

    expect(apply).toHaveBeenCalledExactlyOnceWith(false);
    expect(requireParentalGate).not.toHaveBeenCalled();
  });

  it('flies the check in from the control that asked for it', () => {
    const control = document.createElement('button');
    control.id = 'autoSaveAiToggle';
    control.getBoundingClientRect = () => new DOMRect(10, 20, 40, 60);
    document.body.append(control);

    setAiSettingBehindGate(true, vi.fn(), 'autoSaveAiToggle');

    expect(vi.mocked(requireParentalGate).mock.calls[0][2]).toEqual({ x: 30, y: 50 });
  });

  it('opens the check without an origin when the control is gone', () => {
    setAiSettingBehindGate(true, vi.fn(), 'aiCustomizationToggle');

    expect(vi.mocked(requireParentalGate).mock.calls[0][2]).toBeNull();
  });
});
