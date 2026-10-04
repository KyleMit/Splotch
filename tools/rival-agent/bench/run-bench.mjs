#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isEntryPoint } from '../broker-server.mjs';
import { launch } from '../launch.mjs';
import { readJson, sessionPath, SESSION_FILES } from '../spool.mjs';
import { STREAM_FAILURE } from '../stream.mjs';
import { git } from '../worktree.mjs';
import { serveSession } from './lib/handler.mjs';
import { renderReport } from './lib/report.mjs';
import { countLocalCommands, normalizeUsage, scoreCell, summarize } from './lib/score.mjs';
import {
  applySeed,
  createBenchWorktree,
  loadSeeds,
  removeBenchWorktree,
  SEEDS_DIRECTORY,
  validateSeed,
} from './lib/seeds.mjs';

const RIVALS = Object.freeze({
  codex: '../../../.claude/skills/run-rival-agent/scripts/launch-codex.mjs',
  claude: '../../../.agents/skills/run-rival-agent/scripts/launch-claude.mjs',
});
const DEFAULT_BASE = 'main';
const DEFAULT_REPS = 2;
const USAGE =
  'usage: run-bench.mjs [--rival codex|claude] [--reps <n>] [--seeds a,b] [--base <ref>] [--out <dir>] [--report <path>] [--model <slug>] [--effort low|medium|high] [--validate]';

export function parseBenchArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      rival: { type: 'string', default: 'codex' },
      reps: { type: 'string', default: String(DEFAULT_REPS) },
      seeds: { type: 'string' },
      base: { type: 'string', default: DEFAULT_BASE },
      out: { type: 'string' },
      report: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string', default: 'high' },
      validate: { type: 'boolean', default: false },
    },
  });
  if (positionals.length > 0) throw new Error(USAGE);
  if (!(values.rival in RIVALS)) throw new Error(`unsupported rival: ${values.rival}`);
  const reps = Number(values.reps);
  if (!Number.isInteger(reps) || reps < 1) throw new Error('--reps must be a positive integer');
  return {
    rival: values.rival,
    reps,
    seeds: values.seeds?.split(',').filter(Boolean),
    base: values.base,
    out: values.out && resolve(values.out),
    report: values.report && resolve(values.report),
    model: values.model,
    effort: values.effort,
    validate: values.validate,
  };
}

export const cellId = ({ seed, rep }) => `${seed}__r${rep}`;

// Repetition-major so an interrupted overnight run leaves a complete first pass over every cell
// rather than every repetition of the first few seeds.
export function planCells({ seeds, reps }) {
  const cells = [];
  for (let rep = 1; rep <= reps; rep += 1) {
    for (const seed of seeds) cells.push({ seed: seed.name, rep });
  }
  return cells;
}

async function loadVendor(rival) {
  const module = await import(new URL(RIVALS[rival], import.meta.url));
  return rival === 'codex' ? module.codexVendor : module.claudeVendor;
}

const firstLine = (error) => error.message.split('\n')[0];

function launchOptions({ cwd, model, effort, endSession = false }) {
  return {
    scope: { kind: 'uncommitted', base: undefined, commit: undefined, number: undefined },
    questionFile: undefined,
    promptFile: undefined,
    cwd,
    model,
    effort,
    fresh: true,
    endSession,
  };
}

// One cell: a bench worktree at the base with the seed applied, one fresh rival round on its
// working tree with the bench serving the broker, the findings scored against the key, and the
// ledger record the round wrote removed again so the bench leaves nothing behind.
async function runCell({
  repoRoot,
  base,
  seed,
  rep,
  vendor,
  options,
  worktreesDir,
  log,
  launchRival,
}) {
  const id = cellId({ seed: seed.name, rep });
  const directory = join(worktreesDir, id);
  const startedAt = Date.now();
  const result = {
    id,
    seed: seed.name,
    control: seed.control,
    rival: vendor.rival,
    rep,
    startedAt: new Date(startedAt).toISOString(),
  };
  try {
    createBenchWorktree(repoRoot, base, directory);
    applySeed(directory, seed);
  } catch (error) {
    // A worktree git refuses, or a seed that no longer applies to the base, fails only this cell;
    // the prefix keeps the report from reading that failure as the rival's.
    removeBenchWorktree(repoRoot, directory);
    result.failed = `setup: ${firstLine(error)}`;
    return result;
  }
  try {
    const cellOptions = launchOptions({
      cwd: directory,
      model: options.model,
      effort: options.effort,
    });
    let session;
    let resolveSession;
    const sessionSeen = new Promise((resolveSeen) => {
      resolveSession = resolveSeen;
    });
    const launched = launchRival(cellOptions, vendor, {
      onProgress: (line) => {
        log(`[${id}] ${line}`);
        if (line.startsWith('session: ')) {
          session = line.slice('session: '.length);
          resolveSession(session);
        }
      },
    });
    const settledFirst = launched.then(
      () => undefined,
      () => undefined
    );
    await Promise.race([sessionSeen, settledFirst]);
    const served = session
      ? serveSession(session, {
          onDecision: (decision) =>
            log(`[${id}] ${decision.approved ? 'approved' : 'declined'} ${decision.command}`),
        })
      : Promise.resolve({ decisions: [] });
    const [launchOutcome, serveOutcome] = await Promise.allSettled([launched, served]);
    result.wallSeconds = (Date.now() - startedAt) / 1000;
    result.session = session;
    result.decisions = serveOutcome.status === 'fulfilled' ? serveOutcome.value.decisions : [];
    result.turns = {
      approved: result.decisions.filter((decision) => decision.approved).length,
      declined: result.decisions.filter((decision) => !decision.approved).length,
    };
    if (launchOutcome.status === 'rejected') {
      // The operator stopped the run; the rival did not fail. Rethrown unrecorded, the cancellation
      // stops the bench, and a resume with the same --out reruns this cell.
      if (launchOutcome.reason.code === STREAM_FAILURE.cancelled) throw launchOutcome.reason;
      result.failed = firstLine(launchOutcome.reason);
      return result;
    }
    const done = launchOutcome.value;
    const findings = readJson(sessionPath(session, SESSION_FILES.findings));
    result.findingsCount = findings.findings.length;
    result.unverified = findings.unverified.length;
    result.findings = findings.findings;
    result.unverifiedItems = findings.unverified;
    result.summary = findings.summary;
    result.usage = normalizeUsage(vendor.rival, done.usage);
    result.localCommands = countLocalCommands(done.logPath, vendor.rival);
    result.score = scoreCell({ key: seed.key, findings: findings.findings });
    return result;
  } finally {
    try {
      await launchRival(
        launchOptions({
          cwd: directory,
          model: options.model,
          effort: options.effort,
          endSession: true,
        }),
        vendor
      );
    } catch (error) {
      log(`[${id}] end-session: ${firstLine(error)}`);
    }
    removeBenchWorktree(repoRoot, directory);
  }
}

