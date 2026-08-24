import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NATIVE_TRANSPORT } from '../lib/campaign-plan.mjs';
import {
  COMPLETE,
  FAILED,
  OFF_REFRESH_REGIME,
  UNCALIBRATED_RUNTIME,
  UNSCOREABLE,
} from '../lib/campaign-ledger.mjs';
import { inspectArtifact } from '../run-campaign.mjs';

// This is the function that decides whether a cell is banked or spent again, and
// every campaign's evidence passes through it. It had no test.
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function artifactAt(contents) {
  const directory = mkdtempSync(join(tmpdir(), 'splotch-acceptance-'));
  directories.push(directory);
  const path = join(directory, 'real-screen.json');
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
  return path;
}

const scoreable = {
  transport: 'browser',
  fidelity: { passed: true },
  summaries: { intervalMs: 17 },
};

describe('inspectArtifact', () => {
  it('accepts a capture that parses, matches the runtime, and is in regime', () => {
    expect(
      inspectArtifact(artifactAt(scoreable), 'web', {
        verdictRequired: true,
        expectedRefreshRegime: '60hz',
      })
    ).toMatchObject({ ok: true, status: COMPLETE });
  });

  it('treats a missing or unparseable artifact as a failed attempt', () => {
    expect(inspectArtifact(join(tmpdir(), 'nope', 'real-screen.json'), 'web')).toMatchObject({
      ok: false,
      status: FAILED,
    });
    expect(inspectArtifact(artifactAt('{ not json'), 'web')).toMatchObject({
      ok: false,
      status: FAILED,
    });
  });

  // A native capture that attached to Chrome, or a web capture that attached to the
  // installed app, produces a well-formed artifact and exits zero.
  it('rejects an artifact from the wrong runtime', () => {
    const native = artifactAt({ ...scoreable, transport: NATIVE_TRANSPORT });

    expect(inspectArtifact(native, 'web')).toMatchObject({ ok: false, status: FAILED });
    expect(inspectArtifact(native, 'native')).toMatchObject({ ok: true, status: COMPLETE });
  });

  // The split runner writes its artifact and THEN fails the gate, so acceptance on
  // "the artifact parses" banks exactly the cells that transport exists to stop
  // producing. UNSCOREABLE is distinct from FAILED because "every row is
  // missing-or-invalid-json" is the read that makes clearing a ledger safe.
  it('separates a capture that cannot be scored from one that was never written', () => {
    const failed = artifactAt({ ...scoreable, fidelity: { passed: false } });

    expect(inspectArtifact(failed, 'web', { verdictRequired: true })).toMatchObject({
      ok: false,
      status: UNSCOREABLE,
    });
    expect(UNSCOREABLE).not.toBe(FAILED);
  });

  // Tolerance for an absent verdict is granted per transport: the desktop runner
  // genuinely reports none, but a runner that always writes one must have an absent
  // verdict treated as no verdict rather than as consent.
  it('tolerates a missing verdict only where one is not required', () => {
    const silent = artifactAt({ transport: 'browser', summaries: { intervalMs: 17 } });

    expect(inspectArtifact(silent, 'web', { verdictRequired: false }).ok).toBe(true);
    expect(inspectArtifact(silent, 'web', { verdictRequired: true })).toMatchObject({
      ok: false,
      status: UNSCOREABLE,
    });
  });

  describe('the refresh regime', () => {
    // The 2026-08-23 excursion: a capture that parsed, passed input fidelity at 119
    // contact moves/s, and whose lost frame time was 6x wrong purely from the beat
    // it was priced against.
    it('refuses a capture measured in another regime, and says which', () => {
      const offRegime = artifactAt({ ...scoreable, summaries: { intervalMs: 8 } });

      expect(
        inspectArtifact(offRegime, 'web', {
          verdictRequired: true,
          expectedRefreshRegime: '60hz',
        })
      ).toMatchObject({
        ok: false,
        status: OFF_REFRESH_REGIME,
        regime: { observed: '120hz', expected: '60hz', matched: false },
      });
    });

    // Checked after fidelity on purpose: a capture that was barely driven has a
    // meaningless beat as well as a meaningless number, and naming the regime would
    // send the next session after the wrong thing.
    it('reports a fidelity failure ahead of a regime mismatch', () => {
      const both = artifactAt({
        transport: 'browser',
        fidelity: { passed: false },
        summaries: { intervalMs: 8 },
      });

      expect(
        inspectArtifact(both, 'web', { verdictRequired: true, expectedRefreshRegime: '60hz' })
      ).toMatchObject({ ok: false, status: UNSCOREABLE });
    });

    // A target with no established regime records the observation and scores. That
    // is a gap to close by measuring it, not a licence — and above all it must not
    // start rejecting the targets nobody has characterized yet.
    it('does not reject a target with no established regime', () => {
      const odd = artifactAt({ ...scoreable, summaries: { intervalMs: 33.3 } });

      expect(inspectArtifact(odd, 'web', { verdictRequired: true })).toMatchObject({
        ok: true,
        status: COMPLETE,
      });
    });
  });
});

