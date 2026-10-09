const assert = require('node:assert/strict');
const { realpathSync } = require('node:fs');
const { join } = require('node:path');
const babel = require('@babel/core');
const presetPackage = require('babel-preset-expo/package.json');

function verifyNativeTransform(ast) {
  const nativeImports = [];
  babel.traverse(ast, {
    ImportDeclaration({ node }) {
      if (node.source.value === 'react-native') nativeImports.push(node);
    },
    JSXElement() {
      throw new Error('Babel left an untransformed JSX element');
    },
    JSXFragment() {
      throw new Error('Babel left an untransformed JSX fragment');
    },
  });
  assert.ok(nativeImports.length > 0, 'Babel removed the native import');
}

assert.equal(process.argv.length, 2, 'check-transform accepts no arguments');

const projectRoot = realpathSync(join(__dirname, '..'));
const filename = join(projectRoot, 'src', 'DrawingScreen.tsx');
const result = babel.transformFileSync(filename, {
  ast: true,
  babelrc: false,
  configFile: join(projectRoot, 'babel.config.cjs'),
  cwd: projectRoot,
  envName: 'production',
  caller: {
    name: 'splotch-native-topology',
    platform: 'ios',
    supportsStaticESM: true,
  },
});

assert.ok(result?.ast, 'Babel produced no transformed AST');
assert.equal(typeof result.code, 'string', 'Babel produced no compiled code');
verifyNativeTransform(result.ast);

process.stdout.write(
  `${JSON.stringify({
    projectRoot,
    filename,
    coreVersion: babel.version,
    presetVersion: presetPackage.version,
    transformed: true,
  })}\n`
);
