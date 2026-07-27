import { describe, expect, it } from 'vitest';

describe('Vitest build defines', () => {
  it('substitutes every application build global', () => {
    expect(__APP_VERSION__).toBe('1.0.0-test');
    expect(__BUILD_TIME__).toBe('2026-01-01T00:00:00Z');
    expect(__NATIVE_API_BASE__).toBe('');
    expect(__IS_CAPACITOR__).toBe(true);
    expect(__PERF_MARKS__).toBe(false);
  });
});
