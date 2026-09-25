// The pure half of `perf:session:person` (epic 2210): the ordered plan of the
// tasks only a person at the devices can do, and the PASS/REDO verdict each
// capture gets before that person walks away. Everything here is judged from
// artifacts and device dumps handed in, so it is testable without a device;
// run-person-session.mjs owns the processes.
import { rescoreCapture } from '../rescore-captures.mjs';
import { numberInvalidatingFailure, onlyUncalibratedChecksFailed } from './input-fidelity.mjs';
import { ANDROID_MAX_OBSCURING_OPACITY } from './android-touch-occlusion.mjs';

// The accessibility-service app on the rig phone whose stacked overlays drop
// every touch in the portrait centre column (issue 2229).
const NAV_BAR_OVERLAY_PACKAGE = 'nu.nav.bar';

// #2229's A/B, fixed by the issue: the last all-160 portrait capture's commit
// against the first 140-of-160 one, plus a Reduce Motion arm on the later one.
const AB_2229_BASE_COMMIT = 'e5142fab8ff2d4b5c8ee767e244c495cec3ba8d3';
const AB_2229_HEAD_COMMIT = '3928cd88edbf441530e473a4e3c0b6767926bfc6';
// Three rounds, the "at least three samples per cell" rule of
// docs/PROFILING-CAMPAIGNS.md. Each round runs the Reduce Motion arm before
// the head arm, because both share one origin and the head arm's `system`
// seed is what leaves that origin back at the product default.
export const AB_2229_ROUNDS = 3;
export const AB_2229_ARMS = [
  { id: 'base', commit: AB_2229_BASE_COMMIT, reduceMotion: 'system', origin: 'base' },
  { id: 'head-reduce-motion', commit: AB_2229_HEAD_COMMIT, reduceMotion: 'reduce', origin: 'head' },
  { id: 'head', commit: AB_2229_HEAD_COMMIT, reduceMotion: 'system', origin: 'head' },
];

// The iPad must still be on the OS the B tasks are judged on; the update to
// the next one is its own, final step (issue 2237).
export const IPAD_SESSION_OS = '26.5';
export const IPAD_UPDATE_OS = '26.6';

// Long enough for the Magic sheet's first-load stall and several full strokes,
// short enough that a person does not tire; the 2026-09-07 finger floor ran
// 22–40 s of contact per capture.
const FINGER_SECONDS = 30;
// Below this much finger-down time a capture is mostly lifts, and its
// lost-frame share is a share of too little.
export const FINGER_MIN_CONTACT_SECONDS = 15;
// The bundled runner's own ceiling is 60 s; 20 is its documented default.
const NATIVE_FINGER_SECONDS = 20;
// A first-load stall is one in-contact gap in the first strokes; one this long
// is the class #2232 is about (433 ms in the 2026-09-07 capture).
const MAGIC_STALL_MIN_MS = 200;

const gesture = {
  scribble:
    'long, continuous scribbles across the whole page, the way a toddler does; ' +
    'keep the finger down, lift only to start a new stroke',
  eraser:
    'sweep the eraser across the whole painted page in long passes, top to bottom, ' +
    'without scrubbing one spot twice — the page is filled once and never refilled',
};

// Each capture item: who drives it, what the person does, and what the verdict
// holds it to. `target` is the matrix row the artifact is scored against.
function drivenIpadWeb(brush, orientation, theme, arm) {
  return { kind: 'ipad-driven', target: 'ipad-device-web', brush, orientation, theme, arm };
}
function fingerIpadWeb(brush, orientation, theme, arm) {
  return {
    kind: 'ipad-finger',
    target: 'ipad-device-web',
    brush,
    orientation,
    theme,
    arm,
    seconds: FINGER_SECONDS,
    gesture: brush === 'eraser' ? gesture.eraser : gesture.scribble,
  };
}
// A capture taken after the iPadOS update: its label and output carry the
// release, so it never collides with the same cell captured on the old one.
function onIpadOs(ipadOs, item) {
  return { ...item, ipadOs };
}
function fingerIpadNative(brush, orientation, theme) {
  return {
    kind: 'ipad-native-finger',
    target: 'ipad-device-native',
    brush,
    orientation,
    theme,
    arm: 'finger',
    seconds: NATIVE_FINGER_SECONDS,
    gesture: gesture.scribble,
  };
}

