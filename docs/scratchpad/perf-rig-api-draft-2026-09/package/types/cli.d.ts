/**
 * The command line, at the published rung only. Not exported from any entry point; at the nested
 * rung an app's own scripts call the library and this file is the plan for what a CLI wraps.
 *
 * `perf-rig` reads `perf-rig.config.mjs` from the working directory (exporting `app`, `targets`,
 * `scenarios`, `gates`, and optional `rig`, `fidelity`, `campaigns`). Every command takes `--json`.
 */

export type CliCommand =
  | 'init'
  | 'doctor'
  | 'capture'
  | 'serve'
  | 'probe-host'
  | 'probe render'
  | 'preflight'
  | 'operator'
  | 'calibrate'
  | 'release'
  | 'campaign plan'
  | 'campaign run'
  | 'campaign status'
  | 'rescore'
  | 'evidence keep'
  | 'analyze frames'
  | 'analyze chrome'
  | 'analyze web-inspector'
  | 'floor-control'
  | 'verify input'
  | 'verify rotation'
  | 'probe-overhead';

/** External programs the package shells out to, discovered by `doctor`, never dependencies. */
export declare const HOST_TOOLS: readonly {
  readonly name:
    | 'adb'
    | 'xcrun'
    | 'idevice_id'
    | 'iproxy'
    | 'pymobiledevice3'
    | 'appium'
    | 'perfetto'
    | 'xctrace';
  readonly neededBy: readonly string[];
}[];
