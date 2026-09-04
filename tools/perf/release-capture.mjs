// Release the physical-device capture rig: stop every capture-rig process a
// checkout of this repo owns, drop the adb forwards those captures left behind,
// and put the phone back the way a session found it.
//
//   npm run perf:release                       stop owned rig processes, drop rig forwards, reset the phone
//   npm run perf:release -- --dry-run          inventory and verdicts only, nothing stopped
//   npm run perf:release -- --host-only        stop host processes but leave the phone's state alone
//   npm run perf:release -- --stop-campaigns   also stop a live campaign or operator driver
//   npm run perf:release -- --json             machine-readable report
//   npm run perf:release -- --android-serial=  pick the phone when more than one is attached
//
// The mirror image of perf:preflight. The preflight resolves ports *around*
// foreign listeners and never stops one; this stops listeners — and the
// concurrent-worktree rule still holds, so the only thing it ever signals is a
// process whose working directory (or command line) places it inside a checkout
// of this repo: the main checkout, any registered worktree, or a pruned worktree
// whose process outlived its directory. Unknown ownership is foreign ownership:
// an unreadable cwd, a listener from some other project, and the root-owned
// RemoteXPC tunnel are all reported and left running.
//
// A live campaign or operator session is refused rather than stopped, because
// killing one mid-cell corrupts what it was banking; --stop-campaigns is the
// explicit override.
//
// Appium is drained before it is signalled: each WebDriverAgent session is
// DELETEd so WDA exits on the iPad. Killing the forward under a live session
// once stranded a WebDriverAgent process on the device, and the next launch
// failed with an error that named neither the port nor the stale process.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { argFlag, isMain, ROOT, runMain, sleep } from '../lib/proc.mjs';
import { rethrowIfBroken } from './lib/error-classification.mjs';
import { PORT_ROLES } from './lib/capture-readiness.mjs';

// The phone's stock screen timeout. perf:preflight --wake-android sets 30 minutes
// and never records what it replaced, so release restores the stock value rather
// than an original nothing wrote down.
export const ANDROID_RELEASED_SCREEN_OFF_TIMEOUT_MS = 30_000;

// Long enough for a WebDriverAgent session to tear down on the iPad; a DELETE
// that outlives this is abandoned and the server is signalled anyway.
const APPIUM_SESSION_DELETE_TIMEOUT_MS = 20_000;
const APPIUM_PROBE_TIMEOUT_MS = 2_000;
const TERM_GRACE_MS = 3_000;
const KILL_GRACE_MS = 2_000;
const RECHECK_INTERVAL_MS = 100;

// Where each runner keeps the worktrees it manages under the main checkout. A
// worktree that was pruned while its preview kept serving is no longer in
// `git worktree list`, but its cwd is still under one of these.
const WORKTREE_CONTAINERS = ['.claude/worktrees', '.codex/worktrees'];

const RIG_SCRIPT_PATTERNS = [
  /prepare-capture\.mjs/,
  /run-campaign\.mjs/,
  /run-operator-session\.mjs/,
  /serve-profile-build\.mjs/,
  /serve-probe-host\.mjs/,
  /run-web-tool\.mjs vite preview/,
  /(^|[\s/])appium(\s|$)/,
  /xcodebuild .*WebDriverAgent/,
  /ios_webkit_debug_proxy/,
  /tunnel-creation\.mjs/,
];

const CAMPAIGN_DRIVER_PATTERN = /run-campaign\.mjs|run-operator-session\.mjs/;
const TUNNEL_PATTERN = /tunnel-creation\.mjs/;
// The server binary, not everything installed under ~/.appium: the
// WebDriverAgent xcodebuild Appium spawns carries that path too, and it
// belongs with the servers, not with the sessions to drain.
const APPIUM_PATTERN = /(^|[\s/])appium(\s|$)/;
// The forwards this rig opens all point at a Chrome or WebView devtools socket;
// that identity, not a port list, is what marks a forward as capture debris.
const DEVTOOLS_FORWARD_PATTERN = /^localabstract:(chrome_devtools_remote|webview_devtools_remote)/;