// Ordered for the least time at the devices: every iPad task that needs a
// finger runs first on iPadOS 26.5, grouped by orientation so the iPad turns
// once; the phone's overlay fix comes next, and releases the person — the
// phone A/B and the iPad web action sweeps then run on their own, one device at
// a time. The iPadOS update is a second, short visit, and nothing before it
// may run after it. A step's `rig` names the bring-up whose servers it uses; a
// session resuming at that step re-runs the bring-up first.
export const PERSON_SESSION_STEPS = [
  {
    id: 'bring-up',
    visit: 1,
    personMinutes: 3,
    title: 'Bring the rig up and prove it',
    issues: [],
    person: [
      'Unlock the iPad and the phone, and leave both on their chargers.',
      'iPad: Auto-Lock Never, rotation lock OFF (Control Center), Safari closed to one tab.',
      'Watch the iPad: if the runner launches WebDriverAgent, an "Enter iPad Passcode for XCTest" prompt may appear — enter the passcode and allow it.',
    ],
    done: 'iPad on iPadOS 26.5; preview, probe host, Appium and WebDriverAgent all answer; the served build is this checkout’s clean build.',
  },
  {
    id: 'ipad-portrait',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 12,
    title: 'iPad Safari, portrait: paired pen and Magic, and the Magic first load',
    issues: [2235, 2232],
    person: [
      'You never open a page: the runner opens Safari at its own address for every capture. Just press Enter here.',
      'Hold the iPad in PORTRAIT and keep it there for this whole step.',
      'During a DRIVEN capture, do not touch the iPad — WebDriverAgent draws.',
      'During a FINGER capture, draw with ONE finger from "Draw now" until "Stop".',
    ],
    captures: [
      drivenIpadWeb('pen', 'PORTRAIT', 'light', 'driven'),
      fingerIpadWeb('pen', 'PORTRAIT', 'light', 'finger'),
      drivenIpadWeb('magic', 'PORTRAIT', 'dark', 'driven'),
      fingerIpadWeb('magic', 'PORTRAIT', 'dark', 'finger-1'),
      fingerIpadWeb('magic', 'PORTRAIT', 'dark', 'finger-2'),
      fingerIpadWeb('magic', 'PORTRAIT', 'dark', 'finger-3'),
    ],
    done: 'Each capture PASS: trusted touch and cadence pass, 60 Hz regime, this checkout’s product commit, enough finger-down time.',
  },
  {
    id: 'ipad-landscape',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 5,
    title: 'iPad Safari, landscape: eraser finger captures (and the #2233 pen ruling)',
    issues: [2231],
    person: [
      'You never open a page: the runner opens Safari at its own address for every capture.',
      'Turn the iPad to LANDSCAPE and keep it there for this whole step.',
      'The page arrives already painted for the eraser: erase in long passes, never the same spot twice.',
      'At the end, turn the iPad back to PORTRAIT.',
    ],
    captures: [
      fingerIpadWeb('eraser', 'LANDSCAPE', 'light', 'finger'),
      fingerIpadWeb('eraser', 'LANDSCAPE', 'dark', 'finger'),
      fingerIpadWeb('pen', 'LANDSCAPE', 'dark', 'finger'),
    ],
    done: 'Both eraser captures PASS with a verified page fill; the pen capture PASS.',
  },
  {
    id: 'ipad-native',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 5,
    title: 'Installed iPad app: pen and Magic finger captures',
    issues: [2236],
    person: [
      'Hold the iPad in PORTRAIT. The runner launches the installed Splotch app itself — do not open it.',
      'Draw with ONE finger from "GO" until "window closed" in this terminal.',
    ],
    captures: [
      fingerIpadNative('pen', 'PORTRAIT', 'light'),
      fingerIpadNative('magic', 'PORTRAIT', 'dark'),
    ],
    done: 'Both captures PASS from the bundled page (capacitor://localhost), 60 Hz regime.',
  },
  {
    id: 'ipad-secure-origin',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 2,
    title: 'iPad secure origin: start the HTTPS fronts and prove the constraint',
    issues: [2211],
    person: [
      'Confirm the two HTTPS listeners the runner is about to start (answer y).',
      'Look at the iPad: the runner opens two pages in Safari and asks what each shows.',
    ],
    done: 'The constraint probe shows "This Connection Is Not Private"; the leaf loads Splotch; Node reaches the leaf with the rig CA.',
  },
  {
    id: 'phone-overlay',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 5,
    title: 'Phone: clear the NU Navigation Bar overlay',
    issues: [2229],
    person: [
      'On the phone: Settings → Accessibility → Installed apps (or Installed services) → NU Navigation Bar → turn it OFF, wait 3 s, turn it back ON (or leave it off).',
      'If a second overlay survives: Settings → Apps → NU Navigation Bar → Force stop, then open NU Navigation Bar once so it restarts with one window.',
      'The runner re-reads `dumpsys input` every 5 s and says PASS once the centre column has taken touches for 30 s straight.',
      'After PASS you may leave: the rest of visit 1 runs on its own.',
    ],
    done: 'PASS: no untrusted nu.nav.bar overlay sums past Android’s 0.8 obscuring limit.',
  },
  {
    id: 'phone-ab',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 0,
    unattendedMinutes: 25,
    title: 'Phone: #2229 portrait A/B (e5142fab vs 3928cd88, plus Reduce Motion)',
    issues: [2229],
    person: ['Nothing — leave the phone alone.'],
    done: '9 captures, each with 160 of 160 pointerdowns, fidelity PASS and 120 Hz; the comparison table is drafted.',
  },
  {
    id: 'ipad-secure-actions',
    visit: 1,
    rig: 'bring-up',
    personMinutes: 0,
    unattendedMinutes: 55,
    title: 'iPad Safari action sweeps over the secure origin, all four modes',
    issues: [2211],
    person: ['Nothing — leave the iPad alone.'],
    done: 'Four sweeps complete, none blocked-coverage, every AI-waiting sample a secure context; the fronts are stopped.',
  },
  {
    id: 'ipad-update',
    visit: 2,
    personMinutes: 3,
    unattendedMinutes: 25,
    title: 'iPad: update to iPadOS 26.6 (issue 2237 step 1)',
    issues: [2237],
    person: [
      'iPad: Settings → General → Software Update → iPadOS 26.6 → Update Now; enter the passcode.',
      'While it installs, the next step (iPhone) runs. When the iPad restarts: unlock it, tap Trust if asked, open Safari to one tab.',
    ],
    done: 'The iPad reports iPadOS 26.6 and is unlocked with Safari open.',
  },
  {
    id: 'iphone-inset',
    visit: 2,
    personMinutes: 10,
    optional: true,
    title: 'Notched iPhone: verify ios.contentInset "never" (#2249)',
    issues: [2249],
    person: [
      'Plug in and unlock the notched iPhone (skip this step if you do not have one).',
      'Answer each check the runner asks, looking at the phone.',
    ],
    done: 'Every check answered; failures are listed in the draft.',
  },
  {
    id: 'update-bring-up',
    visit: 2,
    personMinutes: 3,
    title: `iPad ${IPAD_UPDATE_OS}: wait for the update, then bring the rig up again`,
    issues: [2237],
    person: [
      `The runner waits until the iPad reports iPadOS ${IPAD_UPDATE_OS}. Then unlock it, tap Trust if asked, and leave it on its charger.`,
      'Watch the iPad: the update ends the WebDriverAgent runner, so an "Enter iPad Passcode for XCTest" prompt may appear — enter the passcode and allow it.',
    ],
    done: `iPad on iPadOS ${IPAD_UPDATE_OS}; preview, probe host, Appium and WebDriverAgent all answer; the served build is this checkout’s clean build.`,
  },
  {
    id: 'ipad-constraint-probe',
    visit: 2,
    rig: 'update-bring-up',
    personMinutes: 2,
    title: `iPad ${IPAD_UPDATE_OS}: prove the secure-origin constraint probe again`,
    issues: [2211],
    person: [
      'Confirm the two HTTPS listeners the runner is about to start (answer y).',
      'Look at the iPad: the runner opens the constraint probe and then the leaf in Safari, and asks what each shows.',
    ],
    done: `The constraint probe shows "This Connection Is Not Private" on ${IPAD_UPDATE_OS} and the leaf loads Splotch; the verdict is a row in the committed constraint-probe log; both fronts are stopped.`,
  },
  {
    id: 'ipad-paired',
    visit: 2,
    rig: 'update-bring-up',
    personMinutes: 7,
    title: `iPad Safari on ${IPAD_UPDATE_OS}, portrait: paired pen and Magic controls`,
    issues: [2237],
    person: [
      'You never open a page: the runner opens Safari at its own address for every capture. Just press Enter here.',
      'Hold the iPad in PORTRAIT and keep it there for this whole step.',
      'During a DRIVEN capture, do not touch the iPad — WebDriverAgent draws.',
      'During a FINGER capture, draw with ONE finger from "Draw now" until "Stop".',
    ],
    captures: [
      onIpadOs(IPAD_UPDATE_OS, drivenIpadWeb('pen', 'PORTRAIT', 'light', 'driven')),
      onIpadOs(IPAD_UPDATE_OS, fingerIpadWeb('pen', 'PORTRAIT', 'light', 'finger')),
      onIpadOs(IPAD_UPDATE_OS, drivenIpadWeb('magic', 'PORTRAIT', 'dark', 'driven')),
      onIpadOs(IPAD_UPDATE_OS, fingerIpadWeb('magic', 'PORTRAIT', 'dark', 'finger')),
    ],
    done: 'Each capture PASS: trusted touch and cadence pass, 60 Hz regime, this checkout’s product commit, enough finger-down time.',
  },
  {
    id: 'ipad-commit-check',
    visit: 2,
    personMinutes: 4,
    title: `iPad ${IPAD_UPDATE_OS}: the ADR-0173 commit check`,
    issues: [2237],
    person: ['Keep the iPad unlocked with Safari in front; do not touch it while the check runs.'],
    done: 'perf:ios:webkit:commit prints PASS, BREACH, or NOT EVALUATED; the release-notes lines are drafted.',
  },
];

