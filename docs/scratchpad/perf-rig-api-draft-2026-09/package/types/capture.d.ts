/**
 * `capture()` — one call for every capture path.
 *
 * The call resolves the app, target and scenario into a plan, refuses transport pairings it has
 * not proved, runs the guard sequence, drives the input, collects the measurement, attaches
 * instruments, scores, and writes the artifact. A guard that fails stops the capture before
 * measurement with exit 2 and writes a `RefusedCapture`: the plan, the trust ledger and whatever
 * the page reported, never a fabricated measurement. A verdict that fails never stops a write: the
 * artifact lands first and the process exits 1 after.
 */

import type { AppContract, DimensionSelection, ToolOf } from './app.js';
import type {
  CaptureArtifactOf,
  GuardId,
  RefusedCapture,
  TrustEntry,
  VerdictId,
} from './artifact.js';
import type { GatePolicy, GateVerdict } from './gates.js';
import type { Scenario, ScenarioKind } from './scenario.js';
import type { FidelityExpectations } from './scoring.js';
import type { RefreshRegimeId, TargetDefinition, Viewport } from './target.js';
import type { InputTransportId, MeasurementChannelId } from './transport.js';

export declare const EXIT: {
  readonly ok: 0;
  /** A verdict failed after measurement, or a gate breached. */
  readonly failed: 1;
  /** A guard refused before measurement; the artifact carries the trust ledger. */
  readonly refused: 2;
  /** Prerequisites missing; `doctor` names them. */
  readonly unready: 3;
};
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

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

/** The host-local facts a single capture may need; `perf-rig/rig` extends this for the device lifecycle. */
export interface HostOptions {
  readonly outputRoot: string;
  readonly ports?: Readonly<Partial<Record<PortRole, PortPolicy>>>;
  readonly appium?: {
    readonly url?: string;
    readonly capabilitiesFile?: string;
    readonly wdaLocalPort?: number;
    /** Signing inputs for the WebDriverAgent runner; host facts, never the app's. */
    readonly wdaBundleId?: string;
    readonly xcodeConfigFile?: string;
    readonly allowProvisioning?: boolean;
  };
}

export interface CaptureRequest<
  A extends AppContract = AppContract,
  S extends Scenario<A> = Scenario<A>,
> {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly scenario: S;
  /** The app's thresholds, exceptions and allowances; without them a capture is banked unscored. */
  readonly gates?: GatePolicy;
  /**
   * The app's per-runtime fidelity table. Required for a `frames` capture on a transport whose
   * `reports.fidelity` is true; `planCapture` refuses such a request without it, because the
   * package ships no default and silence would read as a pass.
   */
  readonly fidelity?: FidelityExpectations;
  readonly options?: CaptureOptions<A>;
  readonly host?: HostOptions;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: HarnessEvent) => void;
  readonly timeouts?: Readonly<Partial<Record<TimeoutId, number>>>;
  /** The test seam: injected process, clock, file and fetch effects. Declared as such. */
  readonly effects?: Partial<HarnessEffects>;
}

export type TimeoutId =
  | 'ready'
  | 'hydration'
  | 'toolCommit'
  | 'dimensionSet'
  | 'prime'
  | 'planPoll'
  | 'report'
  | 'phase'
  | 'settle';

export interface HarnessEffects {
  readonly now: () => number;
  readonly readFile: (path: string) => Promise<string>;
  readonly spawn: (
    command: readonly string[],
    options: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> }
  ) => Promise<{ readonly stdout: string; readonly exitCode: number }>;
  readonly fetch: typeof fetch;
}

export type HarnessEvent =
  | { readonly kind: 'guard'; readonly entry: TrustEntry }
  | { readonly kind: 'heartbeat'; readonly events: number; readonly bankedMs: number }
  | { readonly kind: 'phase'; readonly key: string; readonly state: 'waiting' | 'drawing' | 'done' }
  | { readonly kind: 'refusal'; readonly code: RefusalCode; readonly remedy: string }
  | { readonly kind: 'log'; readonly level: 'info' | 'warn'; readonly message: string };

