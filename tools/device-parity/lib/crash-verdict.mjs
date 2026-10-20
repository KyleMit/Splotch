// Crash verdicts for one stress run: alive, crashed (with the report), or error-screened.
// Every probe reads only state created after the run's start; nothing here clears a log.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { IOS_APP_RUNNING_FOREGROUND } from './app-foreground.mjs';
import { readAdb, readCommand } from './device-commands.mjs';

export const VERDICTS = ['alive', 'crashed', 'error-screened'];
const ERROR_SCREEN_TEXT = ['Oops!', 'Something went wrong.', 'Did not load'];
const DROPBOX_CRASH_TAGS = [
  'data_app_crash',
  'data_app_native_crash',
  'data_app_anr',
  'SYSTEM_TOMBSTONE',
];
const ANDROID_LOG_TAGS =
  /\b(AndroidRuntime|libc|DEBUG|ReactNativeJS|lowmemorykiller|ActivityManager)\b/;
const ANDROID_FATAL =
  /FATAL EXCEPTION|Fatal signal|\*\*\* \*\*\*|backtrace:|Process .* has died|lowmemorykiller.*kill/;
// `-v threadtime`: date, time, pid, tid, level, tag, message.
const THREADTIME_LINE = /^\d{2}-\d{2}\s+[\d:.]+\s+(\d+)\s+\d+\s+[A-Z]\s+([^\s:]+)\s*: ?(.*)$/;
// AndroidRuntime and libc report a crash from inside the crashing process, so the logging pid is
// the crashed one; crash_dump reports a tombstone (tag DEBUG) from its own pid.
const IN_PROCESS_CRASH_TAGS = new Set(['AndroidRuntime', 'libc']);
const MULTILINE_CRASH_TAGS = new Set(['AndroidRuntime', 'DEBUG']);
const CRASH_BLOCK_START = /FATAL EXCEPTION|\*\*\* \*\*\*/;
// ActivityManager's process start and death, AndroidRuntime's uncaught-exception header, libc's
// fatal signal, the tombstone header, and lmkd's kill: each names a process and its pid.
const PROCESS_MENTIONS = [
  /Start proc (?<pid>\d+):(?<name>[^/\s]+)\//,
  /Process (?<name>\S+) \(pid (?<pid>\d+)\) has died/,
  /Process: (?<name>[^,\s]+), PID: (?<pid>\d+)/,
  /, pid (?<pid>\d+) \((?<name>[^)]*)\)/,
  /pid: (?<pid>\d+), tid: \d+, name: .*>>> (?<name>\S+) <<</,
  /Kill(?:ing)? '(?<name>[^']+)' \((?<pid>\d+)\)/,
];
// cpu_resource, diskwrites_resource and wakeups_resource reports record a limit the process
// crossed and kept running through: diagnostics, not crashes.
const RESOURCE_REPORT = /_resource-/;
const IPAD_REPORT_KINDS = /JetsamEvent|ExcResource|0x8badf00d|watchdog/i;
const JETSAM_REPORT = /JetsamEvent/i;
const IPAD_CRASH_LIST_DEPTH = '3';
// The collected window opens a little before the run so the launch that preceded it is included.
const LOG_COLLECT_LEAD_S = 2;
const CRASH_FRAMES_KEPT = 8;
const JS_ERRORS_KEPT = 50;
const ANDROID_LOG_LINES_REPORTED = 60;
const DROPBOX_HEAD_CHARS = 1600;
const EXIT_RECORD_CHARS = 400;
const UNPARSED_REPORT_CHARS = 400;

function errorScreenIn(source) {
  return ERROR_SCREEN_TEXT.filter((text) => source.includes(text));
}

export function classifyCrashReports(paths) {
  return {
    reports: paths.filter((path) => !RESOURCE_REPORT.test(path)),
    diagnostics: paths.filter((path) => RESOURCE_REPORT.test(path)),
  };
}

function verdictOf(crashed, errorScreen) {
  if (crashed) return 'crashed';
  return errorScreen.length ? 'error-screened' : 'alive';
}

// `log show` reads a zone-less timestamp as host-local; this one carries its zone.
export function logTimestamp(ms) {
  return `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)}+0000`;
}

// ---------- iOS simulator ----------
export function simAppPid(udid, bundleId) {
  const out = readCommand('xcrun', ['simctl', 'spawn', udid, 'launchctl', 'list']);
  for (const line of out.split('\n')) {
    const [pid, status, label] = line.trim().split(/\s+/);
    if (label?.startsWith(`UIKitApplication:${bundleId}[`)) {
      return { pid: pid === '-' ? null : Number(pid), lastExit: status };
    }
  }
  return { pid: null, lastExit: null };
}

