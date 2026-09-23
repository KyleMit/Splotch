// The per-release commit-latency contract check on a USB-connected iPad
// (ADR-0173): one finger-paced crayon session per deposition arm on
// /dev/engine, each scored as the engine.commit P95 against COMMIT_GATE_MS.
//
//   npm run perf:ios:webkit:commit
//   npm run perf:ios:webkit:commit --ignore-scripts        (skip the rebuild)
//
// Exits non-zero on a breach, and on any arm it could not score — above all a
// bundle built without PERF_MARKS, whose null commit P95 must never read as a
// pass. Same device prerequisites as perf:ios:webkit:gates: see
// docs/PROFILING-IPAD.md.
//
// The payload is the 2026-09-18 baseline's, byte for byte, so a release
// reading stays comparable with that baseline. The host only injects it and
// polls from a fresh attachment, so no automation round trip lands inside a
// measured interval.

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, isMain, runMain, sleep } from '../../lib/proc.mjs';
import { parsePerfArgs } from '../lib/cli-args.mjs';
import { profilePath } from '../lib/profile-paths.mjs';
import { warnIfNoPerfMarks } from '../lib/profile-warnings.mjs';
import { stampedBuildCommit } from '../lib/build-provenance.mjs';
import { rethrowIfBroken } from '../lib/error-classification.mjs';
import { attachToPage, listPages } from '../lib/webkit-inspector.mjs';
import {
  connectDevice,
  createDeviceConsole,
  ensurePreviewServer,
  openDevicePage,
  requireInspectorProxy,
  resolveDeviceUrl,
} from '../lib/profile-device-session.mjs';
import {
  COMMIT_CONTRACT_ARMS,
  formatCommitContract,
  judgeCommitContract,
  reduceCommitSession,
} from '../lib/commit-contract.mjs';

const HARNESS_PATH = '/dev/engine';
export const SESSION_PAYLOAD_FILE = join(ROOT, 'tools', 'perf', 'probes', 'paced-crayon-session.js');

// Matches the baseline runner's cadence, so the host touches the page as rarely
// as it did when the baseline was taken.
const RESULT_POLL_INTERVAL_MS = 5_000;
// A paced session is about a minute and a half of drawing, settling and
// undoing; the cap is loose so a slow device is not mistaken for a hung one.
const SESSION_TIMEOUT_MS = 15 * 60_000;
const POLL_COMMAND_TIMEOUT_MS = 300_000;

// The configuration the payload reads. Only the arm varies; everything else is
// the payload's own default, which is what the baseline ran. The nonce is the
// host's own mark on the tab it injected, outside the payload's config.
function sessionConfigScript(arm, nonce) {
  return [
    `window.__cfg = ${JSON.stringify({ arm, mode: 'paced' })};`,
    `window.__commitContractNonce = ${JSON.stringify(nonce)};`,
  ].join('\n');
}

// Another tab can sit on the same /dev/engine URL holding an earlier run's
// finished window.__session, so a result counts only from the tab carrying
// this run's nonce.
export function sessionPollExpression(nonce) {
  return (
    `window.__commitContractNonce === ${JSON.stringify(nonce)} ` +
    '? { session: window.__session ?? null, progress: window.__sessionProgress ?? null } ' +
    ': null'
  );
}

async function readSessionFrom(page, nonce, deviceConsole) {
  let attached;
  try {
    attached = await attachToPage(page.webSocketDebuggerUrl, {
      onConsole: deviceConsole.onConsole,
      commandTimeoutMs: POLL_COMMAND_TIMEOUT_MS,
    });
    return await attached.readJson(sessionPollExpression(nonce));
  } catch (error) {
    rethrowIfBroken(error);
    console.log(`  poll: ${error.message}`);
    return null;
  } finally {
    attached?.close();
  }
}

async function pollSession(device, harnessUrl, nonce, deviceConsole) {
  const deadline = Date.now() + SESSION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(RESULT_POLL_INTERVAL_MS);
    const candidates = (await listPages(device)).filter((page) => page.url === harnessUrl);
    for (const page of candidates) {
      const state = await readSessionFrom(page, nonce, deviceConsole);
      if (!state) continue;
      if (state.session) return state.session;
      if (state.progress) console.log(`  … ${state.progress}`);
    }
  }
  return null;
}

async function runArm(device, harnessUrl, arm) {
  const deviceConsole = createDeviceConsole();
  const nonce = randomUUID();
  console.log(`\n${arm}: loading a fresh ${HARNESS_PATH}`);
  const page = await openDevicePage(device, harnessUrl, {
    onConsole: deviceConsole.onConsole,
    ready: 'window.__engine && window.__engineReady && window.__engine.getUndoDebug',
    readyHint:
      'never exposed window.__engine. Serve a build made with ' +
      'PUBLIC_ENABLE_DEV_HARNESS=true (npm run perf:serve does).',
  });
  try {
    await page.evaluate(sessionConfigScript(arm, nonce));
    // WebKit's Runtime.evaluate has no awaitPromise: this returns as the
    // session starts, and window.__session is what it is tracked by.
    await page.evaluate(readFileSync(SESSION_PAYLOAD_FILE, 'utf8'));
  } finally {
    page.close();
  }
  const session = await pollSession(device, harnessUrl, nonce, deviceConsole);
  return { session, console: deviceConsole.forReport() };
}

export async function runCommitContract(argv = process.argv.slice(2)) {
  const { flag, has, port } = parsePerfArgs(
    { entry: true, extra: ['url', 'device-id', 'no-serve'] },
    argv
  );
  requireInspectorProxy();
  warnIfNoPerfMarks('npm run perf:ios:webkit:commit');

  const harnessUrl = resolveDeviceUrl(flag('url'), port, HARNESS_PATH);
  const server = await ensurePreviewServer(harnessUrl, port, !has('no-serve'));
  const { device, stopProxy } = await connectDevice(flag('device-id'));

  try {
    const captures = [];
    for (const arm of COMMIT_CONTRACT_ARMS) {
      captures.push({ arm, ...(await runArm(device, harnessUrl, arm)) });
    }
    const judgement = judgeCommitContract(
      captures.map(({ arm, session }) => reduceCommitSession(arm, session))
    );
    const buildCommit = stampedBuildCommit();

    const safari = judgement.arms.find((arm) => arm.safari)?.safari ?? 'unknown';
    console.log(
      `\niPadOS ${device.deviceOSVersion} · Safari ${safari} · build ${buildCommit ?? 'unstamped'}`
    );
    console.log(formatCommitContract(judgement));

    // Raw sessions carry the LAN harness URL; perf-profiles/ stays out of the
    // repo, and only the derived figures belong in release notes.
    const outDir = profilePath('ipad-commit-contract');
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, 'commit-contract.json');
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          device: { os: device.deviceOSVersion },
          buildCommit,
          harnessUrl,
          judgement,
          captures,
        },
        null,
        2
      )}\n`
    );
    console.log(`\nWrote ${file}`);
    if (judgement.verdict !== 'pass') process.exitCode = 1;
    return judgement;
  } finally {
    stopProxy();
    server?.stop();
  }
}

if (isMain(import.meta.url)) runMain(runCommitContract);
