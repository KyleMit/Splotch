import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

const codexVersion = /^CODEX_VERSION=(\S+)$/m.exec(readFileSync(setupPath, 'utf8'))?.[1];

// What `codex --version` can look like on PATH before the setup script runs. Only `pinned` may
// skip the install: `near` is a longer version that contains the pin as a substring, and `failing`
// prints the pin but exits nonzero, the way the npm wrapper does with its platform binary missing.
const CODEX_EXECUTABLES = {
  pinned: `printf 'codex-cli ${codexVersion}\\n'`,
  broken: `exit 1`,
  stale: `printf 'codex-cli 0.1.0\\n'`,
  near: `printf 'codex-cli ${codexVersion}0\\n'`,
  failing: `printf 'codex-cli ${codexVersion}\\n'; exit 1`,
};

function runSetup(failures, { cwd = repoRoot, projectDir, codex } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'splotch-claude-setup-'));
  roots.push(root);
  const bin = join(root, 'bin');
  const chisel = join(root, 'chisel');
  const npmCalls = join(root, 'npm-calls.log');
  mkdirSync(bin);

  const original = readFileSync(setupPath, 'utf8');
  const setup = original.replaceAll('/usr/local/bin/chisel', chisel);
  expect(setup).not.toBe(original);
  const fixtureSetupPath = join(root, 'setup.sh');
  writeFileSync(fixtureSetupPath, setup);

  writeExecutable(
    join(bin, 'npx'),
    `if [[ "$*" == *"playwright@"* ]]; then
  printf 'playwright install invoked\n'
  exit "\${FAIL_PLAYWRIGHT:-0}"
fi
exit 1`
  );
  writeExecutable(join(bin, 'corepack'), `exit "\${FAIL_COREPACK:-0}"`);
  writeExecutable(
    join(bin, 'node'),
    `if [[ "$*" == "-p "*"require('./package.json')"*"@playwright/test"* ]]; then
  if [[ "\${FAIL_PLAYWRIGHT_VERSION:-0}" != 0 ]]; then
    exit "$FAIL_PLAYWRIGHT_VERSION"
  fi
  # The real derivation reads ./package.json, so the stub fails the same way when
  # the script has not landed in the project dir — that is what pins the cd.
  if [[ ! -f ./package.json ]]; then
    exit 1
  fi
  printf '%s\\n' "\${PLAYWRIGHT_VERSION:-1.61.1}"
  exit 0
fi
exit 1`
  );
  writeExecutable(
    join(bin, 'curl'),
    `if [[ "\${FAIL_CHISEL:-0}" != 0 ]]; then
  exit "$FAIL_CHISEL"
fi
printf 'stub chisel'`
  );
  writeExecutable(join(bin, 'gunzip'), `/bin/cat`);
  // The only npm call the script may make is the pinned global Codex install, recorded so a test
  // can count it; a success "installs" a codex stub that reports the pin, or a broken one on request.
  // The real chmod, because the stub PATH's own chmod is a no-op.
  writeExecutable(
    join(bin, 'npm'),
    `printf '%s\\n' "$*" >> "$NPM_CALLS"
if [[ "$*" != "install --global @openai/codex@${codexVersion}" ]]; then
  echo "unexpected npm invocation: $*" >&2
  exit 99
fi
if [[ "\${FAIL_CODEX:-0}" != 0 ]]; then
  exit "$FAIL_CODEX"
fi
case "\${CODEX_INSTALL_RESULT:-pinned}" in
  broken) body='exit 1' ;;
  near) body="printf 'codex-cli ${codexVersion}0\\\\n'" ;;
  *) body="printf 'codex-cli ${codexVersion}\\\\n'" ;;
esac
printf '#!/bin/bash\\n%s\\n' "$body" > "$STUB_BIN/codex"
/bin/chmod +x "$STUB_BIN/codex"`
  );
  if (codex) writeExecutable(join(bin, 'codex'), CODEX_EXECUTABLES[codex]);
  writeExecutable(join(bin, 'chmod'), `exit 0`);

  const result = spawnSync('/bin/bash', [fixtureSetupPath], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin,
      STUB_BIN: bin,
      NPM_CALLS: npmCalls,
      CODEX_INSTALL_RESULT: failures.codexInstallResult ?? 'pinned',
      ...(projectDir ? { CLAUDE_PROJECT_DIR: projectDir } : {}),
      FAIL_COREPACK: String(failures.corepack ?? 0),
      FAIL_PLAYWRIGHT: String(failures.playwright ?? 0),
      FAIL_PLAYWRIGHT_VERSION: String(failures.playwrightVersionDerivation ?? 0),
      PLAYWRIGHT_VERSION: failures.playwrightVersion ?? '1.61.1',
      FAIL_CHISEL: String(failures.chisel ?? 0),
      FAIL_CODEX: String(failures.codex ?? 0),
    },
  });
  const calls = existsSync(npmCalls) ? readFileSync(npmCalls, 'utf8').trim().split('\n') : [];
  return { ...result, npmCalls: calls };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Claude cloud setup warnings', () => {
  it('keeps one failure non-fatal and includes it in the final summary', () => {
    const result = runSetup({ corepack: 1 });

    expect(result.status).toBe(0);
    expect(result.stderr.match(/CLAUDE SETUP WARNING/g)).toHaveLength(1);
    expect(result.stderr.slice(result.stderr.indexOf('==> Claude setup finished'))).toBe(
      `==> Claude setup finished with 1 warning(s):
    - pnpm setup skipped — the SessionStart hook's install will fail until corepack can provision pnpm
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

  const codexInstallCall = `install --global @openai/codex@${codexVersion}`;
  const codexWarning = `codex ${codexVersion} is not runnable after the install — run-rival-agent is unavailable until the snapshot rebuilds with it`;

  it('pins a numeric Codex version', () => {
    expect(codexVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('installs exactly the pinned Codex CLI once and verifies it', () => {
    const result = runSetup({});

    expect(result.status).toBe(0);
    expect(result.npmCalls).toEqual([codexInstallCall]);
    expect(result.stdout).toContain(`codex ${codexVersion} installed`);
    expect(result.stderr).not.toContain('CLAUDE SETUP WARNING');
  });

  it('makes no npm call when the pinned Codex CLI already runs', () => {
    const result = runSetup({}, { codex: 'pinned' });

    expect(result.status).toBe(0);
    expect(result.npmCalls).toEqual([]);
    expect(result.stdout).not.toContain('codex ');
  });

  // The npm wrapper is on PATH even when its optional platform binary never arrived, and an older
  // CLI is on PATH after a pin bump; `command -v` would keep either through every rebuild.
  it.each([
    ['broken', 'broken'],
    ['stale', 'stale'],
    ['near-matching', 'near'],
    ['failing-but-printing', 'failing'],
  ])('repairs a %s Codex executable through the pinned install', (_label, codex) => {
    const result = runSetup({}, { codex });

    expect(result.status).toBe(0);
    expect(result.npmCalls).toEqual([codexInstallCall]);
    expect(result.stdout).toContain(`codex ${codexVersion} installed`);
    expect(result.stderr).not.toContain('CLAUDE SETUP WARNING');
  });

  it.each([
    ['the install fails', { codex: 1 }],
    ['the installed executable does not run', { codexInstallResult: 'broken' }],
    ['the installed executable is not exactly the pin', { codexInstallResult: 'near' }],
  ])(
    'keeps the Codex install non-fatal and names the skill it costs when %s',
    (_label, failures) => {
      const result = runSetup(failures);

      expect(result.status).toBe(0);
      expect(result.npmCalls).toEqual([codexInstallCall]);
      expect(result.stderr.match(/CLAUDE SETUP WARNING/g)).toHaveLength(1);
      expect(result.stderr).toContain(codexWarning);
    }
  );

  it('derives the Playwright version when invoked from outside the project dir', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'splotch-claude-setup-cwd-'));
    roots.push(elsewhere);

    const result = runSetup({}, { cwd: elsewhere, projectDir: repoRoot });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('playwright install invoked');
    expect(result.stderr).not.toContain('could not derive a numeric @playwright/test version');
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
