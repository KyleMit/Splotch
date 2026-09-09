/**
 * The app contract.
 *
 * Everything the harness knows about a particular application enters through one declared object.
 * The package holds no selector, mark name, window global, route, package id or storage key of its
 * own; a capture that needs one reads it from here, and the in-page recorders are rendered from it
 * so there is no second copy to drift. The contract's literal types (tool names, control names,
 * dimension names and their values) flow into the scenario, gate and target definers, so a value
 * the contract does not declare is a type error rather than a capture that spent device time.
 *
 * Function-typed members are declared as methods so a contract with literal parameters is
 * assignable where the package accepts any contract; the package only ever calls them with members
 * of the declared sets, and `doctor` compiles every member.
 */

import type {
  PageExpression,
  PageFunction,
  ParameterisedProcedure,
  PrimeProcedure,
  Procedure,
  Selector,
} from './procedure.js';
import type { RefreshRegimeBand } from './target.js';

export type Dimensions = Readonly<Record<string, Dimension<string>>>;

export interface AppContract<
  Tool extends string = string,
  ControlName extends string = string,
  Dims extends Dimensions = Dimensions,
> {
  readonly name: string;
  readonly build: BuildContract;
  readonly page: PageContract;
  readonly hooks: HooksContract;
  readonly marks: MarksContract;
  readonly state: StateContract<Dims>;
  /** Selectable tools (brushes, instruments, layers). Required by `frames` scenarios. */
  readonly tools?: ToolsContract<Tool>;
  /** Discrete controls a scenario may activate and measure. Required by `actions` and `first-show`. */
  readonly controls?: Readonly<Record<ControlName, Control>>;
  readonly native?: NativeContract;
  /** Presentation rates the app is measured on; defaults to the package's measured bands. */
  readonly refreshRegimes?: readonly RefreshRegimeBand[];
}

export type ToolOf<A extends AppContract> =
  A extends AppContract<infer T, string, Dimensions> ? T : never;
export type ControlOf<A extends AppContract> =
  A extends AppContract<string, infer C, Dimensions> ? C : never;
export type DimensionOf<A extends AppContract> = keyof A['state']['dimensions'] & string;
export type DimensionValueOf<
  A extends AppContract,
  D extends DimensionOf<A>,
> = A['state']['dimensions'][D]['values'][number];
export type DimensionSelection<A extends AppContract> = {
  readonly [D in DimensionOf<A>]?: DimensionValueOf<A, D>;
};

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
    readonly env: Readonly<Record<string, string>>;
    /** Expression proving the served page carries the seams; defaults to `page.hydrated`. */
    readonly present?: PageExpression;
  };
  /**
   * `chunks` digests the entry module and every immutable chunk the HTML references against
   * `outputDir`; `stamp` reads a build id the page exposes. Patterns are source text compiled
   * without flags.
   */
  readonly identity:
    | { readonly strategy: 'chunks'; readonly entryModule: string; readonly immutableChunk: string }
    | {
        readonly strategy: 'stamp';
        readonly expression: PageExpression;
        expected(): Promise<string>;
      };
  readonly refusedVariants?: readonly {
    readonly name: string;
    readonly markerFile: string;
    readonly absentFiles: readonly string[];
    readonly remedy: string;
  }[];
  readonly provenanceFile?: string;
}

/**
 * How output surfaces prove work happened. `pixels` reads a 64 px downscale of each canvas with
 * `getImageData` and hashes it, so a WebGL canvas without `preserveDrawingBuffer` reads black and
 * must use `expression`; `mutation-count` counts DOM mutations under the selector.
 */
export type OutputProof =
  | { readonly selector: Selector; readonly proof: 'pixels' }
  | { readonly selector: Selector; readonly proof: 'mutation-count' }
  | {
      readonly selector: Selector;
      readonly proof: 'expression';
      readonly expression: PageExpression;
    };

export interface PageContract {
  readonly path: string | { pathFor(options: { readonly fixture?: string }): string };
  /** The element whose bounding rect is the input target. Must be sized once ready. */
  readonly surface: Selector;
  readonly outputSurfaces: OutputProof;
  /** What `elementFromPoint` at the surface centre must resolve inside for a touch to land. */
  readonly hitTestAncestor: Selector;
  /** Cannot be true in server-rendered markup; typically that a hook function exists. */
  readonly hydrated: PageExpression;
  /**
   * True only when no work is in flight; or, for an app that never fully rests, a window during
   * which no pointer event, no output-surface mutation and no engine measure occurred.
   */
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
  readonly cspNonce?: PageExpression;
}

