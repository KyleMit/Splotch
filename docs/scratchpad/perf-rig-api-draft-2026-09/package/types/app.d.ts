/**
 * The app contract.
 *
 * Everything the harness knows about a particular application enters through one declared object.
 * The package holds no selector, mark name, window global, route, package id, or storage key of its
 * own; a capture that needs one reads it from here. The contract is also what the probe templates
 * are rendered from, so the in-page recorders — which cannot import anything — carry the same
 * values as the Node side without a second copy.
 *
 * The shape follows what the drawing-app harness proved necessary: a way to prove the page
 * hydrated, a way to prove which tool the engine committed, a measure namespace, a history depth,
 * a hit-test ancestor, a resting state the probe can recognise, and a declared set of controls.
 * An app that cannot provide one of the required hooks cannot be measured trustworthily by this
 * harness, and `perf-rig doctor` says which one is missing rather than letting a capture run.
 */

import type { ParameterisedProcedure, Procedure, PageExpression, Selector } from './procedure.js';

export interface AppContract {
  /** Package-style name used in artifact labels and the probe-host protocol token. */
  readonly name: string;
  readonly build: BuildContract;
  readonly page: PageContract;
  readonly hooks: HooksContract;
  readonly marks: MarksContract;
  readonly state: StateContract;
  /** Selectable tools or modes (brushes, instruments, layers). Required by `frames` scenarios. */
  readonly modes?: ModesContract;
  /** Discrete controls a scenario may activate and measure. Required by `actions` scenarios. */
  readonly controls?: Readonly<Record<string, Control>>;
  /** Only for apps that also ship a packaged native build. */
  readonly native?: NativeContract;
  /** Optional harness route with an imperative API, for `engine` scenarios. */
  readonly engineHarness?: EngineHarnessContract;
}

/**
 * How the instrumented bundle is produced, served, and told apart from every other bundle that
 * could be sitting on the same port. Build freshness is the first family of plausible-wrong-number
 * failures the harness catalogued, so nothing here is optional.
 */
export interface BuildContract {
  /** Absolute or repo-relative path of the build output the preview serves. */
  readonly outputDir: string;
  /** Command that produces an instrumented build, run with `seams.env` set. */
  readonly buildCommand: readonly string[];
  /** Command that serves `outputDir` on a port; `{port}` is substituted. */
  readonly serveCommand: readonly string[];
  /** Build-time seams. The harness sets these when building and refuses to score a bundle without them. */
  readonly seams: {
    /** Env vars that compile the instrumentation in. */
    readonly env: Readonly<Record<string, string>>;
    /** Expression proving the served page carries the seams (typically that a hook exists). */
    readonly present: PageExpression;
  };
  /**
   * How to recognise the served HTML's entry module and the immutable chunks it references, so the
   * harness can digest what a port serves against what `outputDir` holds. SvelteKit's are
   * `/_app/immutable/entry/start.*.js` and `/_app/immutable/**.js`.
   */
  readonly identity: {
    readonly entryModule: RegExp;
    readonly immutableChunk: RegExp;
  };
  /**
   * A build variant that must never be served for a web capture (a native static export written
   * into the same directory, say). Detected by files the variant drops.
   */
  readonly refusedVariants?: readonly {
    readonly name: string;
    readonly markerFile: string;
    readonly absentFiles: readonly string[];
    readonly remedy: string;
  }[];
  /** Runs after `buildCommand` to stamp the commit into the output; the package supplies the writer. */
  readonly provenanceFile?: string;
}

export interface PageContract {
  /** Route the drawing surface lives on. */
  readonly path: string;
  /** The element whose bounding rect is the input target. Must be sized once ready. */
  readonly surface: Selector;
  /** Every element whose pixels prove work happened; digested before and after a capture. */
  readonly outputSurfaces: Selector;
  /** What `elementFromPoint` at the surface centre must resolve inside for a touch to land. */
  readonly hitTestAncestor: Selector;
  /**
   * How the harness knows the client bundle ran. The route may be server-rendered, in which case
   * every selector resolves on a page whose modules failed to load. Hydration is proved by an
   * expression that cannot be true in server markup — typically that a hook function exists.
   */
  readonly hydrated: PageExpression;
  /**
   * An expression that is true only when no work is in flight, so a probe phase starts its clock
   * honestly. For the drawing app this is the absence of an active-paper attribute.
   */
  readonly resting: PageExpression;
  /** Query parameters the route must carry without changing behaviour. Verified by `doctor`. */
  readonly toleratedQueryParams: readonly string[];
  /** The route's CSP must allow a same-origin script. Verified by `doctor` against the served headers. */
  readonly allowsSameOriginScript: true;
}

