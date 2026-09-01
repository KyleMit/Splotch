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
// The Appium screen module also owns the gesture plan (trustedGestureActions)
// and native canvas geometry, which is why it appears in the split command's
// list too — the split drivers import both.
const APPIUM_SCREEN_CAPTURE = 'tools/perf/ios/capture-xcuitest-screen.mjs';
// The action sweep (runActionSweep) lives in the Appium actions module and is
// imported by the CDP and desktop action runners alike.
const APPIUM_ACTIONS_CAPTURE = 'tools/perf/ios/capture-xcuitest-actions.mjs';
const ERASER_FILL = 'tools/perf/lib/eraser-fill.mjs';

export const INSTRUMENT_FILES_BY_COMMAND = {
  'perf:device:frames': [
    'tools/perf/split-capture/capture-device-frames.mjs',
    'tools/perf/split-capture/lib/page-bootstrap.mjs',
    'tools/perf/split-capture/lib/probe-host.mjs',
    'tools/perf/split-capture/lib/probe-host-protocol.mjs',
    'tools/perf/split-capture/lib/report-store.mjs',
    'tools/perf/split-capture/lib/android-input.mjs',
    'tools/perf/split-capture/lib/chrome-tabs.mjs',
    APPIUM_SCREEN_CAPTURE,
    SHARED_SCREEN_PROBE,
    ERASER_FILL,
  ],
  'perf:ios:xcuitest:screen': [APPIUM_SCREEN_CAPTURE, SHARED_SCREEN_PROBE, ERASER_FILL],
  'perf:ios:xcuitest:actions': [APPIUM_ACTIONS_CAPTURE, SHARED_ACTION_PROBE],
  'perf:android:browser:actions': [
    'tools/perf/android/capture-browser-actions.mjs',
    APPIUM_ACTIONS_CAPTURE,
    SHARED_ACTION_PROBE,
  ],
  'perf:web:frames': ['tools/perf/web/capture-local-frames.mjs', SHARED_SCREEN_PROBE],
  'perf:web:actions': [
    'tools/perf/web/capture-desktop-actions.mjs',
    APPIUM_ACTIONS_CAPTURE,
    SHARED_ACTION_PROBE,
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

// Null when resuming is safe; otherwise the refusal, naming exactly which
// instrument files changed since the campaign's cells were banked — and which
// CELLS the ledger records as banked under a different fingerprint.
// `bankedElsewhere` can refuse on its own: instrument.json holds only the
// current instrument and is rewritten every invocation, so after one accepted
// change it matches while the banked rows still name the mixture (session
// 01a03f61 defeated the file-level check exactly that way).
export function instrumentChangeProblem(recorded, current, bankedElsewhere = []) {
  const filesChanged = recorded && recorded.fingerprint !== current.fingerprint;
  if (!filesChanged && !bankedElsewhere.length) return null;
  const parts = [
    'the capture instrument changed since this campaign banked its cells — resuming would ' +
      'silently mix two instruments in one target (issue 1293).',
  ];
  if (filesChanged) {
    const names = new Set([...Object.keys(recorded.files ?? {}), ...Object.keys(current.files)]);
    const changed = [...names].filter((file) => recorded.files?.[file] !== current.files[file]);
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
