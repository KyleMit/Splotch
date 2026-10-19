import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

// React Native's own Babel toolchain strips the Flow annotations from its source, as Metro does.
const require = createRequire(import.meta.url);
const source = require.resolve('react-native/Libraries/StyleSheet/processBackgroundImage.js');
const babelPreset = createRequire(require.resolve('@react-native/babel-preset'));
const babel = babelPreset('@babel/core');

function loadProcessBackgroundImage() {
  const { code } = babel.transformSync(readFileSync(source, 'utf8'), {
    babelrc: false,
    configFile: false,
    plugins: [
      babelPreset.resolve('babel-plugin-syntax-hermes-parser'),
      babelPreset.resolve('@babel/plugin-transform-flow-strip-types'),
      babelPreset.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
  });
  const module = { exports: {} };
  const requireStub = (id) => {
    if (id === './processColor') return { default: (color) => color };
    throw new Error(`Unexpected import ${id}`);
  };
  new Function('require', 'module', 'exports', code)(requireStub, module, module.exports);
  return module.exports.default;
}

const processBackgroundImage = loadProcessBackgroundImage();
const positions = (css) => processBackgroundImage(css)[0].colorStops.map((stop) => stop.position);

// React Native Android parses each stop position as a length and logs a null one as
// "Unsupported type for radius property: Null" (the react-native patch in patches/).
it('states the CSS endpoint positions of unpositioned first and last stops', () => {
  expect(positions('linear-gradient(135deg, #ff6b6b, #ee5a6f)')).toEqual(['0%', '100%']);
  expect(positions('linear-gradient(to bottom, #fff0, #fff 40%)')).toEqual(['0%', '40%']);
  expect(positions('radial-gradient(circle, #f000 55%, #f00)')).toEqual(['55%', '100%']);
});

it('keeps every position a gradient states', () => {
  expect(positions('linear-gradient(90deg, #000 10%, #fff 90%)')).toEqual(['10%', '90%']);
});
