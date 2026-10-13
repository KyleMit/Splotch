import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scale } from '../../web/src/lib/design/tokens.ts';
import {
  SHIPPING_FONT_DISPLAY,
  SHIPPING_FONT_FAMILY,
  SHIPPING_FONT_SUBSETS,
  SHIPPING_FONT_WEIGHT_RANGE,
} from '../../experiments/native-architecture/src/platform/shippingFontFaces.ts';

const FONT_PACKAGE = '@fontsource-variable/quicksand';
const app = new URL('../../experiments/native-architecture/', import.meta.url);
const read = (path) => readFileSync(new URL(path, app), 'utf8');
const packageCss = readFileSync(
  fileURLToPath(import.meta.resolve(`${FONT_PACKAGE}/index.css`)),
  'utf8'
);

function fontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
    const descriptor = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1].trim();
    return {
      family: descriptor('font-family')?.replace(/^'(.*)'$/, '$1'),
      weight: descriptor('font-weight'),
      display: descriptor('font-display'),
      file: /url\(\.\/files\/([^)]+)\)/.exec(body)?.[1],
      unicodeRange: descriptor('unicode-range'),
    };
  });
}

// Each subset's file as shippingFont.web.ts binds it: the import that names the
// file, then the SUBSET_FILES entry that names that import.
function registeredSubsetFiles(webSource) {
  const files = new Map(
    [...webSource.matchAll(/^import (\w+) from '([^']+\.woff2)';$/gm)].map(([, name, path]) => [
      name,
      path,
    ])
  );
  const table = /const SUBSET_FILES[^=]*=\s*\{([^}]*)\}/.exec(webSource)?.[1] ?? '';
  return Object.fromEntries(
    table
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [key, name = key] = entry.split(':').map((part) => part.trim());
        const path = files.get(name) ?? '';
        const prefix = `${FONT_PACKAGE}/files/`;
        return [
          key.replace(/^'(.*)'$/, '$1'),
          path.startsWith(prefix) ? path.slice(prefix.length) : path,
        ];
      })
  );
}

function assertRegisteredFaces(css, webSource, subsets = SHIPPING_FONT_SUBSETS) {
  const files = registeredSubsetFiles(webSource);
  assert.deepEqual(
    subsets.map(({ subset, unicodeRange }) => ({
      family: SHIPPING_FONT_FAMILY,
      weight: SHIPPING_FONT_WEIGHT_RANGE,
      display: SHIPPING_FONT_DISPLAY,
      file: files[subset],
      unicodeRange,
    })),
    fontFaces(css)
  );
}

function styleBlock(source, name) {
  return new RegExp(`^  ${name}: \\{\\n([\\s\\S]*?)^  \\},`, 'm').exec(source)?.[1] ?? '';
}

describe('RN shipping font', () => {
  const webSource = read('src/platform/shippingFont.web.ts');

  it('registers every face the shipping stylesheet declares, file for file', () => {
    expect(fontFaces(packageCss).length).toBeGreaterThan(0);
    expect(() => assertRegisteredFaces(packageCss, webSource)).not.toThrow();
  });

  it.each([
    ['a renamed family', (css) => css.replaceAll(SHIPPING_FONT_FAMILY, 'Quicksand Renamed')],
    ['a narrowed weight range', (css) => css.replace('font-weight: 300 700', 'font-weight: 400')],
    ['a moved unicode range', (css) => css.replace('U+0000-00FF', 'U+0000-007F')],
    [
      'a renamed file',
      (css) => css.replace('files/quicksand-latin-wght', 'files/quicksand-latin-v2-wght'),
    ],
  ])('rejects %s in the package stylesheet', (_, mutate) => {
    const css = mutate(packageCss);
    expect(css).not.toBe(packageCss);
    expect(() => assertRegisteredFaces(css, webSource)).toThrow();
  });

  it('rejects a dropped subset or a swapped file binding', () => {
    expect(() =>
      assertRegisteredFaces(packageCss, webSource, SHIPPING_FONT_SUBSETS.slice(1))
    ).toThrow();
    const swapped = webSource.replace("'latin-ext': latinExt,", "'latin-ext': latin,");
    expect(swapped).not.toBe(webSource);
    expect(() => assertRegisteredFaces(packageCss, swapped)).toThrow();
  });

  it('projects the shipping stack, led by the registered family, into the RSD tokens', () => {
    expect(scale.fontFamily.startsWith(`'${SHIPPING_FONT_FAMILY}',`)).toBe(true);
    const dimensions = /export const dimensions = css\.defineVars\(\{([\s\S]*?)\}\);/.exec(
      read('src/rsdDrawing/tokens.css.ts')
    )?.[1];
    expect(dimensions).toContain(`fontFamily:\n    ${JSON.stringify(scale.fontFamily)},`);
  });

  it('sets the family on the screen and dialog roots that every RSD text inherits from', () => {
    const controls = read('src/rsdDrawing/controls.tsx');
    for (const root of ['screen', 'themeRoot'])
      expect(styleBlock(controls, root)).toContain('fontFamily: dimensions.fontFamily,');
  });

  it('loads the font at startup and lets web form controls inherit it', () => {
    const entry = read('src/index.ts');
    expect(entry).toMatch(/^import \{ loadShippingFont \} from '\.\/platform\/shippingFont';$/m);
    expect(entry).toMatch(/^loadShippingFont\(\);$/m);
    expect(read('src/strict.css')).toMatch(
      /button,\s*input,\s*select,\s*textarea\s*\{\s*font-family: inherit;\s*\}/
    );
  });
});