export interface HooksContract {
  /**
   * Synchronous read of the mode the engine actually committed. Selecting a tool through a menu
   * is proved, never assumed; the value persists across navigations, so every capture selects
   * explicitly and asserts.
   */
  readonly committedMode: PageExpression;
  /**
   * A monotone history depth, so an undo-style action can be asserted to reduce it by exactly N.
   * Also read by the frames probe into its `history` rows.
   */
  readonly historyDepth?: {
    readonly read: PageExpression;
    /** Fields copied into the probe's history rows, in order. */
    readonly fields: readonly string[];
    /** Expression that is true when history has settled (no pending work). */
    readonly quiescent: PageExpression;
  };
  /** Recorded as provenance; never scored. */
  readonly topology?: PageExpression;
  /**
   * For packaged native pages that cannot upload over HTTP: `arm(nonce)`, `collect(nonce)` and
   * `clear(nonce)` on a window object, backed by durable storage the host can pull. Required by
   * the `preferences-mailbox` measurement channel.
   */
  readonly bundledReportMailbox?: {
    readonly object: PageExpression;
    readonly storageKeyIsNonce: true;
    readonly schema: number;
  };
  /** A sink the app calls instead of downloading a file when the harness installs it. */
  readonly downloadSink?: { readonly global: string };
}

export interface MarksContract {
  /** Prefix every engine measure carries. The probes filter on it. */
  readonly namespace: string;
  /** Named measures the scorer attributes. `commit` and `draw` are read by the frames scorer. */
  readonly measures: {
    readonly draw: string;
    readonly commit: string;
    readonly [name: string]: string;
  };
  /** Measures that pair an explicit end mark rather than closing at the next measure. */
  readonly pairedEnd?: readonly string[];
}

export interface StateContract {
  /** Storage keys the harness may write before first paint, with the value each capture needs. */
  readonly seed?: Readonly<Record<string, string>>;
  /**
   * Capture dimensions that are set through the product's own controls and read back from the
   * resolved page state, never written directly. The drawing app's are theme and orientation.
   * A dimension without a `set` procedure is observed only.
   */
  readonly dimensions: Readonly<Record<string, Dimension>>;
}

export interface Dimension {
  readonly values: readonly string[];
  /** Expression returning the current resolved value, accounting for defaults that follow the OS. */
  readonly read: PageExpression;
  readonly set?: ParameterisedProcedure<string>;
  /**
   * Platforms that own this dimension outside the page (tablets render no in-app rotation lock).
   * The harness sets it through the transport there and records which path it used.
   */
  readonly platformOwned?: readonly ('ios-tablet' | 'android-tablet' | 'desktop')[];
}

export interface ModesContract {
  readonly values: readonly string[];
  /** Selects a mode and proves it through `hooks.committedMode`. */
  readonly select: ParameterisedProcedure<string>;
  /** A procedure that leaves no menu over the surface afterwards; verified by the hit test. */
  readonly dismissMenus: Procedure;
  /**
   * Work some modes need before every pass so repeated passes measure the same thing — the eraser
   * needs ink to erase. Verified after running and again after the settle, so a wipe during the
   * settle is recorded rather than silently repainted.
   */
  readonly prime?: Readonly<Record<string, Procedure>>;
  /** Extra measured actions a mode admits, by name from `controls`. */
  readonly admits?: Readonly<Record<string, readonly string[]>>;
}

export interface Control {
  readonly selector: Selector;
  /** How the control is activated. `trusted` uses the transport's input; `dom` clicks. */
  readonly activate?: 'trusted' | 'dom';
  /** Expression true when the control may be used. */
  readonly enabled?: PageExpression;
  /** Expression that becomes true when the control's effect has landed; ends the readiness window. */
  readonly ready?: PageExpression;
  /** Measure name from `marks.measures` that this control's work emits, if any. */
  readonly measure?: string;
  /** How canvases created or resized by this control are classified in the action probe's mutation rows. */
  readonly canvasKinds?: Readonly<Record<string, Selector>>;
}

export interface NativeContract {
  readonly android?: {
    readonly package: string;
    readonly activity: string;
    readonly webviewClass: string;
    readonly packagedOrigin: string;
  };
  readonly ios?: {
    readonly bundleId: string;
    readonly packagedOrigin: string;
    /** WebDriverAgent runner bundle id the rig signs. */
    readonly wdaBundleId: string;
    readonly xcodeConfigFile?: string;
  };
  /** A capture-only remote URL the packaged app may load; page identity is `unprovable` there. */
  readonly remotePreviewSupported?: boolean;
}

export interface EngineHarnessContract {
  readonly path: string;
  readonly ready: PageExpression;
  /** Window object exposing the imperative API an `engine` scenario drives. */
  readonly api: PageExpression;
}

/** Identity helper that gives the contract literal types for the rest of the surface. */
export declare function defineApp<const A extends AppContract>(app: A): A;
