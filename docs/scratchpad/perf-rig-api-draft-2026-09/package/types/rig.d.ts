/**
 * The rig (`perf-rig/rig`).
 *
 * A rig is the host plus the devices cabled to it: the processes the harness may stop, the tools
 * it expects, the identifiers it must never commit. Everything here is host-local and travels as
 * flags or a local config file, never as environment and never in a committed artifact. A
 * desktop-only user never imports this entry point.
 */

import type { CaptureOptions, HostOptions } from './capture.js';

export interface RigDefinition extends HostOptions {
  readonly evidenceRoot?: string;
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
  /** Host concerns an agent-driven rig has and a laptop does not. */
  readonly host?: {
    readonly sandboxMarkerEnv?: string;
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
  readonly ports: Readonly<Partial<Record<HostPortRole, number>>>;
  readonly portDecisions: Readonly<
    Partial<
      Record<
        HostPortRole,
        { readonly port: number; readonly action: string; readonly reason: string }
      >
    >
  >;
}

type HostPortRole = keyof NonNullable<HostOptions['ports']>;

export interface PreflightOptions {
  readonly endpoints?: readonly string[];
  readonly androidSerial?: string;
  readonly iosUdid?: string;
  readonly appiumUrl?: string;
  readonly previewPort?: number;
  readonly wakeAndroid?: boolean;
  readonly holdAndroidAwake?: boolean;
  readonly verifyAndroidInput?: boolean;
  readonly verifyIosLaunch?: boolean;
  readonly json?: boolean;
  readonly logTimestamp?: boolean;
}

/** Prove the rig can capture the requested endpoints; reuses what runs, never stops a foreign listener. A preflight proves only the operations it performs. */
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
    readonly capture: Pick<
      CaptureOptions,
      'human' | 'device' | 'server' | 'dimensions' | 'label' | 'output'
    >;
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
    readonly capture?: Pick<
      CaptureOptions,
      'human' | 'device' | 'server' | 'dimensions' | 'label' | 'output'
    >;
    readonly promote?: {
      readonly campaign: string;
      readonly corpus: string;
      readonly productCommit: string;
    };
  }
): Promise<
  readonly {
    readonly step: string;
    readonly status: 'pass' | 'fail' | 'skipped';
    readonly detail: string;
  }[]
>;

/** Turn a hand capture and a known-bad control into a proposed expectations block; refuses without the control. */
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

/** The cheapest drawing page that could exist, rendered with the contract's selectors and measured by the same probe. A diagnostic, never a gate. */
export declare function serveFloorControl(options: {
  readonly port: number;
  readonly reportDir: string;
}): Promise<{ readonly url: string; stop(): Promise<void> }>;

export declare function defineRig<const R extends RigDefinition>(rig: R): R;
