import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ledgerKey,
  ledgerPath,
  MAX_ROUNDS,
  planRound,
  readLedgerRecord,
  recordRound,
  removeLedgerRecord,
} from '../ledger.mjs';

const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let directory;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'rival-ledger-test-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('ledger', () => {
  it('keys one reviewer per checkout, scope kind, and ref', () => {
    const pr = ledgerKey({ repoRoot: '/r', kind: 'pr', ref: '7' });
    expect(pr).toHaveLength(32);
    expect(pr).not.toBe(ledgerKey({ repoRoot: '/r', kind: 'pr', ref: '8' }));
    expect(pr).not.toBe(ledgerKey({ repoRoot: '/r', kind: 'branch', ref: '7' }));
  });

  it('starts fresh without a record, resumes with one, and stops at the cap', () => {
    const path = ledgerPath('k', directory);
    expect(planRound(undefined)).toEqual({ round: 1, resume: undefined, previous: undefined });
    recordRound(path, {
      record: undefined,
      rivalSessionId: SESSION_ID,
      base: 'b',
      head: 'h',
      rival: 'codex',
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const record = readLedgerRecord(path);
    expect(record).toMatchObject({ rivalSessionId: SESSION_ID, rounds: 1, lastHead: 'h' });
    expect(planRound(record)).toMatchObject({ round: 2, resume: SESSION_ID, previous: record });
    expect(planRound(record, { fresh: true })).toMatchObject({ round: 1, resume: undefined });
    expect(planRound(record, { rival: 'codex' })).toMatchObject({ round: 2, resume: SESSION_ID });
    expect(planRound(record, { rival: 'claude' })).toMatchObject({ round: 1, resume: undefined });

    let current = record;
    for (let round = 2; round <= MAX_ROUNDS; round += 1) {
      recordRound(path, {
        record: current,
        rivalSessionId: 'ignored',
        base: 'b',
        head: `h${round}`,
        rival: 'codex',
      });
      current = readLedgerRecord(path);
      expect(current).toMatchObject({ rounds: round, rivalSessionId: SESSION_ID });
    }
    expect(() => planRound(current)).toThrow(/budget of 3 exhausted/);
  });

  it('discards a corrupt or foreign record instead of following it', () => {
    const path = ledgerPath('k', directory);
    writeFileSync(path, '{not json');
    expect(readLedgerRecord(path)).toBeUndefined();
    writeFileSync(path, JSON.stringify({ rivalSessionId: '../../etc', rounds: 1 }));
    expect(readLedgerRecord(path)).toBeUndefined();
    writeFileSync(path, JSON.stringify({ rivalSessionId: SESSION_ID, rounds: 0 }));
    expect(readLedgerRecord(path)).toBeUndefined();
    removeLedgerRecord(path);
    expect(readLedgerRecord(path)).toBeUndefined();
  });
});
