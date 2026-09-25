// The person-present session for epic 2210: every task that needs a human at
// the iPad, the phone, or a notched iPhone, walked in the order that keeps that
// person there the least time (the plan and verdicts: lib/person-session.mjs;
// the runbook: docs/scratchpad/perf/2026-09-23-epic-2210-person-session.md).
//
//   npm run perf:session:person                 start, or resume the latest session
//   npm run perf:session:person -- --plan       print the steps and time estimates
//   npm run perf:session:person -- --check=overlay   the phone overlay PASS/FAIL alone
//   npm run perf:session:person -- --redo=<step>     run a step again (keeps its PASS captures)
//   npm run perf:session:person -- --skip=<step>     record a step as skipped
//   npm run perf:session:person -- --teardown   stop every server this session started
//
// Before each capture it says what to do with a finger; after each it judges
// the artifact (fidelity, regime, product commit, contact time, pointerdowns)
// and says PASS or REDO before moving on. State lives in the session
// directory, so a failed step resumes where it stopped. It starts its own
// preview, probe host, Appium, and (only when none answers) WebDriverAgent on
// free ports, records their pids, and stops them when its unattended tail ends;
// it never stops a process it did not start.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT, argFlag, capture, fail, isMain, runMain, sleep, tryCapture } from '../lib/proc.mjs';
import { lanAddresses, waitForUrl } from '../lib/net.mjs';
import { prepareCapture } from './prepare-capture.mjs';
import { campaignStatus } from './campaign-status.mjs';
import { stampedBuildCommit } from './lib/build-provenance.mjs';
import { buildDirHoldsNativeExport } from './lib/build-variant.mjs';
import {
  entryModulePath,
  servedBuildBinding,
  servedBuildFingerprintProblem,
} from './lib/profile-preview.mjs';
import { BUILD_PROVENANCE_FILE } from './lib/build-provenance.mjs';
import { rethrowIfBroken } from './lib/error-classification.mjs';
import {
  iproxyForwardPorts,
  newestDeviceXctestrun,
  runnerHoldsDevice,
} from './lib/wda-recovery.mjs';
import { readOverlayVerdict } from './lib/android-overlay-verdict.mjs';
import { CAMPAIGN_MODES, artifactPath, campaignTarget } from './lib/campaign-plan.mjs';
import {
  AB_2229_ARMS,
  AB_2229_ROUNDS,
  FINGER_MIN_CONTACT_SECONDS,
  IPAD_SESSION_OS,
  IPAD_UPDATE_OS,
  PERSON_SESSION_STEPS,
  abSummary,
  captureVerdict,
  draftIssueComment,
  magicFirstLoadReading,
  OVERLAY_STEADY_READS,
  nextStep,
  overlaySteadilyClear,
  resumeBringUp,
  secureSweepProblem,
  sessionStep,
  sessionTotals,
  stepIpadOs,
  stepOrderProblem,
} from './lib/person-session.mjs';
import {
  CONSTRAINT_PROBE_LOG,
  CONSTRAINT_PROBE_VERDICTS,
  constraintProbeFollowUp,
  constraintProbeVerdict,
  recordConstraintProbe,
} from './ios/secure-origin.mjs';
import { openSafariWithDevicectl } from './split-capture/capture-hand-input.mjs';

const SESSION_ROOT = join(ROOT, 'perf-profiles', 'person-session');
const LATEST_POINTER = join(SESSION_ROOT, 'LATEST');
// Written by the rig-prep build that installed the iPad's bundled app; the
// installed bundle carries no commit of its own (docs/PROFILING-CAMPAIGNS.md).
const NATIVE_INSTALL_RECORD = join(SESSION_ROOT, 'native-install.json');
const AB_ROOT = join(homedir(), '.splotch-rig', 'ab-2229');
const CA_DIR = join(homedir(), '.splotch-rig', 'secure-origin-ca');
const SERVER_READY_TIMEOUT_MS = 90_000;
const WDA_READY_TIMEOUT_MS = 180_000;
const WDA_SESSION_TIMEOUT_MS = 60_000;
const DEFAULT_WDA_URL = 'http://127.0.0.1:8110';
// Where this runner looks for free ports, clear of the canonical 4173–4185
// rig ports and of Appium's 4723/4725 so it never lands on a foreign holder's.
const PORT_SEARCH_FROM = { server: 4190, appium: 4781, wda: 8120, front: 54790 };
const MAX_ATTEMPTS = 3;
const IPAD_UPDATE_POLL_MS = 15_000;
const IPAD_UPDATE_TIMEOUT_MS = 90 * 60_000;
const OVERLAY_POLL_MS = 5_000;
const OVERLAY_TIMEOUT_MS = 20 * 60_000;

// ---------------------------------------------------------------- utilities

async function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}

// The fetch spec's bad-ports list (4190 among them) is refused by undici here
// and by the device browser alike, with a bare "bad port". Asking fetch itself
// keeps the list out of this file: a closed allowed port refuses the
// connection instead.
async function fetchAllowsPort(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch (error) {
    rethrowIfBroken(error);
    return error?.cause?.message !== 'bad port';
  }
}

async function freePortFrom(start, taken = new Set()) {
  for (let port = start; port < start + 200; port += 1) {
    if (taken.has(port) || !(await fetchAllowsPort(port))) continue;
    if (await portIsFree(port)) return port;
  }
  throw new Error(`no free port in ${start}–${start + 199}`);
}

async function answers(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return response.ok ? response : null;
  } catch (error) {
    rethrowIfBroken(error);
    return null;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    rethrowIfBroken(error);
    return null;
  }
}

const say = (words) => tryCapture('say', [words]);

// ------------------------------------------------------------- session state

function createSession() {
  const id = new Date().toISOString().replaceAll(':', '-').slice(0, 19);
  const dir = join(SESSION_ROOT, id);
  mkdirSync(join(dir, 'drafts'), { recursive: true });
  mkdirSync(join(dir, 'logs'), { recursive: true });
  writeFileSync(LATEST_POINTER, `${id}\n`);
  return { dir, state: { id, createdAt: new Date().toISOString(), steps: {}, ctx: {}, owned: [] } };
}

function openSession(requested) {
  const id =
    requested ?? (existsSync(LATEST_POINTER) ? readFileSync(LATEST_POINTER, 'utf8').trim() : null);
  if (!id) return createSession();
  const dir = requested && existsSync(requested) ? requested : join(SESSION_ROOT, id);
  const state = readJson(join(dir, 'state.json'));
  if (!state) return createSession();
  return { dir, state };
}

function saveState(session) {
  writeFileSync(join(session.dir, 'state.json'), `${JSON.stringify(session.state, null, 2)}\n`);
}

function statuses(session) {
  return Object.fromEntries(
    Object.entries(session.state.steps).map(([id, step]) => [id, step.status])
  );
}

function markStep(session, id, status, patch = {}) {
  session.state.steps[id] = {
    ...(session.state.steps[id] ?? {}),
    ...patch,
    status,
    at: new Date().toISOString(),
  };
  saveState(session);
}

// -------------------------------------------------------- owned processes

function spawnOwned(session, name, command, args, { cwd = ROOT, env = {} } = {}) {
  const log = openSync(join(session.dir, 'logs', `${name}.log`), 'a');
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
    detached: true,
  });
  child.unref();
  session.state.owned.push({ name, pid: child.pid, command, args: args.join(' ') });
  saveState(session);
  return child.pid;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    rethrowIfBroken(error);
    return false;
  }
}

// Only the process groups this session started — recorded at spawn — are ever
// signalled. A borrowed WebDriverAgent or a foreign preview is never in the list.
function stopOwned(session, names = null) {
  const keep = [];
  for (const entry of session.state.owned) {
    if (names && !names.includes(entry.name)) {
      keep.push(entry);
      continue;
    }
    // A pid recorded yesterday can belong to someone else today, so the live
    // command line must still carry the arguments this session started it with.
    const live = tryCapture('ps', ['-o', 'command=', '-p', String(entry.pid)]);
    if (processAlive(entry.pid) && live.ok && live.stdout.includes(entry.args)) {
      try {
        process.kill(-entry.pid, 'SIGTERM');
      } catch (error) {
        rethrowIfBroken(error);
        try {
          process.kill(entry.pid, 'SIGTERM');
        } catch (error) {
          rethrowIfBroken(error);
          // Already gone.
        }
      }
      console.log(`  stopped ${entry.name} (pid ${entry.pid})`);
    }
  }
  session.state.owned = keep;
  saveState(session);
}

// ----------------------------------------------------------------- dialogue

function createPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question) => rl.question(question),
    async yes(question) {
      const answer = (await rl.question(`${question} [y/n] `)).trim().toLowerCase();
      return answer === 'y' || answer === 'yes';
    },
    close: () => rl.close(),
  };
}

function banner(step) {
  console.log(`\n${'='.repeat(78)}\n${step.title}  [${step.id}]`);
  if (step.issues.length) console.log(`Issues: ${step.issues.map((n) => `#${n}`).join(', ')}`);
  console.log(
    `Your time: ~${step.personMinutes} min${step.unattendedMinutes ? ` (then ~${step.unattendedMinutes} min on its own)` : ''}`
  );
  console.log('\nWhat you do:');
  for (const line of step.person) console.log(`  • ${line}`);
  console.log(`\nDone when: ${step.done}\n`);
}

function printVerdict(label, verdict) {
  const mark = verdict.status === 'PASS' ? '✓ PASS' : '✗ REDO';
  const m = verdict.metrics ?? {};
  console.log(
    `\n${mark}  ${label}\n    lost frame ${m.lostFrameTimeShareText ?? 'n/a'} (${m.gate ?? '?'}), beat ${m.beatMs ?? '?'} ms (${m.regime ?? '?'}), ` +
      `contact ${m.contactSeconds ?? '?'} s, ${m.movesPerSecond ?? '?'} moves/s, fidelity ${m.fidelity ?? '?'}` +
      (m.pointerdowns ? `, pointerdowns ${m.pointerdowns}` : '')
  );
  for (const reason of verdict.reasons) console.log(`    - ${reason}`);
  say(verdict.status === 'PASS' ? 'Pass' : 'Redo');
}

function runNode(script, args, { env = {}, cwd = ROOT } = {}) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  return result.status;
}

function writeDraft(session, issue, name, body) {
  const path = join(session.dir, 'drafts', `${issue}-${name}.md`);
  writeFileSync(path, `${body}\n`);
  session.state.drafts = { ...(session.state.drafts ?? {}), [`${issue}-${name}`]: path };
  saveState(session);
  console.log(`\nDrafted the #${issue} comment: ${relative(ROOT, path)}`);
  console.log(
    `  Review it, then post: gh issue comment ${issue} -R KyleMit/Splotch --body-file ${path}`
  );
}

// -------------------------------------------------------- device readings

function ipadOsVersion(udid) {
  const result = tryCapture('ideviceinfo', ['-u', udid, '-k', 'ProductVersion']);
  return result.ok ? result.stdout.trim() : null;
}

function requireIpadOs(ctx, expected) {
  const version = ipadOsVersion(ctx.udid);
  if (version !== expected) {
    fail(`the iPad reports iPadOS ${version ?? 'unknown'}, and this step needs ${expected}`);
  }
}

function connectedAndroidSerial() {
  const lines = capture('adb', ['devices']).split('\n').slice(1);
  const devices = lines.map((line) => line.split('\t')).filter(([, state]) => state === 'device');
  if (devices.length !== 1)
    fail(`expected one attached Android device, adb lists ${devices.length}`);
  return devices[0][0];
}

// --------------------------------------------------------------- rig bring-up

async function wdaStatus(url) {
  const response = await answers(`${url}/status`);
  if (!response) return null;
  return response.json().catch((error) => {
    rethrowIfBroken(error);
    return null;
  });
}

async function wdaReady(url) {
  return (await wdaStatus(url))?.value?.ready === true;
}

function newestXctestrun() {
  const derived = join(homedir(), 'Library', 'Developer', 'Xcode', 'DerivedData');
  const entries = [];
  for (const dir of existsSync(derived) ? readdirSync(derived) : []) {
    if (!dir.startsWith('WebDriverAgent-')) continue;
    const products = join(derived, dir, 'Build', 'Products');
    for (const file of existsSync(products) ? readdirSync(products) : []) {
      const path = join(products, file);
      entries.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  return newestDeviceXctestrun(entries);
}

// `/status` "ready" is not proof. On 2026-09-23 an expired XCTest grant left
// the runner answering ready while every new session failed "Not authorized
// for performing UI testing actions". A session opened and deleted is proof.
async function wdaSessionProblem(url) {
  try {
    const response = await fetch(`${url}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capabilities: { alwaysMatch: {} } }),
      signal: AbortSignal.timeout(WDA_SESSION_TIMEOUT_MS),
    });
    const body = await response.json();
    const id = body.sessionId ?? body.value?.sessionId;
    if (!id) return body.value?.message ?? `no session (HTTP ${response.status})`;
    await fetch(`${url}/session/${id}`, { method: 'DELETE' });
    return null;
  } catch (error) {
    rethrowIfBroken(error);
    return error.message;
  }
}

async function withWdaSession(url, work) {
  const response = await fetch(`${url}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capabilities: { alwaysMatch: {} } }),
    signal: AbortSignal.timeout(WDA_SESSION_TIMEOUT_MS),
  });
  const body = await response.json();
  const id = body.sessionId ?? body.value?.sessionId;
  if (!id) throw new Error(`WebDriverAgent opened no session: ${body.value?.message}`);
  try {
    return await work(`${url}/session/${id}`);
  } finally {
    await fetch(`${url}/session/${id}`, { method: 'DELETE' });
  }
}

// A driven capture turns the iPad through WebDriverAgent and hands it back in
// the orientation it found; that override outlasts the session, so a person
// holding the iPad upright still gets a landscape page (2026-09-23). The
// finger captures set it explicitly first.
async function setIpadOrientation(url, orientation) {
  await withWdaSession(url, async (base) => {
    const response = await fetch(`${base}/orientation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orientation }),
    });
    const body = await response.json().catch((error) => {
      rethrowIfBroken(error);
      return null;
    });
    if (!response.ok || body?.value?.error) {
      throw new Error(
        `WebDriverAgent refused ${orientation} (HTTP ${response.status}: ${body?.value?.message ?? 'no message'})`
      );
    }
  });
}

// Every Safari page a finger capture opened stays inspectable, and Appium then
// lists two WEBVIEW contexts and refuses to guess which is the app
// (2026-09-23). Closing Safari leaves the bundled app the only one.
function terminateIpadSafari(udid, session) {
  const listing = join(session.dir, 'logs', 'ipad-processes.json');
  tryCapture('xcrun', [
    'devicectl',
    'device',
    'info',
    'processes',
    '--device',
    udid,
    '--json-output',
    listing,
  ]);
  const safari = (readJson(listing)?.result?.runningProcesses ?? []).find((entry) =>
    /MobileSafari\.app\/MobileSafari$/.test(entry.executable ?? '')
  );
  if (safari) {
    tryCapture('xcrun', [
      'devicectl',
      'device',
      'process',
      'terminate',
      '--device',
      udid,
      '--pid',
      String(safari.processIdentifier),
    ]);
  }
}

// Reuse a WebDriverAgent that opens a session — the requested URL, the last
// one this session used, or any iproxy forward onto the iPad's WDA port — and
// launch one only when none does. Only one XCTest runner can hold the iPad and
// a launch ends the one holding it, so over a holder the launch needs
// --relaunch-wda, passed while the maintainer watches for the passcode prompt.
async function ensureWda(session, ctx, prompt) {
  const ps = capture('ps', ['-axo', 'command']);
  const candidates = [
    ...new Set(
      [
        argFlag('wda-url'),
        ctx.wdaUrl,
        DEFAULT_WDA_URL,
        ...iproxyForwardPorts(ps, ctx.udid).map((port) => `http://127.0.0.1:${port}`),
      ].filter(Boolean)
    ),
  ];
  const problems = [];
  for (const url of candidates) {
    const status = await wdaStatus(url);
    if (status?.value?.ready !== true) continue;
    // WebDriverAgent serves one session at a time, so probing a runner that is
    // serving one would replace another session's — the preflight's rule too.
    if (status.sessionId ?? status.value?.sessionId) {
      problems.push(`${url}: busy serving another session`);
      continue;
    }
    const problem = await wdaSessionProblem(url);
    if (!problem) {
      console.log(`  WebDriverAgent ${url} — opened and closed a session (reused; not restarted)`);
      return url;
    }
    problems.push(`${url}: ${problem}`);
  }
  if (runnerHoldsDevice(ps, ctx.udid) && !process.argv.includes('--relaunch-wda')) {
    fail(
      `no WebDriverAgent opens a session${problems.length ? ` (${problems.join('; ')})` : ''}, and an ` +
        'xcodebuild runner still holds the iPad. "Not authorized for performing UI testing actions" ' +
        'is an expired XCTest grant. With someone watching the iPad, rerun with --relaunch-wda: the ' +
        'fresh launch ends that runner and shows the passcode prompt.'
    );
  }
  const xctestrun = newestXctestrun();
  if (!xctestrun) {
    fail(
      'no WebDriverAgent .xctestrun in DerivedData — run perf:preflight --verify-ios-launch once'
    );
  }
  const port = await freePortFrom(PORT_SEARCH_FROM.wda);
  spawnOwned(session, 'iproxy-wda', 'iproxy', ['-u', ctx.udid, `${port}:8100`]);
  spawnOwned(session, 'wda-runner', 'xcodebuild', [
    'test-without-building',
    '-xctestrun',
    xctestrun,
    '-destination',
    `id=${ctx.udid}`,
  ]);
  console.log(
    '\n  LOOK AT THE iPAD NOW: if it asks "Enter iPad Passcode for XCTest" / "Enable UI Automation",'
  );
  console.log('  enter the passcode and allow it. The prompt exists only during this launch.');
  say('Look at the iPad. Enter the passcode if it asks.');
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + WDA_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await wdaReady(url)) && !(await wdaSessionProblem(url))) {
      console.log(`  WebDriverAgent ${url} — launched, and a session opened`);
      return url;
    }
    await sleep(3_000);
  }
  await prompt.ask(
    '  WebDriverAgent never opened a session. Clear any prompt on the iPad, then press Enter to fail this step… '
  );
  fail(
    `WebDriverAgent did not open a session at ${url}; see ${join(session.dir, 'logs', 'wda-runner.log')}`
  );
}

