import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureColoringPageScroll } from '../ios/capture-xcuitest-actions.mjs';

function scrollFixture(transport) {
  const bounds = { x: 0, y: 20, width: 360, height: 600 };
  const dialog = {
    open: true,
    scrollHeight: 1200,
    clientHeight: 600,
    scrollTop: 0,
    getBoundingClientRect: () => bounds,
  };
  const sample = { label: 'scroll coloring pages', postActionFrameGapsMs: [16.7] };
  const probe = { begin: vi.fn(), finish: vi.fn(() => sample) };
  const execute = async (script) =>
    runInNewContext(`(() => { ${script} })()`, {
      document: { querySelector: () => dialog },
      window: { __actionProbe: probe },
      performance: { now: () => 100 },
      innerWidth: 360,
      innerHeight: 640,
      scrollX: 0,
      scrollY: 0,
      visualViewport: { offsetLeft: 0, offsetTop: 0 },
    });
  const scroll = async () => {
    dialog.scrollTop = 270;
  };
  const client = {
    cdp: transport === 'native' ? undefined : {},
    useWheelForScroll: transport === 'wheel',
    includeBrowserChrome: false,
    scrollTouchGesture: vi.fn(scroll),
    scrollElementWithWheel: vi.fn(scroll),
    request: vi.fn(async (_method, path) => {
      if (path.endsWith('/contexts')) return ['NATIVE_APP', 'WEBVIEW_test'];
      if (path.endsWith('/context')) return {};
      if (path.endsWith('/window/rect')) return { x: 0, y: 0, width: 360, height: 640 };
      if (path.endsWith('/elements')) return [];
      if (path.endsWith('/actions')) return scroll();
      throw new Error(`Unexpected WebDriver request: ${path}`);
    }),
  };
  return { client, dialog, execute, probe, sample };
}

describe('coloring scroll dispatch and provenance', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each(['cdp', 'native', 'wheel'])(
    'records the %s gesture that actually ran',
    async (transport) => {
      const { client, dialog, execute, probe, sample } = scrollFixture(transport);
      const pending = measureColoringPageScroll(client, 'session', execute);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(client.scrollTouchGesture.mock.calls).toEqual(
        transport === 'cdp' ? [[{ x: 180, startY: 470, endY: 200, durationMs: 450 }]] : []
      );
      expect(client.scrollElementWithWheel).toHaveBeenCalledTimes(transport === 'wheel' ? 1 : 0);
      const nativeActions = client.request.mock.calls.filter(([, path]) =>
        path.endsWith('/actions')
      );
      expect(nativeActions).toHaveLength(transport === 'native' ? 1 : 0);
      expect(result).toEqual({
        sample: {
          ...sample,
          activation: transport === 'wheel' ? 'trusted-wheel' : 'native-touch',
          ...(transport === 'cdp' ? { scrollDelivery: 'cdp-synthesized-scroll' } : {}),
        },
        notApplicableReason: null,
      });
      expect(probe.begin).toHaveBeenCalledWith('scroll coloring pages', '#coloring-book-dialog', [
        transport === 'wheel' ? 'wheel' : 'pointerdown',
      ]);
      expect(probe.finish).toHaveBeenCalledWith(100);
      expect(dialog.scrollTop).toBe(0);
    }
  );

  it('does not finish a sample when Chrome rejects the gesture', async () => {
    const { client, execute, probe } = scrollFixture('cdp');
    client.scrollTouchGesture.mockRejectedValue(new Error('gesture rejected'));
    await expect(measureColoringPageScroll(client, 'session', execute)).rejects.toThrow(
      'gesture rejected'
    );
    expect(probe.finish).not.toHaveBeenCalled();
    expect(client.request.mock.calls.some(([, path]) => path.endsWith('/actions'))).toBe(false);
  });
});
