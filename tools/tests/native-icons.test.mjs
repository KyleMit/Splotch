import { describe, expect, it } from 'vitest';
import {
  generateNativeIcons,
  nativeIconSource,
  NATIVE_ICON_SOURCES,
} from '../migration/gen-native-icons.mjs';
import { NATIVE_ICONS } from '../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import { iconTokenEntries } from '../../web/src/lib/design/iconTokens.ts';

describe('native drawing toolbar icons generated from the shipping icon set', () => {
  it('pins the committed module to the current shipping SVGs', async () => {
    expect(await generateNativeIcons(['--check'])).toEqual({
      icons: Object.keys(NATIVE_ICON_SOURCES).length,
    });
    expect(Object.keys(NATIVE_ICONS)).toEqual(Object.keys(NATIVE_ICON_SOURCES));
  });

  it('resolves themed icon parts per theme and re-inks monochrome glyphs through currentColor', () => {
    const handle = iconTokenEntries().find((entry) => entry.cssVar === '--icon-brush-magic-handle');
    expect(NATIVE_ICONS['brush-magic'].light).toContain(`fill="${handle.light}"`);
    expect(NATIVE_ICONS['brush-magic'].dark).toContain(`fill="${handle.dark}"`);
    expect(NATIVE_ICONS.settings.light).toMatch(/^<svg [^>]*fill="currentColor"/);
    for (const icon of Object.values(NATIVE_ICONS))
      for (const markup of Object.values(icon)) expect(markup).not.toMatch(/var\(|style=/);
  });

  it('refuses an icon styled by page tokens the native renderer cannot resolve', () => {
    expect(() => nativeIconSource({ 'size-eraser-1': 'size-eraser-1.svg' })).toThrow(
      'Unsupported styling in native icon size-eraser-1'
    );
  });

  it('rejects unsupported generator arguments before changing files', async () => {
    await expect(generateNativeIcons(['--write'])).rejects.toThrow('Only --check is supported.');
  });
});
