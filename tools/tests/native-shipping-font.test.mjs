import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scale } from '../../web/src/lib/design/tokens.ts';
import {
  SHIPPING_FONT_DISPLAY,
  SHIPPING_FONT_FAMILY,
  SHIPPING_FONT_SUBSETS,
  SHIPPING_FONT_WEIGHT_RANGE,
} from '../../experiments/native-architecture/src/platform/shippingFontFaces.ts';
import {
  NATIVE_FONT_FAMILIES,
  NATIVE_RSD_FONTS,
  nativeFontFace,
} from '../../experiments/native-architecture/src/platform/nativeFontFamilies.ts';
import { Text } from '../../experiments/native-architecture/src/drawing/Text.tsx';
import { ShippingFontGate } from '../../experiments/native-architecture/src/platform/shippingFont.tsx';

const fontLoad = vi.hoisted(() => ({ useFonts: vi.fn() }));
vi.mock('expo-font', () => ({ useFonts: fontLoad.useFonts }));
vi.mock('@expo-google-fonts/quicksand/400Regular', () => ({ Quicksand_400Regular: 400 }));
vi.mock('@expo-google-fonts/quicksand/600SemiBold', () => ({ Quicksand_600SemiBold: 600 }));
vi.mock('@expo-google-fonts/quicksand/700Bold', () => ({ Quicksand_700Bold: 700 }));
vi.mock('react-native', async () => {
  const { createElement: element } = await import('react');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const text = ({ style, children }) =>
    element('span', { 'data-style': JSON.stringify(flat(style)) }, children);
  return { Text: text, TextInput: text };
});

const WEB_FONT_PACKAGE = '@fontsource-variable/quicksand';
const NATIVE_FONT_PACKAGE = '@expo-google-fonts/quicksand';
const app = new URL('../../experiments/native-architecture/', import.meta.url);
const source = fileURLToPath(new URL('src/', app));
const read = (path) => readFileSync(new URL(path, app), 'utf8');
const packageFile = (path) => readFileSync(fileURLToPath(import.meta.resolve(path)), 'utf8');
const packageCss = packageFile(`${WEB_FONT_PACKAGE}/index.css`);
const sources = new Map(
  readdirSync(source, { recursive: true })
    .filter((path) => /\.tsx?$/.test(path))
    .map((path) => [relative(source, join(source, path)), readFileSync(join(source, path), 'utf8')])
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

// Each subset's file as shippingFont.web.tsx binds it: the import that names the
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
        const prefix = `${WEB_FONT_PACKAGE}/files/`;
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

function styleBlock(code, name) {
  return new RegExp(`^  ${name}: \\{\\n([\\s\\S]*?)^  \\},`, 'm').exec(code)?.[1] ?? '';
}

function fontTokens(tokens) {
  const body = /export const fonts = css\.defineVars\(\{([\s\S]*?)\}\);/.exec(tokens)?.[1] ?? '';
  return Object.fromEntries(
    [...body.matchAll(/(\w+):\s*("[^"]*"|'[^']*')/g)].map(([, key, value]) => [
      key,
      value.slice(1, -1),
    ])
  );
}

// Android and iOS draw each weight from its own static face, so an RSD heading that kept
// its default bold, or a style naming a weight outside the font tokens, would render in
// a system face there.
function assertRsdWeightsUseFontTokens(files) {
  const offenders = [];
  for (const [file, code] of files) {
    for (const [tag] of code.matchAll(/<html\.(?:h[1-6]|strong|b)\b[^>]*>/g))
      if (!/\.(?:bold|semibold)Text\b/.test(tag)) offenders.push(`${file}: ${tag}`);
    for (const [line] of code.matchAll(/^.*\bfontWeight:.*$/gm))
      if (
        /react-strict-dom/.test(code) &&
        !/fontWeight: fonts\.(?:bold|semibold|medium)Weight\b/.test(line)
      )
        offenders.push(`${file}: ${line.trim()}`);
  }
  assert.deepEqual(offenders, []);
}

const rsdFiles = () =>
  [...sources].filter(([file, code]) => file.startsWith('rsdDrawing/') && /html\./.test(code));

// Every React Native text goes through drawing/Text.tsx, which picks the face.
function assertTextThroughWrapper(files) {
  const offenders = [];
  for (const [file, code] of files) {
    if (file === 'drawing/Text.tsx') continue;
    for (const [, names] of code.matchAll(/import \{([^}]*)\} from 'react-native';/g))
      for (const name of names.split(',').map((part) => part.trim()))
        if (name === 'Text' || name === 'TextInput') offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
}

function bundledNativeFaces(files) {
  const imports = [...files.values()].flatMap((code) =>
    [...code.matchAll(new RegExp(`from '${NATIVE_FONT_PACKAGE}(/[^']*)?'`, 'g'))].map(
      ([, path]) => path ?? '(every weight)'
    )
  );
  return [...new Set(imports)].sort();
}

// A face is the package's export of that name, in the directory its weight names.
function assertPackageExportsFamilies(families) {
  for (const family of Object.values(families)) {
    const face = family.replace(/^Quicksand_/, '');
    expect(packageFile(`${NATIVE_FONT_PACKAGE}/${face}/index.d.ts`)).toContain(
      `export const ${family}: number;`
    );
  }
}

const textStyle = (element) =>
  JSON.parse(/data-style="([^"]*)"/.exec(element)[1].replaceAll('&quot;', '"'));

