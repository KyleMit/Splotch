import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function configValue(source, name) {
  const matches = [...source.matchAll(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"\\s*$`, 'gm'))];
  assert.equal(matches.length, 1, `Ambiguous configured ${name}`);
  return matches[0][1];
}

export function verifyNetlifyRuntime(root, manifest, facts) {
  const config = readFileSync(join(root, 'netlify.toml'), 'utf8');
  const flags = configValue(config, 'PNPM_FLAGS');
  assert.equal(flags, '--prod', 'Proof requires the reviewed production-only install flags');
  assert.equal(facts.env.PNPM_FLAGS, flags, 'Actual production install flags differ');
  const configuredMajor = configValue(config, 'NODE_VERSION');
  const runtime = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(facts.nodeVersion);
  const floor = /^>=(\d+)\.(\d+)(?:\.(\d+))?$/.exec(manifest.engines?.node ?? '');
  assert.ok(runtime && floor, 'Node runtime/floor is not recorded in the reviewed format');
  assert.equal(runtime[1], configuredMajor, 'Actual Node major differs from the configured owner');
  const actual = runtime.slice(1).map(Number);
  const minimum = floor.slice(1).map((part) => Number(part ?? '0'));
  const firstDifference = actual.findIndex((part, index) => part !== minimum[index]);
  assert.ok(
    firstDifference < 0 || actual[firstDifference] > minimum[firstDifference],
    'Node is below the root floor'
  );
  assert.equal(
    manifest.packageManager,
    `pnpm@${facts.packageManagerVersion}`,
    'Actual package manager differs'
  );
}
