import { NETWORK_ERROR_MESSAGE } from '../../src/lib/latestRequest.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const host = vi.hoisted(() => ({
  send: vi.fn(),
  files: new Map(),
  create: vi.fn(),
  failReadback: false,
  platform: {
    OS: 'ios',
    Version: '18.7',
    constants: { Release: '14', Manufacturer: 'samsung', Model: 'SM-G990U' },
  },
}));
vi.mock('expo/fetch', () => ({ fetch: host.send }));
vi.mock('react-native', () => ({
  Platform: host.platform,
  NativeModules: { SplotchFeedbackDevice: { os: 'ios 18.7', model: 'iPhone15,2' } },
  Dimensions: { get: () => ({ width: 400, height: 800, scale: 3 }) },
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'fixture-owned-documents' },
  File: class {
    constructor(...path) {
      this.path = path.join('/');
    }
    get exists() {
      return host.files.has(this.path);
    }
    get size() {
      return new TextEncoder().encode(host.files.get(this.path) ?? '').length;
    }
    create() {
      host.create();
      host.files.set(this.path, '');
    }
    async write(value) {
      // Expo SDK 58's write() is asynchronous: the bytes land after it returns.
      await Promise.resolve();
      if (!this.exists) throw new Error('missing file');
      host.files.set(this.path, value);
    }
    async text() {
      return host.failReadback ? 'unverified' : host.files.get(this.path);
    }
  },
}));
import {
  feedbackTransport,
  feedbackDevice,
  feedbackPolicyStorage,
} from '../../src/platform/feedback.ts';
import {
  feedbackTransport as webTransport,
  feedbackPolicyStorage as webPolicy,
  feedbackDevice as webDevice,
} from '../../src/platform/feedback.web.ts';
import { FEEDBACK_POLICY_FILE, FEEDBACK_POLICY_KEY } from '../../src/feedback/feedbackPolicy.ts';
import { FEEDBACK_APP_VERSION } from '../../src/feedback/feedbackCopy.ts';
import { sendFeedback } from '../../src/feedback/feedbackTransport.ts';
import { describeDeviceInfo } from '../../src/feedback/deviceReport.ts';
import { describeDeviceInfo as shippingDeviceRows } from '../../src/lib/platform/deviceReport.ts';
const body = { kind: 'bug', message: 'Actual adapter fixture', hp: '' };
beforeEach(() => {
  host.files.clear();
  host.send.mockReset().mockResolvedValue(new Response('{"ok":true}'));
  host.create.mockReset();
  host.failReadback = false;
  host.platform.OS = 'ios';
});
afterEach(() => vi.unstubAllGlobals());
describe('actual native and web feedback adapters', () => {
  it('attempts delivery even when a navigator shim claims offline, as shipping does', async () => {
    vi.stubGlobal('navigator', { product: 'ReactNative', onLine: false });
    host.send.mockRejectedValueOnce(new TypeError('private network detail'));
    const result = await sendFeedback(feedbackTransport, body, new AbortController());
    expect(host.send).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: 'connection', message: NETWORK_ERROR_MESSAGE });
    const send = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', send);
    expect((await sendFeedback(webTransport, body, new AbortController())).status).toBe('success');
    expect(send).toHaveBeenCalledOnce();
  });
  it('uses the released Expo streaming transport with the exact hosted endpoint and no credentials or redirects', async () => {
    const signal = new AbortController().signal;
    await feedbackTransport(body, signal);
    expect(host.send).toHaveBeenCalledWith('https://splotch.art/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      credentials: 'omit',
      redirect: 'error',
    });
  });
  it('reads the native Expo response stream without global fetch', async () => {
    const globalSend = vi.fn().mockRejectedValue(new Error('Legacy fetch is outside this fixture'));
    vi.stubGlobal('fetch', globalSend);
    const encoder = new TextEncoder();
    const nativeResponse = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"ok":'));
          controller.enqueue(encoder.encode('true}'));
          controller.close();
        },
      })
    );
    host.send.mockResolvedValueOnce(nativeResponse);
    const result = await sendFeedback(feedbackTransport, body, new AbortController());
    expect(result.status).toBe('success');
    expect(host.send).toHaveBeenCalledOnce();
    expect(nativeResponse.bodyUsed).toBe(true);
    expect(globalSend).not.toHaveBeenCalled();
  });
  it('posts the actual web adapter to its own origin with the same bounded-reader response contract', async () => {
    const send = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', send);
    const signal = new AbortController().signal;
    const response = await webTransport(body, signal);
    expect(send).toHaveBeenCalledWith(
      '/api/report',
      expect.objectContaining({
        body: JSON.stringify(body),
        signal,
        credentials: 'omit',
        redirect: 'error',
      })
    );
    expect(response.body.getReader).toBeTypeOf('function');
  });
  it('collects only the opted-in diagnostic vocabulary without installation or hardware identifiers', () => {
    expect(feedbackDevice(true)).toEqual({
      app: FEEDBACK_APP_VERSION,
      platform: 'iOS',
      os: 'ios 18.7',
      device: 'Apple iPhone15,2',
      language: Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0],
      viewport: '400 × 800',
      screen: '400 × 800',
      pixelRatio: '3',
      display: 'Native app',
      online: 'Yes',
    });
  });
  it("includes shipping's current Online row in a native report snapshot", () => {
    for (const online of [true, false]) {
      expect(
        describeDeviceInfo(feedbackDevice(online)).filter((row) => row.label === 'Online')
      ).toEqual(shippingDeviceRows({ online: online ? 'Yes' : 'No' }));
    }
  });
  it('uses Android release, manufacturer and model rather than the SDK level', () => {
    host.platform.OS = 'android';
    expect(feedbackDevice(true)).toMatchObject({
      platform: 'Android',
      os: 'android 14',
      device: 'samsung SM-G990U',
    });
  });
  it('shows the shipping browser diagnostic fields and display mode', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla Android 14',
      language: 'fr-CA',
      onLine: false,
    });
    vi.stubGlobal('screen', { width: 400, height: 800 });
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 750);
    vi.stubGlobal('devicePixelRatio', 3);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(webDevice(false)).toEqual({
      app: FEEDBACK_APP_VERSION,
      platform: 'Web',
      os: 'Android 14',
      browser: 'Mozilla Android 14',
      language: 'fr-CA',
      screen: '400 × 800',
      viewport: '390 × 750',
      pixelRatio: '3',
      display: 'Browser tab',
      online: 'No',
    });
  });
  it('creates and verifies its own native policy file and round trips a deliberate parent choice', async () => {
    expect(await feedbackPolicyStorage.read()).toBeNull();
    await feedbackPolicyStorage.write('never');
    expect(host.create).toHaveBeenCalledOnce();
    expect(host.files.get('fixture-owned-documents/' + FEEDBACK_POLICY_FILE)).toBe(
      '{"version":1,"mode":"never"}'
    );
    expect(await feedbackPolicyStorage.read()).toBe('never');
  });
  it('rejects an oversized native policy before reading it', async () => {
    host.files.set('fixture-owned-documents/' + FEEDBACK_POLICY_FILE, 'x'.repeat(129));
    await expect(feedbackPolicyStorage.read()).rejects.toThrow('Invalid feedback policy');
  });
  it('does not report a native policy write as saved without readback', async () => {
    host.failReadback = true;
    await expect(feedbackPolicyStorage.write('never')).rejects.toThrow('not saved');
  });
  it('round trips through the own web key and refuses an unverified write', async () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    vi.stubGlobal('localStorage', storage);
    await webPolicy.write('session');
    expect(values.get(FEEDBACK_POLICY_KEY)).toBe('{"version":1,"mode":"session"}');
    expect(await webPolicy.read()).toBe('session');
    storage.setItem = () => {};
    await expect(webPolicy.write('never')).rejects.toThrow('not saved');
  });
});
