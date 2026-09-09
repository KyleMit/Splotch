/**
 * Transports, channels, drivers, and instruments.
 *
 * Input and measurement are separate channels, and coupling them lets the driver corrupt the
 * number. A capture names both, and the package refuses pairings it has not proved. A transport
 * declares structural facts about the input it produces; whether that input is hand-shaped enough
 * to score is the app's calibration, never the transport's claim.
 *
 * The driver and channel interfaces are exported for reading; v1 has no registration path.
 */

import type { Activation, TransportCapability } from './app.js';
import type { ProcedureResult } from './procedure.js';
import type { ReportFor } from './artifact.js';
import type { ScenarioKind } from './scenario.js';
import type { Platform } from './target.js';

export type InputTransportId =
  'desktop-playwright' | 'appium' | 'wda-http' | 'adb-input' | 'cdp-touch' | 'human';

export type MeasurementChannelId =
  | 'same-process'
  | 'cdp-evaluate'
  | 'webkit-inspector'
  | 'appium-execute'
  | 'http-upload'
  | 'preferences-mailbox';

export type InstrumentId =
  | 'cdp-cpu-throttle'
  | 'cdp-network-emulation'
  | 'cdp-tracing'
  | 'android-refresh-pin'
  | 'android-gfxinfo'
  | 'perfetto'
  | 'xctrace'
  | 'host-quiet'
  | 'webkit-timeline-count';

export interface TransportCapabilities {
  readonly trusted: boolean;
  /** Structural only. `synthetic` cannot pass a hand-calibrated gate; `under-drives` is known too slow for a drawing stream. */
  readonly handShape: 'reference' | 'unknown' | 'under-drives' | 'synthetic';
  readonly maxPointers: number;
  readonly nativeContext: boolean;
  readonly needsHuman: boolean;
  readonly channels: readonly MeasurementChannelId[];
  readonly defaultChannel: MeasurementChannelId;
  /** Which verdicts a capture over this transport writes; a drawing artifact missing one is refused. */
  readonly reports: { readonly fidelity: boolean; readonly refreshRegime: boolean };
  /** Scenario kinds this transport may drive, per platform. `appium` draws on iOS and only taps on Android. */
  readonly drives: Readonly<Partial<Record<ScenarioKind, readonly Platform[] | 'all'>>>;
  /** Facts the transport can set from outside the page. */
  readonly capabilities: readonly TransportCapability[];
  /** Procedure steps the transport can honour as trusted input; others fall back to the in-page bootstrap or refuse. */
  readonly steps: readonly ('tap' | 'press' | 'type' | 'hover' | 'wheel' | 'drag')[];
}

export declare const TRANSPORTS: Readonly<Record<InputTransportId, TransportCapabilities>>;

export type PointerType = 'touch' | 'pen' | 'mouse';

export interface PointerSequence {
  readonly source: string;
  readonly pointerType: PointerType;
  readonly actions: readonly PointerAction[];
}

export type PointerAction =
  | {
      readonly type: 'pointerMove';
      readonly duration: number;
      readonly origin: 'viewport';
      readonly x: number;
      readonly y: number;
      readonly pressure?: number;
    }
  | { readonly type: 'pointerDown'; readonly button: 0; readonly pressure?: number }
  | { readonly type: 'pointerUp'; readonly button?: 0 }
  | { readonly type: 'pause'; readonly duration: number };

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Geometry the page reports at readiness; the harness trusts the page, not the OS. Dimensions are read separately. */
export interface PageGeometry {
  readonly canvas: Bounds;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly outerViewport: { readonly width: number; readonly height: number };
  readonly screenX: number;
  readonly screenY: number;
  readonly dpr: number;
}

/** What the host may write into the page's plan on the plan-polled channel. */
export interface PlanPatch {
  readonly finish?: true;
  readonly phase?: string;
  readonly primeRequest?: { readonly sequence: number; readonly afterStroke: number };
}

/** One between-pass prime entry as the page records it; acceptance validates every field. */
export interface PrimeEntry {
  readonly sequence: number;
  readonly afterStroke: number;
  readonly pending: readonly string[];
  readonly transparentTiles: readonly string[];
  readonly trustedCanvasPointerUps: number;
  readonly error?: string;
}

export interface PlanPolledReport<K extends ScenarioKind> {
  readonly report: ReportFor<K>;
  readonly procedures: readonly ProcedureResult[];
  readonly records: Readonly<Record<string, unknown>>;
}

/** @internal The driver behind an input transport for a drawing stream. */
export interface InputDriver {
  readonly transport: InputTransportId;
  /** Set a transport-owned dimension before the page opens (rotation before launch). */
  setCapability?(capability: TransportCapability, value: string): Promise<void>;
  openPage(url: string, options: { readonly packaged: boolean }): Promise<void>;
  boundsFrom(geometry: PageGeometry): Promise<Bounds>;
  runtimeIdentity?(): Promise<{
    readonly userAgent?: string;
    readonly package?: string;
    readonly foreground?: string;
  }>;
  /** Dispatch one authored pass. Priming happens between calls, never inside one. */
  dispatch(sequences: readonly PointerSequence[], bounds: Bounds): Promise<void>;
  close(): Promise<void>;
}

/** @internal The WebDriver-shaped client the actions runner speaks to Appium, CDP touch and Playwright alike. */
export interface ActionDriver {
  readonly transport: InputTransportId;
  readonly activation: Activation;
  findElement(selector: string): Promise<{ readonly id: string; readonly rect: Bounds }>;
  click(elementId: string): Promise<void>;
  tapAt(x: number, y: number): Promise<void>;
  press(key: string): Promise<void>;
  type(elementId: string, text: string): Promise<void>;
  hover(elementId: string): Promise<void>;
  scroll(
    elementId: string,
    delta: { readonly dx: number; readonly dy: number }
  ): Promise<'native-gesture' | 'wheel'>;
  readCapability(capability: TransportCapability): Promise<string>;
  setCapability(capability: TransportCapability, value: string): Promise<void>;
  windowRect(): Promise<Bounds>;
  switchContext?(context: 'web' | 'native'): Promise<void>;
}

/**
 * @internal A measurement channel is either scripted (the host can evaluate in the page) or
 * plan-polled (the page fetches a plan, runs the compiled bootstrap, and posts results and tables
 * back; the host can only patch the plan and await an acknowledgement).
 */
export type MeasurementChannel =
  | {
      readonly kind: 'scripted';
      readonly id: Exclude<MeasurementChannelId, 'http-upload'>;
      install(probeSource: string): Promise<void>;
      evaluate<T>(expression: string): Promise<T>;
      readTable(
        name: string,
        options?: { readonly sliceRows?: number }
      ): Promise<readonly unknown[]>;
    }
  | {
      readonly kind: 'plan-polled';
      readonly id: 'http-upload';
      control(patch: PlanPatch): Promise<void>;
      awaitPrimeAck(
        key: { readonly sequence: number; readonly afterStroke: number },
        timeoutMs: number
      ): Promise<PrimeEntry>;
      awaitReport<K extends ScenarioKind>(timeoutMs: number): Promise<PlanPolledReport<K>>;
    };

/** @internal */
export interface Instrument {
  readonly id: InstrumentId;
  start(): Promise<{ readonly changed: Readonly<Record<string, string>> }>;
  stop(): Promise<{ readonly files: readonly string[]; readonly summary?: unknown }>;
  restore(): Promise<void>;
}
