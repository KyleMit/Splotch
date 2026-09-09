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

import type {
  AppContract,
  ActivationRequest,
  ControlOf,
  ControlRef,
  DimensionOf,
  DimensionSelection,
  DimensionValueOf,
  ObservedDimensions,
  ToolOf,
  VariantOf,
} from './app.js';
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
  ControlRef<A> | { readonly selector: Selector; readonly reason: string };

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
  /**
   * A stroke on the surface through the target's drawing transport, so it is trusted input where
   * the transport is. `proof` is awaited in the page after the lift. (A session's `stroke` step is
   * the in-page synthetic kind.)
   */
  | {
      readonly kind: 'trustedStroke';
      readonly path: PathGenerator;
      readonly durationMs: number;
      readonly proof: PageExpression;
      readonly timeoutMs: number;
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
  | {
      readonly kind: 'ifPresent';
      readonly target: Target<A>;
      readonly then: readonly ScenarioStep<A>[];
      readonly else?: readonly ScenarioStep<A>[];
    }
  | {
      readonly kind: 'ifVisible';
      readonly target: Target<A>;
      readonly then: readonly ScenarioStep<A>[];
      readonly else?: readonly ScenarioStep<A>[];
    }
  | {
      readonly kind: 'retryUntil';
      readonly expression: PageExpression;
      readonly equals: Literal;
      readonly body: readonly ScenarioStep<A>[];
      readonly settleMs: number;
      readonly timeoutMs: number;
      readonly attempts?: number;
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
 * A discrete-action sweep: the idle baseline, then blocks in a fixed order. Order is part of the
 * instrument, and group membership is separate from position: a group id may appear in several
 * blocks (Settings opens in one block, its sections, theme and controls are measured in the blocks
 * between, and it closes in another), so `focusActions` keeps positions while it drops groups. The
 * plan is resolved once against the observed context and emitted into the artifact as data;
 * `idle` is always its first group.
 */
export interface ActionsScenario<A extends AppContract> extends ScenarioBase<'actions', A> {
  readonly idleBaseline: { readonly label: string; readonly idleMs: number };
  readonly sequence: readonly SweepBlock<A>[];
  readonly repeats: { readonly warmup: number; readonly scored: number };
  readonly settleTailFrames: number;
}

export type SweepBlock<A extends AppContract> = ActionBlock<A> | PrepareBlock<A>;

/** Steps that run at this position whatever groups are selected: state every later block assumes. */
export interface PrepareBlock<A extends AppContract> {
  readonly prepare: readonly ScenarioStep<A>[];
  readonly reason: string;
  /** Runs only when one of these groups is selected; absent means always. */
  readonly when?: readonly string[];
}

export interface ActionBlock<A extends AppContract> {
  /** Membership. The same id in two blocks is one group measured at two positions. */
  readonly group: string;
  /** The block also runs when any of these groups is selected (a Settings open that every Settings group needs). */
  readonly runsWith?: readonly string[];
  applicable?(context: ActionContext<A>): true | { readonly reason: string };
  /** Runs once before the block's first action, after `applicable`. */
  readonly setup?: readonly ScenarioStep<A>[];
  /** A list, or a function of the observed context (per variant, per baseline dimension value). */
  readonly actions:
    readonly MeasuredAction<A>[] | ((context: ActionContext<A>) => readonly MeasuredAction<A>[]);
  readonly teardown?: readonly ScenarioStep<A>[];
}

export interface ActionContext<A extends AppContract> {
  readonly dimensions: ObservedDimensions<A>;
  readonly deviceClass: 'tablet' | 'handset' | 'desktop';
  readonly packaged: boolean;
  /** `page.variant` as read from the page before the sweep, or `null` when the app declares none. */
  readonly variant: VariantOf<A> | null;
  /** Groups the sweep was asked for; `focusActions` narrows it. */
  readonly groups: ReadonlySet<string>;
}

export type MeasuredAction<A extends AppContract> =
  ControlAction<A> | ExternalAction<A> | ToggleAction<A> | ScrollAction<A> | SequenceAction<A>;

export interface ControlAction<A extends AppContract> {
  /** Stable identity for focusing and allowances; one per measured direction. */
  readonly id: string;
  readonly label: string | ((context: ActionContext<A>) => string);
  readonly control: ControlRef<A>;
  /** Overrides the control's own readiness for this measurement (a section row that also closes a gate). */
  readonly ready?: PageExpression;
  /** Overrides the control's request; `dom` is refused on a measured sample. */
  readonly activation?: Exclude<ActivationRequest, 'dom'>;
  /** Runs before the activation; the page state the measurement assumes (a menu reopened, ink on the canvas). */
  readonly setup?: readonly ScenarioStep<A>[];
  /** Runs after the sample is taken, before the next action. */
  readonly teardown?: readonly ScenarioStep<A>[];
  readonly eventTypes?: readonly string[];
  /** Replaces the package's plain settle for an animated completion. */
  readonly settleMs?: number;
  /** Emitted only when the target is present at resolve time; otherwise recorded as not applicable with the reason. */
  readonly when?: { readonly present: Target<A>; readonly reason: string };
  /** Emitted only when the named group is not selected (a clear the rotation block needs when `clear` is not measured). */
  readonly onlyWithoutGroup?: string;
}

/**
 * An action the page cannot originate; the transport sets the dimension and marks the origin. The
 * setter is typed by the dimension it names, so a value the contract does not declare is a type
 * error.
 */
export type ExternalAction<A extends AppContract> = {
  [D in DimensionOf<A>]: {
    readonly id: string;
    readonly label: string | ((context: ActionContext<A>) => string);
    readonly dimension: D;
    to(context: ActionContext<A>): DimensionValueOf<A, D>;
    readonly setup?: readonly ScenarioStep<A>[];
  };
}[DimensionOf<A>];

/**
 * A two-state control measured in both directions. The package sets the control to `baseline`
 * unmeasured, measures the switch away from it and the switch back, runs `whileAtBaseline`, and
 * restores the state it found. The two samples are `${id}.enable` and `${id}.disable`, named by the
 * state each produces, whatever order the baseline puts them in, so an allowance for one direction
 * cannot leak to the other. `readyFor` completes the state expression per direction.
 */
export interface ToggleAction<A extends AppContract> {
  readonly kind: 'toggle';
  readonly id: string;
  /** The noun; the package prefixes `enable ` or `disable `. */
  readonly label: string | ((context: ActionContext<A>) => string);
  readonly control: ControlRef<A>;
  readonly baseline: boolean | ((context: ActionContext<A>) => boolean);
  /** Attribute holding `'true'`/`'false'`; `aria-checked` by default. */
  readonly stateAttribute?: string;
  readyFor?(enabled: boolean): PageExpression;
  readonly setup?: readonly ScenarioStep<A>[];
  /** Measured after both directions, while the control sits at `baseline`, before the found state is restored. */
  readonly whileAtBaseline?: readonly MeasuredAction<A>[];
  /** Runs after `whileAtBaseline` and before the found state is restored, so the restore finds its control. */
  readonly teardown?: readonly ScenarioStep<A>[];
  readonly settleMs?: number;
}

/**
 * A measured scroll of a scrollable control, delivered as a native gesture or a trusted wheel per
 * the actions transport; the artifact records `scrollDelivery`. `notApplicable` is evaluated first
 * and, when true, the action is recorded as not applicable with its reason instead of measured.
 */
export interface ScrollAction<A extends AppContract> {
  readonly kind: 'scroll';
  readonly id: string;
  readonly label: string | ((context: ActionContext<A>) => string);
  readonly control: ControlRef<A>;
  readonly distancePx: number;
  readonly durationMs: number;
  /** Displacement proof awaited after the gesture. */
  readonly ready: PageExpression;
  readonly notApplicable: { readonly expression: PageExpression; readonly reason: string };
  /** Leaves the control as found for the next action. */
  readonly reset?: readonly ScenarioStep<A>[];
}

/** Several measured samples that form one unit (a theme round trip, a rotation sequence). */
export interface SequenceAction<A extends AppContract> {
  readonly id: string;
  readonly setup?: readonly ScenarioStep<A>[];
  readonly steps: readonly (ControlAction<A> | ExternalAction<A> | ToggleAction<A>)[];
  readonly teardown?: readonly ScenarioStep<A>[];
}

export interface ResolvedActionPlan {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  /** Selected groups, in first-position order. */
  readonly groups: readonly string[];
  /** Every sample the sweep will take, in emission order. */
  readonly actions: readonly {
    readonly id: string;
    readonly label: string;
    readonly group: string;
    readonly position: number;
  }[];
  readonly notApplicable: readonly {
    readonly id: string;
    readonly group: string;
    readonly reason: string;
  }[];
  readonly context: {
    readonly dimensions: Readonly<Record<string, string>>;
    readonly variant: string | null;
  };
}

export declare function resolveActionPlan<A extends AppContract>(
  scenario: ActionsScenario<A>,
  context: ActionContext<A>
): ResolvedActionPlan;

/** A subset by group id keeps its own scenario id, so a fold never mistakes it for the canonical sweep. Positions are kept. */
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

/**
 * First show of a surface against a reopen. `presented` is the completion condition: the shell's
 * first content a person can see inside the open surface, which is later than the open flag (a
 * staged section is laid out and invisible, and a busy flag can already be false at prewarm).
 * `warm` is what the reopen waits for before it is timed.
 */
export interface FirstShowScenario<A extends AppContract> extends ScenarioBase<'first-show', A> {
  readonly shells: readonly {
    readonly name: string;
    readonly viewport: Viewport;
    readonly open: ControlOf<A>;
    readonly presented: PageExpression;
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