// The iPadOS a step's iPad work is held to: the release the visit runs on.
export function stepIpadOs(step) {
  return step.visit === 1 ? IPAD_SESSION_OS : IPAD_UPDATE_OS;
}

export function sessionStep(id) {
  const step = PERSON_SESSION_STEPS.find((candidate) => candidate.id === id);
  if (!step) {
    throw new Error(
      `unknown step "${id}" — steps are ${PERSON_SESSION_STEPS.map((s) => s.id).join(', ')}`
    );
  }
  return step;
}

export function sessionTotals(steps = PERSON_SESSION_STEPS) {
  const byVisit = {};
  for (const step of steps) {
    const visit = (byVisit[step.visit] ??= { personMinutes: 0, unattendedMinutes: 0 });
    visit.personMinutes += step.personMinutes;
    visit.unattendedMinutes += step.unattendedMinutes ?? 0;
  }
  return byVisit;
}

// Which step may run next, given the recorded statuses. The iPadOS update is
// the one ordering the runner enforces rather than suggests: no 26.5 task may
// run after it, and it may not start while one is still owed.
export function stepOrderProblem(stepId, statuses) {
  const updateIndex = PERSON_SESSION_STEPS.findIndex((step) => step.id === 'ipad-update');
  const index = PERSON_SESSION_STEPS.findIndex((step) => step.id === stepId);
  const beforeUpdate = PERSON_SESSION_STEPS.slice(0, updateIndex);
  if (index < updateIndex && ['done', 'running'].includes(statuses['ipad-update'])) {
    return `${stepId} runs on iPadOS ${IPAD_SESSION_OS}, and the iPad update has already started`;
  }
  if (stepId === 'ipad-update') {
    const owed = beforeUpdate
      .filter((step) => step.issues.length && !['done', 'skipped'].includes(statuses[step.id]))
      .map((step) => step.id);
    if (owed.length) {
      return `the iPad update must be last among the iPad tasks; still owed: ${owed.join(', ')} (finish them or pass --skip=<id>)`;
    }
  }
  return null;
}

