import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from '../contract.mjs';

const COMMAND_DEADLINE_MS = 5_000;
const NONCE = 'a'.repeat(32);
const RECEIPT = 'b'.repeat(32);
const REVISION = 'c'.repeat(40);

function receiptInputs(root, status) {
  const fixture = join(root, 'fixture');
  mkdirSync(fixture);
  const input = {
    root: fixture,
    role: 'reader',
    revision: REVISION,
    configuration: {
      path: '/legacy-continuity.html',
      heldNamespace: { database: 'splotch-unsaved-pictures', store: 'held', key: 'pictures' },
    },
  };
  const source = Buffer.from(JSON.stringify(input));
  writeFileSync(join(fixture, '.splotch-l0-source.json'), source);
  const lease = join(root, 'lease.json');
  writeFileSync(
    lease,
    JSON.stringify({
      owner: 'L0',
      platform: 'ios',
      applicationId: 'art.splotch.app',
      expiresAt: new Date().toISOString(),
      deviceName: 'splotch-l0-host-file-control',
      device: 'host-file-control-only',
      fixtureRoot: fixture,
      sourceReceiptSha256: digest(source),
      artifactSha256: '0'.repeat(64),
    })
  );
  const page = (command, result) => ({
    command,
    nonce: NONCE,
    role: 'reader',
    revision: REVISION,
    result,
  });
  const wrapper = {
    command: 'preferences',
    nonce: NONCE,
    receiptId: RECEIPT,
    pid: 12345,
    url: 'capacitor://localhost/legacy-continuity.html',
    persistentDataStore: true,
  };
  const raw = Buffer.from(
    JSON.stringify({
      ...wrapper,
      phase: 'raw',
      result: {
        status: 'completed',
        value: page('raw', {
          native: true,
          drawingSurface: false,
          origin: 'capacitor://localhost',
          href: wrapper.url,
          observation: { platform: 'ios', bundleId: 'art.splotch.app' },
          held: { status: 'absent-database', databases: [] },
        }),
      },
    })
  );
  const result = Buffer.from(
    JSON.stringify({
      ...wrapper,
      phase: 'result',
      result:
        status === 'completed'
          ? { status, value: page('preferences', {}) }
          : { status, error: 'L0_OWNED_COMMAND_REFUSAL' },
    })
  );
  const rawPath = join(root, 'raw.json');
  const resultPath = join(root, 'result.json');
  const consolePath = join(root, 'console.txt');
  writeFileSync(rawPath, raw);
  writeFileSync(resultPath, result);
  writeFileSync(
    consolePath,
    `SPLOTCH_L0_RESULT ${RECEIPT} raw ${raw.length} ${digest(raw)}\nSPLOTCH_L0_RESULT ${RECEIPT} result ${result.length} ${digest(result)}\n`
  );
  return { fixture, lease, rawPath, resultPath, consolePath, result };
}

function invoke(root, inputs, output) {
  const args = [
    resolve(import.meta.dirname, '../run-fixture.mjs'),
    'ios-receipt',
    '--fixture',
    inputs.fixture,
    '--lease',
    inputs.lease,
    '--command',
    'preferences',
    '--nonce',
    NONCE,
    '--receipt',
    RECEIPT,
    '--console',
    inputs.consolePath,
    '--raw',
    inputs.rawPath,
    '--result',
    inputs.resultPath,
    '--output',
    resolve(root, output),
  ];
  try {
    const stdout = execFileSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: COMMAND_DEADLINE_MS,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    };
  }
}

