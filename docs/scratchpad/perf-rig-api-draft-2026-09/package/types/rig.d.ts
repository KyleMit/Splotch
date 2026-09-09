/**
 * The rig.
 *
 * A rig is the host plus the devices cabled to it: ports, the processes the harness may stop, the
 * tools it expects, the identifiers it must never commit. Everything here is host-local and travels
 * as flags or a local config file, never as environment and never in a committed artifact. A
 * desktop-only user needs none of it; every field is optional and `preflight` reports what a
 * requested endpoint would need.
 */

export type PortRole =
  'preview' | 'probe' | 'appium' | 'wda' | 'androidCdp' | 'inspector' | 'floorControl';

export interface PortPolicy {
  readonly port: number;
  /** Never stops a listener another checkout owns; "ours" is decided by the listener's working directory. */
  readonly onConflict:
    'replace-if-ours-or-shift' | 'reuse-compatible-or-shift' | 'reuse-or-shift' | 'shift';
  readonly shiftTo: readonly number[];
}

export declare const DEFAULT_PORTS: Readonly<Record<PortRole, PortPolicy>>;

export interface RigDefinition {
  readonly outputRoot: string;
  readonly evidenceRoot?: string;
  readonly ports?: Readonly<Partial<Record<PortRole, PortPolicy>>>;
  readonly devices?: {
    readonly androidSerial?: string;
    readonly iosUdid?: string;
    readonly identifierPatterns?: readonly { readonly kind: string; readonly pattern: string }[];
  };
  /** How a process is recognised as this harness's own; unknown ownership is foreign ownership. */
  readonly ownership?: {
    readonly checkoutRoot: string;
    readonly worktreeContainers?: readonly string[];
    readonly ownedScriptPatterns?: readonly string[];
  };
  readonly appium?: {
    readonly url?: string;
    readonly capabilitiesFile?: string;
    readonly wdaLocalPort?: number;
  };
  /** Host concerns an agent-driven rig has and a laptop does not. */
  readonly host?: {
    readonly sandboxMarkerEnv?: string;
    /** A tracked log of automation-grant attempts, device pseudonymised with the salt. */
    readonly grantLog?: { readonly path: string; readonly salt: string };
  };
}

export interface ReadinessCheck {
  readonly name: string;
  readonly status: 'ok' | 'warn' | 'blocked';
  readonly detail: string;
  readonly remedy?: string;
}

export interface ReadinessVerdict {
  readonly ready: boolean;
  readonly blockers: readonly string[];
  readonly checks: readonly ReadinessCheck[];
  readonly androidSerial: string | null;
  readonly iosUdid: string | null;
  readonly ports: Readonly<Partial<Record<PortRole, number>>>;
  readonly portDecisions: Readonly<
    Partial<
      Record<PortRole, { readonly port: number; readonly action: string; readonly reason: string }>
    >
  >;
}

export interface PreflightOptions {
  readonly endpoints?: readonly string[];
  readonly androidSerial?: string;
  readonly iosUdid?: string;
  readonly appiumUrl?: string;
  readonly wakeAndroid?: boolean;
  readonly holdAndroidAwake?: boolean;
  /** Drive a real touch against the floor control and read the cadence; also proves the page follows a rotation. */
  readonly verifyAndroidInput?: boolean;
  /** A real WebDriverAgent build and session, about a minute, exclusive. */
  readonly verifyIosLaunch?: boolean;
  readonly json?: boolean;
}

/**
 * Prove the rig can capture the requested endpoints. Reuses whatever is already running, moves off
 * a contended port rather than stopping a listener, prints the hardware identifier a driver wants
 * rather than the one the platform CLI prints, and refuses to report ready while anything is
 * unresolved. A preflight proves only the operations it performs.
 */
export declare function preflight(
  rig: RigDefinition,
  options?: PreflightOptions
): Promise<ReadinessVerdict>;

export interface OperatorStep {
  readonly id: string;
  readonly platform: 'ios' | 'android';
  readonly instructions: readonly string[];
  run(context: {
    readonly readiness: ReadinessVerdict;
  }): Promise<{ readonly status: 'pass' | 'fail'; readonly detail: string }>;
}

/** Arms an automation grant whose prompt exists only while a launch is running, then runs the app's hand-capture steps. */
export declare function operatorSession(
  rig: RigDefinition,
  steps: readonly OperatorStep[],
  options?: {
    readonly plan?: boolean;
    readonly only?: readonly string[];
    readonly grantAttempts?: number;
  }
): Promise<
  readonly {
    readonly step: string;
    readonly status: 'pass' | 'fail' | 'skipped';
    readonly detail: string;
  }[]
>;

/**
 * Turn a hand capture and a known-bad control on one runtime into a proposed expectations block
 * with `basis` and `negativeControl` filled from the two artifacts. Refuses without the control:
 * a positive corpus is not a calibration.
 */
export declare function calibrate(options: {
  readonly runtime: string;
  readonly handArtifact: string;
  readonly badControlArtifact: string;
}): Promise<{ readonly proposal: string }>;

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

export declare function planRelease(
  rig: RigDefinition,
  options?: {
    readonly stopCampaigns?: boolean;
    readonly hostOnly?: boolean;
    readonly androidSerial?: string;
  }
): Promise<ReleasePlan>;
export declare function release(
  rig: RigDefinition,
  plan: ReleasePlan,
  options?: { readonly json?: boolean }
): Promise<{ readonly failures: readonly string[] }>;

export declare function scanForDeviceIdentifiers(
  text: string,
  rig: RigDefinition
): readonly { readonly kind: string; readonly masked: string; readonly line: number }[];

/**
 * The floor control: the cheapest drawing page that could exist, rendered with the contract's
 * selectors and measured by the same probe, so browser-floor frame loss can be separated from the
 * app's. A diagnostic, never a gate.
 */
export declare function serveFloorControl(options: {
  readonly port: number;
  readonly reportDir: string;
}): Promise<{ readonly url: string; stop(): Promise<void> }>;

export declare function defineRig<const R extends RigDefinition>(rig: R): R;
