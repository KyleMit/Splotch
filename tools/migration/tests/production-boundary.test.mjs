import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANDIDATE_DIRECTORY } from '../../lib/native-candidate.mjs';
import { readJson } from '../lib/native-identity.mjs';

const repoRoot = join(import.meta.dirname, '../../..');
const fixtures = [];
const CONTROL_TIMEOUT_MS = 30_000;
function write(root, path, content) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe('actual production Knip dependency fence', () => {
  it('rejects a shipping caller of a dev-only candidate package despite hoisted resolution', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-production-knip-test-')));
    fixtures.push(root);
    const candidate = readJson(join(repoRoot, CANDIDATE_DIRECTORY, 'package.json'));
    write(
      root,
      'package.json',
      JSON.stringify({
        private: true,
        devDependencies: { 'react-native': candidate.devDependencies['react-native'] },
      })
    );
    write(root, 'pnpm-workspace.yaml', `packages:\n  - ${CANDIDATE_DIRECTORY}\n`);
    write(root, `${CANDIDATE_DIRECTORY}/package.json`, JSON.stringify(candidate));
    const config = readJson(join(repoRoot, 'knip.production.json'));
    config.entry = ['tools/run-web-tool.mjs!'];
    write(root, 'knip.production.json', JSON.stringify(config));
    symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
    write(root, 'tools/run-web-tool.mjs', 'export const run = () => 1;');
    const check = () =>
      spawnSync(
        process.execPath,
        [
          join(repoRoot, 'node_modules/knip/bin/knip.js'),
          '--config',
          'knip.production.json',
          '--production',
          '--strict',
          '--no-progress',
        ],
        { cwd: root, encoding: 'utf8', timeout: CONTROL_TIMEOUT_MS }
      );
    expect(check().status).toBe(0);
    write(root, 'tools/run-web-tool.mjs', "import 'react-native'; export const run = () => 1;");
    const rejected = check();
    expect(rejected.error).toBeUndefined();
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toContain('react-native');
  });
});
