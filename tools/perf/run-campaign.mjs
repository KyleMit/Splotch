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
  SPLIT_SCREEN_COMMAND,
  artifactMatchesRuntime,
  artifactPassedFidelity,
  campaignTarget,
  probeHostProblem,
  planCampaign,
} from './lib/campaign-plan.mjs';
import {
  ALREADY_VALID,
  COMPLETE,
  EXHAUSTED,
  FAILED,
  LEDGER_HEADER,
  UNSCOREABLE,
  formatLedgerRow,
  nextAction,
  parseLedger,
} from './lib/campaign-ledger.mjs';

const SIMULATOR_SETTLE_MS = 5_000;
const PROBE_HOST_TIMEOUT_MS = 5_000;

function appendLedger(ledgerPath, row) {
  appendFileSync(
    ledgerPath,
    `${formatLedgerRow({ timestamp: new Date().toISOString(), ...row })}\n`
  );
}

function absolute(path) {
  return isAbsolute(path) ? path : join(ROOT, path);
}

// Acceptance is deliberately not the child's exit code, so a valid red gate is kept
// rather than retried until it turns green. A failed fidelity verdict is not a red
// gate — it is a capture that cannot be scored at all — and it is reported
// separately so the ledger says which of the two happened.
export function inspectArtifact(path, runtime, { verdictRequired = false } = {}) {
  const full = absolute(path);
  if (!existsSync(full)) return { ok: false, status: FAILED };
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    return { ok: false, status: FAILED };
  }
  if (!artifactMatchesRuntime(artifact, runtime)) return { ok: false, status: FAILED };
  if (!artifactPassedFidelity(artifact, { verdictRequired })) {
    return { ok: false, status: UNSCOREABLE };
  }
  return { ok: true, status: COMPLETE };
}

function rebootSimulator(udid) {
  spawnSync('xcrun', ['simctl', 'shutdown', udid], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'boot', udid], { stdio: 'ignore' });
  // "Booted" in the device list precedes SpringBoard being ready; bootstatus waits
  // for the boot to actually complete, which is what a capture needs.
  spawnSync('xcrun', ['simctl', 'bootstatus', udid, '-b'], { stdio: 'ignore' });
}

// A 200 is not the probe protocol. A plain-text server on the requested port
// answered `not a probe` with status 200 and the campaign ran on, which recreates
// exactly the page-timeout failure this guard exists to eliminate — a wrong server
// or a permissive fallback on the right port. The plan's own shape is the cheapest
// marker available, and it has to be parsed rather than merely fetched.
export function isProbePlan(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  return (
    typeof payload.label === 'string' &&
    typeof payload.finish === 'boolean' &&
    Number.isFinite(payload.contactMs)
  );
}

// The device is what has to reach this URL, and only the device can prove that. The
// host can prove the server is up and speaking the probe protocol, which is the
// half of the failure that is cheap to catch before a queue of cells times out.
async function probeHostResponds(probeHost) {
  try {
    const response = await fetch(new URL('/__probe/plan', probeHost), {
      signal: AbortSignal.timeout(PROBE_HOST_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    return isProbePlan(await response.json());
  } catch {
    return false;
  }
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
      probeHost: flag('probe-host'),
      wdaUrl: flag('wda-url'),
    },
  });

  // Asserted rather than started: the probe host outlives any one target's queue,
  // and the repo's rule is to reuse a running listener rather than take over its
  // lifecycle. A dry run is planning only and reaches no device.
  if (!has('dry-run') && plan.some((cell) => cell.command === SPLIT_SCREEN_COMMAND)) {
    const problem = probeHostProblem(flag('probe-host'));
    if (problem) fail(problem);
    const reachable = await probeHostResponds(flag('probe-host'));
    if (!reachable) {
      fail(
        `the probe host at ${flag('probe-host')} did not answer the probe protocol — ` +
          'a server responding on that port is not enough. Start it with ' +
          "`npm run perf:device:serve` and pass this host's LAN address"
      );
    }
  }

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
  // The attempts a cell has already spent live in the ledger, not in this process.
  // Reading them is what makes --max-attempts a budget for the campaign rather than
  // for one invocation, so an interrupted run resumes instead of restarting at 1.
  const spentRows = parseLedger(readFileSync(ledgerPath, 'utf8'));

  const rebootUdid = flag('reboot-simulator');
  const results = [];

  const { runtime } = campaignTarget(targetId);

  for (const cell of plan) {
    const decision = nextAction(spentRows, cell.id, {
      artifactValid: inspectArtifact(cell.artifact, runtime, {
        verdictRequired: cell.reportsFidelity,
      }).ok,
      maxAttempts,
    });

    if (decision.action === 'skip') {
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

    if (decision.action === 'p1') {
      appendLedger(ledgerPath, {
        cell: cell.id,
        status: EXHAUSTED,
        attempt: decision.spent,
        artifact: cell.artifact,
      });
      console.log(`P1    ${cell.id} — ${decision.reason} in earlier runs, not retried`);
      results.push({ cell: cell.id, status: 'p1' });
      continue;
    }

    let landed = false;
    for (let attempt = decision.attempt; attempt <= maxAttempts && !landed; attempt++) {
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
      const inspected = inspectArtifact(cell.artifact, runtime, {
        verdictRequired: cell.reportsFidelity,
      });
      landed = inspected.ok;
      appendLedger(ledgerPath, {
        cell: cell.id,
        status: `${inspected.status}-exit-${child.status}`,
        attempt,
        artifact: cell.artifact,
      });
      if (inspected.status === UNSCOREABLE) {
        console.log(`RETRY ${cell.id} — the capture failed input fidelity and cannot be scored`);
      } else {
        console.log(`${landed ? 'OK   ' : 'RETRY'} ${cell.id}`);
      }
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
