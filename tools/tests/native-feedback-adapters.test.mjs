import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const host = vi.hoisted(() => ({
  send: vi.fn(),
  files: new Map(),
  create: vi.fn(),
  failReadback: false,
}));
vi.mock('expo/fetch', () => ({ fetch: host.send }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '18.7' },
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
    write(value) {
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
} from '../../experiments/native-architecture/src/platform/feedback.ts';
import {
  feedbackTransport as webTransport,
  feedbackPolicyStorage as webPolicy,
} from '../../experiments/native-architecture/src/platform/feedback.web.ts';
import {
  FEEDBACK_POLICY_FILE,
  FEEDBACK_POLICY_KEY,
} from '../../experiments/native-architecture/src/feedback/feedbackPolicy.ts';
import { FEEDBACK_APP_VERSION } from '../../experiments/native-architecture/src/feedback/feedbackCopy.ts';
import { sendFeedback } from '../../experiments/native-architecture/src/feedback/feedbackTransport.ts';
const body = { kind: 'bug', message: 'Actual adapter fixture', hp: '' };
beforeEach(() => {
  host.files.clear();
  host.send.mockReset().mockResolvedValue(new Response('{"ok":true}'));
  host.create.mockReset();
  host.failReadback = false;
});
afterEach(() => vi.unstubAllGlobals());
describe('actual native and web feedback adapters', () => {
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
  it('reads the native Expo response stream through the real deadline reader without global fetch', async () => {
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
    const result = await sendFeedback(feedbackTransport, body, new AbortController(), () => false);
    expect(result.status).toBe('success');
    expect(host.send).toHaveBeenCalledOnce();
    expect(nativeResponse.bodyUsed).toBe(true);
    expect(globalSend).not.toHaveBeenCalled();
  });
  it('uses the actual web adapter with the same bounded-reader response contract', async () => {
    const send = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', send);
    const signal = new AbortController().signal;
    const response = await webTransport(body, signal);
    expect(send).toHaveBeenCalledWith(
      'https://splotch.art/api/report',
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
    expect(feedbackDevice()).toEqual({
      app: FEEDBACK_APP_VERSION,
      platform: 'ios',
      os: 'ios 18.7',
      screen: '400 × 800',
      pixelRatio: '3',
      display: 'Native app',
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
