import { describe, expect, it } from 'vitest';
import {
  INSTRUMENT_FILES,
  instrumentChangeProblem,
  instrumentFingerprint,
} from '../lib/instrument-fingerprint.mjs';

// Issue 1293: a resumed campaign silently kept cells the old capture path
// produced, mixing two instruments in one target. The coarse fix records a
// fingerprint of the modules that decide what a capture measures, and refuses
// a resume across a change — naming the changed files.
describe('the capture-instrument fingerprint', () => {
  const files = ['b.mjs', 'a.mjs'];
  const read = (contents) => (file) => contents[file];

  it('is stable over the same content regardless of listing order', () => {
    const contents = { 'a.mjs': 'alpha', 'b.mjs': 'beta' };

    expect(instrumentFingerprint(files, read(contents))).toEqual(
      instrumentFingerprint(['a.mjs', 'b.mjs'], read(contents))
    );
  });

  it('moves when any instrument file changes', () => {
    const before = instrumentFingerprint(files, read({ 'a.mjs': 'alpha', 'b.mjs': 'beta' }));
    const after = instrumentFingerprint(files, read({ 'a.mjs': 'alpha', 'b.mjs': 'edited' }));

    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.files['a.mjs']).toBe(before.files['a.mjs']);
    expect(after.files['b.mjs']).not.toBe(before.files['b.mjs']);
  });

  it('reads the real instrument modules without error', () => {
    const current = instrumentFingerprint();

    expect(Object.keys(current.files)).toEqual([...INSTRUMENT_FILES].sort());
    expect(current.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('refusing a resume across an instrument change', () => {
  const fingerprintOf = (contents) =>
    instrumentFingerprint(Object.keys(contents), (file) => contents[file]);

  it('is silent on a first run and on an unchanged instrument', () => {
    const current = fingerprintOf({ 'a.mjs': 'alpha' });

    expect(instrumentChangeProblem(null, current)).toBeNull();
    expect(instrumentChangeProblem(current, current)).toBeNull();
  });

  it('names exactly the files that changed, and how to proceed', () => {
    const recorded = fingerprintOf({ 'a.mjs': 'alpha', 'b.mjs': 'beta' });
    const current = fingerprintOf({ 'a.mjs': 'alpha', 'b.mjs': 'edited' });

    const problem = instrumentChangeProblem(recorded, current);
    expect(problem).toContain('b.mjs');
    expect(problem).not.toContain('a.mjs\n');
    expect(problem).toContain('--accept-instrument-change');
    expect(problem).toContain('issue 1293');
  });

  it('treats a file added to or removed from the instrument list as a change', () => {
    const recorded = fingerprintOf({ 'a.mjs': 'alpha' });
    const current = fingerprintOf({ 'a.mjs': 'alpha', 'new.mjs': 'brand new' });

    expect(instrumentChangeProblem(recorded, current)).toContain('new.mjs');
  });
});