export type RefusalCode =
  | 'unproved-transport-pairing'
  | 'transport-cannot-drive-scenario'
  | 'too-many-pointers'
  | 'step-unsupported-on-channel'
  | 'human-input-needs-channel'
  | 'build-mode-unsupported'
  | 'probe-host-unreachable-from-device'
  | 'loopback-probe-host'
  | 'missing-contract-field'
  | 'unknown-capture-runtime'
  | 'unknown-dimension-value';

export type InstrumentRequest =
  | { readonly id: 'cdp-cpu-throttle'; readonly rate: number }
  | { readonly id: 'cdp-tracing' }
  | { readonly id: 'cdp-network-emulation'; readonly profile: 'slow-4g' | 'offline' }
  | { readonly id: 'android-refresh-pin'; readonly hz: number }
  | { readonly id: 'webkit-timeline-count' }
  /** Sampled at 1 Hz across the window and gated on the in-window mean; a witness unless `gate` is true. */
  | { readonly id: 'host-quiet'; readonly maxLoadPerCore: number; readonly gate?: boolean };

export interface CaptureOptions<A extends AppContract = AppContract> {
  readonly label?: string;
  readonly output?: string;
  readonly build?: {
    readonly mode: 'build' | 'reuse' | 'url';
    readonly url?: string;
    readonly allowForeignBuild?: boolean;
  };
  readonly server?: {
    readonly port?: number;
    readonly probeHostPort?: number;
    readonly attachOnly?: boolean;
    readonly noRebind?: boolean;
  };
  readonly dimensions?: DimensionSelection<A>;
  readonly fixture?: string;
  readonly viewport?: Viewport;
  readonly headed?: boolean;
  readonly transport?: {
    readonly input?: InputTransportId;
    readonly channel?: MeasurementChannelId;
    readonly activation?: 'trusted' | 'webdriver-element-click';
  };
  readonly refreshRegime?: RefreshRegimeId | null;
  readonly device?: DeviceSelection;
  /** Fields of the scenario a script may vary per run without defining a new scenario. */
  readonly scenarioOverrides?: ScenarioOverrides<A>;
  readonly human?: {
    readonly seconds?: number;
    readonly open?: 'adb' | 'devicectl' | 'manual';
    readonly terminateExisting?: boolean;
    readonly buzz?: boolean;
  };
  readonly reportOnly?: boolean;
  /** Guards and verdicts that may fail without stopping or failing the capture; each is recorded as `tolerated`. */
  readonly tolerate?: readonly (GuardId | VerdictId)[];
  readonly instruments?: readonly InstrumentRequest[];
  readonly forensics?: boolean;
}

export interface ScenarioOverrides<A extends AppContract = AppContract> {
  readonly gestureRepeats?: number;
  readonly gesturePauseMs?: number;
  readonly contactCapMs?: number;
  readonly phases?: readonly string[];
  readonly tool?: ToolOf<A>;
  readonly hud?: boolean;
  readonly input?:
    | { readonly kind: 'transport' }
    | {
        readonly kind: 'probe-synthetic';
        readonly hz?: number;
        readonly shape?: 'mixed' | 'long' | 'short';
        readonly pointerType?: 'touch' | 'pen' | 'mouse';
      }
    | { readonly kind: 'human' };
  readonly repeatedAction?: {
    readonly count?: number;
    readonly pauseMs?: number;
    readonly rotateBefore?: boolean;
    readonly settleMs?: number;
  };
  readonly actionRepeats?: { readonly warmup?: number; readonly scored?: number };
  readonly groups?: readonly string[];
  readonly freeDrawSeconds?: number;
  readonly cycles?: number;
}

export interface DeviceSelection {
  readonly id?: string;
  readonly name?: string;
  readonly appiumUrl?: string;
  /** Replaces the built-in capability set entirely; must carry every native capability. */
  readonly capabilitiesFile?: string;
  readonly sessionId?: string;
  readonly cdpPort?: number;
  readonly wdaUrl?: string;
  readonly probeHost?: string;
  readonly webviewClass?: string;
  readonly deviceClass?: 'tablet' | 'handset' | 'desktop';
}