// Simulator apps are host processes, so their footprint reads straight from the host.
export function hostFootprintMb(pid) {
  if (!pid) return null;
  const out = readCommand('footprint', ['-p', String(pid)]);
  const match = out.match(/phys_footprint:\s*([\d.]+)\s*([KMG])B/);
  if (match) return Number(match[1]) * { K: 1 / 1024, M: 1, G: 1024 }[match[2]];
  return hostRssMb(pid);
}

export function hostRssMb(pid) {
  const rss = readCommand('ps', ['-o', 'rss=', '-p', String(pid)]).trim();
  return rss ? Number(rss) / 1024 : null;
}

// The .ips body is a JSON header line followed by one JSON document.
function ipsBody(text) {
  return JSON.parse(text.slice(text.indexOf('\n') + 1));
}

function ipsSignature(text) {
  try {
    const body = ipsBody(text);
    const exception = body.exception ?? {};
    const termination = body.termination ?? {};
    const thread = (body.threads ?? []).find((candidate) => candidate.triggered);
    const images = body.usedImages ?? [];
    const frames = (thread?.frames ?? []).slice(0, CRASH_FRAMES_KEPT).map((frame) => {
      const image = images[frame.imageIndex]?.name ?? '?';
      return frame.symbol ? `${image}:${frame.symbol}` : `${image}+${frame.imageOffset}`;
    });
    return {
      type: exception.type ?? null,
      signal: exception.signal ?? null,
      codes: exception.codes ?? null,
      termination: termination.indicator ?? termination.namespace ?? null,
      asi: body.asi ?? null,
      lastExceptionBacktrace: Boolean(body.lastExceptionBacktrace),
      frames,
    };
  } catch {
    return { unparsed: text.slice(0, UNPARSED_REPORT_CHARS) };
  }
}

function simCrashReportPaths(processName, sinceMs) {
  const dir = join(homedir(), 'Library/Logs/DiagnosticReports');
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(processName) && /\.(ips|crash)$/.test(name))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).mtimeMs >= sinceMs);
}

function simJsErrors(udid, processName, sinceMs) {
  const predicate =
    `process == "${processName}" AND (messageType == error OR messageType == fault) AND ` +
    '(category == "javascript" OR eventMessage CONTAINS "ReactNativeJS" OR ' +
    'eventMessage CONTAINS "Unhandled JS" OR eventMessage CONTAINS "RCTFatal")';
  const out = readCommand('xcrun', [
    'simctl',
    'spawn',
    udid,
    'log',
    'show',
    '--style',
    'compact',
    '--start',
    logTimestamp(sinceMs),
    '--predicate',
    predicate,
  ]);
  return out
    .split('\n')
    .filter((line) => /^\d{4}-/.test(line))
    .slice(0, JS_ERRORS_KEPT);
}

export function simVerdict({ udid, bundleId, processName, sinceMs, source }) {
  const { pid, lastExit } = simAppPid(udid, bundleId);
  const { reports, diagnostics } = classifyCrashReports(simCrashReportPaths(processName, sinceMs));
  const errorScreen = errorScreenIn(source);
  return {
    verdict: verdictOf(reports.length > 0 || !pid, errorScreen),
    pid,
    lastExit,
    reports: reports.map((path) => ({ path, signature: ipsSignature(readFileSync(path, 'utf8')) })),
    diagnostics,
    errorScreen,
    jsErrors: simJsErrors(udid, processName, sinceMs),
    footprintMb: hostFootprintMb(pid),
  };
}

// ---------- Android ----------
// Logcat's -T takes the device's own clock, so the start is read from the device.
export function androidNow(serial) {
  return readAdb(serial, 'shell', "date '+%m-%d %H:%M:%S.000'").trim();
}

function androidPid(serial, pkg) {
  const out = readAdb(serial, 'shell', 'pidof', pkg).trim();
  return out ? Number(out.split(/\s+/)[0]) : null;
}

function androidMeminfo(serial, pkg) {
  return readAdb(serial, 'shell', 'dumpsys', 'meminfo', pkg);
}

export function androidPssMb(serial, pkg) {
  const out = androidMeminfo(serial, pkg);
  const match = out.match(/TOTAL PSS:\s*(\d+)/) ?? out.match(/TOTAL\s+(\d+)/);
  return match ? Number(match[1]) / 1024 : null;
}

