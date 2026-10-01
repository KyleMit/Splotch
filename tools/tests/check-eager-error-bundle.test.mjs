import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { MAX_STARTUP_JS_CSS_BYTES } from '../check-bundle-budgets.mjs';
import { eagerErrorResources, eagerErrorStartupBytes } from '../check-eager-error-bundle.mjs';

function manifest(dependency = 'shell') {
  return {
    error: { file: '_app/immutable/nodes/1.hash.js', imports: ['shell'] },
    shell: {
      file: '_app/immutable/chunks/shell.js',
      name: dependency,
      imports: ['shared'],
      dynamicImports: ['gate'],
      css: ['_app/immutable/assets/shell.css'],
    },
    shared: { file: '_app/immutable/chunks/shared.js', imports: ['shell'] },
    gate: { file: '_app/immutable/chunks/gate.js', name: 'ParentalGate' },
  };
}

it('includes transitive static imports and CSS without following dynamic imports or cycles', () => {
  expect(eagerErrorResources(manifest())).toEqual([
    '_app/immutable/nodes/1.hash.js',
    '_app/immutable/chunks/shell.js',
    '_app/immutable/assets/shell.css',
    '_app/immutable/chunks/shared.js',
  ]);
});

it.each(['deferredIcons', 'modalDialog.svelte', 'SettingsModal', 'ParentalGate'])(
  'rejects %s in the root error closure even when no HTML link preloads it',
  (owner) => {
    expect(() => eagerErrorResources(manifest(owner))).toThrow(
      `Root error eagerly imports deferred owner ${owner}`
    );
  }
);

it('rejects missing dependencies and a missing root error entry', () => {
  const missing = manifest();
  delete missing.shared;
  expect(() => eagerErrorResources(missing)).toThrow('Missing root error dependency');
  expect(() => eagerErrorResources({})).toThrow('Expected one root error node');
});

it('guards the real web and native release lifecycle hooks', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  expect(scripts.postbuild).toContain('node tools/check-eager-error-bundle.mjs');
  expect(scripts['postbuild:cap']).toContain('node tools/check-eager-error-bundle.mjs --native');
});

it('counts unlinked error resources once against the shared startup byte owner', () => {
  expect(eagerErrorStartupBytes(['shared.js'], ['shared.js', 'error.css'], 50, () => 100)).toBe(
    250
  );
  expect(() =>
    eagerErrorStartupBytes(['shared.js'], ['error.css'], 0, () => MAX_STARTUP_JS_CSS_BYTES)
  ).toThrow('exceed');
});
