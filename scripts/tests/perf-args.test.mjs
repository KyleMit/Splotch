import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePerfArgs } from '../perf/args.mjs';
import { DEVICES } from '../perf/devices.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parsePerfArgs', () => {
  it('applies the common defaults', () => {
    const parsed = parsePerfArgs({ throttleDefault: 4 }, []);

    expect(parsed.deviceName).toBe('phone');
    expect(parsed.device).toBe(DEVICES.phone);
    expect(parsed.port).toBe(4173);
    expect(parsed.build).toBe(true);
    expect(parsed.throttle).toEqual({ rate: 4, active: true, tag: '4x', forSettings: 4 });
  });

  it('honors --device, --port, and --no-build overrides', () => {
    const parsed = parsePerfArgs({ throttleDefault: 4 }, [
      '--device=tablet',
      '--port=5000',
      '--no-build',
    ]);

    expect(parsed.deviceName).toBe('tablet');
    expect(parsed.device).toBe(DEVICES.tablet);
    expect(parsed.port).toBe(5000);
    expect(parsed.build).toBe(false);
  });

  it('lets --no-throttle beat --throttle=', () => {
    const parsed = parsePerfArgs({ throttleDefault: 4 }, ['--throttle=6', '--no-throttle']);

    expect(parsed.throttle).toEqual({ rate: 1, active: false, tag: 'raw', forSettings: 0 });
  });

  it('yields no throttle when throttleDefault is omitted', () => {
    const parsed = parsePerfArgs({}, ['--throttle=6']);

    expect(parsed.throttle).toBeUndefined();
  });

  it('warns about an unknown flag only for direct entry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const argv = ['--tubro', '--turbo', 'positional'];

    parsePerfArgs({ extra: ['turbo'] }, argv);
    expect(warn).not.toHaveBeenCalled();

    parsePerfArgs({ extra: ['turbo'], entry: true }, argv);
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Unknown flag --tubro'));
  });
});
