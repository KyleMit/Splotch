import { describe, expect, it, vi } from 'vitest';
import {
  grantLogLine,
  handCaptureArgs,
  handItemInstructions,
  operatorSessionPlan,
  runHandItem,
} from '../run-operator-session.mjs';
import { openWithDevicectl, runtimeUaProblem } from '../split-capture/capture-hand-input.mjs';

// Real user agents from tracked captures: the Safari one is from the mislabeled
// 2026-08-24 hand capture this check exists to refuse, the WKWebView one from
// the 2026-08-25 delivery control, the Android pair from the hand corpus.
const IPAD_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15';
const IPAD_WKWEBVIEW_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID_WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 16; SM-G990U1 Build/BP2A.250705.008; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/151.0.7922.169 Mobile Safari/537.36';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 16; SM-G990U1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.169 Mobile Safari/537.36';

describe('runtimeUaProblem', () => {
  it('refuses a Safari page labelled as the WKWebView — the PR 1314 review finding', () => {
    expect(runtimeUaProblem('ios-capacitor-webview', IPAD_SAFARI_UA)).toMatch(/Safari/);
    expect(runtimeUaProblem('ios-capacitor-webview', IPAD_WKWEBVIEW_UA)).toBeNull();
  });

  it('holds each runtime to its own signature', () => {
    expect(runtimeUaProblem('ios-safari', IPAD_SAFARI_UA)).toBeNull();
    expect(runtimeUaProblem('ios-safari', IPAD_WKWEBVIEW_UA)).toMatch(/not Safari/);
    expect(runtimeUaProblem('android-capacitor-webview', ANDROID_WEBVIEW_UA)).toBeNull();
    expect(runtimeUaProblem('android-capacitor-webview', ANDROID_CHROME_UA)).toMatch(/WebView/);
    expect(runtimeUaProblem('android-chrome', ANDROID_CHROME_UA)).toBeNull();
    expect(runtimeUaProblem('android-chrome', ANDROID_WEBVIEW_UA)).toMatch(/WebView/);
  });

  it('refuses a missing user agent rather than passing it', () => {
    expect(runtimeUaProblem('ios-capacitor-webview', undefined)).toMatch(/unverifiable/);
  });
});

describe('operatorSessionPlan', () => {
  it('expands hand steps across brushes and orientations for attached devices', () => {
    const plan = operatorSessionPlan({
      steps: ['grant', 'android-hand', 'ios-hand'],
      brushes: ['pen', 'crayon'],
      orientations: ['PORTRAIT', 'LANDSCAPE'],
      androidSerial: 'R5CRC3AVCXM',
      iosUdid: '00008103-0006202E3CF1001E',
    });
    expect(plan.filter((item) => item.step === 'grant')).toHaveLength(1);
    expect(plan.filter((item) => item.step === 'android-hand')).toHaveLength(4);
    expect(plan.filter((item) => item.step === 'ios-hand')).toHaveLength(4);
    expect(plan.every((item) => item.skipped === null)).toBe(true);
    expect(plan.find((item) => item.step === 'ios-hand').device).toBe('00008103-0006202E3CF1001E');
    expect(plan.find((item) => item.step === 'android-hand').device).toBe('R5CRC3AVCXM');
  });

  it('marks a missing device as skipped rather than dropping its items', () => {
    const plan = operatorSessionPlan({ androidSerial: 'serial', iosUdid: null });
    const ios = plan.filter((item) => item.step === 'ios-hand' || item.step === 'grant');
    expect(ios.length).toBeGreaterThan(0);
    expect(ios.every((item) => item.skipped?.includes('iPad'))).toBe(true);
    expect(plan.filter((item) => item.step === 'android-hand').every((i) => !i.skipped)).toBe(true);
  });

  it('rejects an unknown step, brush, or orientation by throwing', () => {
    expect(() => operatorSessionPlan({ steps: ['grant', 'reboot'] })).toThrow(/unknown step/);
    expect(() => operatorSessionPlan({ brushes: ['chalk'] })).toThrow(/unknown brush/);
    expect(() => operatorSessionPlan({ orientations: ['UPSIDE_DOWN'] })).toThrow(
      /unknown orientation/
    );
  });
});

