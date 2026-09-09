/**
 * Deployment targets.
 *
 * A target is data: where the page runs, which transport draws on it, which transport drives its
 * discrete actions, which calibration table judges its input, and which presentation rate its
 * frames are scored against. The package ships no target table. The app declares its own, and the
 * doc table that restates it is drift-guarded by a test the app owns
 * (`profiling-mechanics-doc.test.mjs` is the pattern).
 */

import type { InputTransportId, MeasurementChannelId, InstrumentId } from './transport.js';

export type Platform = 'ios' | 'android' | 'macos' | 'linux' | 'windows';
export type Host = 'device' | 'simulator' | 'emulator' | 'desktop';
export type Runtime = 'web' | 'native';
export type DeviceClass = 'tablet' | 'handset' | 'desktop';
export type DesktopEngine = 'chromium' | 'webkit' | 'firefox';

/**
 * A refresh regime is the presentation rate a capture is scored against, declared from
 * measurement. `null` means no regime has been established for this target yet, which is a gap
 * the campaign refuses to score across, not a licence to score anything.
 */
export type RefreshRegimeId = '60hz' | '120hz';

export interface RefreshRegimeBand {
  readonly id: RefreshRegimeId;
  /** Observed dominant-interval band, in milliseconds, with its tolerance. */
  readonly intervalMs: { readonly min: number; readonly max: number; readonly toleranceMs: number };
}

/**
 * The role a target's numbers play. Only `gated` rows count toward a release decision; `tripwire`
 * rows warn; `advisory` rows are a rejection tier where a failure is a lead and a pass proves
 * nothing (simulators, emulators, desktop engines standing in for a device).
 */
export type EvidenceRole = 'gated' | 'tripwire' | 'advisory';

export interface TargetDefinition<CaptureRuntime extends string = string> {
  readonly id: string;
  readonly label: string;
  readonly platform: Platform;
  readonly host: Host;
  readonly runtime: Runtime;
  readonly deviceClass: DeviceClass;
  readonly engine?: DesktopEngine;
  /**
   * Key into the app's input-fidelity expectation table. Stated, never derived from the id,
   * because a derivation silently picks a wrong table for the next name that breaks the pattern.
   */
  readonly captureRuntime: CaptureRuntime;
  readonly refreshRegime: RefreshRegimeId | null;
  readonly transports: {
    readonly drawing: InputTransportId;
    readonly actions: InputTransportId;
    /** Defaults to the channel the drawing transport pairs with. */
    readonly measurement?: MeasurementChannelId;
  };
  /** Platform instruments attached to every capture on this target. */
  readonly instruments?: readonly InstrumentId[];
  readonly evidenceRole: EvidenceRole;
  readonly physicalDevice: boolean;
  /** Desktop only. Device targets take geometry from the device. */
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: number;
  };
  /** Native WebView class name Appium switches into; Android native only. */
  readonly webviewClass?: string;
}

export declare function defineTarget<const T extends TargetDefinition>(target: T): T;

export declare function defineTargets<const T extends readonly TargetDefinition[]>(
  targets: T
): { readonly [K in T[number]['id']]: Extract<T[number], { id: K }> };
