/**
 * `capture()` — one call for every capture path.
 *
 * The call resolves the app, target and scenario into a plan, refuses transport pairings it has
 * not proved, runs the guard sequence, drives the input, collects the measurement, attaches
 * instruments, scores, and writes the artifact. A guard that fails stops the capture before
 * anything is measured; the artifact is still written with the trust ledger so the failure is
 * evidence rather than a missing file. Scoring gates never stop a write: the artifact lands first
 * and the process exits non-zero after.
 */

import type { AppContract } from './app.js';
import type { CaptureArtifact, GuardId, TrustEntry } from './artifact.js';
import type { GatePolicy, GateVerdict } from './gates.js';
import type { Scenario } from './scenario.js';
import type { TargetDefinition, InputTransportId, MeasurementChannelId } from './index.js';
import type { RigDefinition } from './rig.js';

export interface CaptureRequest {
  readonly app: AppContract;
  readonly target: TargetDefinition;
  readonly scenario: Scenario;
  readonly gates?: GatePolicy;
  readonly options?: CaptureOptions;
  readonly rig?: RigDefinition;
}

export interface CaptureOptions {
  readonly label?: string;
  /** Exact artifact path; otherwise `artifactDirectory(rig.outputRoot, label)`. */
  readonly output?: string;
  /**
   * `build` runs the build contract; `reuse` serves what `outputDir` holds and asserts it is fresh;
   * `url` attaches to a server someone else runs and asserts identity against `outputDir` unless
   * `allowForeignBuild` says the mismatch is deliberate (an A/B against a historical build).
   */
  readonly build?: {
    readonly mode: 'build' | 'reuse' | 'url';
    readonly url?: string;
    readonly allowForeignBuild?: boolean;
  };
  /** Dimension values to set through the app's own controls before measuring. */
  readonly dimensions?: Readonly<Record<string, string>>;
  readonly orientation?: 'PORTRAIT' | 'LANDSCAPE';
  /** Overrides for the transport pair the target declares; refused if unproved. */
  readonly transport?: {
    readonly input?: InputTransportId;
    readonly channel?: MeasurementChannelId;
  };
  readonly device?: DeviceSelection;
  readonly repeats?: number;
  /** Record verdicts but exit zero. Never affects what is written. */
  readonly reportOnly?: boolean;
  /** Guards that may report `failed` without stopping the capture. Each one is a named exception in the artifact. */
  readonly tolerate?: readonly GuardId[];
  readonly instruments?: { readonly cpuThrottle?: number; readonly trace?: boolean };
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
}

export interface CaptureResult {
  readonly artifactPath: string;
  readonly artifact: CaptureArtifact;
  readonly trust: readonly TrustEntry[];
  readonly gate?: GateVerdict;
  /** Non-zero when a guard failed outside `tolerate`, fidelity failed, the regime was refused, or a gate breached. */
  readonly exitCode: 0 | 1;
  readonly warnings: readonly string[];
}

export declare function capture(request: CaptureRequest): Promise<CaptureResult>;

/**
 * Resolve without running: the transport pair, the guard sequence, the rendered probe digest, the
 * ports, and every refusal the plan would hit. `perf-rig capture --dry-run` prints this.
 */
export declare function planCapture(request: CaptureRequest): Promise<CapturePlan>;

export interface CapturePlan {
  readonly transport: { readonly input: InputTransportId; readonly channel: MeasurementChannelId };
  readonly guards: readonly GuardId[];
  readonly probeDigest: string | null;
  readonly instrumentFingerprint: string;
  readonly refusals: readonly {
    readonly code: string;
    readonly message: string;
    readonly remedy: string;
  }[];
}

/**
 * Serve the instrumented build with the seams enabled, printing reachable LAN URLs, and refuse to
 * serve a refused build variant. The wrapper owns the process group so `stop()` stops the server
 * and not only the wrapper.
 */
export declare function serve(
  app: AppContract,
  options: { readonly port: number; readonly strictPort?: boolean }
): Promise<{ readonly url: string; stop(): Promise<void> }>;

/** Start the probe host (`http-upload` channel): proxy the preview, inject the bootstrap, collect reports. */
export declare function serveProbeHost(
  app: AppContract,
  options: { readonly port: number; readonly upstream: string; readonly reportDir: string }
): Promise<{ readonly url: string; stop(): Promise<void> }>;
