import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REDTEAM_ENV_FILE,
  decryptDir,
  encryptDir,
  loadRedteamEnv,
} from '../lib/fixture-crypto.mjs';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const SECRET = 'scratch-fixture-secret';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let scratch;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'redteam-crypto-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function encryptScratchCorpus() {
  const source = join(scratch, 'source');
  mkdirSync(join(source, 'nested'), { recursive: true });
  const files = {
    'safe-banana.png': Buffer.concat([PNG_SIGNATURE, Buffer.from('banana')]),
    'nested/block-probe.png': Buffer.concat([PNG_SIGNATURE, Buffer.from('probe')]),
  };
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(source, name), bytes);
  const encrypted = join(scratch, 'encrypted');
  expect(encryptDir(source, encrypted, SECRET)).toBe(2);
  return { files, encrypted };
}

describe('fixture corpus encryption (ADR-0023)', () => {
  it('round-trips every file with the secret it is given', () => {
    const { files, encrypted } = encryptScratchCorpus();
    const decrypted = join(scratch, 'decrypted');

    expect(decryptDir(encrypted, decrypted, SECRET)).toBe(2);

    for (const [name, bytes] of Object.entries(files)) {
      expect(readFileSync(join(encrypted, `${name}.enc`)).indexOf(bytes)).toBe(-1);
      expect(readFileSync(join(decrypted, name))).toEqual(bytes);
    }
  });

  it('throws instead of exiting when the secret is wrong', () => {
    const { encrypted } = encryptScratchCorpus();

    expect(() => decryptDir(encrypted, join(scratch, 'decrypted'), 'another-secret')).toThrow(
      /Failed to decrypt .*wrong REDTEAM_FIXTURE_KEY or corrupt file/
    );
  });

  it('throws when one ciphertext byte is flipped', () => {
    const { encrypted } = encryptScratchCorpus();
    const blob = join(encrypted, 'safe-banana.png.enc');
    const bytes = readFileSync(blob);
    bytes[bytes.length - 1] ^= 0x01;
    writeFileSync(blob, bytes);

    expect(() => decryptDir(encrypted, join(scratch, 'decrypted'), SECRET)).toThrow(
      /Failed to decrypt .*safe-banana\.png\.enc/
    );
  });
});

describe('where the red-team keys are read from', () => {
  it('loads no env file when the library is imported', async () => {
    const load = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
    vi.resetModules();

    await import('../lib/fixture-crypto.mjs');

    expect(load).not.toHaveBeenCalled();
  });

  it('reads the app env file, resolved from the repo rather than the working directory', () => {
    const load = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});

    loadRedteamEnv();

    expect(REDTEAM_ENV_FILE).toBe(join(repoRoot, 'web', '.env'));
    expect(load.mock.calls).toEqual(existsSync(REDTEAM_ENV_FILE) ? [[REDTEAM_ENV_FILE]] : []);
  });

  it('points at the file the worktree bootstrap provisions and the example documents', () => {
    const provisioned = readFileSync(join(repoRoot, '.worktreeinclude'), 'utf8')
      .split('\n')
      .map((line) => line.trim());
    expect(provisioned).toContain('web/.env');

    const example = readFileSync(join(repoRoot, 'web', '.env.example'), 'utf8');
    for (const name of ['REDTEAM_FIXTURE_KEY', 'OPENAI_API_KEY']) {
      expect(example).toMatch(new RegExp(`^${name}=`, 'm'));
    }
  });
});
