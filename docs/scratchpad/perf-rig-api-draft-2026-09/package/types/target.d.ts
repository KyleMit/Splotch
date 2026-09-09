/**
 * Deployment targets.
 *
 * A target is data: where the page runs, which transport draws on it, which transport drives its
 * discrete actions, which calibration table judges its input, and which presentation rate its
 * frames are scored against. The package ships no target table and no calibration; the app
 * declares both, and `resolveTransports` is exported so a doc table restating the target table can
 * be drift-guarded against the same resolver the runner uses.
 */

import type { InputTransportId, MeasurementChannelId, InstrumentId } from './transport.js';

export type Platform = 'ios' | 'android' | 'macos' | 'linux' | 'windows';
export type Host = 'device' | 'simulator' | 'emulator' | 'desktop';
/** Whether the page runs in a browser or inside the app's packaged shell. */
export type Shell = 'browser' | 'packaged';
export type DeviceClass = 'tablet' | 'handset' | 'desktop';
export type DesktopEngine = 'chromium' | 'webkit' | 'firefox';

/**
 * A refresh regime is the presentation rate a capture is scored against, declared from
 * measurement. The set is open: the app declares the bands its panels present at. `null` on a
 * target means no regime has been established yet; such a cell is banked but never scored.
 */
export type RefreshRegimeId = string;

export interface RefreshRegimeBand<Id extends RefreshRegimeId = RefreshRegimeId> {
  readonly id: Id;
  readonly nominalMs: number;
  readonly intervalMs: { readonly min: number; readonly max: number; readonly toleranceMs: number };
}

/** Bands measured on the panels the package has been run against; the app may extend or replace through `AppContract.refreshRegimes`. */
export declare const DEFAULT_REFRESH_REGIMES: readonly [
  RefreshRegimeBand<'60hz'>,
  RefreshRegimeBand<'120hz'>,
];
export type RegimeIdOf<Bands extends readonly RefreshRegimeBand[]> = Bands[number]['id'];

/**
 * The role a target's numbers play: `gated` rows count toward a release decision; `advisory`
 * rows are a rejection tier where a failure is a lead and a pass proves nothing. Any finer label
 * (a physical web row that is advisory until calibrated, say) is the app's to render.
 */
export type EvidenceRole = 'gated' | 'advisory';

export interface TargetDefinition<
  CaptureRuntime extends string = string,
  Regime extends RefreshRegimeId = RefreshRegimeId,
> {
  readonly id: string;
  readonly label: string;
  readonly platform: Platform;
  readonly host: Host;
  readonly shell: Shell;
  readonly deviceClass: DeviceClass;
  readonly engine?: DesktopEngine;
  /** Key into the app's fidelity expectations. Stated, never derived from the id. */
  readonly captureRuntime: CaptureRuntime;
  readonly refreshRegime: Regime | null;
  readonly transports: {
    readonly drawing: InputTransportId;
    readonly actions: InputTransportId;
    /** Defaults to the drawing transport's `defaultChannel`. */
    readonly measurement?: MeasurementChannelId;
  };
  readonly instruments?: readonly InstrumentId[];
  readonly evidenceRole: EvidenceRole;
  readonly physicalDevice: boolean;
  /** Desktop only; device targets take geometry from the device. A campaign variant may override. */
  readonly viewport?: Viewport;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export declare function defineTargets<const T extends readonly TargetDefinition[]>(
  targets: T,
  options?: { readonly regimes?: readonly RefreshRegimeBand[] }
): { readonly [K in T[number]['id']]: Extract<T[number], { id: K }> };

/** The one resolver: what `capture` and `runCampaign` use, and what a doc drift guard imports. */
export declare function resolveTransports(target: TargetDefinition): {
  readonly drawing: InputTransportId;
  readonly actions: InputTransportId;
  readonly measurement: MeasurementChannelId;
};
