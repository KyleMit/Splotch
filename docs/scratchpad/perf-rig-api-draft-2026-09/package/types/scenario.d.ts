/**
 * Scenarios.
 *
 * A scenario says what the harness does to the page and what it records. Reading the twelve
 * capturing entry points of the drawing-app harness together, six shapes cover them. A scenario
 * never names a transport; the target does. A scenario never names a selector; it names a control
 * or mode from the app contract, and the harness resolves it.
 */

import type { Procedure, Step } from './procedure.js';
import type { Bounds, PointerAction } from './transport.js';

export type ScenarioKind =
  'session' | 'actions' | 'frames' | 'engine' | 'mount' | 'first-show' | 'custom';

export type Scenario =
  | SessionScenario
  | ActionsScenario
  | FramesScenario
  | EngineScenario
  | MountScenario
  | FirstShowScenario
  | CustomScenario;

interface ScenarioBase<Kind extends ScenarioKind> {
  readonly kind: Kind;
  readonly id: string;
  readonly description: string;
  /** Dimension values this scenario requires, by dimension name from the app contract. */
  readonly requires?: Readonly<Record<string, string>>;
}

/**
 * A scripted session of beats — the "toddler session". Recorded with a Chrome trace where the
 * channel offers one, user-timing measures everywhere. Diagnostic; no gate.
 */
export interface SessionScenario extends ScenarioBase<'session'> {
  readonly beats: readonly {
    readonly label: string;
    readonly steps: readonly (Step | GestureStep)[];
  }[];
  readonly trace: boolean;
}

export type GestureStep =
  | { readonly kind: 'stroke'; readonly path: PathGenerator; readonly pointers?: number }
  | { readonly kind: 'dragBeyond'; readonly control: string; readonly fraction: number };

/** Produces viewport points for a stroke from the surface bounds. */
export type PathGenerator = (
  bounds: Bounds
) => readonly { readonly x: number; readonly y: number }[];

/**
 * A discrete-action sweep: an idle control, then named groups of controls activated in a fixed
 * order, each recorded action-to-first-frame, readiness, and post-action frame gaps. The plan is
 * emitted into the artifact as data (`actionPlan`) so the matrix can refuse results outside it.
 */
export interface ActionsScenario extends ScenarioBase<'actions'> {
  readonly control: { readonly label: string; readonly idleMs: number };
  readonly groups: readonly ActionGroup[];
  readonly repeats: { readonly warmup: number; readonly scored: number };
  /** Settle frames appended to each action's window. */
  readonly settleTailFrames: number;
}

export interface ActionGroup {
  readonly id: string;
  /** Applicability is decided from observed context, and exclusions are recorded with a reason. */
  readonly applicable?: (context: ActionContext) => true | { readonly reason: string };
  readonly actions: readonly MeasuredAction[];
}

export interface ActionContext {
  readonly orientation: 'PORTRAIT' | 'LANDSCAPE';
  readonly dimensions: Readonly<Record<string, string>>;
  readonly deviceClass: 'tablet' | 'handset' | 'desktop';
  readonly nativeApp: boolean;
}

export interface MeasuredAction {
  /** Label is the identity a gate allowance or a matrix column keys on; spell it once. */
  readonly label: string | ((context: ActionContext) => string);
  /** Name from `AppContract.controls`. */
  readonly control: string;
  readonly setup?: readonly Step[];
  readonly teardown?: readonly Step[];
  /** Event types that count as the activation; the first trusted one stamps the action origin. */
  readonly eventTypes?: readonly string[];
  /** For actions the page cannot originate (rotation): the transport performs it and marks the origin. */
  readonly external?: 'rotate' | 'resize';
}

/**
 * A frame-pacing capture: select a mode, run the frames probe through its phases while a gesture
 * plan is dispatched over the drawing transport, then optionally drive a measured action N times.
 */
export interface FramesScenario extends ScenarioBase<'frames'> {
  readonly mode: string;
  readonly phases: readonly ProbePhase[];
  readonly gesture: GesturePlan;
  /** In-page contact time to bank per phase, in milliseconds. */
  readonly contactMs: number;
  /** A measured action repeated after drawing, proved through history depth and pixel deltas. */
  readonly afterDrawing?: {
    readonly control: string;
    readonly count: number;
    readonly pauseMs: number;
    readonly proof: 'history-depth-and-pixels';
  };
  readonly hud: boolean;
}

export interface ProbePhase {
  readonly key: string;
  /** CSS injected for the phase, for A/B suppression sweeps. */
  readonly suppressCss?: string;
  /** Procedure that prepares the page for the phase (open a coloring page, say). */
  readonly setup?: Procedure;
}

export interface GesturePlan {
  /** Stable id recorded into the artifact; acceptance refuses a cell recorded under a different plan. */
  readonly id: string;
  readonly strokesPerRepeat: number;
  readonly repeats: number;
  readonly pauseMs: number;
  readonly generate: (bounds: Bounds, repeats: number, pauseMs: number) => readonly PointerAction[];
  /** Whether the mode's `prime` procedure runs between passes. */
  readonly primeBetweenPasses: boolean;
}

/** Drives the app's engine harness route directly through its imperative API. */
export interface EngineScenario extends ScenarioBase<'engine'> {
  readonly cases: readonly {
    readonly key: string;
    readonly label: string;
    /** Product code paths the case exercises, for sole-exerciser derivation. */
    readonly exercises: readonly string[];
    readonly run: string;
  }[];
  /** Expression on the engine API that is true once history has settled. */
  readonly quiescent: string;
  readonly settle: { readonly stableSamples: number; readonly budgetMs: number };
}

/** A page-load window: trace across navigation with a long-task observer from time zero. */
export interface MountScenario extends ScenarioBase<'mount'> {
  readonly postLoadSettleMs: number;
  readonly network?: 'slow-4g' | 'none';
}

/** First presentation of a surface scored against its reopen. */
export interface FirstShowScenario extends ScenarioBase<'first-show'> {
  readonly shells: readonly {
    readonly name: string;
    readonly viewport: {
      readonly width: number;
      readonly height: number;
      readonly deviceScaleFactor: number;
    };
    readonly open: string;
    readonly shown: string;
    readonly warm: string;
    readonly close: Procedure;
    readonly closed: string;
  }[];
  readonly cycles: number;
}

/**
 * The escape hatch: an app-supplied in-page recorder and a Node scorer. The harness still runs
 * every guard, wraps the rows in the standard envelope, and records the scenario as custom so a
 * campaign cannot fold it into a standard cell.
 */
export interface CustomScenario extends ScenarioBase<'custom'> {
  readonly recorderSource: string;
  readonly tables: readonly string[];
  readonly summarise: (tables: Readonly<Record<string, readonly unknown[]>>) => unknown;
}

export declare function defineScenario<const S extends Scenario>(scenario: S): S;
