/**
 * Scenarios.
 *
 * A scenario says what the harness does to the page and what it records. Four shapes cover the
 * capture paths the drawing-app harness proved: a scripted session, a discrete-action sweep, a
 * frame-pacing capture, and a first-show measurement. Scenarios that drive an app's own harness
 * route through an imperative API are not a package shape; they are app scripts composed from the
 * package's channel and scoring primitives.
 *
 * A scenario never names a transport; the target does. A scenario never names a selector; it names
 * a control or tool from the app contract, and the type checker refuses one the contract lacks.
 */

import type { AppContract, ControlOf, DimensionOf, ToolOf } from './app.js';
import type { Procedure, Step } from './procedure.js';
import type { Bounds, PointerSequence } from './transport.js';
import type { Viewport } from './target.js';

export type ScenarioKind = 'session' | 'actions' | 'frames' | 'first-show';

export type Scenario<A extends AppContract = AppContract> =
  SessionScenario<A> | ActionsScenario<A> | FramesScenario<A> | FirstShowScenario<A>;

interface ScenarioBase<Kind extends ScenarioKind, A extends AppContract> {
  readonly kind: Kind;
  readonly id: string;
  readonly description: string;
  readonly requires?: Readonly<Partial<Record<DimensionOf<A>, string>>>;
}

/**
 * A scripted session of beats, traced where the channel offers a trace, or a bare navigation
 * window when `beats` is empty (the page-load case). Diagnostic; no gate.
 */
export interface SessionScenario<A extends AppContract> extends ScenarioBase<'session', A> {
  readonly beats: readonly {
    readonly label: string;
    readonly steps: readonly (Step | GestureStep<A>)[];
  }[];
  readonly trace: boolean;
  readonly network?: 'slow-4g' | 'offline' | 'unthrottled';
  /** Long-task observer from time zero and a settle after load; the page-load window. */
  readonly load?: { readonly postLoadSettleMs: number };
}

/** Session strokes are synthetic in-page pointer events; `pointers > 1` is their only multi-pointer path. */
export type GestureStep<A extends AppContract> =
  | { readonly kind: 'stroke'; readonly path: PathGenerator; readonly pointers?: number }
  | { readonly kind: 'dragBeyond'; readonly control: ControlOf<A>; readonly fraction: number };

export type PathGenerator = (
  bounds: Bounds
) => readonly { readonly x: number; readonly y: number; readonly atMs: number }[];

/**
 * A discrete-action sweep: an idle baseline, then named groups of actions in a fixed order, each
 * recorded action-to-first-frame, readiness, and post-action frame gaps. The plan is resolved once
 * against the observed context and emitted into the artifact as data.
 */
export interface ActionsScenario<A extends AppContract> extends ScenarioBase<'actions', A> {
  readonly idleBaseline: { readonly label: string; readonly idleMs: number };
  readonly groups: readonly ActionGroup<A>[];
  readonly repeats: { readonly warmup: number; readonly scored: number };
  readonly settleTailFrames: number;
}

export interface ActionGroup<A extends AppContract> {
  readonly id: string;
  /** Decided from observed context; an exclusion is recorded with its reason. */
  applicable?(context: ActionContext<A>): true | { readonly reason: string };
  readonly actions: readonly MeasuredAction<A>[];
}

export interface ActionContext<A extends AppContract> {
  readonly dimensions: Readonly<Record<DimensionOf<A>, string>>;
  readonly deviceClass: 'tablet' | 'handset' | 'desktop';
  readonly packaged: boolean;
  /** App-declared shell variant observed on the page (a compact settings layout, say). */
  readonly variant?: string;
}

/** A label is data: a string or a template over context variables, resolved once at plan time. */
export type ActionLabel<A extends AppContract> =
  string | { readonly template: string; readonly vars: readonly (DimensionOf<A> | 'variant')[] };

export type MeasuredAction<A extends AppContract> = ControlAction<A> | ExternalAction<A>;

export interface ControlAction<A extends AppContract> {
  /** Stable identity for focusing and allowances. */
  readonly id: string;
  readonly label: ActionLabel<A>;
  readonly control: ControlOf<A>;
  readonly setup?: readonly Step[];
  readonly teardown?: readonly Step[];
  readonly eventTypes?: readonly string[];
}