export function androidHeapMb(serial, pkg) {
  const out = androidMeminfo(serial, pkg);
  const kbToMb = (match) => (match ? Math.round(Number(match[1]) / 1024) : null);
  return {
    native: kbToMb(out.match(/Native Heap:\s+(\d+)/)),
    total: kbToMb(out.match(/TOTAL PSS:\s+(\d+)/)),
  };
}

function androidCrashLog(serial, startStamp, pkg) {
  const out = readAdb(
    serial,
    'logcat',
    '-d',
    '-T',
    `'${startStamp}'`,
    '-b',
    'crash,main,system',
    '-v',
    'threadtime'
  );
  return out
    .split('\n')
    .filter((line) => ANDROID_LOG_TAGS.test(line))
    .filter((line) => !/ActivityManager/.test(line) || line.includes(pkg))
    .filter((line) =>
      /ReactNativeJS/.test(line) ? /\bE\b|Error|Exception|Unhandled/.test(line) : true
    );
}

function parseLogcatLine(line) {
  const match = line.match(THREADTIME_LINE);
  if (!match) return { line, pid: null, tag: null, message: line };
  return { line, pid: Number(match[1]), tag: match[2], message: match[3] };
}

function processMentions(message) {
  return PROCESS_MENTIONS.flatMap((pattern) => {
    const groups = message.match(pattern)?.groups;
    return groups ? [{ name: groups.name, pid: Number(groups.pid) }] : [];
  });
}

const isPackageProcess = (name, pkg) => name === pkg || name.startsWith(`${pkg}:`);

// A crash block is one fatal line, or an uncaught exception or tombstone with the lines its pid
// logs under the same tag after it.
function crashBlocks(entries) {
  const blocks = [];
  const open = new Map();
  for (const entry of entries) {
    const key = `${entry.pid} ${entry.tag}`;
    const multiline = MULTILINE_CRASH_TAGS.has(entry.tag);
    if (multiline && open.has(key) && !CRASH_BLOCK_START.test(entry.message)) {
      open.get(key).push(entry);
    } else if (ANDROID_FATAL.test(entry.line)) {
      const block = [entry];
      blocks.push(block);
      if (multiline) open.set(key, block);
    }
  }
  return blocks;
}

// The target's pids are its current one plus every pid a line names alongside its package, so a
// crash of an instance that has since restarted is still the target's.
function isTargetBlock(block, pkg, targetPids) {
  const [head] = block;
  if (IN_PROCESS_CRASH_TAGS.has(head.tag) && targetPids.has(head.pid)) return true;
  return block.some((entry) =>
    processMentions(entry.message).some(
      (mention) => isPackageProcess(mention.name, pkg) || targetPids.has(mention.pid)
    )
  );
}

function androidFatalLines(log, { pkg, pid }) {
  const entries = log.map(parseLogcatLine);
  const targetPids = new Set(pid ? [pid] : []);
  for (const mention of entries.flatMap((entry) => processMentions(entry.message))) {
    if (isPackageProcess(mention.name, pkg)) targetPids.add(mention.pid);
  }
  const target = [];
  const other = [];
  for (const block of crashBlocks(entries)) {
    const lines = block.filter((entry) => ANDROID_FATAL.test(entry.line)).map(({ line }) => line);
    (isTargetBlock(block, pkg, targetPids) ? target : other).push(...lines);
  }
  return { target, other };
}

