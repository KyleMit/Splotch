/**
 * The command line, at the published rung.
 *
 * `perf-rig` reads `perf-rig.config.mjs` from the working directory (exporting `app`, `targets`,
 * `scenarios`, `gates`, and optional `rig`, `fidelity`, `campaigns`). At the nested rung the app's
 * own scripts call the library directly and no CLI exists. Every command takes `--json`.
 */

export type CliCommand =
  /** Write a starter config: every required contract field marked with the failure it prevents, and one `actions` scenario over one declared control. */
  | 'init'
  /** Inventory: tools on PATH, devices attached, transports usable, every contract hook evaluated against a served page (`--url` or `--serve`). */
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

export interface DoctorReport {
  readonly tools: readonly {
    readonly name: string;
    readonly found: boolean;
    readonly version?: string;
    readonly neededBy: readonly string[];
  }[];
  readonly devices: readonly {
    readonly platform: 'ios' | 'android';
    readonly identifier: string;
    readonly state: string;
    readonly notes: readonly string[];
  }[];
  readonly transports: readonly {
    readonly id: string;
    readonly usable: boolean;
    readonly reason?: string;
  }[];
  readonly contract: readonly {
    readonly field: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
  readonly calibration: readonly {
    readonly runtime: string;
    readonly uncalibrated: readonly string[];
  }[];
}

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
