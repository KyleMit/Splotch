import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The react-native-skia patch in patches/ stops installing JSI factories the RN app never calls, so
// the linker drops Skottie, SkParagraph, HarfBuzz and the SVG DOM from the prebuilt Skia archives.
const require = createRequire(import.meta.url);
const skiaRoot = dirname(require.resolve('@shopify/react-native-skia/package.json'));
const appSource = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../experiments/native-architecture/src'
);

const TRIMMED_FACTORIES = ['Skottie', 'ParagraphBuilder', 'TypefaceFontProvider'];
const TRIMMED_APP_CALLS = [
  /\bSkia\.(Skottie|ParagraphBuilder|TypefaceFontProvider|SVG)\b/,
  /\.(drawSvg|drawParagraph|drawSkottie)\(/,
];
const TRIMMED_IMPORTS = new Set([
  'ImageSVG',
  'Paragraph',
  'Skottie',
  'useSVG',
  'useFonts',
  '* (namespace import)',
]);

function files(dir, pattern) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function installedGetters() {
  const api = readFileSync(join(skiaRoot, 'cpp/api/JsiSkApi.h'), 'utf8');
  return new Set(
    [...api.matchAll(/installGetter\(runtime, prototype, "(\w+)"/g)].map((match) => match[1])
  );
}

// lib/module/skia/core/SVG.js runs `Skia.SVG.MakeFromData.bind(Skia.SVG)` as it loads, so a
// factory removed from that list throws at app start rather than at its first call.
function factoriesBoundAtImport() {
  const bound = new Set();
  for (const file of files(join(skiaRoot, 'lib/module'), /(?<!\.web)\.js$/)) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /^const \w+ = Skia\.(\w+)\.\w+\.bind\(Skia\.\1\)/gm
    )) {
      bound.add(match[1]);
    }
  }
  return bound;
}

it('keeps installing every factory the library binds at import', () => {
  const bound = factoriesBoundAtImport();
  expect(bound).toContain('SVG');
  const getters = installedGetters();
  expect([...bound].filter((factory) => !getters.has(factory))).toEqual([]);
});

it('stops installing the trimmed factories', () => {
  const getters = installedGetters();
  expect(TRIMMED_FACTORIES.filter((factory) => getters.has(factory))).toEqual([]);
});

// The imported name, not a local alias, decides what is reached: `useFonts as load` is still
// useFonts. A namespace import hides every name behind it, so the test reports it as a whole.
function skiaImports(source) {
  const named = [
    ...source.matchAll(/import\s*\{([^}]*)\}\s*from '@shopify\/react-native-skia'/g),
  ].flatMap((match) =>
    match[1].split(',').map((specifier) =>
      specifier
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
    )
  );
  const namespaces = [
    ...source.matchAll(/import\s*\*\s*as\s+\w+\s+from '@shopify\/react-native-skia'/g),
  ].map(() => '* (namespace import)');
  return [...named, ...namespaces];
}

it('keeps the RN app off the trimmed Skia APIs', () => {
  const offenders = files(appSource, /\.tsx?$/).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [
      ...TRIMMED_APP_CALLS.filter((pattern) => pattern.test(source)).map(String),
      ...skiaImports(source).filter((name) => TRIMMED_IMPORTS.has(name)),
    ].map((use) => `${file}: ${use}`);
  });
  expect(offenders).toEqual([]);
});
