// Drive one deployment-target capture campaign to completion, resumably.
//
//   npm run perf:campaign -- --target=ipad-simulator-native --capabilities-file=<file>
//   npm run perf:campaign -- --target=android-emulator-web --device-id=emulator-5554 \
//     --url=http://127.0.0.1:4173/ --probe-host=http://<lan-ip>:4175
//   (emulator drawing rides the split transport, so --probe-host is required —
//   --url covers only its CDP action cells)
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
  recordedPaintedOutput,
  resolvedProbeHostProblem,
  planCampaign,
  splitTransportIdentityProblem,
} from './lib/campaign-plan.mjs';
import { rethrowIfBroken } from './lib/error-classification.mjs';
import { instrumentChangeProblem, instrumentFingerprint } from './lib/instrument-fingerprint.mjs';
import {
  probeHostJson,
  probeHostProtocolProblem,
} from './split-capture/lib/probe-host-protocol.mjs';
import {
  ALREADY_VALID,
  BLANK_OUTPUT,
  COMPLETE,
  ERASER_FILL_FAILED,
  EXHAUSTED,
  FAILED,
  INSTRUMENT_ACCEPTED,
  LEDGER_HEADER,
  OFF_REFRESH_REGIME,
  UNCALIBRATED_RUNTIME,
  UNSCOREABLE,
  WRONG_GESTURE_PLAN,
  WRONG_GESTURE_REPEATS,
  cellsBankedUnderDifferentInstrument,
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
  // The required-verdict check comes BEFORE re-derivation (the PR 1368 review's
  // boundary finding): a fidelity-reporting runner always writes the block, so
  // an artifact without one is stale or foreign — healthy-looking input stats
  // cannot substitute for it. The status stays the historic UNSCOREABLE two
  // acceptance tests deliberately pin; attempt accounting is identical, and
  // renaming a ledger status is not this fix's business.
  if (verdictRequired && !artifact?.fidelity) return { ok: false, status: UNSCOREABLE };
  // Judged by the RE-DERIVED verdict, by exactly the matrix's rule
  // (effectiveFidelity): a banked capture whose stored verdict predates a table
  // correction is accepted rather than recaptured, and a flattering stored
  // verdict with no measurements behind it re-derives to a failure — the
  // matrix already scores both that way; acceptance must not disagree.
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
  } catch (error) {
    rethrowIfBroken(error);
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
  } catch (error) {
    rethrowIfBroken(error);
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
  } catch (error) {
    rethrowIfBroken(error);
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
  // After everything above, for the standing most-fundamental-first reason: a
  // capture already refused for its input, beat, contract, or eraser ink has a
  // blank-or-not question that is moot, and naming the blankness would send
  // the recapture after the wrong thing. A recorded no-change verdict means
  // the temporal gates scored a renderer that did no drawing work; an absent
  // record is the same historical tolerance every recorded field gets, and a
  // malformed or error-carrying one throws in the shared reader — an invalid
  // artifact, not consent.
  let paintedOutput;
  try {
    paintedOutput = recordedPaintedOutput(artifact);
  } catch (error) {
    rethrowIfBroken(error);
    return { ok: false, status: FAILED };
  }
  if (paintedOutput !== null && paintedOutput.changed !== true) {
    return { ok: false, status: BLANK_OUTPUT, paintedOutput };
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

// The device is what has to reach this URL, and only the device can prove that. The
// host can prove the server is up and speaking the probe protocol, which is the
// half of the failure that is cheap to catch before a queue of cells times out.
export async function probeHostAvailabilityProblem(probeHost, fetchImpl = fetch) {
  try {
    const state = await probeHostJson(probeHost, '/__probe/state', (url) =>
      fetchImpl(url, { signal: AbortSignal.timeout(PROBE_HOST_TIMEOUT_MS) })
    );
    return probeHostProtocolProblem(state?.protocol);
  } catch (error) {
    rethrowIfBroken(error);
    return error instanceof Error ? error.message : String(error);
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
    // A split drawing cell lands here exactly when --probe-host was omitted, and
    // recommending --url would send the operator to a flag the split child
    // ignores (the PR 1368 review hit this on the header's own emulator
    // example).
    const splitCells = unknownServerCells.filter((cell) => cell.command === SPLIT_SCREEN_COMMAND);
    const advice = splitCells.length
      ? `Split-transport drawing cells require --probe-host=<this host's LAN address, as the ` +
        `device sees it>; --url cannot satisfy them.`
      : `Teach cellServerSource the command, or pass --url= explicitly.`;
    fail(
      `these cells' commands have no known server source, so nothing is proven about their ` +
        `fallback:\n${unknownServerCells.map((cell) => `  ${cell.id} (${cell.command})`).join('\n')}\n` +
        advice
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
    const availabilityProblem = await probeHostAvailabilityProblem(flag('probe-host'));
    if (availabilityProblem) {
      fail(
        `the probe host at ${flag('probe-host')} is incompatible: ${availabilityProblem}. ` +
          "Start or restart it with `npm run perf:device:serve` and pass this host's LAN address"
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

  // The attempts a cell has already spent live in the ledger, not in this process.
  // Reading them is what makes --max-attempts a budget for the campaign rather than
  // for one invocation, so an interrupted run resumes instead of restarting at 1.
  const spentRows = parseLedger(readFileSync(ledgerPath, 'utf8'));

  // Which instrument banked this campaign's cells (issue 1293). instrument.json
  // records the CURRENT instrument; each attempt row records its own, because
  // the file is rewritten on every invocation and after one accepted change it
  // said nothing about the mixture it accepted (session 01a03f61). A resume
  // whose instrument moved — against the file or against any banked row — is
  // refused with the changed files and the mixed cells named, unless the
  // operator accepts on record; acceptance rows keep the decision made once,
  // not on every subsequent resume.
  const fingerprintPath = join(dirname(ledgerPath), 'instrument.json');
  const currentInstrument = instrumentFingerprint([...new Set(plan.map((cell) => cell.command))]);
  // Rows carry each cell's OWN command's fingerprint, not the whole plan's
  // union — a resume narrowed with --items shares every included cell's
  // instrument with the full run that banked it, and the union differs there
  // without a single file having moved.
  const fingerprintByCommand = new Map(
    [...new Set(plan.map((cell) => cell.command))].map((command) => [
      command,
      instrumentFingerprint([command]).fingerprint,
    ])
  );
  const cellInstrument = (cell) => fingerprintByCommand.get(cell.command);
  const recordedInstrument = existsSync(fingerprintPath)
    ? JSON.parse(readFileSync(fingerprintPath, 'utf8'))
    : null;
  const bankedElsewhere = cellsBankedUnderDifferentInstrument(
    spentRows,
    new Map(plan.map((cell) => [cell.id, cellInstrument(cell)]))
  );
  const instrumentProblem = instrumentChangeProblem(
    recordedInstrument,
    currentInstrument,
    bankedElsewhere
  );
  if (instrumentProblem && !has('accept-instrument-change')) fail(instrumentProblem);
  if (instrumentProblem) {
    console.log(
      'WARN  resuming across an instrument change — cells banked before this run were ' +
        'captured by a different instrument (accepted with --accept-instrument-change)'
    );
    for (const { cell, fingerprint } of bankedElsewhere) {
      appendLedger(ledgerPath, {
        cell,
        status: INSTRUMENT_ACCEPTED,
        attempt: 0,
        artifact: '-',
        instrument: fingerprint,
      });
    }
  }
  writeFileSync(fingerprintPath, `${JSON.stringify(currentInstrument, null, 2)}\n`);

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
        instrument: cellInstrument(cell),
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
