import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AB_2229_ARMS,
  IPAD_SESSION_OS,
  IPAD_UPDATE_OS,
  PERSON_SESSION_STEPS,
  abSummary,
  captureVerdict,
  magicFirstLoadReading,
  navBarOverlayVerdict,
  nextStep,
  overlaySteadilyClear,
  resumeBringUp,
  secureSweepProblem,
  sessionTotals,
  stepIpadOs,
  stepOrderProblem,
  trustedPointerdowns,
} from '../lib/person-session.mjs';
import { parseInputWindows } from '../lib/android-touch-occlusion.mjs';
import { openSafariWithDevicectl } from '../split-capture/capture-hand-input.mjs';
import {
  REDUCE_MOTION_STORAGE_KEY,
  reduceMotionReadinessProblem,
  reduceMotionSeedProblem,
} from '../lib/reduce-motion.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
// The rig phone's own dump from issue 2229/2214: two stacked 0.7998-alpha
// nu.nav.bar windows on the portrait centre column.
const OCCLUDED_DUMP = readFileSync(
  join(import.meta.dirname, 'fixtures', 'android-dumpsys-input-occluded.txt'),
  'utf8'
);
// A tracked driven iPad capture (split transport, 10 passes) the verdict can
// read end to end, report included.
const DRIVEN_CAPTURE = JSON.parse(
  readFileSync(
    join(
      ROOT,
      'perf-profiles/evidence/2026-09-22-issue-1715-driven-control/ipad-device-web-pen.json'
    ),
    'utf8'
  )
);

const drivenExpectation = {
  kind: 'ipad-driven',
  target: 'ipad-device-web',
  brush: 'pen',
  orientation: DRIVEN_CAPTURE.orientation,
  theme: DRIVEN_CAPTURE.theme,
  productCommit: DRIVEN_CAPTURE.productCommit,
};

describe('navBarOverlayVerdict', () => {
  it('fails the rig phone dump whose two stacked windows sum past the 0.8 limit', () => {
    const verdict = navBarOverlayVerdict(parseInputWindows(OCCLUDED_DUMP));
    expect(verdict.pass).toBe(false);
    expect(verdict.windows).toBe(2);
    expect(verdict.combinedOpacity).toBeGreaterThan(0.95);
    expect(verdict.point).toBe('(540,99)');
  });

  it('passes once only one of the stacked windows remains', () => {
    const single = OCCLUDED_DUMP.split('\n')
      .filter((line) => !line.includes('name=cf92dfa nu.nav.bar'))
      .join('\n');
    const verdict = navBarOverlayVerdict(parseInputWindows(single));
    expect(verdict.windows).toBe(1);
    expect(verdict.pass).toBe(true);
  });

  it('fails overlapping windows with different frames whose sum drops a touch', () => {
    const window = (left, right) => ({
      name: 'abc nu.nav.bar',
      flags: new Set(['NOT_FOCUSABLE']),
      alpha: 0.6,
      frame: { left, top: 0, right, bottom: 100 },
      ownerUid: 10334,
      occlusionMode: 'USE_OPACITY',
    });
    const verdict = navBarOverlayVerdict([window(0, 10), window(5, 15)]);
    expect(verdict.pass).toBe(false);
    expect(verdict.combinedOpacity).toBe(0.84);
    expect(verdict.point).toBe('(5,0)');
  });

  it('passes a dump with no nu.nav.bar window at all', () => {
    const verdict = navBarOverlayVerdict([]);
    expect(verdict).toMatchObject({ pass: true, windows: 0 });
  });
});

describe('overlaySteadilyClear', () => {
  const pass = { pass: true };
  const fail = { pass: false };

  it('refuses the 2026-09-24 blip: one clear read between two occluded ones', () => {
    expect(overlaySteadilyClear([fail, pass])).toBe(false);
    expect(overlaySteadilyClear([fail, pass, fail, pass, pass, pass, pass, pass])).toBe(false);
  });

  it('needs seven clear reads: six five-second intervals, thirty seconds', () => {
    expect(overlaySteadilyClear([fail, pass, pass, pass, pass, pass, pass])).toBe(false);
    expect(overlaySteadilyClear([fail, pass, pass, pass, pass, pass, pass, pass])).toBe(true);
  });
});

