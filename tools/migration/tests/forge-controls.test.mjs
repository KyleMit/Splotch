import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runForgeConsumerControls, runForgeRsaControls } from '../lib/forge-controls.mjs';
import { collectForgeInstallPackages } from '../lib/forge-installed.mjs';

const root = join(import.meta.dirname, '../../..');
const require = createRequire(join(root, 'package.json'));
const mitigation = JSON.parse(
  readFileSync(join(root, 'tools/migration/inputs/forge-mitigation.json'), 'utf8')
);
const fixtures = [];

function mutatedForge(removeCount) {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-forge-crypto-'));
  fixtures.push(directory);
  const target = join(directory, 'forge');
  cpSync(join(root, 'node_modules/node-forge'), target, { recursive: true });
  const path = join(target, 'lib/rsa.js');
  let source = readFileSync(path, 'utf8');
  const nullClause = " ||\n            ('parameters' in capture && capture.parameters !== '')";
  expect(source).toContain(nullClause);
  source = source.replace(nullClause, '');
  if (removeCount) {
    const countClause =
      " ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)";
    expect(source).toContain(countClause);
    source = source.replace(countClause, '');
  }
  writeFileSync(path, source);
  return createRequire(join(target, 'package.json'))(target);
}

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('actual installed Forge crypto controls', () => {
  it('rejects observed malformed classes and preserves the three reviewed fixed encodings', () => {
    const controls = runForgeRsaControls(require('node-forge'), mitigation.publicForgedVector);
    for (const mode of ['long-null', 'indefinite-inner', 'nonminimal-oid'])
      expect(controls).toContainEqual({
        name: `fixed compatibility encoding ${mode} accepted`,
        passed: true,
      });
    expect(controls.every(({ passed }) => passed)).toBe(true);
  });

  it('fails the controls for an unpatched verifier and the count-only verifier', () => {
    const unpatched = mutatedForge(true);
    const countOnly = mutatedForge(false);
    expect(() => runForgeRsaControls(unpatched, mitigation.publicForgedVector)).toThrow(
      'Missing expected exception'
    );
    expect(() => runForgeRsaControls(countOnly, mitigation.publicForgedVector)).toThrow(
      'Missing expected exception'
    );
  });

  it('exercises the actual Expo helper and CLI with only the host subprocess substituted', async () => {
    const controls = await runForgeConsumerControls(collectForgeInstallPackages(root));
    expect(controls.some(({ control }) => control.startsWith('actual certificate'))).toBe(true);
    expect(controls.some(({ control }) => control.startsWith('actual CLI'))).toBe(true);
    expect(controls.every(({ passed }) => passed)).toBe(true);
  });
});
