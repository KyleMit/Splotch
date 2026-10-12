import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTOMATION_MODE_TIMEOUT_PATTERN, classifyAppiumLog } from '../lib/capture-readiness.mjs';
import {
  describeGrantHistory,
  GRANT_LOG,
  GRANT_LOG_HEADER,
  grantLogDevice,
  grantLogSummary,
  isGrantDenial,
  readGrantLog,
  recordGrantAttempt,
  REDACTED_UDID,
} from '../lib/grant-log.mjs';

const UDID = '00008103-DEADBEEFDEADBEEF';
const HOUR_MS = 3_600_000;

const DEVICE = grantLogDevice(UDID);
const row = (timestamp, outcome, detail = '') => ({ timestamp, device: DEVICE, outcome, detail });
const AUTOMATION_TIMEOUT = 'Timed out while enabling automation mode';
// What the preflight records for an expired grant: the cause it classifies out
// of the Appium server log.
const DENIAL_DETAIL = classifyAppiumLog(`[XCUITest] Error: ${AUTOMATION_TIMEOUT}`);
// The same cause in the wording the log's earliest denial rows carry.
const LEGACY_DENIAL_DETAIL =
  'the iPad is asking to enable UI automation. Look at the device: XCTest has put an ' +
  '"Enter iPad Passcode for XCTest / Enable UI Automation" prompt on screen.';
// XCTest's own line, as a hand-recorded row carries it.
const RAW_DENIAL_DETAIL =
  `XCTest: ${AUTOMATION_TIMEOUT} (direct xcodebuild WebDriverAgent launch outside the ` +
  'preflight; Appium real-device discovery was stale)';

describe('isGrantDenial', () => {
  it('counts the automation-grant denial in every wording the log holds', () => {
    expect(DENIAL_DETAIL).not.toBeNull();
    for (const detail of [
      DENIAL_DETAIL,
      LEGACY_DENIAL_DETAIL,
      RAW_DENIAL_DETAIL,
      AUTOMATION_TIMEOUT,
    ]) {
      expect(isGrantDenial(row('t', 'blocked', detail)), detail).toBe(true);
    }
  });

  it('counts nothing that says nothing about the grant', () => {
    expect(isGrantDenial(row('t', 'blocked', 'the iPad is locked. Unlock it.'))).toBe(false);
    expect(isGrantDenial(row('t', 'blocked', 'xcodebuild failed with code 65'))).toBe(false);
    const staleDiscovery = `Unknown device or simulator UDID: '${REDACTED_UDID}'`;
    expect(isGrantDenial(row('t', 'blocked', staleDiscovery))).toBe(false);
    // An ok launch proved the grant, whatever its detail recounts.
    expect(isGrantDenial(row('t', 'ok', RAW_DENIAL_DETAIL))).toBe(false);
  });

  it('counts every automation-mode timeout in the committed log', () => {
    const timeouts = readGrantLog().filter(
      (entry) => entry.outcome !== 'ok' && AUTOMATION_MODE_TIMEOUT_PATTERN.test(entry.detail)
    );
    const uncounted = timeouts.filter((entry) => !isGrantDenial(entry));

    expect(timeouts.length).toBeGreaterThan(0);
    expect(uncounted.map((entry) => entry.timestamp)).toEqual([]);
  });
});

