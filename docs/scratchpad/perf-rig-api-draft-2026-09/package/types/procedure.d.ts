/**
 * Declarative page procedures.
 *
 * Every transport reaches the page through a different channel: a Playwright page, a WebDriver
 * session, or a same-origin script injected into a proxied route that has no script channel at all.
 * The harness therefore never accepts a JavaScript function for "select the pen" or "switch to
 * dark". It accepts a procedure as data and compiles it once per channel. Semantics are the lowest
 * common denominator so the same procedure means the same thing everywhere: selectors do not pierce
 * shadow roots, visibility means laid out (`offsetParent`), and a DOM click is a DOM click. Only
 * `tap` reaches for the transport's trusted input.
 *
 * A postcondition is evaluated in the channel that ran the steps. On the plan-polled channel that
 * means inside the page, with the answer posted back; the harness never assumes it can ask.
 */

export type Selector = string;
export type PageExpression = string;
export type Literal = string | number | boolean | null;

/**
 * Source text of a self-contained function. The harness wraps and invokes it; it never evals a
 * string. It must not close over Node scope. `Args` and `Result` are documentation-grade phantom
 * types: the compiler cannot check the body, and every page function's source is part of the
 * instrument fingerprint.
 */
export type PageFunction<
  Args extends readonly Literal[] = readonly Literal[],
  Result = unknown,
> = string & {
  readonly __args?: Args;
  readonly __result?: Result;
};

export interface Postcondition {
  readonly expression: PageExpression;
  readonly equals: Literal;
  readonly timeoutMs: number;
}

export type Step =
  | { readonly kind: 'click'; readonly target: Selector; readonly nth?: number }
  /**
   * Activate through the transport's trusted input. On a channel with no trusted input the
   * procedure either refuses or clicks and records `activation: 'dom-click'` in the result.
   */
  | {
      readonly kind: 'tap';
      readonly target: Selector;
      readonly onUntrustedChannel: 'refuse' | 'click-and-record';
    }
  | { readonly kind: 'press'; readonly key: string; readonly target?: Selector }
  | { readonly kind: 'type'; readonly target: Selector; readonly text: string }
  | { readonly kind: 'hover'; readonly target: Selector }
  | {
      readonly kind: 'wheel';
      readonly target: Selector;
      readonly deltaX: number;
      readonly deltaY: number;
    }
  | {
      readonly kind: 'drag';
      readonly from: Selector;
      readonly to: { readonly dx: number; readonly dy: number };
      readonly durationMs: number;
    }
  | { readonly kind: 'waitPresent'; readonly target: Selector; readonly timeoutMs: number }
  | { readonly kind: 'waitVisible'; readonly target: Selector; readonly timeoutMs: number }
  | { readonly kind: 'waitHidden'; readonly target: Selector; readonly timeoutMs: number }
  | {
      readonly kind: 'until';
      readonly expression: PageExpression;
      readonly equals: Literal;
      readonly timeoutMs: number;
      readonly pollMs?: number;
    }
  | {
      readonly kind: 'ifPresent';
      readonly target: Selector;
      readonly then: readonly Step[];
      readonly else?: readonly Step[];
    }
  | {
      readonly kind: 'ifVisible';
      readonly target: Selector;
      readonly then: readonly Step[];
      readonly else?: readonly Step[];
    }
  /**
   * Test the expression, and only while it is not satisfied run the body, settle, and test again.
   * The expression is always tested before the first body run, so a satisfied expression runs the
   * body zero times; a retry that ran its body first once toggled a closed menu open on the odd
   * click.
   */
  | {
      readonly kind: 'retryUntil';
      readonly expression: PageExpression;
      readonly equals: Literal;
      readonly body: readonly Step[];
      readonly settleMs: number;
      readonly timeoutMs: number;
      readonly attempts?: number;
    }
  | { readonly kind: 'settle'; readonly ms: number; readonly reason: string }
  /**
   * Run an app-supplied page function. The result lands in the procedure result under `recordAs`,
   * never in a window global. `awaits` says whether the function returns a promise, which decides
   * the WebDriver `execute` versus `executeAsync` path.
   */
  | {
      readonly kind: 'evaluate';
      readonly fn: PageFunction;
      readonly args?: readonly Literal[];
      readonly awaits: boolean;
      readonly recordAs: string;
    };

export interface Procedure {
  readonly name: string;
  readonly steps: readonly Step[];
  /** Without a postcondition the procedure is recorded as `unverified` in the trust ledger. */
  readonly postcondition?: Postcondition;
}

/**
 * A procedure whose steps depend on a value; the parent declares the value set once, and the
 * package invokes `steps` and `postcondition` only with members of that set (`doctor` compiles
 * every member).
 */
export interface ParameterisedProcedure<Value extends string> {
  readonly name: string;
  steps(value: Value): readonly Step[];
  postcondition(value: Value): Postcondition;
}

export interface ProcedureResult {
  readonly name: string;
  readonly verified: boolean | 'unverified';
  readonly activation?:
    | 'trusted-touch'
    | 'trusted-cdp-touch'
    | 'native-accessibility-click'
    | 'webdriver-element-click'
    | 'dom-click';
  /** Values recorded by `evaluate` steps, by `recordAs`. */
  readonly records: Readonly<Record<string, unknown>>;
  readonly channel: 'playwright' | 'webdriver' | 'in-page';
}

/** What a prime function reports: surfaces still waiting for a backing, or the surfaces it checked and which of them are transparent. */
export type PrimeReport =
  | { readonly pending: readonly string[] }
  | {
      readonly tiles: number;
      readonly backings: number;
      readonly transparentTiles: readonly string[];
    };

/**
 * Work a tool needs before every pass so repeated passes measure the same thing (an eraser needs
 * ink). `apply` paints and reports; it is polled until it reports nothing pending and nothing
 * transparent within `budgetMs`. After `settleMs`, `verify` runs and never paints; a wipe found
 * there is repaired, re-proved, and recorded as `repairedAfterSettle`. Between gesture passes the
 * harness proves the previous pass delivered a new trusted lift before priming again, and waits
 * `idleFramesBetweenPasses` so the prime's own paint is outside the next in-contact window.
 */
export interface PrimeProcedure {
  readonly name: string;
  readonly apply: PageFunction<[], PrimeReport>;
  readonly verify: PageFunction<[], PrimeReport>;
  readonly settleMs: number;
  readonly budgetMs: number;
  readonly idleFramesBetweenPasses: number;
}
