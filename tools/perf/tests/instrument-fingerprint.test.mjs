import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import {
  INSTRUMENT_FILES_BY_COMMAND,
  instrumentChangeProblem,
  instrumentFilesFor,
  instrumentFingerprint,
  overlappingInstrumentFingerprints,
} from '../lib/instrument-fingerprint.mjs';
import { CAMPAIGN_TARGETS, planCampaign } from '../lib/campaign-plan.mjs';

// Issue 1293: a resumed campaign silently kept cells the old capture path
// produced, mixing two instruments in one target. The fingerprint is built per
// command from the modules each capture's measurement and dispatch flow
// through, so an edit to a file a command depends on moves that command's
// fingerprint (no false negatives) and an edit to a file it does not depend on
// does not (no routine --accept-instrument-change prompts for other targets).
describe('the per-command instrument file lists', () => {
  it('declares a list for every command any campaign plan can run', () => {
    const planned = new Set(
      Object.keys(CAMPAIGN_TARGETS).flatMap((targetId) =>
        planCampaign(targetId, {
          outputRoot: 'out',
          host: { appiumUrl: 'http://127.0.0.1:4723', capabilitiesFile: '/tmp/caps.json' },
        }).map((cell) => cell.command)
      )
    );

    for (const command of planned) {
      expect(INSTRUMENT_FILES_BY_COMMAND[command], command).toBeDefined();
      expect(INSTRUMENT_FILES_BY_COMMAND[command].length, command).toBeGreaterThan(0);
    }
  });

  it('lists only files that exist, so a moved module fails here rather than hashing nothing', () => {
    for (const [command, files] of Object.entries(INSTRUMENT_FILES_BY_COMMAND)) {
      for (const file of files) {
        expect(existsSync(join(ROOT, file)), `${command}: ${file}`).toBe(true);
      }
    }
  });

  it('refuses a command it has no list for', () => {
    expect(() => instrumentFilesFor(['perf:not-a-command'])).toThrow(
      'no instrument file list is declared for perf:not-a-command'
    );
  });

  it('unions and sorts the files of a multi-command plan', () => {
    const files = instrumentFilesFor(['perf:device:frames', 'perf:android:browser:actions']);

    expect(files).toEqual([...new Set(files)].sort());
    expect(files).toContain('tools/perf/split-capture/lib/android-input.mjs');
    expect(files).toContain('tools/perf/split-capture/lib/probe-host-protocol.mjs');
    expect(files).toContain('tools/perf/android/capture-browser-actions.mjs');
  });
});

describe('the capture-instrument fingerprint', () => {
  const read = (contents) => (file) => contents[file] ?? `stable:${file}`;

  it('is stable over the same content', () => {
    const contents = {};

    expect(instrumentFingerprint(['perf:web:frames'], read(contents))).toEqual(
      instrumentFingerprint(['perf:web:frames'], read(contents))
    );
  });

  // The review's representative-change requirement: one edit per command's own
  // surface moves that command's fingerprint and leaves an unrelated command's
  // alone — the two failure modes of the retired global list, checked from
  // both sides.
  it('moves for a command that depends on the edited file and holds for one that does not', () => {
    const before = {};
    const after = { 'tools/perf/split-capture/lib/android-input.mjs': 'edited dispatch' };

    const splitBefore = instrumentFingerprint(['perf:device:frames'], read(before));
    const splitAfter = instrumentFingerprint(['perf:device:frames'], read(after));
    const desktopBefore = instrumentFingerprint(['perf:web:frames'], read(before));
    const desktopAfter = instrumentFingerprint(['perf:web:frames'], read(after));

    expect(splitAfter.fingerprint).not.toBe(splitBefore.fingerprint);
    expect(desktopAfter.fingerprint).toBe(desktopBefore.fingerprint);
  });

  it('reads the real instrument modules without error for a real plan', () => {
    const current = instrumentFingerprint(['perf:device:frames', 'perf:android:browser:actions']);

    expect(current.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(current.files)).toEqual(
      instrumentFilesFor(['perf:device:frames', 'perf:android:browser:actions'])
    );
  });

  it('recovers command-scoped fingerprints from a legacy union fingerprint', () => {
    const readFile = read({});
    const union = instrumentFingerprint(
      ['perf:ios:xcuitest:actions', 'perf:ios:xcuitest:screen'],
      readFile
    );
    const actions = instrumentFingerprint(['perf:ios:xcuitest:actions'], readFile);
    const overlap = overlappingInstrumentFingerprints(union, actions, [
      'perf:ios:xcuitest:actions',
    ]);

    expect(overlap).toEqual({ recorded: actions, current: actions });
  });

  it('keeps shared banked files guarded when the requested command set widens', () => {
    const screenFile = 'tools/perf/ios/capture-xcuitest-screen.mjs';
    const recorded = instrumentFingerprint(
      ['perf:ios:xcuitest:screen'],
      read({ [screenFile]: 'banked screen' })
    );
    const current = instrumentFingerprint(
      ['perf:ios:xcuitest:screen', 'perf:ios:xcuitest:actions'],
      read({ [screenFile]: 'current screen' })
    );
    const overlap = overlappingInstrumentFingerprints(recorded, current, [
      'perf:ios:xcuitest:screen',
      'perf:ios:xcuitest:actions',
    ]);

    expect(instrumentChangeProblem(overlap.recorded, overlap.current)).toContain(screenFile);
    expect(Object.keys(overlap.current.files)).not.toContain('tools/perf/probes/action-probe.js');
  });
});

