import { css, html } from 'react-strict-dom';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_BRAND, DRAWING_SCALE } from '../drawing/theme';
import { RsdIcon } from './RsdIcon';
import type { NativeIconName } from './icons.generated';
import { brandColors, colors, dimensions, motion } from './tokens.css';

// The app.css chrome values that no design token carries. They stay in this module because the
// StyleX web compile resolves only local constants and token files inside css.create;
// tools/tests/native-button-chrome.test.mjs reads app.css and fails on divergence.
export const CORNER_BUTTON_SIZE_PX = 48;
// Whole-button opacity over a full-ink glyph; idle is the floor that keeps the glyph above 3:1.
export const CORNER_IDLE_OPACITY = 0.5;
export const CORNER_HOVER_OPACITY = 0.7;
export const CORNER_PRESSED_OPACITY = 1;
export const ACTION_TILE_BORDER_PX = 2;
export const ACTION_TILE_RADIUS_RATIO = 0.3;
// The icon keeps a sixth of the face as padding on each side.
export const ACTION_TILE_PADDING_SHARE = 6;
export const ACTION_TILE_PRESS_SCALE = 0.95;
// Deeper than the shared disabled opacity: a parked canvas control must not read as live.
export const ACTION_TILE_DISABLED_OPACITY = 0.3;
// Shipping mixes --brand into transparent; React Native has no color-mix(), so the mixes are
// resolved against the unthemed brand hue.
export const ACTION_TILE_HOVER_SHADOW = '0 4px 12px rgba(171, 113, 225, 0.3)';
export const BRAND_SELECTION_RING = '0 0 0 2px rgba(171, 113, 225, 0.35)';
// An option squares with the tile that opened its menu, never below this base, and its padding
// scales from its value at that base.
export const FLYOUT_OPTION_MIN_BASE_PX = 60;
export const FLYOUT_OPTION_PADDING_PX = 7;
export const FLYOUT_OPTION_PRESS_SCALE = 0.92;
// Black reads against every pen color and both papers.
export const WHITE_INK_KEYLINE = '#000';

// The shipping icon-button skins: .corner-button, the Actions Panel's .action-button tile and
// .flyout-option. Hover is web-only, under (hover: hover), which React Native never matches. Every
// press is an RSD :active transition. The native renderer animates only the listed properties
// named by their camelCase style key, so the kebab-case color and shadow names reach the web's
// CSS transition alone and transform and opacity run on the native driver: one render as the
// press starts and one as it ends, none per frame.
const styles = css.create({
  base: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'solid',
    cursor: 'pointer',
    transitionTimingFunction: 'ease',
  },
  corner: {
    width: CORNER_BUTTON_SIZE_PX,
    height: CORNER_BUTTON_SIZE_PX,
    padding: dimensions.space2,
    borderWidth: 0,
    backgroundColor: 'transparent',
    opacity: {
      default: CORNER_IDLE_OPACITY,
      ':active': CORNER_PRESSED_OPACITY,
      '@media (hover: hover)': {
        default: CORNER_IDLE_OPACITY,
        ':hover': CORNER_HOVER_OPACITY,
        ':active': CORNER_PRESSED_OPACITY,
      },
    },
    transitionProperty: 'opacity',
    transitionDuration: motion.durationBase,
  },
  tile: {
    borderWidth: ACTION_TILE_BORDER_PX,
    backgroundColor: {
      default: colors.floatSurface,
      ':active': colors.brandWash,
      '@media (hover: hover)': {
        default: colors.floatSurface,
        ':hover': colors.floatSurfaceHover,
        ':active': colors.brandWash,
      },
    },
    borderColor: {
      default: colors.floatBorder,
      '@media (hover: hover)': { default: colors.floatBorder, ':hover': brandColors.brand },
    },
    boxShadow: {
      default: colors.floatShadow,
      '@media (hover: hover)': { default: colors.floatShadow, ':hover': ACTION_TILE_HOVER_SHADOW },
    },
    opacity: 1,
    transform: { default: 'scale(1)', ':active': `scale(${ACTION_TILE_PRESS_SCALE})` },
    transitionProperty: 'transform, opacity, background-color, border-color, box-shadow',
    transitionDuration: motion.durationBase,
  },
  // Hovering a selected tile still shows the hover treatment, as shipping's more specific
  // hover rule wins over its .active rule.
  tileSelected: {
    backgroundColor: {
      default: colors.brandWash,
      '@media (hover: hover)': {
        default: colors.brandWash,
        ':hover': colors.floatSurfaceHover,
        ':active': colors.brandWash,
      },
    },
    borderColor: brandColors.brand,
    boxShadow: {
      default: BRAND_SELECTION_RING,
      '@media (hover: hover)': {
        default: BRAND_SELECTION_RING,
        ':hover': ACTION_TILE_HOVER_SHADOW,
      },
    },
  },
  tileDisabled: {
    backgroundColor: colors.floatSurfaceHover,
    borderColor: colors.floatBorder,
    boxShadow: colors.floatShadow,
    opacity: ACTION_TILE_DISABLED_OPACITY,
    transform: 'scale(1)',
    cursor: 'auto',
  },
  flyout: {
    borderWidth: ACTION_TILE_BORDER_PX,
    backgroundColor: {
      default: colors.floatSurface,
      '@media (hover: hover)': { default: colors.floatSurface, ':hover': colors.brandWash },
    },
    borderColor: {
      default: colors.floatBorder,
      '@media (hover: hover)': { default: colors.floatBorder, ':hover': brandColors.brand },
    },
    transform: { default: 'scale(1)', ':active': `scale(${FLYOUT_OPTION_PRESS_SCALE})` },
    transitionProperty: 'transform, background-color, border-color, box-shadow',
    transitionDuration: motion.durationFast,
  },
  flyoutSelected: {
    backgroundColor: colors.brandWash,
    borderColor: brandColors.brand,
    boxShadow: BRAND_SELECTION_RING,
  },
  face: (size: number, padding: number) => ({
    width: size,
    height: size,
    padding,
    borderRadius: size * ACTION_TILE_RADIUS_RATIO,
  }),
});

