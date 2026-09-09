/**
 * Scenarios.
 *
 * A scenario says what the harness does to the page and what it records. Four shapes cover the
 * capture paths the drawing-app harness proved: a scripted session, a discrete-action sweep, a
 * frame-pacing capture, and a first-show measurement. Scenarios that drive an app's own harness
 * route through an imperative API are app scripts composed from `openChannel` and the scorers.
 *
 * A scenario never names a transport; the target does. A scenario never names a selector: its
 * steps reference controls from the contract, and the one escape hatch carries a required reason
 * so a drift test can find it.
 */

import type { AppContract, ControlOf, DimensionOf, DimensionSelection, ToolOf } from './app.js';
import type { Literal, PageExpression, PageFunction, Procedure, Selector } from './procedure.js';
import type { Bounds, PointerSequence, PointerType } from './transport.js';
import type { Viewport } from './target.js';

export type ScenarioKind = 'session' | 'actions' | 'frames' | 'first-show';

export type Scenario<A extends AppContract = AppContract> =
  SessionScenario<A> | ActionsScenario<A> | FramesScenario<A> | FirstShowScenario<A>;

interface ScenarioBase<Kind extends ScenarioKind, A extends AppContract> {
  readonly kind: Kind;
  readonly id: string;
  readonly description: string;
  readonly requires?: DimensionSelection<A>;
}

/** A control from the contract, or a selector with the reason a control would not do. */
export type Target<A extends AppContract> =
  ControlOf<A> | { readonly selector: Selector; readonly reason: string };

/** The procedure step vocabulary with every target a control reference. */
export type ScenarioStep<A extends AppContract> =
  | { readonly kind: 'click'; readonly target: Target<A>; readonly nth?: number }
  | {
      readonly kind: 'tap';
      readonly target: Target<A>;
      readonly onUntrustedChannel: 'refuse' | 'click-and-record';
    }
  | { readonly kind: 'press'; readonly key: string; readonly target?: Target<A> }
  | { readonly kind: 'type'; readonly target: Target<A>; readonly text: string }
  | { readonly kind: 'hover'; readonly target: Target<A> }
  | {
      readonly kind: 'wheel';
      readonly target: Target<A>;
      readonly deltaX: number;
      readonly deltaY: number;
    }
  | {
      readonly kind: 'drag';
      readonly from: Target<A>;
      readonly to: { readonly dx: number; readonly dy: number };
      readonly durationMs: number;
    }
  | { readonly kind: 'waitPresent'; readonly target: Target<A>; readonly timeoutMs: number }
  | { readonly kind: 'waitVisible'; readonly target: Target<A>; readonly timeoutMs: number }
  | { readonly kind: 'waitHidden'; readonly target: Target<A>; readonly timeoutMs: number }
  | {
      readonly kind: 'until';
      readonly expression: PageExpression;
      readonly equals: Literal;
      readonly timeoutMs: number;
    }
  | { readonly kind: 'settle'; readonly ms: number; readonly reason: string }
  | {
      readonly kind: 'evaluate';
      readonly fn: PageFunction;
      readonly args?: readonly Literal[];
      readonly awaits: boolean;
      readonly recordAs: string;
    };