// The interrupted cell was never recorded, so the same command with the same --out skips the
// recorded cells and starts again from this one.
function resumableCancellation(error, { id, out }) {
  return Object.assign(
    new Error(
      `bench cancelled during ${id}, which is not recorded (${firstLine(error)}); re-run the same command with --out ${out} to resume from it`,
      { cause: error }
    ),
    { code: error.code }
  );
}

function readResults(resultsDir) {
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(resultsDir, name), 'utf8')));
}

// `log`, `cwd`, `seedsDirectory`, `resolveVendor` and `launchRival` are seams kept for tests, which
// run the bench in a throwaway repository against a stand-in rival; the CLI passes none of them.
export async function runBench(
  options,
  {
    log = (line) => process.stderr.write(`${line}\n`),
    cwd = process.cwd(),
    seedsDirectory = SEEDS_DIRECTORY,
    resolveVendor = loadVendor,
    launchRival = launch,
  } = {}
) {
  const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  const base = git(repoRoot, ['rev-parse', `${options.base}^{commit}`]);
  const seeds = loadSeeds(seedsDirectory, options.seeds);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const out = options.out ?? join(tmpdir(), 'splotch-rival-bench', runId);
  const worktreesDir = join(out, 'worktrees');
  const resultsDir = join(out, 'results');
  mkdirSync(worktreesDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  if (options.validate) {
    const outcomes = seeds.map((seed) =>
      validateSeed({ repoRoot, base, seed, directory: join(worktreesDir, `validate-${seed.name}`) })
    );
    for (const outcome of outcomes) {
      log(
        `${outcome.ok ? 'ok  ' : 'FAIL'} ${outcome.name} (base exit ${outcome.beforeStatus}, seeded exit ${outcome.afterStatus})${outcome.detail ? `\n${outcome.detail}` : ''}`
      );
    }
    return { base, validated: outcomes, ok: outcomes.every((outcome) => outcome.ok) };
  }

  const vendor = await resolveVendor(options.rival);
  const model = vendor.resolveModel(options.model);
  const plan = planCells({ seeds, reps: options.reps });
  const startedAt = new Date().toISOString();
  log(`bench ${runId}: ${plan.length} cells, results under ${resultsDir}`);
  for (const planned of plan) {
    const id = cellId(planned);
    const resultPath = join(resultsDir, `${id}.json`);
    if (existsSync(resultPath)) {
      log(`[${id}] already recorded, skipping`);
      continue;
    }
    const seed = seeds.find((candidate) => candidate.name === planned.seed);
    const result = await runCell({
      repoRoot,
      base,
      seed,
      rep: planned.rep,
      vendor,
      options,
      worktreesDir,
      log,
      launchRival,
    }).catch((error) => {
      throw error.code === STREAM_FAILURE.cancelled
        ? resumableCancellation(error, { id, out })
        : error;
    });
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
    log(
      `[${id}] ${result.failed ? `failed: ${result.failed}` : `${result.control ? `${result.score.falsePositives} false` : result.score.detected ? 'found' : 'missed'}, ${result.turns.approved + result.turns.declined} turns, ${Math.round(result.wallSeconds)}s`}`
    );
  }
  const cells = readResults(resultsDir).sort(
    (a, b) => a.rep - b.rep || a.seed.localeCompare(b.seed)
  );
  const summary = summarize(cells);
  const report = renderReport({
    runId,
    startedAt,
    base,
    rival: options.rival,
    model,
    effort: options.effort,
    reps: options.reps,
    cells,
    summary,
  });
  const reportPath = options.report ?? join(out, 'report.md');
  writeFileSync(reportPath, report);
  return { runId, base, out, reportPath, summary };
}

export function main(argv = process.argv.slice(2)) {
  return runBench(parseBenchArgs(argv))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.ok === false) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}

if (isEntryPoint(import.meta.url)) main();
