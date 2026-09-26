import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  androidCapabilitiesProblem,
  androidSdkEnvironmentState,
  appiumAndroidSdkMessage,
  appiumAndroidSdkState,
  capabilitiesFromFile,
  uiAutomator2Capabilities,
} from '../lib/appium-capabilities.mjs';

// The file the issue-2268 and issue-2225 native action sweeps ran with, verbatim
// apart from the serial. The builder exists to reproduce it.
const PROVEN_HAND_WRITTEN_FILE = {
  alwaysMatch: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:udid': 'R5CFAKESER1',
    'appium:appPackage': 'art.splotch.app',
    'appium:appActivity': '.MainActivity',
    'appium:noReset': true,
    'appium:newCommandTimeout': 600,
    'appium:systemPort': 8262,
    'appium:chromedriverPort': 9562,
  },
};

const XCUITEST_CAPABILITIES = {
  platformName: 'iOS',
  'appium:automationName': 'XCUITest',
  'appium:udid': 'R5CFAKESER1',
};

let scratch;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function writeCapabilities(value) {
  scratch = mkdtempSync(join(tmpdir(), 'appium-capabilities-'));
  const path = join(scratch, 'capabilities.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe('uiAutomator2Capabilities', () => {
  it('builds the proven hand-written UiAutomator2 set from the serial alone', () => {
    const built = uiAutomator2Capabilities({ deviceId: 'R5CFAKESER1' });

    expect(built).toStrictEqual(PROVEN_HAND_WRITTEN_FILE.alwaysMatch);
    expect(JSON.stringify(built)).toBe(JSON.stringify(PROVEN_HAND_WRITTEN_FILE.alwaysMatch));
  });

  it('passes the Android check it guards', () => {
    expect(androidCapabilitiesProblem(uiAutomator2Capabilities({ deviceId: 'x' }))).toBeNull();
  });
});

describe('androidCapabilitiesProblem', () => {
  it('refuses an XCUITest set for an Android target and names the remedy', () => {
    const problem = androidCapabilitiesProblem(XCUITEST_CAPABILITIES);

    expect(problem).toContain('"iOS"');
    expect(problem).toContain('"XCUITest"');
    expect(problem).toContain('--device-id=<serial>');
  });

  it('refuses an Android set that names no automation', () => {
    expect(androidCapabilitiesProblem({ platformName: 'Android' })).toContain('"unset"');
  });

  it('accepts either capability spelling and any letter case', () => {
    expect(
      androidCapabilitiesProblem({
        'appium:platformName': 'android',
        automationName: 'uiautomator2',
      })
    ).toBeNull();
  });
});

describe('capabilitiesFromFile', () => {
  it('unwraps an alwaysMatch file', () => {
    const path = writeCapabilities(PROVEN_HAND_WRITTEN_FILE);

    expect(capabilitiesFromFile(path)).toStrictEqual(PROVEN_HAND_WRITTEN_FILE.alwaysMatch);
  });

  it('unwraps a W3C capabilities envelope and reads a bare object as is', () => {
    const wrapped = writeCapabilities({ capabilities: PROVEN_HAND_WRITTEN_FILE });
    expect(capabilitiesFromFile(wrapped)).toStrictEqual(PROVEN_HAND_WRITTEN_FILE.alwaysMatch);
    rmSync(scratch, { recursive: true, force: true });

    const bare = writeCapabilities(XCUITEST_CAPABILITIES);
    expect(capabilitiesFromFile(bare)).toStrictEqual(XCUITEST_CAPABILITIES);
  });
});

describe('androidSdkEnvironmentState', () => {
  const base = ['PATH=/usr/bin', 'HOME=/Users/me'];

  it('finds either SDK variable', () => {
    expect(androidSdkEnvironmentState([...base, 'ANDROID_HOME=/sdk'])).toBe('present');
    expect(androidSdkEnvironmentState([...base, 'ANDROID_SDK_ROOT=/sdk'])).toBe('present');
  });

  it('reports an environment without them, or with an empty one, as missing', () => {
    expect(androidSdkEnvironmentState(base)).toBe('missing');
    expect(androidSdkEnvironmentState([...base, 'ANDROID_HOME='])).toBe('missing');
  });

  it('does not mistake an unreadable environment for a missing variable', () => {
    expect(androidSdkEnvironmentState([])).toBe('unreadable');
  });
});

describe('appiumAndroidSdkState', () => {
  const environmentOf = (entries) => () => entries;

  it('reads the loopback server listening on the Appium port', () => {
    const ports = [];
    const state = appiumAndroidSdkState('http://127.0.0.1:4733', {
      pidsFor: (port) => {
        ports.push(port);
        return ['4242'];
      },
      environmentOf: environmentOf(['PATH=/bin', 'ANDROID_HOME=/sdk']),
    });

    expect(state).toBe('present');
    expect(ports).toEqual(['4733']);
  });

  it('refuses a server started without the SDK', () => {
    const state = appiumAndroidSdkState('http://localhost:4723', {
      pidsFor: () => ['4242'],
      environmentOf: environmentOf(['PATH=/bin', 'HOME=/Users/me']),
    });

    expect(state).toBe('missing');
    expect(appiumAndroidSdkMessage('http://localhost:4723', state)).toContain(
      'restart that Appium with ANDROID_HOME exported'
    );
  });

  it('is unknown, never missing, when the server cannot be read', () => {
    const neverRead = () => {
      throw new Error('a remote server has no local process to read');
    };
    expect(
      appiumAndroidSdkState('https://hub.example.com/wd/hub', {
        pidsFor: neverRead,
        environmentOf: neverRead,
      })
    ).toBe('unknown');
    expect(
      appiumAndroidSdkState('http://127.0.0.1:4723', {
        pidsFor: () => [],
        environmentOf: neverRead,
      })
    ).toBe('unknown');
    expect(
      appiumAndroidSdkState('http://127.0.0.1:4723', {
        pidsFor: () => ['4242'],
        environmentOf: environmentOf([]),
      })
    ).toBe('unknown');
  });

  it('refuses only when every process listening on the port lacks the SDK', () => {
    const environments = {
      4242: ['PATH=/bin', 'HOME=/Users/me'],
      4343: ['PATH=/bin', 'ANDROID_HOME=/sdk'],
      4444: ['PATH=/bin', 'HOME=/Users/other'],
    };
    const stateFor = (pids) =>
      appiumAndroidSdkState('http://localhost:4723', {
        pidsFor: () => pids,
        environmentOf: (pid) => environments[pid],
      });

    expect(stateFor(['4242', '4343'])).toBe('unknown');
    expect(stateFor(['4343', '4242'])).toBe('unknown');
    expect(stateFor(['4242', '4444'])).toBe('missing');
  });

  it('warns on unknown and stays silent once the SDK is present', () => {
    expect(appiumAndroidSdkMessage('http://127.0.0.1:4723', 'unknown')).toContain('could not read');
    expect(appiumAndroidSdkMessage('http://127.0.0.1:4723', 'present')).toBeNull();
  });
});
