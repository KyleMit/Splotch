import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { INSTRUMENT_FILES_BY_COMMAND } from '../lib/instrument-fingerprint.mjs';

// The hand-kept instrument lists drifted from the code twice: the Playwright
// WebDriver stand-in and the Appium screen module's tap geometry dispatched
// every browser action while no action list hashed them, so an edit to either
// (b91d54220619818851d071cbc2eee3ed07a51821 changed Android coloring-scroll
// delivery) resumed old cells with no prompt. This walks each command's
// imports from its entry script through its listed modules and requires every
// tools/perf module it reaches to be listed or declared outside the instrument
// here. A declared module is not walked: its own imports are its concern.

const SCREEN_PROBE_CONFIG = 'tools/perf/ios/capture-webkit-frames.mjs';
// The Appium screen module's drawing capture, which the action sweep imports
// the module for none of.
const SCREEN_DRAWING_ONLY = [
  SCREEN_PROBE_CONFIG,
  'tools/perf/lib/brush-buttons.mjs',
  'tools/perf/lib/eraser-fill.mjs',
  'tools/perf/lib/undo-driver.mjs',
];
// Native Android rotation pinning runs only in the Appium action runner's own session.
const NATIVE_ANDROID_ROTATION = 'tools/perf/lib/android-user-rotation.mjs';

const OUTSIDE_EVERY_INSTRUMENT = {
  'scorers, verdicts and fidelity tables: they re-derive at fold time, so an edit re-scores banked cells rather than invalidating them':
    [
      'tools/perf/lib/action-stats.mjs',
      'tools/perf/lib/drawing-gates.mjs',
      'tools/perf/lib/frame-stamps.mjs',
      'tools/perf/lib/host-quiet.mjs',
      'tools/perf/lib/input-fidelity.mjs',
      'tools/perf/lib/real-screen-stats.mjs',
      'tools/perf/lib/refresh-regime.mjs',
      'tools/perf/lib/stroke-delivery.mjs',
      'tools/perf/lib/undo-action-stats.mjs',
    ],
  'plan, CLI, path, device and error plumbing: which cell runs and where it is written, which every artifact records':
    [
      'tools/perf/lib/action-applicability.mjs',
      'tools/perf/lib/appium-capabilities.mjs',
      'tools/perf/lib/campaign-plan.mjs',
      'tools/perf/lib/capture-attribution.mjs',
      'tools/perf/lib/capture-date.mjs',
      'tools/perf/lib/cli-args.mjs',
      'tools/perf/lib/device-identifiers.mjs',
      'tools/perf/lib/error-classification.mjs',
      'tools/perf/lib/profile-paths.mjs',
      'tools/perf/split-capture/lib/poll.mjs',
      'tools/perf/split-capture/lib/spoken-cues.mjs',
    ],
  'build and serving provenance: every artifact binds the build it measured, and acceptance checks the binding':
    [
      'tools/perf/lib/perf-serve.mjs',
      'tools/perf/lib/profile-device-session.mjs',
      'tools/perf/lib/profile-preview.mjs',
    ],
  'preflight refusals: they stop a capture on a wrong setup and never shape one that runs': [
    'tools/perf/lib/capture-readiness.mjs',
    'tools/perf/lib/profile-warnings.mjs',
  ],
  'reporting and diagnostics no scored cell comes from: the printed tables, the validated report pull, --trace, the WebKit timeline counter, and the floor control':
    [
      'tools/perf/analyze-frame-capture.mjs',
      'tools/perf/ios/bundled-report-channel.mjs',
      'tools/perf/lib/chrome-trace-capture.mjs',
      'tools/perf/lib/timeline-records.mjs',
      'tools/perf/split-capture/serve-floor-control.mjs',
    ],
};

// Imported by a listed module for code this command never runs.
const NOT_RUN_BY_COMMAND = {
  // The split runner configures its probe through the probe host, not probeConfigScript.
  'perf:device:frames': [SCREEN_PROBE_CONFIG],
  'perf:ios:xcuitest:screen': [],
  'perf:ios:xcuitest:actions': SCREEN_DRAWING_ONLY,
  'perf:android:browser:actions': [...SCREEN_DRAWING_ONLY, NATIVE_ANDROID_ROTATION],
  'perf:web:actions': [
    ...SCREEN_DRAWING_ONLY,
    NATIVE_ANDROID_ROTATION,
    // Desktop Playwright contexts start without a service worker to block.
    'tools/perf/lib/service-worker-guard.mjs',
  ],
  'perf:web:frames': [],
};

