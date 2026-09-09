/**
 * Declarative page procedures.
 *
 * Every transport reaches the page through a different channel — a Playwright page, a WebDriver
 * session, or a same-origin script injected into a proxied route that has no script channel at all
 * (ADR-0135). The harness therefore never accepts a JavaScript function for "select the pen" or
 * "switch to dark"; it accepts a procedure as data and compiles it once per channel. The same
 * procedure runs through `page.click()` on desktop, `POST /element/click` under Appium, and
 * `document.querySelector(...).click()` inside the split-capture bootstrap.
 *
 * The step vocabulary is deliberately small. Anything it cannot express is a sign the app needs a
 * hook (see `AppContract.hooks`), not that the vocabulary needs a branch.
 */

/** A CSS selector. The harness never derives selectors; every one is declared by the app. */
export type Selector = string;

/**
 * A JavaScript expression evaluated in the page, returning a JSON-serialisable value. Written as
 * source text because one of the channels cannot accept a function. Keep it a single expression.
 */
export type PageExpression = string;

export type Step =
  /** Click the first match. Fails if nothing matches. */
  | { readonly kind: 'click'; readonly target: Selector }
  /**
   * Activate a control through the transport's trusted input rather than a DOM click, so the
   * activation is measured as a user would produce it. Falls back to `click` on channels that
   * have no trusted input (the split bootstrap).
   */
  | { readonly kind: 'tap'; readonly target: Selector }
  /** Wait until the selector matches and is laid out (has an `offsetParent`), not merely present. */
  | { readonly kind: 'waitVisible'; readonly target: Selector; readonly timeoutMs?: number }
  /** Wait until the selector stops being laid out. A control that is always in the DOM cannot be probed by presence. */
  | { readonly kind: 'waitHidden'; readonly target: Selector; readonly timeoutMs?: number }
  /** Poll an expression until it is strictly equal to `equals`. */
  | {
      readonly kind: 'until';
      readonly expression: PageExpression;
      readonly equals: string | number | boolean | null;
      readonly timeoutMs?: number;
    }
  /** Branch on whether a selector is currently laid out. */
  | {
      readonly kind: 'ifVisible';
      readonly target: Selector;
      readonly then: readonly Step[];
      readonly else?: readonly Step[];
    }
  /** Repeat the body until the expression equals the value, at most `attempts` times. */
  | {
      readonly kind: 'retryUntil';
      readonly expression: PageExpression;
      readonly equals: string | number | boolean | null;
      readonly attempts: number;
      readonly body: readonly Step[];
    }
  /** Sleep. Named so the settle it exists for can be read back from the artifact. */
  | { readonly kind: 'settle'; readonly ms: number; readonly reason: string }
  /**
   * Run app-supplied function source in the page. The escape hatch for work the vocabulary cannot
   * express, such as verifying a fill landed on every tile. The source is shipped verbatim into
   * the bootstrap, so it must be self-contained and must not close over Node scope.
   */
  | {
      readonly kind: 'evaluate';
      readonly functionSource: string;
      readonly args?: readonly (string | number | boolean | null)[];
      readonly recordAs?: string;
    };

export interface Procedure {
  readonly name: string;
  readonly steps: readonly Step[];
  /**
   * An expression that must hold once the procedure finishes, evaluated by the harness after the
   * last step. A procedure with no postcondition is not verified, and the artifact records it as
   * `unverified` in the trust ledger.
   */
  readonly postcondition?: {
    readonly expression: PageExpression;
    readonly equals: string | number | boolean | null;
    readonly timeoutMs?: number;
  };
}

/** A procedure whose steps depend on a value, such as the theme or the mode being selected. */
export interface ParameterisedProcedure<Value extends string> {
  readonly name: string;
  readonly values: readonly Value[];
  readonly steps: (value: Value) => readonly Step[];
  readonly postcondition: (value: Value) => NonNullable<Procedure['postcondition']>;
}
