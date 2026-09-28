// The terms a performance-matrix manifest and report are read in: how a
// section's evidence is routed into the report, and which release role a target
// row plays. The generator, the section-age report, and the campaign fold all
// classify by them.

// A cell whose raw capture is not committed still has published, normalized
// evidence in the last data.json. Copying that forward is how a rerun of the
// generator keeps a first valid result — including a red gate — instead of
// silently dropping the cell or recapturing it into a different number.
export const PRESERVED = 'preserved';
export const CAPTURED_UNTRACKED = 'captured-untracked';

export const RELEASE_GATE = 'release-gate';
export const REGRESSION_TRIPWIRE = 'regression-tripwire';
export const ADVISORY = 'advisory';

// ADR-0156 assigns a row its release role by the hardware it ran on, not by its
// fidelity class: three of the four physical rows are advisory in the fidelity
// sense (uncalibrated input checks, ADR-0139) and gate a release anyway.
const ROLE_BY_DEVICE_KIND = {
  physical: RELEASE_GATE,
  desktop: REGRESSION_TRIPWIRE,
  simulator: ADVISORY,
  emulator: ADVISORY,
};

export function targetRole(target) {
  if (!Object.hasOwn(ROLE_BY_DEVICE_KIND, target.deviceKind)) {
    throw new Error(
      `Target ${target.id} declares deviceKind ${JSON.stringify(target.deviceKind)}, which ADR-0156 assigns no release role.`
    );
  }
  return ROLE_BY_DEVICE_KIND[target.deviceKind];
}