// The first runner of 2026-09-23 exited right after a driven capture closed
// its session, cause not established; re-proving before each capture that
// needs WebDriverAgent turns that into a relaunch instead of a lost capture.
async function requireWda(session, prompt) {
  const ctx = session.state.ctx;
  const status = await wdaStatus(ctx.wdaUrl);
  // The same rule as ensureWda: never open a probe session on a runner that is
  // serving someone else's, which would replace it.
  if (status && (status.sessionId ?? status.value?.sessionId)) {
    fail(
      `WebDriverAgent ${ctx.wdaUrl} is serving another session — another capture is using the iPad. ` +
        'Let it finish, then rerun; this runner resumes at the same capture.'
    );
  }
  const problem = await wdaSessionProblem(ctx.wdaUrl);
  if (!problem) return;
  console.log(`  WebDriverAgent ${ctx.wdaUrl} stopped opening sessions (${problem}) — relaunching`);
  ctx.wdaUrl = await ensureWda(session, ctx, prompt);
  saveState(session);
}

async function startPreview(session, name, port, cwd) {
  spawnOwned(
    session,
    name,
    process.execPath,
    [join(cwd, 'tools', 'perf', 'serve-profile-build.mjs'), `--port=${port}`, '--strict-port'],
    {
      cwd,
      env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' },
    }
  );
  await waitForUrl(`http://127.0.0.1:${port}/`, SERVER_READY_TIMEOUT_MS);
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  const entry = entryModulePath(html);
  if (!entry || !(await answers(`http://127.0.0.1:${port}${entry}`))) {
    fail(`the preview on ${port} serves a manifest whose entry does not resolve`);
  }
  return entry;
}

async function startProbeHost(session, name, port, upstreamPort) {
  spawnOwned(
    session,
    name,
    process.execPath,
    [
      join(ROOT, 'tools', 'perf', 'split-capture', 'serve-probe-host.mjs'),
      `--port=${port}`,
      `--upstream=http://127.0.0.1:${upstreamPort}`,
    ],
    { env: { PUBLIC_ENABLE_DEV_HARNESS: 'true' } }
  );
  await waitForUrl(`http://127.0.0.1:${port}/__probe/state`, SERVER_READY_TIMEOUT_MS);
}

// postperf:build writes the stamp after the build, so any build file newer
// than it was written by something else, and the stamp no longer names it.
function newestFileAfterStamp(buildDir) {
  const stampTime = statSync(join(buildDir, BUILD_PROVENANCE_FILE)).mtimeMs;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      const newer = stat.isDirectory() ? walk(path) : stat.mtimeMs > stampTime ? path : null;
      if (newer) return newer;
    }
    return null;
  };
  return walk(buildDir);
}

function checkoutBuildCommit() {
  const head = capture('git', ['rev-parse', 'HEAD']).trim();
  const stamped = stampedBuildCommit();
  if (buildDirHoldsNativeExport())
    fail('web/build holds the native export — run `npm run perf:build` first');
  if (stamped !== head) {
    fail(
      `web/build is stamped ${stamped ?? 'dirty or unstamped'}, not HEAD ${head} — run \`npm run perf:build\` from a clean tree`
    );
  }
  return head;
}

// Visit 1 brings the phone up as well; visit 2 needs only the iPad.
async function stepBringUp(session, prompt, { ipadOs, phone }) {
  const ctx = session.state.ctx;
  ctx.productCommit = checkoutBuildCommit();
  const report = phone
    ? await prepareCapture(['--wake-android'])
    : await prepareCapture([], { android: false });
  if (!report.iosUdid) fail('no iPad enumerated — reconnect it and tap Trust');
  if (phone && !report.androidSerial) fail('no Android phone attached');
  Object.assign(ctx, {
    udid: report.iosUdid,
    lan: lanAddresses()[0],
    macHost: `${capture('scutil', ['--get', 'LocalHostName']).trim()}.local`,
  });
  if (phone) {
    Object.assign(ctx, { serial: report.androidSerial, androidCdpPort: report.ports.androidCdp });
  }
  if (!ctx.lan) fail('no LAN address — the iPad cannot reach this Mac');
  requireIpadOs(ctx, ipadOs);
  ctx.nativeInstall = readJson(NATIVE_INSTALL_RECORD);
  saveState(session);

  stopOwned(session, ['preview', 'probe-host', 'appium']);
  const taken = new Set();
  ctx.previewPort = await freePortFrom(PORT_SEARCH_FROM.server, taken);
  taken.add(ctx.previewPort);
  ctx.probePort = await freePortFrom(PORT_SEARCH_FROM.server, taken);
  ctx.appiumPort = await freePortFrom(PORT_SEARCH_FROM.appium);
  ctx.previewEntry = await startPreview(session, 'preview', ctx.previewPort, ROOT);
  await startProbeHost(session, 'probe-host', ctx.probePort, ctx.previewPort);
  spawnOwned(session, 'appium', 'appium', ['--port', String(ctx.appiumPort), '--log-timestamp']);
  await waitForUrl(`http://127.0.0.1:${ctx.appiumPort}/status`, SERVER_READY_TIMEOUT_MS);
  ctx.wdaUrl = await ensureWda(session, ctx, prompt);
  ctx.probeHost = `http://${ctx.lan}:${ctx.probePort}`;
  saveState(session);
  console.log(
    `\n  preview ${ctx.previewPort} (${ctx.previewEntry}), probe ${ctx.probeHost}, appium ${ctx.appiumPort}, WDA ${ctx.wdaUrl}`
  );
  console.log(
    `  product commit ${ctx.productCommit}; iPadOS ${ipadOs}${phone ? `; phone ${ctx.serial}` : ''}`
  );
  if (ctx.nativeInstall) {
    console.log(
      `  installed iPad app: ${ctx.nativeInstall.commit} (${ctx.nativeInstall.installedAt})`
    );
  } else {
    console.log(
      '  ! no record of the installed iPad app build — the native step will say so in its draft'
    );
  }
}

// -------------------------------------------------------------- captures

function captureRoot(session, item) {
  const captures = join(session.dir, 'captures');
  return item.ipadOs ? join(captures, `ipados-${item.ipadOs}`) : captures;
}

function captureOutput(session, item) {
  const mode = `${item.orientation.toLowerCase()}-${item.theme}`;
  return join(captureRoot(session, item), item.target, mode, `${item.brush}-${item.arm}.json`);
}

function captureLabel(item) {
  const label = `${item.target}-${item.orientation.toLowerCase()}-${item.theme}-${item.brush}-${item.arm}`;
  return item.ipadOs ? `${label}-ipados-${item.ipadOs}` : label;
}

