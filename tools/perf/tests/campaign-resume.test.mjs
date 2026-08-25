import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCampaign } from '../run-campaign.mjs';
import { MAX_ATTEMPTS, artifactPath, campaignTarget } from '../lib/campaign-plan.mjs';
import {
  EXHAUSTED,
  FAILED,
  LEDGER_HEADER,
  UNCALIBRATED_RUNTIME,
  formatLedgerRow,
  nextAction,
  parseLedger,
} from '../lib/campaign-ledger.mjs';
import { runtimeHasUncalibratedChecks } from '../lib/input-fidelity.mjs';

// Every case here resolves without spawning a capture: a cell that is already
// valid, or one whose attempts the ledger says are gone. That is the whole point
// of the resume contract — the budget belongs to the campaign, not to one process.
const CELL = 'portrait-light/pen-undo';
const MODE = { id: 'portrait-light' };

const roots = [];

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'splotch-resume-'));
  roots.push(root);
  return root;
}

function seedLedger(path, failures) {
  mkdirSync(dirname(path), { recursive: true });
  const rows = Array.from({ length: failures }, (_, index) =>
    formatLedgerRow({
      timestamp: `2026-08-21T00:0${index}:00.000Z`,
      cell: CELL,
      status: `${FAILED}-exit-1`,
      attempt: index + 1,
      artifact: 'unused',
    })
  );
  writeFileSync(path, [LEDGER_HEADER.join('\t'), ...rows].join('\n') + '\n');
}

function seedLedgerRow(path, status) {
  mkdirSync(dirname(path), { recursive: true });
  const row = formatLedgerRow({
    timestamp: '2026-08-23T00:00:00.000Z',
    cell: CELL,
    status,
    attempt: 1,
    artifact: 'unused',
  });
  writeFileSync(path, [LEDGER_HEADER.join('\t'), row].join('\n') + '\n');
}

function run(targetId, root, extra = []) {
  return runCampaign([
    `--target=${targetId}`,
    '--modes=portrait-light',
    '--items=pen-undo',
    `--output-root=${root}/out`,
    `--ledger=${root}/ledger.tsv`,
    // The issue-1301 guard refuses a cell that would fall back to its child's
    // default server; these tests are about resume policy, so they satisfy it.
    '--url=http://127.0.0.1:4173/',
    ...extra,
  ]);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('campaign resume', () => {
  it('does not grant a fresh attempt budget to a rerun', async () => {
    const root = scratch();
    seedLedger(`${root}/ledger.tsv`, MAX_ATTEMPTS);

    const { ran } = await run('ipad-simulator-native', root);

    expect(ran).toEqual([{ cell: CELL, status: 'p1' }]);
    const ledger = readFileSync(`${root}/ledger.tsv`, 'utf8');
    expect(ledger).toContain(EXHAUSTED);
    expect(ledger.split('\n').filter((line) => line.includes(`${FAILED}-exit-`))).toHaveLength(
      MAX_ATTEMPTS
    );
  });

  it('counts attempts spent under a smaller budget as exhausting it', async () => {
    const root = scratch();
    seedLedger(`${root}/ledger.tsv`, 1);

    const { ran } = await run('ipad-simulator-native', root, ['--max-attempts=1']);

    expect(ran).toEqual([{ cell: CELL, status: 'p1' }]);
  });

  it('still skips a cell whose artifact already parses', async () => {
    const root = scratch();
    seedLedger(`${root}/ledger.tsv`, MAX_ATTEMPTS);
    const artifact = join(root, artifactPath('out', 'android-emulator-web', MODE, 'pen-undo'));
    mkdirSync(dirname(artifact), { recursive: true });
    // A real capture from this runner carries a fidelity verdict; the fixture used
    // to omit it, which only passed while a missing verdict was tolerated globally.
    writeFileSync(artifact, JSON.stringify({ transport: 'browser', fidelity: { passed: true } }));

    const { ran } = await run('android-emulator-web', root);

    expect(campaignTarget('android-emulator-web').runtime).toBe('web');
    expect(ran).toEqual([{ cell: CELL, status: 'already-valid' }]);
  });

  // The runner always writes a verdict, so an artifact without one is stale or
  // foreign — not a capture this cell produced. Accepting it is the fail-open that
  // banked unscoreable cells as complete.
  it('refuses an artifact with no fidelity verdict from a runner that writes one', async () => {
    const root = scratch();
    const artifact = join(root, artifactPath('out', 'android-emulator-web', MODE, 'pen-undo'));
    mkdirSync(dirname(artifact), { recursive: true });
    writeFileSync(artifact, JSON.stringify({ transport: 'browser' }));

    const { ran } = await run('android-emulator-web', root, ['--max-attempts=1']);

    expect(ran).toEqual([{ cell: CELL, status: 'p1' }]);
  });

  // One attempt, not three. The cell is held by an instrument that has no
  // expectation for its runtime, and recapturing cannot supply one — so a resumed
  // run must not spend the remaining budget rediscovering that. The row carries
  // the runner's `-exit-N` suffix, which is how it is written in a real ledger and
  // the reason this is matched by prefix rather than equality.
  it('does not retry a cell whose runtime has no measured expectation', async () => {
    const root = scratch();
    seedLedgerRow(`${root}/ledger.tsv`, `${UNCALIBRATED_RUNTIME}-exit-1`);

    const { ran } = await run('ipad-simulator-native', root);

    expect(ran).toEqual([{ cell: CELL, status: 'p1' }]);
    const ledger = readFileSync(`${root}/ledger.tsv`, 'utf8');
    expect(ledger).toContain(EXHAUSTED);
    expect(ledger.split('\n').filter((line) => line.includes(`${FAILED}-exit-`))).toHaveLength(0);
  });
});

// "This cell cannot be scored" is a statement about the INSTRUMENT, not about the
// attempt — and an instrument changes. A conclusion recorded before a runtime was
// calibrated must not outlive the calibration, or a resumed campaign refuses
// forever to capture a cell that is now measurable.
describe('an uncalibrated-runtime row after the runtime is calibrated', () => {
  const rows = parseLedger(
    formatLedgerRow({
      timestamp: '2026-08-23T00:00:00.000Z',
      cell: CELL,
      status: `${UNCALIBRATED_RUNTIME}-exit-1`,
      attempt: 1,
      artifact: 'unused',
    })
  );
  const decide = (runtimeStillUncalibrated) =>
    nextAction(rows, CELL, { artifactValid: false, maxAttempts: 3, runtimeStillUncalibrated });

  it('stays terminal while the runtime is still uncalibrated', () => {
    expect(decide(true)).toMatchObject({ action: 'p1' });
  });

  it('becomes capturable once the runtime has been calibrated', () => {
    expect(decide(false)).toMatchObject({ action: 'run' });
  });

  // The scenario is real rather than hypothetical: this campaign introduced the
  // status one PR before calibrating Android Chrome.
  it('reads android-chrome as calibrated and the WebViews as not', () => {
    expect(runtimeHasUncalibratedChecks('android-chrome')).toBe(false);
    expect(runtimeHasUncalibratedChecks('ios-capacitor-webview')).toBe(true);
    expect(runtimeHasUncalibratedChecks('android-capacitor-webview')).toBe(true);
  });
});
