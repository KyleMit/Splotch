import { describe, expect, it, onTestFinished } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseBenchArgs, runBench } from '../bench/run-bench.mjs';
import { loadSeeds, validateSeed } from '../bench/lib/seeds.mjs';
import { SESSION_FILES } from '../spool.mjs';
import { STREAM_FAILURE } from '../stream.mjs';

const BASE_SOURCE = 'export const answer = () => 42;\n';
const SEEDED_SOURCE = 'export const answer = () => 41;\n';
const REPRO = [
  "import { pathToFileURL } from 'node:url';",
  "import { join } from 'node:path';",
  "const { answer } = await import(pathToFileURL(join(process.cwd(), 'x.mjs')).href);",
  "if (answer() !== 42) throw new Error('off by one');",
  '',
].join('\n');
const STAND_IN_VENDOR = Object.freeze({ rival: 'codex', resolveModel: () => 'stand-in' });

// A throwaway repository whose one module answers 42, the patch that seeds an off-by-one into it,
// and a seed corpus beside it, so no test creates a worktree in the real checkout.
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'rival-bench-run-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const seedsDirectory = join(root, 'seeds');
  mkdirSync(repo);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    });
  git(['init', '-q', '-b', 'main']);
  writeFileSync(join(repo, 'x.mjs'), BASE_SOURCE);
  git(['add', 'x.mjs']);
  git(['commit', '-q', '-m', 'one']);
  writeFileSync(join(repo, 'x.mjs'), SEEDED_SOURCE);
  const patch = git(['diff']);
  git(['checkout', '--', 'x.mjs']);
  const writeSeed = (name, seedPatch = patch) => {
    const directory = join(seedsDirectory, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'seed.patch'), seedPatch);
    writeFileSync(join(directory, 'repro.mjs'), REPRO);
    writeFileSync(
      join(directory, 'key.json'),
      JSON.stringify({
        name,
        title: name,
        path: 'x.mjs',
        lines: [1, 1],
        severity: 'blocking',
        keywords: ['41'],
      })
    );
  };
  const worktrees = () =>
    git(['worktree', 'list', '--porcelain'])
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length));
  const seams = (rival) => ({
    log: () => {},
    cwd: repo,
    seedsDirectory,
    resolveVendor: async () => STAND_IN_VENDOR,
    launchRival: rival.launchRival,
  });
  return { root, repo, seedsDirectory, git, patch, writeSeed, worktrees, seams };
}

// Stands in for launch() in the order the launcher settles: the session is announced first, then
// either failed.json and a rejection with `error`, or an empty findings document and done.json.
// Records the source each cell's rival would have reviewed and every end-session call.
function standInRival(root, { error } = {}) {
  const reviewed = [];
  const ended = [];
  const launchRival = async (options, vendor, { onProgress } = {}) => {
    const cell = basename(options.cwd);
    if (options.endSession) {
      ended.push(cell);
      return { endedSession: null };
    }
    reviewed.push({ cell, source: readFileSync(join(options.cwd, 'x.mjs'), 'utf8') });
    const session = mkdtempSync(join(root, 'session-'));
    onProgress(`session: ${session}`);
    if (error) {
      writeFileSync(join(session, SESSION_FILES.failed), JSON.stringify({ reason: error.message }));
      throw error;
    }
    const logPath = join(session, SESSION_FILES.log);
    writeFileSync(logPath, '');
    writeFileSync(
      join(session, SESSION_FILES.findings),
      JSON.stringify({ summary: 'nothing found', findings: [], unverified: [] })
    );
    writeFileSync(join(session, SESSION_FILES.done), '{}');
    return { usage: undefined, logPath };
  };
  return { reviewed, ended, launchRival };
}

const reviewedCells = (rival) => rival.reviewed.map(({ cell }) => cell);
const readResult = (out, id) =>
  JSON.parse(readFileSync(join(out, 'results', `${id}.json`), 'utf8'));