function ipadCaptureArgs(ctx, item, output) {
  const common = [
    `--brush=${item.brush}`,
    `--orientation=${item.orientation}`,
    `--theme=${item.theme}`,
    `--label=${captureLabel(item)}`,
    `--output=${output}`,
  ];
  if (item.kind === 'ipad-driven') {
    return [
      'tools/perf/split-capture/capture-device-frames.mjs',
      ['--platform=ios', `--wda-url=${ctx.wdaUrl}`, `--host=${ctx.probeHost}`, ...common],
      {},
    ];
  }
  if (item.kind === 'ipad-finger') {
    return [
      'tools/perf/split-capture/capture-hand-input.mjs',
      [
        '--platform=ios',
        '--open=safari',
        `--device-udid=${ctx.udid}`,
        `--host=${ctx.probeHost}`,
        `--seconds=${item.seconds}`,
        '--speak',
        ...common,
      ],
      {},
    ];
  }
  return [
    'tools/perf/ios/capture-xcuitest-screen.mjs',
    [
      '--native-app',
      '--bundled-report',
      '--hand-input',
      '--speak',
      `--seconds=${item.seconds}`,
      `--device-id=${ctx.udid}`,
      `--wda-url=${ctx.wdaUrl}`,
      `--appium-url=http://127.0.0.1:${ctx.appiumPort}`,
      '--no-serve',
      '--report-only',
      ...common,
    ],
    { PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' },
  ];
}

function expectationFor(ctx, item) {
  return {
    ...item,
    label: captureLabel(item),
    // The bundled runner records no build identity; the installed build is
    // named from the rig-prep record instead.
    ...(item.kind === 'ipad-native-finger' ? {} : { productCommit: ctx.productCommit }),
    ...(item.kind === 'ipad-driven' ? {} : { minContactSeconds: FINGER_MIN_CONTACT_SECONDS }),
  };
}

async function runIpadCapture(session, prompt, item) {
  const ctx = session.state.ctx;
  const output = captureOutput(session, item);
  const label = captureLabel(item);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    console.log(`\n--- ${label}  (attempt ${attempt}/${MAX_ATTEMPTS})`);
    if (item.kind === 'ipad-driven') {
      console.log('  DRIVEN: hands off the iPad. WebDriverAgent draws 10 passes (~2 min).');
    } else {
      console.log(
        `  FINGER, ${item.brush}, ${item.orientation}: ${item.seconds} s of ${item.gesture}.`
      );
      console.log('  The page opens by itself. Start at "Draw now" (spoken), stop at "Stop".');
    }
    await prompt.ask('  Press Enter to start… ');
    await requireWda(session, prompt);
    if (item.kind === 'ipad-native-finger') terminateIpadSafari(ctx.udid, session);
    if (item.kind === 'ipad-finger') {
      const turned = await setIpadOrientation(ctx.wdaUrl, item.orientation).then(
        () => null,
        (error) => {
          rethrowIfBroken(error);
          return error.message;
        }
      );
      if (turned) {
        console.log(`  ✗ could not turn the iPad to ${item.orientation}: ${turned}`);
        if (attempt === MAX_ATTEMPTS || !(await prompt.yes('  Try again?'))) {
          return {
            label,
            arm: item.arm,
            brush: item.brush,
            output,
            attempt,
            status: 'REDO',
            reasons: [turned],
            metrics: {},
          };
        }
        continue;
      }
    }
    // Built after the WDA re-proof, which may have moved ctx.wdaUrl.
    const [script, args, env] = ipadCaptureArgs(ctx, item, output);
    const status = runNode(script, args, { env });
    const verdict = captureVerdict(readJson(output), expectationFor(ctx, item));
    if (status !== 0 && verdict.status === 'PASS' && item.kind !== 'ipad-driven') {
      verdict.status = 'REDO';
      verdict.reasons.push(`the capture exited ${status}`);
    }
    printVerdict(label, verdict);
    const result = {
      label,
      arm: item.arm,
      brush: item.brush,
      output,
      attempt,
      status: verdict.status,
      reasons: verdict.reasons,
      metrics: verdict.metrics,
    };
    if (item.brush === 'magic' && verdict.scored)
      result.magic = magicFirstLoadReading(readJson(output), verdict.scored);
    if (verdict.status === 'PASS') return result;
    if (attempt === MAX_ATTEMPTS || !(await prompt.yes('  Redo it now?'))) return result;
  }
  throw new Error('unreachable: every attempt returns');
}

async function runCaptureStep(session, prompt, step) {
  requireIpadOs(session.state.ctx, stepIpadOs(step));
  const previous = session.state.steps[step.id]?.results ?? [];
  const results = [...previous];
  for (const item of step.captures) {
    const label = captureLabel(item);
    if (results.some((result) => result.label === label && result.status === 'PASS')) {
      console.log(`  ${label} — already PASS in this session, kept`);
      continue;
    }
    const result = await runIpadCapture(session, prompt, item);
    const index = results.findIndex((existing) => existing.label === label);
    if (index === -1) results.push(result);
    else results[index] = result;
    markStep(session, step.id, 'running', { results });
  }
  // Done means one PASS per PLANNED capture, not "no recorded failure": a
  // capture that never produced a result must hold the step open too.
  const missing = step.captures
    .map(captureLabel)
    .filter(
      (label) => !results.some((result) => result.label === label && result.status === 'PASS')
    );
  if (missing.length) console.log(`\n  Still owed in ${step.id}: ${missing.join(', ')}`);
  markStep(session, step.id, missing.length ? 'failed' : 'done', { results });
  return results;
}

const sessionContext = (session, ipadOs = IPAD_SESSION_OS) =>
  `Session \`${relative(ROOT, session.dir)}\`, product commit ${session.state.ctx.productCommit}, iPad on iPadOS ${ipadOs}, captured ${new Date().toISOString().slice(0, 10)}.`;

// One line per brush: the driven arm against the first finger arm, and the gap.
function pairedGapLines(results) {
  return ['pen', 'magic'].map((brush) => {
    const driven = results.find((r) => r.brush === brush && r.arm === 'driven');
    const finger = results.find((r) => r.brush === brush && r.arm.startsWith('finger'));
    const d = driven?.metrics?.lostFrameTimeShare;
    const f = finger?.metrics?.lostFrameTimeShare;
    return `- ${brush}: driven ${driven?.metrics?.lostFrameTimeShareText ?? 'n/a'} (${driven?.metrics?.gate ?? '?'}), finger ${finger?.metrics?.lostFrameTimeShareText ?? 'n/a'} (${finger?.metrics?.gate ?? '?'}), driven − finger ${Number.isFinite(d) && Number.isFinite(f) ? `${Math.round((d - f) * 10_000) / 100} points` : 'n/a'}`;
  });
}

function draftPortrait(session, results) {
  const paired = results.filter((result) => ['driven', 'finger'].includes(result.arm));
  const byBrush = pairedGapLines(results);
  writeDraft(
    session,
    2235,
    'paired',
    draftIssueComment({
      issue: 2235,
      title: 'Paired automated-vs-finger capture (ADR-0174 confirmation)',
      context: [
        sessionContext(session),
        'Both arms in one session through one probe host: the driven arm is `perf:device:frames --platform=ios` (WebDriverAgent W3C actions, 10 passes); the finger arm is `perf:device:hand --open=safari`. Rescore: `npm run perf:rescore -- --corpus=<session>/captures/ipad-device-web --target=ipad-device-web`.',
      ],
      results: paired,
      extra: [
        'ADR-0174 predicts the driven arm red and the finger arm green on the same commit:',
        ...byBrush,
        '',
        'Ruling for the maintainer: does ADR-0174 stand, or reopen with these numbers?',
      ],
    })
  );
  const magic = results.filter((result) => result.magic);
  writeDraft(
    session,
    2232,
    'first-load',
    draftIssueComment({
      issue: 2232,
      title: 'Magic first-load stall: real-finger readings',
      context: [
        sessionContext(session),
        'Each finger capture opened a fresh Safari page, so its first Magic stroke is the sheet’s first load. Portrait, dark, the mode of the 2026-09-07 capture.',
      ],
      results: magic,
      extra: [
        '| capture | lost | worst in-contact gap | onset after first touch | lost without it |',
        '| --- | --- | --- | --- | --- |',
        ...magic.map(
          (r) =>
            `| ${r.label} | ${r.metrics.lostFrameTimeShareText} | ${r.magic.worstInContactGapMs === null ? 'none (no in-contact stall)' : `${r.magic.worstInContactGapMs} ms`} | ${r.magic.worstOnsetAfterFirstTouchMs === null ? '—' : `${r.magic.worstOnsetAfterFirstTouchMs} ms`} | ${Number.isFinite(r.magic.lostFrameTimeShareWithoutWorst) ? `${Math.round(r.magic.lostFrameTimeShareWithoutWorst * 10_000) / 100}%` : 'n/a'} |`
        ),
        '',
        'Decision for the maintainer (`needs-adr`): accepted first-use cost, a named one-off episode excluded from the gate, or a product fix (provisional sheet / idle pre-raster).',
      ],
    })
  );
}