describe('legacy iOS receipt outcome', () => {
  it('declares materialization platform refusal before source or output IO and retains portable receipt execution', () => {
    const owned = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-legacy-continuity-platform-')));
    try {
      const loader = join(owned, 'linux-platform.mjs');
      writeFileSync(loader, "Object.defineProperty(process, 'platform', { value: 'linux' });\n");
      const output = join(owned, 'splotch-legacy-continuity-platform-refused');
      const cli = resolve(import.meta.dirname, '../run-fixture.mjs');
      let refusal;
      try {
        execFileSync(
          process.execPath,
          ['--import', loader, cli, 'materialize', '--source', 'released', '--output', output],
          { timeout: COMMAND_DEADLINE_MS }
        );
      } catch (error) {
        refusal = error;
      }
      expect(refusal?.status).toBe(1);
      expect(refusal?.stderr.toString()).toContain('L0_SOURCE_MATERIALIZATION_REQUIRES_MACOS');
      expect(existsSync(output)).toBe(false);
      const inputsRoot = join(owned, 'inputs');
      mkdirSync(inputsRoot);
      const inputs = receiptInputs(inputsRoot, 'completed');
      expect(invoke(owned, inputs, 'splotch-legacy-continuity-platform-restored').status).toBe(0);
    } finally {
      rmSync(owned, { recursive: true });
    }
  });

  it('refuses a real symlink escape before output creation and restores an owned temporary destination', () => {
    const owned = realpathSync(mkdtempSync(join(tmpdir(), 'splotch-legacy-continuity-host-path-')));
    try {
      const inputsRoot = join(owned, 'inputs');
      mkdirSync(inputsRoot);
      const inputs = receiptInputs(inputsRoot, 'completed');
      const escape = join(owned, 'escape');
      const outside = dirname(realpathSync('/tmp'));
      symlinkSync(outside, escape);
      const name = 'splotch-legacy-continuity-path-refused';
      const refused = invoke(owned, inputs, join(escape, name));
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('L0_OWNED_OUTPUT_ROOT_REQUIRED');
      expect(existsSync(join(outside, name))).toBe(false);
      expect(invoke(owned, inputs, 'splotch-legacy-continuity-path-restored').status).toBe(0);
    } finally {
      rmSync(owned, { recursive: true });
    }
  });

  it('keeps a complete command failure nonzero with failed top-level evidence and restores completion', () => {
    const owned = realpathSync(
      mkdtempSync(join(tmpdir(), 'splotch-legacy-continuity-host-receipt-'))
    );
    try {
      const failedRoot = join(owned, 'failed-inputs');
      mkdirSync(failedRoot);
      const failed = receiptInputs(failedRoot, 'command-failure');
      const result = invoke(owned, failed, 'splotch-legacy-continuity-command-failure');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('L0_IOS_COMMAND_FAILED');
      expect(JSON.parse(result.stdout).status).toBe('command-failure');
      const outcome = JSON.parse(
        readFileSync(join(owned, 'splotch-legacy-continuity-command-failure/outcome.json.txt'))
      );
      expect(outcome.status).toBe('command-failure');
      expect(outcome.detail.status).toBe('command-failure');
      expect(
        readFileSync(
          join(owned, 'splotch-legacy-continuity-command-failure/command-result.json.txt')
        )
      ).toEqual(failed.result);
      const positiveRoot = join(owned, 'positive-inputs');
      mkdirSync(positiveRoot);
      const positive = receiptInputs(positiveRoot, 'completed');
      const restored = invoke(owned, positive, 'splotch-legacy-continuity-command-restored');
      expect(restored.status).toBe(0);
      expect(JSON.parse(restored.stdout).status).toBe('command-receipt-completed');
      expect(
        JSON.parse(
          readFileSync(join(owned, 'splotch-legacy-continuity-command-restored/outcome.json.txt'))
        ).detail.status
      ).toBe('completed');
    } finally {
      rmSync(owned, { recursive: true });
    }
  });

  it('refuses clipped framing separately from a completed app command and restores complete bytes', () => {
    const owned = realpathSync(
      mkdtempSync(join(tmpdir(), 'splotch-legacy-continuity-host-frame-'))
    );
    try {
      const inputsRoot = join(owned, 'inputs');
      mkdirSync(inputsRoot);
      const inputs = receiptInputs(inputsRoot, 'completed');
      const complete = readFileSync(inputs.consolePath);
      writeFileSync(inputs.consolePath, 'clipped');
      const refused = invoke(owned, inputs, 'splotch-legacy-continuity-frame-refused');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('L0_IOS_COMPLETE_FRAME_REQUIRED');
      expect(refused.stdout).toBe('');
      writeFileSync(inputs.consolePath, complete);
      expect(invoke(owned, inputs, 'splotch-legacy-continuity-frame-restored').status).toBe(0);
    } finally {
      rmSync(owned, { recursive: true });
    }
  });
});
