// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { themes } from './design/tokens';
import { PAPER_COLORS, THEME_COLORS } from './theme';

// theme.ts deliberately writes these three values literally instead of reading
// them from design/tokens.ts. `themes` is a single object literal carrying ~45
// tokens per theme, so a static import for one value puts all of them on the
// startup path — theme.ts is reached from state/appearance.svelte.ts, which the
// drawing route imports. This is the bundle-boundary case CLAUDE.md carves out,
// and this file is the drift guard that makes the duplication safe.
//
// If one of these fails, change theme.ts to match the token — never the reverse.
// design/tokens.ts is the source of truth (ADR-0071) and generates the CSS.
describe('theme.ts colors track the design tokens', () => {
  it('keeps the dark theme-color on --app-bg', () => {
    expect(THEME_COLORS.dark).toBe(themes.dark.appBg);
  });

  it('keeps both paper colors on --paper', () => {
    expect(PAPER_COLORS.light).toBe(themes.light.paper);
    expect(PAPER_COLORS.dark).toBe(themes.dark.paper);
  });

  // Light is app.html's original white rather than --app-bg (#f5f5f5), which is
  // a deliberate difference, not drift — pinned so it cannot be "fixed" silently.
  it('keeps the light theme-color white, not --app-bg', () => {
    expect(THEME_COLORS.light).toBe('#ffffff');
    expect(THEME_COLORS.light).not.toBe(themes.light.appBg);
  });
});
