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
import {
  campaignQueue,
  campaignTarget,
  planCampaign,
  planCampaignReferences,
} from './lib/campaign-plan.mjs';
import { cellInspection } from './run-campaign.mjs';
import { attemptsFor, completedCells, parseLedger } from './lib/campaign-ledger.mjs';

const absolute = (path) => (isAbsolute(path) ? path : join(ROOT, path));
const list = (value) =>
  value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export function campaignProgress(plan, { ledgerRows, inspect }) {
  const recorded = completedCells(ledgerRows);
  const done = [];
  const outstanding = [];
  for (const cell of plan) {
    // Completion is decided by CURRENT artifact inspection only. A ledger row
    // saying a cell landed does not survive the artifact being deleted, corrupted
    // or replaced with the wrong runtime — the runner would rerun that cell, so
    // reporting it done contradicts the thing status exists to describe. The
    // ledger explains history and drift; it does not certify.
    const inspected = inspect(cell);
    if (inspected.ok) done.push(cell.id);
    else {
      outstanding.push({
        cell: cell.id,
        attempts: attemptsFor(ledgerRows, cell.id),
        status: inspected.status,
        // A cell the ledger calls complete whose artifact no longer inspects
        // clean is the interesting case, so it is named rather than hidden.
        ledgerDisagrees: recorded.has(cell.id),
      });
    }
  }
  return { total: plan.length, done, outstanding };
}

export async function campaignStatus({
  targetId = argFlag('target'),
  outputRoot = argFlag('output-root', 'perf-profiles/campaign'),
  ledgerPath = argFlag('ledger'),
  modes = list(argFlag('modes')),
  items = list(argFlag('items')),
} = {}) {
  if (!targetId) fail('--target= is required');
  const { runtime, refreshRegime, captureRuntime } = campaignTarget(targetId);
  const plan = planCampaign(targetId, { outputRoot, host: {}, modes, items });
  const references = planCampaignReferences(targetId, {
    modeId: plan[0].mode.id,
    outputRoot,
    host: {},
    productCellCount: plan.length,
  });
  const queue = campaignQueue(plan, references);
  const ledger = absolute(ledgerPath ?? `${outputRoot}/${targetId}/ledger.tsv`);
  const ledgerRows = existsSync(ledger) ? parseLedger(readFileSync(ledger, 'utf8')) : [];

  // The runner's own inspection via the shared cellInspection builder, not a
  // reimplementation: rebuilding the options here has misreported twice — once
  // skipping the fidelity verdict (structurally rejected measurements counted
  // complete), once demanding a refresh regime of action sweeps that report none.
  const { total, done, outstanding } = campaignProgress(queue, {
    runtime,
    ledgerRows,
    inspect: (cell) => cellInspection(cell, { runtime, refreshRegime, captureRuntime }),
  });

  const referenceSuffix = references.length ? ` + ${references.length} drift references` : '';
  console.log(
    `${targetId}: ${done.length}/${total} queued captures complete ` +
      `(${plan.length} cells${referenceSuffix})`
  );
  for (const entry of outstanding) {
    const drift = entry.ledgerDisagrees ? '  (ledger says complete — artifact does not)' : '';
    console.log(
      `  todo  ${entry.cell.padEnd(26)} ${entry.attempts} attempt(s) spent · ${entry.status}${drift}`
    );
  }
  return {
    total,
    productCells: plan.length,
    referenceCells: references.length,
    done,
    outstanding,
  };
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await campaignStatus();
  });
}
