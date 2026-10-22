import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  modules: {},
  emitters: [],
}));
vi.mock('react-native', () => ({
  Platform: native.platform,
  NativeModules: native.modules,
  NativeEventEmitter: class {
    constructor(module) {
      this.module = module;
      this.listeners = [];
      this.remove = vi.fn();
      native.emitters.push(this);
    }
    addListener(event, listener) {
      this.listeners.push({ event, listener });
      return { remove: this.remove };
    }
  },
}));
import {
  PENCIL_DOUBLE_TAP_EVENT,
  subscribePencilDoubleTap,
} from '../../experiments/native-architecture/src/platform/pencilDoubleTap.ts';
import {
  createBrushPreferences,
  toggleEraser,
} from '../../experiments/native-architecture/src/settings/brushPreferences.ts';

const app = join(import.meta.dirname, '../../experiments/native-architecture');
join(import.meta.dirname, '../../web/src/lib');
const read = (path) => readFileSync(join(app, path), 'utf8');

function emitter() {
  return { addListener: vi.fn(), removeListeners: vi.fn() };
}
async function preferences(saved) {
  const owner = createBrushPreferences(
    { read: async () => (saved ? JSON.stringify(saved) : null), write: async () => {} },
    () => {}
  );
  await owner.load();
  return owner;
}

beforeEach(() => {
  native.platform.OS = 'ios';
  native.emitters.length = 0;
  delete native.modules.SplotchPencil;
});

describe('Apple Pencil double-tap', () => {
  it('declares the iOS emitter the JavaScript adapter listens to', () => {
    const swift = read('ios/Splotch/SplotchPencil.swift');
    expect(swift).toContain('@objc(SplotchPencil)');
    expect(swift).toContain(`private let doubleTapEvent = "${PENCIL_DOUBLE_TAP_EVENT}"`);
    expect(swift).toMatch(/window\.addInteraction\(pencil\)/);
    expect(swift).toMatch(
      /func pencilInteractionDidTap\(_ interaction: UIPencilInteraction\) \{\s*sendEvent\(withName: doubleTapEvent/
    );
    expect(read('ios/Splotch/SplotchPencil.m')).toContain(
      'RCT_EXTERN_MODULE(SplotchPencil, RCTEventEmitter)'
    );
    const xcode = read('ios/Splotch.xcodeproj/project.pbxproj');
    expect(xcode.match(/SplotchPencil\.swift in Sources/g)).toHaveLength(2);
    expect(xcode.match(/SplotchPencil\.m in Sources/g)).toHaveLength(2);
  });

  it('hears the iOS double-tap and stops on unsubscribe', () => {
    native.modules.SplotchPencil = emitter();
    const listener = vi.fn();
    const unsubscribe = subscribePencilDoubleTap(listener);
    const [bus] = native.emitters;
    expect(bus.module).toBe(native.modules.SplotchPencil);
    expect(bus.listeners).toEqual([{ event: PENCIL_DOUBLE_TAP_EVENT, listener }]);
    unsubscribe();
    expect(bus.remove).toHaveBeenCalledOnce();
  });
  it.each([
    ['Android', 'android', emitter()],
    ['an iOS build without the module', 'ios', undefined],
    ['a malformed module', 'ios', { addListener: vi.fn() }],
  ])('stays inert on %s', (_label, os, module) => {
    native.platform.OS = os;
    if (module) native.modules.SplotchPencil = module;
    const unsubscribe = subscribePencilDoubleTap(vi.fn());
    expect(native.emitters).toHaveLength(0);
    expect(unsubscribe).not.toThrow();
  });

  it('toggles the Eraser and returns to the last ink brush', async () => {
    const owner = await preferences({
      version: 1,
      brush: 'crayon',
      availability: { crayon: true, magic: true, eraser: true },
    });
    expect(toggleEraser(owner)).toBe(true);
    expect(owner.getState().brush).toBe('eraser');
    expect(toggleEraser(owner)).toBe(true);
    expect(owner.getState().brush).toBe('crayon');
  });
  it('never selects an Eraser the Actions Panel hides', async () => {
    const owner = await preferences({
      version: 1,
      brush: 'magic',
      availability: { crayon: true, magic: true, eraser: false },
    });
    expect(toggleEraser(owner)).toBe(false);
    expect(owner.getState().brush).toBe('magic');
  });
  it('ignores a double-tap before preferences load', () => {
    const owner = createBrushPreferences(
      { read: async () => null, write: async () => {} },
      () => {}
    );
    expect(toggleEraser(owner)).toBe(false);
    expect(owner.getState().brush).toBe('pen');
  });
});
