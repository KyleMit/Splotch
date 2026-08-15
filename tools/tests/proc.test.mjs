import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { capture, hasCommand, isMain } from '../lib/proc.mjs';

const argumentsToPreserve = [
  '$HOME',
  '`printf substituted`',
  'say "hello"',
  'two words',
  '$(printf substituted); printf not-run | cat',
];
const argumentPrinter = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';
// pathToFileURL rather than `new URL('../lib/proc.mjs', import.meta.url)`: knip
// reads that form as a module reference and registers the target as an entry
// with export analysis skipped, which silently erases proc.mjs's whole export
// surface from `lint:dead`. Built from a path, it is just a string to knip.
const procUrl = pathToFileURL(join(import.meta.dirname, '..', 'lib', 'proc.mjs')).href;
const missingCommand = 'splotch-command-that-does-not-exist';

describe('command helpers', () => {
  it('detects commands without which on PATH', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-has-command-'));
    const originalPath = process.env.PATH;

    try {
      symlinkSync('/bin/sh', join(fixtureDir, 'sh'));
      symlinkSync(process.execPath, join(fixtureDir, 'node'));
      process.env.PATH = fixtureDir;

      expect(hasCommand('node')).toBe(true);
      expect(hasCommand('missing-command')).toBe(false);
    } finally {
      process.env.PATH = originalPath;
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('passes capture arguments to the child unchanged', () => {
    const output = capture(process.execPath, ['-e', argumentPrinter, ...argumentsToPreserve]);

    expect(JSON.parse(output)).toEqual(argumentsToPreserve);
  });

  it('passes run arguments to the child unchanged', () => {
    const script = `
      import { run } from ${JSON.stringify(procUrl)};
      run(process.execPath, [
        '-e',
        ${JSON.stringify(argumentPrinter)},
        ...${JSON.stringify(argumentsToPreserve)}
      ], { echo: false });
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(argumentsToPreserve);
  });

  it('reports why run could not launch the command', () => {
    const script = `
      import { run } from ${JSON.stringify(procUrl)};
      run(${JSON.stringify(missingCommand)}, [], { echo: false });
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(missingCommand);
    expect(result.stderr).toContain('ENOENT');
  });

  it('reports why capture could not launch the command', () => {
    const script = `
      import { capture } from ${JSON.stringify(procUrl)};
      capture(${JSON.stringify(missingCommand)});
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(missingCommand);
    expect(result.stderr).toContain('ENOENT');
  });

  it('recognizes a symlinked main module', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-is-main-'));
    const sourcePath = join(fixtureDir, 'source.mjs');
    const symlinkPath = join(fixtureDir, 'entry.mjs');

    try {
      writeFileSync(
        sourcePath,
        `import { isMain } from ${JSON.stringify(procUrl)};\n` +
          'process.stdout.write(String(isMain(import.meta.url)));\n'
      );
      symlinkSync(sourcePath, symlinkPath);
      const result = spawnSync(process.execPath, [symlinkPath], { encoding: 'utf8' });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('true');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('returns false when the entry argument is not a file', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-is-main-missing-'));
    const missingEntry = join(fixtureDir, 'missing.mjs');
    const script = `
      import { isMain } from ${JSON.stringify(procUrl)};
      process.stdout.write(String(isMain('file:///not-the-entry.mjs')));
    `;

    try {
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', script, missingEntry],
        { encoding: 'utf8' }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('false');
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  // The gate this gets wrong fails open: `isMain(import.meta)` compares unequal
  // to every href, so the CLI it guards runs nothing and exits 0 — a green
  // no-op, which is the one outcome a check script must never produce.
  it('throws on import.meta rather than silently never matching', () => {
    expect(() => isMain(import.meta)).toThrow(TypeError);
    expect(() => isMain(import.meta)).toThrow(/import\.meta\.url/);
  });

  it('keeps deliberate shell syntax available through sh', () => {
    const script = `
      import { sh } from ${JSON.stringify(procUrl)};
      await sh('printf "left" && printf " right"');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('left right');
  });
});
