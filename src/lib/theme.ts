export const RESOLVED_THEMES = ['light', 'dark'] as const;

export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

export const PAPER_COLORS = { light: '#fcfbf8', dark: '#211f29' } as const;
