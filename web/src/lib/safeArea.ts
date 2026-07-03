// Read the OS safe-area insets (the CSS env(safe-area-inset-*) values) as
// numbers. A hidden probe element positioned by the env() values is the only
// reliable way to resolve a safe-area inset to a pixel number across engines —
// we need the number (not just the CSS value) to reason about where the notch
// and the system gesture/navbar zones physically sit.

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function measureSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === 'undefined') return { ...ZERO_INSETS };
  // One fixed probe inset by all four env() values resolves every side with a
  // single append + layout + rect read (vs. four separate probes per call).
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:env(safe-area-inset-top);right:env(safe-area-inset-right);' +
    'bottom:env(safe-area-inset-bottom);left:env(safe-area-inset-left);' +
    'visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  // Fixed positioning resolves against the layout viewport (clientWidth/Height),
  // so right/bottom insets are the gap between the probe and that edge.
  const { clientWidth, clientHeight } = document.documentElement;
  probe.remove();
  return {
    top: rect.top,
    right: clientWidth - rect.right,
    bottom: clientHeight - rect.bottom,
    left: rect.left,
  };
}
