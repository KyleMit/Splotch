import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const capabilityRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = join(capabilityRoot, '..', '..');
const wrapper = join(capabilityRoot, 'trace-centerlines.mjs');
const fixture = join(capabilityRoot, 'benchmark/corpus/01-horizontal-line.svg');
const storeDrawingConverter = pathToFileURL(
  join(repoRoot, 'tools/store-drawings/gen-pointer-instructions.mjs')
).href;
const temporaryRoots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'centerline-contract-'));
  temporaryRoots.push(root);
  return root;
}

function runTrace(args, options = {}) {
  return spawnSync(process.execPath, [wrapper, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('centerline tracing contract', () => {
  it('fails before writing when uv is unavailable', () => {
    const root = temporaryRoot();
    const output = join(root, 'line-tall.svg');
    const result = runTrace(['--input', fixture, '--output', output], {
      env: { ...process.env, PATH: '/centerline-test-without-uv' },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('centerline tracing requires uv');
    expect(existsSync(output)).toBe(false);
  });

  it('runs production traces without the development dependency group', () => {
    const root = temporaryRoot();
    const bin = join(root, 'bin');
    const uv = join(bin, 'uv');
    const argsLog = join(root, 'uv-args.txt');
    mkdirSync(bin);
    writeFileSync(
      uv,
      '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\nprintf "%s\\n" "$@" > "$UV_ARGS_LOG"\n'
    );
    chmodSync(uv, 0o755);

    const result = runTrace([], {
      env: { ...process.env, PATH: bin, UV_ARGS_LOG: argsLog },
    });
    const uvArgs = readFileSync(argsLog, 'utf8').trim().split('\n');

    expect(result.status).toBe(0);
    expect(uvArgs[0]).toBe('run');
    expect(uvArgs).toContain('--locked');
    expect(uvArgs).toContain('--no-dev');
    expect(uvArgs.indexOf('--no-dev')).toBeLessThan(uvArgs.indexOf('python'));
  });

  it('rejects invalid input without replacing an existing output', () => {
    const root = temporaryRoot();
    const output = join(root, 'line-tall.svg');
    writeFileSync(output, 'baseline');

    const result = runTrace(['--input', join(root, 'missing.svg'), '--output', output]);

    expect(result.status).toBe(2);
    expect(readFileSync(output, 'utf8')).toBe('baseline');
  });

  it('traces deterministically into the store-drawing consumer contract', () => {
    const root = temporaryRoot();
    const first = join(root, 'first/line-tall.svg');
    const second = join(root, 'second/line-tall.svg');
    const common = ['--input', fixture, '--scale', '2', '--lambda', '0.5'];

    const firstRun = runTrace([...common, '--output', first]);
    const secondRun = runTrace([...common, '--output', second]);

    expect(firstRun.status, firstRun.stderr).toBe(0);
    expect(secondRun.status, secondRun.stderr).toBe(0);
    expect(readFileSync(second, 'utf8')).toBe(readFileSync(first, 'utf8'));
    const consumer = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--disable-warning=ExperimentalWarning',
        '--input-type=module',
        '--eval',
        `import { readFileSync } from 'node:fs';
         import { convertSvg } from '${storeDrawingConverter}';
         const drawing = convertSvg(readFileSync(process.argv[1], 'utf8'), 'line-tall.svg');
         if (!drawing.strokes.length || drawing.strokes.some(({ size }) => size < 1 || size > 5)) process.exit(1);`,
        first,
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    );
    expect(consumer.status, consumer.stderr).toBe(0);
  }, 60_000);

  it('refuses to run when pyproject metadata and uv.lock disagree', () => {
    const root = temporaryRoot();
    const pyproject = readFileSync(join(capabilityRoot, 'pyproject.toml'), 'utf8').replace(
      'numpy>=1.26',
      'numpy==2.4.5'
    );
    writeFileSync(join(root, 'pyproject.toml'), pyproject);
    copyFileSync(join(capabilityRoot, 'uv.lock'), join(root, 'uv.lock'));

    const result = spawnSync(
      'uv',
      ['run', '--project', root, '--locked', 'python', '-c', 'print("unexpected")'],
      { cwd: repoRoot, encoding: 'utf8' }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/lock|locked/i);
  });
});
