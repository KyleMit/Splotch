// @vitest-environment happy-dom
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { bootThemeHeadTags } from '../migration/build-native-web.mjs';
import { bootAppearance } from '../../experiments/native-architecture/src/platform/bootAppearance.web.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../experiments/native-architecture/src/platform/bootTheme.ts';
import { SOUND_SETTINGS_KEY } from '../../experiments/native-architecture/src/platform/soundSettings.web.ts';
import { DRAWING_THEMES } from '../../experiments/native-architecture/src/drawing/theme.ts';

const [styleTag, scriptTag] = bootThemeHeadTags();
const script = /^<script>(.*)<\/script>$/.exec(scriptTag)[1];
const style = /^<style>(.*)<\/style>$/.exec(styleTag)[1];

// Runs the boot script against a saved settings record the way the document's head does.
function boot(saved) {
  const stamps = {};
  runInNewContext(script, {
    localStorage: { getItem: (key) => (key === SOUND_SETTINGS_KEY ? saved : null) },
    document: {
      documentElement: {
        setAttribute: (name, value) => {
          stamps[name] = value;
        },
      },
    },
  });
  return stamps;
}

afterEach(() => document.documentElement.removeAttribute(BOOT_THEME_ATTRIBUTE));

describe("the web shell's boot theme", () => {
  it('stamps a saved Light or Dark choice and leaves System to the media query', () => {
    expect(boot(JSON.stringify({ version: 13, appearance: 'dark' }))).toEqual({
      [BOOT_THEME_ATTRIBUTE]: 'dark',
    });
    expect(boot(JSON.stringify({ version: 13, appearance: 'light' }))).toEqual({
      [BOOT_THEME_ATTRIBUTE]: 'light',
    });
    expect(boot(JSON.stringify({ version: 13, appearance: 'system' }))).toEqual({});
    expect(boot(null)).toEqual({});
    expect(boot('{not json')).toEqual({});
  });

  it('paints the paper of the theme it booted in before the bundle runs', () => {
    expect(style).toBe(
      `html{background:${DRAWING_THEMES.light.paper}}` +
        `@media (prefers-color-scheme:dark){html:not([${BOOT_THEME_ATTRIBUTE}=light]){background:${DRAWING_THEMES.dark.paper}}}` +
        `html[${BOOT_THEME_ATTRIBUTE}=dark]{background:${DRAWING_THEMES.dark.paper}}`
    );
  });

  it("hands the stamped choice to the drawing screen's first frame", () => {
    expect(bootAppearance()).toBe('system');
    document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, 'dark');
    expect(bootAppearance()).toBe('dark');
    document.documentElement.setAttribute(BOOT_THEME_ATTRIBUTE, 'sepia');
    expect(bootAppearance()).toBe('system');
  });
});
