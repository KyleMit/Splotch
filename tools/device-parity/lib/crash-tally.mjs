// Summary of a crash matrix: per scenario, target, and arm, how many runs were valid evidence and
// what each valid run's verdict was.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRASH_TARGET_NAMES } from './crash-targets.mjs';
import { VERDICTS } from './crash-verdict.mjs';

const VERDICT_COLUMN = { alive: 'alive', crashed: 'crashed', 'error-screened': 'screened' };

// A run whose scenario threw is invalid whatever its verdict: the harness, not the app, may have
// stopped it. Its verdict is still in its JSON for the person deciding to re-run or archive it.
export function tallyCrashRuns(runs) {
  const rows = new Map();
  for (const run of runs) {
    const key = `${run.scenario}|${run.target}|${run.arm}`;
    if (!rows.has(key)) {
      rows.set(key, {
        scenario: run.scenario,
        target: run.target,
        arm: run.arm,
        valid: 0,
        alive: 0,
        crashed: 0,
        screened: 0,
        invalid: 0,
        diagnostics: 0,
      });
    }
    const row = rows.get(key);
    if (run.scenarioError) {
      row.invalid += 1;
      continue;
    }
    row.valid += 1;
    row[VERDICT_COLUMN[run.verdict]] += 1;
    if (run.diagnostics?.length) row.diagnostics += 1;
  }
  return [...rows.keys()].sort().map((key) => rows.get(key));
}

function readRun(path) {
  const run = JSON.parse(readFileSync(path, 'utf8'));
  for (const field of ['scenario', 'target', 'arm']) {
    if (typeof run[field] !== 'string') throw new Error(`${path}: no "${field}" string`);
  }
  if (!VERDICTS.includes(run.verdict)) throw new Error(`${path}: unknown verdict ${run.verdict}`);
  return run;
}

const jsonFiles = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')) : [];

// Runs live at <root>/<target>/*.json; runs moved aside after review live at
// <root>/invalid/<target>/*.json and are only counted.
export function readCrashMatrix(root) {
  const runs = CRASH_TARGET_NAMES.flatMap((target) =>
    jsonFiles(join(root, target)).map((name) => readRun(join(root, target, name)))
  );
  const archivedInvalid = Object.fromEntries(
    CRASH_TARGET_NAMES.map((target) => [target, jsonFiles(join(root, 'invalid', target)).length])
  );
  return { runs, archivedInvalid };
}
