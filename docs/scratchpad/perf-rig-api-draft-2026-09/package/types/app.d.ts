/**
 * The app contract.
 *
 * Everything the harness knows about a particular application enters through one declared object.
 * The package holds no selector, mark name, window global, route, package id or storage key of its
 * own; a capture that needs one reads it from here, and the in-page recorders are rendered from it
 * so there is no second copy to drift. The contract's literal types flow into the scenario, gate
 * and target definers, so a control name the contract does not declare is a type error rather than
 * a capture that spent device time.
 *
 * An app that cannot provide a required hook cannot be measured trustworthily by this harness, and
 * `perf-rig doctor` says which one is missing rather than letting a capture run.
 */

import type {
  PageExpression,
  PageFunction,
  ParameterisedProcedure,
  PrimeProcedure,
  Procedure,
  Selector,
} from './procedure.js';

export interface AppContract<
  Tool extends string = string,
  ControlName extends string = string,
  DimensionName extends string = string,
> {
  readonly name: string;
  readonly build: BuildContract;
  readonly page: PageContract;
  readonly hooks: HooksContract;
  readonly marks: MarksContract;
  readonly state: StateContract<DimensionName>;
  /** Selectable tools (brushes, instruments, layers). Required by `frames` scenarios. */
  readonly tools?: ToolsContract<Tool>;
  /** Discrete controls a scenario may activate and measure. Required by `actions` and `first-show`. */
  readonly controls?: Readonly<Record<ControlName, Control>>;
  readonly native?: NativeContract;
}

export type ToolOf<A extends AppContract> =
  A extends AppContract<infer T, string, string> ? T : never;
export type ControlOf<A extends AppContract> =
  A extends AppContract<string, infer C, string> ? C : never;
export type DimensionOf<A extends AppContract> =
  A extends AppContract<string, string, infer D> ? D : never;

/**
 * How the instrumented bundle is produced, served, and told apart from every other bundle that
 * could be sitting on the same port. `outputDir`, `build` and `serve` are required by the `build`
 * and `reuse` capture modes; a `url` capture against a server the app runs itself needs only
 * `identity` and `seams`, and `planCapture` refuses a mode the contract cannot serve.
 */
export interface BuildContract {
  readonly outputDir?: string;
  readonly build?: { readonly command: readonly string[] };
  readonly serve?: {
    readonly command: readonly string[];
    readonly portFlag: string;
    readonly readyWhen: 'listening' | { readonly url: string };
  };
  readonly seams: {
    /** Env vars that compile the instrumentation in. */
    readonly env: Readonly<Record<string, string>>;
    /** Expression proving the served page carries the seams; defaults to `page.hydrated`. */
    readonly present?: PageExpression;
  };
  /**
   * How the harness proves the page it drives is the build it thinks it is. `chunks` digests the
   * entry module and every immutable chunk the HTML references against `outputDir`; `stamp` reads a
   * build id the page exposes. Patterns are source text; the package compiles them without flags.
   */
  readonly identity:
    | { readonly strategy: 'chunks'; readonly entryModule: string; readonly immutableChunk: string }
    | {
        readonly strategy: 'stamp';
        readonly expression: PageExpression;
        expected(): Promise<string>;
      };
  /** A variant that must never be served for a web capture, detected by files the variant drops. */
  readonly refusedVariants?: readonly {
    readonly name: string;
    readonly markerFile: string;
    readonly absentFiles: readonly string[];
    readonly remedy: string;
  }[];
  readonly provenanceFile?: string;
}

export interface PageContract {
  readonly path: string | { pathFor(options: { readonly fixture?: string }): string };
  /** The element whose bounding rect is the input target. Must be sized once ready. */
  readonly surface: Selector;
  /** Elements whose change proves work happened, digested before and after a capture. */
  readonly outputSurfaces: {
    readonly selector: Selector;
    readonly proof: 'pixels' | 'mutation-count' | 'expression';
    readonly expression?: PageExpression;
  };
  /** What `elementFromPoint` at the surface centre must resolve inside for a touch to land. */
  readonly hitTestAncestor: Selector;
  /**
   * How the harness knows the client bundle ran. A server-rendered route answers every selector on
   * a page whose modules failed to load, so hydration is proved by an expression that cannot be
   * true in server markup.
   */
  readonly hydrated: PageExpression;
  /** True only when no work is in flight, or quiet for a window when the app never fully rests. */
  readonly resting: { readonly expression: PageExpression } | { readonly quietForMs: number };
  /** Runs after `hydrated` and before `resting`: dismiss a wall, load a fixture. Recorded as a guard. */
  readonly prepare?: Procedure;
  /** The element the frames probe reads paper state from, if the app has a paper concept. */
  readonly paper?: {
    readonly element: Selector;
    readonly activeAttribute: string;
    readonly artShowing: PageExpression;
  };
  /** Transient per-stroke chrome whose disappearance ends the lift path (`liftLatencies`). */
  readonly liftIndicator?: Selector;
  /** A CSP nonce the page exposes, for routes whose policy is nonce-based rather than `'self'`. */
  readonly cspNonce?: PageExpression;
}

