import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capture, hasCommand, parseFrontmatter } from '../lib/utils.mjs';

const argumentsToPreserve = [
  '$HOME',
  '`printf substituted`',
  'say "hello"',
  'two words',
  '$(printf substituted); printf not-run | cat',
];
const argumentPrinter = 'process.stdout.write(JSON.stringify(process.argv.slice(1)))';
const utilsUrl = new URL('../lib/utils.mjs', import.meta.url).href;

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
      import { run } from ${JSON.stringify(utilsUrl)};
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

  it('keeps deliberate shell syntax available through sh', () => {
    const script = `
      import { sh } from ${JSON.stringify(utilsUrl)};
      await sh('printf "left" && printf " right"');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('left right');
  });
});

describe('parseFrontmatter', () => {
  it('parses flat keys and ignores blank lines', () => {
    expect(parseFrontmatter('---\nversion: 1.3.1\n \nandroidVersionCode: 7\n---\nRelease notes')).toEqual({
      frontmatter: 'version: 1.3.1\n \nandroidVersionCode: 7',
      meta: { version: '1.3.1', androidVersionCode: '7' },
      body: 'Release notes',
    });
  });

  it('returns null without a frontmatter block', () => {
    expect(parseFrontmatter('Release notes')).toBeNull();
  });

  it('rejects malformed non-blank frontmatter lines', () => {
    expect(() => parseFrontmatter('---\nandroid-version-code: 7\n---\nRelease notes')).toThrow(
      'Malformed frontmatter line 1: android-version-code: 7'
    );
  });
});
