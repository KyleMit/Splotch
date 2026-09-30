import { describe, expect, it } from 'vitest';
import { assertUnavailableUndoCue } from '../lib/unavailable-undo-cue.mjs';

describe('unavailable undo cue', () => {
  const cue = {
    type: 'animationstart',
    target: 'button#undoButton',
    animation: 'action-unavailable-shake',
  };
  it('accepts the recorded visual cue after its transient class is gone', () => {
    expect(() => assertUnavailableUndoCue({ activities: [cue] })).not.toThrow();
  });
  it.each([
    {},
    { activities: [] },
    { activities: [{ ...cue, type: 'click' }] },
    { activities: [{ ...cue, target: 'button#clearButton' }] },
    { activities: [{ ...cue, animation: 'unrelated-animation' }] },
  ])('rejects a tap without evidence of the unavailable animation: %j', (sample) => {
    expect(() => assertUnavailableUndoCue(sample)).toThrow('did not produce its visual cue');
  });
});
