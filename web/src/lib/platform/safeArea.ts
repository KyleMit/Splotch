// Read the OS safe-area insets (the CSS env(safe-area-inset-*) values) as
// numbers. A hidden probe element positioned by the inset custom properties is
// the only reliable way to resolve a safe-area inset to a pixel number across
// engines — we need the number (not just the CSS value) to reason about where
// the notch and the system gesture/navbar zones physically sit.

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export type SafeAreaEdge = keyof SafeAreaInsets;

export const SAFE_AREA_EDGES: readonly SafeAreaEdge[] = ['top', 'right', 'bottom', 'left'];

// Every inset consumer — CSS and JS alike — reads these custom properties rather
// than calling env() directly. app.css seeds them from env() on :root, so the
// production values are unchanged; the indirection is what lets a harness
// override the insets on a subtree (routes/dev/notch) without CDP, which is the
// only inset-emulation seam Chromium offers and one Playwright alone can reach.
// app.css is the other side of this agreement — safeArea.test.ts fails if the
// stylesheet stops declaring one of these on :root.
export const SAFE_AREA_PROPERTIES = {
  top: '--safe-area-top',
  right: '--safe-area-right',
  bottom: '--safe-area-bottom',
  left: '--safe-area-left',
} as const satisfies Record<SafeAreaEdge, string>;

/** The CSS length expression for one inset, for use in a calc() built in JS. */
export function safeAreaLength(edge: SafeAreaEdge): string {
  return `var(${SAFE_AREA_PROPERTIES[edge]})`;
}

/** Inline `style` text setting all four inset properties to explicit pixel values. */
export function safeAreaOverrideStyle(insets: SafeAreaInsets): string {
  return SAFE_AREA_EDGES.map((edge) => `${SAFE_AREA_PROPERTIES[edge]}:${insets[edge]}px`).join(';');
}

let safeAreaProbe: HTMLDivElement | undefined;

export function measureSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === 'undefined') return { ...ZERO_INSETS };
  if (!safeAreaProbe?.isConnected) {
    safeAreaProbe = document.createElement('div');
    safeAreaProbe.style.cssText =
      `position:fixed;top:${safeAreaLength('top')};right:${safeAreaLength('right')};` +
      `bottom:${safeAreaLength('bottom')};left:${safeAreaLength('left')};` +
      'visibility:hidden;pointer-events:none';
    document.body.appendChild(safeAreaProbe);
  }
  const rect = safeAreaProbe.getBoundingClientRect();
  // Fixed positioning resolves against the layout viewport (clientWidth/Height),
  // so right/bottom insets are the gap between the probe and that edge.
  const { clientWidth, clientHeight } = document.documentElement;
  return {
    top: rect.top,
    right: clientWidth - rect.right,
    bottom: clientHeight - rect.bottom,
    left: rect.left,
  };
}