describe('RN shipping font on web', () => {
  const webSource = read('src/platform/shippingFont.web.tsx');

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

  it('lets web form controls inherit the font', () => {
    expect(read('src/strict.css')).toMatch(
      /button,\s*input,\s*select,\s*textarea\s*\{\s*font-family: inherit;\s*\}/
    );
  });
});

describe('RSD font tokens', () => {
  const tokens = read('src/rsdDrawing/tokens.css.ts');

  it('project the shipping stack, led by the registered family, with the bold weight', () => {
    expect(scale.fontFamily.startsWith(`'${SHIPPING_FONT_FAMILY}',`)).toBe(true);
    expect(fontTokens(tokens)).toEqual({
      family: scale.fontFamily,
      boldFamily: scale.fontFamily,
      boldWeight: scale.fontWeightBold,
      semiboldFamily: scale.fontFamily,
      semiboldWeight: scale.fontWeightSemibold,
      mediumFamily: scale.fontFamily,
      mediumWeight: scale.fontWeightMedium,
    });
  });

  it('are overridden on Android and iOS by one face per weight, every token included', () => {
    expect(NATIVE_RSD_FONTS).toEqual({
      family: NATIVE_FONT_FAMILIES.regular,
      boldFamily: NATIVE_FONT_FAMILIES[nativeFontFace(scale.fontWeightBold)],
      boldWeight: 'normal',
      semiboldFamily: NATIVE_FONT_FAMILIES[nativeFontFace(scale.fontWeightSemibold)],
      semiboldWeight: 'normal',
      mediumFamily: NATIVE_FONT_FAMILIES[nativeFontFace(scale.fontWeightMedium)],
      mediumWeight: 'normal',
    });
    expect(Object.keys(NATIVE_RSD_FONTS).sort()).toEqual(Object.keys(fontTokens(tokens)).sort());
    expect(read('src/rsdDrawing/fontTheme.native.ts')).toContain(
      'css.createTheme(fonts, NATIVE_RSD_FONTS)'
    );
    expect(read('src/rsdDrawing/fontTheme.ts')).toContain('export const fontTheme = null;');
  });

  it('set the family on the screen and dialog roots, under the platform font theme', () => {
    const controls = read('src/rsdDrawing/controls.tsx');
    for (const root of ['screen', 'themeRoot'])
      expect(styleBlock(controls, root)).toContain('fontFamily: fonts.family,');
    const screenRoots = read('src/rsdDrawing/RsdDrawingScreen.tsx').match(
      /style=\{\[(?:styles\.screen|controlStyles\.themeRoot)[^\]]*\]\}/g
    );
    expect(screenRoots.length).toBeGreaterThan(0);
    for (const root of screenRoots) expect(root).toContain('fontTheme');
    const shell = read('src/rsdDrawing/ModalShell.tsx');
    expect(shell.match(/style=\{\[\s*fontTheme,[^\]]*styles\.card\(/g)).toHaveLength(1);
    expect(shell.slice(shell.indexOf('  card: ('))).toMatch(/^[^}]*fontFamily: fonts\.family,/);
  });

  it('carry every bold RSD text, and reject a heading or weight that bypasses them', () => {
    expect(() => assertRsdWeightsUseFontTokens(rsdFiles())).not.toThrow();
    const heading = /<html\.h1\b[^>]*>/;
    const [file, code] = rsdFiles().find(([, text]) => heading.test(text));
    const bareHeading = code.replace(heading, '<html.h1>');
    expect(() => assertRsdWeightsUseFontTokens([[file, bareHeading]])).toThrow();
    const literalWeight = read('src/rsdDrawing/RsdSettingsHub.tsx').replace(
      'fontWeight: fonts.boldWeight',
      "fontWeight: '700'"
    );
    expect(() =>
      assertRsdWeightsUseFontTokens([['rsdDrawing/RsdSettingsHub.tsx', literalWeight]])
    ).toThrow();
  });
});

