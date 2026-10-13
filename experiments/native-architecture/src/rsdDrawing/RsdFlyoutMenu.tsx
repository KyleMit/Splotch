import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { ACTION_TILE_RADIUS_RATIO } from './RsdIconButton';
import { colors } from './tokens.css';

// The app.css .flyout-menu values that no design token carries, kept local for the StyleX web
// compile; tools/tests/native-button-chrome.test.mjs holds them to app.css.
export const FLYOUT_MENU_PADDING_PX = 6;
export const FLYOUT_MENU_GAP_PX = 6;

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
});

export function flyoutMenuRadius(optionSize: number) {
  return optionSize * ACTION_TILE_RADIUS_RATIO + FLYOUT_MENU_PADDING_PX;
}

export function RsdFlyoutMenu({
  label,
  direction,
  optionSize,
  children,
}: {
  label: string;
  direction: 'row' | 'column';
  optionSize: number;
  children: ReactNode;
}) {
  return (
    <html.div
      role="group"
      aria-label={label}
      style={[styles.menu, styles[direction], styles.radius(flyoutMenuRadius(optionSize))]}
    >
      {children}
    </html.div>
  );
}