export interface HooksContract {
  /**
   * A history depth an undo-style control reduces by exactly one per activation. `extra` fields
   * ride the frames probe's `history` rows, encoded `-1` when absent.
   */
  readonly historyDepth?: {
    readonly depth: PageExpression;
    readonly extra?: Readonly<Record<string, PageExpression>>;
    readonly quiescent?: PageExpression;
  };
  /** Recorded as provenance; never scored. */
  readonly topology?: PageExpression;
  /** For packaged pages that cannot upload over HTTP: `arm`, `collect`, `clear` on a window object, keyed by nonce. */
  readonly bundledReportMailbox?: { readonly object: PageExpression; readonly schema: number };
  /** A sink the app calls instead of downloading a file when the harness installs it. */
  readonly downloadSink?: { readonly global: string };
}

export interface MarksContract {
  /** Prefix every engine measure carries; the probes filter on it. */
  readonly namespace: string;
  readonly measures: Readonly<Record<string, string>>;
  /** Which measures the frames scorer attributes as draw and commit work. Absent means unattributed. */
  readonly attribution?: { readonly draw?: string; readonly commit?: string };
  readonly pairedEnd?: readonly string[];
}

export interface StateContract<DimensionName extends string = string> {
  readonly seed?: {
    readonly localStorage?: Readonly<Record<string, string>>;
    readonly sessionStorage?: Readonly<Record<string, string>>;
    readonly cookies?: readonly {
      readonly name: string;
      readonly value: string;
      readonly domain?: string;
      readonly path?: string;
    }[];
  };
  /**
   * Capture dimensions. Set through the product's own controls or through the transport, always
   * read back from the resolved page state; the artifact records the observed value. Orientation
   * is a dimension like any other.
   */
  readonly dimensions: Readonly<Record<DimensionName, Dimension<string>>>;
}

export interface Dimension<Value extends string> {
  readonly values: readonly Value[];
  readonly read: PageExpression;
  readonly set?:
    | ParameterisedProcedure<Value>
    | {
        readonly via: 'transport';
        readonly map: Readonly<Record<Value, 'PORTRAIT' | 'LANDSCAPE'>>;
        /** For platforms where the app keeps its own lock over the OS setting. */
        readonly releaseLock?: Procedure;
        readonly restoreLock?: Procedure;
      };
}

export interface ToolsContract<Tool extends string> {
  readonly values: readonly Tool[];
  /** Synchronous read of the tool the engine actually committed; selection is proved, never assumed. */
  readonly committed: PageExpression;
  readonly select: ParameterisedProcedure<Tool>;
  /** Leaves no menu over the surface; verified by the hit test. */
  readonly dismissMenus: Procedure;
  readonly prime?: Readonly<Partial<Record<Tool, PrimeProcedure>>>;
  /** Controls a tool admits as a repeated measured action after drawing. */
  readonly admits?: Readonly<Partial<Record<Tool, readonly string[]>>>;
}

export type Activation =
  | 'trusted-touch'
  | 'trusted-cdp-touch'
  | 'native-accessibility-click'
  | 'webdriver-element-click'
  | 'dom-click';

export interface Control {
  readonly selector: Selector;
  readonly activate?: 'trusted' | 'dom';
  readonly enabled?: PageExpression;
  /** Becomes true when the control's effect has landed; ends the readiness window. */
  readonly ready?: PageExpression;
  /** Measure from `marks.measures` this control's work emits. */
  readonly measure?: string;
  /**
   * An in-page driver for repeated measurement with proof: returns the sample or null. Needed by
   * channels that cannot orchestrate the control from outside the page.
   */
  readonly drive?: PageFunction<[index: number], RepeatedActionSample | null>;
  /** How canvases created or resized by this control are classified in the actions probe's mutation rows. */
  readonly canvasKinds?: Readonly<Record<string, Selector>>;
}

export interface RepeatedActionSample {
  readonly index: number;
  readonly engineMs: number;
  readonly nextFrameMs: number;
  readonly beforeCount: number;
  readonly afterCount: number;
}

export interface NativeContract {
  readonly android?: {
    readonly package: string;
    readonly activity: string;
    readonly webviewClass: string;
    readonly packagedOrigin: string;
    readonly build?: { readonly command: readonly string[] };
    readonly install?: { readonly command: readonly string[] };
  };
  readonly ios?: {
    readonly bundleId: string;
    readonly packagedOrigin: string;
    readonly wdaBundleId: string;
    readonly xcodeConfigFile?: string;
    readonly build?: { readonly command: readonly string[] };
    readonly install?: { readonly command: readonly string[] };
  };
  readonly remotePreviewSupported?: boolean;
}

export declare function defineApp<
  const Tool extends string,
  const ControlName extends string,
  const DimensionName extends string,
>(
  app: AppContract<Tool, ControlName, DimensionName>
): AppContract<Tool, ControlName, DimensionName>;

/** Query parameters the harness appends; `doctor` verifies the route ignores each. */
export declare const HARNESS_QUERY_PARAMS: readonly [
  'probe',
  'verify',
  'arm',
  'rehydrate',
  'perf-actions',
];
