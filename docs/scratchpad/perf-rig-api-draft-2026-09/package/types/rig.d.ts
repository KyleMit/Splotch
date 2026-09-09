/**
 * The rig.
 *
 * A rig is the host plus the devices cabled to it: ports, the processes the harness is allowed to
 * stop, the tools it expects, the identifiers it must never commit. Everything in a rig is
 * host-local and travels as flags or a local config file, never as environment and never in a
 * committed artifact. Three lifecycle commands: `preflight` proves the rig can capture,
 * `operator` collects the inputs only a human at the devices can give, `release` puts it back.
 */

export type PortRole =
  'preview' | 'probe' | 'appium' | 'wda' | 'androidCdp' | 'inspector' | 'floorControl';

export interface PortPolicy {
  readonly port: number;
  /**
   * What to do when a listener holds the port. Never stops a listener another checkout owns;
   * "ours" is decided by the listener's working directory, not its command line.
   */
  readonly onConflict:
    'replace-if-ours-or-shift' | 'reuse-compatible-or-shift' | 'reuse-or-shift' | 'shift';
  readonly shiftTo: readonly number[];
}

export interface RigDefinition {
  /** Root under which captures are written; the tracked evidence subtree is declared separately. */
  readonly outputRoot: string;
  readonly evidenceRoot?: string;
  readonly ports: Readonly<Record<PortRole, PortPolicy>>;
  readonly devices?: {
    readonly androidSerial?: string;
    readonly iosUdid?: string;
    /** Regexes for identifiers that must never reach a committed file. */
    readonly identifierPatterns: readonly { readonly kind: string; readonly pattern: RegExp }[];
  };
  /**
   * How a process is recognised as this harness's own. Ownership is placement inside a checkout
   * root (or a registered worktree container); unknown ownership is foreign ownership.
   */
  readonly ownership: {
    readonly checkoutRoot: string;
    readonly worktreeContainers: readonly string[];
    readonly ownedScriptPatterns: readonly RegExp[];
  };
  readonly appium?: {
    readonly url?: string;
    readonly capabilitiesFile?: string;
    readonly wdaLocalPort?: number;
  };
  /** Name of an environment variable that marks a sandbox where USB enumeration is denied. */
  readonly sandboxMarkerEnv?: string;
  /** Path to a tracked log of automation-grant attempts, and the salt that pseudonymises devices in it. */
  readonly grantLog?: { readonly path: string; readonly salt: string };
}

export interface ReadinessCheck {
  readonly name: string;
  readonly status: 'ok' | 'warn' | 'blocked';
  readonly detail: string;
  /** What to run or change. Every blocked check names its remedy. */
  readonly remedy?: string;
}

export interface ReadinessVerdict {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly checks: readonly ReadinessCheck[];
  readonly androidSerial: string | null;
  readonly iosUdid: string | null;
  readonly ports: Readonly<Record<PortRole, number>>;
  readonly portDecisions: Readonly<
    Record<PortRole, { readonly port: number; readonly action: string; readonly reason: string }>
  >;
}

export interface PreflightOptions {
  readonly wakeAndroid?: boolean;
  readonly holdAndroidAwake?: boolean;
  /** Drive a real touch against the floor control and read the cadence; also proves the page follows a rotation. */
  readonly verifyAndroidInput?: boolean;
  /** A real WebDriverAgent build and session, about a minute, exclusive. */
  readonly verifyIosLaunch?: boolean;
  readonly json?: boolean;
}

/**
 * Prove the rig can capture before a campaign spends hours on cells that cannot be scored. It
 * reuses whatever is already running, moves off a contended port rather than stopping a listener,
 * prints the hardware identifier a driver wants rather than the one the platform CLI prints, and
 * refuses to report ready while anything is unresolved. A preflight proves only the operations it
 * performs; the verify flags exist because a green preflight once preceded eight lost cells.
 */
export declare function preflight(
  rig: RigDefinition,
  options?: PreflightOptions
): Promise<ReadinessVerdict>;

export interface OperatorStep {
  readonly id: string;
  readonly platform: 'ios' | 'android';
  readonly instructions: readonly string[];
  readonly run: (context: {
    readonly readiness: ReadinessVerdict;
  }) => Promise<{ readonly status: 'pass' | 'fail'; readonly detail: string }>;
}

/**
 * A guided session for the inputs only a human at the devices can give: arming an automation
 * grant whose prompt exists only while a launch is running, and real-finger calibration captures.
 * Takes readiness from `preflight` as the authority on devices and ports, and leaves the rig up.
 */
export declare function operatorSession(
  rig: RigDefinition,
  steps: readonly OperatorStep[]
): Promise<
  readonly {
    readonly step: string;
    readonly status: 'pass' | 'fail' | 'skipped';
    readonly detail: string;
  }[]
>;

export interface ReleasePlan {
  readonly stop: readonly {
    readonly pid: number;
    readonly role: 'driver' | 'automation-server' | 'server';
    readonly command: string;
  }[];
  readonly drain: readonly { readonly sessionId: string; readonly url: string }[];
  readonly blocked: readonly { readonly pid: number; readonly reason: string }[];
  readonly leave: readonly {
    readonly pid: number;
    readonly verdict: 'foreign' | 'tunnel';
    readonly reason: string;
  }[];
  readonly deviceReset: readonly string[];
}

/** Mirror image of `preflight`: stop what this checkout owns, drain automation sessions first, reset the phone. */
export declare function planRelease(
  rig: RigDefinition,
  options?: { readonly stopCampaigns?: boolean; readonly hostOnly?: boolean }
): Promise<ReleasePlan>;
export declare function release(
  rig: RigDefinition,
  plan: ReleasePlan
): Promise<{ readonly failures: readonly string[] }>;

/** Scan text for identifiers the rig declares must never be committed; returns masked findings. */
export declare function scanForDeviceIdentifiers(
  text: string,
  rig: RigDefinition
): readonly { readonly kind: string; readonly masked: string; readonly line: number }[];

export declare function defineRig<const R extends RigDefinition>(rig: R): R;
