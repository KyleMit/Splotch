import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePerfArgs } from '../args.mjs';
import { DEVICES } from '../devices.mjs';

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

  it('yields NaN for a malformed --port without exiting when not entry', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    const parsed = parsePerfArgs({ throttleDefault: 4 }, ['--port=abc']);

    expect(parsed.port).toBeNaN();
    expect(exit).not.toHaveBeenCalled();
  });

  it('fails fast on a malformed --port for direct entry', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    parsePerfArgs({ throttleDefault: 4, entry: true }, ['--port=abc']);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('--port must be a number, got "abc"')
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('yields a NaN throttle rate for a malformed --throttle without exiting when not entry', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});

    const parsed = parsePerfArgs({ throttleDefault: 4 }, ['--throttle=abc']);

    expect(parsed.throttle.rate).toBeNaN();
    expect(exit).not.toHaveBeenCalled();
  });

  it('fails fast on a malformed --throttle for direct entry', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    parsePerfArgs({ throttleDefault: 4, entry: true }, ['--throttle=abc']);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('--throttle must be a number, got "abc"')
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
