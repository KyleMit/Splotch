import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  describeGrantHistory,
  GRANT_LOG,
  GRANT_LOG_HEADER,
  grantLogDevice,
  grantLogSummary,
  isGrantDenial,
} from '../lib/grant-log.mjs';

const UDID = '00008103-0006202E3CF1001E';
const HOUR_MS = 3_600_000;

const DEVICE = grantLogDevice(UDID);
const row = (timestamp, outcome, detail = '') => ({ timestamp, device: DEVICE, outcome, detail });
const DENIAL_DETAIL =
  'the iPad is asking to enable UI automation. Look at the device: XCTest has put an ' +
  '"Enter iPad Passcode for XCTest / Enable UI Automation" prompt on screen.';

describe('isGrantDenial', () => {
  it('recognises the automation-grant denial and nothing else', () => {
    expect(isGrantDenial(row('t', 'blocked', DENIAL_DETAIL))).toBe(true);
    // A locked device or a failed WDA build says nothing about the grant.
    expect(isGrantDenial(row('t', 'blocked', 'the iPad is locked. Unlock it.'))).toBe(false);
    expect(isGrantDenial(row('t', 'blocked', 'xcodebuild failed with code 65'))).toBe(false);
    expect(isGrantDenial(row('t', 'ok', 'started and closed cleanly'))).toBe(false);
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
    expect(readFileSync(GRANT_LOG, 'utf8').split('\n')[0] + '\n').toBe(GRANT_LOG_HEADER);
    expect(describeGrantHistory(UDID)).not.toContain('no recorded launch');
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
