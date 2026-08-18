// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colorContrast } from './colorContrast';
import { themes, toCssVarName, type ThemeTokens } from './tokens';

// app.css authors the scrollbar thumb's color, and an authored `scrollbar-color`
// is no longer the UA-styled control WCAG 2.2 SC 1.4.11 exempts — CSS Scrollbars
// 1 says as much where it defines the property. The thumb is then a UI component
// owing the 3:1 non-text minimum, and because the track is transparent it owes
// it against every ground it can be revealed over, not one.
//
// This reads the declaration out of app.css rather than restating the token, so
// swapping the thumb to a quieter neutral fails here instead of shipping: the
// pairing this replaced (--control-track-hover) sat at 1.4:1 in both themes.
const NON_TEXT_MIN_CONTRAST = 3;

// Grounds a scroll container paints under its own gutter: the document
// (--app-bg), every card and sheet (--surface), the sections and tiles inside
// them (--surface-2, --surface-hover), the drawing paper, and the flyouts
// floating over it. A scroller added on a new ground belongs in this list.
const SCROLLER_GROUNDS = [
  'appBg',
  'surface',
  'surface2',
  'surfaceHover',
  'paper',
  'floatSurface',
] as const satisfies readonly (keyof ThemeTokens)[];

const SCROLLBAR_COLOR = /scrollbar-color:\s*var\((--[a-z0-9-]+)\)\s+([a-z]+);/;

function scrollbarColorDeclaration() {
  const css = readFileSync(fileURLToPath(new URL('../../app.css', import.meta.url)), 'utf8');
  const match = css.match(SCROLLBAR_COLOR);
  expect(match, 'app.css declares no scrollbar-color the guard can read').not.toBeNull();
  return { thumbVar: match![1], track: match![2] };
}

function themeTokenFor(cssVar: string, theme: ThemeTokens): string {
  const key = (Object.keys(theme) as (keyof ThemeTokens)[]).find(
    (candidate) => toCssVarName(candidate) === cssVar
  );
  expect(key, `${cssVar} is not a themed token`).toBeDefined();
  return theme[key!] as string;
}

describe('the authored scrollbar thumb', () => {
  it('keeps the track transparent, so the thumb is judged on every ground below', () => {
    expect(scrollbarColorDeclaration().track).toBe('transparent');
  });

  for (const themeName of ['light', 'dark'] as const) {
    for (const ground of SCROLLER_GROUNDS) {
      it(`clears the non-text minimum on --${ground} in ${themeName} mode`, () => {
        const theme = themes[themeName];
        const { thumbVar } = scrollbarColorDeclaration();
        const thumb = themeTokenFor(thumbVar, theme);
        const groundColor = theme[ground] as string;

        expect(colorContrast(thumb, groundColor, groundColor)).toBeGreaterThanOrEqual(
          NON_TEXT_MIN_CONTRAST
        );
      });
    }
  }
});
