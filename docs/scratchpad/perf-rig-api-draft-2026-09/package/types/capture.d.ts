/**
 * `capture()` — one call for every capture path.
 *
 * The call resolves the app, target and scenario into a plan, refuses transport pairings it has
 * not proved, runs the guard sequence, drives the input, collects the measurement, attaches
 * instruments, scores, and writes the artifact. A guard that fails stops the capture before
 * measurement with exit 2; the artifact is still written with the trust ledger. A verdict that
 * fails never stops a write: the artifact lands first and the process exits 1 after.
 */

import type { AppContract, DimensionOf } from './app.js';
import type { CaptureArtifact, GuardId, TrustEntry } from './artifact.js';
import type { GatePolicy, GateVerdict } from './gates.js';
import type { Scenario, ScenarioKind } from './scenario.js';
import type { RefreshRegimeId, TargetDefinition, Viewport } from './target.js';
import type { InputTransportId, MeasurementChannelId } from './transport.js';
import type { RigDefinition } from './rig.js';

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

export interface CaptureRequest<
  A extends AppContract = AppContract,
  S extends Scenario<A> = Scenario<A>,
> {
  readonly app: A;
  readonly target: TargetDefinition;
  readonly scenario: S;
  readonly gates?: GatePolicy;
  readonly options?: CaptureOptions<A>;
  readonly rig?: RigDefinition;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: HarnessEvent) => void;
  readonly timeouts?: Readonly<Partial<Record<TimeoutId, number>>>;
  /** The test seam: injected process, clock, file and fetch effects. Declared as such. */
  readonly effects?: Partial<HarnessEffects>;
}

export type TimeoutId =
  'ready' | 'hydration' | 'toolCommit' | 'dimensionSet' | 'prime' | 'planPoll' | 'report' | 'phase';

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
  | 'build-mode-unsupported'
  | 'probe-host-unreachable-from-device'
  | 'loopback-probe-host'
  | 'missing-contract-field'
  | 'unknown-capture-runtime'
  | 'unknown-dimension-value';

export interface CaptureOptions<A extends AppContract = AppContract> {
  readonly label?: string;
  readonly output?: string;
  /**
   * `build` runs the build contract; `reuse` serves what `outputDir` holds and asserts freshness;
   * `url` attaches to a server someone else runs and asserts identity unless `allowForeignBuild`
   * says the mismatch is deliberate (an A/B against a historical build).
   */
  readonly build?: {
    readonly mode: 'build' | 'reuse' | 'url';
    readonly url?: string;
    readonly allowForeignBuild?: boolean;
  };
  readonly server?: {
    readonly port?: number;
    readonly probeHostPort?: number;
    readonly attachOnly?: boolean;
  };
  readonly dimensions?: Readonly<Partial<Record<DimensionOf<A>, string>>>;
  readonly fixture?: string;
  readonly viewport?: Viewport;
  readonly headed?: boolean;
  readonly transport?: {
    readonly input?: InputTransportId;
    readonly channel?: MeasurementChannelId;
    readonly activation?: 'trusted' | 'webdriver-element-click';
  };
  /** Overrides the target's declared regime for this capture; recorded in the artifact. */
  readonly refreshRegime?: RefreshRegimeId | null;
  readonly device?: DeviceSelection;
  readonly repeats?: number;
  /** Fields of the scenario a script may vary per run without defining a new scenario. */
  readonly scenarioOverrides?: ScenarioOverrides;
  readonly human?: {
    readonly seconds?: number;
    readonly open?: 'adb' | 'devicectl' | 'manual';
    readonly buzz?: boolean;
  };
  /** Record verdicts but exit zero. Never affects what is written. */
  readonly reportOnly?: boolean;
  /** Guards that may report `failed` without stopping the capture; each is a named exception in the artifact. */
  readonly tolerate?: readonly GuardId[];
  readonly instruments?: readonly InstrumentRequest[];
  readonly forensics?: boolean;
}

export type InstrumentRequest =
  | { readonly id: 'cdp-cpu-throttle'; readonly rate: number }
  | { readonly id: 'cdp-tracing' }
  | { readonly id: 'cdp-network-emulation'; readonly profile: 'slow-4g' | 'offline' }
  | { readonly id: 'android-refresh-pin'; readonly hz: number }
  | { readonly id: 'webkit-timeline-count' }
  | { readonly id: 'host-quiet'; readonly maxLoadPerCore: number };

export interface ScenarioOverrides {
  readonly repeats?: number;
  readonly pauseMs?: number;
  readonly contactCapMs?: number;
  readonly phases?: readonly string[];
  readonly repeatedAction?: { readonly count?: number; readonly pauseMs?: number };
  readonly groups?: readonly string[];
  readonly drive?: {
    readonly hz?: number;
    readonly shape?: 'mixed' | 'long' | 'short';
    readonly pointerType?: 'touch' | 'pen' | 'mouse';
  };
  readonly freeDrawSeconds?: number;
  readonly rotateBeforeRepeatedAction?: boolean;
}

export interface DeviceSelection {
  readonly id?: string;
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

export interface CaptureResult<K extends ScenarioKind = ScenarioKind> {
  readonly artifactPath: string;
  readonly artifact: CaptureArtifact<K>;
  readonly trust: readonly TrustEntry[];
  readonly gate?: GateVerdict;
  readonly exitCode: ExitCode;
  readonly warnings: readonly string[];
}

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
  readonly probeDigest: string | null;
  readonly instrumentFingerprint: string;
  readonly ports: Readonly<Record<string, number>>;
  readonly refusals: readonly {
    readonly code: RefusalCode;
    readonly message: string;
    readonly remedy: string;
  }[];
}

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
    readonly device?: DeviceSelection;
    readonly server?: CaptureOptions['server'];
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