describe('handCaptureArgs', () => {
  const base = {
    brush: 'pen',
    orientation: 'PORTRAIT',
    theme: 'light',
    seconds: 25,
    outputDir: 'perf-profiles/split-capture/hand-native/2026-08-25T03-00-00.000Z',
  };

  it('drives Android through adb and the iPad through a deterministic devicectl launch', () => {
    const android = handCaptureArgs({
      ...base,
      platform: 'android',
      host: 'http://192.168.40.53:4175',
      device: 'R5CRC3AVCXM',
    });
    expect(android.args).toContain('--open=adb');
    expect(android.args).toContain('--device-serial=R5CRC3AVCXM');
    const ios = handCaptureArgs({
      ...base,
      platform: 'ios',
      host: 'http://192.168.40.53:4175',
      device: '00008103-0006202E3CF1001E',
    });
    expect(ios.args).toContain('--open=devicectl');
    expect(ios.args).toContain('--device-udid=00008103-0006202E3CF1001E');
    expect(ios.args.some((arg) => arg === '--open=manual')).toBe(false);
  });

  it('always captures the native runtime and writes the artifact under the session dir', () => {
    const { label, output, args } = handCaptureArgs({
      ...base,
      platform: 'ios',
      brush: 'crayon',
      host: 'http://h:1',
      device: 'udid',
    });
    expect(args).toContain('--native-app');
    expect(label).toBe('hand-ios-native-crayon-portrait-light');
    expect(output).toContain(base.outputDir);
    expect(args).toContain(`--output=${output}`);
  });
});

describe('runHandItem', () => {
  const item = {
    step: 'ios-hand',
    platform: 'ios',
    device: 'udid',
    brush: 'pen',
    orientation: 'PORTRAIT',
    theme: 'light',
  };
  const deps = (status) => ({
    host: 'http://h:1',
    seconds: 1,
    outputDir: 'out',
    ask: async () => {},
    spawnChild: vi.fn(() => ({ status })),
  });

  it('maps the child exit status to the item verdict', async () => {
    expect((await runHandItem(item, deps(0))).status).toBe('pass');
    expect((await runHandItem(item, deps(1))).status).toBe('fail');
  });

  it('fails cleanly when the device disappeared instead of passing null to the child', async () => {
    const d = deps(0);
    const result = await runHandItem({ ...item, device: null }, d);
    expect(result.status).toBe('fail');
    expect(d.spawnChild).not.toHaveBeenCalled();
  });
});

describe('handItemInstructions', () => {
  // Only Android's opener applies the requested orientation; an iOS landscape
  // item depends on the operator physically rotating the device, and silently
  // accepting the plan without saying so burns the readiness timeout instead.
  it('tells the operator to rotate for a non-portrait iOS item, and only then', () => {
    const landscape = handItemInstructions({ platform: 'ios', orientation: 'LANDSCAPE' });
    expect(landscape.join(' ')).toMatch(/ROTATE THE IPAD to landscape/);
    expect(handItemInstructions({ platform: 'ios', orientation: 'PORTRAIT' })).toEqual([]);
    expect(handItemInstructions({ platform: 'android', orientation: 'LANDSCAPE' })).toEqual([]);
  });
});

describe('grant log', () => {
  it('flattens multi-line Appium detail so a row stays one TSV line', () => {
    const line = grantLogLine({
      timestamp: '2026-08-25T02:06:14.384Z',
      udid: 'udid',
      outcome: 'blocked',
      detail: 'xcodebuild failed\twith code 65.\nRun the xcodebuild line by hand.',
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toMatch(/\n/);
    expect(line.split('\t')).toHaveLength(4);
  });
});

describe('openWithDevicectl', () => {
  it('launches the installed bundle with terminate-existing so the page reloads fresh', () => {
    const exec = vi.fn();
    openWithDevicectl({ udid: '00008103-0006202E3CF1001E', exec });
    const [command, args] = exec.mock.calls[0];
    expect(command).toBe('xcrun');
    expect(args).toContain('--terminate-existing');
    expect(args).toContain('00008103-0006202E3CF1001E');
    expect(args.at(-1)).toBe('art.splotch.app');
  });
});

describe('the rotate instruction reaches the operator', () => {
  // The pure builder was tested while its call site was not, and deleting the
  // print left every test green — the exact chooser-vs-call-site gap this
  // file tree keeps re-learning.
  it('prints the instruction lines before asking for Enter', async () => {
    const printed = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line) => printed.push(String(line)));
    try {
      await runHandItem(
        {
          step: 'ios-hand',
          platform: 'ios',
          device: 'udid',
          brush: 'pen',
          orientation: 'LANDSCAPE',
          theme: 'light',
        },
        {
          host: 'http://h:1',
          seconds: 1,
          outputDir: 'out',
          ask: async () => {},
          spawnChild: () => ({ status: 0 }),
        }
      );
    } finally {
      spy.mockRestore();
    }
    expect(printed.join(' ')).toMatch(/ROTATE THE IPAD to landscape/);
  });
});
