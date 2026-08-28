import { describe, expect, it, vi } from 'vitest';
import {
  connectedAndroidDevices,
  deviceUptimeSecondsFrom,
  isOwnedProfilerUrl,
  refreshRateRestoreArgs,
  renderFrameRateFrom,
} from '../android/capture-browser-actions.mjs';
import { PlaywrightWebDriver } from '../lib/webdriver-client.mjs';

describe('Android web action profiling', () => {
  it('selects only ADB devices that are ready for commands', () => {
    const output = [
      'List of devices attached',
      'emulator-5554\tdevice',
      'R5CT123456\toffline',
      'ZX1G22\tunauthorized',
      '',
    ].join('\n');

    expect(connectedAndroidDevices(output)).toEqual(['emulator-5554']);
  });

  it('recognizes only profiler-owned tabs on the app origin', () => {
    const base = 'http://192.168.1.5:4173/';

    expect(isOwnedProfilerUrl(base, `${base}?perf-android-web=123`)).toBe(true);
    expect(isOwnedProfilerUrl(base, `${base}?perf-actions=456`)).toBe(true);
    expect(isOwnedProfilerUrl(base, base)).toBe(false);
    expect(isOwnedProfilerUrl(base, 'https://example.com/?perf-android-web=123')).toBe(false);
    expect(isOwnedProfilerUrl(base, 'not a URL')).toBe(false);
  });

  it('reads guest uptime from procfs output', () => {
    expect(deviceUptimeSecondsFrom('83.45 310.12')).toBe(83.45);
    expect(deviceUptimeSecondsFrom('not available')).toBe(null);
    expect(deviceUptimeSecondsFrom(undefined)).toBe(null);
  });
});

describe('Playwright WebDriver trusted touch', () => {
  it('dispatches a complete CDP touch stream at the requested coordinates', async () => {
    const cdp = { send: vi.fn() };
    const page = {
      mouse: { down: vi.fn(), move: vi.fn(), up: vi.fn() },
      viewportSize: () => ({ width: 800, height: 600 }),
    };
    const driver = new PlaywrightWebDriver(page, { cdp });

    await driver.performActions([
      {
        type: 'pointer',
        actions: [
          { type: 'pointerMove', x: 10, y: 20 },
          { type: 'pointerDown' },
          { type: 'pointerMove', x: 30, y: 40 },
          { type: 'pointerUp' },
        ],
      },
    ]);

    expect(cdp.send.mock.calls).toEqual([
      [
        'Input.dispatchTouchEvent',
        {
          type: 'touchStart',
          touchPoints: [{ id: 0, x: 10, y: 20, radiusX: 1, radiusY: 1, force: 1 }],
        },
      ],
      [
        'Input.dispatchTouchEvent',
        {
          type: 'touchMove',
          touchPoints: [{ id: 0, x: 30, y: 40, radiusX: 1, radiusY: 1, force: 1 }],
        },
      ],
      ['Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }],
    ]);
    expect(page.mouse.move).not.toHaveBeenCalled();
  });

  it('scrolls a desktop dialog with a trusted wheel over the target', async () => {
    const hover = vi.fn();
    const wheel = vi.fn();
    const page = {
      locator: vi.fn(() => ({ hover })),
      mouse: { wheel },
    };
    const driver = new PlaywrightWebDriver(page, { useWheelForScroll: true });

    await driver.scrollElementWithWheel('#coloring-book-dialog', 400);

    expect(page.locator).toHaveBeenCalledWith('#coloring-book-dialog');
    expect(hover).toHaveBeenCalledOnce();
    expect(wheel).toHaveBeenCalledWith(0, 400);
  });

  it('does not expose wheel scrolling on touch transports', async () => {
    const driver = new PlaywrightWebDriver({});

    await expect(driver.scrollElementWithWheel('#dialog', 400)).rejects.toThrow(
      'Trusted wheel scrolling is not enabled'
    );
  });
});

// The action sweep pins the panel to 60Hz (ADR-0143) and must restore exactly
// what it found — including the states that are not a number. 'null' is the
// unset key on the phone the pin was calibrated on; an empty read would
// otherwise restore via `settings put <name>` with a missing operand, which
// the device rejects while allowFailure swallows it, leaving the panel pinned
// silently forever.
describe('refresh-rate pin plumbing', () => {
  it('restores a numeric original by writing it back', () => {
    expect(refreshRateRestoreArgs('peak_refresh_rate', '120.0')).toEqual([
      'shell',
      'settings',
      'put',
      'system',
      'peak_refresh_rate',
      '120.0',
    ]);
  });

  it.each([['null'], [''], ['undefined']])('restores %j by deleting the key', (original) => {
    expect(refreshRateRestoreArgs('min_refresh_rate', original)).toEqual([
      'shell',
      'settings',
      'delete',
      'system',
      'min_refresh_rate',
    ]);
  });

  it('reads the rendered rate the display reports, not the settings write', () => {
    const dumpsys = 'DisplayDeviceInfo{..., modeId 2, renderFrameRate 60.000004, hasArrSupport...}';
    expect(renderFrameRateFrom(dumpsys)).toBe(60);
    expect(renderFrameRateFrom('no such field')).toBe(null);
    expect(renderFrameRateFrom(undefined)).toBe(null);
  });
});
