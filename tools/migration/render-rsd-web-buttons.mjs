// Renders the RSD button primitives the way the web export ships them: every app source runs
// through the production Babel config with Metro's web caller, resolving `.web` files first as
// Metro's web platform does, then renders to static markup. Spawned by
// tools/migration/tests/rsd-web-buttons.test.mjs so its module hooks stay out of the test worker.
// Prints the rendered markup as JSON.
import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = join(import.meta.dirname, '../../experiments/native-architecture');
// A test seam: --pressable=<file> renders through another web RsdPressable, so the regression
// test can prove the spread form fails.
const PRESSABLE_FLAG = '--pressable=';
const pressable = process.argv
  .find((arg) => arg.startsWith(PRESSABLE_FLAG))
  ?.slice(PRESSABLE_FLAG.length);
const require = createRequire(join(app, 'package.json'));
const babel = require('@babel/core');
const { createElement: h } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const WEB_FIRST = ['.web.tsx', '.web.ts', '.tsx', '.ts'];
// The markup under test is the button's own: icons render as empty boxes, without the native
// SVG view or the client-only icon registry (a server render has no snapshot of its loads). The
// stub is virtual: no file exists at its path, and the load hook serves its source.
const STUB = pathToFileURL(join(import.meta.dirname, 'rsd-web-icon-stub.virtual.cjs')).href;
const STUB_SOURCE = [
  "const { createElement } = require('react');",
  "exports.SvgXml = ({ width, height }) => createElement('svg', { width, height });",
  'exports.useNativeIconMarkup = () => undefined;',
].join('\n');
const STUBBED = new Set(['react-native-svg', './iconRegistry']);
// A direct RsdPressable caller passing its own style array, as a dialog header control does. Also
// virtual, and compiled like an app source.
const CALLER = pathToFileURL(
  join(import.meta.dirname, 'rsd-web-pressable-caller.virtual.tsx')
).href;
const CALLER_SOURCE = [
  "import { css } from 'react-strict-dom';",
  `import { RsdPressable } from '${join(app, 'src/rsdDrawing/RsdPressable')}';`,
  'const styles = css.create({',
  "  control: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'transparent' },",
  "  raised: { boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)', opacity: { default: 1, ':active': 0.7 } },",
  '});',
  'export function PressableCaller() {',
  '  return (',
  '    <RsdPressable type="button" aria-label="Close" style={[styles.control, styles.raised]} onClick={() => {}} />',
  '  );',
  '}',
].join('\n');
// Metro runs the app's Babel config over react-strict-dom's web build too: its runtime declares
// styles that only the StyleX plugin compiles.
const COMPILED = (path) =>
  (/\.tsx?$/.test(path) && !path.includes('/node_modules/')) ||
  path.includes('/react-strict-dom/dist/web/');

function compile(filename, source) {
  return babel.transformSync(source, {
    cwd: app,
    filename,
    caller: { name: 'metro', platform: 'web', isDev: false },
    configFile: join(app, 'babel.config.cjs'),
  }).code;
}

registerHooks({
  resolve(specifier, context, next) {
    if (STUBBED.has(specifier)) return { url: STUB, shortCircuit: true };
    if (specifier === fileURLToPath(CALLER)) return { url: CALLER, shortCircuit: true };
    if (pressable && /(?:^\.|\/rsdDrawing)\/RsdPressable$/.test(specifier))
      return { url: pathToFileURL(pressable).href, shortCircuit: true };
    // A seam file lives outside the app, so it resolves packages as an app file would.
    if (pressable && context.parentURL === pathToFileURL(pressable).href)
      return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true };
    // Babel points react-native imports at react-native-web's extensionless ESM build, which
    // only a bundler resolves; its CommonJS build is the same module for Node.
    if (specifier.startsWith('react-native-web/dist/') && !specifier.includes('/dist/cjs/'))
      return next(specifier.replace('/dist/', '/dist/cjs/'), context);
    const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : '';
    const local = specifier.startsWith('.') || specifier.startsWith('/');
    if (local && parent && !parent.includes('/node_modules/')) {
      const base = specifier.startsWith('/') ? specifier : join(parent, '..', specifier);
      const found = WEB_FIRST.map((extension) => base + extension).find((path) => existsSync(path));
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === STUB) return { format: 'commonjs', source: STUB_SOURCE, shortCircuit: true };
    const path = url.startsWith('file:') ? fileURLToPath(url) : '';
    const source = url === CALLER ? CALLER_SOURCE : COMPILED(path) && readFileSync(path, 'utf8');
    if (!source) return next(url, context);
    return { format: 'commonjs', source: compile(path, source), shortCircuit: true };
  },
});

const src = (path) => require(join(app, 'src', path));
const { RsdButton } = src('rsdDrawing/RsdButton.tsx');
const { RsdNotFoundLink } = src('rsdDrawing/notFoundLink.web.tsx');
const { RsdIconButton } = src('rsdDrawing/RsdIconButton.tsx');
const { PressableCaller } = require(fileURLToPath(CALLER));
const { merge, defaultStyles } = require('react-strict-dom/runtime');
const noop = () => {};
const SPECIMENS = {
  pressable: h(PressableCaller),
  button: h(RsdButton, { variant: 'brand', size: 'hero', onPress: noop }, 'Send report'),
  corner: h(RsdIconButton, { skin: 'corner', icon: 'settings', label: 'Settings', onPress: noop }),
  tile: h(RsdIconButton, { skin: 'tile', icon: 'shapes', label: 'Books', size: 60, onPress: noop }),
  flyout: h(RsdIconButton, {
    skin: 'flyout',
    icon: 'brush-pen',
    label: 'Pen',
    base: 60,
    scale: 1,
    onPress: noop,
  }),
};

console.log(
  JSON.stringify({
    defaultClasses: merge(defaultStyles.button).className,
    notFoundLinks: [
      ['drawing', 'brand', 'Start drawing'],
      ['changelog', 'wash', 'Changelog'],
      ['privacy', 'wash', 'Privacy'],
    ].map(([page, variant, label]) =>
      renderToStaticMarkup(h(RsdNotFoundLink, { page, variant }, label))
    ),
    markup: Object.fromEntries(
      Object.entries(SPECIMENS).map(([name, element]) => [name, renderToStaticMarkup(element)])
    ),
  })
);
