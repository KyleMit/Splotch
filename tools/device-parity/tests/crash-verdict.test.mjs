import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IOS_APP_RUNNING_FOREGROUND } from '../lib/app-foreground.mjs';
import {
  androidVerdict,
  classifyCrashReports,
  ipadVerdict,
  logTimestamp,
} from '../lib/crash-verdict.mjs';

// Every adb call lands on this spy, so no test here reaches a device.
const { execFileSync } = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync, spawn: vi.fn() }));

const RESOURCE_REPORTS = [
  'HelloWorld.cpu_resource-2026-10-19-221530.ips',
  'HelloWorld.diskwrites_resource-2026-10-19-221531.ips',
  'HelloWorld.wakeups_resource-2026-10-19-221532.ips',
];
const CRASH_REPORTS = [
  'HelloWorld-2026-10-19-221533.ips',
  'JetsamEvent-2026-10-19-221534.ips',
  'ExcUserFault_HelloWorld-2026-10-19-221535.ips',
];

describe('classifyCrashReports', () => {
  it('files resource reports as diagnostics and every other report as a crash', () => {
    const { reports, diagnostics } = classifyCrashReports([...RESOURCE_REPORTS, ...CRASH_REPORTS]);

    expect(diagnostics).toEqual(RESOURCE_REPORTS);
    expect(reports).toEqual(CRASH_REPORTS);
  });
});

describe('ipadVerdict', () => {
  const alive = {
    appState: IOS_APP_RUNNING_FOREGROUND,
    source: '<XCUIElementTypeApplication/>',
    processName: 'HelloWorld',
    readReport: () => null,
  };

  it('keeps an app that only crossed a resource limit alive, with the report as a diagnostic', () => {
    const verdict = ipadVerdict({ ...alive, newReports: [RESOURCE_REPORTS[0]] });

    expect(verdict.verdict).toBe('alive');
    expect(verdict.diagnostics).toEqual([RESOURCE_REPORTS[0]]);
    expect(verdict.reports).toEqual([]);
  });

  it('calls a run with a crash report crashed even while the app is in front', () => {
    const verdict = ipadVerdict({ ...alive, newReports: [CRASH_REPORTS[0], RESOURCE_REPORTS[0]] });

    expect(verdict.verdict).toBe('crashed');
    expect(verdict.reports).toEqual([CRASH_REPORTS[0]]);
  });

  it('calls a run crashed when the app is no longer running in front', () => {
    expect(ipadVerdict({ ...alive, appState: 1, newReports: [] }).verdict).toBe('crashed');
  });

  it('calls an app showing its error screen error-screened', () => {
    const source = '<XCUIElementTypeStaticText name="Something went wrong."/>';

    expect(ipadVerdict({ ...alive, source, newReports: [] }).verdict).toBe('error-screened');
  });
});

describe('ipadVerdict on a JetsamEvent', () => {
  const JETSAM = 'JetsamEvent-2026-10-19-221534.ips';
  const header = JSON.stringify({ bug_type: '298', os_version: 'iPhone OS 26.0 (23A000)' });
  const jetsamReport = (processes) =>
    `${header}\n${JSON.stringify({ largestProcess: 'HelloWorld', processes }, null, 2)}`;
  const verdictFor = (text) =>
    ipadVerdict({
      appState: IOS_APP_RUNNING_FOREGROUND,
      source: '<XCUIElementTypeApplication/>',
      processName: 'HelloWorld',
      newReports: [JETSAM],
      readReport: (path) => (path === JETSAM ? text : null),
    });

  it.each([
    ['a reason', { reason: 'per-process-limit' }],
    ['the killed flag', { killed: true }],
  ])('calls a report whose target entry carries %s crashed', (_, kill) => {
    const verdict = verdictFor(
      jetsamReport([
        { name: 'HelloWorld', pid: 4321, states: ['frontmost'], ...kill },
        { name: 'mediaserverd', pid: 88, states: ['daemon'] },
      ])
    );

    expect(verdict.verdict).toBe('crashed');
    expect(verdict.reports).toEqual([JETSAM]);
    expect(verdict.diagnostics).toEqual([]);
  });

  it('keeps a report that killed only another process as a diagnostic', () => {
    const verdict = verdictFor(
      jetsamReport([
        { name: 'HelloWorld', pid: 4321, states: ['frontmost'] },
        { name: 'MobileSafari', pid: 555, states: ['suspended'], reason: 'per-process-limit' },
      ])
    );

    expect(verdict.verdict).toBe('alive');
    expect(verdict.reports).toEqual([]);
    expect(verdict.diagnostics).toEqual([JETSAM]);
    expect(verdict.jetsam).toEqual([
      { path: JETSAM, killed: [{ name: 'MobileSafari', reason: 'per-process-limit' }] },
    ]);
  });

  it('keeps a report it could not read as a diagnostic', () => {
    const verdict = verdictFor(null);

    expect(verdict.verdict).toBe('alive');
    expect(verdict.diagnostics).toEqual([JETSAM]);
    expect(verdict.jetsam).toEqual([{ path: JETSAM, killed: null }]);
  });
});

