import { describe, expect, it, vi } from 'vitest';
import { createParentGate } from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { PARENT_PLATFORM } from '../../experiments/native-architecture/src/platform/parentPlatform.ts';

// Node resolves the base platform module, which is the iOS build's: Apple's Kids Category keeps
// links that leave the app behind a grown-up check, so Never is unavailable for external links.
const RELAXED = {
  ai: 'never',
  imageReport: 'never',
  externalLinks: 'never',
  feedback: 'never',
  parentCenter: 'never',
};
const PROHIBITED_RECORD = JSON.stringify({
  version: 12,
  soundEnabled: true,
  strokeWidth: 'medium',
  eraserWidth: 'medium',
  selectedColor: 'Purple',
  customColors: [],
  appearance: 'system',
  aiEnabled: true,
  parentPolicies: RELAXED,
  coloringBookEnabled: true,
  soundLevel: 'medium',
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  orientation: 'portrait',
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: null,
  pencilEraserEnabled: true,
  applePencilSeen: false,
});

describe('the iOS external-links rule at every Parent Center boundary', () => {
  it('runs under the iOS store rules', () => {
    expect(PARENT_PLATFORM).toBe('ios');
  });

  it('reads a saved Never on external links back as Every time and still asks before a link opens', async () => {
    expect(parseSoundSettings(PROHIBITED_RECORD).parentPolicies).toEqual({
      ...RELAXED,
      externalLinks: 'always',
    });
    const storage = { read: vi.fn(async () => PROHIBITED_RECORD), write: vi.fn(async () => {}) };
    const owner = createDrawingProduct(storage, () => {});
    await owner.settings.load();
    expect(owner.getState().settings.parentPolicies.externalLinks).toBe('always');
    expect(owner.gate.requires('externalLinks')).toBe(true);
    expect(owner.gate.requires('feedback')).toBe(false);
    const follow = vi.fn();
    expect(owner.port.request('externalLinks', follow)).toBe(true);
    expect(follow).not.toHaveBeenCalled();
    expect(owner.gate.getState()).toMatchObject({ open: true, feature: 'externalLinks' });
    owner.dispose();
  });

  it('refuses to save Never on external links, from the settings owner and from Parent Center', async () => {
    const storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
    const settings = createSoundSettings(storage, () => {});
    await settings.load();
    await expect(
      settings.setParentPreferences({ aiEnabled: false, parentPolicies: RELAXED })
    ).rejects.toThrow('Parent Center choice is invalid.');
    expect(storage.write).not.toHaveBeenCalled();

    const owner = createDrawingProduct(storage, () => {});
    await owner.settings.load();
    owner.openParentCenter();
    const { x, y } = owner.gate.getState();
    owner.gate.input(String(x * y));
    owner.gate.answer();
    await owner.setPolicy('externalLinks', 'never');
    expect(storage.write).not.toHaveBeenCalled();
    expect(owner.getState().settings.parentPolicies.externalLinks).toBe('always');
    owner.dispose();
  });

  it('asks before an external link even when handed a Never policy directly', () => {
    const gate = createParentGate(
      () => RELAXED,
      () => {}
    );
    const follow = vi.fn();
    expect(gate.requires('externalLinks')).toBe(true);
    gate.request('externalLinks', follow);
    expect(follow).not.toHaveBeenCalled();
    expect(gate.getState()).toMatchObject({ open: true, feature: 'externalLinks' });
    gate.dismiss();
    const feedback = vi.fn();
    gate.request('feedback', feedback);
    expect(feedback).toHaveBeenCalledOnce();
  });
});