describe('the bench in a throwaway repository', () => {
  // Validation is the promise the bench makes before spending anything: a seed whose repro does
  // not fail on the seeded tree is dropped, never scored.
  it('validates a seed against its base', () => {
    const fixture = createFixture();
    fixture.writeSeed('off-by-one');
    const [seed] = loadSeeds(fixture.seedsDirectory);
    const base = fixture.git(['rev-parse', 'HEAD']).trim();
    expect(
      validateSeed({ repoRoot: fixture.repo, base, seed, directory: join(fixture.root, 'wt') })
    ).toMatchObject({ ok: true, beforeStatus: 0, afterStatus: 1 });
    expect(
      validateSeed({
        repoRoot: fixture.repo,
        base,
        seed: { ...seed, control: true },
        directory: join(fixture.root, 'wt2'),
      })
    ).toMatchObject({ ok: false });
    expect(fixture.worktrees()).toEqual([realpathSync(fixture.repo)]);
  });

  it('stops at a cancelled launch without recording the cell, and a resume reruns it', async () => {
    const fixture = createFixture();
    fixture.writeSeed('a');
    fixture.writeSeed('b');
    const out = join(fixture.root, 'out');
    const options = parseBenchArgs(['--reps', '1', '--out', out]);
    const stopped = standInRival(fixture.root, {
      error: Object.assign(new Error('cancelled by SIGINT; the rival was terminated.'), {
        code: STREAM_FAILURE.cancelled,
      }),
    });

    await expect(runBench(options, fixture.seams(stopped))).rejects.toMatchObject({
      code: STREAM_FAILURE.cancelled,
      message:
        'bench cancelled during a__r1, which is not recorded (cancelled by SIGINT; the rival was terminated.); ' +
        `re-run the same command with --out ${out} to resume from it`,
    });
    expect(reviewedCells(stopped)).toEqual(['a__r1']);
    expect(stopped.ended).toEqual(['a__r1']);
    expect(readdirSync(join(out, 'results'))).toEqual([]);
    expect(fixture.worktrees()).toEqual([realpathSync(fixture.repo)]);

    // A rival that fails on its own is recorded and does not stop the run.
    const resumed = standInRival(fixture.root, {
      error: Object.assign(new Error('codex exited 2 after "none".\nusage limit'), {
        code: STREAM_FAILURE.exited,
      }),
    });
    await runBench(options, fixture.seams(resumed));
    expect(reviewedCells(resumed)).toEqual(['a__r1', 'b__r1']);
    expect(readResult(out, 'a__r1')).toMatchObject({ failed: 'codex exited 2 after "none".' });
    expect(readResult(out, 'b__r1')).toMatchObject({ failed: 'codex exited 2 after "none".' });
  });

  it('recreates a cell whose worktree a killed run left registered or behind', async () => {
    const fixture = createFixture();
    fixture.writeSeed('a');
    fixture.writeSeed('b');
    const out = join(fixture.root, 'out');
    const worktreesDir = join(out, 'worktrees');
    mkdirSync(worktreesDir, { recursive: true });
    fixture.git(['worktree', 'add', '--detach', join(worktreesDir, 'a__r1'), 'main']);
    mkdirSync(join(worktreesDir, 'b__r1'));
    writeFileSync(join(worktreesDir, 'b__r1', 'x.mjs'), 'left behind\n');
    const rival = standInRival(fixture.root);

    await runBench(parseBenchArgs(['--reps', '1', '--out', out]), fixture.seams(rival));
    expect(rival.reviewed).toEqual([
      { cell: 'a__r1', source: SEEDED_SOURCE },
      { cell: 'b__r1', source: SEEDED_SOURCE },
    ]);
    for (const id of ['a__r1', 'b__r1']) {
      const result = readResult(out, id);
      expect(result.failed).toBeUndefined();
      expect(result).toMatchObject({ findingsCount: 0, score: { detected: false } });
    }
    expect(fixture.worktrees()).toEqual([realpathSync(fixture.repo)]);
  });

  it('records a seed that no longer applies as a setup failure and runs the next cell', async () => {
    const fixture = createFixture();
    fixture.writeSeed(
      'a',
      fixture.patch.replace('-export const answer = () => 42;', '-export const answer = () => 40;')
    );
    fixture.writeSeed('b');
    const out = join(fixture.root, 'out');
    const rival = standInRival(fixture.root);

    const { reportPath, summary } = await runBench(
      parseBenchArgs(['--reps', '1', '--out', out]),
      fixture.seams(rival)
    );
    expect(readResult(out, 'a__r1').failed).toMatch(/^setup: git apply .+ patch failed: x\.mjs:1$/);
    expect(reviewedCells(rival)).toEqual(['b__r1']);
    expect(rival.ended).toEqual(['b__r1']);
    expect(summary).toMatchObject([{ rival: 'codex', cells: 2, failedCells: 1, seededCells: 1 }]);
    expect(readFileSync(reportPath, 'utf8')).toContain('| a | 1 | failed: setup: git apply ');
    expect(fixture.worktrees()).toEqual([realpathSync(fixture.repo)]);
  });
});
