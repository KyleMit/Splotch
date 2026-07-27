import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = join(import.meta.dirname, '..', '..');
const analyzePath = join(repoRoot, 'scripts', 'perf', 'analyze.mjs');
const webInspectorPath = join(repoRoot, 'scripts', 'perf', 'analyze-webinspector.mjs');
const replayPath = join(repoRoot, 'scripts', 'perf', 'replay-scenario.mjs');

let fixtureDir;

beforeEach(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'splotch-perf-cli-'));
});

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

function expectCliFailure(script, args, message) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`${message}\n`);
}

describe('performance CLI input failures', () => {
  it('reports a missing Chrome trace', () => {
    const path = join(fixtureDir, 'missing-trace.json');

    expectCliFailure(analyzePath, [path], `Trace not found: ${path}`);
  });

  it('reports invalid Chrome trace JSON', () => {
    const path = join(fixtureDir, 'trace.json');
    writeFileSync(path, '');

    expectCliFailure(analyzePath, [path], `Trace is not valid JSON: ${path}`);
  });

  it('reports a missing Web Inspector export', () => {
    const path = join(fixtureDir, 'missing-webinspector.json');

    expectCliFailure(
      webInspectorPath,
      [path],
      `Web Inspector export not found or unreadable: ${path}`
    );
  });

  it('reports invalid Web Inspector JSON', () => {
    const path = join(fixtureDir, 'webinspector.json');
    writeFileSync(path, '');

    expectCliFailure(webInspectorPath, [path], `Web Inspector export is not valid JSON: ${path}`);
  });

  it('reports a Web Inspector export without a recording', () => {
    const path = join(fixtureDir, 'webinspector.json');
    writeFileSync(path, JSON.stringify({ version: 1 }));

    expectCliFailure(
      webInspectorPath,
      [path],
      `${path} is not a Web Inspector export (no .recording)`
    );
  });

  it('reports a missing replay recording', () => {
    const path = join(fixtureDir, 'missing-replay.json');

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording not found or unreadable: ${path}`
    );
  });

  it('reports invalid replay recording JSON', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(path, '');

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording is not valid JSON: ${path}`
    );
  });

  it('reports a replay recording without an events array', () => {
    const path = join(fixtureDir, 'replay.json');
    writeFileSync(path, JSON.stringify({ meta: {} }));

    expectCliFailure(
      replayPath,
      [`--recording=${path}`],
      `Replay recording has no events array: ${path}`
    );
  });
});
