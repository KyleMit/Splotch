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
  anomalousEraserRefills,
  artifactPassedFidelity,
  campaignTarget,
  effectiveFidelity,
  eraserRefillShortfall,
  cellServerSource,
  recordedGesturePlan,
  recordedGestureRepeats,
  resolvedProbeHostProblem,
  planCampaign,
  splitTransportIdentityProblem,
} from './lib/campaign-plan.mjs';
import { instrumentChangeProblem, instrumentFingerprint } from './lib/instrument-fingerprint.mjs';
import {
  ALREADY_VALID,
  COMPLETE,
  ERASER_FILL_FAILED,
  EXHAUSTED,
  FAILED,
  LEDGER_HEADER,
  OFF_REFRESH_REGIME,
  UNCALIBRATED_RUNTIME,
  UNSCOREABLE,
  WRONG_GESTURE_PLAN,
  WRONG_GESTURE_REPEATS,
  formatLedgerRow,
  nextAction,
  parseLedger,
} from './lib/campaign-ledger.mjs';
import { describeRefreshRegime, refreshRegimeVerdict } from './lib/refresh-regime.mjs';
import {
  onlyUncalibratedChecksFailed,
  runtimeHasUncalibratedChecks,
} from './lib/input-fidelity.mjs';

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
// The one place a plan cell's flags become inspectArtifact options. Status must
// accept exactly what the runner accepts; when status rebuilt these options itself
// it dropped the reportsRefreshRegime gate and reported four complete action
// sweeps — which carry no frame intervals by design — as off-refresh-regime.
export function cellInspection(cell, { runtime, refreshRegime, captureRuntime = null }) {
  return inspectArtifact(cell.artifact, runtime, {
    verdictRequired: cell.reportsFidelity,
    captureRuntime,
    expectedRefreshRegime: cell.reportsRefreshRegime ? refreshRegime : null,
    expectedGestureRepeats: cell.gestureRepeats ?? null,
    expectedGesturePlan: cell.gesturePlan ?? null,
  });
}

