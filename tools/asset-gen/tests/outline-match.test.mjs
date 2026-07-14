// Regression tests for outline registration scoring (outlineMatch,
// lib/outline-match.mjs). The magic-brush fill (ADR-0043) assumes the colored
// candidate's outlines register pixel-for-pixel on the source line art. A global
// keep average hides a LOCALIZED drift: nature/ant-wide scored 93% global keep
// (over the old bar) while its drifted flower tile was 34%. localKeep — the
// worst tile — is what catches it, and this suite locks that both-scores design.
//
// Fixtures are synthetic (tests/fixtures/synthetic.mjs): a big registering
// subject plus one small feature that the drifted candidate shifts ~14px,
// reproducing the "passes global, fails local" split exactly.
import { describe, it, expect } from 'vitest';
import { outlineMatch, KEEP_THRESHOLD, LOCAL_KEEP_THRESHOLD } from '../lib/outline-match.mjs';
import { matchSource, matchDrifted } from './fixtures/synthetic.mjs';

describe('outlineMatch — localized drift the global keep buries', () => {
  it('a perfectly registered candidate keeps both scores at 1', async () => {
    const src = await matchSource();
    const r = await outlineMatch(src, await matchSource());
    expect(r.keep).toBeGreaterThanOrEqual(KEEP_THRESHOLD);
    expect(r.localKeep).toBeGreaterThanOrEqual(LOCAL_KEEP_THRESHOLD);
    expect(r.keep).toBeCloseTo(1, 2);
    expect(r.localKeep).toBeCloseTo(1, 2);
  });

  it('flags a locally-drifted feature that passes the GLOBAL bar', async () => {
    const r = await outlineMatch(await matchSource(), await matchDrifted());
    // the failure is local-only: global keep still clears its bar (the subject
    // dominates the average), exactly the ant-wide blind spot localKeep exists for
    expect(r.keep).toBeGreaterThanOrEqual(KEEP_THRESHOLD);
    expect(r.localKeep).toBeLessThan(LOCAL_KEEP_THRESHOLD);
    expect(r.worstTile).not.toBeNull();
  });

  it('separates aligned from drifted with margin on the worst tile', async () => {
    const src = await matchSource();
    const good = await outlineMatch(src, await matchSource());
    const drift = await outlineMatch(src, await matchDrifted());
    expect(good.localKeep - drift.localKeep).toBeGreaterThan(0.3);
  });
});