// The bring-up a session resuming at `stepId` re-runs first. Servers it
// recorded may be gone — a --teardown, a reboot, a lost cable — so a step that
// needs the rig re-proves it, as a fresh start would.
export function resumeBringUp(stepId) {
  return sessionStep(stepId).rig ?? null;
}

export function nextStep(statuses) {
  return (
    PERSON_SESSION_STEPS.find((step) => !['done', 'skipped'].includes(statuses[step.id])) ?? null
  );
}

// PASS when no untrusted nu.nav.bar overlay can drop a touch. Android sums one
// uid's USE_OPACITY windows under a POINT (untrustedOcclusionAt), so the
// verdict evaluates every point where the overlays' frames begin: the worst
// sum over any region is reached at the corner where that region's windows
// all start.
export function navBarOverlayVerdict(windows) {
  const overlays = windows.filter(
    (window) =>
      window.name.includes(NAV_BAR_OVERLAY_PACKAGE) &&
      window.occlusionMode === 'USE_OPACITY' &&
      !window.flags.has('NOT_VISIBLE') &&
      !window.flags.has('TRUSTED_OVERLAY') &&
      window.alpha > 0
  );
  const contains = ({ frame }, x, y) =>
    x >= frame.left && x < frame.right && y >= frame.top && y < frame.bottom;
  let worst = { opacity: 0, x: null, y: null };
  for (const x of new Set(overlays.map((window) => window.frame.left))) {
    for (const y of new Set(overlays.map((window) => window.frame.top))) {
      const byUid = new Map();
      for (const window of overlays.filter((candidate) => contains(candidate, x, y))) {
        byUid.set(
          window.ownerUid,
          1 - (1 - (byUid.get(window.ownerUid) ?? 0)) * (1 - window.alpha)
        );
      }
      for (const opacity of byUid.values()) {
        if (opacity > worst.opacity) worst = { opacity, x, y };
      }
    }
  }
  const combined = Math.round(worst.opacity * 1000) / 1000;
  const pass = combined <= ANDROID_MAX_OBSCURING_OPACITY;
  return {
    pass,
    windows: overlays.length,
    combinedOpacity: combined,
    point: worst.x === null ? null : `(${worst.x},${worst.y})`,
    detail: overlays.length
      ? `${overlays.length} USE_OPACITY ${NAV_BAR_OVERLAY_PACKAGE} window(s); at (${worst.x},${worst.y}) one uid's windows combine to ${combined} (${pass ? '≤' : '>'} ${ANDROID_MAX_OBSCURING_OPACITY})`
      : `no USE_OPACITY ${NAV_BAR_OVERLAY_PACKAGE} window`,
  };
}