describe('the session plan', () => {
  it('puts every 26.5 iPad task before the update, and the commit check after it', () => {
    const ids = PERSON_SESSION_STEPS.map((step) => step.id);
    const update = ids.indexOf('ipad-update');
    for (const id of ['ipad-portrait', 'ipad-landscape', 'ipad-native', 'ipad-secure-actions']) {
      expect(ids.indexOf(id)).toBeLessThan(update);
    }
    expect(ids.indexOf('ipad-commit-check')).toBeGreaterThan(update);
  });

  it('refuses a 26.5 step once the update has started, and the update while one is owed', () => {
    expect(stepOrderProblem('ipad-portrait', { 'ipad-update': 'done' })).toMatch(/26\.5/);
    expect(stepOrderProblem('ipad-update', { 'bring-up': 'done' })).toMatch(/still owed/);
    const allDone = Object.fromEntries(
      PERSON_SESSION_STEPS.slice(
        0,
        PERSON_SESSION_STEPS.findIndex((step) => step.id === 'ipad-update')
      ).map((step) => [step.id, 'done'])
    );
    expect(stepOrderProblem('ipad-update', allDone)).toBeNull();
  });

  it('runs visit 2 as update, bring-up on the new OS, constraint probe, paired controls, commit check', () => {
    const visitTwo = PERSON_SESSION_STEPS.filter((step) => step.visit === 2).map((step) => step.id);
    expect(visitTwo.filter((id) => id !== 'iphone-inset')).toEqual([
      'ipad-update',
      'update-bring-up',
      'ipad-constraint-probe',
      'ipad-paired',
      'ipad-commit-check',
    ]);
    expect(visitTwo.indexOf('iphone-inset')).toBeLessThan(visitTwo.indexOf('update-bring-up'));
    expect(stepOrderProblem('ipad-paired', { 'ipad-update': 'done' })).toBeNull();
  });

  it('pairs a driven and a finger arm per brush on the updated iPadOS', () => {
    const step = PERSON_SESSION_STEPS.find((candidate) => candidate.id === 'ipad-paired');
    expect(stepIpadOs(step)).toBe(IPAD_UPDATE_OS);
    expect(step.captures.every((item) => item.ipadOs === IPAD_UPDATE_OS)).toBe(true);
    expect(step.captures.map((item) => `${item.brush}-${item.kind}-${item.arm}`)).toEqual([
      'pen-ipad-driven-driven',
      'pen-ipad-finger-finger',
      'magic-ipad-driven-driven',
      'magic-ipad-finger-finger',
    ]);
    const visitOnePair = PERSON_SESSION_STEPS.find((candidate) => candidate.id === 'ipad-portrait');
    expect(stepIpadOs(visitOnePair)).toBe(IPAD_SESSION_OS);
    expect(visitOnePair.captures.some((item) => item.ipadOs)).toBe(false);
  });

  it('re-proves the rig of the visit a resumed step needs, and only then', () => {
    expect(resumeBringUp('bring-up')).toBeNull();
    expect(resumeBringUp('ipad-secure-actions')).toBe('bring-up');
    expect(resumeBringUp('ipad-update')).toBeNull();
    expect(resumeBringUp('ipad-constraint-probe')).toBe('update-bring-up');
    expect(resumeBringUp('ipad-paired')).toBe('update-bring-up');
    expect(resumeBringUp('ipad-commit-check')).toBeNull();
    const ids = PERSON_SESSION_STEPS.map((step) => step.id);
    for (const step of PERSON_SESSION_STEPS.filter((candidate) => candidate.rig)) {
      const bringUp = PERSON_SESSION_STEPS.find((candidate) => candidate.id === step.rig);
      expect(bringUp.visit).toBe(step.visit);
      expect(ids.indexOf(bringUp.id)).toBeLessThan(ids.indexOf(step.id));
    }
  });

  it('resumes at the first step that is neither done nor skipped', () => {
    expect(nextStep({}).id).toBe('bring-up');
    expect(nextStep({ 'bring-up': 'done', 'ipad-portrait': 'failed' }).id).toBe('ipad-portrait');
  });

  it('totals the person-present minutes per visit', () => {
    const totals = sessionTotals();
    expect(totals[1].personMinutes).toBeGreaterThan(0);
    expect(totals[2].personMinutes).toBeGreaterThan(0);
  });
});

describe('captureVerdict', () => {
  it('passes a scoreable driven capture at its recorded product commit', () => {
    const verdict = captureVerdict(DRIVEN_CAPTURE, drivenExpectation);
    expect(verdict.reasons).toEqual([]);
    expect(verdict.status).toBe('PASS');
    expect(verdict.metrics.lostFrameTimeShare).toBeGreaterThan(0);
  });

  it('asks for a redo when the served build is not the expected commit', () => {
    const verdict = captureVerdict(DRIVEN_CAPTURE, {
      ...drivenExpectation,
      productCommit: 'f'.repeat(40),
    });
    expect(verdict.status).toBe('REDO');
    expect(verdict.reasons.join()).toMatch(/product commit/);
  });

  it('asks a finger capture with too little contact to keep the finger down', () => {
    const verdict = captureVerdict(DRIVEN_CAPTURE, {
      ...drivenExpectation,
      kind: 'ipad-finger',
      minContactSeconds: 10_000,
    });
    expect(verdict.status).toBe('REDO');
    expect(verdict.reasons.join()).toMatch(/finger-down time/);
  });

  it('asks for a redo when the page recorded fewer pointerdowns than the swipes sent', () => {
    const downs = trustedPointerdowns(DRIVEN_CAPTURE.report);
    const artifact = { ...DRIVEN_CAPTURE, dispatchedStrokes: downs + 20 };
    const verdict = captureVerdict(artifact, {
      ...drivenExpectation,
      kind: 'android-driven',
      reduceMotion: 'system',
    });
    expect(verdict.status).toBe('REDO');
    expect(verdict.metrics.pointerdowns).toBe(`${downs}/${downs + 20}`);
    expect(verdict.reasons.join()).toMatch(/took touches/);
  });

  it('refuses an artifact with no report', () => {
    expect(captureVerdict(null, drivenExpectation).status).toBe('REDO');
    expect(captureVerdict({}, drivenExpectation).status).toBe('REDO');
  });
});

