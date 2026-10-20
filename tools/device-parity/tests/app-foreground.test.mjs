import { describe, expect, it, vi } from 'vitest';
import {
  IOS_APP_RUNNING_FOREGROUND,
  createForegroundGuard,
  judgeForeground,
} from '../lib/app-foreground.mjs';

const APP = 'art.example.under-test';
const DOCK_FOLDER = 'com.apple.DockFolderViewService';
const IOS_APP_RUNNING_BACKGROUND = 3;

describe('judgeForeground', () => {
  it('accepts the app itself', () => {
    expect(judgeForeground({ platform: 'ios', reportedId: APP, bundleId: APP })).toEqual({
      inFront: true,
      note: null,
    });
  });

  it('accepts a hosted Apple view service while the app reports itself running in front', () => {
    const verdict = judgeForeground({
      platform: 'ios',
      reportedId: DOCK_FOLDER,
      bundleId: APP,
      appState: IOS_APP_RUNNING_FOREGROUND,
    });

    expect(verdict.inFront).toBe(true);
    expect(verdict.note).toBe(`active app reported as ${DOCK_FOLDER}; app state 4`);
  });

  it.each([
    ['the app is backgrounded', 'ios', DOCK_FOLDER, IOS_APP_RUNNING_BACKGROUND],
    ['the service is not Apple’s', 'ios', 'com.example.ViewService', IOS_APP_RUNNING_FOREGROUND],
    [
      'an Apple app is not a view service',
      'ios',
      'com.apple.springboard',
      IOS_APP_RUNNING_FOREGROUND,
    ],
    ['the platform is Android', 'android', DOCK_FOLDER, IOS_APP_RUNNING_FOREGROUND],
  ])('rejects a view service report when %s', (_, platform, reportedId, appState) => {
    expect(judgeForeground({ platform, reportedId, bundleId: APP, appState }).inFront).toBe(false);
  });
});

function fakeSession({ activeId, appState }) {
  const exec = vi.fn(async (script) => {
    if (script === 'mobile: activeAppInfo') return { bundleId: activeId };
    if (script === 'mobile: queryAppState') return appState;
    throw new Error(`unexpected ${script}`);
  });
  return { platform: 'ios', device: 'simulator', exec };
}

describe('createForegroundGuard', () => {
  it('asks for the app state only when a view service holds the active slot', async () => {
    const session = fakeSession({ activeId: APP });

    await createForegroundGuard({ session, bundleId: APP, onNote: vi.fn() })();

    expect(session.exec.mock.calls.map(([script]) => script)).toEqual(['mobile: activeAppInfo']);
  });

  it('passes and notes a view service report when the app state is 4', async () => {
    const session = fakeSession({ activeId: DOCK_FOLDER, appState: IOS_APP_RUNNING_FOREGROUND });
    const onNote = vi.fn();

    await createForegroundGuard({ session, bundleId: APP, onNote })();

    expect(onNote).toHaveBeenCalledWith(`active app reported as ${DOCK_FOLDER}; app state 4`);
  });

  it('throws on a view service report when the app is backgrounded', async () => {
    const session = fakeSession({ activeId: DOCK_FOLDER, appState: IOS_APP_RUNNING_BACKGROUND });
    const guard = createForegroundGuard({ session, bundleId: APP, onNote: vi.fn() });

    await expect(guard()).rejects.toThrow(`foreground is ${DOCK_FOLDER}, expected ${APP}`);
  });
});