export interface HooksContract {
  /** A history depth an undo-style control reduces by exactly one per activation. `extra` rides the probe's `history` rows, `-1` when absent. */
  readonly historyDepth?: {
    readonly depth: PageExpression;
    readonly extra?: Readonly<Record<string, PageExpression>>;
    readonly quiescent?: PageExpression;
  };
  readonly topology?: PageExpression;
  readonly bundledReportMailbox?: { readonly object: PageExpression; readonly schema: number };
  readonly downloadSink?: { readonly global: string };
}

export interface MarksContract {
  readonly namespace: string;
  readonly measures: Readonly<Record<string, string>>;
  /** Which measures the frames scorer attributes as draw and commit work. Absent means unattributed. */
  readonly attribution?: { readonly draw?: string; readonly commit?: string };
  readonly pairedEnd?: readonly string[];
}

export interface StateContract<Dims extends Dimensions = Dimensions> {
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
  /** Capture dimensions, always read back from the resolved page state; the artifact records the observed value. */
  readonly dimensions: Dims;
}

/** Facts a transport can set from outside the page. Append-only. */
export type TransportCapability = 'orientation';

/** What the page reports about an app-level lock over a transport-owned dimension. */
export type LockState = 'platform-owned' | 'unlocked' | 'locked';

export interface Dimension<Value extends string> {
  readonly values: readonly Value[];
  readonly read: PageExpression;
  readonly set?:
    | ParameterisedProcedure<Value>
    | {
        readonly via: 'transport';
        readonly capability: TransportCapability;
        readonly map: Readonly<Record<Value, string>>;
        /**
         * An app may hold its own lock over the transport-owned value. `read` reports the lock
         * state; `release` runs before the transport sets the value and its result feeds
         * `restore`, which runs only when there was a lock to restore.
         */
        readonly lock?: {
          readonly read: PageExpression;
          readonly release: ParameterisedProcedure<LockState>;
          readonly restore: ParameterisedProcedure<LockState>;
        };
      };
}

export interface ToolsContract<Tool extends string> {
  readonly values: readonly Tool[];
  /** Synchronous read of the tool the engine actually committed; selection is proved, never assumed. */
  readonly committed: PageExpression;
  readonly select: ParameterisedProcedure<Tool>;
  readonly dismissMenus: Procedure;
  readonly prime?: Readonly<Partial<Record<Tool, PrimeProcedure>>>;
  /** Controls a tool admits as a repeated measured action after drawing. */
  readonly admits?: Readonly<Partial<Record<Tool, readonly string[]>>>;
}

/** How an activation was actually delivered, as recorded. */
export type Activation =
  | 'trusted-touch'
  | 'trusted-cdp-touch'
  | 'native-accessibility-click'
  | 'webdriver-element-click'
  | 'dom-click';

export interface Control {
  readonly selector: Selector;
  /** Requested delivery; the artifact records the `Activation` that happened. */
  readonly activation?: 'trusted' | 'dom';
  readonly enabled?: PageExpression;
  readonly ready?: PageExpression;
  readonly measure?: string;
  /** An in-page driver for repeated measurement with proof, for channels that cannot orchestrate from outside the page. */
  readonly drive?: PageFunction<[index: number], RepeatedActionSample | null>;
  readonly canvasKinds?: Readonly<Record<string, Selector>>;
}

export interface RepeatedActionSample {
  readonly index: number;
  readonly startedAt: number;
  readonly endedAt: number;
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
    readonly build?: { readonly command: readonly string[] };
    readonly install?: { readonly command: readonly string[] };
  };
  readonly remotePreviewSupported?: boolean;
}

export declare function defineApp<
  const Tool extends string,
  const ControlName extends string,
  const Dims extends Dimensions,
>(app: AppContract<Tool, ControlName, Dims>): AppContract<Tool, ControlName, Dims>;

/** Query parameters the harness appends; `doctor` verifies the route ignores each. */
export declare const HARNESS_QUERY_PARAMS: readonly [
  'probe',
  'verify',
  'arm',
  'rehydrate',
  'perf-actions',
  'perf-android-web',
];

/** Browser packages the package launches by platform; the app never declares these. */
export declare const BROWSER_PACKAGES: {
  readonly android: 'com.android.chrome';
  readonly ios: 'com.apple.mobilesafari';
};
