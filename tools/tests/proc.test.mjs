import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import {
  NON_NEGATIVE_INTEGER,
  POSITIVE_INTEGER,
  POSITIVE_NUMBER,
  TCP_PORT,
  argFlag,
  argNumber,
  capture,
  hasCommand,
  isMain,
  parseNumberFlag,
  readSwitch,
  readValueFlag,
  rejectUnknownFlags,
} from '../lib/proc.mjs';

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
// Each spelling below once read as a plausible value or as absent, so a run
// captured the wrong device, port, or URL and its artifact still looked valid.
describe('readValueFlag', () => {
  it('keeps every = after the first as part of the value', () => {
    const url = 'http://192.168.1.5:4173/?probe=abc&x=1';

    expect(readValueFlag([`--url=${url}`], 'url')).toBe(url);
    expect(readValueFlag(['--label=a=b'], 'label')).toBe('a=b');
  });

  it('reads an absent flag as undefined without matching a longer name', () => {
    expect(readValueFlag([], 'device')).toBeUndefined();
    expect(readValueFlag(['--device-id=abc', '--device-id'], 'device')).toBeUndefined();
  });

  it.each([
    ['bare', ['--device']],
    ['space-separated', ['--device', 'ipad']],
  ])('rejects the %s form of a value flag', (_form, argv) => {
    expect(() => readValueFlag(argv, 'device')).toThrow(
      '--device takes a value: write --device=<value>'
    );
  });

  it('rejects an empty value', () => {
    expect(() => readValueFlag(['--throttle='], 'throttle')).toThrow(
      '--throttle= is empty: give it a value or leave it out'
    );
  });
});

// `--keep-all=true` once read as absent, so a study promotion kept one capture
// per cell while appearing to accept a request to keep them all.
describe('readSwitch', () => {
  it('reads a bare switch as present and an absent one as not', () => {
    expect(readSwitch(['--keep-all'], 'keep-all')).toBe(true);
    expect(readSwitch([], 'keep-all')).toBe(false);
    expect(readSwitch(['--keep-all-but=1'], 'keep-all')).toBe(false);
  });

  it.each(['--keep-all=true', '--keep-all='])('rejects %j', (arg) => {
    expect(() => readSwitch([arg], 'keep-all')).toThrow(
      '--keep-all is a switch: write --keep-all with no value'
    );
  });
});

describe('argFlag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the given argv, falling back when the flag is absent', () => {
    expect(argFlag('url', 'fallback', ['node', 'tool.mjs', '--url=http://h/?a=b'])).toBe(
      'http://h/?a=b'
    );
    expect(argFlag('url', 'fallback', ['node', 'tool.mjs'])).toBe('fallback');
  });

  it('exits with the one-line grammar error for a bare value flag', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    expect(() => argFlag('port', '4173', ['node', 'tool.mjs', '--port', '5000'])).toThrow(
      'process exited'
    );
    expect(error).toHaveBeenCalledWith('--port takes a value: write --port=<value>');
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('rejectUnknownFlags', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts every declared flag in either form and leaves positionals alone', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    rejectUnknownFlags(['strict', 'base'], ['--strict', '--base=origin/main', 'sources.json']);
    expect(exit).not.toHaveBeenCalled();
  });

  // A near-miss spelling used to run a different job than the one asked for:
  // `--manifest=` on the generator regenerated the default matrix and exited 0.
  it('names every unknown flag and the declared set in one line', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    expect(() =>
      rejectUnknownFlags(['strict', 'base'], ['--stict', '--manifest=x.json', '--base=main'])
    ).toThrow('process exited');
    expect(error).toHaveBeenCalledExactlyOnceWith(
      'Unknown flag --stict --manifest=x.json — known flags: base, strict'
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('parseNumberFlag', () => {
  it.each([
    ['4', POSITIVE_INTEGER, 4],
    ['0', NON_NEGATIVE_INTEGER, 0],
    ['0', { min: 0 }, 0],
    ['2.5', POSITIVE_NUMBER, 2.5],
    ['0.5', POSITIVE_NUMBER, 0.5],
    ['10', POSITIVE_INTEGER, 10],
    ['-10', { integer: true }, -10],
    ['65535', TCP_PORT, 65_535],
  ])('accepts %j', (raw, rule, expected) => {
    expect(parseNumberFlag('value', raw, rule)).toBe(expected);
  });

  it.each([
    ['4junk', POSITIVE_INTEGER, 'an integer >= 1'],
    ['', POSITIVE_INTEGER, 'an integer >= 1'],
    [' 4', POSITIVE_INTEGER, 'an integer >= 1'],
    ['-1', NON_NEGATIVE_INTEGER, 'an integer >= 0'],
    ['2.5', POSITIVE_INTEGER, 'an integer >= 1'],
    ['0', POSITIVE_NUMBER, 'a number > 0'],
    ['Infinity', POSITIVE_NUMBER, 'a number > 0'],
    ['0x10', POSITIVE_NUMBER, 'a number > 0'],
    ['1e3', POSITIVE_NUMBER, 'a number > 0'],
    ['41x', TCP_PORT, 'an integer >= 1 and <= 65535'],
    ['0', TCP_PORT, 'an integer >= 1 and <= 65535'],
    ['65536', TCP_PORT, 'an integer >= 1 and <= 65535'],
    ['080', TCP_PORT, 'an integer >= 1 and <= 65535'],
    ['00', NON_NEGATIVE_INTEGER, 'an integer >= 0'],
    ['-05', { integer: true }, 'an integer'],
    ['00.5', POSITIVE_NUMBER, 'a number > 0'],
    ['05.5', POSITIVE_NUMBER, 'a number > 0'],
    ['99999999999999999999', POSITIVE_INTEGER, 'an integer >= 1'],
    // Overflows to Infinity, which the open upper bound of these rules admits.
    ['9'.repeat(400), POSITIVE_NUMBER, 'a number > 0'],
    ['9'.repeat(400), { min: 0 }, 'a number >= 0'],
  ])('rejects %j', (raw, rule, described) => {
    expect(() => parseNumberFlag('value', raw, rule)).toThrow(
      `--value must be ${described}, got "${raw}"`
    );
  });
});

describe('argNumber', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the fallback unparsed when the flag is absent', () => {
    expect(argNumber('repeats', 4, POSITIVE_INTEGER, ['node', 'tool.mjs'])).toBe(4);
    expect(argNumber('repeats', undefined, POSITIVE_INTEGER, ['node', 'tool.mjs'])).toBe(undefined);
  });

  it('parses a present value by its rule', () => {
    expect(argNumber('repeats', 4, POSITIVE_INTEGER, ['--repeats=6'])).toBe(6);
  });

  it('exits on a value its rule rejects', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process exited');
    });

    expect(() => argNumber('repeats', 4, POSITIVE_INTEGER, ['--repeats=4junk'])).toThrow(
      'process exited'
    );
    expect(error).toHaveBeenCalledWith('--repeats must be an integer >= 1, got "4junk"');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
