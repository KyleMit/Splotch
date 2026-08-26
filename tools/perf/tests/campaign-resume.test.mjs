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
    // ipad-simulator-web keeps the Appium-browser cell shape this test needs —
    // the emulator's drawing is split-transport since the 60 Hz controls, and a
    // split target refuses to plan without a probe host.
    const artifact = join(root, artifactPath('out', 'ipad-simulator-web', MODE, 'pen-undo'));
    mkdirSync(dirname(artifact), { recursive: true });
    // A real capture from this runner carries a fidelity verdict, a beat, AND
    // its phase input — acceptance re-derives the verdict from the input by the
    // matrix's own rule, so a stored pass with nothing behind it no longer
    // banks. The fixture grew each field as the check that reads it landed.
    writeFileSync(
      artifact,
      JSON.stringify({
        transport: 'browser',
        fidelity: { passed: true },
        summaries: {
          intervalMs: 16.7,
          phases: [
            {
              input: {
                kinds: 'touch',
                trust: { share: 1 },
                movesPerSecond: 116,
                movesPerFrame: 1.9,
                moveGapP95Ms: 9,
                pressure: { p50: 0 },
                contactWidth: { p50: 74 },
                contactHeight: { p50: 74 },
              },
            },
          ],
        },
      })
    );

    const { ran } = await run('ipad-simulator-web', root);

    expect(campaignTarget('ipad-simulator-web').runtime).toBe('web');
    expect(ran).toEqual([{ cell: CELL, status: 'already-valid' }]);
  });

  // The runner always writes a verdict, so an artifact without one is stale or
  // foreign — not a capture this cell produced. Accepting it is the fail-open that
  // banked unscoreable cells as complete.
  it('refuses an artifact with no fidelity verdict from a runner that writes one', async () => {
    const root = scratch();
    const artifact = join(root, artifactPath('out', 'ipad-simulator-web', MODE, 'pen-undo'));
    mkdirSync(dirname(artifact), { recursive: true });
    writeFileSync(artifact, JSON.stringify({ transport: 'browser' }));

    const { ran } = await run('ipad-simulator-web', root, ['--max-attempts=1']);

    expect(ran).toEqual([{ cell: CELL, status: 'p1' }]);
  });

  // The becomes-capturable branch, end to end, with the real expectations
  // table: this row was seeded while the Android WebView had no measured
  // pressure/contact expectations, and the runtime has since been calibrated
  // (android-webview-fidelity.test.mjs) — so the recorded conclusion must not
  // outlive the calibration, and the resume RE-CAPTURES instead of holding the
  // cell terminal. (The one-attempt-while-uncalibrated behavior itself stays
  // pinned runtime-independently by the nextAction cases below.)
  it('recaptures a cell whose runtime gained calibration after the row was written', async () => {
    const root = scratch();
    seedLedgerRow(`${root}/ledger.tsv`, `${UNCALIBRATED_RUNTIME}-exit-1`);

    const { ran } = await run('android-emulator-native', root);

    expect(ran).toEqual([{ cell: CELL, status: 'p1' }]);
    const ledger = readFileSync(`${root}/ledger.tsv`, 'utf8');
    // Attempts were SPENT: the sandbox has no emulator, so each recapture
    // records a failed attempt — which is the proof the hold was released.
    expect(
      ledger.split('\n').filter((line) => line.includes(`${FAILED}-exit-`)).length
    ).toBeGreaterThan(0);
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
  // status one PR before calibrating Android Chrome, the iPad WebView crossed
  // the line when the coalescing check was retired, and the Android WebView
  // crossed it when its pressure/contact checks were measured against a hand
  // (android-webview-fidelity.test.mjs). Every runtime that writes a fidelity
  // verdict is now calibrated; only the desktop table entry — which never
  // writes a verdict of its own — still carries UNCALIBRATED rows.
  it('reads every verdict-writing runtime as calibrated', () => {
    expect(runtimeHasUncalibratedChecks('android-chrome')).toBe(false);
    expect(runtimeHasUncalibratedChecks('ios-capacitor-webview')).toBe(false);
    expect(runtimeHasUncalibratedChecks('android-capacitor-webview')).toBe(false);
    expect(runtimeHasUncalibratedChecks('desktop-playwright')).toBe(true);
  });
});