export type CaptureResult<K extends ScenarioKind = ScenarioKind> =
  | {
      readonly outcome: 'captured';
      readonly artifactPath: string;
      readonly artifact: CaptureArtifactOf<K>;
      readonly trust: readonly TrustEntry[];
      readonly gate?: GateVerdict;
      readonly exitCode: typeof EXIT.ok | typeof EXIT.failed;
      readonly warnings: readonly string[];
    }
  | {
      readonly outcome: 'refused';
      readonly artifactPath: string;
      readonly artifact: RefusedCapture;
      readonly trust: readonly TrustEntry[];
      readonly exitCode: typeof EXIT.refused;
      readonly warnings: readonly string[];
    };

export declare function capture<A extends AppContract, S extends Scenario<A>>(
  request: CaptureRequest<A, S>
): Promise<CaptureResult<S['kind']>>;

/** Resolve without running; `perf-rig capture --dry-run` prints this. */
export declare function planCapture<A extends AppContract>(
  request: CaptureRequest<A>
): Promise<CapturePlan>;

export interface CapturePlan {
  readonly endpoint: string;
  readonly transport: { readonly input: InputTransportId; readonly channel: MeasurementChannelId };
  readonly guards: readonly GuardId[];
  readonly verdicts: readonly VerdictId[];
  readonly probeDigest: string | null;
  readonly instrumentFingerprint: string;
  readonly ports: Readonly<Partial<Record<PortRole, number>>>;
  readonly refusals: readonly {
    readonly code: RefusalCode;
    readonly message: string;
    readonly remedy: string;
  }[];
}

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
    readonly id: InputTransportId;
    readonly usable: boolean;
    readonly reason?: string;
  }[];
  /** Every contract hook evaluated against the served page, and every parameterised procedure compiled for every member. */
  readonly contract: readonly {
    readonly field: string;
    readonly ok: boolean;
    readonly detail: string;
  }[];
  /** From the app's fidelity table, per runtime: which checks are uncalibrated and which not applicable. */
  readonly calibration: readonly {
    readonly runtime: string;
    readonly uncalibrated: readonly string[];
    readonly notApplicable: readonly string[];
  }[];
}

/** Inventory the host and evaluate the contract against a served page (`serve: true` starts one). */
export declare function doctor(
  app: AppContract,
  options?: {
    readonly url?: string;
    readonly serve?: boolean;
    readonly host?: HostOptions;
    readonly fidelity?: FidelityExpectations;
  }
): Promise<DoctorReport>;

export declare function serve(
  app: AppContract,
  options: { readonly port: number; readonly strictPort?: boolean }
): Promise<{ readonly url: string; stop(): Promise<void> }>;

export declare function serveProbeHost(
  app: AppContract,
  options: { readonly port: number; readonly upstream: string; readonly reportDir: string }
): Promise<{ readonly url: string; readonly bootstrapDigest: string; stop(): Promise<void> }>;

/** Open a measurement channel on a target without a scenario, for app scripts that drive their own harness route. */
export declare function openChannel(
  app: AppContract,
  target: TargetDefinition,
  options: {
    readonly path: string;
    readonly ready: string;
    readonly build?: CaptureOptions['build'];
    readonly instruments?: readonly InstrumentRequest[];
    readonly device?: DeviceSelection;
    readonly server?: CaptureOptions['server'];
    readonly host?: HostOptions;
  }
): Promise<{
  evaluate<T>(expression: string): Promise<T>;
  waitForGlobal<T>(
    expression: string,
    options: { readonly timeoutMs: number; readonly progress?: string }
  ): Promise<T>;
  readTable(name: string): Promise<readonly unknown[]>;
  trace?: { start(): Promise<void>; stop(): Promise<string> };
  close(): Promise<void>;
}>;
