import { describe, expect, it } from 'vitest';
import { IOS_APP_RUNNING_FOREGROUND } from '../lib/app-foreground.mjs';
import { classifyCrashReports, ipadVerdict, logTimestamp } from '../lib/crash-verdict.mjs';

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
  const alive = { appState: IOS_APP_RUNNING_FOREGROUND, source: '<XCUIElementTypeApplication/>' };

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

describe('logTimestamp', () => {
  it('carries its zone, since `log show` reads a zone-less time as host-local', () => {
    expect(logTimestamp(Date.UTC(2026, 9, 19, 22, 15, 30))).toBe('2026-10-19 22:15:30+0000');
  });
});
