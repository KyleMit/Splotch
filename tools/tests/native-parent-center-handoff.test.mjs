import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createParentGate,
  PARENT_GATE_SUCCESS_HOLD_MS,
} from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';

const ALWAYS = {
  ai: 'always',
  imageReport: 'always',
  externalLinks: 'always',
  feedback: 'always',
  parentCenter: 'always',
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fixture(policies = ALWAYS) {
  const gate = createParentGate(
    () => policies,
    () => {},
    Date.now,
    () => 0
  );
  return { gate, advance: (ms) => vi.advanceTimersByTime(ms) };
}
function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
  vi.advanceTimersByTime(PARENT_GATE_SUCCESS_HOLD_MS);
  gate.closed();
}

describe('Parent gate destination handoff', () => {
  it('cancels a solved destination after its hold and before its card exit', () => {
    const f = fixture();
    const sent = vi.fn();
    f.gate.request('feedback', sent);
    const { x, y } = f.gate.getState();
    f.gate.input(String(x * y));
    f.gate.answer();
    f.advance(PARENT_GATE_SUCCESS_HOLD_MS);
    expect(f.gate.getState().open).toBe(false);
    f.gate.cancel('feedback');
    f.gate.closed();
    expect(sent).not.toHaveBeenCalled();
    f.gate.dispose();
  });
  it('replaces a stranded solved handoff before an immediate link check', () => {
    const f = fixture();
    const sent = vi.fn();
    const link = vi.fn((proof) => expect(proof.valid()).toBe(true));
    f.gate.request('feedback', sent);
    const { x, y } = f.gate.getState();
    f.gate.input(String(x * y));
    f.gate.answer();
    f.advance(PARENT_GATE_SUCCESS_HOLD_MS);
    f.gate.request('externalLinks', link, { immediate: true });
    solve(f.gate);
    expect(link).toHaveBeenCalledOnce();
    expect(sent).not.toHaveBeenCalled();
    f.gate.dispose();
  });
  it('replaces a stranded solved handoff before a feature that bypasses its check', () => {
    const f = fixture({ ...ALWAYS, ai: 'never' });
    const sent = vi.fn();
    const ai = vi.fn();
    f.gate.request('feedback', sent);
    const { x, y } = f.gate.getState();
    f.gate.input(String(x * y));
    f.gate.answer();
    f.advance(PARENT_GATE_SUCCESS_HOLD_MS);
    f.gate.request('ai', ai);
    f.gate.closed();
    expect(ai).toHaveBeenCalledOnce();
    expect(sent).not.toHaveBeenCalled();
    f.gate.dispose();
  });
  it('keeps an executed destination proof valid when its feature is later canceled', () => {
    const f = fixture();
    let proof;
    f.gate.request('feedback', (granted) => {
      proof = granted;
    });
    solve(f.gate);
    f.gate.cancel('feedback');
    expect(proof.valid()).toBe(true);
    f.gate.dispose();
  });
});