// Page sources a capture reads and injects rather than imports.
const INJECTED_PAGE_SOURCE = 'tools/perf/probes/';

const outsideEveryInstrument = new Set(Object.values(OUTSIDE_EVERY_INSTRUMENT).flat());
const packageScripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;

const RELATIVE_IMPORT =
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

function relativeImports(file) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  return [...source.matchAll(RELATIVE_IMPORT)].map((match) =>
    relative(ROOT, resolve(dirname(join(ROOT, file)), match[1] ?? match[2]))
  );
}

// The split capture drives a page that the probe host it requires running
// serves, bootstraps and collects the report from.
const COMPANION_PROCESS = { 'perf:device:frames': 'perf:device:serve' };

function entryScriptOf(command) {
  return packageScripts[command]?.match(/\bnode (tools\/perf\/\S+\.mjs)/)?.[1];
}

// Every tools/perf module the command reaches through its listed modules,
// mapped to the listed module that imports it.
function reachedModules(command) {
  const listed = new Set(INSTRUMENT_FILES_BY_COMMAND[command]);
  const reached = new Map();
  const walked = new Set();
  const pending = [command, COMPANION_PROCESS[command]].filter(Boolean).map(entryScriptOf);
  while (pending.length) {
    const file = pending.pop();
    if (walked.has(file)) continue;
    walked.add(file);
    for (const imported of relativeImports(file)) {
      if (!imported.startsWith('tools/perf/') || reached.has(imported)) continue;
      reached.set(imported, file);
      if (listed.has(imported)) pending.push(imported);
    }
  }
  return reached;
}

const commands = Object.keys(INSTRUMENT_FILES_BY_COMMAND);

describe('the instrument lists against the import graph', () => {
  it('declares what each command does not run for exactly the fingerprinted commands', () => {
    expect(Object.keys(NOT_RUN_BY_COMMAND).sort()).toEqual([...commands].sort());
  });

  it.each(commands)('%s: lists its package.json entry script first', (command) => {
    expect(entryScriptOf(command), command).toBe(INSTRUMENT_FILES_BY_COMMAND[command][0]);
  });

  it.each(commands)('%s: classifies every module its instrument imports', (command) => {
    const listed = new Set(INSTRUMENT_FILES_BY_COMMAND[command]);
    const notRun = new Set(NOT_RUN_BY_COMMAND[command]);
    const unclassified = [...reachedModules(command)]
      .filter(
        ([file]) => !listed.has(file) && !notRun.has(file) && !outsideEveryInstrument.has(file)
      )
      .map(([file, importer]) => `${file} (imported by ${importer})`);

    expect(
      unclassified,
      `add each to ${command}'s INSTRUMENT_FILES_BY_COMMAND list, or declare why it is outside ` +
        'the instrument in instrument-import-graph.test.mjs'
    ).toEqual([]);
  });

  // The positive control on the walk: a listed module it cannot reach is a
  // stale list entry, or a regex that stopped seeing imports.
  it.each(commands)('%s: reaches every module it lists', (command) => {
    const reached = reachedModules(command);
    const [entry, ...rest] = INSTRUMENT_FILES_BY_COMMAND[command];
    const unreached = rest.filter(
      (file) => !file.startsWith(INJECTED_PAGE_SOURCE) && !reached.has(file)
    );

    expect(reached.size, entry).toBeGreaterThan(0);
    expect(unreached, command).toEqual([]);
  });

  it.each(commands)(
    '%s: declares as not run only modules it reaches and does not list',
    (command) => {
      const reached = reachedModules(command);
      const stale = NOT_RUN_BY_COMMAND[command].filter(
        (file) => !reached.has(file) || INSTRUMENT_FILES_BY_COMMAND[command].includes(file)
      );

      expect(stale, command).toEqual([]);
    }
  );

  it('declares outside every instrument only modules some command reaches and none lists', () => {
    const reachedAnywhere = new Set(
      commands.flatMap((command) => [...reachedModules(command).keys()])
    );
    const listedAnywhere = new Set(Object.values(INSTRUMENT_FILES_BY_COMMAND).flat());
    const stale = [...outsideEveryInstrument].filter(
      (file) => !reachedAnywhere.has(file) || listedAnywhere.has(file)
    );

    expect(stale).toEqual([]);
  });
});
