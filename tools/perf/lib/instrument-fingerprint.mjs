// Which version of the capture instrument produced a campaign's banked cells.
//
// A campaign is resumable, and acceptance asks whether a banked artifact
// parses, matches the runtime, passed fidelity, and is in regime — never which
// version of the capture tool produced it. So a campaign resumed after the
// capture path changed silently kept the old path's cells, and the target
// became a mixture of two instruments with nothing in the ledger saying so
// (issue 1293; the 2026-08-24 session fixed three capture-path defects in one
// sitting, and the discard-or-keep decision lived only in the operator's head).
//
// The fingerprint is built PER COMMAND, from the modules each capture command's
// measurement and dispatch actually flow through, and a campaign hashes only
// the commands its own plan runs. One global list had both failure modes the
// review named: files a command really depends on were absent (its resumed
// cells could silently mix implementations), and iOS-only files were hashed
// for Android and Mac targets (routine --accept-instrument-change prompts for
// edits that could not have touched those cells). Deliberately NOT scorers or
// fidelity tables: those re-derive at fold time, so changing them re-scores
// banked cells rather than invalidating them.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

const SHARED_SCREEN_PROBE = 'tools/perf/probes/real-screen-probe.js';
const SHARED_ACTION_PROBE = 'tools/perf/probes/action-probe.js';
const APPIUM_SCREEN_CAPTURE = 'tools/perf/ios/capture-xcuitest-screen.mjs';
// The drawing gesture a trusted-input capture replays (trustedGestureActions),
// and the canvas projection (nativeCanvasBounds) that aims its strokes and
// every action tap.
const TRUSTED_GESTURE_PLAN = 'tools/perf/lib/trusted-gesture-plan.mjs';
// The action sweep (runActionSweep) lives in the Appium actions module and is
// imported by the CDP and desktop action runners alike.
const APPIUM_ACTIONS_CAPTURE = 'tools/perf/ios/capture-xcuitest-actions.mjs';
const ERASER_FILL = 'tools/perf/lib/eraser-fill.mjs';
const UNDO_DRIVER = 'tools/perf/lib/undo-driver.mjs';
// Which button each drawing capture presses to select the brush it measures.
const BRUSH_BUTTONS = 'tools/perf/lib/brush-buttons.mjs';
// Which origin Android Chrome loads decides whether it is a secure context.
const ANDROID_LOCALHOST_ROUTE = 'tools/perf/lib/android-localhost-route.mjs';
const SERVICE_WORKER_GUARD = 'tools/perf/lib/service-worker-guard.mjs';
// Where a native Android action tap lands when an overlay obscures its centre.
const ANDROID_TOUCH_OCCLUSION = 'tools/perf/lib/android-touch-occlusion.mjs';
// Whether Appium's rotation can turn a native Android capture that released its lock.
const ANDROID_USER_ROTATION = 'tools/perf/lib/android-user-rotation.mjs';
// The Playwright stand-in for the Appium endpoints every browser action tap,
// drag and scroll is dispatched through.
const PLAYWRIGHT_WEBDRIVER = 'tools/perf/lib/webdriver-client.mjs';
// The Settings selectors and setup clicks that put the page into the cell's
// theme and orientation, and that the Settings actions tap.
const CAMPAIGN_STATE = 'tools/perf/lib/campaign-state.mjs';
// How an action sweep installs and loads the books its coloring actions open.
const COLORING_BOOKS_READY = 'tools/perf/lib/coloring-books-ready.mjs';
// probeConfigScript: the phases, contact time and drive the screen probe runs with.
const SCREEN_PROBE_CONFIG = 'tools/perf/lib/probe-config.mjs';
// Every action transport runs the one sweep, projects its taps through
// nativeCanvasBounds, and resolves each tap point through the occlusion check
// (the centre, off native Android). The actions module imports its WebDriver
// session helpers from the Appium screen module.
const ACTION_SWEEP_DISPATCH = [
  APPIUM_ACTIONS_CAPTURE,
  APPIUM_SCREEN_CAPTURE,
  TRUSTED_GESTURE_PLAN,
  ANDROID_TOUCH_OCCLUSION,
  'tools/perf/lib/native-tap-point.mjs',
  'tools/perf/lib/unavailable-undo-cue.mjs',
  CAMPAIGN_STATE,
  COLORING_BOOKS_READY,
  // FULL_ACTION_GROUPS and actionNotApplicableReason: which actions a default sweep runs.
  'tools/perf/lib/action-applicability.mjs',
  // A scorer, hashed for WARMUP_REPEATS alone: how many unscored repeats each
  // transport captures before the scored ones.
  'tools/perf/lib/action-stats.mjs',
  SHARED_ACTION_PROBE,
];