function draftLandscape(session, results) {
  writeDraft(
    session,
    2231,
    'eraser',
    draftIssueComment({
      issue: 2231,
      title: 'First real-finger eraser captures, iPad web landscape',
      context: [
        sessionContext(session),
        'Each eraser page was filled and verified before ready (one fill, no refills; the finger swept the page once). The landscape-dark pen finger capture is the #2233 ruling input.',
      ],
      results,
      extra: [
        'ADR-0174: a green eraser finger capture explains the driven eraser reds; a red one reopens the ADR.',
      ],
    })
  );
}

function draftNative(session, results) {
  const install = session.state.ctx.nativeInstall;
  writeDraft(
    session,
    2236,
    'native-finger',
    draftIssueComment({
      issue: 2236,
      title: 'Real-finger captures in the installed iPad app',
      context: [
        sessionContext(session),
        `Installed bundled build: ${install ? `${install.commit} (${install.variant}, installed ${install.installedAt})` : 'unrecorded'}. Route: \`perf:ios:bundled:frames --hand-input\` — WebDriverAgent stays attached (the artifact records \`handInputControl.wdaSessionAttached: true\`).`,
      ],
      results,
      extra: ['For ADR-0174’s native-row statement to cite.'],
    })
  );
}

function draftUpdatePaired(session, results) {
  const before = session.state.steps['ipad-portrait']?.results ?? [];
  const corpus = relative(
    ROOT,
    join(captureRoot(session, { ipadOs: IPAD_UPDATE_OS }), 'ipad-device-web')
  );
  writeDraft(
    session,
    2237,
    'paired',
    draftIssueComment({
      issue: 2237,
      title: `Paired automated-vs-finger controls on iPadOS ${IPAD_UPDATE_OS} (the ADR-0174 floor)`,
      context: [
        sessionContext(session, IPAD_UPDATE_OS),
        `Visit 1's #2235 pair repeated after the update, both arms in one session through one probe host: \`perf:device:frames --platform=ios\` (WebDriverAgent W3C actions, 10 passes) against \`perf:device:hand --open=safari\`. Rescore: \`npm run perf:rescore -- --corpus=${corpus} --target=ipad-device-web\`.`,
      ],
      results,
      extra: [
        `On iPadOS ${IPAD_UPDATE_OS}:`,
        ...pairedGapLines(results),
        '',
        `On iPadOS ${IPAD_SESSION_OS}, visit 1 of this session${before.length ? '' : ' (nothing recorded)'}:`,
        ...pairedGapLines(before),
        '',
        `Later iPad drawing verdicts on ${IPAD_UPDATE_OS} are judged against this floor. Ruling for the maintainer: does ADR-0174 carry over to ${IPAD_UPDATE_OS}?`,
      ],
    })
  );
}

// ------------------------------------------------------------ secure origin

// Starts the leaf and constraint-probe fronts once the person agrees, and
// proves Node reaches the leaf with the rig CA. False when the person declines.
async function startSecureFronts(session, prompt) {
  const ctx = session.state.ctx;
  if (!existsSync(join(CA_DIR, 'leaf.pem')))
    fail(`no rig CA at ${CA_DIR} — see docs/PROFILING-IPAD.md "A trusted HTTPS origin"`);
  ctx.tlsPort = await freePortFrom(PORT_SEARCH_FROM.front);
  ctx.constraintPort = await freePortFrom(PORT_SEARCH_FROM.front, new Set([ctx.tlsPort]));
  console.log(
    `  About to start two HTTPS fronts on ${ctx.lan}:${ctx.tlsPort} (leaf) and ${ctx.lan}:${ctx.constraintPort} (constraint probe),`
  );
  console.log(
    `  forwarding GET/HEAD for the page and build files only, to the preview on ${ctx.previewPort}.`
  );
  if (!(await prompt.yes('  Start them?'))) return false;
  stopOwned(session, ['front-leaf', 'front-constraint']);
  const front = (leaf, port) => [
    'serve',
    `--listen=${ctx.lan}:${port}`,
    `--upstream=${ctx.previewPort}`,
    ...(leaf ? [`--leaf=${leaf}`] : []),
  ];
  spawnOwned(session, 'front-leaf', process.execPath, [
    join(ROOT, 'tools/perf/ios/secure-origin.mjs'),
    ...front(null, ctx.tlsPort),
  ]);
  spawnOwned(session, 'front-constraint', process.execPath, [
    join(ROOT, 'tools/perf/ios/secure-origin.mjs'),
    ...front('constraint-probe', ctx.constraintPort),
  ]);
  await sleep(1_500);
  ctx.secureUrl = `https://${ctx.macHost}:${ctx.tlsPort}/`;
  const nodeCheck = spawnSync(
    process.execPath,
    [
      '-e',
      `fetch(${JSON.stringify(ctx.secureUrl)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(2))`,
    ],
    {
      env: { ...process.env, NODE_EXTRA_CA_CERTS: join(CA_DIR, 'ca.pem') },
    }
  );
  if (nodeCheck.status !== 0)
    fail(`Node could not load ${ctx.secureUrl} with the rig CA (exit ${nodeCheck.status})`);
  console.log(`  ✓ Node loads ${ctx.secureUrl} with the rig CA`);
  return true;
}

// A person looks at the iPad: Safari must refuse the constraint probe, then
// load the leaf. Only a conclusive verdict (constraintProbeVerdict), with the
// iPadOS the iPad reports, becomes a row in CONSTRAINT_PROBE_LOG — the evidence
// CONSTRAINT_PROVEN_IPADOS cites.
async function proveFrontsOnIpad(session, prompt) {
  const ctx = session.state.ctx;
  const ipadOs = ipadOsVersion(ctx.udid);
  const origin = `perf:session:person ${relative(ROOT, session.dir)}`;
  const record = (verdict, detail) => {
    recordConstraintProbe({ udid: ctx.udid, ipadOs, verdict, detail: `${origin}: ${detail}` });
    console.log(
      `  recorded: iPadOS ${ipadOs ?? 'unknown'}, probe ${verdict}, in ${relative(ROOT, CONSTRAINT_PROBE_LOG)}`
    );
  };
  const constraintUrl = `https://${ctx.macHost}:${ctx.constraintPort}/`;
  openSafariWithDevicectl({ udid: ctx.udid, pageUrl: constraintUrl });
  const probeWarned = await prompt.yes(
    `  The iPad opened ${constraintUrl}. Does it show "This Connection Is Not Private"?`
  );
  const probeLoaded =
    !probeWarned && (await prompt.yes('  Did Splotch load there instead, with no warning?'));
  let leafLoaded = false;
  if (probeWarned) {
    openSafariWithDevicectl({ udid: ctx.udid, pageUrl: ctx.secureUrl });
    leafLoaded = await prompt.yes(
      `  The iPad opened ${ctx.secureUrl}. Does Splotch load with no warning?`
    );
  }
  const verdict = constraintProbeVerdict({ probeWarned, probeLoaded, leafLoaded });
  if (verdict === CONSTRAINT_PROBE_VERDICTS.refused) {
    record(verdict, 'the person saw Safari refuse the constraint probe, then load the leaf');
    return { ipadOs, verdict };
  }
  stopOwned(session, ['front-leaf', 'front-constraint']);
  if (verdict === CONSTRAINT_PROBE_VERDICTS.accepted) {
    record(verdict, 'Safari loaded the constraint probe with no warning');
    fail(
      'the iPad accepted the constraint probe: it is NOT enforcing the name constraint. Remove the rig CA profile from the iPad now (docs/PROFILING-IPAD.md) and do not capture.'
    );
  }
  fail(
    probeWarned
      ? 'the leaf did not load on the iPad, so the probe’s refusal proves nothing and was not recorded — check Certificate Trust Settings for the rig CA'
      : 'the constraint probe neither showed the warning nor loaded, which proves nothing either way; nothing was recorded. Check the fronts’ logs in the session directory, then rerun this step.'
  );
}

async function stepSecureOrigin(session, prompt) {
  const ctx = session.state.ctx;
  requireIpadOs(ctx, IPAD_SESSION_OS);
  if (!(await startSecureFronts(session, prompt))) {
    markStep(session, 'ipad-secure-origin', 'skipped');
    return;
  }
  await proveFrontsOnIpad(session, prompt);
  stopOwned(session, ['front-constraint']);
  saveState(session);
  markStep(session, 'ipad-secure-origin', 'done', { secureUrl: ctx.secureUrl });
}

