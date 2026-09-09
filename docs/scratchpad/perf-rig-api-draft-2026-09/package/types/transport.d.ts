/**
 * Transports, channels, drivers, and instruments.
 *
 * The load-bearing idea (ADR-0135): input and measurement are separate channels, and coupling them
 * lets the driver corrupt the number. So a capture names an input transport and a measurement
 * channel independently, and the package refuses pairings it has not proved. Each transport
 * declares what it can honestly claim about the input it produces; the fidelity verdict reads
 * those claims, never the transport's name.
 */

export type InputTransportId =
  /** Playwright's mouse and the probe's own synthetic pointer events. Untrusted, and honest about it. */
  | 'desktop-playwright'
  /** XCUITest through WebDriverAgent, driven by an Appium session. Calibrated hand-shaped touch. */
  | 'appium-xcuitest'
  /** UiAutomator2 through Appium. Correct for taps; under-drives a drawing stream. */
  | 'appium-uiautomator2'
  /** WebDriverAgent's HTTP API directly over `iproxy`. No Appium, no RemoteXPC tunnel. */
  | 'wda-http'
  /** `adb shell input swipe` segments. An OS touchscreen stream that the display boost responds to. */
  | 'adb-input'
  /** `Input.dispatchTouchEvent` over a forwarded DevTools socket. Android browser actions only. */
  | 'cdp-touch'
  /** A person. The calibration reference for every other transport on the same runtime. */
  | 'human';

export type MeasurementChannelId =
  /** The probe's tables read from the same process that drove the page. */
  | 'same-process'
  /** `Runtime.evaluate` over CDP. */
  | 'cdp-evaluate'
  /** `Runtime.evaluate` over the WebKit Inspector Protocol, enveloped and polled. */
  | 'webkit-inspector'
  /** The Appium session's script channel, switching between web and native contexts. */
  | 'appium-execute'
  /** The page uploads its own tables to a probe host that proxies the preview. */
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
  /** Whether events reach the page with `isTrusted`. */
  readonly trusted: boolean;
  /** Whether the stream is digitizer-shaped enough to pass a hand-calibrated fidelity gate. */
  readonly handShaped: 'calibrated' | 'passes' | 'under-drives' | 'not-a-hand';
  readonly nativeContext: boolean;
  readonly needsHuman: boolean;
  /** Rough contact moves per second the transport produces on a healthy rig, for `doctor` output. */
  readonly nominalMovesPerSecond?: { readonly min: number; readonly max: number };
  /** Channels this transport has been proved with. Other pairings are refused at plan time. */
  readonly channels: readonly MeasurementChannelId[];
}

export declare const TRANSPORTS: Readonly<Record<InputTransportId, TransportCapabilities>>;

/** A W3C pointer action, the one plan shape every transport consumes. */
export type PointerAction =
  | {
      readonly type: 'pointerMove';
      readonly duration: number;
      readonly origin: 'viewport';
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'pointerDown'; readonly button: 0 }
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

/**
 * The driver interface behind every input transport. Named after the shape the split-capture
 * runner already used for Android and iOS; extracting it is the seam.
 */
export interface InputDriver {
  readonly transport: InputTransportId;
  /** Launch or attach so the page at `url` is foregrounded, then return once it answers. */
  openPage(
    url: string,
    options: { readonly orientation?: 'PORTRAIT' | 'LANDSCAPE'; readonly nativeApp: boolean }
  ): Promise<void>;
  /** Convert page-reported geometry into the coordinate space this transport injects in. */
  boundsFrom(geometry: PageGeometry): Promise<Bounds>;
  /** What the transport can prove about the runtime it is driving, recorded into the artifact. */
  runtimeIdentity?(): Promise<{
    readonly userAgent?: string;
    readonly package?: string;
    readonly foreground?: string;
  }>;
  /** Dispatch one authored pass of the plan. Refills happen between calls, not inside them. */
  dispatch(actions: readonly PointerAction[], bounds: Bounds): Promise<void>;
  /** Tear down what `openPage` created. Never touches listeners the driver did not start. */
  close(): Promise<void>;
}

export interface MeasurementChannel {
  readonly id: MeasurementChannelId;
  /** Load the rendered probe into the page. */
  install(probeSource: string): Promise<void>;
  /** Evaluate an expression and return its JSON value. */
  evaluate<T>(expression: string): Promise<T>;
  /**
   * Read a large table in slices. A single evaluate carrying hundreds of kilobytes across a USB
   * relay is the one thing that fails late, after the drawing is already done.
   */
  readTable(name: string, options?: { readonly sliceRows?: number }): Promise<readonly unknown[]>;
}

export interface Instrument {
  readonly id: InstrumentId;
  /** Arm before the measured window. May pin device state; must record what it changed. */
  start(): Promise<{ readonly changed: Readonly<Record<string, string>> }>;
  /** Stop and return the instrument's evidence, written beside the artifact. */
  stop(): Promise<{ readonly files: readonly string[]; readonly summary?: unknown }>;
  /**
   * Restore anything `start` changed. Registered with the process so an interrupted run still
   * restores; a leaked pin fails every later capture on the device as off-regime.
   */
  restore(): Promise<void>;
}