// The first file of each list is the command's entry script.
// instrument-import-graph.test.mjs walks the imports of each entry (and of the
// probe host a split capture needs) and fails on a reached module this table
// neither lists nor that test declares outside the instrument.
export const INSTRUMENT_FILES_BY_COMMAND = {
  'perf:device:frames': [
    'tools/perf/split-capture/capture-device-frames.mjs',
    'tools/perf/split-capture/lib/page-bootstrap.mjs',
    'tools/perf/split-capture/lib/probe-host.mjs',
    'tools/perf/split-capture/lib/probe-host-protocol.mjs',
    'tools/perf/split-capture/lib/report-store.mjs',
    'tools/perf/split-capture/lib/android-input.mjs',
    'tools/perf/split-capture/lib/chrome-tabs.mjs',
    ANDROID_LOCALHOST_ROUTE,
    SERVICE_WORKER_GUARD,
    TRUSTED_GESTURE_PLAN,
    BRUSH_BUTTONS,
    CAMPAIGN_STATE,
    // The Reduce Motion storage key the page bootstrap seeds.
    'tools/perf/lib/reduce-motion.mjs',
    SHARED_SCREEN_PROBE,
    ERASER_FILL,
    UNDO_DRIVER,
  ],
  'perf:ios:xcuitest:screen': [
    APPIUM_SCREEN_CAPTURE,
    TRUSTED_GESTURE_PLAN,
    BRUSH_BUTTONS,
    CAMPAIGN_STATE,
    SCREEN_PROBE_CONFIG,
    SERVICE_WORKER_GUARD,
    SHARED_SCREEN_PROBE,
    ERASER_FILL,
    UNDO_DRIVER,
  ],
  'perf:ios:xcuitest:actions': [
    ...ACTION_SWEEP_DISPATCH,
    ANDROID_USER_ROTATION,
    SERVICE_WORKER_GUARD,
  ],
  'perf:android:browser:actions': [
    'tools/perf/android/capture-browser-actions.mjs',
    ...ACTION_SWEEP_DISPATCH,
    ANDROID_LOCALHOST_ROUTE,
    PLAYWRIGHT_WEBDRIVER,
    SERVICE_WORKER_GUARD,
  ],
  'perf:web:frames': [
    'tools/perf/web/capture-local-frames.mjs',
    CAMPAIGN_STATE,
    SCREEN_PROBE_CONFIG,
    SHARED_SCREEN_PROBE,
    UNDO_DRIVER,
  ],
  'perf:web:actions': [
    'tools/perf/web/capture-desktop-actions.mjs',
    ...ACTION_SWEEP_DISPATCH,
    PLAYWRIGHT_WEBDRIVER,
  ],
};

export function instrumentFilesFor(commands) {
  const files = new Set();
  for (const command of commands) {
    const list = INSTRUMENT_FILES_BY_COMMAND[command];
    if (!list) {
      throw new Error(
        `no instrument file list is declared for ${command} — a command the fingerprint ` +
          'does not know cannot be resume-guarded (add it to INSTRUMENT_FILES_BY_COMMAND)'
      );
    }
    for (const file of list) files.add(file);
  }
  return [...files].sort();
}

export function instrumentFingerprint(commands, readFile = defaultRead) {
  const perFile = Object.fromEntries(
    instrumentFilesFor(commands).map((file) => [file, sha256(readFile(file))])
  );
  return {
    fingerprint: sha256(JSON.stringify(perFile)),
    files: perFile,
  };
}

function fingerprintSubset(instrument, files) {
  const perFile = Object.fromEntries(files.map((file) => [file, instrument.files[file]]));
  return {
    fingerprint: sha256(JSON.stringify(perFile)),
    files: perFile,
  };
}

export function overlappingInstrumentFingerprints(recorded, current, commands) {
  if (!recorded) return null;
  // A widened resume requests files for commands with no banked cells. Only the
  // shared files can describe whether the already-banked instrument changed.
  const files = instrumentFilesFor(commands).filter(
    (file) => recorded.files?.[file] && current.files?.[file]
  );
  if (!files.length) return null;
  return {
    recorded: fingerprintSubset(recorded, files),
    current: fingerprintSubset(current, files),
  };
}

// Null when resuming is safe; otherwise the refusal, naming exactly which
// instrument files changed since the campaign's cells were banked — and which
// CELLS the ledger records as banked under a different fingerprint.
// `bankedElsewhere` can refuse on its own: instrument.json holds only the
// current instrument and is rewritten every invocation, so after one accepted
// change it matches while the banked rows still name the mixture (session
// 01a03f61 defeated the file-level check exactly that way).
export function instrumentChangeProblem(recorded, current, bankedElsewhere = []) {
  // Only a file BOTH instruments hashed can prove a change: a plan narrowed or
  // widened with --items drops or adds whole file sets without any content
  // moving, and counting those as "changed" refused exactly the resumes the
  // guard exists to allow. A file the recorded run never hashed is unknown, not
  // changed — the per-row fingerprints carry the per-cell truth from here on.
  const changed = Object.keys(current.files).filter(
    (file) => recorded?.files?.[file] !== undefined && recorded.files[file] !== current.files[file]
  );
  if (!changed.length && !bankedElsewhere.length) return null;
  const parts = [
    'the capture instrument changed since this campaign banked its cells — resuming would ' +
      'silently mix two instruments in one target (issue 1293).',
  ];
  if (changed.length) {
    parts.push('Changed:\n' + changed.map((file) => `  ${file}`).join('\n'));
  }
  if (bankedElsewhere.length) {
    parts.push(
      'Cells banked under a different instrument:\n' +
        bankedElsewhere
          .map(({ cell, fingerprint }) => `  ${cell} (instrument ${fingerprint})`)
          .join('\n')
    );
  }
  parts.push(
    'Either start clean (new --output-root, or delete this campaign directory) to recapture ' +
      'everything with the current instrument, or pass --accept-instrument-change to keep the ' +
      'banked cells anyway — deliberately, on record.'
  );
  return parts.join('\n');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function defaultRead(file) {
  return readFileSync(join(ROOT, file));
}
