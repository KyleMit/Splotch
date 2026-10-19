import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const app = join(import.meta.dirname, '../../experiments/native-architecture');
const appRequire = createRequire(join(app, 'package.json'));
const babel = appRequire('@babel/core');
const reactNative = dirname(appRequire.resolve('react-native/package.json'));

// React Native's own AbortController, the one its runtime installs as the global
// (Libraries/Core/setUpXHR.js), so the audio tests abort through the native app's semantics rather
// than Node's. It ships as Flow source, so each module it reaches is compiled with the app's preset.
// The feature-flag module reaches the native flag module at import; the abort chain reads only
// JavaScript flags, so each resolves to the default React Native declares for it.
const FEATURE_FLAGS = join(reactNative, 'src/private/featureflags/ReactNativeFeatureFlags.js');
const featureFlagSource = readFileSync(FEATURE_FLAGS, 'utf8');
const javaScriptFlags = new Proxy(
  {},
  {
    get(_, name) {
      if (name === '__esModule') return true;
      const declared = new RegExp(
        `createJavaScriptFlagGetter\\('${String(name)}', (true|false)\\)`
      );
      const match = declared.exec(featureFlagSource);
      if (!match) throw new Error(`${String(name)} is not a JavaScript feature flag`);
      return () => match[1] === 'true';
    },
  }
);

function loadFlowModule(file, cache = new Map()) {
  if (file === FEATURE_FLAGS) return javaScriptFlags;
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = babel.transformFileSync(file, {
    cwd: app,
    babelrc: false,
    configFile: false,
    presets: [appRequire.resolve('babel-preset-expo')],
    caller: { name: 'metro', bundler: 'metro', platform: 'ios', isDev: false },
  }).code;
  const local = (specifier) => {
    if (!specifier.startsWith('.')) return appRequire(specifier);
    const target = resolve(dirname(file), specifier);
    return loadFlowModule(existsSync(target) ? target : `${target}.js`, cache);
  };
  new Function('exports', 'require', 'module', '__DEV__', code)(
    module.exports,
    local,
    module,
    false
  );
  return module.exports;
}

export const { AbortController: NativeAbortController } = loadFlowModule(
  join(reactNative, 'src/private/webapis/dom/abort-api/AbortController.js')
);
