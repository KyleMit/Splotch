import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { CAMPAIGN_TARGETS, planCampaign, planCampaignReferences } from '../lib/campaign-plan.mjs';
import { cellInspection } from '../run-campaign.mjs';

const CORPUS = join(ROOT, 'perf-profiles/evidence/2026-09-29-iphone');
const index = JSON.parse(readFileSync(join(CORPUS, 'index.json'), 'utf8'));
const checkpoint = JSON.parse(readFileSync(join(CORPUS, 'checkpoint.json'), 'utf8'));
const accepted = index.kept.filter((entry) => entry.kind !== 'calibration');

function targetPlan(target) {
  const options = {
    outputRoot: CORPUS,
    host: { deviceId: 'physical-iphone', url: 'http://host/' },
  };
  const cells = planCampaign(target, options);
  const references = planCampaignReferences(target, {
    ...options,
    modeId: 'portrait-light',
    productCommands: [...new Set(cells.map((cell) => cell.command))],
  });
  return [...cells, ...references];
}

describe('published iPhone campaign evidence', () => {
  it.each(accepted)('revalidates $target/$cell through campaign acceptance', (entry) => {
    const cell = targetPlan(entry.target).find((candidate) => candidate.id === entry.cell);
    expect(cell).toBeDefined();
    expect(
      cellInspection(
        { ...cell, artifact: join(CORPUS, entry.file) },
        CAMPAIGN_TARGETS[entry.target]
      )
    ).toMatchObject({ ok: true });
    const bytes = readFileSync(join(CORPUS, entry.file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  });

  it.each(Object.keys(checkpoint.targets))(
    'derives %s coverage from published captures',
    (target) => {
      const entries = accepted.filter((entry) => entry.target === target);
      const done = entries.map((entry) => entry.cell).sort();
      const missing = targetPlan(target)
        .filter((cell) => !done.includes(cell.id))
        .map((cell) => cell.id)
        .sort();
      expect(checkpoint.targets[target].status.done.toSorted()).toEqual(done);
      expect(checkpoint.targets[target].status.outstanding.map((cell) => cell.cell).sort()).toEqual(
        missing
      );
      expect(new Set(done).size).toBe(done.length);
    }
  );

  it('keeps calibration probes out of accepted coverage', () => {
    expect(accepted.filter((entry) => entry.kind === 'cell')).toHaveLength(
      checkpoint.acceptedCells
    );
    expect(accepted.filter((entry) => entry.kind === 'reference')).toHaveLength(
      checkpoint.acceptedReferences
    );
    expect(index.kept.filter((entry) => entry.kind === 'calibration')).toHaveLength(2);
    expect(index.productCommit).toBe(checkpoint.productCommit);
    expect(index.acceptedCells).toBe(checkpoint.acceptedCells);
    expect(index.acceptedReferences).toBe(checkpoint.acceptedReferences);
  });
});
