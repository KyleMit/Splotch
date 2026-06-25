// Read the OS safe-area insets (the CSS env(safe-area-inset-*) values) as
// numbers. A hidden probe element sized to the env() value is the only reliable
// way to resolve a safe-area inset to a pixel number across engines — we need
// the number (not just the CSS value) to reason about where the notch and the
// system gesture/navbar zones physically sit.

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function measureInset(side: 'top' | 'right' | 'bottom' | 'left'): number {
  const horizontal = side === 'left' || side === 'right';
  const probe = document.createElement('div');
  const axis = horizontal ? 'width' : 'height';
  const cross = horizontal ? 'height:0' : 'width:0';
  probe.style.cssText = `position:fixed;top:0;left:0;${axis}:env(safe-area-inset-${side});${cross};visibility:hidden;pointer-events:none`;
  document.body.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return horizontal ? rect.width : rect.height;
}

export function measureSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === 'undefined') return { ...ZERO_INSETS };
  return {
    top: measureInset('top'),
    right: measureInset('right'),
    bottom: measureInset('bottom'),
    left: measureInset('left'),
  };
}
