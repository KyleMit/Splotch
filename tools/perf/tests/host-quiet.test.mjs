import { describe, expect, it } from 'vitest';
import {
  HOST_QUIET_MAX_LOAD_PER_CORE,
  describeHostQuiet,
  hostQuietRecord,
  hostQuietTrustState,
  sampleHostLoad,
} from '../lib/host-quiet.mjs';

describe('hostQuiet record and verdict', () => {
  it('brackets a capture with two raw samples and derives the verdict', () => {
    const record = hostQuietRecord({ load1: 1.2, cores: 10 }, { load1: 2.4, cores: 10 });
    expect(record).toMatchObject({
      load1Start: 1.2,
      load1End: 2.4,
      cores: 10,
      thresholdPerCore: HOST_QUIET_MAX_LOAD_PER_CORE,
      quiet: true,
    });
  });

  it('judges by the WORSE of the two samples — a spike at either end fails', () => {
    expect(hostQuietTrustState({ load1Start: 0.5, load1End: 8.1, cores: 10 })).toBe('failed');
    expect(hostQuietTrustState({ load1Start: 8.1, load1End: 0.5, cores: 10 })).toBe('failed');
    expect(hostQuietTrustState({ load1Start: 4.9, load1End: 5.0, cores: 10 })).toBe('verified');
  });

  // The ledger's `unrecorded` must stay distinct from a measured verdict: a
  // capture predating the samples reads null, never a pass.
  it('returns null, not a verdict, for an absent or malformed record', () => {
    expect(hostQuietTrustState(null)).toBeNull();
    expect(hostQuietTrustState(undefined)).toBeNull();
    expect(hostQuietTrustState({})).toBeNull();
    expect(hostQuietTrustState({ load1Start: 1, load1End: 'x', cores: 10 })).toBeNull();
  });

  it('samples the real host shape and rounds for the artifact', () => {
    const sample = sampleHostLoad();
    expect(sample.cores).toBeGreaterThan(0);
    expect(Number.isFinite(sample.load1)).toBe(true);
    expect(sampleHostLoad({ load1: 1.234567, cores: 8 })).toEqual({ load1: 1.23, cores: 8 });
  });

  it('describes the record with the worst-per-core figure the verdict used', () => {
    const text = describeHostQuiet({ load1Start: 1.2, load1End: 2.4, cores: 10 });
    expect(text).toContain('0.24/core');
    expect(text).toContain(`${HOST_QUIET_MAX_LOAD_PER_CORE}/core`);
  });
});
