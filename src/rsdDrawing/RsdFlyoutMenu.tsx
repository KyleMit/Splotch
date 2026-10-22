import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { ACTION_TILE_RADIUS_RATIO, flyoutOptionSize, type FlyoutScale } from './RsdIconButton';
import { colors } from './tokens.css';
import { useBareToolbar } from './toolbarSkin';

// The app.css .flyout-menu values that no design token carries, kept local for the StyleX web
// compile; tools/tests/native-button-chrome.test.mjs holds them to app.css.
const FLYOUT_MENU_PADDING_PX = 6;
const FLYOUT_MENU_GAP_PX = 6;
// A flat menu has no card: its options sit on the paper this far apart, with no padding.
export const BARE_FLYOUT_MENU_GAP_PX = 4;

// The shipping .flyout-menu popover card. Its options round by the action tile's ratio, so the
// card's radius is theirs plus its padding: concentric corners. Placement stays with the caller.
const styles = css.create({
  menu: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: FLYOUT_MENU_GAP_PX,
    padding: FLYOUT_MENU_PADDING_PX,
    backgroundColor: colors.floatSurface,
    borderWidth: 0,
    boxShadow: colors.floatShadow,
  },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  radius: (radius: number) => ({ borderRadius: radius }),
  spacing: (padding: number, gap: number) => ({ padding, gap }),
  bare: { backgroundColor: 'transparent', boxShadow: 'none' },
});

// A menu whose options are not action tiles spaces them its own way: the Color Menu's swatch row.
export type FlyoutMenuSpacing = Readonly<{ paddingPx: number; gapPx: number }>;

function flyoutMenuRadius(scale: FlyoutScale) {
  return flyoutOptionSize(scale) * ACTION_TILE_RADIUS_RATIO + FLYOUT_MENU_PADDING_PX;
}

export function RsdFlyoutMenu({
  label,
  direction,
  base,
  scale,
  spacing,
  children,
}: FlyoutScale & {
  label: string;
  direction: 'row' | 'column';
  spacing?: FlyoutMenuSpacing;
  children: ReactNode;
}) {
  const bare = useBareToolbar();
  return (
    <html.div
      role="group"
      aria-label={label}
      style={[
        styles.menu,
        styles[direction],
        styles.radius(flyoutMenuRadius({ base, scale })),
        bare && styles.bare,
        spacing
          ? styles.spacing(spacing.paddingPx, spacing.gapPx)
          : bare && styles.spacing(0, BARE_FLYOUT_MENU_GAP_PX),
      ]}
    >
      {children}
    </html.div>
  );
}
