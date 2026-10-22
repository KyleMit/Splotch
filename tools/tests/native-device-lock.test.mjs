import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const modules = vi.hoisted(() => ({ current: {} }));
vi.mock('react-native', () => ({
  get NativeModules() {
    return modules.current;
  },
}));

const { DEVICE_LOCK_MODULE, isDeviceLocked } = await import('../../src/platform/deviceLock.ts');

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const APP = '';
const SOURCES = {
  swift: read(`${APP}ios/Splotch/SplotchDeviceLock.swift`),
  bridge: read(`${APP}ios/Splotch/SplotchDeviceLock.m`),
  project: read(`${APP}ios/Splotch.xcodeproj/project.pbxproj`),
  kotlin: read(`${APP}android/app/src/main/java/art/splotch/app/SplotchDeviceLock.kt`),
  application: read(`${APP}android/app/src/main/java/art/splotch/app/MainApplication.kt`),
};

describe('the native device lock module', () => {
  it('registers one name on both platforms, the one JavaScript asks for', () => {
    expect(SOURCES.swift).toContain(`@objc(${DEVICE_LOCK_MODULE})`);
    expect(SOURCES.bridge).toContain(`RCT_EXTERN_MODULE(${DEVICE_LOCK_MODULE}, NSObject)`);
    expect(SOURCES.bridge).toContain('RCT_EXTERN_METHOD(isLocked:');
    for (const file of [`${DEVICE_LOCK_MODULE}.swift`, `${DEVICE_LOCK_MODULE}.m`])
      expect(SOURCES.project.match(new RegExp(`${file} in Sources \\*/,`, 'g'))).toHaveLength(1);
    expect(SOURCES.kotlin).toContain(`override fun getName() = "${DEVICE_LOCK_MODULE}"`);
    expect(SOURCES.application).toContain('add(SplotchDeviceLockPackage())');
  });

  it('reads Guided Access on iOS and the lock-task mode on Android', () => {
    expect(SOURCES.swift).toContain('UIAccessibility.isGuidedAccessEnabled');
    expect(SOURCES.swift).toContain('DispatchQueue.main.async');
    expect(SOURCES.kotlin).toContain('!= ActivityManager.LOCK_TASK_MODE_NONE');
  });
});

describe('isDeviceLocked', () => {
  beforeEach(() => {
    modules.current = {};
  });

  it('answers what the native module reports', async () => {
    for (const answer of [true, false]) {
      modules.current = { [DEVICE_LOCK_MODULE]: { isLocked: vi.fn(async () => answer) } };
      expect(await isDeviceLocked()).toBe(answer);
    }
  });

  it('reads a missing module, a failed call or an unexpected answer as unlocked', async () => {
    expect(await isDeviceLocked()).toBe(false);
    modules.current = {
      [DEVICE_LOCK_MODULE]: { isLocked: vi.fn(async () => Promise.reject(new Error('no lock'))) },
    };
    expect(await isDeviceLocked()).toBe(false);
    modules.current = { [DEVICE_LOCK_MODULE]: { isLocked: vi.fn(async () => 'yes') } };
    expect(await isDeviceLocked()).toBe(false);
  });
});