// After the update only a person can re-prove the constraint on the new
// release. Until CONSTRAINT_PROVEN_IPADOS names it, `perf:ios:secure-origin
// check` refuses the iPad and no unattended sweep can run (issue 2211).
async function stepConstraintProbe(session, prompt) {
  requireIpadOs(session.state.ctx, IPAD_UPDATE_OS);
  if (!(await startSecureFronts(session, prompt))) {
    console.log(
      `  Declined: \`perf:ios:secure-origin check\` keeps refusing the iPad on ${IPAD_UPDATE_OS}.`
    );
    markStep(session, 'ipad-constraint-probe', 'skipped');
    return;
  }
  const proof = await proveFrontsOnIpad(session, prompt);
  stopOwned(session, ['front-leaf', 'front-constraint']);
  const followUp = constraintProbeFollowUp(proof);
  console.log(`\n  Follow-up: ${followUp}`);
  markStep(session, 'ipad-constraint-probe', 'done', { ...proof, followUp });
  writeDraft(
    session,
    2211,
    'constraint-probe',
    [
      `## Constraint probe re-proven on iPadOS ${proof.ipadOs}`,
      '',
      `${sessionContext(session, proof.ipadOs)} \`perf:session:person\` started the leaf and constraint-probe fronts and opened each in iPad Safari. The person saw Safari refuse the probe ("This Connection Is Not Private") and then load the leaf.`,
      '',
      `Evidence: the \`${proof.verdict}\` row for iPadOS ${proof.ipadOs} in \`${relative(ROOT, CONSTRAINT_PROBE_LOG)}\`.`,
      '',
      `Follow-up: ${followUp}`,
    ].join('\n')
  );
}

async function stepSecureActions(session) {
  const ctx = session.state.ctx;
  requireIpadOs(ctx, IPAD_SESSION_OS);
  if (session.state.steps['ipad-secure-origin']?.status === 'skipped') {
    console.log('  the secure-origin fronts were declined, so the sweeps are skipped too');
    markStep(session, 'ipad-secure-actions', 'skipped');
    return;
  }
  if (!ctx.secureUrl || session.state.steps['ipad-secure-origin']?.status !== 'done') {
    fail('the secure-origin step has not passed in this session — run --redo=ipad-secure-origin');
  }
  // A resume re-runs bring-up, which can move the preview; a front left from
  // before still forwards to the old port, and after --teardown there is none.
  const front = session.state.owned.find((entry) => entry.name === 'front-leaf');
  const frontServes =
    front &&
    processAlive(front.pid) &&
    front.args.includes(`--upstream=${ctx.previewPort}`) &&
    spawnSync(
      process.execPath,
      [
        '-e',
        `fetch(${JSON.stringify(ctx.secureUrl)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(2))`,
      ],
      { env: { ...process.env, NODE_EXTRA_CA_CERTS: join(CA_DIR, 'ca.pem') } }
    ).status === 0;
  if (!frontServes) {
    stopOwned(session, ['front-leaf', 'front-constraint']);
    markStep(session, 'ipad-secure-origin', 'pending');
    fail(
      'the HTTPS front no longer serves this session’s preview (a resume or --teardown moved it). ' +
        'Rerun with someone at the iPad: the secure-origin step restarts and re-proves it first.'
    );
  }
  const outputRoot = join(session.dir, 'secure-actions');
  const modes = CAMPAIGN_MODES.map((mode) => mode.id);
  const status = spawnSync(
    'npm',
    [
      'run',
      'perf:campaign',
      '--',
      '--target=ipad-device-web',
      '--items=actions',
      `--modes=${modes.join(',')}`,
      `--url=${ctx.secureUrl}`,
      `--wda-url=${ctx.wdaUrl}`,
      `--appium-url=http://127.0.0.1:${ctx.appiumPort}`,
      `--device-id=${ctx.udid}`,
      `--output-root=${outputRoot}`,
      '--max-attempts=2',
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_EXTRA_CA_CERTS: join(CA_DIR, 'ca.pem') },
    }
  ).status;
  const target = campaignTarget('ipad-device-web');
  const rows = CAMPAIGN_MODES.map((mode) => {
    const path = artifactPath(outputRoot, 'ipad-device-web', mode, 'actions');
    const actions = readJson(path);
    const problem = actions ? secureSweepProblem(actions) : 'no actions.json';
    return {
      mode: mode.id,
      verdict: problem ? 'REDO' : 'PASS',
      detail: problem ?? `${actions.samples.length} samples, AI-waiting secure`,
    };
  });
  console.table(rows);
  stopOwned(session, ['front-leaf']);
  // The campaign exits 0 whatever its cells did; its own acceptance
  // (blocked coverage, fidelity) is what campaign-status reports.
  const { outstanding } = await campaignStatus({
    targetId: 'ipad-device-web',
    outputRoot,
    modes,
    items: ['actions'],
  });
  const passed = outstanding.length === 0 && rows.every((row) => row.verdict === 'PASS');
  markStep(session, 'ipad-secure-actions', passed ? 'done' : 'failed', {
    rows,
    campaignExit: status,
  });
  writeDraft(
    session,
    2211,
    'secure-sweeps',
    [
      '## iPad web action sweeps over the secure origin, person-present',
      '',
      `${sessionContext(session)} Front: \`perf:ios:secure-origin serve\` started by the maintainer’s own \`perf:session:person\` run (the constraint probe was refused on the iPad and the leaf loaded first). Campaign: \`perf:campaign --target=${target.id} --items=actions\` with \`--url=https://<mac>.local:<port>/\` and \`NODE_EXTRA_CA_CERTS\`; output \`${relative(ROOT, outputRoot)}\`.`,
      '',
      '| mode | verdict | detail |',
      '| --- | --- | --- |',
      ...rows.map((row) => `| ${row.mode} | ${row.verdict} | ${row.detail} |`),
      '',
      'This is option 2/3 of the issue as a documented human-present procedure: the maintainer starts the front by running the session command, and the campaign runs unattended behind it. Fold with `perf:campaign:sources` once the drawing cells for these modes share the product commit (action-only folding is the separate drafted follow-up).',
    ].join('\n')
  );
}

// ------------------------------------------------------------------- phone

async function stepPhoneOverlay(session) {
  const serial = session.state.ctx.serial ?? connectedAndroidSerial();
  const deadline = Date.now() + OVERLAY_TIMEOUT_MS;
  const verdicts = [];
  let last = null;
  while (Date.now() < deadline) {
    const verdict = readOverlayVerdict(serial);
    verdicts.push(verdict);
    const cleared = overlaySteadilyClear(verdicts);
    const clearRun = verdicts.length - 1 - verdicts.findLastIndex((entry) => !entry.pass);
    const mark = cleared
      ? '✓ PASS'
      : verdict.pass
        ? `… clear, holding (${clearRun}/${OVERLAY_STEADY_READS})`
        : '✗ FAIL';
    const line = `${mark}  ${verdict.detail}`;
    if (line !== last) {
      console.log(`  ${new Date().toLocaleTimeString()}  ${line}`);
      last = line;
    }
    if (cleared) {
      say('Phone overlay cleared. You can go.');
      markStep(session, 'phone-overlay', 'done', { verdict });
      return;
    }
    await sleep(OVERLAY_POLL_MS);
  }
  markStep(session, 'phone-overlay', 'failed');
  fail(
    'the overlay did not stay clear for 30 s within 20 minutes; the phone A/B cannot run until it does'
  );
}

