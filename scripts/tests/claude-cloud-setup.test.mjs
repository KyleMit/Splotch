import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots = [];
const repoRoot = join(import.meta.dirname, '..', '..');
const setupPath = join(repoRoot, '.claude', 'cloud', 'setup.sh');

function writeExecutable(path, body) {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function runSetup(failures) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-claude-setup-'));
  roots.push(root);
  const bin = join(root, 'bin');
  const chisel = join(root, 'chisel');
  mkdirSync(bin);

  const setup = readFileSync(setupPath, 'utf8').replaceAll('/usr/local/bin/chisel', chisel);
  const fixtureSetupPath = join(root, 'setup.sh');
  writeFileSync(fixtureSetupPath, setup);

  writeExecutable(
    join(bin, 'npx'),
    `if [[ "$*" == *"npm@11 install -g npm@11"* ]]; then
  exit "\${FAIL_NPM:-0}"
fi
if [[ "$*" == *"playwright@"* ]]; then
  printf 'playwright install invoked\n'
  exit "\${FAIL_PLAYWRIGHT:-0}"
fi
exit 1`
  );
  writeExecutable(
    join(bin, 'node'),
    `if [[ "\${FAIL_PLAYWRIGHT_VERSION:-0}" != 0 ]]; then
  exit "$FAIL_PLAYWRIGHT_VERSION"
fi
printf '%s\\n' "\${PLAYWRIGHT_VERSION:-1.61.1}"`
  );
  writeExecutable(
    join(bin, 'curl'),
    `if [[ "\${FAIL_CHISEL:-0}" != 0 ]]; then
  exit "$FAIL_CHISEL"
fi
printf 'stub chisel'`
  );
  writeExecutable(join(bin, 'gunzip'), `/bin/cat`);
  writeExecutable(join(bin, 'chmod'), `exit 0`);

  return spawnSync('/bin/bash', [fixtureSetupPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin,
      FAIL_NPM: String(failures.npm ?? 0),
      FAIL_PLAYWRIGHT: String(failures.playwright ?? 0),
      FAIL_PLAYWRIGHT_VERSION: String(failures.playwrightVersionDerivation ?? 0),
      PLAYWRIGHT_VERSION: failures.playwrightVersion ?? '1.61.1',
      FAIL_CHISEL: String(failures.chisel ?? 0),
    },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Claude cloud setup warnings', () => {
  it('keeps one failure non-fatal and includes it in the final summary', () => {
    const result = runSetup({ npm: 1 });

    expect(result.status).toBe(0);
    expect(result.stderr.match(/CLAUDE SETUP WARNING/g)).toHaveLength(1);
    expect(result.stderr.slice(result.stderr.indexOf('==> Claude setup finished'))).toBe(
      `==> Claude setup finished with 1 warning(s):
    - npm 11 pin skipped — sessions may see package-lock.json churn (the SessionStart hook discards it)
==> The environment is up but may be incomplete; address the warnings above.
`
    );
  });

  it('keeps multiple failures non-fatal and includes each one in the final summary', () => {
    const result = runSetup({ playwright: 1, chisel: 1 });

    expect(result.status).toBe(0);
    expect(result.stderr.match(/CLAUDE SETUP WARNING/g)).toHaveLength(2);
    expect(result.stderr.slice(result.stderr.indexOf('==> Claude setup finished'))).toBe(
      `==> Claude setup finished with 2 warning(s):
    - playwright browser install skipped — allowlist cdn.playwright.dev?
    - chisel install skipped — check github release-asset egress
==> The environment is up but may be incomplete; address the warnings above.
`
    );
  });

  it.each([
    ['failed', { playwrightVersionDerivation: 1 }],
    ['non-numeric', { playwrightVersion: 'latest' }],
  ])('skips Playwright installation when version derivation is %s', (_label, failures) => {
    const result = runSetup(failures);

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('playwright install invoked');
    expect(result.stderr).toContain(
      'playwright browser install skipped — could not derive a numeric @playwright/test version from package.json'
    );
  });
});
