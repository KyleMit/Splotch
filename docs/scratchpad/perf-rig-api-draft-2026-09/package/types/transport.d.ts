/**
 * Transports, channels, drivers, and instruments.
 *
 * Input and measurement are separate channels, and coupling them lets the driver corrupt the
 * number. A capture names both, and the package refuses pairings it has not proved. A transport
 * declares structural facts about the input it produces (trusted or not, how many pointers, whether
 * it needs a human); whether that input is hand-shaped enough to score is the app's calibration,
 * never the transport's claim.
 *
 * The driver and channel interfaces are exported for reading; v1 has no registration path, so an
 * app cannot add a transport without a package change.
 */

export type InputTransportId =
  /** Playwright's mouse and in-page synthetic pointer events. Untrusted by construction. */
  | 'desktop-playwright'
  /** An Appium session: XCUITest through WebDriverAgent, or UiAutomator2, chosen by capabilities. */
  | 'appium'
  /** WebDriverAgent's HTTP API directly over `iproxy`; no Appium, no RemoteXPC tunnel. */
  | 'wda-http'
  /** `adb shell input swipe` segments: an OS touchscreen stream the display boost responds to. */
  | 'adb-input'
  /** `Input.dispatchTouchEvent` over a forwarded DevTools socket. Android browser actions only. */
  | 'cdp-touch'
  /** A person. The calibration reference for every other transport on the same runtime. */
  | 'human';

export type MeasurementChannelId =
  | 'same-process'
  | 'cdp-evaluate'
  | 'webkit-inspector'
  | 'appium-execute'
  /** The page polls a plan and uploads its own tables to a probe host that proxies the preview. */
  | 'http-upload'
  /** The page writes into durable native storage the host pulls out of the app container. */
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
  /** Scenario kinds this transport may drive; `appium` acts but does not draw for a drawing stream. */
  readonly drives: readonly ('frames' | 'actions' | 'session')[];
}

export declare const TRANSPORTS: Readonly<Record<InputTransportId, TransportCapabilities>>;

export type PointerType = 'touch' | 'pen' | 'mouse';

/** One W3C pointer input source. Multi-pointer plans carry one sequence per finger, dispatched in lockstep by tick. */
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
  | { readonly type: 'pointerUp' }
  | { readonly type: 'pause'; readonly duration: number };

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Geometry the page reports at readiness; the harness trusts the page, not the OS. */
export interface PageGeometry {
  readonly canvas: Bounds;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly outerViewport: { readonly width: number; readonly height: number };
  readonly screenX: number;
  readonly screenY: number;
  readonly dpr: number;
  readonly orientation: 'PORTRAIT' | 'LANDSCAPE';
}

/** @internal The driver behind an input transport for a drawing stream. */
export interface InputDriver {
  readonly transport: InputTransportId;
  openPage(
    url: string,
    options: { readonly orientation?: 'PORTRAIT' | 'LANDSCAPE'; readonly packaged: boolean }
  ): Promise<void>;
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

/**
 * @internal The WebDriver-shaped client the actions runner speaks to Appium, CDP touch and
 * Playwright alike: contexts, orientation, window rect, element find and click, scroll gestures.
 */
export interface ActionDriver {
  readonly transport: InputTransportId;
  readonly activation:
    | 'trusted-touch'
    | 'trusted-cdp-touch'
    | 'native-accessibility-click'
    | 'webdriver-element-click'
    | 'dom-click';
  findElement(selector: string): Promise<{ readonly id: string; readonly rect: Bounds }>;
  click(elementId: string): Promise<void>;
  tapAt(x: number, y: number): Promise<void>;
  scroll(
    elementId: string,
    delta: { readonly dx: number; readonly dy: number }
  ): Promise<'native-gesture' | 'wheel'>;
  orientation(): Promise<'PORTRAIT' | 'LANDSCAPE'>;
  rotate(to: 'PORTRAIT' | 'LANDSCAPE'): Promise<void>;
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
      /** Read a large table in slices; one evaluate over a USB relay fails late. */
      readTable(
        name: string,
        options?: { readonly sliceRows?: number }
      ): Promise<readonly unknown[]>;
    }
  | {
      readonly kind: 'plan-polled';
      readonly id: 'http-upload';
      control(patch: Readonly<Record<string, unknown>>): Promise<void>;
      awaitAck(
        key: { readonly sequence: number; readonly afterStroke: number },
        timeoutMs: number
      ): Promise<{ readonly ok: boolean; readonly detail?: string }>;
      awaitReport(timeoutMs: number): Promise<unknown>;
    };

/** @internal */
export interface Instrument {
  readonly id: InstrumentId;
  start(): Promise<{ readonly changed: Readonly<Record<string, string>> }>;
  stop(): Promise<{ readonly files: readonly string[]; readonly summary?: unknown }>;
  /** Registered with the process so an interrupted run still restores. */
  restore(): Promise<void>;
}
