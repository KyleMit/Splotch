import { describe, expect, it, vi } from 'vitest';
import {
  createInstallPrompt,
  installDeviceOs,
  manualInstallMode,
  SETTLED_IN_STROKES,
  STROKES_BEFORE_AUTO_CLEAR,
} from '../../experiments/native-architecture/src/install/installPolicy.ts';
import { STORAGE_KEYS } from '../../web/src/lib/storageKeys.ts';

const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const device = (userAgent, extra = {}) => ({
  userAgent,
  platform: '',
  maxTouchPoints: 0,
  standalone: false,
  ...extra,
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    read: (key) => values.get(key) ?? null,
    write: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function promptEvent(outcome) {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  };
}

const androidOwner = (storage = memoryStorage()) =>
  createInstallPrompt({ device: device(ANDROID_CHROME), storage });

describe('device detection', () => {
  it.each([
    [device(ANDROID_CHROME), 'android', 'android'],
    [device(IPHONE_SAFARI), 'ios', 'ios'],
    [device(IPHONE_CHROME), 'ios', 'none'],
    [device(MAC_SAFARI, { platform: 'MacIntel', maxTouchPoints: 5 }), 'ios', 'ios'],
    [device(MAC_SAFARI, { platform: 'MacIntel' }), 'desktop', 'none'],
  ])('classifies %o', (subject, os, mode) => {
    expect(installDeviceOs(subject)).toBe(os);
    expect(manualInstallMode(subject)).toBe(mode);
  });

  it('marks an app-like launch as installed with nothing to offer', () => {
    const storage = memoryStorage();
    const owner = createInstallPrompt({
      device: device(ANDROID_CHROME, { standalone: true }),
      storage,
    });
    expect(owner.snapshot()).toEqual({ mode: 'none', installed: true, stage: null });
    expect(storage.values.get(STORAGE_KEYS.installCompleted)).toBe('true');
  });
});

describe('dismissal and re-prompts', () => {
  it('persists a dismissal in the shipping key and format', () => {
    const storage = memoryStorage();
    const owner = androidOwner(storage);
    expect(owner.snapshot().stage).toBe('initial');
    owner.dismiss();
    expect(owner.snapshot().stage).toBeNull();
    expect(storage.values.get(STORAGE_KEYS.installDismissed)).toBe('true');
    expect(androidOwner(storage).snapshot().stage).toBeNull();
  });

  it('returns after five settled-in sessions, then once more after ten, then never', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.installDismissed]: 'true' });
    const stages = [];
    for (let session = 1; session <= 12; session++) {
      const owner = androidOwner(storage);
      owner.recordSession(SETTLED_IN_STROKES - 1);
      owner.recordSession(SETTLED_IN_STROKES);
      owner.recordSession(SETTLED_IN_STROKES + 1);
      const stage = owner.snapshot().stage;
      stages.push(stage);
      if (stage) owner.dismiss();
    }
    expect(stages.indexOf('returning')).toBe(4);
    expect(stages.indexOf('final')).toBe(9);
    expect(stages.filter(Boolean)).toEqual(['returning', 'final']);
    expect(storage.values.get(STORAGE_KEYS.installRepromptsUsed)).toBe('2');
  });

  it('does not count the session a dismissal happened in', () => {
    const storage = memoryStorage();
    const owner = androidOwner(storage);
    owner.dismiss();
    owner.recordSession(SETTLED_IN_STROKES);
    expect(storage.values.has(STORAGE_KEYS.installRepromptSessionCount)).toBe(false);
  });

  it('auto-dismisses after the shipping stroke countdown', () => {
    const owner = androidOwner();
    owner.armAutoClear(SETTLED_IN_STROKES);
    owner.armAutoClear(SETTLED_IN_STROKES + 2);
    const due = SETTLED_IN_STROKES + STROKES_BEFORE_AUTO_CLEAR;
    expect(owner.autoDismissIfDue(due - 1)).toBe(false);
    expect(owner.autoDismissIfDue(due)).toBe(true);
    expect(owner.snapshot().stage).toBeNull();
  });

  it('restarts the countdown after it is disarmed', () => {
    const owner = androidOwner();
    owner.armAutoClear(3);
    owner.disarmAutoClear();
    owner.armAutoClear(10);
    expect(owner.autoDismissIfDue(3 + STROKES_BEFORE_AUTO_CLEAR)).toBe(false);
  });
});

describe('the browser install prompt', () => {
  it('captures beforeinstallprompt and installs on acceptance', async () => {
    const storage = memoryStorage({ [STORAGE_KEYS.installDismissed]: 'true' });
    const owner = androidOwner(storage);
    const listener = vi.fn();
    owner.subscribe(listener);
    const event = promptEvent('accepted');
    owner.capture(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(owner.snapshot().mode).toBe('oneTap');
    await expect(owner.prompt()).resolves.toBe('accepted');
    expect(owner.snapshot()).toEqual({ mode: 'none', installed: true, stage: null });
    expect(storage.values.get(STORAGE_KEYS.installCompleted)).toBe('true');
    expect(storage.values.has(STORAGE_KEYS.installDismissed)).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('drops a declined prompt to the manual steps and dismisses the banner', async () => {
    const owner = androidOwner();
    owner.capture(promptEvent('dismissed'));
    await expect(owner.prompt()).resolves.toBe('dismissed');
    expect(owner.snapshot()).toEqual({ mode: 'android', installed: false, stage: null });
    await expect(owner.prompt()).resolves.toBe('unavailable');
  });

  it('reports a stale prompt as unavailable', async () => {
    const owner = androidOwner();
    owner.capture({ ...promptEvent('accepted'), prompt: () => Promise.reject(new Error('gone')) });
    await expect(owner.prompt()).resolves.toBe('unavailable');
    expect(owner.snapshot().mode).toBe('android');
  });

  it('lets a later prompt clear a stale installed flag', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.installCompleted]: 'true' });
    const owner = androidOwner(storage);
    expect(owner.snapshot().installed).toBe(true);
    owner.capture(promptEvent('accepted'));
    expect(owner.snapshot()).toEqual({ mode: 'oneTap', installed: false, stage: 'initial' });
    expect(storage.values.get(STORAGE_KEYS.installCompleted)).toBe('false');
  });

  it('marks appinstalled from any install path', () => {
    const owner = androidOwner();
    owner.markInstalled();
    expect(owner.snapshot().installed).toBe(true);
  });
});