describe('refusing a resume across an instrument change', () => {
  const fingerprintOf = (contents) =>
    instrumentFingerprint(['perf:web:frames'], (file) => contents[file] ?? `stable:${file}`);

  it('is silent on a first run and on an unchanged instrument', () => {
    const current = fingerprintOf({});

    expect(instrumentChangeProblem(null, current)).toBeNull();
    expect(instrumentChangeProblem(current, current)).toBeNull();
  });

  it('names exactly the files that changed, and how to proceed', () => {
    const recorded = fingerprintOf({});
    const current = fingerprintOf({ 'tools/perf/probes/real-screen-probe.js': 'edited probe' });

    const problem = instrumentChangeProblem(recorded, current);
    expect(problem).toContain('tools/perf/probes/real-screen-probe.js');
    expect(problem).not.toContain('capture-local-frames.mjs\n');
    expect(problem).toContain('--accept-instrument-change');
    expect(problem).toContain('issue 1293');
  });

  // A plan narrowed or widened with --items drops or adds whole file sets with
  // no content moving; counting those as changes refused exactly the resumes
  // the guard exists to allow (Codex review of the distillation stack). Only a
  // file both instruments hashed, with differing hashes, proves a change.
  it('stays silent when --items widens the plan to files the record never hashed', () => {
    const recorded = fingerprintOf({});
    const current = instrumentFingerprint(
      ['perf:web:frames', 'perf:web:actions'],
      (file) => `stable:${file}`
    );

    expect(instrumentChangeProblem(recorded, current)).toBeNull();
  });

  it('stays silent when --items narrows the plan below the recorded file set', () => {
    const recorded = instrumentFingerprint(
      ['perf:web:frames', 'perf:web:actions'],
      (file) => `stable:${file}`
    );
    const current = fingerprintOf({});

    expect(instrumentChangeProblem(recorded, current)).toBeNull();
  });

  it('still refuses when a shared file changed under a narrowed plan', () => {
    const recorded = instrumentFingerprint(
      ['perf:web:frames', 'perf:web:actions'],
      (file) => `stable:${file}`
    );
    const current = fingerprintOf({ 'tools/perf/probes/real-screen-probe.js': 'edited probe' });

    expect(instrumentChangeProblem(recorded, current)).toContain('real-screen-probe.js');
  });

  it('names the cells the ledger banked under a different fingerprint', () => {
    const recorded = fingerprintOf({});
    const current = fingerprintOf({ 'tools/perf/probes/real-screen-probe.js': 'edited probe' });

    const problem = instrumentChangeProblem(recorded, current, [
      { cell: 'portrait-light/pen', fingerprint: 'fp-old' },
    ]);
    expect(problem).toContain('portrait-light/pen');
    expect(problem).toContain('fp-old');
  });

  // Session 01a03f61: instrument.json is rewritten every invocation, so after
  // one accepted change it matches the current instrument while the banked
  // rows still name the mixture — the rows alone must be able to refuse.
  it('refuses on banked-cell evidence alone, with instrument.json agreeing', () => {
    const current = fingerprintOf({});

    const problem = instrumentChangeProblem(current, current, [
      { cell: 'portrait-light/pen', fingerprint: 'fp-old' },
    ]);
    expect(problem).toContain('portrait-light/pen');
    expect(problem).toContain('--accept-instrument-change');
    expect(instrumentChangeProblem(current, current, [])).toBeNull();
  });
});