async function stepPhoneAb(session) {
  const ctx = session.state.ctx;
  const overlay = readOverlayVerdict(ctx.serial);
  if (!overlay.pass)
    fail(`the overlay check fails again (${overlay.detail}) — rerun --redo=phone-overlay`);
  if (
    runNode('tools/perf/prepare-capture.mjs', ['--wake-android', '--verify-android-input']) !== 0
  ) {
    fail('the Android input/rotation verification failed — see above');
  }
  const origins = {};
  const taken = new Set([ctx.previewPort, ctx.probePort]);
  for (const origin of ['base', 'head']) {
    const arm = AB_2229_ARMS.find((candidate) => candidate.origin === origin);
    const dir = join(AB_ROOT, arm.commit.slice(0, 8));
    const stamp = readJson(join(dir, 'web', 'build', '.perf-build-provenance.json'));
    if (stamp?.commit !== arm.commit || stamp.dirty !== false) {
      fail(
        `${dir} is not a clean perf build of ${arm.commit} — see the runbook's pre-sit checklist`
      );
    }
    const previewPort = await freePortFrom(PORT_SEARCH_FROM.server, taken);
    taken.add(previewPort);
    const probePort = await freePortFrom(PORT_SEARCH_FROM.server, taken);
    taken.add(probePort);
    stopOwned(session, [`ab-preview-${origin}`, `ab-probe-${origin}`]);
    const buildDir = join(dir, 'web', 'build');
    const staleFile = newestFileAfterStamp(buildDir);
    if (staleFile)
      fail(`${staleFile} changed after ${arm.commit}'s build stamp — rebuild that arm`);
    await startPreview(session, `ab-preview-${origin}`, previewPort, dir);
    const previewUrl = `http://127.0.0.1:${previewPort}/`;
    const bytesProblem = await servedBuildFingerprintProblem(previewUrl, { buildDir });
    if (bytesProblem)
      fail(`the ${origin} arm's preview is not its worktree's build: ${bytesProblem}`);
    const { buildDigest } = await servedBuildBinding(previewUrl, {
      verifiedAgainstCheckout: false,
    });
    await startProbeHost(session, `ab-probe-${origin}`, probePort, previewPort);
    origins[origin] = { buildDigest, host: `http://${ctx.lan}:${probePort}` };
  }
  const results = [...(session.state.steps['phone-ab']?.results ?? [])];
  for (let round = 1; round <= AB_2229_ROUNDS; round += 1) {
    for (const arm of AB_2229_ARMS) {
      const label = `android-device-web-portrait-light-crayon-${arm.id}-r${round}`;
      if (results.some((result) => result.label === label && result.status === 'PASS')) continue;
      const output = join(
        session.dir,
        'captures',
        'android-device-web',
        'portrait-light',
        `crayon-${arm.id}-r${round}.json`
      );
      let verdict;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        console.log(`\n--- ${label} (attempt ${attempt}/2)`);
        runNode('tools/perf/split-capture/capture-device-frames.mjs', [
          '--platform=android',
          `--device-serial=${ctx.serial}`,
          `--cdp-port=${ctx.androidCdpPort}`,
          `--host=${origins[arm.origin].host}`,
          '--brush=crayon',
          '--orientation=PORTRAIT',
          '--theme=light',
          '--allow-foreign-build',
          `--reduce-motion=${arm.reduceMotion}`,
          `--label=${label}`,
          `--output=${output}`,
        ]);
        verdict = captureVerdict(readJson(output), {
          kind: 'android-driven',
          target: 'android-device-web',
          brush: 'crayon',
          orientation: 'PORTRAIT',
          theme: 'light',
          label,
          productCommit: null,
          buildDigest: origins[arm.origin].buildDigest,
          reduceMotion: arm.reduceMotion,
        });
        printVerdict(label, verdict);
        if (verdict.status === 'PASS') break;
      }
      const result = {
        label,
        arm: arm.id,
        output,
        status: verdict.status,
        reasons: verdict.reasons,
        metrics: verdict.metrics,
      };
      const index = results.findIndex((existing) => existing.label === label);
      if (index === -1) results.push(result);
      else results[index] = result;
      markStep(session, 'phone-ab', 'running', { results });
    }
  }
  stopOwned(session, ['ab-preview-base', 'ab-probe-base', 'ab-preview-head', 'ab-probe-head']);
  const reverse = tryCapture('adb', ['-s', ctx.serial, 'reverse', '--list']);
  if (reverse.ok && reverse.stdout.trim())
    console.log(`  ! adb reverse rules remain:\n${reverse.stdout}`);
  const summary = abSummary(results);
  console.table(summary);
  const failed = results.filter((result) => result.status !== 'PASS');
  markStep(session, 'phone-ab', failed.length ? 'failed' : 'done', { results, summary });
  writeDraft(
    session,
    2229,
    'ab',
    draftIssueComment({
      issue: 2229,
      title: 'Attribution, part 2: the portrait A/B with every swipe delivered',
      context: [
        `${sessionContext(session)} Phone overlay check: ${session.state.steps['phone-overlay']?.verdict?.detail ?? 'n/a'}.`,
        `crayon portrait-light, 10 passes, Chrome on the rig phone, one session; builds from isolated worktrees at ${AB_2229_ARMS[0].commit} and ${AB_2229_ARMS[1].commit}, driven by this checkout's harness (\`--allow-foreign-build\`, so \`productCommit\` is null and the served entry is checked instead). Reduce Motion is seeded through the probe plan and read back from the page.`,
      ],
      results,
      extra: [
        '| arm | commit | Reduce Motion | n | lost frame | median |',
        '| --- | --- | --- | --- | --- | --- |',
        ...summary.map(
          (row) =>
            `| ${row.arm} | ${row.commit} | ${row.reduceMotion} | ${row.n} | ${row.shares} | ${row.median} |`
        ),
      ],
    })
  );
}

// ------------------------------------------------------------ visit two

async function stepIpadUpdate(session, prompt) {
  const ctx = session.state.ctx;
  const version = ipadOsVersion(ctx.udid);
  if (version === IPAD_UPDATE_OS) {
    console.log(`  the iPad already reports ${IPAD_UPDATE_OS}`);
  } else {
    await prompt.ask(
      `  Start the update on the iPad now (it reports ${version ?? 'unknown'}). Press Enter once it is downloading/installing… `
    );
  }
  markStep(session, 'ipad-update', 'done', { from: version });
}

async function stepIphone(session, prompt) {
  const listing = join(session.dir, 'logs', 'devicectl-devices.json');
  tryCapture('xcrun', ['devicectl', 'list', 'devices', '--json-output', listing]);
  const devices = readJson(listing)?.result?.devices ?? [];
  const iphone = devices.find(
    (device) =>
      device.hardwareProperties?.deviceType === 'iPhone' &&
      device.connectionProperties?.tunnelState !== 'unavailable'
  );
  if (!iphone) {
    console.log('  No iPhone is connected.');
    if (!(await prompt.yes('  Skip the iPhone check?')))
      fail('connect and unlock the iPhone, then rerun --redo=iphone-inset');
    markStep(session, 'iphone-inset', 'skipped');
    return;
  }
  const appPath = session.state.ctx.nativeInstall?.appPath;
  const id = iphone.identifier;
  const install = appPath
    ? tryCapture('xcrun', ['devicectl', 'device', 'install', 'app', '--device', id, appPath])
    : { ok: false, stderr: 'no recorded App.app' };
  if (!install.ok) {
    console.log(`  Installing the prepared App.app failed: ${install.stderr?.trim()}`);
    console.log('  Build for this iPhone instead (registers it with the team profile):');
    console.log(
      `    xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination id=${iphone.hardwareProperties?.udid ?? id} -allowProvisioningUpdates build`
    );
    fail('install the app on the iPhone, then rerun --redo=iphone-inset');
  }
  tryCapture('xcrun', [
    'devicectl',
    'device',
    'process',
    'launch',
    '--terminate-existing',
    '--device',
    id,
    'art.splotch.app',
  ]);
  const checks = [
    'Portrait, drawing screen: nothing sits under the Dynamic Island or status bar, and there is no black strip or double gap at the top or bottom.',
    'Tap Undo, Clear and Settings each near their LOWER edge: each fires its action (no ink dot on the paper).',
    'Rotate to landscape LEFT: controls clear the island side; repeat the lower-edge taps.',
    'Rotate to landscape RIGHT: same checks.',
    'Settings → open Privacy (and Changelog if linked): the Back to drawing link sits below the status bar, in portrait and landscape.',
    'Rotate back to portrait: the drawing screen looks exactly as in the first check.',
  ];
  const answers = [];
  for (const check of checks) {
    const ok = await prompt.yes(`  ${check}\n    Looks right?`);
    const note = ok ? '' : (await prompt.ask('    What did you see? ')).trim();
    answers.push({ check, ok, note });
  }
  markStep(session, 'iphone-inset', answers.every((a) => a.ok) ? 'done' : 'failed', {
    answers,
    model: iphone.hardwareProperties?.marketingName,
  });
  writeDraft(
    session,
    2249,
    'iphone',
    [
      `## ios.contentInset "never" on a notched iPhone (${iphone.hardwareProperties?.marketingName ?? 'iPhone'}, iOS ${iphone.deviceProperties?.osVersionNumber ?? '?'})`,
      '',
      `Installed build: ${session.state.ctx.nativeInstall?.commit ?? 'unrecorded'}. Checked by hand through \`perf:session:person\`.`,
      '',
      '| check | result |',
      '| --- | --- |',
      ...answers.map((a) => `| ${a.check} | ${a.ok ? 'ok' : `**no** — ${a.note}`} |`),
      '',
      'Screenshots: attach the ones taken on the phone (side + volume up).',
    ].join('\n')
  );
}

