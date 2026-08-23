// How far along is a campaign, and what is left?
//
//   npm run perf:campaign:status -- --target=ipad-device-web
//   npm run perf:campaign:status -- --target=mac-safari --output-root=perf-profiles/campaign
//
// Exists because the obvious ways to answer this from the ledger are both wrong.
// It is an append-only log with skip and retry rows, so `wc -l` is not a cell
// count, and a resumed run records `already-valid` rather than `valid-json`, so
// grepping the latter undercounts a finished target.
//
// Acceptance here matches the runner's: a cell is done when its artifact is on
// disk and matches the requested runtime, whatever the ledger says. The ledger
// answers the other half — which cells have burned attempts and how.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ROOT, argFlag, fail, isMain, runMain } from '../lib/proc.mjs';
import { artifactMatchesRuntime, campaignTarget, planCampaign } from './lib/campaign-plan.mjs';
import { attemptsFor, completedCells, parseLedger } from './lib/campaign-ledger.mjs';

const absolute = (path) => (isAbsolute(path) ? path : join(ROOT, path));

function artifactLanded(path, runtime) {
  const full = absolute(path);
  if (!existsSync(full)) return false;
  try {
    return artifactMatchesRuntime(JSON.parse(readFileSync(full, 'utf8')), runtime);
  } catch {
    return false;
  }
}

export function campaignProgress(plan, { runtime, ledgerRows, artifactLanded: landed }) {
  const recorded = completedCells(ledgerRows);
  const done = [];
  const outstanding = [];
  for (const cell of plan) {
    if (landed(cell.artifact, runtime) || recorded.has(cell.id)) done.push(cell.id);
    else outstanding.push({ cell: cell.id, attempts: attemptsFor(ledgerRows, cell.id) });
  }
  return { total: plan.length, done, outstanding };
}

export async function campaignStatus({
  targetId = argFlag('target'),
  outputRoot = argFlag('output-root', 'perf-profiles/campaign'),
  ledgerPath = argFlag('ledger'),
} = {}) {
  if (!targetId) fail('--target= is required');
  const { runtime } = campaignTarget(targetId);
  const plan = planCampaign(targetId, { outputRoot, host: {} });
  const ledger = absolute(ledgerPath ?? `${outputRoot}/${targetId}/ledger.tsv`);
  const ledgerRows = existsSync(ledger) ? parseLedger(readFileSync(ledger, 'utf8')) : [];

  const { total, done, outstanding } = campaignProgress(plan, {
    runtime,
    ledgerRows,
    artifactLanded,
  });

  console.log(`${targetId}: ${done.length}/${total} cells complete`);
  for (const entry of outstanding) {
    console.log(`  todo  ${entry.cell.padEnd(26)} ${entry.attempts} attempt(s) spent`);
  }
  return { total, done, outstanding };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await campaignStatus();
  });
}