export function inspectArtifact(
  path,
  runtime,
  {
    verdictRequired = false,
    captureRuntime = null,
    expectedRefreshRegime = null,
    expectedGestureRepeats = null,
    expectedGesturePlan = null,
  } = {}
) {
  const full = absolute(path);
  if (!existsSync(full)) return { ok: false, status: FAILED };
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(full, 'utf8'));
  } catch {
    return { ok: false, status: FAILED };
  }
  if (!artifactMatchesRuntime(artifact, runtime)) return { ok: false, status: FAILED };
  // Judged by the RE-DERIVED verdict when the artifact's input stats and the
  // target's runtime allow it (effectiveFidelity), so a banked capture whose
  // stored verdict predates a table correction is accepted rather than
  // recaptured — the matrix already scores it; acceptance must not disagree.
  if (!artifactPassedFidelity(artifact, { verdictRequired, captureRuntime })) {
    return {
      ok: false,
      status: onlyUncalibratedChecksFailed(effectiveFidelity(artifact, captureRuntime))
        ? UNCALIBRATED_RUNTIME
        : UNSCOREABLE,
    };
  }
  // Checked after fidelity so the more fundamental rejection is the one reported:
  // a capture that was barely driven has a meaningless beat as well as a meaningless
  // number, and naming the regime would send the next session after the wrong thing.
  const regime = refreshRegimeVerdict(
    artifact?.summaries?.intervalMs,
    expectedRefreshRegime,
    artifact?.summaries?.regimeMixture
  );
  if (!regime.matched) return { ok: false, status: OFF_REFRESH_REGIME, regime };
  // Checked LAST, after fidelity and regime, for the reason those two are
  // ordered: the more fundamental rejection must be the one reported. A capture
  // whose gesture never reached the canvas has a meaningless repeat count as
  // well as a meaningless number, and naming the count would send the next
  // session recapturing a cell whose real problem is elsewhere — worst of all
  // for UNCALIBRATED_RUNTIME, the one status that must never be retried.
  // A present-but-malformed count throws in the shared reader; here that is an
  // invalid artifact — the same rejection an unparseable file gets — not a
  // historical absence, and not a crash mid-queue.
  let recordedRepeats;
  try {
    recordedRepeats = recordedGestureRepeats(artifact);
  } catch {
    return { ok: false, status: FAILED };
  }
  if (
    expectedGestureRepeats !== null &&
    recordedRepeats !== null &&
    recordedRepeats !== expectedGestureRepeats
  ) {
    return { ok: false, status: WRONG_GESTURE_REPEATS, recordedRepeats };
  }
  // After the repeat count, malformed reads included: a cell at the wrong
  // count is the wrong quantity no matter how its passes were fed ink, so the
  // count is the rejection that names the recapture's first problem — and
  // reading the plan any earlier let a malformed plan preempt that message.
  // The absent-plan tolerance is the standing decision `recordedGesturePlan`
  // documents, not a symmetry with the count.
  let recordedPlan;
  try {
    recordedPlan = recordedGesturePlan(artifact);
  } catch {
    return { ok: false, status: FAILED };
  }
  if (
    expectedGesturePlan !== null &&
    recordedPlan !== null &&
    recordedPlan !== expectedGesturePlan
  ) {
    return { ok: false, status: WRONG_GESTURE_PLAN, recordedPlan };
  }
  // Last of all: the plan states the INTENT of the eraser's between-pass
  // refills, and the refill record states the OUTCOME. A capture whose refills
  // recorded an anomaly measured erasing blank paper on its later passes —
  // materially the quantity the plan contract exists to refuse — so it is
  // refused with the record as the reason rather than banked as a plausible
  // number (issue 1355). Absent refills are the standing historical tolerance;
  // a malformed record is an invalid artifact like a malformed plan.
  let refills;
  try {
    refills = anomalousEraserRefills(artifact);
  } catch {
    return { ok: false, status: FAILED };
  }
  if (refills !== null && refills.length > 0) {
    return { ok: false, status: ERASER_FILL_FAILED, anomalousRefills: refills };
  }
  // A refill record that is clean but SHORT proves the refills never fired:
  // zero recorded anomalies while the later passes erased blank paper.
  const shortfall = eraserRefillShortfall(artifact, expectedGestureRepeats);
  if (shortfall !== null) {
    return { ok: false, status: ERASER_FILL_FAILED, refillShortfall: shortfall };
  }
  return { ok: true, status: COMPLETE, regime };
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

  // Issue 1301, resized by review: a 'guarded-default' child reuses its default
  // preview port only behind the build-freshness guard and otherwise spawns its
  // own fresh preview, so the exposure is burned retries when another worktree
  // holds the port (twelve, on 2026-08-24) — never wrong numbers. That earns a
  // WARNING naming the cells and the flag, not a refusal; refusing also broke
  // dry runs, which are planning output and must always print the plan. Only a
  // cell whose server source is unknown is refused — nothing is proven about
  // its fallback.
  const unknownServerCells = plan.filter((cell) => cellServerSource(cell) === null);
  if (unknownServerCells.length) {
    fail(
      `these cells' commands have no known server source, so nothing is proven about their ` +
        `fallback:\n${unknownServerCells.map((cell) => `  ${cell.id} (${cell.command})`).join('\n')}\n` +
        `Teach cellServerSource the command, or pass --url= explicitly.`
    );
  }
  const guardedDefaultCells = plan.filter((cell) => cellServerSource(cell) === 'guarded-default');
  if (guardedDefaultCells.length) {
    console.log(
      `WARN  ${guardedDefaultCells.length} cell(s) will reuse-or-serve their child's default ` +
        `preview port (${[...new Set(guardedDefaultCells.map((cell) => cell.command))].join(', ')}). ` +
        'A foreign build on that port is refused per attempt rather than measured — pass ' +
        '--url=<preview URL> to pin the server and skip those retries.'
    );
  }

  // Asserted rather than started: the probe host outlives any one target's queue,
  // and the repo's rule is to reuse a running listener rather than take over its
  // lifecycle. A dry run is planning only and reaches no device.
  if (!has('dry-run') && plan.some((cell) => cell.command === SPLIT_SCREEN_COMMAND)) {
    const identityProblem = splitTransportIdentityProblem(campaignTarget(targetId), {
      deviceId: flag('device-id'),
      wdaUrl: flag('wda-url'),
    });
    if (identityProblem) fail(identityProblem);
    const problem = await resolvedProbeHostProblem(flag('probe-host'));
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
      // The server source is printed because the ABSENCE of a flag is invisible
      // in an argument listing — the dry run is where an operator looks for
      // what a campaign will do, and a guarded default deserves to be seen.
      console.log(
        `  ${cell.id.padEnd(26)} ${cell.command}  [server: ${cellServerSource(cell)}]  -> ${cell.artifact}`
      );
    }
    return { plan, ran: [] };
  }

  const ledgerPath = absolute(flag('ledger', `${outputRoot}/${targetId}/ledger.tsv`));
  mkdirSync(dirname(ledgerPath), { recursive: true });
  if (!existsSync(ledgerPath)) writeFileSync(ledgerPath, `${LEDGER_HEADER.join('\t')}\n`);

  // Which instrument banked this campaign's cells (issue 1293). Recorded on the
  // first run; a resume whose instrument moved is refused with the changed
  // files named, unless the operator accepts the mixture on record. The new
  // fingerprint is written on acceptance so the decision is made once, not on
  // every subsequent resume.
  const fingerprintPath = join(dirname(ledgerPath), 'instrument.json');
  const currentInstrument = instrumentFingerprint([...new Set(plan.map((cell) => cell.command))]);
  const recordedInstrument = existsSync(fingerprintPath)
    ? JSON.parse(readFileSync(fingerprintPath, 'utf8'))
    : null;
  const instrumentProblem = instrumentChangeProblem(recordedInstrument, currentInstrument);
  if (instrumentProblem && !has('accept-instrument-change')) fail(instrumentProblem);
  if (instrumentProblem) {
    console.log(
      'WARN  resuming across an instrument change — cells banked before this run were ' +
        'captured by a different instrument (accepted with --accept-instrument-change)'
    );
  }
  writeFileSync(fingerprintPath, `${JSON.stringify(currentInstrument, null, 2)}\n`);
  // The attempts a cell has already spent live in the ledger, not in this process.
  // Reading them is what makes --max-attempts a budget for the campaign rather than
  // for one invocation, so an interrupted run resumes instead of restarting at 1.
  const spentRows = parseLedger(readFileSync(ledgerPath, 'utf8'));

  const rebootUdid = flag('reboot-simulator');
  const results = [];

  // `runtime` is the target's SHELL (web or native) and decides artifact matching.
  // `captureRuntime` names whose input-fidelity expectations apply, and is the one
  // that can become calibrated — they are different questions and were briefly
  // conflated here.
  const { runtime, refreshRegime, captureRuntime: targetCaptureRuntime } = campaignTarget(targetId);

  for (const cell of plan) {
    const decision = nextAction(spentRows, cell.id, {
      artifactValid: cellInspection(cell, {
        runtime,
        refreshRegime,
        captureRuntime: targetCaptureRuntime,
      }).ok,
      maxAttempts,
      runtimeStillUncalibrated: runtimeHasUncalibratedChecks(targetCaptureRuntime),
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
    let uncalibratedRuntime = false;
    for (
      let attempt = decision.attempt;
      attempt <= maxAttempts && !landed && !uncalibratedRuntime;
      attempt++
    ) {
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
      const inspected = cellInspection(cell, {
        runtime,
        refreshRegime,
        captureRuntime: targetCaptureRuntime,
      });
      landed = inspected.ok;
      appendLedger(ledgerPath, {
        cell: cell.id,
        status: `${inspected.status}-exit-${child.status}`,
        attempt,
        artifact: cell.artifact,
      });
      if (inspected.status === UNCALIBRATED_RUNTIME) {
        uncalibratedRuntime = true;
        console.log(
          `P1    ${cell.id} — this runtime has no measured expectation for ` +
            'its remaining fidelity checks, so no retry can change the verdict'
        );
      } else if (inspected.status === UNSCOREABLE) {
        console.log(`RETRY ${cell.id} — the capture failed input fidelity and cannot be scored`);
      } else if (inspected.status === OFF_REFRESH_REGIME) {
        console.log(
          `RETRY ${cell.id} — measured at ${describeRefreshRegime(inspected.regime)}, ` +
            'which this target is not scored against'
        );
      } else if (inspected.status === WRONG_GESTURE_REPEATS) {
        console.log(
          `RETRY ${cell.id} — captured at ${inspected.recordedRepeats} gesture repeats, ` +
            `not the campaign contract of ${cell.gestureRepeats}`
        );
      } else if (inspected.status === WRONG_GESTURE_PLAN) {
        console.log(
          `RETRY ${cell.id} — captured under the ${inspected.recordedPlan} gesture plan, ` +
            `not the campaign contract of ${cell.gesturePlan}`
        );
      } else if (inspected.status === ERASER_FILL_FAILED) {
        const reason = inspected.refillShortfall
          ? `recorded ${inspected.refillShortfall.recorded} refills where the contract expects ` +
            `${inspected.refillShortfall.expected} — the refills never fired`
          : `first anomalous refill: ${JSON.stringify(inspected.anomalousRefills?.[0])}`;
        console.log(
          `RETRY ${cell.id} — the eraser's between-pass refills did not prove ink (${reason})`
        );
      } else {
        console.log(`${landed ? 'OK   ' : 'RETRY'} ${cell.id}`);
      }
    }

    if (!landed && !uncalibratedRuntime) {
      console.log(`P1    ${cell.id} — ${maxAttempts} attempts exhausted, continuing`);
    }
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
