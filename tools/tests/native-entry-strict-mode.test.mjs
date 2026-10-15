import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createElement, StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../experiments/native-architecture/src/index.ts', import.meta.url),
  'utf8'
);
const { outputText: code } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

it.each([false, true])('registers the canonical root with development=%s', async (development) => {
  const ProbeApp = () => null;
  const registerRootComponent = vi.fn();
  const registerServiceWorker = vi.fn();
  const startLaunchInvites = vi.fn();
  const load = vi.fn();
  const modules = {
    './platform/skiaRuntime': {},
    './strict.css': {},
    react: { createElement, StrictMode },
    './platform/registerRoot': { registerRootComponent },
    './ProbeApp': { ProbeApp },
    './platform/serviceWorker': { registerServiceWorker },
    './platform/launchInvites': { startLaunchInvites },
    './platform/settingsSessions': { settingsSessions: { load } },
  };
  runInNewContext(code, {
    __DEV__: development,
    exports: {},
    require(specifier) {
      if (!(specifier in modules)) throw new Error(`Unexpected startup import: ${specifier}`);
      return modules[specifier];
    },
  });
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  expect(registerRootComponent).toHaveBeenCalledOnce();
  const [Registered] = registerRootComponent.mock.calls[0];
  const rendered = development ? Registered() : createElement(Registered);
  expect(rendered?.type).toBe(development ? StrictMode : ProbeApp);
  expect(development ? rendered.props.children.type : Registered).toBe(ProbeApp);
  expect(startLaunchInvites).toHaveBeenCalledOnce();
  expect(registerServiceWorker).toHaveBeenCalledOnce();
});