// One passing read is not a cleared overlay. On 2026-09-24 the rig phone's
// nu.nav.bar windows dropped out of one `dumpsys input` read and came straight
// back at 0.96, so the step passed and the A/B's own re-check failed. Seven
// reads at the runner's five-second poll span six intervals: thirty seconds of
// the column staying clear.
export const OVERLAY_STEADY_READS = 7;

export function overlaySteadilyClear(verdicts, reads = OVERLAY_STEADY_READS) {
  return verdicts.length >= reads && verdicts.slice(-reads).every((verdict) => verdict.pass);
}

// Columns of a probe event row (tools/perf/probes/real-screen-probe.js).
const EVENT_TYPE = 2;
const EVENT_TRUSTED = 8;
const POINTERDOWN = 0;

export function trustedPointerdowns(report) {
  return (report?.events ?? []).filter(
    (row) => row[EVENT_TYPE] === POINTERDOWN && row[EVENT_TRUSTED] === 1
  ).length;
}

function firstPointerdownAt(report) {
  const row = (report?.events ?? []).find((event) => event[EVENT_TYPE] === POINTERDOWN);
  return row ? row[1] : null;
}

// What #2232's decision needs from one Magic finger capture: the worst
// in-contact gap, how far into the drawing it came, and the share with that one
// episode's lost time taken out (approximate: the episode's time past one beat).
export function magicFirstLoadReading(artifact, scored) {
  const phase = scored?.summaries?.phases?.[0];
  if (!phase) return null;
  const beat = scored.summaries.intervalMs ?? null;
  const episodes = (phase.starvation?.episodes ?? []).filter(
    (episode) => episode.population === 'inContact'
  );
  const worst = [...episodes].sort((a, b) => b.gapMs - a.gapMs)[0] ?? null;
  const firstDown = firstPointerdownAt(artifact.report);
  const pacing = phase.pacing ?? {};
  const lostShare = phase.starvation?.inContact?.lostFrameTimeShare ?? pacing.lostFrameTimeShare;
  const worstExcess = worst && beat ? Math.max(0, worst.gapMs - beat) : 0;
  // The gate's own share, less the one episode's time past a beat: an
  // approximation, since the charge credits some late frames (ADR-0136).
  const withoutWorst =
    Number.isFinite(lostShare) && pacing.elapsedMs > 0
      ? Math.max(0, lostShare - worstExcess / pacing.elapsedMs)
      : null;
  return {
    lostFrameTimeShare: lostShare ?? null,
    worstInContactGapMs: worst?.gapMs ?? null,
    worstOnsetAfterFirstTouchMs:
      worst && firstDown !== null ? Math.round(worst.startMs - firstDown) : null,
    firstLoadStall: (worst?.gapMs ?? 0) >= MAGIC_STALL_MIN_MS,
    lostFrameTimeShareWithoutWorst:
      withoutWorst === null ? null : Math.round(withoutWorst * 1e6) / 1e6,
  };
}