const CORNER_ICON_PX = CORNER_BUTTON_SIZE_PX - 2 * DRAWING_SCALE.space2;

// The option's padding scales with it, from its value at the minimum base.
function facePadding(skin: 'tile' | 'flyout', size: number) {
  return skin === 'tile'
    ? size / ACTION_TILE_PADDING_SHARE
    : (FLYOUT_OPTION_PADDING_PX * size) / FLYOUT_OPTION_MIN_BASE_PX;
}

// The square a tile or option of this outer size leaves its icon.
function faceIconSize(skin: 'tile' | 'flyout', size: number) {
  return size - 2 * (facePadding(skin, size) + ACTION_TILE_BORDER_PX);
}

// .white-stroke rings white ink in black; .dark-stroke rings near-black ink in the themed
// keyline, which is transparent (no keyline) on light paper.
export type InkKeyline = 'white' | 'dark';

type Selection =
  { selection?: never; selected?: never } | { selection: 'radio' | 'switch'; selected: boolean };

type Common = {
  icon: NativeIconName;
  label: string;
  onPress: () => void;
};

type FaceInk = {
  size: number;
  // Resolves the icon's currentColor: a brush face's ink parts take the active paint.
  ink?: string;
  keyline?: InkKeyline;
};

export type IconButtonProps = Common &
  (
    | { skin: 'corner'; expanded?: boolean }
    | ({ skin: 'tile'; disabled?: boolean; expanded?: boolean } & FaceInk & Selection)
    | ({ skin: 'flyout' } & FaceInk & Selection)
  );

function useKeylineColor(keyline: InkKeyline | undefined) {
  const { darkInkKeyline } = useDrawingTheme();
  if (keyline === 'white') return WHITE_INK_KEYLINE;
  if (keyline === 'dark' && darkInkKeyline !== 'transparent') return darkInkKeyline;
  return undefined;
}

export function RsdIconButton(props: IconButtonProps) {
  const keylineSource = props.skin === 'corner' ? undefined : props.keyline;
  const keyline = useKeylineColor(keylineSource);
  const { icon, label, onPress } = props;
  if (props.skin === 'corner') {
    return (
      <html.button
        type="button"
        aria-label={label}
        aria-expanded={props.expanded}
        style={[styles.base, styles.corner]}
        onClick={onPress}
      >
        <RsdIcon name={icon} size={CORNER_ICON_PX} ink={undefined} muted={false} />
      </html.button>
    );
  }
  const { skin, size, ink, selection, selected = false } = props;
  const disabled = skin === 'tile' && props.disabled === true;
  const expanded = skin === 'tile' ? props.expanded : undefined;
  const brandInk = skin === 'flyout' && selected ? DRAWING_BRAND : undefined;
  return (
    <html.button
      type="button"
      role={selection ?? 'button'}
      aria-label={label}
      aria-checked={selection ? selected : undefined}
      aria-expanded={expanded}
      aria-disabled={disabled}
      disabled={disabled}
      style={[
        styles.base,
        styles[skin],
        styles.face(size, facePadding(skin, size)),
        skin === 'tile' && selected && styles.tileSelected,
        skin === 'flyout' && selected && styles.flyoutSelected,
        disabled && styles.tileDisabled,
      ]}
      onClick={onPress}
    >
      <RsdIcon
        name={icon}
        size={faceIconSize(skin, size)}
        ink={ink ?? brandInk}
        muted={disabled}
        keyline={keyline}
      />
    </html.button>
  );
}
