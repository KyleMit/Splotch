import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCampaign } from '../run-campaign.mjs';
import { MAX_ATTEMPTS, artifactPath, campaignTarget } from '../lib/campaign-plan.mjs';
import { EXHAUSTED, FAILED, LEDGER_HEADER, formatLedgerRow } from '../lib/campaign-ledger.mjs';

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
    const artifact = join(root, artifactPath('out', 'android-emulator-web', MODE, 'pen-undo'));
    mkdirSync(dirname(artifact), { recursive: true });
    writeFileSync(artifact, JSON.stringify({ transport: 'browser' }));

    const { ran } = await run('android-emulator-web', root);

    expect(campaignTarget('android-emulator-web').runtime).toBe('web');
    expect(ran).toEqual([{ cell: CELL, status: 'already-valid' }]);
  });
});