export function rigPorts(roles = PORT_ROLES) {
  return Object.entries(roles).flatMap(([role, spec]) =>
    [spec.port, ...spec.shiftTo].map((port) => ({ role, port }))
  );
}

function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

const within = (path, root) => path === root || path.startsWith(`${root}/`);

// Ownership is placement inside a checkout of this repo — by cwd first, and by
// an absolute path on the command line when the cwd says nothing (Appium and
// the inspector proxy are spawned with the checkout as cwd, but a launcher can
// have chdir'd elsewhere).
export function classifyProcess({ cwd, command }, { checkoutRoots, containerRoots }) {
  if (TUNNEL_PATTERN.test(command)) {
    return { verdict: 'tunnel', reason: 'root-owned RemoteXPC tunnel — left up' };
  }
  const roots = [...checkoutRoots, ...containerRoots];
  const owningRoot =
    roots.find((root) => cwd && within(cwd, root)) ??
    roots.find((root) => command.includes(`${root}/`));
  if (!owningRoot) {
    return {
      verdict: 'foreign',
      reason: cwd ? `cwd ${cwd} is outside every checkout of this repo` : 'cwd unreadable',
    };
  }
  if (CAMPAIGN_DRIVER_PATTERN.test(command)) {
    return { verdict: 'campaign', reason: `live capture driver in ${owningRoot}` };
  }
  return { verdict: 'ours', reason: `checkout ${owningRoot}` };
}

// Drivers first so nothing re-asserts or respawns what is being stopped, Appium
// next so its sessions drain before the servers they talk to disappear.
export function planRelease(processes, { stopCampaigns = false } = {}) {
  const stop = (verdict) => processes.filter((entry) => entry.verdict === verdict);
  const campaigns = stop('campaign');
  const ours = stop('ours');
  return {
    blocked: stopCampaigns ? [] : campaigns,
    drivers: [
      ...(stopCampaigns ? campaigns : []),
      ...ours.filter((entry) => /prepare-capture\.mjs/.test(entry.command)),
    ],
    appium: ours.filter((entry) => APPIUM_PATTERN.test(entry.command)),
    servers: ours.filter(
      (entry) => !/prepare-capture\.mjs/.test(entry.command) && !APPIUM_PATTERN.test(entry.command)
    ),
    leave: [...stop('foreign'), ...stop('tunnel')],
  };
}

export function parseAdbForwards(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, local, remote] = line.split(/\s+/);
      return { serial, local, remote };
    });
}

export const isRigForward = ({ remote }) => DEVTOOLS_FORWARD_PATTERN.test(remote ?? '');

const sh = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  return {
    ok: result.status === 0 && !result.error,
    out: (result.stdout ?? '').trim(),
    err: result.error ? result.error.message : (result.stderr ?? '').trim(),
  };
};

function listenerPids(port) {
  return sh('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
    .out.split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function workingDirectory(pid) {
  const line = sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    .out.split('\n')
    .find((entry) => entry.startsWith('n'));
  return line ? realPath(line.slice(1)) : null;
}

function commandLine(pid) {
  return sh('ps', ['-o', 'command=', '-p', String(pid)]).out;
}

function allProcesses() {
  return sh('ps', ['-axo', 'pid=,command='])
    .out.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, ...rest] = line.split(/\s+/);
      return { pid: Number(pid), command: rest.join(' ') };
    });
}

function checkoutRoots() {
  const roots = sh('git', ['worktree', 'list', '--porcelain'])
    .out.split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => realPath(line.slice('worktree '.length)));
  return roots.length ? roots : [realPath(ROOT)];
}