describe('grantLogSummary', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');

  it('reports the age of the last good grant', () => {
    const summary = grantLogSummary(
      [row('2026-08-26T09:00:00.000Z', 'ok'), row('2026-08-26T10:00:00.000Z', 'ok')],
      { device: DEVICE, now }
    );
    expect(summary.attempts).toBe(2);
    expect(summary.lastOkAgeMs).toBe(2 * HOUR_MS);
    // No denial on record: the lifetime stays unmeasured rather than guessed.
    expect(summary.shortestOkToDeniedMs).toBeNull();
  });

  it('bounds the grant lifetime by the tightest ok-then-denial pair', () => {
    const summary = grantLogSummary(
      [
        row('2026-08-24T00:00:00.000Z', 'ok'),
        row('2026-08-25T00:00:00.000Z', 'blocked', DENIAL_DETAIL),
        row('2026-08-25T01:00:00.000Z', 'ok'),
        row('2026-08-25T07:00:00.000Z', 'blocked', DENIAL_DETAIL),
      ],
      { device: DEVICE, now }
    );
    expect(summary.shortestOkToDeniedMs).toBe(6 * HOUR_MS);
  });

  it('ignores rows for other devices and unparseable timestamps', () => {
    const summary = grantLogSummary(
      [
        { timestamp: '2026-08-26T09:00:00.000Z', device: 'other', outcome: 'ok', detail: '' },
        { timestamp: 'not-a-date', device: DEVICE, outcome: 'ok', detail: '' },
      ],
      { device: DEVICE, now }
    );
    expect(summary.attempts).toBe(0);
    expect(summary.lastOkAgeMs).toBeNull();
  });
});

describe('describeGrantHistory', () => {
  const now = Date.parse('2026-08-26T12:00:00.000Z');

  it('says the log is empty rather than inventing history', () => {
    expect(describeGrantHistory(UDID, { entries: [], now })).toContain('no recorded launch');
  });

  it('names the last-ok age and the measured lifetime bound', () => {
    const text = describeGrantHistory(UDID, {
      entries: [
        row('2026-08-25T01:00:00.000Z', 'ok'),
        row('2026-08-25T07:00:00.000Z', 'blocked', DENIAL_DETAIL),
        row('2026-08-26T10:00:00.000Z', 'ok'),
      ],
      now,
    });
    expect(text).toContain('last successful launch 2h ago');
    expect(text).toContain('lifetime under 6h');
  });
});

describe('grant log schema', () => {
  it('uses a stable per-device pseudonym and keeps the committed header aligned with the writer', () => {
    expect(grantLogDevice(UDID)).toBe(DEVICE);
    expect(grantLogDevice('another-device')).not.toBe(DEVICE);
    const committed = readFileSync(GRANT_LOG, 'utf8').split('\n');
    expect(committed[0] + '\n').toBe(GRANT_LOG_HEADER);
    // The committed log carries pseudonyms only — a raw UDID row would defeat
    // the identifier scrub (issue #1645) and fail check-device-identifiers.
    for (const line of committed.slice(1).filter(Boolean)) {
      expect(line.split('\t')[1]).toMatch(/^device-[0-9a-f]{12}$/);
      expect(line.split('\t')[3]).not.toMatch(/\b[0-9A-F]{8}-[0-9A-F]{16}\b/i);
    }
  });

  it('redacts the hardware UDID from the detail Appium quotes it in', () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-grant-log-'));
    const logPath = join(directory, 'ipad-grant-log.tsv');
    try {
      recordGrantAttempt(UDID, 'blocked', `Unknown device or simulator UDID: '${UDID}'`, {
        logPath,
      });
      const [, line] = readFileSync(logPath, 'utf8').split('\n');
      expect(line).not.toContain(UDID);
      expect(line.split('\t')[3]).toBe(`Unknown device or simulator UDID: '${REDACTED_UDID}'`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('migrates legacy raw-UDID rows while reading an existing log', () => {
    const directory = mkdtempSync(join(tmpdir(), 'splotch-grant-log-'));
    const logPath = join(directory, 'ipad-grant-log.tsv');
    writeFileSync(
      logPath,
      [
        'timestamp\tudid\toutcome\tdetail',
        `2026-08-25T01:00:00.000Z\t${UDID}\tok\tstarted and closed cleanly`,
        `2026-08-25T07:00:00.000Z\t${UDID}\tblocked\t${DENIAL_DETAIL}`,
        '',
      ].join('\n')
    );

    try {
      const text = describeGrantHistory(UDID, {
        logPath,
        now: Date.parse('2026-08-26T12:00:00.000Z'),
      });
      expect(text).toContain('last successful launch 35h ago');
      expect(text).toContain('lifetime under 6h');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