const percent = (share) =>
  Number.isFinite(share) ? `${Math.round(share * 10_000) / 100}%` : 'n/a';

// The on-the-spot verdict. REDO means the capture cannot be scored or cannot
// be the cell it claims to be — a person can fix it by doing it again. Each
// reason names what to do differently.
export function captureVerdict(artifact, expect) {
  const reasons = [];
  if (!artifact) return { status: 'REDO', reasons: ['no artifact was written'], metrics: {} };
  const scored = rescoreCapture(artifact, {
    name: expect.label ?? 'capture',
    targetId: expect.target,
  });
  if (!scored) {
    return { status: 'REDO', reasons: ['the artifact carries no probe report'], metrics: {} };
  }
  const phase = scored.summaries.phases[0];
  const lost = phase.starvation?.inContact?.lostFrameTimeShare ?? phase.pacing?.lostFrameTimeShare;
  const metrics = {
    lostFrameTimeShare: lost ?? null,
    gate: scored.drawing?.passed === true ? 'green' : 'red',
    beatMs: scored.regime.intervalMs,
    regime: scored.regime.verdict,
    contactSeconds: phase.contactSeconds ?? null,
    movesPerSecond: phase.input?.movesPerSecond ?? null,
    fidelity: scored.fidelity.passed ? 'pass' : 'fail',
  };

  if (numberInvalidatingFailure(scored.fidelity)) {
    const failed = Object.entries(scored.fidelity.checks)
      .filter(([, passed]) => passed === false)
      .map(([name]) => name);
    reasons.push(
      `input fidelity failed (${failed.join(', ')}) — ` +
        (failed.includes('trustedTouch')
          ? 'the touches were not trusted: use one finger, no stylus'
          : 'too few moves per frame: draw continuously and keep the finger down')
    );
  } else if (onlyUncalibratedChecksFailed(scored.fidelity)) {
    metrics.fidelity = `pass (uncalibrated: ${scored.fidelity.uncalibrated.join(', ')})`;
  }
  if (!scored.regime.scoreable) {
    reasons.push(
      `the capture presented at ${scored.regime.intervalMs ?? '?'} ms (${scored.regime.verdict}), ` +
        `not the ${scored.regime.expected ?? 'declared'} regime — ` +
        (expect.kind === 'ipad-finger' ? 'draw a little slower and in longer strokes' : 'recapture')
    );
  }
  if (expect.productCommit !== undefined && artifact.productCommit !== expect.productCommit) {
    reasons.push(
      `product commit ${artifact.productCommit ?? 'null'} is not the expected ${expect.productCommit ?? 'null'}`
    );
  }
  if (expect.buildDigest && artifact.buildDigest !== expect.buildDigest) {
    reasons.push(
      `served build digest ${artifact.buildDigest} is not the one proven against the arm's worktree`
    );
  }
  if (artifact.brush && artifact.brush !== expect.brush) {
    reasons.push(`the artifact says ${artifact.brush}, not ${expect.brush}`);
  }
  if (artifact.observedTheme && expect.theme && artifact.observedTheme !== expect.theme) {
    reasons.push(`the page resolved ${artifact.observedTheme}, not ${expect.theme}`);
  }
  if (artifact.orientation && expect.orientation && artifact.orientation !== expect.orientation) {
    reasons.push(`captured ${artifact.orientation}, not ${expect.orientation}`);
  }
  if (expect.minContactSeconds && !(phase.contactSeconds >= expect.minContactSeconds)) {
    reasons.push(
      `only ${phase.contactSeconds ?? 0} s of finger-down time (need ${expect.minContactSeconds}) — keep the finger on the glass`
    );
  }
  if (expect.brush === 'eraser' && expect.kind === 'ipad-finger') {
    if (!artifact.eraserFill || artifact.eraserFill.error) {
      reasons.push('the eraser page fill was not verified, so the eraser may have erased nothing');
    }
  }
  if (expect.kind === 'android-driven') {
    const downs = trustedPointerdowns(artifact.report);
    metrics.pointerdowns = `${downs}/${artifact.dispatchedStrokes ?? '?'}`;
    if (!Number.isInteger(artifact.dispatchedStrokes) || downs !== artifact.dispatchedStrokes) {
      reasons.push(
        `the page recorded ${downs} pointerdowns for ${artifact.dispatchedStrokes ?? 'an unrecorded number of'} swipes — an overlay or another window took touches`
      );
    }
    if (expect.reduceMotion === 'reduce' && artifact.observedReducedMotion !== true) {
      reasons.push('Reduce Motion was seeded but the page did not resolve reduced motion');
    }
    if (expect.reduceMotion === 'system' && artifact.observedReducedMotion !== false) {
      reasons.push('the page resolved reduced motion on an arm that must run with full motion');
    }
  }
  if (expect.kind === 'ipad-native-finger') {
    if (artifact.pageDelivery !== 'bundled') {
      reasons.push(`page delivery was ${artifact.pageDelivery}, not the bundled app`);
    }
  }
  metrics.lostFrameTimeShareText = percent(lost);
  return { status: reasons.length ? 'REDO' : 'PASS', reasons, metrics, scored };
}

