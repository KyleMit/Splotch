// Crash verdicts for one stress run: alive, crashed (with the report), or error-screened.
// Every probe reads only state created after the run's start; nothing here clears a log.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
// cpu_resource, diskwrites_resource and wakeups_resource reports record a limit the process
// crossed and kept running through: diagnostics, not crashes.
const RESOURCE_REPORT = /_resource-/;
const IPAD_REPORT_KINDS = /JetsamEvent|ExcResource|0x8badf00d|watchdog/i;
const IPAD_CRASH_LIST_DEPTH = '3';
// The collected window opens a little before the run so the launch that preceded it is included.
const LOG_COLLECT_LEAD_S = 2;
const CRASH_FRAMES_KEPT = 8;
const JS_ERRORS_KEPT = 50;
const ANDROID_LOG_LINES_KEPT = 200;
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
function ipsSignature(text) {
  const newline = text.indexOf('\n');
  try {
    const body = JSON.parse(text.slice(newline + 1));
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
    )
    .slice(0, ANDROID_LOG_LINES_KEPT);
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
  const fatal = log.filter((line) => ANDROID_FATAL.test(line));
  return {
    verdict: verdictOf(dropbox.length > 0 || fatal.length > 0 || !pid, errorScreen),
    pid,
    fatal,
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

export function ipadVerdict({ appState, newReports, source }) {
  const { reports, diagnostics } = classifyCrashReports(newReports);
  const errorScreen = errorScreenIn(source);
  return {
    verdict: verdictOf(reports.length > 0 || appState !== IOS_APP_RUNNING_FOREGROUND, errorScreen),
    appState,
    reports,
    diagnostics,
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
