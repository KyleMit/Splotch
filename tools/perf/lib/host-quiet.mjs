import { cpus, loadavg } from 'node:os';

// Issue 1304's last unrecorded trust dimension: the host drives the input, so
// competing host work changes input cadence — a measured variable, not a
// detail — and a capture taken on a busy host used to look identical to a
// clean one (it happened, 2026-08-24, and re-reading the numbers could not
// tell). The record is two raw samples bracketing the capture; the verdict is
// derived, never stored authority — readers re-derive it from the samples the
// way the matrix re-derives fidelity, so recalibrating the threshold re-scores
// history without recapturing anything.
//
// The threshold is a provisional operational rule, not a measured calibration
// (no corpus separates quiet from busy yet — issue 1344's quiet-host study is
// the vehicle for that). It is deliberately conservative: half a core of
// 1-minute load average per core on an otherwise-idle capture host.
export const HOST_QUIET_MAX_LOAD_PER_CORE = 0.5;

export function sampleHostLoad({ load1 = loadavg()[0], cores = cpus().length } = {}) {
  return { load1: Math.round(load1 * 100) / 100, cores };
}

// The artifact field: both bracket samples, raw. `quiet` is convenience for a
// human reading the file; every tool verdict re-derives from the samples.
export function hostQuietRecord(startSample, endSample) {
  const record = {
    load1Start: startSample.load1,
    load1End: endSample.load1,
    cores: startSample.cores,
    thresholdPerCore: HOST_QUIET_MAX_LOAD_PER_CORE,
  };
  return { ...record, quiet: hostQuietTrustState(record) === 'verified' };
}

// 'verified' | 'failed' from a recorded hostQuiet block, or null when the
// capture recorded nothing — the ledger's `unrecorded`, which must stay
// distinct from a measured verdict.
export function hostQuietTrustState(record) {
  const { load1Start, load1End, cores } = record ?? {};
  if (!Number.isFinite(load1Start) || !Number.isFinite(load1End) || !Number.isFinite(cores)) {
    return null;
  }
  const worstPerCore = Math.max(load1Start, load1End) / cores;
  return worstPerCore <= HOST_QUIET_MAX_LOAD_PER_CORE ? 'verified' : 'failed';
}

export function describeHostQuiet(record) {
  const { load1Start, load1End, cores } = record;
  const worst = Math.round((Math.max(load1Start, load1End) / cores) * 100) / 100;
  return `worst load ${worst}/core over ${cores} cores (start ${load1Start}, end ${load1End}) vs ${HOST_QUIET_MAX_LOAD_PER_CORE}/core`;
}