// #2211's done-when, per sweep: an actions.json whose AI-waiting samples all
// ran in a secure context. The runner already refuses a print without that
// proof; this confirms the sweep reached them at all rather than blocking them.
export function secureSweepProblem(actions) {
  const blocked = actions?.actionPlan?.blocked ?? [];
  if (blocked.length) {
    return `blocked coverage: ${blocked.map((entry) => entry.label).join(', ')}`;
  }
  const ai = (actions?.samples ?? []).filter((sample) => sample?.aiRun);
  if (!ai.length) return 'no AI-waiting sample carries aiRun evidence';
  const insecure = ai.filter((sample) => sample.aiRun.secureContext !== true);
  return insecure.length
    ? `${insecure.length} AI-waiting sample(s) did not run in a secure context`
    : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function abSummary(results) {
  return AB_2229_ARMS.map((arm) => {
    const shares = results
      .filter((result) => result.arm === arm.id && result.status === 'PASS')
      .map((result) => result.metrics.lostFrameTimeShare);
    return {
      arm: arm.id,
      commit: arm.commit.slice(0, 12),
      reduceMotion: arm.reduceMotion,
      n: shares.length,
      shares: shares.map(percent).join(' / '),
      median: percent(median(shares)),
    };
  });
}

function table(rows) {
  if (!rows.length) return '_none_';
  const keys = Object.keys(rows[0]);
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [
    line(keys),
    line(keys.map(() => '---')),
    ...rows.map((row) => line(keys.map((key) => String(row[key] ?? '')))),
  ].join('\n');
}

function captureRows(results) {
  return results.map((result) => ({
    capture: result.label,
    verdict: result.status,
    lost: result.metrics?.lostFrameTimeShareText ?? 'n/a',
    gate: result.metrics?.gate ?? '',
    beat: result.metrics?.beatMs ? `${result.metrics.beatMs} ms` : '',
    contact: result.metrics?.contactSeconds ? `${result.metrics.contactSeconds} s` : '',
    moves: result.metrics?.movesPerSecond ? `${result.metrics.movesPerSecond}/s` : '',
    ...(result.metrics?.pointerdowns ? { pointerdowns: result.metrics.pointerdowns } : {}),
  }));
}

// The comment the runner drafts for the maintainer to approve and post. It
// states measurements and leaves the rulings (ADR-0174 standing or reopening,
// a #2232 disposition) to the maintainer.
export function draftIssueComment({ title, context, results = [], extra = [] }) {
  return [
    `## ${title}`,
    '',
    ...context,
    '',
    table(captureRows(results)),
    '',
    ...extra,
    '',
    '_Drafted by `npm run perf:session:person`; every capture above was judged PASS on the spot before it was kept. Raw artifacts are under the session directory named in the context line; promote them with `perf:evidence:keep` before they are pruned._',
  ].join('\n');
}
