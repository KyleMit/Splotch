import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';

const CLI = join(ROOT, 'tools/marketing-assets/gen-readme-hero.mjs');
const CLI_TIMEOUT_MS = 10_000;
const EXISTING_IMAGE = Buffer.from('existing README hero');

function runHeroCli(...args) {
  return spawnSync(process.execPath, ['--experimental-strip-types', CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS,
  });
}

describe('README hero CLI preflight', () => {
  let directory;
  let output;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'readme-hero-test-'));
    output = join(directory, 'hero.webp');
    writeFileSync(output, EXISTING_IMAGE);
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it.each(['0', '-1', '65536', 'not-a-port'])(
    'rejects port %s without replacing output',
    (port) => {
      const result = runHeroCli(`--port=${port}`, '--out', output);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Invalid --port');
      expect(readFileSync(output)).toEqual(EXISTING_IMAGE);
    }
  );

  it('rejects a non-WebP output before launching the server', () => {
    const result = runHeroCli('--out', join(directory, 'hero.png'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--out must end in .webp');
  });

  it('prints help without launching the server or replacing output', () => {
    const result = runHeroCli('--help', '--out', output);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('npm run gen:readme-hero');
    expect(readFileSync(output)).toEqual(EXISTING_IMAGE);
  });
});
