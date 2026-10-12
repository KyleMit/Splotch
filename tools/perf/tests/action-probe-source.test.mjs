// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { actionProbeSource, actionProbeFunctionSource } from '../lib/action-probe-source.mjs';
import { instrumentFingerprint } from '../lib/instrument-fingerprint.mjs';

const WITNESS_INPUTS = [
  'tools/perf/probes/magic-action-witness.js',
  'tools/perf/lib/action-probe-source.mjs',
];
afterEach(() => {
  delete window.__actionProbe;
  vi.unstubAllGlobals();
});

it('assembles the actual lexical factory without adding a witness window property', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const before = new Set(Object.keys(window));
  Function(actionProbeSource())();
  window.__actionProbe.beginExternal('composition', ['resize']);
  const result = window.__actionProbe.finish();
  expect(result.magicWork.before).toMatchObject({ available: false, reason: 'missing' });
  expect(Object.keys(window).filter((key) => !before.has(key))).toEqual(['__actionProbe']);
});

it('fails the real begin path when the factory is omitted from source injection', () => {
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  const probe = readFileSync(join(ROOT, 'tools/perf/probes/action-probe.js'), 'utf8').replace(
    /^export /,
    ''
  );
  Function(`(() => { ${probe}; installActionProbe(undefined); })();`)();
  expect(() => window.__actionProbe.beginExternal('missing factory', ['resize'])).toThrow();
});

it.each([
  'web/capture-desktop-actions.mjs',
  'android/capture-browser-actions.mjs',
  'ios/capture-xcuitest-actions.mjs',
])('routes the %s transport through the owned source assembler', (file) => {
  const source = readFileSync(join(ROOT, 'tools/perf', file), 'utf8');
  expect(source).toContain("import { actionProbeSource } from '../lib/action-probe-source.mjs'");
  expect(source).toMatch(/await (?:page\.evaluate|execute)\(actionProbeSource\(\)\)/);
  expect(source).not.toContain('ACTION_PROBE_FILE');
});

it.each(WITNESS_INPUTS)('fingerprints %s only for action captures', (changedFile) => {
  const before = (file) => `stable:${file}`;
  const after = (file) => (file === changedFile ? 'changed witness instrument' : before(file));
  for (const command of [
    'perf:web:actions',
    'perf:android:browser:actions',
    'perf:ios:xcuitest:actions',
  ]) {
    expect(instrumentFingerprint([command], after).fingerprint).not.toBe(
      instrumentFingerprint([command], before).fingerprint
    );
  }
  for (const command of ['perf:web:frames', 'perf:device:frames', 'perf:ios:xcuitest:screen']) {
    expect(instrumentFingerprint([command], after)).toEqual(
      instrumentFingerprint([command], before)
    );
  }
});

it.each([
  'export function createMagicActionWitness() {}\nexport const extra = true;',
  "import injected from 'unexpected';\nexport function createMagicActionWitness() {}",
  "export function createMagicActionWitness() { return import('unexpected'); }",
  'export function createMagicActionWitness() {',
])('refuses malformed or independently importing injected factory source', (source) => {
  expect(() =>
    actionProbeFunctionSource(source, 'magic-action-witness.js', 'createMagicActionWitness')
  ).toThrow(/injected action function/);
});