/** An action the page cannot originate; the transport performs it and marks the origin. */
export interface ExternalAction<A extends AppContract> {
  readonly id: string;
  readonly label: ActionLabel<A>;
  readonly external: 'rotate';
  to(context: ActionContext<A>): 'PORTRAIT' | 'LANDSCAPE';
  readonly setup?: readonly Step[];
}

export interface ResolvedActionPlan {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly groups: readonly string[];
  readonly actions: readonly {
    readonly id: string;
    readonly label: string;
    readonly group: string;
  }[];
  readonly excluded: readonly {
    readonly id: string;
    readonly group: string;
    readonly reason: string;
  }[];
  readonly context: {
    readonly dimensions: Readonly<Record<string, string>>;
    readonly variant?: string;
  };
}

export declare function resolveActionPlan<A extends AppContract>(
  scenario: ActionsScenario<A>,
  context: ActionContext<A>
): ResolvedActionPlan;

/** A subset by group id keeps its own scenario id, so a fold never mistakes it for the canonical sweep. */
export declare function focusActions<A extends AppContract>(
  scenario: ActionsScenario<A>,
  groupIds: readonly string[]
): ActionsScenario<A>;

/**
 * A frame-pacing capture: select a tool, run the frames probe through its phases while input
 * arrives, then optionally repeat a measured control with proof.
 */
export interface FramesScenario<A extends AppContract> extends ScenarioBase<'frames', A> {
  readonly tool: ToolOf<A>;
  readonly phases: readonly ProbePhase[];
  /** Where the strokes come from: the target's drawing transport, the probe's own synthetic hand, or a person. */
  readonly input:
    | { readonly kind: 'transport'; readonly gesture: GesturePlan }
    | {
        readonly kind: 'probe-synthetic';
        readonly hz: number;
        readonly shape: 'mixed' | 'long' | 'short';
      }
    | { readonly kind: 'human'; readonly seconds: number };
  /** Safety cap on in-contact time the probe banks per phase before ending it on its own. */
  readonly contactCapMs: number;
  /** A control repeated after drawing, proved through history depth and output-surface deltas. */
  readonly repeatedAction?: {
    readonly control: ControlOf<A>;
    readonly count: number;
    readonly pauseMs: number;
  };
  readonly hud?: boolean;
}

export interface ProbePhase {
  readonly key: string;
  /** The probe re-asserts this every tick through the app's paper controls. */
  readonly paper: 'blank' | 'page';
  readonly suppress?: readonly Suppression[];
}

export type Suppression =
  | { readonly kind: 'css'; readonly css: string }
  /** Pin the element's current computed value so per-event nudges stop producing damage without moving it. */
  | { readonly kind: 'pin-computed'; readonly target: string; readonly property: 'transform' };

export interface GesturePlan {
  /** Recorded into the artifact; acceptance refuses a cell recorded under a different plan. */
  readonly id: string;
  readonly strokesPerRepeat: number;
  readonly repeats: number;
  readonly pauseMs: number;
  generate(bounds: Bounds, repeats: number, pauseMs: number): readonly PointerSequence[];
  /** Runs the tool's prime procedure between passes. */
  readonly primeBetweenPasses: boolean;
}

/** First presentation of a surface scored against its reopen, per shell. */
export interface FirstShowScenario<A extends AppContract> extends ScenarioBase<'first-show', A> {
  readonly shells: readonly {
    readonly name: string;
    readonly viewport: Viewport;
    readonly open: ControlOf<A>;
    readonly warm: string;
    readonly close: ControlOf<A>;
  }[];
  readonly cycles: number;
}

export declare function defineScenario<A extends AppContract, const S extends Scenario<A>>(
  app: A,
  scenario: S
): S;

/** Paper controls a frames scenario with a `page` phase needs; declared beside the tools. */
export interface PaperControls {
  readonly ensureBlank: Procedure;
  readonly ensurePage: Procedure;
  readonly instructions: Readonly<Record<'blank' | 'page', string>>;
}