// `dumpsys dropbox --print` prints each entry with its wall-clock time; keep only entries after the
// start.
function androidDropbox(serial, sinceMs, pkg) {
  const entries = [];
  for (const tag of DROPBOX_CRASH_TAGS) {
    const out = readAdb(serial, 'shell', 'dumpsys', 'dropbox', '--print', tag);
    for (const block of out.split(/\n(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/)) {
      const stamp = block.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      if (!stamp) continue;
      const at = new Date(stamp[1].replace(' ', 'T')).getTime();
      if (Number.isNaN(at) || at < sinceMs || !block.includes(pkg)) continue;
      entries.push({ tag, at: stamp[1], head: block.slice(0, DROPBOX_HEAD_CHARS) });
    }
  }
  return entries;
}

export function androidVerdict({ serial, pkg, startStamp, sinceMs, source }) {
  const pid = androidPid(serial, pkg);
  const log = androidCrashLog(serial, startStamp, pkg);
  const dropbox = androidDropbox(serial, sinceMs, pkg);
  const errorScreen = errorScreenIn(source);
  const fatal = androidFatalLines(log, { pkg, pid });
  return {
    verdict: verdictOf(dropbox.length > 0 || fatal.target.length > 0 || !pid, errorScreen),
    pid,
    fatal: fatal.target.slice(0, ANDROID_LOG_LINES_REPORTED),
    otherProcessFatal: fatal.other.slice(0, ANDROID_LOG_LINES_REPORTED),
    dropbox,
    errorScreen,
    log: log.slice(0, ANDROID_LOG_LINES_REPORTED),
    pssMb: pid ? androidPssMb(serial, pkg) : null,
  };
}

// ---------- Physical iPad (read after the run; a live stream perturbs the device) ----------
export function ipadCrashList(udid) {
  return readCommand('pymobiledevice3', [
    'crash',
    'ls',
    '--udid',
    udid,
    '-d',
    IPAD_CRASH_LIST_DEPTH,
  ])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ipadNewReports(udid, before, processName) {
  const known = new Set(before);
  return ipadCrashList(udid).filter(
    (path) => !known.has(path) && (path.includes(processName) || IPAD_REPORT_KINDS.test(path))
  );
}

// Pulls one report into a scratch directory and returns its text, or null when it cannot be read.
export function ipadReportText(udid, path) {
  const dir = mkdtempSync(join(tmpdir(), 'device-parity-report-'));
  try {
    readCommand('pymobiledevice3', ['crash', 'pull', '--udid', udid, '--remote-file', path, dir]);
    return readFileSync(join(dir, basename(path)), 'utf8');
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A JetsamEvent report lists every process memory pressure touched, whichever app was in front;
// only the entries the kernel terminated carry a `reason` (per-process-limit, vm-pageshortage, …).
// Null when the report is not a readable one.
function jetsamKills(text) {
  let body;
  try {
    body = ipsBody(text ?? '');
  } catch {
    return null;
  }
  if (!Array.isArray(body?.processes)) return null;
  return body.processes
    .filter((entry) => entry.killed === true || (typeof entry.reason === 'string' && entry.reason))
    .map((entry) => ({ name: entry.name ?? null, reason: entry.reason ?? 'killed' }));
}

// A JetsamEvent is the target's crash only when it killed the target; any other is a diagnostic.
function attributeJetsam(candidates, { processName, readReport }) {
  const jetsam = candidates
    .filter((path) => JETSAM_REPORT.test(path))
    .map((path) => ({ path, killed: jetsamKills(readReport(path)) }));
  const killedTarget = new Set(
    jetsam
      .filter(({ killed }) => killed?.some((kill) => kill.name === processName))
      .map(({ path }) => path)
  );
  return {
    reports: candidates.filter((path) => !JETSAM_REPORT.test(path) || killedTarget.has(path)),
    unrelated: jetsam.map(({ path }) => path).filter((path) => !killedTarget.has(path)),
    jetsam,
  };
}

export function ipadVerdict({ appState, newReports, source, processName, readReport }) {
  const classified = classifyCrashReports(newReports);
  const { reports, unrelated, jetsam } = attributeJetsam(classified.reports, {
    processName,
    readReport,
  });
  const errorScreen = errorScreenIn(source);
  return {
    verdict: verdictOf(reports.length > 0 || appState !== IOS_APP_RUNNING_FOREGROUND, errorScreen),
    appState,
    reports,
    diagnostics: [...classified.diagnostics, ...unrelated],
    jetsam,
    errorScreen,
  };
}

// Collects the unified log for the run's window into an archive, then reads launchd's and
// SpringBoard's exit records for the app out of it.
export function ipadExitRecords({ udid, bundleId, archive, startMs, endMs }) {
  readCommand('pymobiledevice3', [
    'syslog',
    'collect',
    '--udid',
    udid,
    '--start-time',
    String(Math.floor(startMs / 1000) - LOG_COLLECT_LEAD_S),
    archive,
  ]);
  const out = readCommand('/usr/bin/log', [
    'show',
    '--archive',
    archive,
    '--style',
    'compact',
    '--start',
    logTimestamp(startMs),
    '--end',
    logTimestamp(endMs),
    '--predicate',
    'process == "launchd" OR process == "SpringBoard"',
  ]);
  return out
    .split('\n')
    .filter(
      (line) =>
        line.includes(bundleId) && /exited (with exit reason|due to)|Process exited:/.test(line)
    )
    .map((line) => line.replace(/attrs:\[.*$/, '').slice(0, EXIT_RECORD_CHARS));
}