describe('magicFirstLoadReading', () => {
  it('names the worst in-contact gap and the share without it', () => {
    const scored = captureVerdict(DRIVEN_CAPTURE, drivenExpectation).scored;
    const reading = magicFirstLoadReading(DRIVEN_CAPTURE, scored);
    expect(reading).toHaveProperty('worstInContactGapMs');
    expect(reading.lostFrameTimeShareWithoutWorst).toBeLessThanOrEqual(
      reading.lostFrameTimeShare + 1e-9
    );
  });
});

describe('secureSweepProblem', () => {
  it('passes a sweep whose AI-waiting samples all ran in a secure context', () => {
    expect(
      secureSweepProblem({ samples: [{ label: 'x' }, { aiRun: { secureContext: true } }] })
    ).toBeNull();
  });

  it('refuses a sweep that blocked a required action even with secure AI samples', () => {
    expect(
      secureSweepProblem({
        actionPlan: { blocked: [{ label: 'required action', reason: 'x' }] },
        samples: [{ aiRun: { secureContext: true } }],
      })
    ).toMatch(/blocked coverage: required action/);
  });

  it('refuses a sweep with no AI-waiting evidence or an insecure sample', () => {
    expect(secureSweepProblem({ samples: [{ label: 'x' }] })).toMatch(/no AI-waiting/);
    expect(secureSweepProblem({ samples: [{ aiRun: { secureContext: false } }] })).toMatch(
      /not run in a secure context/
    );
  });
});

describe('abSummary', () => {
  it('reports a median per arm from PASS captures only', () => {
    const results = [
      { arm: 'base', status: 'PASS', metrics: { lostFrameTimeShare: 0.006 } },
      { arm: 'base', status: 'PASS', metrics: { lostFrameTimeShare: 0.008 } },
      { arm: 'base', status: 'REDO', metrics: { lostFrameTimeShare: 0.5 } },
    ];
    const base = abSummary(results).find((row) => row.arm === 'base');
    expect(base).toMatchObject({ n: 2, median: '0.7%' });
    expect(abSummary(results)).toHaveLength(AB_2229_ARMS.length);
  });
});

describe('the Reduce Motion seed', () => {
  it('names the product storage key exactly', () => {
    const keys = readFileSync(join(ROOT, 'web/src/lib/storageKeys.ts'), 'utf8');
    expect(keys).toContain(`reduceMotion: '${REDUCE_MOTION_STORAGE_KEY}'`);
  });

  it('accepts only the seeds a capture needs', () => {
    expect(reduceMotionSeedProblem(null)).toBeNull();
    expect(reduceMotionSeedProblem('reduce')).toBeNull();
    expect(reduceMotionSeedProblem('full')).toMatch(/must be one of/);
  });

  it('holds a reduce seed to the page’s own answer', () => {
    expect(reduceMotionReadinessProblem({ reducedMotion: true }, 'reduce')).toBeNull();
    expect(reduceMotionReadinessProblem({ reducedMotion: false }, 'reduce')).toMatch(/reduce/);
    expect(reduceMotionReadinessProblem({ reducedMotion: true }, 'system')).toBeNull();
  });
});

describe('openSafariWithDevicectl', () => {
  it('opens iPad Safari at the exact nonce URL, fresh', () => {
    const calls = [];
    openSafariWithDevicectl({
      udid: 'UDID',
      pageUrl: 'http://host.test:4190/?probe=run-1',
      exec: (command, args) => calls.push([command, ...args]),
    });
    expect(calls).toEqual([
      [
        'xcrun',
        'devicectl',
        'device',
        'process',
        'launch',
        '--terminate-existing',
        '--device',
        'UDID',
        '--payload-url',
        'http://host.test:4190/?probe=run-1',
        'com.apple.mobilesafari',
      ],
    ]);
  });
});
