// Drive one deployment-target capture campaign to completion, resumably.
//
//   npm run perf:campaign -- --target=ipad-simulator-native --capabilities-file=<file>
//   npm run perf:campaign -- --target=android-emulator-web --device-id=emulator-5554 --url=http://127.0.0.1:4173/
//   npm run perf:campaign -- --target=android-emulator-native --dry-run
//
// Resumability is the point. A cell whose artifact already parses is skipped, a
// failed cell is retried up to --max-attempts, and a cell that exhausts them is
// recorded as a P1 and the queue continues rather than ending the run. Acceptance
// is "the artifact parses", never the child's exit code, so a valid red gate is
// kept instead of being retried until it turns green.
//
// Host identity stays an input: device ids, capability files, and preview URLs are
// flags, and the ledger lives wherever --ledger points. Nothing device-specific is
// committed.

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, fail, isMain, runMain, sleep } from '../lib/proc.mjs';
import {
  ALL_ITEMS,
  CAMPAIGN_MODES,
  CAMPAIGN_TARGETS,
  MAX_ATTEMPTS,
  artifactMatchesRuntime,
  campaignTarget,
  planCampaign,
} from './lib/campaign-plan.mjs';
import {
  ALREADY_VALID,
  COMPLETE,
  FAILED,
  LEDGER_HEADER,
  formatLedgerRow,
} from './lib/campaign-ledger.mjs';

const SIMULATOR_SETTLE_MS = 5_000;

function appendLedger(ledgerPath, row) {
  appendFileSync(
    ledgerPath,
    `${formatLedgerRow({ timestamp: new Date().toISOString(), ...row })}\n`
  );
}

function absolute(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

function artifactValid(path, runtime) {
  const full = absolute(path);
  if (!existsSync(full)) return false;
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    return false;
  }
  return artifactMatchesRuntime(artifact, runtime);
}

function rebootSimulator(udid) {
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'boot', udid], { stdio: 'ignore' });
  // "Booted" in the device list precedes SpringBoard being ready; bootstatus waits
  // for the boot to actually complete, which is what a capture needs.
  spawnSync('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: 'ignore' });
}

function list(value) {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export async function runCampaign(argv = process.argv.slice(2)) {
  const flag = (name, fallback) => {
    const prefix = `--${name}=`;
    return argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length) ?? fallback;
  };
  const has = (name) => argv.includes(`--${name}`);

  const targetId = flag('target');
  if (!targetId) {
    fail(`--target is required — one of ${Object.keys(CAMPAIGN_TARGETS).join(', ')}`);
  }

  // artifactPath scopes by target, so the root stays target-agnostic and several
  // targets can share one campaign directory without colliding.
  const outputRoot = flag('output-root', 'perf-profiles/campaign');
  const maxAttempts = Number(flag('max-attempts', String(MAX_ATTEMPTS)));
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    fail('--max-attempts must be a positive integer');
  }

  const plan = planCampaign(targetId, {
    modes: list(flag('modes')),
    items: list(flag('items')),
    outputRoot,
    label: flag('label'),
    host: {
      appiumUrl: flag('appium-url'),
      capabilitiesFile: flag('capabilities-file'),
      deviceId: flag('device-id'),
      cdpPort: flag('cdp-port'),
      url: flag('url'),
    },
  });

  if (has('dry-run')) {
    console.log(`${targetId}: ${plan.length} cells`);
    for (const cell of plan) {
      console.log(`  ${cell.id.padEnd(26)} ${cell.command}  -> ${cell.artifact}`);
    }
    return { plan, ran: [] };
  }

  const ledgerPath = absolute(flag('ledger', `${outputRoot}/${targetId}/ledger.tsv`));
  mkdirSync(dirname(ledgerPath), { recursive: true });
  if (!existsSync(ledgerPath)) writeFileSync(ledgerPath, `${LEDGER_HEADER.join('\t')}\n`);

  const rebootUdid = flag('reboot-simulator');
  const results = [];

  const { runtime } = campaignTarget(targetId);

  for (const cell of plan) {
    if (artifactValid(cell.artifact, runtime)) {
      appendLedger(ledgerPath, {
        cell: cell.id,
        status: ALREADY_VALID,
        attempt: 0,
        artifact: cell.artifact,
      });
      console.log(`SKIP  ${cell.id}`);
      results.push({ cell: cell.id, status: ALREADY_VALID });
      continue;
    }

    let landed = false;
    for (let attempt = 1; attempt <= maxAttempts && !landed; attempt++) {
      if (rebootUdid) {
        rebootSimulator(rebootUdid);
        await sleep(SIMULATOR_SETTLE_MS);
      }
      console.log(`RUN   ${cell.id} (attempt ${attempt}/${maxAttempts})`);
      mkdirSync(dirname(absolute(cell.artifact)), { recursive: true });
      const child = spawnSync(
        'npm',
        ['run', cell.command, '--ignore-scripts', '--', ...cell.args],
        { cwd: ROOT, stdio: 'inherit' }
      );
      landed = artifactValid(cell.artifact, runtime);
      appendLedger(ledgerPath, {
        cell: cell.id,
        status: `${landed ? COMPLETE : FAILED}-exit-${child.status}`,
        attempt,
        artifact: cell.artifact,
      });
      console.log(`${landed ? 'OK   ' : 'RETRY'} ${cell.id}`);
    }

    if (!landed) console.log(`P1    ${cell.id} — ${maxAttempts} attempts exhausted, continuing`);
    results.push({ cell: cell.id, status: landed ? COMPLETE : 'p1' });
  }

  const done = results.filter((r) => r.status !== 'p1').length;
  console.log(`\n${targetId}: ${done}/${plan.length} cells complete`);
  for (const r of results.filter((r) => r.status === 'p1')) console.log(`  P1 ${r.cell}`);
  console.log(`Ledger: ${ledgerPath}`);
  return { plan, ran: results };
}

if (isMain(import.meta.url)) runMain(runCampaign);

export { ALL_ITEMS, CAMPAIGN_MODES };
