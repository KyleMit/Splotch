/**
 * The command line.
 *
 * `perf-rig` reads `perf-rig.config.mjs` from the working directory (exporting `app`, `targets`,
 * `scenarios`, `gates`, `rig`, and optional `campaigns`) and exposes one subcommand per lifecycle
 * step. An app's `package.json` scripts wrap these with their own names; the package never
 * assumes an npm script exists.
 */

export type CliCommand =
  /** Inventory: tools on PATH, devices attached, transports usable, contract hooks reachable on a served page. */
  | 'doctor'
  /** Write a starter config with every required contract field marked, and a first desktop scenario. */
  | 'init'
  | 'capture'
  | 'serve'
  | 'probe-host'
  | 'probe render'
  | 'preflight'
  | 'operator'
  | 'release'
  | 'campaign run'
  | 'campaign status'
  | 'rescore'
  | 'evidence keep'
  | 'analyze'
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
  /** Each contract hook evaluated against the served page, so a missing hook is found before a capture. */
  readonly contract: readonly {
    readonly field: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
}

/** Exit codes shared by every command, so a wrapper script can branch without parsing output. */
export declare const EXIT: {
  readonly ok: 0;
  readonly failed: 1;
  /** A guard refused before measuring; the artifact carries the trust ledger. */
  readonly refused: 2;
  /** Prerequisites missing; `doctor` names them. */
  readonly unready: 3;
};
