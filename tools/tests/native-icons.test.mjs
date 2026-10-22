import { COLOR_ICONS } from '../../web/src/lib/components/iconTypes.ts';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  generateNativeIcons,
  nativeIconModules,
  shippingIconFiles,
  themedIcon,
  NATIVE_STARTUP_ICONS,
} from '../migration/gen-native-icons.mjs';
import {
  NATIVE_ICONS,
  SPLOTCHY_ICON_NAME,
} from '../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import { NATIVE_DEFERRED_ICONS } from '../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts';
import { NATIVE_SPLOTCHY } from '../../experiments/native-architecture/src/rsdDrawing/splotchy.generated.ts';
import { iconTokenEntries } from '../../web/src/lib/design/iconTokens.ts';
import { brand, themes } from '../../web/src/lib/design/tokens.ts';
import { NON_RENDERABLE_ICONS } from '../../web/src/lib/components/iconTypes.ts';

const ICON_DIR = new URL('../../web/src/lib/icons/', import.meta.url);
const SVG_ROOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">';
const allNativeIcons = { ...NATIVE_ICONS, ...NATIVE_DEFERRED_ICONS };
const iconPart = (cssVar) => iconTokenEntries().find((entry) => entry.cssVar === cssVar);

let scratch;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

function scratchIconDir() {
  scratch = mkdtempSync(join(tmpdir(), 'native-icons-'));
  cpSync(ICON_DIR, scratch, { recursive: true });
  return `${scratch}/`;
}

describe('native icon registry generated from the shipping icon set', () => {
  it('pins the committed modules to the current shipping SVGs', async () => {
    const shipping = [...shippingIconFiles().keys()];
    expect(await generateNativeIcons(['--check'])).toEqual({
      startup: NATIVE_STARTUP_ICONS.length,
      deferred: shipping.length - NATIVE_STARTUP_ICONS.length,
    });
    expect(Object.keys(NATIVE_ICONS)).toEqual(NATIVE_STARTUP_ICONS);
    expect(Object.keys(allNativeIcons).sort()).toEqual(shipping);
    expect(NON_RENDERABLE_ICONS).toEqual([SPLOTCHY_ICON_NAME]);
    expect(NATIVE_SPLOTCHY).toBe(readFileSync(new URL('splotchy.svg', ICON_DIR), 'utf8').trim());
  });

  it.each([
    ['an added icon', (dir) => writeFileSync(`${dir}deferred/added.svg`, `${SVG_ROOT}</svg>`)],
    [
      'a changed icon',
      (dir) =>
        writeFileSync(
          `${dir}deferred/lock.svg`,
          readFileSync(`${dir}deferred/lock.svg`, 'utf8').replace('d="M', 'd="M1 1M')
        ),
    ],
    [
      'a renamed icon',
      (dir) => {
        cpSync(`${dir}close.svg`, `${dir}dismiss.svg`);
        rmSync(`${dir}close.svg`);
      },
    ],
  ])('fails the check after %s until the modules are regenerated', async (_, edit) => {
    const iconDir = scratchIconDir();
    edit(iconDir);
    await expect(generateNativeIcons(['--check'], nativeIconModules({ iconDir }))).rejects.toThrow(
      'Native icon drift: icons.deferred.generated.ts'
    );
  });

  it('resolves every themed part per theme and keeps fixed palettes unthemed', () => {
    const handle = iconPart('--icon-brush-magic-handle');
    expect(NATIVE_DEFERRED_ICONS['brush-magic'].light).toContain(`fill="${handle.light}"`);
    expect(NATIVE_DEFERRED_ICONS['brush-magic'].dark).toContain(`fill="${handle.dark}"`);
    const night = iconPart('--icon-appearance-night');
    expect(NATIVE_DEFERRED_ICONS.appearance.dark).toContain(`fill="${night.dark}"`);
    for (const theme of ['light', 'dark']) {
      const eraser = NATIVE_DEFERRED_ICONS['size-eraser-3'][theme];
      expect(eraser).toContain(`fill="${themes[theme].paper}"`);
      expect(eraser).toContain(`stroke="${themes[theme].holeStroke}"`);
      expect(eraser).toContain('stroke-dasharray="46.43 39.29"');
    }
    expect(NATIVE_DEFERRED_ICONS['dottie-giggle'].dark).toContain(`fill="${brand.brand}"`);
    expect(NATIVE_DEFERRED_ICONS['dottie-giggle'].light).toBe(
      NATIVE_DEFERRED_ICONS['dottie-giggle'].dark
    );
    for (const icon of Object.values(allNativeIcons))
      for (const markup of Object.values(icon)) expect(markup).not.toMatch(/var\(|style=/);
  });

  it('re-inks exactly the icons shipping re-inks, through currentColor', () => {
    const colorIcons = COLOR_ICONS;
    expect(colorIcons.has('camera')).toBe(true);
    const roots = Object.entries(allNativeIcons).map(([name, icon]) => ({
      name,
      root: /^<svg [^>]*>/.exec(icon.light)[0],
    }));
    const monochrome = roots.filter(({ name }) => !colorIcons.has(name));
    expect(monochrome.length).toBeGreaterThan(30);
    expect(monochrome.filter(({ root }) => !root.includes('fill="currentColor"'))).toEqual([]);
    expect(
      roots.filter(({ name, root }) => colorIcons.has(name) && root.includes(themes.light.iconInk))
    ).toEqual([]);
    expect(NATIVE_DEFERRED_ICONS.github.light).toMatch(/^<svg [^>]*fill="currentColor"/);
    expect(NATIVE_DEFERRED_ICONS.appearance.light).not.toMatch(/^<svg [^>]*fill=/);
  });

  it('refuses a token the shipping theme does not declare or whose fallback disagrees', () => {
    const styled = (style) => `${SVG_ROOT}<path style="${style}" d="M0 0"/></svg>`;
    expect(() =>
      themedIcon('probe', styled('fill:var(--missing,#000)'), 'dark', { colorIcon: true })
    ).toThrow('Unresolved icon token --missing in probe');
    expect(() =>
      themedIcon('probe', styled('fill:var(--paper,#000000)'), 'dark', { colorIcon: true })
    ).toThrow('Unresolved icon token --paper in probe');
  });

  it('refuses a monochrome glyph baking an ink the shipping re-ink would not replace', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" fill="#000" viewBox="0 0 1 1"></svg>';
    expect(() => themedIcon('probe', svg, 'light', { colorIcon: false })).toThrow(
      'Monochrome icon probe bakes #000, not the light icon ink'
    );
  });

  it('rejects unsupported generator arguments before changing files', async () => {
    await expect(generateNativeIcons(['--write'])).rejects.toThrow('Only --check is supported.');
  });
});
