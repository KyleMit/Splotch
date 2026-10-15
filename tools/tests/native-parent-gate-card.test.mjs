import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createParentGate,
  PARENT_GATE_SUCCESS_HOLD_MS,
  PARENT_GATE_ERROR_VISIBLE_MS,
  PARENT_GATE_SHAKE_MS,
} from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { PROTECTED_PARENT_POLICIES } from '../../experiments/native-architecture/src/parentCenter/parentPolicy.ts';
import {
  GATE_LOCKOUT_MAX_MS,
  GATE_LOCKOUT_ENDED_MESSAGE,
} from '../../experiments/native-architecture/src/feedback/gateLockout.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  return {
    gate: createParentGate(
      () => PROTECTED_PARENT_POLICIES,
      () => {},
      Date.now,
      () => 0
    ),
  };
}

describe('the gate card timing and destination', () => {
  it.each([false, true])(
    'announces an expired lockout only while its card stays open: %s',
    (open) => {
      const { gate } = fixture();
      gate.request('feedback', vi.fn());
      for (let wrong = 0; wrong < 3; wrong += 1) {
        gate.answer();
        vi.advanceTimersByTime(PARENT_GATE_SHAKE_MS);
      }
      expect(gate.getState().locked).toBe(true);
      const announced = gate.getState().announcementId;
      if (!open) gate.dismiss();
      vi.advanceTimersByTime(GATE_LOCKOUT_MAX_MS + 1);
      if (!open) gate.request('feedback', vi.fn());
      expect(gate.getState()).toMatchObject({
        open: true,
        locked: false,
        message: '',
        announcement: open ? GATE_LOCKOUT_ENDED_MESSAGE : '',
      });
      expect(gate.getState().announcementId).toBe(announced + Number(open));
      gate.dispose();
    }
  );
  it('holds success before closing and hands over only after the exit, once', () => {
    const { gate } = fixture();
    const destination = vi.fn();
    gate.request('feedback', destination);
    const { x, y } = gate.getState();
    gate.input(String(x * y));
    gate.answer();
    expect(gate.getState()).toMatchObject({ open: true, unlocked: true });
    gate.closed();
    expect(destination).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PARENT_GATE_SUCCESS_HOLD_MS - 1);
    expect(gate.getState().open).toBe(true);
    vi.advanceTimersByTime(1);
    expect(gate.getState().open).toBe(false);
    expect(destination).not.toHaveBeenCalled();
    gate.closed();
    gate.closed();
    expect(destination).toHaveBeenCalledOnce();
    gate.dispose();
  });

  it('clears the wrong-answer line after shipping’s visible interval', () => {
    const { gate } = fixture();
    gate.request('feedback', vi.fn());
    gate.answer();
    expect(gate.getState().message).toBe('Not quite — try this one');
    vi.advanceTimersByTime(PARENT_GATE_ERROR_VISIBLE_MS - 1);
    expect(gate.getState().message).toBe('Not quite — try this one');
    vi.advanceTimersByTime(1);
    expect(gate.getState()).toMatchObject({ message: '', announcement: '', shaking: false });
    gate.dispose();
  });

  it('opens an immediate link within the solving tap without a success hold', () => {
    const { gate } = fixture();
    const open = vi.fn();
    gate.request('externalLinks', open, { immediate: true });
    const { x, y } = gate.getState();
    gate.input(String(x * y));
    gate.answer();
    expect(open).toHaveBeenCalledOnce();
    expect(gate.getState()).toMatchObject({ open: false, unlocked: false });
    expect(vi.getTimerCount()).toBe(0);
    gate.closed();
    expect(open).toHaveBeenCalledOnce();
    gate.dispose();
  });

  it('starts the typed answer over when retargeting a link to Parent Center', () => {
    const { gate } = fixture();
    const link = vi.fn();
    const parent = vi.fn();
    gate.request('externalLinks', link, { immediate: true });
    const { x, y } = gate.getState();
    gate.input('1');
    gate.retarget(parent);
    expect(gate.getState()).toMatchObject({ x, y, feature: 'parentCenter', input: '' });
    gate.input(String(x * y));
    gate.answer();
    expect(gate.getState().unlocked).toBe(true);
    expect(parent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PARENT_GATE_SUCCESS_HOLD_MS);
    gate.closed();
    expect(parent).toHaveBeenCalledOnce();
    expect(link).not.toHaveBeenCalled();
    gate.dispose();
  });
});