export interface SessionScenario<A extends AppContract> extends ScenarioBase<'session', A> {
  readonly beats: readonly {
    readonly label: string;
    readonly steps: readonly (ScenarioStep<A> | GestureStep<A>)[];
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
 * A discrete-action sweep: the idle baseline, then named groups in a fixed order. Order is part
 * of the instrument. The plan is resolved once against the observed context and emitted into the
 * artifact as data; `idle` is always its first group.
 */
export interface ActionsScenario<A extends AppContract> extends ScenarioBase<'actions', A> {
  readonly idleBaseline: { readonly label: string; readonly idleMs: number };
  readonly groups: readonly ActionGroup<A>[];
  readonly repeats: { readonly warmup: number; readonly scored: number };
  readonly settleTailFrames: number;
}

export interface ActionGroup<A extends AppContract> {
  readonly id: string;
  applicable?(context: ActionContext<A>): true | { readonly reason: string };
  /** A list, or a function enumerating actions from the page (one per section row, say). */
  readonly actions:
    readonly MeasuredAction<A>[] | ((context: ActionContext<A>) => readonly MeasuredAction<A>[]);
}

export interface ActionContext<A extends AppContract> {
  readonly dimensions: Readonly<Record<DimensionOf<A>, string>>;
  readonly deviceClass: 'tablet' | 'handset' | 'desktop';
  readonly packaged: boolean;
  /** App-declared shell variant observed on the page. */
  readonly variant?: string;
}

export type MeasuredAction<A extends AppContract> =
  ControlAction<A> | ExternalAction<A> | SequenceAction<A>;

export interface ControlAction<A extends AppContract> {
  /** Stable identity for focusing and allowances; one per measured direction. */
  readonly id: string;
  readonly label: string | ((context: ActionContext<A>) => string);
  readonly control: ControlOf<A>;
  readonly setup?: readonly ScenarioStep<A>[];
  readonly teardown?: readonly ScenarioStep<A>[];
  readonly eventTypes?: readonly string[];
}

/** An action the page cannot originate; the transport sets the dimension and marks the origin. */
export interface ExternalAction<A extends AppContract> {
  readonly id: string;
  readonly label: string | ((context: ActionContext<A>) => string);
  readonly dimension: DimensionOf<A>;
  to(context: ActionContext<A>): string;
  readonly setup?: readonly ScenarioStep<A>[];
}

/** Several measured samples that form one unit (a theme round trip, a rotation sequence). */
export interface SequenceAction<A extends AppContract> {
  readonly id: string;
  readonly steps: readonly (ControlAction<A> | ExternalAction<A>)[];
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

export interface FramesScenario<A extends AppContract> extends ScenarioBase<'frames', A> {
  readonly tool: ToolOf<A>;
  readonly phases: readonly ProbePhase[];
  /** Where the strokes come from. A human's duration is `options.human.seconds`. */
  readonly input:
    | { readonly kind: 'transport'; readonly gesture: GesturePlan }
    | {
        readonly kind: 'probe-synthetic';
        readonly hz: number;
        readonly shape: 'mixed' | 'long' | 'short';
        readonly pointerType: PointerType;
      }
    | { readonly kind: 'human' };
  /** Safety cap on in-contact time the probe banks per phase before ending it on its own. */
  readonly contactCapMs: number;
  readonly repeatedAction?: {
    readonly control: ControlOf<A>;
    readonly count: number;
    readonly pauseMs: number;
    readonly rotateBefore?: boolean;
    readonly settleMs?: number;
  };
  readonly hud?: boolean;
}

export interface ProbePhase {
  readonly key: string;
  readonly paper: 'blank' | 'page';
  readonly suppress?: readonly Suppression[];
}

export type Suppression =
  | { readonly kind: 'css'; readonly css: string }
  | { readonly kind: 'pin-computed'; readonly target: Selector; readonly property: 'transform' };

export interface GesturePlan {
  readonly id: string;
  readonly strokesPerRepeat: number;
  readonly repeats: number;
  readonly pauseMs: number;
  /** One pass; the harness loops and primes between passes. */
  generate(bounds: Bounds, pass: number): readonly PointerSequence[];
  readonly primeBetweenPasses: boolean;
}

export interface FirstShowScenario<A extends AppContract> extends ScenarioBase<'first-show', A> {
  readonly shells: readonly {
    readonly name: string;
    readonly viewport: Viewport;
    readonly open: ControlOf<A>;
    readonly warm: PageExpression;
    readonly close: ControlOf<A>;
  }[];
  readonly cycles: number;
}

export declare function defineScenario<A extends AppContract, const S extends Scenario<A>>(
  app: A,
  scenario: S
): S;

export interface PaperControls {
  readonly ensureBlank: Procedure;
  readonly ensurePage: Procedure;
  readonly instructions: Readonly<Record<'blank' | 'page', string>>;
}
