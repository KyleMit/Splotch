import type { NativeIconName } from '../rsdDrawing/icons.generated';

// The shipping Button style choice (TOOLBAR_STYLES in src/lib/state/settings.svelte.ts):
// raised buttons, or flat ink printed on the paper. native-settings-sections.test.mjs holds the
// list, default, labels and icons to shipping.
export const TOOLBAR_STYLES = ['buttons', 'bare'] as const;
export type ToolbarStyle = (typeof TOOLBAR_STYLES)[number];
export const DEFAULT_TOOLBAR_STYLE: ToolbarStyle = 'buttons';
export const TOOLBAR_STYLE_OPTIONS: Record<ToolbarStyle, { label: string; icon: NativeIconName }> =
  {
    buttons: { label: 'Raised', icon: 'button-style-raised' },
    bare: { label: 'Flat', icon: 'button-style-flat' },
  };

export function isToolbarStyle(value: unknown): value is ToolbarStyle {
  return TOOLBAR_STYLES.some((style) => style === value);
}
