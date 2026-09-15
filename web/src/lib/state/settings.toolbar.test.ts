import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import { createSettings } from './settings.svelte';
import { createTool } from './tool.svelte';

beforeEach(() => localStorage.clear());

describe('toolbar appearance', () => {
  it.each([null, '', 'unknown', 'buttons'])('defaults safely for %s', (value) => {
    if (value !== null) localStorage.setItem(STORAGE_KEYS.toolbarStyle, value);
    expect(createSettings(createTool()).toolbarStyle).toBe('buttons');
  });
  it('persists both choices and restores a new instance', () => {
    const settings = createSettings(createTool());
    settings.setToolbarStyle('bare');
    expect(localStorage.getItem(STORAGE_KEYS.toolbarStyle)).toBe('bare');
    expect(createSettings(createTool()).toolbarStyle).toBe('bare');
    settings.setToolbarStyle('buttons');
    expect(createSettings(createTool()).toolbarStyle).toBe('buttons');
  });
  it('reloads a recovered durable preference', () => {
    const settings = createSettings(createTool());
    localStorage.setItem(STORAGE_KEYS.toolbarStyle, 'bare');
    settings.reloadSettings();
    expect(settings.toolbarStyle).toBe('bare');
  });
});