describe('RN shipping font on Android and iOS', () => {
  beforeEach(() => fontLoad.useFonts.mockReset());

  it('names each face by its export in the static font package', () => {
    expect(() => assertPackageExportsFamilies(NATIVE_FONT_FAMILIES)).not.toThrow();
    expect(() =>
      assertPackageExportsFamilies({ ...NATIVE_FONT_FAMILIES, bold: 'Quicksand_700Black' })
    ).toThrow();
  });

  it('bundles only the regular, semibold and bold faces', () => {
    expect(bundledNativeFaces(sources)).toEqual(['/400Regular', '/600SemiBold', '/700Bold']);
    const everyWeight = new Map(sources).set(
      'fixture.ts',
      `import { Quicksand_300Light } from '${NATIVE_FONT_PACKAGE}';`
    );
    expect(bundledNativeFaces(everyWeight)).toContain('(every weight)');
  });

  it.each([
    [undefined, 'regular'],
    ['normal', 'regular'],
    ['light', 'regular'],
    ['400', 'regular'],
    [500, 'regular'],
    ['medium', 'regular'],
    ['600', 'semibold'],
    ['semibold', 'semibold'],
    [650, 'bold'],
    ['700', 'bold'],
    ['bold', 'bold'],
    ['800', 'bold'],
    ['black', 'bold'],
  ])('draws weight %s from the %s face', (weight, face) => {
    expect(nativeFontFace(weight)).toBe(face);
  });

  it('sets text in the face for its weight and leaves Android no weight to synthesize', () => {
    const bold = renderToStaticMarkup(
      createElement(Text, { style: [{ fontSize: 16 }, [{ fontWeight: '700' }]] }, 'Hi')
    );
    expect(textStyle(bold)).toEqual({
      fontSize: 16,
      fontFamily: NATIVE_FONT_FAMILIES.bold,
      fontWeight: 'normal',
    });
    const plain = renderToStaticMarkup(createElement(Text, null, 'Hi'));
    expect(textStyle(plain).fontFamily).toBe(NATIVE_FONT_FAMILIES.regular);
    const overridden = renderToStaticMarkup(
      createElement(Text, { style: [{ fontWeight: '700' }, { fontWeight: '600' }] }, 'Hi')
    );
    expect(textStyle(overridden).fontFamily).toBe(NATIVE_FONT_FAMILIES.semibold);
  });

  it.each([
    ['inherits a bold parent', '700', undefined, 'bold'],
    ['inherits a semibold parent', '600', undefined, 'semibold'],
    ['inherits through an unweighted middle text', '700', null, 'bold'],
    ['overrides a bold parent with an explicit normal', '700', 'normal', 'regular'],
  ])('sets nested text that %s in the matching face', (_, parent, child, face) => {
    const innermost =
      child === null
        ? createElement(Text, null, createElement(Text, null, 'child'))
        : createElement(Text, { style: child && { fontWeight: child } }, 'child');
    const markup = renderToStaticMarkup(
      createElement(Text, { style: { fontWeight: parent } }, 'parent ', innermost)
    );
    const styles = [...markup.matchAll(/data-style="[^"]*"/g)].map(([element]) =>
      textStyle(element)
    );
    expect(styles.at(-1).fontFamily).toBe(NATIVE_FONT_FAMILIES[face]);
  });

  it('routes every React Native text through the font wrapper', () => {
    expect(() => assertTextThroughWrapper(sources)).not.toThrow();
    const direct = new Map(sources).set(
      'fixture.tsx',
      "import { Text, View } from 'react-native';"
    );
    expect(() => assertTextThroughWrapper(direct)).toThrow();
  });

  it('holds the first render until the bundled faces load, then renders', () => {
    const gate = () => renderToStaticMarkup(createElement(ShippingFontGate, null, 'drawing'));
    fontLoad.useFonts.mockReturnValue([false, null]);
    expect(gate()).toBe('');
    expect(Object.keys(fontLoad.useFonts.mock.calls[0][0]).sort()).toEqual(
      Object.values(NATIVE_FONT_FAMILIES).sort()
    );
    fontLoad.useFonts.mockReturnValue([true, null]);
    expect(gate()).toBe('drawing');
  });

  it('renders in the system font rather than nothing when the faces fail to load', () => {
    fontLoad.useFonts.mockReturnValue([false, new Error('missing font')]);
    expect(renderToStaticMarkup(createElement(ShippingFontGate, null, 'drawing'))).toBe('drawing');
  });
});
