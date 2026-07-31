import { describe, expect, it } from 'vitest';
import { selectedActions } from '../perf/ipad-actions.mjs';

describe('selectedActions', () => {
  it('includes the idle-frame control in complete suites and focused runs', () => {
    expect(selectedActions()).toContain('idle');
    expect(selectedActions('idle')).toEqual(new Set(['idle']));
  });
});
