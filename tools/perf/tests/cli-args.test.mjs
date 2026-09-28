import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { DEVICES } from '../lib/profile-devices.mjs';
import { POSITIVE_INTEGER } from '../../lib/proc.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

function spyOnExit() {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process exited');
  });
  return { error, exit };
}

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

  it('reads --throttle=0 as an unthrottled run', () => {
    const parsed = parsePerfArgs({ throttleDefault: 4 }, ['--throttle=0']);

    expect(parsed.throttle).toEqual({ rate: 0, active: false, tag: 'raw', forSettings: 0 });
  });

  it('yields no throttle when throttleDefault is omitted', () => {
    const parsed = parsePerfArgs({}, ['--throttle=6']);

    expect(parsed.throttle).toBeUndefined();
  });

  it('keeps an = inside a flag value', () => {
    const url = 'http://192.168.1.5:4173/?perf=1&dev=harness';

    expect(parsePerfArgs({}, [`--url=${url}`]).flag('url')).toBe(url);
  });

  it('parses a numeric flag by the rule its caller names', () => {
    const { numberFlag } = parsePerfArgs({}, ['--repeats=6']);

    expect(numberFlag('repeats', 4, POSITIVE_INTEGER)).toBe(6);
    expect(numberFlag('cycles', 3, POSITIVE_INTEGER)).toBe(3);
  });

  it('rejects an unknown flag for direct entry and ignores it for a library import', () => {
    const { error, exit } = spyOnExit();
    const argv = ['--tubro', '--turbo', 'positional'];

    parsePerfArgs({ extra: ['turbo'] }, argv);
    expect(exit).not.toHaveBeenCalled();

    expect(() => parsePerfArgs({ extra: ['turbo'], entry: true }, argv)).toThrow('process exited');
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Unknown flag --tubro'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  // The space form was read as absent: `--device ipad --port 4100` profiled the
  // phone on 4173 and reported nothing.
  it.each([
    ['--device', ['--device', 'tablet']],
    ['--port', ['--port', '4100']],
    ['--throttle', ['--throttle']],
  ])('exits for a value flag %s written without =', (name, argv) => {
    const { error, exit } = spyOnExit();

    expect(() => parsePerfArgs({ throttleDefault: 4, entry: true }, argv)).toThrow(
      'process exited'
    );
    expect(error).toHaveBeenCalledWith(`${name} takes a value: write ${name}=<value>`);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('throws for a value flag written without = when not entry', () => {
    const { exit } = spyOnExit();

    expect(() => parsePerfArgs({}, ['--device', 'tablet'])).toThrow(
      '--device takes a value: write --device=<value>'
    );
    expect(exit).not.toHaveBeenCalled();
  });

  // `--throttle=` read as rate 0 — an unthrottled run labelled as the default.
  it.each(['--throttle=', '--port='])('exits for an empty %s', (arg) => {
    const { error, exit } = spyOnExit();

    expect(() => parsePerfArgs({ throttleDefault: 4, entry: true }, [arg])).toThrow(
      'process exited'
    );
    expect(error).toHaveBeenCalledWith(`${arg} is empty: give it a value or leave it out`);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it.each([
    ['--port=4173junk', '--port must be an integer >= 1 and <= 65535, got "4173junk"'],
    ['--port=abc', '--port must be an integer >= 1 and <= 65535, got "abc"'],
    ['--throttle=abc', '--throttle must be a number >= 0, got "abc"'],
    ['--throttle=-2', '--throttle must be a number >= 0, got "-2"'],
  ])('exits for a malformed number in %s for direct entry', (arg, message) => {
    const { error, exit } = spyOnExit();

    expect(() => parsePerfArgs({ throttleDefault: 4, entry: true }, [arg])).toThrow(
      'process exited'
    );
    expect(error).toHaveBeenCalledWith(message);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('throws for a malformed number without exiting when not entry', () => {
    const { exit } = spyOnExit();

    expect(() => parsePerfArgs({ throttleDefault: 4 }, ['--port=abc'])).toThrow(
      '--port must be an integer >= 1 and <= 65535, got "abc"'
    );
    expect(() => parsePerfArgs({ throttleDefault: 4 }, ['--throttle=abc'])).toThrow(
      '--throttle must be a number >= 0, got "abc"'
    );
    expect(exit).not.toHaveBeenCalled();
  });

  // `--no-throttle=true` read as absent, so the run stayed throttled at 4×.
  it('exits for a switch written with a value', () => {
    const { error, exit } = spyOnExit();

    expect(() =>
      parsePerfArgs({ throttleDefault: 4, entry: true }, ['--no-throttle=true'])
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledWith(
      '--no-throttle is a switch: write --no-throttle with no value'
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports a malformed --throttle even when --no-throttle wins', () => {
    expect(() =>
      parsePerfArgs({ throttleDefault: 4 }, ['--throttle=abc', '--no-throttle'])
    ).toThrow('--throttle must be a number >= 0, got "abc"');
  });
});