// A 20-cell physical target spent 60 attempts reaching the same structural answer
// before this distinction existed, on hardware only one session can hold.
describe('a verdict no retry can change', () => {
  const uncalibratedOnly = {
    transport: 'browser',
    fidelity: {
      passed: false,
      checks: { trustedTouch: true, cadence: true, coalescing: null },
      uncalibrated: ['coalescing'],
    },
    summaries: { intervalMs: 17 },
  };

  it('separates a silent instrument from a capture that cannot be scored', () => {
    expect(
      inspectArtifact(artifactAt(uncalibratedOnly), 'web', { verdictRequired: true })
    ).toMatchObject({ ok: false, status: UNCALIBRATED_RUNTIME });
  });

  // The ordering matters more than the new status does. A capture that was barely
  // driven AND rests on an unmeasured threshold is a bad run first — calling it an
  // instrument gap sends the next session to write a threshold when what actually
  // happened is that the gesture never reached the canvas.
  it('reports a badly driven capture as unscoreable even when checks are uncalibrated', () => {
    const alsoUnderDriven = {
      ...uncalibratedOnly,
      fidelity: {
        passed: false,
        checks: { trustedTouch: true, cadence: false, coalescing: null },
        uncalibrated: ['coalescing'],
      },
    };

    expect(
      inspectArtifact(artifactAt(alsoUnderDriven), 'web', { verdictRequired: true })
    ).toMatchObject({ ok: false, status: UNSCOREABLE });
  });

  it('still calls an ordinary fidelity failure unscoreable', () => {
    const badRun = {
      ...uncalibratedOnly,
      fidelity: {
        passed: false,
        checks: { trustedTouch: false, cadence: false },
        uncalibrated: [],
      },
    };

    expect(inspectArtifact(artifactAt(badRun), 'web', { verdictRequired: true })).toMatchObject({
      ok: false,
      status: UNSCOREABLE,
    });
  });
});

// The failing-open half of the same rule. A command that never measures a beat
// must be exempt, and a command that does must NOT be — an artifact that should
// carry one and does not is a broken capture, not an exempt one.
describe('a capture with no beat to report', () => {
  const noBeat = {
    transport: 'android-chrome-cdp',
    summaries: [{ action: 'idle frame control' }],
  };

  it('is accepted when its command measures no refresh regime', () => {
    expect(
      inspectArtifact(artifactAt(noBeat), 'web', { expectedRefreshRegime: null })
    ).toMatchObject({ ok: true, status: COMPLETE });
  });

  it('is still refused when a regime was expected of it', () => {
    expect(
      inspectArtifact(artifactAt(noBeat), 'web', { expectedRefreshRegime: '120hz' })
    ).toMatchObject({ ok: false, status: OFF_REFRESH_REGIME });
  });
});