async function waitForIpadUpdate(ctx) {
  console.log(`  Waiting for the iPad to report iPadOS ${IPAD_UPDATE_OS}…`);
  const deadline = Date.now() + IPAD_UPDATE_TIMEOUT_MS;
  let version = ipadOsVersion(ctx.udid);
  while (version !== IPAD_UPDATE_OS && Date.now() < deadline) {
    process.stdout.write(
      `\r  iPad reports ${version ?? 'nothing (rebooting?)'} — ${new Date().toLocaleTimeString()}   `
    );
    await sleep(IPAD_UPDATE_POLL_MS);
    version = ipadOsVersion(ctx.udid);
  }
  if (version !== IPAD_UPDATE_OS)
    fail(`the iPad still reports ${version ?? 'nothing'} after 90 minutes`);
  say(`The iPad is on ${IPAD_UPDATE_OS}.`);
}

async function stepUpdateBringUp(session, prompt) {
  await waitForIpadUpdate(session.state.ctx);
  await prompt.ask('\n  Unlock the iPad and tap Trust if asked. Press Enter… ');
  await stepBringUp(session, prompt, { ipadOs: IPAD_UPDATE_OS, phone: false });
}

async function stepCommitCheck(session, prompt) {
  const ctx = session.state.ctx;
  requireIpadOs(ctx, IPAD_UPDATE_OS);
  // The commit check starts its own server and inspector; a skipped or failed
  // paired step can leave this session's rig running, so it is released first.
  stopOwned(session);
  checkoutBuildCommit();
  await prompt.ask('\n  Unlock the iPad, open Safari to one tab, leave it in front. Press Enter… ');
  const port = await freePortFrom(PORT_SEARCH_FROM.server);
  const logPath = join(session.dir, 'logs', 'commit-check.log');
  const child = spawnSync(
    'npm',
    [
      'run',
      'perf:ios:webkit:commit',
      '--ignore-scripts',
      '--',
      `--device-id=${ctx.udid}`,
      `--port=${port}`,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, PERF_MARKS: 'true', PUBLIC_ENABLE_DEV_HARNESS: 'true' },
      encoding: 'utf8',
    }
  );
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  writeFileSync(logPath, output);
  process.stdout.write(output);
  const verdict = child.status === 0 ? 'PASS' : /BREACH/.test(output) ? 'BREACH' : 'NOT EVALUATED';
  const zeroPages = /exposes no Safari pages/.test(output);
  markStep(session, 'ipad-commit-check', child.status === 0 ? 'done' : 'failed', {
    verdict,
    exit: child.status,
  });
  writeDraft(
    session,
    2237,
    'commit-check',
    [
      `## ADR-0173 commit check on iPadOS ${IPAD_UPDATE_OS}: ${verdict}`,
      '',
      `Build ${ctx.productCommit}; \`npm run perf:ios:webkit:commit\` through \`perf:session:person\`. Pass rule: engine.commit P95 ≤ 25 ms on both arms.`,
      '',
      '```text',
      ...output.trim().split('\n').slice(-25),
      '```',
      '',
      zeroPages
        ? 'The inspector proxy listed the device and no Safari pages — the contingency in the issue body applies (repoint `webkit-inspector.mjs` at pymobiledevice3 `webinspector cdp`).'
        : 'Record the figures in the release notes as ADR-0173 specifies, and against ADR-0173 itself.',
    ].join('\n')
  );
}

// ------------------------------------------------------------------ driver

const BRING_UPS = {
  'bring-up': (session, prompt) =>
    stepBringUp(session, prompt, { ipadOs: IPAD_SESSION_OS, phone: true }),
  'update-bring-up': stepUpdateBringUp,
};

const STEP_RUNNERS = {
  'bring-up': (session, prompt) =>
    BRING_UPS['bring-up'](session, prompt).then(() => markStep(session, 'bring-up', 'done')),
  'ipad-portrait': async (session, prompt) =>
    draftPortrait(session, await runCaptureStep(session, prompt, sessionStep('ipad-portrait'))),
  'ipad-landscape': async (session, prompt) =>
    draftLandscape(session, await runCaptureStep(session, prompt, sessionStep('ipad-landscape'))),
  'ipad-native': async (session, prompt) =>
    draftNative(session, await runCaptureStep(session, prompt, sessionStep('ipad-native'))),
  'ipad-secure-origin': stepSecureOrigin,
  'phone-overlay': stepPhoneOverlay,
  'phone-ab': stepPhoneAb,
  'ipad-secure-actions': async (session) => {
    await stepSecureActions(session);
    console.log('\nVisit 1 is complete. Stopping every server this session started:');
    stopOwned(session);
  },
  'ipad-update': stepIpadUpdate,
  'iphone-inset': stepIphone,
  'update-bring-up': (session, prompt) =>
    BRING_UPS['update-bring-up'](session, prompt).then(() =>
      markStep(session, 'update-bring-up', 'done')
    ),
  'ipad-constraint-probe': stepConstraintProbe,
  'ipad-paired': async (session, prompt) => {
    draftUpdatePaired(session, await runCaptureStep(session, prompt, sessionStep('ipad-paired')));
    console.log('\nThe paired controls are over. Stopping every server this session started:');
    stopOwned(session);
  },
  'ipad-commit-check': stepCommitCheck,
};

function printPlan() {
  const totals = sessionTotals();
  const idWidth = Math.max(...PERSON_SESSION_STEPS.map((step) => step.id.length));
  for (const step of PERSON_SESSION_STEPS) {
    console.log(
      `${`visit ${step.visit}`.padEnd(8)} ${step.id.padEnd(idWidth)} you ~${String(step.personMinutes).padStart(2)} min` +
        `${step.unattendedMinutes ? `, then ~${step.unattendedMinutes} min unattended` : ''}${step.optional ? ' (optional)' : ''}  ${step.title}`
    );
  }
  for (const [visit, total] of Object.entries(totals)) {
    console.log(
      `visit ${visit}: ~${total.personMinutes} min of your time, ~${total.unattendedMinutes} min running on its own`
    );
  }
}

export async function runPersonSession() {
  if (process.argv.includes('--plan')) return printPlan();
  if (argFlag('check') === 'overlay') {
    const verdict = readOverlayVerdict(argFlag('android-serial') ?? connectedAndroidSerial());
    console.log(`${verdict.pass ? 'PASS' : 'FAIL'}  ${verdict.detail}`);
    if (!verdict.pass) process.exitCode = 1;
    return verdict;
  }
  const session = process.argv.includes('--new')
    ? createSession()
    : openSession(argFlag('session'));
  saveState(session);
  console.log(`Session ${relative(ROOT, session.dir)} — ${new Date().toLocaleString()}`);
  if (process.argv.includes('--teardown')) return stopOwned(session);
  const skip = argFlag('skip');
  if (skip) {
    sessionStep(skip);
    markStep(session, skip, 'skipped');
    console.log(`  recorded ${skip} as skipped`);
    return null;
  }
  const redo = argFlag('redo');
  if (redo) {
    sessionStep(redo);
    // A capture step keeps its PASS results and recaptures only the rest.
    markStep(session, redo, 'pending');
  }
  const prompt = createPrompt();
  try {
    const resumeAt = nextStep(statuses(session));
    const bringUp = resumeAt && resumeBringUp(resumeAt.id);
    if (bringUp) {
      console.log(`\nResuming visit ${resumeAt.visit} — re-proving the rig first (${bringUp}):`);
      await BRING_UPS[bringUp](session, prompt);
    }
    for (let step = nextStep(statuses(session)); step; step = nextStep(statuses(session))) {
      const problem = stepOrderProblem(step.id, statuses(session));
      if (problem) fail(problem);
      banner(step);
      markStep(session, step.id, 'running');
      await STEP_RUNNERS[step.id](session, prompt);
      if (session.state.steps[step.id]?.status === 'failed') {
        fail(`${step.id} did not pass — fix what it named, then rerun (it resumes here)`);
      }
      if (session.state.steps[step.id]?.status === 'running') markStep(session, step.id, 'done');
      if (step.id === 'phone-overlay')
        console.log(
          '\nYou can leave now. The phone A/B and the iPad sweeps run on their own (~80 min).'
        );
      if (step.id === 'ipad-secure-actions') {
        console.log(
          '\nVisit 1 done. Come back for visit 2 (the iPadOS update) with: npm run perf:session:person'
        );
        return session;
      }
    }
  } finally {
    prompt.close();
  }
  console.log('\nAll steps are done or skipped. Drafts to review and post:');
  for (const path of Object.values(session.state.drafts ?? {}))
    console.log(`  ${relative(ROOT, path)}`);
  return session;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    await runPersonSession();
  });
}