function containerRoots() {
  const commonDir = sh('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).out;
  const mainRoot = realPath(dirname(commonDir || join(ROOT, '.git')));
  return WORKTREE_CONTAINERS.map((container) => join(mainRoot, container));
}

// Every listener on a rig port, plus every portless rig process (the hold-awake
// watcher, a campaign driver, an inspector proxy whose port moved), each with the
// facts the verdict needs. This process and the npm that launched it are not
// part of the rig.
export function collectInventory({
  roots = { checkoutRoots: checkoutRoots(), containerRoots: containerRoots() },
} = {}) {
  const own = new Set([process.pid, process.ppid]);
  const byPid = new Map();
  const record = (pid, extra) => {
    if (own.has(pid)) return;
    const existing = byPid.get(pid);
    if (existing) {
      if (extra.port && !existing.ports.includes(extra.port)) existing.ports.push(extra.port);
      if (extra.role && !existing.roles.includes(extra.role)) existing.roles.push(extra.role);
      return;
    }
    const cwd = workingDirectory(pid);
    const command = extra.command ?? commandLine(pid);
    byPid.set(pid, {
      pid,
      cwd,
      command,
      ports: extra.port ? [extra.port] : [],
      roles: extra.role ? [extra.role] : [],
      ...classifyProcess({ cwd, command }, roots),
    });
  };
  for (const { role, port } of rigPorts()) {
    for (const pid of listenerPids(port)) record(pid, { role, port });
  }
  for (const { pid, command } of allProcesses()) {
    if (RIG_SCRIPT_PATTERNS.some((pattern) => pattern.test(command))) record(pid, { command });
  }
  return [...byPid.values()].sort((a, b) => a.pid - b.pid);
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function signalGroup(pid, signal) {
  // Every rig server is spawned into its own process group so the vite
  // grandchild goes with the wrapper; a plain kill is the fallback for the
  // ones that were not.
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (alive(pid) && Date.now() < deadline) await sleep(RECHECK_INTERVAL_MS);
  return !alive(pid);
}

async function stopProcess(entry) {
  signalGroup(entry.pid, 'SIGTERM');
  if (await waitForExit(entry.pid, TERM_GRACE_MS)) return { ...entry, outcome: 'stopped' };
  signalGroup(entry.pid, 'SIGKILL');
  if (await waitForExit(entry.pid, KILL_GRACE_MS)) return { ...entry, outcome: 'killed' };
  return { ...entry, outcome: 'survived' };
}

async function drainAppiumSessions(port) {
  const base = `http://127.0.0.1:${port}`;
  const get = async (path, timeout) => {
    try {
      const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeout) });
      return response.ok ? await response.json().catch(() => null) : null;
    } catch (error) {
      rethrowIfBroken(error);
      return null;
    }
  };
  const sessions = (await get('/appium/sessions', APPIUM_PROBE_TIMEOUT_MS))?.value ?? [];
  const drained = [];
  for (const { id } of sessions) {
    try {
      await fetch(`${base}/session/${id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(APPIUM_SESSION_DELETE_TIMEOUT_MS),
      });
      drained.push({ id, outcome: 'deleted' });
    } catch (error) {
      rethrowIfBroken(error);
      drained.push({ id, outcome: 'delete timed out or refused' });
    }
  }
  return drained;
}

function androidSerial() {
  const explicit = argFlag('android-serial', null);
  if (explicit) return explicit;
  const attached = sh('adb', ['devices'])
    .out.split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
  return attached[0] ?? null;
}

function releaseForwards(serial, { dryRun }) {
  const forwards = parseAdbForwards(sh('adb', ['forward', '--list']).out);
  return forwards.map((forward) => {
    if (!isRigForward(forward)) return { ...forward, outcome: 'left (not a devtools forward)' };
    if (dryRun) return { ...forward, outcome: 'would remove' };
    const removed = sh('adb', [
      '-s',
      forward.serial ?? serial,
      'forward',
      '--remove',
      forward.local,
    ]);
    return { ...forward, outcome: removed.ok ? 'removed' : `remove failed: ${removed.err}` };
  });
}

// The writes perf:preflight --wake-android and --hold-android-awake make, undone,
// plus the rotation pair a crashed input check can leave pinned to landscape.
function androidResetCommands() {
  return [
    ['svc', 'power', 'stayon', 'false'],
    [
      'settings',
      'put',
      'system',
      'screen_off_timeout',
      String(ANDROID_RELEASED_SCREEN_OFF_TIMEOUT_MS),
    ],
    ['dumpsys', 'battery', 'reset'],
    ['settings', 'put', 'system', 'accelerometer_rotation', '1'],
    ['settings', 'put', 'system', 'user_rotation', '0'],
  ];
}

function resetAndroid(serial, { dryRun }) {
  return androidResetCommands().map((command) => {
    const label = command.join(' ');
    if (dryRun) return { command: label, outcome: 'would run' };
    const result = sh('adb', ['-s', serial, 'shell', ...command]);
    return { command: label, outcome: result.ok ? 'ok' : `failed: ${result.err || result.out}` };
  });
}

const describe = (entry) =>
  `pid ${entry.pid}${entry.ports.length ? ` :${entry.ports.join(',:')}` : ''} ${entry.command.slice(0, 90)}`;

function printReport(report) {
  console.log('capture rig inventory');
  for (const entry of report.inventory) {
    console.log(`  [${entry.verdict.padEnd(8)}] ${describe(entry)}\n             ${entry.reason}`);
  }
  if (!report.inventory.length) console.log('  nothing on any rig port and no rig process running');
  if (report.blocked.length) {
    console.log('\nBLOCKED — a capture driver is live; pass --stop-campaigns to stop it as well:');
    for (const entry of report.blocked) console.log(`  ${describe(entry)}`);
  }
  if (report.appiumSessions.length) {
    console.log('\nappium sessions drained');
    for (const { port, sessions } of report.appiumSessions) {
      for (const session of sessions) console.log(`  :${port} ${session.id} — ${session.outcome}`);
    }
  }
  if (report.stopped.length) {
    console.log(`\nprocesses ${report.dryRun ? 'that would be stopped' : 'stopped'}`);
    for (const entry of report.stopped)
      console.log(`  ${entry.outcome.padEnd(9)} ${describe(entry)}`);
  }
  if (report.forwards.length) {
    console.log('\nadb forwards');
    for (const f of report.forwards)
      console.log(`  ${f.serial} ${f.local} -> ${f.remote}: ${f.outcome}`);
  }
  if (report.android) {
    console.log(`\nandroid ${report.android.serial}`);
    for (const step of report.android.steps)
      console.log(`  ${step.outcome.padEnd(9)} ${step.command}`);
  } else if (!report.hostOnly) {
    console.log('\nandroid: no attached device — nothing to reset');
  }
  if (report.tunnel) {
    console.log(
      '\nthe RemoteXPC tunnel is root-owned and left running. To stop it (asks for a password):\n' +
        `  sudo pkill -f tunnel-creation.mjs`
    );
  }
  if (report.survivors.length) {
    console.log('\nSTILL RUNNING after SIGKILL:');
    for (const entry of report.survivors) console.log(`  ${describe(entry)}`);
  }
}

export async function releaseCapture({
  dryRun = false,
  hostOnly = false,
  stopCampaigns = false,
} = {}) {
  const inventory = collectInventory();
  const plan = planRelease(inventory, { stopCampaigns });
  const report = {
    dryRun,
    hostOnly,
    inventory,
    blocked: plan.blocked,
    appiumSessions: [],
    stopped: [],
    survivors: [],
    forwards: [],
    android: null,
    tunnel: inventory.some((entry) => entry.verdict === 'tunnel'),
  };
  if (plan.blocked.length) return report;

  const stopAll = async (entries) => {
    for (const entry of entries) {
      report.stopped.push(dryRun ? { ...entry, outcome: 'would stop' } : await stopProcess(entry));
    }
  };
  await stopAll(plan.drivers);
  for (const entry of plan.appium) {
    for (const port of entry.ports) {
      if (!dryRun) report.appiumSessions.push({ port, sessions: await drainAppiumSessions(port) });
    }
  }
  await stopAll(plan.appium);
  await stopAll(plan.servers);
  report.survivors = report.stopped.filter((entry) => entry.outcome === 'survived');

  const serial = androidSerial();
  if (serial) {
    report.forwards = releaseForwards(serial, { dryRun });
    if (!hostOnly) report.android = { serial, steps: resetAndroid(serial, { dryRun }) };
  }
  return report;
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const argv = process.argv.slice(2);
    const report = await releaseCapture({
      dryRun: argv.includes('--dry-run'),
      hostOnly: argv.includes('--host-only'),
      stopCampaigns: argv.includes('--stop-campaigns'),
    });
    if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    if (report.blocked.length || report.survivors.length) process.exit(1);
  });
}