describe('androidVerdict', () => {
  const APP = 'art.example.under.test';
  const OTHER = 'com.example.other';
  const RESTARTED_PID = 2222;
  const CRASHED_PID = 1111;
  const OTHER_PID = 999;
  const CRASH_DUMP_PID = 777;
  const NOISE_LINES = 200;
  const LOG_LINES_REPORTED = 60;
  // ART names a process's main thread with the last 15 characters of a long package name.
  const THREAD_NAME_CHARS = 15;

  const logLine = (pid, level, tag, message) =>
    `10-19 22:15:30.123 ${String(pid).padStart(5)} ${String(pid).padStart(5)} ${level} ${tag.padEnd(8)}: ${message}`;
  const javaCrash = (pid, name) => [
    logLine(pid, 'E', 'AndroidRuntime', 'FATAL EXCEPTION: main'),
    logLine(pid, 'E', 'AndroidRuntime', `Process: ${name}, PID: ${pid}`),
    logLine(pid, 'E', 'AndroidRuntime', 'java.lang.IllegalStateException: boom'),
  ];
  const nativeCrash = (pid, name) => [
    logLine(
      pid,
      'F',
      'libc',
      `Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid ${pid + 1} ` +
        `(RenderThread), pid ${pid} (${name.slice(-THREAD_NAME_CHARS)})`
    ),
    logLine(CRASH_DUMP_PID, 'F', 'DEBUG', '*** *** *** *** *** *** *** *** *** *** *** ***'),
    logLine(
      CRASH_DUMP_PID,
      'F',
      'DEBUG',
      `pid: ${pid}, tid: ${pid + 1}, name: RenderThread  >>> ${name} <<<`
    ),
    logLine(CRASH_DUMP_PID, 'F', 'DEBUG', 'backtrace:'),
    logLine(CRASH_DUMP_PID, 'F', 'DEBUG', '      #00 pc 000000000004f2a8  /system/lib64/libc.so'),
  ];

  let device;
  beforeEach(() => {
    execFileSync.mockReset();
    execFileSync.mockImplementation((_, args) => {
      if (args.includes('pidof')) return `${device.pid}\n`;
      if (args.includes('logcat')) return device.log.join('\n');
      if (args.includes('meminfo')) return 'TOTAL PSS:   204800';
      return '';
    });
  });
  const verdictFor = (log) => {
    device = { pid: RESTARTED_PID, log };
    return androidVerdict({
      serial: 'emulator-0000',
      pkg: APP,
      startStamp: '10-19 22:15:00.000',
      sinceMs: 0,
      source: '',
    });
  };

  it('keeps another process’s uncaught exception out of the target’s verdict', () => {
    const verdict = verdictFor(javaCrash(OTHER_PID, OTHER));

    expect(verdict.verdict).toBe('alive');
    expect(verdict.fatal).toEqual([]);
    expect(verdict.otherProcessFatal).toEqual([javaCrash(OTHER_PID, OTHER)[0]]);
  });

  it('keeps another process’s native crash and tombstone out of the target’s verdict', () => {
    const verdict = verdictFor(nativeCrash(OTHER_PID, OTHER));

    expect(verdict.verdict).toBe('alive');
    expect(verdict.fatal).toEqual([]);
  });

  it('calls the target’s uncaught exception crashed after the app restarted', () => {
    const crash = javaCrash(CRASHED_PID, APP);

    const verdict = verdictFor([...javaCrash(OTHER_PID, OTHER), ...crash]);

    expect(verdict.verdict).toBe('crashed');
    expect(verdict.fatal).toEqual([crash[0]]);
  });

  it('attributes a fatal signal naming a truncated thread through the tombstone’s pid', () => {
    const crash = nativeCrash(CRASHED_PID, APP);

    const verdict = verdictFor(crash);

    expect(verdict.verdict).toBe('crashed');
    expect(verdict.fatal).toEqual([crash[0], crash[1], crash[3]]);
  });

  it('hands logcat the start stamp unquoted, in the MM-DD hh:mm:ss.mmm form its -T documents', () => {
    // `logcat --help` on platform-tools 37: -T '<time>' takes 'MM-DD hh:mm:ss.mmm…'; the quotes
    // there are the help text's shell quoting, which adb's argv never passes through.
    const LOGCAT_T_FORMAT = /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;

    verdictFor([]);

    const logcat = execFileSync.mock.calls.find(([, args]) => args.includes('logcat'));
    expect(logcat[1]).toEqual([
      '-s',
      'emulator-0000',
      'logcat',
      '-d',
      '-T',
      '10-19 22:15:00.000',
      '-b',
      'crash,main,system',
      '-v',
      'threadtime',
    ]);
    expect(logcat[1][logcat[1].indexOf('-T') + 1]).toMatch(LOGCAT_T_FORMAT);
  });

  it('classifies the whole log, so a fatal after 200 lines of recoverable errors still counts', () => {
    const noise = Array.from({ length: NOISE_LINES }, (_, i) =>
      logLine(RESTARTED_PID, 'E', 'ReactNativeJS', `Error: recoverable ${i}`)
    );

    const verdict = verdictFor([...noise, ...javaCrash(CRASHED_PID, APP)]);

    expect(verdict.verdict).toBe('crashed');
    expect(verdict.log).toHaveLength(LOG_LINES_REPORTED);
  });
});

describe('logTimestamp', () => {
  it('carries its zone, since `log show` reads a zone-less time as host-local', () => {
    expect(logTimestamp(Date.UTC(2026, 9, 19, 22, 15, 30))).toBe('2026-10-19 22:15:30+0000');
  });
});
