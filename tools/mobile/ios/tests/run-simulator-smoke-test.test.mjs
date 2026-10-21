import { describe, expect, it } from 'vitest';
import { SKIP_BUILD_FLAG, parseArgs, pickShutdownIphone } from '../run-simulator-smoke-test.mjs';

const iphone = (name, state, udid = name) => ({ name, state, udid });

describe('parseArgs', () => {
  it('builds unless told the app is already built', () => {
    expect(parseArgs([])).toEqual({ skipBuild: false });
    expect(parseArgs([SKIP_BUILD_FLAG])).toEqual({ skipBuild: true });
  });

  it('rejects an argument it does not know, such as the retired --skip-sync', () => {
    expect(() => parseArgs(['--skip-sync'])).toThrow(new Error('Unknown argument: --skip-sync'));
  });
});

describe('pickShutdownIphone', () => {
  it('takes a shut-down iPhone on the newest iOS runtime', () => {
    const devices = {
      'com.apple.CoreSimulator.SimRuntime.iOS-9-3': [iphone('iPhone 6', 'Shutdown')],
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [
        iphone('iPad Pro', 'Shutdown'),
        iphone('iPhone 18 Pro', 'Shutdown'),
      ],
      'com.apple.CoreSimulator.SimRuntime.watchOS-12-0': [iphone('Apple Watch', 'Shutdown')],
    };
    expect(pickShutdownIphone(devices).name).toBe('iPhone 18 Pro');
  });

  // A booted simulator belongs to whoever booted it: another session's run, or
  // a developer's open Simulator window.
  it('passes over a booted iPhone, even on a newer runtime', () => {
    const devices = {
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [iphone('iPhone 18 Pro', 'Booted')],
      'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [iphone('iPhone 17', 'Shutdown')],
    };
    expect(pickShutdownIphone(devices).name).toBe('iPhone 17');
  });

  it('fails rather than borrow a booted iPhone when none is shut down', () => {
    const devices = {
      'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [iphone('iPhone 18 Pro', 'Booted')],
    };
    expect(() => pickShutdownIphone(devices)).toThrow(/already booted/);
  });

  it('fails when no iPhone simulator is installed', () => {
    expect(() => pickShutdownIphone({})).toThrow(/No iPhone simulators available/);
  });
});
